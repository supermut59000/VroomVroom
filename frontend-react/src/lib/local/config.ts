// App mode: 'local' (default — no server, data in IndexedDB) or 'server'
// (user's own API base URL + API key, pasted at setup).
export interface ModeConfig {
  mode: 'local' | 'server'
  serverUrl?: string
  apiKey?: string
}

const MODE_KEY = 'vv_mode'

export function loadModeConfig(): ModeConfig | null {
  try {
    const raw = localStorage.getItem(MODE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ModeConfig
    return parsed?.mode === 'local' || parsed?.mode === 'server' ? parsed : null
  } catch {
    return null
  }
}

export function saveModeConfig(cfg: ModeConfig): void {
  localStorage.setItem(MODE_KEY, JSON.stringify(cfg))
}

export function clearModeConfig(): void {
  localStorage.removeItem(MODE_KEY)
}
