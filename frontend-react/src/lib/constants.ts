import type { FuelType } from '@/types'

export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  essence: 'Essence',
  diesel: 'Diesel',
  electrique: 'Électrique',
  hybride: 'Hybride',
  gpl: 'GPL',
}

export const FUEL_TYPE_COLORS: Record<FuelType, { bg: string; text: string }> = {
  essence: { bg: 'bg-blue-100', text: 'text-blue-700' },
  diesel: { bg: 'bg-purple-100', text: 'text-purple-700' },
  electrique: { bg: 'bg-green-100', text: 'text-green-700' },
  hybride: { bg: 'bg-orange-100', text: 'text-orange-700' },
  gpl: { bg: 'bg-pink-100', text: 'text-pink-700' },
}

// The DB stores the human-readable label directly (e.g. "Vidange", not "vidange")
export function getMaintenanceLabel(type: string): string {
  return type
}

export const FUEL_TYPES: FuelType[] = ['essence', 'diesel', 'electrique', 'hybride', 'gpl']

// Preset suggestions shown in the type input datalist — stored as-is in the DB
export const MAINTENANCE_TYPES: string[] = [
  'Vidange',
  'Rotation pneus',
  'Freins',
  'Changement pneus',
  'Batterie',
  'Filtre à air',
  'Bougies',
  'Courroie de distribution',
  'Contrôle technique',
  'Autre',
]
