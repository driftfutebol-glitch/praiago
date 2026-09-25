import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../src/lib/supabase', () => import('./supabaseDouble'))
import { useCatalogo, iniciarCatalogo } from '../src/store/useCatalogo'
import { resetScenario, scenario, supabase } from './supabaseDouble'

const seller = { id: 'loja-teste', nome: 'Coco na Areia', role: 'ambulante', verificado: true, status: 'ativo', online: true, lat: -24.008, lng: -46.412, horarios: null }
const product = { id: 'coco', vendedor_id: seller.id, nome: 'Água de coco', preco: 10, ativo: true, estoque: 0 }
beforeEach(() => { resetScenario(); useCatalogo.setState({ vendedores: [], loading: true, refreshing: false, error: null }); scenario.tables.produtos = [{ ...product }]; scenario.tables.vendedores_publicos = [{ ...seller }] })

describe('Catálogo real: integridade e recuperação', () => {
  it('mantém estoque zero como esgotado e não como ilimitado', async () => {
    await useCatalogo.getState().carregar()
    expect(useCatalogo.getState().vendedores[0].produtos[0].estoque).toBe(0)
    expect(useCatalogo.getState().error).toBeNull()
    expect(scenario.calls.every(call => call.fields !== '*')).toBe(true)
  })
  it.each([{ verificado: false }, { status: 'banido' }, { status: 'pendente' }, { lat: null }])('não expõe vendedor inelegível %j', async change => {
    scenario.tables.vendedores_publicos = [{ ...seller, ...change }]
    await useCatalogo.getState().carregar()
    expect(useCatalogo.getState().vendedores).toEqual([])
  })
  it('deduplica chamadas concorrentes', async () => {
    const a = useCatalogo.getState().carregar(), b = useCatalogo.getState().carregar()
    expect(a).toBe(b)
    await Promise.all([a, b])
    expect(scenario.calls.filter(c => c.table === 'produtos')).toHaveLength(1)
  })
  it('mantém o último catálogo válido quando há falha e permite tentar de novo', async () => {
    await useCatalogo.getState().carregar()
    scenario.errors.produtos = new Error('offline')
    await useCatalogo.getState().carregar()
    expect(useCatalogo.getState().vendedores).toHaveLength(1)
    expect(useCatalogo.getState().error).not.toBeNull()
    expect(useCatalogo.getState().refreshing).toBe(false)
    delete scenario.errors.produtos
    await useCatalogo.getState().carregar()
    expect(useCatalogo.getState().error).toBeNull()
  })
  it('termina o skeleton em falha inicial sem fingir catálogo vazio válido', async () => {
    scenario.errors.promocoes = new Error('timeout')
    await useCatalogo.getState().carregar()
    expect(useCatalogo.getState().loading).toBe(false)
    expect(useCatalogo.getState().error).not.toBeNull()
  })
  it('pagina para não cortar catálogos maiores que 1000 produtos', async () => {
    scenario.tables.produtos = Array.from({ length: 1001 }, (_, id) => ({ ...product, id: String(id) }))
    await useCatalogo.getState().carregar()
    expect(useCatalogo.getState().vendedores[0].produtos).toHaveLength(1001)
    expect(scenario.calls.filter(c => c.table === 'produtos')).toHaveLength(3)
  })
  it('aplica promoção válida e preserva o preço original', async () => {
    scenario.tables.promocoes = [{ id: 'oferta', produto_id: product.id, ativo: true, publico: true, desconto_tipo: 'percentual', desconto_valor: 20 }]
    await useCatalogo.getState().carregar()
    const p = useCatalogo.getState().vendedores[0].produtos[0]
    expect(p.preco).toBe(8); expect(p.precoOriginal).toBe(10)
  })
  it('encerra realtime somente depois que o último consumidor sai', async () => {
    const remove = vi.spyOn(supabase, 'removeChannel')
    const stopA = iniciarCatalogo(), stopB = iniciarCatalogo()
    await useCatalogo.getState().carregar()
    stopA(); stopA(); expect(remove).not.toHaveBeenCalled()
    stopB(); expect(remove).toHaveBeenCalledTimes(1)
  })
})
