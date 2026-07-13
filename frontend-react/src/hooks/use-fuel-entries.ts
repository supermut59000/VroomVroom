import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  FuelEntry,
  FuelEntryCreate,
  FuelEntryUpdate,
  FuelStatistics,
  ConsumptionHistory,
} from '@/types'

export function useFuelEntries(vehicleId: number | null, page = 1, perPage = 20) {
  return useQuery({
    queryKey: ['fuelEntries', vehicleId, page, perPage],
    queryFn: () =>
      api.get<FuelEntry[]>(
        `/fuel-entries/vehicle/${vehicleId}?page=${page}&per_page=${perPage}`,
      ),
    enabled: vehicleId !== null,
  })
}

export function useAllFuelEntries(vehicleId: number | null) {
  return useQuery({
    queryKey: ['allFuelEntries', vehicleId],
    queryFn: () =>
      api.get<FuelEntry[]>(`/fuel-entries/vehicle/${vehicleId}?per_page=500`),
    enabled: vehicleId !== null,
  })
}

export function useLatestFuelEntry(vehicleId: number | null) {
  return useQuery({
    queryKey: ['latestFuelEntry', vehicleId],
    queryFn: () => api.get<FuelEntry>(`/fuel-entries/vehicle/${vehicleId}/latest`),
    enabled: vehicleId !== null,
  })
}

export function useFuelStats(vehicleId: number | null) {
  return useQuery({
    queryKey: ['fuelStats', vehicleId],
    queryFn: () =>
      api.get<FuelStatistics>(`/fuel-entries/vehicle/${vehicleId}/statistics`),
    enabled: vehicleId !== null,
  })
}

export function useConsumptionHistory(vehicleId: number | null) {
  return useQuery({
    queryKey: ['consumptionHistory', vehicleId],
    queryFn: () =>
      api.get<ConsumptionHistory>(
        `/fuel-entries/vehicle/${vehicleId}/consumption-history`,
      ),
    enabled: vehicleId !== null,
  })
}

export function useNearestStation(
  vehicleId: number | null,
  lat: number | null,
  lon: number | null,
) {
  return useQuery({
    queryKey: ['nearestStation', vehicleId, lat, lon],
    queryFn: () =>
      api.get<{ station_name: string; location: string | null; distance_m: number }>(
        `/fuel-entries/vehicle/${vehicleId}/nearest-station?lat=${lat}&lon=${lon}`,
      ),
    enabled: vehicleId !== null && lat !== null && lon !== null,
    retry: false, // 404 = no known station nearby, that's fine
  })
}

export function useStationSuggestions(vehicleId: number | null) {
  return useQuery({
    queryKey: ['stationSuggestions', vehicleId],
    queryFn: () =>
      api.get<string[]>(`/fuel-entries/stations?vehicle_id=${vehicleId}`),
    enabled: vehicleId !== null,
  })
}

/** All entries across all vehicles that have GPS + station_name — used for station name overrides */
export function useGlobalStationHistory() {
  return useQuery({
    queryKey: ['globalStationHistory'],
    queryFn: () => api.get<{ entries: FuelEntry[] }>('/fuel-entries/?per_page=500'),
    staleTime: 5 * 60 * 1000,
    select: ({ entries }) =>
      entries.filter(
        (e): e is FuelEntry & { latitude: number; longitude: number; station_name: string } =>
          e.latitude != null && e.longitude != null && e.station_name != null,
      ),
  })
}

export function useCreateFuelEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    // allowOdometerDecrease maps to the backend's ?allow_odometer_decrease
    // query param — set when the user explicitly confirmed a lower reading
    // (backfill of an older fill, odometer swap).
    mutationFn: ({
      allowOdometerDecrease,
      ...data
    }: FuelEntryCreate & { allowOdometerDecrease?: boolean }) =>
      api.post<FuelEntry>(
        `/fuel-entries/${allowOdometerDecrease ? '?allow_odometer_decrease=true' : ''}`,
        data,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['fuelEntries', variables.vehicle_id] })
      queryClient.invalidateQueries({ queryKey: ['allFuelEntries', variables.vehicle_id] })
      queryClient.invalidateQueries({ queryKey: ['latestFuelEntry', variables.vehicle_id] })
      queryClient.invalidateQueries({ queryKey: ['fuelStats', variables.vehicle_id] })
      queryClient.invalidateQueries({ queryKey: ['consumptionHistory', variables.vehicle_id] })
      queryClient.invalidateQueries({ queryKey: ['vehicleStats', variables.vehicle_id] })
      queryClient.invalidateQueries({ queryKey: ['vehicleCostStats', variables.vehicle_id] })
      queryClient.invalidateQueries({ queryKey: ['stationSuggestions', variables.vehicle_id] })
    },
  })
}

export function useUpdateFuelEntry(vehicleId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: FuelEntryUpdate }) =>
      api.put<FuelEntry>(`/fuel-entries/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuelEntries', vehicleId] })
      queryClient.invalidateQueries({ queryKey: ['allFuelEntries', vehicleId] })
      queryClient.invalidateQueries({ queryKey: ['fuelStats', vehicleId] })
      queryClient.invalidateQueries({ queryKey: ['consumptionHistory', vehicleId] })
      queryClient.invalidateQueries({ queryKey: ['vehicleStats', vehicleId] })
      queryClient.invalidateQueries({ queryKey: ['vehicleCostStats', vehicleId] })
    },
  })
}

export function useDeleteFuelEntry(vehicleId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/fuel-entries/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuelEntries', vehicleId] })
      queryClient.invalidateQueries({ queryKey: ['allFuelEntries', vehicleId] })
      queryClient.invalidateQueries({ queryKey: ['fuelStats', vehicleId] })
      queryClient.invalidateQueries({ queryKey: ['consumptionHistory', vehicleId] })
      queryClient.invalidateQueries({ queryKey: ['vehicleStats', vehicleId] })
      queryClient.invalidateQueries({ queryKey: ['vehicleCostStats', vehicleId] })
    },
  })
}
