// Disposable PostgreSQL (PGlite). No credentials and no production connection.
// node supabase/tests/admin_external_repasse.test.mjs <path-to-pglite-index.js>
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
process.on('uncaughtException', error => {
  console.error('SQL TEST FAILED:', error.message, error.code ?? '', error.where ?? '')
  process.exit(1)
})

const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href)
const db = new PGlite()
const migration = await readFile(new URL('../migrations/20260928120000_admin_external_repasse.sql', import.meta.url), 'utf8')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const admin = id(1), seller = id(2), buyer = id(3), order = id(4), ledger = id(5), ticket = id(6)
const reason = 'Repasse conferido por responsável; operação realizada fora do aplicativo.'
let checks = 0
const check = (value, expected) => { assert.deepEqual(value, expected); checks++ }
const scalar = async sql => (await db.query(sql)).rows[0].v
const rejects = async (sql, regex) => { await assert.rejects(db.query(sql), regex); checks++ }
await db.exec(`
  create schema auth; create schema private;
  create role anon; create role authenticated; create role service_role;
  grant usage on schema public, private, auth to authenticated, anon, service_role;
  create function auth.uid() returns uuid language sql as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql as $$
    select nullif(current_setting('request.jwt.claim.role', true), '') $$;
  create table public.profiles(id uuid primary key, role text, status text, permissions text[]);
  create function private.has_permission(section text) returns boolean language sql as $$
    select exists(select 1 from public.profiles where id=auth.uid() and role='admin'
      and status='ativo' and section=any(permissions)) $$;
  create function public.account_can_write(subject uuid) returns boolean language sql as $$
    select exists(select 1 from public.profiles where id=subject and status='ativo') $$;
  create function private.account_deletion_forbids_subject(subject uuid) returns boolean language sql as $$ select false $$;
  create table public.pedidos(id uuid primary key, vendedor_id uuid, payment_status text, payment_provider text,
    status text, reembolso_status text, vendor_amount numeric, settlement_status text,
    entrega_confirmada boolean default false, entrega_confirmada_em timestamptz, entrega_confirmada_por uuid);
  create table public.financial_ledger(id uuid primary key default gen_random_uuid(), pedido_id uuid, vendedor_id uuid,
    tipo text, valor numeric not null, status text not null, provider text, settled_at timestamptz, disponivel_em timestamptz,
    external_reference text, descricao text, created_at timestamptz default now());
  create table public.payouts(id uuid primary key default gen_random_uuid(), vendedor_id uuid, valor numeric,
    status text, provider text, ledger_entry_id uuid references public.financial_ledger(id), chave_pix text);
  create table public.wallets(vendedor_id uuid primary key, saldo_a_liberar numeric, saldo_disponivel numeric,
    total_sacado numeric, updated_at timestamptz);
  create table public.seller_recipients(vendedor_id uuid primary key, recipient_id text, provider text);
  create table public.tickets(id uuid primary key, origem text, status text, nao_lida_admin boolean, nao_lida_usuario boolean, updated_at timestamptz);
  create table public.security_audit_logs(id uuid default gen_random_uuid(), event_type text, severity text,
    platform text, user_id uuid, actor_id uuid, route text, metadata jsonb);
  create function public.block_unconfirmed_delivery() returns trigger language plpgsql as $$
    begin
      if new.status='entregue' and old.status<>'entregue'
        and coalesce(current_setting('praiago.delivery_confirmed',true),'')<>'true' then
        raise exception 'Entrega precisa ser confirmada pelo codigo do cliente.';
      end if;
      return new;
    end; $$;
  create trigger block_delivery before update on public.pedidos for each row execute function public.block_unconfirmed_delivery();
  insert into public.profiles values ('${admin}','admin','ativo',array['financeiro','pedidos','atendimento']),
    ('${seller}','restaurante','ativo',null), ('${buyer}','cliente','ativo',null);
  insert into public.pedidos values ('${order}','${seller}','aprovado','pagarme','entregando','nenhum',96.48,'pendente',false,null,null);
  insert into public.financial_ledger(id,pedido_id,vendedor_id,tipo,valor,status,provider)
    values ('${ledger}','${order}','${seller}','repasse_vendedor',96.48,'pendente','manual');
  insert into public.financial_ledger(pedido_id,vendedor_id,tipo,valor,status,provider)
    values ('${order}','${seller}','taxa_plataforma',10.72,'pendente','manual');
  insert into public.seller_recipients values ('${seller}','fixture-only','pagarme');
  insert into public.tickets values ('${ticket}','kyc','aberto',true,true,now());
`)
await db.exec(migration)
await db.exec(`select set_config('request.jwt.claim.sub','${seller}',false)`)
await rejects(`select public.admin_registrar_repasse_externo('${order}',96.48,'${reason}')`, /Sem permissao financeira/)
await rejects(`select public.admin_concluir_entrega_externa('${order}','${reason}')`, /Sem permissao/)
await rejects(`select public.admin_encerrar_aviso_kyc('${ticket}','${reason}')`, /Sem permissao/)
check(await scalar(`select has_function_privilege('anon','public.admin_registrar_repasse_externo(uuid,numeric,text)','EXECUTE') as v`), false)
check(await scalar(`select has_function_privilege('authenticated','private.admin_registrar_repasse_externo(uuid,numeric,text)','EXECUTE') as v`), false)
await db.exec(`select set_config('request.jwt.claim.sub','',false)`)
await rejects(`select public.admin_registrar_repasse_externo('${order}',96.48,'${reason}')`, /Sem permissao/)
await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`)
await rejects(`select public.admin_registrar_repasse_externo('${order}',107.20,'${reason}')`, /Valor diferente/)
await rejects(`select public.admin_registrar_repasse_externo('${order}',96.481,'${reason}')`, /duas casas/)
await rejects(`select public.admin_registrar_repasse_externo('${order}','NaN'::numeric,'${reason}')`, /duas casas/)
await rejects(`select public.admin_registrar_repasse_externo('${order}',96.48,'ok')`, /motivo/)
await rejects(`select public.admin_concluir_entrega_externa('${order}','${reason}')`, /primeiro o repasse/)
await db.exec(`update public.pedidos set payment_status=null where id='${order}'`)
await rejects(`select public.admin_registrar_repasse_externo('${order}',96.48,'${reason}')`, /pagamento online/)
await db.exec(`update public.pedidos set payment_status='aprovado',reembolso_status='solicitado' where id='${order}'`)
await rejects(`select public.admin_registrar_repasse_externo('${order}',96.48,'${reason}')`, /pagamento online/)
await db.exec(`update public.pedidos set reembolso_status='nenhum' where id='${order}'`)
await db.exec(`insert into public.payouts(vendedor_id,valor,status,provider) values('${seller}',96.48,'processando','pagarme')`)
await rejects(`select public.admin_registrar_repasse_externo('${order}',96.48,'${reason}')`, /evitar pagamento duplicado/)
await db.exec(`delete from public.payouts`)
// Audit failure must roll back the payout, ledger, wallet and order together.
await db.exec(`alter table public.security_audit_logs add constraint fixture_reject_audit check(false)`)
await rejects(`select public.admin_registrar_repasse_externo('${order}',96.48,'${reason}')`, /fixture_reject_audit/)
check(await scalar(`select count(*)::int as v from public.payouts`), 0)
check(await scalar(`select status as v from public.financial_ledger where id='${ledger}'`), 'pendente')
check(await scalar(`select settlement_status as v from public.pedidos where id='${order}'`), 'pendente')
await db.exec(`alter table public.security_audit_logs drop constraint fixture_reject_audit`)
await db.exec(`set role authenticated`)
check((await scalar(`select public.admin_registrar_repasse_externo('${order}',96.48,'${reason}') as v`)).ok, true)
await db.exec(`reset role`)
check((await scalar(`select public.admin_registrar_repasse_externo('${order}',96.48,'${reason}') as v`)).idempotente, true)
check(await scalar(`select count(*)::int as v from public.payouts`), 1)
check(await scalar(`select total_sacado::text as v from public.wallets where vendedor_id='${seller}'`), '96.48')
check(await scalar(`select saldo_a_liberar::text as v from public.wallets where vendedor_id='${seller}'`), '0')
check(await scalar(`select status as v from public.financial_ledger where tipo='taxa_plataforma'`), 'pendente')
await rejects(`update public.financial_ledger set status='disponivel' where id='${ledger}'`, /ja recebido/)
await rejects(`update public.payouts set status='solicitado' where provider='repasse_externo'`, /nao pode voltar/)
check((await scalar(`select public.admin_concluir_entrega_externa('${order}','${reason}') as v`)).ok, true)
check((await scalar(`select public.admin_concluir_entrega_externa('${order}','${reason}') as v`)).idempotente, true)
check(await scalar(`select status as v from public.pedidos where id='${order}'`), 'entregue')
check(await scalar(`select settlement_status as v from public.pedidos where id='${order}'`), 'repasse_manual_pago')
check(await scalar(`select status as v from public.financial_ledger where id='${ledger}'`), 'pago')
check((await scalar(`select public.admin_encerrar_aviso_kyc('${ticket}','${reason}') as v`)).ok, true)
check((await scalar(`select public.admin_encerrar_aviso_kyc('${ticket}','${reason}') as v`)).idempotente, true)
check(await scalar(`select status as v from public.tickets where id='${ticket}'`), 'fechado')
check(await scalar(`select count(*)::int as v from public.security_audit_logs`), 3)
// Future sales must not be reduced a second time by the past external repasse.
await db.exec(`insert into public.financial_ledger(vendedor_id,tipo,valor,status) values('${seller}','repasse_vendedor',50,'disponivel')`)
await db.exec(`select set_config('request.jwt.claim.sub','${seller}',false)`)
check(await scalar(`select saldo_disponivel::text as v from public.carteira_espelho('${seller}')`), '50')
check(await scalar(`select transferido::text as v from public.carteira_espelho('${seller}')`), '96.48')
await db.exec(`select set_config('request.jwt.claim.role','service_role',false)`)
await db.exec(`select private.account_deletion_unchecked_solicitar_saque('${seller}',50)`)
check(await scalar(`select saldo_disponivel::text as v from public.carteira_espelho('${seller}')`), '0')
console.log(`PASS: ${checks} PostgreSQL assertions; permissions, accounting, audit rollback, idempotence, delivery and future withdrawals.`)
await db.close()
