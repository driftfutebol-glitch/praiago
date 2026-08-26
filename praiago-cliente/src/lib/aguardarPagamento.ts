// Espera a confirmacao de um pagamento sem martelar o servidor.
//
// O problema que isso resolve: cada tela tinha o seu proprio setInterval fixo
// (5s no checkout, 12s em Meus Pedidos) que rodava para sempre, mesmo com o
// app em segundo plano e mesmo para pedido que ja nem existia mais no banco
// (a rotina dos 7 dias arquiva os que ficam presos em pagamento). Resultado:
// milhares de chamadas por dia a uma edge function que so podia responder
// "nao encontrado".
//
// A regra aqui:
//
//   1. O sinal principal e o realtime na linha do pedido — o servidor avisa,
//      ninguem fica perguntando.
//   2. O poll e rede de seguranca (o webhook do gateway pode atrasar), com
//      intervalo que cresce: 4s, 8s, 15s, 30s, 60s e para em 60s.
//   3. Aba escondida nao pergunta nada. Ao voltar, pergunta uma vez na hora.
//   4. Tem prazo. Passou o orcamento de tempo, desiste e avisa a tela.
//   5. Pedido que sumiu do banco encerra a espera na hora e para sempre.
import { supabase } from './supabase'
import { verificarPagamentoSeguro } from './pagamento'

export type FimDaEspera =
  | 'aprovado'   // dinheiro confirmado
  | 'recusado'   // gateway negou em definitivo
  | 'sumiu'      // pedido nao existe mais (expirou e foi arquivado)
  | 'prazo'      // acabou o orcamento de tempo desta espera

type Opcoes = {
  /** Quanto tempo no total vale a pena esperar. Padrao: 15 minutos. */
  orcamentoMs?: number
  /** Chamado uma unica vez, quando a espera termina. */
  aoTerminar: (fim: FimDaEspera) => void
}

const ESCADA_MS = [4_000, 8_000, 15_000, 30_000, 60_000]

/**
 * Comeca a esperar. Devolve a funcao que cancela — chame no cleanup do efeito.
 * `aoTerminar` roda no maximo uma vez e nunca depois do cancelamento.
 */
export function aguardarPagamento(pedidoId: string, { orcamentoMs = 15 * 60_000, aoTerminar }: Opcoes): () => void {
  let vivo = true
  let passo = 0
  let timer: number | undefined
  const comecou = Date.now()

  function encerrar(fim: FimDaEspera) {
    if (!vivo) return
    vivo = false
    window.clearTimeout(timer)
    document.removeEventListener('visibilitychange', aoVoltar)
    void supabase.removeChannel(canal)
    aoTerminar(fim)
  }

  function julgar(status: string | null | undefined): boolean {
    if (status === 'aprovado' || status === 'pago') { encerrar('aprovado'); return true }
    if (status === 'recusado' || status === 'cancelado' || status === 'estornado') { encerrar('recusado'); return true }
    return false
  }

  // Sinal principal: o proprio banco avisa quando o webhook do gateway grava.
  const canal = supabase
    .channel(`pgto_${pedidoId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `id=eq.${pedidoId}` },
      payload => { julgar((payload.new as { payment_status?: string | null })?.payment_status) },
    )
    .subscribe()

  async function perguntar() {
    if (!vivo) return

    if (Date.now() - comecou > orcamentoMs) { encerrar('prazo'); return }

    // Em segundo plano ninguem esta olhando a tela: o realtime cobre o caso de
    // o pagamento cair enquanto o app dorme.
    if (document.visibilityState !== 'visible') { agendar(); return }

    const r = await verificarPagamentoSeguro(pedidoId)
    if (!vivo) return

    if (r.estado === 'sumiu') { encerrar('sumiu'); return }
    if (r.estado === 'ok' && julgar(r.paymentStatus)) return

    // Falha de rede nao acelera nem para a espera: so cai na proxima volta.
    agendar()
  }

  function agendar() {
    if (!vivo) return
    const espera = ESCADA_MS[Math.min(passo, ESCADA_MS.length - 1)]
    passo += 1
    timer = window.setTimeout(() => { void perguntar() }, espera)
  }

  function aoVoltar() {
    // Voltou para a tela: confere uma vez agora, sem esperar o proximo tique.
    if (!vivo || document.visibilityState !== 'visible') return
    window.clearTimeout(timer)
    void perguntar()
  }

  document.addEventListener('visibilitychange', aoVoltar)
  void perguntar()

  return () => {
    if (!vivo) return
    vivo = false
    window.clearTimeout(timer)
    document.removeEventListener('visibilitychange', aoVoltar)
    void supabase.removeChannel(canal)
  }
}
