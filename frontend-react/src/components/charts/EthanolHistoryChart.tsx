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
  essence: 0.10,
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
        if (d !== 0) return d
        const odo = a.odometer_reading - b.odometer_reading
        if (odo !== 0) return odo
        return a.id - b.id
      })

    if (sorted.length === 0) return []

    // Fill-to-fill ethanol tracking.
    // Entries sharing the same (date, odometer) are ONE stop: a booster + a top-up
    // are pumped at the same pump, so their composition must be merged before
    // computing the resulting tank %.
    // Between two "Plein" stops, the sum of all liters added equals the fuel burned
    // — no need to estimate via avgL100km. Old fuel still in tank when the new fill
    // starts = capacity - sum_added (or 0 if added ≥ capacity, meaning the previous
    // tank was fully displaced).
    let ethFraction: number | null = null
    let accLiters = 0
    let accEthLiters = 0
    const points: { date: string; ethanolPct: number }[] = []

    let i = 0
    while (i < sorted.length) {
      const stopDate = sorted[i].fueling_date
      const stopOdo = sorted[i].odometer_reading
      let stopIsFull = false

      while (
        i < sorted.length &&
        sorted[i].fueling_date === stopDate &&
        sorted[i].odometer_reading === stopOdo
      ) {
        const e = sorted[i]
        const fillEthFraction = ETHANOL_FRACTION[e.fuel_type] ?? 0
        accLiters += e.liters
        accEthLiters += e.liters * fillEthFraction
        if (e.is_full_tank) stopIsFull = true
        i++
      }

      if (stopIsFull) {
        if (ethFraction === null) {
          // First full stop since conversion: assume residual pre-conversion fuel
          // is negligible — tank composition = added composition.
          ethFraction = accLiters > 0 ? accEthLiters / accLiters : 0
        } else if (accLiters >= tankCapacity) {
          // Added ≥ a full tank's worth between fulls: old fuel fully displaced.
          ethFraction = accEthLiters / accLiters
        } else {
          // Some old fuel remains; mix old + new.
          const remainingOldFuel = tankCapacity - accLiters
          const totalEth = ethFraction * remainingOldFuel + accEthLiters
          ethFraction = Math.min(totalEth / tankCapacity, 1)
        }

        points.push({
          date: new Date(stopDate).toLocaleDateString('fr-FR'),
          ethanolPct: Math.round(ethFraction * 1000) / 10,
        })

        accLiters = 0
        accEthLiters = 0
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
