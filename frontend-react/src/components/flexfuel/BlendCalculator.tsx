import { useState, useMemo } from 'react'
import { FlaskConical } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
type SeasonMode = 'hiver' | 'ete'

// Months 10–3 = winter, 4–9 = summer (0-indexed JS month)
function defaultSeasonMode(): SeasonMode {
  const m = new Date().getMonth()
  return m >= 3 && m <= 8 ? 'ete' : 'hiver'
}

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
    const ethFractionBefore = litersInTank > 0 ? ethanolLiters / litersInTank : 0
    const fillEthFraction = ETHANOL_FRACTION[e.fuel_type] ?? 0

    if (e.is_full_tank) {
      const actualRemaining = Math.min(remaining, Math.max(0, tankCapacity - e.liters))
      litersInTank = tankCapacity
      ethanolLiters = Math.min(ethFractionBefore * actualRemaining + e.liters * fillEthFraction, tankCapacity)
    } else {
      litersInTank = Math.min(remaining + e.liters, tankCapacity)
      ethanolLiters = Math.min(ethFractionBefore * remaining + e.liters * fillEthFraction, litersInTank)
    }
    prevOdo = e.odometer_reading
  }

  return { litersInTank, ethanolLiters, lastOdo: prevOdo }
}

// ─── Winter smart recommendation ───────────────────────────────────────────

type WinterRec =
  | { type: 'tank_full'; currentPct: number }
  | { type: 'too_high'; partialLiters: number; resultPct: number }
  | {
      type: 'pure_e85'
      e85Liters: number
      resultPct: number
      /** Absolute odometer at which the NEXT pure-E85 fill would exceed targetMax. */
      kmSafe: number | null
      /** Distance from currentOdo to kmSafe. */
      kmRelative: number | null
    }
  | { type: 'blend'; dilutantLiters: number; e85Liters: number; resultPct: number; withinTolerance: boolean }

function computeWinterRec(
  remainingLiters: number,
  ethanolLiters: number,
  tankCapacity: number,
  targetPct: number,
  tolerancePct: number,
  dilutantEthFraction: number,
  avgL100km: number,
  currentOdo: number,
): WinterRec {
  const ethFraction = remainingLiters > 0 ? ethanolLiters / remainingLiters : 0
  const currentPct = ethFraction * 100
  const targetMax = (targetPct + tolerancePct) / 100
  const target = targetPct / 100
  const toAdd = tankCapacity - remainingLiters

  if (toAdd < MIN_PUMP_LITERS) {
    return { type: 'tank_full', currentPct }
  }

  // ── Case 1: ethanol too high → partial fill only, dilute next time ─────────
  if (currentPct > targetPct + tolerancePct) {
    const partialL = 15
    const resultPct = ((ethanolLiters + partialL * 0.85) / (remainingLiters + partialL)) * 100
    return { type: 'too_high', partialLiters: partialL, resultPct }
  }

  // ── Case 2: pure E85 fill keeps ethanol within targetMax → recommend E85 ──
  const afterE85Pct = (ethanolLiters + toAdd * 0.85) / tankCapacity

  if (afterE85Pct <= targetMax) {
    // Compute km until NEXT pure-E85 fill would push above targetMax.
    // After this fill: full tank at afterE85Pct.
    // As we drive, remaining ↓ but ethanol fraction stays the same.
    // At remaining = rSafe, a full E85 refill hits exactly targetMax.
    // rSafe = T * (targetMax - 0.85) / (afterE85Pct - 0.85)
    let kmSafe: number | null = null
    let kmRelative: number | null = null
    const f = afterE85Pct
    if (f < 0.85 - 0.001) {
      const rSafe = tankCapacity * (targetMax - 0.85) / (f - 0.85)
      if (rSafe >= 0 && rSafe < tankCapacity) {
        const dist = ((tankCapacity - rSafe) * 100) / avgL100km
        kmSafe = Math.round(currentOdo + dist)
        kmRelative = Math.round(dist)
      }
    }
    return {
      type: 'pure_e85',
      e85Liters: Math.round(toAdd),
      resultPct: afterE85Pct * 100,
      kmSafe,
      kmRelative,
    }
  }

  // ── Case 3: pure E85 would overshoot → blend needed ───────────────────────
  const numerator = target * (remainingLiters + toAdd) - ethanolLiters - 0.85 * toAdd
  const denominator = dilutantEthFraction - 0.85 // always negative
  const xIdeal = numerator / denominator

  let x: number
  if (xIdeal <= 0) {
    x = 0
  } else if (xIdeal < MIN_PUMP_LITERS) {
    x = MIN_PUMP_LITERS // round up in winter — more dilutant keeps result ≤ target
  } else {
    x = Math.ceil(xIdeal)
  }

  if (x > 0 && toAdd - x < MIN_PUMP_LITERS) {
    x = Math.ceil(toAdd - MIN_PUMP_LITERS)
    if (x < MIN_PUMP_LITERS) x = 0
  }

  if (x === 0) {
    // Can't blend effectively
    return {
      type: 'pure_e85',
      e85Liters: Math.round(toAdd),
      resultPct: afterE85Pct * 100,
      kmSafe: null,
      kmRelative: null,
    }
  }

  const e85 = Math.round(toAdd - x)
  const resultEthanol = ethanolLiters + x * dilutantEthFraction + e85 * 0.85
  const resultTotal = remainingLiters + x + e85
  const resultPct = resultTotal > 0 ? (resultEthanol / resultTotal) * 100 : 0
  const withinTolerance =
    resultPct <= targetPct + tolerancePct && resultPct >= targetPct - tolerancePct

  return { type: 'blend', dilutantLiters: x, e85Liters: e85, resultPct, withinTolerance }
}

// ─── Component ─────────────────────────────────────────────────────────────

interface BlendCalculatorProps {
  conversion: FlexfuelConversion
  vehicle: Vehicle
  entries: FuelEntry[]
  /** When true, renders without Card wrapper (used inside a Dialog that provides its own title). */
  embedded?: boolean
}

export function BlendCalculator({ conversion, vehicle, entries, embedded = false }: BlendCalculatorProps) {
  const [dilutantType, setDilutantType] = useState<DilutantType>('e10')
  const [currentOdo, setCurrentOdo] = useState<string>('')
  const [season, setSeason] = useState<SeasonMode>(defaultSeasonMode)

  const dilutantEthFraction = dilutantType === 'e10' ? 0.10 : 0.05
  const dilutantLabel = dilutantType === 'e10' ? 'E10' : 'SP95'
  const tankCapacity = vehicle.tank_capacity ?? 50
  const conversionDate = conversion.conversion_date
  const target = conversion.target_ethanol_pct
  const tolerance = conversion.ethanol_tolerance_pct

  const avgConsumption = useMemo(
    () => computeAvgConsumption(entries, conversionDate),
    [entries, conversionDate],
  )

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

  const ethanolLiters = (currentEthanolPct / 100) * remainingLiters

  const winterRec = useMemo(
    () =>
      computeWinterRec(
        remainingLiters,
        ethanolLiters,
        tankCapacity,
        target,
        tolerance,
        dilutantEthFraction,
        avgConsumption ?? 8,
        inputOdo,
      ),
    [remainingLiters, ethanolLiters, tankCapacity, target, tolerance, dilutantEthFraction, avgConsumption, inputOdo],
  )

  if (!avgConsumption) {
    const noDataContent = (
      <p className="text-sm text-muted-foreground">
        Pas assez de données depuis l'installation du boîtier. Enregistrez au moins deux pleins complets.
      </p>
    )
    if (embedded) return noDataContent
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-emerald-600" />
            Calculateur de mélange E85
          </CardTitle>
        </CardHeader>
        <CardContent>{noDataContent}</CardContent>
      </Card>
    )
  }

  // ── Summer rendering ──────────────────────────────────────────────────────
  const summerContent = (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <p className="text-lg font-bold text-amber-800 dark:text-amber-300">
        {Math.round(tankCapacity - remainingLiters)} L E85
      </p>
      <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
        Plein E85 pur — économies maximales
      </p>
    </div>
  )

  // ── Winter rendering ──────────────────────────────────────────────────────
  const showDilutantSelector = season === 'hiver' && winterRec.type === 'blend'

  let winterContent: React.ReactNode
  if (winterRec.type === 'tank_full') {
    winterContent = (
      <p className="text-sm text-muted-foreground">Réservoir presque plein.</p>
    )
  } else if (winterRec.type === 'too_high') {
    winterContent = (
      <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-950/30">
        <p className="text-sm font-medium text-orange-700 dark:text-orange-400 mb-1">
          Taux éthanol élevé ({currentEthanolPct.toFixed(0)}%) — ne pas faire le plein
        </p>
        <p className="text-lg font-bold text-orange-800 dark:text-orange-300">
          Ajoute seulement {winterRec.partialLiters} L E85
        </p>
        <p className="mt-1 text-sm text-orange-700 dark:text-orange-400">
          Résultat : {winterRec.resultPct.toFixed(1)}% — cible ≤ {target + tolerance}%
        </p>
        <p className="mt-2 text-xs text-orange-600 dark:text-orange-500">
          Au prochain plein, dilue avec E10 ou SP95
        </p>
      </div>
    )
  } else if (winterRec.type === 'pure_e85') {
    winterContent = (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
        <p className="text-lg font-bold text-emerald-800 dark:text-emerald-300">
          {winterRec.e85Liters} L E85 pur
        </p>
        <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400">
          Résultat : {winterRec.resultPct.toFixed(1)}% — cible ≤ {target + tolerance}%
        </p>
        {winterRec.kmSafe !== null && winterRec.kmRelative !== null && (
          <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-500">
            Prochaine dilution nécessaire vers le km {winterRec.kmSafe.toLocaleString('fr-FR')}
            {' '}(dans ~{winterRec.kmRelative.toLocaleString('fr-FR')} km)
          </p>
        )}
      </div>
    )
  } else if (winterRec.type === 'blend') {
    const resultColor = winterRec.withinTolerance
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-orange-500'
    winterContent = (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
        <p className="text-lg font-bold text-blue-800 dark:text-blue-300">
          {winterRec.dilutantLiters} L {dilutantLabel}&nbsp;+&nbsp;{winterRec.e85Liters} L E85
        </p>
        <p className={`mt-1 text-sm ${resultColor}`}>
          Résultat : {winterRec.resultPct.toFixed(1)}% — cible ≤ {target + tolerance}%
        </p>
      </div>
    )
  }

  const content = (
    <div className="space-y-3">
      {/* Season toggle */}
      <div className="flex rounded-md border overflow-hidden text-sm font-medium w-fit">
        <button
          type="button"
          onClick={() => setSeason('hiver')}
          className={`px-3 py-2 transition-colors ${
            season === 'hiver'
              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          ❄ Hiver
        </button>
        <button
          type="button"
          onClick={() => setSeason('ete')}
          className={`px-3 py-2 transition-colors ${
            season === 'ete'
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          ☀ Été
        </button>
      </div>

      {/* Odometer + dilutant selector (only in blend case) */}
      <div className="flex gap-2">
        <Input
          type="number"
          inputMode="numeric"
          placeholder={String(lastOdo)}
          value={currentOdo}
          onChange={(e) => setCurrentOdo(e.target.value)}
          className="h-10 flex-1 text-base"
          aria-label="Odomètre actuel (km)"
        />
        {showDilutantSelector && (
          <Select value={dilutantType} onValueChange={(v) => setDilutantType(v as DilutantType)}>
            <SelectTrigger className="h-10 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="e10">E10</SelectItem>
              <SelectItem value="sp95">SP95</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Recommendation */}
      {season === 'ete' ? summerContent : winterContent}

      {/* Details */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>Restant : {remainingLiters.toFixed(1)} L</span>
        <span>Éthanol actuel : {currentEthanolPct.toFixed(1)}%</span>
      </div>
    </div>
  )

  if (embedded) return content

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="h-4 w-4 text-emerald-600" />
          Mélange E85
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Cible {target}% &nbsp;· {tankCapacity} L &nbsp;· {avgConsumption.toFixed(1)} L/100km
        </p>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  )
}
