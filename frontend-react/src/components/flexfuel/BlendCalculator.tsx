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
  const tankCapacity = vehicle.tank_capacity ?? 50
  const conversionDate = conversion.conversion_date
  const target = conversion.target_ethanol_pct
  const tolerance = conversion.ethanol_tolerance_pct

  const avgConsumption = useMemo(
    () => computeAvgConsumption(entries, conversionDate),
    [entries, conversionDate],
  )

  const tankState = useMemo(
    () => computeTankState(entries, conversionDate, tankCapacity),
    [entries, conversionDate, tankCapacity],
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
      computeThresholds(
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
      computeWinterRec(
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
      avgConsumption && intervals.every((v) => v > 0)
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

  // ── Threshold cards ───────────────────────────────────────────────────────
  const { odoA, odoB, odoBNow, pureE85AlwaysSafe } = thresholds

  const thresholdCards = (
    <div className="grid grid-cols-2 gap-2">
      {/* Card A: Pure E85 deadline */}
      <div
        className={`rounded-lg border p-3 ${
          pureE85AlwaysSafe || odoA !== null
            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
            : limitFill
              ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30'
              : 'border-border bg-muted/30'
        }`}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          E85 pur
        </p>
        {pureE85AlwaysSafe ? (
          <>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-tight">
              Toujours possible
            </p>
            <p className="text-base font-bold text-emerald-800 dark:text-emerald-200">
              Grade du jour {Math.round(e85EthFraction * 100)}%
            </p>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-500 mt-0.5">
              Sous la limite de {target + tolerance}%
            </p>
          </>
        ) : odoA !== null ? (
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
            {limitFill && limitFill.addedKm !== null && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-500 mt-1 border-t border-emerald-200 dark:border-emerald-800 pt-1">
                {limitFill.isFull
                  ? `Plein complet: ${limitFill.liters.toFixed(1)} L → ${limitFill.resultPct.toFixed(1)}% · +${limitFill.addedKm} km`
                  : `Max: ${limitFill.liters.toFixed(1)} L → ${limitFill.resultPct.toFixed(1)}% · +${limitFill.addedKm} km`}
              </p>
            )}
          </>
        ) : limitFill ? (
          <>
            <p className="text-xs text-yellow-700 dark:text-yellow-400 leading-tight">
              Partiel possible
            </p>
            <p className="text-base font-bold text-yellow-800 dark:text-yellow-200">
              {limitFill.liters.toFixed(1)} L E85
            </p>
            <p className="text-[11px] text-yellow-700 dark:text-yellow-500 mt-0.5">
              → {limitFill.resultPct.toFixed(1)}%
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
            ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30'
            : 'border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20'
        }`}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          Dilution {dilutantLabel}
        </p>
        {pureE85AlwaysSafe ? (
          <p className="text-sm font-medium text-muted-foreground">Inutile avec le grade actuel</p>
        ) : odoBNow ? (
          <>
            <p className="text-xs text-blue-700 dark:text-blue-400 leading-tight">Maintenant</p>
            <p className="text-base font-bold text-blue-800 dark:text-blue-200">
              km {inputOdo.toLocaleString('fr-FR')}
            </p>
            <p className="text-[11px] text-blue-600 dark:text-blue-500 mt-0.5">
              5 L+ {dilutantLabel} → {target}%
            </p>
          </>
        ) : odoB !== null ? (
          <>
            <p className="text-xs text-blue-700 dark:text-blue-400 leading-tight">
              À partir du km
            </p>
            <p className="text-base font-bold text-blue-800 dark:text-blue-200">
              {odoB.toLocaleString('fr-FR')}
            </p>
            <p className="text-[11px] text-blue-600 dark:text-blue-500 mt-0.5">
              dans ~{(odoB - inputOdo).toLocaleString('fr-FR')} km
            </p>
          </>
        ) : (
          <p className="text-sm font-medium text-muted-foreground">—</p>
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
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
        <p className="text-lg font-bold text-emerald-800 dark:text-emerald-300">
          {winterRec.e85Liters.toFixed(1)} L E85 pur
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
    const aboveLimit = currentEthanolPct > target + tolerance
    winterRecCard = (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
        {aboveLimit && (
          <p className="text-xs font-medium text-orange-600 dark:text-orange-400 mb-2">
            Taux actuel ({currentEthanolPct.toFixed(0)}%) au-dessus de la limite — dilution nécessaire
          </p>
        )}
        <p className="text-lg font-bold text-blue-800 dark:text-blue-300">
          {winterRec.dilutantLiters.toFixed(1)} L {dilutantLabel}&nbsp;+&nbsp;{winterRec.e85Liters.toFixed(1)} L E85
        </p>
        <p className={`mt-1 text-sm ${resultColor}`}>
          Résultat : {winterRec.resultPct.toFixed(1)}% — cible ≤ {target + tolerance}%
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
                      ? `${fill.e85Liters.toFixed(1)} L E85 pur`
                      : `${fill.dilutantLiters.toFixed(1)} L ${dilutantLabel} + ${fill.e85Liters.toFixed(1)} L E85`}
                  </td>
                  <td className={`py-1.5 px-2 text-right font-semibold ${fill.withinTolerance ? 'text-emerald-600 dark:text-emerald-400' : 'text-orange-500'}`}>
                    {fill.resultPct.toFixed(1)}%
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
        <span>Restant : {remainingLiters.toFixed(1)} L</span>
        <span>Éthanol actuel : {currentEthanolPct.toFixed(1)}%</span>
        <span>E85 du jour : {Math.round(e85EthFraction * 100)}%</span>
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
