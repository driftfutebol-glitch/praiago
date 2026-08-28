-- Agenda a conferencia do KYC dos recebedores.
--
-- O vendedor cadastra a conta, a Pagar.me leva horas ou dias para aprovar, e
-- ninguem fica olhando. Sem isto, so descobriria a aprovacao quem tentasse
-- sacar e desse certo — ou seja, por tentativa e erro.
--
-- De 15 em 15 minutos a rotina pergunta ao gateway o estado de quem AINDA NAO
-- esta ativo. Quando alguem vira ativo, o proprio banco cria o aviso para o
-- vendedor (private.registrar_status_recebedor), e o app mostra na hora pelo
-- realtime.
--
-- O segredo do cron NAO mora aqui: fica no Vault, sob o nome 'cron_secret', e
-- o mesmo valor esta nos secrets da edge function. Este arquivo vai para o git
-- — segredo em migration e segredo publicado.
--
-- Se o Vault nao tiver a chave, o agendamento e criado mesmo assim e as
-- chamadas voltam 401 ate alguem preencher. Preferi isso a falhar a migration:
-- o resto do arquivo continua util.

begin;

create or replace function private.sincronizar_recebedores_agendado()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_segredo text;
  v_url text := 'https://kfxpzjqktbcsxlqapkyv.supabase.co/functions/v1/recebedor-sincronizar';
begin
  select decrypted_secret into v_segredo
    from vault.decrypted_secrets where name = 'cron_secret' limit 1;

  if v_segredo is null then
    raise notice 'cron_secret ausente no Vault: sincronizacao de recebedor nao vai autenticar';
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_segredo
    ),
    body := '{}'::jsonb
  );
end;
$$;

comment on function private.sincronizar_recebedores_agendado() is
  'Dispara a edge function que confere o KYC dos recebedores ainda nao ativos. '
  'Le o segredo do Vault; nunca o carrega em texto no agendamento.';

revoke all on function private.sincronizar_recebedores_agendado()
  from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('praiago_sincronizar_recebedores')
      where exists (select 1 from cron.job where jobname = 'praiago_sincronizar_recebedores');

    perform cron.schedule(
      'praiago_sincronizar_recebedores',
      '*/15 * * * *',
      $cron$ select private.sincronizar_recebedores_agendado(); $cron$
    );
    raise notice 'conferencia de KYC agendada a cada 15 minutos';
  else
    raise notice 'pg_cron ausente: rodar a sincronizacao manualmente';
  end if;
end;
$$;

commit;
