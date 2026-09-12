import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/providers'
import { installFetchRouter, json, baseRoutes, maintenance1 } from '@/test/fixtures'
import { MaintenanceAddDialog } from '@/components/maintenance/MaintenanceAddDialog'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))
import { toast } from 'sonner'

const toastMock = vi.mocked(toast)

// Radix portals to document.body, so query there. Call AFTER the dialog
// content has mounted (findByRole on the title).
function maintFields() {
  return {
    date: document.querySelectorAll('input[type="date"]')[0] as HTMLInputElement,
    type: document.querySelector('input[list="maintenance-type-options"]') as HTMLInputElement,
    odometer: document.querySelectorAll('input[type="number"]')[0] as HTMLInputElement,
    cost: document.querySelectorAll('input[type="number"]')[1] as HTMLInputElement,
    nextDate: document.querySelectorAll('input[type="date"]')[1] as HTMLInputElement,
    nextOdo: document.querySelectorAll('input[type="number"]')[2] as HTMLInputElement,
  }
}

function renderMaint(routes = baseRoutes, onClose = vi.fn()) {
  const router = installFetchRouter(routes)
  const utils = renderWithProviders(<MaintenanceAddDialog vehicleId={1} onClose={onClose} />)
  return { ...utils, router, onClose }
}

function lastPost(router: { calls: { url: string; init?: RequestInit }[] }) {
  const post = [...router.calls].reverse().find((c) => c.init?.method === 'POST' && c.url.endsWith('/maintenances/'))
  return post ? JSON.parse(post.init!.body as string) : null
}

beforeEach(() => {
  // Object.defineProperty leaks across tests (it's not a vi stub) — reset.
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true })
  toastMock.success.mockClear()
  toastMock.error.mockClear()
  toastMock.info.mockClear()
})

describe('MaintenanceAddDialog', () => {
  it('opens with the vehicle header and default type Vidange', async () => {
    renderMaint()
    expect(await screen.findByRole('heading', { name: 'Ajouter une maintenance' })).toBeInTheDocument()
    expect(await screen.findByText(/Peugeot 208 — AB-123-CD/)).toBeInTheDocument()
    const fields = maintFields()
    expect(fields.type.value).toBe('Vidange')
    expect(fields.date.value).toBeTruthy()
  })

  it('online submit: POSTs /maintenances/ with the full payload, toasts, closes', async () => {
    const user = userEvent.setup()
    const { router, onClose } = renderMaint([
      ['/maintenances/', (_url, init) =>
        init?.method === 'POST' ? json({ ...maintenance1 }, 201) : undefined],
      ...baseRoutes,
    ])
    await screen.findByRole('heading', { name: 'Ajouter une maintenance' })
    const fields = maintFields()

    await user.type(fields.odometer, '21000')
    await user.type(fields.cost, '129.9')
    await user.type(fields.nextDate, '2027-08-01')
    await user.type(fields.nextOdo, '36000')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    await vi.waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Maintenance ajoutée'))
    expect(onClose).toHaveBeenCalled()
    const body = lastPost(router)
    expect(body).toMatchObject({
      vehicle_id: 1,
      maintenance_type: 'Vidange',
      odometer_reading: 21000,
      cost: 129.9,
      maintenance_date: fields.date.value,
      next_maintenance_date: '2027-08-01',
      next_maintenance_odometer: 36000,
    })
    expect(body.description).toBeNull()
  })

  it('offline submit: queued as maintenance-create, info toast, no POST', async () => {
    const user = userEvent.setup()
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true })
    // Offline means the network fails: the fetch stub rejects like a real browser would.
    const { onClose } = renderMaint([
      ['/maintenances/', (_url, init) => {
        if (init?.method === 'POST') throw new TypeError('Failed to fetch')
        return undefined
      }],
      ...baseRoutes,
    ])
    await screen.findByRole('heading', { name: 'Ajouter une maintenance' })
    const fields = maintFields()

    await user.type(fields.odometer, '21000')
    await user.type(fields.cost, '80')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    await vi.waitFor(() =>
      expect(toastMock.info).toHaveBeenCalledWith(expect.stringContaining('mise en file d\'attente')),
    )
    expect(onClose).toHaveBeenCalled()
    const queue = JSON.parse(localStorage.getItem('vv_offline_queue') ?? '[]')
    expect(queue).toHaveLength(1)
    expect(queue[0].payload.kind).toBe('maintenance-create')
    expect(queue[0].payload.data).toMatchObject({
      vehicle_id: 1,
      maintenance_type: 'Vidange',
      odometer_reading: 21000,
      cost: 80,
    })
  })

  it('server rejection (ApiError): error toast shown, dialog stays open, nothing queued', async () => {
    const user = userEvent.setup()
    renderMaint([
      ['/maintenances/', (_url, init) =>
        init?.method === 'POST' ? json({ detail: 'La date ne peut pas être dans le futur' }, 400) : undefined],
      ...baseRoutes,
    ])
    await screen.findByRole('heading', { name: 'Ajouter une maintenance' })
    const fields = maintFields()

    await user.type(fields.odometer, '21000')
    await user.type(fields.cost, '80')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    await vi.waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('La date ne peut pas être dans le futur'),
    )
    expect(screen.getByRole('heading', { name: 'Ajouter une maintenance' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('vv_offline_queue') ?? '[]')).toEqual([])
  })

  it('empty type: zod validation blocks the POST', async () => {
    const user = userEvent.setup()
    const { router } = renderMaint()
    await screen.findByRole('heading', { name: 'Ajouter une maintenance' })
    const fields = maintFields()

    await user.clear(fields.type)
    await user.type(fields.odometer, '21000')
    await user.type(fields.cost, '80')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    // The dialog renders no per-field error UI: an invalid submit silently
    // blocks. Behavior contract = nothing is POSTed, dialog stays open.
    expect(lastPost(router)).toBeNull()
    expect(screen.getByRole('heading', { name: 'Ajouter une maintenance' })).toBeInTheDocument()
  })

  it('cancel closes without POSTing', async () => {
    const user = userEvent.setup()
    const { router, onClose } = renderMaint()
    await screen.findByRole('heading', { name: 'Ajouter une maintenance' })
    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onClose).toHaveBeenCalled()
    expect(router.calls.filter((c) => c.init?.method === 'POST')).toHaveLength(0)
  })
})
