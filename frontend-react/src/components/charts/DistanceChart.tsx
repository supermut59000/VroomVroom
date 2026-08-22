import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { avgKmPerMonth, monthlyKmSeries } from '@/lib/vehicle-stats'
import type { FuelEntry } from '@/types'

interface DistanceChartProps {
  entries: FuelEntry[]
}

export function DistanceChart({ entries }: DistanceChartProps) {
  const currentMonthKey = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const { data, avgKm, projectedAnnual } = useMemo(() => {
    // Shared implementation (src/lib/vehicle-stats.ts): max odometer per month,
    // gap months spread uniformly, current month excluded from averages.
    const points = monthlyKmSeries(entries)
    if (points.length === 0) return { data: [], avgKm: 0, projectedAnnual: null }

    const result = points.map((p) => {
      const [year, m] = p.monthKey.split('-')
      const label = new Date(Number(year), Number(m) - 1).toLocaleDateString('fr-FR', {
        month: 'short',
        year: '2-digit',
      })
      return { month: label, monthKey: p.monthKey, km: Math.round(p.km) }
    })

    const avgKm = Math.round(avgKmPerMonth(entries) ?? 0)

    // Projected annual: average of last 3 completed months × 12
    const completed = points.filter((p) => p.monthKey < currentMonthKey)
    const base = completed.length > 0 ? completed : points
    const last = base.slice(-Math.min(3, base.length))
    const projectedAnnual =
      last.length > 0 ? Math.round((last.reduce((s, p) => s + p.km, 0) / last.length) * 12) : null

    return { data: result, avgKm, projectedAnnual }
  }, [entries, currentMonthKey])

  if (data.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Distance mensuelle</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{avgKm.toLocaleString('fr-FR')} km/mois (moy.)</Badge>
            {projectedAnnual != null && (
              <Badge variant="outline">
                ~{projectedAnnual.toLocaleString('fr-FR')} km/an (projeté)
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit=" km" />
            <Tooltip
              formatter={(value: number) => [`${value.toLocaleString('fr-FR')} km`, 'Distance']}
            />
            <ReferenceLine
              y={avgKm}
              stroke="hsl(217, 91%, 60%)"
              strokeDasharray="4 4"
              label={{
                value: `moy. ${avgKm} km`,
                position: 'right',
                fontSize: 10,
                fill: 'hsl(217, 91%, 60%)',
              }}
            />
            <Bar dataKey="km" fill="hsl(270, 60%, 55%)" radius={[4, 4, 0, 0]} name="km" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
