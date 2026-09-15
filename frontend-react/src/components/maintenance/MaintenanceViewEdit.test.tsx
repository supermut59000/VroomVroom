import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { renderWithProviders } from '@/test/providers'
import { installFetchRouter, json, baseRoutes, maintenance1 } from '@/test/fixtures'
import type { FetchHandler } from '@/test/fixtures'
import { MaintenanceViewDialog } from '@/components/maintenance/MaintenanceViewDialog'
import { MaintenanceEditDialog } from '@/components/maintenance/MaintenanceEditDialog'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

const toastMock = toast as unknown as {
  success: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
  info: ReturnType<typeof vi.fn>
  warning: ReturnType<typeof vi.fn>
}
beforeEach(() => {
  toastMock.success.mockClear()
  toastMock.error.mockClear()
  toastMock.info.mockClear()
  toastMock.warning.mockClear()
})

function putRoutes() {
  return [
    [
      '/maintenances/10',
      (_url: string, init?: RequestInit) =>
        init?.method === 'PUT' ? json({ ...maintenance1, description: 'updated' }) : undefined,
    ],
    [
      '/maintenances/10',
      (_url: string, init?: RequestInit) =>
        init?.method === 'DELETE' ? new Response(null, { status: 204 }) : undefined,
    ],
  ] as [string, FetchHandler][]
}

describe('MaintenanceViewDialog', () => {
  it('renders nothing when vehicleId is null', async () => {
    renderWithProviders(<MaintenanceViewDialog vehicleId={null} onClose={vi.fn()} />)
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.queryByText('Historique maintenance')).toBeNull()
  })

  it('renders the title, stats and the entry', async () => {
    installFetchRouter(baseRoutes)
    renderWithProviders(<MaintenanceViewDialog vehicleId={1} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Historique maintenance')).toBeInTheDocument())
    // Entry loads async
    await waitFor(() => expect(screen.getByText('Vidange')).toBeInTheDocument())
    // Entry date (also shown in the "Dernière" stats card, so it matches twice)
    expect(screen.getAllByText('01/06/2026').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Huile + filtre')).toBeInTheDocument()
    expect(screen.getByText('Garage Central')).toBeInTheDocument()
    // Entry cost (also shown as the 2026 breakdown year total, so it matches twice)
    expect(screen.getAllByText('80.00 €').length).toBeGreaterThanOrEqual(1)
    // Stats cards
    expect(screen.getByText('Entrées')).toBeInTheDocument()
    expect(screen.getByText('Coût total')).toBeInTheDocument()
    expect(screen.getByText('Coût moyen')).toBeInTheDocument()
    // Cost breakdown
    expect(screen.getByText('Coûts par année')).toBeInTheDocument()
    expect(screen.getByText('2026')).toBeInTheDocument()
  })

  it('shows the empty state', async () => {
    installFetchRouter([
      ['/maintenances/vehicle/1', () => json([])],
      ...baseRoutes,
    ])
    renderWithProviders(<MaintenanceViewDialog vehicleId={1} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Historique maintenance')).toBeInTheDocument())
    await waitFor(() =>
      expect(screen.getByText('Aucune maintenance enregistrée')).toBeInTheDocument(),
    )
  })

  it('confirms and performs a delete, then toasts', async () => {
    const user = userEvent.setup()
    const router = installFetchRouter([...putRoutes(), ...baseRoutes])
    renderWithProviders(<MaintenanceViewDialog vehicleId={1} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Historique maintenance')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Vidange')).toBeInTheDocument())
    // Delete button is display:none in jsdom (hidden sm:flex); use fireEvent.
    const deleteBtn = screen
      .getAllByRole('button')
      .find((b) => b.querySelector('svg') && b.className.includes('text-destructive')) as HTMLButtonElement
    expect(deleteBtn).toBeDefined()
    fireEvent.click(deleteBtn)
    await waitFor(() =>
      expect(screen.getByText(/Supprimer cette maintenance/)).toBeInTheDocument(),
    )
    await user.click(screen.getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => {
      const del = [...router.calls].find(
        (c) => c.init?.method === 'DELETE' && c.url.includes('/maintenances/10'),
      )
      expect(del).toBeDefined()
    })
    expect(toastMock.success).toHaveBeenCalledWith('Maintenance supprimée')
  })

  it('opens the add dialog from the Ajouter button', async () => {
    const user = userEvent.setup()
    installFetchRouter(baseRoutes)
    renderWithProviders(<MaintenanceViewDialog vehicleId={1} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Historique maintenance')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Ajouter/ }))
    await waitFor(() => expect(screen.getByText('Ajouter une maintenance')).toBeInTheDocument())
  })
})

describe('MaintenanceEditDialog', () => {
  it('renders nothing when entry is null', async () => {
    installFetchRouter(baseRoutes)
    renderWithProviders(<MaintenanceEditDialog entry={null} vehicleId={1} onClose={vi.fn()} />)
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.queryByText('Modifier la maintenance')).toBeNull()
  })

  it('prefills fields from the entry', async () => {
    installFetchRouter([...putRoutes(), ...baseRoutes])
    renderWithProviders(
      <MaintenanceEditDialog entry={maintenance1} vehicleId={1} onClose={vi.fn()} />,
    )
    await waitFor(() => expect(screen.getByText('Modifier la maintenance')).toBeInTheDocument())
    // Wait for form.reset to apply the type value
    await waitFor(() => {
      expect((screen.getByDisplayValue('Vidange') as HTMLInputElement).value).toBe('Vidange')
    })
    expect(screen.getByDisplayValue('Huile + filtre')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Garage Central')).toBeInTheDocument()
    expect(document.querySelectorAll('input[type="number"]').length).toBeGreaterThanOrEqual(2)
  })

  it('submits a PUT and toasts on success', async () => {
    const user = userEvent.setup()
    const router = installFetchRouter([...putRoutes(), ...baseRoutes])
    renderWithProviders(
      <MaintenanceEditDialog entry={maintenance1} vehicleId={1} onClose={vi.fn()} />,
    )
    await waitFor(() => expect(screen.getByText('Modifier la maintenance')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => {
      const put = [...router.calls].find(
        (c) => c.init?.method === 'PUT' && c.url.includes('/maintenances/10'),
      )
      expect(put).toBeDefined()
    })
    expect(toastMock.success).toHaveBeenCalledWith('Maintenance mise à jour')
  })
})
