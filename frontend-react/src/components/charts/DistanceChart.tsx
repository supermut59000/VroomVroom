import { useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { avgKmPerMonth, monthlyKmSeries } from '@/lib/vehicle-stats'
import { FUEL_LABEL, FUEL_COLOR } from './PriceChart'
import type { FuelEntry } from '@/types'

interface DistanceChartProps {
  entries: FuelEntry[]
}

type LitersRow = { month: string; monthKey: string; [fuel: string]: string | number }

/**
 * Combined "mensuel" card (toggle pattern, same as MonthlyCostChart's € / 100km):
 * km/month bars, or litres/month stacked by fuel type.
 */
export function DistanceChart({ entries }: DistanceChartProps) {
  const [mode, setMode] = useState<'km' | 'liters'>('km')

  const currentMonthKey = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const { data, avgKm, projectedAnnual } = useMemo(() => {
    // Shared implementation (src/lib/vehicle-stats.ts): max odometer per month,
    // gap months spread uniformly, current month excluded from averages.
    const points = monthlyKmSeries(entries)
    if (points.length === 0) return { data: [], avgKm: 0, projectedAnnual: null }

    const result = points.map((p) => {
      const [year, m] = p.monthKey.split('-')
      const label = new Date(Number(year), Number(m) - 1).toLocaleDateString('fr-FR', {
        month: 'short',
        year: '2-digit',
      })
      return { month: label, monthKey: p.monthKey, km: Math.round(p.km) }
    })

    const avgKm = Math.round(avgKmPerMonth(entries) ?? 0)

    // Projected annual: average of last 3 completed months × 12
    const completed = points.filter((p) => p.monthKey < currentMonthKey)
    const base = completed.length > 0 ? completed : points
    const last = base.slice(-Math.min(3, base.length))
    const projectedAnnual =
      last.length > 0 ? Math.round((last.reduce((s, p) => s + p.km, 0) / last.length) * 12) : null

    return { data: result, avgKm, projectedAnnual }
  }, [entries, currentMonthKey])

  // Litres per month per fuel type (stacked in the "L / mois" view)
  const liters = useMemo(() => {
    const byMonth = new Map<string, LitersRow>()
    for (const e of entries) {
      const key = e.fueling_date.slice(0, 7)
      const [year, m] = key.split('-')
      const label = new Date(Number(year), Number(m) - 1).toLocaleDateString('fr-FR', {
        month: 'short',
        year: '2-digit',
      })
      const row = byMonth.get(key) ?? { month: label, monthKey: key }
      row[e.fuel_type] = ((row[e.fuel_type] as number | undefined) ?? 0) + e.liters
      byMonth.set(key, row)
    }
    const rows = [...byMonth.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey))

    // Distinct fuel types in chronological order of appearance (same as PriceChart)
    const seen = new Set<string>()
    const fuelTypes: string[] = []
    for (const e of entries) {
      if (!seen.has(e.fuel_type)) {
        seen.add(e.fuel_type)
        fuelTypes.push(e.fuel_type)
      }
    }

    const totals: Record<string, number> = {}
    let grandTotal = 0
    for (const ft of fuelTypes) {
      totals[ft] = entries.reduce((s, e) => (e.fuel_type === ft ? s + e.liters : s), 0)
      grandTotal += totals[ft]
    }

    return { rows, fuelTypes, totals, grandTotal }
  }, [entries])

  if (data.length === 0 && liters.rows.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {mode === 'km' ? 'Distance mensuelle' : 'Carburants versés (L / mois)'}
            </CardTitle>
            {mode === 'liters' && liters.grandTotal > 0 && (
              <p className="text-sm font-normal text-muted-foreground">
                {liters.fuelTypes
                  .map((ft) => {
                    const share = Math.round((liters.totals[ft] / liters.grandTotal) * 100)
                    return `${FUEL_LABEL[ft] ?? ft} : ${Math.round(liters.totals[ft])} L (${share} %)`
                  })
                  .join(' · ')}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {mode === 'km' ? (
              <>
                <Badge variant="outline">{avgKm.toLocaleString('fr-FR')} km/mois (moy.)</Badge>
                {projectedAnnual != null && (
                  <Badge variant="outline">
                    ~{projectedAnnual.toLocaleString('fr-FR')} km/an (projeté)
                  </Badge>
                )}
              </>
            ) : (
              <Badge variant="outline">
                {Math.round(liters.grandTotal).toLocaleString('fr-FR')} L (total)
              </Badge>
            )}
            <div className="flex rounded-md border text-xs">
              <button
                className={`px-3 py-1 rounded-l-md transition-colors ${mode === 'km' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                onClick={() => setMode('km')}
              >
                km / mois
              </button>
              <button
                className={`px-3 py-1 rounded-r-md transition-colors ${mode === 'liters' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                onClick={() => setMode('liters')}
              >
                L / mois
              </button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {mode === 'km' ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit=" km" />
              <Tooltip
                formatter={(value: number) => [`${value.toLocaleString('fr-FR')} km`, 'Distance']}
              />
              <ReferenceLine
                y={avgKm}
                stroke="hsl(217, 91%, 60%)"
                strokeDasharray="4 4"
                label={{
                  value: `moy. ${avgKm} km`,
                  position: 'right',
                  fontSize: 10,
                  fill: 'hsl(217, 91%, 60%)',
                }}
              />
              <Bar dataKey="km" fill="hsl(270, 60%, 55%)" radius={[4, 4, 0, 0]} name="km" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={liters.rows} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit=" L" />
              <Tooltip
                formatter={(value: number, name: string) => {
                  const v = value as number
                  const share = liters.grandTotal > 0 ? Math.round((v / liters.grandTotal) * 100) : 0
                  return [`${Math.round(v * 10) / 10} L (${share} %)`, FUEL_LABEL[name] ?? name]
                }}
              />
              <Legend formatter={(v: string) => FUEL_LABEL[v] ?? v} />
              {liters.fuelTypes.map((ft) => (
                <Bar
                  key={ft}
                  dataKey={ft}
                  stackId="liters"
                  name={ft}
                  fill={FUEL_COLOR[ft] ?? 'hsl(0, 0%, 50%)'}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
