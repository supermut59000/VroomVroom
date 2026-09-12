import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { api, ApiError, API_URL } from '@/lib/api'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.unstubAllEnvs()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('api client', () => {
  it('GET resolves parsed JSON from the configured base URL', async () => {
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse([{ id: 1 }]))
    vi.stubGlobal('fetch', fetchSpy)

    await expect(api.get('/vehicles/')).resolves.toEqual([{ id: 1 }])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe(`${API_URL}/vehicles/`)
    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(init.method).toBeUndefined()
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })

  it('POST sends a JSON body with Content-Type', async () => {
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ id: 7 }, 201))
    vi.stubGlobal('fetch', fetchSpy)

    await expect(api.post('/fuel-entries/', { liters: 40 })).resolves.toEqual({ id: 7 })
    const call = fetchSpy.mock.calls[0]
    const init = call[1] as RequestInit
    expect(call[0]).toBe(`${API_URL}/fuel-entries/`)
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ liters: 40 }))
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('PUT and DELETE send the right methods without a body', async () => {
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchSpy)

    await api.put('/vehicles/1', { brand: 'Peugeot' })
    await api.delete('/vehicles/1')

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe('PUT')
    expect((fetchSpy.mock.calls[1][1] as RequestInit).method).toBe('DELETE')
    expect((fetchSpy.mock.calls[1][1] as RequestInit).body).toBeUndefined()
  })

  it('non-2xx with a JSON detail throws ApiError with status and detail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ detail: 'Véhicule introuvable' }, 404)))

    const err = await api.get('/vehicles/999').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(404)
    expect((err as ApiError).message).toBe('Véhicule introuvable')
  })

  it('non-2xx with a non-JSON body falls back to "Erreur {status}"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Bad Gateway', { status: 502 })))

    const err = await api.get('/vehicles/').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(502)
    expect((err as ApiError).message).toBe('Erreur 502')
  })

  it('204 No Content resolves to undefined (soft delete pattern)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
    await expect(api.delete('/vehicles/1')).resolves.toBeUndefined()
  })

  it('sends the X-API-Key header only when VITE_API_KEY is set', async () => {
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse([]))
    vi.stubGlobal('fetch', fetchSpy)

    await api.get('/vehicles/')
    expect(((fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>)['X-API-Key']).toBeUndefined()

    vi.stubEnv('VITE_API_KEY', 'secret-key')
    await api.get('/vehicles/')
    expect(((fetchSpy.mock.calls[1][1] as RequestInit).headers as Record<string, string>)['X-API-Key']).toBe('secret-key')
  })

  it('aborts a hung request after the 15 s timeout with an AbortError', async () => {
    vi.useFakeTimers()
    const fetchSpy = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const pending = api.get('/vehicles/').catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(14_999)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1) // crosses the 15 s boundary
    const err = await pending
    expect(err).toBeInstanceOf(DOMException)
    expect((err as DOMException).name).toBe('AbortError')
  })

  it('transport failures (server down) propagate as-is, not as ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    const err = await api.get('/vehicles/').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TypeError)
    expect(err).not.toBeInstanceOf(ApiError)
  })
})
