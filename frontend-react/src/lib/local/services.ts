// Local mode — business logic ported from the backend services
// (fuel_service.py, vehicle_service.py, maintenance_service.py, flexfuel_service.py).
// Same algorithms, same French error messages, same rounding (pyRound =
// Python round(), half-to-even) so the app behaves identically in both modes.
import type {
  Vehicle,
  FuelEntry,
  Maintenance,
  FlexfuelConversion,
  E10ReferencePrice,
  VehicleStats,
  SeasonStats,
  VehiclePeriodStats,
  FuelTypePeriodBreakdown,
  FuelStatistics,
} from '@/types'
import { ApiError } from '@/lib/api-error'
import { haversineM } from '@/lib/geo'
import { db } from './db'
import type { LocalRow } from './db'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Python round() — half to even (the backend expected values were computed with it). */
export function pyRound(value: number, nd = 0): number {
  if (!Number.isFinite(value)) return value
  const factor = 10 ** nd
  const scaled = value * factor
  const floored = Math.floor(scaled)
  const frac = scaled - floored
  let nearest: number
  if (Math.abs(frac - 0.5) < 1e-9) {
    nearest = floored % 2 === 0 ? floored : floored + 1
  } else {
    nearest = Math.round(scaled)
  }
  return nearest / factor
}

function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** (fueling_date, odometer, is_full_tank ASC, id) — Partiel before Plein at the same stop. */
export function sortFillOrder(entries: FuelEntry[]): FuelEntry[] {
  return [...entries].sort((a, b) => {
    const d = a.fueling_date.localeCompare(b.fueling_date)
    if (d !== 0) return d
    const odo = a.odometer_reading - b.odometer_reading
    if (odo !== 0) return odo
    const full = Number(a.is_full_tank) - Number(b.is_full_tank)
    if (full !== 0) return full
    return a.id - b.id
  })
}

async function activeFuelEntries(vehicleId: number): Promise<FuelEntry[]> {
  const all = await db.all<FuelEntry & LocalRow>('fuel_entries')
  return sortFillOrder(
    all.filter((e) => e.is_active && e.vehicle_id === vehicleId),
  )
}

async function activeVehicles(): Promise<Vehicle[]> {
  const all = await db.all<Vehicle & LocalRow>('vehicles')
  return all.filter((v) => v.is_active)
}

function notFound(message: string): never {
  throw new ApiError(404, message)
}

function badRequest(message: string): never {
  throw new ApiError(422, message)
}

function fmt(n: number): string {
  // Python %g — trim trailing zeros for messages
  return String(parseFloat(n.toPrecision(10)))
}

// ─── Vehicles ────────────────────────────────────────────────────────────────

export async function listVehicles(params?: {
  activeOnly?: boolean
  fuelType?: string
}): Promise<Vehicle[]> {
  let vehicles = await db.all<Vehicle & LocalRow>('vehicles')
  if (params?.activeOnly !== false) vehicles = vehicles.filter((v) => v.is_active)
  if (params?.fuelType) vehicles = vehicles.filter((v) => v.fuel_type === params.fuelType)
  vehicles.sort((a, b) => b.created_at.localeCompare(a.created_at))
  return vehicles
}

export async function getVehicle(vehicleId: number): Promise<Vehicle> {
  const v = await db.get<Vehicle & LocalRow>('vehicles', vehicleId)
  if (!v) notFound('Vehicle not found')
  return v
}

export async function createVehicle(data: Record<string, unknown>): Promise<Vehicle> {
  const plate = String(data.license_plate ?? '').toUpperCase()
  const existing = (await db.all<Vehicle & LocalRow>('vehicles')).find(
    (v) => v.license_plate === plate,
  )
  if (existing) throw new ApiError(409, "Un véhicule avec cette plaque existe déjà")
  const is_active = data.is_active === undefined ? true : data.is_active
  return db.put<Vehicle & LocalRow>('vehicles', {
    brand: data.brand as string,
    model: data.model as string,
    year: data.year as number,
    license_plate: plate,
    fuel_type: data.fuel_type as Vehicle['fuel_type'],
    initial_odometer: data.initial_odometer as number,
    tank_capacity: (data.tank_capacity as number | null) ?? null,
    acquisition_date: (data.acquisition_date as string | null) ?? null,
    purchase_price: (data.purchase_price as number | null) ?? null,
    description: (data.description as string | null) ?? null,
    is_active,
    insurance_unlimited: (data.insurance_unlimited as boolean) ?? false,
    insurance_km_limit: (data.insurance_km_limit as number | null) ?? null,
    insurance_km_annual_increase: (data.insurance_km_annual_increase as number | null) ?? null,
    insurance_km_start_date: (data.insurance_km_start_date as string | null) ?? null,
    yearly_fixed_costs: (data.yearly_fixed_costs as number | null) ?? null,
  })
}

export async function updateVehicle(
  vehicleId: number,
  data: Record<string, unknown>,
): Promise<Vehicle> {
  await getVehicle(vehicleId)
  const patch: Record<string, unknown> = { ...data }
  if (patch.license_plate !== undefined) {
    patch.license_plate = String(patch.license_plate).toUpperCase()
    const dup = (await db.all<Vehicle & LocalRow>('vehicles')).find(
      (v) => v.id !== vehicleId && v.license_plate === patch.license_plate,
    )
    if (dup) throw new ApiError(409, "Un véhicule avec cette plaque existe déjà")
  }
  const required = [
    'brand',
    'model',
    'year',
    'license_plate',
    'fuel_type',
    'initial_odometer',
    'is_active',
  ]
  if (required.some((f) => f in patch && patch[f] === null)) {
    badRequest('Les champs obligatoires du véhicule ne peuvent pas être nuls')
  }
  if ('initial_odometer' in patch) {
    const [fuel, maint] = await Promise.all([
      db.all<FuelEntry & LocalRow>('fuel_entries'),
      db.all<Maintenance & LocalRow>('maintenances'),
    ])
    const readings = [
      ...fuel.filter((e) => e.is_active && e.vehicle_id === vehicleId),
      ...maint.filter((m) => m.is_active && m.vehicle_id === vehicleId),
    ].map((e) => e.odometer_reading)
    const firstReading = readings.length ? Math.min(...readings) : null
    if (firstReading !== null && (patch.initial_odometer as number) > firstReading) {
      badRequest(
        `Le kilométrage initial ne peut pas dépasser le premier relevé (${fmt(firstReading)} km)`,
      )
    }
  }
  const updated = await db.patch<Vehicle & LocalRow>('vehicles', vehicleId, patch)
  if (!updated) notFound('Véhicule non trouvé')
  return updated
}

export async function deleteVehicle(vehicleId: number, force: boolean): Promise<void> {
  const vehicle = await db.get<Vehicle & LocalRow>('vehicles', vehicleId)
  if (!vehicle) return
  if (force) {
    // Hard delete: the vehicle and its rows
    const all = await db.all<Vehicle & LocalRow>('vehicles')
    const target = all.find((v) => v.id === vehicleId)
    if (target) await db.patch('vehicles', vehicleId, { is_active: false })
    await Promise.all([
      purgeByVehicle('fuel_entries', vehicleId),
      purgeByVehicle('maintenances', vehicleId),
      purgeByVehicle('flexfuel_conversions', vehicleId),
    ])
  } else {
    await db.patch<Vehicle & LocalRow>('vehicles', vehicleId, { is_active: false })
  }
}

async function purgeByVehicle(table: 'fuel_entries' | 'maintenances' | 'flexfuel_conversions', vehicleId: number): Promise<void> {
  const rows = await db.all<LocalRow & { vehicle_id: number }>(table)
  await Promise.all(rows.filter((r) => r.vehicle_id === vehicleId).map((r) => db.patch(table, r.id, { is_active: false })))
}

export async function archiveVehicle(vehicleId: number): Promise<Vehicle | null> {
  const vehicle = await db.get<Vehicle & LocalRow>('vehicles', vehicleId)
  if (!vehicle) return null
  return (await db.patch<Vehicle & LocalRow>('vehicles', vehicleId, { is_active: false })) ?? null
}

// ─── Fuel entries ────────────────────────────────────────────────────────────

export async function createFuelEntry(
  data: Record<string, unknown>,
  allowOdometerDecrease: boolean,
): Promise<FuelEntry> {
  const clientRequestId = data.client_request_id ? String(data.client_request_id) : null
  if (clientRequestId) {
    const existing = (await db.byIndex<FuelEntry & LocalRow>('fuel_entries', 'client_request_id', clientRequestId)).find(
      (e) => e.client_request_id === clientRequestId,
    )
    if (existing) {
      if (existing.vehicle_id !== data.vehicle_id) {
        badRequest('Identifiant de requête déjà utilisé pour un autre véhicule')
      }
      return existing
    }
  }

  const vehicle = await getVehicle(data.vehicle_id as number)
  const odometer = data.odometer_reading as number
  if (odometer < (vehicle.initial_odometer || 0)) {
    badRequest(
      `Le kilométrage ${odometer} km est inférieur au kilométrage initial du véhicule (${fmt(vehicle.initial_odometer || 0)} km)`,
    )
  }
  if (!allowOdometerDecrease) {
    const entries = await activeFuelEntries(vehicle.id)
    const latest = entries.length
      ? entries.reduce((a, b) => (b.odometer_reading > a.odometer_reading ? b : a))
      : null
    if (latest && odometer < latest.odometer_reading) {
      badRequest(
        `Le kilométrage ${odometer} km est inférieur au dernier relevé (${latest.odometer_reading} km)`,
      )
    }
  }

  const liters = data.liters as number
  const pricePerLiter = data.price_per_liter as number
  return db.put<FuelEntry & LocalRow>('fuel_entries', {
    vehicle_id: vehicle.id,
    fuel_type: data.fuel_type as FuelEntry['fuel_type'],
    liters,
    price_per_liter: pricePerLiter,
    total_cost: liters * pricePerLiter,
    odometer_reading: odometer,
    station_name: (data.station_name as string | null) ?? null,
    location: (data.location as string | null) ?? null,
    latitude: (data.latitude as number | null) ?? null,
    longitude: (data.longitude as number | null) ?? null,
    fueling_date: data.fueling_date as string,
    is_full_tank: (data.is_full_tank as boolean) ?? true,
    notes: (data.notes as string | null) ?? null,
    client_request_id: clientRequestId,
    is_active: true,
  })
}

export async function getFuelEntry(entryId: number): Promise<FuelEntry | null> {
  const e = await db.get<FuelEntry & LocalRow>('fuel_entries', entryId)
  return e && e.is_active ? e : null
}

export async function updateFuelEntry(
  entryId: number,
  data: Record<string, unknown>,
  allowOdometerDecrease: boolean,
): Promise<FuelEntry | null> {
  const entry = await getFuelEntry(entryId)
  if (!entry) return null

  if ('odometer_reading' in data && !allowOdometerDecrease) {
    const vehicle = await getVehicle(entry.vehicle_id)
    const newOdometer = data.odometer_reading as number
    const newDate = (data.fueling_date as string | undefined) ?? entry.fueling_date
    if (newOdometer < (vehicle.initial_odometer || 0)) {
      badRequest(
        `Le kilométrage ${newOdometer} km est inférieur au kilométrage initial du véhicule (${fmt(vehicle.initial_odometer || 0)} km)`,
      )
    }
    const others = (await activeFuelEntries(entry.vehicle_id)).filter((e) => e.id !== entryId)
    const previous = others
      .filter((e) => e.fueling_date < newDate)
      .sort((a, b) => b.odometer_reading - a.odometer_reading)[0]
    const following = others
      .filter((e) => e.fueling_date > newDate)
      .sort((a, b) => a.odometer_reading - b.odometer_reading)[0]
    if (previous && newOdometer < previous.odometer_reading) {
      badRequest(
        `Le kilométrage ${newOdometer} km est inférieur au relevé précédent (${previous.odometer_reading} km)`,
      )
    }
    if (following && newOdometer > following.odometer_reading) {
      badRequest(
        `Le kilométrage ${newOdometer} km est supérieur au relevé suivant (${following.odometer_reading} km)`,
      )
    }
  }

  const patch: Record<string, unknown> = { ...data }
  if ('liters' in patch || 'price_per_liter' in patch) {
    const liters = (patch.liters as number | undefined) ?? entry.liters
    const price = (patch.price_per_liter as number | undefined) ?? entry.price_per_liter
    patch.total_cost = liters * price
  }
  const updated = await db.patch<FuelEntry & LocalRow>('fuel_entries', entryId, patch)
  return updated ?? null
}

export async function deleteFuelEntry(entryId: number): Promise<boolean> {
  const entry = await getFuelEntry(entryId)
  if (!entry) return false
  await db.patch<FuelEntry & LocalRow>('fuel_entries', entryId, { is_active: false })
  return true
}

export async function listFuelEntriesByVehicle(vehicleId: number): Promise<FuelEntry[]> {
  const entries = await activeFuelEntries(vehicleId)
  return [...entries].sort((a, b) => b.fueling_date.localeCompare(a.fueling_date))
}

export async function listFuelEntriesFiltered(params?: {
  vehicleId?: number
  fuelType?: string
  startDate?: string
  endDate?: string
}): Promise<FuelEntry[]> {
  const all = await db.all<FuelEntry & LocalRow>('fuel_entries')
  let entries = all.filter((e) => e.is_active)
  if (params?.vehicleId !== undefined)
    entries = entries.filter((e) => e.vehicle_id === params.vehicleId)
  if (params?.fuelType) entries = entries.filter((e) => e.fuel_type === params.fuelType)
  if (params?.startDate) entries = entries.filter((e) => e.fueling_date >= (params.startDate as string))
  if (params?.endDate) entries = entries.filter((e) => e.fueling_date <= (params.endDate as string))
  entries.sort((a, b) => b.fueling_date.localeCompare(a.fueling_date) || b.id - a.id)
  return entries
}

export async function latestFuelEntry(vehicleId: number): Promise<FuelEntry | null> {
  const entries = await activeFuelEntries(vehicleId)
  if (entries.length === 0) return null
  return entries.reduce((a, b) => {
    if (b.fueling_date > a.fueling_date) return b
    if (b.fueling_date < a.fueling_date) return a
    if (b.odometer_reading > a.odometer_reading) return b
    if (b.odometer_reading < a.odometer_reading) return a
    if (b.is_full_tank && !a.is_full_tank) return b
    if (a.is_full_tank && !b.is_full_tank) return a
    return b.id > a.id ? b : a
  })
}

export async function distinctStationNames(vehicleId?: number): Promise<string[]> {
  const all = await db.all<FuelEntry & LocalRow>('fuel_entries')
  const names = new Set(
    all
      .filter(
        (e) =>
          e.is_active &&
          e.station_name != null &&
          (vehicleId === undefined || e.vehicle_id === vehicleId),
      )
      .map((e) => e.station_name as string),
  )
  return [...names].sort()
}

export async function nearestStation(
  vehicleId: number,
  lat: number,
  lon: number,
  radiusM: number,
): Promise<{ station_name: string; location: string | null; distance_m: number } | null> {
  const all = await db.all<FuelEntry & LocalRow>('fuel_entries')
  const entries = all
    .filter(
      (e) =>
        e.is_active &&
        e.vehicle_id === vehicleId &&
        e.latitude != null &&
        e.longitude != null &&
        e.station_name != null,
    )
    .sort((a, b) => {
      const d = b.fueling_date.localeCompare(a.fueling_date)
      if (d !== 0) return d
      return b.odometer_reading - a.odometer_reading
    })
  for (const entry of entries) {
    const d = haversineM(lat, lon, entry.latitude as number, entry.longitude as number)
    if (d <= radiusM) {
      return {
        station_name: entry.station_name as string,
        location: entry.location,
        distance_m: Math.round(d),
      }
    }
  }
  return null
}

// ─── Fuel statistics (port of fuel_service) ─────────────────────────────────

export async function fuelStatistics(vehicleId: number): Promise<FuelStatistics> {
  const entries = await activeFuelEntries(vehicleId)
  if (entries.length === 0) {
    return {
      total_entries: 0,
      total_liters: 0,
      total_cost: 0,
      average_price_per_liter: 0,
      total_distance: 0,
      average_consumption: null,
    }
  }

  const totalLiters = entries.reduce((s, e) => s + e.liters, 0)
  const totalCost = entries.reduce((s, e) => s + e.total_cost, 0)
  const totalDistance =
    entries.length > 1
      ? entries[entries.length - 1].odometer_reading - entries[0].odometer_reading
      : 0

  // Distance-weighted fill-to-fill average, anchored at the first full tank.
  let averageConsumption: number | null = null
  const firstFullIdx = entries.findIndex((e) => e.is_full_tank)
  if (firstFullIdx !== -1) {
    let lastFullOdo = entries[firstFullIdx].odometer_reading
    let acc = 0
    let segLiters = 0
    let segKm = 0
    for (const entry of entries.slice(firstFullIdx + 1)) {
      acc += entry.liters
      if (entry.is_full_tank) {
        const distance = entry.odometer_reading - lastFullOdo
        if (distance > 0) {
          segLiters += acc
          segKm += distance
        }
        lastFullOdo = entry.odometer_reading
        acc = 0
      }
    }
    if (segKm > 0) averageConsumption = pyRound((segLiters * 100) / segKm, 2)
  }

  return {
    total_entries: entries.length,
    total_liters: pyRound(totalLiters, 2),
    total_cost: pyRound(totalCost, 2),
    average_price_per_liter: pyRound(totalLiters > 0 ? totalCost / totalLiters : 0, 2),
    total_distance: totalDistance,
    average_consumption: averageConsumption,
  }
}

/** Port of get_consumption_history — fill-to-fill with lagged E85 attribution. */
export async function consumptionHistory(vehicleId: number) {
  const entries = await activeFuelEntries(vehicleId)
  if (entries.length === 0) {
    return { vehicle_id: vehicleId, data_points: [] as Record<string, unknown>[] }
  }

  const dataPoints: Record<string, unknown>[] = []
  let accLiters = 0
  let accE85Liters = 0
  let lastFullOdo: number | null = null
  let prevAddedE85Frac: number | null = null

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const isFull = entry.is_full_tank
    const e85L = entry.fuel_type === 'e85' ? entry.liters : 0

    if (lastFullOdo === null) {
      dataPoints.push({
        date: entry.fueling_date,
        consumption: null,
        odometer_reading: entry.odometer_reading,
        liters: entry.liters,
        distance: null,
        is_full_tank: isFull,
        e85_fraction: null,
      })
      if (isFull) {
        lastFullOdo = entry.odometer_reading
        accLiters = 0
        accE85Liters = 0
        // The whole (date, odometer) stop establishes the tank composition.
        let start = i
        while (
          start > 0 &&
          entries[start - 1].fueling_date === entry.fueling_date &&
          entries[start - 1].odometer_reading === entry.odometer_reading
        ) {
          start--
        }
        const stop = entries.slice(start, i + 1)
        const stopLiters = stop.reduce((s, e) => s + e.liters, 0)
        const stopE85 = stop.reduce((s, e) => s + (e.fuel_type === 'e85' ? e.liters : 0), 0)
        prevAddedE85Frac = stopLiters > 0 ? stopE85 / stopLiters : 0
      }
    } else if (isFull) {
      const totalLiters = accLiters + entry.liters
      const totalE85 = accE85Liters + e85L
      const addedE85Frac = totalLiters > 0 ? totalE85 / totalLiters : null

      let distance = entry.odometer_reading - lastFullOdo
      const consumption = distance > 0 ? pyRound((totalLiters * 100) / distance, 2) : null
      if (distance <= 0) distance = null as unknown as number

      dataPoints.push({
        date: entry.fueling_date,
        consumption,
        odometer_reading: entry.odometer_reading,
        liters: pyRound(totalLiters, 2),
        distance,
        is_full_tank: true,
        e85_fraction: prevAddedE85Frac !== null ? pyRound(prevAddedE85Frac, 4) : null,
      })

      lastFullOdo = entry.odometer_reading
      accLiters = 0
      accE85Liters = 0
      prevAddedE85Frac = addedE85Frac
    } else {
      accLiters += entry.liters
      accE85Liters += e85L
      const distance = entry.odometer_reading - entries[i - 1].odometer_reading
      dataPoints.push({
        date: entry.fueling_date,
        consumption: null,
        odometer_reading: entry.odometer_reading,
        liters: entry.liters,
        distance: distance > 0 ? distance : null,
        is_full_tank: false,
        e85_fraction: null,
      })
    }
  }

  return { vehicle_id: vehicleId, data_points: dataPoints }
}

// ─── Vehicle stats (port of vehicle_service) ────────────────────────────────

function calculateCurrentInsuranceLimit(vehicle: Vehicle): number | null {
  if (vehicle.insurance_unlimited) return null
  if (!vehicle.insurance_km_limit || !vehicle.insurance_km_start_date) return null

  const today = new Date()
  const start = new Date(`${vehicle.insurance_km_start_date}T00:00:00`)
  let yearsElapsed = today.getFullYear() - start.getFullYear()
  const beforeAnniversary =
    today.getMonth() + 1 < start.getMonth() + 1 ||
    (today.getMonth() + 1 === start.getMonth() + 1 && today.getDate() < start.getDate())
  if (beforeAnniversary) yearsElapsed -= 1
  yearsElapsed = Math.max(0, yearsElapsed)

  const annualIncrease = vehicle.insurance_km_annual_increase || 0
  return vehicle.insurance_km_limit + yearsElapsed * annualIncrease
}

/** Port of _compute_seasonal_consumption. */
async function seasonalConsumption(
  vehicleId: number,
  overconsumptionPct: number | null,
  tankCapacity: number | null,
  fromDate?: string,
): Promise<Record<'spring' | 'summer' | 'autumn' | 'winter', SeasonStats>> {
  const CUSHION_L = 5.0
  const all = await db.all<FuelEntry & LocalRow>('fuel_entries')
  let entries = sortFillOrder(
    all.filter(
      (e) =>
        e.is_active &&
        e.vehicle_id === vehicleId &&
        (!fromDate || e.fueling_date >= fromDate),
    ),
  )

  // Anchor stop E85 fraction (from the full (date, odometer) stop).
  let anchorStopE85Frac: number | null = null
  if (entries.length > 0) {
    const firstFullIdx = entries.findIndex((e) => e.is_full_tank)
    if (firstFullIdx !== -1) {
      const anchor = entries[firstFullIdx]
      const stop = entries.filter(
        (e) => e.fueling_date === anchor.fueling_date && e.odometer_reading === anchor.odometer_reading,
      )
      const stopLiters = stop.reduce((s, e) => s + e.liters, 0)
      const stopE85 = stop.reduce((s, e) => s + (e.fuel_type === 'e85' ? e.liters : 0), 0)
      anchorStopE85Frac = stopLiters > 0 ? stopE85 / stopLiters : 0
      entries = entries.slice(firstFullIdx)
    }
  }

  const monthToSeason = (m: number): 'spring' | 'summer' | 'autumn' | 'winter' => {
    if (m >= 3 && m <= 5) return 'spring'
    if (m >= 6 && m <= 8) return 'summer'
    if (m >= 9 && m <= 11) return 'autumn'
    return 'winter'
  }

  type Bucket = [number, number, number, number] // km, liters, e85Burned, measured
  const seasonBuckets: Record<string, Bucket[]> = {
    spring: [],
    summer: [],
    autumn: [],
    winter: [],
  }

  let accLiters = 0
  let accE85Liters = 0
  let lastFullOdo: number | null = null
  let prevAddedE85Frac: number | null = null

  entries.forEach((entry, i) => {
    const isFull = entry.is_full_tank
    const isE85 = entry.fuel_type === 'e85'

    if (i === 0) {
      lastFullOdo = entry.odometer_reading
      accLiters = 0
      accE85Liters = 0
      prevAddedE85Frac = anchorStopE85Frac
      return
    }

    if (isFull) {
      const segLiters = accLiters + entry.liters
      const addedE85 = accE85Liters + (isE85 ? entry.liters : 0)
      const addedFrac = segLiters > 0 ? addedE85 / segLiters : null

      if (lastFullOdo !== null && segLiters > 0 && prevAddedE85Frac !== null) {
        const distance = entry.odometer_reading - lastFullOdo
        if (distance > 0) {
          const measured = (segLiters * 100) / distance
          const month = Number(entry.fueling_date.slice(5, 7))
          const season = monthToSeason(month)
          const e85Burned = segLiters * prevAddedE85Frac
          seasonBuckets[season].push([distance, segLiters, e85Burned, measured])
        }
      }

      lastFullOdo = entry.odometer_reading
      accLiters = 0
      accE85Liters = 0
      prevAddedE85Frac = addedFrac
    } else {
      accLiters += entry.liters
      if (isE85) accE85Liters += entry.liters
    }
  })

  const range = (conso: number | null | undefined): number | null =>
    conso && conso > 0 && tankCapacity ? pyRound(Math.max(0, tankCapacity - CUSHION_L) * 100 / conso, 0) : null

  const opc = overconsumptionPct !== null ? overconsumptionPct / 100 : null
  const result = {} as Record<'spring' | 'summer' | 'autumn' | 'winter', SeasonStats>

  for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
    const points = seasonBuckets[season]
    if (points.length === 0) {
      result[season] = {
        avg_consumption: null,
        min_consumption: null,
        max_consumption: null,
        e85_fraction: null,
        e10_consumption: null,
        e85_consumption: null,
        range_km: null,
        range_km_best: null,
        range_km_worst: null,
        range_km_e10: null,
        range_km_e85: null,
        fill_count: 0,
      }
      continue
    }

    const totalKm = points.reduce((s, [d]) => s + d, 0)
    const totalLiters = points.reduce((s, [, l]) => s + l, 0)
    const totalE85 = points.reduce((s, [, , e]) => s + e, 0)

    const avgMeasured = (totalLiters * 100) / totalKm
    const avgE85Frac = totalE85 / totalLiters
    const minConso = pyRound(Math.min(...points.map(([, , , m]) => m)), 2)
    const maxConso = pyRound(Math.max(...points.map(([, , , m]) => m)), 2)

    let e10Consumption: number | null = null
    let e85Consumption: number | null = null
    if (opc !== null) {
      const e10PerSeg = points.map(([, l, e, m]) => m / (1 + opc * (e / l)))
      e10Consumption = pyRound(
        points.reduce((s, p, i) => s + (p[0] / totalKm) * e10PerSeg[i], 0),
        2,
      )
      e85Consumption = pyRound(e10Consumption * (1 + opc), 2)
    }

    result[season] = {
      avg_consumption: pyRound(avgMeasured, 2),
      min_consumption: minConso,
      max_consumption: maxConso,
      e85_fraction: pyRound(avgE85Frac, 3),
      e10_consumption: e10Consumption,
      e85_consumption: e85Consumption,
      range_km: range(avgMeasured),
      range_km_best: range(minConso),
      range_km_worst: range(maxConso),
      range_km_e10: range(e10Consumption),
      range_km_e85: range(e85Consumption),
      fill_count: points.length,
    }
  }

  return result
}

export async function vehicleStats(vehicleId: number): Promise<VehicleStats> {
  const vehicle = await getVehicle(vehicleId)
  const fuelStats = await fuelStatistics(vehicleId)

  const entries = await activeFuelEntries(vehicleId)
  const lastEntry = entries.length
    ? entries.reduce((a, b) =>
        b.odometer_reading > a.odometer_reading ||
        (b.odometer_reading === a.odometer_reading && b.fueling_date > a.fueling_date)
          ? b
          : a,
      )
    : null

  let lastOdometer: number | null = null
  let daysSinceLastEntry: number | null = null
  let totalDistance = 0.0

  if (lastEntry) {
    lastOdometer = lastEntry.odometer_reading
    if (lastEntry.fueling_date) {
      const days = Math.floor(
        (new Date(`${todayStr()}T00:00:00`).getTime() -
          new Date(`${lastEntry.fueling_date}T00:00:00`).getTime()) /
          86_400_000,
      )
      daysSinceLastEntry = Math.max(0, days)
    }
    if (lastOdometer && vehicle.initial_odometer !== null) {
      totalDistance = lastOdometer - vehicle.initial_odometer
    }
  } else {
    lastOdometer = vehicle.initial_odometer
  }

  const totalFuelCost = fuelStats.total_cost
  const costPerKm = fuelStats.total_distance > 0 ? totalFuelCost / fuelStats.total_distance : 0

  const currentInsuranceLimit = calculateCurrentInsuranceLimit(vehicle)
  let insuranceKmRemaining: number | null = null
  let insuranceKmExceeded = false
  const refOdometer = lastOdometer !== null ? lastOdometer : vehicle.initial_odometer
  if (currentInsuranceLimit !== null && refOdometer !== null) {
    insuranceKmRemaining = currentInsuranceLimit - refOdometer
    insuranceKmExceeded = insuranceKmRemaining < 0
  }

  const conversions = await db.all<FlexfuelConversion & LocalRow>('flexfuel_conversions')
  const flexfuel = conversions.find(
    (c) => c.is_active && c.vehicle_id === vehicleId,
  )
  const overconsumptionPct = flexfuel ? flexfuel.overconsumption_pct : null
  const tank = vehicle.tank_capacity

  const avgConso = fuelStats.average_consumption
  let overallRange: number | null = null
  if (avgConso && avgConso > 0 && tank) {
    overallRange = pyRound(Math.max(0, tank - 5.0) * 100 / avgConso, 0)
  }

  const seasonal = await seasonalConsumption(
    vehicleId,
    overconsumptionPct,
    tank,
    flexfuel ? flexfuel.conversion_date : undefined,
  )

  return {
    vehicle_id: vehicleId,
    total_fuel_entries: fuelStats.total_entries,
    total_fuel_quantity: fuelStats.total_liters,
    total_distance: totalDistance,
    average_consumption: avgConso,
    average_fuel_price: fuelStats.average_price_per_liter,
    total_fuel_cost: pyRound(totalFuelCost, 2),
    cost_per_km: pyRound(costPerKm, 3),
    last_odometer: lastOdometer,
    days_since_last_entry: daysSinceLastEntry,
    current_insurance_km_limit: currentInsuranceLimit ? pyRound(currentInsuranceLimit, 2) : null,
    insurance_km_remaining:
      insuranceKmRemaining !== null ? pyRound(insuranceKmRemaining, 2) : null,
    insurance_km_exceeded: insuranceKmExceeded,
    range_km: overallRange,
    spring: seasonal.spring,
    summer: seasonal.summer,
    autumn: seasonal.autumn,
    winter: seasonal.winter,
    has_flexfuel: flexfuel !== undefined,
  }
}

export async function vehicleStatsBatch(): Promise<Record<string, VehicleStats>> {
  const vehicles = await activeVehicles()
  const result: Record<string, VehicleStats> = {}
  for (const v of vehicles) {
    try {
      result[v.id] = await vehicleStats(v.id)
    } catch {
      // mirror backend: log and continue
    }
  }
  return result
}

// ─── Timeline + period stats ─────────────────────────────────────────────────

export async function vehicleTimeline(vehicleId: number) {
  const [fuelEntries, maintenances] = await Promise.all([
    (async () => {
      const all = await db.all<FuelEntry & LocalRow>('fuel_entries')
      return all.filter((e) => e.is_active && e.vehicle_id === vehicleId)
    })(),
    (async () => {
      const all = await db.all<Maintenance & LocalRow>('maintenances')
      return all.filter((m) => m.is_active && m.vehicle_id === vehicleId)
    })(),
  ])

  const events = [
    ...fuelEntries.map((e) => ({
      event_type: 'fuel',
      event_date: e.fueling_date,
      event_id: e.id,
      odometer_reading: e.odometer_reading,
      data: {
        fuel_type: e.fuel_type ?? null,
        liters: e.liters,
        price_per_liter: e.price_per_liter,
        total_cost: e.total_cost,
        station_name: e.station_name,
        location: e.location,
        is_full_tank: e.is_full_tank,
        notes: e.notes,
      },
    })),
    ...maintenances.map((m) => ({
      event_type: 'maintenance',
      event_date: m.maintenance_date,
      event_id: m.id,
      odometer_reading: m.odometer_reading,
      data: {
        maintenance_type: m.maintenance_type,
        description: m.description,
        cost: m.cost,
        service_provider: m.service_provider,
        location: m.location,
        next_maintenance_date: m.next_maintenance_date,
        next_maintenance_odometer: m.next_maintenance_odometer,
        notes: m.notes,
      },
    })),
  ]

  events.sort((a, b) =>
    b.event_date.localeCompare(a.event_date) ||
    b.odometer_reading - a.odometer_reading,
  )

  return { vehicle_id: vehicleId, events }
}

export async function periodStats(
  vehicleId: number,
  startDate: string,
  endDate: string,
): Promise<VehiclePeriodStats> {
  await getVehicle(vehicleId)
  const all = await db.all<FuelEntry & LocalRow>('fuel_entries')
  const entries = sortFillOrder(
    all.filter(
      (e) =>
        e.is_active &&
        e.vehicle_id === vehicleId &&
        e.fueling_date >= startDate &&
        e.fueling_date <= endDate,
    ),
  )

  const startMs = new Date(`${startDate}T00:00:00`).getTime()
  const endMs = new Date(`${endDate}T00:00:00`).getTime()
  const days = Math.round((endMs - startMs) / 86_400_000) + 1

  const totalLiters = entries.reduce((s, e) => s + e.liters, 0)
  const totalCost = entries.reduce((s, e) => s + e.total_cost, 0)
  const distanceKm =
    entries.length > 1 ? Math.max(0, entries[entries.length - 1].odometer_reading - entries[0].odometer_reading) : 0.0

  let avgConsumption: number | null = null
  const firstFullIdx = entries.findIndex((e) => e.is_full_tank)
  if (firstFullIdx !== -1) {
    let anchor = entries[firstFullIdx].odometer_reading
    let acc = 0
    let segLiters = 0
    let segKm = 0
    for (const e of entries.slice(firstFullIdx + 1)) {
      acc += e.liters
      if (e.is_full_tank) {
        const d = e.odometer_reading - anchor
        if (d > 0) {
          segLiters += acc
          segKm += d
        }
        anchor = e.odometer_reading
        acc = 0
      }
    }
    if (segKm > 0) avgConsumption = pyRound((segLiters * 100) / segKm, 2)
  }

  const byFuel: Record<string, [number, number]> = {}
  for (const e of entries) {
    const key = e.fuel_type ?? 'inconnu'
    byFuel[key] = byFuel[key] ?? [0, 0]
    byFuel[key][0] += e.liters
    byFuel[key][1] += e.total_cost
  }
  const fuelBreakdown: FuelTypePeriodBreakdown[] = Object.entries(byFuel)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fuelType, [liters, cost]]) => ({
      fuel_type: fuelType,
      liters: pyRound(liters, 2),
      total_cost: pyRound(cost, 2),
      avg_price_per_liter: liters > 0 ? pyRound(cost / liters, 3) : 0,
    }))

  const maintAll = await db.all<Maintenance & LocalRow>('maintenances')
  const maintenances = maintAll.filter(
    (m) =>
      m.is_active &&
      m.vehicle_id === vehicleId &&
      m.maintenance_date >= startDate &&
      m.maintenance_date <= endDate,
  )
  const maintenanceCost = pyRound(maintenances.reduce((s, m) => s + m.cost, 0), 2)

  // E85 savings vs 100% E10 — same formula as rentability, bounded to the period.
  let e85Savings: number | null = null
  let e85Share: number | null = null
  let skipped = 0
  const conversions = await db.all<FlexfuelConversion & LocalRow>('flexfuel_conversions')
  const flexfuel = conversions.find((c) => c.is_active && c.vehicle_id === vehicleId)
  if (flexfuel) {
    const e10Prices = await db.all<E10ReferencePrice & LocalRow>('e10_prices')
    const factor = 1 + flexfuel.overconsumption_pct / 100
    let savings = 0
    let e85Liters = 0
    for (const e of entries) {
      if (e.fuel_type === 'e85' && e.fueling_date >= flexfuel.conversion_date) {
        e85Liters += e.liters
        const ref = e10Prices
          .filter((p) => p.is_active && p.reference_date <= e.fueling_date)
          .sort((a, b) => b.reference_date.localeCompare(a.reference_date))[0]
        if (!ref) {
          skipped++
          continue
        }
        savings += (e.liters / factor) * ref.price_per_liter - e.total_cost
      }
    }
    e85Savings = pyRound(savings, 2)
    e85Share = totalLiters > 0 ? pyRound(e85Liters / totalLiters, 3) : null
  }

  const totalPeriodCost = totalCost + maintenanceCost
  return {
    vehicle_id: vehicleId,
    start_date: startDate,
    end_date: endDate,
    days,
    distance_km: distanceKm,
    fill_count: entries.length,
    total_liters: pyRound(totalLiters, 2),
    total_fuel_cost: pyRound(totalCost, 2),
    avg_consumption: avgConsumption,
    avg_price_per_liter: totalLiters > 0 ? pyRound(totalCost / totalLiters, 3) : null,
    fuel_breakdown: fuelBreakdown,
    e85_savings: e85Savings,
    e85_share_liters: e85Share,
    skipped_fills_no_e10_price: skipped,
    fuel_cost_per_100km: distanceKm > 0 ? pyRound((totalCost * 100) / distanceKm, 2) : null,
    maintenance_cost: maintenanceCost,
    maintenance_count: maintenances.length,
    cost_per_day: days > 0 ? pyRound(totalPeriodCost / days, 2) : null,
    km_per_day: days > 0 ? pyRound(distanceKm / days, 1) : null,
  }
}

// ─── Maintenance (port of maintenance_service) ──────────────────────────────

export async function listMaintenances(vehicleId: number): Promise<Maintenance[]> {
  const all = await db.all<Maintenance & LocalRow>('maintenances')
  return all
    .filter((m) => m.is_active && m.vehicle_id === vehicleId)
    .sort((a, b) => b.maintenance_date.localeCompare(a.maintenance_date))
}

export async function createMaintenance(data: Record<string, unknown>): Promise<Maintenance> {
  const vehicle = await getVehicle(data.vehicle_id as number)
  const odometer = data.odometer_reading as number
  if (odometer < (vehicle.initial_odometer || 0)) {
    badRequest(
      `Le kilométrage ${odometer} km est inférieur au kilométrage initial du véhicule (${fmt(vehicle.initial_odometer || 0)} km)`,
    )
  }
  return db.put<Maintenance & LocalRow>('maintenances', {
    vehicle_id: vehicle.id,
    maintenance_type: data.maintenance_type as string,
    description: (data.description as string | null) ?? null,
    cost: data.cost as number,
    odometer_reading: odometer,
    service_provider: (data.service_provider as string | null) ?? null,
    location: (data.location as string | null) ?? null,
    maintenance_date: data.maintenance_date as string,
    notes: (data.notes as string | null) ?? null,
    next_maintenance_date: (data.next_maintenance_date as string | null) ?? null,
    next_maintenance_odometer: (data.next_maintenance_odometer as number | null) ?? null,
    is_active: true,
  })
}

export async function updateMaintenance(
  maintenanceId: number,
  data: Record<string, unknown>,
): Promise<Maintenance | null> {
  const all = await db.all<Maintenance & LocalRow>('maintenances')
  const entry = all.find((m) => m.id === maintenanceId && m.is_active)
  if (!entry) return null
  if ('odometer_reading' in data) {
    const vehicle = await getVehicle(entry.vehicle_id)
    if ((data.odometer_reading as number) < (vehicle.initial_odometer || 0)) {
      badRequest(
        `Le kilométrage ${data.odometer_reading} km est inférieur au kilométrage initial du véhicule (${fmt(vehicle.initial_odometer || 0)} km)`,
      )
    }
  }
  const updated = await db.patch<Maintenance & LocalRow>('maintenances', maintenanceId, data)
  return updated ?? null
}

export async function deleteMaintenance(maintenanceId: number): Promise<boolean> {
  const all = await db.all<Maintenance & LocalRow>('maintenances')
  const entry = all.find((m) => m.id === maintenanceId && m.is_active)
  if (!entry) return false
  await db.patch<Maintenance & LocalRow>('maintenances', maintenanceId, { is_active: false })
  return true
}

export async function maintenanceStatistics(vehicleId: number) {
  const all = await db.all<Maintenance & LocalRow>('maintenances')
  const entries = all
    .filter((m) => m.is_active && m.vehicle_id === vehicleId)
    .sort((a, b) => a.maintenance_date.localeCompare(b.maintenance_date))

  if (entries.length === 0) {
    return {
      total_entries: 0,
      total_cost: 0,
      average_cost: 0,
      last_maintenance_date: null,
      next_maintenance_date: null,
    }
  }

  const totalCost = entries.reduce((s, m) => s + m.cost, 0)
  const last = entries[entries.length - 1]
  // Only the latest entry per type counts for the next due date.
  const latestByType: Record<string, Maintenance> = {}
  for (const e of entries) latestByType[e.maintenance_type] = e
  const nextDates = Object.values(latestByType)
    .map((e) => e.next_maintenance_date)
    .filter((d): d is string => d != null)
  const nextDate = nextDates.length ? nextDates.sort()[0] : null

  return {
    total_entries: entries.length,
    total_cost: pyRound(totalCost, 2),
    average_cost: pyRound(totalCost / entries.length, 2),
    last_maintenance_date: last.maintenance_date,
    next_maintenance_date: nextDate,
  }
}

// ─── FlexFuel (port of flexfuel_service) ────────────────────────────────────

export async function getConversion(vehicleId: number): Promise<FlexfuelConversion | null> {
  const all = await db.all<FlexfuelConversion & LocalRow>('flexfuel_conversions')
  const c = all.find((x) => x.vehicle_id === vehicleId && x.is_active)
  return c ?? null
}

export async function createConversion(data: Record<string, unknown>): Promise<FlexfuelConversion> {
  const vehicleId = data.vehicle_id as number
  await getVehicle(vehicleId)
  const all = await db.all<FlexfuelConversion & LocalRow>('flexfuel_conversions')
  const existing = all.find((x) => x.vehicle_id === vehicleId)
  if (existing) {
    if (existing.is_active) {
      badRequest(`Une conversion FlexFuel existe déjà pour le véhicule ${vehicleId}`)
    }
    const updated = await db.patch<FlexfuelConversion & LocalRow>('flexfuel_conversions', existing.id, {
      is_active: true,
      conversion_date: data.conversion_date as string,
      kit_cost: data.kit_cost as number,
      overconsumption_pct: data.overconsumption_pct as number,
      kit_brand: (data.kit_brand as string | null) ?? null,
      installer: (data.installer as string | null) ?? null,
      notes: (data.notes as string | null) ?? null,
      target_ethanol_pct: (data.target_ethanol_pct as number) ?? 77,
      ethanol_tolerance_pct: (data.ethanol_tolerance_pct as number) ?? 5,
    })
    return updated ?? existing
  }
  return db.put<FlexfuelConversion & LocalRow>('flexfuel_conversions', {
    vehicle_id: vehicleId,
    conversion_date: data.conversion_date as string,
    kit_cost: data.kit_cost as number,
    overconsumption_pct: (data.overconsumption_pct as number) ?? 0,
    kit_brand: (data.kit_brand as string | null) ?? null,
    installer: (data.installer as string | null) ?? null,
    notes: (data.notes as string | null) ?? null,
    target_ethanol_pct: (data.target_ethanol_pct as number) ?? 77,
    ethanol_tolerance_pct: (data.ethanol_tolerance_pct as number) ?? 5,
    is_active: true,
  })
}

export async function updateConversion(
  vehicleId: number,
  data: Record<string, unknown>,
): Promise<FlexfuelConversion | null> {
  const conversion = await getConversion(vehicleId)
  if (!conversion) return null
  const updated = await db.patch<FlexfuelConversion & LocalRow>('flexfuel_conversions', conversion.id, data)
  return updated ?? null
}

export async function deleteConversion(vehicleId: number): Promise<boolean> {
  const conversion = await getConversion(vehicleId)
  if (!conversion) return false
  await db.patch<FlexfuelConversion & LocalRow>('flexfuel_conversions', conversion.id, { is_active: false })
  return true
}

export async function listE10Prices(): Promise<E10ReferencePrice[]> {
  const all = await db.all<E10ReferencePrice & LocalRow>('e10_prices')
  return all
    .filter((p) => p.is_active)
    .sort((a, b) => b.reference_date.localeCompare(a.reference_date))
}

export async function createE10Price(data: Record<string, unknown>): Promise<E10ReferencePrice> {
  return db.put<E10ReferencePrice & LocalRow>('e10_prices', {
    reference_date: data.reference_date as string,
    price_per_liter: data.price_per_liter as number,
    notes: (data.notes as string | null) ?? null,
    is_active: true,
  })
}

export async function deleteE10Price(priceId: number): Promise<boolean> {
  const all = await db.all<E10ReferencePrice & LocalRow>('e10_prices')
  const p = all.find((x) => x.id === priceId && x.is_active)
  if (!p) return false
  await db.patch<E10ReferencePrice & LocalRow>('e10_prices', priceId, { is_active: false })
  return true
}

export async function latestE10PriceAtDate(targetDate: string): Promise<number | null> {
  const all = await db.all<E10ReferencePrice & LocalRow>('e10_prices')
  const p = all
    .filter((x) => x.is_active && x.reference_date <= targetDate)
    .sort((a, b) => b.reference_date.localeCompare(a.reference_date))[0]
  return p ? p.price_per_liter : null
}

export async function rentability(vehicleId: number) {
  const conversion = await getConversion(vehicleId)
  if (!conversion) return null

  const entries = await activeFuelEntries(vehicleId)
  const e85Entries = entries.filter(
    (e) => e.fuel_type === 'e85' && e.fueling_date >= conversion.conversion_date,
  )

  const factor = 1 + conversion.overconsumption_pct / 100
  let cumulativeSavings = 0
  const dataPoints: Record<string, unknown>[] = []
  const monthlyMap: Record<string, number> = {}
  let breakEvenDate: string | null = null
  let skipped = 0

  for (const entry of e85Entries) {
    const e10Ref = await latestE10PriceAtDate(entry.fueling_date)
    if (e10Ref === null) {
      skipped++
      continue
    }
    const equivalentLiters = entry.liters / factor
    const e10Cost = equivalentLiters * e10Ref
    const savings = e10Cost - entry.total_cost
    cumulativeSavings += savings
    if (breakEvenDate === null && cumulativeSavings >= conversion.kit_cost) {
      breakEvenDate = entry.fueling_date
    }
    const monthKey = entry.fueling_date.slice(0, 7)
    monthlyMap[monthKey] = (monthlyMap[monthKey] ?? 0) + savings
    dataPoints.push({
      date: entry.fueling_date,
      e85_liters: pyRound(entry.liters, 2),
      e85_cost: pyRound(entry.total_cost, 2),
      equivalent_e10_liters: pyRound(equivalentLiters, 2),
      e10_reference_price: pyRound(e10Ref, 3),
      e10_equivalent_cost: pyRound(e10Cost, 2),
      savings: pyRound(savings, 2),
      cumulative_savings: pyRound(cumulativeSavings, 2),
    })
  }

  const monthlySavings = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, savings]) => ({ month, savings: pyRound(savings, 2) }))

  const today = new Date()
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const completedSavings = monthlySavings
    .filter((m) => m.month < currentMonth)
    .reduce((s, m) => s + m.savings, 0)
  const monthsElapsed =
    (today.getFullYear() - Number(conversion.conversion_date.slice(0, 4))) * 12 +
    (today.getMonth() + 1 - Number(conversion.conversion_date.slice(5, 7)))
  const monthlyAvg = monthsElapsed > 0 ? pyRound(completedSavings / monthsElapsed, 2) : null

  return {
    vehicle_id: vehicleId,
    kit_cost: conversion.kit_cost,
    overconsumption_pct: conversion.overconsumption_pct,
    conversion_date: conversion.conversion_date,
    total_e85_fills: dataPoints.length,
    total_savings: pyRound(cumulativeSavings, 2),
    break_even_reached: cumulativeSavings >= conversion.kit_cost,
    break_even_date: breakEvenDate,
    monthly_average_savings: monthlyAvg,
    skipped_fills_no_e10_price: skipped,
    data_points: dataPoints,
    monthly_savings: monthlySavings,
  }
}
