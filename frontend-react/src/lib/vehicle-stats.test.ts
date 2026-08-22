import { describe, expect, it } from 'vitest'
import { avgKmPerMonth, monthlyKmSeries, shouldFetchIndividualStats } from './vehicle-stats'

describe('shouldFetchIndividualStats', () => {
  it('falls back when the batch omitted this vehicle', () => {
    expect(shouldFetchIndividualStats({ '1': {} }, 2)).toBe(true)
    expect(shouldFetchIndividualStats({ '2': {} }, 2)).toBe(false)
  })
})

const e = (fueling_date: string, odometer_reading: number) => ({ fueling_date, odometer_reading })

describe('monthlyKmSeries', () => {
  it('diffs consecutive logged months', () => {
    const series = monthlyKmSeries([e('2025-01-10', 10000), e('2025-02-10', 10200)])
    expect(series).toEqual([{ monthKey: '2025-02', km: 200 }])
  })

  it('spreads gap months uniformly (never a fake spike on the resuming month)', () => {
    // Jan @1000, Feb @2000, May @5000, Jun @6000 — Mar+Apr skipped
    const series = monthlyKmSeries([
      e('2025-01-05', 1000),
      e('2025-02-05', 2000),
      e('2025-05-05', 5000),
      e('2025-06-05', 6000),
    ])
    expect(series.map((p) => p.km)).toEqual([1000, 1000, 1000, 1000, 1000])
    expect(series.map((p) => p.monthKey)).toEqual(['2025-02', '2025-03', '2025-04', '2025-05', '2025-06'])
  })

  it('skips non-increasing pairs without spreading', () => {
    const series = monthlyKmSeries([e('2025-01-05', 1000), e('2025-02-05', 1000), e('2025-03-05', 1300)])
    expect(series).toEqual([{ monthKey: '2025-03', km: 300 }])
  })
})

describe('avgKmPerMonth', () => {
  it('returns null with fewer than two entries', () => {
    expect(avgKmPerMonth([e('2025-01-05', 1000)])).toBeNull()
    expect(avgKmPerMonth([])).toBeNull()
  })

  it('is the mean over spread months — not the raw mean of the two logged diffs', () => {
    const entries = [
      e('2025-01-05', 1000),
      e('2025-02-05', 2000),
      e('2025-05-05', 5000),
      e('2025-06-05', 6000),
    ]
    // Spread: every month 1000 → avg 1000. Raw diffs would give 1667 (+67%).
    expect(avgKmPerMonth(entries, { excludeCurrentMonth: false })).toBe(1000)
  })
})
