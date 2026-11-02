import { ApiError } from './api-error'
import { loadModeConfig } from './local/config'
import { localRequest } from './local/local-api'

export { ApiError }

type Api = {
  get<T>(path: string): Promise<T>
  post<T>(path: string, body: unknown): Promise<T>
  put<T>(path: string, body: unknown): Promise<T>
  delete<T = void>(path: string): Promise<T>
}

// The mode (local | server) is read per request: it can be saved at first
// launch (ModeSetup) AFTER this module has loaded.
function getApiUrl(cfg: ReturnType<typeof loadModeConfig> = loadModeConfig()): string {
  // Server mode: the URL pasted at setup wins.
  if (cfg?.mode === 'server' && cfg.serverUrl) {
    return cfg.serverUrl
  }
  // Allow override via env variable
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }

  const hostname = window.location.hostname
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8055/api/v1'
  }
  if (hostname === 'carmanagement.home.ouiouibaguette.fr') {
    return 'https://carmanagementapi.home.ouiouibaguette.fr/api/v1'
  }
  return 'http://localhost:8055/api/v1'
}

export const API_URL = getApiUrl()

const REQUEST_TIMEOUT_MS = 15_000

function getHeaders(withBody = false, cfg: ReturnType<typeof loadModeConfig> = loadModeConfig()): Record<string, string> {
  const headers: Record<string, string> = {}
  if (withBody) headers['Content-Type'] = 'application/json'
  // Runtime key (server mode, pasted at setup) wins over the build-time one.
  const apiKey = cfg?.apiKey || import.meta.env.VITE_API_KEY
  if (apiKey) headers['X-API-Key'] = apiKey
  return headers
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Erreur ${response.status}`
    try {
      const body = await response.json()
      message = body.detail || message
    } catch {
      // ignore parse errors
    }
    throw new ApiError(response.status, message)
  }
  if (response.status === 204) return undefined as T
  return response.json()
}

function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timeoutId),
  )
}

function remoteCall<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const cfg = loadModeConfig()
  const url = `${getApiUrl(cfg).replace(/\/$/, '')}${path}`
  const options: RequestInit = { method }
  options.headers = getHeaders(body !== undefined, cfg)
  if (body !== undefined) options.body = JSON.stringify(body)
  return fetchWithTimeout(url, options).then((r) => handleResponse<T>(r))
}

/** Same interface in both modes — the hooks don't know which one is active. */
export const api: Api = {
  get<T>(path: string) {
    return loadModeConfig()?.mode === 'local'
      ? localRequest<T>('GET', path)
      : remoteCall<T>('GET', path)
  },
  post<T>(path: string, body: unknown) {
    return loadModeConfig()?.mode === 'local'
      ? localRequest<T>('POST', path, body)
      : remoteCall<T>('POST', path, body)
  },
  put<T>(path: string, body: unknown) {
    return loadModeConfig()?.mode === 'local'
      ? localRequest<T>('PUT', path, body)
      : remoteCall<T>('PUT', path, body)
  },
  delete<T = void>(path: string) {
    return loadModeConfig()?.mode === 'local'
      ? localRequest<T>('DELETE', path)
      : remoteCall<T>('DELETE', path)
  },
}
