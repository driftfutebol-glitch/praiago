-- Defesa contra ataque/abuso: rate-limit por IP + auto-bloqueio + limpeza.
-- (Ataque volumetrico real de 1M+ req e absorvido pelo Cloudflare na frente do
--  Supabase; isto protege a camada de aplicacao: forca-bruta, scraping, massa.)
create table if not exists public.blocked_ips (
  ip text primary key, motivo text, auto boolean not null default true,
  hits integer, criado_em timestamptz not null default now(), expira_em timestamptz
);
create table if not exists public.rate_limit (
  ip text not null, bucket timestamptz not null, hits integer not null default 1,
  primary key (ip, bucket)
);
create index if not exists rate_limit_bucket_idx on public.rate_limit(bucket);

alter table public.blocked_ips enable row level security;
alter table public.rate_limit enable row level security;
drop policy if exists blocked_ips_admin on public.blocked_ips;
create policy blocked_ips_admin on public.blocked_ips for all using (private.is_admin()) with check (private.is_admin());
drop policy if exists rate_limit_admin on public.rate_limit;
create policy rate_limit_admin on public.rate_limit for select using (private.is_admin());

create or replace function public.guard_ip(p_ip text, p_limite integer default 60, p_janela_seg integer default 60)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_bucket timestamptz; v_hits integer; v_bloqueado record;
begin
  if p_ip is null or p_ip = '' or p_ip = 'desconhecido' then return jsonb_build_object('allowed', true); end if;
  select * into v_bloqueado from public.blocked_ips where ip = p_ip and (expira_em is null or expira_em > now());
  if found then return jsonb_build_object('allowed', false, 'reason', 'blocked', 'motivo', v_bloqueado.motivo); end if;
  v_bucket := date_trunc('minute', now());
  insert into public.rate_limit (ip, bucket, hits) values (p_ip, v_bucket, 1)
    on conflict (ip, bucket) do update set hits = public.rate_limit.hits + 1 returning hits into v_hits;
  if v_hits > p_limite then
    insert into public.blocked_ips (ip, motivo, auto, hits, expira_em)
      values (p_ip, 'auto: '||v_hits||' req/min (>'||p_limite||')', true, v_hits, now() + interval '15 minutes')
      on conflict (ip) do update set hits = excluded.hits, expira_em = excluded.expira_em, motivo = excluded.motivo;
    return jsonb_build_object('allowed', false, 'reason', 'rate', 'hits', v_hits);
  end if;
  return jsonb_build_object('allowed', true, 'hits', v_hits);
end; $$;
revoke all on function public.guard_ip(text, integer, integer) from public, anon, authenticated;

create or replace function public.limpar_rate_limit()
returns void language sql security definer set search_path = public as $$
  delete from public.rate_limit where bucket < now() - interval '1 hour';
  delete from public.blocked_ips where auto is true and expira_em is not null and expira_em < now() - interval '1 day';
$$;
do $$ begin perform cron.schedule('limpar-rate-limit', '*/30 * * * *', 'select public.limpar_rate_limit();'); exception when others then null; end; $$;
