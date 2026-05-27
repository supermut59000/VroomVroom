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
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ConsumptionDataPoint } from '@/types'

interface ConsumptionChartProps {
  dataPoints: ConsumptionDataPoint[]
  /** When true, split the line by dominant fuel (E85 vs Essence/E10) — raw measured values, no normalisation. */
  splitByFuelType?: boolean
  /** Backend distance-weighted average. Used as reference line in single-line mode. */
  avgConsumption?: number | null
}

type Point = {
  date: string
  measured: number
  distance: number
  liters: number
  e85_fraction: number | null
  e85: number | null
  essence: number | null
}

export function ConsumptionChart({
  dataPoints,
  splitByFuelType = false,
  avgConsumption,
}: ConsumptionChartProps) {
  const chartData = useMemo<Point[]>(() => {
    return dataPoints
      .filter((p) => p.consumption != null && p.consumption > 0)
      .map((p) => {
        const measured = Math.round(p.consumption! * 100) / 100
        const distance = p.distance ?? 0
        // Dominant fuel of the segment — > 50% E85 by volume = E85 segment.
        // If e85_fraction is null (non-FlexFuel or first segment), treat as Essence.
        const isE85 = (p.e85_fraction ?? 0) > 0.5
        return {
          date: new Date(p.date).toLocaleDateString('fr-FR'),
          measured,
          distance,
          liters: p.liters,
          e85_fraction: p.e85_fraction,
          e85: splitByFuelType && isE85 ? measured : null,
          essence: splitByFuelType && !isE85 ? measured : null,
        }
      })
  }, [dataPoints, splitByFuelType])

  // Distance-weighted averages (matches backend formula: total liters × 100 / total km)
  const avg = useMemo(() => {
    const acc = { e85: { dist: 0, liters: 0 }, essence: { dist: 0, liters: 0 } }
    for (const p of chartData) {
      if (p.distance <= 0) continue
      const bucket = (p.e85_fraction ?? 0) > 0.5 ? acc.e85 : acc.essence
      bucket.dist += p.distance
      bucket.liters += (p.measured * p.distance) / 100
    }
    return {
      e85: acc.e85.dist > 0 ? (acc.e85.liters * 100) / acc.e85.dist : 0,
      essence: acc.essence.dist > 0 ? (acc.essence.liters * 100) / acc.essence.dist : 0,
    }
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

  const hasE85 = chartData.some((p) => p.e85 != null)
  const hasEssence = chartData.some((p) => p.essence != null)
  const showSplit = splitByFuelType && hasE85 && hasEssence

  const subtitle = showSplit
    ? `Essence ${avg.essence.toFixed(2)} L/100 · E85 ${avg.e85.toFixed(2)} L/100`
    : avgConsumption != null && avgConsumption > 0
    ? `Moyenne : ${avgConsumption.toFixed(2)} L/100km`
    : null

  const lastPoint = chartData[chartData.length - 1]
  const lastIsE85 = lastPoint && (lastPoint.e85_fraction ?? 0) > 0.5

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Consommation (L/100km)</CardTitle>
        {subtitle && (
          <p className="text-sm font-normal text-muted-foreground">{subtitle}</p>
        )}
        {lastPoint && (
          <p className="text-xs font-normal text-muted-foreground">
            Dernier plein :{' '}
            <span className="font-semibold text-foreground">
              {lastPoint.measured.toFixed(2)} L/100
            </span>
            {' '}({lastPoint.date}
            {showSplit ? ` · ${lastIsE85 ? 'E85' : 'Essence'}` : ''})
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
              formatter={(value: number, name: string, props) => {
                const item = props.payload as Point
                const label =
                  name === 'e85' ? 'E85' : name === 'essence' ? 'Essence/E10' : 'Consommation'
                const e85Pct =
                  item.e85_fraction != null
                    ? ` · ${Math.round(item.e85_fraction * 100)}% E85`
                    : ''
                return [
                  `${value} L/100km (${item.liters.toFixed(1)}L / ${item.distance}km${e85Pct})`,
                  label,
                ]
              }}
            />
            {showSplit && <Legend />}

            {showSplit && (
              <Line
                type="monotone"
                dataKey="e85"
                name="E85"
                stroke="hsl(142, 71%, 45%)"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 8, strokeWidth: 2 }}
                connectNulls
              />
            )}
            {showSplit && (
              <Line
                type="monotone"
                dataKey="essence"
                name="Essence/E10"
                stroke="hsl(25, 95%, 53%)"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 8, strokeWidth: 2 }}
                connectNulls
              />
            )}
            {showSplit && (
              <ReferenceLine y={avg.e85} stroke="hsl(142, 71%, 45%)" strokeDasharray="5 5" />
            )}
            {showSplit && (
              <ReferenceLine
                y={avg.essence}
                stroke="hsl(25, 95%, 53%)"
                strokeDasharray="5 5"
              />
            )}

            {!showSplit && (
              <Line
                type="monotone"
                dataKey="measured"
                name="Consommation"
                stroke="hsl(173, 58%, 39%)"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 8, strokeWidth: 2 }}
              />
            )}
            {!showSplit && avgConsumption != null && avgConsumption > 0 && (
              <ReferenceLine
                y={avgConsumption}
                stroke="hsl(0, 72%, 51%)"
                strokeDasharray="5 5"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
