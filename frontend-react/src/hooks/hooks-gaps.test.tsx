// Hook coverage, part 2: nearby-stations fetch/parse, station routing,
// flexfuel rentability, favourite stations, and the fuel/maintenance
// stats + update/delete mutations that the first file leaves uncovered.
import { describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { installFetchRouter, json } from '@/test/fixtures'
import { makeQueryClient } from '@/test/providers'
import { useNearbyStations } from './use-nearby-stations'
import { useStationRoutes, formatDrivingTime, formatRoadDistance } from './use-station-routes'
import { useFlexfuelRentability } from './use-flexfuel'
import { useFavoriteStations } from './use-favorite-stations'
import {
  useFuelStats,
  useConsumptionHistory,
  useUpdateFuelEntry,
} from './use-fuel-entries'
import {
  useMaintenanceStats,
  useUpdateMaintenance,
  useDeleteMaintenance,
} from './use-maintenances'
import { usePeriodStats } from './use-vehicles'
import { useMaintenanceReminders } from './use-maintenance-reminders'

function wrapperFor(queryClient: ReturnType<typeof makeQueryClient>) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return Wrapper
}

describe('useNearbyStations', () => {
  function opendata(rows: unknown[]) {
    return json({ results: rows, total_count: rows.length })
  }

  it('maps rows, prices and the primary price for the queried fuel', async () => {
    const rows = [
      { id: 1, adresse: 'Total Rue A', ville: 'Lyon', cp: '69001', e10_prix: 1.72, sp98_prix: 1.85, geom: { lat: 45.76, lon: 4.84 } },
      { id: 2, adresse: 'BP Rue B', ville: 'Lyon', cp: '69003', e10_prix: 1.69, sp98_prix: 1.82, geom: { lat: 45.77, lon: 4.85 } },
    ]
    const { fetchMock } = installFetchRouter([['/records', () => opendata(rows)]])
    const { result } = renderHook(() => useNearbyStations())
    await act(() => result.current.fetch(45.764, 4.84, 'essence', 5))
    expect(result.current.stations).toHaveLength(2)
    const [a, b] = result.current.stations
    expect(a.price).toBe(1.72) // essence → e10 field
    expect(b.prices.sp98).toBe(1.82)
    expect(result.current.error).toBeNull()
    expect(fetchMock).toHaveBeenCalled()
  })

  it('drops rows without usable coordinates', async () => {
    const rows = [
      { id: 1, adresse: 'OK', ville: 'Lyon', cp: '69001', e10_prix: 1.7, geom: { lat: 45.76, lon: 4.84 } },
      { id: 2, adresse: 'NoGeom', ville: 'Lyon', cp: '69001', e10_prix: 1.6, geom: null },
    ]
    installFetchRouter([['/records', () => opendata(rows)]])
    const { result } = renderHook(() => useNearbyStations())
    await act(() => result.current.fetch(45.76, 4.84))
    expect(result.current.stations).toHaveLength(1)
    expect(result.current.stations[0].id).toBe('1')
  })

  it('paginates through full pages until a short page ends the run', async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1, adresse: `S${i}`, ville: 'Lyon', cp: '69', e10_prix: 1.7,
      geom: { lat: 45.76, lon: 4.84 },
    }))
    const last = [{ id: 101, adresse: 'Last', ville: 'Lyon', cp: '69', e10_prix: 1.7, geom: { lat: 45.76, lon: 4.84 } }]
    let calls = 0
    const { fetchMock } = installFetchRouter([
      ['/records', () => opendata(++calls === 1 ? full : last)],
    ])
    const { result } = renderHook(() => useNearbyStations())
    await act(() => result.current.fetch(45.76, 4.84, 'essence', 50))
    expect(result.current.stations).toHaveLength(101)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('surfaces a load error and clears stations', async () => {
    installFetchRouter([['/records', () => json({ detail: 'nope' }, 500)]])
    const { result } = renderHook(() => useNearbyStations())
    await act(() => result.current.fetch(45.76, 4.84))
    expect(result.current.error).toBe('Impossible de charger les prix des stations')
    expect(result.current.stations).toEqual([])
  })

  it('clear() empties the list and error', async () => {
    const rows = [{ id: 1, adresse: 'A', ville: 'Lyon', cp: '69', e10_prix: 1.7, geom: { lat: 45.76, lon: 4.84 } }]
    installFetchRouter([['/records', () => opendata(rows)]])
    const { result } = renderHook(() => useNearbyStations())
    await act(() => result.current.fetch(45.76, 4.84))
    expect(result.current.stations).toHaveLength(1)
    act(() => result.current.clear())
    expect(result.current.stations).toEqual([])
  })
})

describe('useStationRoutes', () => {
  const origin = { latitude: 45.76, longitude: 4.84 }
  const stations = [
    { id: 's1', latitude: 45.77, longitude: 4.85 },
    { id: 's2', latitude: 45.78, longitude: 4.86 },
  ]

  it('maps legs back to station ids, skipping unroutable ones', async () => {
    installFetchRouter([
      ['/routing/matrix', () => json({
        legs: [
          { distance_m: 1200, duration_s: 420 },
          { distance_m: null, duration_s: null },
        ],
        provider: 'valhalla', cached: false,
      })],
    ])
    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useStationRoutes(origin, stations), { wrapper: wrapperFor(queryClient) })
    await waitFor(() => expect(result.current.routes.size).toBe(1))
    expect(result.current.routes.get('s1')?.distance_m).toBe(1200)
    expect(result.current.routes.get('s2')).toBeUndefined()
    expect(result.current.unavailable).toBe(false)
  })

  it('is disabled (no fetch) without an origin or stations', async () => {
    const { fetchMock } = installFetchRouter([['/routing/matrix', () => json({ legs: [], provider: 'x', cached: false })]])
    const queryClient = makeQueryClient()
    const r1 = renderHook(() => useStationRoutes(null, stations), { wrapper: wrapperFor(queryClient) })
    const r2 = renderHook(() => useStationRoutes(origin, []), { wrapper: wrapperFor(queryClient) })
    await new Promise((r) => setTimeout(r, 30))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(r1.result.current.routes.size).toBe(0)
    expect(r2.result.current.routes.size).toBe(0)
  })

  it('formats driving time and road distance', () => {
    expect(formatDrivingTime(300)).toBe('5 min')
    expect(formatDrivingTime(3600)).toBe('1 h')
    expect(formatDrivingTime(5400)).toBe('1 h 30')
    expect(formatRoadDistance(500)).toBe('500 m')
    expect(formatRoadDistance(1500)).toBe('1.5 km')
  })
})

describe('useFlexfuelRentability', () => {
  it('fetches the rentability summary for a vehicle', async () => {
    installFetchRouter([
      ['/flexfuel/vehicles/1/rentability', () => json({
        vehicle_id: 1, kit_cost: 500, overconsumption_pct: 20,
        conversion_date: '2026-01-01', total_e85_fills: 10,
        total_savings: 120, break_even_reached: false, break_even_date: null,
      })],
    ])
    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useFlexfuelRentability(1), { wrapper: wrapperFor(queryClient) })
    await waitFor(() => expect(result.current.data?.total_savings).toBe(120))
  })
})

describe('useFavoriteStations', () => {
  it('toggles a station on then off, persisting to localStorage', () => {
    const { result } = renderHook(() => useFavoriteStations())
    const station = { id: 'x', name: 'X', lat: 1, lon: 2 }
    act(() => result.current.toggle(station))
    expect(result.current.isFavorite('x')).toBe(true)
    expect(JSON.parse(localStorage.getItem('vroomvroom-fav-stations')!)).toEqual({ x: station })
    act(() => result.current.toggle(station))
    expect(result.current.isFavorite('x')).toBe(false)
  })

  it('recovers from corrupt stored JSON by starting empty', () => {
    localStorage.setItem('vroomvroom-fav-stations', '{not-json')
    const { result } = renderHook(() => useFavoriteStations())
    expect(Object.keys(result.current.favorites)).toHaveLength(0)
  })
})

describe('fuel stats + update mutations', () => {
  it('useFuelStats fetches the statistics endpoint', async () => {
    installFetchRouter([['/fuel-entries/vehicle/1/statistics', () => json({ total_liters: 40, total_cost: 74 })]])
    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useFuelStats(1), { wrapper: wrapperFor(queryClient) })
    await waitFor(() => expect(result.current.data?.total_liters).toBe(40))
  })

  it('useConsumptionHistory fetches the history endpoint', async () => {
    installFetchRouter([['/fuel-entries/vehicle/1/consumption-history', () => json({ vehicle_id: 1, data_points: [] })]])
    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useConsumptionHistory(1), { wrapper: wrapperFor(queryClient) })
    await waitFor(() => expect(result.current.data?.data_points).toEqual([]))
  })

  it('useUpdateFuelEntry PUTs and invalidates the vehicle stats', async () => {
    installFetchRouter([['/fuel-entries/5', () => json({ id: 5 })]])
    const queryClient = makeQueryClient()
    queryClient.setQueryData(['vehicleStats', 1], {})
    const { result } = renderHook(() => useUpdateFuelEntry(1), { wrapper: wrapperFor(queryClient) })
    await result.current.mutateAsync({ id: 5, data: { liters: 30 } as never })
    expect(queryClient.getQueryCache().getAll().find((q) => q.queryKey[0] === 'vehicleStats' && q.queryKey[1] === 1)?.state.isInvalidated).toBe(true)
  })
})

describe('maintenance stats + update/delete mutations', () => {
  it('useMaintenanceStats fetches the statistics endpoint', async () => {
    installFetchRouter([['/maintenances/vehicle/1/statistics', () => json({ total_cost: 80 })]])
    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useMaintenanceStats(1), { wrapper: wrapperFor(queryClient) })
    await waitFor(() => expect(result.current.data?.total_cost).toBe(80))
  })

  it('useUpdateMaintenance PUTs and invalidates', async () => {
    installFetchRouter([['/maintenances/9', () => json({ id: 9 })]])
    const queryClient = makeQueryClient()
    queryClient.setQueryData(['maintenanceStats', 1], {})
    const { result } = renderHook(() => useUpdateMaintenance(1), { wrapper: wrapperFor(queryClient) })
    await result.current.mutateAsync({ id: 9, data: { cost: 90 } as never })
    expect(queryClient.getQueryCache().getAll().find((q) => q.queryKey[0] === 'maintenanceStats' && q.queryKey[1] === 1)?.state.isInvalidated).toBe(true)
  })

  it('useDeleteMaintenance DELETEs and invalidates', async () => {
    installFetchRouter([['/maintenances/9', () => json(null, 204)]])
    const queryClient = makeQueryClient()
    queryClient.setQueryData(['maintenances', 1], [])
    const { result } = renderHook(() => useDeleteMaintenance(1), { wrapper: wrapperFor(queryClient) })
    await result.current.mutateAsync(9)
    expect(queryClient.getQueryCache().getAll().find((q) => q.queryKey[0] === 'maintenances' && q.queryKey[1] === 1)?.state.isInvalidated).toBe(true)
  })
})

describe('usePeriodStats', () => {
  it('fetches when the range is valid, disables when not', async () => {
    const { fetchMock } = installFetchRouter([['/period-stats', () => json({ total_fuel_cost: 100 })]])
    const queryClient = makeQueryClient()
    const valid = renderHook(() => usePeriodStats(1, '2026-01-01', '2026-06-30'), { wrapper: wrapperFor(queryClient) })
    const invalid = renderHook(() => usePeriodStats(1, '2026-06-30', '2026-01-01'), { wrapper: wrapperFor(queryClient) })
    await waitFor(() => expect(valid.result.current.data?.total_fuel_cost).toBe(100))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(invalid.result.current.fetchStatus).toBe('idle')
  })
})

describe('useMaintenanceReminders (branch gaps)', () => {
  // Seed the query cache so useMaintenances / useVehicleStats resolve without
  // any network: batch stats present → the individual stats query is disabled.
  function renderReminders(maintenances: unknown[], lastOdometer: number) {
    const queryClient = makeQueryClient()
    queryClient.setQueryData(['vehicleStatsBatch'], { '1': { last_odometer: lastOdometer } })
    queryClient.setQueryData(['vehicleStats', 1], { last_odometer: lastOdometer })
    queryClient.setQueryData(['maintenances', 1], maintenances)
    return renderHook(() => useMaintenanceReminders(1), { wrapper: wrapperFor(queryClient) })
  }

  it('prefers a km-overdue reminder over a non-overdue date reminder', async () => {
    const { result } = renderReminders(
      [{
        id: 1, vehicle_id: 1, maintenance_type: 'Vidange', cost: 1,
        odometer_reading: 10000, maintenance_date: '2026-01-01',
        next_maintenance_date: '2027-01-01', // far future → date not overdue
        next_maintenance_odometer: 10500, // 500 km behind → km overdue
      }],
      11000,
    )
    await waitFor(() => expect(result.current.reminders.length).toBeGreaterThan(0))
    const r = result.current.reminders.find((x) => x.type === 'Vidange')
    expect(r?.status).toBe('overdue')
    expect(r?.detail).toContain('km')
  })

  it('sorts overdue reminders before upcoming ones', async () => {
    const soon = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)
    const { result } = renderReminders(
      [
        {
          id: 1, vehicle_id: 1, maintenance_type: 'Vidange', cost: 1,
          odometer_reading: 10000, maintenance_date: '2020-01-01',
          next_maintenance_date: '2020-02-01', next_maintenance_odometer: null,
        },
        {
          id: 2, vehicle_id: 1, maintenance_type: 'Pneus', cost: 1,
          odometer_reading: 10000, maintenance_date: '2026-01-01',
          next_maintenance_date: soon, next_maintenance_odometer: null,
        },
      ],
      11000,
    )
    await waitFor(() => expect(result.current.reminders.length).toBe(2))
    expect(result.current.reminders[0].status).toBe('overdue')
    expect(result.current.reminders[1].status).toBe('upcoming')
    expect(result.current.hasUrgent).toBe(true)
  })
})
