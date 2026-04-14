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

function defaultSeasonMode(): SeasonMode {
  const m = new Date().getMonth()
  return m >= 3 && m <= 8 ? 'ete' : 'hiver'
}

interface TankState {
  litersInTank: number
  ethanolLiters: number
  lastOdo: number
}

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
      ethanolLiters = Math.min(
        ethFractionBefore * actualRemaining + e.liters * fillEthFraction,
        tankCapacity,
      )
    } else {
      litersInTank = Math.min(remaining + e.liters, tankCapacity)
      ethanolLiters = Math.min(
        ethFractionBefore * remaining + e.liters * fillEthFraction,
        litersInTank,
      )
    }
    prevOdo = e.odometer_reading
  }

  return { litersInTank, ethanolLiters, lastOdo: prevOdo }
}

// ─── Reference thresholds ──────────────────────────────────────────────────
// Two km landmarks computed from the current tank state:
//
// odoA — last km at which a FULL E85 fill would still land ≤ targetMax.
//   Derived from: r_A = tank × (targetMax − 0.85) / (ethFrac − 0.85)
//   At remaining = r_A, result = targetMax exactly.
//
// odoB — first km at which an OPTIMAL blend (min-pump dilutant → exact target)
//   becomes feasible. Diluting below 5 L is impossible at French pumps.
//   Derived from solving x_ideal = 5 in the blend formula:
//   r_B = [5 × (dilFrac − 0.85) − tank × (target − 0.85)] / (0.85 − ethFrac)

interface Thresholds {
  odoA: number | null  // null = already past
  odoB: number | null  // null = now (remaining ≤ rB already)
  odoBNow: boolean
}

function computeThresholds(
  remaining: number,
  ethFraction: number,
  tankCapacity: number,
  targetPct: number,
  tolerancePct: number,
  dilutantEthFraction: number,
  avgL100km: number,
  fromOdo: number,
): Thresholds {
  const eps = 0.001
  if (avgL100km <= 0 || Math.abs(ethFraction - 0.85) < eps) {
    return { odoA: null, odoB: null, odoBNow: false }
  }

  const targetMax = (targetPct + tolerancePct) / 100
  const target = targetPct / 100

  // Threshold A: last km for pure E85 fill ≤ targetMax
  const rA = (tankCapacity * (targetMax - 0.85)) / (ethFraction - 0.85)
  const odoA =
    rA >= 0 && remaining > rA
      ? Math.round(fromOdo + ((remaining - rA) * 100) / avgL100km)
      : null

  // Threshold B: first km where blend with exactly MIN_PUMP_LITERS dilutant → exact target
  const denomB = 0.85 - ethFraction
  let odoB: number | null = null
  let odoBNow = false
  if (denomB > eps) {
    const rB =
      (MIN_PUMP_LITERS * (dilutantEthFraction - 0.85) - tankCapacity * (target - 0.85)) / denomB
    if (rB <= 0 || remaining <= rB) {
      odoBNow = true
    } else {
      odoB = Math.round(fromOdo + ((remaining - rB) * 100) / avgL100km)
    }
  } else {
    odoBNow = true
  }

  return { odoA, odoB, odoBNow }
}

// ─── Winter smart recommendation ───────────────────────────────────────────

type WinterRec =
  | { type: 'tank_full'; currentPct: number }
  | { type: 'too_high'; partialLiters: number; resultPct: number }
  | {
      type: 'pure_e85'
      e85Liters: number
      resultPct: number
      kmSafe: number | null
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

  // Too high → partial fill only
  if (currentPct > targetPct + tolerancePct) {
    const partialL = 15
    const resultPct =
      ((ethanolLiters + partialL * 0.85) / (remainingLiters + partialL)) * 100
    return { type: 'too_high', partialLiters: partialL, resultPct }
  }

  // Pure E85 keeps ethanol within targetMax
  const afterE85Pct = (ethanolLiters + toAdd * 0.85) / tankCapacity
  if (afterE85Pct <= targetMax) {
    let kmSafe: number | null = null
    let kmRelative: number | null = null
    const f = afterE85Pct
    if (f < 0.85 - 0.001) {
      const rSafe = (tankCapacity * (targetMax - 0.85)) / (f - 0.85)
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

  // Blend needed
  const numerator = target * (remainingLiters + toAdd) - ethanolLiters - 0.85 * toAdd
  const denominator = dilutantEthFraction - 0.85
  const xIdeal = numerator / denominator

  let x: number
  if (xIdeal <= 0) {
    x = 0
  } else if (xIdeal < MIN_PUMP_LITERS) {
    x = MIN_PUMP_LITERS
  } else {
    x = Math.round(xIdeal)
    if (x < MIN_PUMP_LITERS) x = MIN_PUMP_LITERS
  }

  if (x > 0 && toAdd - x < MIN_PUMP_LITERS) {
    x = Math.ceil(toAdd - MIN_PUMP_LITERS)
    if (x < MIN_PUMP_LITERS) x = 0
  }

  if (x === 0) {
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
  embedded?: boolean
}

export function BlendCalculator({
  conversion,
  vehicle,
  entries,
  embedded = false,
}: BlendCalculatorProps) {
  const [dilutantType, setDilutantType] = useState<DilutantType>('e10')
  const [currentOdo, setCurrentOdo] = useState<string>('')
  const [season, setSeason] = useState<SeasonMode>(defaultSeasonMode)

  const dilutantEthFraction = dilutantType === 'e10' ? 0.1 : 0.05
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

  const thresholds = useMemo(
    () =>
      computeThresholds(
        remainingLiters,
        currentEthanolPct / 100,
        tankCapacity,
        target,
        tolerance,
        dilutantEthFraction,
        avgConsumption ?? 8,
        inputOdo,
      ),
    [remainingLiters, currentEthanolPct, tankCapacity, target, tolerance, dilutantEthFraction, avgConsumption, inputOdo],
  )

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
        Pas assez de données depuis l'installation du boîtier. Enregistrez au moins deux pleins
        complets.
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

  // ── Summer ────────────────────────────────────────────────────────────────
  const summerCard = (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <p className="text-lg font-bold text-amber-800 dark:text-amber-300">
        {Math.round(tankCapacity - remainingLiters)} L E85
      </p>
      <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
        Plein E85 pur — économies maximales
      </p>
    </div>
  )

  // ── Winter threshold cards ────────────────────────────────────────────────
  const { odoA, odoB, odoBNow } = thresholds

  const thresholdCards = (
    <div className="grid grid-cols-2 gap-2">
      {/* Card A: Pure E85 deadline */}
      <div
        className={`rounded-lg border p-3 ${
          odoA !== null
            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
            : 'border-border bg-muted/30'
        }`}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          E85 pur
        </p>
        {odoA !== null ? (
          <>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-tight">
              Jusqu'au km
            </p>
            <p className="text-base font-bold text-emerald-800 dark:text-emerald-200">
              {odoA.toLocaleString('fr-FR')}
            </p>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-500 mt-0.5">
              dans ~{(odoA - inputOdo).toLocaleString('fr-FR')} km
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-muted-foreground">Fenêtre passée</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              E85 pur ≥ {target + tolerance}%
            </p>
          </>
        )}
      </div>

      {/* Card B: Optimal blend threshold */}
      <div
        className={`rounded-lg border p-3 ${
          odoBNow
            ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30'
            : 'border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20'
        }`}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          Dilution {dilutantLabel}
        </p>
        {odoBNow ? (
          <>
            <p className="text-xs text-blue-700 dark:text-blue-400 leading-tight">Maintenant</p>
            <p className="text-base font-bold text-blue-800 dark:text-blue-200">
              km {inputOdo.toLocaleString('fr-FR')}
            </p>
            <p className="text-[11px] text-blue-600 dark:text-blue-500 mt-0.5">
              5 L+ {dilutantLabel} → {target}%
            </p>
          </>
        ) : (
          <>
            <p className="text-xs text-blue-700 dark:text-blue-400 leading-tight">
              À partir du km
            </p>
            <p className="text-base font-bold text-blue-800 dark:text-blue-200">
              {odoB!.toLocaleString('fr-FR')}
            </p>
            <p className="text-[11px] text-blue-600 dark:text-blue-500 mt-0.5">
              dans ~{(odoB! - inputOdo).toLocaleString('fr-FR')} km
            </p>
          </>
        )}
      </div>
    </div>
  )

  // ── Winter recommendation card ────────────────────────────────────────────
  let winterRecCard: React.ReactNode
  if (winterRec.type === 'tank_full') {
    winterRecCard = (
      <p className="text-sm text-muted-foreground">Réservoir presque plein.</p>
    )
  } else if (winterRec.type === 'too_high') {
    winterRecCard = (
      <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-950/30">
        <p className="text-xs font-medium text-orange-700 dark:text-orange-400 mb-1">
          Taux élevé ({currentEthanolPct.toFixed(0)}%) — ne pas faire le plein
        </p>
        <p className="text-lg font-bold text-orange-800 dark:text-orange-300">
          {winterRec.partialLiters} L E85 uniquement
        </p>
        <p className="mt-1 text-sm text-orange-700 dark:text-orange-400">
          Résultat : {winterRec.resultPct.toFixed(1)}%
        </p>
        <p className="mt-2 text-xs text-orange-600 dark:text-orange-500">
          Au prochain plein, dilue avec {dilutantLabel}
        </p>
      </div>
    )
  } else if (winterRec.type === 'pure_e85') {
    winterRecCard = (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
        <p className="text-lg font-bold text-emerald-800 dark:text-emerald-300">
          {winterRec.e85Liters} L E85 pur
        </p>
        <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400">
          Résultat : {winterRec.resultPct.toFixed(1)}% — cible ≤ {target + tolerance}%
        </p>
        {winterRec.kmSafe !== null && winterRec.kmRelative !== null && (
          <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-500">
            Dilution nécessaire vers le km {winterRec.kmSafe.toLocaleString('fr-FR')} (dans ~
            {winterRec.kmRelative.toLocaleString('fr-FR')} km)
          </p>
        )}
      </div>
    )
  } else {
    const resultColor = winterRec.withinTolerance
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-orange-500'
    winterRecCard = (
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

      {season === 'ete' ? (
        <>
          {/* Summer: odometer input + pure E85 card */}
          <Input
            type="number"
            inputMode="numeric"
            placeholder={String(lastOdo)}
            value={currentOdo}
            onChange={(e) => setCurrentOdo(e.target.value)}
            className="h-10 text-base"
            aria-label="Odomètre actuel (km)"
          />
          {summerCard}
        </>
      ) : (
        <>
          {/* Winter: dilutant selector + reference thresholds */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Diluant</span>
            <Select
              value={dilutantType}
              onValueChange={(v) => setDilutantType(v as DilutantType)}
            >
              <SelectTrigger className="h-8 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="e10">E10</SelectItem>
                <SelectItem value="sp95">SP95</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {thresholdCards}

          {/* Separator */}
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">Calculer pour un odomètre précis</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Odometer input */}
          <Input
            type="number"
            inputMode="numeric"
            placeholder={String(lastOdo)}
            value={currentOdo}
            onChange={(e) => setCurrentOdo(e.target.value)}
            className="h-10 text-base"
            aria-label="Odomètre actuel (km)"
          />

          {/* Recommendation */}
          {winterRecCard}
        </>
      )}

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
