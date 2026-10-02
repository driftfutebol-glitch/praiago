// Disposable PostgreSQL; no production data or payment gateway.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
process.on('uncaughtException', error => { console.error('SQL TEST FAILED:', error.message, error.where || ''); process.exit(1) })
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href)
const db=new PGlite()
let checks=0
const check=(a,b)=>{assert.deepEqual(a,b);checks++}
const rejects=async (sql,pattern)=>{await assert.rejects(db.query(sql),pattern);checks++}
const scalar=async sql=>(await db.query(sql)).rows[0].v
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333'
const seller='44444444-4444-4444-8444-444444444444',buyer='55555555-5555-4555-8555-555555555555'
await db.exec(`
create schema private; create role anon; create role authenticated; create role service_role;
create table public.produtos(id uuid primary key,vendedor_id uuid,nome text,preco numeric,categoria text,ativo boolean,estoque integer);
create table public.promocoes(produto_id uuid,desconto_tipo text,desconto_valor numeric,preco_promocional numeric,ativo boolean,publico boolean,data_inicio timestamptz,data_fim timestamptz);
create table public.payment_settings(id boolean,taxa_credito_cliente_percent numeric);
insert into public.payment_settings values(true,5);
create table public.pedidos(id uuid primary key default gen_random_uuid(),cliente_id uuid,vendedor_id uuid,itens_detalhe jsonb,itens text[],pagamento text,
 discount_code text,discount_amount numeric,subtotal_amount numeric,credit_surcharge_amount numeric,total numeric,gross_amount numeric,platform_fee_amount numeric,vendor_amount numeric,
 status text default 'novo',payment_status text default 'presencial',refunded_at timestamptz,estoque_baixado boolean default false);
insert into public.produtos values('${a}','${seller}','Calabresa',43,'Pizza',true,null),('${b}','${seller}','Da casa',70,'Pizza',true,null),
 ('${c}','${seller}','Chocolate broto',30,'Pizza',true,null);
`)
await db.exec(await readFile(new URL('../migrations/20260928200000_menu_half_pizza.sql',import.meta.url),'utf8'))
await db.exec(`
create trigger price before insert on public.pedidos for each row execute function public.validar_preco_pedido();
create trigger stock after insert or update of status,payment_status,refunded_at on public.pedidos for each row execute function public.mover_estoque_do_pedido();
update public.produtos set pizza_meio_a_meio=true,pizza_tamanho='Grande' where id in ('${a}','${b}');
update public.produtos set pizza_meio_a_meio=true,pizza_tamanho='Broto' where id='${c}';
`)
const item=(first,second,qtd=1)=>({produto_id:first,...(second?{segundo_sabor_id:second}:{}),qtd})
const insert=(items,extra='')=>`insert into public.pedidos(cliente_id,vendedor_id,itens_detalhe,itens,total,${extra?'pagamento,discount_code,discount_amount':'pagamento'})
 values('${buyer}','${seller}','${JSON.stringify(items)}'::jsonb,array['FAKE CLIENT NAME','Talheres: enviar'],0,${extra||"'dinheiro'"}) returning subtotal_amount::text as v`
check(await scalar(insert([item(a,b)])),'56.50')
check(await scalar(insert([item(a)])),'43.00')
check(await scalar(insert([item(a,b,2)])),'113.00')
check(await scalar(`select itens[1] as v from public.pedidos order by total desc limit 1`),'2x Pizza meio a meio (Grande): ½ Calabresa + ½ Da casa')
check(await scalar(`select itens[2] as v from public.pedidos order by total desc limit 1`),'Talheres: enviar')
check(await scalar(`select (itens_detalhe->0->>'preco_unitario')::numeric::text as v from public.pedidos where total=56.50 limit 1`),'56.50')
await rejects(insert([item(a,c)]),/Sabores invalidos/)
await rejects(insert([item(a,a)]),/Sabores invalidos/)
await rejects(insert([item(a,'99999999-9999-4999-8999-999999999999')]),/Sabores invalidos/)
await rejects(insert([item(a,b,0)]),/Quantidade invalida/)
await rejects(insert([item(a,b,1.5)]),/Quantidade invalida/)
await rejects(insert([item(a,b,1000)]),/Quantidade invalida/)
await rejects(insert([]),/sem itens/)
await db.exec(`update public.produtos set pizza_meio_a_meio=false where id='${b}'`)
await rejects(insert([item(a,b)]),/Sabores invalidos/)
await db.exec(`update public.produtos set pizza_meio_a_meio=true,vendedor_id='${buyer}' where id='${b}'`)
await rejects(insert([item(a,b)]),/Sabores invalidos/)
await db.exec(`update public.produtos set vendedor_id='${seller}',ativo=false where id='${b}'`)
await rejects(insert([item(a,b)]),/Sabores invalidos/)
await db.exec(`update public.produtos set ativo=true where id='${b}';update public.produtos set estoque=1 where id in ('${a}','${b}')`)
await rejects(insert([item(a),item(a,b)]),/Restam so 1/)
check(await scalar(insert([item(a,b,2)])),'113.00')
check(await scalar(`select estoque as v from public.produtos where id='${a}'`),0)
await rejects(insert([item(a,b)]),/esgotou/)
await db.exec(`update public.pedidos set status='cancelado' where total=113 and estoque_baixado=true`)
check(await scalar(`select estoque as v from public.produtos where id='${a}'`),1)
await db.exec(`update public.produtos set estoque=null;update public.produtos set preco=43.01 where id='${a}'`)
check(await scalar(insert([item(a,b)])),'56.51')
await db.exec(`insert into public.promocoes values('${b}','preco_promocional',null,60,true,true,now()-interval '1 day',null)`)
check(await scalar(insert([item(a,b)])),'51.51')
const credit=(await db.query(insert([item(a,b)],"'credito_online','FIXTURE',10"))).rows[0]
check(credit.v,'51.51')
check(await scalar(`select total::text as v from public.pedidos where pagamento='credito_online'`),'43.59')
await rejects(`update public.produtos set pizza_tamanho=null where id='${a}'`,/produtos_pizza_config_valid/)
await rejects(`update public.produtos set menu_secao='' where id='${a}'`,/produtos_menu_secao_valid/)
await rejects(`update public.produtos set menu_secao=repeat('x',61) where id='${a}'`,/produtos_menu_secao_valid/)
await db.exec(`update public.produtos set menu_secao='Combos da casa' where id='${a}'`)
check(await scalar(`select menu_secao as v from public.produtos where id='${a}'`),'Combos da casa')
await db.exec('set role authenticated')
await rejects(`select private.preco_produto_cardapio('${a}')`,/permission denied/)
await db.exec('reset role')
console.log(`PASS: ${checks} menu/half-pizza PostgreSQL assertions; zero external requests.`)
await db.close()
