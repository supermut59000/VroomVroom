import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { shouldFetchIndividualStats } from '@/lib/vehicle-stats'
import type {
  Vehicle,
  VehicleList,
  VehicleCreate,
  VehicleUpdate,
  VehicleStats,
  VehicleCostStats,
  VehicleTimeline,
  VehiclePeriodStats,
  FuelEntry,
  Maintenance,
} from '@/types'

export function useVehicles() {
  return useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.get<VehicleList[]>('/vehicles/'),
  })
}

export function useVehicle(id: number | null) {
  return useQuery({
    queryKey: ['vehicle', id],
    queryFn: () => api.get<Vehicle>(`/vehicles/${id}`),
    enabled: id !== null,
  })
}

export function useAllVehicleStats() {
  return useQuery({
    queryKey: ['vehicleStatsBatch'],
    queryFn: () => api.get<Record<string, VehicleStats>>('/vehicles/stats/batch'),
    staleTime: 30_000,
  })
}

export function useVehicleStats(id: number | null) {
  const { data: batch } = useAllVehicleStats()
  return useQuery({
    queryKey: ['vehicleStats', id],
    queryFn: () => api.get<VehicleStats>(`/vehicles/${id}/stats`),
    enabled: shouldFetchIndividualStats(batch, id),
    // If batch data is available, use it directly without fetching
    ...(batch && id !== null && String(id) in batch
      ? { initialData: batch[String(id)], staleTime: 30_000 }
      : {}),
  })
}

export function useVehicleCostStats(vehicleId: number) {
  return useQuery({
    queryKey: ['vehicleCostStats', vehicleId],
    queryFn: async (): Promise<VehicleCostStats> => {
      const now = new Date()
      const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const yearAgo = new Date(now)
      yearAgo.setFullYear(yearAgo.getFullYear() - 1)

      const [fuelEntries, maintenances] = await Promise.all([
        api.get<FuelEntry[]>(`/fuel-entries/vehicle/${vehicleId}?per_page=500`),
        api.get<Maintenance[]>(`/maintenances/vehicle/${vehicleId}`),
      ])

      let thisMonth = 0
      let annualCost = 0

      for (const e of fuelEntries) {
        const cost = e.liters * e.price_per_liter
        if (e.fueling_date.startsWith(monthStr)) thisMonth += cost
        if (new Date(e.fueling_date) >= yearAgo) annualCost += cost
      }

      for (const e of maintenances) {
        if (e.maintenance_date.startsWith(monthStr)) thisMonth += e.cost
        if (new Date(e.maintenance_date) >= yearAgo) annualCost += e.cost
      }

      return { thisMonth, monthlyAverage: annualCost / 12 }
    },
  })
}

export function useCreateVehicle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: VehicleCreate) => api.post<Vehicle>('/vehicles/', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
    },
  })
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: VehicleUpdate }) =>
      api.put<Vehicle>(`/vehicles/${id}`, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
      queryClient.invalidateQueries({ queryKey: ['vehicle', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['vehicleStats', variables.id] })
    },
  })
}

export function useVehicleTimeline(vehicleId: number | null) {
  return useQuery({
    queryKey: ['vehicleTimeline', vehicleId],
    queryFn: () => api.get<VehicleTimeline>(`/vehicles/${vehicleId}/timeline`),
    enabled: vehicleId !== null,
  })
}

export function useDeleteVehicle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) =>
      api.delete(`/vehicles/${id}${force ? '?force=true' : ''}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
    },
  })
}

export function usePeriodStats(
  vehicleId: number | null,
  startDate: string,
  endDate: string,
) {
  return useQuery({
    queryKey: ['periodStats', vehicleId, startDate, endDate],
    queryFn: () =>
      api.get<VehiclePeriodStats>(
        `/vehicles/${vehicleId}/period-stats?start_date=${startDate}&end_date=${endDate}`,
      ),
    enabled:
      vehicleId !== null && !!startDate && !!endDate && startDate <= endDate,
  })
}
