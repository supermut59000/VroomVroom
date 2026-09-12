import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import { loadQueue, QUEUE_KEY } from '@/lib/offline'
import type { QueueItem, QueuedPayload } from '@/lib/offline'
import { renderWithProviders } from '@/test/providers'
import { useOffline } from '@/hooks/use-offline'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    message: vi.fn(),
  },
}))
import { toast } from 'sonner'

const fuelCreate = (over: Record<string, unknown> = {}): QueuedPayload => ({
  kind: 'fuel-create',
  data: {
    vehicle_id: 1,
    fuel_type: 'essence',
    liters: 40,
    price_per_liter: 1.75,
    odometer_reading: 10000,
    fueling_date: '2026-08-20',
    station_name: 'Station Test',
    ...over,
  },
})

// unknown[] on purpose: the migration tests seed legacy/malformed shapes.
function seedQueue(items: unknown[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items))
}

function queuedInStorage(): QueueItem[] {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
}

function setOnline(online: boolean) {
  // The provider reads bare `navigator` (globalThis), which the setup pins to
  // jsdom's — redefine onLine there, not on window.navigator.
  Object.defineProperty(globalThis.navigator, 'onLine', { value: online, configurable: true })
}

function mockFetchOk() {
  return vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ id: 99 }), { status: 201, headers: { 'Content-Type': 'application/json' } }),
  )
}

function CaptureAdd({ onAdd }: { onAdd: (f: (p: QueuedPayload) => void) => void }) {
  const { addToQueue } = useOffline()
  onAdd(addToQueue)
  return null
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// loadQueue — the reported bug: a queue stored in the CURRENT format
// ({id, payload}) was read as legacy ({id, data}) → TypeError → catch → []
// → the empty queue was written back over the user's queued fills.
// ---------------------------------------------------------------------------

describe('loadQueue (persistence across refresh)', () => {
  it('keeps current-format items ({id, payload}) on reload — the 2026-08 outage regression', () => {
    seedQueue([
      { id: 1, payload: fuelCreate({ client_request_id: 'seed-1' }) },
      { id: 2, payload: fuelCreate({ client_request_id: 'seed-2', liters: 30, odometer_reading: 10400 }) },
    ])
    const loaded = loadQueue()
    expect(loaded).toHaveLength(2)
    expect(loaded[0].payload).toEqual(fuelCreate({ client_request_id: 'seed-1' }))
    expect(loaded[1].payload).toMatchObject({ kind: 'fuel-create', data: { liters: 30 } })
  })

  it('keeps fuel-update / maintenance payloads untouched on reload', () => {
    seedQueue([
      { id: 1, payload: { kind: 'fuel-update', id: 42, vehicleId: 1, data: { liters: 35 } } },
      { id: 2, payload: { kind: 'maintenance-create', data: { vehicle_id: 1, maintenance_type: 'vidange', maintenance_date: '2026-08-01', cost: 80, odometer_reading: 10000 } } },
    ])
    const loaded = loadQueue()
    expect(loaded.map((i) => i.payload.kind)).toEqual(['fuel-update', 'maintenance-create'])
  })

  it('migrates legacy pre-discriminated items ({id, data}) to fuel-create', () => {
    seedQueue([{ id: 1, data: { vehicle_id: 1, liters: 40 } }])
    const loaded = loadQueue()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].payload.kind).toBe('fuel-create')
    expect(loaded[0].payload.data).toMatchObject({ vehicle_id: 1, liters: 40 })
    const data = loaded[0].payload.data as { client_request_id?: string }
    expect(typeof data.client_request_id).toBe('string')
  })

  it('assigns a client_request_id to legacy fuel-creates (idempotency) and keeps existing ones', () => {
    seedQueue([
      { id: 1, data: { vehicle_id: 1, liters: 40 } },
      { id: 2, payload: { kind: 'fuel-create', data: { vehicle_id: 1, liters: 20, client_request_id: 'fixed-uuid' } } },
    ])
    const loaded = loadQueue()
    expect(loaded[0].payload.kind).toBe('fuel-create')
    expect((loaded[0].payload.data as { client_request_id?: string }).client_request_id).not.toBe('fixed-uuid')
    expect(loaded[1].payload.kind).toBe('fuel-create')
    expect((loaded[1].payload.data as { client_request_id?: string }).client_request_id).toBe('fixed-uuid')
  })

  it('a corrupt item does not wipe the rest of the queue', () => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify([
      { id: 1, payload: fuelCreate() },
      { id: 'not-a-number', payload: 'garbage' },
      { id: 3, payload: { kind: 'fuel-create', data: null } },
      { id: 4, payload: fuelCreate({ liters: 10 }) },
    ]))
    const loaded = loadQueue()
    expect(loaded).toHaveLength(2)
    expect(loaded.map((i) => i.id)).toEqual([1, 4])
  })

  it('unparseable storage returns an empty queue without throwing', () => {
    localStorage.setItem(QUEUE_KEY, '{not json')
    expect(loadQueue()).toEqual([])
  })

  it('non-array storage returns an empty queue without throwing', () => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify({ id: 1, payload: fuelCreate() }))
    expect(loadQueue()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// OfflineProvider — end-to-end lifecycle (queue → refresh → reconnect → sync)
// ---------------------------------------------------------------------------

describe('OfflineProvider lifecycle', () => {
  it('the exact outage scenario: 2 fills queued offline survive a refresh and sync when the server returns', async () => {
    // Server down — transport failure
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))

    let add!: (p: QueuedPayload) => void
    const { unmount } = renderWithProviders(<CaptureAdd onAdd={(f) => (add = f)} />)
    await act(async () => {
      add(fuelCreate({ client_request_id: 'req-1' }))
      add(fuelCreate({ client_request_id: 'req-2', liters: 30 }))
    })

    // The app persisted both fills (this is what the offline badge showed)
    expect(queuedInStorage()).toHaveLength(2)
    unmount() // ← server reboots, user refreshes the PWA

    // Server is back
    const up = mockFetchOk()
    vi.stubGlobal('fetch', up)

    renderWithProviders(<div />)
    await waitFor(() => expect(up).toHaveBeenCalledTimes(2))

    const posts = up.mock.calls.map((c) => c[0] as string)
    expect(posts).toHaveLength(2)
    for (const u of posts) {
      expect(u.startsWith('http://test.local/api/v1/fuel-entries/')).toBe(true)
    }
    const bodies = up.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string))
    expect(bodies.map((b) => b.client_request_id).sort()).toEqual(['req-1', 'req-2'])

    await waitFor(() => expect(queuedInStorage()).toHaveLength(0))
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('synchronisé'))
  })

  it('retries the same client_request_id after a refresh (idempotent, no duplicate fill)', async () => {
    seedQueue([{ id: 1, payload: fuelCreate({ client_request_id: 'same-uuid' }) }])
    const up = mockFetchOk()
    vi.stubGlobal('fetch', up)
    renderWithProviders(<div />)

    await waitFor(() => expect(queuedInStorage()).toHaveLength(0))
    const body = JSON.parse((up.mock.calls[0][1] as RequestInit).body as string)
    expect(body.client_request_id).toBe('same-uuid')
  })

  it('does not attempt a sync while offline — the queue stays intact', async () => {
    setOnline(false)
    seedQueue([{ id: 1, payload: fuelCreate() }])
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
    renderWithProviders(<div />)
    await new Promise((r) => setTimeout(r, 50))
    expect(queuedInStorage()).toHaveLength(1)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('syncs when the browser reconnects (online event) after a server outage', async () => {
    setOnline(false)
    seedQueue([{ id: 1, payload: fuelCreate({ client_request_id: 're-1' }) }])
    renderWithProviders(<div />)
    await new Promise((r) => setTimeout(r, 50))
    expect(queuedInStorage()).toHaveLength(1)

    const up = mockFetchOk()
    vi.stubGlobal('fetch', up)
    act(() => {
      setOnline(true)
      window.dispatchEvent(new Event('online'))
    })

    await waitFor(() => expect(up).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(queuedInStorage()).toHaveLength(0))
  })

  it('a permanently rejected fill (400) is dropped with an error toast; the good fill still syncs', async () => {
    seedQueue([
      { id: 1, payload: fuelCreate({ client_request_id: 'bad-1', odometer_reading: 100 }) },
      { id: 2, payload: fuelCreate({ client_request_id: 'ok-1', odometer_reading: 10000 }) },
    ])
    let calls = 0
    const fetchSpy = vi.fn(async () => {
      calls += 1
      const status = calls === 1 ? 400 : 201
      return new Response(
        JSON.stringify(status === 400 ? { detail: 'Compteur inférieur au minimum' } : { id: 99 }),
        { status, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchSpy)
    renderWithProviders(<div />)

    await waitFor(() => expect(queuedInStorage()).toHaveLength(0))
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Plein rejeté'), expect.anything())
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('1 élément synchronisé'))
  })

  it('keeps transient failures (500) in the queue and escalates a toast after 3 failed rounds', async () => {
    vi.useFakeTimers()
    seedQueue([{ id: 1, payload: fuelCreate() }])
    const fetchSpy = vi.fn(async () => new Response('oops', { status: 500 }))
    vi.stubGlobal('fetch', fetchSpy)
    renderWithProviders(<div />)

    // Round 1: initial recovery sync
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(toast.error).not.toHaveBeenCalled()

    // Round 2: 60 s retry delay
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    // Round 3: escalation
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('vérifiez le serveur ou la clé API'),
      expect.anything(),
    )
    expect(queuedInStorage()).toHaveLength(1) // still waiting, not lost
  })
})
