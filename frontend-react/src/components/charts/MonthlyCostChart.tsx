import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { FuelEntry, Maintenance } from '@/types'

interface MonthlyCostChartProps {
  entries: FuelEntry[]
  maintenances: Maintenance[]
}

export function MonthlyCostChart({ entries, maintenances }: MonthlyCostChartProps) {
  const data = useMemo(() => {
    const map = new Map<string, { fuel: number; maintenance: number }>()

    for (const e of entries) {
      const month = e.fueling_date.slice(0, 7) // YYYY-MM
      const row = map.get(month) ?? { fuel: 0, maintenance: 0 }
      row.fuel += e.total_cost
      map.set(month, row)
    }

    for (const m of maintenances) {
      const month = m.maintenance_date.slice(0, 7)
      const row = map.get(month) ?? { fuel: 0, maintenance: 0 }
      row.maintenance += m.cost
      map.set(month, row)
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, costs]) => {
        const [year, m] = month.split('-')
        const label = new Date(Number(year), Number(m) - 1).toLocaleDateString('fr-FR', {
          month: 'short',
          year: '2-digit',
        })
        return {
          month: label,
          Carburant: Math.round(costs.fuel * 100) / 100,
          Maintenance: Math.round(costs.maintenance * 100) / 100,
        }
      })
  }, [entries, maintenances])

  if (data.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Coûts mensuels</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit=" €" />
            <Tooltip
              formatter={(value: number) => [`${value.toFixed(2)} €`]}
            />
            <Legend />
            <Bar dataKey="Carburant" stackId="a" fill="hsl(217, 91%, 60%)" radius={[0, 0, 0, 0]} />
            <Bar dataKey="Maintenance" stackId="a" fill="hsl(25, 95%, 53%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
