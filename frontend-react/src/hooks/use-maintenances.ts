import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  Maintenance,
  MaintenanceCreate,
  MaintenanceUpdate,
  MaintenanceStatistics,
} from '@/types'

export function useMaintenances(vehicleId: number | null) {
  return useQuery({
    queryKey: ['maintenances', vehicleId],
    queryFn: () => api.get<Maintenance[]>(`/maintenances/vehicle/${vehicleId}`),
    enabled: vehicleId !== null,
  })
}

export function useMaintenanceStats(vehicleId: number | null) {
  return useQuery({
    queryKey: ['maintenanceStats', vehicleId],
    queryFn: () =>
      api.get<MaintenanceStatistics>(`/maintenances/vehicle/${vehicleId}/statistics`),
    enabled: vehicleId !== null,
  })
}

export function useCreateMaintenance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: MaintenanceCreate) =>
      api.post<Maintenance>('/maintenances/', data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['maintenances', variables.vehicle_id] })
      queryClient.invalidateQueries({ queryKey: ['maintenanceStats', variables.vehicle_id] })
      queryClient.invalidateQueries({ queryKey: ['vehicleCostStats', variables.vehicle_id] })
    },
  })
}

export function useUpdateMaintenance(vehicleId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: MaintenanceUpdate }) =>
      api.put<Maintenance>(`/maintenances/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenances', vehicleId] })
      queryClient.invalidateQueries({ queryKey: ['maintenanceStats', vehicleId] })
      queryClient.invalidateQueries({ queryKey: ['vehicleCostStats', vehicleId] })
    },
  })
}

export function useDeleteMaintenance(vehicleId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/maintenances/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenances', vehicleId] })
      queryClient.invalidateQueries({ queryKey: ['maintenanceStats', vehicleId] })
      queryClient.invalidateQueries({ queryKey: ['vehicleCostStats', vehicleId] })
    },
  })
}
