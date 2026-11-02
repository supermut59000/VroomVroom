import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/providers'
import { toast } from 'sonner'
import { installFetchRouter, json } from '@/test/fixtures'
import type { FetchHandler } from '@/test/fixtures'
import { ColdAlertDialog } from '@/components/flexfuel/ColdAlertDialog'
import { nextOccurrence } from '@/lib/cold-alert'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

const COMMUNES = [
  {
    nom: 'Testville',
    codesPostaux: ['59000'],
    centre: { type: 'Point', coordinates: [1.51, 50.02] },
  },
]

/** open-meteo rows covering the next 06:45 occurrence at -2 °C. */
function coldForecast() {
  const occ = nextOccurrence('06:45')
  const key = `${occ.getFullYear()}-${pad(occ.getMonth() + 1)}-${pad(occ.getDate())}`
  return {
    hourly: {
      time: [`${key}T06:00`, `${key}T07:00`],
      temperature_2m: [-2, -1],
    },
  }
}

function routes(
  forecast: unknown = coldForecast(),
): [string, FetchHandler][] {
  return [
    ['api.open-meteo.com', () => json(forecast)],
    ['geo.api.gouv.fr', () => json(COMMUNES)],
  ]
}

beforeEach(() => {
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true })
  localStorage.clear()
  vi.stubGlobal('Notification', undefined) // jsdom: no browser Notification
})

describe('ColdAlertDialog', () => {
  it('renders the config form with defaults', async () => {
    installFetchRouter(routes())
    renderWithProviders(<ColdAlertDialog open onClose={() => {}} />)
    expect(await screen.findByRole('heading', { name: /Alerte froid/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Activer l'alerte froid/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tester maintenant/ })).toBeInTheDocument()
  })

  it('saving enabled without a city is rejected', async () => {
    const user = userEvent.setup()
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'toast-id' as never)
    installFetchRouter(routes())
    renderWithProviders(<ColdAlertDialog open onClose={() => {}} />)
    await screen.findByRole('heading', { name: /Alerte froid/ })
    await user.click(screen.getByRole('button', { name: /Activer l'alerte froid/ }))
    await user.click(screen.getByRole('button', { name: /Enregistrer/ }))
    expect(errorSpy).toHaveBeenCalledWith("Choisissez une ville pour activer l'alerte")
    // nothing saved
    expect(localStorage.getItem('vv_cold_alert')).toBeNull()
    errorSpy.mockRestore()
  })

  it('typing the full commune label selects the city and saves it', async () => {
    const user = userEvent.setup()
    installFetchRouter(routes())
    renderWithProviders(<ColdAlertDialog open onClose={() => {}} />)
    await screen.findByRole('heading', { name: /Alerte froid/ })

    const input = document.querySelector(
      'input[placeholder="Ville ou code postal…"]',
    ) as HTMLInputElement
    await user.type(input, 'Testville')
    // 300 ms debounce + fetch
    await new Promise((r) => setTimeout(r, 400))
    await user.type(input, ' (59000)')

    expect(screen.getByText('Testville (59000)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Enregistrer/ }))
    const saved = JSON.parse(localStorage.getItem('vv_cold_alert') ?? '{}')
    expect(saved.enabled).toBe(false)
    expect(saved.city).toEqual({ name: 'Testville', cp: '59000', lat: 50.02, lon: 1.51 })
  })

  it('Tester maintenant shows the cold advice from the forecast', async () => {
    const user = userEvent.setup()
    installFetchRouter(routes())
    renderWithProviders(<ColdAlertDialog open onClose={() => {}} />)
    await screen.findByRole('heading', { name: /Alerte froid/ })

    const input = document.querySelector(
      'input[placeholder="Ville ou code postal…"]',
    ) as HTMLInputElement
    await user.type(input, 'Testville')
    await new Promise((r) => setTimeout(r, 400))
    await user.type(input, ' (59000)')

    await user.click(screen.getByRole('button', { name: /Tester maintenant/ }))
    expect(await screen.findByText(/-2 °C prévu, plein E10 conseillé/)).toBeInTheDocument()
  })
})
