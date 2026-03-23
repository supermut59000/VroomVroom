import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  FlexfuelConversion,
  FlexfuelConversionCreate,
  FlexfuelConversionUpdate,
  E10ReferencePrice,
  E10ReferencePriceCreate,
  FlexfuelRentabilitySummary,
} from '@/types'

// ---- Conversion ----

export function useFlexfuelConversion(vehicleId: number | null) {
  return useQuery({
    queryKey: ['flexfuelConversion', vehicleId],
    queryFn: () =>
      api.get<FlexfuelConversion>(`/flexfuel/vehicles/${vehicleId}/conversion`),
    enabled: vehicleId !== null,
    retry: false, // 404 is expected when no conversion exists
  })
}

export function useCreateFlexfuelConversion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: FlexfuelConversionCreate) =>
      api.post<FlexfuelConversion>(
        `/flexfuel/vehicles/${data.vehicle_id}/conversion`,
        data,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['flexfuelConversion', variables.vehicle_id],
      })
      queryClient.invalidateQueries({
        queryKey: ['flexfuelRentability', variables.vehicle_id],
      })
    },
  })
}

export function useUpdateFlexfuelConversion(vehicleId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: FlexfuelConversionUpdate) =>
      api.put<FlexfuelConversion>(
        `/flexfuel/vehicles/${vehicleId}/conversion`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['flexfuelConversion', vehicleId],
      })
      queryClient.invalidateQueries({
        queryKey: ['flexfuelRentability', vehicleId],
      })
    },
  })
}

export function useDeleteFlexfuelConversion(vehicleId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete(`/flexfuel/vehicles/${vehicleId}/conversion`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['flexfuelConversion', vehicleId],
      })
      queryClient.invalidateQueries({
        queryKey: ['flexfuelRentability', vehicleId],
      })
    },
  })
}

// ---- E10 Reference Prices (global) ----

export function useE10ReferencePrices() {
  return useQuery({
    queryKey: ['e10ReferencePrices'],
    queryFn: () => api.get<E10ReferencePrice[]>('/flexfuel/e10-prices'),
  })
}

export function useCreateE10ReferencePrice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: E10ReferencePriceCreate) =>
      api.post<E10ReferencePrice>('/flexfuel/e10-prices', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['e10ReferencePrices'] })
      queryClient.invalidateQueries({ queryKey: ['flexfuelRentability'] })
    },
  })
}

export function useDeleteE10ReferencePrice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (priceId: number) =>
      api.delete(`/flexfuel/e10-prices/${priceId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['e10ReferencePrices'] })
      queryClient.invalidateQueries({ queryKey: ['flexfuelRentability'] })
    },
  })
}

// ---- Rentability ----

export function useFlexfuelRentability(vehicleId: number | null) {
  return useQuery({
    queryKey: ['flexfuelRentability', vehicleId],
    queryFn: () =>
      api.get<FlexfuelRentabilitySummary>(
        `/flexfuel/vehicles/${vehicleId}/rentability`,
      ),
    enabled: vehicleId !== null,
    retry: false,
  })
}
