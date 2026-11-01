import { describe, it, expect } from 'vitest'
import { buildBlendPayloads } from '@/lib/pump-fill'
import type { PumpFillForm } from '@/lib/pump-fill'
import type { WinterRec } from '@/lib/blend-math'

const form: PumpFillForm = {
  vehicleId: 1,
  date: '2026-11-15',
  odometer: 42000,
  dilutantType: 'e10',
  dilutantLiters: 5,
  e85Liters: 40,
  dilutantPrice: 1.6,
  e85Price: 0.85,
  stationName: 'Total Test',
  location: 'Lyon',
  latitude: 45.75,
  longitude: 4.85,
}

const blend: WinterRec = {
  type: 'blend',
  dilutantLiters: 5,
  e85Liters: 40,
  resultPct: 77,
  withinTolerance: true,
}

describe('buildBlendPayloads', () => {
  it('blend → Partiel diluant + Plein E85 at the same stop, distinct client_request_ids', () => {
    const p = buildBlendPayloads(blend, form)
    expect(p).toHaveLength(2)
    // E10 diluent is recorded as 'essence' (the app's SP95-E10 option)
    expect(p[0].fuel_type).toBe('essence')
    expect(p[0].is_full_tank).toBe(false)
    expect(p[0].liters).toBe(5)
    expect(p[0].price_per_liter).toBe(1.6)
    expect(p[1].fuel_type).toBe('e85')
    expect(p[1].is_full_tank).toBe(true)
    expect(p[1].liters).toBe(40)
    expect(p[1].price_per_liter).toBe(0.85)
    for (const e of p) {
      expect(e.fueling_date).toBe('2026-11-15')
      expect(e.odometer_reading).toBe(42000)
      expect(e.vehicle_id).toBe(1)
      expect(e.station_name).toBe('Total Test')
      expect(e.latitude).toBe(45.75)
      expect(e.client_request_id).toBeTruthy()
    }
    expect(p[0].client_request_id).not.toBe(p[1].client_request_id)
  })

  it('pure E85 → a single Plein entry', () => {
    const p = buildBlendPayloads(
      { type: 'pure_e85', e85Liters: 45, resultPct: 81, kmSafe: null, kmRelative: null },
      form,
    )
    expect(p).toHaveLength(1)
    expect(p[0].fuel_type).toBe('e85')
    expect(p[0].is_full_tank).toBe(true)
  })

  it('tank_full → no entry', () => {
    expect(buildBlendPayloads({ type: 'tank_full', currentPct: 80 }, form)).toEqual([])
  })

  it('sp98 diluent maps to fuel_type sp98', () => {
    const p = buildBlendPayloads(blend, { ...form, dilutantType: 'sp98' })
    expect(p[0].fuel_type).toBe('sp98')
  })

  it('user skipped step 1 (0 dilutant liters) → E85 entry only', () => {
    const p = buildBlendPayloads(blend, { ...form, dilutantLiters: 0 })
    expect(p).toHaveLength(1)
    expect(p[0].fuel_type).toBe('e85')
  })
})
