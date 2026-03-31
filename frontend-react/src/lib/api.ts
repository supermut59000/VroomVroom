function getApiUrl(): string {
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

function getHeaders(withBody = false): Record<string, string> {
  const headers: Record<string, string> = {}
  if (withBody) headers['Content-Type'] = 'application/json'
  const apiKey = import.meta.env.VITE_API_KEY
  if (apiKey) headers['X-API-Key'] = apiKey
  return headers
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
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

export const api = {
  get<T>(path: string): Promise<T> {
    return fetchWithTimeout(`${API_URL}${path}`, { headers: getHeaders() }).then((r) =>
      handleResponse<T>(r),
    )
  },

  post<T>(path: string, body: unknown): Promise<T> {
    return fetchWithTimeout(`${API_URL}${path}`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify(body),
    }).then((r) => handleResponse<T>(r))
  },

  put<T>(path: string, body: unknown): Promise<T> {
    return fetchWithTimeout(`${API_URL}${path}`, {
      method: 'PUT',
      headers: getHeaders(true),
      body: JSON.stringify(body),
    }).then((r) => handleResponse<T>(r))
  },

  delete<T = void>(path: string): Promise<T> {
    return fetchWithTimeout(`${API_URL}${path}`, {
      method: 'DELETE',
      headers: getHeaders(),
    }).then((r) => handleResponse<T>(r))
  },
}
