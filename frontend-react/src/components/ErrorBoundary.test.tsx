import { describe, it, expect, vi } from 'vitest'
import { screen, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import type { JSX } from 'react'

function Boom(): JSX.Element {
  throw new Error('kaboom')
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(<ErrorBoundary><span>ok</span></ErrorBoundary>)
    expect(screen.getByText('ok')).toBeInTheDocument()
  })

  it('catches a render error and shows the default fallback', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary><Boom /></ErrorBoundary>)
    expect(screen.getByText("Une erreur inattendue s'est produite")).toBeInTheDocument()
    expect(screen.getByText('kaboom')).toBeInTheDocument()
  })

  it('renders a custom fallback when provided', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary fallback={<span>custom-fallback</span>}><Boom /></ErrorBoundary>)
    expect(screen.getByText('custom-fallback')).toBeInTheDocument()
  })

  it('recovers to children after clicking Réessayer', async () => {
    const user = userEvent.setup()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let broken = true
    const Flaky = () => {
      if (broken) throw new Error('x')
      return <span>recovered</span>
    }
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    )
    expect(screen.getByText(/erreur inattendue/)).toBeInTheDocument()
    broken = false
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(screen.getByText('recovered')).toBeInTheDocument()
  })
})
