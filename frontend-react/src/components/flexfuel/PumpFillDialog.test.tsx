import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/providers'
import { installFetchRouter, baseRoutes, json, conversion1, e10Price1, entry1 } from '@/test/fixtures'
import type { FetchHandler } from '@/test/fixtures'
import { PumpFillDialog } from '@/components/flexfuel/PumpFillDialog'

beforeEach(() => {
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true })
  localStorage.clear()
})

function routesWithConversion(): [string, FetchHandler][] {
  return [
    ['/flexfuel/vehicles/1/conversion', () => json(conversion1)],
    ['/flexfuel/e10-prices', () => json([e10Price1])],
    ['/fuel-entries/', (_url, init) =>
      init?.method === 'POST' ? json({ ...entry1, id: 99 }, 201) : undefined,
    ],
    ...baseRoutes,
  ]
}

describe('PumpFillDialog', () => {
  it('shows the onboarding message when the vehicle has no conversion', async () => {
    installFetchRouter(baseRoutes) // conversion → null
    renderWithProviders(<PumpFillDialog vehicleId={1} onClose={() => {}} />)
    expect(
      await screen.findByText(/Aucune conversion FlexFuel enregistrée/),
    ).toBeInTheDocument()
  })

  it('shows the onboarding message when there is no fill since the conversion', async () => {
    installFetchRouter([
      ['/flexfuel/vehicles/1/conversion', () => json(conversion1)],
      ['/fuel-entries/vehicle/1?per_page=500', () => json([])],
      ...baseRoutes,
    ])
    renderWithProviders(<PumpFillDialog vehicleId={1} onClose={() => {}} />)
    expect(
      await screen.findByText(/Aucun plein depuis la conversion/),
    ).toBeInTheDocument()
  })

  it('pure E85 recommendation: tank state without input, then one POST after the price', async () => {
    const user = userEvent.setup()
    const router = installFetchRouter(routesWithConversion())
    renderWithProviders(<PumpFillDialog vehicleId={1} onClose={() => {}} />)

    // Tank state computed from the two essence fills (10 % ethanol, 50 L)
    expect(await screen.findByText(/10 % d'éthanol/)).toBeInTheDocument()

    // At the last odometer the tank is full → no fill to recommend
    expect(await screen.findByText(/Réservoir presque plein/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Enregistrer ces pleins/ })).toBeDisabled()

    // Drive 400 km (5 L/100 avg) → 30 L left → 20 L of pure E85
    const byLabel = (label: string) =>
      screen.getByText(label).closest('div.space-y-1')!.querySelector('input') as HTMLInputElement
    const odo = byLabel('Compteur')
    await user.clear(odo)
    await user.type(odo, '20400')
    expect(await screen.findByText('20.0 L E85 : plein direct')).toBeInTheDocument()
    // liters pre-filled from the recommendation (no user input)
    expect(byLabel('E85 (L)').value).toBe('20.0')

    // E85 price has no default (no past E85 fill) → required
    const price = byLabel('Prix E85 (€/L)')
    await user.type(price, '0.85')
    await user.click(screen.getByRole('button', { name: /Enregistrer ces pleins/ }))

    await waitFor(() =>
      expect(router.calls.some((c) => c.url.includes('/fuel-entries/') && c.init?.method === 'POST'))
        .toBe(true),
    )
    const post = router.calls.find(
      (c) => c.url.includes('/fuel-entries/') && c.init?.method === 'POST',
    )!
    const body = JSON.parse(post.init!.body as string)
    expect(body.fuel_type).toBe('e85')
    expect(body.is_full_tank).toBe(true)
    expect(body.liters).toBe(20)
    expect(body.odometer_reading).toBe(20400)
    expect(body.price_per_liter).toBe(0.85)
    expect(body.client_request_id).toBeTruthy()
  })
})
