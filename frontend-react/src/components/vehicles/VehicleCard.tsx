import {
  Fuel,
  BarChart3,
  ClipboardList,
  Wrench,
  Trash2,
  Gauge,
  Calendar,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Separator } from '@/components/ui/separator'
import { useVehicleStats, useVehicleCostStats, useDeleteVehicle } from '@/hooks/use-vehicles'
import { useMaintenanceReminders } from '@/hooks/use-maintenance-reminders'
import { FUEL_TYPE_LABELS, FUEL_TYPE_COLORS } from '@/lib/constants'
import type { VehicleList } from '@/types'
import { toast } from 'sonner'

interface VehicleCardProps {
  vehicle: VehicleList
  onDetails: () => void
  onEdit: () => void
  onFuelAdd: () => void
  onFuelView: () => void
  onMaintenanceAdd: () => void
  onMaintenanceView: () => void
}

export function VehicleCard({
  vehicle,
  onDetails,
  onFuelAdd,
  onFuelView,
  onMaintenanceView,
}: VehicleCardProps) {
  const { data: stats } = useVehicleStats(vehicle.id)
  const { data: costStats } = useVehicleCostStats(vehicle.id)
  const { reminders } = useMaintenanceReminders(vehicle.id)
  const deleteVehicle = useDeleteVehicle()

  const fuelColors = FUEL_TYPE_COLORS[vehicle.fuel_type]

  const handleDelete = async (force: boolean) => {
    try {
      await deleteVehicle.mutateAsync({ id: vehicle.id, force })
      toast.success('Véhicule supprimé')
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }

  return (
    <Card className="flex flex-col transition-shadow hover:shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold leading-tight">
              {vehicle.brand} {vehicle.model}
            </h3>
            <p className="text-sm text-muted-foreground">
              {vehicle.year} &middot; {vehicle.license_plate}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`${fuelColors.bg} ${fuelColors.text} border-0`}>
              {FUEL_TYPE_LABELS[vehicle.fuel_type]}
            </Badge>
            {!vehicle.is_active && (
              <Badge variant="secondary">Inactif</Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-3 pb-3">
        {!stats ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          <>
            {/* Key stats */}
            <div className="grid grid-cols-[3fr_2fr] gap-3">
              <div className="flex items-center gap-2 text-sm">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Compteur:</span>
                <span className="font-medium">
                  {stats.last_odometer
                    ? `${Math.round(stats.last_odometer).toLocaleString('fr-FR')} km`
                    : '—'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Fuel className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Pleins:</span>
                <span className="font-medium">{stats.total_fuel_entries}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Conso:</span>
                <span className="font-medium">
                  {stats.average_consumption
                    ? `${stats.average_consumption.toFixed(1)} L/100`
                    : '—'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Total:</span>
                <span className="font-medium">
                  {stats.total_fuel_cost.toFixed(0)} &euro;
                </span>
              </div>
            </div>

            {/* Insurance status */}
            {stats.current_insurance_km_limit != null && (
              <>
                <Separator />
                <div className="text-sm">
                  {stats.insurance_km_exceeded ? (
                    <Badge variant="destructive" className="text-xs">
                      Limite km assurance dépassée
                    </Badge>
                  ) : stats.insurance_km_remaining != null &&
                    stats.insurance_km_remaining <=
                      stats.current_insurance_km_limit * 0.1 ? (
                    <Badge className="border-0 bg-orange-100 text-xs text-orange-700">
                      {Math.round(stats.insurance_km_remaining).toLocaleString('fr-FR')} km restants
                    </Badge>
                  ) : stats.insurance_km_remaining != null ? (
                    <Badge className="border-0 bg-green-100 text-xs text-green-700">
                      {Math.round(stats.insurance_km_remaining).toLocaleString('fr-FR')} km restants
                    </Badge>
                  ) : null}
                </div>
              </>
            )}

            {/* Maintenance reminders */}
            {reminders.length > 0 && (
              <>
                <Separator />
                <div className="space-y-1">
                  {reminders.map((r, i) => (
                    <Badge
                      key={i}
                      variant={r.status === 'overdue' ? 'destructive' : 'outline'}
                      className={
                        r.status === 'upcoming'
                          ? 'border-0 bg-orange-100 text-xs text-orange-700 dark:bg-orange-950 dark:text-orange-400'
                          : 'text-xs'
                      }
                    >
                      {r.detail}
                    </Badge>
                  ))}
                </div>
              </>
            )}

            {/* Days since last entry */}
            {stats.days_since_last_entry != null && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                Dernier plein il y a {stats.days_since_last_entry} jour
                {stats.days_since_last_entry !== 1 ? 's' : ''}
              </div>
            )}

            {/* Monthly costs */}
            {costStats && (costStats.thisMonth > 0 || costStats.monthlyAverage > 0) && (
              <>
                <Separator />
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-muted/50 p-2 text-center">
                    <p className="text-xs text-muted-foreground">Ce mois</p>
                    <p className="text-sm font-semibold">{costStats.thisMonth.toFixed(0)} &euro;</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-2 text-center">
                    <p className="text-xs text-muted-foreground">Moy. /mois</p>
                    <p className="text-sm font-semibold">{costStats.monthlyAverage.toFixed(0)} &euro;</p>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>

      <CardFooter className="flex justify-center gap-2 border-t pt-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={onFuelAdd} aria-label="Ajouter un plein">
              <Fuel className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ajouter un plein</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={onDetails} aria-label="Détails et statistiques">
              <BarChart3 className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Détails & stats</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={onFuelView} aria-label="Historique carburant">
              <ClipboardList className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Historique carburant</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={onMaintenanceView} aria-label="Voir la maintenance">
              <Wrench className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Maintenance</TooltipContent>
        </Tooltip>

        <AlertDialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive hover:text-destructive" aria-label="Supprimer le véhicule">
                  <Trash2 className="h-5 w-5" />
                </Button>
              </AlertDialogTrigger>
            </TooltipTrigger>
            <TooltipContent>Supprimer</TooltipContent>
          </Tooltip>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer {vehicle.brand} {vehicle.model} ?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est irréversible. Toutes les données associées
                (pleins, maintenances) seront également supprimées.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => handleDelete(true)}
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  )
}
