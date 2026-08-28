import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getSessao } from '../lib/auth'

// Caixa de avisos dirigidos a ESTE vendedor.
//
// Copiado identico no ambulante e no restaurante.
//
// Diferente de `avisos`, que e broadcast por publico ('ambulantes', 'todos'):
// aqui e coisa que so vale para uma pessoa — o KYC dela aprovado, a conta
// dela recusada. Quem escreve e o servidor; o app so le e marca como lido.
//
// Chega por realtime, entao com o app aberto o aviso aparece no instante em
// que a varredura do servidor detecta a virada. Fechado, aparece na abertura
// seguinte.

export type NotificacaoVendedor = {
  id: string
  tipo: string
  titulo: string
  mensagem: string
  acao: string | null
  lidaEm: number | null
  criadaEm: number
}

type Linha = {
  id: string
  tipo: string
  titulo: string
  mensagem: string
  acao: string | null
  lida_em: string | null
  criada_em: string
}

const daLinha = (r: Linha): NotificacaoVendedor => ({
  id: String(r.id),
  tipo: String(r.tipo),
  titulo: String(r.titulo),
  mensagem: String(r.mensagem),
  acao: r.acao ?? null,
  lidaEm: r.lida_em ? new Date(r.lida_em).getTime() : null,
  criadaEm: new Date(r.criada_em).getTime(),
})

export function useNotificacoesVendedor() {
  const [notificacoes, setNotificacoes] = useState<NotificacaoVendedor[]>([])

  const carregar = useCallback(async () => {
    const sessao = getSessao()
    if (!sessao?.id) return
    const { data } = await supabase
      .from('notificacoes_vendedor')
      .select('id,tipo,titulo,mensagem,acao,lida_em,criada_em')
      .order('criada_em', { ascending: false })
      .limit(30)
    if (data) setNotificacoes((data as Linha[]).map(daLinha))
  }, [])

  useEffect(() => {
    const sessao = getSessao()
    if (!sessao?.id) return

    void carregar()

    const canal = supabase
      .channel(`notif_vendedor_${sessao.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificacoes_vendedor', filter: `vendedor_id=eq.${sessao.id}` },
        payload => setNotificacoes(prev => [daLinha(payload.new as Linha), ...prev]),
      )
      .subscribe()

    return () => { void supabase.removeChannel(canal) }
  }, [carregar])

  const marcarLidas = useCallback(async () => {
    // Otimista: marcar como lido nao muda dinheiro nem estado do negocio, e
    // esperar a ida e volta so faria o contador piscar.
    setNotificacoes(prev => prev.map(n => n.lidaEm ? n : { ...n, lidaEm: Date.now() }))
    await supabase.rpc('marcar_notificacoes_vendedor_lidas')
  }, [])

  const naoLidas = notificacoes.filter(n => !n.lidaEm).length

  return { notificacoes, naoLidas, marcarLidas, recarregar: carregar }
}
