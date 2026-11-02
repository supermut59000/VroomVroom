import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import type { LocalRow } from './db'
import * as svc from './services'
import { pyRound } from './services'
import type {
  FuelEntry,
  Vehicle,
  Maintenance,
  E10ReferencePrice,
  FlexfuelConversion,
} from '@/types'

type FuelSeed = Omit<FuelEntry, 'id' | 'created_at' | 'updated_at'> & {
  is_active?: boolean
}

const FUEL_DEFAULTS: FuelSeed = {
  vehicle_id: 1,
  fuel_type: 'essence',
  liters: 40,
  price_per_liter: 1.6,
  total_cost: 64,
  odometer_reading: 10000,
  station_name: null,
  location: null,
  latitude: null,
  longitude: null,
  fueling_date: '2026-01-15',
  is_full_tank: true,
  notes: null,
  client_request_id: null,
  is_active: true,
}

async function seedVehicle(over: Record<string, unknown> = {}) {
  return svc.createVehicle({
    brand: 'Peugeot',
    model: '208',
    year: 2019,
    license_plate: 'AB-123-CD',
    fuel_type: 'essence',
    initial_odometer: 10000,
    tank_capacity: 50,
    ...over,
  })
}

async function seedFuel(over: Partial<FuelSeed>): Promise<FuelEntry> {
  return (await db.put<FuelEntry & LocalRow>('fuel_entries', {
    ...FUEL_DEFAULTS,
    ...over,
  })) as FuelEntry
}

async function seedE10Price(referenceDate: string, price: number) {
  return db.put<E10ReferencePrice & LocalRow>('e10_prices', {
    reference_date: referenceDate,
    price_per_liter: price,
    notes: null,
    is_active: true,
  })
}

async function seedConversion(over: Record<string, unknown> = {}) {
  return db.put<FlexfuelConversion & LocalRow>('flexfuel_conversions', {
    vehicle_id: 1,
    conversion_date: '2024-03-15',
    kit_cost: 850,
    overconsumption_pct: 20,
    kit_brand: 'FLEXbox',
    installer: null,
    notes: null,
    target_ethanol_pct: 77,
    ethanol_tolerance_pct: 5,
    is_active: true,
    ...over,
  })
}

beforeEach(async () => {
  await db.clearAll()
})

describe('pyRound — must match Python round() (half-to-even on the binary value)', () => {
  it('does not treat values just below .5 as ties (16.255 → 16.25)', () => {
    expect(pyRound(16.255, 2)).toBe(16.25)
  })
  it('2.675 → 2.67 (stored double is 2.674999…)', () => {
    expect(pyRound(2.675, 2)).toBe(2.67)
  })
  it('exact ties round to even', () => {
    expect(pyRound(2.5, 0)).toBe(2)
    expect(pyRound(3.5, 0)).toBe(4)
    expect(pyRound(0.125, 2)).toBe(0.12)
    expect(pyRound(0.375, 2)).toBe(0.38)
  })
  it('carries through trailing 9s', () => {
    expect(pyRound(9.9999, 2)).toBe(10)
  })
  it('negative values keep the sign', () => {
    expect(pyRound(-2.5, 0)).toBe(-2)
    expect(pyRound(-16.255, 2)).toBe(-16.25)
  })
  it('ordinary rounding still works', () => {
    expect(pyRound(1.004, 2)).toBe(1)
    expect(pyRound(1.999, 2)).toBe(2)
    expect(pyRound(123.456, 0)).toBe(123)
  })
})

describe('vehicles (local)', () => {
  it('create rejects a duplicate license plate (409)', async () => {
    await seedVehicle()
    await expect(
      seedVehicle({ license_plate: 'ab-123-cd' }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('list defaults to active only', async () => {
    const v1 = await seedVehicle({ license_plate: 'AA-111-BB' })
    await seedVehicle({ license_plate: 'CC-222-DD' })
    await db.patch<Vehicle & LocalRow>('vehicles', v1.id, { is_active: false })
    const list = await svc.listVehicles()
    expect(list.map((v) => v.license_plate)).toEqual(['CC-222-DD'])
    expect(await svc.listVehicles({ activeOnly: false })).toHaveLength(2)
  })

  it('update rejects initial_odometer above the first reading', async () => {
    await seedVehicle()
    await seedFuel({ odometer_reading: 10500 })
    await expect(
      svc.updateVehicle(1, { initial_odometer: 11000 }),
    ).rejects.toMatchObject({ status: 422 })
    // and accepts a value at or below it
    const updated = await svc.updateVehicle(1, { initial_odometer: 10000 })
    expect(updated.initial_odometer).toBe(10000)
  })

  it('soft delete hides the vehicle, force delete hides its entries too', async () => {
    const v1 = await seedVehicle()
    await seedFuel({ odometer_reading: 10500 })
    await svc.deleteVehicle(v1.id, false)
    expect(await svc.listVehicles()).toHaveLength(0)
    expect(await svc.listVehicles({ activeOnly: false })).toHaveLength(1)

    const v2 = await svc.createVehicle({
      brand: 'Citroën', model: 'C3', year: 2018, license_plate: 'XX-999-ZZ',
      fuel_type: 'diesel', initial_odometer: 5000, tank_capacity: 45,
    })
    await seedFuel({ vehicle_id: v2.id, odometer_reading: 5200, fueling_date: '2026-02-01' })
    await svc.deleteVehicle(v2.id, true)
    expect(await svc.listFuelEntriesByVehicle(v2.id)).toHaveLength(0)
  })
})

describe('fuel entries (local)', () => {
  it('client_request_id is idempotent per vehicle, 422 cross-vehicle', async () => {
    await seedVehicle()
    await seedVehicle({ license_plate: 'ZZ-111-AA', brand: 'Citroën', model: 'C3', year: 2018, initial_odometer: 5000, fuel_type: 'diesel' })
    const data = {
      vehicle_id: 1,
      fuel_type: 'essence',
      liters: 40,
      price_per_liter: 1.6,
      odometer_reading: 10500,
      fueling_date: '2026-03-01',
      is_full_tank: true,
      client_request_id: 'req-1',
    }
    const first = await svc.createFuelEntry(data, false)
    const again = await svc.createFuelEntry(data, false)
    expect(again.id).toBe(first.id)
    expect((await svc.listFuelEntriesByVehicle(1))).toHaveLength(1)

    await expect(
      svc.createFuelEntry({ ...data, vehicle_id: 2 }, false),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('odometer guards: below initial, below latest (and the override)', async () => {
    await seedVehicle()
    await seedFuel({ odometer_reading: 10500, fueling_date: '2026-03-01' })
    const base = {
      vehicle_id: 1, fuel_type: 'essence', liters: 30, price_per_liter: 1.6,
      fueling_date: '2026-03-15', is_full_tank: true,
    }
    await expect(
      svc.createFuelEntry({ ...base, odometer_reading: 9999 }, false),
    ).rejects.toMatchObject({ status: 422 })
    await expect(
      svc.createFuelEntry({ ...base, odometer_reading: 10400 }, false),
    ).rejects.toMatchObject({ status: 422 })
    const ok = await svc.createFuelEntry({ ...base, odometer_reading: 10400 }, true)
    expect(ok.odometer_reading).toBe(10400)
    // equal odometer stays valid (blend fills share the stop)
    const equal = await svc.createFuelEntry({ ...base, odometer_reading: 10500 }, false)
    expect(equal.id).toBeGreaterThan(0)
  })

  it('update recomputes total_cost from liters × price', async () => {
    await seedVehicle()
    const e = await seedFuel({ odometer_reading: 10500 })
    const updated = await svc.updateFuelEntry(e.id, { liters: 42 }, false)
    expect(updated?.total_cost).toBe(42 * 1.6)
  })

  it('update keeps chronology vs previous/following entries', async () => {
    await seedVehicle()
    const a = await seedFuel({ odometer_reading: 10200, fueling_date: '2026-01-01' })
    const b = await seedFuel({ odometer_reading: 10800, fueling_date: '2026-03-01' })
    const mid = await seedFuel({ odometer_reading: 10500, fueling_date: '2026-02-01' })
    await expect(
      svc.updateFuelEntry(mid.id, { odometer_reading: 10100 }, false),
    ).rejects.toMatchObject({ status: 422 })
    await expect(
      svc.updateFuelEntry(mid.id, { odometer_reading: 10900 }, false),
    ).rejects.toMatchObject({ status: 422 })
    await expect(
      svc.updateFuelEntry(mid.id, { odometer_reading: 10550 }, false),
    ).resolves.toBeTruthy()
    expect([a.id, b.id, mid.id].sort()).toHaveLength(3)
  })

  it('soft delete removes the entry from lists and stats', async () => {
    await seedVehicle()
    const e = await seedFuel({ odometer_reading: 10500 })
    expect(await svc.deleteFuelEntry(e.id)).toBe(true)
    expect(await svc.listFuelEntriesByVehicle(1)).toHaveLength(0)
    expect((await svc.fuelStatistics(1)).total_entries).toBe(0)
  })
})

describe('fuel statistics (local) — port of the backend reference', () => {
  it('distance-weighted average: long segments weigh more', async () => {
    await seedVehicle()
    // Segment 1: 10000 → 10800 km, 40 L (5.0 L/100)
    // Segment 2: 10800 → 12000 km, 48 L (12.0 L/100)
    // Weighted: (40 + 48) × 100 / 2000 = 4.4
    await seedFuel({ odometer_reading: 10000, fueling_date: '2026-01-01' })
    await seedFuel({ odometer_reading: 10800, fueling_date: '2026-02-01', liters: 40, total_cost: 64 })
    await seedFuel({ odometer_reading: 12000, fueling_date: '2026-03-01', liters: 48, price_per_liter: 1.6, total_cost: 76.8 })
    const stats = await svc.fuelStatistics(1)
    expect(stats.average_consumption).toBe(4.4)
    expect(stats.total_distance).toBe(2000)
    expect(stats.total_liters).toBe(128)
  })

  it('leading partials do not anchor a segment', async () => {
    await seedVehicle()
    await seedFuel({ odometer_reading: 10100, fueling_date: '2026-01-01', liters: 10, total_cost: 16, is_full_tank: false })
    await seedFuel({ odometer_reading: 10500, fueling_date: '2026-01-15', liters: 35, total_cost: 56 })
    await seedFuel({ odometer_reading: 11500, fueling_date: '2026-02-15', liters: 40, total_cost: 64 })
    // One segment: 10500 → 11500 = 1000 km with 40 L → 4.0
    expect((await svc.fuelStatistics(1)).average_consumption).toBe(4.0)
  })
})

describe('consumption history (local) — E85 attribution (B2 regression)', () => {
  it('same-stop booster sets the first segment fraction (5/45 ≈ 0.111, not 0)', async () => {
    await seedVehicle()
    // Anchor stop: Partiel E85 5 L + Plein essence 40 L, same date & odometer
    await seedFuel({ odometer_reading: 10000, fueling_date: '2026-01-01', liters: 5, price_per_liter: 0.8, total_cost: 4, fuel_type: 'e85', is_full_tank: false })
    await seedFuel({ odometer_reading: 10000, fueling_date: '2026-01-01', liters: 40, price_per_liter: 1.6, total_cost: 64, fuel_type: 'essence' })
    // Closing full: 40 L essence at 11000 km
    await seedFuel({ odometer_reading: 11000, fueling_date: '2026-02-01', liters: 40, price_per_liter: 1.6, total_cost: 64, fuel_type: 'essence' })

    const history = await svc.consumptionHistory(1)
    const points = history.data_points as {
      is_full_tank: boolean
      consumption: number | null
      e85_fraction: number | null
      liters: number
    }[]
    const segment = points.find((p) => p.is_full_tank && p.consumption != null)
    expect(segment).toBeDefined()
    // 40 L over 1000 km — the booster is NOT in this segment's liters,
    // only in its E85 attribution.
    expect(segment!.consumption).toBe(4.0)
    expect(segment!.e85_fraction).toBeCloseTo(5 / 45, 4)
  })
})

describe('vehicle stats (local)', () => {
  it('has_flexfuel flag + insurance + distance', async () => {
    await seedVehicle({
      insurance_unlimited: false,
      insurance_km_limit: 30000,
      insurance_km_annual_increase: 15000,
      insurance_km_start_date: '2025-01-01',
    })
    await seedFuel({ odometer_reading: 15000, fueling_date: '2026-03-01' })
    await seedConversion()
    const stats = await svc.vehicleStats(1)
    expect(stats.has_flexfuel).toBe(true)
    expect(stats.total_distance).toBe(5000)
    expect(stats.last_odometer).toBe(15000)
    // Insurance: 30000 + yearsElapsed × 15000 (start 2025-01-01)
    const today = new Date()
    let years = today.getFullYear() - 2025
    const anniversaryPassed =
      today.getMonth() + 1 > 1 || (today.getMonth() + 1 === 1 && today.getDate() >= 1)
    if (!anniversaryPassed) years -= 1
    years = Math.max(0, years)
    const limit = 30000 + years * 15000
    expect(stats.current_insurance_km_limit).toBe(limit)
    expect(stats.insurance_km_remaining).toBe(limit - 15000)

    const batch = await svc.vehicleStatsBatch()
    expect(batch['1'].has_flexfuel).toBe(true)
  })

  it('days_since_last_entry clamps at 0 for future-dated fills', async () => {
    await seedVehicle()
    await seedFuel({ odometer_reading: 15000, fueling_date: '2030-01-01' })
    expect((await svc.vehicleStats(1)).days_since_last_entry).toBe(0)
  })
})

describe('seasonal consumption (local) — E10/E85 normalisation', () => {
  it('normalises a pure-E85 summer segment back to E10', async () => {
    await seedVehicle()
    await seedConversion({ overconsumption_pct: 20, conversion_date: '2026-06-01' })
    // Anchor: Plein E85 at 10000 (summer), closing Plein E85 10 L at 10100
    await seedFuel({ odometer_reading: 10000, fueling_date: '2026-06-10', liters: 40, price_per_liter: 0.8, total_cost: 32, fuel_type: 'e85' })
    await seedFuel({ odometer_reading: 10100, fueling_date: '2026-07-10', liters: 10, price_per_liter: 0.8, total_cost: 8, fuel_type: 'e85' })

    const stats = await svc.vehicleStats(1)
    const summer = stats.summer!
    expect(summer.fill_count).toBe(1)
    expect(summer.avg_consumption).toBe(10.0)
    expect(summer.e85_fraction).toBe(1.0)
    expect(summer.e10_consumption).toBeCloseTo(8.33, 2)
    expect(summer.e85_consumption).toBeCloseTo(10.0, 2)
  })
})

describe('rentability (local)', () => {
  it('break-even date, skipped fills without E10 price', async () => {
    await seedVehicle()
    await seedConversion({ kit_cost: 30, overconsumption_pct: 20 })
    // E10 reference price from 2026-01-10 (1.50 €/L)
    await seedE10Price('2026-01-10', 1.5)
    // First E85 fill BEFORE any reference price → skipped
    await seedFuel({ odometer_reading: 10100, fueling_date: '2026-01-05', liters: 40, price_per_liter: 0.8, total_cost: 32, fuel_type: 'e85' })
    // Second E85 fill: savings = (40/1.2) × 1.5 − 32 = 50 − 32 = 18
    await seedFuel({ odometer_reading: 10500, fueling_date: '2026-02-05', liters: 40, price_per_liter: 0.8, total_cost: 32, fuel_type: 'e85' })
    // Third E85 fill: +18 → cumulative 36 ≥ kit 30 → break-even here
    await seedFuel({ odometer_reading: 10900, fueling_date: '2026-03-05', liters: 40, price_per_liter: 0.8, total_cost: 32, fuel_type: 'e85' })

    const r = await svc.rentability(1)
    expect(r?.total_e85_fills).toBe(2)
    expect(r?.skipped_fills_no_e10_price).toBe(1)
    expect(r?.total_savings).toBe(36)
    expect(r?.break_even_reached).toBe(true)
    expect(r?.break_even_date).toBe('2026-03-05')
  })

  it('404-free null when no conversion', async () => {
    await seedVehicle()
    expect(await svc.rentability(1)).toBeNull()
  })
})

describe('period stats (local)', () => {
  it('bounds the period, computes span + E85 savings', async () => {
    await seedVehicle()
    await seedConversion({ kit_cost: 850, overconsumption_pct: 20 })
    await seedE10Price('2026-01-01', 1.5)
    await seedFuel({ odometer_reading: 10000, fueling_date: '2025-12-01', liters: 40, total_cost: 64 })
    await seedFuel({ odometer_reading: 10400, fueling_date: '2026-01-15', liters: 40, price_per_liter: 0.8, total_cost: 32, fuel_type: 'e85' })
    await seedFuel({ odometer_reading: 11000, fueling_date: '2026-02-15', liters: 40, total_cost: 64 })

    const p = await svc.periodStats(1, '2026-01-01', '2026-01-31')
    expect(p.days).toBe(31)
    expect(p.fill_count).toBe(1)
    expect(p.distance_km).toBe(0) // single entry in the window
    expect(p.total_fuel_cost).toBe(32)
    // savings = (40/1.2) × 1.5 − 32 = 18
    expect(p.e85_savings).toBe(18)
    expect(p.e85_share_liters).toBe(1.0)
    expect(p.fuel_breakdown).toEqual([
      { fuel_type: 'e85', liters: 40, total_cost: 32, avg_price_per_liter: 0.8 },
    ])
  })
})

describe('stations (local)', () => {
  it('distinct names sorted, optionally per vehicle', async () => {
    await seedVehicle()
    await seedVehicle({ license_plate: 'YY-555-ZZ', brand: 'Citroën', model: 'C3', year: 2018, initial_odometer: 5000, fuel_type: 'diesel' })
    await seedFuel({ odometer_reading: 10100, fueling_date: '2026-01-01', station_name: 'Shell Lyon' })
    await seedFuel({ odometer_reading: 10200, fueling_date: '2026-01-05', station_name: 'Total Villeurbanne' })
    await seedFuel({ vehicle_id: 2, odometer_reading: 5100, fueling_date: '2026-01-02', station_name: 'Total Lyon' })
    await seedFuel({ odometer_reading: 10300, fueling_date: '2026-01-08', station_name: null })
    expect(await svc.distinctStationNames()).toEqual(['Shell Lyon', 'Total Lyon', 'Total Villeurbanne'])
    expect(await svc.distinctStationNames(1)).toEqual(['Shell Lyon', 'Total Villeurbanne'])
  })

  it('nearest station: most recent fill within radius wins', async () => {
    await seedVehicle()
    // Two stations ~200 m apart (Lyon centre)
    await seedFuel({ odometer_reading: 10100, fueling_date: '2026-01-01', station_name: 'Station Vieille', latitude: 45.758, longitude: 4.833 })
    await seedFuel({ odometer_reading: 10400, fueling_date: '2026-01-15', station_name: 'Station Récente', latitude: 45.76, longitude: 4.835 })
    const hit = await svc.nearestStation(1, 45.759, 4.834, 250)
    expect(hit?.station_name).toBe('Station Récente')
    expect(await svc.nearestStation(1, 48.85, 2.35, 250)).toBeNull() // Paris: out of radius
  })
})

describe('maintenance (local)', () => {
  it('statistics: only the latest entry per type feeds the next due date', async () => {
    await seedVehicle()
    await db.put<Maintenance & LocalRow>('maintenances', {
      vehicle_id: 1, maintenance_type: 'Vidange', description: null, cost: 80,
      odometer_reading: 10100, service_provider: null, location: null,
      maintenance_date: '2026-01-01', notes: null,
      next_maintenance_date: '2026-07-01', next_maintenance_odometer: 15000, is_active: true,
    })
    await db.put<Maintenance & LocalRow>('maintenances', {
      vehicle_id: 1, maintenance_type: 'Vidange', description: null, cost: 90,
      odometer_reading: 10500, service_provider: null, location: null,
      maintenance_date: '2026-08-01', notes: null,
      next_maintenance_date: '2027-08-01', next_maintenance_odometer: 20000, is_active: true,
    })
    const stats = await svc.maintenanceStatistics(1)
    expect(stats.total_entries).toBe(2)
    expect(stats.last_maintenance_date).toBe('2026-08-01')
    expect(stats.next_maintenance_date).toBe('2027-08-01')
  })

  it('create rejects odometer below the vehicle initial', async () => {
    await seedVehicle()
    await expect(
      svc.createMaintenance({
        vehicle_id: 1, maintenance_type: 'Vidange', cost: 80,
        odometer_reading: 9999, maintenance_date: '2026-01-01',
      }),
    ).rejects.toMatchObject({ status: 422 })
  })
})

describe('conversions (local)', () => {
  it('one per vehicle; delete then create reactivates the same row', async () => {
    await seedVehicle()
    const payload = { vehicle_id: 1, conversion_date: '2024-03-15', kit_cost: 100 }
    const c1 = await svc.createConversion(payload)
    await expect(svc.createConversion(payload)).rejects.toMatchObject({ status: 422 })
    expect(await svc.deleteConversion(1)).toBe(true)
    const c2 = await svc.createConversion(payload)
    expect(c2.id).toBe(c1.id)
    expect((c2 as FlexfuelConversion & LocalRow).is_active).toBe(true)
  })
})
