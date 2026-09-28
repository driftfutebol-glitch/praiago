import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canRegisterExternalRepasse, canConcludeExternalDelivery, parseRepasseAmount, validExceptionReason } from '../src/lib/adminExceptions.ts'

const order = { payment_provider: 'pagarme', payment_status: 'aprovado', settlement_status: 'pendente', status: 'entregando', vendor_amount: '96.48', reembolso_status: 'nenhum' }
test('approved online delivery can receive external settlement', () => assert.equal(canRegisterExternalRepasse(order), true))
for (const [field, values] of Object.entries({
  payment_provider: ['manual', null],
  payment_status: ['pendente', 'estornado', null],
  settlement_status: ['repasse_manual_pago', 'pago_split', 'pago', 'cancelado'],
  status: ['cancelado', null, 'aguardando_pagamento'],
  vendor_amount: [0, null, -1],
  reembolso_status: ['solicitado', 'aprovado'],
})) for (const value of values) test(`external repasse rejects ${field}=${value}`, () => assert.equal(canRegisterExternalRepasse({ ...order, [field]: value }), false))
test('administrative delivery requires paid external settlement', () => {
  assert.equal(canConcludeExternalDelivery(order), false)
  assert.equal(canConcludeExternalDelivery({ ...order, settlement_status: 'repasse_manual_pago' }), true)
  assert.equal(canConcludeExternalDelivery({ ...order, settlement_status: 'repasse_manual_pago', status: 'entregue' }), false)
  assert.equal(canConcludeExternalDelivery({ ...order, settlement_status: 'repasse_manual_pago', reembolso_status: 'solicitado' }), false)
})
test('strict centavo parser accepts comma and dot, not ambiguous amounts', () => {
  for (const amount of ['96,48', '96.48', ' 96,48 ']) assert.equal(parseRepasseAmount(amount), 96.48)
  for (const amount of ['1.072', '1.000,00', '96,481', '-96,48', '', '0', 'NaN', '1e2', 'R$ 96,48']) assert.equal(parseRepasseAmount(amount), null)
})
test('audit reason cannot be blank, too short or too long', () => {
  for (const reason of ['', 'ok', ' '.repeat(20), 'a'.repeat(501)]) assert.equal(validExceptionReason(reason), false)
  assert.equal(validExceptionReason('Repasse conferido com o responsável pela loja.'), true)
})
