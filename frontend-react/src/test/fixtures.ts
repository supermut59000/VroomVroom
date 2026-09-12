// Canned API responses + fetch router for component tests.
// The router matches URL substrings; first match wins, so specific patterns
// (e.g. /vehicles/stats/batch) must be listed before generic ones (/vehicles/).
import { vi } from 'vitest'
import type {
  E10ReferencePrice,
  FlexfuelConversion,
  FuelEntry,
  FuelStatistics,
  Maintenance,
  Vehicle,
  VehicleList,
  VehicleStats,
} from '@/types'

// Return undefined to fall through to the next matching pattern.
export type FetchHandler = (url: string, init?: RequestInit) => Response | undefined | Promise<Response | undefined>

export function json(data: unknown, status = 200): Response {
  // 204/205/304 responses may not carry a body — the constructor throws.
  const empty = status === 204 || status === 205 || status === 304
  return new Response(empty ? null : JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export interface FetchCall {
  url: string
  init?: RequestInit
}

export function installFetchRouter(routes: [string, FetchHandler][]) {
  const calls: FetchCall[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    let body: BodyInit | undefined
    if (init?.body != null) body = init.body
    else if (input instanceof Request) {
      try {
        body = await input.clone().text()
      } catch {
        body = undefined
      }
    }
    const reqInit: RequestInit = { ...init, method, body }
    calls.push({ url, init: reqInit })
    for (const [pattern, handler] of routes) {
      if (url.includes(pattern)) {
        const r = await handler(url, reqInit)
        if (r !== undefined) return r
      }
    }
    return json({ detail: `Not Found: ${url}` }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

export const vehicleList1: VehicleList = {
  id: 1,
  brand: 'Peugeot',
  model: '208',
  year: 2019,
  license_plate: 'AB-123-CD',
  fuel_type: 'essence',
  is_active: true,
  insurance_unlimited: false,
}

export const vehicleFull1: Vehicle = {
  ...vehicleList1,
  initial_odometer: 10000,
  tank_capacity: 50,
  acquisition_date: '2019-01-01',
  purchase_price: 15000,
  yearly_fixed_costs: 500,
  insurance_km_limit: 30000,
  insurance_km_annual_increase: 15000,
  insurance_km_start_date: '2025-01-01',
  description: null,
  created_at: '2025-01-01T00:00:00',
  updated_at: null,
}

export const latestEntry1: FuelEntry = {
  id: 50,
  vehicle_id: 1,
  fuel_type: 'essence',
  liters: 40,
  price_per_liter: 1.7,
  total_cost: 68,
  odometer_reading: 20000,
  station_name: 'Total Test',
  location: 'Lyon',
  latitude: 45.75,
  longitude: 4.85,
  fueling_date: '2026-08-01',
  is_full_tank: true,
  notes: null,
  client_request_id: null,
  created_at: '2026-08-01T10:00:00',
  updated_at: null,
}

export const entry1: FuelEntry = { ...latestEntry1, id: 50 }
export const entry2: FuelEntry = {
  ...latestEntry1,
  id: 49,
  liters: 38,
  price_per_liter: 1.68,
  total_cost: 63.84,
  odometer_reading: 19200,
  fueling_date: '2026-07-01',
  is_full_tank: true,
}

export const stats1: VehicleStats = {
  vehicle_id: 1,
  total_fuel_entries: 2,
  total_distance: 10000,
  total_fuel_quantity: 78,
  average_consumption: 6.5,
  average_fuel_price: 1.69,
  total_fuel_cost: 131.84,
  cost_per_km: 0.016,
  last_odometer: 20000,
  days_since_last_entry: 30,
  current_insurance_km_limit: 30000,
  insurance_km_remaining: 10000,
  insurance_km_exceeded: false,
  range_km: 770,
  spring: null,
  summer: null,
  autumn: null,
  winter: null,
}

export const fuelStats1: FuelStatistics = {
  total_entries: 2,
  total_liters: 78,
  total_cost: 131.84,
  average_price_per_liter: 1.69,
  total_distance: 800,
  average_consumption: 6.5,
}

export const maintenance1: Maintenance = {
  id: 10,
  vehicle_id: 1,
  maintenance_type: 'Vidange',
  description: 'Huile + filtre',
  cost: 80,
  odometer_reading: 19000,
  service_provider: 'Garage Central',
  location: 'Lyon',
  maintenance_date: '2026-06-01',
  notes: null,
  next_maintenance_date: '2027-06-01',
  next_maintenance_odometer: 34000,
  created_at: '2026-06-01T09:00:00',
  updated_at: null,
}

export const conversion1: FlexfuelConversion = {
  id: 1,
  vehicle_id: 1,
  conversion_date: '2024-03-15',
  kit_cost: 850,
  overconsumption_pct: 20,
  kit_brand: 'FLEXbox',
  installer: 'Garage E85',
  notes: null,
  target_ethanol_pct: 77,
  ethanol_tolerance_pct: 5,
  created_at: '2024-03-15T10:00:00',
  updated_at: null,
}

export const e10Price1: E10ReferencePrice = {
  id: 1,
  reference_date: '2026-08-01',
  price_per_liter: 1.659,
  notes: null,
  created_at: '2026-08-01T08:00:00',
  updated_at: null,
}

// GET routes shared by most component tests. Specific patterns come first —
// the router returns the first substring match.
export const baseRoutes: [string, FetchHandler][] = [
  // FlexFuel routes FIRST: /flexfuel/vehicles/1/conversion contains the
  // substring "vehicles/1", so the greedy vehicle routes must not see it first.
  ['/flexfuel/vehicles/1/conversion', () => json(null)],
  ['/flexfuel/e10-prices', () => json([])],
  ['/vehicles/stats/batch', () => json({ '1': stats1 })],
  ['/vehicles/1/timeline', () => json({ vehicle_id: 1, events: [] })],
  ['/vehicles/1/stats', () => json(stats1)],
  ['/vehicles/1', () => json(vehicleFull1)],
  // any other /vehicles/{id} GET returns the same car with the requested id
  ['/vehicles/', (url, init) => {
    const m = url.match(/\/vehicles\/(\d+)$/)
    if (m && (!init || init.method === 'GET')) return json({ ...vehicleFull1, id: Number(m[1]) })
    return undefined
  }],
  ['/vehicles/', () => json([vehicleList1])],
  ['/fuel-entries/vehicle/1/latest', () => json(latestEntry1)],
  ['/fuel-entries/vehicle/1/consumption-history', () => json({ vehicle_id: 1, data_points: [] })],
  ['/fuel-entries/vehicle/1/statistics', () => json(fuelStats1)],
  ['/fuel-entries/vehicle/1?per_page=500', () => json([entry1, entry2])],
  ['/fuel-entries/vehicle/1?', () => json([entry1])],
  ['/fuel-entries/stations?vehicle_id=1', () => json(['Total Test', 'Shell Lyon'])],
  ['/fuel-entries/?per_page=500', () =>
    json({ entries: [entry1], total: 1, page: 1, per_page: 500, pages: 1 })],
  ['/maintenances/vehicle/1/statistics', () =>
    json({
      total_entries: 1,
      total_cost: 80,
      average_cost: 80,
      last_maintenance_date: '2026-06-01',
      next_maintenance_date: '2027-06-01',
    })],
  ['/maintenances/vehicle/1', () => json([maintenance1])],
  ['/routing/matrix', () => json({ legs: [], provider: 'valhalla', cached: false })],
]
