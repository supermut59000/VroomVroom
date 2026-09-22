import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FUEL_LABEL, FUEL_COLOR } from './PriceChart'
import type { FuelEntry } from '@/types'

interface FuelTypeHistoryChartProps {
  entries: FuelEntry[]
}

type Row = { key: string; label: string; [fuel: string]: string | number }

function monthLabel(key: string): string {
  return new Date(`${key}-01T00:00:00`).toLocaleDateString('fr-FR', {
    month: 'short',
    year: '2-digit',
  })
}

/** Litres actually put in the tank per month, stacked by fuel type. */
export function FuelTypeHistoryChart({ entries }: FuelTypeHistoryChartProps) {
  const { rows, fuelTypes, totals, grandTotal } = useMemo(() => {
    const byMonth = new Map<string, Row>()
    for (const e of entries) {
      const key = e.fueling_date.slice(0, 7) // YYYY-MM
      const row = byMonth.get(key) ?? { key, label: monthLabel(key) }
      row[e.fuel_type] = ((row[e.fuel_type] as number | undefined) ?? 0) + e.liters
      byMonth.set(key, row)
    }
    const rows = [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key))

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

  if (rows.length === 0 || fuelTypes.length === 0) return null

  const subtitle = fuelTypes
    .map((ft) => {
      const share = grandTotal > 0 ? Math.round((totals[ft] / grandTotal) * 100) : 0
      return `${FUEL_LABEL[ft] ?? ft} : ${Math.round(totals[ft])} L (${share} %)`
    })
    .join(' · ')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Carburants versés (L / mois)</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={rows} margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit=" L" />
            <Tooltip
              formatter={(value: number, name: string) => [
                `${Math.round(value * 10) / 10} L`,
                FUEL_LABEL[name] ?? name,
              ]}
            />
            <Legend formatter={(v: string) => FUEL_LABEL[v] ?? v} />
            {fuelTypes.map((ft) => (
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
      </CardContent>
    </Card>
  )
}
