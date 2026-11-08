import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/providers'
import { db } from '@/lib/local/db'
import type { Vehicle } from '@/types'
import { ModeSetup } from './ModeSetup'

describe('ModeSetup (first launch)', () => {
  beforeEach(async () => {
    localStorage.clear()
    await db.clearAll()
  })

  it('offers local mode only — no server option at setup', () => {
    renderWithProviders(<ModeSetup onDone={vi.fn()} />)
    expect(screen.getByRole('button', { name: /c’est parti/i })).toBeInTheDocument()
    expect(screen.queryByText(/mon propre serveur/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/url de l’api/i)).not.toBeInTheDocument()
  })

  it('step 1 → step 2 : « C’est parti » ouvre le formulaire voiture', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    renderWithProviders(<ModeSetup onDone={onDone} />)
    await user.click(screen.getByRole('button', { name: /c’est parti/i }))
    expect(onDone).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: /ajouter ma voiture/i }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/marque/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/plaque/i)).toBeInTheDocument()
  })

  it('submit creates the vehicle (local), saves mode, flags the tutorial and calls onDone', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    renderWithProviders(<ModeSetup onDone={onDone} />)
    await user.click(screen.getByRole('button', { name: /c’est parti/i }))

    await user.type(screen.getByLabelText(/marque/i), 'Renault')
    await user.type(screen.getByLabelText(/modèle/i), 'Clio')
    await user.type(screen.getByLabelText(/année/i), '2019')
    await user.type(screen.getByLabelText(/compteur/i), '45000')
    await user.type(screen.getByLabelText(/plaque/i), 'ab-123-cd')
    await user.click(screen.getByRole('button', { name: /ajouter ma voiture/i }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(JSON.parse(localStorage.getItem('vv_mode')!)).toEqual({ mode: 'local' })
    expect(localStorage.getItem('vroomvroom-tutorial-pending')).toBe('1')
    const vehicles = await db.all<Vehicle>('vehicles')
    expect(vehicles).toHaveLength(1)
    expect(vehicles[0].license_plate).toBe('AB-123-CD')
  })

  it('submit without the required fields does not leave onboarding', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    renderWithProviders(<ModeSetup onDone={onDone} />)
    await user.click(screen.getByRole('button', { name: /c’est parti/i }))
    await user.click(screen.getByRole('button', { name: /ajouter ma voiture/i }))
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /ajouter ma voiture/i })).toBeInTheDocument()
  })

  it('« Passer » (bienvenue) : mode local sauvegardé, sans véhicule ni tutoriel', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    renderWithProviders(<ModeSetup onDone={onDone} />)
    await user.click(screen.getByRole('button', { name: /^passer$/i }))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem('vv_mode')!)).toEqual({ mode: 'local' })
    expect(localStorage.getItem('vroomvroom-tutorial-pending')).toBeNull()
    expect(await db.all<Vehicle>('vehicles')).toHaveLength(0)
  })

  it('« Passer pour plus tard » (voiture) : quitte l’onboarding sans créer de véhicule', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    renderWithProviders(<ModeSetup onDone={onDone} />)
    await user.click(screen.getByRole('button', { name: /c’est parti/i }))
    await user.click(screen.getByRole('button', { name: /passer pour plus tard/i }))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem('vv_mode')!)).toEqual({ mode: 'local' })
    expect(await db.all<Vehicle>('vehicles')).toHaveLength(0)
  })

  it('mentions the guide in settings', () => {
    renderWithProviders(<ModeSetup onDone={vi.fn()} />)
    expect(screen.getByText(/guide complet est dans les paramètres/i)).toBeInTheDocument()
  })
})
