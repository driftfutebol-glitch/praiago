export type ExternalRepasseOrder = {
  payment_provider?: string | null
  payment_status?: string | null
  settlement_status?: string | null
  status?: string | null
  reembolso_status?: string | null
  vendor_amount?: number | string | null
}

export function canRegisterExternalRepasse(order: ExternalRepasseOrder): boolean {
  return order.payment_provider === 'pagarme'
    && ['aprovado', 'pago'].includes(order.payment_status ?? '')
    && ['novo', 'preparando', 'pronto', 'saiu_entrega', 'entregando', 'entregue'].includes(order.status ?? '')
    && !['repasse_manual_pago', 'pago_split', 'pago', 'cancelado'].includes(order.settlement_status ?? '')
    && ['nenhum', 'rejeitado'].includes(order.reembolso_status ?? 'nenhum')
    && Number(order.vendor_amount) > 0
}

export function canConcludeExternalDelivery(order: ExternalRepasseOrder): boolean {
  return order.settlement_status === 'repasse_manual_pago'
    && ['aprovado', 'pago'].includes(order.payment_status ?? '')
    && ['saiu_entrega', 'entregando'].includes(order.status ?? '')
    && ['nenhum', 'rejeitado'].includes(order.reembolso_status ?? 'nenhum')
}

// Decimal BRL only: never reinterpret "1.072" as a value in thousands.
export function parseRepasseAmount(input: string): number | null {
  const text = input.trim()
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(text)) return null
  const value = Number(text.replace(',', '.'))
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null
}

export function validExceptionReason(reason: string): boolean {
  return reason.trim().length >= 15 && reason.trim().length <= 500
}
