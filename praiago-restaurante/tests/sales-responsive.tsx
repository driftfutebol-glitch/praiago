import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { VendasContent } from '../src/pages/VendasPage'
import { buildSales } from '../src/lib/salesReport'
import MobileNavigation from '../src/components/MobileNavigation'
import '../src/index.css'

// Dados exclusivamente em memória, somente no servidor DEV; sem banco ou writes.
if (import.meta.env.DEV) {
  const report = buildSales([{ id: 'TESTE-LOCAL', total: 107.2, status: 'entregando', payment_status: 'aprovado', created_at: new Date().toISOString(), paid_at: new Date().toISOString() }], [
    { id: 'NET', pedido_id: 'TESTE-LOCAL', tipo: 'repasse_vendedor', valor: 96.48, status: 'pendente' }, { id: 'FEE', pedido_id: 'TESTE-LOCAL', tipo: 'taxa_plataforma', valor: 10.72, status: 'pendente' },
  ])
  createRoot(document.getElementById('root')!).render(<BrowserRouter><div className="restaurant-shell has-navigation"><main className="restaurant-main"><MobileNavigation restaurantName="Verificação local de layout" newOrders={0} notices={[]} onLogout={() => {}} /><VendasContent data={{ report, error: null, loading: false, updatedAt: new Date(), refresh: async () => {} }} /></main></div></BrowserRouter>)
}
