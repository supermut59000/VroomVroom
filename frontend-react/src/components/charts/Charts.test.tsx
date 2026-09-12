import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/test/providers'
import { installFetchRouter, baseRoutes, vehicleFull1, conversion1, entry1, entry2 } from '@/test/fixtures'
import { ConsumptionChart } from '@/components/charts/ConsumptionChart'
import { PriceChart } from '@/components/charts/PriceChart'
import { DistanceChart } from '@/components/charts/DistanceChart'
import { OdometerChart } from '@/components/charts/OdometerChart'
import { EthanolHistoryChart } from '@/components/charts/EthanolHistoryChart'
import { RefuelingPatternChart } from '@/components/charts/RefuelingPatternChart'
import { FlexfuelRentabilityChart } from '@/components/charts/FlexfuelRentabilityChart'
import type {
  ConsumptionDataPoint,
  FlexfuelRentabilitySummary,
  Vehicle,
} from '@/types'

beforeEach(() => {
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true })
})

const point = (date: string, consumption: number, distance: number, liters: number): ConsumptionDataPoint => ({
  date,
  consumption,
  odometer_reading: 20000,
  liters,
  distance,
  is_full_tank: true,
  e85_fraction: 0,
})

const svg = (c: ParentNode) => c.querySelector('svg.recharts-surface')

describe('Charts', () => {
  it('ConsumptionChart: fewer than 2 points → "pas assez de données" card', () => {
    const { container } = render(<ConsumptionChart dataPoints={[point('2026-06-01', 6.5, 700, 45)]} />)
    expect(screen.getByText('Consommation (L/100km)')).toBeInTheDocument()
    expect(
      screen.getByText(/Pas assez de données \(minimum 2 pleins complets/),
    ).toBeInTheDocument()
    expect(svg(container)).toBeNull()
  })

  it('ConsumptionChart: renders the line and the weighted average subtitle', () => {
    const { container } = render(
      <ConsumptionChart
        dataPoints={[
          point('2026-06-01', 6.0, 700, 42),
          point('2026-07-01', 7.0, 300, 21),
        ]}
      />,
    )
    expect(svg(container)).not.toBeNull()
    // distance-weighted: (6×700 + 7×300) / 1000 = 6.30
    expect(screen.getByText(/Moyenne : 6\.30 L\/100km/)).toBeInTheDocument()
  })

  it('PriceChart: fewer than 2 entries → "pas assez de données"', () => {
    const { container } = render(<PriceChart entries={[entry1]} />)
    expect(screen.getByText('Prix du carburant (€/L)')).toBeInTheDocument()
    expect(screen.getByText('Pas assez de données')).toBeInTheDocument()
    expect(svg(container)).toBeNull()
  })

  it('PriceChart: renders a price line for several entries', () => {
    const { container } = render(<PriceChart entries={[entry2, entry1]} />)
    expect(svg(container)).not.toBeNull()
  })

  it('DistanceChart: empty entries render nothing', () => {
    const { container } = render(<DistanceChart entries={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('DistanceChart: renders monthly bars from entries', () => {
    const { container } = render(<DistanceChart entries={[entry2, entry1]} />)
    expect(screen.getByText('Distance mensuelle')).toBeInTheDocument()
    expect(svg(container)).not.toBeNull()
  })

  it('OdometerChart: renders progression toward the insurance km limit', async () => {
    installFetchRouter(baseRoutes)
    const { container } = renderWithProviders(
      <OdometerChart vehicle={vehicleFull1} entries={[entry2, entry1]} />,
    )
    // title + svg arrive after the vehicle stats query resolves
    expect(await screen.findByText('Progression kilométrique')).toBeInTheDocument()
    await waitFor(() => expect(svg(container)).not.toBeNull())
  })

  it('EthanolHistoryChart: missing tank capacity → setup message, no chart', () => {
    const noTank = { ...vehicleFull1, tank_capacity: null } as Vehicle
    const { container } = render(
      <EthanolHistoryChart conversion={conversion1} vehicle={noTank} entries={[entry1, entry2]} />,
    )
    expect(screen.getByText(/Renseignez la capacité du réservoir/)).toBeInTheDocument()
    expect(svg(container)).toBeNull()
  })

  it('EthanolHistoryChart: renders the tank-ethanol line from fills', () => {
    const { container } = render(
      <EthanolHistoryChart conversion={conversion1} vehicle={vehicleFull1} entries={[entry2, entry1]} />,
    )
    expect(screen.getByText('Taux éthanol dans le réservoir')).toBeInTheDocument()
    expect(svg(container)).not.toBeNull()
  })

  it('RefuelingPatternChart: empty entries render nothing', () => {
    const { container } = render(<RefuelingPatternChart entries={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('RefuelingPatternChart: renders habit cards from entries', () => {
    render(<RefuelingPatternChart entries={[entry2, entry1]} />)
    expect(screen.getByText('Habitudes de ravitaillement')).toBeInTheDocument()
  })

  const rentability = (points: FlexfuelRentabilitySummary['data_points']): FlexfuelRentabilitySummary => ({
    vehicle_id: 1,
    kit_cost: 850,
    overconsumption_pct: 20,
    conversion_date: '2024-03-15',
    total_e85_fills: points.length,
    total_savings: points[points.length - 1]?.cumulative_savings ?? 0,
    break_even_reached: (points[points.length - 1]?.cumulative_savings ?? 0) >= 850,
    break_even_date: null,
    monthly_average_savings: 100,
    skipped_fills_no_e10_price: 0,
    data_points: points,
    monthly_savings: [],
  })

  it('FlexfuelRentabilityChart: no E85 fills → explanatory empty state', () => {
    const { container } = render(<FlexfuelRentabilityChart data={rentability([])} />)
    expect(screen.getByText(/Aucun plein E85 enregistré depuis la conversion/)).toBeInTheDocument()
    expect(svg(container)).toBeNull()
  })

  it('FlexfuelRentabilityChart: renders cumulative savings line with data', () => {
    const { container } = render(
      <FlexfuelRentabilityChart
        data={rentability([
          {
            date: '2024-06-01',
            e85_liters: 40,
            e85_cost: 34,
            equivalent_e10_liters: 48,
            e10_reference_price: 1.65,
            e10_equivalent_cost: 79.2,
            savings: 45.2,
            cumulative_savings: 45.2,
          },
          {
            date: '2024-08-01',
            e85_liters: 40,
            e85_cost: 34,
            equivalent_e10_liters: 48,
            e10_reference_price: 1.65,
            e10_equivalent_cost: 79.2,
            savings: 45.2,
            cumulative_savings: 90.4,
          },
        ])}
      />,
    )
    expect(svg(container)).not.toBeNull()
  })
})
