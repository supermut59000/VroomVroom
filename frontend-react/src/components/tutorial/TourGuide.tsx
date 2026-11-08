import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  clearTutorialPending,
  isTutorialPending,
  TOUR_CLOSE_FUEL_EVENT,
  TOUR_FUEL_CLOSED_EVENT,
  TOUR_OPEN_FUEL_EVENT,
  TOUR_START_EVENT,
} from '@/lib/tutorial'

interface TourStep {
  /** Sélecteur CSS de l'élément à illuminer. */
  target: string
  title: string
  text: string
  /** Avant d'afficher l'étape, demander au Dashboard d'ouvrir le formulaire plein. */
  openFuelDialog?: boolean
}

const STEPS: TourStep[] = [
  {
    target: '[data-tour="add-fuel-fab"]',
    title: 'Ajouter un plein',
    text: 'À la station, tout commence ici : appuie pour enregistrer ton plein en 10 secondes.',
  },
  {
    target: '#fuel-odometer',
    openFuelDialog: true,
    title: 'Le compteur',
    text: 'Le kilométrage affiché par ton compteur au moment du plein.',
  },
  {
    target: '#fuel-liters',
    title: 'Les litres',
    text: 'Les litres pompés, comme sur l’écran de la pompe.',
  },
  {
    target: '#fuel-price',
    title: 'Le prix',
    text: 'Le prix par litre. Le total est calculé tout seul.',
  },
  {
    target: '#fuel-station',
    title: 'La station (optionnel)',
    text: 'Le nom de la station — pratique pour comparer les prix plus tard.',
  },
  {
    target: '[data-tour="fuel-submit"]',
    title: 'Enregistrer',
    text: 'Appuie : ta consommation est calculée automatiquement. C’est parti !',
  },
]

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

/**
 * Tutoriel à bulles : overlay plein écran avec « projecteur » (spotlight)
 * sur l'élément de l'étape courante + bulle d'info. Se lance après
 * l'onboarding (drapeau localStorage) ou via le bouton « Tutoriel »
 * des paramètres.
 */
export function TourGuide() {
  const [step, setStep] = useState<number | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const timerRef = useRef<number | null>(null)
  const lastRectRef = useRef<Rect | null>(null)

  const begin = useCallback(() => {
    clearTutorialPending()
    setRect(null)
    setStep(0)
  }, [])

  const finish = useCallback(() => {
    window.dispatchEvent(new Event(TOUR_CLOSE_FUEL_EVENT))
    setRect(null)
    setStep(null)
  }, [])

  // Auto-démarrage après l'onboarding (le dashboard a besoin d'un instant
  // pour monter le FAB).
  useEffect(() => {
    if (!isTutorialPending()) return
    const t = window.setTimeout(begin, 700)
    return () => window.clearTimeout(t)
  }, [begin])

  // Démarrage manuel (bouton « Tutoriel ») + retour à l'étape 0 si
  // l'utilisateur ferme le formulaire plein en plein tutoriel.
  useEffect(() => {
    const onStart = () => begin()
    const onFuelClosed = () => setStep((s) => (s === null ? s : 0))
    window.addEventListener(TOUR_START_EVENT, onStart)
    window.addEventListener(TOUR_FUEL_CLOSED_EVENT, onFuelClosed)
    return () => {
      window.removeEventListener(TOUR_START_EVENT, onStart)
      window.removeEventListener(TOUR_FUEL_CLOSED_EVENT, onFuelClosed)
    }
  }, [begin])

  // Suit la cible de l'étape (le dialog s'anime, la page peut scroller).
  useEffect(() => {
    if (step === null) return
    const s = STEPS[step]
    if (s.openFuelDialog) window.dispatchEvent(new Event(TOUR_OPEN_FUEL_EVENT))
    lastRectRef.current = null
    setRect(null)
    let tries = 0
    const tick = () => {
      const el = document.querySelector(s.target) as HTMLElement | null
      if (!el) {
        tries += 1
        if (tries > 60) {
          finish() // cible introuvable après ~9 s : on termine proprement
          return
        }
        timerRef.current = window.setTimeout(tick, 150)
        return
      }
      el.scrollIntoView({ block: 'nearest' })
      const r = el.getBoundingClientRect()
      const next = { top: r.top, left: r.left, width: r.width, height: r.height }
      // Ne re-render que si l'élément a vraiment bougé (sinon la boucle de
      // suivi rendrait toutes les 200 ms pour rien).
      const last = lastRectRef.current
      if (
        !last ||
        last.top !== next.top ||
        last.left !== next.left ||
        last.width !== next.width ||
        last.height !== next.height
      ) {
        lastRectRef.current = next
        setRect(next)
      }
      timerRef.current = window.setTimeout(tick, 200)
    }
    tick()
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [step, finish])

  if (step === null) return null
  const s = STEPS[step]
  const last = step === STEPS.length - 1
  const vw = window.innerWidth
  const vh = window.innerHeight
  const pad = 6
  const bubbleW = Math.min(vw - 24, 320)
  const estBubbleH = 170
  let bubbleTop: number | undefined
  let bubbleBottom: number | undefined
  if (rect) {
    const bottom = rect.top + rect.height
    const spaceBelow = vh - (bottom + pad + 12)
    if (spaceBelow >= estBubbleH) {
      bubbleTop = bottom + pad + 12
    } else {
      bubbleBottom = vh - (rect.top - pad - 12)
    }
  }
  const bubbleLeft = rect
    ? Math.min(Math.max(12, rect.left + rect.width / 2 - bubbleW / 2), vw - bubbleW - 12)
    : (vw - bubbleW) / 2

  return (
    <div className="fixed inset-0 z-[200]" role="dialog" aria-label="Tutoriel">
      {rect && (
        <div
          className="pointer-events-none absolute rounded-xl border-2 border-primary transition-all duration-200"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
          }}
        />
      )}
      <div
        className="absolute rounded-xl border bg-card p-4 shadow-xl"
        style={{ width: bubbleW, left: bubbleLeft, top: bubbleTop, bottom: bubbleBottom }}
      >
        <p className="text-sm font-semibold text-card-foreground">{s.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{s.text}</p>
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={finish}
            className="text-xs text-muted-foreground underline"
          >
            Passer
          </button>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground">
              {step + 1}/{STEPS.length}
            </span>
            <Button
              type="button"
              size="sm"
              onClick={last ? finish : () => setStep((x) => (x === null ? x : x + 1))}
            >
              {last ? 'Terminer' : 'Suivant'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
