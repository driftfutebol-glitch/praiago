import type { EventTicketQuote } from './eventTickets'

export const ticketMoney = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export function installmentSummary(quote: EventTicketQuote): string {
  if (quote.installments <= 1) return 'Pagamento à vista, sem juros.'
  if (!quote.remainder_cents) return `${quote.installments} parcelas de ${ticketMoney(quote.installment_floor)}. Total com juros: ${ticketMoney(quote.total)}.`
  return `${quote.remainder_cents} parcela(s) de ${ticketMoney(quote.installment_floor + .01)} e ${quote.installments - quote.remainder_cents} de ${ticketMoney(quote.installment_floor)}. Total com juros: ${ticketMoney(quote.total)}.`
}

export function cardValid(number: string, expiry: string, cvv: string, name: string, now = new Date()): string | null {
  const digits = number.replace(/\D/g, '')
  let sum = 0, double = false
  for (let index = digits.length - 1; index >= 0; index--) { let digit = Number(digits[index]); if (double) { digit *= 2; if (digit > 9) digit -= 9 } sum += digit; double = !double }
  if (digits.length < 13 || digits.length > 19 || /^([0-9])\1+$/.test(digits) || sum % 10 !== 0) return 'Confira o número do cartão.'
  if (name.trim().length < 2) return 'Informe o nome como está no cartão.'
  if (!/^\d{2}\/\d{2}$/.test(expiry)) return 'Informe a validade no formato MM/AA.'
  const [month, year] = expiry.split('/').map(Number), fullYear = 2000 + year
  if (month < 1 || month > 12 || fullYear < now.getFullYear() || (fullYear === now.getFullYear() && month < now.getMonth() + 1)) return 'O cartão está vencido ou a validade está incorreta.'
  if (!/^\d{3,4}$/.test(cvv)) return 'Confira o código de segurança (CVV).'
  return null
}
