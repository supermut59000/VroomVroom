import { describe, it, expect } from 'vitest'
import {
  computeAvgConsumption,
  computeTankState,
  computeThresholds,
  computeWinterRec,
  e85EthanolFraction,
  fuelEthanolFraction,
  simulateFutureFills,
} from './blend-math'
import type { FuelEntry } from '@/types'

// Minimal FuelEntry factory — only the fields blend-math reads.
let autoId = 0
function entry(partial: Partial<FuelEntry>): FuelEntry {
  return {
    id: ++autoId,
    vehicle_id: 1,
    fuel_type: 'e85',
    liters: 40,
    price_per_liter: 0.85,
    total_cost: 34,
    odometer_reading: 10000,
    fueling_date: '2026-01-01',
    is_full_tank: true,
    station_name: null,
    location: null,
    latitude: null,
    longitude: null,
    notes: null,
    created_at: '2026-01-01T00:00:00',
    updated_at: null,
    ...partial,
  } as FuelEntry
}

const CONVERSION = '2026-01-01'

describe('seasonal ethanol defaults', () => {
  it('uses the conservative seasonal maximum for E85', () => {
    expect(e85EthanolFraction('2026-03-15')).toBe(0.75)
    expect(e85EthanolFraction('2026-03-16')).toBe(0.85)
    expect(e85EthanolFraction('2026-10-30')).toBe(0.85)
    expect(e85EthanolFraction('2026-10-31')).toBe(0.75)
  })

  it('distinguishes SP98-E5 from E10', () => {
    expect(fuelEthanolFraction('essence', '2026-07-01')).toBe(0.1)
    expect(fuelEthanolFraction('sp98', '2026-07-01')).toBe(0.05)
  })
})

describe('computeThresholds', () => {
  it('pure-E85 tank (ethFraction exactly 0.85) is a dilute-now, not a crash', () => {
    // Regression: this singularity used to return {odoB: null, odoBNow: false}
    // and the renderer force-unwrapped odoB → app-level crash.
    const t = computeThresholds(30, 0.85, 50, 77, 5, 0.1, 7.9, 10000)
    expect(t.odoBNow).toBe(true)
    expect(t.odoA).toBeNull()
    expect(t.odoB).toBeNull()
  })

  it('never returns odoBNow=false with odoB=null (renderer contract)', () => {
    // Sweep ethanol fractions across the whole range incl. boundaries
    for (let f = 0; f <= 1.0001; f += 0.01) {
      const t = computeThresholds(30, f, 50, 77, 5, 0.1, 7.9, 10000)
      if (!t.odoBNow) expect(t.odoB).not.toBeNull()
    }
  })

  it('computes both km landmarks for a normal mid-range tank', () => {
    const t = computeThresholds(30, 0.7, 50, 77, 5, 0.1, 7.9, 10000)
    expect(t.odoA).toBeGreaterThan(10000)
    expect(t.odoBNow || (t.odoB !== null && t.odoB > 10000)).toBe(true)
  })

  it('does not recommend dilution when winter E85 is below the maximum target', () => {
    const t = computeThresholds(30, 0.7, 50, 77, 5, 0.1, 7.9, 10000, 0.75)
    expect(t.pureE85AlwaysSafe).toBe(true)
    expect(t.odoBNow).toBe(false)
  })
})

describe('computeAvgConsumption', () => {
  it('is distance-weighted, not a mean of per-segment values', () => {
    const entries = [
      entry({ odometer_reading: 10000, liters: 40, fueling_date: '2026-01-01' }),
      // 8 L/100 over 100 km
      entry({ odometer_reading: 10100, liters: 8, fueling_date: '2026-01-05' }),
      // 6 L/100 over 600 km
      entry({ odometer_reading: 10700, liters: 36, fueling_date: '2026-01-20' }),
    ]
    // Weighted: (8 + 36) × 100 / 700 = 6.2857 — a simple mean would say 7.0
    expect(computeAvgConsumption(entries, CONVERSION)).toBeCloseTo(6.2857, 3)
  })

  it('folds a same-stop booster into the closing full segment regardless of id order', () => {
    const entries = [
      entry({ id: 1, odometer_reading: 10000, liters: 40, fueling_date: '2026-01-01', is_full_tank: true }),
      // Same stop at 10500: full E85 logged BEFORE the essence booster (lower id).
      // The is_full_tank ASC tiebreaker must still put the booster inside the segment.
      entry({ id: 2, odometer_reading: 10500, liters: 40, fueling_date: '2026-01-10', is_full_tank: true, fuel_type: 'e85' }),
      entry({ id: 3, odometer_reading: 10500, liters: 5, fueling_date: '2026-01-10', is_full_tank: false, fuel_type: 'essence' }),
    ]
    // (40 + 5) × 100 / 500 = 9.0 — the old (date, id) sort computed 8.0 and
    // leaked the booster into the next segment
    expect(computeAvgConsumption(entries, CONVERSION)).toBeCloseTo(9.0, 5)
  })

  it('anchors at the first full tank — a leading partial cannot open a segment', () => {
    const entries = [
      entry({ odometer_reading: 10000, liters: 15, fueling_date: '2026-01-01', is_full_tank: false }),
      entry({ odometer_reading: 10200, liters: 30, fueling_date: '2026-01-05', is_full_tank: true }),
      entry({ odometer_reading: 10700, liters: 35, fueling_date: '2026-01-20', is_full_tank: true }),
    ]
    // Only one valid segment: 35 L / 500 km = 7.0
    expect(computeAvgConsumption(entries, CONVERSION)).toBeCloseTo(7.0, 5)
  })

  it('returns null with fewer than two full tanks', () => {
    expect(computeAvgConsumption([entry({})], CONVERSION)).toBeNull()
    expect(computeAvgConsumption([], CONVERSION)).toBeNull()
  })
})

describe('computeTankState', () => {
  it('merges same-stop entries into one composition', () => {
    // Summer fill: 40 L E85 (85%) + 10 L E10 (10%).
    const entries = [
      entry({ odometer_reading: 1000, liters: 40, fueling_date: '2026-07-02', is_full_tank: true, fuel_type: 'e85' }),
      entry({ odometer_reading: 1000, liters: 10, fueling_date: '2026-07-02', is_full_tank: false, fuel_type: 'essence' }),
    ]
    const state = computeTankState(entries, CONVERSION, 50)
    expect(state.litersInTank).toBe(50)
    expect(state.ethanolLiters).toBeCloseTo(35, 5)
    expect(state.lastOdo).toBe(1000)
  })

  it('uses winter E85 and SP98 composition automatically', () => {
    const entries = [
      entry({ odometer_reading: 1000, liters: 40, fueling_date: '2026-01-02', is_full_tank: true, fuel_type: 'e85' }),
      entry({ odometer_reading: 1000, liters: 10, fueling_date: '2026-01-02', is_full_tank: false, fuel_type: 'sp98' }),
    ]
    const state = computeTankState(entries, CONVERSION, 50)
    // 40×0.75 + 10×0.05 = 30.5 L ethanol.
    expect(state.ethanolLiters).toBeCloseTo(30.5, 5)
  })

  it('mixes remaining old fuel with the new fill on later stops', () => {
    const entries = [
      // Stop 1: tank at 70% ethanol (see previous test)
      entry({ odometer_reading: 1000, liters: 40, fueling_date: '2026-07-02', is_full_tank: true, fuel_type: 'e85' }),
      entry({ odometer_reading: 1000, liters: 10, fueling_date: '2026-07-02', is_full_tank: false, fuel_type: 'essence' }),
      // Stop 2: 14 L E85 tops the tank back up → 36 L of old 70% fuel remain
      entry({ odometer_reading: 1500, liters: 14, fueling_date: '2026-07-15', is_full_tank: true, fuel_type: 'e85' }),
    ]
    const state = computeTankState(entries, CONVERSION, 50)
    // 0.70 × 36 + 14 × 0.85 = 25.2 + 11.9 = 37.1 L ethanol
    expect(state.ethanolLiters).toBeCloseTo(37.1, 5)
    expect(state.lastOdo).toBe(1500)
  })

  it('assumes full displacement when more than a tank was added between fulls', () => {
    const entries = [
      entry({ odometer_reading: 1000, liters: 45, fueling_date: '2026-07-02', is_full_tank: true, fuel_type: 'essence' }),
      // 52 L pumped since the last Plein (> 50 L capacity) → old fuel gone
      entry({ odometer_reading: 1800, liters: 30, fueling_date: '2026-07-10', is_full_tank: false, fuel_type: 'e85' }),
      entry({ odometer_reading: 2600, liters: 22, fueling_date: '2026-07-20', is_full_tank: true, fuel_type: 'e85' }),
    ]
    const state = computeTankState(entries, CONVERSION, 50)
    // Composition = added composition: pure E85 → 0.85 × 50
    expect(state.ethanolLiters).toBeCloseTo(42.5, 5)
  })
})

describe('simulateFutureFills', () => {
  it('accumulates per-row interval overrides into the odometer column', () => {
    // Regression: odo used to be fromOdo + (i+1) × current interval, which
    // broke as soon as the −50/+50 buttons made intervals non-uniform.
    const fills = simulateFutureFills(45, 31.5, 10000, [300, 400, 300, 300], 50, 7.9, 77, 5, 0.1)
    expect(fills.map((f) => f.odo)).toEqual([10300, 10700, 11000, 11300])
  })

  it('keeps ethanol within tolerance across simulated fills', () => {
    const fills = simulateFutureFills(45, 31.5, 10000, [300, 300, 300, 300], 50, 7.9, 77, 5, 0.1)
    for (const f of fills) {
      expect(f.resultPct).toBeGreaterThan(0)
      expect(f.resultPct).toBeLessThanOrEqual(85)
    }
  })
})

describe('computeWinterRec', () => {
  it('recommends a blend with at least the pump minimum of dilutant', () => {
    // 26 L of 80% ethanol left in a 50 L tank, target 70% ±5
    const rec = computeWinterRec(26, 20.8, 50, 70, 5, 0.1, 7.9, 10000)
    expect(rec.type).toBe('blend')
    if (rec.type === 'blend') {
      expect(rec.dilutantLiters).toBeGreaterThanOrEqual(5)
      expect(rec.resultPct).toBeLessThanOrEqual(75 + 0.5)
    }
  })

  it('recommends pure E85 when the result stays under target+tolerance', () => {
    // Nearly empty tank at low ethanol → a full E85 fill lands ≤ 82%
    const rec = computeWinterRec(5, 1, 50, 77, 5, 0.1, 7.9, 10000)
    expect(rec.type).toBe('pure_e85')
  })

  it('uses winter-grade E85 for the recommendation', () => {
    const rec = computeWinterRec(20, 14, 50, 77, 5, 0.1, 7.9, 10000, 0.75)
    expect(rec.type).toBe('pure_e85')
    if (rec.type === 'pure_e85') expect(rec.resultPct).toBeLessThanOrEqual(75)
  })

  it('says tank_full when less than the pump minimum fits', () => {
    const rec = computeWinterRec(47, 33, 50, 77, 5, 0.1, 7.9, 10000)
    expect(rec.type).toBe('tank_full')
  })
})
