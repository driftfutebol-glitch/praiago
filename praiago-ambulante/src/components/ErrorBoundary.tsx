import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, Home, RefreshCw } from 'lucide-react'

type Props = {
  children: ReactNode
  appName?: string
  homePath?: string
}

type State = {
  hasError: boolean
  message: string
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Falha inesperada' }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.appName || 'PraiaGo'}] tela quebrou`, error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const homePath = this.props.homePath || '/'

    return (
      <div style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: '#ffffff',
        color: '#0f172a',
      }}>
        <div style={{
          width: '100%',
          maxWidth: 520,
          borderRadius: 22,
          border: '1px solid rgba(34,197,94,0.20)',
          background: '#ffffff',
          boxShadow: '0 24px 80px rgba(15,23,42,0.14)',
          padding: 28,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              display: 'grid',
              placeItems: 'center',
              background: 'rgba(34,197,94,0.12)',
              color: '#16a34a',
            }}>
              <AlertTriangle size={22} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Nao foi possivel carregar esta tela</h1>
              <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
                {this.props.appName || 'PraiaGo'} encontrou um erro de interface.
              </p>
            </div>
          </div>

          <p style={{ color: '#334155', lineHeight: 1.6, margin: '16px 0 20px' }}>
            Recarregue a tela ou volte ao inicio. O erro tambem foi registrado no console para correcao.
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => window.location.reload()} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, border: 0, borderRadius: 12,
              padding: '12px 16px', color: '#fff', background: '#16a34a', fontWeight: 800, cursor: 'pointer',
            }}>
              <RefreshCw size={16} /> Recarregar
            </button>
            <button onClick={() => { window.location.href = homePath }} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid rgba(148,163,184,0.28)',
              borderRadius: 12, padding: '12px 16px', color: '#0f172a', background: '#f8fafc', fontWeight: 800, cursor: 'pointer',
            }}>
              <Home size={16} /> Inicio
            </button>
          </div>

          {import.meta.env.DEV && this.state.message && (
            <pre style={{
              marginTop: 18, padding: 12, borderRadius: 12, whiteSpace: 'pre-wrap',
              color: '#b91c1c', background: '#fef2f2', fontSize: 12,
            }}>{this.state.message}</pre>
          )}
        </div>
      </div>
    )
  }
}
