import type { FuelEntry } from '@/types'

export function shouldFetchIndividualStats(
  batch: Record<string, unknown> | undefined,
  vehicleId: number | null,
): boolean {
  return vehicleId !== null && (!batch || !(String(vehicleId) in batch))
}

export interface MonthlyKmPoint {
  monthKey: string
  km: number
}

/** All month keys between `from` and `to` inclusive (YYYY-MM). */
function monthsBetween(from: string, to: string): string[] {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  const out: string[] = []
  let y = fy
  let m = fm
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

/**
 * Distance per logged month (max odometer per month, diff between consecutive
 * logged months). With spreadGaps (default) the km of a pair of non-adjacent
 * logged months is spread uniformly across the skipped months, so a logging
 * gap doesn't create a fake spike on the resuming month. This is the single
 * implementation used by DistanceChart, MonthlyCostChart and OdometerChart —
 * they used to each have their own copy and drifted apart.
 */
export function monthlyKmSeries(
  entries: Pick<FuelEntry, 'fueling_date' | 'odometer_reading'>[],
  spreadGaps = true,
): MonthlyKmPoint[] {
  if (entries.length < 2) return []
  const sorted = [...entries].sort((a, b) => a.fueling_date.localeCompare(b.fueling_date))

  const monthMap = new Map<string, number>()
  for (const e of sorted) {
    const key = e.fueling_date.slice(0, 7)
    monthMap.set(key, Math.max(monthMap.get(key) ?? 0, e.odometer_reading))
  }
  const months = Array.from(monthMap.entries()).sort(([a], [b]) => a.localeCompare(b))

  const points: MonthlyKmPoint[] = []
  for (let i = 1; i < months.length; i++) {
    const total = months[i][1] - months[i - 1][1]
    if (total <= 0) continue
    if (spreadGaps) {
      const span = monthsBetween(months[i - 1][0], months[i][0]).slice(1) // exclude prev month
      for (const key of span) points.push({ monthKey: key, km: total / span.length })
    } else {
      points.push({ monthKey: months[i][0], km: total })
    }
  }
  return points
}

export interface AvgKmPerMonthOptions {
  spreadGaps?: boolean
  /** Drop the current (partial) month from the average; falls back to all months if none completed. */
  excludeCurrentMonth?: boolean
  /** Average only the last N month-points (e.g. 3 for projections). */
  lastMonths?: number
}

/** Mean km/month over the monthly km series (null when there is no usable data). */
export function avgKmPerMonth(
  entries: Pick<FuelEntry, 'fueling_date' | 'odometer_reading'>[],
  options: AvgKmPerMonthOptions = {},
): number | null {
  const { spreadGaps = true, excludeCurrentMonth = true, lastMonths } = options
  let points = monthlyKmSeries(entries, spreadGaps)

  if (excludeCurrentMonth) {
    const now = new Date()
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const completed = points.filter((p) => p.monthKey < currentKey)
    if (completed.length > 0) points = completed
  }
  if (lastMonths != null) points = points.slice(-lastMonths)

  if (points.length === 0) return null
  return points.reduce((s, p) => s + p.km, 0) / points.length
}
