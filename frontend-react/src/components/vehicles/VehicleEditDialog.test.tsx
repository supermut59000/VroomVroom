import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { renderWithProviders, makeQueryClient } from '@/test/providers'
import { installFetchRouter, json, baseRoutes, vehicleFull1, stats1 } from '@/test/fixtures'
import type { FetchHandler } from '@/test/fixtures'
import { VehicleEditDialog } from '@/components/vehicles/VehicleEditDialog'
import { TooltipProvider } from '@/components/ui/tooltip'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

const toastMock = toast as unknown as {
  success: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  toastMock.success.mockClear()
  toastMock.error.mockClear()
  localStorage.removeItem('vv_offline_queue')
})

function putVehicleRoutes() {
  return [
    [
      '/vehicles/1',
      (_url: string, init?: RequestInit) =>
        init?.method === 'PUT' ? json({ ...vehicleFull1, brand: 'Updated' }) : undefined,
    ],
  ] as [string, FetchHandler][]
}

function renderEdit() {
  const queryClient = makeQueryClient()
  queryClient.setQueryData(['vehicleStatsBatch'], { 1: stats1 })
  installFetchRouter([...putVehicleRoutes(), ...baseRoutes])
  renderWithProviders(
    <TooltipProvider>
      <VehicleEditDialog vehicleId={1} onClose={vi.fn()} />
    </TooltipProvider>,
    queryClient,
  )
}

// Open the fuel-type Select and choose "Essence". The fuel Select starts
// uncontrolled (the form only mounts once the vehicle loads, then form.reset
// flips it controlled), so we drive it explicitly to guarantee a valid value.
async function pickFuelEssence(user: ReturnType<typeof userEvent.setup>) {
  const trigger = document.querySelector('[role=combobox]') as HTMLElement
  await user.click(trigger)
  await waitFor(() => expect(screen.getByRole('option', { name: 'Essence' })).toBeInTheDocument())
  await user.click(screen.getByRole('option', { name: 'Essence' }))
}

describe('VehicleEditDialog', () => {
  it('renders nothing when vehicleId is null', async () => {
    installFetchRouter(baseRoutes)
    renderWithProviders(
      <TooltipProvider>
        <VehicleEditDialog vehicleId={null} onClose={vi.fn()} />
      </TooltipProvider>,
    )
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.queryByText('Modifier le véhicule')).toBeNull()
  })

  it('prefills the text and number fields from the vehicle', async () => {
    renderEdit()
    await waitFor(() => expect(screen.getByText('Modifier le véhicule')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByDisplayValue('Peugeot')).toBeInTheDocument())
    expect(screen.getByDisplayValue('208')).toBeInTheDocument()
    expect(screen.getByDisplayValue('AB-123-CD')).toBeInTheDocument()
    expect(screen.getByDisplayValue('10000')).toBeInTheDocument()
    // Fuel-type Select (combobox) is present
    expect(document.querySelector('[role=combobox]')).toBeTruthy()
  })

  it('hides the insurance km fields when "Kilométrage illimité" is checked', async () => {
    const user = userEvent.setup()
    renderEdit()
    await waitFor(() => expect(screen.getByDisplayValue('Peugeot')).toBeInTheDocument())
    expect(screen.getByText('Limite km')).toBeInTheDocument()
    await user.click(screen.getByLabelText(/Kilométrage illimité/))
    await waitFor(() => expect(screen.queryByText('Limite km')).toBeNull())
  })

  it('submits a PUT and toasts on success', async () => {
    const user = userEvent.setup()
    const router = installFetchRouter([...putVehicleRoutes(), ...baseRoutes])
    const queryClient = makeQueryClient()
    queryClient.setQueryData(['vehicleStatsBatch'], { 1: stats1 })
    renderWithProviders(
      <TooltipProvider>
        <VehicleEditDialog vehicleId={1} onClose={vi.fn()} />
      </TooltipProvider>,
      queryClient,
    )
    await waitFor(() => expect(screen.getByDisplayValue('Peugeot')).toBeInTheDocument())
    await pickFuelEssence(user)
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => {
      const put = [...router.calls].find(
        (c) => c.init?.method === 'PUT' && c.url.includes('/vehicles/1'),
      )
      expect(put).toBeDefined()
    })
    expect(toastMock.success).toHaveBeenCalledWith('Véhicule mis à jour')
  })
})
