import { useState, useMemo } from 'react'
import { FlaskConical } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { FlexfuelConversion, Vehicle, FuelEntry } from '@/types'

// Fixed ethanol content by fuel type (fraction 0–1) — used for history only.
// 'essence' is assumed SP95 (5%) for all historical fills; the user's dilutant
// choice at recommendation time is handled separately to avoid the estimate
// changing when the selector is toggled.
const ETHANOL_FRACTION: Record<string, number> = {
  e85: 0.85,
  essence: 0.05,
  diesel: 0.0,
  gpl: 0.0,
  electrique: 0.0,
  hybride: 0.0,
}

const MIN_PUMP_LITERS = 5

type DilutantType = 'e10' | 'sp95'

interface TankState {
  litersInTank: number
  ethanolLiters: number
  lastOdo: number
}

/** Compute average L/100km from fills since conversionDate, fill-to-fill method. */
function computeAvgConsumption(entries: FuelEntry[], conversionDate: string): number | null {
  const sorted = [...entries]
    .filter((e) => e.fueling_date >= conversionDate)
    .sort((a, b) => {
      const d = a.fueling_date.localeCompare(b.fueling_date)
      return d !== 0 ? d : a.id - b.id
    })

  let prevFullOdo: number | null = null
  let accLiters = 0
  const values: number[] = []

  for (const e of sorted) {
    accLiters += e.liters
    if (e.is_full_tank) {
      if (prevFullOdo !== null) {
        const dist = e.odometer_reading - prevFullOdo
        if (dist > 0) values.push((accLiters * 100) / dist)
      }
      prevFullOdo = e.odometer_reading
      accLiters = 0
    }
  }

  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * Walk through fills from conversionDate onwards, tracking ethanol litres
 * in the tank. Uses fixed ETHANOL_FRACTION for 'essence' fills (stable,
 * independent of the dilutant type the user selects in the UI).
 * Tank is capped at tankCapacity to prevent accumulation drift.
 */
function computeTankState(
  entries: FuelEntry[],
  conversionDate: string,
  avgL100km: number,
  tankCapacity: number,
): TankState {
  const sorted = [...entries]
    .filter((e) => e.fueling_date >= conversionDate)
    .sort((a, b) => {
      const d = a.fueling_date.localeCompare(b.fueling_date)
      return d !== 0 ? d : a.id - b.id
    })

  if (sorted.length === 0) {
    return { litersInTank: 0, ethanolLiters: 0, lastOdo: 0 }
  }

  let litersInTank = 0
  let ethanolLiters = 0
  let prevOdo = sorted[0].odometer_reading

  for (const e of sorted) {
    const distance = Math.max(0, e.odometer_reading - prevOdo)
    const consumed = (distance * avgL100km) / 100
    const remaining = Math.min(Math.max(0, litersInTank - consumed), tankCapacity)
    const ethRemaining = litersInTank > 0 ? (ethanolLiters / litersInTank) * remaining : 0
    const fillEthFraction = ETHANOL_FRACTION[e.fuel_type] ?? 0

    litersInTank = Math.min(remaining + e.liters, tankCapacity)
    ethanolLiters = Math.min(ethRemaining + e.liters * fillEthFraction, litersInTank)
    prevOdo = e.odometer_reading
  }

  return { litersInTank, ethanolLiters, lastOdo: prevOdo }
}

interface BlendRecommendation {
  type: 'blend' | 'e85_only' | 'tank_full'
  dilutantLiters: number
  e85Liters: number
  resultEthanolPct: number
  withinTolerance: boolean
  note?: string
}

function computeRecommendation(
  remainingLiters: number,
  currentEthanolLiters: number,
  tankCapacity: number,
  targetPct: number,   // 0–100
  tolerancePct: number, // 0–100
  dilutantEthFraction: number, // 0.10 or 0.05
): BlendRecommendation {
  const target = targetPct / 100
  const tolerance = tolerancePct / 100
  const T = Math.max(0, tankCapacity - remainingLiters)

  if (T < MIN_PUMP_LITERS) {
    return {
      type: 'tank_full',
      dilutantLiters: 0,
      e85Liters: 0,
      resultEthanolPct: remainingLiters > 0 ? (currentEthanolLiters / remainingLiters) * 100 : 0,
      withinTolerance: true,
    }
  }

  // Solve for x (dilutant litres):
  // currentEthanol + x·dilutantFrac + (T-x)·0.85 = target·(remaining + T)
  const numerator = target * (remainingLiters + T) - currentEthanolLiters - 0.85 * T
  const denominator = dilutantEthFraction - 0.85 // always negative

  const xIdeal = numerator / denominator

  let x: number
  if (xIdeal <= 0) {
    // No dilution needed (current ethanol already at or below target)
    x = 0
  } else if (xIdeal < MIN_PUMP_LITERS) {
    // Ideal is positive but below pump minimum — round UP to 5L and verify
    x = MIN_PUMP_LITERS
  } else {
    x = Math.round(xIdeal)
  }

  // Ensure at least 5L of E85 remains after dilutant
  if (x > 0 && T - x < MIN_PUMP_LITERS) {
    x = Math.round(T - MIN_PUMP_LITERS)
    if (x < MIN_PUMP_LITERS) x = 0
  }

  // If we rounded UP to 5L, verify the result is reasonably close to target
  // (within 2× tolerance); otherwise fall back to e85 only
  if (x === MIN_PUMP_LITERS && xIdeal < MIN_PUMP_LITERS) {
    const testPct =
      (currentEthanolLiters + x * dilutantEthFraction + (T - x) * 0.85) /
      (remainingLiters + T)
    if (Math.abs(testPct - target) > tolerance * 2) x = 0
  }

  const e85 = Math.round(T - x)

  if (x === 0) {
    const e85Only = Math.round(T)
    const onlyResultPct =
      (currentEthanolLiters + e85Only * 0.85) / (remainingLiters + e85Only)

    const note =
      onlyResultPct > target + tolerance
        ? 'Taux éthanol trop élevé — reporter la dilution au prochain plein.'
        : 'Taux déjà dans la cible.'

    return {
      type: 'e85_only',
      dilutantLiters: 0,
      e85Liters: e85Only,
      resultEthanolPct: onlyResultPct * 100,
      withinTolerance: Math.abs(onlyResultPct - target) <= tolerance,
      note,
    }
  }

  const resultEthanolLiters = currentEthanolLiters + x * dilutantEthFraction + e85 * 0.85
  const resultTotal = remainingLiters + x + e85
  const resultPct = resultTotal > 0 ? resultEthanolLiters / resultTotal : 0

  return {
    type: 'blend',
    dilutantLiters: x,
    e85Liters: e85,
    resultEthanolPct: resultPct * 100,
    withinTolerance: Math.abs(resultPct - target) <= tolerance,
  }
}

interface BlendCalculatorProps {
  conversion: FlexfuelConversion
  vehicle: Vehicle
  entries: FuelEntry[]
}

export function BlendCalculator({ conversion, vehicle, entries }: BlendCalculatorProps) {
  const [dilutantType, setDilutantType] = useState<DilutantType>('e10')
  const [currentOdo, setCurrentOdo] = useState<string>('')

  const dilutantEthFraction = dilutantType === 'e10' ? 0.10 : 0.05
  const dilutantLabel = dilutantType === 'e10' ? 'E10' : 'SP95'
  const tankCapacity = vehicle.tank_capacity ?? 50
  const conversionDate = conversion.conversion_date

  const avgConsumption = useMemo(
    () => computeAvgConsumption(entries, conversionDate),
    [entries, conversionDate],
  )

  // Tank state: fixed fractions for history — independent of dilutant selector
  const tankState = useMemo(
    () =>
      avgConsumption
        ? computeTankState(entries, conversionDate, avgConsumption, tankCapacity)
        : null,
    [entries, conversionDate, avgConsumption, tankCapacity],
  )

  const lastOdo = tankState?.lastOdo ?? 0
  const inputOdo = currentOdo !== '' ? Number(currentOdo) : lastOdo

  const { remainingLiters, currentEthanolPct } = useMemo(() => {
    if (!tankState || !avgConsumption) return { remainingLiters: 0, currentEthanolPct: 0 }
    const distance = Math.max(0, inputOdo - tankState.lastOdo)
    const consumed = (distance * avgConsumption) / 100
    const remaining = Math.min(Math.max(0, tankState.litersInTank - consumed), tankCapacity)
    const ethFraction =
      tankState.litersInTank > 0 ? tankState.ethanolLiters / tankState.litersInTank : 0
    return { remainingLiters: remaining, currentEthanolPct: ethFraction * 100 }
  }, [tankState, avgConsumption, inputOdo, tankCapacity])

  const currentEthanolLiters = (currentEthanolPct / 100) * remainingLiters

  const recommendation = useMemo(
    () =>
      computeRecommendation(
        remainingLiters,
        currentEthanolLiters,
        tankCapacity,
        conversion.target_ethanol_pct,
        conversion.ethanol_tolerance_pct,
        dilutantEthFraction,
      ),
    [remainingLiters, currentEthanolLiters, tankCapacity, conversion, dilutantEthFraction],
  )

  if (!avgConsumption) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-emerald-600" />
            Calculateur de mélange E85
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Pas assez de données depuis l'installation du boîtier. Enregistrez au moins deux pleins complets.
          </p>
        </CardContent>
      </Card>
    )
  }

  const targetMin = Math.round(conversion.target_ethanol_pct - conversion.ethanol_tolerance_pct)
  const targetMax = Math.round(conversion.target_ethanol_pct + conversion.ethanol_tolerance_pct)
  const resultPct = recommendation.resultEthanolPct
  const resultColor = recommendation.withinTolerance
    ? 'text-emerald-600 dark:text-emerald-400'
    : resultPct > targetMax
      ? 'text-orange-500'
      : 'text-blue-500'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="h-4 w-4 text-emerald-600" />
          Mélange E85
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Cible {conversion.target_ethanol_pct}% ± {conversion.ethanol_tolerance_pct}%
          &nbsp;· {tankCapacity} L &nbsp;· {avgConsumption.toFixed(1)} L/100km
        </p>
      </CardHeader>
      <CardContent className="space-y-3">

        {/* Inputs — compact for mobile */}
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Odomètre actuel (km)</Label>
            <Input
              type="number"
              inputMode="numeric"
              placeholder={String(lastOdo)}
              value={currentOdo}
              onChange={(e) => setCurrentOdo(e.target.value)}
              className="h-10 text-base"
            />
          </div>
          <div className="w-36 space-y-1">
            <Label className="text-xs">Diluant</Label>
            <Select value={dilutantType} onValueChange={(v) => setDilutantType(v as DilutantType)}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="e10">E10</SelectItem>
                <SelectItem value="sp95">SP95</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Recommendation — the main output, big and clear */}
        {recommendation.type === 'tank_full' ? (
          <p className="text-sm text-muted-foreground">Réservoir presque plein.</p>
        ) : recommendation.type === 'blend' ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
            <p className="text-lg font-bold text-emerald-800 dark:text-emerald-300">
              {recommendation.dilutantLiters} L {dilutantLabel}
              &nbsp;+ {recommendation.e85Liters} L E85
            </p>
            <p className={`mt-1 text-sm ${resultColor}`}>
              Résultat : {resultPct.toFixed(1)}% éthanol &nbsp;({targetMin}–{targetMax}%)
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-950/30">
            <p className="text-lg font-bold text-orange-800 dark:text-orange-300">
              {recommendation.e85Liters} L E85 uniquement
            </p>
            {recommendation.note && (
              <p className="mt-1 text-sm text-orange-700 dark:text-orange-400">
                {recommendation.note}
              </p>
            )}
            <p className={`mt-1 text-sm ${resultColor}`}>
              Résultat : {resultPct.toFixed(1)}% éthanol &nbsp;({targetMin}–{targetMax}%)
            </p>
          </div>
        )}

        {/* Details — secondary info, small */}
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>Restant estimé : {remainingLiters.toFixed(1)} L</span>
          <span>Éthanol actuel : {currentEthanolPct.toFixed(1)}%</span>
        </div>

      </CardContent>
    </Card>
  )
}
