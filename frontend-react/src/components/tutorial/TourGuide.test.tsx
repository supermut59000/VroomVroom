import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TourGuide } from './TourGuide'
import {
  clearTutorialPending,
  setTutorialPending,
  TOUR_CLOSE_FUEL_EVENT,
  TOUR_OPEN_FUEL_EVENT,
  TOUR_START_EVENT,
} from '@/lib/tutorial'

// Surface app simulée : le FAB + les champs du formulaire plein + le guide.
function FakeApp() {
  return (
    <div>
      <button data-tour="add-fuel-fab">+</button>
      <div id="fuel-odometer" />
      <div id="fuel-liters" />
      <div id="fuel-price" />
      <div id="fuel-station" />
      <button data-tour="fuel-submit">Ajouter</button>
      <TourGuide />
    </div>
  )
}

describe('TourGuide (tutoriel à bulles)', () => {
  beforeEach(() => {
    localStorage.clear()
    clearTutorialPending()
  })

  it('ne rend rien tant que le tutoriel n’est pas démarré', () => {
    render(<FakeApp />)
    expect(screen.queryByRole('dialog', { name: /tutoriel/i })).not.toBeInTheDocument()
  })

  it('suit les 6 étapes et émet les bons événements', async () => {
    const openSpy = vi.fn()
    const closeSpy = vi.fn()
    window.addEventListener(TOUR_OPEN_FUEL_EVENT, openSpy)
    window.addEventListener(TOUR_CLOSE_FUEL_EVENT, closeSpy)
    const user = userEvent.setup()
    render(<FakeApp />)

    act(() => {
      window.dispatchEvent(new Event(TOUR_START_EVENT))
    })

    // Étape 1 : le FAB est illuminé.
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /tutoriel/i })).toBeInTheDocument(),
    )
    expect(screen.getByText('Ajouter un plein')).toBeInTheDocument()
    expect(screen.getByText(/1\/6/)).toBeInTheDocument()

    // Étape 2 : « Le compteur » + ouverture du formulaire plein.
    await user.click(screen.getByRole('button', { name: /suivant/i }))
    await waitFor(() => expect(screen.getByText('Le compteur')).toBeInTheDocument())
    expect(openSpy).toHaveBeenCalledTimes(1)

    // Étape 3 : les litres.
    await user.click(screen.getByRole('button', { name: /suivant/i }))
    await waitFor(() => expect(screen.getByText('Les litres')).toBeInTheDocument())

    // Étape 4 : le prix.
    await user.click(screen.getByRole('button', { name: /suivant/i }))
    await waitFor(() => expect(screen.getByText('Le prix')).toBeInTheDocument())

    // Étape 5 : la station (optionnel) — titre exact pour ne pas matcher le corps.
    await user.click(screen.getByRole('button', { name: /suivant/i }))
    await waitFor(() =>
      expect(screen.getByText('La station (optionnel)')).toBeInTheDocument(),
    )

    // Étape 6 : enregistrer — le bouton devient « Terminer ».
    await user.click(screen.getByRole('button', { name: /suivant/i }))
    await waitFor(() => expect(screen.getByText('Enregistrer')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /terminer/i })).toBeInTheDocument()

    // Terminer : le formulaire est fermé, le tutoriel disparaît.
    await user.click(screen.getByRole('button', { name: /terminer/i }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /tutoriel/i })).not.toBeInTheDocument(),
    )
    expect(closeSpy).toHaveBeenCalledTimes(1)
  })

  it('« Passer » termine le tutoriel à tout moment', async () => {
    const user = userEvent.setup()
    render(<FakeApp />)
    act(() => {
      window.dispatchEvent(new Event(TOUR_START_EVENT))
    })
    await waitFor(() => expect(screen.getByText('Ajouter un plein')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /passer/i }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /tutoriel/i })).not.toBeInTheDocument(),
    )
  })

  it('démarre tout seul après l’onboarding (drapeau pending)', async () => {
    setTutorialPending()
    render(<FakeApp />)
    // Le démarrage est différé de 700 ms le temps que le dashboard monte.
    await waitFor(
      () => expect(screen.getByText('Ajouter un plein')).toBeInTheDocument(),
      { timeout: 2000 },
    )
    expect(localStorage.getItem('vroomvroom-tutorial-pending')).toBeNull()
  })
})
