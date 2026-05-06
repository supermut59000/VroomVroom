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
import { Badge } from '@/components/ui/badge'
import type { FuelEntry } from '@/types'

interface AnnualKmChartProps {
  entries: FuelEntry[]  // must be allEntries (unfiltered)
}

export function AnnualKmChart({ entries }: AnnualKmChartProps) {
  const result = useMemo(() => {
    if (entries.length === 0) return null

    // Group max odometer per month
    const monthMap = new Map<string, number>()
    for (const e of entries) {
      const key = e.fueling_date.slice(0, 7)
      monthMap.set(key, Math.max(monthMap.get(key) ?? 0, e.odometer_reading))
    }

    const sortedMonths = Array.from(monthMap.entries()).sort(([a], [b]) => a.localeCompare(b))
    if (sortedMonths.length < 2) return null

    // Group consecutive monthly diffs by calendar year
    const yearMap = new Map<string, number>()
    for (let i = 1; i < sortedMonths.length; i++) {
      const [prevKey, prevOdo] = sortedMonths[i - 1]
      const [curKey, curOdo] = sortedMonths[i]
      const diff = curOdo - prevOdo
      if (diff <= 0) continue
      // Attribute to the year of the later month
      const year = curKey.slice(0, 4)
      yearMap.set(year, (yearMap.get(year) ?? 0) + diff)
    }

    if (yearMap.size === 0) return null

    const currentYear = new Date().getFullYear().toString()
    const data = Array.from(yearMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, km]) => ({
        year,
        km: Math.round(km),
        isPartial: year === currentYear,
      }))

    // Average of completed years only
    const completedKms = data.filter((d) => !d.isPartial).map((d) => d.km)
    const avgKm = completedKms.length > 0
      ? Math.round(completedKms.reduce((a, b) => a + b, 0) / completedKms.length)
      : null

    return { data, avgKm, currentYear }
  }, [entries])

  if (!result) return null
  const { data, avgKm, currentYear } = result

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-base">Kilométrage annuel</CardTitle>
          {avgKm != null && (
            <Badge variant="outline">
              Moy. {avgKm.toLocaleString('fr-FR')} km/an
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ left: 10, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              unit=" km"
              tickFormatter={(v) => v.toLocaleString('fr-FR')}
            />
            <Tooltip
              formatter={(value: number, _: string, item: { payload: { isPartial: boolean } }) => [
                `${value.toLocaleString('fr-FR')} km${item.payload.isPartial ? ' (année en cours)' : ''}`,
                'Kilométrage',
              ]}
            />
            {avgKm != null && (
              <ReferenceLine
                y={avgKm}
                stroke="hsl(217, 91%, 60%)"
                strokeDasharray="5 5"
                label={{
                  value: `Moy. ${avgKm.toLocaleString('fr-FR')} km`,
                  position: 'insideTopRight',
                  fontSize: 10,
                  fill: 'hsl(217, 91%, 60%)',
                }}
              />
            )}
            <Bar
              dataKey="km"
              name="km"
              radius={[3, 3, 0, 0]}
              fill="hsl(217, 91%, 60%)"
              fillOpacity={0.85}
              label={false}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
        {data.some((d) => d.isPartial) && (
          <p className="mt-1 text-center text-xs text-muted-foreground">
            {currentYear} — année en cours, non incluse dans la moyenne
          </p>
        )}
      </CardContent>
    </Card>
  )
}
