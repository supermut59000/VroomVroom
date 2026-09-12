import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/providers'
import { installFetchRouter, json, baseRoutes, latestEntry1, conversion1 } from '@/test/fixtures'
import { FuelAddDialog } from '@/components/fuel/FuelAddDialog'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))
import { toast } from 'sonner'

const toastMock = vi.mocked(toast)

// jsdom has no navigator.geolocation — the dialog would be stuck on 'error'.
// Mutable state so the E10 auto-capture tests can go 'success'.
const geoState = vi.hoisted(() => ({
  status: 'error' as 'idle' | 'loading' | 'success' | 'error',
  latitude: 50.0,
  longitude: 1.5,
  error: null as string | null,
}))
vi.mock('@/hooks/use-geolocation', () => ({
  useGeolocation: () => ({
    ...geoState,
    capture: () => {},
    reset: () => {},
  }),
}))

// One nearby station, E10 at 1.550 € — the price auto-captured on E85 fills.
const E10_STATION_ROUTES: [string, (url: string, init?: RequestInit) => Response][] = [
  [
    'data.economie.gouv.fr',
    () =>
      json({
        results: [
          {
            id: 'stA',
            adresse: '1 rue Proche',
            ville: 'Testville',
            cp: '59000',
            e10_prix: 1.55,
            sp95_prix: 1.7,
            sp98_prix: null,
            gazole_prix: null,
            e85_prix: null,
            gplc_prix: null,
            geom: { lat: 50.01, lon: 1.5 },
          },
        ],
        total_count: 1,
      }),
  ],
]

const FLEXFUEL_ROUTES: [string, (url: string, init?: RequestInit) => Response][] = [
  ['/flexfuel/vehicles/1/conversion', () => json(conversion1)],
  [
    '/flexfuel/e10-prices',
    (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? json({ id: 1, reference_date: 'x' }, 201) : json([]),
  ],
]

function e10Posts(router: { calls: { url: string; init?: RequestInit }[] }) {
  return router.calls.filter(
    (c) => c.init?.method === 'POST' && c.url.includes('/flexfuel/e10-prices'),
  )
}

async function selectFuelType(user: ReturnType<typeof userEvent.setup>, value: string) {
  const trigger = screen
    .getAllByText('SP95-E10')
    .map((el) => el.closest('button'))
    .find((el): el is HTMLButtonElement => !!el) as HTMLButtonElement
  await user.click(trigger)
  await user.click(await screen.findByRole('option', { name: value }))
}

// Radix portals to document.body, so query there. Call AFTER the dialog
// content has mounted (findByRole on the title).
function fuelFields() {
  return {
    date: document.querySelector('#fuel-date') as HTMLInputElement,
    odometer: document.querySelector('#fuel-odometer') as HTMLInputElement,
    liters: document.querySelector('#fuel-liters') as HTMLInputElement,
    price: document.querySelector('#fuel-price') as HTMLInputElement,
    station: document.querySelector('#fuel-station') as HTMLInputElement,
  }
}

function renderFuel(routes = baseRoutes, onClose = vi.fn()) {
  const router = installFetchRouter(routes)
  const utils = renderWithProviders(<FuelAddDialog vehicleId={1} onClose={onClose} />)
  return { ...utils, router, onClose }
}

function fuelPost(router: { calls: { url: string; init?: RequestInit }[] }) {
  const post = [...router.calls].reverse().find(
    (c) => c.init?.method === 'POST' && c.url.includes('/fuel-entries/'),
  )
  if (!post) return null
  return { url: post.url, body: JSON.parse(post.init!.body as string) }
}

const okFuelRoutes = [
  ['/fuel-entries/', (url: string, init?: RequestInit) =>
    init?.method === 'POST' && url.includes('/fuel-entries/') ? json({ ...latestEntry1, id: 51 }, 201) : undefined],
] as [string, (url: string, init?: RequestInit) => Response | undefined][]

type FuelFields = ReturnType<typeof fuelFields>

async function fillForm(user: ReturnType<typeof userEvent.setup>, fields: FuelFields, odometer = '20100') {
  await user.type(fields.odometer, odometer)
  await user.type(fields.liters, '45')
  await user.type(fields.price, '1.69')
}

beforeEach(() => {
  // Object.defineProperty leaks across tests (it's not a vi stub) — reset.
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true })
  toastMock.success.mockClear()
  toastMock.error.mockClear()
  toastMock.info.mockClear()
  vi.stubGlobal('confirm', vi.fn(() => true))
})

describe('FuelAddDialog', () => {
  it('opens with the vehicle header, auto-filled date, and latest odometer hint', async () => {
    renderFuel()
    expect(await screen.findByRole('heading', { name: 'Ajouter un plein' })).toBeInTheDocument()
    expect(await screen.findByText(/Peugeot 208 \(2019\) — AB-123-CD/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Compteur \*/)).toBeInTheDocument()
    // date defaults to today
    const dateInput = fuelFields().date
    expect(dateInput.value).toBe(new Date().toISOString().split('T')[0])
  })

  it('online submit: POSTs /fuel-entries/ with a client_request_id, toasts, closes', async () => {
    const user = userEvent.setup()
    const { router, onClose } = renderFuel([...okFuelRoutes, ...baseRoutes])
    await screen.findByRole('heading', { name: 'Ajouter un plein' })
    const fields = fuelFields()

    await fillForm(user, fields)
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    await vi.waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Plein ajouté avec succès'))
    expect(onClose).toHaveBeenCalled()
    const post = fuelPost(router)!
    expect(post).not.toBeNull()
    expect(post.url).toContain('/fuel-entries/')
    expect(post.url).not.toContain('allow_odometer_decrease')
    expect(post.body).toMatchObject({
      vehicle_id: 1,
      fuel_type: 'essence',
      liters: 45,
      price_per_liter: 1.69,
      odometer_reading: 20100,
      is_full_tank: true,
    })
    expect(typeof post.body.client_request_id).toBe('string')
    expect(post.body.client_request_id).toHaveLength(36)
  })

  it('offline submit: queued with client_request_id, info toast, closes, no POST', async () => {
    const user = userEvent.setup()
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true })
    const { router, onClose } = renderFuel([...okFuelRoutes, ...baseRoutes])
    await screen.findByRole('heading', { name: 'Ajouter un plein' })
    const fields = fuelFields()

    await fillForm(user, fields)
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    await vi.waitFor(() =>
      expect(toastMock.info).toHaveBeenCalledWith(expect.stringContaining('Plein enregistré hors-ligne')),
    )
    expect(onClose).toHaveBeenCalled()
    expect(fuelPost(router)).toBeNull()
    const queue = JSON.parse(localStorage.getItem('vv_offline_queue') ?? '[]')
    expect(queue).toHaveLength(1)
    expect(queue[0].payload.kind).toBe('fuel-create')
    expect(queue[0].payload.data).toMatchObject({
      vehicle_id: 1,
      liters: 45,
      price_per_liter: 1.69,
      odometer_reading: 20100,
    })
    expect(queue[0].payload.data.client_request_id).toHaveLength(36)
  })

  it('server unreachable while "online": queued, not lost', async () => {
    const user = userEvent.setup()
    const { onClose } = renderFuel([
      ['/fuel-entries/', (url: string, init?: RequestInit) => {
        if (init?.method === 'POST' && url.includes('/fuel-entries/')) {
          throw new TypeError('Failed to fetch')
        }
        return undefined
      }],
      ...baseRoutes,
    ])
    await screen.findByRole('heading', { name: 'Ajouter un plein' })
    const fields = fuelFields()

    await fillForm(user, fields)
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    await vi.waitFor(() =>
      expect(toastMock.info).toHaveBeenCalledWith(expect.stringContaining('Serveur injoignable')),
    )
    expect(onClose).toHaveBeenCalled()
    const queue = JSON.parse(localStorage.getItem('vv_offline_queue') ?? '[]')
    expect(queue).toHaveLength(1)
    expect(queue[0].payload.kind).toBe('fuel-create')
  })

  it('server rejection (ApiError 422): error toast with detail, dialog stays open, nothing queued', async () => {
    const user = userEvent.setup()
    renderFuel([
      ['/fuel-entries/', (url: string, init?: RequestInit) =>
        init?.method === 'POST' && url.includes('/fuel-entries/')
          ? json({ detail: 'Le compteur est inférieur au premier relevé' }, 422)
          : undefined],
      ...baseRoutes,
    ])
    await screen.findByRole('heading', { name: 'Ajouter un plein' })
    const fields = fuelFields()

    await fillForm(user, fields)
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    await vi.waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('Le compteur est inférieur au premier relevé'),
    )
    expect(screen.getByRole('heading', { name: 'Ajouter un plein' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('vv_offline_queue') ?? '[]')).toEqual([])
  })

  it('odometer lower than latest: confirmed decrease → ?allow_odometer_decrease=true on the POST', async () => {
    const user = userEvent.setup()
    const confirmMock = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmMock)
    const { router } = renderFuel([...okFuelRoutes, ...baseRoutes])
    await screen.findByRole('heading', { name: 'Ajouter un plein' })
    const fields = fuelFields()

    await fillForm(user, fields, '19900') // latest is 20000
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    expect(confirmMock).toHaveBeenCalledWith('Le compteur est inférieur au dernier relevé. Continuer ?')
    await vi.waitFor(() => expect(fuelPost(router)).not.toBeNull())
    const post = fuelPost(router)!
    expect(post.url).toContain('allow_odometer_decrease=true')
    expect(post.body.allowOdometerDecrease).toBeUndefined()
  })

  it('odometer lower than latest: declined confirm → no POST, dialog stays open', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('confirm', vi.fn(() => false))
    const { router } = renderFuel([...okFuelRoutes, ...baseRoutes])
    await screen.findByRole('heading', { name: 'Ajouter un plein' })
    const fields = fuelFields()

    await fillForm(user, fields, '19900')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    expect(fuelPost(router)).toBeNull()
    expect(screen.getByRole('heading', { name: 'Ajouter un plein' })).toBeInTheDocument()
  })

  it('fuel type mismatch: warning shown when selecting diesel on an essence car', async () => {
    const user = userEvent.setup()
    renderFuel()
    await screen.findByRole('heading', { name: 'Ajouter un plein' })

    await selectFuelType(user, 'Diesel')
    expect(await screen.findByText(/Le type sélectionné \(diesel\) diffère/)).toBeInTheDocument()
  })

  it('E10 auto-capture: E85 fill on a flexfuel car records the station E10 price', async () => {
    const user = userEvent.setup()
    geoState.status = 'success'
    const { router } = renderFuel([...okFuelRoutes, ...E10_STATION_ROUTES, ...FLEXFUEL_ROUTES, ...baseRoutes])
    await screen.findByRole('heading', { name: 'Ajouter un plein' })
    const fields = fuelFields()

    // the nearest station auto-selects: name + E10 price land in the form
    await vi.waitFor(() => expect(fields.station.value).not.toBe(''))
    expect(fields.price.value).toBe('1.55')

    await selectFuelType(user, 'E85')
    // price is already auto-filled — only counter + liters
    await user.type(fields.odometer, '21000')
    await user.type(fields.liters, '40')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    await vi.waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Plein ajouté avec succès'))
    const post = fuelPost(router)!
    expect(post.body.fuel_type).toBe('e85')
    expect(post.body.e10Price).toBe(1.55)
    const e10 = e10Posts(router)
    expect(e10).toHaveLength(1)
    expect(JSON.parse(e10[0].init!.body as string)).toMatchObject({
      reference_date: new Date().toISOString().split('T')[0],
      price_per_liter: 1.55,
    })
    expect(toastMock.info).toHaveBeenCalledWith(expect.stringContaining('Prix E10 de référence enregistré'))
  })

  it('E10 auto-capture offline: the queued payload stashes e10_price, no E10 POST', async () => {
    const user = userEvent.setup()
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true })
    geoState.status = 'success'
    const { router } = renderFuel([...okFuelRoutes, ...E10_STATION_ROUTES, ...FLEXFUEL_ROUTES, ...baseRoutes])
    await screen.findByRole('heading', { name: 'Ajouter un plein' })
    const fields = fuelFields()

    await vi.waitFor(() => expect(fields.station.value).not.toBe(''))
    await selectFuelType(user, 'E85')
    await user.type(fields.odometer, '21000')
    await user.type(fields.liters, '40')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    await vi.waitFor(() =>
      expect(toastMock.info).toHaveBeenCalledWith(expect.stringContaining('Plein enregistré hors-ligne')),
    )
    const queue = JSON.parse(localStorage.getItem('vv_offline_queue') ?? '[]')
    expect(queue).toHaveLength(1)
    expect(queue[0].payload.data.fuel_type).toBe('e85')
    expect(queue[0].payload.data.e10Price).toBe(1.55)
    expect(e10Posts(router)).toHaveLength(0)
    expect(fuelPost(router)).toBeNull()
  })
})
