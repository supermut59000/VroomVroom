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
                const SEASON_SHORT  = { spring: 'Prin.',     summer: 'Été', autumn: 'Auto.',   winter: 'Hiver' } as const
                const seasons = ['spring', 'summer', 'autumn', 'winter'] as const
                const current = stats[currentSeason]
                const baseRange = current?.range_km ?? stats.range_km
                const isFlexFuel = !!(current?.e10_consumption)

                return (
                  <>
                    <Separator />
                    <section>
                      <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                        Autonomie estimée
                      </h4>
                      <div className="space-y-3">
                        {/* Current season headline */}
                        <div className="flex items-center gap-2 text-sm">
                          <Navigation className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="text-muted-foreground">{SEASON_LABELS[currentSeason]} (saison actuelle) :</span>
                          <span className="font-semibold">~{Math.round(baseRange!)} km</span>
                        </div>

                        {/* Range band: worst → best conditions */}
                        {current?.range_km_worst != null && current?.range_km_best != null && (
                          <div className="ml-6 text-xs text-muted-foreground">
                            De <span className="font-medium text-foreground">~{Math.round(current.range_km_worst)} km</span>
                            {' '}(ville) à{' '}
                            <span className="font-medium text-foreground">~{Math.round(current.range_km_best)} km</span>
                            {' '}(route) · moy. {current.avg_consumption?.toFixed(1)} L/100
                          </div>
                        )}

                        {/* FlexFuel E10 / E85 split — computed by backend */}
                        {isFlexFuel && current && (
                          <div className="ml-6 grid grid-cols-2 gap-2 text-sm">
                            <div className="rounded-md border p-2 text-center">
                              <div className="text-xs text-muted-foreground">Sur E10</div>
                              <div className="font-semibold">~{Math.round(current.range_km_e10!)} km</div>
                              <div className="text-xs text-muted-foreground">{current.e10_consumption?.toFixed(1)} L/100</div>
                            </div>
                            <div className="rounded-md border p-2 text-center">
                              <div className="text-xs text-muted-foreground">Sur E85</div>
                              <div className="font-semibold">~{Math.round(current.range_km_e85!)} km</div>
                              <div className="text-xs text-muted-foreground">{current.e85_consumption?.toFixed(1)} L/100</div>
                            </div>
                            {current.e85_fraction != null && (
                              <div className="col-span-2 text-xs text-muted-foreground text-center">
                                Mix réel cette saison : {Math.round(current.e85_fraction * 100)}% E85 / {Math.round((1 - current.e85_fraction) * 100)}% E10
                              </div>
                            )}
                          </div>
                        )}

                        {/* 4-season grid */}
                        <div className="grid grid-cols-4 gap-1.5 pt-1 text-xs">
                          {seasons.map(s => {
                            const ss = stats[s]
                            const isCurrent = s === currentSeason
                            return (
                              <div
                                key={s}
                                className={`rounded-md border p-2 text-center ${isCurrent ? 'border-primary bg-primary/5 font-semibold' : 'text-muted-foreground'}`}
                              >
                                <div className="text-[11px]">{SEASON_SHORT[s]}</div>
                                <div className="mt-0.5">{ss?.range_km != null ? `~${Math.round(ss.range_km)} km` : '—'}</div>
                                <div className="mt-0.5 opacity-70">{ss?.avg_consumption != null ? `${ss.avg_consumption.toFixed(1)} L/100` : ''}</div>
                                {isFlexFuel && ss?.fill_count != null && (
                                  <div className="mt-0.5 opacity-50">{ss.fill_count} plein{ss.fill_count !== 1 ? 's' : ''}</div>
                                )}
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
