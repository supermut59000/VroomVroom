import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/providers'
import { saveModeConfig } from '@/lib/local/config'
import { SettingsDialog } from './SettingsDialog'

describe('SettingsDialog', () => {
  beforeEach(() => {
    localStorage.clear()
    saveModeConfig({ mode: 'local' })
    vi.restoreAllMocks()
  })

  it('shows the guide and donation sections, hides the server section', () => {
    renderWithProviders(<SettingsDialog open onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /guide de l’app/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /faire un don/i })).toBeInTheDocument()
    // Server mode is locked: no URL field
    expect(screen.queryByText('URL de l’API')).not.toBeInTheDocument()
  })

  it('expands the guide with the app walkthrough', async () => {
    renderWithProviders(<SettingsDialog open onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /guide de l’app/i }))
    expect(screen.getByText('Pleins')).toBeInTheDocument()
    expect(screen.getByText(/méthode plein-à-plein/i)).toBeInTheDocument()
  })

  it('expands the donation panel with the PayPal button', async () => {
    renderWithProviders(<SettingsDialog open onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /faire un don/i }))
    expect(screen.getByText(/5 étoiles sur google play/i)).toBeInTheDocument()
    const paypal = screen.getByRole('link', { name: /faire un don paypal/i })
    expect(paypal).toHaveAttribute('href', 'https://paypal.me/wiwibaguette')
    expect(screen.getByText('paypal.me/wiwibaguette')).toBeInTheDocument()
  })

  it('links the public privacy policy in the about section', () => {
    renderWithProviders(<SettingsDialog open onClose={vi.fn()} />)
    const policy = screen.getByRole('link', { name: /politique de confidentialité/i })
    expect(policy).toHaveAttribute('href', 'https://supermut59000.github.io/VroomVroom/confidentialite.html')
  })

  it('unlocks the server section after 10 rapid taps on the version', async () => {
    renderWithProviders(<SettingsDialog open onClose={vi.fn()} />)
    const version = screen.getByRole('button', {
      name: 'Version de l’application',
    })
    for (let i = 0; i < 9; i++) fireEvent.click(version)
    expect(screen.queryByText('URL de l’API')).not.toBeInTheDocument()
    fireEvent.click(version)
    await waitFor(() =>
      expect(screen.getByText('URL de l’API')).toBeInTheDocument(),
    )
    expect(localStorage.getItem('vv_server_unlocked')).toBe('1')
  })

  it('shows the server section directly when already in server mode', () => {
    localStorage.clear()
    saveModeConfig({ mode: 'server', serverUrl: 'https://example.com/api/v1' })
    renderWithProviders(<SettingsDialog open onClose={vi.fn()} />)
    expect(screen.getByText('URL de l’API')).toBeInTheDocument()
  })
})
