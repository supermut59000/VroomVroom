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

  const currentMonthKey = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }, [])

  // Average km/month — same method as DistanceChart:
  // group by month (max odo), diff between consecutive months, then average
  const avgKmPerMonth = useMemo(() => {
    if (entries.length < 2) return null
    const sorted = [...entries].sort((a, b) => a.fueling_date.localeCompare(b.fueling_date))

    const monthMap = new Map<string, number>()
    for (const e of sorted) {
      const month = e.fueling_date.slice(0, 7)
      const cur = monthMap.get(month) ?? 0
      if (e.odometer_reading > cur) monthMap.set(month, e.odometer_reading)
    }

    const months = Array.from(monthMap.entries()).sort(([a], [b]) => a.localeCompare(b))
    const monthlyKms: number[] = []
    for (let i = 1; i < months.length; i++) {
      const km = months[i][1] - months[i - 1][1]
      if (km > 0) monthlyKms.push(km)
    }

    return monthlyKms.length > 0
      ? monthlyKms.reduce((s, v) => s + v, 0) / monthlyKms.length
      : null
  }, [entries])

  // Spread every maintenance cost across monthly buckets.
  // Priority: next_maintenance_date > next_maintenance_odometer (km→months via avgKmPerMonth) > 12-month fallback
  const spreadMaintenanceCosts = useMemo(() => {
    const result = new Map<string, number>()

    for (const m of maintenances) {
      const start = new Date(m.maintenance_date)
      let end: Date

      if (m.next_maintenance_date) {
        end = new Date(m.next_maintenance_date)
      } else if (m.next_maintenance_odometer && avgKmPerMonth && avgKmPerMonth > 0) {
        const kmRemaining = m.next_maintenance_odometer - m.odometer_reading
        const monthsAhead = kmRemaining > 0 ? Math.round(kmRemaining / avgKmPerMonth) : 12
        end = new Date(start.getFullYear(), start.getMonth() + monthsAhead, start.getDate())
      } else {
        end = new Date(start.getFullYear(), start.getMonth() + 12, start.getDate())
      }

      const totalMs = end.getTime() - start.getTime()

      if (totalMs <= 0) {
        const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
        result.set(key, (result.get(key) || 0) + m.cost)
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
          result.set(key, (result.get(key) || 0) + share)
        }
        cursor.setMonth(cursor.getMonth() + 1)
      }
    }

    return result
  }, [maintenances, avgKmPerMonth])

  // Monthly absolute costs (€) — maintenance spread across months
  const eurosData = useMemo((): ChartPoint[] => {
    const monthlyFuel = new Map<string, number>()

    for (const e of entries) {
      const month = e.fueling_date.slice(0, 7)
      monthlyFuel.set(month, (monthlyFuel.get(month) || 0) + e.total_cost)
    }

    const allMonths = new Set([...monthlyFuel.keys(), ...spreadMaintenanceCosts.keys()])

    return Array.from(allMonths)
      .sort()
      .filter((month) => month <= currentMonthKey)
      .map((month) => {
        const [year, m] = month.split('-')
        const label = new Date(Number(year), Number(m) - 1).toLocaleDateString('fr-FR', {
          month: 'short',
          year: '2-digit',
        })
        return {
          month: label,
          monthKey: month,
          Carburant: Math.round((monthlyFuel.get(month) || 0) * 100) / 100,
          Maintenance: Math.round((spreadMaintenanceCosts.get(month) || 0) * 100) / 100,
        }
      })
  }, [entries, spreadMaintenanceCosts])

  // Monthly cost per 100km — maintenance spread across months
  const per100kmData = useMemo((): ChartPoint[] => {
    if (entries.length < 2) return []

    const sorted = [...entries].sort(
      (a, b) => a.fueling_date.localeCompare(b.fueling_date) || a.odometer_reading - b.odometer_reading,
    )

    const monthlyFuelCost = new Map<string, number>()
    const monthlyDistance = new Map<string, number>()

    for (let i = 1; i < sorted.length; i++) {
      const distance = sorted[i].odometer_reading - sorted[i - 1].odometer_reading
      if (distance <= 0) continue
      const d = new Date(sorted[i].fueling_date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthlyDistance.set(key, (monthlyDistance.get(key) || 0) + distance)
      monthlyFuelCost.set(key, (monthlyFuelCost.get(key) || 0) + sorted[i].liters * sorted[i].price_per_liter)
    }

    return Array.from(monthlyDistance.keys())
      .sort()
      .filter((month) => month <= currentMonthKey)
      .map((month) => {
        const dist = monthlyDistance.get(month) || 1
        const fuelCost = monthlyFuelCost.get(month) || 0
        const maintCost = spreadMaintenanceCosts.get(month) || 0
        const [y, m] = month.split('-')
        return {
          month: `${m}/${y.slice(2)}`,
          monthKey: month,
          Carburant: Math.round((fuelCost / dist) * 100 * 100) / 100,
          Maintenance: Math.round((maintCost / dist) * 100 * 100) / 100,
        }
      })
  }, [entries, spreadMaintenanceCosts])

  // Projection for €/mois:
  // - CarburantProj = avg fuel of last 3 real months
  // - MaintenanceProj = actual scheduled spread for that future month (or 0)
  // Shows up to 12 months, stops after 3 if no more scheduled maintenance
  const eurosDataWithProjection = useMemo((): ChartPoint[] => {
    if (eurosData.length === 0) return []
    const completed = eurosData.filter((d: ChartPoint) => d.monthKey < currentMonthKey)
    const base = completed.length > 0 ? completed : eurosData
    const last3 = base.slice(-Math.min(3, base.length))
    const avgFuel = last3.reduce((s: number, d: ChartPoint) => s + (d.Carburant ?? 0), 0) / last3.length
    const lastKey = eurosData[eurosData.length - 1].monthKey
    const [ly, lm] = lastKey.split('-').map(Number)
    const projected: ChartPoint[] = []
    for (let offset = 1; offset <= 12; offset++) {
      const date = new Date(ly, lm - 1 + offset, 1)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const maintCost = spreadMaintenanceCosts.get(monthKey) || 0
      if (offset > 3 && maintCost === 0) break
      projected.push({
        month: date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
        monthKey,
        CarburantProj: Math.round(avgFuel * 100) / 100,
        MaintenanceProj: Math.round(maintCost * 100) / 100,
      })
    }
    return [...eurosData, ...projected]
  }, [eurosData, spreadMaintenanceCosts])

  // Projection for €/100km:
  // - CarburantProj = avg fuel/100km of last 3 real months
  // - MaintenanceProj = scheduled spread ÷ avgKmPerMonth × 100
  const per100kmDataWithProjection = useMemo((): ChartPoint[] => {
    if (per100kmData.length === 0) return []
    const completed = per100kmData.filter((d: ChartPoint) => d.monthKey < currentMonthKey)
    const base = completed.length > 0 ? completed : per100kmData
    const last3 = base.slice(-Math.min(3, base.length))
    const avgFuelPer100 = last3.reduce((s: number, d: ChartPoint) => s + (d.Carburant ?? 0), 0) / last3.length
    const lastKey = per100kmData[per100kmData.length - 1].monthKey
    const [ly, lm] = lastKey.split('-').map(Number)
    const projected: ChartPoint[] = []
    for (let offset = 1; offset <= 12; offset++) {
      const date = new Date(ly, lm - 1 + offset, 1)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const maintCost = spreadMaintenanceCosts.get(monthKey) || 0
      const maintPer100 =
        avgKmPerMonth && avgKmPerMonth > 0
          ? Math.round((maintCost / avgKmPerMonth) * 100 * 100) / 100
          : 0
      if (offset > 3 && maintCost === 0) break
      projected.push({
        month: `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getFullYear()).slice(2)}`,
        monthKey,
        CarburantProj: Math.round(avgFuelPer100 * 100) / 100,
        MaintenanceProj: maintPer100,
      })
    }
    return [...per100kmData, ...projected]
  }, [per100kmData, spreadMaintenanceCosts, avgKmPerMonth])

  const data = mode === 'euros' ? eurosDataWithProjection : per100kmDataWithProjection
  const realData = mode === 'euros' ? eurosData : per100kmData

  if (realData.length === 0) return null

  const unit = mode === 'euros' ? ' €' : ' €/100km'
  // Exclude current month from average — partial month would drag the figure down
  const completedData = realData.filter((d: ChartPoint) => d.monthKey < currentMonthKey)
  const avgBase = completedData.length > 0 ? completedData : realData
  const avgTotal =
    avgBase.reduce((s: number, d: ChartPoint) => s + (d.Carburant ?? 0) + (d.Maintenance ?? 0), 0) / avgBase.length

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
              formatter={(value: string) =>
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
