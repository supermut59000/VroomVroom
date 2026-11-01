import type { FuelEntryCreate, FuelType } from '@/types'
import type { DilutantType, WinterRec } from '@/lib/blend-math'

// DilutantType is an ethanol fraction, not a fuel_type: the app records E10
// fills as 'essence' (the SP95-E10 option).
const DILUANT_FUEL_TYPE: Record<DilutantType, FuelType> = {
  e10: 'essence',
  sp98: 'sp98',
}

export interface PumpFillForm {
  vehicleId: number
  date: string // YYYY-MM-DD
  odometer: number
  dilutantType: DilutantType
  dilutantLiters: number
  e85Liters: number
  dilutantPrice: number
  e85Price: number
  stationName: string | null
  location: string | null
  latitude: number | null
  longitude: number | null
}

/**
 * Recording convention (CONTEXT.md): at the same stop (same date + odometer),
 * dilutant = Partiel (is_full_tank: false) + E85 = Plein (is_full_tank: true);
 * a pure E85 fill is a single Plein entry. One client_request_id per entry so
 * offline retries stay idempotent.
 */
export function buildBlendPayloads(rec: WinterRec, form: PumpFillForm): FuelEntryCreate[] {
  if (rec.type === 'tank_full') return []
  const base = {
    vehicle_id: form.vehicleId,
    odometer_reading: form.odometer,
    fueling_date: form.date,
    station_name: form.stationName,
    location: form.location,
    latitude: form.latitude,
    longitude: form.longitude,
  }
  const payloads: FuelEntryCreate[] = []
  if (rec.type === 'blend' && form.dilutantLiters > 0) {
    payloads.push({
      ...base,
      fuel_type: DILUANT_FUEL_TYPE[form.dilutantType],
      liters: form.dilutantLiters,
      price_per_liter: form.dilutantPrice,
      is_full_tank: false,
      client_request_id: crypto.randomUUID(),
    })
  }
  if (form.e85Liters > 0) {
    payloads.push({
      ...base,
      fuel_type: 'e85',
      liters: form.e85Liters,
      price_per_liter: form.e85Price,
      is_full_tank: true,
      client_request_id: crypto.randomUUID(),
    })
  }
  return payloads
}
