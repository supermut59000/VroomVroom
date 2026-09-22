import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/providers'
import { installFetchRouter, baseRoutes, vehicleFull1, conversion1, entry1, entry2, latestEntry1, maintenance1 } from '@/test/fixtures'
import { ConsumptionChart } from '@/components/charts/ConsumptionChart'
import { MonthlyCostChart } from '@/components/charts/MonthlyCostChart'
import { PriceChart } from '@/components/charts/PriceChart'
import { DistanceChart } from '@/components/charts/DistanceChart'
import { OdometerChart } from '@/components/charts/OdometerChart'
import { EthanolHistoryChart } from '@/components/charts/EthanolHistoryChart'
import { FuelTypeHistoryChart } from '@/components/charts/FuelTypeHistoryChart'
import { RangeChart } from '@/components/charts/RangeChart'
import type {
  ConsumptionDataPoint,
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

  it('FuelTypeHistoryChart: empty entries render nothing', () => {
    const { container } = render(<FuelTypeHistoryChart entries={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('FuelTypeHistoryChart: renders stacked bars and the per-fuel share', () => {
    const e85Entry = { ...entry1, id: 51, fuel_type: 'e85' as const, liters: 30, fueling_date: '2026-08-05' }
    const { container } = render(<FuelTypeHistoryChart entries={[entry2, e85Entry, entry1]} />)
    expect(screen.getByText('Carburants versés (L / mois)')).toBeInTheDocument()
    // 30 L e85 + 78 L essence = 108 L → 28 % / 72 %
    expect(screen.getByText(/E85 : 30 L \(28 %\)/)).toBeInTheDocument()
    expect(screen.getByText(/E10 : 78 L \(72 %\)/)).toBeInTheDocument()
    expect(svg(container)).not.toBeNull()
  })

  it('RangeChart: missing tank capacity → setup message, no chart', () => {
    const { container } = render(
      <RangeChart dataPoints={[point('2026-06-01', 6.0, 700, 42)]} tankCapacity={null} />,
    )
    expect(screen.getByText(/Renseignez la capacité du réservoir/)).toBeInTheDocument()
    expect(svg(container)).toBeNull()
  })

  it('RangeChart: renders the range line and the average', () => {
    const { container } = render(
      <RangeChart
        dataPoints={[point('2026-06-01', 6.0, 700, 42), point('2026-07-01', 7.0, 300, 21)]}
        tankCapacity={50}
      />,
    )
    expect(screen.getByText('Autonomie (km)')).toBeInTheDocument()
    // 50×100/6 = 833 km, 50×100/7 ≈ 714 km → moyenne 774 km
    expect(screen.getByText(/Moyenne : 774 km/)).toBeInTheDocument()
    expect(svg(container)).not.toBeNull()
  })
})

describe('MonthlyCostChart', () => {
  const mEntry = (date: string, cost: number, odom: number) =>
    ({ ...latestEntry1, fueling_date: date, total_cost: cost, odometer_reading: odom, liters: cost / 1.7 })

  it('renders nothing when there are no entries at all', () => {
    const { container } = render(<MonthlyCostChart entries={[]} maintenances={[]} />)
    expect(container.querySelector('svg.recharts-surface')).toBeNull()
    expect(screen.queryByText('Coûts mensuels')).toBeNull()
  })

  it('renders monthly bars and the average in euros mode', () => {
    const { container } = render(
      <MonthlyCostChart
        entries={[mEntry('2026-04-01', 60, 10000), mEntry('2026-05-01', 80, 11000), mEntry('2026-06-01', 40, 12000)]}
        maintenances={[]}
      />,
    )
    expect(screen.getByText('Coûts mensuels')).toBeInTheDocument()
    expect(svg(container)).not.toBeNull()
    expect(screen.getByText(/Moyenne : [\d.,]+ €/)).toBeInTheDocument()
  })

  it('switches to €/100km mode and re-titles', async () => {
    const { container } = render(
      <MonthlyCostChart
        entries={[mEntry('2026-04-01', 60, 10000), mEntry('2026-05-01', 80, 11000), mEntry('2026-06-01', 40, 12000)]}
        maintenances={[]}
      />,
    )
    await userEvent.click(screen.getByText('€ / 100km'))
    expect(screen.getByText('Coût / 100km')).toBeInTheDocument()
    expect(svg(container)).not.toBeNull()
    expect(screen.getByText(/Moyenne : [\d.,]+ €\/100km/)).toBeInTheDocument()
  })

  it('includes spread maintenance costs in the bars', () => {
    const { container } = render(
      <MonthlyCostChart
        entries={[mEntry('2026-04-01', 60, 10000), mEntry('2026-05-01', 80, 11000), mEntry('2026-06-01', 40, 12000)]}
        maintenances={[maintenance1]}
      />,
    )
    expect(svg(container)).not.toBeNull()
  })
})
