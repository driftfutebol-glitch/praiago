import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import MobileNavigation from '../src/components/MobileNavigation'
import PedidosPage from '../src/pages/PedidosPage'
import DashboardPage from '../src/pages/DashboardPage'
import { useOrders } from '../src/store/useOrders'
import '../src/index.css'

// Página isolada servida apenas pelo Vite. Não entra no dist nem usa o banco.
function Fixture() {
  return <div className="restaurant-shell has-navigation"><main className="restaurant-main"><MobileNavigation restaurantName="Verificação local de layout" newOrders={1} notices={[]} onLogout={() => {}} /><Routes><Route path="/pedidos" element={<PedidosPage />} /><Route path="*" element={<DashboardPage />} /></Routes></main></div>
}
if (import.meta.env.DEV) {
  useOrders.setState({
    pedidos: [{ id: 'TESTE-LOCAL', cliente: 'Teste local de um nome de cliente comprido', zona: 'Ocian', itens: ['Pizza de teste com descrição extensa para conferir a quebra de linha', 'Talheres: não'], total: 43, status: 'novo', hora: '12:30', pagamento: 'pix', ts: 0, lat: null, lng: null, reta: '', barraca: '', clienteTelefone: '' }],
    avancar: async () => false, recusar: async () => false,
  })
  createRoot(document.getElementById('root')!).render(<BrowserRouter><Fixture /></BrowserRouter>)
}
