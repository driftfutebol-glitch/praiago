// Sessão simples persistida (placeholder até o Supabase Auth).
// Antes o botão "Entrar no painel" não fazia nada — agora há sessão + proteção de rota.
import { useSyncExternalStore } from 'react'

export type Sessao = { email: string; nome: string } | null

const KEY = 'praiago:restaurante:sessao'
const listeners = new Set<() => void>()

let cache: Sessao = read()
function read(): Sessao {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null }
}
function refresh() { cache = read(); listeners.forEach(l => l()) }

export function getSessao(): Sessao { return cache }

export function login(email: string, nome?: string): Sessao {
  const s: Sessao = { email: email.trim(), nome: nome?.trim() || 'Restaurante PraiaGo' }
  localStorage.setItem(KEY, JSON.stringify(s))
  refresh()
  return cache
}

export function logout() {
  localStorage.removeItem(KEY)
  refresh()
}

export function useSessao(): Sessao {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb) },
    getSessao,
    getSessao,
  )
}
