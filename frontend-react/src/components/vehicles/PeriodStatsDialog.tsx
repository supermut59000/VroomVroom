import { useState } from 'react'
import { CalendarRange, Leaf } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { usePeriodStats } from '@/hooks/use-vehicles'
import { FUEL_TYPE_LABELS } from '@/lib/constants'
import type { FuelType } from '@/types'

interface PeriodStatsDialogProps {
  vehicleId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

const TODAY = () => new Date().toISOString().split('T')[0]

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

export function PeriodStatsDialog({ vehicleId, open, onOpenChange }: PeriodStatsDialogProps) {
  const [startDate, setStartDate] = useState(() => isoDaysAgo(30))
  const [endDate, setEndDate] = useState(TODAY)

  const { data: stats, isLoading, error } = usePeriodStats(
    open ? vehicleId : null,
    startDate,
    endDate,
  )

  const setPreset = (days: number) => {
    setStartDate(isoDaysAgo(days))
    setEndDate(TODAY())
  }
  const setYearToDate = () => {
    setStartDate(`${new Date().getFullYear()}-01-01`)
    setEndDate(TODAY())
  }

  const eur = (v: number, digits = 0) =>
    `${v.toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits })} €`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-primary" />
            Bilan de période
          </DialogTitle>
        </DialogHeader>

        {/* Date range + presets */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="period-start" className="text-xs">Début</Label>
              <Input
                id="period-start"
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="period-end" className="text-xs">Fin</Label>
              <Input
                id="period-end"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPreset(30)}>30 j</Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPreset(90)}>3 mois</Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPreset(365)}>1 an</Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={setYearToDate}>Année en cours</Button>
          </div>
        </div>

        {error ? (
          <p className="py-4 text-sm text-destructive">Impossible de charger le bilan.</p>
        ) : isLoading || !stats ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : stats.fill_count === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Aucun plein sur cette période.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Essentiels */}
            <div className="grid grid-cols-2 gap-3">
              <Kpi
                label="Distance"
                value={`${stats.distance_km.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} km`}
                sub={stats.km_per_day != null ? `${stats.km_per_day.toLocaleString('fr-FR')} km/jour` : undefined}
              />
              <Kpi
                label="Consommation"
                value={stats.avg_consumption != null ? `${stats.avg_consumption.toFixed(2)} L/100` : '—'}
                sub="pondérée distance"
              />
              <Kpi
                label="Carburant"
                value={eur(stats.total_fuel_cost)}
                sub={`${stats.fill_count} plein${stats.fill_count > 1 ? 's' : ''} · ${stats.total_liters.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} L`}
              />
              <Kpi
                label="Prix moyen"
                value={stats.avg_price_per_liter != null ? `${stats.avg_price_per_liter.toFixed(3)} €/L` : '—'}
                sub={
                  stats.fuel_breakdown.length > 1
                    ? stats.fuel_breakdown
                        .map((b) => `${FUEL_TYPE_LABELS[b.fuel_type as FuelType] ?? b.fuel_type} ${b.avg_price_per_liter.toFixed(3)}`)
                        .join(' · ')
                    : undefined
                }
              />
            </div>

            {/* Économies E85 */}
            {stats.e85_savings != null && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
                    <Leaf className="h-4 w-4" />
                    Économie E85 (vs 100% E10)
                  </span>
                  <span className="text-lg font-bold text-emerald-800 dark:text-emerald-300">
                    {eur(stats.e85_savings, 2)}
                  </span>
                </div>
                {stats.e85_share_liters != null && (
                  <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-500">
                    Mix : {Math.round(stats.e85_share_liters * 100)}% E85 /{' '}
                    {100 - Math.round(stats.e85_share_liters * 100)}% Essence
                  </p>
                )}
                {stats.skipped_fills_no_e10_price > 0 && (
                  <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                    {stats.skipped_fills_no_e10_price} plein{stats.skipped_fills_no_e10_price > 1 ? 's' : ''} ignoré
                    {stats.skipped_fills_no_e10_price > 1 ? 's' : ''} (pas de prix E10 de référence)
                  </p>
                )}
              </div>
            )}

            {/* Coûts avancés */}
            <div className="grid grid-cols-2 gap-3">
              <Kpi
                label="Dépenses / 100 km"
                value={stats.fuel_cost_per_100km != null ? eur(stats.fuel_cost_per_100km, 2) : '—'}
                sub="carburant · km observés"
              />
              <Kpi
                label="Coût / jour"
                value={stats.cost_per_day != null ? eur(stats.cost_per_day, 2) : '—'}
                sub="carburant + maintenance"
              />
              <Kpi
                label="Maintenance"
                value={eur(stats.maintenance_cost)}
                sub={
                  stats.maintenance_count > 0
                    ? `${stats.maintenance_count} intervention${stats.maintenance_count > 1 ? 's' : ''}`
                    : 'aucune intervention'
                }
              />
              <Kpi
                label="Période"
                value={`${stats.days} jours`}
                sub={`${new Date(stats.start_date).toLocaleDateString('fr-FR')} → ${new Date(stats.end_date).toLocaleDateString('fr-FR')}`}
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
