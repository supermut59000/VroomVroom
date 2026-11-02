import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import * as svc from './services'
import { localRequest } from './local-api'

beforeEach(async () => {
  await db.clearAll()
})

describe('local-api router', () => {
  it('GET /vehicles/stats/batch returns the string-keyed map', async () => {
    await svc.createVehicle({
      brand: 'Peugeot', model: '208', year: 2019, license_plate: 'AB-123-CD',
      fuel_type: 'essence', initial_odometer: 10000, tank_capacity: 50,
    })
    const batch = await localRequest<Record<string, { vehicle_id: number; has_flexfuel: boolean }>>(
      'GET',
      '/vehicles/stats/batch',
    )
    expect(batch['1'].vehicle_id).toBe(1)
    expect(batch['1'].has_flexfuel).toBe(false)
  })

  it('GET /fuel-entries/ returns the paginated wrapper', async () => {
    await svc.createVehicle({
      brand: 'Peugeot', model: '208', year: 2019, license_plate: 'AB-123-CD',
      fuel_type: 'essence', initial_odometer: 10000, tank_capacity: 50,
    })
    await localRequest(
      'POST',
      '/fuel-entries/',
      {
        vehicle_id: 1, fuel_type: 'essence', liters: 40, price_per_liter: 1.6,
        odometer_reading: 10500, fueling_date: '2026-01-01', is_full_tank: true,
      },
    )
    const page = await localRequest<{ entries: unknown[]; total: number; pages: number }>(
      'GET',
      '/fuel-entries/?per_page=500',
    )
    expect(page.total).toBe(1)
    expect(page.pages).toBe(1)
    expect(page.entries).toHaveLength(1)
  })

  it('POST /fuel-entries/?allow_odometer_decrease=true honours the query flag', async () => {
    await svc.createVehicle({
      brand: 'Peugeot', model: '208', year: 2019, license_plate: 'AB-123-CD',
      fuel_type: 'essence', initial_odometer: 10000, tank_capacity: 50,
    })
    await localRequest('POST', '/fuel-entries/', {
      vehicle_id: 1, fuel_type: 'essence', liters: 40, price_per_liter: 1.6,
      odometer_reading: 10500, fueling_date: '2026-01-01', is_full_tank: true,
    })
    // Below the latest — rejected without the flag…
    await expect(
      localRequest('POST', '/fuel-entries/', {
        vehicle_id: 1, fuel_type: 'essence', liters: 10, price_per_liter: 1.6,
        odometer_reading: 10400, fueling_date: '2026-01-05', is_full_tank: false,
      }),
    ).rejects.toMatchObject({ status: 422 })
    // …accepted with it
    const e = await localRequest<{ id: number }>(
      'POST',
      '/fuel-entries/?allow_odometer_decrease=true',
      {
        vehicle_id: 1, fuel_type: 'essence', liters: 10, price_per_liter: 1.6,
        odometer_reading: 10400, fueling_date: '2026-01-05', is_full_tank: false,
      },
    )
    expect(e.id).toBeGreaterThan(0)
  })

  it('unknown local route → 404', async () => {
    await expect(localRequest('GET', '/does-not-exist/')).rejects.toMatchObject({
      status: 404,
    })
  })

  it('GET /flexfuel/vehicles/1/conversion → 404 without a conversion', async () => {
    await svc.createVehicle({
      brand: 'Peugeot', model: '208', year: 2019, license_plate: 'AB-123-CD',
      fuel_type: 'essence', initial_odometer: 10000, tank_capacity: 50,
    })
    await expect(
      localRequest('GET', '/flexfuel/vehicles/1/conversion'),
    ).rejects.toMatchObject({ status: 404 })
  })

  // Regression: the per-vehicle sub-routes (s[1] = 'vehicle') used to be
  // nested inside the numeric entry-id guard, so they 404'd and every screen
  // reading them (BlendCalculator, charts, à la pompe) spun forever.
  it('serves the per-vehicle fuel-entry sub-routes (not 404)', async () => {
    await svc.createVehicle({
      brand: 'Peugeot', model: '208', year: 2019, license_plate: 'AB-123-CD',
      fuel_type: 'essence', initial_odometer: 10000, tank_capacity: 50,
    })
    await localRequest('POST', '/fuel-entries/', {
      vehicle_id: 1, fuel_type: 'essence', liters: 40, price_per_liter: 1.6,
      odometer_reading: 10500, fueling_date: '2026-01-01', is_full_tank: true,
      station_name: 'Total Ville',
    })
    const list = await localRequest<unknown[]>('GET', '/fuel-entries/vehicle/1?per_page=500')
    expect(Array.isArray(list)).toBe(true)
    expect(list).toHaveLength(1)
    const latest = await localRequest<{ odometer_reading: number }>(
      'GET', '/fuel-entries/vehicle/1/latest',
    )
    expect(latest.odometer_reading).toBe(10500)
    const stats = await localRequest<{ total_entries: number }>(
      'GET', '/fuel-entries/vehicle/1/statistics',
    )
    expect(stats.total_entries).toBe(1)
    const history = await localRequest<{ vehicle_id: number; data_points: unknown[] }>(
      'GET', '/fuel-entries/vehicle/1/consumption-history',
    )
    expect(history.vehicle_id).toBe(1)
    expect(Array.isArray(history.data_points)).toBe(true)
    const stations = await localRequest<string[]>('GET', '/fuel-entries/stations')
    expect(stations).toContain('Total Ville')
  })
})
