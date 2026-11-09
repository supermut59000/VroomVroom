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
import {
  computeAvgConsumption,
  computeTankState,
  computeThresholds,
  computeWinterRec,
  e85EthanolFraction,
  simulateFutureFills,
} from '@/lib/blend-math'
import type { DilutantType } from '@/lib/blend-math'

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
  const [intervalKm, setIntervalKm] = useState<string>('300')
  const [intervalOverrides, setIntervalOverrides] = useState<Record<number, number>>({})
  const [showFutureFills, setShowFutureFills] = useState(false)

  const dilutantEthFraction = dilutantType === 'e10' ? 0.1 : 0.05
  const dilutantLabel = dilutantType === 'e10' ? 'E10' : 'SP98'
  const e85EthFraction = e85EthanolFraction()
  const tankCapacity = vehicle.tank_capacity
  // Aliased condition so the memos below narrow tankCapacity to number.
  const hasTankCapacity = tankCapacity != null
  const conversionDate = conversion.conversion_date
  const target = conversion.target_ethanol_pct
  const tolerance = conversion.ethanol_tolerance_pct

  const avgConsumption = useMemo(
    () => computeAvgConsumption(entries, conversionDate),
    [entries, conversionDate],
  )

  const tankState = useMemo(
    () =>
      hasTankCapacity
        ? computeTankState(entries, conversionDate, tankCapacity)
        : null,
    [entries, conversionDate, tankCapacity],
  )

  const lastOdo = tankState?.lastOdo ?? 0
  const inputOdo = currentOdo !== '' ? Number(currentOdo) : lastOdo

  const { remainingLiters, currentEthanolPct } = useMemo(() => {
    if (!tankState || !avgConsumption || tankCapacity == null) return { remainingLiters: 0, currentEthanolPct: 0 }
    const distance = Math.max(0, inputOdo - tankState.lastOdo)
    const consumed = (distance * avgConsumption) / 100
    const remaining = Math.min(Math.max(0, tankState.litersInTank - consumed), tankCapacity)
    const ethFraction =
      tankState.litersInTank > 0 ? tankState.ethanolLiters / tankState.litersInTank : 0
    return { remainingLiters: remaining, currentEthanolPct: ethFraction * 100 }
  }, [tankState, avgConsumption, inputOdo, tankCapacity])

  const ethanolLiters = (currentEthanolPct / 100) * remainingLiters

  // ── Max E85 partial fill — largest amount of E85 you can add right now
  //    without exceeding targetMax ethanol.
  //
  //    Solve with today's conservative seasonal E85 fraction.
  //
  //    Capped at (tankCapacity − remaining) — can't overfill the tank.
  //
  //    In the E85-pur zone x ≥ full-tank capacity → show as "plein complet".
  //    In the dead zone (past odoA) x < full-tank → actionable partial fill.
  const limitFill = useMemo(() => {
    if (tankCapacity == null) return null
    const targetFrac = (target + tolerance) / 100
    const maxFill = tankCapacity - remainingLiters
    if (maxFill <= 0 || remainingLiters <= 0) return null
    if (e85EthFraction <= targetFrac) {
      const resultPct = ((ethanolLiters + maxFill * e85EthFraction) / tankCapacity) * 100
      const addedKm = avgConsumption ? Math.round(maxFill * 100 / avgConsumption) : null
      return { liters: maxFill, resultPct, addedKm, isFull: true }
    }
    const denom = e85EthFraction - targetFrac
    const ethFrac = ethanolLiters / remainingLiters
    if (ethFrac >= targetFrac) return null // already above limit, no E85 makes it better
    const x = (remainingLiters * targetFrac - ethanolLiters) / denom
    if (x <= 0) return null
    const liters = Math.min(x, maxFill)
    const resultPct = ((ethanolLiters + liters * e85EthFraction) / (remainingLiters + liters)) * 100
    const addedKm = avgConsumption ? Math.round(liters * 100 / avgConsumption) : null
    const isFull = x >= maxFill - 0.5 // x_ideal >= full tank → this IS the full tank
    return { liters, resultPct, addedKm, isFull }
  }, [remainingLiters, ethanolLiters, tankCapacity, target, tolerance, avgConsumption, e85EthFraction])

  const thresholds = useMemo(
    () =>
      tankCapacity == null
        ? { odoA: null, odoB: null, odoBNow: false, pureE85AlwaysSafe: false }
        : computeThresholds(
            remainingLiters,
            currentEthanolPct / 100,
            tankCapacity,
            target,
            tolerance,
            dilutantEthFraction,
            avgConsumption ?? 8,
            inputOdo,
            e85EthFraction,
          ),
    [remainingLiters, currentEthanolPct, tankCapacity, target, tolerance, dilutantEthFraction, avgConsumption, inputOdo, e85EthFraction],
  )

  const winterRec = useMemo(
    () =>
      tankCapacity == null
        ? ({ type: 'tank_full', currentPct: 0 } as const)
        : computeWinterRec(
            remainingLiters,
            ethanolLiters,
            tankCapacity,
            target,
            tolerance,
            dilutantEthFraction,
            avgConsumption ?? 8,
            inputOdo,
            e85EthFraction,
          ),
    [remainingLiters, ethanolLiters, tankCapacity, target, tolerance, dilutantEthFraction, avgConsumption, inputOdo, e85EthFraction],
  )

  const intervalKmNum = intervalKm !== '' ? Number(intervalKm) : 300
  const intervals = Array.from({ length: 4 }, (_, i) => intervalOverrides[i] ?? intervalKmNum)
  const futureFills = useMemo(
    () =>
      tankCapacity != null && avgConsumption && intervals.every((v) => v > 0)
        ? simulateFutureFills(
            remainingLiters,
            ethanolLiters,
            inputOdo,
            intervals,
            tankCapacity,
            avgConsumption,
            target,
            tolerance,
            dilutantEthFraction,
            e85EthFraction,
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [remainingLiters, ethanolLiters, inputOdo, JSON.stringify(intervals), tankCapacity, avgConsumption, target, tolerance, dilutantEthFraction, e85EthFraction],
  )

  // The whole blend/tank math needs a real tank size; a silent 50 L default
  // produces precise-looking but wrong percentages (backend stats also refuse
  // range_km without tank_capacity). Ask for the field instead.
  // MUST stay after every hook above: a null→set tank_capacity re-render
  // before this return would change the hook count and crash React.
  if (tankCapacity == null) {
    const hint = (
      <p className="text-sm text-muted-foreground">
        Renseignez la capacité du réservoir dans les infos du véhicule pour utiliser le
        calculateur de mélange.
      </p>
    )
    if (embedded) return hint
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-[var(--tag-ethanol-text)]" />
            Calculateur de mélange E85
          </CardTitle>
        </CardHeader>
        <CardContent>{hint}</CardContent>
      </Card>
    )
  }

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
            <FlaskConical className="h-4 w-4 text-[var(--tag-ethanol-text)]" />
            Calculateur de mélange E85
          </CardTitle>
        </CardHeader>
        <CardContent>{noDataContent}</CardContent>
      </Card>
    )
  }

  // ── Threshold cards ───────────────────────────────────────────────────────
  const { odoA, odoB, odoBNow } = thresholds

  const thresholdCards = (
    <div className="grid grid-cols-2 gap-2">
      {/* Card A: Pure E85 deadline */}
      <div
        className={`rounded-lg border p-3 ${
          odoA !== null
            ? 'border-[var(--ethanol)]/40 bg-[var(--tag-ethanol-bg)] dark:border-[var(--ethanol)]/40 dark:bg-[var(--tag-ethanol-bg)]/30'
            : limitFill
              ? 'border-[var(--partial)]/40 bg-[var(--tag-partial-bg)] dark:border-[var(--partial)]/40 dark:bg-[var(--tag-partial-bg)]/30'
              : 'border-border bg-muted/30'
        }`}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          E85 pur
        </p>
        {odoA !== null ? (
          <>
            <p className="text-xs text-[var(--tag-ethanol-text)] dark:text-[var(--ethanol)] leading-tight">
              Jusqu'au km
            </p>
            <p className="text-base font-bold text-[var(--tag-ethanol-text)] dark:text-[var(--ethanol)]">
              {odoA.toLocaleString('fr-FR')}
            </p>
            <p className="text-[11px] text-[var(--tag-ethanol-text)] dark:text-[var(--ethanol)] mt-0.5">
              dans ~{(odoA - inputOdo).toLocaleString('fr-FR')} km
            </p>
            {limitFill && limitFill.addedKm !== null && (
              <p className="text-[11px] text-[var(--tag-ethanol-text)] dark:text-[var(--ethanol)] mt-1 border-t border-[var(--ethanol)]/40 dark:border-[var(--ethanol)]/40 pt-1">
                {limitFill.isFull
                  ? `Plein complet: ${Math.round(limitFill.liters)} L → ${Math.round(limitFill.resultPct)}% · +${limitFill.addedKm} km`
                  : `Max: ${Math.round(limitFill.liters)} L → ${Math.round(limitFill.resultPct)}% · +${limitFill.addedKm} km`}
              </p>
            )}
          </>
        ) : limitFill ? (
          <>
            <p className="text-xs text-[var(--tag-partial-text)] dark:text-[var(--partial)] leading-tight">
              Partiel possible
            </p>
            <p className="text-base font-bold text-[var(--tag-partial-text)] dark:text-[var(--partial)]">
              {Math.round(limitFill.liters)} L E85
            </p>
            <p className="text-[11px] text-[var(--tag-partial-text)] dark:text-[var(--partial)] mt-0.5">
              → {Math.round(limitFill.resultPct)}%
              {limitFill.addedKm !== null && ` · +${limitFill.addedKm} km`}
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
            ? 'border-[var(--c-blue)]/40 bg-[var(--tag-info-bg)] dark:border-[var(--c-blue)]/40 dark:bg-[var(--tag-info-bg)]/30'
            : 'border-[var(--c-blue)]/40 bg-[var(--tag-info-bg)]/50 dark:border-[var(--c-blue)]/40 dark:bg-[var(--tag-info-bg)]/20'
        }`}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          Dilution {dilutantLabel}
        </p>
        {odoBNow ? (
          <>
            <p className="text-base font-bold text-[var(--tag-info-text)] dark:text-[var(--c-blue)] leading-tight">Maintenant</p>
            <p className="text-[11px] text-[var(--tag-info-text)] dark:text-[var(--c-blue)] mt-0.5">
              5 L+ {dilutantLabel} → {target}%
            </p>
          </>
        ) : odoB !== null ? (
          <>
            <p className="text-xs text-[var(--tag-info-text)] dark:text-[var(--c-blue)] leading-tight">
              À partir du km
            </p>
            <p className="text-base font-bold text-[var(--tag-info-text)] dark:text-[var(--c-blue)]">
              {odoB.toLocaleString('fr-FR')}
            </p>
            <p className="text-[11px] text-[var(--tag-info-text)] dark:text-[var(--c-blue)] mt-0.5">
              dans ~{(odoB - inputOdo).toLocaleString('fr-FR')} km
            </p>
          </>
        ) : (
          <p className="text-sm font-medium text-muted-foreground">–</p>
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
  } else if (winterRec.type === 'pure_e85') {
    winterRecCard = (
      <div className="rounded-lg border border-[var(--ethanol)]/40 bg-[var(--tag-ethanol-bg)] p-4 dark:border-[var(--ethanol)]/40 dark:bg-[var(--tag-ethanol-bg)]/30">
        <p className="text-lg font-bold text-[var(--tag-ethanol-text)] dark:text-[var(--ethanol)]">
          {Math.round(winterRec.e85Liters)} L E85 pur
        </p>
        <p className="mt-1 text-sm text-[var(--tag-ethanol-text)] dark:text-[var(--ethanol)]">
          Résultat : {Math.round(winterRec.resultPct)}% (cible ≤ {target + tolerance}%)
        </p>
        {winterRec.kmSafe !== null && winterRec.kmRelative !== null && (
          <p className="mt-2 text-xs text-[var(--tag-ethanol-text)] dark:text-[var(--ethanol)]">
            Dilution nécessaire vers le km {winterRec.kmSafe.toLocaleString('fr-FR')} (dans ~
            {winterRec.kmRelative.toLocaleString('fr-FR')} km)
          </p>
        )}
      </div>
    )
  } else {
    const resultColor = winterRec.withinTolerance
      ? 'text-[var(--tag-ethanol-text)] dark:text-[var(--ethanol)]'
      : 'text-[var(--partial)]'
    const aboveLimit = currentEthanolPct > target + tolerance
    winterRecCard = (
      <div className="rounded-lg border border-[var(--c-blue)]/40 bg-[var(--tag-info-bg)] p-4 dark:border-[var(--c-blue)]/40 dark:bg-[var(--tag-info-bg)]/30">
        {aboveLimit && (
          <p className="text-xs font-medium text-[var(--tag-partial-text)] dark:text-[var(--partial)] mb-2">
            Taux actuel ({currentEthanolPct.toFixed(0)}%) au-dessus de la limite, dilution nécessaire
          </p>
        )}
        <p className="text-lg font-bold text-[var(--tag-info-text)] dark:text-[var(--c-blue)]">
          {Math.round(winterRec.dilutantLiters)} L {dilutantLabel}&nbsp;+&nbsp;{Math.round(winterRec.e85Liters)} L E85
        </p>
        <p className={`mt-1 text-sm ${resultColor}`}>
          Résultat : {Math.round(winterRec.resultPct)}% (cible ≤ {target + tolerance}%)
        </p>
      </div>
    )
  }

  const content = (
    <div className="space-y-3">
      {/* Dilutant selector */}
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
            <SelectItem value="sp98">SP98</SelectItem>
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

      {/* Odometer input + quick increments */}
      <div className="flex gap-2">
        <Input
          type="number"
          inputMode="numeric"
          placeholder={String(lastOdo)}
          value={currentOdo}
          onChange={(e) => setCurrentOdo(e.target.value)}
          className="h-10 text-base flex-1"
          aria-label="Odomètre actuel (km)"
        />
        {([50, 100, 200] as const).map((delta) => (
          <button
            key={delta}
            type="button"
            onClick={() => setCurrentOdo(String(inputOdo + delta))}
            className="h-10 px-2.5 rounded-md border border-input bg-background text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
          >
            +{delta}
          </button>
        ))}
      </div>

      {/* Recommendation */}
      {winterRecCard}

      {/* Future fills planner */}
      <button
        type="button"
        onClick={() => setShowFutureFills((v) => !v)}
        className="flex items-center gap-2 w-full group"
      >
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
          Pleins futurs {showFutureFills ? '▴' : '▾'}
        </span>
        <div className="h-px flex-1 bg-border" />
      </button>
      {showFutureFills && <>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">Tous les</span>
          <Input
            type="number"
            inputMode="numeric"
            placeholder="300"
            value={intervalKm}
            onChange={(e) => setIntervalKm(e.target.value)}
            className="h-8 text-sm flex-1"
            aria-label="Km entre les pleins"
          />
          <span className="text-xs text-muted-foreground shrink-0">km</span>
        </div>
        {futureFills.length > 0 && (
        <div className="rounded-lg border overflow-hidden text-xs">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="py-1.5 px-2 text-left font-medium text-muted-foreground">#</th>
                <th className="py-1.5 px-2 text-left font-medium text-muted-foreground">km</th>
                <th className="py-1.5 px-2 text-left font-medium text-muted-foreground">Mélange</th>
                <th className="py-1.5 px-2 text-right font-medium text-muted-foreground">%</th>
              </tr>
            </thead>
            <tbody>
              {futureFills.map((fill, i) => (
                <tr key={fill.fillNum} className="border-t border-border/50">
                  <td className="py-1.5 px-2 text-muted-foreground">{fill.fillNum}</td>
                  <td className="py-1.5 px-2">
                    <div>{fill.odo.toLocaleString('fr-FR')}</div>
                    <div className="flex items-center gap-0.5 mt-0.5">
                      <button
                        type="button"
                        onClick={() => setIntervalOverrides((prev) => ({ ...prev, [i]: Math.max(50, (prev[i] ?? intervalKmNum) - 50) }))}
                        className="h-4 w-5 rounded text-[10px] border border-input bg-background hover:bg-muted leading-none"
                      >−</button>
                      <span className="text-[10px] text-muted-foreground w-9 text-center">{fill.intervalKm}km</span>
                      <button
                        type="button"
                        onClick={() => setIntervalOverrides((prev) => ({ ...prev, [i]: (prev[i] ?? intervalKmNum) + 50 }))}
                        className="h-4 w-5 rounded text-[10px] border border-input bg-background hover:bg-muted leading-none"
                      >+</button>
                    </div>
                  </td>
                  <td className="py-1.5 px-2">
                    {fill.type === 'pure_e85'
                      ? `${Math.round(fill.e85Liters)} L E85 pur`
                      : `${Math.round(fill.dilutantLiters)} L ${dilutantLabel} + ${Math.round(fill.e85Liters)} L E85`}
                  </td>
                  <td className={`py-1.5 px-2 text-right font-semibold ${fill.withinTolerance ? 'text-[var(--tag-ethanol-text)] dark:text-[var(--ethanol)]' : 'text-[var(--partial)]'}`}>
                    {Math.round(fill.resultPct)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </>}

      {/* Details */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>Restant : {Math.round(remainingLiters)} L</span>
        <span>Éthanol actuel : {Math.round(currentEthanolPct)}%</span>
      </div>
    </div>
  )

  if (embedded) return content

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="h-4 w-4 text-[var(--tag-ethanol-text)]" />
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
