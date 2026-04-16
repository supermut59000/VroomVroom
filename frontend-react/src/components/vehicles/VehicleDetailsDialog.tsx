import { useState } from 'react'
import { Pencil, Leaf, DollarSign, Navigation } from 'lucide-react'
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
              {stats?.current_insurance_km_limit != null && (
                <>
                  <section>
                    <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                      Suivi kilométrique assurance
                    </h4>
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
                const currentMonth = new Date().getMonth() + 1
                const currentSeason = currentMonth >= 3 && currentMonth <= 5 ? 'spring'
                  : currentMonth >= 6 && currentMonth <= 8 ? 'summer'
                  : currentMonth >= 9 && currentMonth <= 11 ? 'autumn'
                  : 'winter'
                const SEASON_LABELS = { spring: 'Printemps', summer: 'Été', autumn: 'Automne', winter: 'Hiver' } as const
                const SEASON_SHORT  = { spring: 'Prin.', summer: 'Été', autumn: 'Auto.', winter: 'Hiver' } as const
                const seasonRanges = {
                  spring: stats.range_km_spring,
                  summer: stats.range_km_summer,
                  autumn: stats.range_km_autumn,
                  winter: stats.range_km_winter,
                }
                const seasonConsos = {
                  spring: stats.spring_avg_consumption,
                  summer: stats.summer_avg_consumption,
                  autumn: stats.autumn_avg_consumption,
                  winter: stats.winter_avg_consumption,
                }
                const baseRange = seasonRanges[currentSeason] ?? stats.range_km
                const hasSeasonal = Object.values(seasonRanges).some(v => v != null)
                const overFactor = flexfuelConversion
                  ? 1 + flexfuelConversion.overconsumption_pct / 100
                  : null

                return (
                  <>
                    <Separator />
                    <section>
                      <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                        Autonomie estimée
                      </h4>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Navigation className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="text-muted-foreground">{SEASON_LABELS[currentSeason]} (saison actuelle) :</span>
                          <span className="font-semibold">~{Math.round(baseRange!)} km</span>
                        </div>
                        {flexfuelConversion && overFactor != null && (
                          <div className="ml-6 flex gap-6 text-sm">
                            <div>
                              <span className="text-muted-foreground">Sur E85 : </span>
                              <span className="font-medium">~{Math.round(baseRange!)} km</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Sur E10 : </span>
                              <span className="font-medium">~{Math.round(baseRange! * overFactor)} km</span>
                            </div>
                          </div>
                        )}
                        {hasSeasonal && (
                          <div className="grid grid-cols-4 gap-2 pt-1 text-xs">
                            {(['spring', 'summer', 'autumn', 'winter'] as const).map(s => {
                              const r = seasonRanges[s]
                              const c = seasonConsos[s]
                              const isCurrent = s === currentSeason
                              return (
                                <div
                                  key={s}
                                  className={`rounded-md border p-2 text-center ${isCurrent ? 'border-primary bg-primary/5 font-semibold' : 'text-muted-foreground'}`}
                                >
                                  <div className="text-[11px]">{SEASON_SHORT[s]}</div>
                                  <div className="mt-0.5">{r != null ? `~${Math.round(r)} km` : '—'}</div>
                                  <div className="mt-0.5 opacity-70">{c != null ? `${c.toFixed(1)} L/100` : ''}</div>
                                </div>
                              )
                            })}
                          </div>
                        )}
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
    </Dialog>
  )
}
