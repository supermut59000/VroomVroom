import type { VehicleList } from '@/types'
import { VehicleCard } from './VehicleCard'

interface VehicleGridProps {
  vehicles: VehicleList[]
  onDetails: (id: number) => void
  onEdit: (id: number) => void
  onFuelAdd: (id: number) => void
  onFuelView: (id: number) => void
  onMaintenanceAdd: (id: number) => void
  onMaintenanceView: (id: number) => void
}

export function VehicleGrid({
  vehicles,
  onDetails,
  onEdit,
  onFuelAdd,
  onFuelView,
  onMaintenanceAdd,
  onMaintenanceView,
}: VehicleGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {vehicles.map((vehicle) => (
        <VehicleCard
          key={vehicle.id}
          vehicle={vehicle}
          onDetails={() => onDetails(vehicle.id)}
          onEdit={() => onEdit(vehicle.id)}
          onFuelAdd={() => onFuelAdd(vehicle.id)}
          onFuelView={() => onFuelView(vehicle.id)}
          onMaintenanceAdd={() => onMaintenanceAdd(vehicle.id)}
          onMaintenanceView={() => onMaintenanceView(vehicle.id)}
        />
      ))}
    </div>
  )
}
