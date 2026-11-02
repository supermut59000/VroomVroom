import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, makeQueryClient } from '@/test/providers'
import { db } from '@/lib/local/db'
import * as svc from '@/lib/local/services'
import { saveModeConfig } from '@/lib/local/config'
import { useVehicleStats } from './use-vehicles'
import { useCreateFuelEntry } from './use-fuel-entries'

// Regression: the vehicle card reads its stats through useVehicleStats,
// which snapshots the batch as initialData while the per-vehicle query is
// disabled (N+1 guard). Fuel mutations invalidated only per-vehicle keys,
// so the batch went stale and the card stuck at "Pleins: 0" (visible on the
// Android WebView, where focus refetches don't fire).
function Probe() {
  const { data: stats } = useVehicleStats(1)
  const create = useCreateFuelEntry()
  return (
    <div>
      <span data-testid="fills">{stats ? stats.total_fuel_entries : 'loading'}</span>
      <button
        data-testid="add"
        onClick={() =>
          create.mutate({
            vehicle_id: 1,
            fuel_type: 'essence',
            liters: 40,
            price_per_liter: 1.6,
            odometer_reading: 10400,
            fueling_date: '2026-01-02',
            is_full_tank: true,
          })
        }
      >
        add fill
      </button>
    </div>
  )
}

beforeEach(async () => {
  await db.clearAll()
  saveModeConfig({ mode: 'local' })
})

describe('vehicleStatsBatch invalidation', () => {
  it('card stats (batch) update after a fuel entry is created', async () => {
    await svc.createVehicle({
      brand: 'Peugeot',
      model: '208',
      year: 2026,
      license_plate: 'AB-123-CD',
      fuel_type: 'essence',
      initial_odometer: 10000,
      tank_capacity: 50,
    })
    renderWithProviders(<Probe />, makeQueryClient())
    await waitFor(() => expect(screen.getByTestId('fills').textContent).toBe('0'))
    await userEvent.click(screen.getByTestId('add'))
    await waitFor(() => expect(screen.getByTestId('fills').textContent).toBe('1'))
  })
})
