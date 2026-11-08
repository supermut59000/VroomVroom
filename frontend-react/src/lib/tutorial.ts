// Tutoriel « ajouter un plein » : événements + drapeau « à lancer après
// l'onboarding ». Le overlay (TourGuide) et le Dashboard se parlent par
// événements Custom — aucun état global.

const PENDING_KEY = 'vroomvroom-tutorial-pending'

/** Dispatché par le bouton « Tutoriel » des paramètres (ou la fin d'onboarding). */
export const TOUR_START_EVENT = 'vv:tour-start'
/** Demandé par le tutoriel au Dashboard : ouvrir le formulaire « Ajouter un plein ». */
export const TOUR_OPEN_FUEL_EVENT = 'vv:tour-open-fuel'
/** Demandé par le tutoriel au Dashboard : fermer le formulaire (fin du guide). */
export const TOUR_CLOSE_FUEL_EVENT = 'vv:tour-close-fuel'
/** Émis par le Dashboard quand le formulaire est fermé (par l'utilisateur). */
export const TOUR_FUEL_CLOSED_EVENT = 'vv:tour-fuel-closed'

export function setTutorialPending(): void {
  localStorage.setItem(PENDING_KEY, '1')
}

export function clearTutorialPending(): void {
  localStorage.removeItem(PENDING_KEY)
}

export function isTutorialPending(): boolean {
  return localStorage.getItem(PENDING_KEY) === '1'
}

export function startTutorial(): void {
  window.dispatchEvent(new Event(TOUR_START_EVENT))
}
