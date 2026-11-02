import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Car, RefreshCw, Fuel, Snowflake, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useVehicles } from '@/hooks/use-vehicles'
import { useOffline } from '@/hooks/use-offline'
import { useColdAlert } from '@/hooks/use-cold-alert'
import { VehicleGrid } from '@/components/vehicles/VehicleGrid'
import { VehicleAddDialog } from '@/components/vehicles/VehicleAddDialog'
import { VehicleDetailsDialog } from '@/components/vehicles/VehicleDetailsDialog'
import { VehicleEditDialog } from '@/components/vehicles/VehicleEditDialog'
import { FuelAddDialog } from '@/components/fuel/FuelAddDialog'
import { FuelViewDialog } from '@/components/fuel/FuelViewDialog'
import { MaintenanceAddDialog } from '@/components/maintenance/MaintenanceAddDialog'
import { MaintenanceViewDialog } from '@/components/maintenance/MaintenanceViewDialog'
import { BlendCalculatorDialog } from '@/components/flexfuel/BlendCalculatorDialog'
import { PumpFillDialog } from '@/components/flexfuel/PumpFillDialog'
import { seedE10BasePriceIfNeeded } from '@/lib/e10-seed'

export function Dashboard() {
  const { data: vehicles, isLoading, error, refetch } = useVehicles()
  const { queue: offlineQueue } = useOffline()
  const { message: coldAlertMessage } = useColdAlert()
  const [coldBannerOpen, setColdBannerOpen] = useState(true)

  // Dialog state
  const [addVehicleOpen, setAddVehicleOpen] = useState(false)
  const [detailsVehicleId, setDetailsVehicleId] = useState<number | null>(null)
  const [editVehicleId, setEditVehicleId] = useState<number | null>(null)
  const [fuelAddVehicleId, setFuelAddVehicleId] = useState<number | null>(null)
  const [fuelViewVehicleId, setFuelViewVehicleId] = useState<number | null>(null)
  const [maintenanceAddVehicleId, setMaintenanceAddVehicleId] = useState<number | null>(null)
  const [maintenanceViewVehicleId, setMaintenanceViewVehicleId] = useState<number | null>(null)
  const [blendCalcVehicleId, setBlendCalcVehicleId] = useState<number | null>(null)
  const [pumpFillVehicleId, setPumpFillVehicleId] = useState<number | null>(null)
  const [fabSheetOpen, setFabSheetOpen] = useState(false)

  // First launch (local mode): seed a base E10 price (cheapest Paris station)
  // so E85 rentability has a reference from day one.
  const queryClient = useQueryClient()
  useEffect(() => {
    let cancelled = false
    void seedE10BasePriceIfNeeded().then((seeded) => {
      if (seeded && !cancelled) {
        queryClient.invalidateQueries({ queryKey: ['e10ReferencePrices'] })
      }
    })
    return () => {
      cancelled = true
    }
  }, [queryClient])

  const handleFabClick = () => {
    if (!vehicles || vehicles.length === 0) return
    if (vehicles.length === 1) {
      setFuelAddVehicleId(vehicles[0].id)
    } else {
      setFabSheetOpen(true)
    }
  }

  const handleFabVehicleSelect = (vehicleId: number) => {
    setFabSheetOpen(false)
    setFuelAddVehicleId(vehicleId)
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-lg text-muted-foreground">
          Erreur lors du chargement des véhicules
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Réessayer
        </Button>
      </div>
    )
  }

  if (!vehicles || vehicles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <Car className="h-16 w-16 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold text-muted-foreground">
          Aucun véhicule
        </h2>
        <p className="text-muted-foreground">
          Ajoutez votre premier véhicule pour commencer le suivi
        </p>
        <Button onClick={() => setAddVehicleOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Ajouter un véhicule
        </Button>
        <VehicleAddDialog open={addVehicleOpen} onOpenChange={setAddVehicleOpen} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {coldAlertMessage && coldBannerOpen && (
        <div className="flex items-start justify-between gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
          <span className="flex items-center gap-2">
            <Snowflake className="h-4 w-4 shrink-0" />
            {coldAlertMessage}
          </span>
          <button
            type="button"
            onClick={() => setColdBannerOpen(false)}
            aria-label="Fermer l'alerte"
            className="shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
          Mes véhicules ({vehicles.length})
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} title="Rafraîchir">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => setAddVehicleOpen(true)}>
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Ajouter</span>
          </Button>
        </div>
      </div>

      <VehicleGrid
        vehicles={vehicles}
        offlineQueue={offlineQueue}
        onDetails={setDetailsVehicleId}
        onEdit={setEditVehicleId}
        onFuelAdd={setFuelAddVehicleId}
        onFuelView={setFuelViewVehicleId}
        onMaintenanceAdd={setMaintenanceAddVehicleId}
        onMaintenanceView={setMaintenanceViewVehicleId}
        onBlendCalc={setBlendCalcVehicleId}
        onPumpFill={setPumpFillVehicleId}
      />

      {/* Dialogs */}
      <VehicleAddDialog open={addVehicleOpen} onOpenChange={setAddVehicleOpen} />
      <VehicleDetailsDialog
        vehicleId={detailsVehicleId}
        onClose={() => setDetailsVehicleId(null)}
        onEdit={(id) => {
          setDetailsVehicleId(null)
          setEditVehicleId(id)
        }}
      />
      <VehicleEditDialog
        vehicleId={editVehicleId}
        onClose={() => setEditVehicleId(null)}
      />
      <FuelAddDialog
        vehicleId={fuelAddVehicleId}
        onClose={() => setFuelAddVehicleId(null)}
      />
      <FuelViewDialog
        vehicleId={fuelViewVehicleId}
        onClose={() => setFuelViewVehicleId(null)}
      />
      <MaintenanceAddDialog
        vehicleId={maintenanceAddVehicleId}
        onClose={() => setMaintenanceAddVehicleId(null)}
      />
      <MaintenanceViewDialog
        vehicleId={maintenanceViewVehicleId}
        onClose={() => setMaintenanceViewVehicleId(null)}
      />
      <BlendCalculatorDialog
        vehicleId={blendCalcVehicleId}
        onClose={() => setBlendCalcVehicleId(null)}
      />
      <PumpFillDialog
        vehicleId={pumpFillVehicleId}
        onClose={() => setPumpFillVehicleId(null)}
      />

      {/* Floating Action Button — quick fuel add */}
      <button
        onClick={handleFabClick}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
        aria-label="Ajouter un plein"
      >
        <div className="relative">
          <Fuel className="h-6 w-6" />
          <Plus className="absolute -right-1.5 -top-1.5 h-3.5 w-3.5" />
          {offlineQueue.length > 0 && (
            <span className="absolute -right-3 -top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white leading-none">
              {offlineQueue.length}
            </span>
          )}
        </div>
      </button>

      {/* Vehicle picker sheet for FAB (multi-vehicle) */}
      <Sheet open={fabSheetOpen} onOpenChange={setFabSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Choisir un véhicule</SheetTitle>
          </SheetHeader>
          <div className="space-y-2 py-4">
            {vehicles.map((v) => (
              <button
                key={v.id}
                onClick={() => handleFabVehicleSelect(v.id)}
                className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted active:bg-muted"
              >
                <Fuel className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{v.brand} {v.model}</p>
                  <p className="text-xs text-muted-foreground">{v.license_plate}</p>
                </div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
