import { describe, expect, it, vi, beforeEach } from 'vitest'
import { payloadVehicleId, loadQueue, QUEUE_KEY } from '@/lib/offline'
import type { QueuedPayload, QueueItem } from '@/lib/offline'
import { isFuelTypeCompatible } from '@/lib/constants'
import { compareStations } from '@/lib/station-sort'
import { monthlyKmSeries } from '@/lib/vehicle-stats'
import { exportMaintenancesCSV } from '@/lib/csv'
import { maintenance1, vehicleFull1 } from '@/test/fixtures'
import { t } from '@/lib/i18n'

// i18n is a pure data object — importing and reading it marks the module live
// so the coverage tool stops flagging the (non-executable) declaration.
describe('i18n', () => {
  it('exposes the centralised French strings', () => {
    expect(t.common.save).toBe('Enregistrer')
  })
})

describe('payloadVehicleId', () => {
  it('reads the vehicle from a fuel-create payload', () => {
    const p: QueuedPayload = { kind: 'fuel-create', data: { vehicle_id: 7 } as never }
    expect(payloadVehicleId(p)).toBe(7)
  })
  it('reads the vehicle from a fuel-update payload', () => {
    const p: QueuedPayload = { kind: 'fuel-update', vehicleId: 3 } as never
    expect(payloadVehicleId(p)).toBe(3)
  })
  it('reads the vehicle from a maintenance-create payload', () => {
    const p: QueuedPayload = { kind: 'maintenance-create', data: { vehicle_id: 9 } as never }
    expect(payloadVehicleId(p)).toBe(9)
  })
  it('reads the vehicle from a maintenance-update payload', () => {
    const p: QueuedPayload = { kind: 'maintenance-update', vehicleId: 5 } as never
    expect(payloadVehicleId(p)).toBe(5)
  })
})

describe('loadQueue (defensive catch)', () => {
  it('drops a single item whose migration throws without touching the rest', () => {
    const good: QueueItem = {
      id: 2,
      payload: { kind: 'fuel-update', vehicleId: 1 } as never,
    }
    // fuel-create whose idempotency backfill throws → per-item catch swallows it.
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('no uuid')
    })
    const bad: QueueItem = {
      id: 1,
      payload: { kind: 'fuel-create', data: { vehicle_id: 1 } as never },
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify([bad, good]))
    expect(loadQueue()).toEqual([good])
    vi.restoreAllMocks()
  })
})

describe('isFuelTypeCompatible', () => {
  it('matches identical non-hybrid, non-essence types', () => {
    expect(isFuelTypeCompatible('diesel', 'diesel')).toBe(true)
    expect(isFuelTypeCompatible('gpl', 'gpl')).toBe(true)
  })
  it('rejects a different concrete type', () => {
    expect(isFuelTypeCompatible('diesel', 'gpl')).toBe(false)
    expect(isFuelTypeCompatible('electrique', 'diesel')).toBe(false)
  })
})

describe('compareStations (price tie)', () => {
  it('falls back to distance when two stations share a price', () => {
    const near = { isFavorite: false, price: 1.7, distanceM: 500, durationS: 300 }
    const far = { isFavorite: false, price: 1.7, distanceM: 9000, durationS: 3600 }
    const ordered = [far, near].sort((a, b) => compareStations(a, b, 'price'))
    expect(ordered[0].distanceM).toBe(500)
  })
})

describe('monthlyKmSeries (no spread)', () => {
  it('puts the whole delta on the later month when spreadGaps is false', () => {
    const points = monthlyKmSeries(
      [
        { fueling_date: '2026-01-10', odometer_reading: 10000 },
        { fueling_date: '2026-03-10', odometer_reading: 10500 },
      ],
      false,
    )
    expect(points).toEqual([{ monthKey: '2026-03', km: 500 }])
  })
})

describe('exportMaintenancesCSV', () => {
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
    HTMLAnchorElement.prototype.click = vi.fn()
  })
  it('sorts rows by date and formats cost with two decimals', async () => {
    const later: typeof maintenance1 = { ...maintenance1, maintenance_date: '2026-07-01', id: 11 }
    const earlier: typeof maintenance1 = { ...maintenance1, maintenance_date: '2026-05-01', id: 9 }
    exportMaintenancesCSV([later, earlier, maintenance1], vehicleFull1)
    expect(lastBlob).not.toBeNull()
    const text = await (lastBlob as Blob).text()
    const lines = text.split('\n').filter(Boolean)
    // header + 3 rows
    expect(lines.length).toBe(4)
    const rows = lines.slice(1)
    expect(rows[0]).toContain('2026-05-01')
    expect(rows[1]).toContain('2026-06-01')
    expect(rows[2]).toContain('2026-07-01')
    expect(rows[0]).toContain('80.00')
  })
})
