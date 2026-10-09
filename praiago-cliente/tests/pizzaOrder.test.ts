import { beforeEach, expect, it, vi } from 'vitest'
const mock=vi.hoisted(() => ({ payload:null as Record<string,unknown>|null, inserts:vi.fn() }))
vi.mock('../src/lib/supabase',() => ({supabase:{from:(table:string) => {
  const chain:any={
    select:()=>chain,eq:()=>chain,in:()=>chain,is:()=>chain,order:()=>chain,
    limit:async()=>({data:[],error:null}),
    maybeSingle:async()=>({data:table==='payment_settings'?{platform_fee_percent:10,platform_fee_fixed:0,presencial_fee_mode:'cobrar_vendedor'}:null,error:null}),
    insert:(payload:Record<string,unknown>)=>{mock.payload=payload;mock.inserts();return {select:()=>({single:async()=>({data:{...payload,id:'fixture-order',created_at:new Date().toISOString()},error:null})})}},
  };return chain
}}}))
import { useStore } from '../src/store/useStore'
import { useCatalogo } from '../src/store/useCatalogo'
import { pizzaCartKey } from '../src/lib/pizzaCart'
import type { Vendedor } from '../src/lib/catalogo'
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222'
const seller='33333333-3333-4333-8333-333333333333'
const base={desc:'Ingredientes',emoji:'',categoria:'Pizza',estoque:null,pizza_meio_a_meio:true,pizza_tamanho:'Grande'}
const vendor:Vendedor={id:seller,nome:'Loja de teste isolado',categoria:'Pizzaria',avaliacao:0,avaliacoes:0,tempo:'',distancia:'',emoji:'',gradiente:'',aberto:true,localizacaoConfirmada:true,image:'',pos:[0,0],zona:'',endereco:null,horarios:null,tipo:'restaurante',produtos:[{...base,id:a,nome:'Calabresa',preco:43},{...base,id:b,nome:'Da casa',preco:70}]}
beforeEach(()=>{mock.payload=null;mock.inserts.mockClear();useCatalogo.setState({vendedores:[vendor]});useStore.setState({sessao:{id:'44444444-4444-4444-8444-444444444444',email:'fixture@example.invalid',nome:'Teste isolado',contaDemo:false},carrinhoVendedor:seller,carrinho:{[pizzaCartKey(a,b)]:2},pedidos:[]})})
it('envia IDs dos dois sabores, quantidade e descrição ao pedido, sem ID virtual no banco',async()=>{
  const result=await useStore.getState().criarPedido({reta:'',barraca:'',modo:'fixa',pagamento:'dinheiro',talheres:true})
  expect(result?.total).toBe(113)
  expect(mock.payload?.itens_detalhe).toEqual([{produto_id:a,segundo_sabor_id:b,qtd:2}])
  expect(mock.payload?.itens).toEqual(['2x Pizza meio a meio (Grande): ½ Calabresa + ½ Da casa','Talheres: enviar'])
  expect(useStore.getState().carrinho).toEqual({})
})
it('não perde silenciosamente uma combinação que ficou indisponível',async()=>{
  useCatalogo.setState({vendedores:[{...vendor,produtos:[vendor.produtos[0]]}]})
  await expect(useStore.getState().criarPedido({reta:'',barraca:'',modo:'fixa',pagamento:'dinheiro'})).rejects.toThrow(/indisponível/)
  expect(mock.inserts).not.toHaveBeenCalled()
  expect(useStore.getState().carrinho[pizzaCartKey(a,b)]).toBe(2)
})
