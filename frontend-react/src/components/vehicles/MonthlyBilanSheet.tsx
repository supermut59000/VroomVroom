import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useAllFuelEntries, useConsumptionHistory } from '@/hooks/use-fuel-entries'
import { useFlexfuelRentability } from '@/hooks/use-flexfuel'
import type { FuelEntry, ConsumptionDataPoint, FlexfuelMonthlySavings } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type CompareMode = 'prev' | 'lastYear' | 'yearAvg'

interface MonthStats {
  km: number | null
  cost: number | null
  liters: number | null
  avgPrice: number | null
  avgConsumption: number | null
  e85Savings: number | null
  fillCount: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

function toMK(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function offsetMK(mk: string, months: number): string {
  const [y, m] = mk.split('-').map(Number)
  return toMK(new Date(y, m - 1 + months, 1))
}

function displayMK(mk: string): string {
  const [y, m] = mk.split('-').map(Number)
  return `${MONTHS_FR[m - 1]} ${y}`
}

function buildMonthOdos(entries: FuelEntry[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const e of entries) {
    const mk = e.fueling_date.substring(0, 7)
    map.set(mk, Math.max(map.get(mk) ?? 0, e.odometer_reading))
  }
  return map
}

function statsForMonth(
  mk: string,
  entries: FuelEntry[],
  monthOdos: Map<string, number>,
  sortedMonths: string[],
  consumptionPoints: ConsumptionDataPoint[],
  monthlySavings: FlexfuelMonthlySavings[],
): MonthStats {
  const monthEntries = entries.filter((e) => e.fueling_date.startsWith(mk))
  const fillCount = monthEntries.length
  if (fillCount === 0) {
    return { km: null, cost: null, liters: null, avgPrice: null, avgConsumption: null, e85Savings: null, fillCount: 0 }
  }

  const cost = monthEntries.reduce((s, e) => s + e.total_cost, 0)
  const liters = monthEntries.reduce((s, e) => s + e.liters, 0)
  const avgPrice = liters > 0 ? cost / liters : null

  const idx = sortedMonths.indexOf(mk)
  const km =
    idx > 0
      ? (monthOdos.get(mk) ?? 0) - (monthOdos.get(sortedMonths[idx - 1]) ?? 0)
      : null

  const monthCons = consumptionPoints.filter((p) => p.date.startsWith(mk) && p.consumption !== null)
  const avgConsumption =
    monthCons.length > 0
      ? monthCons.reduce((s, p) => s + p.consumption!, 0) / monthCons.length
      : null

  const e85Savings = monthlySavings.find((s) => s.month === mk)?.savings ?? null

  return { km, cost, liters, avgPrice, avgConsumption, e85Savings, fillCount }
}

function yearAvgStats(
  mk: string,
  entries: FuelEntry[],
  monthOdos: Map<string, number>,
  sortedMonths: string[],
  consumptionPoints: ConsumptionDataPoint[],
  monthlySavings: FlexfuelMonthlySavings[],
): MonthStats {
  const year = mk.substring(0, 4)
  const others = sortedMonths.filter((m) => m.startsWith(year) && m !== mk)
  const allStats = others
    .map((m) => statsForMonth(m, entries, monthOdos, sortedMonths, consumptionPoints, monthlySavings))
    .filter((s) => s.fillCount > 0)
  if (allStats.length === 0) {
    return { km: null, cost: null, liters: null, avgPrice: null, avgConsumption: null, e85Savings: null, fillCount: 0 }
  }

  const avg = (key: keyof MonthStats): number | null => {
    const vals = allStats.map((s) => s[key]).filter((v): v is number => v !== null)
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }

  return {
    km: avg('km'),
    cost: avg('cost'),
    liters: avg('liters'),
    avgPrice: avg('avgPrice'),
    avgConsumption: avg('avgConsumption'),
    e85Savings: avg('e85Savings'),
    fillCount: 0,
  }
}

// ─── Delta badge ──────────────────────────────────────────────────────────────

function DeltaBadge({
  current,
  reference,
  betterWhen,
  format,
}: {
  current: number | null
  reference: number | null
  betterWhen: 'higher' | 'lower' | 'neutral'
  format: (v: number) => string
}) {
  if (current === null || reference === null) return null
  const delta = current - reference
  if (Math.abs(delta) < 0.005) {
    return <span className="text-xs text-muted-foreground">= même</span>
  }

  const isPositive = delta > 0
  const isGood =
    betterWhen === 'neutral' ? null : betterWhen === 'higher' ? isPositive : !isPositive

  const color =
    isGood === null
      ? 'text-muted-foreground'
      : isGood
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-red-500 dark:text-red-400'

  const Icon = isPositive ? TrendingUp : TrendingDown
  const sign = isPositive ? '+' : ''

  return (
    <span className={`flex items-center gap-0.5 text-xs ${color}`}>
      <Icon className="h-3 w-3 shrink-0" />
      {sign}{format(delta)}
    </span>
  )
}

// ─── Metric card ─────────────────────────────────────────────────────────────

interface MetricDef {
  key: keyof MonthStats
  label: string
  format: (v: number) => string
  deltaFormat: (v: number) => string
  betterWhen: 'higher' | 'lower' | 'neutral'
  flexFuelOnly?: true
}

const METRICS: MetricDef[] = [
  {
    key: 'km',
    label: 'Km parcourus',
    format: (v) => `${Math.round(v).toLocaleString('fr-FR')} km`,
    deltaFormat: (v) => `${v > 0 ? '+' : ''}${Math.round(v).toLocaleString('fr-FR')} km`,
    betterWhen: 'higher',
  },
  {
    key: 'cost',
    label: 'Dépense carburant',
    format: (v) => `${v.toFixed(2)} €`,
    deltaFormat: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} €`,
    betterWhen: 'lower',
  },
  {
    key: 'liters',
    label: 'Litres achetés',
    format: (v) => `${v.toFixed(1)} L`,
    deltaFormat: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} L`,
    betterWhen: 'neutral',
  },
  {
    key: 'avgPrice',
    label: 'Prix moyen/L',
    format: (v) => `${v.toFixed(3)} €/L`,
    deltaFormat: (v) => `${v > 0 ? '+' : ''}${v.toFixed(3)} €/L`,
    betterWhen: 'lower',
  },
  {
    key: 'avgConsumption',
    label: 'Conso. moyenne',
    format: (v) => `${v.toFixed(2)} L/100km`,
    deltaFormat: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} L/100km`,
    betterWhen: 'lower',
  },
  {
    key: 'e85Savings',
    label: 'Économies E85',
    format: (v) => `${v.toFixed(2)} €`,
    deltaFormat: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} €`,
    betterWhen: 'higher',
    flexFuelOnly: true,
  },
]

function MetricCard({
  metric,
  current,
  reference,
  compareLabel,
}: {
  metric: MetricDef
  current: MonthStats
  reference: MonthStats | null
  compareLabel: string
}) {
  const val = current[metric.key] as number | null
  const ref = reference ? (reference[metric.key] as number | null) : null

  return (
    <div className="rounded-lg border bg-card p-3 space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {metric.label}
      </p>
      {val !== null ? (
        <>
          <p className="text-base font-bold">{metric.format(val)}</p>
          {reference !== null && (
            <div className="space-y-0.5">
              <DeltaBadge
                current={val}
                reference={ref}
                betterWhen={metric.betterWhen}
                format={metric.deltaFormat}
              />
              {ref !== null && (
                <p className="text-[10px] text-muted-foreground">
                  {compareLabel} : {metric.format(ref)}
                </p>
              )}
              {ref === null && (
                <p className="text-[10px] text-muted-foreground">Pas de données {compareLabel.toLowerCase()}</p>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">—</p>
      )}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface MonthlyBilanSheetProps {
  vehicleId: number | null
  isFlexFuel: boolean
  open: boolean
  onClose: () => void
}

export function MonthlyBilanSheet({ vehicleId, isFlexFuel, open, onClose }: MonthlyBilanSheetProps) {
  const currentMK = toMK(new Date())
  const [selectedMK, setSelectedMK] = useState(currentMK)
  const [compareMode, setCompareMode] = useState<CompareMode>('prev')

  const { data: allEntries, isLoading: entriesLoading } = useAllFuelEntries(open ? vehicleId : null)
  const { data: consumptionHistory, isLoading: consLoading } = useConsumptionHistory(open ? vehicleId : null)
  const { data: rentability } = useFlexfuelRentability(isFlexFuel && open ? vehicleId : null)

  const isLoading = entriesLoading || consLoading

  const { monthOdos, sortedMonths, minMK } = useMemo(() => {
    if (!allEntries?.length) return { monthOdos: new Map<string, number>(), sortedMonths: [] as string[], minMK: currentMK }
    const odos = buildMonthOdos(allEntries)
    const sorted = [...odos.keys()].sort()
    return { monthOdos: odos, sortedMonths: sorted, minMK: sorted[0] }
  }, [allEntries, currentMK])

  const consumptionPoints = consumptionHistory?.data_points ?? []
  const monthlySavings = rentability?.monthly_savings ?? []

  const currentStats = useMemo(
    () => statsForMonth(selectedMK, allEntries ?? [], monthOdos, sortedMonths, consumptionPoints, monthlySavings),
    [selectedMK, allEntries, monthOdos, sortedMonths, consumptionPoints, monthlySavings],
  )

  const refMK = compareMode === 'prev' ? offsetMK(selectedMK, -1) : compareMode === 'lastYear' ? offsetMK(selectedMK, -12) : null

  const refStats = useMemo(() => {
    if (!allEntries?.length) return null
    if (compareMode === 'yearAvg') {
      return yearAvgStats(selectedMK, allEntries, monthOdos, sortedMonths, consumptionPoints, monthlySavings)
    }
    if (refMK) {
      return statsForMonth(refMK, allEntries, monthOdos, sortedMonths, consumptionPoints, monthlySavings)
    }
    return null
  }, [compareMode, selectedMK, refMK, allEntries, monthOdos, sortedMonths, consumptionPoints, monthlySavings])

  const compareLabel =
    compareMode === 'prev'
      ? displayMK(offsetMK(selectedMK, -1))
      : compareMode === 'lastYear'
        ? displayMK(offsetMK(selectedMK, -12))
        : `Moy. ${selectedMK.substring(0, 4)}`

  const canGoBack = !minMK || selectedMK > minMK
  const canGoForward = selectedMK < currentMK

  const visibleMetrics = METRICS.filter((m) => !m.flexFuelOnly || isFlexFuel)

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle>Bilan mensuel</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pb-6">
          {/* Month navigation */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSelectedMK(offsetMK(selectedMK, -1))}
              disabled={!canGoBack}
              className="rounded-md p-1.5 hover:bg-muted disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-base font-semibold">{displayMK(selectedMK)}</span>
            <button
              type="button"
              onClick={() => setSelectedMK(offsetMK(selectedMK, 1))}
              disabled={!canGoForward}
              className="rounded-md p-1.5 hover:bg-muted disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Comparison mode toggle */}
          <div className="flex rounded-md border overflow-hidden text-xs font-medium w-fit">
            {(
              [
                { mode: 'prev' as CompareMode, label: 'M−1' },
                { mode: 'lastYear' as CompareMode, label: 'M−12' },
                { mode: 'yearAvg' as CompareMode, label: `Moy. ${selectedMK.substring(0, 4)}` },
              ] as const
            ).map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setCompareMode(mode)}
                className={`px-3 py-2 transition-colors ${
                  compareMode === mode
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          ) : currentStats.fillCount === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Aucun plein enregistré en {displayMK(selectedMK)}.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {visibleMetrics.map((metric) => (
                  <MetricCard
                    key={metric.key}
                    metric={metric}
                    current={currentStats}
                    reference={refStats}
                    compareLabel={compareLabel}
                  />
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground text-center">
                {currentStats.fillCount} plein{currentStats.fillCount > 1 ? 's' : ''} enregistré{currentStats.fillCount > 1 ? 's' : ''}
              </p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
