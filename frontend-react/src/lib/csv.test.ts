import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  exportFuelEntriesCSV,
  exportMaintenancesCSV,
} from '@/lib/csv'
import { entry1, entry2, maintenance1, vehicleFull1 } from '@/test/fixtures'
import type { FuelEntry } from '@/types'

// downloadCSV builds a Blob and hands it to URL.createObjectURL. Stub that so
// we can read exactly what would be downloaded.
let lastBlob: Blob | null = null
beforeEach(() => {
  lastBlob = null
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: (blob: Blob) => {
      lastBlob = blob
      return 'blob:fake'
    },
    revokeObjectURL: vi.fn(),
  })
  // jsdom anchors don't navigate on click; keep it a no-op spy.
  HTMLAnchorElement.prototype.click = vi.fn()
})

async function downloadedText(): Promise<string> {
  expect(lastBlob).not.toBeNull()
  return (lastBlob as Blob).text()
}

describe('exportFuelEntriesCSV', () => {
  it('starts with a UTF-8 BOM so Excel reads accented headers correctly', async () => {
    exportFuelEntriesCSV([entry1], vehicleFull1)
    expect(lastBlob).not.toBeNull()
    // Blob.text() strips the BOM via TextDecoder — check the raw bytes
    const buf = new Uint8Array(await (lastBlob as Blob).arrayBuffer())
    expect([buf[0], buf[1], buf[2]]).toEqual([0xef, 0xbb, 0xbf])
  })

  it('emits the French header row with ; separator', async () => {
    exportFuelEntriesCSV([entry1], vehicleFull1)
    const text = (await downloadedText()).replace(/^\uFEFF/, '')
    const lines = text.split('\n')
    expect(lines[0]).toBe(
      'Date;Compteur (km);Litres;Prix/L (€);Total (€);Carburant;Plein complet;Station;Lieu;Notes',
    )
  })

  it('sorts rows by date ascending and formats decimals', async () => {
    // pass unsorted: entry1 (Aug) before entry2 (July)
    exportFuelEntriesCSV([entry1, entry2], vehicleFull1)
    const text = (await downloadedText()).replace(/^\uFEFF/, '')
    const lines = text.split('\n')
    expect(lines[1].startsWith('2026-07-01;')).toBe(true) // July first
    expect(lines[2].startsWith('2026-08-01;')).toBe(true) // Aug second
    // liters=38.00, price=1.680, total=63.84 for the July row
    expect(lines[1]).toContain('38.00;1.680;63.84')
  })

  it('maps fuel type to its French label and is_full_tank to Oui/Non', async () => {
    const partial: FuelEntry = { ...entry1, is_full_tank: false }
    exportFuelEntriesCSV([partial], vehicleFull1)
    const text = (await downloadedText()).replace(/^\uFEFF/, '')
    const row = text.split('\n')[1]
    // essence → 'E10', is_full_tank false → 'Non'
    expect(row.split(';')[5]).toBe('E10')
    expect(row.split(';')[6]).toBe('Non')
  })

  it('quotes fields containing the separator and doubles embedded quotes', async () => {
    const tricky: FuelEntry = {
      ...entry1,
      station_name: 'Total;Élysée "prime"',
    }
    exportFuelEntriesCSV([tricky], vehicleFull1)
    const text = (await downloadedText()).replace(/^\uFEFF/, '')
    const row = text.split('\n')[1]
    expect(row).toContain('"Total;Élysée ""prime"""')
  })

  it('uses the vehicle name and date in the download filename', () => {
    exportFuelEntriesCSV([entry1], vehicleFull1)
    // the created anchor's download attribute carries makeFilename()'s output
    const clicks = (HTMLAnchorElement.prototype.click as ReturnType<typeof vi.fn>).mock.instances
    expect(clicks.length).toBe(1)
    expect(clicks[0].download).toMatch(/^Peugeot_208_pleins_\d{4}-\d{2}-\d{2}\.csv$/)
  })
})

describe('exportMaintenancesCSV', () => {
  it('emits the maintenance header and one row', async () => {
    exportMaintenancesCSV([maintenance1], vehicleFull1)
    const text = (await downloadedText()).replace(/^\uFEFF/, '')
    const lines = text.split('\n')
    expect(lines[0]).toBe(
      'Date;Type;Description;Coût (€);Compteur (km);Prestataire;Lieu;Notes;Prochaine date;Prochain km',
    )
    expect(lines[1]).toContain('2026-06-01;Vidange;Huile + filtre;80.00;19000;Garage Central')
  })

  it('leaves null notes/location as empty cells', async () => {
    exportMaintenancesCSV([maintenance1], vehicleFull1)
    const text = (await downloadedText()).replace(/^\uFEFF/, '')
    const row = text.split('\n')[1]
    const cells = row.split(';')
    // notes (index 7) is null → empty
    expect(cells[7]).toBe('')
  })
})
