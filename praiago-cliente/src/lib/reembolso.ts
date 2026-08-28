// Janela de reembolso do cliente: 4 horas.
//
// O mesmo calculo mora no banco, em `public.prazo_reembolso` (migration
// 20260826190000). Aqui existe so para a tela poder mostrar o relogio e
// esconder o botao na hora certa. Se os dois discordarem, quem vence e o
// banco — a tela pode estar com o relogio do aparelho errado.

export const JANELA_REEMBOLSO_HORAS = 4
const JANELA_MS = JANELA_REEMBOLSO_HORAS * 60 * 60 * 1000

export type DadosPrazo = {
  /** Quando o vendedor confirmou a entrega. */
  entregueEm?: number | null
  /** Quando o pagamento foi aprovado. */
  pagoEm?: number | null
  /** Quando o pedido foi criado. Sempre existe. */
  data: number
}

/** Instante (ms) em que o prazo fecha. Mesma ordem de preferencia do banco. */
export function prazoReembolso(p: DadosPrazo): number {
  return (p.entregueEm || p.pagoEm || p.data) + JANELA_MS
}

export function dentroDoPrazo(p: DadosPrazo, agora = Date.now()): boolean {
  return agora <= prazoReembolso(p)
}

/** "3h 47min" / "12min" / "" quando ja passou. */
export function tempoRestante(p: DadosPrazo, agora = Date.now()): string {
  const falta = prazoReembolso(p) - agora
  if (falta <= 0) return ''
  const horas = Math.floor(falta / 3_600_000)
  const minutos = Math.floor((falta % 3_600_000) / 60_000)
  if (horas > 0) return `${horas}h ${minutos}min`
  if (minutos > 0) return `${minutos}min`
  return 'menos de 1min'
}
