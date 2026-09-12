import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/providers'
import { installFetchRouter, json, baseRoutes, vehicleFull1 } from '@/test/fixtures'
import { VehicleAddDialog } from '@/components/vehicles/VehicleAddDialog'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))
import { toast } from 'sonner'

const toastMock = vi.mocked(toast)

function renderAdd(routes = baseRoutes) {
  const router = installFetchRouter(routes)
  const utils = renderWithProviders(<VehicleAddDialog open onOpenChange={vi.fn()} />)
  return { ...utils, router }
}

beforeEach(() => {
  toastMock.success.mockClear()
  toastMock.error.mockClear()
  toastMock.info.mockClear()
})

describe('VehicleAddDialog', () => {
  it('opens with the expected fields and defaults', async () => {
    renderAdd()
    expect(await screen.findByRole('heading', { name: 'Ajouter un véhicule' })).toBeInTheDocument()
    expect(screen.getByLabelText('Marque *')).toBeInTheDocument()
    expect(screen.getByLabelText('Modèle *')).toBeInTheDocument()
    expect(screen.getByLabelText('Plaque *')).toBeInTheDocument()
    expect(screen.getByLabelText('Compteur initial (km)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeInTheDocument()
  })

  it('valid submit: POSTs /vehicles/ with uppercased plate, toasts, closes', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const router = installFetchRouter([
      ['/vehicles/', (_url, init) =>
        init?.method === 'POST' ? json({ ...vehicleFull1, brand: 'Peugeot', model: '308', license_plate: 'XY-999-ZT' }, 201) : undefined],
      ...baseRoutes,
    ])
    renderWithProviders(<VehicleAddDialog open onOpenChange={onOpenChange} />)
    await screen.findByRole('heading', { name: 'Ajouter un véhicule' })

    await user.type(screen.getByLabelText('Marque *'), 'Peugeot')
    await user.type(screen.getByLabelText('Modèle *'), '308')
    await user.type(screen.getByLabelText('Plaque *'), 'xy-999-zt')
    await user.type(screen.getByLabelText('Compteur initial (km)'), '12345')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    await vi.waitFor(() => {
      const post = router.calls.find((c) => c.init?.method === 'POST' && c.url.endsWith('/vehicles/'))
      expect(post).toBeDefined()
    })
    const body = JSON.parse((router.calls.find((c) => c.init?.method === 'POST' && c.url.endsWith('/vehicles/'))!.init!.body as string))
    expect(body.brand).toBe('Peugeot')
    expect(body.license_plate).toBe('XY-999-ZT')
    expect(body.initial_odometer).toBe(12345)
    await vi.waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Véhicule ajouté avec succès'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('invalid submit: zod validation blocks the POST and shows the message', async () => {
    const user = userEvent.setup()
    const router = installFetchRouter(baseRoutes)
    renderWithProviders(<VehicleAddDialog open onOpenChange={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Ajouter un véhicule' })

    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    await screen.findByText('Marque requise')
    expect(router.calls.filter((c) => c.init?.method === 'POST')).toHaveLength(0)
  })

  it('duplicate plate (409): error toast with backend detail, dialog stays open', async () => {
    const user = userEvent.setup()
    installFetchRouter([
      ['/vehicles/', (_url, init) =>
        init?.method === 'POST' ? json({ detail: 'La plaque XY-999-ZT existe déjà' }, 409) : undefined],
      ...baseRoutes,
    ])
    renderWithProviders(<VehicleAddDialog open onOpenChange={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Ajouter un véhicule' })

    await user.type(screen.getByLabelText('Marque *'), 'Peugeot')
    await user.type(screen.getByLabelText('Modèle *'), '308')
    await user.type(screen.getByLabelText('Plaque *'), 'XY-999-ZT')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    await vi.waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('La plaque XY-999-ZT existe déjà'),
    )
    expect(screen.getByRole('heading', { name: 'Ajouter un véhicule' })).toBeInTheDocument()
  })

  it('insurance unlimited checkbox hides the km-limit fields', async () => {
    const user = userEvent.setup()
    renderAdd()
    await screen.findByRole('heading', { name: 'Ajouter un véhicule' })
    expect(screen.getByLabelText('Limite km assurance')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Kilométrage illimité' }))
    expect(screen.queryByLabelText('Limite km assurance')).not.toBeInTheDocument()
  })

  it('cancel closes without POSTing', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const router = installFetchRouter(baseRoutes)
    renderWithProviders(<VehicleAddDialog open onOpenChange={onOpenChange} />)
    await screen.findByRole('heading', { name: 'Ajouter un véhicule' })
    await user.type(screen.getByLabelText('Marque *'), 'Citroën')
    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(router.calls.filter((c) => c.init?.method === 'POST')).toHaveLength(0)
  })
})
