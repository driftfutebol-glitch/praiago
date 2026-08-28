import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Roteamento minimo, por pathname. O site e uma landing de pagina unica; a
// unica outra tela e /ativar (o QR entregue no cadastro do evento). Nao vale
// puxar um react-router inteiro pra escolher entre duas telas.
//
// As duas entram por import() de proposito: a landing carrega framer-motion +
// todas as secoes (~400kB). Quem abre /ativar esta no meio de um evento, no 4G
// ruim, e nao pode pagar por esse peso — assim cada rota baixa so o seu pedaco.
const Landing = lazy(() => import('./App.tsx'))
const Ativar = lazy(() => import('./pages/Ativar.tsx'))

// Tolerante a barra no fim e a maiuscula: o link vai ser digitado/lido de QR.
const rota = window.location.pathname.replace(/\/+$/, '').toLowerCase()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* fallback null: o chunk vem do mesmo servidor do HTML e chega junto; uma
        tela de "carregando" aqui so piscaria. */}
    <Suspense fallback={null}>{rota === '/ativar' ? <Ativar /> : <Landing />}</Suspense>
  </StrictMode>,
)
