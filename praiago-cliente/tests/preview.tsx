import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App'
import { useStore } from '../src/store/useStore'
import { fixtureProfile } from './supabaseDouble'
import '../src/index.css'

// Entrada de QA separada: Vite normal não a inclui no dist nem no aplicativo.
// Supabase é substituído no config; chamadas externas e pagamentos ficam bloqueados.
window.fetch = async () => { throw new Error('Rede externa bloqueada na prévia com dados fictícios') }
useStore.getState().logout()
useStore.getState().login(fixtureProfile.id, fixtureProfile.email, fixtureProfile.nome, fixtureProfile.telefone)
createRoot(document.getElementById('root')!).render(<>
  <style>{`.pg-shell { height:calc(100dvh - 30px)!important; min-height:calc(100dvh - 30px)!important }`}</style>
  <div style={{ height: 30, background: '#fff0cd', color: '#754409', textAlign: 'center', font: '11px/30px system-ui' }}>Prévia local · dados fictícios · não envia pedidos</div>
  <MemoryRouter initialEntries={['/perfil']}><App/></MemoryRouter>
</>)
