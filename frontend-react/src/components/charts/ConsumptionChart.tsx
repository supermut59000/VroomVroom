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

interface ConsumptionChartProps {
  dataPoints: ConsumptionDataPoint[]
}

export function ConsumptionChart({ dataPoints }: ConsumptionChartProps) {
  const chartData = useMemo(() => {
    // Backend already calculates consumption with full-tank accumulation logic
    return dataPoints
      .filter((p) => p.consumption != null && p.consumption > 0)
      .map((p) => ({
        date: new Date(p.date).toLocaleDateString('fr-FR'),
        consumption: Math.round(p.consumption! * 100) / 100,
        distance: p.distance ?? 0,
        liters: p.liters,
      }))
  }, [dataPoints])

  const average = useMemo(() => {
    if (chartData.length === 0) return 0
    return chartData.reduce((s, d) => s + d.consumption, 0) / chartData.length
  }, [chartData])

  if (chartData.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Consommation (L/100km)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Pas assez de données (minimum 2 pleins complets nécessaires)
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Consommation (L/100km)</CardTitle>
          {average > 0 && (
            <p className="text-sm font-normal text-muted-foreground">
              Moyenne : {average.toFixed(2)} L/100km
            </p>
          )}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit=" L" />
            <Tooltip
              formatter={(value: number, _name: string, props) => {
                const item = props.payload
                return [
                  `${value} L/100km (${item.liters.toFixed(1)}L / ${item.distance}km)`,
                  'Consommation',
                ]
              }}
            />
            <Line
              type="monotone"
              dataKey="consumption"
              stroke="hsl(173, 58%, 39%)"
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
            <ReferenceLine
              y={average}
              stroke="hsl(0, 72%, 51%)"
              strokeDasharray="5 5"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
