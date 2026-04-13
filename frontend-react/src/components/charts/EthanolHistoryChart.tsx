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
import type { FlexfuelConversion, Vehicle, FuelEntry } from '@/types'

const ETHANOL_FRACTION: Record<string, number> = {
  e85: 0.85,
  essence: 0.05,
  diesel: 0.0,
  gpl: 0.0,
  electrique: 0.0,
  hybride: 0.0,
}

interface EthanolHistoryChartProps {
  conversion: FlexfuelConversion
  vehicle: Vehicle
  entries: FuelEntry[]
}

export function EthanolHistoryChart({ conversion, vehicle, entries }: EthanolHistoryChartProps) {
  const tankCapacity = vehicle.tank_capacity ?? 50
  const conversionDate = conversion.conversion_date
  const target = conversion.target_ethanol_pct
  const tolerance = conversion.ethanol_tolerance_pct

  const chartData = useMemo(() => {
    const sorted = [...entries]
      .filter((e) => e.fueling_date >= conversionDate)
      .sort((a, b) => {
        const d = a.fueling_date.localeCompare(b.fueling_date)
        return d !== 0 ? d : a.id - b.id
      })

    if (sorted.length === 0) return []

    // Compute avgL100km (fill-to-fill method)
    let prevFullOdo: number | null = null
    let accLiters = 0
    const consumptionValues: number[] = []
    for (const e of sorted) {
      accLiters += e.liters
      if (e.is_full_tank) {
        if (prevFullOdo !== null) {
          const dist = e.odometer_reading - prevFullOdo
          if (dist > 0) consumptionValues.push((accLiters * 100) / dist)
        }
        prevFullOdo = e.odometer_reading
        accLiters = 0
      }
    }
    if (consumptionValues.length === 0) return []
    const avgL100km = consumptionValues.reduce((a, b) => a + b, 0) / consumptionValues.length

    // Walk fills, track ethanol %, record a point at each full fill
    let litersInTank = 0
    let ethanolLiters = 0
    let prevOdo = sorted[0].odometer_reading
    const points: { date: string; ethanolPct: number }[] = []

    for (const e of sorted) {
      const distance = Math.max(0, e.odometer_reading - prevOdo)
      const consumed = (distance * avgL100km) / 100
      const remaining = Math.min(Math.max(0, litersInTank - consumed), tankCapacity)
      const ethFractionBefore = litersInTank > 0 ? ethanolLiters / litersInTank : 0
      const fillEthFraction = ETHANOL_FRACTION[e.fuel_type] ?? 0

      if (e.is_full_tank) {
        const actualRemaining = Math.min(remaining, Math.max(0, tankCapacity - e.liters))
        litersInTank = tankCapacity
        ethanolLiters = Math.min(ethFractionBefore * actualRemaining + e.liters * fillEthFraction, tankCapacity)
      } else {
        litersInTank = Math.min(remaining + e.liters, tankCapacity)
        ethanolLiters = Math.min(ethFractionBefore * remaining + e.liters * fillEthFraction, litersInTank)
      }
      prevOdo = e.odometer_reading

      if (e.is_full_tank) {
        points.push({
          date: new Date(e.fueling_date).toLocaleDateString('fr-FR'),
          ethanolPct: Math.round((ethanolLiters / litersInTank) * 1000) / 10,
        })
      }
    }

    return points
  }, [entries, conversionDate, tankCapacity])

  if (chartData.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Taux éthanol dans le réservoir</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Pas assez de données (minimum 2 pleins complets nécessaires).
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Taux éthanol dans le réservoir</CardTitle>
        <p className="text-xs text-muted-foreground">
          Cible {target}% ± {tolerance}% — estimé après chaque plein complet
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit="%" domain={['auto', 'auto']} />
            <Tooltip formatter={(value: number) => [`${value}%`, 'Éthanol']} />
            <ReferenceLine
              y={target}
              stroke="hsl(173, 58%, 39%)"
              strokeDasharray="5 5"
              label={{ value: `${target}%`, fontSize: 11, fill: 'hsl(173, 58%, 39%)', position: 'insideTopRight' }}
            />
            <ReferenceLine y={target + tolerance} stroke="hsl(25, 95%, 53%)" strokeDasharray="3 3" />
            <ReferenceLine y={target - tolerance} stroke="hsl(25, 95%, 53%)" strokeDasharray="3 3" />
            <Line
              type="monotone"
              dataKey="ethanolPct"
              stroke="hsl(142, 71%, 45%)"
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
