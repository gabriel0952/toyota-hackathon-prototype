import { Component, type ErrorInfo, type ReactNode } from 'react'
import { StatePanel } from './ui'

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { if (import.meta.env.DEV) console.error('Route render failed', error, info) }
  render() { return this.state.failed ? <div className="center-page"><StatePanel kind="error" onReset={() => window.location.assign('/driver')}/></div> : this.props.children }
}
