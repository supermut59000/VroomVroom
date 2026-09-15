// Hooks coverage: maintenance reminders, geolocation, vehicles/fuel/maintenance
// mutations, stats queries, and offline-queue sync of every payload kind.
// Fetch is stubbed per-test with installFetchRouter().
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { installFetchRouter, json, stats1 } from '@/test/fixtures'
import { makeQueryClient } from '@/test/providers'
import {
  useVehicles,
  useVehicle,
  useVehicleStats,
  useVehicleCostStats,
  useVehicleTimeline,
  useCreateVehicle,
  useUpdateVehicle,
  useDeleteVehicle,
  usePeriodStats,
} from './use-vehicles'
import {
  useFuelEntries,
  useGlobalStationHistory,
  useNearestStation,
  useCreateFuelEntry,
  useDeleteFuelEntry,
} from './use-fuel-entries'
import { useMaintenanceTypeOptions, useCreateMaintenance } from './use-maintenances'
import { useMaintenanceReminders } from './use-maintenance-reminders'
import { useGeolocation } from './use-geolocation'
import { useOffline, OfflineProvider } from './use-offline'
import { QUEUE_KEY } from '@/lib/offline'
import type { QueueItem } from '@/lib/offline'
import type { Maintenance } from '@/types'
import type { VehicleStats } from '@/types'

function wrapperFor(queryClient: ReturnType<typeof makeQueryClient>) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return Wrapper
}

function maintenance(over: Partial<Maintenance> & { maintenance_date: string }): Maintenance {
  return {
    id: 1,
    vehicle_id: 1,
    maintenance_type: 'Vidange',
    description: null,
    cost: 0,
    odometer_reading: 0,
    service_provider: null,
    location: null,
    notes: null,
    next_maintenance_date: null,
    next_maintenance_odometer: null,
    created_at: '2026-01-01T00:00:00',
    updated_at: null,
    ...over,
  }
}

// Local calendar date (not toISOString's UTC) — the reminder logic compares
// local-midnight dates, so the string must be the local date or TZ skew
// shifts the day count by one.
function dateStr(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

beforeEach(() => {
  localStorage.clear()
})

describe('useMaintenanceReminders', () => {
  function setup(maints: Maintenance[], lastOdometer: number) {
    installFetchRouter([
      ['/maintenances/vehicle/1', () => json(maints)],
      ['/vehicles/stats/batch', () => json({ '1': { ...stats1, last_odometer: lastOdometer } as VehicleStats })],
    ])
    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useMaintenanceReminders(1), {
      wrapper: wrapperFor(queryClient),
    })
    return result
  }

  it('no maintenances → no reminders', async () => {
    const result = setup([], 20000)
    await waitFor(() => expect(result.current.reminders).toEqual([]))
    expect(result.current.hasUrgent).toBe(false)
  })

  it('overdue date → urgent reminder with day count', async () => {
    const result = setup([maintenance({ maintenance_date: '2026-01-01', next_maintenance_date: dateStr(-5) })], 20000)
    await waitFor(() => expect(result.current.reminders).toHaveLength(1))
    expect(result.current.reminders[0].status).toBe('overdue')
    expect(result.current.reminders[0].detail).toBe('Vidange dépassée de 5 jours')
    expect(result.current.hasUrgent).toBe(true)
  })

  it('single-day overdue uses singular "jour"', async () => {
    const result = setup([maintenance({ maintenance_date: '2026-01-01', next_maintenance_date: dateStr(-1) })], 20000)
    await waitFor(() => expect(result.current.reminders).toHaveLength(1))
    expect(result.current.reminders[0].detail).toBe('Vidange dépassée de 1 jour')
  })

  it('feminine label ends with "dépasseée"', async () => {
    const result = setup([
      maintenance({ maintenance_date: '2026-01-01', maintenance_type: 'Électrovanne', next_maintenance_date: dateStr(-2) }),
    ], 20000)
    await waitFor(() => expect(result.current.reminders).toHaveLength(1))
    expect(result.current.reminders[0].detail).toBe('Électrovanne dépassée de 2 jours')
  })

  it('date within 30 days → upcoming', async () => {
    const result = setup([maintenance({ maintenance_date: '2026-01-01', next_maintenance_date: dateStr(15) })], 20000)
    await waitFor(() => expect(result.current.reminders).toHaveLength(1))
    expect(result.current.reminders[0].status).toBe('upcoming')
    expect(result.current.reminders[0].detail).toBe('Vidange dans 15 jours')
  })

  it('date beyond 30 days → no reminder', async () => {
    const result = setup([maintenance({ maintenance_date: '2026-01-01', next_maintenance_date: dateStr(90) })], 20000)
    await waitFor(() => expect(result.current.reminders).toEqual([]))
  })

  it('km overdue when last odometer passes the threshold', async () => {
    const result = setup([maintenance({ maintenance_date: '2026-01-01', next_maintenance_odometer: 19500 })], 20000)
    await waitFor(() => expect(result.current.reminders).toHaveLength(1))
    expect(result.current.reminders[0].detail).toBe('Vidange dépassée de 500 km')
    expect(result.current.hasUrgent).toBe(true)
  })

  it('km within 1000 km → upcoming', async () => {
    const result = setup([maintenance({ maintenance_date: '2026-01-01', next_maintenance_odometer: 20800 })], 20000)
    await waitFor(() => expect(result.current.reminders).toHaveLength(1))
    expect(result.current.reminders[0].detail).toBe('Vidange dans 800 km')
  })

  it('both triggers → keeps the single most urgent reminder', async () => {
    // km overdue + date upcoming → km wins
    const a = setup(
      [maintenance({ maintenance_date: '2026-01-01', next_maintenance_date: dateStr(10), next_maintenance_odometer: 19000 })],
      20000,
    )
    await waitFor(() => expect(a.current.reminders).toHaveLength(1))
    expect(a.current.reminders[0].detail).toContain('km')

    // date overdue + km upcoming → date wins
    const b = setup(
      [maintenance({ maintenance_date: '2026-01-01', next_maintenance_date: dateStr(-3), next_maintenance_odometer: 25000 })],
      20000,
    )
    await waitFor(() => expect(b.current.reminders).toHaveLength(1))
    expect(b.current.reminders[0].detail).toContain('jours')
  })

  it('only the most recent entry per type is checked', async () => {
    // Older "Vidange" overdue, newer "Vidange" fine → no reminder at all.
    const result = setup(
      [
        maintenance({ id: 1, maintenance_date: '2026-01-01', next_maintenance_date: dateStr(-40) }),
        maintenance({ id: 2, maintenance_date: '2026-07-01', next_maintenance_date: dateStr(200) }),
      ],
      20000,
    )
    await waitFor(() => expect(result.current.reminders).toEqual([]))
  })

  it('km triggers are skipped without an odometer reading', async () => {
    const result = setup([maintenance({ maintenance_date: '2026-01-01', next_maintenance_odometer: 19500 })], 0)
    await waitFor(() => expect(result.current.reminders).toEqual([]))
  })

  it('overdue reminders sort before upcoming ones', async () => {
    const result = setup(
      [
        maintenance({ id: 1, maintenance_type: 'Freins', maintenance_date: '2026-01-01', next_maintenance_date: dateStr(5) }),
        maintenance({ id: 2, maintenance_type: 'Batterie', maintenance_date: '2026-01-01', next_maintenance_date: dateStr(-5) }),
      ],
      20000,
    )
    await waitFor(() => expect(result.current.reminders).toHaveLength(2))
    expect(result.current.reminders[0].type).toBe('Batterie')
    expect(result.current.reminders[0].status).toBe('overdue')
  })
})

describe('useGeolocation', () => {
  afterEach(() => {
    delete (navigator as { geolocation?: unknown }).geolocation
  })

  // Real GeolocationPositionError instances expose the WebIDL constants on their
  // prototype; the hook compares error.code === error.PERMISSION_DENIED.
  function withGeo(impl: 'unsupported' | 'success' | 'denied' | 'timeout' = 'success') {
    const getCurrentPosition = vi.fn((ok: (p: { coords: { latitude: number; longitude: number } }) => void, err: (e: { code: number; PERMISSION_DENIED: number; TIMEOUT: number }) => void) => {
      if (impl === 'success') ok({ coords: { latitude: 45.76, longitude: 4.84 } })
      else if (impl === 'denied') err({ code: 1, PERMISSION_DENIED: 1, TIMEOUT: 3 })
      else err({ code: 3, PERMISSION_DENIED: 1, TIMEOUT: 3 })
    })
    if (impl !== 'unsupported') {
      Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
    }
    return getCurrentPosition
  }

  it('captures a successful position', async () => {
    withGeo('success')
    const { result } = renderHook(() => useGeolocation())
    act(() => { result.current.capture() })
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.latitude).toBe(45.76)
    expect(result.current.longitude).toBe(4.84)
  })

  it('reports permission denial with a specific message', async () => {
    withGeo('denied')
    const { result } = renderHook(() => useGeolocation())
    act(() => { result.current.capture() })
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBe("Permission de géolocalisation refusée")
  })

  it('reports timeout', async () => {
    withGeo('timeout')
    const { result } = renderHook(() => useGeolocation())
    act(() => { result.current.capture() })
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBe("Délai d'attente dépassé")
  })

  it('errors when geolocation is unsupported', () => {
    withGeo('unsupported')
    const { result } = renderHook(() => useGeolocation())
    act(() => { result.current.capture() })
    expect(result.current.status).toBe('error')
    expect(result.current.error).toContain('n\'est pas supportée')
  })

  it('reset returns to idle', async () => {
    withGeo('success')
    const { result } = renderHook(() => useGeolocation())
    act(() => { result.current.capture() })
    await waitFor(() => expect(result.current.status).toBe('success'))
    act(() => { result.current.reset() })
    expect(result.current.status).toBe('idle')
    expect(result.current.latitude).toBeNull()
  })
})

describe('useMaintenanceTypeOptions', () => {
  it('used types first, deduped case-insensitively against presets', async () => {
    installFetchRouter([
      ['/maintenances/vehicle/1', () =>
        json([
          maintenance({ id: 1, maintenance_type: 'vidange', maintenance_date: '2026-01-01' }),
          maintenance({ id: 2, maintenance_type: 'Freins', maintenance_date: '2026-02-01' }),
        ])],
    ])
    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useMaintenanceTypeOptions(1), { wrapper: wrapperFor(queryClient) })
    await waitFor(() => expect(result.current[0]).toBe('vidange'))
    expect(result.current[1]).toBe('Freins')
    // 'Vidange' preset must not duplicate the used 'vidange'
    expect(result.current.filter((t) => t.toLowerCase() === 'vidange')).toHaveLength(1)
    expect(result.current).toContain('Pneus hiver')
  })

  it('no history → presets unchanged', async () => {
    installFetchRouter([['/maintenances/vehicle/1', () => json([])]])
    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useMaintenanceTypeOptions(1), { wrapper: wrapperFor(queryClient) })
    await waitFor(() => expect(result.current.length).toBeGreaterThan(0))
    expect(result.current[0]).toBe('Vidange')
  })
})

describe('vehicle hooks', () => {
  it('useVehicles fetches the list', async () => {
    installFetchRouter([['/vehicles/', () => json([{ id: 1, brand: 'Peugeot', model: '208', year: 2019, license_plate: 'AB-123-CD', fuel_type: 'essence', is_active: true, insurance_unlimited: false }])]])
    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useVehicles(), { wrapper: wrapperFor(queryClient) })
    await waitFor(() => expect(result.current.data?.[0].brand).toBe('Peugeot'))
  })

  it('useVehicle(null) is disabled (no fetch)', async () => {
    const { fetchMock } = installFetchRouter([])
    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useVehicle(null), { wrapper: wrapperFor(queryClient) })
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('useVehicleStats uses batch initialData without any fetch', async () => {
    const { fetchMock } = installFetchRouter([
      ['/vehicles/1/stats', () => json(stats1)],
    ])
    // Warm batch cache → the individual query is disabled and served from initialData.
    const queryClient = makeQueryClient()
    queryClient.setQueryData(['vehicleStatsBatch'], { '1': stats1 })
    const { result } = renderHook(() => useVehicleStats(1), { wrapper: wrapperFor(queryClient) })
    await waitFor(() => expect(result.current.data?.vehicle_id).toBe(1))
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('useVehicleStats fetches individually when the batch failed', async () => {
    const { fetchMock } = installFetchRouter([
      ['/vehicles/stats/batch', () => json({ detail: 'boom' }, 500)],
      ['/vehicles/1/stats', () => json(stats1)],
    ])
    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useVehicleStats(1), { wrapper: wrapperFor(queryClient) })
    await waitFor(() => expect(result.current.data?.vehicle_id).toBe(1))
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/vehicles/1/stats'))).toBe(true)
  })

  it('useCreateVehicle POSTs and invalidates the list', async () => {
    const { fetchMock } = installFetchRouter([
      ['/vehicles/', (_url, init) => (init?.method === 'POST' ? json({ id: 2 }, 201) : json([]))],
    ])
    const queryClient = makeQueryClient()
    queryClient.setQueryData(['vehicles'], [])
    const { result } = renderHook(() => useCreateVehicle(), { wrapper: wrapperFor(queryClient) })
    await result.current.mutateAsync({ brand: 'Renault', model: 'Clio', year: 2020, license_plate: 'EF-456-GH', fuel_type: 'essence', initial_odometer: 10000 })
    const post = fetchMock.mock.calls.find((c) => String(c[1]?.method) === 'POST')
    expect(String(post?.[0])).toContain('/vehicles/')
    const listQuery = queryClient.getQueryCache().getAll().find((q) => q.queryKey[0] === 'vehicles')
    expect(listQuery?.state.isInvalidated).toBe(true)
  })

  it('useUpdateVehicle PUTs and invalidates the per-vehicle keys', async () => {
    const { fetchMock } = installFetchRouter([
      ['/vehicles/1', (_url, init) => (init?.method === 'PUT' ? json({ id: 1 }) : undefined)],
    ])
    const queryClient = makeQueryClient()
    queryClient.setQueryData(['vehicle', 1], { id: 1 })
    const { result } = renderHook(() => useUpdateVehicle(), { wrapper: wrapperFor(queryClient) })
    await result.current.mutateAsync({ id: 1, data: { brand: 'Peugeot' } })
    expect(fetchMock.mock.calls.some((c) => String(c[1]?.method) === 'PUT' && String(c[0]).includes('/vehicles/1'))).toBe(true)
    expect(queryClient.getQueryCache().getAll().find((q) => q.queryKey[0] === 'vehicle' && q.queryKey[1] === 1)?.state.isInvalidated).toBe(true)
  })

  it('useDeleteVehicle appends ?force=true when asked', async () => {
    const { fetchMock } = installFetchRouter([['/vehicles/1', () => json(null, 204)]])
    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useDeleteVehicle(), { wrapper: wrapperFor(queryClient) })
    await result.current.mutateAsync({ id: 1, force: true })
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('?force=true'))).toBe(true)
  })

  it('useVehicleCostStats sums this month and the last 12 months', async () => {
    const now = new Date()
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    installFetchRouter([
      ['/fuel-entries/vehicle/1?per_page=500', () =>
        json([
          { liters: 10, price_per_liter: 2, fueling_date: `${monthStr}-05` },
          { liters: 10, price_per_liter: 2, fueling_date: `${monthStr}-10` },
        ])],
      ['/maintenances/vehicle/1', () =>
        json([maintenance({ maintenance_date: `${monthStr}-03`, cost: 50, odometer_reading: 10000 })])],
    ])
    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useVehicleCostStats(1), { wrapper: wrapperFor(queryClient) })
    await waitFor(() => expect(result.current.data?.thisMonth).toBe(90))
    // annual = 20 + 20 + 50 = 90 → /12
    expect(result.current.data?.monthlyAverage).toBeCloseTo(90 / 12, 5)
  })

  it('useVehicleTimeline fetches the merged feed', async () => {
    installFetchRouter([['/vehicles/1/timeline', () => json({ vehicle_id: 1, events: [] })]])
    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useVehicleTimeline(1), { wrapper: wrapperFor(queryClient) })
    await waitFor(() => expect(result.current.data?.events).toEqual([]))
  })

  it('usePeriodStats is disabled when start > end', async () => {
    const { fetchMock } = installFetchRouter([])
    const queryClient = makeQueryClient()
    const { result } = renderHook(
      () => usePeriodStats(1, '2026-02-01', '2026-01-01'),
      { wrapper: wrapperFor(queryClient) },
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('fuel entry hooks', () => {
  it('useFuelEntries paginates', async () => {
    const { fetchMock } = installFetchRouter([
      ['/fuel-entries/vehicle/1?', () => json([])],
    ])
    const queryClient = makeQueryClient()
    renderHook(() => useFuelEntries(1, 2, 50), { wrapper: wrapperFor(queryClient) })
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('page=2&per_page=50'))).toBe(true),
    )
  })

  it('useGlobalStationHistory filters to GPS-tagged station entries', async () => {
    installFetchRouter([
      ['/fuel-entries/?per_page=500', () =>
        json({
          entries: [
            { id: 1, vehicle_id: 1, fuel_type: 'essence', liters: 10, price_per_liter: 2, total_cost: 20, odometer_reading: 100, station_name: 'Total', latitude: 45.7, longitude: 4.8, fueling_date: '2026-06-01', is_full_tank: true },
            { id: 2, vehicle_id: 1, fuel_type: 'essence', liters: 10, price_per_liter: 2, total_cost: 20, odometer_reading: 200, station_name: null, latitude: 45.7, longitude: 4.8, fueling_date: '2026-06-02', is_full_tank: true },
            { id: 3, vehicle_id: 1, fuel_type: 'essence', liters: 10, price_per_liter: 2, total_cost: 20, odometer_reading: 300, station_name: 'Shell', latitude: null, longitude: null, fueling_date: '2026-06-03', is_full_tank: true },
          ],
          total: 3, page: 1, per_page: 500, pages: 1,
        })],
    ])
    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useGlobalStationHistory(), { wrapper: wrapperFor(queryClient) })
    await waitFor(() => expect(result.current.data).toHaveLength(1))
    expect(result.current.data?.[0].station_name).toBe('Total')
  })

  it('useNearestStation is disabled without coordinates', async () => {
    const { fetchMock } = installFetchRouter([])
    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useNearestStation(1, null, 4.8), { wrapper: wrapperFor(queryClient) })
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('useCreateFuelEntry honours allowOdometerDecrease and invalidates', async () => {
    const { fetchMock } = installFetchRouter([
      ['/fuel-entries/', (_url, init) => (init?.method === 'POST' ? json({ id: 99 }, 201) : undefined)],
    ])
    const queryClient = makeQueryClient()
    queryClient.setQueryData(['fuelEntries', 1], [])
    const { result } = renderHook(() => useCreateFuelEntry(), { wrapper: wrapperFor(queryClient) })
    await result.current.mutateAsync({
      vehicle_id: 1, fuel_type: 'essence', liters: 10, price_per_liter: 2,
      odometer_reading: 100, fueling_date: '2026-06-01', allowOdometerDecrease: true,
    })
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('?allow_odometer_decrease=true'))).toBe(true)
    expect(queryClient.getQueryCache().getAll().find((q) => q.queryKey[0] === 'fuelEntries' && q.queryKey[1] === 1)?.state.isInvalidated).toBe(true)
  })

  it('useDeleteFuelEntry DELETEs the entry', async () => {
    const { fetchMock } = installFetchRouter([['/fuel-entries/9', () => json(null, 204)]])
    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useDeleteFuelEntry(1), { wrapper: wrapperFor(queryClient) })
    await result.current.mutateAsync(9)
    expect(fetchMock.mock.calls.map((c) => String(c[1]?.method))).toContain('DELETE')
  })
})

describe('useCreateMaintenance', () => {
  it('POSTs and invalidates the per-vehicle keys', async () => {
    const { fetchMock } = installFetchRouter([
      ['/maintenances/', (_url, init) => (init?.method === 'POST' ? json({ id: 11 }, 201) : undefined)],
    ])
    const queryClient = makeQueryClient()
    queryClient.setQueryData(['maintenances', 1], [])
    const { result } = renderHook(() => useCreateMaintenance(), { wrapper: wrapperFor(queryClient) })
    await result.current.mutateAsync({
      vehicle_id: 1, maintenance_type: 'Freins', maintenance_date: '2026-06-01',
    } as never)
    expect(fetchMock.mock.calls.some((c) => String(c[1]?.method) === 'POST' && String(c[0]).includes('/maintenances/'))).toBe(true)
    expect(queryClient.getQueryCache().getAll().find((q) => q.queryKey[0] === 'maintenances' && q.queryKey[1] === 1)?.state.isInvalidated).toBe(true)
  })
})

describe('offline queue sync — every payload kind', () => {
  function seedQueue(items: QueueItem[]) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items))
  }

  function renderOffline(queryClient: ReturnType<typeof makeQueryClient>) {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <OfflineProvider>{children}</OfflineProvider>
      </QueryClientProvider>
    )
    return renderHook(() => useOffline(), { wrapper })
  }

  it('syncs a fuel-update item via PUT', async () => {
    installFetchRouter([
      ['/fuel-entries/7', (_url, init) => (init?.method === 'PUT' ? json({ id: 7 }, 200) : undefined)],
    ])
    seedQueue([{ id: 100, payload: { kind: 'fuel-update', id: 7, vehicleId: 1, data: { liters: 42 } } }])
    const queryClient = makeQueryClient()
    const { result } = renderOffline(queryClient)
    // The provider's initial-recovery effect performs the sync automatically.
    await waitFor(() => expect(result.current.queue).toHaveLength(0))
  })

  it('syncs a maintenance-create item via POST', async () => {
    const { fetchMock } = installFetchRouter([
      ['/maintenances/', (_url, init) => (init?.method === 'POST' ? json({ id: 12 }, 201) : undefined)],
    ])
    seedQueue([{ id: 101, payload: { kind: 'maintenance-create', data: { vehicle_id: 1, maintenance_type: 'Freins', maintenance_date: '2026-06-01' } as never } }])
    const queryClient = makeQueryClient()
    const { result } = renderOffline(queryClient)
    await waitFor(() => expect(result.current.queue).toHaveLength(0))
    expect(fetchMock.mock.calls.some((c) => String(c[1]?.method) === 'POST' && String(c[0]).includes('/maintenances/'))).toBe(true)
  })

  it('syncs a maintenance-update item via PUT', async () => {
    const { fetchMock } = installFetchRouter([
      ['/maintenances/12', (_url, init) => (init?.method === 'PUT' ? json({ id: 12 }) : undefined)],
    ])
    seedQueue([{ id: 102, payload: { kind: 'maintenance-update', id: 12, vehicleId: 1, data: { cost: 90 } } }])
    const queryClient = makeQueryClient()
    const { result } = renderOffline(queryClient)
    await waitFor(() => expect(result.current.queue).toHaveLength(0))
    expect(fetchMock.mock.calls.some((c) => String(c[1]?.method) === 'PUT' && String(c[0]).includes('/maintenances/12'))).toBe(true)
  })

  it('captureE10Price: dedupes by date, no POST when the price already exists', async () => {
    const { fetchMock } = installFetchRouter([
      ['/flexfuel/e10-prices', (_url, init) =>
        init?.method === 'POST' ? json({ id: 1 }, 201) : json([{ reference_date: '2026-06-01' }])],
    ])
    seedQueue([{
      id: 103,
      payload: {
        kind: 'fuel-create',
        data: {
          vehicle_id: 1, fuel_type: 'essence', liters: 40, price_per_liter: 1.8,
          odometer_reading: 10500, fueling_date: '2026-06-01', e10Price: 1.65,
          client_request_id: 'req-1',
        } as never,
      },
    }])
    const queryClient = makeQueryClient()
    const { result } = renderOffline(queryClient)
    await waitFor(() => expect(result.current.queue).toHaveLength(0))
    const posts = fetchMock.mock.calls.filter((c) => String(c[1]?.method) === 'POST' && String(c[0]).includes('e10-prices'))
    expect(posts).toHaveLength(0) // 2026-06-01 already in the list
  })

  it('captureE10Price: POSTs when the date is new', async () => {
    const { fetchMock } = installFetchRouter([
      ['/fuel-entries/', (_url, init) => (init?.method === 'POST' ? json({ id: 98 }, 201) : undefined)],
      ['/flexfuel/e10-prices', (_url, init) =>
        init?.method === 'POST' ? json({ id: 1 }, 201) : json([])],
    ])
    seedQueue([{
      id: 104,
      payload: {
        kind: 'fuel-create',
        data: {
          vehicle_id: 1, fuel_type: 'essence', liters: 40, price_per_liter: 1.8,
          odometer_reading: 10500, fueling_date: '2026-06-05', e10Price: 1.65,
          client_request_id: 'req-2',
        } as never,
      },
    }])
    const queryClient = makeQueryClient()
    const { result } = renderOffline(queryClient)
    await waitFor(() => expect(result.current.queue).toHaveLength(0))
    const posts = fetchMock.mock.calls.filter((c) => String(c[1]?.method) === 'POST' && String(c[0]).includes('e10-prices'))
    expect(posts).toHaveLength(1)
    expect(JSON.parse(String(posts[0][1]?.body))).toMatchObject({ reference_date: '2026-06-05', price_per_liter: 1.65 })
  })
})
