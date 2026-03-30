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

interface InsuranceKmChartProps {
  vehicle: Vehicle
  entries: FuelEntry[]   // must be allEntries (unfiltered)
}

type ChartPoint = {
  month: string
  odomActual?: number
  odomProj?: number
}

export function InsuranceKmChart({ vehicle, entries }: InsuranceKmChartProps) {
  // Use backend-computed values as authoritative source
  const { data: stats } = useVehicleStats(vehicle.id)

  const result = useMemo(() => {
    if (!vehicle.insurance_km_limit || entries.length === 0) return null

    const limit = stats?.current_insurance_km_limit ?? vehicle.insurance_km_limit
    const remaining = stats?.insurance_km_remaining ?? null
    const isExceeded = stats?.insurance_km_exceeded ?? false

    // Group entries by month, max odometer per month
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

    // Average km/month from last 3 months (consecutive diffs)
    const diffs: number[] = []
    for (let i = Math.max(1, sortedMonths.length - 3); i < sortedMonths.length; i++) {
      const diff = sortedMonths[i][1] - sortedMonths[i - 1][1]
      if (diff > 0) diffs.push(diff)
    }
    const avgMonthlyKm = diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0

    // Project forward until odometer reaches limit (cap at 36 months)
    const projectedPoints: ChartPoint[] = []
    const lastKey = sortedMonths[sortedMonths.length - 1][0]
    const [ly, lm] = lastKey.split('-').map(Number)

    if (avgMonthlyKm > 0 && lastOdometer < limit) {
      for (let i = 1; i <= 36; i++) {
        const proj = Math.round(lastOdometer + i * avgMonthlyKm)
        const date = new Date(ly, lm - 1 + i, 1)
        projectedPoints.push({
          month: date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
          odomProj: proj,
        })
        if (proj >= limit) break
      }
    }

    // Bridge: last actual point also carries odomProj so the two lines connect
    if (projectedPoints.length > 0) {
      actualPoints[actualPoints.length - 1].odomProj = lastOdometer
    }

    // Projected months until limit
    const monthsUntilLimit =
      avgMonthlyKm > 0 && remaining != null && remaining > 0
        ? Math.ceil(remaining / avgMonthlyKm)
        : null

    // Y-axis domain: don't start at 0, frame around the interesting range
    const allOdom = [
      ...actualPoints.map((p) => p.odomActual ?? Infinity),
      ...projectedPoints.map((p) => p.odomProj ?? -Infinity),
      limit,
    ]
    const minOdom = Math.min(...allOdom.filter((v) => v !== Infinity && v !== -Infinity))
    const maxOdom = Math.max(...allOdom.filter((v) => v !== -Infinity && v !== Infinity))
    const padding = Math.max(1000, (maxOdom - minOdom) * 0.1)
    const yMin = Math.floor((minOdom - padding) / 1000) * 1000
    const yMax = Math.ceil((maxOdom + padding) / 1000) * 1000

    return {
      chartData: [...actualPoints, ...projectedPoints],
      limit,
      remaining,
      isExceeded,
      isClose: remaining != null && remaining >= 0 && remaining < limit * 0.1,
      monthsUntilLimit,
      yMin,
      yMax,
    }
  }, [vehicle, entries, stats])

  if (!result) return null

  const { chartData, limit, remaining, isExceeded, isClose, monthsUntilLimit, yMin, yMax } = result

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Kilométrage assurance</CardTitle>
            <p className="text-sm font-normal text-muted-foreground">
              Limite : {Math.round(limit).toLocaleString('fr-FR')} km
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isExceeded ? (
              <Badge className="border-0 bg-red-100 text-red-700">
                Dépassé de {Math.abs(Math.round(remaining!)).toLocaleString('fr-FR')} km
              </Badge>
            ) : isClose ? (
              <Badge className="border-0 bg-orange-100 text-orange-700">
                {Math.round(remaining!).toLocaleString('fr-FR')} km restants
              </Badge>
            ) : remaining != null ? (
              <Badge variant="outline">
                {Math.round(remaining).toLocaleString('fr-FR')} km restants
              </Badge>
            ) : null}
            {monthsUntilLimit != null && !isExceeded && (
              <Badge className="border-0 bg-muted text-muted-foreground">
                Limite dans ~{monthsUntilLimit} mois
              </Badge>
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
