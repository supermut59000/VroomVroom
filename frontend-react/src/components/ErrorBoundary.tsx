import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
          <p className="text-sm font-medium text-destructive">Une erreur inattendue s'est produite</p>
          {this.state.error && (
            <p className="max-w-sm text-xs text-muted-foreground">{this.state.error.message}</p>
          )}
          <Button size="sm" variant="outline" onClick={this.handleReset}>
            Réessayer
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
