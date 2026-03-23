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
      })),
    [data.data_points],
  )

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
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={cumulativeData} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit=" €" />
                <Tooltip
                  formatter={(value: number) => [`${value.toFixed(2)} €`, 'Économie cumulée']}
                />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  stroke="hsl(152, 69%, 31%)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
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
