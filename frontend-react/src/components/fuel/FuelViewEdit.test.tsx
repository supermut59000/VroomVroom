import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/providers'
import { installFetchRouter, json, baseRoutes, entry1 } from '@/test/fixtures'
import { FuelViewDialog } from '@/components/fuel/FuelViewDialog'
import { FuelEditDialog } from '@/components/fuel/FuelEditDialog'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))
import { toast } from 'sonner'
const toastMock = vi.mocked(toast)

// jsdom has no navigator.geolocation — mock it so FuelEditDialog renders.
vi.mock('@/hooks/use-geolocation', () => ({
  useGeolocation: () => ({
    status: 'error',
    latitude: null,
    longitude: null,
    error: 'Géolocalisation indisponible',
    capture: () => {},
    reset: () => {},
  }),
}))

function putDeleteRoutes(): [string, (url: string, init?: RequestInit) => Response | undefined][] {
  return [
    [
      '/fuel-entries/50',
      (_url, init) => {
        if (init?.method === 'PUT') return json({ ...entry1 })
        if (init?.method === 'DELETE') return json(null, 204)
        return undefined
      },
    ],
  ]
}

describe('FuelViewDialog', () => {
  it('renders nothing when vehicleId is null', () => {
    renderWithProviders(<FuelViewDialog vehicleId={null} onClose={vi.fn()} />)
    expect(screen.queryByText('Historique carburant')).toBeNull()
  })

  it('renders the header, stats cards and both entries', async () => {
    installFetchRouter(baseRoutes)
    renderWithProviders(<FuelViewDialog vehicleId={1} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Historique carburant')).toBeInTheDocument())
    // Vehicle subtitle loads async (useVehicle); the dash char is ambiguous so match a prefix
    await waitFor(() => expect(screen.getByText(/Peugeot 208/)).toBeInTheDocument())
    // Stats cards load async (useFuelStats); they all render together
    await waitFor(() => expect(screen.getByText('Prix moyen')).toBeInTheDocument())
    expect(screen.getByText('Pleins')).toBeInTheDocument()
    expect(screen.getByText('Total litres')).toBeInTheDocument()
    expect(screen.getByText('Coût total')).toBeInTheDocument()
    // Both entry dates (2026-08-01 and 2026-07-01)
    await waitFor(() => expect(screen.getByText('01/08/2026')).toBeInTheDocument())
    expect(screen.getByText('01/07/2026')).toBeInTheDocument()
    // Entry station (both fixture entries share the same station name)
    expect(screen.getAllByText('Total Test').length).toBeGreaterThanOrEqual(1)
  })

  it('shows the empty state when there are no entries', async () => {
    installFetchRouter([
      ['/fuel-entries/vehicle/1?per_page=500', () => json([])],
      ...baseRoutes,
    ])
    renderWithProviders(<FuelViewDialog vehicleId={1} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Aucun plein enregistré')).toBeInTheDocument())
  })

  it('confirms and performs a delete, then toasts', async () => {
    const user = userEvent.setup()
    const router = installFetchRouter([...putDeleteRoutes(), ...baseRoutes])
    renderWithProviders(<FuelViewDialog vehicleId={1} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Historique carburant')).toBeInTheDocument())
    // Entry rows load async
    await waitFor(() => expect(screen.getByText('01/08/2026')).toBeInTheDocument())
    // The desktop action buttons are display:none in jsdom (hidden sm:flex);
    // userEvent skips hidden elements, so use fireEvent. Match 'text-destructive'
    // specifically — the toolbar buttons also contain 'ring-destructive' in className.
    const deleteBtn = screen
      .getAllByRole('button')
      .find((b) => b.querySelector('svg') && b.className.includes('text-destructive')) as HTMLButtonElement
    expect(deleteBtn).toBeDefined()
    fireEvent.click(deleteBtn)
    await waitFor(() => expect(screen.getByText(/Supprimer ce plein/)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => {
      const del = [...router.calls].find(
        (c) => c.init?.method === 'DELETE' && c.url.includes('/fuel-entries/'),
      )
      expect(del).toBeDefined()
    })
    expect(toastMock.success).toHaveBeenCalledWith('Plein supprimé')
  })

  it('opens the charts dialog from the Graphiques button', async () => {
    const user = userEvent.setup()
    installFetchRouter(baseRoutes)
    renderWithProviders(<FuelViewDialog vehicleId={1} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Historique carburant')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Graphiques/ }))
    // FuelCharts has a unique Reset button (the title text node is shared with the trigger).
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument())
  })
})

describe('FuelEditDialog', () => {
  function renderEdit(entry: typeof entry1 | null, onClose = vi.fn()) {
    const router = installFetchRouter([...putDeleteRoutes(), ...baseRoutes])
    renderWithProviders(<FuelEditDialog entry={entry} vehicleId={1} onClose={onClose} />)
    return { router, onClose }
  }

  it('renders nothing when entry is null', () => {
    renderEdit(null)
    expect(screen.queryByText('Modifier le plein')).toBeNull()
  })

  it('prefills the form from the entry', async () => {
    renderEdit(entry1)
    await waitFor(() => expect(screen.getByText('Modifier le plein')).toBeInTheDocument())
    const date = document.querySelector('input[type="date"]') as HTMLInputElement
    const numbers = [...document.querySelectorAll('input[type="number"]')] as HTMLInputElement[]
    // order in DOM: odometer, liters, price
    expect(date.value).toBe('2026-08-01')
    expect(numbers[0].value).toBe('20000')
    expect(numbers[1].value).toBe('40')
    expect(numbers[2].value).toBe('1.7')
  })

  it('submits a changed update via PUT, toasts and closes', async () => {
    const user = userEvent.setup()
    const { router, onClose } = renderEdit(entry1)
    await waitFor(() => expect(screen.getByText('Modifier le plein')).toBeInTheDocument())
    const numbers = [...document.querySelectorAll('input[type="number"]')] as HTMLInputElement[]
    await user.clear(numbers[1])
    await user.type(numbers[1], '42')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => {
      const put = [...router.calls].find(
        (c) => c.init?.method === 'PUT' && c.url.includes('/fuel-entries/50'),
      )
      expect(put).toBeDefined()
    })
    const put = router.calls.find(
      (c) => c.init?.method === 'PUT' && c.url.includes('/fuel-entries/50'),
    )
    expect(JSON.parse(put!.init!.body as string).liters).toBe(42)
    expect(toastMock.success).toHaveBeenCalledWith('Plein mis à jour')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes without saving on Annuler', async () => {
    const user = userEvent.setup()
    const { onClose } = renderEdit(entry1)
    await waitFor(() => expect(screen.getByText('Modifier le plein')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onClose).toHaveBeenCalled()
  })
})
