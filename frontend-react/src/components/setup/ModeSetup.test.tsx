import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/providers'
import { ModeSetup } from './ModeSetup'

describe('ModeSetup (first launch)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('offers local mode only — no server option at setup', () => {
    renderWithProviders(<ModeSetup onDone={vi.fn()} />)
    expect(screen.getByRole('button', { name: /c’est parti/i })).toBeInTheDocument()
    expect(screen.queryByText(/mon propre serveur/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/url de l’api/i)).not.toBeInTheDocument()
  })

  it('saves the local mode and calls onDone when starting', async () => {
    const onDone = vi.fn()
    renderWithProviders(<ModeSetup onDone={onDone} />)
    await userEvent.click(screen.getByRole('button', { name: /c’est parti/i }))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem('vv_mode')!)).toEqual({ mode: 'local' })
  })

  it('mentions the guide in settings', () => {
    renderWithProviders(<ModeSetup onDone={vi.fn()} />)
    expect(screen.getByText(/guide complet est dans les paramètres/i)).toBeInTheDocument()
  })
})
