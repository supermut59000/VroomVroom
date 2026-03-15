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
import type { FuelEntry, Maintenance } from '@/types'

interface CostPerKmChartProps {
  entries: FuelEntry[]
  maintenances: Maintenance[]
}

export function CostPerKmChart({ entries, maintenances }: CostPerKmChartProps) {
  const chartData = useMemo(() => {
    if (entries.length < 2) return []

    const sorted = [...entries].sort(
      (a, b) => a.fueling_date.localeCompare(b.fueling_date) || a.odometer_reading - b.odometer_reading,
    )

    // Calculate monthly distance and fuel cost
    const monthlyFuelCost = new Map<string, number>()
    const monthlyDistance = new Map<string, number>()
    const monthlyMaintCost = new Map<string, number>()

    for (let i = 1; i < sorted.length; i++) {
      const distance = sorted[i].odometer_reading - sorted[i - 1].odometer_reading
      if (distance <= 0) continue
      const d = new Date(sorted[i].fueling_date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthlyDistance.set(key, (monthlyDistance.get(key) || 0) + distance)
      const cost = sorted[i].liters * sorted[i].price_per_liter
      monthlyFuelCost.set(key, (monthlyFuelCost.get(key) || 0) + cost)
    }

    // Distribute each maintenance cost across months it covers
    // (from maintenance_date to next_maintenance_date, or to today if not set)
    for (const m of maintenances) {
      const start = new Date(m.maintenance_date)
      const end = m.next_maintenance_date ? new Date(m.next_maintenance_date) : new Date()
      const totalMs = end.getTime() - start.getTime()

      if (totalMs <= 0) {
        // No spread period: assign full cost to the entry's own month
        const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
        monthlyMaintCost.set(key, (monthlyMaintCost.get(key) || 0) + m.cost)
        continue
      }

      // Walk month by month over the spread period
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
      while (cursor <= end) {
        const monthStart = new Date(cursor)
        const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999)
        const overlapStart = Math.max(start.getTime(), monthStart.getTime())
        const overlapEnd = Math.min(end.getTime(), monthEnd.getTime())

        if (overlapEnd > overlapStart) {
          const share = m.cost * ((overlapEnd - overlapStart) / totalMs)
          const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
          monthlyMaintCost.set(key, (monthlyMaintCost.get(key) || 0) + share)
        }

        cursor.setMonth(cursor.getMonth() + 1)
      }
    }

    const allMonths = new Set([...monthlyDistance.keys(), ...monthlyMaintCost.keys()])

    return Array.from(allMonths)
      .sort()
      .filter((month) => monthlyDistance.has(month))
      .map((month) => {
        const dist = monthlyDistance.get(month) || 1
        const fuelCost = monthlyFuelCost.get(month) || 0
        const maintCost = monthlyMaintCost.get(month) || 0
        const [y, m] = month.split('-')
        return {
          month: `${m}/${y.slice(2)}`,
          fuel: Math.round((fuelCost / dist) * 100 * 100) / 100,
          maintenance: Math.round((maintCost / dist) * 100 * 100) / 100,
        }
      })
  }, [entries, maintenances])

  if (chartData.length < 1) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coût / 100km</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Pas assez de données</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Coût / 100km (&euro;)</CardTitle>
          {chartData.length > 0 && (() => {
            const avgTotal = chartData.reduce((s, d) => s + d.fuel + d.maintenance, 0) / chartData.length
            return (
              <p className="text-sm font-normal text-muted-foreground">
                Moyenne : {avgTotal.toFixed(2)} &euro;/100km
              </p>
            )
          })()}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit=" €" />
            <Tooltip
              formatter={(value: number, name: string) => [
                `${value.toFixed(2)} €/100km`,
                name === 'fuel' ? 'Carburant' : 'Maintenance',
              ]}
            />
            <Legend formatter={(value) => (value === 'fuel' ? 'Carburant' : 'Maintenance')} />
            <Bar dataKey="fuel" stackId="cost" fill="hsl(217, 91%, 60%)" radius={[0, 0, 0, 0]} />
            <Bar dataKey="maintenance" stackId="cost" fill="hsl(25, 95%, 53%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
