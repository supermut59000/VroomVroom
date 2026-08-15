import { FUEL_ENTRY_TYPE_LABELS } from '@/lib/constants'
import type { FuelEntry, Maintenance, Vehicle } from '@/types'

const BOM = '\uFEFF'
const SEP = ';'

function escapeCSV(value: string | number | null | undefined): string {
  if (value == null) return ''
  const str = String(value)
  if (str.includes(SEP) || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function makeFilename(vehicle: Vehicle, type: string): string {
  const date = new Date().toISOString().split('T')[0]
  const name = `${vehicle.brand}_${vehicle.model}`.replace(/\s+/g, '-')
  return `${name}_${type}_${date}.csv`
}

export function exportFuelEntriesCSV(entries: FuelEntry[], vehicle: Vehicle) {
  const headers = [
    'Date',
    'Compteur (km)',
    'Litres',
    'Prix/L (€)',
    'Total (€)',
    'Carburant',
    'Plein complet',
    'Station',
    'Lieu',
    'Notes',
  ]

  const rows = entries
    .slice()
    .sort((a, b) => a.fueling_date.localeCompare(b.fueling_date))
    .map((e) =>
      [
        e.fueling_date,
        e.odometer_reading,
        e.liters.toFixed(2),
        e.price_per_liter.toFixed(3),
        (e.liters * e.price_per_liter).toFixed(2),
        FUEL_ENTRY_TYPE_LABELS[e.fuel_type],
        e.is_full_tank ? 'Oui' : 'Non',
        e.station_name,
        e.location,
        e.notes,
      ].map(escapeCSV).join(SEP),
    )

  const csv = [headers.join(SEP), ...rows].join('\n')
  downloadCSV(csv, makeFilename(vehicle, 'pleins'))
}

export function exportMaintenancesCSV(entries: Maintenance[], vehicle: Vehicle) {
  const headers = [
    'Date',
    'Type',
    'Description',
    'Coût (€)',
    'Compteur (km)',
    'Prestataire',
    'Lieu',
    'Notes',
    'Prochaine date',
    'Prochain km',
  ]

  const rows = entries
    .slice()
    .sort((a, b) => a.maintenance_date.localeCompare(b.maintenance_date))
    .map((e) =>
      [
        e.maintenance_date,
        e.maintenance_type,
        e.description,
        e.cost.toFixed(2),
        e.odometer_reading,
        e.service_provider,
        e.location,
        e.notes,
        e.next_maintenance_date,
        e.next_maintenance_odometer,
      ].map(escapeCSV).join(SEP),
    )

  const csv = [headers.join(SEP), ...rows].join('\n')
  downloadCSV(csv, makeFilename(vehicle, 'maintenance'))
}
