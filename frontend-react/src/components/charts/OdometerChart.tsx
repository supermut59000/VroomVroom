import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { FuelEntry } from '@/types'

interface OdometerChartProps {
  entries: FuelEntry[]  // must be allEntries (unfiltered)
}

type ChartPoint = {
  month: string
  odomActual?: number
  odomProj?: number
}

export function OdometerChart({ entries }: OdometerChartProps) {
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

    // Project 12 months forward
    const projectedPoints: ChartPoint[] = []
    if (avgMonthlyKm > 0) {
      for (let i = 1; i <= 12; i++) {
        const proj = Math.round(lastOdometer + i * avgMonthlyKm)
        const date = new Date(ly, lm - 1 + i, 1)
        projectedPoints.push({
          month: date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
          odomProj: proj,
        })
      }
    }

    // Bridge: last actual point also carries odomProj so the lines connect
    if (projectedPoints.length > 0) {
      actualPoints[actualPoints.length - 1].odomProj = lastOdometer
    }

    // Y-axis domain framed around the data range
    const allOdom = [
      ...actualPoints.map((p) => p.odomActual ?? Infinity),
      ...projectedPoints.map((p) => p.odomProj ?? -Infinity),
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
      yMin,
      yMax,
    }
  }, [entries, currentMonthKey])

  if (!result) return null
  const { chartData, projectedAnnualKm, yMin, yMax } = result

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-base">Progression kilométrique</CardTitle>
          {projectedAnnualKm != null && (
            <Badge variant="outline">
              ~{projectedAnnualKm.toLocaleString('fr-FR')} km/an projeté
            </Badge>
          )}
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
