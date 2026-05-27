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
  /** Overconsumption %, e.g. 19.7 — when provided, two normalised lines (E10/E85) are shown. */
  overconsumptionPct?: number | null
  /** Backend distance-weighted average. Used as reference line for non-FlexFuel. */
  avgConsumption?: number | null
}

type Point = {
  date: string
  measured: number
  distance: number
  liters: number
  e85_fraction: number | null
  e10Norm: number | null
  e85Norm: number | null
}

export function ConsumptionChart({
  dataPoints,
  overconsumptionPct,
  avgConsumption,
}: ConsumptionChartProps) {
  const isFlexfuel = overconsumptionPct != null && overconsumptionPct > 0
  const opc = isFlexfuel ? overconsumptionPct! / 100 : 0

  const chartData = useMemo<Point[]>(() => {
    return dataPoints
      .filter((p) => p.consumption != null && p.consumption > 0)
      .map((p) => {
        const measured = Math.round(p.consumption! * 100) / 100
        const distance = p.distance ?? 0
        let e10Norm: number | null = null
        let e85Norm: number | null = null
        if (isFlexfuel && p.e85_fraction != null) {
          // Normalise the measured L/100 to what it would be on pure E10 / pure E85,
          // given how much of the segment's fuel was E85.
          const e10 = measured / (1 + opc * p.e85_fraction)
          const e85 = e10 * (1 + opc)
          e10Norm = Math.round(e10 * 100) / 100
          e85Norm = Math.round(e85 * 100) / 100
        }
        return {
          date: new Date(p.date).toLocaleDateString('fr-FR'),
          measured,
          distance,
          liters: p.liters,
          e85_fraction: p.e85_fraction,
          e10Norm,
          e85Norm,
        }
      })
  }, [dataPoints, isFlexfuel, opc])

  // Distance-weighted averages — match the backend formula (total liters × 100 / total km)
  const avg = useMemo(() => {
    if (chartData.length === 0) {
      return { measured: 0, e10: 0, e85: 0 }
    }
    let totalDist = 0
    let totalLitersE10 = 0
    let totalLitersE85 = 0
    let totalLitersRaw = 0
    for (const p of chartData) {
      if (p.distance <= 0) continue
      totalDist += p.distance
      // Reconstruct liters from consumption × distance (same as p.liters but explicit)
      const litersFromRate = (p.measured * p.distance) / 100
      totalLitersRaw += litersFromRate
      if (p.e10Norm != null) totalLitersE10 += (p.e10Norm * p.distance) / 100
      if (p.e85Norm != null) totalLitersE85 += (p.e85Norm * p.distance) / 100
    }
    return {
      measured: totalDist > 0 ? (totalLitersRaw * 100) / totalDist : 0,
      e10: totalDist > 0 ? (totalLitersE10 * 100) / totalDist : 0,
      e85: totalDist > 0 ? (totalLitersE85 * 100) / totalDist : 0,
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

  const referenceMeasured = avgConsumption ?? avg.measured

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Consommation (L/100km)</CardTitle>
        {isFlexfuel ? (
          <p className="text-sm font-normal text-muted-foreground">
            Normalisée — moy. E10 {avg.e10.toFixed(2)} L/100 · moy. E85 {avg.e85.toFixed(2)} L/100
            <span className="ml-1 text-xs">(surconsommation {overconsumptionPct}%)</span>
          </p>
        ) : referenceMeasured > 0 ? (
          <p className="text-sm font-normal text-muted-foreground">
            Moyenne : {referenceMeasured.toFixed(2)} L/100km
          </p>
        ) : null}
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
                  name === 'e10Norm'
                    ? 'E10 (norm.)'
                    : name === 'e85Norm'
                    ? 'E85 (norm.)'
                    : 'Consommation'
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
            {isFlexfuel && <Legend />}

            {isFlexfuel && (
              <Line
                type="monotone"
                dataKey="e10Norm"
                name="E10 (norm.)"
                stroke="hsl(217, 91%, 60%)"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            )}
            {isFlexfuel && (
              <Line
                type="monotone"
                dataKey="e85Norm"
                name="E85 (norm.)"
                stroke="hsl(142, 71%, 45%)"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            )}
            {isFlexfuel && (
              <ReferenceLine y={avg.e10} stroke="hsl(217, 91%, 60%)" strokeDasharray="5 5" />
            )}
            {isFlexfuel && (
              <ReferenceLine y={avg.e85} stroke="hsl(142, 71%, 45%)" strokeDasharray="5 5" />
            )}
            {!isFlexfuel && (
              <Line
                type="monotone"
                dataKey="measured"
                name="Consommation"
                stroke="hsl(173, 58%, 39%)"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            )}
            {!isFlexfuel && (
              <ReferenceLine
                y={referenceMeasured}
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
