import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalSourceUrl, eventIdentity, isPraiaGrande, parseLot, parseSymplaListing, priceSituation } from './rules.ts'

test('somente evidência explícita permite anunciar gratuidade', () => {
  assert.equal(priceSituation({ price: 0, ticketsWithPositivePrice: 0 }), 'a_confirmar')
  assert.equal(priceSituation({ price: null, ticketsWithPositivePrice: 0, description: 'Entrada franca para todos' }), 'gratuito')
  assert.equal(priceSituation({ price: 0, ticketsWithPositivePrice: 1, description: 'Entrada gratuita para crianças' }), 'pago')
  assert.equal(priceSituation({ price: 30, ticketsWithPositivePrice: 0 }), 'pago')
  assert.equal(priceSituation({ price: null, ticketsWithPositivePrice: 0, description: 'Entrada: R$ 35 + consumo' }), 'pago')
})

test('Praia Grande não aceita cidades vizinhas nem nomes de fonte como local', () => {
  assert.equal(isPraiaGrande({ titulo: 'Show de Verão', local_nome: 'Arena PG', cidade: 'Praia Grande' }), true)
  assert.equal(isPraiaGrande({ titulo: 'Show em Praia Grande', cidade: 'Palmas' }), false)
  assert.equal(isPraiaGrande({ titulo: 'Show de Verão', local_nome: 'Teatro Municipal', cidade: 'Santos' }), false)
  assert.equal(isPraiaGrande({ titulo: 'Luau Ocian', local_nome: 'Ocian Restaurante' }), true)
  assert.equal(isPraiaGrande({ titulo: 'Show de Verão', local_nome: 'Guichê Web Praia Grande', cidade: 'Santos' }), false)
  assert.equal(isPraiaGrande({ titulo: 'Curso online', local_nome: 'O evento será online - Praia Grande', cidade: 'Praia Grande' }), false)
})

test('primeiro e segundo lote não são confundidos com promoção', () => {
  assert.deepEqual(parseLot('Pista - Primeiro Lote'), { ordem: 1, grupo: 'pista' })
  assert.deepEqual(parseLot('Pista - 2º Lote'), { ordem: 2, grupo: 'pista' })
  assert.deepEqual(parseLot('Pista - Lote Promocional'), { ordem: 0, grupo: 'pista' })
  assert.deepEqual(parseLot('Camarote', 'segundo lote'), { ordem: 2, grupo: 'camarote' })
})

test('identidade ignora acento e parâmetros de rastreamento', () => {
  assert.equal(eventIdentity('Festa na Ocian!', '2026-10-10'), eventIdentity('festa na ócian', '2026-10-10'))
  assert.equal(canonicalSourceUrl('https://site.com/evento/?utm_source=ig&ref=feed&id=7'), 'https://site.com/evento?id=7')
})

test('lista estruturada da Sympla é lida sem depender de classes CSS', () => {
  const packet = '2f:["$","$L3e",null,{"searchDataResult":{"data":[{"name":"Luau na praia","location":{"city":"Praia Grande"}}]}}]'
  const html = `<script>self.__next_f.push([1,${JSON.stringify(packet)}])</script>`
  assert.equal(parseSymplaListing(html)[0].name, 'Luau na praia')
})
