import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useVehicleStats } from '@/hooks/use-vehicles'
import type { FuelEntry, Vehicle } from '@/types'

interface OdometerChartProps {
  vehicle: Vehicle
  entries: FuelEntry[]  // must be allEntries (unfiltered)
}

type ChartPoint = {
  month: string
  odomActual?: number
  odomProj?: number
}

export function OdometerChart({ vehicle, entries }: OdometerChartProps) {
  const { data: stats } = useVehicleStats(vehicle.id)

  const currentMonthKey = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const result = useMemo(() => {
    if (entries.length === 0) return null

    // Max odometer per month
    const monthMap = new Map<string, number>()
    for (const e of entries) {
      const key = e.fueling_date.slice(0, 7)
      monthMap.set(key, Math.max(monthMap.get(key) ?? 0, e.odometer_reading))
    }

    const sortedMonths = Array.from(monthMap.entries()).sort(([a], [b]) => a.localeCompare(b))
    if (sortedMonths.length === 0) return null

    const actualPoints: ChartPoint[] = sortedMonths.map(([key, odometer]) => {
      const [y, m] = key.split('-').map(Number)
      return {
        month: new Date(y, m - 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
        odomActual: odometer,
      }
    })

    const lastOdometer = sortedMonths[sortedMonths.length - 1][1]
    const lastKey = sortedMonths[sortedMonths.length - 1][0]
    const [ly, lm] = lastKey.split('-').map(Number)

    // Consecutive month diffs — same method as DistanceChart
    const allDiffs: { monthKey: string; diff: number }[] = []
    for (let i = 1; i < sortedMonths.length; i++) {
      const diff = sortedMonths[i][1] - sortedMonths[i - 1][1]
      if (diff > 0) allDiffs.push({ monthKey: sortedMonths[i][0], diff })
    }

    // Avg from last 3 completed months only (exclude current partial month)
    const completedDiffs = allDiffs.filter((d) => d.monthKey < currentMonthKey)
    const base = completedDiffs.length > 0 ? completedDiffs : allDiffs
    const last3 = base.slice(-Math.min(3, base.length))
    const avgMonthlyKm =
      last3.length > 0 ? last3.reduce((s, d) => s + d.diff, 0) / last3.length : 0

    // Insurance limit (authoritative from backend stats, skipped when unlimited)
    const limit =
      !vehicle.insurance_unlimited && stats?.current_insurance_km_limit != null
        ? stats.current_insurance_km_limit
        : null

    // Project forward — extend until limit is hit or 36 months (cap at 12 if no limit)
    const projectedPoints: ChartPoint[] = []
    let monthsUntilLimit: number | null = null

    if (avgMonthlyKm > 0) {
      const maxMonths = limit != null ? 36 : 12
      for (let i = 1; i <= maxMonths; i++) {
        const proj = Math.round(lastOdometer + i * avgMonthlyKm)
        const date = new Date(ly, lm - 1 + i, 1)
        projectedPoints.push({
          month: date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
          odomProj: proj,
        })
        if (limit != null && proj >= limit) {
          monthsUntilLimit = i
          break
        }
      }
    }

    // Bridge: last actual point also carries odomProj so the lines connect
    if (projectedPoints.length > 0) {
      actualPoints[actualPoints.length - 1].odomProj = lastOdometer
    }

    // Y-axis domain — include limit in range if present
    const allOdom = [
      ...actualPoints.map((p) => p.odomActual ?? Infinity),
      ...projectedPoints.map((p) => p.odomProj ?? -Infinity),
      ...(limit != null ? [limit] : []),
    ].filter((v) => v !== Infinity && v !== -Infinity)
    const minOdom = Math.min(...allOdom)
    const maxOdom = Math.max(...allOdom)
    const padding = Math.max(1000, (maxOdom - minOdom) * 0.1)
    const yMin = Math.floor((minOdom - padding) / 1000) * 1000
    const yMax = Math.ceil((maxOdom + padding) / 1000) * 1000

    const projectedAnnualKm = avgMonthlyKm > 0 ? Math.round(avgMonthlyKm * 12) : null

    return {
      chartData: [...actualPoints, ...projectedPoints],
      projectedAnnualKm,
      limit,
      remaining: stats?.insurance_km_remaining ?? null,
      isExceeded: stats?.insurance_km_exceeded ?? false,
      monthsUntilLimit,
      yMin,
      yMax,
    }
  }, [entries, currentMonthKey, vehicle, stats])

  if (!result) return null
  const { chartData, projectedAnnualKm, limit, remaining, isExceeded, monthsUntilLimit, yMin, yMax } = result

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Progression kilométrique</CardTitle>
            {limit != null && (
              <p className="text-sm font-normal text-muted-foreground">
                Limite : {Math.round(limit).toLocaleString('fr-FR')} km
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {projectedAnnualKm != null && (
              <Badge variant="outline">
                ~{projectedAnnualKm.toLocaleString('fr-FR')} km/an projeté
              </Badge>
            )}
            {limit != null && (
              isExceeded ? (
                <Badge className="border-0 bg-red-100 text-red-700">
                  Dépassé de {Math.abs(Math.round(remaining!)).toLocaleString('fr-FR')} km
                </Badge>
              ) : monthsUntilLimit != null ? (
                <Badge className="border-0 bg-orange-100 text-orange-700">
                  Limite dans ~{monthsUntilLimit} mois
                </Badge>
              ) : remaining != null ? (
                <Badge variant="outline">
                  {Math.round(remaining).toLocaleString('fr-FR')} km restants
                </Badge>
              ) : null
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ left: 10, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              unit=" km"
              domain={[yMin, yMax]}
              tickFormatter={(v) => v.toLocaleString('fr-FR')}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                `${Math.round(value).toLocaleString('fr-FR')} km`,
                name === 'odomActual' ? 'Compteur' : 'Projection',
              ]}
            />
            {limit != null && (
              <ReferenceLine
                y={limit}
                stroke="hsl(0, 72%, 51%)"
                strokeDasharray="5 5"
                label={{
                  value: `Limite ${Math.round(limit).toLocaleString('fr-FR')} km`,
                  position: 'insideTopRight',
                  fontSize: 10,
                  fill: 'hsl(0, 72%, 51%)',
                }}
              />
            )}
            <Line
              type="monotone"
              dataKey="odomActual"
              stroke="hsl(217, 91%, 60%)"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              name="odomActual"
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="odomProj"
              stroke="hsl(217, 91%, 60%)"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              name="odomProj"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
