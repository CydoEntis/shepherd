import { Component } from 'react'
import type { ReactNode } from 'react'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex flex-col items-center justify-center w-full h-full gap-3 px-6 text-center">
          <p className="text-sm font-medium text-red-400">Something went wrong</p>
          <p className="text-xs text-zinc-500 font-mono break-all max-w-sm">{this.state.error.message}</p>
          <button
            className="text-xs text-zinc-400 hover:text-zinc-200 underline"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
