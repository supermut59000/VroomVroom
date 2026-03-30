import { useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { FuelEntry, Maintenance } from '@/types'

interface MonthlyCostChartProps {
  entries: FuelEntry[]
  maintenances: Maintenance[]
}

type ChartPoint = {
  month: string
  monthKey: string
  Carburant?: number
  Maintenance?: number
  CarburantProj?: number
  MaintenanceProj?: number
}

export function MonthlyCostChart({ entries, maintenances }: MonthlyCostChartProps) {
  const [mode, setMode] = useState<'euros' | 'per100km'>('euros')

  // Monthly absolute costs (€)
  const eurosData = useMemo((): ChartPoint[] => {
    const map = new Map<string, { fuel: number; maintenance: number }>()

    for (const e of entries) {
      const month = e.fueling_date.slice(0, 7)
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
          monthKey: month,
          Carburant: Math.round(costs.fuel * 100) / 100,
          Maintenance: Math.round(costs.maintenance * 100) / 100,
        }
      })
  }, [entries, maintenances])

  // Monthly cost per 100km
  const per100kmData = useMemo((): ChartPoint[] => {
    if (entries.length < 2) return []

    const sorted = [...entries].sort(
      (a, b) => a.fueling_date.localeCompare(b.fueling_date) || a.odometer_reading - b.odometer_reading,
    )

    const monthlyFuelCost = new Map<string, number>()
    const monthlyDistance = new Map<string, number>()
    const monthlyMaintCost = new Map<string, number>()

    for (let i = 1; i < sorted.length; i++) {
      const distance = sorted[i].odometer_reading - sorted[i - 1].odometer_reading
      if (distance <= 0) continue
      const d = new Date(sorted[i].fueling_date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthlyDistance.set(key, (monthlyDistance.get(key) || 0) + distance)
      monthlyFuelCost.set(key, (monthlyFuelCost.get(key) || 0) + sorted[i].liters * sorted[i].price_per_liter)
    }

    for (const m of maintenances) {
      const start = new Date(m.maintenance_date)
      const end = m.next_maintenance_date ? new Date(m.next_maintenance_date) : new Date()
      const totalMs = end.getTime() - start.getTime()

      if (totalMs <= 0) {
        const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
        monthlyMaintCost.set(key, (monthlyMaintCost.get(key) || 0) + m.cost)
        continue
      }

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
          monthKey: month,
          Carburant: Math.round((fuelCost / dist) * 100 * 100) / 100,
          Maintenance: Math.round((maintCost / dist) * 100 * 100) / 100,
        }
      })
  }, [entries, maintenances])

  // Helper: append 3 projected months based on average of last 3 real months
  function appendProjection(source: ChartPoint[]): ChartPoint[] {
    if (source.length < 2) return source
    const last3 = source.slice(-Math.min(3, source.length))
    const avgFuel = last3.reduce((s, d) => s + (d.Carburant ?? 0), 0) / last3.length
    const avgMaint = last3.reduce((s, d) => s + (d.Maintenance ?? 0), 0) / last3.length
    const lastKey = source[source.length - 1].monthKey
    const [ly, lm] = lastKey.split('-').map(Number)
    const projected: ChartPoint[] = [1, 2, 3].map((offset) => {
      const date = new Date(ly, lm - 1 + offset, 1)
      return {
        month: date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
        monthKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        CarburantProj: Math.round(avgFuel * 100) / 100,
        MaintenanceProj: Math.round(avgMaint * 100) / 100,
      }
    })
    return [...source, ...projected]
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const eurosDataWithProjection = useMemo(() => appendProjection(eurosData), [eurosData])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const per100kmDataWithProjection = useMemo(() => appendProjection(per100kmData), [per100kmData])

  const data = mode === 'euros' ? eurosDataWithProjection : per100kmDataWithProjection
  const realData = mode === 'euros' ? eurosData : per100kmData

  if (realData.length === 0) return null

  const unit = mode === 'euros' ? ' €' : ' €/100km'
  const avgTotal =
    realData.reduce((s, d) => s + (d.Carburant ?? 0) + (d.Maintenance ?? 0), 0) / realData.length

  const lastRealMonth =
    realData.length > 0 ? realData[realData.length - 1].month : null

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {mode === 'euros' ? 'Coûts mensuels' : 'Coût / 100km'}
            </CardTitle>
            <p className="text-sm font-normal text-muted-foreground">
              Moyenne : {avgTotal.toFixed(2)}{unit}
            </p>
          </div>
          <div className="flex rounded-md border text-xs">
            <button
              className={`px-3 py-1 rounded-l-md transition-colors ${mode === 'euros' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              onClick={() => setMode('euros')}
            >
              € / mois
            </button>
            <button
              className={`px-3 py-1 rounded-r-md transition-colors ${mode === 'per100km' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              onClick={() => setMode('per100km')}
            >
              € / 100km
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit={unit} />
            <Tooltip
              formatter={(value: number, name: string) => {
                const label = name === 'CarburantProj'
                  ? 'Carburant (prév.)'
                  : name === 'MaintenanceProj'
                  ? 'Maintenance (prév.)'
                  : name
                return [`${value.toFixed(2)}${unit}`, label]
              }}
            />
            <Legend
              formatter={(value) =>
                value === 'CarburantProj'
                  ? 'Carburant (prév.)'
                  : value === 'MaintenanceProj'
                  ? 'Maintenance (prév.)'
                  : value
              }
            />
            {lastRealMonth && (
              <ReferenceLine
                x={lastRealMonth}
                stroke="hsl(0, 0%, 65%)"
                strokeDasharray="3 3"
                label={{ value: 'prévision ▸', position: 'insideTopRight', fontSize: 10, fill: 'hsl(0, 0%, 55%)' }}
              />
            )}
            <Bar dataKey="Carburant" stackId="a" fill="hsl(217, 91%, 60%)" radius={[0, 0, 0, 0]} />
            <Bar dataKey="Maintenance" stackId="a" fill="hsl(25, 95%, 53%)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="CarburantProj" stackId="a" fill="hsl(217, 91%, 60%)" fillOpacity={0.35} radius={[0, 0, 0, 0]} />
            <Bar dataKey="MaintenanceProj" stackId="a" fill="hsl(25, 95%, 53%)" fillOpacity={0.35} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
