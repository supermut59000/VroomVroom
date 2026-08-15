import type { FuelType } from '@/types'

export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  essence: 'Essence',
  sp98: 'Essence',
  diesel: 'Diesel',
  electrique: 'Électrique',
  hybride: 'Hybride',
  gpl: 'GPL',
  e85: 'E85',
}

export const FUEL_ENTRY_TYPE_LABELS: Record<FuelType, string> = {
  ...FUEL_TYPE_LABELS,
  essence: 'E10',
  sp98: 'SP98',
}

export const FUEL_TYPE_COLORS: Record<FuelType, { bg: string; text: string }> = {
  essence: { bg: 'bg-blue-100', text: 'text-blue-700' },
  sp98: { bg: 'bg-blue-100', text: 'text-blue-700' },
  diesel: { bg: 'bg-purple-100', text: 'text-purple-700' },
  electrique: { bg: 'bg-green-100', text: 'text-green-700' },
  hybride: { bg: 'bg-orange-100', text: 'text-orange-700' },
  gpl: { bg: 'bg-pink-100', text: 'text-pink-700' },
  e85: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
}

// The DB stores the human-readable label directly (e.g. "Vidange", not "vidange")
export function getMaintenanceLabel(type: string): string {
  return type
}

export const FUEL_TYPES: FuelType[] = ['essence', 'diesel', 'electrique', 'hybride', 'gpl', 'e85']

export function isFuelTypeCompatible(vehicleType: FuelType, entryType: FuelType): boolean {
  if (vehicleType === 'hybride') return true
  if (vehicleType === 'essence') return entryType === 'essence' || entryType === 'sp98'
  return vehicleType === entryType
}

// Preset suggestions shown in the type input datalist — stored as-is in the DB.
// Types already used on the vehicle are merged in at runtime, see
// useMaintenanceTypeOptions() in hooks/use-maintenances.ts
export const MAINTENANCE_TYPES: string[] = [
  // Moteur / vidange
  'Vidange',
  'Filtre à huile',
  'Filtre à air',
  'Filtre à carburant',
  'Filtre habitacle',
  'Bougies',
  'Courroie de distribution',
  'Courroie accessoire',
  'Liquide de refroidissement',
  'Révision constructeur',
  // Pneus / roues
  'Pression des pneus',
  'Rotation pneus',
  'Changement pneus',
  'Équilibrage',
  'Géométrie / parallélisme',
  'Pneus hiver',
  'Pneus été',
  // Freinage / liaison au sol
  'Freins',
  'Plaquettes de frein',
  'Disques de frein',
  'Liquide de frein',
  'Amortisseurs',
  'Embrayage',
  // Électrique
  'Batterie',
  'Ampoules / éclairage',
  'Essuie-glaces',
  // Divers
  'Climatisation',
  'Échappement',
  'Pare-brise',
  'Contrôle technique',
  'Lavage / nettoyage',
  'Autre',
]
