import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// sw.js is a classic worker script — execute it in a vm sandbox with a fake
// self/caches/fetch and drive the events by hand. No browser needed.
// (cwd is the frontend-react root when vitest runs)
const SW_SOURCE = readFileSync(path.resolve(process.cwd(), 'public/sw.js'), 'utf8')

const CACHE_NAME = 'vroomvroom-react-v1'
const DATA_CACHE = 'vroomvroom-data-v1'

interface Sandbox {
  skipWaiting: ReturnType<typeof vi.fn>
  clientsClaim: ReturnType<typeof vi.fn>
  cacheStorage: Map<string, Map<string, Response>>
  fetchMock: ReturnType<typeof vi.fn>
  dispatch: (type: string, ev: unknown) => void
}

type AnyRecord = Record<string, unknown>

function makeSandbox(opts: { fetchImpl?: (req: Request) => Promise<Response>; fastTimeout?: boolean } = {}): Sandbox {
  const cacheStorage = new Map<string, Map<string, Response>>()
  const fetchMock = vi.fn(
    opts.fetchImpl ?? (async () => new Response('net', { status: 200 })),
  )
  const handlers: Record<string, (ev: AnyRecord) => void> = {}
  const skipWaiting = vi.fn()
  const clientsClaim = vi.fn()

  const key = (r: string | Request): string => (typeof r === 'string' ? r : r.url)

  const openCache = (name: string) => {
    let c = cacheStorage.get(name)
    if (!c) {
      c = new Map()
      cacheStorage.set(name, c)
    }
    return {
      put: async (req: Request | string, res: Response) => {
        c!.set(key(req), res)
      },
      keys: async () => [...c!.keys()].map((k) => new Request(k)),
      delete: async (req: Request | string) => c!.delete(key(req)),
      match: async (req: Request | string) => c!.get(key(req)),
    }
  }

  const caches = {
    open: async (name: string) => openCache(name),
    keys: async () => [...cacheStorage.keys()],
    delete: async (name: string) => cacheStorage.delete(name),
    match: async (req: Request | string) => {
      for (const c of cacheStorage.values()) {
        const r = c.get(key(req))
        if (r) return r
      }
      return undefined
    },
  }

  const self: AnyRecord = {
    addEventListener: (type: string, fn: (ev: AnyRecord) => void) => {
      handlers[type] = fn
    },
    skipWaiting,
    clients: { claim: clientsClaim },
  }

  const sandbox: AnyRecord = {
    self,
    caches,
    fetch: fetchMock,
    URL,
    Response,
    Request,
    // Make the 4s API timeout fire immediately when the test opts in.
    setTimeout: opts.fastTimeout
      ? (fn: () => void, delay?: number) =>
          delay && delay >= 4000 ? queueMicrotask(fn) : setTimeout(fn, delay)
      : setTimeout,
    clearTimeout,
  }
  vm.createContext(sandbox)
  vm.runInContext(SW_SOURCE, sandbox)

  return {
    skipWaiting,
    clientsClaim,
    cacheStorage,
    fetchMock,
    dispatch: (type: string, ev: unknown) => handlers[type](ev as AnyRecord),
  }
}

/** Run a fetch event; resolves to the response the SW responded with. */
function runFetch(swb: Sandbox, request: Request, mode?: string): Promise<Response> {
  if (mode) Object.defineProperty(request, 'mode', { value: mode })
  let settled: Promise<Response> | undefined
  const ev = {
    request,
    respondWith: (p: Promise<Response>) => {
      settled = p
    },
  }
  swb.dispatch('fetch', ev)
  return settled ?? Promise.reject(new Error('respondWith not called'))
}

const apiRequest = (p = '/api/v1/vehicles/') =>
  new Request(`http://test.local${p}`, { method: 'GET' })

describe('sw.js install/activate', () => {
  it('install: skipWaiting is called (no waitUntil laggard)', () => {
    const swb = makeSandbox()
    swb.dispatch('install', {})
    expect(swb.skipWaiting).toHaveBeenCalledTimes(1)
  })

  it('activate: drops stale caches, keeps current ones, claims clients', async () => {
    const swb = makeSandbox()
    swb.cacheStorage.set('vroomvroom-react-v0', new Map())
    swb.cacheStorage.set('old-data-cache', new Map())
    swb.cacheStorage.set(CACHE_NAME, new Map())
    swb.cacheStorage.set(DATA_CACHE, new Map())

    let done: Promise<void> | undefined
    swb.dispatch('activate', {
      waitUntil: (p: Promise<void>) => {
        done = p
      },
    })
    await done

    expect(swb.cacheStorage.has('vroomvroom-react-v0')).toBe(false)
    expect(swb.cacheStorage.has('old-data-cache')).toBe(false)
    expect(swb.cacheStorage.has(CACHE_NAME)).toBe(true)
    expect(swb.cacheStorage.has(DATA_CACHE)).toBe(true)
    expect(swb.clientsClaim).toHaveBeenCalledTimes(1)
  })
})

describe('sw.js API fetches (network-first, 4s timeout)', () => {
  it('online: returns the network response and stores it in the data cache', async () => {
    const swb = makeSandbox()
    const res = await runFetch(swb, apiRequest())
    expect(await res.text()).toBe('net')
    expect(swb.fetchMock).toHaveBeenCalledTimes(1)
    const data = swb.cacheStorage.get(DATA_CACHE)
    expect(data?.has('http://test.local/api/v1/vehicles/')).toBe(true)
  })

  it('network timeout: falls back to the cached response', async () => {
    const swb = makeSandbox({
      fetchImpl: () => new Promise<Response>(() => {}), // hangs forever
      fastTimeout: true, // 4s race fires immediately
    })
    const cached = new Response('cached-data', { status: 200 })
    const req = apiRequest('/api/v1/fuel-entries/')
    swb.cacheStorage.set(DATA_CACHE, new Map([[req.url, cached]]))

    const res = await runFetch(swb, req)
    expect(await res.text()).toBe('cached-data')
  })

  it('offline with no cached data: 503 JSON { offline: true }', async () => {
    const swb = makeSandbox({
      fetchImpl: async () => {
        throw new TypeError('fetch failed')
      },
    })
    const res = await runFetch(swb, apiRequest('/api/v1/unknown/'))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ offline: true, error: 'No cached data' })
  })

  it('non-OK network response is not cached but still returned', async () => {
    const swb = makeSandbox({
      fetchImpl: async () => new Response('boom', { status: 500 }),
    })
    const res = await runFetch(swb, apiRequest('/api/v1/broken/'))
    expect(res.status).toBe(500)
    // non-OK → putBounded never runs → the data cache isn't even created
    const url = 'http://test.local/api/v1/broken/'
    expect(swb.cacheStorage.get(DATA_CACHE)?.get(url)).toBeUndefined()
  })

  it('data cache is bounded to 300 entries, dropping the oldest', async () => {
    const swb = makeSandbox()
    const data = new Map<string, Response>()
    for (let i = 1; i <= 300; i++) {
      data.set(`http://test.local/api/v1/old/${i}`, new Response(String(i), { status: 200 }))
    }
    swb.cacheStorage.set(DATA_CACHE, data)

    await runFetch(swb, apiRequest('/api/v1/fresh/'))
    // putBounded is fire-and-forget inside the worker — let its microtasks settle
    await new Promise((r) => setTimeout(r, 10))
    expect(data.size).toBe(300)
    expect(data.has('http://test.local/api/v1/old/1')).toBe(false) // oldest evicted
    expect(data.has('http://test.local/api/v1/old/300')).toBe(true)
    expect(data.has('http://test.local/api/v1/fresh/')).toBe(true)
  })
})

describe('sw.js asset/tile/navigation fetches', () => {
  it('hashed asset: cache-first, no network when cached', async () => {
    const swb = makeSandbox()
    const req = new Request('http://test.local/assets/app.abc123.js', { method: 'GET' })
    swb.cacheStorage.set(CACHE_NAME, new Map([[req.url, new Response('bundled', { status: 200 })]]))
    const res = await runFetch(swb, req)
    expect(await res.text()).toBe('bundled')
    expect(swb.fetchMock).not.toHaveBeenCalled()
  })

  it('map tile: served from cache when present', async () => {
    const swb = makeSandbox()
    const req = new Request('https://tile.openstreetmap.org/12/3240/1520.png', { method: 'GET' })
    swb.cacheStorage.set(CACHE_NAME, new Map([[req.url, new Response('tile', { status: 200 })]]))
    const res = await runFetch(swb, req)
    expect(await res.text()).toBe('tile')
    expect(swb.fetchMock).not.toHaveBeenCalled()
  })

  it('SPA navigation: network first, cached index.html fallback when offline', async () => {
    const swb = makeSandbox({
      fetchImpl: async () => {
        throw new TypeError('offline')
      },
    })
    swb.cacheStorage.set(CACHE_NAME, new Map([['/', new Response('<html>spa</html>', { status: 200 })]]))
    const res = await runFetch(swb, new Request('http://test.local/'), 'navigate')
    expect(await res.text()).toBe('<html>spa</html>')
  })

  it('POST requests are never intercepted', () => {
    const swb = makeSandbox()
    let responded = false
    swb.dispatch('fetch', {
      request: new Request('http://test.local/api/v1/fuel-entries/', { method: 'POST' }),
      respondWith: () => {
        responded = true
      },
    })
    expect(responded).toBe(false)
  })
})
