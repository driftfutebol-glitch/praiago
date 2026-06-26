// Camada de tempo real — abstrai o transporte.
//
// PROBLEMA que isto resolve: BroadcastChannel/localStorage são isolados por
// ORIGIN. Como cada app roda numa porta diferente, um pedido enviado pelo
// cliente nunca chegava no ambulante. Esta camada deixa o código pronto para
// Supabase Realtime (que cruza origens): basta definir as variáveis de ambiente
// VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.
//
// Sem as credenciais, cai no BroadcastChannel (funciona entre abas do MESMO app
// — o suficiente para desenvolver/demonstrar localmente).

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null
export const isCloudRealtime = !!supabase

export const TOPICS = {
  orders:        'praiago:orders',
  orderStatus:   'praiago:order-status',
  clienteGPS:    'praiago:cliente:gps',
  ambulanteGPS:  'praiago:ambulante:gps',
  entregadorGPS: 'praiago:entregador:gps',
} as const

const EVENT = 'msg'

export type Channel<T> = {
  publish: (payload: T) => void
  subscribe: (cb: (payload: T) => void) => () => void
  close: () => void
}

export function channel<T = unknown>(topic: string): Channel<T> {
  if (supabase) {
    const ch = supabase.channel(topic, { config: { broadcast: { self: false } } })
    let ready = false
    const ensure = () => { if (!ready) { ch.subscribe(); ready = true } }
    return {
      publish: (payload) => { ensure(); ch.send({ type: 'broadcast', event: EVENT, payload: payload as object }) },
      subscribe: (cb) => {
        ch.on('broadcast', { event: EVENT }, ({ payload }) => cb(payload as T))
        ensure()
        return () => { supabase!.removeChannel(ch) }
      },
      close: () => { supabase!.removeChannel(ch) },
    }
  }

  // Fallback: BroadcastChannel (mesma origem). Mantém o formato "cru" do
  // payload para continuar compatível com os outros apps que ainda leem
  // BroadcastChannel direto (ambulante/entregador).
  const bc = new BroadcastChannel(topic)
  return {
    publish: (payload) => bc.postMessage(payload),
    subscribe: (cb) => { bc.onmessage = (e: MessageEvent<T>) => cb(e.data); return () => bc.close() },
    close: () => bc.close(),
  }
}
