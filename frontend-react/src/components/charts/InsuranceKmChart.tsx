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
import type { FuelEntry, Vehicle } from '@/types'

interface InsuranceKmChartProps {
  vehicle: Vehicle
  entries: FuelEntry[]
}

type ChartPoint = {
  month: string
  monthKey: string
  kmActual?: number
  kmProj?: number
}

export function InsuranceKmChart({ vehicle, entries }: InsuranceKmChartProps) {
  const result = useMemo(() => {
    const limit = vehicle.insurance_km_limit
    if (!limit || entries.length === 0) return null

    const now = new Date()

    // Determine the start of the current insurance year
    let start: Date
    if (vehicle.insurance_km_start_date) {
      start = new Date(vehicle.insurance_km_start_date)
      // Advance year-by-year until we're in the current running year
      while (new Date(start.getFullYear() + 1, start.getMonth(), start.getDate()) <= now) {
        start = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate())
      }
    } else {
      start = new Date(now.getFullYear(), 0, 1)
    }

    const yearEnd = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate())
    const startStr = start.toISOString().split('T')[0]

    // Base odometer: last entry before start date, or vehicle initial_odometer
    const entriesBefore = entries
      .filter((e) => e.fueling_date < startStr)
      .sort((a, b) => b.fueling_date.localeCompare(a.fueling_date))
    const baseOdometer =
      entriesBefore.length > 0 ? entriesBefore[0].odometer_reading : vehicle.initial_odometer

    // Entries in the current insurance year
    const yearEntries = entries.filter((e) => e.fueling_date >= startStr)

    if (yearEntries.length === 0) return null

    // Max odometer per month
    const monthMap = new Map<string, number>()
    for (const e of yearEntries) {
      const key = e.fueling_date.slice(0, 7)
      monthMap.set(key, Math.max(monthMap.get(key) ?? 0, e.odometer_reading))
    }

    const sortedMonths = Array.from(monthMap.entries()).sort(([a], [b]) => a.localeCompare(b))

    const actualPoints: ChartPoint[] = sortedMonths.map(([key, odometer]) => {
      const [y, m] = key.split('-').map(Number)
      return {
        month: new Date(y, m - 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
        monthKey: key,
        kmActual: Math.max(0, odometer - baseOdometer),
      }
    })

    if (actualPoints.length === 0) return null

    const currentKm = actualPoints[actualPoints.length - 1].kmActual!
    const monthsWithData = actualPoints.length
    const avgMonthlyKm = currentKm / monthsWithData

    // Total months in insurance year
    const totalMonths = Math.round(
      (yearEnd.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
    )
    const monthsRemaining = Math.max(0, totalMonths - monthsWithData)
    const projectedTotal = Math.round(currentKm + avgMonthlyKm * monthsRemaining)

    // Build projected points
    const lastKey = actualPoints[actualPoints.length - 1].monthKey
    const [ly, lm] = lastKey.split('-').map(Number)

    const projectedPoints: ChartPoint[] = Array.from({ length: monthsRemaining }, (_, i) => {
      const date = new Date(ly, lm - 1 + i + 1, 1)
      return {
        month: date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
        monthKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        kmProj: Math.round(currentKm + avgMonthlyKm * (i + 1)),
      }
    })

    // Bridge: last actual point also carries kmProj so the two lines connect
    if (projectedPoints.length > 0) {
      actualPoints[actualPoints.length - 1].kmProj = currentKm
    }

    const remaining = limit - currentKm
    const isExceeded = remaining < 0
    const isClose = remaining >= 0 && remaining < limit * 0.1

    return {
      chartData: [...actualPoints, ...projectedPoints],
      limit,
      currentKm,
      remaining,
      projectedTotal,
      isExceeded,
      isClose,
      startYear: start.getFullYear(),
    }
  }, [vehicle, entries])

  if (!result) return null

  const { chartData, limit, remaining, projectedTotal, isExceeded, isClose } = result

  // Y-axis ceiling: slightly above limit or projected total whichever is higher
  const yMax = Math.ceil(Math.max(limit, projectedTotal) * 1.08 / 1000) * 1000

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Kilométrage assurance</CardTitle>
            <p className="text-sm font-normal text-muted-foreground">
              Limite : {limit.toLocaleString('fr-FR')} km/an
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isExceeded ? (
              <Badge className="border-0 bg-red-100 text-red-700">
                Dépassé de {Math.abs(remaining).toLocaleString('fr-FR')} km
              </Badge>
            ) : isClose ? (
              <Badge className="border-0 bg-orange-100 text-orange-700">
                {remaining.toLocaleString('fr-FR')} km restants
              </Badge>
            ) : (
              <Badge variant="outline">
                {remaining.toLocaleString('fr-FR')} km restants
              </Badge>
            )}
            {projectedTotal > 0 && (
              <Badge
                className={
                  projectedTotal > limit
                    ? 'border-0 bg-red-100 text-red-700'
                    : 'border-0 bg-muted text-muted-foreground'
                }
              >
                Proj. fin d'année : {projectedTotal.toLocaleString('fr-FR')} km
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
              domain={[0, yMax]}
              tickFormatter={(v) => v.toLocaleString('fr-FR')}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                `${Math.round(value).toLocaleString('fr-FR')} km`,
                name === 'kmActual' ? 'Km parcourus' : 'Projection',
              ]}
            />
            <ReferenceLine
              y={limit}
              stroke="hsl(0, 72%, 51%)"
              strokeDasharray="5 5"
              label={{
                value: `Limite ${limit.toLocaleString('fr-FR')} km`,
                position: 'insideTopRight',
                fontSize: 10,
                fill: 'hsl(0, 72%, 51%)',
              }}
            />
            <Line
              type="monotone"
              dataKey="kmActual"
              stroke="hsl(217, 91%, 60%)"
              strokeWidth={2.5}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              name="kmActual"
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="kmProj"
              stroke="hsl(217, 91%, 60%)"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              name="kmProj"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
