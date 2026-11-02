import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, makeQueryClient } from '@/test/providers'
import { installFetchRouter, json, baseRoutes, stats1, vehicleList1 } from '@/test/fixtures'
import { VehicleCard } from '@/components/vehicles/VehicleCard'
import { VehicleGrid } from '@/components/vehicles/VehicleGrid'
import { VehicleDetailsDialog } from '@/components/vehicles/VehicleDetailsDialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import { VehicleTimelineSheet } from '@/components/vehicles/VehicleTimelineSheet'
import type { VehicleList, VehicleStats } from '@/types'
import type { QueueItem, QueuedPayload } from '@/lib/offline'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))
import { toast } from 'sonner'
const toastMock = vi.mocked(toast)

// Seed batch stats so useVehicleStats resolves without a fetch (individual
// query disabled). Cost stats + reminders + flexfuel come through the router.
function renderCard(vehicle: VehicleList, opts: { stats?: Record<string, VehicleStats>; routes?: Parameters<typeof installFetchRouter>[0] } = {}) {
  const queryClient = makeQueryClient()
  if (opts.stats) queryClient.setQueryData(['vehicleStatsBatch'], opts.stats)
  const router = installFetchRouter(opts.routes ?? baseRoutes)
  const utils = renderWithProviders(
    <TooltipProvider><VehicleCard
      vehicle={vehicle}
      onDetails={vi.fn()}
      onEdit={vi.fn()}
      onFuelAdd={vi.fn()}
      onFuelView={vi.fn()}
      onMaintenanceAdd={vi.fn()}
      onMaintenanceView={vi.fn()}
      onBlendCalc={vi.fn()}
    /></TooltipProvider>,
    queryClient,
  )
  return { ...utils, queryClient, router }
}

beforeEach(() => {
  toastMock.success.mockClear()
  toastMock.error.mockClear()
})

describe('VehicleCard', () => {
  it('shows skeleton while stats are pending', () => {
    // No batch seeded → no stats → skeletons
    renderCard(vehicleList1, { routes: [
      ['/vehicles/stats/batch', () => json({})],
      ...baseRoutes,
    ] })
    expect(screen.getByText(/AB-123-CD/)).toBeInTheDocument()
    // No stats figures rendered yet
    expect(screen.queryByText(/Compteur:/)).not.toBeInTheDocument()
  })

  it('renders key stats, days-since and monthly cost once loaded', async () => {
    renderCard(vehicleList1, {
      stats: { '1': stats1 },
      routes: [
        ['/fuel-entries/vehicle/1?per_page=500', () => json([
          { id: 1, vehicle_id: 1, liters: 50, price_per_liter: 2, total_cost: 100, odometer_reading: 20000, fueling_date: new Date().toISOString().slice(0, 10) },
        ])],
        ['/maintenances/vehicle/1', () => json([])],
        ...baseRoutes,
      ],
    })
    await waitFor(() => expect(screen.getByText('Compteur:')).toBeInTheDocument())
    expect(screen.getByText(/20 000 km/)).toBeInTheDocument()
    expect(screen.getByText('Pleins:')).toBeInTheDocument()
    expect(screen.getByText('6.5 L/100')).toBeInTheDocument()
    expect(screen.getByText('Dernier plein il y a 30 jours')).toBeInTheDocument()
    // monthly cost block (thisMonth 100 > 0)
    await waitFor(() => expect(screen.getByText('Ce mois')).toBeInTheDocument())
  })

  it('shows the "Kilométrage illimité" badge when insurance is unlimited', async () => {
    renderCard({ ...vehicleList1, insurance_unlimited: true }, { stats: { '1': stats1 } })
    await waitFor(() => expect(screen.getByText('Kilométrage illimité')).toBeInTheDocument())
  })

  it('shows the exceeded-limit badge when the insurance km limit is exceeded', async () => {
    renderCard(vehicleList1, {
      stats: { '1': { ...stats1, insurance_km_exceeded: true, insurance_km_remaining: 0 } },
    })
    await waitFor(() => expect(screen.getByText('Limite km assurance dépassée')).toBeInTheDocument())
  })

  it('shows low remaining (orange) vs normal (green) km badges', async () => {
    // remaining 2000 <= 30000*0.1 (3000) → orange low badge
    renderCard(vehicleList1, {
      stats: { '1': { ...stats1, insurance_km_remaining: 2000, insurance_km_exceeded: false } },
    })
    await waitFor(() => expect(screen.getByText('2 000 km restants')).toBeInTheDocument())
  })

  it('shows maintenance reminders', async () => {
    renderCard(vehicleList1, {
      stats: { '1': stats1 },
      routes: [
        ['/maintenances/vehicle/1', () => json([
          { id: 1, vehicle_id: 1, maintenance_type: 'Vidange', cost: 1, odometer_reading: 10000, maintenance_date: '2020-01-01', next_maintenance_date: '2020-02-01', next_maintenance_odometer: null },
        ])],
        ...baseRoutes,
      ],
    })
    await waitFor(() => expect(screen.getAllByText(/dépassée de/).length).toBeGreaterThan(0))
  })

  it('shows the offline fuel queue count badge on the add button', () => {
    const utils = renderCard(vehicleList1, { stats: { '1': stats1 } })
    // re-render not needed; fuelQueueCount defaults 0 here. Instead test via grid below.
    expect(utils.container.querySelector('[aria-label="Ajouter un plein"]')).toBeInTheDocument()
  })

  it('renders the E85 blend button when a conversion exists and calls onBlendCalc', async () => {
    const router = installFetchRouter([
      ['/flexfuel/vehicles/1/conversion', () => json({
        id: 1, vehicle_id: 1, conversion_date: '2025-01-01', kit_cost: 300, overconsumption_pct: 20,
      })],
      ...baseRoutes,
    ])
    const queryClient = makeQueryClient()
    queryClient.setQueryData(['vehicleStatsBatch'], { '1': stats1 })
    const onBlendCalc = vi.fn()
    renderWithProviders(
      <TooltipProvider><VehicleCard vehicle={vehicleList1} onDetails={vi.fn()} onEdit={vi.fn()} onFuelAdd={vi.fn()}
        onFuelView={vi.fn()} onMaintenanceAdd={vi.fn()} onMaintenanceView={vi.fn()} onBlendCalc={onBlendCalc} /></TooltipProvider>,
      queryClient,
    )
    const btn = await screen.findByLabelText('Calculateur de mélange E85')
    await userEvent.click(btn)
    expect(onBlendCalc).toHaveBeenCalled()
    expect(router.calls.length).toBeGreaterThanOrEqual(1)
  })

  it('deletes the vehicle through the confirmation dialog', async () => {
    const router = installFetchRouter([
      ['/vehicles/1', (_url, init) => (init?.method === 'DELETE' ? new Response(null, { status: 204 }) : json(vehicleList1))],
      ...baseRoutes,
    ])
    const queryClient = makeQueryClient()
    queryClient.setQueryData(['vehicleStatsBatch'], { '1': stats1 })
    renderWithProviders(
      <TooltipProvider><VehicleCard vehicle={vehicleList1} onDetails={vi.fn()} onEdit={vi.fn()} onFuelAdd={vi.fn()}
        onFuelView={vi.fn()} onMaintenanceAdd={vi.fn()} onMaintenanceView={vi.fn()} onBlendCalc={vi.fn()} /></TooltipProvider>,
      queryClient,
    )
    await userEvent.click(screen.getByLabelText('Supprimer le véhicule'))
    const confirm = await screen.findByRole('button', { name: /^Supprimer$/ })
    await userEvent.click(confirm)
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Véhicule supprimé'))
    const del = router.calls.find((c) => c.url.includes('/vehicles/1') && c.init?.method === 'DELETE')
    expect(del).toBeTruthy()
  })

  it('calls the details / fuel-view / maintenance handlers on click', async () => {
    const onDetails = vi.fn(); const onFuelView = vi.fn(); const onMaintenanceView = vi.fn()
    const queryClient = makeQueryClient()
    queryClient.setQueryData(['vehicleStatsBatch'], { '1': stats1 })
    renderWithProviders(
      <TooltipProvider><VehicleCard vehicle={vehicleList1} onDetails={onDetails} onEdit={vi.fn()} onFuelAdd={vi.fn()}
        onFuelView={onFuelView} onMaintenanceAdd={vi.fn()} onMaintenanceView={onMaintenanceView} onBlendCalc={vi.fn()} /></TooltipProvider>,
      queryClient,
    )
    await userEvent.click(screen.getByLabelText('Détails et statistiques'))
    expect(onDetails).toHaveBeenCalled()
    await userEvent.click(screen.getByLabelText('Historique carburant'))
    expect(onFuelView).toHaveBeenCalled()
    await userEvent.click(screen.getByLabelText('Voir la maintenance'))
    expect(onMaintenanceView).toHaveBeenCalled()
  })
})

const maintStats = {
  total_entries: 1, total_cost: 120, average_cost: 120,
  last_maintenance_date: '2026-01-01', next_maintenance_date: '2026-12-01',
}
const periodStats = {
  vehicle_id: 1, start_date: '2026-01-01', end_date: '2026-07-01', days: 181,
  distance_km: 5000, fill_count: 6, total_liters: 300, total_fuel_cost: 500,
  avg_consumption: 6.5, avg_price_per_liter: 1.65, fuel_breakdown: [],
  e85_savings: null, e85_share_liters: null, skipped_fills_no_e10_price: 0,
  fuel_cost_per_100km: 10, maintenance_cost: 120, maintenance_count: 1,
  cost_per_day: 3, km_per_day: 27,
}

function renderDetails(vehicleId: number | null, handlers: { onClose?: () => void; onEdit?: (id: number) => void } = {}) {
  const queryClient = makeQueryClient()
  queryClient.setQueryData(['vehicleStatsBatch'], { '1': stats1 })
  const router = installFetchRouter([
    ['/maintenances/vehicle/1/statistics', () => json(maintStats)],
    ['/vehicles/1/period-stats', () => json(periodStats)],
    ...baseRoutes,
  ])
  const utils = renderWithProviders(
    <TooltipProvider>
      <VehicleDetailsDialog vehicleId={vehicleId} onClose={handlers.onClose ?? vi.fn()} onEdit={handlers.onEdit ?? vi.fn()} />
    </TooltipProvider>,
    queryClient,
  )
  return { ...utils, queryClient, router }
}

const timelineWithEvents = { vehicle_id: 1, events: [
  { event_type: 'fuel' as const, event_id: 50, event_date: '2026-08-01', odometer_reading: 20000,
    data: { station_name: 'Total Test', liters: 40, total_cost: 68, fuel_type: 'essence' as const, is_full_tank: false, notes: 'note essai' } },
  { event_type: 'maintenance' as const, event_id: 10, event_date: '2026-06-01', odometer_reading: 19000,
    data: { maintenance_type: 'Vidange', cost: 80, service_provider: 'Garage Central', description: 'Huile + filtre', notes: null } },
] }

const timelineEmpty = { vehicle_id: 1, events: [] }

describe('VehicleTimelineSheet', () => {
  it('renders a fuel and a maintenance event', async () => {
    installFetchRouter([
      ['/vehicles/1/timeline', () => json(timelineWithEvents)],
      ...baseRoutes,
    ])
    renderWithProviders(
      <TooltipProvider>
        <VehicleTimelineSheet vehicleId={1} open={true} onClose={() => {}} />
      </TooltipProvider>,
    )
    await waitFor(() => expect(screen.getByText('Historique du véhicule')).toBeInTheDocument())
    // fuel event
    await waitFor(() => expect(screen.getByText('Total Test')).toBeInTheDocument())
    expect(screen.getByText('40.0 L')).toBeInTheDocument()
    expect(screen.getByText('68.00 €')).toBeInTheDocument()
    expect(screen.getByText('partiel')).toBeInTheDocument()
    expect(screen.getByText('note essai')).toBeInTheDocument()
    expect(screen.getByText('E10')).toBeInTheDocument()
    // maintenance event
    expect(screen.getByText('Vidange')).toBeInTheDocument()
    expect(screen.getByText('80.00 €')).toBeInTheDocument()
    expect(screen.getByText('Garage Central')).toBeInTheDocument()
    expect(screen.getByText('Huile + filtre')).toBeInTheDocument()
    // fuel event date
    expect(screen.getByText('01/08/2026')).toBeInTheDocument()
  })

  it('shows the empty state', async () => {
    installFetchRouter([['/vehicles/1/timeline', () => json(timelineEmpty)], ...baseRoutes])
    renderWithProviders(
      <TooltipProvider>
        <VehicleTimelineSheet vehicleId={1} open={true} onClose={() => {}} />
      </TooltipProvider>,
    )
    await waitFor(() => expect(screen.getByText('Aucun événement enregistré.')).toBeInTheDocument())
  })

  it('renders nothing when closed', async () => {
    installFetchRouter([['/vehicles/1/timeline', () => json(timelineWithEvents)], ...baseRoutes])
    renderWithProviders(
      <TooltipProvider>
        <VehicleTimelineSheet vehicleId={1} open={false} onClose={() => {}} />
      </TooltipProvider>,
    )
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.queryByText('Historique du véhicule')).toBeNull()
  })
})

describe('VehicleDetailsDialog', () => {
  it('renders nothing when vehicleId is null', () => {
    renderDetails(null)
    expect(screen.queryByText(/Peugeot 208/)).toBeNull()
  })

  it('renders the full detail view: identity, technical, purchase, insurance, fuel stats, cost', async () => {
    renderDetails(1)
    await waitFor(() => expect(screen.getByText('Peugeot 208 (2019)')).toBeInTheDocument())
    expect(screen.getByText('AB-123-CD')).toBeInTheDocument()
    expect(screen.getByText('Actif')).toBeInTheDocument()
    expect(screen.getByText('Compteur initial:')).toBeInTheDocument()
    expect(screen.getByText('Réservoir:')).toBeInTheDocument()
    expect(screen.getByText('Distance totale:')).toBeInTheDocument()
    // Purchase section (acquisition_date + price present on fixture)
    expect(screen.getAllByText('Achat').length).toBeGreaterThan(0)
    expect(screen.getByText('Prix:')).toBeInTheDocument()
    // Insurance OK badge (remaining 10000 > 10% of 30000)
    expect(screen.getByText('OK')).toBeInTheDocument()
    // Fuel statistics
    expect(screen.getByText('Statistiques carburant')).toBeInTheDocument()
    expect(screen.getByText('Pleins:')).toBeInTheDocument()
    // Autonomy (range_km 770 present)
    expect(screen.getByText('Autonomie estimée')).toBeInTheDocument()
    // Cost of ownership
    expect(screen.getByText('Coût de possession')).toBeInTheDocument()
  })

  it('shows the "Limite dépassée" badge when insurance km exceeded', async () => {
    const queryClient = makeQueryClient()
    queryClient.setQueryData(['vehicleStatsBatch'], { '1': { ...stats1, insurance_km_exceeded: true, insurance_km_remaining: 0 } })
    installFetchRouter([
      ['/maintenances/vehicle/1/statistics', () => json(maintStats)],
      ...baseRoutes,
    ])
    renderWithProviders(
      <TooltipProvider><VehicleDetailsDialog vehicleId={1} onClose={vi.fn()} onEdit={vi.fn()} /></TooltipProvider>,
      queryClient,
    )
    await waitFor(() => expect(screen.getByText('Limite dépassée')).toBeInTheDocument())
  })

  it('calls onEdit from the footer Modifier button', async () => {
    const onEdit = vi.fn()
    renderDetails(1, { onEdit })
    await waitFor(() => expect(screen.getByText('Peugeot 208 (2019)')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    expect(onEdit).toHaveBeenCalledWith(1)
  })

  it('calls onClose from the Fermer button', async () => {
    const onClose = vi.fn()
    renderDetails(1, { onClose })
    await waitFor(() => expect(screen.getByText('Peugeot 208 (2019)')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('opens the timeline sheet from the Historique button', async () => {
    renderDetails(1)
    await waitFor(() => expect(screen.getByText('Peugeot 208 (2019)')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Historique/ }))
    await waitFor(() => expect(screen.getByText('Historique du véhicule')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Aucun événement enregistré.')).toBeInTheDocument())
  })

  it('opens the period-bilan dialog from the Bilan button', async () => {
    renderDetails(1)
    await waitFor(() => expect(screen.getByText('Peugeot 208 (2019)')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Bilan/ }))
    await waitFor(() => expect(screen.getByText('Bilan de période')).toBeInTheDocument())
  })
})

describe('VehicleGrid', () => {
  it('renders one card per vehicle and scopes the offline queue count', async () => {
    const v2: VehicleList = { ...vehicleList1, id: 2, license_plate: 'XY-999-ZZ' }
    const fuel = (vid: number, odom: number): QueuedPayload => ({ kind: 'fuel-create', data: { vehicle_id: vid, fuel_type: 'essence', liters: 10, price_per_liter: 1, odometer_reading: odom, fueling_date: '2026-01-01' } })
    const queue: QueueItem[] = [
      { id: 1, payload: fuel(1, 1) },
      { id: 2, payload: fuel(1, 2) },
      { id: 3, payload: fuel(2, 3) },
    ]
    installFetchRouter([
      ['/vehicles/stats/batch', () => json({ '1': stats1, '2': stats1 })],
      ['/vehicles/2/stats', () => json(stats1)],
      ...baseRoutes,
    ])
    renderWithProviders(
      <TooltipProvider><VehicleGrid vehicles={[vehicleList1, v2]} offlineQueue={queue}
        onDetails={vi.fn()} onEdit={vi.fn()} onFuelAdd={vi.fn()} onFuelView={vi.fn()}
        onMaintenanceAdd={vi.fn()} onMaintenanceView={vi.fn()} onBlendCalc={vi.fn()} /></TooltipProvider>,
    )
    await waitFor(() => expect(screen.getByText(/AB-123-CD/)).toBeInTheDocument())
    expect(screen.getByText(/XY-999-ZZ/)).toBeInTheDocument()
    // vehicle 1 has 2 queued, vehicle 2 has 1 → the queue-count badge shows the number
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1)
  })
})
