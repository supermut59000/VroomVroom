import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import type { FuelEntry } from '@/types'

interface Props {
  entries: FuelEntry[]
}

const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']


export function RefuelingPatternChart({ entries }: Props) {
  // Only full-tank entries for distance calculation
  const fullEntries = useMemo(
    () =>
      [...entries]
        .filter((e) => e.is_full_tank)
        .sort((a, b) => {
          const odo = a.odometer_reading - b.odometer_reading
          if (odo !== 0) return odo
          const d = a.fueling_date.localeCompare(b.fueling_date)
          if (d !== 0) return d
          return a.id - b.id
        }),
    [entries],
  )

  const allSorted = useMemo(
    () =>
      [...entries].sort((a, b) => {
        const odo = a.odometer_reading - b.odometer_reading
        if (odo !== 0) return odo
        const d = a.fueling_date.localeCompare(b.fueling_date)
        if (d !== 0) return d
        return a.id - b.id
      }),
    [entries],
  )

  // 1. Histogram: km between consecutive full fills
  const distBuckets = useMemo(() => {
    const BUCKETS = [0, 100, 200, 300, 400, 500, 600, 700, Infinity]
    const counts = Array(BUCKETS.length - 1).fill(0)
    let total = 0

    for (let i = 1; i < fullEntries.length; i++) {
      const km = fullEntries[i].odometer_reading - fullEntries[i - 1].odometer_reading
      if (km <= 0) continue
      total += km
      const idx = BUCKETS.findIndex((b, j) => j > 0 && km < b) - 1
      if (idx >= 0 && idx < counts.length) counts[idx]++
    }

    const avgKm = fullEntries.length > 1 ? Math.round(total / (fullEntries.length - 1)) : null

    return {
      data: BUCKETS.slice(0, -1).map((start, i) => ({
        label: i === BUCKETS.length - 2 ? `${start}+` : `${start}–${BUCKETS[i + 1]}`,
        count: counts[i],
      })),
      avgKm,
    }
  }, [fullEntries])

  // 2. Day of week distribution
  const dayData = useMemo(() => {
    const counts = Array(7).fill(0)
    for (const e of allSorted) {
      const d = new Date(e.fueling_date).getDay()
      counts[d]++
    }
    return DAY_LABELS.map((label, i) => ({ label, count: counts[i] }))
  }, [allSorted])

  // 3. Stat cards — only full-tank entries count as a "plein".
  // Same-stop partial boosters (Essence + E85 at same pump) are folded into the
  // closing full tank's total cost and liters, so a paired booster + top-up
  // shows up as one plein at its true combined cost/liters.
  const stats = useMemo(() => {
    type Stop = { cost: number; liters: number }
    const stops: Stop[] = []
    let acc: Stop = { cost: 0, liters: 0 }
    for (const e of allSorted) {
      acc.cost += e.total_cost
      acc.liters += e.liters
      if (e.is_full_tank) {
        stops.push(acc)
        acc = { cost: 0, liters: 0 }
      }
    }

    const totalCost = stops.reduce((s, x) => s + x.cost, 0)
    const totalLiters = stops.reduce((s, x) => s + x.liters, 0)
    return {
      totalFills: stops.length,
      avgCostPerFill: stops.length > 0 ? totalCost / stops.length : 0,
      avgLitersPerFill: stops.length > 0 ? totalLiters / stops.length : 0,
      avgKmBetweenFills: distBuckets.avgKm,
    }
  }, [allSorted, distBuckets.avgKm])

  if (allSorted.length === 0) return null

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Habitudes de ravitaillement
      </h3>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xs text-muted-foreground">Pleins totaux</p>
          <p className="text-2xl font-bold">{stats.totalFills}</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xs text-muted-foreground">Coût moy./plein</p>
          <p className="text-2xl font-bold">{stats.avgCostPerFill.toFixed(0)} €</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xs text-muted-foreground">Litres moy./plein</p>
          <p className="text-2xl font-bold">{stats.avgLitersPerFill.toFixed(1)} L</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xs text-muted-foreground">Km moy. entre pleins</p>
          <p className="text-2xl font-bold">
            {stats.avgKmBetweenFills != null ? `${stats.avgKmBetweenFills}` : '—'}
          </p>
        </div>
      </div>

      {/* km between fills histogram */}
      {fullEntries.length > 1 && (
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Distribution km entre pleins complets</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={distBuckets.data} barGap={0}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={25} />
              <Tooltip formatter={(v: number) => [`${v} plein${v > 1 ? 's' : ''}`, '']} labelFormatter={(l) => `${l} km`} />
              <Bar dataKey="count" fill="var(--color-chart-fuel, hsl(217 91% 60%))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Day of week */}
      <div>
        <p className="mb-2 text-xs text-muted-foreground">Pleins par jour de la semaine</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={dayData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={25} />
            <Tooltip formatter={(v: number) => [`${v} plein${v > 1 ? 's' : ''}`, '']} />
            <Bar dataKey="count" fill="var(--color-chart-maintenance, hsl(35 90% 55%))" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

    </div>
  )
}
