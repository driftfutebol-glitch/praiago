import { useCatalogo } from '../store/useCatalogo'

export default function CatalogFeedback() {
  const error = useCatalogo(s => s.error)
  const refreshing = useCatalogo(s => s.refreshing)
  const carregar = useCatalogo(s => s.carregar)
  if (!error) return null
  return <div role="status" className="pg-catalog-error"><div><strong>Não conseguimos atualizar o catálogo.</strong><br/>Confira sua conexão. As informações anteriores podem estar desatualizadas.</div><button onClick={() => void carregar()} disabled={refreshing}>{refreshing ? 'Tentando…' : 'Tentar de novo'}</button></div>
}
