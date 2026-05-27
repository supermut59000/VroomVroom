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
  /** When true, plot one line per fuel type (E85 / Essence / …) with per-type averages. */
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
const FUEL_LABEL: Record<string, string> = {
  e85: 'E85',
  essence: 'Essence',
  diesel: 'Diesel',
  gpl: 'GPL',
  electrique: 'Électrique',
  hybride: 'Hybride',
}

const FUEL_COLOR: Record<string, string> = {
  e85: 'hsl(142, 71%, 45%)',
  essence: 'hsl(25, 95%, 53%)',
  diesel: 'hsl(0, 72%, 51%)',
  gpl: 'hsl(280, 70%, 55%)',
  electrique: 'hsl(217, 91%, 60%)',
  hybride: 'hsl(173, 58%, 39%)',
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
                  `${value} €/L — ${item.liters}L — ${item.total}€${item.station ? ` (${item.station})` : ''}`,
                  label,
                ]
              }}
            />
            {showSplit && <Legend formatter={(v: string) => FUEL_LABEL[v] ?? v} />}

            {showSplit ? (
              <>
                {fuelTypes.map((ft) => (
                  <Line
                    key={ft}
                    type="monotone"
                    dataKey={ft}
                    name={ft}
                    stroke={FUEL_COLOR[ft] ?? 'hsl(0, 0%, 50%)'}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                    connectNulls
                  />
                ))}
                {fuelTypes.map((ft) => (
                  <ReferenceLine
                    key={`avg-${ft}`}
                    y={averages[ft]}
                    stroke={FUEL_COLOR[ft] ?? 'hsl(0, 0%, 50%)'}
                    strokeDasharray="5 5"
                  />
                ))}
              </>
            ) : (
              <>
                <Line
                  type="monotone"
                  dataKey={fuelTypes[0]}
                  name={fuelTypes[0]}
                  stroke="hsl(25, 95%, 53%)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  connectNulls
                />
                <ReferenceLine
                  y={averages[fuelTypes[0]] ?? 0}
                  stroke="hsl(0, 72%, 51%)"
                  strokeDasharray="5 5"
                />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
