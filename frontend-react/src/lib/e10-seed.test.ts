import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { db } from './local/db'
import { listE10Prices } from './local/services'
import { saveModeConfig } from './local/config'
import { seedE10BasePriceIfNeeded } from './e10-seed'

const mockFetch = (results: { e10_prix: number | null }[] | null) =>
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results }),
  })

describe('seedE10BasePriceIfNeeded (first-launch base E10 price)', () => {
  beforeEach(async () => {
    await db.clearAll()
    localStorage.clear()
    vi.unstubAllGlobals()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('seeds the cheapest Paris E10 price once, on first launch (local mode)', async () => {
    saveModeConfig({ mode: 'local' })
    vi.stubGlobal('fetch', mockFetch([
      { e10_prix: 1.85 }, { e10_prix: 1.72 }, { e10_prix: 1.91 }, { e10_prix: null },
    ]))
    expect(await seedE10BasePriceIfNeeded()).toBe(true)
    const prices = await listE10Prices()
    expect(prices).toHaveLength(1)
    expect(prices[0].price_per_liter).toBe(1.72)
    expect(prices[0].notes).toContain('Prix de base')
    // Second call: no duplicate
    expect(await seedE10BasePriceIfNeeded()).toBe(false)
    expect(await listE10Prices()).toHaveLength(1)
  })

  it('does nothing in server mode', async () => {
    saveModeConfig({ mode: 'server', serverUrl: 'https://example.com/api/v1' })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await seedE10BasePriceIfNeeded()).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does nothing when E10 prices already exist', async () => {
    saveModeConfig({ mode: 'local' })
    await db.put('e10_prices', {
      reference_date: '2026-11-01', price_per_liter: 1.8, notes: null, is_active: true,
    })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await seedE10BasePriceIfNeeded()).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('swallows offline/API failures (retried next launch)', async () => {
    saveModeConfig({ mode: 'local' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await seedE10BasePriceIfNeeded()).toBe(false)
    expect(await listE10Prices()).toHaveLength(0)
  })
})
