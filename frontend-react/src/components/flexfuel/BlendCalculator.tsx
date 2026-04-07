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

// Ethanol content by fuel type (fraction 0–1)
const ETHANOL_FRACTION: Record<string, number> = {
  e85: 0.85,
  essence: 0.05, // overridden by dilutantPct when filling — used for history
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

/** Compute average L/100km from fill history using fill-to-fill method. */
function computeAvgConsumption(entries: FuelEntry[]): number | null {
  const sorted = [...entries].sort((a, b) => {
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
 * Walk through all fills in chronological order and track
 * litres of ethanol + total litres in tank after each fill.
 * Returns state after the last recorded fill.
 */
function computeTankState(
  entries: FuelEntry[],
  dilutantEthPct: number, // fraction for 'essence' fills
  avgL100km: number,
): TankState {
  const sorted = [...entries].sort((a, b) => {
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
    const remaining = Math.max(0, litersInTank - consumed)
    const ethRemaining = litersInTank > 0 ? (ethanolLiters / litersInTank) * remaining : 0

    const fillEthFraction =
      e.fuel_type === 'e85'
        ? 0.85
        : e.fuel_type === 'essence'
          ? dilutantEthPct
          : ETHANOL_FRACTION[e.fuel_type] ?? 0

    litersInTank = remaining + e.liters
    ethanolLiters = ethRemaining + e.liters * fillEthFraction
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
  targetPct: number, // 0–100
  tolerancePct: number, // 0–100
  dilutantEthFraction: number, // 0.10 or 0.05
): BlendRecommendation {
  const target = targetPct / 100
  const tolerance = tolerancePct / 100
  const T = Math.max(0, tankCapacity - remainingLiters) // total to add

  if (T < MIN_PUMP_LITERS) {
    return {
      type: 'tank_full',
      dilutantLiters: 0,
      e85Liters: 0,
      resultEthanolPct: remainingLiters > 0 ? (currentEthanolLiters / remainingLiters) * 100 : 0,
      withinTolerance: true,
    }
  }

  // Solve: currentEthanolLiters + x * dilutantEthFraction + (T - x) * 0.85 = target * (remainingLiters + T)
  // x * (dilutantEthFraction - 0.85) = target * (remainingLiters + T) - currentEthanolLiters - 0.85 * T
  const numerator =
    target * (remainingLiters + T) - currentEthanolLiters - 0.85 * T
  const denominator = dilutantEthFraction - 0.85 // negative

  let x = numerator / denominator

  // Round to nearest liter
  x = Math.round(x)

  // Apply pump minimum (5L) constraint
  if (x < MIN_PUMP_LITERS) x = 0 // can't dispense < 5L → skip dilutant
  if (T - x < MIN_PUMP_LITERS) {
    // E85 part would be < 5L — back off dilutant
    x = Math.round(T - MIN_PUMP_LITERS)
    if (x < MIN_PUMP_LITERS) x = 0 // no valid split → E85 only
  }

  const dilutant = x
  const e85 = Math.round(T - x)

  const resultEthanol =
    currentEthanolLiters + dilutant * dilutantEthFraction + e85 * 0.85
  const resultTotal = remainingLiters + dilutant + e85
  const resultPct = resultTotal > 0 ? resultEthanol / resultTotal : 0

  if (dilutant === 0) {
    // Couldn't add dilutant — check why
    const e85Only = Math.round(T)
    const onlyResultPct =
      resultTotal > 0
        ? (currentEthanolLiters + e85Only * 0.85) / (remainingLiters + e85Only)
        : 0

    const currentPct = remainingLiters > 0 ? currentEthanolLiters / remainingLiters : 0
    const note =
      currentPct > target + tolerance
        ? 'Taux éthanol trop élevé pour diluer ce plein — reporter au prochain plein.'
        : 'Dilution non nécessaire ce plein.'

    return {
      type: 'e85_only',
      dilutantLiters: 0,
      e85Liters: e85Only,
      resultEthanolPct: onlyResultPct * 100,
      withinTolerance: Math.abs(onlyResultPct - target) <= tolerance,
      note,
    }
  }

  return {
    type: 'blend',
    dilutantLiters: dilutant,
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

  const avgConsumption = useMemo(() => computeAvgConsumption(entries), [entries])

  // State after last recorded fill (using selected dilutant fraction for 'essence' history)
  const tankStateAfterLastFill = useMemo(
    () =>
      avgConsumption
        ? computeTankState(entries, dilutantEthFraction, avgConsumption)
        : null,
    [entries, dilutantEthFraction, avgConsumption],
  )

  const lastOdo = tankStateAfterLastFill?.lastOdo ?? 0
  const inputOdo = currentOdo !== '' ? Number(currentOdo) : lastOdo

  // Estimate remaining fuel accounting for distance since last fill
  const { remainingLiters, currentEthanolPct } = useMemo(() => {
    if (!tankStateAfterLastFill || !avgConsumption) {
      return { remainingLiters: 0, currentEthanolPct: 0 }
    }
    const distance = Math.max(0, inputOdo - tankStateAfterLastFill.lastOdo)
    const consumed = (distance * avgConsumption) / 100
    const remaining = Math.max(0, tankStateAfterLastFill.litersInTank - consumed)
    const ethFraction =
      tankStateAfterLastFill.litersInTank > 0
        ? tankStateAfterLastFill.ethanolLiters / tankStateAfterLastFill.litersInTank
        : 0
    return {
      remainingLiters: remaining,
      currentEthanolPct: ethFraction * 100,
    }
  }, [tankStateAfterLastFill, avgConsumption, inputOdo])

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
    [
      remainingLiters,
      currentEthanolLiters,
      tankCapacity,
      conversion.target_ethanol_pct,
      conversion.ethanol_tolerance_pct,
      dilutantEthFraction,
    ],
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
            Pas assez de données de consommation pour calculer le mélange.
            Enregistrez au moins deux pleins complets.
          </p>
        </CardContent>
      </Card>
    )
  }

  const targetMin = conversion.target_ethanol_pct - conversion.ethanol_tolerance_pct
  const targetMax = conversion.target_ethanol_pct + conversion.ethanol_tolerance_pct
  const resultColor =
    recommendation.withinTolerance
      ? 'text-emerald-600'
      : recommendation.resultEthanolPct > targetMax
        ? 'text-orange-500'
        : 'text-blue-500'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="h-4 w-4 text-emerald-600" />
          Calculateur de mélange E85
        </CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          Cible : {conversion.target_ethanol_pct}% éthanol ± {conversion.ethanol_tolerance_pct}%
          &nbsp;&middot;&nbsp;Réservoir : {tankCapacity} L
          &nbsp;&middot;&nbsp;Conso moy. : {avgConsumption.toFixed(1)} L/100km
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Odomètre actuel (km)</Label>
            <Input
              type="number"
              inputMode="numeric"
              placeholder={String(lastOdo)}
              value={currentOdo}
              onChange={(e) => setCurrentOdo(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Diluant disponible</Label>
            <Select value={dilutantType} onValueChange={(v) => setDilutantType(v as DilutantType)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="e10">E10 (10% éthanol)</SelectItem>
                <SelectItem value="sp95">SP95 (5% éthanol)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tank state */}
        <div className="rounded-md bg-muted/50 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Restant estimé</span>
            <span className="font-medium">{remainingLiters.toFixed(1)} L</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Éthanol actuel estimé</span>
            <span className="font-medium">{currentEthanolPct.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">À ajouter (fill to full)</span>
            <span className="font-medium">
              {Math.max(0, tankCapacity - remainingLiters).toFixed(0)} L
            </span>
          </div>
        </div>

        {/* Recommendation */}
        {recommendation.type === 'tank_full' ? (
          <p className="text-sm text-muted-foreground">Réservoir presque plein, pas de recommandation.</p>
        ) : recommendation.type === 'blend' ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              Mets d'abord {recommendation.dilutantLiters} L de {dilutantLabel},
              puis {recommendation.e85Liters} L de E85
            </p>
            <p className={`mt-1 text-xs ${resultColor}`}>
              Taux éthanol résultant : {recommendation.resultEthanolPct.toFixed(1)}%
              &nbsp;(cible {targetMin.toFixed(0)}–{targetMax.toFixed(0)}%)
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-950/30">
            <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">
              Plein E85 uniquement : {recommendation.e85Liters} L
            </p>
            {recommendation.note && (
              <p className="mt-1 text-xs text-orange-700 dark:text-orange-400">
                {recommendation.note}
              </p>
            )}
            <p className={`mt-1 text-xs ${resultColor}`}>
              Taux éthanol résultant : {recommendation.resultEthanolPct.toFixed(1)}%
              &nbsp;(cible {targetMin.toFixed(0)}–{targetMax.toFixed(0)}%)
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
