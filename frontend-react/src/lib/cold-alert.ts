

// Cold-alert config + forecast logic — pure, no React, no DOM.
// The notification delivery itself lives in notify.ts (platform-specific).

export interface ColdAlertConfig {
  enabled: boolean
  city: { name: string; cp: string; lat: number; lon: number } | null
  /** 'HH:MM' — the time the notification is expected */
  time: string
  /** °C — alert when the forecast at `time` is at or below this */
  thresholdC: number
}

export const DEFAULT_COLD_ALERT: ColdAlertConfig = {
  enabled: false,
  city: null,
  time: '06:45',
  thresholdC: 5,
}

const STORAGE_KEY = 'vv_cold_alert'
const LAST_NOTIFIED_KEY = 'vv_cold_alert_last_notified'

export function loadColdAlert(): ColdAlertConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_COLD_ALERT
    const parsed = JSON.parse(raw) as Partial<ColdAlertConfig>
    return {
      ...DEFAULT_COLD_ALERT,
      ...parsed,
      city: parsed.city ?? null,
    }
  } catch {
    return DEFAULT_COLD_ALERT
  }
}

export function saveColdAlert(cfg: ColdAlertConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}

/** Mandatory winter-grade E85 window (31 Oct – 15 Mar) — same rule as the blend calculator. */
export function isWinterWindow(date: Date = new Date()): boolean {
  const month = date.getMonth() + 1
  const day = date.getDate()
  return month >= 11 || month <= 2 || (month === 3 && day <= 15)
}

/** Next occurrence of HH:MM — today if not yet passed, otherwise tomorrow. */
export function nextOccurrence(time: string, now: Date = new Date()): Date {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(now)
  d.setHours(h ?? 0, m ?? 0, 0, 0)
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1)
  return d
}

export interface OpenMeteoForecast {
  time: string[]
  temperature_2m: number[]
}

/** open-meteo: free, no API key, browser CORS allowed. */
export async function fetchOpenMeteo(lat: number, lon: number): Promise<OpenMeteoForecast> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: 'temperature_2m',
    forecast_days: '2',
    timezone: 'auto',
  })
  const res = await window.fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`)
  if (!res.ok) throw new Error(`open-meteo HTTP ${res.status}`)
  const data = (await res.json()) as { hourly: OpenMeteoForecast }
  return data.hourly
}

function localKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}`
}

/** Local-time hourly temperature for the given date (timezone=auto ⇒ local strings). */
export function tempAtTime(forecast: OpenMeteoForecast, target: Date): number | null {
  const key = localKey(target)
  const i = forecast.time.findIndex((t) => t.startsWith(key))
  return i >= 0 ? forecast.temperature_2m[i] : null
}

export interface ColdAdvice {
  level: 'cold' | 'ok' | 'unknown'
  message: string
}

/**
 * Banner/notification message. Formatting lives here (not in i18n) because the
 * strings are also used as notification payloads; the {city} {time} {temp}
 * placeholders match t.coldAlert.{cold,coldWinter,ok,unknown}.
 */
export function coldAdvice(
  tempC: number | null,
  cfg: Pick<ColdAlertConfig, 'thresholdC' | 'time'>,
  cityLabel: string,
): ColdAdvice {
  if (tempC == null) {
    return {
      level: 'unknown',
      message: `Prévision indisponible pour ${cityLabel} à ${cfg.time}`,
    }
  }
  if (tempC > cfg.thresholdC) {
    return {
      level: 'ok',
      message: `${cityLabel} ${cfg.time} : ${tempC} °C prévu, pas d'alerte`,
    }
  }
  const base = `${cityLabel} ${cfg.time} : ${tempC} °C prévu : ajoutez de l'E10 pour faciliter les démarrages à froid`
  return {
    level: 'cold',
    message: isWinterWindow() ? `${base} (grade E85 60 – 75 % en cette période)` : base,
  }
}

// Dedup — a remount must not re-fire for the same occurrence.
export function wasNotifiedFor(occurrence: Date): boolean {
  return localStorage.getItem(LAST_NOTIFIED_KEY) === occurrenceKey(occurrence)
}

export function markNotifiedFor(occurrence: Date): void {
  localStorage.setItem(LAST_NOTIFIED_KEY, occurrenceKey(occurrence))
}

function occurrenceKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
