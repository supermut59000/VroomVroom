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
import type { ConsumptionDataPoint } from '@/types'

interface RangeChartProps {
  dataPoints: ConsumptionDataPoint[]
  tankCapacity: number | null
}

type Row = { date: string; range: number; consumption: number }

/** Estimated tank range per fill-to-fill segment: tank capacity / measured consumption. */
export function RangeChart({ dataPoints, tankCapacity }: RangeChartProps) {
  const { rows, average, min, max } = useMemo(() => {
    if (!tankCapacity) {
      return { rows: [] as Row[], average: null as number | null, min: null as number | null, max: null as number | null }
    }
    const rows: Row[] = dataPoints
      .filter((p) => p.consumption != null && p.consumption > 0)
      .map((p) => ({
        date: new Date(p.date).toLocaleDateString('fr-FR'),
        range: Math.round((tankCapacity * 100) / (p.consumption as number)),
        consumption: p.consumption as number,
      }))
    if (rows.length === 0) {
      return { rows, average: null, min: null, max: null }
    }
    const ranges = rows.map((r) => r.range)
    return {
      rows,
      average: Math.round(ranges.reduce((s, r) => s + r, 0) / ranges.length),
      min: Math.min(...ranges),
      max: Math.max(...ranges),
    }
  }, [dataPoints, tankCapacity])

  if (!tankCapacity) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Autonomie (km)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Renseignez la capacité du réservoir pour calculer l'autonomie
          </p>
        </CardContent>
      </Card>
    )
  }

  if (rows.length < 2 || average == null || min == null || max == null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Autonomie (km)</CardTitle>
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
        <CardTitle className="text-base">Autonomie (km)</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          Moyenne : {average} km · Min : {min} km · Max : {max} km
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={rows} margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit=" km" />
            <Tooltip
              formatter={(value: number, _name: string, props) => {
                const item = props.payload as Row
                return [`${value} km — ${item.consumption.toFixed(2)} L/100km`, 'Autonomie']
              }}
            />
            <ReferenceLine y={average} stroke="hsl(25, 95%, 53%)" strokeDasharray="5 5" />
            <Line
              type="monotone"
              dataKey="range"
              name="Autonomie"
              stroke="hsl(217, 91%, 60%)"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
