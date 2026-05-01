import { Component, type ErrorInfo, type ReactNode } from 'react'

function isDevEnv(): boolean {
  try {
    const meta = import.meta as unknown as { env?: { DEV?: boolean } }
    return meta.env?.DEV === true
  } catch {
    return false
  }
}

interface RouteErrorBoundaryProps {
  children: ReactNode
}

interface RouteErrorBoundaryState {
  error: Error | null
}

export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (typeof console !== 'undefined') {
      console.error('[RouteErrorBoundary]', error, info)
    }
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children

    const showStack = isDevEnv()

    return (
      <div
        role="alert"
        data-testid="route-error-boundary"
        className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 py-12 text-center"
      >
        <h1 className="font-serif text-2xl text-foreground">Something broke.</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          We hit an unexpected error while rendering this page. Reload to try again — your data
          is safe on disk.
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          className="inline-flex h-9 items-center rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          Reload page
        </button>
        {showStack && this.state.error.stack ? (
          <pre className="mt-4 max-w-2xl overflow-auto rounded-md border border-destructive/30 bg-destructive/5 p-3 text-left text-[11px] text-destructive">
            {this.state.error.stack}
          </pre>
        ) : null}
      </div>
    )
  }
}
