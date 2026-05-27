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
    if (entries.length < 2) return { data: [], avgKm: 0, projectedAnnual: null }

    // Group odometer readings by month — take min and max per month
    const monthMap = new Map<string, { min: number; max: number }>()
    const sorted = [...entries].sort((a, b) => a.fueling_date.localeCompare(b.fueling_date))

    for (const e of sorted) {
      const month = e.fueling_date.slice(0, 7)
      const row = monthMap.get(month)
      if (!row) {
        monthMap.set(month, { min: e.odometer_reading, max: e.odometer_reading })
      } else {
        row.min = Math.min(row.min, e.odometer_reading)
        row.max = Math.max(row.max, e.odometer_reading)
      }
    }

    // Distance per month = max odometer this month - max odometer previous month.
    // If consecutive fill months are non-adjacent (gap), spread the km uniformly
    // across the gap so a single big bar doesn't appear on the resuming month.
    const months = Array.from(monthMap.entries()).sort(([a], [b]) => a.localeCompare(b))
    const result: { month: string; monthKey: string; km: number }[] = []

    const monthsBetween = (fromKey: string, toKey: string): string[] => {
      const [fy, fm] = fromKey.split('-').map(Number)
      const [ty, tm] = toKey.split('-').map(Number)
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

    for (let i = 1; i < months.length; i++) {
      const [prevMonth, prevData] = months[i - 1]
      const [curMonth, curData] = months[i]
      const totalKm = curData.max - prevData.max
      if (totalKm <= 0) continue

      const span = monthsBetween(prevMonth, curMonth).slice(1) // exclude prevMonth
      const per = totalKm / span.length
      for (const key of span) {
        const [year, m] = key.split('-')
        const label = new Date(Number(year), Number(m) - 1).toLocaleDateString('fr-FR', {
          month: 'short',
          year: '2-digit',
        })
        result.push({ month: label, monthKey: key, km: Math.round(per) })
      }
    }

    // Exclude current month from avg and projection (partial month distorts figures)
    const completedMonths = result.filter((r) => r.monthKey < currentMonthKey)
    const base = completedMonths.length > 0 ? completedMonths : result

    const avgKm = base.length > 0 ? Math.round(base.reduce((s, r) => s + r.km, 0) / base.length) : 0

    // Projected annual: average of last 3 completed months × 12
    let projectedAnnual: number | null = null
    if (base.length >= 1) {
      const last = base.slice(-Math.min(3, base.length))
      const avg = last.reduce((sum, r) => sum + r.km, 0) / last.length
      projectedAnnual = Math.round(avg * 12)
    }

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
