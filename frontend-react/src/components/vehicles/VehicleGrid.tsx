import type { VehicleList } from '@/types'
import { VehicleCard } from './VehicleCard'
import { payloadVehicleId } from '@/lib/offline'
import type { QueueItem } from '@/lib/offline'

interface VehicleGridProps {
  vehicles: VehicleList[]
  offlineQueue?: QueueItem[]
  onDetails: (id: number) => void
  onEdit: (id: number) => void
  onFuelAdd: (id: number) => void
  onFuelView: (id: number) => void
  onMaintenanceAdd: (id: number) => void
  onMaintenanceView: (id: number) => void
  onBlendCalc: (id: number) => void
}

export function VehicleGrid({
  vehicles,
  offlineQueue,
  onDetails,
  onEdit,
  onFuelAdd,
  onFuelView,
  onMaintenanceAdd,
  onMaintenanceView,
  onBlendCalc,
}: VehicleGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {vehicles.map((vehicle) => (
        <VehicleCard
          key={vehicle.id}
          vehicle={vehicle}
          fuelQueueCount={offlineQueue?.filter((q) => payloadVehicleId(q.payload) === vehicle.id).length ?? 0}
          onDetails={() => onDetails(vehicle.id)}
          onEdit={() => onEdit(vehicle.id)}
          onFuelAdd={() => onFuelAdd(vehicle.id)}
          onFuelView={() => onFuelView(vehicle.id)}
          onMaintenanceAdd={() => onMaintenanceAdd(vehicle.id)}
          onMaintenanceView={() => onMaintenanceView(vehicle.id)}
          onBlendCalc={() => onBlendCalc(vehicle.id)}
        />
      ))}
    </div>
  )
}
