import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// Conversa de um pedido, ligada ao banco.
//
// Este hook e copiado identico no cliente, no ambulante e no restaurante —
// builds separados, sem pacote comum. O contrato (tabela, colunas, canal)
// tem que mudar nos tres juntos.
//
// Quem decide de que lado a pessoa esta e o banco, pelo gatilho
// preparar_mensagem_pedido. O app manda so o texto; papel e autor vem
// carimbados de la. E por isso que aqui nao existe nenhum campo "sou o
// vendedor" — se existisse, daria para mentir.

export type MensagemPedido = {
  id: string
  pedidoId: string
  autorId: string
  papel: 'cliente' | 'vendedor'
  texto: string
  criadaEm: number
  lidaEm: number | null
}

type LinhaCrua = {
  id: string
  pedido_id: string
  autor_id: string
  autor_papel: string
  texto: string
  criada_em: string
  lida_em: string | null
}

function daLinha(r: LinhaCrua): MensagemPedido {
  return {
    id: String(r.id),
    pedidoId: String(r.pedido_id),
    autorId: String(r.autor_id),
    papel: r.autor_papel === 'vendedor' ? 'vendedor' : 'cliente',
    texto: String(r.texto ?? ''),
    criadaEm: new Date(String(r.criada_em)).getTime(),
    lidaEm: r.lida_em ? new Date(String(r.lida_em)).getTime() : null,
  }
}

export function useChatPedido(pedidoId: string | null, aberto: boolean) {
  const [mensagens, setMensagens] = useState<MensagemPedido[]>([])
  const [carregando, setCarregando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const vistos = useRef<Set<string>>(new Set())

  const acrescentar = useCallback((m: MensagemPedido) => {
    if (vistos.current.has(m.id)) return
    vistos.current.add(m.id)
    setMensagens(prev => [...prev, m].sort((a, b) => a.criadaEm - b.criadaEm))
  }, [])

  useEffect(() => {
    if (!pedidoId || !aberto) return

    let vivo = true
    vistos.current = new Set()
    setMensagens([])
    setErro(null)
    setCarregando(true)

    async function carregar() {
      const { data, error } = await supabase
        .from('mensagens_pedido')
        .select('id,pedido_id,autor_id,autor_papel,texto,criada_em,lida_em')
        .eq('pedido_id', pedidoId)
        .order('criada_em', { ascending: true })
        .limit(200)

      if (!vivo) return
      setCarregando(false)

      if (error) {
        console.error('Erro ao carregar conversa', { code: error.code })
        setErro('Não foi possível abrir a conversa agora.')
        return
      }
      for (const linha of (data ?? []) as LinhaCrua[]) acrescentar(daLinha(linha))

      // Silencioso de proposito: falhar em marcar como lida nao atrapalha
      // ninguem a conversar.
      void supabase.rpc('marcar_mensagens_lidas', { p_pedido_id: pedidoId })
    }

    void carregar()

    const canal = supabase
      .channel(`chat_pedido_${pedidoId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensagens_pedido', filter: `pedido_id=eq.${pedidoId}` },
        payload => { if (vivo) acrescentar(daLinha(payload.new as LinhaCrua)) },
      )
      .subscribe()

    return () => {
      vivo = false
      void supabase.removeChannel(canal)
    }
  }, [pedidoId, aberto, acrescentar])

  const enviar = useCallback(async (texto: string): Promise<boolean> => {
    const limpo = texto.trim()
    if (!pedidoId || !limpo) return false

    setEnviando(true)
    setErro(null)

    // Manda so o texto. `autor_id` e `autor_papel` sao NOT NULL, mas o gatilho
    // BEFORE INSERT os preenche antes de o Postgres conferir as restricoes —
    // entao omitir aqui e o certo: o app nunca declara quem ele e.
    //
    // Tambem nao ha insercao otimista: a mensagem so aparece na tela depois
    // que o banco aceitou. O chat antigo mostrava texto que jamais saiu do
    // aparelho, e nao vale repetir isso de outro jeito.
    const { data, error } = await supabase
      .from('mensagens_pedido')
      .insert({ pedido_id: pedidoId, texto: limpo })
      .select('id,pedido_id,autor_id,autor_papel,texto,criada_em,lida_em')
      .maybeSingle()

    setEnviando(false)

    if (error) {
      console.error('Erro ao enviar mensagem', { code: error.code })
      setErro(error.message || 'Não foi possível enviar. Tente de novo.')
      return false
    }
    if (data) acrescentar(daLinha(data as LinhaCrua))
    return true
  }, [pedidoId, acrescentar])

  return { mensagens, carregando, enviando, erro, enviar }
}
