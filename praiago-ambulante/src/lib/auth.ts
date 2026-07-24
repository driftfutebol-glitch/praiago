// Sessão simples persistida (placeholder até o Supabase Auth).
// Antes o botão "Entrar" não fazia nada — agora há sessão real + proteção de rota.
import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'

export type Sessao = {
  id: string
  email: string
  nome: string
} | null

const KEY = 'praiago:ambulante:sessao'
const listeners = new Set<() => void>()

// Snapshot em cache: useSyncExternalStore exige referência estável.
let cache: Sessao = read()
function read(): Sessao {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null }
}
function refresh() { cache = read(); listeners.forEach(l => l()) }

export function getSessao(): Sessao { return cache }

export function login(id: string, email: string, nome?: string): Sessao {
  const s: Sessao = { id, email: email.trim(), nome: nome?.trim() || email.split('@')[0] || 'Ambulante' }
  localStorage.setItem(KEY, JSON.stringify(s))
  refresh()
  return cache
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
