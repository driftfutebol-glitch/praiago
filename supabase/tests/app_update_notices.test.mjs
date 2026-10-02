// Disposable PostgreSQL only: no production credentials or store writes.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
process.on('uncaughtException', e => { console.error('SQL TEST FAILED:',e.message,e.where || ''); process.exit(1) })
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href)
const db = new PGlite()
let checks=0
const check=(a,b)=>{assert.deepEqual(a,b);checks++}
const rejects=async(sql,pattern)=>{await assert.rejects(db.query(sql),pattern);checks++}
const scalar=async sql=>(await db.query(sql)).rows[0].v
const owner='11111111-1111-4111-8111-111111111111',admin='22222222-2222-4222-8222-222222222222'
await db.exec(`
create schema auth; create role anon; create role authenticated; create role service_role;
grant usage on schema public,auth to anon,authenticated,service_role;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role',true) $$;
create table public.profiles(id uuid,role text,status text);
create function public.account_can_write(subject uuid) returns boolean language sql as $$
 select subject=auth.uid() and exists(select 1 from public.profiles where id=subject and status='ativo') $$;
create table public.ota_releases(id uuid,min_native_version text);
insert into public.profiles values('${owner}','sysadmin','ativo'),('${admin}','admin','ativo');
`)
await db.exec(await readFile(new URL('../migrations/20260929000000_app_update_notices.sql',import.meta.url),'utf8'))
await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`)
await rejects(`select public.admin_app_update_action('create',null,'cliente','android','1.1','Nova versao')`,/Apenas o dono/)
await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false)`)
await rejects(`select public.admin_app_update_action('create',null,'outro','android','1.1','Nova versao')`,/check constraint/)
await rejects(`select public.admin_app_update_action('create',null,'cliente','android','beta','Nova versao')`,/check constraint/)
const create=()=>scalar(`select public.admin_app_update_action('create',null,'cliente','android','1.1','Nova versao') as v`)
const first=await create(),second=await create()
check(await scalar(`select status as v from public.app_update_notices where id='${first}'`),'pending')
await rejects(`select public.admin_app_update_action('approve','${first}')`,/Confira/)
await rejects(`select public.record_app_update_verification('${first}','${owner}','play_console_manual','{"version":"1.1"}')`,/Sem permissao/)
check(await scalar(`select has_function_privilege('authenticated','public.record_app_update_verification(uuid,uuid,text,jsonb)','EXECUTE') as v`),false)
check(await scalar(`select has_table_privilege('anon','public.app_update_notices','SELECT') as v`),false)
check(await scalar(`select has_table_privilege('authenticated','public.app_update_notices','UPDATE') as v`),false)
await db.exec(`select set_config('request.jwt.claim.role','service_role',false)`)
await rejects(`select public.record_app_update_verification('${first}','${owner}','apple_lookup','{"version":"1.1"}')`,/Prova/)
await rejects(`select public.record_app_update_verification('${first}','${owner}','play_console_manual','{"version":"1.2"}')`,/Prova/)
await db.exec(`select public.record_app_update_verification('${first}','${owner}','play_console_manual','{"version":"1.1"}')`)
await db.exec(`select public.admin_app_update_action('approve','${first}')`)
check(await scalar(`select count(*)::int as v from public.app_update_notices where status='approved'`),1)
await db.exec(`select public.record_app_update_verification('${second}','${owner}','play_console_manual','{"version":"1.1"}')`)
await db.exec(`update public.app_update_notices set verified_at=now()-interval '25 hours' where id='${second}'`)
await rejects(`select public.admin_app_update_action('approve','${second}')`,/Confira/)
await db.exec(`select public.record_app_update_verification('${second}','${owner}','play_console_manual','{"version":"1.1"}')`)
await db.exec(`select public.admin_app_update_action('approve','${second}')`)
check(await scalar(`select status as v from public.app_update_notices where id='${first}'`),'paused')
check(await scalar(`select count(*)::int as v from public.app_update_notices where status='approved'`),1)
check(await scalar(`select count(*)::int as v from public.app_update_notice_events where action='replaced'`),1)
await rejects(`select public.admin_app_update_action('pause','${second}',null,null,null,null,'x')`,/motivo/)
await db.exec(`select public.admin_app_update_action('pause','${second}',null,null,null,null,'Retirada administrativa')`)
check(await scalar(`select count(*)::int as v from public.app_update_notices where status='approved'`),0)
await rejects(`select public.admin_app_update_action('approve','${second}')`,/Confira/)
const third=await create()
await db.exec(`select public.admin_app_update_action('reject','${third}',null,null,null,null,'Nao publicada ainda')`)
await rejects(`select public.record_app_update_verification('${third}','${owner}','play_console_manual','{"version":"1.1"}')`,/indisponivel/)
await db.exec(`update public.profiles set status='banido' where id='${owner}'`)
await rejects(`select public.admin_app_update_action('create',null,'cliente','android','1.1','Nova versao')`,/Apenas o dono/)
await db.exec(`update public.profiles set status='ativo' where id='${owner}'; set role authenticated; select set_config('request.jwt.claim.sub','${admin}',false)`)
check(await scalar(`select count(*)::int as v from public.app_update_notices`),0)
await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false)`)
check(await scalar(`select count(*)::int as v from public.app_update_notices`),3)
await db.exec('reset role')
console.log(`PASS: ${checks} SQL checks for owner authorization, verification, approval, audit, pause and RLS`)
await db.close()
