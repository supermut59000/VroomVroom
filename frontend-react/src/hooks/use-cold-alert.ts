import { useEffect, useState } from 'react'
import {
  loadColdAlert,
  fetchOpenMeteo,
  nextOccurrence,
  tempAtTime,
  coldAdvice,
  wasNotifiedFor,
  markNotifiedFor,
} from '@/lib/cold-alert'
import { notifyColdAlert } from '@/lib/notify'

/**
 * On mount: if the alert is active and the next configured time is forecast
 * at or below the threshold → deliver a notification and return a banner
 * message. Deduplicated per occurrence (no re-fire on remount).
 */
export function useColdAlert(): { message: string | null } {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const cfg = loadColdAlert()
    if (!cfg.enabled || !cfg.city) return
    let cancelled = false
    const run = async () => {
      try {
        const forecast = await fetchOpenMeteo(cfg.city!.lat, cfg.city!.lon)
        if (cancelled) return
        const occurrence = nextOccurrence(cfg.time)
        const temp = tempAtTime(forecast, occurrence)
        const advice = coldAdvice(temp, cfg, cfg.city!.name)
        if (advice.level === 'cold' && !wasNotifiedFor(occurrence)) {
          markNotifiedFor(occurrence)
          notifyColdAlert({
            title: 'VroomVroom — alerte froid',
            body: advice.message,
            at: occurrence,
          })
          setMessage(advice.message)
        }
      } catch {
        // forecast unavailable — stay silent, the dialog's "Tester maintenant"
        // surfaces errors explicitly
        if (!cancelled) setMessage(null)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  return { message }
}
