import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getSessao } from '../lib/auth'

// O chamado de verificacao da conta, do lado do vendedor.
//
// Copiado identico no ambulante e no restaurante.
//
// Por que existe: a geracao automatica do link de KYC esta bloqueada na
// Pagar.me (401 no endpoint publico, de qualquer IP). Ate liberarem, alguem
// gera o link no painel e responde o chamado. Este hook e o que faz o
// vendedor NAO ficar no escuro nesse meio tempo — ele ve o chamado aberto, a
// resposta chegando e o encerramento, sem precisar perguntar nada a ninguem.
//
// Realtime nas duas tabelas: `tickets` para o status (aberto -> em andamento
// -> resolvido) e `ticket_mensagens` para a conversa. Sem o primeiro, a tela
// nunca fecharia sozinha quando a conta fosse aprovada.

export type MensagemChamado = {
  id: string
  autor: string
  mensagem: string
  criadaEm: number
}

export type Chamado = {
  id: string
  status: string
  assunto: string
  criadoEm: number
}

type LinhaTicket = { id: string; status: string; assunto: string; created_at: string }
type LinhaMensagem = { id: string; autor: string; mensagem: string; created_at: string }

const ABERTOS = ['aberto', 'em_andamento']

/** Primeiro endereco http(s) da mensagem. E assim que o link chega. */
export function extrairLink(texto: string): string | null {
  const m = texto.match(/https?:\/\/[^\s<>"')]+/)
  return m ? m[0] : null
}

export function useChamadoKyc() {
  const [chamado, setChamado] = useState<Chamado | null>(null)
  const [mensagens, setMensagens] = useState<MensagemChamado[]>([])
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    const sessao = getSessao()
    if (!sessao?.id) { setCarregando(false); return }

    // Inclui 'resolvido' de proposito: quando a conta e aprovada o chamado
    // fecha, e o vendedor precisa VER que fechou. Some depois que ele confirma.
    const { data } = await supabase
      .from('tickets')
      .select('id,status,assunto,created_at')
      .eq('usuario_id', sessao.id)
      .eq('origem', 'kyc')
      .in('status', [...ABERTOS, 'resolvido'])
      .order('created_at', { ascending: false })
      .limit(1)

    const linha = (data as LinhaTicket[] | null)?.[0]
    if (!linha) {
      setChamado(null)
      setMensagens([])
      setCarregando(false)
      return
    }

    setChamado({
      id: linha.id,
      status: linha.status,
      assunto: linha.assunto,
      criadoEm: new Date(linha.created_at).getTime(),
    })

    const { data: msgs } = await supabase
      .from('ticket_mensagens')
      .select('id,autor,mensagem,created_at')
      .eq('ticket_id', linha.id)
      .order('created_at', { ascending: true })

    setMensagens(((msgs as LinhaMensagem[] | null) ?? []).map(m => ({
      id: m.id,
      autor: m.autor,
      mensagem: m.mensagem,
      criadaEm: new Date(m.created_at).getTime(),
    })))
    setCarregando(false)
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  // O chamado nasce na tela da Carteira, e o painel mora no App. Realtime nao
  // resolve isto: a assinatura e por ticket_id, e o ticket ainda nao existia
  // quando o painel montou. O evento fecha essa lacuna sem transformar o
  // painel num vigia que consulta o banco de tempos em tempos.
  useEffect(() => {
    const aoAbrir = () => { void carregar() }
    window.addEventListener('praiago:chamado-kyc', aoAbrir)
    return () => window.removeEventListener('praiago:chamado-kyc', aoAbrir)
  }, [carregar])

  useEffect(() => {
    if (!chamado?.id) return
    const canal = supabase
      .channel(`chamado_kyc_${chamado.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ticket_mensagens', filter: `ticket_id=eq.${chamado.id}` },
        payload => {
          const m = payload.new as LinhaMensagem
          setMensagens(prev => prev.some(x => x.id === m.id) ? prev : [...prev, {
            id: m.id, autor: m.autor, mensagem: m.mensagem, criadaEm: new Date(m.created_at).getTime(),
          }])
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tickets', filter: `id=eq.${chamado.id}` },
        payload => {
          const t = payload.new as LinhaTicket
          setChamado(c => c ? { ...c, status: t.status } : c)
        },
      )
      .subscribe()

    return () => { void supabase.removeChannel(canal) }
  }, [chamado?.id])

  const aberto = !!chamado && ABERTOS.includes(chamado.status)
  const resolvido = chamado?.status === 'resolvido'

  // O link mais recente que o atendimento mandou. So conta mensagem de
  // gente do suporte: link que o proprio vendedor colar nao vira botao.
  const linkVerificacao = [...mensagens]
    .reverse()
    .filter(m => m.autor === 'admin')
    .map(m => extrairLink(m.mensagem))
    .find(Boolean) ?? null

  return { chamado, mensagens, carregando, aberto, resolvido, linkVerificacao, recarregar: carregar }
}
