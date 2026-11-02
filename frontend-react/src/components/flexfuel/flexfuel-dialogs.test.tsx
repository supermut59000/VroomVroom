import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/providers'
import {
  installFetchRouter,
  baseRoutes,
  json,
  e10Price1,
  conversion1,
} from '@/test/fixtures'
import { E10ReferencePriceDialog } from '@/components/flexfuel/E10ReferencePriceDialog'
import { FlexfuelConversionDialog } from '@/components/flexfuel/FlexfuelConversionDialog'
import { BlendCalculatorDialog } from '@/components/flexfuel/BlendCalculatorDialog'
import { BlendCalculator } from '@/components/flexfuel/BlendCalculator'
import { render } from '@testing-library/react'
import { vehicleFull1, latestEntry1 } from '@/test/fixtures'
import type { FuelEntry } from '@/types'

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: toastMock }))

type Router = ReturnType<typeof installFetchRouter>

function byMethod(router: Router, method: string) {
  return router.calls.filter((c) => c.init?.method === method)
}

beforeEach(() => {
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true })
  toastMock.success.mockClear()
  toastMock.error.mockClear()
  vi.stubGlobal('confirm', vi.fn(() => true))
})

describe('E10ReferencePriceDialog', () => {
  it('shows the empty state when no reference price is stored', async () => {
    installFetchRouter(baseRoutes)
    renderWithProviders(<E10ReferencePriceDialog open onClose={() => {}} />)
    expect(
      await screen.findByRole('heading', { name: /Prix de référence E10/ }),
    ).toBeInTheDocument()
    expect(screen.getByText('Aucun prix enregistré')).toBeInTheDocument()
  })

  it('lists existing prices with date and €/L', async () => {
    installFetchRouter([
      ['/flexfuel/e10-prices', () => json([e10Price1])],
      ...baseRoutes,
    ])
    renderWithProviders(<E10ReferencePriceDialog open onClose={() => {}} />)
    await screen.findByRole('heading', { name: /Prix de référence E10/ })
    expect(await screen.findByText(/1\.659/)).toBeInTheDocument()
    expect(screen.queryByText('Aucun prix enregistré')).toBeNull()
  })

  it('adds a price: POST with parsed number, success toast, input cleared', async () => {
    const user = userEvent.setup()
    const router = installFetchRouter([
      [
        '/flexfuel/e10-prices',
        (_url, init) => (init?.method === 'POST' ? json(e10Price1) : json([])),
      ],
      ...baseRoutes,
    ])
    renderWithProviders(<E10ReferencePriceDialog open onClose={() => {}} />)
    await screen.findByRole('heading', { name: /Prix de référence E10/ })

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
    const priceInput = document.querySelector('input[type="number"]') as HTMLInputElement
    await user.type(priceInput, '1.7')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    await vi.waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith('Prix E10 enregistré'),
    )
    const posts = byMethod(router, 'POST')
    expect(posts).toHaveLength(1)
    expect(JSON.parse(posts[0].init!.body as string)).toEqual({
      reference_date: dateInput.value,
      price_per_liter: 1.7,
    })
    expect(priceInput.value).toBe('')
  })

  it('rejects a non-positive price client-side: error toast, no POST', async () => {
    const user = userEvent.setup()
    const router = installFetchRouter(baseRoutes)
    renderWithProviders(<E10ReferencePriceDialog open onClose={() => {}} />)
    await screen.findByRole('heading', { name: /Prix de référence E10/ })

    const priceInput = document.querySelector('input[type="number"]') as HTMLInputElement
    await user.type(priceInput, '-1')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    expect(toastMock.error).toHaveBeenCalledWith('Prix invalide')
    expect(byMethod(router, 'POST')).toHaveLength(0)
  })

  it('deletes a price: DELETE by id, success toast', async () => {
    const user = userEvent.setup()
    const router = installFetchRouter([
      ['/flexfuel/e10-prices/1', () => json(null, 204)],
      ['/flexfuel/e10-prices', () => json([e10Price1])],
      ...baseRoutes,
    ])
    renderWithProviders(<E10ReferencePriceDialog open onClose={() => {}} />)
    const price = await screen.findByText(/1\.659/)

    const row = price.closest('div.flex') as HTMLElement
    const trash = row.querySelector('button') as HTMLButtonElement
    await user.click(trash)

    await vi.waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith('Prix supprimé'),
    )
    const dels = byMethod(router, 'DELETE')
    expect(dels).toHaveLength(1)
    expect(dels[0].url.endsWith('/flexfuel/e10-prices/1')).toBe(true)
  })
})

describe('FlexfuelConversionDialog', () => {
  it('create mode: title, Enregistrer button, defaults, no delete', async () => {
    installFetchRouter(baseRoutes) // conversion → null
    renderWithProviders(<FlexfuelConversionDialog vehicleId={1} open onClose={() => {}} />)
    expect(
      await screen.findByRole('heading', { name: 'Ajouter une conversion E85' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument()
    expect(screen.queryByText('Supprimer')).toBeNull()
    expect(
      (document.querySelector('#conv-overcons') as HTMLInputElement).value,
    ).toBe('20')
  })

  it('edit mode: pre-filled values and Supprimer button', async () => {
    installFetchRouter([
      ['/flexfuel/vehicles/1/conversion', () => json(conversion1)],
      ...baseRoutes,
    ])
    renderWithProviders(<FlexfuelConversionDialog vehicleId={1} open onClose={() => {}} />)
    expect(
      await screen.findByRole('heading', { name: 'Modifier la conversion E85' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mettre à jour' })).toBeInTheDocument()
    expect(screen.getByText('Supprimer')).toBeInTheDocument()
    expect(
      (document.querySelector('#conv-cost') as HTMLInputElement).value,
    ).toBe('850')
    expect(
      (document.querySelector('#conv-brand') as HTMLInputElement).value,
    ).toBe('FLEXbox')
  })

  it('creates a conversion: POST with vehicle_id, toast, onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const router = installFetchRouter([
      [
        '/flexfuel/vehicles/1/conversion',
        (_url, init) => (init?.method === 'POST' ? json(conversion1) : json(null)),
      ],
      ...baseRoutes,
    ])
    renderWithProviders(<FlexfuelConversionDialog vehicleId={1} open onClose={onClose} />)
    await screen.findByRole('heading', { name: 'Ajouter une conversion E85' })

    await user.type(document.querySelector('#conv-cost') as HTMLInputElement, '120.50')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await vi.waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith('Conversion FlexFuel enregistrée'),
    )
    expect(onClose).toHaveBeenCalled()
    const posts = byMethod(router, 'POST')
    expect(posts).toHaveLength(1)
    const body = JSON.parse(posts[0].init!.body as string)
    expect(body.vehicle_id).toBe(1)
    expect(body.kit_cost).toBe(120.5)
    expect(body.overconsumption_pct).toBe(20)
  })

  it('updates an existing conversion: PUT without vehicle_id', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const router = installFetchRouter([
      [
        '/flexfuel/vehicles/1/conversion',
        () => json(conversion1),
      ],
      ...baseRoutes,
    ])
    renderWithProviders(<FlexfuelConversionDialog vehicleId={1} open onClose={onClose} />)
    await screen.findByRole('heading', { name: 'Modifier la conversion E85' })

    await user.clear(document.querySelector('#conv-cost') as HTMLInputElement)
    await user.type(document.querySelector('#conv-cost') as HTMLInputElement, '999')
    await user.click(screen.getByRole('button', { name: 'Mettre à jour' }))

    await vi.waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith('Conversion mise à jour'),
    )
    expect(onClose).toHaveBeenCalled()
    const puts = byMethod(router, 'PUT')
    expect(puts).toHaveLength(1)
    const body = JSON.parse(puts[0].init!.body as string)
    expect(body).not.toHaveProperty('vehicle_id')
    expect(body.kit_cost).toBe(999)
  })

  it('deletes a conversion only when the confirm() is accepted', async () => {
    const user = userEvent.setup()
    const router = installFetchRouter([
      [
        '/flexfuel/vehicles/1/conversion',
        (_url, init) => (init?.method === 'DELETE' ? json(null, 204) : json(conversion1)),
      ],
      ...baseRoutes,
    ])
    renderWithProviders(
      <FlexfuelConversionDialog vehicleId={1} open onClose={() => {}} />,
    )
    await screen.findByRole('heading', { name: 'Modifier la conversion E85' })

    // declined confirm: nothing happens
    vi.stubGlobal('confirm', vi.fn(() => false))
    await user.click(screen.getByText('Supprimer'))
    await new Promise((r) => setTimeout(r, 50))
    expect(byMethod(router, 'DELETE')).toHaveLength(0)

    // accepted confirm: DELETE fires
    vi.stubGlobal('confirm', vi.fn(() => true))
    await user.click(screen.getByText('Supprimer'))
    await vi.waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith('Conversion supprimée'),
    )
    const dels = byMethod(router, 'DELETE')
    expect(dels).toHaveLength(1)
    expect(dels[0].url.endsWith('/flexfuel/vehicles/1/conversion')).toBe(true)
  })

  it('empty kit cost: zod blocks the submit, no POST, dialog stays open', async () => {
    const user = userEvent.setup()
    const router = installFetchRouter(baseRoutes)
    renderWithProviders(
      <FlexfuelConversionDialog vehicleId={1} open onClose={() => {}} />,
    )
    await screen.findByRole('heading', { name: 'Ajouter une conversion E85' })

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await new Promise((r) => setTimeout(r, 50))

    expect(byMethod(router, 'POST')).toHaveLength(0)
    expect(
      screen.getByRole('heading', { name: 'Ajouter une conversion E85' }),
    ).toBeInTheDocument()
  })
})

describe('BlendCalculator', () => {
  it('survives a null→set tank_capacity re-render (rules of hooks)', () => {
    // The capacity-missing early return used to sit BEFORE the useMemo calls:
    // filling in tank_capacity on a mounted calculator changed the hook count
    // and crashed React. NOTE: bare render, not renderWithProviders — the
    // provider harness remounts the subtree on rerender and would mask the
    // hook-count error this test exists to catch.
    const entries = [
      { ...latestEntry1, fueling_date: '2025-01-05', odometer_reading: 50000 },
      { ...latestEntry1, id: 2, fueling_date: '2025-01-20', odometer_reading: 50500 },
    ] as FuelEntry[]

    const { rerender } = render(
      <BlendCalculator conversion={conversion1} vehicle={{ ...vehicleFull1, tank_capacity: null }} entries={entries} />,
    )
    expect(screen.getByText(/Renseignez la capacité du réservoir/)).toBeInTheDocument()

    expect(() =>
      rerender(
        <BlendCalculator conversion={conversion1} vehicle={vehicleFull1} entries={entries} />,
      ),
    ).not.toThrow()
    expect(screen.getByText('Diluant')).toBeInTheDocument()
    expect(screen.queryByText(/Renseignez la capacité du réservoir/)).toBeNull()
  })

  it('adapts the target to the season and shows live km thresholds (hiver, 02/11/2026)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-02T08:00:00'))
    const entries = [
      { ...latestEntry1, fueling_date: '2025-01-05', odometer_reading: 50000 },
      { ...latestEntry1, id: 2, fueling_date: '2025-01-20', odometer_reading: 50500 },
    ] as FuelEntry[]
    render(<BlendCalculator conversion={conversion1} vehicle={vehicleFull1} entries={entries} embedded />)
    // Range of a full E85 tank — always visible
    expect(screen.getByText(/Plein E85 : ~[\d\s]+ km d'autonomie/)).toBeInTheDocument()
    // Bounded seasonal grade + adapted target (77 % saisi en été → 67 % en hiver, limite 72 %)
    expect(screen.getByText(/Grade E85 — Hiver \(1er nov – 15 mars\)/)).toBeInTheDocument()
    expect(screen.getByText(/60 – 75 % d'éthanol/)).toBeInTheDocument()
    expect(screen.getByText(/Cible saison : 67% \(été : 77%\)/)).toBeInTheDocument()
    // E85 peut monter à 75 % > limite 72 % → les km de seuils reviennent, la dilution n'est plus « inutile »
    expect(screen.queryByText('Toujours possible')).toBeNull()
    expect(screen.getByText("Jusqu'au km")).toBeInTheDocument()
    expect(screen.queryByText(/Inutile : max saison/)).toBeNull()
    vi.useRealTimers()
  })

  it('shows the live km thresholds, not « Toujours possible », when the season max exceeds the limit (été)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T08:00:00'))
    const entries = [
      { ...latestEntry1, fueling_date: '2025-01-05', odometer_reading: 50000 },
      { ...latestEntry1, id: 2, fueling_date: '2025-01-20', odometer_reading: 50500 },
    ] as FuelEntry[]
    render(<BlendCalculator conversion={conversion1} vehicle={vehicleFull1} entries={entries} embedded />)
    expect(screen.getByText(/Grade E85 — Été \(1er mai – 30 sept\)/)).toBeInTheDocument()
    // Max saison 85 % > limite 82 % : les seuils km reviennent, plus de « Toujours possible »
    expect(screen.queryByText('Toujours possible')).toBeNull()
    expect(screen.getByText("Jusqu'au km")).toBeInTheDocument()
    vi.useRealTimers()
  })
})

describe('BlendCalculatorDialog', () => {
  it('stays closed when no vehicle is selected', async () => {
    installFetchRouter(baseRoutes)
    renderWithProviders(<BlendCalculatorDialog vehicleId={null} onClose={() => {}} />)
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.queryByRole('heading', { name: /Mélange E85/ })).toBeNull()
  })

  it('tells the user when the vehicle has no conversion', async () => {
    installFetchRouter(baseRoutes) // conversion → null
    renderWithProviders(<BlendCalculatorDialog vehicleId={1} onClose={() => {}} />)
    expect(
      await screen.findByRole('heading', { name: /Mélange E85/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Aucune conversion FlexFuel enregistrée pour ce véhicule.'),
    ).toBeInTheDocument()
  })

  it('shows the target line and calculator when a conversion exists', async () => {
    installFetchRouter([
      ['/flexfuel/vehicles/1/conversion', () => json(conversion1)],
      ...baseRoutes,
    ])
    renderWithProviders(<BlendCalculatorDialog vehicleId={1} onClose={() => {}} />)
    await screen.findByRole('heading', { name: /Mélange E85/ })
    // vehicle loads async (Peugeot 208, tank 50 L)
    expect(await screen.findByText(/Cible 77%/)).toBeInTheDocument()
    expect(
      screen.queryByText('Aucune conversion FlexFuel enregistrée pour ce véhicule.'),
    ).toBeNull()
  })
})
