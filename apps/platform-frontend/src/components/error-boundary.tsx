import { Component, ErrorInfo, ReactNode } from 'react'
import { Button } from '@/components/button'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({ error, errorInfo })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-500/30 dark:bg-red-500/10">
            <h1 className="text-xl font-semibold text-red-900 dark:text-red-200">Something went wrong</h1>
            <p className="mt-2 text-sm text-red-700 dark:text-red-300">
              An error occurred while rendering this page. Please check the console for more details.
            </p>

            {this.state.error && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-red-900 dark:text-red-200">
                  Error details
                </summary>
                <pre className="mt-2 overflow-auto rounded bg-red-100 p-4 text-xs text-red-800 dark:bg-red-500/20 dark:text-red-200">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <div className="mt-4 flex gap-4">
              <Button onClick={() => window.location.reload()}>Reload page</Button>
              <Button plain onClick={() => window.history.back()}>
                Go back
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
