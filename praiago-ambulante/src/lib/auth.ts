// Sessão simples persistida (placeholder até o Supabase Auth).
// Antes o botão "Entrar" não fazia nada — agora há sessão real + proteção de rota.
import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'

export type Sessao = {
  id: string
  email: string
  nome: string
  // null significa sessão antiga ainda não reconciliada com o perfil remoto.
  // Enquanto estiver desconhecido, o GPS não publica o vendedor no radar.
  contaDemo: boolean | null
} | null

const KEY = 'praiago:ambulante:sessao'
const listeners = new Set<() => void>()

// Snapshot em cache: useSyncExternalStore exige referência estável.
let cache: Sessao = read()
function read(): Sessao {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null') as Record<string, unknown> | null
    if (!value || typeof value.id !== 'string' || typeof value.email !== 'string') return null
    return {
      id: value.id,
      email: value.email,
      nome: typeof value.nome === 'string' ? value.nome : value.email.split('@')[0] || 'Ambulante',
      contaDemo: typeof value.contaDemo === 'boolean' ? value.contaDemo : null,
    }
  } catch { return null }
}
function refresh() { cache = read(); listeners.forEach(l => l()) }

export function getSessao(): Sessao { return cache }

export function login(id: string, email: string, nome?: string, contaDemo = false): Sessao {
  const s: Sessao = { id, email: email.trim(), nome: nome?.trim() || email.split('@')[0] || 'Ambulante', contaDemo }
  localStorage.setItem(KEY, JSON.stringify(s))
  refresh()
  return cache
}

export function setContaDemo(contaDemo: boolean) {
  if (!cache) return
  localStorage.setItem(KEY, JSON.stringify({ ...cache, contaDemo }))
  refresh()
}

export function logout() {
  // Best-effort: some do mapa ao sair (senão o vendedor fica "online" pra sempre).
  const id = cache?.id
  if (id) { supabase.from('profiles').update({ online: false }).eq('id', id).then(() => {}, () => {}) }
  localStorage.removeItem(KEY)
  refresh()
}

// Hook reativo para os componentes saberem se há sessão
export function useSessao(): Sessao {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb) },
    getSessao,
    getSessao,
  )
}
