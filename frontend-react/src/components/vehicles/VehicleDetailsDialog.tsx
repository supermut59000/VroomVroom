import { Pencil } from 'lucide-react'
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
import { FUEL_TYPE_LABELS, FUEL_TYPE_COLORS } from '@/lib/constants'
import { CostOfOwnershipSection } from './CostOfOwnershipSection'

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
    </Dialog>
  )
}
