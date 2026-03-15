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
import type { FuelEntry } from '@/types'

interface PriceChartProps {
  entries: FuelEntry[]
}

export function PriceChart({ entries }: PriceChartProps) {
  const chartData = useMemo(() => {
    return entries.map((e) => ({
      date: new Date(e.fueling_date).toLocaleDateString('fr-FR'),
      price: Math.round(e.price_per_liter * 1000) / 1000,
      station: e.station_name || '',
      liters: e.liters,
      total: (e.liters * e.price_per_liter).toFixed(2),
    }))
  }, [entries])

  const average = useMemo(() => {
    if (chartData.length === 0) return 0
    return chartData.reduce((s, d) => s + d.price, 0) / chartData.length
  }, [chartData])

  if (chartData.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prix du carburant (&euro;/L)</CardTitle>
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
        <CardTitle className="text-base">Prix du carburant (&euro;/L)</CardTitle>
          {average > 0 && (
            <p className="text-sm font-normal text-muted-foreground">
              Moyenne : {average.toFixed(3)} &euro;/L
            </p>
          )}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit=" €" />
            <Tooltip
              formatter={(value: number, _name: string, props) => {
                const item = props.payload
                return [
                  `${value} €/L — ${item.liters}L — ${item.total}€${item.station ? ` (${item.station})` : ''}`,
                  'Prix',
                ]
              }}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="hsl(25, 95%, 53%)"
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
