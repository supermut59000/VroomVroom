import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/providers'
import { installFetchRouter, baseRoutes, json } from '@/test/fixtures'
import type { FetchHandler } from '@/test/fixtures'
import { StationPricesDialog } from '@/components/fuel/StationPricesDialog'

// The dialog auto-captures GPS on open — jsdom has no navigator.geolocation,
// so we mock the hook with a mutable state set per test.
const geoState = vi.hoisted(() => ({
  status: 'success' as 'idle' | 'loading' | 'success' | 'error',
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

// Opendatasoft row → NearbyStation. Origin in tests: (50.0, 1.5).
function stationRow(
  id: string,
  adresse: string,
  lat: number,
  lon: number,
  prices: Partial<Record<'e10' | 'sp95' | 'diesel' | 'e85', number | null>> = {},
) {
  return {
    id,
    adresse,
    ville: 'Testville',
    cp: '59000',
    e10_prix: prices.e10 ?? null,
    sp95_prix: prices.sp95 ?? null,
    sp98_prix: null,
    gazole_prix: prices.diesel ?? null,
    e85_prix: prices.e85 ?? null,
    gplc_prix: null,
    geom: { lat, lon },
  }
}

// A is closer (~1.1 km) and pricier; B is farther (~2.3 km) and cheaper, so
// price-sort and distance-sort produce different orders.
const STATIONS = [
  stationRow('stA', '1 rue Proche', 50.01, 1.5, { e10: 1.7, sp95: 1.8 }),
  stationRow('stB', '99 avenue Loin', 50.02, 1.51, { e10: 1.65, sp95: 1.75 }),
]

function stationRoutes(
  rows: unknown[] = STATIONS,
  communes: unknown[] = [
    {
      nom: 'Testville',
      codesPostaux: ['59000'],
      centre: { type: 'Point', coordinates: [1.51, 50.02] },
    },
  ],
) {
  return [
    ['data.economie.gouv.fr', () => json({ results: rows, total_count: rows.length })],
    ['geo.api.gouv.fr', () => json(communes)],
    ...baseRoutes,
  ] as [string, FetchHandler][]
}

beforeEach(() => {
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true })
  geoState.status = 'success'
  geoState.latitude = 50.0
  geoState.longitude = 1.5
  geoState.error = null
})

const heading = () => screen.findByRole('heading', { name: /Prix des stations proches/ })

describe('StationPricesDialog', () => {
  it('lists stations from GPS position with price and cheapest badge', async () => {
    installFetchRouter(stationRoutes())
    renderWithProviders(<StationPricesDialog open onClose={() => {}} />)
    await heading()

    // cheapest (stB, 1.650) floats to row 0 in price sort
    const b = await screen.findByText('1.650 €/L')
    expect(b).toBeInTheDocument()
    expect(screen.getByText('moins cher')).toBeInTheDocument()
    expect(screen.getByText('1.700 €/L')).toBeInTheDocument()
    expect(screen.getByText(/2 stations dans un rayon de 5 km/)).toBeInTheDocument()
    // origin badge
    expect(screen.getByText('GPS actif')).toBeInTheDocument()
  })

  it('shows the cross price of a station (secondary fuel type)', async () => {
    installFetchRouter(stationRoutes())
    renderWithProviders(<StationPricesDialog open onClose={() => {}} />)
    await heading()
    await screen.findByText('1.650 €/L')
    // stB also has SP95 at 1.750 → shown as "SP95: 1.750 €"
    expect(screen.getAllByText(/SP95: 1\.750 €/).length).toBeGreaterThan(0)
  })

  it('distance sort reorders: nearest station first, "à vol d’oiseau" fallback', async () => {
    const user = userEvent.setup()
    installFetchRouter(stationRoutes())
    renderWithProviders(<StationPricesDialog open onClose={() => {}} />)
    await heading()
    await screen.findByText('1.650 €/L')

    const sortTrigger = (await screen.findByText('Tri : prix')).closest('button') as HTMLButtonElement
    await user.click(sortTrigger)
    // "Tri&nbsp;:" uses a NBSP — role names aren't whitespace-normalized
    await user.click(await screen.findByRole('option', { name: /distance/ }))

    // nearest first: '1 rue Proche' (stA) now precedes '99 avenue Loin' (stB)
    const first = await screen.findByText('1 rue Proche')
    const second = screen.getByText('99 avenue Loin')
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // no routing legs in the mock → straight-line distance label
    expect(screen.getAllByText(/à vol d'oiseau/).length).toBe(2)
  })

  it('GPS error: message + Réessayer button, no crash', async () => {
    geoState.status = 'error'
    installFetchRouter(stationRoutes())
    renderWithProviders(<StationPricesDialog open onClose={() => {}} />)
    await heading()
    expect(
      await screen.findByText(/GPS indisponible — recherchez une ville ci-dessus/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Réessayer/ })).toBeInTheDocument()
  })

  it('city autocomplete: typing fetches communes and fills the datalist', async () => {
    const user = userEvent.setup()
    const router = installFetchRouter(stationRoutes())
    renderWithProviders(<StationPricesDialog open onClose={() => {}} />)
    await heading()

    const input = document.querySelector('input[placeholder="Ville ou code postal…"]') as HTMLInputElement
    await user.type(input, 'Testville')

    // 300 ms debounce + fetch
    await new Promise((r) => setTimeout(r, 400))
    const geoCall = router.calls.find((c) => c.url.includes('geo.api.gouv.fr'))
    expect(geoCall).toBeDefined()
    expect(geoCall!.url).toContain('nom=Testville')
    // datalist <option> elements don't expose role=option in jsdom
    const datalist = document.querySelector('datalist#commune-suggestions')
    const option = [...datalist!.querySelectorAll('option')].find(
      (o) => o.value === 'Testville (59000)',
    )
    expect(option).toBeDefined()
  })

  it('no stations in radius: empty-state message', async () => {
    installFetchRouter(stationRoutes([]))
    renderWithProviders(<StationPricesDialog open onClose={() => {}} />)
    await heading()
    expect(
      await screen.findByText(/Aucune station trouvée dans un rayon de 5 km/),
    ).toBeInTheDocument()
  })

  it('API failure: error message, no station rows', async () => {
    const routes: [string, FetchHandler][] = [
      ['data.economie.gouv.fr', () => new Response('nope', { status: 500 })],
      ...baseRoutes,
    ]
    installFetchRouter(routes)
    renderWithProviders(<StationPricesDialog open onClose={() => {}} />)
    await heading()
    expect(
      await screen.findByText('Impossible de charger les prix des stations'),
    ).toBeInTheDocument()
    expect(screen.queryByText('1.650 €/L')).toBeNull()
  })

  it('star click toggles a favourite in localStorage', async () => {
    const user = userEvent.setup()
    installFetchRouter(stationRoutes())
    renderWithProviders(<StationPricesDialog open onClose={() => {}} />)
    await heading()
    const nameA = await screen.findByText('1 rue Proche')
    const rowA = nameA.closest('div.flex.items-start') as HTMLElement
    const starA = rowA.querySelector('button') as HTMLButtonElement

    expect(JSON.parse(localStorage.getItem('vroomvroom-fav-stations') ?? '{}')).not.toHaveProperty('stA')
    await user.click(starA)
    expect(JSON.parse(localStorage.getItem('vroomvroom-fav-stations') ?? '{}')).toHaveProperty('stA')
    // and the star is now filled
    expect((starA.querySelector('svg') as SVGElement).getAttribute('class')).toContain('fill-yellow-400')
  })
})
