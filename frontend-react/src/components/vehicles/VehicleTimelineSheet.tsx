import { Fuel, Wrench, Loader2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useVehicleTimeline } from '@/hooks/use-vehicles'
import { FUEL_ENTRY_TYPE_LABELS } from '@/lib/constants'
import type { FuelType } from '@/types'

interface VehicleTimelineSheetProps {
  vehicleId: number | null
  open: boolean
  onClose: () => void
}

export function VehicleTimelineSheet({
  vehicleId,
  open,
  onClose,
}: VehicleTimelineSheetProps) {
  const { data: timeline, isLoading } = useVehicleTimeline(open ? vehicleId : null)

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle>Historique du véhicule</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-2">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </div>
          )}

          {!isLoading && timeline && timeline.events.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Aucun événement enregistré.
            </p>
          )}

          {!isLoading && timeline && timeline.events.length > 0 && (
            <div className="space-y-0">
              {[...timeline.events]
                .sort((a, b) => b.event_date.localeCompare(a.event_date))
                .map((event, idx, arr) => {
                  const isFuel = event.event_type === 'fuel'
                  const d = event.data

                  return (
                    <div key={`${event.event_type}-${event.event_id}`}>
                      <div className="flex items-start gap-3 px-1 py-3">
                        {/* Icon */}
                        <div
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            isFuel
                              ? 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
                              : 'bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400'
                          }`}
                        >
                          {isFuel ? (
                            <Fuel className="h-4 w-4" />
                          ) : (
                            <Wrench className="h-4 w-4" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-medium">
                              {isFuel
                                ? (d.station_name as string | null) ??
                                  (d.fuel_type
                                    ? FUEL_ENTRY_TYPE_LABELS[d.fuel_type as FuelType]
                                    : 'Plein')
                                : (d.maintenance_type as string) ?? 'Maintenance'}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {new Date(event.event_date).toLocaleDateString('fr-FR')}
                            </span>
                          </div>

                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>{event.odometer_reading.toLocaleString('fr-FR')} km</span>

                            {isFuel ? (
                              <>
                                {d.liters != null && (
                                  <span>{(d.liters as number).toFixed(1)} L</span>
                                )}
                                {d.total_cost != null && (
                                  <span className="font-medium text-foreground">
                                    {(d.total_cost as number).toFixed(2)} €
                                  </span>
                                )}
                                {d.fuel_type && (
                                  <Badge variant="outline" className="h-4 px-1 text-[10px]">
                                    {FUEL_ENTRY_TYPE_LABELS[d.fuel_type as FuelType]}
                                  </Badge>
                                )}
                                {d.is_full_tank === false && (
                                  <span className="italic">partiel</span>
                                )}
                              </>
                            ) : (
                              <>
                                {d.cost != null && (
                                  <span className="font-medium text-foreground">
                                    {(d.cost as number).toFixed(2)} €
                                  </span>
                                )}
                                {d.service_provider && (
                                  <span>{d.service_provider as string}</span>
                                )}
                                {d.description && (
                                  <span className="truncate max-w-[160px]">
                                    {d.description as string}
                                  </span>
                                )}
                              </>
                            )}
                          </div>

                          {(d.notes as string | null) && (
                            <p className="mt-0.5 text-xs text-muted-foreground italic truncate">
                              {d.notes as string}
                            </p>
                          )}
                        </div>
                      </div>
                      {idx < arr.length - 1 && <Separator />}
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
