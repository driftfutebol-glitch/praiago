// Camada de tempo real — abstrai o transporte (ver explicação no app cliente).
// Supabase Realtime quando há VITE_SUPABASE_URL/ANON_KEY; senão BroadcastChannel.
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
  const bc = new BroadcastChannel(topic)
  return {
    publish: (payload) => bc.postMessage(payload),
    subscribe: (cb) => { bc.onmessage = (e: MessageEvent<T>) => cb(e.data); return () => bc.close() },
    close: () => bc.close(),
  }
}
