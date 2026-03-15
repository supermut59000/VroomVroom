import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { FuelEntry } from '@/types'

interface OdometerChartProps {
  entries: FuelEntry[]
}

export function OdometerChart({ entries }: OdometerChartProps) {
  const chartData = useMemo(() => {
    if (entries.length < 2) return []

    const sorted = [...entries].sort(
      (a, b) => a.fueling_date.localeCompare(b.fueling_date) || a.odometer_reading - b.odometer_reading,
    )

    const monthlyKm = new Map<string, number>()

    for (let i = 1; i < sorted.length; i++) {
      const distance = sorted[i].odometer_reading - sorted[i - 1].odometer_reading
      if (distance <= 0) continue
      const d = new Date(sorted[i].fueling_date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthlyKm.set(key, (monthlyKm.get(key) || 0) + distance)
    }

    return Array.from(monthlyKm.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, km]) => {
        const [y, m] = month.split('-')
        return {
          month: `${m}/${y.slice(2)}`,
          km: Math.round(km),
        }
      })
  }, [entries])

  const average = useMemo(() => {
    if (chartData.length === 0) return 0
    return chartData.reduce((s, d) => s + d.km, 0) / chartData.length
  }, [chartData])

  if (chartData.length < 1) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kilométrage mensuel</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Pas assez de données</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Kilométrage mensuel</CardTitle>
          {average > 0 && (
            <p className="text-sm font-normal text-muted-foreground">
              Moyenne : {Math.round(average)} km/mois
            </p>
          )}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit=" km" />
            <Tooltip formatter={(value: number) => [`${value} km`, 'Distance']} />
            <Bar dataKey="km" fill="hsl(262, 83%, 58%)" radius={[4, 4, 0, 0]} />
            <ReferenceLine
              y={average}
              stroke="hsl(0, 72%, 51%)"
              strokeDasharray="5 5"
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
