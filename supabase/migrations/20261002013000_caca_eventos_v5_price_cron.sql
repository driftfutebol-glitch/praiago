-- Rodadas curtas e independentes: descoberta permanece no cron existente;
-- preços/lotes são rechecados a cada 4 horas em outra execução.
create or replace function private.disparar_caca_eventos_precos()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s text;
begin
  select valor into s from private.robo_config where chave = 'caca_secret';
  if s is null or s = '' then
    raise exception 'Segredo do Caça Eventos não configurado.';
  end if;
  perform net.http_post(
    url := 'https://kfxpzjqktbcsxlqapkyv.supabase.co/functions/v1/caca-eventos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_2yT2Mkm7-BlGOgPYjbab3g_l-VYnzrg',
      'x-caca-secret', s
    ),
    body := jsonb_build_object('buscar', false, 'modo', 'precos'),
    timeout_milliseconds := 110000
  );
end;
$$;

revoke all on function private.disparar_caca_eventos_precos() from public, anon, authenticated;

create or replace function public.rodar_robo_eventos_precos()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Apenas administradores podem revalidar ingressos.' using errcode = '42501';
  end if;
  perform private.disparar_caca_eventos_precos();
  return jsonb_build_object('ok', true, 'status', 'rodando_em_segundo_plano');
end;
$$;

revoke all on function public.rodar_robo_eventos_precos() from public, anon;
grant execute on function public.rodar_robo_eventos_precos() to authenticated;

select cron.schedule(
  'caca-eventos-precos',
  '35 */4 * * *',
  'select private.disparar_caca_eventos_precos();'
)
where not exists (select 1 from cron.job where jobname = 'caca-eventos-precos');

notify pgrst, 'reload schema';
