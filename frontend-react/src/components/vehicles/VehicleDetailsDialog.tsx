import { useState } from 'react'
import { Pencil, Leaf, DollarSign, Navigation, History } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useVehicle, useVehicleStats } from '@/hooks/use-vehicles'
import { useFuelStats } from '@/hooks/use-fuel-entries'
import { useFlexfuelConversion } from '@/hooks/use-flexfuel'
import { FUEL_TYPE_LABELS, FUEL_TYPE_COLORS } from '@/lib/constants'
import { CostOfOwnershipSection } from './CostOfOwnershipSection'
import { FlexfuelConversionDialog } from '@/components/flexfuel/FlexfuelConversionDialog'
import { E10ReferencePriceDialog } from '@/components/flexfuel/E10ReferencePriceDialog'
import { VehicleTimelineSheet } from './VehicleTimelineSheet'

interface VehicleDetailsDialogProps {
  vehicleId: number | null
  onClose: () => void
  onEdit: (id: number) => void
}

export function VehicleDetailsDialog({
  vehicleId,
  onClose,
  onEdit,
}: VehicleDetailsDialogProps) {
  const { data: vehicle, isLoading: vehicleLoading } = useVehicle(vehicleId)
  const { data: stats } = useVehicleStats(vehicleId)
  const { data: fuelStats } = useFuelStats(vehicleId)
  const { data: flexfuelConversion } = useFlexfuelConversion(vehicleId)

  const [conversionDialogOpen, setConversionDialogOpen] = useState(false)
  const [e10PriceDialogOpen, setE10PriceDialogOpen] = useState(false)
  const [timelineOpen, setTimelineOpen] = useState(false)

  const open = vehicleId !== null

  if (!open) return null

  const isLoading = vehicleLoading

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {isLoading || !vehicle ? (
          <div className="space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>
                  {vehicle.brand} {vehicle.model} ({vehicle.year})
                </DialogTitle>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Badge variant="outline">{vehicle.license_plate}</Badge>
                <Badge className={`${FUEL_TYPE_COLORS[vehicle.fuel_type].bg} ${FUEL_TYPE_COLORS[vehicle.fuel_type].text} border-0`}>
                  {FUEL_TYPE_LABELS[vehicle.fuel_type]}
                </Badge>
                <Badge variant={vehicle.is_active ? 'default' : 'secondary'}>
                  {vehicle.is_active ? 'Actif' : 'Inactif'}
                </Badge>
              </div>
            </DialogHeader>

            <div className="space-y-4">
              {/* Technical info */}
              <section>
                <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                  Informations techniques
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Compteur initial:</span>{' '}
                    {vehicle.initial_odometer.toLocaleString('fr-FR')} km
                  </div>
                  {vehicle.tank_capacity && (
                    <div>
                      <span className="text-muted-foreground">Réservoir:</span>{' '}
                      {vehicle.tank_capacity} L
                    </div>
                  )}
                  {stats?.last_odometer && (
                    <div>
                      <span className="text-muted-foreground">Compteur actuel:</span>{' '}
                      {Math.round(stats.last_odometer).toLocaleString('fr-FR')} km
                    </div>
                  )}
                  {stats && (
                    <div>
                      <span className="text-muted-foreground">Distance totale:</span>{' '}
                      {Math.round(stats.total_distance).toLocaleString('fr-FR')} km
                    </div>
                  )}
                </div>
              </section>

              <Separator />

              {/* Purchase info */}
              {(vehicle.acquisition_date || vehicle.purchase_price) && (
                <>
                  <section>
                    <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                      Achat
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {vehicle.acquisition_date && (
                        <div>
                          <span className="text-muted-foreground">Date:</span>{' '}
                          {new Date(vehicle.acquisition_date).toLocaleDateString('fr-FR')}
                        </div>
                      )}
                      {vehicle.purchase_price != null && (
                        <div>
                          <span className="text-muted-foreground">Prix:</span>{' '}
                          {vehicle.purchase_price.toLocaleString('fr-FR')} &euro;
                        </div>
                      )}
                    </div>
                  </section>
                  <Separator />
                </>
              )}

              {/* Insurance tracking */}
              {(vehicle.insurance_unlimited || stats?.current_insurance_km_limit != null) && (
                <>
                  <section>
                    <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                      Suivi kilométrique assurance
                    </h4>
                    {vehicle.insurance_unlimited ? (
                      <Badge className="border-0 bg-blue-100 text-blue-700">
                        Kilométrage illimité
                      </Badge>
                    ) : stats?.current_insurance_km_limit != null ? (
                      <>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Limite actuelle:</span>{' '}
                            {Math.round(stats.current_insurance_km_limit).toLocaleString('fr-FR')} km
                          </div>
                          {stats.insurance_km_remaining != null && (
                            <div>
                              <span className="text-muted-foreground">Restant:</span>{' '}
                              {Math.round(stats.insurance_km_remaining).toLocaleString('fr-FR')} km
                            </div>
                          )}
                        </div>
                        {stats.insurance_km_exceeded ? (
                          <Badge variant="destructive" className="mt-2">
                            Limite dépassée
                          </Badge>
                        ) : stats.insurance_km_remaining != null &&
                          stats.insurance_km_remaining <= stats.current_insurance_km_limit * 0.1 ? (
                          <Badge className="mt-2 border-0 bg-orange-100 text-orange-700">
                            Attention — proche de la limite
                          </Badge>
                        ) : (
                          <Badge className="mt-2 border-0 bg-green-100 text-green-700">
                            OK
                          </Badge>
                        )}
                      </>
                    ) : null}
                  </section>
                  <Separator />
                </>
              )}

              {/* Fuel statistics */}
              {fuelStats && (
                <section>
                  <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                    Statistiques carburant
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Pleins:</span>{' '}
                      {fuelStats.total_entries}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total litres:</span>{' '}
                      {fuelStats.total_liters.toFixed(1)} L
                    </div>
                    <div>
                      <span className="text-muted-foreground">Coût total:</span>{' '}
                      {fuelStats.total_cost.toFixed(2)} &euro;
                    </div>
                    <div>
                      <span className="text-muted-foreground">Conso. moyenne:</span>{' '}
                      {fuelStats.average_consumption
                        ? `${fuelStats.average_consumption.toFixed(2)} L/100km`
                        : '—'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Prix moyen:</span>{' '}
                      {fuelStats.average_price_per_liter.toFixed(3)} &euro;/L
                    </div>
                    {stats?.cost_per_km != null && (
                      <div>
                        <span className="text-muted-foreground">Coût/km:</span>{' '}
                        {stats.cost_per_km.toFixed(2)} &euro;
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Autonomy */}
              {stats?.range_km != null && (() => {
                const m = new Date().getMonth() + 1
                const currentSeason = m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter'
                const SEASON_LABELS = { spring: 'Printemps', summer: 'Été', autumn: 'Automne', winter: 'Hiver' } as const
                const seasons = ['spring', 'summer', 'autumn', 'winter'] as const
                const current = stats[currentSeason]
                const baseRange = current?.range_km ?? stats.range_km
                const isFlexFuel = !!(current?.e10_consumption)

                // For per-season comparison bars, scale relative to the longest range across all seasons.
                const maxSeasonRange = Math.max(
                  ...seasons.map(s => stats[s]?.range_km ?? 0),
                  1,
                )
                const bestSeason = seasons.reduce<{ s: typeof seasons[number] | null; v: number }>(
                  (acc, s) => {
                    const v = stats[s]?.range_km ?? 0
                    return v > acc.v ? { s, v } : acc
                  },
                  { s: null, v: 0 },
                )

                // For the current-season min/max band: marker position = avg within [min,max]
                let avgMarkerPct = 50
                if (
                  current?.avg_consumption != null &&
                  current?.min_consumption != null &&
                  current?.max_consumption != null &&
                  current.max_consumption > current.min_consumption
                ) {
                  // High consumption = low km = left side; low consumption = right side.
                  // Pct from min (best, right) to max (worst, left):
                  const pct =
                    ((current.max_consumption - current.avg_consumption) /
                      (current.max_consumption - current.min_consumption)) * 100
                  avgMarkerPct = Math.max(2, Math.min(98, pct))
                }

                return (
                  <>
                    <Separator />
                    <section>
                      <h4 className="mb-3 text-sm font-semibold text-muted-foreground">
                        Autonomie estimée
                      </h4>

                      {/* Current season hero card */}
                      <div className="rounded-lg border bg-muted/30 p-4">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                          <Navigation className="h-3.5 w-3.5" />
                          {SEASON_LABELS[currentSeason]} · saison actuelle
                        </div>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span className="text-3xl font-bold">~{Math.round(baseRange!)}</span>
                          <span className="text-sm text-muted-foreground">km</span>
                          {current?.avg_consumption != null && (
                            <span className="ml-auto text-xs text-muted-foreground">
                              moy. {current.avg_consumption.toFixed(1)} L/100
                            </span>
                          )}
                        </div>

                        {/* Min/Max range band with avg marker */}
                        {current?.range_km_worst != null && current?.range_km_best != null && (
                          <div className="mt-4">
                            <div className="relative h-2 rounded-full bg-gradient-to-r from-orange-400/40 via-yellow-400/40 to-emerald-400/40">
                              <div
                                className="absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
                                style={{ left: `${avgMarkerPct}%` }}
                              />
                            </div>
                            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                              <span>~{Math.round(current.range_km_worst)} km<br /><span className="opacity-70">conduite gourmande</span></span>
                              <span className="text-right">~{Math.round(current.range_km_best)} km<br /><span className="opacity-70">conduite économe</span></span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* FlexFuel E10 / E85 split + mix bar */}
                      {isFlexFuel && current && (
                        <div className="mt-3 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-md border p-2 text-center">
                              <div className="text-xs text-muted-foreground">Sur E10</div>
                              <div className="text-lg font-semibold">~{Math.round(current.range_km_e10!)} km</div>
                              <div className="text-xs text-muted-foreground">{current.e10_consumption?.toFixed(1)} L/100</div>
                            </div>
                            <div className="rounded-md border p-2 text-center">
                              <div className="text-xs text-muted-foreground">Sur E85</div>
                              <div className="text-lg font-semibold">~{Math.round(current.range_km_e85!)} km</div>
                              <div className="text-xs text-muted-foreground">{current.e85_consumption?.toFixed(1)} L/100</div>
                            </div>
                          </div>
                          {current.e85_fraction != null && (
                            <div>
                              <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                                <span>Mix réel cette saison</span>
                                <span>
                                  <span className="text-emerald-600 font-medium">{Math.round(current.e85_fraction * 100)}% E85</span>
                                  {' · '}
                                  <span className="text-orange-600 font-medium">{Math.round((1 - current.e85_fraction) * 100)}% Essence</span>
                                </span>
                              </div>
                              <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="bg-emerald-500"
                                  style={{ width: `${current.e85_fraction * 100}%` }}
                                />
                                <div
                                  className="bg-orange-500"
                                  style={{ width: `${(1 - current.e85_fraction) * 100}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 4-season comparison */}
                      <div className="mt-3">
                        <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>Comparaison saisonnière</span>
                          {bestSeason.s && (
                            <span>
                              Meilleure : <span className="text-foreground font-medium">{SEASON_LABELS[bestSeason.s]}</span>
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {seasons.map(s => {
                            const ss = stats[s]
                            const isCurrent = s === currentSeason
                            const widthPct = ss?.range_km != null ? (ss.range_km / maxSeasonRange) * 100 : 0
                            return (
                              <div
                                key={s}
                                className={`rounded-md border p-2 ${isCurrent ? 'border-primary bg-primary/5' : ''}`}
                              >
                                <div className="flex items-baseline justify-between">
                                  <span className={`text-xs ${isCurrent ? 'font-semibold' : 'text-muted-foreground'}`}>
                                    {SEASON_LABELS[s]}
                                  </span>
                                  {ss?.fill_count != null && ss.fill_count > 0 && (
                                    <span className="text-[10px] text-muted-foreground">{ss.fill_count} pl.</span>
                                  )}
                                </div>
                                <div className="mt-0.5 text-sm font-semibold">
                                  {ss?.range_km != null ? `~${Math.round(ss.range_km)} km` : '—'}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {ss?.avg_consumption != null ? `${ss.avg_consumption.toFixed(1)} L/100` : ' '}
                                </div>
                                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                                  <div
                                    className={`h-full ${isCurrent ? 'bg-primary' : 'bg-muted-foreground/40'}`}
                                    style={{ width: `${widthPct}%` }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </section>
                  </>
                )
              })()}

              {/* FlexFuel E85 — only for E85 vehicles */}
              {vehicle.fuel_type === 'e85' && <>
              <Separator />
              <section>
                <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                  Conversion FlexFuel E85
                </h4>
                {flexfuelConversion ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Date conversion:</span>{' '}
                        {new Date(flexfuelConversion.conversion_date).toLocaleDateString('fr-FR')}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Coût kit:</span>{' '}
                        {flexfuelConversion.kit_cost.toFixed(0)} &euro;
                      </div>
                      <div>
                        <span className="text-muted-foreground">Surconsommation:</span>{' '}
                        {flexfuelConversion.overconsumption_pct}%
                      </div>
                      {flexfuelConversion.kit_brand && (
                        <div>
                          <span className="text-muted-foreground">Boîtier:</span>{' '}
                          {flexfuelConversion.kit_brand}
                        </div>
                      )}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConversionDialogOpen(true)}
                      >
                        <Leaf className="mr-1 h-3.5 w-3.5" />
                        Modifier
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setE10PriceDialogOpen(true)}
                      >
                        <DollarSign className="mr-1 h-3.5 w-3.5" />
                        Prix E10
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConversionDialogOpen(true)}
                  >
                    <Leaf className="mr-1 h-3.5 w-3.5" />
                    Ajouter une conversion E85
                  </Button>
                )}
              </section>
              </>}

              {/* Cost of ownership */}
              <Separator />
              <CostOfOwnershipSection vehicleId={vehicleId!} />

              {/* Description */}
              {vehicle.description && (
                <>
                  <Separator />
                  <section>
                    <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                      Description
                    </h4>
                    <p className="text-sm">{vehicle.description}</p>
                  </section>
                </>
              )}

              {/* System info */}
              <Separator />
              <section className="text-xs text-muted-foreground">
                <p>Créé le {new Date(vehicle.created_at).toLocaleDateString('fr-FR')}</p>
                {vehicle.updated_at && (
                  <p>
                    Modifié le {new Date(vehicle.updated_at).toLocaleDateString('fr-FR')}
                  </p>
                )}
                <p>ID: {vehicle.id}</p>
              </section>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Fermer
              </Button>
              <Button variant="outline" onClick={() => setTimelineOpen(true)}>
                <History className="mr-2 h-4 w-4" />
                Historique
              </Button>
              <Button onClick={() => onEdit(vehicleId!)}>
                <Pencil className="mr-2 h-4 w-4" />
                Modifier
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>

      {/* FlexFuel dialogs */}
      <FlexfuelConversionDialog
        vehicleId={vehicleId}
        open={conversionDialogOpen}
        onClose={() => setConversionDialogOpen(false)}
      />
      <E10ReferencePriceDialog
        open={e10PriceDialogOpen}
        onClose={() => setE10PriceDialogOpen(false)}
      />

      {/* Timeline sheet */}
      <VehicleTimelineSheet
        vehicleId={vehicleId}
        open={timelineOpen}
        onClose={() => setTimelineOpen(false)}
      />
    </Dialog>
  )
}
