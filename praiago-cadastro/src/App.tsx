import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import Login from './Login'
import Cadastro from './Cadastro'

// Ferramenta interna do evento. É um app SEPARADO de propósito: roda na própria
// URL, com o próprio login, e não compartilha nada de tela com o painel admin
// nem com os apps — então mexer aqui não tem como quebrar aquilo. O que ele usa
// em comum é só o banco e a edge function, pelo caminho normal de qualquer
// cliente autenticado.

export default function App() {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session)
      setCarregando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (carregando) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div className="girando" style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #e0f2fe', borderTopColor: '#0284c7' }} />
      </div>
    )
  }

  if (!sessao) return <Login />
  return <Cadastro sessao={sessao} />
}
