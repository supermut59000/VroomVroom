import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/providers'
import { installFetchRouter, json, baseRoutes, vehicleList1, vehicleFull1 } from '@/test/fixtures'
import type { VehicleList } from '@/types'
import { Dashboard } from '@/pages/Dashboard'
import { OfflineBanner } from '@/components/layout/OfflineBanner'

vi.mock('@/components/vehicles/VehicleGrid', () => ({
  VehicleGrid: ({ vehicles, onFuelAdd }: { vehicles: VehicleList[]; onFuelAdd: (id: number) => void }) => (
    <div>
      {vehicles.map((v) => (
        <div key={v.id}>
          <span>{v.brand} {v.model}</span>
          <button onClick={() => onFuelAdd(v.id)}>Plein {v.id}</button>
        </div>
      ))}
    </div>
  ),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))
import { toast } from 'sonner'

const toastMock = vi.mocked(toast)

function renderDashboard(routes = baseRoutes) {
  const router = installFetchRouter(routes)
  const utils = renderWithProviders(<Dashboard />)
  return { ...utils, router }
}

beforeEach(() => {
  toastMock.success.mockClear()
  toastMock.error.mockClear()
  toastMock.info.mockClear()
})

describe('Dashboard', () => {
  it('list load: shows heading, vehicle card data, and the FAB', async () => {
    renderDashboard()
    expect(await screen.findByText('Mes véhicules (1)')).toBeInTheDocument()
    expect(await screen.findByText('Peugeot 208')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter un plein' })).toBeInTheDocument()
  })

  it('empty state: no vehicles → CTA opens the add-vehicle dialog', async () => {
    const user = userEvent.setup()
    renderDashboard([['/vehicles/', () => json([])]])
    expect(await screen.findByText('Aucun véhicule')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Ajouter un véhicule/ }))
    expect(await screen.findByRole('heading', { name: 'Ajouter un véhicule' })).toBeInTheDocument()
    expect(screen.getByLabelText('Marque *')).toBeInTheDocument()
  })

  it('error state: 500 → message + Réessayer refetches until success', async () => {
    const user = userEvent.setup()
    let attempts = 0
    const { router } = renderDashboard([
      ['/vehicles/', () => {
        attempts += 1
        return attempts < 2 ? json({ detail: 'boom' }, 500) : json([vehicleList1])
      }],
      ...baseRoutes,
    ])
    expect(await screen.findByText('Erreur lors du chargement des véhicules')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Réessayer/ }))
    expect(await screen.findByText('Mes véhicules (1)')).toBeInTheDocument()
    // the manual refetch hit the endpoint again (focus-refetch may add more — harmless)
    expect(router.calls.filter((c) => c.url.includes('/vehicles/')).length).toBeGreaterThanOrEqual(2)
  })

  it('loading state: shows skeletons while the request is pending', async () => {
    let resolveList!: (r: Response) => void
    const pending = new Promise<Response>((resolve) => {
      resolveList = resolve
    })
    installFetchRouter([
      ['/vehicles/', () => pending],
      ...baseRoutes,
    ])
    const { unmount } = renderWithProviders(<Dashboard />)
    await waitFor(() => {
      expect(document.querySelectorAll('.h-72').length).toBeGreaterThanOrEqual(1)
    })
    resolveList(json([vehicleList1]))
    expect(await screen.findByText('Mes véhicules (1)')).toBeInTheDocument()
    unmount()
  })

  it('FAB with one vehicle: opens the fuel dialog directly', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByText('Mes véhicules (1)')
    await user.click(screen.getByRole('button', { name: 'Ajouter un plein' }))
    expect(await screen.findByRole('heading', { name: 'Ajouter un plein' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Compteur \*/)).toBeInTheDocument()
  })

  it('FAB with multiple vehicles: opens the picker sheet, selecting one opens its fuel dialog', async () => {
    const user = userEvent.setup()
    const v2: VehicleList = { ...vehicleList1, id: 2, brand: 'Renault', model: 'Clio', license_plate: 'EF-456-GH' }
    renderDashboard([
      ['/vehicles/2', () => json({ ...vehicleFull1, id: 2, brand: 'Renault', model: 'Clio', license_plate: 'EF-456-GH' })],
      ['/vehicles/', (url) => (url.endsWith('/api/v1/vehicles/') ? json([vehicleList1, v2]) : undefined)],
      ...baseRoutes,
    ])
    await screen.findByText('Mes véhicules (2)')
    await user.click(screen.getByRole('button', { name: 'Ajouter un plein' }))
    expect(await screen.findByRole('heading', { name: 'Choisir un véhicule' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Renault Clio/ }))
    expect(await screen.findByRole('heading', { name: 'Ajouter un plein' })).toBeInTheDocument()
    expect(await screen.findByText(/Renault Clio \(2019\)/)).toBeInTheDocument()
  })

  it('offline: banner visible, queue badge shows pending count on the FAB', async () => {
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true })
    const seeded = [
      { id: 1, payload: { kind: 'fuel-create', data: { vehicle_id: 1, fuel_type: 'essence', liters: 10, price_per_liter: 1.7, odometer_reading: 20100, fueling_date: '2026-08-15', is_full_tank: true, client_request_id: 'a' } } },
      { id: 2, payload: { kind: 'fuel-create', data: { vehicle_id: 1, fuel_type: 'essence', liters: 12, price_per_liter: 1.7, odometer_reading: 20200, fueling_date: '2026-08-16', is_full_tank: true, client_request_id: 'b' } } },
    ]
    localStorage.setItem('vv_offline_queue', JSON.stringify(seeded))
    installFetchRouter(baseRoutes)
    renderWithProviders(
      <>
        <OfflineBanner />
        <Dashboard />
      </>,
    )
    expect(await screen.findByText(/Mode hors-ligne/)).toBeInTheDocument()
    expect(await screen.findByText(/2 éléments en attente de synchronisation/)).toBeInTheDocument()
    const fab = await screen.findByRole('button', { name: 'Ajouter un plein' })
    expect(fab.textContent).toContain('2')
  })
})
