import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { render } from '@testing-library/react'
import { Header } from '@/components/layout/Header'
import { installFetchRouter, baseRoutes, json } from '@/test/fixtures'

vi.mock('@/hooks/use-geolocation', () => ({
  useGeolocation: () => ({
    status: 'success',
    latitude: 50.0,
    longitude: 1.5,
    error: null,
    capture: () => {},
    reset: () => {},
  }),
}))

// next-themes reads prefers-color-scheme; jsdom has no matchMedia.
beforeEach(() => {
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true })
  window.matchMedia =
    window.matchMedia ??
    ((query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as MediaQueryList)
})

function renderHeader() {
  installFetchRouter([
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
              e10_prix: 1.7,
              sp95_prix: 1.8,
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
    ['geo.api.gouv.fr', () => json([])],
    ...baseRoutes,
  ] as [string, (url: string, init?: RequestInit) => Response][])
  return render(
    <ThemeProvider attribute="class" defaultTheme="system" storageKey="vroomvroom-theme">
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Header />
      </QueryClientProvider>
    </ThemeProvider>,
  )
}

describe('Header', () => {
  it('renders the app title and both action buttons', () => {
    renderHeader()
    expect(screen.getByRole('heading', { name: 'VroomVroom' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prix des stations' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Changer le thème' })).toBeInTheDocument()
  })

  it('station dialog is closed until its button is clicked', () => {
    renderHeader()
    expect(screen.queryByRole('heading', { name: /Prix des stations proches/ })).toBeNull()
  })

  it('clicking the station button opens the dialog and lists stations', async () => {
    const user = userEvent.setup()
    renderHeader()
    await user.click(screen.getByRole('button', { name: 'Prix des stations' }))
    expect(
      await screen.findByRole('heading', { name: /Prix des stations proches/ }),
    ).toBeInTheDocument()
    expect(await screen.findByText('1.700 €/L')).toBeInTheDocument()
  })

  it('Escape closes the station dialog', async () => {
    const user = userEvent.setup()
    renderHeader()
    await user.click(screen.getByRole('button', { name: 'Prix des stations' }))
    await screen.findByRole('heading', { name: /Prix des stations proches/ })
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /Prix des stations proches/ })).toBeNull(),
    )
  })

  it('theme toggle: light → dark adds the dark class to <html>', async () => {
    const user = userEvent.setup()
    renderHeader()
    // wait for next-themes to resolve the initial (system→light) theme
    await waitFor(() =>
      expect(
        document.documentElement.classList.contains('light') ||
          document.documentElement.classList.contains('dark'),
      ).toBe(true),
    )
    await user.click(screen.getByRole('button', { name: 'Changer le thème' }))
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true))
  })

  it('theme toggle round-trip: dark → light removes the class', async () => {
    const user = userEvent.setup()
    renderHeader()
    await waitFor(() =>
      expect(
        document.documentElement.classList.contains('light') ||
          document.documentElement.classList.contains('dark'),
      ).toBe(true),
    )
    const btn = screen.getByRole('button', { name: 'Changer le thème' })
    await user.click(btn)
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true))
    await user.click(btn)
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(false))
  })
})
