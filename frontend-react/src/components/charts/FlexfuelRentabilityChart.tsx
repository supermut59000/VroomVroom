import { useMemo } from 'react'
import {
  LineChart,
  Line,
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
import type { FlexfuelRentabilitySummary } from '@/types'

interface FlexfuelRentabilityChartProps {
  data: FlexfuelRentabilitySummary
}

export function FlexfuelRentabilityChart({ data }: FlexfuelRentabilityChartProps) {
  const cumulativeData = useMemo(
    () =>
      data.data_points.map((p) => ({
        date: new Date(p.date).toLocaleDateString('fr-FR'),
        cumulative: p.cumulative_savings,
        savings: p.savings,
        cumulativeProj: undefined as number | undefined,
      })),
    [data.data_points],
  )

  // Project forward to break-even if not yet reached
  const cumulativeDataWithProjection = useMemo(() => {
    if (
      data.break_even_reached ||
      !data.monthly_average_savings ||
      data.monthly_average_savings <= 0 ||
      cumulativeData.length === 0
    ) {
      return cumulativeData
    }

    const remaining = data.kit_cost - data.total_savings
    const monthsToBreakEven = Math.ceil(remaining / data.monthly_average_savings)

    // Cap projection at 36 months to avoid absurd extrapolations
    if (monthsToBreakEven > 36) return cumulativeData

    const lastPoint = data.data_points[data.data_points.length - 1]
    const lastDate = new Date(lastPoint.date)
    const lastCumulative = lastPoint.cumulative_savings

    // Bridge: add cumulativeProj to the last real point so the lines connect
    const realWithBridge = cumulativeData.map((p, i) => ({
      ...p,
      cumulativeProj: i === cumulativeData.length - 1 ? lastCumulative : undefined,
    }))

    const projectedPoints = Array.from({ length: monthsToBreakEven }, (_, i) => {
      const date = new Date(lastDate)
      date.setMonth(date.getMonth() + i + 1)
      const projValue = lastCumulative + (i + 1) * data.monthly_average_savings!
      return {
        date: date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
        cumulative: undefined as number | undefined,
        savings: undefined as number | undefined,
        cumulativeProj: Math.min(projValue, data.kit_cost * 1.02),
      }
    })

    return [...realWithBridge, ...projectedPoints]
  }, [cumulativeData, data])

  const projectedBreakEvenDate = useMemo(() => {
    if (
      data.break_even_reached ||
      !data.monthly_average_savings ||
      data.monthly_average_savings <= 0 ||
      data.data_points.length === 0
    ) {
      return null
    }
    const remaining = data.kit_cost - data.total_savings
    if (remaining <= 0) return null
    const months = Math.ceil(remaining / data.monthly_average_savings)
    if (months > 36) return null
    const date = new Date(data.data_points[data.data_points.length - 1].date)
    date.setMonth(date.getMonth() + months)
    return date
  }, [data])

  const monthlyData = useMemo(
    () =>
      data.monthly_savings.map((m) => {
        const [year, month] = m.month.split('-')
        const d = new Date(Number(year), Number(month) - 1)
        return {
          month: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
          savings: Math.round(m.savings * 100) / 100,
        }
      }),
    [data.monthly_savings],
  )

  const remaining = data.kit_cost - data.total_savings

  if (data.total_e85_fills === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            🌿 Rentabilité E85
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Aucun plein E85 enregistré depuis la conversion. Ajoutez des pleins E85 et des prix de référence E10 pour voir la rentabilité.
          </p>
        </CardContent>
      </Card>
    )
  }

  const yMax = Math.ceil(
    Math.max(data.kit_cost, data.total_savings) * 1.1,
  )

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            🌿 Rentabilité E85
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md bg-muted/50 p-3 text-center">
              <p className="text-xs text-muted-foreground">Économie totale</p>
              <p className="text-lg font-bold text-emerald-600">
                {data.total_savings.toFixed(0)} &euro;
              </p>
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-center">
              <p className="text-xs text-muted-foreground">Coût du kit</p>
              <p className="text-lg font-bold">{data.kit_cost.toFixed(0)} &euro;</p>
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-center">
              <p className="text-xs text-muted-foreground">
                {data.break_even_reached ? 'Rentabilisé le' : 'Reste à amortir'}
              </p>
              <p className="text-lg font-bold">
                {data.break_even_reached && data.break_even_date
                  ? new Date(data.break_even_date).toLocaleDateString('fr-FR')
                  : `${remaining.toFixed(0)} €`}
              </p>
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-center">
              <p className="text-xs text-muted-foreground">Moy. /mois</p>
              <p className="text-lg font-bold">
                {data.monthly_average_savings
                  ? `${data.monthly_average_savings.toFixed(0)} €`
                  : '—'}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline">{data.total_e85_fills} pleins E85</Badge>
            <Badge variant="outline">
              Surconsommation {data.overconsumption_pct}%
            </Badge>
            {data.break_even_reached ? (
              <Badge className="border-0 bg-emerald-100 text-emerald-700">
                Rentabilisé
              </Badge>
            ) : projectedBreakEvenDate ? (
              <Badge className="border-0 bg-blue-100 text-blue-700">
                Rentabilisation prévue ~{projectedBreakEvenDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
              </Badge>
            ) : (
              <Badge className="border-0 bg-orange-100 text-orange-700">
                En cours d'amortissement
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cumulative savings chart */}
      {cumulativeData.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Économies cumulées</CardTitle>
            {!data.break_even_reached && projectedBreakEvenDate && (
              <p className="text-sm font-normal text-muted-foreground">
                Projection en pointillé jusqu'au seuil de rentabilité
              </p>
            )}
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={cumulativeDataWithProjection} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit=" €" domain={[0, yMax]} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${value.toFixed(2)} €`,
                    name === 'cumulativeProj' ? 'Projection' : 'Économie cumulée',
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  stroke="hsl(152, 69%, 31%)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  name="cumulative"
                  connectNulls={false}
                />
                {!data.break_even_reached && (
                  <Line
                    type="monotone"
                    dataKey="cumulativeProj"
                    stroke="hsl(152, 69%, 31%)"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                    name="cumulativeProj"
                    connectNulls={false}
                  />
                )}
                <ReferenceLine
                  y={data.kit_cost}
                  stroke="hsl(0, 72%, 51%)"
                  strokeDasharray="5 5"
                  label={{
                    value: `Kit: ${data.kit_cost}€`,
                    position: 'right',
                    fontSize: 11,
                    fill: 'hsl(0, 72%, 51%)',
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Monthly savings bar chart */}
      {monthlyData.length >= 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Économies mensuelles</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit=" €" />
                <Tooltip
                  formatter={(value: number) => [`${value.toFixed(2)} €`, 'Économie']}
                />
                <Bar
                  dataKey="savings"
                  fill="hsl(152, 69%, 31%)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
