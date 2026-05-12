import { useMemo } from 'react'
import {
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Line,
  ComposedChart,
} from 'recharts'
import type { ConsumptionDataPoint } from '@/types'

interface Props {
  dataPoints: ConsumptionDataPoint[]
}

const MONTH_LABEL = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

function monthToSeason(m: number): 'hiver' | 'printemps' | 'été' | 'automne' {
  if (m <= 2 || m === 12) return 'hiver'
  if (m <= 5) return 'printemps'
  if (m <= 8) return 'été'
  return 'automne'
}

const SEASON_COLOR: Record<string, string> = {
  hiver: '#60a5fa',
  printemps: '#4ade80',
  été: '#fbbf24',
  automne: '#f97316',
}

/** Simple linear regression — returns slope and intercept. */
function linearRegression(points: { x: number; y: number }[]) {
  const n = points.length
  if (n < 2) return null
  const meanX = points.reduce((s, p) => s + p.x, 0) / n
  const meanY = points.reduce((s, p) => s + p.y, 0) / n
  const num = points.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0)
  const den = points.reduce((s, p) => s + (p.x - meanX) ** 2, 0)
  if (den === 0) return null
  const slope = num / den
  const intercept = meanY - slope * meanX
  return { slope, intercept }
}

export function ConsumptionScatterChart({ dataPoints }: Props) {
  const { seasonPoints, trendLine } = useMemo(() => {
    const valid = dataPoints.filter((d) => d.consumption != null && d.consumption > 0)

    const sp = valid.map((d) => {
      const month = new Date(d.date).getMonth() + 1 // 1–12
      return {
        x: month,
        y: d.consumption!,
        season: monthToSeason(month),
        label: MONTH_LABEL[month - 1],
        date: d.date,
      }
    })

    const reg = linearRegression(sp.map((p) => ({ x: p.x, y: p.y })))
    const trend = reg
      ? [1, 12].map((x) => ({ x, trend: parseFloat((reg.slope * x + reg.intercept).toFixed(2)) }))
      : []

    return { seasonPoints: sp, trendLine: trend }
  }, [dataPoints])

  // Merge scatter points and trend into one dataset for ComposedChart
  const mergedData = useMemo(() => {
    if (seasonPoints.length === 0) return []
    const byMonth: Record<number, { x: number; trend?: number; points: typeof seasonPoints }> = {}
    for (let m = 1; m <= 12; m++) byMonth[m] = { x: m, points: [] }
    for (const p of seasonPoints) byMonth[p.x].points.push(p)
    if (trendLine.length === 2) {
      const [start, end] = trendLine
      const slope = (end.trend - start.trend) / 11
      for (let m = 1; m <= 12; m++) {
        byMonth[m].trend = parseFloat((start.trend + slope * (m - 1)).toFixed(2))
      }
    }
    return Object.values(byMonth)
  }, [seasonPoints, trendLine])

  const yMin = seasonPoints.length > 0 ? Math.floor(Math.min(...seasonPoints.map((p) => p.y)) - 0.5) : 0
  const yMax = seasonPoints.length > 0 ? Math.ceil(Math.max(...seasonPoints.map((p) => p.y)) + 0.5) : 10
  const avg = seasonPoints.length > 0 ? parseFloat((seasonPoints.reduce((s, p) => s + p.y, 0) / seasonPoints.length).toFixed(2)) : 0

  if (seasonPoints.length < 3) return null

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Consommation par mois</h3>
      <p className="text-xs text-muted-foreground">
        Chaque point = un plein complet. Couleur par saison. Tendance linéaire.
      </p>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="x"
            type="number"
            domain={[1, 12]}
            ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]}
            tickFormatter={(v) => MONTH_LABEL[v - 1]}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            domain={[yMin, yMax]}
            tickFormatter={(v) => `${v}`}
            tick={{ fontSize: 11 }}
            width={35}
            label={{ value: 'L/100km', angle: -90, position: 'insideLeft', offset: 12, style: { fontSize: 10 } }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              // Find scatter payload
              const scatter = payload.find((p) => p.name !== 'trend')
              const trend = payload.find((p) => p.name === 'trend')
              return (
                <div className="rounded border bg-background p-2 shadow text-xs space-y-0.5">
                  {scatter && (
                    <>
                      <p className="font-medium">{scatter.payload?.date}</p>
                      <p>{scatter.payload?.y?.toFixed(2)} L/100km</p>
                    </>
                  )}
                  {trend && <p className="text-muted-foreground">Tendance : {trend.value} L/100km</p>}
                </div>
              )
            }}
          />
          <ReferenceLine y={avg} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 2" label={{ value: `moy. ${avg}`, position: 'right', fontSize: 10 }} />
          {/* Trend line */}
          <Line data={mergedData} dataKey="trend" dot={false} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="6 3" name="trend" type="monotone" />
          {/* Scatter per season */}
          {(['hiver', 'printemps', 'été', 'automne'] as const).map((season) => (
            <Scatter
              key={season}
              name={season}
              data={seasonPoints.filter((p) => p.season === season)}
              fill={SEASON_COLOR[season]}
              opacity={0.8}
              r={4}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(['hiver', 'printemps', 'été', 'automne'] as const).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ background: SEASON_COLOR[s] }} />
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-4 inline-block bg-red-400" />
          Tendance
        </span>
      </div>
    </div>
  )
}
