/**
 * Smoke tests in a real headless browser (system Chromium).
 *
 * Real stack, no mocks of our own code:
 *  - frontend: `vite preview` production build → the service worker is active
 *  - backend:  the real FastAPI app on SQLite (backend/dev_sqlite_server.py)
 *  - only third parties are stubbed: data.economie.gouv.fr and the routing proxy
 */
import { expect, test, type Page, type Response } from '@playwright/test'

const API = 'http://127.0.0.1:18055/api/v1'
const QUEUE_KEY = 'vv_offline_queue'

async function seededVehicleId(request: { get: (u: string) => Promise<{ json(): Promise<unknown> }> }): Promise<number> {
  const r = await request.get(`${API}/vehicles/`)
  const vehicles = (await r.json()) as { license_plate: string; id: number }[]
  const smoke = vehicles.find((v) => v.license_plate === 'SMOKE-01')
  if (!smoke) throw new Error('seed vehicle SMOKE-01 missing')
  return smoke.id
}

async function fuelEntryCount(request: { get: (u: string) => Promise<{ json(): Promise<unknown> }> }, vehicleId: number): Promise<number> {
  const r = await request.get(`${API}/fuel-entries/vehicle/${vehicleId}`)
  return ((await r.json()) as unknown[]).length
}

async function queueLength(page: Page): Promise<number> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as unknown[]).length : 0
  }, QUEUE_KEY)
}

/** Open the "Ajouter un plein" dialog on the seeded vehicle and fill it. */
async function fillFuelDialog(page: Page, opts: { odometer?: string; liters?: string; price?: string; station?: string } = {}) {
  await page.getByRole('button', { name: 'Ajouter un plein' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('heading', { name: 'Ajouter un plein' }).waitFor()
  await page.locator('#fuel-odometer').fill(opts.odometer ?? '11500')
  await page.locator('#fuel-liters').fill(opts.liters ?? '38.5')
  await page.locator('#fuel-price').fill(opts.price ?? '1.92')
  if (opts.station) await page.locator('#fuel-station').fill(opts.station)
  await dialog.getByRole('button', { name: 'Ajouter', exact: true }).click()
}

test.beforeEach(async ({ context }) => {
  // Deterministic position for the station dialog (it auto-captures on open).
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 50.0, longitude: 1.5 })
})

test('PWA: app loads, renders the seeded vehicle, service worker activates', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('banner')).toContainText('VroomVroom')
  await expect(page.getByText('Peugeot', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('SMOKE-01')).toBeVisible()
  // The PWA service worker is registered and active (prod build).
  await page.waitForFunction(
    () => navigator.serviceWorker.getRegistration().then((r) => !!r?.active),
  )
})

test('online fuel add reaches the real backend over HTTP', async ({ page, context }) => {
  const vehicleId = await seededVehicleId(context.request)
  const before = await fuelEntryCount(context.request, vehicleId)

  await page.goto('/')
  await page.getByText('SMOKE-01').waitFor()
  await fillFuelDialog(page, { station: 'SMOKE Online' })

  const resp = page.waitForResponse(
    (r) => r.url().includes('/fuel-entries/') && r.request().method() === 'POST',
  )
  await page.getByText('Plein ajouté avec succès').waitFor()
  const post: Response = await resp
  expect(post.status()).toBe(201)

  const after = await fuelEntryCount(context.request, vehicleId)
  expect(after).toBe(before + 1)
})

test('REGRESSION: server-down queue survives a refresh, resyncs when server returns', async ({ page, context }) => {
  test.setTimeout(150_000) // 60s retry timer + margins
  const vehicleId = await seededVehicleId(context.request)
  const before = await fuelEntryCount(context.request, vehicleId)

  await page.goto('/')
  await page.getByText('SMOKE-01').waitFor()

  // The reported outage: browser is ONLINE, the backend is unreachable.
  // (route.abort keeps navigator.onLine=true — that is exactly the case the
  // dialog's "Serveur injoignable" branch is built for.)
  await context.route('**/api/v1/**', (route) => route.abort())

  await fillFuelDialog(page, { station: 'SMOKE Down', odometer: '12000' })
  await page.getByText(/Serveur injoignable/).waitFor()
  expect(await queueLength(page)).toBe(1)

  // THE BUG: a refresh used to drop the persisted queue.
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  // Queue rehydrated from localStorage…
  expect(await queueLength(page)).toBe(1)
  // …and the app knows about it (banner re-rendered from rehydrated state).
  await expect(page.getByText(/1 élément en attente de synchronisation/)).toBeVisible()

  // Server comes back → the 60s retry timer syncs the queue (real POST).
  const resp = page.waitForResponse(
    (r) => r.url().includes('/fuel-entries/') && r.request().method() === 'POST',
  )
  await context.unroute('**/api/v1/**')
  await expect(page.getByText(/en attente de synchronisation/)).toHaveCount(0, { timeout: 90_000 })
  const post: Response = await resp
  expect(post.status()).toBe(201)
  expect(await queueLength(page)).toBe(0)
  expect(await fuelEntryCount(context.request, vehicleId)).toBe(before + 1)
})

test('offline capture: fill queued offline, synced on the "online" event', async ({ page, context }) => {
  const vehicleId = await seededVehicleId(context.request)
  const before = await fuelEntryCount(context.request, vehicleId)

  await page.goto('/')
  await page.getByText('SMOKE-01').waitFor()

  await context.setOffline(true)
  await fillFuelDialog(page, { station: 'SMOKE Offline', odometer: '12300' })
  await page.getByText(/Plein enregistré hors-ligne/).waitFor()
  expect(await queueLength(page)).toBe(1)
  await expect(page.getByText(/1 élément en attente de synchronisation/)).toBeVisible()

  // Back online → the "online" event triggers an immediate sync (no reload).
  const resp = page.waitForResponse(
    (r) => r.url().includes('/fuel-entries/') && r.request().method() === 'POST',
  )
  await context.setOffline(false)
  await expect(page.getByText(/en attente de synchronisation/)).toHaveCount(0, { timeout: 30_000 })
  const post: Response = await resp
  expect(post.status()).toBe(201)
  expect(await queueLength(page)).toBe(0)
  expect(await fuelEntryCount(context.request, vehicleId)).toBe(before + 1)
})

test('theme toggle flips dark mode and survives a refresh', async ({ page }) => {
  await page.goto('/')
  await page.getByText('SMOKE-01').waitFor()
  const themeClass = () => page.evaluate(() => document.documentElement.className)
  expect(await themeClass()).not.toContain('dark')

  await page.getByRole('button', { name: 'Changer le thème' }).click()
  await expect.poll(themeClass).toContain('dark')

  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  // next-themes persists via localStorage (storageKey vroomvroom-theme).
  await expect.poll(themeClass).toContain('dark')
})

test('station prices dialog: opens, lists (mocked) stations, Escape closes', async ({ page, context }) => {
  // Stub the two third parties the dialog talks to.
  await context.route('https://data.economie.gouv.fr/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        total_count: 2,
        results: [
          {
            id: 'st1',
            adresse: '1 Rue de la Station',
            ville: 'Lyon',
            cp: '69001',
            e10_prix: '1.7',
            sp95_prix: '1.85',
            sp98_prix: '1.95',
            gazole_prix: '1.75',
            e85_prix: '0.95',
            gplc_prix: null,
            geom: { lat: 50.001, lon: 1.501 },
          },
          {
            id: 'st2',
            adresse: '2 Avenue du Gazole',
            ville: 'Lyon',
            cp: '69002',
            e10_prix: '1.65',
            sp95_prix: '1.82',
            sp98_prix: '1.9',
            gazole_prix: '1.72',
            e85_prix: '0.92',
            gplc_prix: null,
            geom: { lat: 50.002, lon: 1.502 },
          },
        ],
      }),
    }),
  )
  // Our own routing proxy would call Valhalla (external) — keep the smoke hermetic.
  await context.route('**/api/v1/routing/matrix', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ legs: [], provider: 'valhalla', cached: false }),
    }),
  )

  await page.goto('/')
  await page.getByText('SMOKE-01').waitFor()

  await page.getByRole('button', { name: 'Prix des stations' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('heading', { name: 'Prix des stations proches' }).waitFor()
  await expect(dialog.getByText('1 Rue de la Station')).toBeVisible()
  await expect(dialog.getByText('2 Avenue du Gazole')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
