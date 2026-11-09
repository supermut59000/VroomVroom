import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { FuelEntry } from '@/types'

interface PriceChartProps {
  entries: FuelEntry[]
  /** When true, plot one line per fuel product (E85 / E10 / SP98 / …). */
  splitByFuelType?: boolean
}

type Row = {
  date: string
  station: string
  liters: number
  total: string
  // dynamic per-fuel-type keys: e85, essence, diesel, …
  [key: string]: string | number
}

// Display label per fuel_type value
export const FUEL_LABEL: Record<string, string> = {
  e85: 'E85',
  essence: 'E10',
  sp98: 'SP98',
  diesel: 'Diesel',
  gpl: 'GPL',
  electrique: 'Électrique',
  hybride: 'Hybride',
}

// Couleurs des séries par type de carburant — toutes issues de la palette
// (docs/palette.md §5 ; 7 types, 7 teintes distinguables dont hybride = neutre)
export const FUEL_COLOR: Record<string, string> = {
  e85: 'var(--ethanol)',
  essence: 'var(--c-blue)',
  sp98: 'var(--partial)',
  diesel: 'var(--c-lilas)',
  gpl: 'var(--c-rose)',
  electrique: 'var(--c-teal)',
  hybride: 'var(--muted-foreground)',
}

export function PriceChart({ entries, splitByFuelType = false }: PriceChartProps) {
  const { rows, fuelTypes, averages } = useMemo(() => {
    const rows: Row[] = entries.map((e) => ({
      date: new Date(e.fueling_date).toLocaleDateString('fr-FR'),
      station: e.station_name || '',
      liters: e.liters,
      total: (e.liters * e.price_per_liter).toFixed(2),
      [e.fuel_type]: Math.round(e.price_per_liter * 1000) / 1000,
    }))

    // Distinct fuel types in chronological order of appearance
    const seen = new Set<string>()
    const fuelTypes: string[] = []
    for (const e of entries) {
      if (!seen.has(e.fuel_type)) {
        seen.add(e.fuel_type)
        fuelTypes.push(e.fuel_type)
      }
    }

    // Weighted average per fuel type: Σ(price × liters) / Σ liters
    const averages: Record<string, number> = {}
    for (const ft of fuelTypes) {
      let totLiters = 0
      let totCost = 0
      for (const e of entries) {
        if (e.fuel_type !== ft) continue
        totLiters += e.liters
        totCost += e.liters * e.price_per_liter
      }
      averages[ft] = totLiters > 0 ? totCost / totLiters : 0
    }

    return { rows, fuelTypes, averages }
  }, [entries])

  if (rows.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prix du carburant (&euro;/L)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Pas assez de données</p>
        </CardContent>
      </Card>
    )
  }

  // Single-line mode: use whatever fuel type is dominant (or the first one)
  const showSplit = splitByFuelType && fuelTypes.length > 1

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Prix du carburant (&euro;/L)</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          {showSplit
            ? fuelTypes
                .map((ft) => `${FUEL_LABEL[ft] ?? ft} ${averages[ft].toFixed(3)} €/L`)
                .join(' · ')
            : `Moyenne : ${(averages[fuelTypes[0]] ?? 0).toFixed(3)} €/L`}
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={rows} margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit=" €" />
            <Tooltip
              formatter={(value: number, name: string, props) => {
                const item = props.payload as Row
                const label = FUEL_LABEL[name] ?? name
                return [
                  `${value} €/L · ${item.liters} L · ${item.total} €${item.station ? ` (${item.station})` : ''}`,
                  label,
                ]
              }}
            />
            {showSplit && <Legend formatter={(v: string) => FUEL_LABEL[v] ?? v} />}

            {showSplit &&
              fuelTypes.map((ft) => (
                <Line
                  key={ft}
                  type="monotone"
                  dataKey={ft}
                  name={ft}
                  stroke={FUEL_COLOR[ft] ?? 'var(--muted-foreground)'}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  connectNulls
                />
              ))}
            {showSplit &&
              fuelTypes.map((ft) => (
                <ReferenceLine
                  key={`avg-${ft}`}
                  y={averages[ft]}
                  stroke={FUEL_COLOR[ft] ?? 'var(--muted-foreground)'}
                  strokeDasharray="5 5"
                />
              ))}
            {!showSplit && (
              <Line
                type="monotone"
                dataKey={fuelTypes[0]}
                name={fuelTypes[0]}
                stroke="var(--partial)"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                connectNulls
              />
            )}
            {!showSplit && (
              <ReferenceLine
                y={averages[fuelTypes[0]] ?? 0}
                stroke="var(--destructive)"
                strokeDasharray="5 5"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
