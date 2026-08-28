


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "private"."disparar_caca_eventos"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare s text;
begin
  select valor into s from private.robo_config where chave='caca_secret';
  perform net.http_post(
    url := 'https://kfxpzjqktbcsxlqapkyv.supabase.co/functions/v1/caca-eventos',
    headers := jsonb_build_object('Content-Type','application/json','apikey','sb_publishable_2yT2Mkm7-BlGOgPYjbab3g_l-VYnzrg','x-caca-secret', s),
    body := jsonb_build_object('buscar', true),
    timeout_milliseconds := 120000
  );
end;
$$;


ALTER FUNCTION "private"."disparar_caca_eventos"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."generate_delivery_code"() RETURNS "text"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select lpad(
    (
      (
        ('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint
        % 1000000
      )::text
    ),
    6,
    '0'
  );
$$;


ALTER FUNCTION "private"."generate_delivery_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."has_permission"("p_section" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.role in ('admin', 'sysadmin')
       and coalesce(p.status, 'ativo') <> 'banido'
       and (
         p.role = 'sysadmin'
         or p.permissions is null
         or p_section = any(p.permissions)
       )
  );
$$;


ALTER FUNCTION "private"."has_permission"("p_section" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."has_realistic_name"("p_name" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $_$
  select trim(coalesce(p_name, '')) ~* '^[[:alpha:]À-ÿ]{2,}([ ''-][[:alpha:]À-ÿ]{2,})+$';
$_$;


ALTER FUNCTION "private"."has_realistic_name"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."has_role"("p_role" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.role = p_role
       and coalesce(p.status, 'ativo') <> 'banido'
  );
$$;


ALTER FUNCTION "private"."has_role"("p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('admin', 'sysadmin')
      and coalesce(p.status, 'ativo') <> 'banido'
  );
$$;


ALTER FUNCTION "private"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_adult_birthdate"("p_birth" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare
  d date;
begin
  if nullif(trim(coalesce(p_birth, '')), '') is null then
    return false;
  end if;

  begin
    d := p_birth::date;
  exception when others then
    return false;
  end;

  return d <= (current_date - interval '18 years')::date
     and d >= date '1900-01-01';
end;
$$;


ALTER FUNCTION "private"."is_adult_birthdate"("p_birth" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_sysadmin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.role = 'sysadmin'
       and coalesce(p.status, 'ativo') <> 'banido'
  );
$$;


ALTER FUNCTION "private"."is_sysadmin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_valid_cnpj"("p_cnpj" "text") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
declare
  d text := private.only_digits(p_cnpj);
  weights1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  weights2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int;
  r int;
  i int;
begin
  if length(d) <> 14 or d = repeat(substring(d, 1, 1), 14) then
    return false;
  end if;

  s := 0;
  for i in 1..12 loop
    s := s + substring(d, i, 1)::int * weights1[i];
  end loop;
  r := s % 11;
  r := case when r < 2 then 0 else 11 - r end;
  if r <> substring(d, 13, 1)::int then
    return false;
  end if;

  s := 0;
  for i in 1..13 loop
    s := s + substring(d, i, 1)::int * weights2[i];
  end loop;
  r := s % 11;
  r := case when r < 2 then 0 else 11 - r end;
  return r = substring(d, 14, 1)::int;
end;
$$;


ALTER FUNCTION "private"."is_valid_cnpj"("p_cnpj" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_valid_cpf"("p_cpf" "text") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
declare
  d text := private.only_digits(p_cpf);
  s int;
  r int;
  i int;
begin
  if length(d) <> 11 or d = repeat(substring(d, 1, 1), 11) then
    return false;
  end if;

  s := 0;
  for i in 1..9 loop
    s := s + substring(d, i, 1)::int * (11 - i);
  end loop;
  r := 11 - (s % 11);
  if r >= 10 then r := 0; end if;
  if r <> substring(d, 10, 1)::int then
    return false;
  end if;

  s := 0;
  for i in 1..10 loop
    s := s + substring(d, i, 1)::int * (12 - i);
  end loop;
  r := 11 - (s % 11);
  if r >= 10 then r := 0; end if;
  return r = substring(d, 11, 1)::int;
end;
$$;


ALTER FUNCTION "private"."is_valid_cpf"("p_cpf" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."log_auth_password_changed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'auth'
    AS $$
begin
  if old.encrypted_password is distinct from new.encrypted_password then
    insert into public.security_audit_logs (
      event_type,
      severity,
      platform,
      user_id,
      email,
      metadata
    ) values (
      'password_changed',
      'high',
      'supabase',
      new.id,
      lower(new.email),
      jsonb_build_object(
        'provider', 'supabase_auth',
        'email_confirmed_at', new.email_confirmed_at,
        'updated_at', new.updated_at
      )
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."log_auth_password_changed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."log_fraude_flag_created"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $_$
declare
  v_cliente_id uuid;
begin
  if (to_jsonb(new)->>'cliente_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_cliente_id := (to_jsonb(new)->>'cliente_id')::uuid;
  end if;

  insert into public.security_audit_logs (
    event_type,
    severity,
    platform,
    user_id,
    actor_id,
    metadata
  ) values (
    'fraud_flag_created',
    'high',
    'cliente',
    v_cliente_id,
    v_cliente_id,
    jsonb_build_object('fraude_flag', to_jsonb(new))
  );

  return new;
end;
$_$;


ALTER FUNCTION "private"."log_fraude_flag_created"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."only_digits"("p_value" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select regexp_replace(coalesce(p_value, ''), '\D', '', 'g');
$$;


ALTER FUNCTION "private"."only_digits"("p_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."reject_conta_demo_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.conta_demo is distinct from old.conta_demo
     and coalesce((select auth.role()), '') <> 'service_role'
     and not private.is_admin() then
    raise exception
      'Somente um administrador pode marcar ou desmarcar uma conta de revisao.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."reject_conta_demo_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."run_eventos_lifecycle"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  amanha date := ((now() at time zone 'America/Sao_Paulo')::date + 1);
  eventos_encerrados integer := 0;
  lotes_encerrados_por_evento integer := 0;
  lotes_esgotados integer := 0;
  lotes_preco_invalido integer := 0;
  eventos_sem_ingresso integer := 0;
  eventos_destacados integer := 0;
  ids_encerrados uuid[];
begin
  update public.event_ticket_lots
  set status = 'esgotado',
      updated_at = now()
  where status in ('disponivel', 'pausado', 'pendente_aprovacao')
    and estoque_disponivel is not null
    and estoque_disponivel <= 0;
  get diagnostics lotes_esgotados = row_count;

  update public.event_ticket_lots
  set status = 'pausado',
      metadata = jsonb_set(
        coalesce(metadata, '{}'::jsonb),
        '{price_guard}',
        jsonb_build_object(
          'motivo', 'preco_origem_ou_preco_venda_invalido',
          'limpo_em', now()
        ),
        true
      ),
      updated_at = now()
  where status in ('disponivel', 'pendente_aprovacao')
    and (preco_origem <= 0 or preco_venda <= 0);
  get diagnostics lotes_preco_invalido = row_count;

  with encerrados as (
    update public.eventos
    set status = 'inativo',
        destaque = false
    where status in ('ativo', 'pendente')
      and data is not null
      and data < hoje
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]), count(*)::integer
  into ids_encerrados, eventos_encerrados
  from encerrados;

  if eventos_encerrados > 0 then
    update public.event_ticket_lots
    set status = 'esgotado',
        updated_at = now()
    where evento_id = any(ids_encerrados)
      and status in ('disponivel', 'pausado', 'pendente_aprovacao');
    get diagnostics lotes_encerrados_por_evento = row_count;
  end if;

  update public.eventos e
  set ingressos_enabled = false,
      destaque = false
  where e.ingressos_enabled is true
    and exists (
      select 1
      from public.event_ticket_lots l
      where l.evento_id = e.id
    )
    and not exists (
      select 1
      from public.event_ticket_lots l
      where l.evento_id = e.id
        and l.status = 'disponivel'
    );
  get diagnostics eventos_sem_ingresso = row_count;

  update public.eventos e
  set destaque = true
  where e.status = 'ativo'
    and e.data between hoje and amanha
    and (
      not exists (
        select 1
        from public.event_ticket_lots l
        where l.evento_id = e.id
      )
      or exists (
        select 1
        from public.event_ticket_lots l
        where l.evento_id = e.id
          and l.status <> 'esgotado'
          and l.preco_venda > 0
      )
    );
  get diagnostics eventos_destacados = row_count;

  return jsonb_build_object(
    'hoje_sp', hoje,
    'amanha_sp', amanha,
    'eventos_encerrados', eventos_encerrados,
    'lotes_encerrados_por_evento', lotes_encerrados_por_evento,
    'lotes_esgotados', lotes_esgotados,
    'lotes_preco_invalido', lotes_preco_invalido,
    'eventos_sem_ingresso', eventos_sem_ingresso,
    'eventos_destacados', eventos_destacados
  );
end;
$$;


ALTER FUNCTION "private"."run_eventos_lifecycle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_verificado"("p_user_id" "uuid", "p_verificado" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_nome text;
begin
  if v_actor is null or not private.is_admin() then
    raise exception 'Apenas administradores podem liberar KYC.' using errcode = '42501';
  end if;

  update public.profiles
     set verificado = p_verificado
   where id = p_user_id
     and coalesce(status, 'ativo') <> 'banido'
   returning nome into v_nome;

  if not found then
    raise exception 'Perfil nao encontrado ou esta banido.' using errcode = 'P0002';
  end if;

  -- Mantem a aba Verificacoes coerente com a decisao manual:
  if p_verificado then
    -- liberou: marca a ultima verificacao (se existir) como aprovada, com trilha.
    update public.verificacoes
       set status = 'aprovado',
           motivo_rejeicao = null,
           kyc_override = true,
           kyc_override_reason = coalesce(nullif(kyc_override_reason, ''), 'Liberado manualmente pelo admin na tela de Usuarios'),
           kyc_override_by = v_actor,
           kyc_override_at = now()
     where id = (
       select id from public.verificacoes
        where coalesce(user_id, restaurante_id) = p_user_id
        order by created_at desc
        limit 1
     )
       and status <> 'aprovado';
  else
    -- removeu a verificacao: volta a ultima aprovada pra pendente (trava o app de novo).
    update public.verificacoes
       set status = 'pendente'
     where id = (
       select id from public.verificacoes
        where coalesce(user_id, restaurante_id) = p_user_id
        order by created_at desc
        limit 1
     )
       and status = 'aprovado';
  end if;

  return jsonb_build_object('ok', true, 'user_id', p_user_id, 'nome', v_nome, 'verificado', p_verificado);
end;
$$;


ALTER FUNCTION "public"."admin_set_verificado"("p_user_id" "uuid", "p_verificado" boolean) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."bank_account_change_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vendedor_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "banco_codigo" "text" NOT NULL,
    "banco_nome" "text",
    "agencia" "text" NOT NULL,
    "conta_mascarada" "text" NOT NULL,
    "titular_nome" "text" NOT NULL,
    "titular_documento" "text" NOT NULL,
    "motivo" "text",
    "analisado_por" "uuid",
    "analisado_em" timestamp with time zone,
    "parecer" "text",
    "liberado_ate" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bank_account_change_requests_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'em_analise'::"text", 'aprovado'::"text", 'recusado'::"text", 'cancelado'::"text"])))
);


ALTER TABLE "public"."bank_account_change_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."bank_account_change_requests" IS 'Pedido de troca da conta que recebe o dinheiro. Nunca automatico: conta invadida + troca livre = dinheiro do vendedor desviado. Aprovar abre uma janela (liberado_ate), nao troca a conta.';



CREATE OR REPLACE FUNCTION "public"."analisar_troca_conta"("p_pedido" "uuid", "p_decisao" "text", "p_parecer" "text" DEFAULT NULL::"text", "p_horas" integer DEFAULT 48) RETURNS "public"."bank_account_change_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.bank_account_change_requests;
begin
  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role = 'sysadmin'
  ) then
    raise exception 'sem permissao';
  end if;

  if p_decisao not in ('aprovado','recusado','em_analise') then
    raise exception 'decisao invalida';
  end if;

  update public.bank_account_change_requests
     set status        = p_decisao,
         parecer       = coalesce(p_parecer, parecer),
         analisado_por = auth.uid(),
         analisado_em  = now(),
         liberado_ate  = case
                           when p_decisao = 'aprovado'
                           then now() + make_interval(hours => greatest(1, coalesce(p_horas, 48)))
                           else null
                         end,
         updated_at    = now()
   where id = p_pedido
     and status in ('pendente','em_analise')
  returning * into v_row;

  if v_row.id is null then
    raise exception 'pedido nao encontrado ou ja analisado';
  end if;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."analisar_troca_conta"("p_pedido" "uuid", "p_decisao" "text", "p_parecer" "text", "p_horas" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."antecipar_saldo"("p_vendedor" "uuid", "p_grupo" "text" DEFAULT 'rapido'::"text") RETURNS TABLE("liberado" numeric, "taxa" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_pct numeric; v_ativo boolean; v_bruto numeric; v_taxa numeric;
begin
  if auth.uid() is distinct from p_vendedor then raise exception 'sem permissao'; end if;
  if p_grupo not in ('rapido', 'credito') then raise exception 'grupo invalido'; end if;

  if p_grupo = 'credito' then
    select coalesce(saque_rapido_percent_credito, 8), coalesce(saque_rapido_credito_ativo, false)
      into v_pct, v_ativo from public.payment_settings where id is true;
    if not v_ativo then
      raise exception 'A antecipacao de vendas no cartao de credito ainda nao esta disponivel.';
    end if;
  else
    select coalesce(saque_rapido_percent, 5), coalesce(saque_rapido_ativo, false)
      into v_pct, v_ativo from public.payment_settings where id is true;
    if not v_ativo then
      raise exception 'O saque rapido esta indisponivel no momento.';
    end if;
  end if;

  with liberados as (
    update public.financial_ledger fl
       set status = 'disponivel', settled_at = now(), descricao = 'Liberado por saque rapido'
     where fl.vendedor_id = p_vendedor
       and fl.tipo = 'repasse_vendedor'
       and fl.status = 'em_espera'
       and (
         select case when p_grupo = 'credito'
                     then coalesce(pe.pagamento,'') = 'credito_online'
                     else coalesce(pe.pagamento,'pix') <> 'credito_online' end
           from public.pedidos pe where pe.id = fl.pedido_id
       )
    returning fl.valor
  )
  select coalesce(sum(valor), 0) into v_bruto from liberados;

  if v_bruto <= 0 then
    raise exception 'Voce nao tem saldo desse tipo pra antecipar.';
  end if;

  v_taxa := round(v_bruto * v_pct / 100, 2);

  if v_taxa > 0 then
    insert into public.financial_ledger (vendedor_id, tipo, valor, status, descricao, provider)
    values (p_vendedor, 'taxa_antecipacao', v_taxa, 'pago',
            format('Taxa de antecipacao%s (%s%%)',
                   case when p_grupo = 'credito' then ' do credito' else '' end, v_pct),
            'praiago');
  end if;

  perform public.reconciliar_carteira(p_vendedor);
  return query select v_bruto, v_taxa;
end;
$$;


ALTER FUNCTION "public"."antecipar_saldo"("p_vendedor" "uuid", "p_grupo" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."solicitacoes_correcao_localizacao" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurante_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "motivo" "text" NOT NULL,
    "endereco_atual" "text",
    "lat_atual" double precision,
    "lng_atual" double precision,
    "novo_endereco" "text",
    "nova_lat" double precision,
    "nova_lng" double precision,
    "observacao_admin" "text",
    "revisado_por" "uuid",
    "solicitado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revisado_em" timestamp with time zone,
    "autorizado_ate" timestamp with time zone,
    "utilizado_em" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "solicitacoes_correcao_localizacao_motivo_check" CHECK ((("char_length"("btrim"("motivo")) >= 8) AND ("char_length"("btrim"("motivo")) <= 500))),
    CONSTRAINT "solicitacoes_correcao_localizacao_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'aprovada'::"text", 'rejeitada'::"text", 'utilizada'::"text", 'cancelada'::"text"])))
);


ALTER TABLE "public"."solicitacoes_correcao_localizacao" OWNER TO "postgres";


COMMENT ON TABLE "public"."solicitacoes_correcao_localizacao" IS 'Solicitacoes de uso unico para corrigir o ponto fixo de restaurantes.';



CREATE OR REPLACE FUNCTION "public"."aplicar_correcao_localizacao"("p_solicitacao_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_endereco" "text") RETURNS "public"."solicitacoes_correcao_localizacao"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_solicitacao public.solicitacoes_correcao_localizacao%rowtype;
  v_endereco text := btrim(coalesce(p_endereco, ''));
begin
  if v_uid is null then
    raise exception 'Sessao invalida.' using errcode = '42501';
  end if;

  if p_lat is null or p_lat not between -90 and 90
     or p_lng is null or p_lng not between -180 and 180 then
    raise exception 'Coordenadas invalidas.' using errcode = '22023';
  end if;

  if char_length(v_endereco) < 5 or char_length(v_endereco) > 300 then
    raise exception 'Informe o endereco correto da loja.'
      using errcode = '22023';
  end if;

  select *
    into v_solicitacao
    from public.solicitacoes_correcao_localizacao
   where id = p_solicitacao_id
   for update;

  if not found or v_solicitacao.restaurante_id <> v_uid then
    raise exception 'Solicitacao nao encontrada.' using errcode = '42501';
  end if;

  if v_solicitacao.status <> 'aprovada' then
    raise exception 'A correcao ainda nao foi aprovada.' using errcode = '22023';
  end if;

  if v_solicitacao.autorizado_ate is null or v_solicitacao.autorizado_ate <= now() then
    update public.solicitacoes_correcao_localizacao
       set status = 'cancelada',
           observacao_admin = coalesce(observacao_admin, 'Autorizacao expirada sem uso.'),
           updated_at = now()
     where id = p_solicitacao_id;
    raise exception 'A autorizacao expirou. Envie uma nova solicitacao.'
      using errcode = '22023';
  end if;

  perform set_config('praiago.location_write_authorized', 'on', true);

  update public.profiles
     set lat = p_lat,
         lng = p_lng,
         endereco = v_endereco
   where id = v_uid
     and role = 'restaurante'
     and coalesce(status, 'ativo') <> 'banido';

  if not found then
    raise exception 'Restaurante nao encontrado ou bloqueado.' using errcode = '42501';
  end if;

  perform set_config('praiago.location_write_authorized', 'off', true);

  update public.solicitacoes_correcao_localizacao
     set status = 'utilizada',
         novo_endereco = v_endereco,
         nova_lat = p_lat,
         nova_lng = p_lng,
         utilizado_em = now(),
         updated_at = now()
   where id = p_solicitacao_id
  returning * into v_solicitacao;

  return v_solicitacao;
end;
$$;


ALTER FUNCTION "public"."aplicar_correcao_localizacao"("p_solicitacao_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_endereco" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."solicitacoes_troca_nome" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vendedor_id" "uuid" NOT NULL,
    "nome_atual" "text" NOT NULL,
    "nome_novo" "text" NOT NULL,
    "motivo" "text",
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "observacao_admin" "text",
    "decidido_por" "uuid",
    "decidido_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "solicitacoes_troca_nome_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'aprovada'::"text", 'recusada'::"text", 'cancelada'::"text"])))
);


ALTER TABLE "public"."solicitacoes_troca_nome" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aprovar_troca_nome"("p_solicitacao_id" "uuid", "p_observacao" "text" DEFAULT NULL::"text") RETURNS "public"."solicitacoes_troca_nome"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_sol public.solicitacoes_troca_nome%rowtype;
begin
  if not private.is_admin() then
    raise exception 'Apenas a equipe pode aprovar troca de nome.' using errcode = '42501';
  end if;

  select * into v_sol from public.solicitacoes_troca_nome
   where id = p_solicitacao_id for update;

  if not found then
    raise exception 'Solicitacao nao encontrada.' using errcode = '22023';
  end if;
  if v_sol.status <> 'pendente' then
    raise exception 'Essa solicitacao ja foi decidida.' using errcode = '22023';
  end if;

  update public.profiles set nome = v_sol.nome_novo where id = v_sol.vendedor_id;

  update public.solicitacoes_troca_nome
     set status = 'aprovada',
         observacao_admin = p_observacao,
         decidido_por = auth.uid(),
         decidido_em = now(),
         updated_at = now()
   where id = p_solicitacao_id
  returning * into v_sol;

  return v_sol;
end;
$$;


ALTER FUNCTION "public"."aprovar_troca_nome"("p_solicitacao_id" "uuid", "p_observacao" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aprovar_verificacao"("p_verificacao_id" "uuid", "p_override" boolean DEFAULT false, "p_override_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v public.verificacoes%rowtype;
  v_reason text := coalesce(nullif(trim(coalesce(p_override_reason, '')), ''), 'Liberado manualmente pelo admin sem documento completo');
begin
  if v_actor is null or not private.is_admin() then
    raise exception 'Apenas administradores podem aprovar KYC.' using errcode = '42501';
  end if;

  select * into v
    from public.verificacoes
   where id = p_verificacao_id
   for update;

  if not found then
    raise exception 'Verificacao nao encontrada.' using errcode = 'P0002';
  end if;

  update public.verificacoes
     set nome_check_status = case when p_override then coalesce(nullif(nome_check_status, 'pendente'), 'dispensado') else nome_check_status end,
         cpf_check_status = case when p_override then coalesce(nullif(cpf_check_status, 'pendente'), 'dispensado') else cpf_check_status end,
         cnpj_check_status = case when p_override then coalesce(nullif(cnpj_check_status, 'pendente'), 'dispensado') else cnpj_check_status end,
         nascimento_check_status = case when p_override then coalesce(nullif(nascimento_check_status, 'pendente'), 'dispensado') else nascimento_check_status end,
         email_check_status = case when p_override then coalesce(nullif(email_check_status, 'pendente'), 'dispensado') else email_check_status end,
         documento_check_status = case
           when p_override then coalesce(nullif(documento_check_status, 'pendente'), 'dispensado')
           when nullif(coalesce(rg_frente_url, cnh_url, ''), '') is not null then 'aprovado'
           else documento_check_status
         end,
         face_check_status = case
           when p_override then coalesce(nullif(face_check_status, 'pendente'), 'dispensado')
           when nullif(coalesce(selfie_url, ''), '') is not null then 'aprovado'
           else face_check_status
         end,
         local_check_status = case
           when p_override then coalesce(nullif(local_check_status, 'pendente'), 'dispensado')
           when tipo = 'entregador' then 'dispensado'
           when tipo = 'restaurante' and nullif(coalesce(foto_loja_url, ''), '') is not null then 'aprovado'
           when tipo = 'ambulante' and nullif(coalesce(praia_principal, ''), '') is not null then 'aprovado'
           else local_check_status
         end,
         kyc_override = p_override,
         kyc_override_reason = case when p_override then v_reason else null end,
         kyc_override_by = case when p_override then v_actor else null end,
         kyc_override_at = case when p_override then now() else null end,
         status = 'aprovado',
         motivo_rejeicao = null
   where id = p_verificacao_id
   returning * into v;

  update public.profiles
     set verificado = true
   where id = coalesce(v.user_id, v.restaurante_id)
     and coalesce(status, 'ativo') <> 'banido';

  return jsonb_build_object(
    'ok', true,
    'verificacao_id', v.id,
    'user_id', coalesce(v.user_id, v.restaurante_id),
    'override', v.kyc_override,
    'status', v.status
  );
end;
$$;


ALTER FUNCTION "public"."aprovar_verificacao"("p_verificacao_id" "uuid", "p_override" boolean, "p_override_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atualiza_nota_vendedor"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.profiles p set
    avaliacao_media = (
      select round(avg(nota)::numeric, 1)
      from public.avaliacoes
      where vendedor_id = new.vendedor_id
    ),
    total_avaliacoes = (
      select count(*)
      from public.avaliacoes
      where vendedor_id = new.vendedor_id
    )
  where p.id = new.vendedor_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."atualiza_nota_vendedor"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."block_invalid_kyc_approval"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_override_ok boolean;
begin
  if new.status <> 'aprovado' then
    return new;
  end if;

  if exists (
    select 1
      from public.profiles p
     where p.id = coalesce(new.user_id, new.restaurante_id)
       and coalesce(p.status, 'ativo') = 'banido'
  ) then
    raise exception 'Usuario banido nao pode ser aprovado no KYC.'
      using errcode = 'P0001';
  end if;

  v_override_ok :=
    new.kyc_override is true
    and new.kyc_override_by is not null
    and length(trim(coalesce(new.kyc_override_reason, ''))) >= 10;

  if v_override_ok then
    new.kyc_override_at := coalesce(new.kyc_override_at, now());
    return new;
  end if;

  if not (
    new.nome_check_status = 'aprovado'
    and new.cpf_check_status = 'aprovado'
    and new.email_check_status = 'aprovado'
    and new.documento_check_status = 'aprovado'
    and new.face_check_status = 'aprovado'
    and new.local_check_status in ('aprovado','dispensado')
    and new.nascimento_check_status in ('aprovado','dispensado')
    and new.cnpj_check_status in ('aprovado','dispensado')
  ) then
    raise exception 'KYC incompleto: CPF, e-mail, documento, rosto e local precisam estar aprovados, ou use override admin com motivo.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."block_invalid_kyc_approval"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."block_unconfirmed_delivery"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.status = 'entregue'
     and coalesce(old.status, '') <> 'entregue'
     and coalesce(current_setting('praiago.delivery_confirmed', true), '') <> 'true' then
    raise exception 'Entrega precisa ser confirmada pelo codigo do cliente.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."block_unconfirmed_delivery"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bloquear_cancelamento_tardio"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.status = 'cancelado' and old.status is distinct from 'cancelado'
     and auth.uid() = old.cliente_id
     -- o proprio vendedor/admin passa direto; so o cliente e barrado
     and auth.uid() is distinct from old.vendedor_id
     and not exists (
       select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('sysadmin', 'admin')
     )
     and old.status not in ('novo', 'aguardando_pagamento')
  then
    raise exception 'O vendedor ja comecou a preparar o pedido — nao da mais pra cancelar.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."bloquear_cancelamento_tardio"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancelar_ledger_do_pedido"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.financial_ledger
     set status = 'cancelado',
         descricao = case
           when new.payment_status = 'estornado' then 'Cancelado: pagamento estornado'
           else 'Cancelado: pedido cancelado'
         end
   where pedido_id = new.id
     and status not in ('pago', 'cancelado');
  return new;
end;
$$;


ALTER FUNCTION "public"."cancelar_ledger_do_pedido"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."carteira_espelho"("p_vendedor" "uuid") RETURNS TABLE("vendedor_id" "uuid", "vendas_brutas" numeric, "comissao_praiago" numeric, "taxa_provedor" numeric, "valor_liquido" numeric, "saldo_pendente" numeric, "saldo_disponivel" numeric, "transferido" numeric, "estornos" numeric, "chargebacks" numeric, "proxima_liquidacao" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is distinct from p_vendedor
     and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'sysadmin') then
    raise exception 'sem permissao';
  end if;

  return query
  with l as (
    select fl.* from public.financial_ledger fl where fl.vendedor_id = p_vendedor
  ), t as (
    select
      coalesce(sum(po.valor) filter (where po.status in ('solicitado','processando','pago')), 0) as em_andamento_ou_pago,
      coalesce(sum(po.valor) filter (where po.status = 'pago'), 0) as pago
    from public.payouts po where po.vendedor_id = p_vendedor
  )
  select
    p_vendedor,
    coalesce(sum(l.valor) filter (where l.tipo in ('repasse_vendedor','taxa_plataforma','taxa_provedor') and l.status <> 'cancelado'), 0),
    coalesce(sum(l.valor) filter (where l.tipo = 'taxa_plataforma' and l.status <> 'cancelado'), 0),
    coalesce(sum(l.valor) filter (where l.tipo = 'taxa_provedor' and l.status <> 'cancelado'), 0),
    -- liquido do vendedor ja descontando a taxa de antecipacao
    coalesce(sum(l.valor) filter (where l.tipo = 'repasse_vendedor' and l.status <> 'cancelado'), 0)
      - coalesce(sum(l.valor) filter (where l.tipo = 'taxa_antecipacao' and l.status <> 'cancelado'), 0),
    coalesce(sum(l.valor) filter (where l.tipo = 'repasse_vendedor' and l.status in ('pendente','em_espera')), 0),
    greatest(0,
      coalesce(sum(l.valor) filter (where l.tipo = 'repasse_vendedor' and l.status = 'disponivel'), 0)
      - coalesce(sum(l.valor) filter (where l.tipo = 'taxa_antecipacao' and l.status <> 'cancelado'), 0)
      - (select em_andamento_ou_pago from t)),
    (select pago from t),
    coalesce(sum(l.valor) filter (where l.tipo = 'estorno'), 0),
    coalesce(sum(l.valor) filter (where l.tipo = 'chargeback'), 0),
    min(l.disponivel_em) filter (where l.tipo = 'repasse_vendedor' and l.status = 'em_espera')
  from l;
end;
$$;


ALTER FUNCTION "public"."carteira_espelho"("p_vendedor" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."checar_ma_fe"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  total int;
BEGIN
  SELECT count(DISTINCT coalesce(pedido_id::text, id::text)) INTO total
  FROM public.fraude_flags
  WHERE vendedor_id = NEW.vendedor_id AND created_at > now() - interval '30 days';

  IF total >= 3 THEN
    UPDATE public.profiles
    SET status = 'banido',
        banido_em = now(),
        ban_motivo = 'Suspensão automática: ' || total || ' denúncias de venda por fora do app (fuga de taxa).',
        online = false
    WHERE id = NEW.vendedor_id AND status <> 'banido';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."checar_ma_fe"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cnpj_ja_cadastrado"("p_cnpj" "text") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists(select 1 from public.profiles where cnpj = regexp_replace(coalesce(p_cnpj,''), '\D', '', 'g') and coalesce(cnpj,'') <> '');
$$;


ALTER FUNCTION "public"."cnpj_ja_cadastrado"("p_cnpj" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirmar_entrega_pedido"("p_pedido_id" "uuid", "p_codigo" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_pedido public.pedidos%rowtype;
  v_secret private.pedido_codigos_entrega%rowtype;
  v_actor uuid := auth.uid();
  v_codigo text := regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g');
  v_provider text;
  v_payment_status text;
  v_manual boolean;
  v_repasse_dias integer := 7;
  v_disponivel_em timestamptz;
  v_settlement_status text;
  v_tentativas integer;
begin
  if v_actor is null then
    raise exception 'Usuario nao autenticado.' using errcode = '28000';
  end if;

  select *
    into v_pedido
    from public.pedidos
   where id = p_pedido_id
   for update;

  if not found then
    raise exception 'Pedido nao encontrado.' using errcode = 'P0002';
  end if;

  if not (
    private.has_permission('pedidos')
    or v_pedido.vendedor_id = v_actor
    or v_pedido.restaurante_id = v_actor
    or v_pedido.ambulante_id = v_actor
  ) then
    raise exception 'Sem permissao para confirmar este pedido.'
      using errcode = '42501';
  end if;

  if v_pedido.status = 'entregue'
     and coalesce(v_pedido.entrega_confirmada, false) then
    return jsonb_build_object(
      'ok', true,
      'pedido_id', v_pedido.id,
      'status', v_pedido.status,
      'settlement_status', v_pedido.settlement_status,
      'ja_confirmado', true
    );
  end if;

  if v_pedido.status not in ('saiu_entrega', 'entregando') then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_status',
      'message', 'Pedido ainda nao esta em rota de entrega.'
    );
  end if;

  select *
    into v_secret
    from private.pedido_codigos_entrega
   where pedido_id = p_pedido_id
   for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'code_unavailable',
      'message', 'Codigo de entrega ainda nao esta disponivel.'
    );
  end if;

  if v_secret.bloqueado_ate is not null
     and v_secret.bloqueado_ate > now() then
    return jsonb_build_object(
      'ok', false,
      'code', 'temporarily_locked',
      'message', 'Muitas tentativas. Aguarde 15 minutos.',
      'retry_at', v_secret.bloqueado_ate
    );
  end if;

  if v_secret.bloqueado_ate is not null
     and v_secret.bloqueado_ate <= now() then
    update private.pedido_codigos_entrega
       set tentativas = 0,
           bloqueado_ate = null
     where pedido_id = p_pedido_id;
    v_secret.tentativas := 0;
  end if;

  if length(v_codigo) <> 6 or v_codigo <> v_secret.codigo then
    v_tentativas := v_secret.tentativas + 1;
    update private.pedido_codigos_entrega
       set tentativas = v_tentativas,
           bloqueado_ate = case
             when v_tentativas >= 5 then now() + interval '15 minutes'
             else null
           end
     where pedido_id = p_pedido_id;

    insert into public.security_audit_logs (
      event_type,
      severity,
      platform,
      user_id,
      actor_id,
      route,
      metadata
    )
    values (
      'delivery_code_mismatch',
      case when v_tentativas >= 5 then 'error' else 'warning' end,
      'seller_app',
      v_pedido.cliente_id,
      v_actor,
      'confirmar_entrega_pedido',
      jsonb_build_object(
        'pedido_id', v_pedido.id,
        'vendedor_id', v_pedido.vendedor_id,
        'status', v_pedido.status,
        'attempt', v_tentativas
      )
    );

    return jsonb_build_object(
      'ok', false,
      'code', case when v_tentativas >= 5 then 'temporarily_locked' else 'invalid_code' end,
      'message', case
        when v_tentativas >= 5 then 'Muitas tentativas. Aguarde 15 minutos.'
        else 'Codigo de entrega incorreto.'
      end,
      'remaining_attempts', greatest(0, 5 - v_tentativas)
    );
  end if;

  update private.pedido_codigos_entrega
     set tentativas = 0,
         bloqueado_ate = null,
         confirmado_em = now()
   where pedido_id = p_pedido_id;

  v_provider := coalesce(v_pedido.payment_provider, 'manual');
  v_payment_status := coalesce(v_pedido.payment_status, 'pendente');
  v_manual := v_provider = 'manual' or v_payment_status = 'presencial';

  select coalesce(repasse_dias, 7)
    into v_repasse_dias
    from public.payment_settings
   where id is true;

  v_disponivel_em := now() + make_interval(days => coalesce(v_repasse_dias, 7));
  v_settlement_status := case
    when v_manual then 'comissao_devida'
    else 'repasse_liberado'
  end;

  perform set_config('praiago.delivery_confirmed', 'true', true);

  update public.pedidos
     set status = 'entregue',
         entrega_confirmada = true,
         entrega_confirmada_em = now(),
         entrega_confirmada_por = v_actor,
         repasse_liberado_em = now(),
         settlement_status = v_settlement_status
   where id = v_pedido.id
   returning * into v_pedido;

  if v_manual then
    update public.financial_ledger
       set tipo = 'comissao_devida',
           status = 'pendente',
           provider = 'presencial',
           settled_at = null,
           disponivel_em = null,
           descricao = 'Comissao PraiaGo da venda presencial'
     where pedido_id = v_pedido.id
       and tipo = 'taxa_plataforma';

    update public.financial_ledger
       set status = 'pago',
           provider = 'presencial',
           settled_at = now(),
           disponivel_em = null,
           descricao = 'Valor recebido pelo vendedor na entrega presencial'
     where pedido_id = v_pedido.id
       and tipo = 'repasse_vendedor';
  else
    update public.financial_ledger
       set status = 'pago',
           provider = v_provider,
           external_reference = coalesce(v_pedido.payment_reference, external_reference),
           settled_at = coalesce(v_pedido.paid_at, now()),
           disponivel_em = null,
           descricao = 'Taxa PraiaGo confirmada no gateway online'
     where pedido_id = v_pedido.id
       and tipo = 'taxa_plataforma';

    update public.financial_ledger
       set status = 'em_espera',
           provider = v_provider,
           external_reference = coalesce(v_pedido.payment_reference, external_reference),
           settled_at = null,
           disponivel_em = v_disponivel_em,
           descricao = 'Repasse liberado apos entrega confirmada'
     where pedido_id = v_pedido.id
       and tipo = 'repasse_vendedor';
  end if;

  return jsonb_build_object(
    'ok', true,
    'pedido_id', v_pedido.id,
    'status', v_pedido.status,
    'settlement_status', v_pedido.settlement_status,
    'codigo_confirmado', true,
    'platform_fee_amount', coalesce(v_pedido.platform_fee_amount, 0),
    'vendor_amount', coalesce(v_pedido.vendor_amount, 0)
  );
end;
$$;


ALTER FUNCTION "public"."confirmar_entrega_pedido"("p_pedido_id" "uuid", "p_codigo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_delivery_code"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into private.pedido_codigos_entrega (pedido_id, cliente_id, codigo)
  values (new.id, new.cliente_id, private.generate_delivery_code())
  on conflict (pedido_id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."create_delivery_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_order_financial_ledger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if coalesce(new.payment_status, '') = 'pendente' then
    return new;
  end if;

  insert into public.financial_ledger (pedido_id, vendedor_id, tipo, valor, status, descricao)
  values
    (new.id, new.vendedor_id, 'taxa_plataforma',  coalesce(new.platform_fee_amount, 0), 'pendente', 'Taxa da plataforma PraiaGo'),
    (new.id, new.vendedor_id, 'repasse_vendedor', coalesce(new.vendor_amount, 0),       'pendente', 'Valor do vendedor apos taxa')
  on conflict (pedido_id, tipo) where pedido_id is not null do update
    set status      = 'pendente',
        valor       = excluded.valor,
        vendedor_id = excluded.vendedor_id,
        descricao   = excluded.descricao
    where public.financial_ledger.status = 'cancelado';

  return new;
end;
$$;


ALTER FUNCTION "public"."create_order_financial_ledger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decidir_triagem_ia"("p_ticket_id" "uuid", "p_decisao" "text", "p_observacao" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_ticket public.tickets%rowtype;
begin
  if v_actor is null or not private.is_admin() then
    raise exception 'Apenas administradores decidem a triagem da IA.' using errcode = '42501';
  end if;

  if p_decisao not in ('aprovado', 'negado') then
    raise exception 'Decisao invalida. Use aprovado ou negado.' using errcode = '22023';
  end if;

  update public.tickets
     set ia_triagem_status = p_decisao,
         ia_decidido_por = v_actor,
         ia_decidido_em = now(),
         ia_observacao_admin = nullif(trim(coalesce(p_observacao, '')), ''),
         status = case when p_decisao = 'negado' then 'resolvido' else 'em_andamento' end,
         nao_lida_usuario = true,
         updated_at = now()
   where id = p_ticket_id
     and origem = 'ia'
   returning * into v_ticket;

  if not found then
    raise exception 'Atendimento de triagem nao encontrado.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'ok', true,
    'ticket_id', v_ticket.id,
    'decisao', v_ticket.ia_triagem_status
  );
end;
$$;


ALTER FUNCTION "public"."decidir_triagem_ia"("p_ticket_id" "uuid", "p_decisao" "text", "p_observacao" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."email_ja_cadastrado"("p_email" "text") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists(select 1 from public.profiles where lower(email) = lower(trim(p_email)));
$$;


ALTER FUNCTION "public"."email_ja_cadastrado"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."emit_payment_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_tipo text;
begin
  if coalesce(new.payment_provider, 'manual') <> 'pagarme' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.payment_status = 'pendente' then
      v_tipo := 'pendente';
    end if;
  elsif new.payment_status is distinct from old.payment_status then
    v_tipo := case new.payment_status
      when 'pendente' then 'pendente'
      when 'aprovado' then 'aprovado'
      when 'recusado' then 'recusado'
      when 'rejeitado' then 'recusado'
      when 'cancelado' then 'cancelado'
      when 'estornado' then 'estornado'
      when 'chargeback' then 'estornado'
      else null
    end;
  end if;

  if v_tipo is not null then
    insert into public.payment_notifications (
      pedido_id,
      tipo,
      payment_status,
      pagamento,
      valor
    ) values (
      new.id,
      v_tipo,
      new.payment_status,
      new.pagamento,
      coalesce(new.total, 0)
    )
    on conflict (pedido_id, tipo) do nothing;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."emit_payment_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_banned_profile_visibility"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if coalesce(new.status, 'ativo') = 'banido' then
    new.online := false;
    new.verificado := false;

    update public.produtos
       set ativo = false
     where vendedor_id = new.id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_banned_profile_visibility"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_delivery_code"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.status in ('saiu_entrega', 'entregando')
     and nullif(trim(coalesce(new.codigo_entrega, '')), '') is null then
    new.codigo_entrega = private.generate_delivery_code();
    new.codigo_entrega_criado_em = now();
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."ensure_delivery_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_ip"("p_ip" "text", "p_limite" integer DEFAULT 60, "p_janela_seg" integer DEFAULT 60) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_bucket timestamptz;
  v_hits   integer;
  v_bloqueado record;
begin
  if p_ip is null or p_ip = '' or p_ip = 'desconhecido' then
    return jsonb_build_object('allowed', true);
  end if;

  -- já bloqueado (e não expirou)?
  select * into v_bloqueado from public.blocked_ips
   where ip = p_ip and (expira_em is null or expira_em > now());
  if found then
    return jsonb_build_object('allowed', false, 'reason', 'blocked', 'motivo', v_bloqueado.motivo);
  end if;

  -- conta na janela atual
  v_bucket := date_trunc('minute', now());
  insert into public.rate_limit (ip, bucket, hits) values (p_ip, v_bucket, 1)
    on conflict (ip, bucket) do update set hits = public.rate_limit.hits + 1
    returning hits into v_hits;

  -- passou do limite → auto-bloqueia por 15 min e loga
  if v_hits > p_limite then
    insert into public.blocked_ips (ip, motivo, auto, hits, expira_em)
      values (p_ip, 'auto: '||v_hits||' req/min (>'||p_limite||')', true, v_hits, now() + interval '15 minutes')
      on conflict (ip) do update set hits = excluded.hits, expira_em = excluded.expira_em, motivo = excluded.motivo;
    return jsonb_build_object('allowed', false, 'reason', 'rate', 'hits', v_hits);
  end if;

  return jsonb_build_object('allowed', true, 'hits', v_hits);
end;
$$;


ALTER FUNCTION "public"."guard_ip"("p_ip" "text", "p_limite" integer, "p_janela_seg" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role text := coalesce(m->>'role', 'cliente');
  v_lat double precision := case when (m->>'lat') ~ '^-?[0-9]+(\.[0-9]+)?$' then (m->>'lat')::double precision else null end;
  v_lng double precision := case when (m->>'lng') ~ '^-?[0-9]+(\.[0-9]+)?$' then (m->>'lng')::double precision else null end;
begin
  -- whitelist de seguranca: metadata NUNCA vira admin/sysadmin
  if v_role not in ('cliente', 'ambulante', 'restaurante', 'entregador') then
    v_role := 'cliente';
  end if;

  insert into public.profiles (
    id, nome, email, role, cpf, cnpj, razao_social, endereco, telefone, lat, lng, email_verificado
  )
  values (
    new.id,
    coalesce(m->>'nome', split_part(new.email, '@', 1)),
    new.email,
    v_role,
    nullif(private.only_digits(m->>'cpf'), ''),
    nullif(private.only_digits(m->>'cnpj'), ''),
    nullif(m->>'razao_social', ''),
    nullif(m->>'endereco', ''),
    nullif(m->>'telefone', ''),
    v_lat,
    v_lng,
    (new.email_confirmed_at is not null)
  )
  on conflict (id) do update
  set nome = coalesce(public.profiles.nome, excluded.nome),
      email = excluded.email,
      role = case
        when public.profiles.role in ('admin', 'sysadmin') then public.profiles.role
        when public.profiles.role = 'cliente' then excluded.role
        else public.profiles.role
      end,
      cpf = coalesce(public.profiles.cpf, excluded.cpf),
      cnpj = coalesce(public.profiles.cnpj, excluded.cnpj),
      razao_social = coalesce(public.profiles.razao_social, excluded.razao_social),
      endereco = coalesce(public.profiles.endereco, excluded.endereco),
      telefone = coalesce(public.profiles.telefone, excluded.telefone),
      lat = coalesce(public.profiles.lat, excluded.lat),
      lng = coalesce(public.profiles.lng, excluded.lng),
      email_verificado = excluded.email_verificado or public.profiles.email_verificado;

  return new;
end;
$_$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_user_confirmed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.profiles
     set email = new.email,
         email_verificado = (new.email_confirmed_at is not null)
   where id = new.id;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_user_confirmed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."liberar_repasses"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_liberados integer;
begin
  with atualizados as (
    update public.financial_ledger set status = 'disponivel', settled_at = now()
    where tipo = 'repasse_vendedor' and status = 'em_espera'
      and disponivel_em is not null and disponivel_em <= now()
    returning vendedor_id)
  select count(*) into v_liberados from atualizados;
  perform public.reconciliar_carteira(vendedor_id)
    from (select distinct vendedor_id from public.financial_ledger
          where tipo='repasse_vendedor' and status='disponivel' and vendedor_id is not null) t
    where exists (select 1 from public.profiles p where p.id = t.vendedor_id);
  return v_liberados;
end; $$;


ALTER FUNCTION "public"."liberar_repasses"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."limpar_rate_limit"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  delete from public.rate_limit where bucket < now() - interval '1 hour';
  delete from public.blocked_ips where auto is true and expira_em is not null and expira_em < now() - interval '1 day';
$$;


ALTER FUNCTION "public"."limpar_rate_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_security_event"("p_event_type" "text", "p_platform" "text" DEFAULT 'unknown'::"text", "p_email" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text", "p_route" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
declare
  v_event_type text := lower(trim(coalesce(p_event_type, '')));
  v_platform text := lower(trim(coalesce(p_platform, 'unknown')));
  v_email text := nullif(lower(left(trim(coalesce(p_email, '')), 320)), '');
  v_user_agent text := nullif(left(trim(coalesce(p_user_agent, '')), 600), '');
  v_route text := nullif(left(trim(coalesce(p_route, '')), 300), '');
  v_metadata jsonb := '{}'::jsonb;
  v_actor uuid := (select auth.uid());
  v_severity text := 'info';
  v_recent_failures integer := 0;
  v_id uuid;
begin
  if v_event_type not in (
    'login_success',
    'login_failed',
    'access_denied',
    'signup_created',
    'password_reset_requested',
    'password_changed',
    'fraud_flag_created',
    'suspicious_activity'
  ) then
    v_event_type := 'suspicious_activity';
  end if;

  if v_platform not in ('cliente', 'ambulante', 'restaurante', 'admin', 'supabase', 'system', 'unknown') then
    v_platform := 'unknown';
  end if;

  if p_metadata is not null and jsonb_typeof(p_metadata) = 'object' and length(p_metadata::text) <= 4000 then
    v_metadata := p_metadata;
  elsif p_metadata is not null then
    v_metadata := jsonb_build_object('truncated', true, 'reason', 'metadata invalido ou grande demais');
  end if;

  if v_event_type = 'login_failed' then
    select count(*)::integer
      into v_recent_failures
      from public.security_audit_logs
     where event_type = 'login_failed'
       and created_at >= now() - interval '15 minutes'
       and (
         (v_email is not null and lower(email) = v_email)
         or (v_email is null and actor_id = v_actor)
       );

    v_recent_failures := coalesce(v_recent_failures, 0) + 1;
    v_metadata := v_metadata || jsonb_build_object('recent_failures_15m', v_recent_failures);
    v_severity := case
      when v_recent_failures >= 10 then 'critical'
      when v_recent_failures >= 5 then 'high'
      else 'warning'
    end;
  elsif v_event_type in ('access_denied', 'password_reset_requested') then
    v_severity := 'warning';
  elsif v_event_type in ('password_changed', 'fraud_flag_created', 'suspicious_activity') then
    v_severity := 'high';
  else
    v_severity := 'info';
  end if;

  insert into public.security_audit_logs (
    event_type,
    severity,
    platform,
    user_id,
    actor_id,
    email,
    user_agent,
    route,
    metadata
  ) values (
    v_event_type,
    v_severity,
    v_platform,
    v_actor,
    v_actor,
    v_email,
    v_user_agent,
    v_route,
    v_metadata
  )
  returning id into v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."log_security_event"("p_event_type" "text", "p_platform" "text", "p_email" "text", "p_user_agent" "text", "p_route" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mover_estoque_do_pedido"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_item jsonb;
  v_qtd int;
  v_real boolean;
  v_morto boolean;
begin
  if new.itens_detalhe is null or jsonb_typeof(new.itens_detalhe) <> 'array' then
    return new;
  end if;

  v_real  := coalesce(new.status, '') not in ('aguardando_pagamento', 'cancelado');
  v_morto := coalesce(new.status, '') = 'cancelado'
             or new.refunded_at is not null
             or coalesce(new.payment_status, '') in ('recusado', 'estornado', 'expirado');

  -- DEBITA: virou pedido de verdade e ainda nao debitou.
  if v_real and not v_morto and not coalesce(new.estoque_baixado, false) then
    for v_item in select * from jsonb_array_elements(new.itens_detalhe) loop
      v_qtd := greatest(coalesce((v_item->>'qtd')::int, 0), 0);
      if v_qtd > 0 then
        update public.produtos
           set estoque = greatest(0, estoque - v_qtd)
         where id = (v_item->>'produto_id')::uuid
           and estoque is not null;
      end if;
    end loop;
    update public.pedidos set estoque_baixado = true where id = new.id;

  -- DEVOLVE: morreu depois de ter debitado.
  elsif v_morto and coalesce(new.estoque_baixado, false) then
    for v_item in select * from jsonb_array_elements(new.itens_detalhe) loop
      v_qtd := greatest(coalesce((v_item->>'qtd')::int, 0), 0);
      if v_qtd > 0 then
        update public.produtos
           set estoque = estoque + v_qtd
         where id = (v_item->>'produto_id')::uuid
           and estoque is not null;
      end if;
    end loop;
    update public.pedidos set estoque_baixado = false where id = new.id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."mover_estoque_do_pedido"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."obter_codigo_entrega"("p_pedido_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_codigo text;
begin
  if v_actor is null then
    raise exception 'Usuario nao autenticado.' using errcode = '28000';
  end if;

  select c.codigo
    into v_codigo
    from private.pedido_codigos_entrega c
    join public.pedidos p on p.id = c.pedido_id
   where c.pedido_id = p_pedido_id
     and (
       p.cliente_id = v_actor
       or private.has_permission('pedidos')
     );

  if not found then
    raise exception 'Codigo de entrega indisponivel para este usuario.'
      using errcode = '42501';
  end if;

  return v_codigo;
end;
$$;


ALTER FUNCTION "public"."obter_codigo_entrega"("p_pedido_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pagamentos_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


ALTER FUNCTION "public"."pagamentos_touch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pode_trocar_conta"("p_vendedor" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null
     or (
       v_actor is distinct from p_vendedor
       and not private.is_admin()
     ) then
    raise exception 'Sem permissao para consultar esta conta.'
      using errcode = '42501';
  end if;

  return
    not exists (
      select 1
        from public.seller_recipients sr
       where sr.vendedor_id = p_vendedor
         and sr.recipient_id is not null
    )
    or exists (
      select 1
        from public.bank_account_change_requests r
       where r.vendedor_id = p_vendedor
         and r.status = 'aprovado'
         and r.liberado_ate is not null
         and r.liberado_ate > now()
    );
end;
$$;


ALTER FUNCTION "public"."pode_trocar_conta"("p_vendedor" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."preparar_cadastro"("p_email" "text", "p_cpf" "text" DEFAULT NULL::"text", "p_cnpj" "text" DEFAULT NULL::"text", "p_ip" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_cpf text := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');
  v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), '');
  v_expira interval := '1 hour';
  v_reciclados int := 0;
  v_ids uuid[];
begin
  -- 1) Junta os cadastros abandonados que estao travando este cadastro.
  select coalesce(array_agg(u.id), '{}')
    into v_ids
    from auth.users u
    left join public.profiles p on p.id = u.id
   where u.email_confirmed_at is null
     and (
       -- mesma pessoa tentando de novo com o mesmo e-mail
       lower(u.email) = v_email
       -- ou documento preso num cadastro morto (codigo ja expirou)
       or (v_cpf is not null and p.cpf = v_cpf and u.created_at < now() - v_expira)
       or (v_cnpj is not null and p.cnpj = v_cnpj and u.created_at < now() - v_expira)
     );

  if array_length(v_ids, 1) > 0 then
    delete from public.signup_ips where user_id = any(v_ids);
    delete from public.profiles where id = any(v_ids);
    delete from auth.users where id = any(v_ids);
    v_reciclados := array_length(v_ids, 1);
  end if;

  -- 2) Devolve o que AINDA bloqueia, contando so contas confirmadas.
  return jsonb_build_object(
    'reciclados', v_reciclados,
    'cpf_em_uso', v_cpf is not null and exists (
      select 1 from public.profiles p join auth.users u on u.id = p.id
       where p.cpf = v_cpf and u.email_confirmed_at is not null
    ),
    'cnpj_em_uso', v_cnpj is not null and exists (
      select 1 from public.profiles p join auth.users u on u.id = p.id
       where p.cnpj = v_cnpj and u.email_confirmed_at is not null
    ),
    'contas_confirmadas_no_ip', (
      select count(*) from public.signup_ips s
       join auth.users u on u.id = s.user_id
       where p_ip is not null and s.ip = p_ip and u.email_confirmed_at is not null
    )
  );
end;
$$;


ALTER FUNCTION "public"."preparar_cadastro"("p_email" "text", "p_cpf" "text", "p_cnpj" "text", "p_ip" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prepare_kyc_check_statuses"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_email_ok boolean := false;
  v_profile public.profiles%rowtype;
begin
  new.cpf := nullif(private.only_digits(new.cpf), '');
  new.cnpj := nullif(private.only_digits(new.cnpj), '');

  select * into v_profile
    from public.profiles
   where id = coalesce(new.user_id, new.restaurante_id);

  select exists (
    select 1
      from auth.users u
     where u.id = coalesce(new.user_id, new.restaurante_id)
       and u.email_confirmed_at is not null
  )
    into v_email_ok;

  new.nome_check_status := case
    when private.has_realistic_name(new.nome_completo) then 'aprovado'
    else 'rejeitado'
  end;

  new.cpf_check_status := case
    when private.is_valid_cpf(new.cpf) then 'aprovado'
    else 'rejeitado'
  end;

  new.cnpj_check_status := case
    when coalesce(new.tipo, '') = 'restaurante' then
      case when private.is_valid_cnpj(new.cnpj) then 'aprovado' else 'rejeitado' end
    when nullif(new.cnpj, '') is null then 'dispensado'
    when private.is_valid_cnpj(new.cnpj) then 'aprovado'
    else 'rejeitado'
  end;

  new.nascimento_check_status := case
    when coalesce(new.tipo, '') = 'restaurante' then 'dispensado'
    when private.is_adult_birthdate(new.data_nascimento) then 'aprovado'
    else 'rejeitado'
  end;

  new.email_check_status := case when v_email_ok then 'aprovado' else 'rejeitado' end;

  new.documento_check_status := case
    when nullif(coalesce(new.rg_frente_url, new.cnh_url, ''), '') is not null then coalesce(nullif(new.documento_check_status, 'pendente'), 'pendente')
    else 'rejeitado'
  end;

  new.face_check_status := case
    when nullif(coalesce(new.selfie_url, ''), '') is not null then coalesce(nullif(new.face_check_status, 'pendente'), 'pendente')
    else 'rejeitado'
  end;

  new.local_check_status := case
    when coalesce(new.tipo, '') = 'restaurante'
      and nullif(coalesce(new.foto_loja_url, v_profile.endereco, ''), '') is not null then coalesce(nullif(new.local_check_status, 'pendente'), 'pendente')
    when coalesce(new.tipo, '') = 'ambulante'
      and nullif(coalesce(new.praia_principal, ''), '') is not null then coalesce(nullif(new.local_check_status, 'pendente'), 'pendente')
    when coalesce(new.tipo, '') = 'entregador' then 'dispensado'
    else 'rejeitado'
  end;

  new.validation_errors := jsonb_strip_nulls(jsonb_build_object(
    'nome', case when new.nome_check_status = 'rejeitado' then 'Nome real incompleto ou invalido.' end,
    'cpf', case when new.cpf_check_status = 'rejeitado' then 'CPF invalido.' end,
    'cnpj', case when new.cnpj_check_status = 'rejeitado' then 'CNPJ invalido ou ausente.' end,
    'nascimento', case when new.nascimento_check_status = 'rejeitado' then 'Data de nascimento invalida ou menor de 18 anos.' end,
    'email', case when new.email_check_status = 'rejeitado' then 'E-mail ainda nao confirmado.' end,
    'documento', case when new.documento_check_status = 'rejeitado' then 'Documento oficial ausente.' end,
    'face', case when new.face_check_status = 'rejeitado' then 'Selfie/rosto ausente.' end,
    'local', case when new.local_check_status = 'rejeitado' then 'Local/base ainda nao comprovado.' end
  ));

  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."prepare_kyc_check_statuses"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prepare_profile_cliente_cpf"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  new.cpf := nullif(private.only_digits(new.cpf), '');

  if coalesce(new.role, 'cliente') = 'cliente' then
    if new.cpf is null then
      new.cpf_check_status := 'pendente';
      new.cpf_confirmado_em := null;
    elsif private.is_valid_cpf(new.cpf) then
      new.cpf_check_status := 'aprovado';
      new.cpf_confirmado_em := coalesce(new.cpf_confirmado_em, now());
    else
      new.cpf_check_status := 'rejeitado';
      new.cpf_confirmado_em := null;
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."prepare_profile_cliente_cpf"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prepare_ticket_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_nome text;
  v_email text;
begin
  if current_user in ('postgres', 'service_role') or private.is_admin() then
    new.assunto := left(trim(new.assunto), 200);
    new.mensagem := left(trim(new.mensagem), 4000);
    return new;
  end if;

  if v_actor is null then
    raise exception 'Atendimento exige usuario autenticado.'
      using errcode = '28000';
  end if;

  select p.nome, p.email
    into v_nome, v_email
    from public.profiles p
   where p.id = v_actor;

  new.usuario_id := v_actor;
  new.usuario_nome := coalesce(nullif(trim(v_nome), ''), 'Usuario PraiaGo');
  new.usuario_email := coalesce(nullif(trim(v_email), ''), auth.jwt() ->> 'email', 'nao informado');
  new.plataforma := case
    when new.plataforma in ('cliente', 'ambulante', 'restaurante') then new.plataforma
    else 'cliente'
  end;
  new.assunto := left(trim(new.assunto), 200);
  new.mensagem := left(trim(new.mensagem), 4000);
  new.status := 'aberto';
  new.prioridade := 'media';
  new.resposta := null;
  new.nao_lida_usuario := false;
  new.nao_lida_admin := true;
  new.origem := 'humano';
  new.ia_categoria := null;
  new.ia_resumo := null;
  new.ia_exige_comprovacao := false;
  new.ia_triagem_status := null;
  new.ia_decidido_por := null;
  new.ia_decidido_em := null;
  new.ia_observacao_admin := null;
  new.pedido_ref := null;
  new.avaliacao_nota := null;
  new.avaliacao_comentario := null;
  new.avaliado_em := null;
  new.created_at := now();
  new.updated_at := now();

  if length(new.assunto) = 0 or length(new.mensagem) = 0 then
    raise exception 'Assunto e mensagem sao obrigatorios.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."prepare_ticket_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prepare_ticket_message_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.mensagem := left(trim(new.mensagem), 4000);
  if length(new.mensagem) = 0 then
    raise exception 'Mensagem obrigatoria.' using errcode = '23514';
  end if;

  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if private.is_admin() then
    if not private.has_permission('atendimento') then
      raise exception 'Sem permissao para responder atendimentos.'
        using errcode = '42501';
    end if;
    new.autor := 'admin';
  else
    if not exists (
      select 1
        from public.tickets t
       where t.id = new.ticket_id
         and t.usuario_id = (select auth.uid())
    ) then
      raise exception 'Sem permissao para responder este atendimento.'
        using errcode = '42501';
    end if;
    new.autor := 'usuario';
  end if;

  new.created_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."prepare_ticket_message_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."previa_saque_rapido"("p_vendedor" "uuid") RETURNS TABLE("disponivel_agora" numeric, "antecipavel" numeric, "taxa_percent" numeric, "taxa_valor" numeric, "receberia" numeric, "ativo" boolean, "antecipavel_credito" numeric, "taxa_percent_credito" numeric, "taxa_valor_credito" numeric, "receberia_credito" numeric, "credito_ativo" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_pct numeric; v_ativo boolean; v_pct_cred numeric; v_cred_ativo boolean;
  v_rapido numeric; v_credito numeric;
  v_disp numeric; v_sacado numeric; v_taxas numeric;
  v_taxa numeric; v_taxa_cred numeric;
begin
  if auth.uid() is distinct from p_vendedor
     and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'sysadmin') then
    raise exception 'sem permissao';
  end if;

  select coalesce(saque_rapido_percent, 5), coalesce(saque_rapido_ativo, false),
         coalesce(saque_rapido_percent_credito, 8), coalesce(saque_rapido_credito_ativo, false)
    into v_pct, v_ativo, v_pct_cred, v_cred_ativo
    from public.payment_settings where id is true;

  select
    coalesce(sum(fl.valor) filter (where coalesce(pe.pagamento,'pix') <> 'credito_online'), 0),
    coalesce(sum(fl.valor) filter (where pe.pagamento = 'credito_online'), 0)
    into v_rapido, v_credito
    from public.financial_ledger fl
    left join public.pedidos pe on pe.id = fl.pedido_id
   where fl.vendedor_id = p_vendedor and fl.tipo = 'repasse_vendedor' and fl.status = 'em_espera';

  select coalesce(sum(fl.valor), 0) into v_disp from public.financial_ledger fl
   where fl.vendedor_id = p_vendedor and fl.tipo = 'repasse_vendedor' and fl.status = 'disponivel';

  select coalesce(sum(fl.valor), 0) into v_taxas from public.financial_ledger fl
   where fl.vendedor_id = p_vendedor and fl.tipo = 'taxa_antecipacao' and fl.status <> 'cancelado';

  select coalesce(sum(po.valor), 0) into v_sacado from public.payouts po
   where po.vendedor_id = p_vendedor and po.status in ('solicitado','processando','pago');

  v_taxa      := round(v_rapido  * v_pct      / 100, 2);
  v_taxa_cred := round(v_credito * v_pct_cred / 100, 2);

  return query select
    greatest(0, v_disp - v_taxas - v_sacado),
    v_rapido, v_pct, v_taxa, v_rapido - v_taxa, coalesce(v_ativo, false),
    v_credito, v_pct_cred, v_taxa_cred, v_credito - v_taxa_cred, coalesce(v_cred_ativo, false);
end;
$$;


ALTER FUNCTION "public"."previa_saque_rapido"("p_vendedor" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_order_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_client boolean := old.cliente_id = v_actor;
  v_seller boolean := (
    old.vendedor_id = v_actor
    or old.restaurante_id = v_actor
    or old.ambulante_id = v_actor
  );
  v_finance_changed boolean := (
    new.total is distinct from old.total
    or new.subtotal_amount is distinct from old.subtotal_amount
    or new.discount_amount is distinct from old.discount_amount
    or new.discount_code is distinct from old.discount_code
    or new.discount_reason is distinct from old.discount_reason
    or new.pagamento is distinct from old.pagamento
    or new.payment_provider is distinct from old.payment_provider
    or new.payment_status is distinct from old.payment_status
    or new.payment_reference is distinct from old.payment_reference
    or new.gross_amount is distinct from old.gross_amount
    or new.platform_fee_amount is distinct from old.platform_fee_amount
    or new.vendor_amount is distinct from old.vendor_amount
    or new.settlement_status is distinct from old.settlement_status
    or new.paid_at is distinct from old.paid_at
    or new.refunded_at is distinct from old.refunded_at
    or new.payment_checkout_url is distinct from old.payment_checkout_url
    or new.payment_details is distinct from old.payment_details
    or new.repasse_liberado_em is distinct from old.repasse_liberado_em
  );
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if private.is_admin() then
    if v_finance_changed and not private.has_permission('financeiro') then
      raise exception 'Sem permissao financeira para alterar este pedido.'
        using errcode = '42501';
    end if;
    if not (
      private.has_permission('pedidos')
      or private.has_permission('financeiro')
    ) then
      raise exception 'Sem permissao para alterar pedidos.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if v_client then
    if (to_jsonb(new) - array[
      'status',
      'reembolso_status',
      'reembolso_motivo',
      'reembolso_solicitado_em'
    ]) is distinct from (to_jsonb(old) - array[
      'status',
      'reembolso_status',
      'reembolso_motivo',
      'reembolso_solicitado_em'
    ]) then
      raise exception 'Cliente tentou alterar campos protegidos do pedido.'
        using errcode = '42501';
    end if;

    if new.status is distinct from old.status
       and not (
         new.status = 'cancelado'
         and old.status in ('novo', 'aguardando_pagamento')
       ) then
      raise exception 'Pedido nao pode ser cancelado nesta etapa.'
        using errcode = '23514';
    end if;

    if new.reembolso_status is distinct from old.reembolso_status then
      if new.reembolso_status <> 'solicitado'
         or old.reembolso_status not in ('nenhum', 'rejeitado') then
        raise exception 'Transicao de reembolso invalida.'
          using errcode = '23514';
      end if;
      new.reembolso_solicitado_em := now();
      new.reembolso_motivo := left(
        coalesce(nullif(trim(new.reembolso_motivo), ''), 'Solicitado pelo cliente.'),
        500
      );
    elsif new.reembolso_motivo is distinct from old.reembolso_motivo
       or new.reembolso_solicitado_em is distinct from old.reembolso_solicitado_em then
      raise exception 'Campos de reembolso so podem mudar ao abrir a solicitacao.'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if v_seller then
    if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
      raise exception 'Vendedor so pode atualizar o andamento do pedido.'
        using errcode = '42501';
    end if;

    if new.status is distinct from old.status
       and not (
         (old.status = 'novo' and new.status in ('preparando', 'cancelado'))
         or (old.status = 'preparando' and new.status in ('pronto', 'saiu_entrega', 'cancelado'))
         or (old.status = 'pronto' and new.status in ('entregando', 'saiu_entrega', 'cancelado'))
         or (
           old.status in ('entregando', 'saiu_entrega')
           and new.status = 'entregue'
           and coalesce(current_setting('praiago.delivery_confirmed', true), '') = 'true'
         )
       ) then
      raise exception 'Transicao de status do pedido invalida.'
        using errcode = '23514';
    end if;

    return new;
  end if;

  raise exception 'Sem permissao para alterar este pedido.'
    using errcode = '42501';
end;
$$;


ALTER FUNCTION "public"."protect_order_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_profile_verification_flags"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if old.cpf_check_status = 'aprovado'
     and new.cpf is distinct from old.cpf then
    raise exception 'CPF confirmado nao pode ser alterado.'
      using errcode = '23514';
  end if;

  if private.is_admin() then
    if not private.is_sysadmin()
       and (
         new.id is distinct from old.id
         or new.created_at is distinct from old.created_at
         or new.email is distinct from old.email
         or new.role is distinct from old.role
         or new.permissions is distinct from old.permissions
       ) then
      raise exception 'Somente sysadmin pode alterar identidade, role ou permissoes.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- Nome de VENDEDOR só muda por aprovação (public.aprovar_troca_nome).
  if coalesce(new.role, old.role) in ('ambulante', 'restaurante')
     and new.nome is distinct from old.nome then
    raise exception 'O nome da loja so muda com aprovacao da equipe. Peca a troca no seu perfil.'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.email is distinct from old.email
     or new.role is distinct from old.role
     or new.verificado is distinct from old.verificado
     or new.email_verificado is distinct from old.email_verificado
     or new.status is distinct from old.status
     or new.banido_em is distinct from old.banido_em
     or new.ban_motivo is distinct from old.ban_motivo
     or new.permissions is distinct from old.permissions
     or new.avaliacao_media is distinct from old.avaliacao_media
     or new.total_avaliacoes is distinct from old.total_avaliacoes
     or new.comissao_percent is distinct from old.comissao_percent then
    raise exception 'Campo privilegiado do perfil nao pode ser alterado pelo aplicativo.'
      using errcode = '42501';
  end if;

  if new.cpf is not distinct from old.cpf then
    new.cpf_check_status := old.cpf_check_status;
    new.cpf_confirmado_em := old.cpf_confirmado_em;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."protect_profile_verification_flags"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."protect_profile_verification_flags"() IS 'Protege confirmacao de e-mail e torna o CPF aprovado imutavel para usuarios comuns.';



CREATE OR REPLACE FUNCTION "public"."protect_ticket_owner_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if private.is_admin() then
    if not private.has_permission('atendimento') then
      raise exception 'Sem permissao para administrar atendimentos.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.usuario_id is distinct from auth.uid() then
    raise exception 'Sem permissao para alterar este atendimento.'
      using errcode = '42501';
  end if;

  if (to_jsonb(new) - array[
    'status',
    'updated_at',
    'nao_lida_usuario',
    'nao_lida_admin',
    'avaliacao_nota',
    'avaliacao_comentario',
    'avaliado_em'
  ]) is distinct from (to_jsonb(old) - array[
    'status',
    'updated_at',
    'nao_lida_usuario',
    'nao_lida_admin',
    'avaliacao_nota',
    'avaliacao_comentario',
    'avaliado_em'
  ]) then
    raise exception 'Campos administrativos do atendimento sao protegidos.'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status
     and not (
       new.status = 'em_andamento'
       and old.status in ('aberto', 'em_andamento')
     ) then
    raise exception 'Usuario nao pode concluir ou reclassificar atendimento.'
      using errcode = '42501';
  end if;

  if new.nao_lida_usuario is true and old.nao_lida_usuario is distinct from true then
    raise exception 'Marcador de leitura do administrador e protegido.'
      using errcode = '42501';
  end if;

  if new.nao_lida_admin is false and old.nao_lida_admin is distinct from false then
    raise exception 'Usuario nao pode limpar o alerta do administrador.'
      using errcode = '42501';
  end if;

  if new.avaliacao_nota is distinct from old.avaliacao_nota then
    if old.status not in ('resolvido', 'fechado')
       or old.avaliacao_nota is not null
       or new.avaliacao_nota not between 1 and 5 then
      raise exception 'Avaliacao de atendimento invalida.'
        using errcode = '23514';
    end if;
    new.avaliacao_comentario := nullif(
      left(trim(coalesce(new.avaliacao_comentario, '')), 1000),
      ''
    );
    new.avaliado_em := now();
  elsif new.avaliacao_comentario is distinct from old.avaliacao_comentario
     or new.avaliado_em is distinct from old.avaliado_em then
    raise exception 'Avaliacao deve ser enviada uma unica vez.'
      using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."protect_ticket_owner_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."proteger_localizacao_fixa_restaurante"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_coordenada_mudou       boolean;
  v_endereco_mudou         boolean;
  v_so_preencheu_endereco  boolean;
begin
  if coalesce(new.role, old.role) is distinct from 'restaurante' then
    return new;
  end if;

  v_coordenada_mudou := new.lat is distinct from old.lat
                        or new.lng is distinct from old.lng;
  v_endereco_mudou   := new.endereco is distinct from old.endereco;

  -- Update que nao encosta em localizacao: segue direto.
  if not v_coordenada_mudou and not v_endereco_mudou then
    return new;
  end if;

  -- Loja que ainda nao tem ponto nenhum: a primeira gravacao e livre.
  if old.lat is null and old.lng is null then
    return new;
  end if;

  -- A brecha estreita: so preencher endereco que estava vazio, sem mexer na
  -- coordenada. Depois de preenchido, volta a ser travado como o resto.
  v_so_preencheu_endereco := not v_coordenada_mudou
                             and old.endereco is null
                             and coalesce(btrim(new.endereco), '') <> '';
  if v_so_preencheu_endereco then
    return new;
  end if;

  -- Caminhos autorizados de sempre: correcao aprovada, service role, admin.
  if coalesce(current_setting('praiago.location_write_authorized', true), '') = 'on'
     or current_user in ('postgres', 'service_role')
     or private.is_admin() then
    return new;
  end if;

  raise exception 'Localizacao fixa. Solicite autorizacao no perfil antes de corrigir.'
    using errcode = '42501';
end;
$$;


ALTER FUNCTION "public"."proteger_localizacao_fixa_restaurante"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallets" (
    "vendedor_id" "uuid" NOT NULL,
    "saldo_a_liberar" numeric DEFAULT 0 NOT NULL,
    "saldo_disponivel" numeric DEFAULT 0 NOT NULL,
    "total_sacado" numeric DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wallets" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reconciliar_carteira"("p_vendedor" "uuid") RETURNS "public"."wallets"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_a_liberar  numeric;
  v_disponivel numeric;
  v_taxas      numeric;
  v_sacado     numeric;
  v_row        public.wallets;
begin
  select coalesce(sum(valor), 0) into v_a_liberar
  from public.financial_ledger
  where vendedor_id = p_vendedor and tipo = 'repasse_vendedor'
    and status in ('pendente', 'em_espera');

  select coalesce(sum(valor), 0) into v_disponivel
  from public.financial_ledger
  where vendedor_id = p_vendedor and tipo = 'repasse_vendedor'
    and status = 'disponivel';

  -- Taxas cobradas do vendedor reduzem o que ele pode sacar.
  select coalesce(sum(valor), 0) into v_taxas
  from public.financial_ledger
  where vendedor_id = p_vendedor and tipo = 'taxa_antecipacao'
    and status <> 'cancelado';

  select coalesce(sum(valor), 0) into v_sacado
  from public.payouts
  where vendedor_id = p_vendedor and status in ('solicitado','processando','pago');

  insert into public.wallets (vendedor_id, saldo_a_liberar, saldo_disponivel, total_sacado, updated_at)
  values (p_vendedor, v_a_liberar, greatest(0, v_disponivel - v_taxas - v_sacado),
          (select coalesce(sum(valor),0) from public.payouts where vendedor_id = p_vendedor and status = 'pago'),
          now())
  on conflict (vendedor_id) do update
    set saldo_a_liberar  = excluded.saldo_a_liberar,
        saldo_disponivel = excluded.saldo_disponivel,
        total_sacado     = excluded.total_sacado,
        updated_at       = now()
  returning * into v_row;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."reconciliar_carteira"("p_vendedor" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recusar_troca_nome"("p_solicitacao_id" "uuid", "p_observacao" "text" DEFAULT NULL::"text") RETURNS "public"."solicitacoes_troca_nome"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_sol public.solicitacoes_troca_nome%rowtype;
begin
  if not private.is_admin() then
    raise exception 'Apenas a equipe pode recusar troca de nome.' using errcode = '42501';
  end if;

  update public.solicitacoes_troca_nome
     set status = 'recusada',
         observacao_admin = p_observacao,
         decidido_por = auth.uid(),
         decidido_em = now(),
         updated_at = now()
   where id = p_solicitacao_id and status = 'pendente'
  returning * into v_sol;

  if not found then
    raise exception 'Solicitacao nao encontrada ou ja decidida.' using errcode = '22023';
  end if;

  return v_sol;
end;
$$;


ALTER FUNCTION "public"."recusar_troca_nome"("p_solicitacao_id" "uuid", "p_observacao" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rejeitar_verificacao"("p_verificacao_id" "uuid", "p_motivo" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v public.verificacoes%rowtype;
begin
  if v_actor is null or not private.is_admin() then
    raise exception 'Apenas administradores podem rejeitar KYC.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Informe o motivo da rejeicao.' using errcode = 'P0001';
  end if;

  update public.verificacoes
     set status = 'rejeitado', motivo_rejeicao = trim(p_motivo),
         kyc_override = false, kyc_override_reason = null, kyc_override_by = null, kyc_override_at = null
   where id = p_verificacao_id
   returning * into v;
  if not found then
    raise exception 'Verificacao nao encontrada.' using errcode = 'P0002';
  end if;

  -- Trava o vendedor: rejeitado = não verificado
  update public.profiles set verificado = false
   where id = coalesce(v.user_id, v.restaurante_id);

  return jsonb_build_object('ok', true, 'verificacao_id', v.id, 'status', v.status);
end;
$$;


ALTER FUNCTION "public"."rejeitar_verificacao"("p_verificacao_id" "uuid", "p_motivo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_coupon_on_unpaid_cancel"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_deleted integer := 0;
begin
  if new.status <> 'cancelado'
     or old.status = 'cancelado'
     or new.discount_code is null
     or old.payment_status = 'aprovado'
     or new.payment_status = 'aprovado' then
    return new;
  end if;

  delete from public.cupom_usos
   where pedido_id = new.id;
  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    update public.cupons
       set usos = greatest(0, coalesce(usos, 0) - v_deleted),
           updated_at = now()
     where codigo = new.discount_code;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."release_coupon_on_unpaid_cancel"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reserve_event_ticket_stock"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.event_ticket_lots
  set estoque_disponivel = case
      when estoque_disponivel is null then null
      else estoque_disponivel - new.quantidade
    end,
    status = case
      when estoque_disponivel is not null and estoque_disponivel - new.quantidade <= 0 then 'esgotado'
      else status
    end,
    updated_at = now()
  where id = new.ticket_lot_id
    and status = 'disponivel'
    and (estoque_disponivel is null or estoque_disponivel >= new.quantidade);

  if not found then
    raise exception 'Ingresso indisponivel ou estoque insuficiente.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."reserve_event_ticket_stock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_event_ticket_stock"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if old.status not in ('cancelado','pagamento_recusado','reembolsado','chargeback')
     and new.status in ('cancelado','pagamento_recusado','reembolsado','chargeback') then
    update public.event_ticket_lots
    set estoque_disponivel = case
        when estoque_disponivel is null then null
        else estoque_disponivel + old.quantidade
      end,
      status = case
        when status = 'esgotado' then 'disponivel'
        else status
      end,
      updated_at = now()
    where id = old.ticket_lot_id;
  end if;

  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."restore_event_ticket_stock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revisar_correcao_localizacao"("p_solicitacao_id" "uuid", "p_aprovar" boolean, "p_observacao" "text" DEFAULT NULL::"text") RETURNS "public"."solicitacoes_correcao_localizacao"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_solicitacao public.solicitacoes_correcao_localizacao%rowtype;
begin
  if v_uid is null or not private.is_admin() then
    raise exception 'Apenas administradores podem revisar a solicitacao.'
      using errcode = '42501';
  end if;

  select *
    into v_solicitacao
    from public.solicitacoes_correcao_localizacao
   where id = p_solicitacao_id
   for update;

  if not found then
    raise exception 'Solicitacao nao encontrada.' using errcode = 'P0002';
  end if;

  if v_solicitacao.status <> 'pendente' then
    raise exception 'Esta solicitacao ja foi revisada.' using errcode = '22023';
  end if;

  update public.solicitacoes_correcao_localizacao
     set status = case when p_aprovar then 'aprovada' else 'rejeitada' end,
         observacao_admin = nullif(btrim(coalesce(p_observacao, '')), ''),
         revisado_por = v_uid,
         revisado_em = now(),
         autorizado_ate = case when p_aprovar then now() + interval '7 days' else null end,
         updated_at = now()
   where id = p_solicitacao_id
  returning * into v_solicitacao;

  return v_solicitacao;
end;
$$;


ALTER FUNCTION "public"."revisar_correcao_localizacao"("p_solicitacao_id" "uuid", "p_aprovar" boolean, "p_observacao" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rodar_robo_eventos"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Apenas administradores podem rodar o robo.' using errcode = '42501';
  end if;
  perform private.disparar_caca_eventos();
  return jsonb_build_object('ok', true, 'status', 'rodando_em_segundo_plano');
end;
$$;


ALTER FUNCTION "public"."rodar_robo_eventos"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_codigo_entrega"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW.codigo_entrega IS NULL THEN
    NEW.codigo_entrega := lpad((floor(random()*10000))::int::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_codigo_entrega"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_cupons_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  if new.codigo is not null then
    new.codigo = upper(regexp_replace(trim(new.codigo), '\s+', '', 'g'));
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_cupons_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_event_ticket_lot_pricing"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_base numeric(10,2);
begin
  new.updated_at = now();
  new.preco_origem = round(coalesce(new.preco_origem, 0)::numeric, 2);
  new.taxa_origem = round(coalesce(new.taxa_origem, 0)::numeric, 2);
  new.markup_percent = round(coalesce(new.markup_percent, 25)::numeric, 2);
  new.markup_percent_credito = round(coalesce(new.markup_percent_credito, 35)::numeric, 2);
  v_base = round((new.preco_origem + new.taxa_origem)::numeric, 2);
  new.markup_amount = round((v_base * new.markup_percent / 100)::numeric, 2);
  new.preco_venda = round((v_base + new.markup_amount)::numeric, 2);
  new.preco_venda_credito = round((v_base * (1 + new.markup_percent_credito / 100))::numeric, 2);

  if new.estoque_total is not null and new.estoque_disponivel is null then
    new.estoque_disponivel = new.estoque_total;
  end if;

  if new.estoque_disponivel = 0 and new.status = 'disponivel' then
    new.status = 'esgotado';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_event_ticket_lot_pricing"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_event_ticket_order_totals"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  lote public.event_ticket_lots%rowtype;
  v_preco numeric(10,2);
begin
  select * into lote from public.event_ticket_lots where id = new.ticket_lot_id;

  if not found then
    raise exception 'Lote de ingresso nao encontrado.';
  end if;

  if new.metodo_pagamento is null then
    new.metodo_pagamento = 'pix';
  end if;

  -- Credito tem markup maior (taxa do gateway); pix e debito usam o mesmo.
  v_preco = case when new.metodo_pagamento = 'credito'
                 then lote.preco_venda_credito
                 else lote.preco_venda end;

  new.evento_id = lote.evento_id;
  new.quantidade = greatest(1, least(coalesce(new.quantidade, 1), 20));
  new.preco_origem_unit = lote.preco_origem;
  new.preco_unit = v_preco;
  new.subtotal_origem = round((lote.preco_origem * new.quantidade)::numeric, 2);
  new.total = round((v_preco * new.quantidade)::numeric, 2);
  new.markup_total = round((new.total - new.subtotal_origem)::numeric, 2);
  new.updated_at = now();

  if new.status is null then
    new.status = 'aguardando_pagamento';
  end if;
  if new.delivery_status is null then
    new.delivery_status = 'aguardando_pagamento';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_event_ticket_order_totals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_order_finance_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  cfg record;
  gross numeric(10,2);
  base numeric(10,2);
  acrescimo numeric(10,2);
  fee numeric(10,2);
  vendor_value numeric(10,2);
  method text;
  presencial boolean;
begin
  select platform_fee_percent, platform_fee_fixed, presencial_fee_mode
    into cfg from public.payment_settings where id is true;

  gross     := coalesce(new.total, 0)::numeric(10,2);
  acrescimo := coalesce(new.credit_surcharge_amount, 0)::numeric(10,2);
  -- A comissao incide sobre o valor DOS PRODUTOS, nao sobre o acrescimo:
  -- senao a plataforma cobraria comissao em cima da propria taxa.
  base      := greatest(0, gross - acrescimo)::numeric(10,2);

  fee := round(
    (base * coalesce(cfg.platform_fee_percent, 10.00) / 100
     + coalesce(cfg.platform_fee_fixed, 0.00))::numeric, 2);

  -- Vendedor recebe o mesmo tendo sido PIX ou credito. O acrescimo e todo da
  -- plataforma — foi ela que assumiu o custo do credito.
  vendor_value := greatest(0, round((base - fee)::numeric, 2));

  method := coalesce(new.pagamento, 'pix');
  presencial := method in ('dinheiro', 'cartao_fisico', 'debito_fisico', 'credito_fisico');

  new.gross_amount := gross;
  new.platform_fee_amount := round((fee + acrescimo)::numeric, 2);
  new.vendor_amount := vendor_value;

  if tg_op = 'INSERT' or new.pagamento is distinct from old.pagamento then
    new.payment_provider := case when presencial then 'manual' else 'pagarme' end;
    new.payment_status := case when presencial then 'presencial' else 'pendente' end;
    new.settlement_status := case
      when presencial then coalesce(cfg.presencial_fee_mode, 'cobrar_vendedor')
      else 'pendente' end;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_order_finance_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_pedido_customer_contact"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  profile_phone text;
begin
  if new.cliente_id is null then
    new.cliente_telefone := null;
    return new;
  end if;

  select nullif(regexp_replace(coalesce(profile.telefone, ''), '[^0-9]', '', 'g'), '')
    into profile_phone
  from public.profiles as profile
  where profile.id = new.cliente_id;

  new.cliente_telefone := case
    when char_length(profile_phone) between 10 and 13 then profile_phone
    else null
  end;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_pedido_customer_contact"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_promocoes_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_promocoes_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."solicitar_correcao_localizacao"("p_motivo" "text") RETURNS "public"."solicitacoes_correcao_localizacao"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_perfil public.profiles%rowtype;
  v_solicitacao public.solicitacoes_correcao_localizacao%rowtype;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if v_uid is null then
    raise exception 'Sessao invalida.' using errcode = '42501';
  end if;

  if char_length(v_motivo) < 8 or char_length(v_motivo) > 500 then
    raise exception 'Explique o motivo da correcao em 8 a 500 caracteres.'
      using errcode = '22023';
  end if;

  select *
    into v_perfil
    from public.profiles
   where id = v_uid
   for update;

  if not found
     or v_perfil.role <> 'restaurante'
     or coalesce(v_perfil.status, 'ativo') = 'banido' then
    raise exception 'Apenas restaurante ativo pode solicitar correcao.'
      using errcode = '42501';
  end if;

  update public.solicitacoes_correcao_localizacao
     set status = 'cancelada',
         observacao_admin = coalesce(observacao_admin, 'Autorizacao expirada sem uso.'),
         updated_at = now()
   where restaurante_id = v_uid
     and status = 'aprovada'
     and autorizado_ate <= now();

  if exists (
    select 1
      from public.solicitacoes_correcao_localizacao
     where restaurante_id = v_uid
       and status in ('pendente', 'aprovada')
  ) then
    raise exception 'Ja existe uma solicitacao ativa para este restaurante.'
      using errcode = '23505';
  end if;

  insert into public.solicitacoes_correcao_localizacao (
    restaurante_id,
    motivo,
    endereco_atual,
    lat_atual,
    lng_atual
  ) values (
    v_uid,
    v_motivo,
    v_perfil.endereco,
    v_perfil.lat,
    v_perfil.lng
  )
  returning * into v_solicitacao;

  return v_solicitacao;
end;
$$;


ALTER FUNCTION "public"."solicitar_correcao_localizacao"("p_motivo" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vendedor_id" "uuid" NOT NULL,
    "valor" numeric NOT NULL,
    "chave_pix" "text",
    "status" "text" DEFAULT 'solicitado'::"text" NOT NULL,
    "provider" "text" DEFAULT 'pendente_config'::"text",
    "ledger_entry_id" "uuid",
    "erro" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider_transfer_id" "text",
    CONSTRAINT "payouts_valor_check" CHECK (("valor" > (0)::numeric))
);


ALTER TABLE "public"."payouts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."payouts"."provider_transfer_id" IS 'Id da transferencia no provedor de pagamento.';



CREATE OR REPLACE FUNCTION "public"."solicitar_saque"("p_vendedor" "uuid", "p_valor" numeric) RETURNS "public"."payouts"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_liberado    numeric;
  v_taxas       numeric;
  v_ja_sacado   numeric;
  v_disponivel  numeric;
  v_recebedor   text;
  v_provider    text;
  v_payout      public.payouts;
  v_ledger_id   uuid;
begin
  if p_valor is null or p_valor <= 0 then raise exception 'Valor invalido.'; end if;

  -- Normaliza pra centavos antes de qualquer conferencia.
  p_valor := round(p_valor, 2);
  if p_valor <= 0 then raise exception 'Valor invalido.'; end if;

  -- Trava por vendedor: segura a segunda chamada simultanea ate a primeira
  -- terminar, entao ela releia o saldo ja com o payout da primeira contado.
  perform pg_advisory_xact_lock(hashtextextended(p_vendedor::text, 0));

  select coalesce(sum(valor),0) into v_liberado
  from public.financial_ledger
  where vendedor_id = p_vendedor and tipo = 'repasse_vendedor' and status = 'disponivel';

  -- Mesma regra do reconciliar_carteira/carteira_espelho: taxa cobrada do
  -- vendedor reduz o que ele pode sacar.
  select coalesce(sum(valor),0) into v_taxas
  from public.financial_ledger
  where vendedor_id = p_vendedor and tipo = 'taxa_antecipacao' and status <> 'cancelado';

  select coalesce(sum(valor),0) into v_ja_sacado
  from public.payouts
  where vendedor_id = p_vendedor and status in ('solicitado','processando','pago');

  v_disponivel := v_liberado - v_taxas - v_ja_sacado;
  if p_valor > v_disponivel then
    raise exception 'Saldo disponivel insuficiente (disponivel: %).', greatest(0, v_disponivel);
  end if;

  select recipient_id, provider into v_recebedor, v_provider
  from public.seller_recipients where vendedor_id = p_vendedor;

  -- Único caminho válido: conta bancária cadastrada no gateway.
  if coalesce(v_recebedor, '') = '' then
    raise exception 'Cadastre sua conta bancaria antes de sacar.';
  end if;

  insert into public.payouts (vendedor_id, valor, chave_pix, status, provider)
  values (p_vendedor, p_valor, null, 'solicitado', coalesce(v_provider, 'pendente_config'))
  returning * into v_payout;

  insert into public.financial_ledger (vendedor_id, tipo, valor, status, descricao, provider)
  values (p_vendedor, 'saque', p_valor, 'solicitado', 'Saque solicitado pelo vendedor', coalesce(v_provider,'pendente_config'))
  returning id into v_ledger_id;

  update public.payouts set ledger_entry_id = v_ledger_id where id = v_payout.id;
  -- Devolve a linha ja com o ledger preenchido (antes voltava com null, o que
  -- deixava a edge function sem saber qual lancamento cancelar num erro).
  v_payout.ledger_entry_id := v_ledger_id;

  perform public.reconciliar_carteira(p_vendedor);
  return v_payout;
end;
$$;


ALTER FUNCTION "public"."solicitar_saque"("p_vendedor" "uuid", "p_valor" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_profile_verification_from_kyc"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.status = 'aprovado' then
    update public.profiles
       set verificado = true,
           email_verificado = case when new.email_check_status = 'aprovado' then true else email_verificado end
     where id = coalesce(new.user_id, new.restaurante_id)
       and coalesce(status, 'ativo') <> 'banido';
  elsif new.status = 'rejeitado' then
    update public.profiles
       set verificado = false
     where id = coalesce(new.user_id, new.restaurante_id)
       and not exists (
         select 1
           from public.verificacoes v
          where coalesce(v.user_id, v.restaurante_id) = coalesce(new.user_id, new.restaurante_id)
            and v.id <> new.id
            and v.status = 'aprovado'
       );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_profile_verification_from_kyc"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_vendedor_publico"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'DELETE' then
    delete from public.vendedores_publicos where id = old.id;
    return old;
  end if;

  -- A unica diferenca em relacao a versao anterior e a condicao conta_demo.
  -- Marcar uma conta existente como demo cai no ramo `else` e a remove da
  -- tabela publica na mesma transacao; desmarcar a traz de volta.
  if new.role in ('ambulante', 'restaurante', 'entregador')
     and coalesce(new.status, 'ativo') = 'ativo'
     and coalesce(new.conta_demo, false) = false then
    insert into public.vendedores_publicos (
      id, nome, categoria, emoji, role, avaliacao_media, total_avaliacoes,
      online, lat, lng, zona, verificado, status, horario_abre, horario_fecha,
      foto_perfil_path, foto_capa_path, updated_at
    ) values (
      new.id, new.nome, new.categoria, new.emoji, new.role, new.avaliacao_media, new.total_avaliacoes,
      new.online, new.lat, new.lng, new.zona, new.verificado, new.status, new.horario_abre, new.horario_fecha,
      new.foto_perfil_path, new.foto_capa_path, now()
    ) on conflict (id) do update set
      nome = excluded.nome,
      categoria = excluded.categoria,
      emoji = excluded.emoji,
      role = excluded.role,
      avaliacao_media = excluded.avaliacao_media,
      total_avaliacoes = excluded.total_avaliacoes,
      online = excluded.online,
      lat = excluded.lat,
      lng = excluded.lng,
      zona = excluded.zona,
      verificado = excluded.verificado,
      status = excluded.status,
      horario_abre = excluded.horario_abre,
      horario_fecha = excluded.horario_fecha,
      foto_perfil_path = excluded.foto_perfil_path,
      foto_capa_path = excluded.foto_capa_path,
      updated_at = now();
  else
    delete from public.vendedores_publicos where id = new.id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_vendedor_publico"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validar_preco_pedido"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_subtotal numeric := 0; v_item jsonb; v_preco numeric; v_promo numeric; v_qtd int; v_desc numeric;
  v_base numeric; v_pct_credito numeric; v_acrescimo numeric := 0;
  v_estoque int; v_nome text;
begin
  if new.cliente_id is null then return new; end if;
  if new.itens_detalhe is null or jsonb_typeof(new.itens_detalhe) <> 'array' or jsonb_array_length(new.itens_detalhe) = 0 then
    raise exception 'Pedido sem itens com identificador de produto. Atualize o aplicativo.' using errcode = '23514';
  end if;
  for v_item in select * from jsonb_array_elements(new.itens_detalhe) loop
    v_qtd := greatest(coalesce((v_item->>'qtd')::int, 0), 0);
    if v_qtd <= 0 then continue; end if;

    select preco, estoque, nome into v_preco, v_estoque, v_nome
      from public.produtos
      where id = (v_item->>'produto_id')::uuid and vendedor_id = new.vendedor_id and ativo is true;
    if v_preco is null then raise exception 'Produto invalido, inativo ou de outra loja no pedido.' using errcode = '23514'; end if;

    -- Estoque NULO = a loja nao controla; segue como sempre foi.
    if v_estoque is not null and v_qtd > v_estoque then
      if v_estoque = 0 then
        raise exception '% esgotou. Tire do carrinho pra fechar o pedido.', v_nome using errcode = '23514';
      else
        raise exception 'Restam so % de %. Ajuste a quantidade.', v_estoque, v_nome using errcode = '23514';
      end if;
    end if;

    select min(case desconto_tipo
        when 'preco_promocional' then preco_promocional
        when 'percentual' then v_preco * (1 - least(greatest(coalesce(desconto_valor,0),0),95)/100)
        else greatest(0, v_preco - coalesce(desconto_valor,0)) end)
    into v_promo from public.promocoes
    where produto_id = (v_item->>'produto_id')::uuid and ativo is true and publico is true
      and data_inicio <= now() and (data_fim is null or data_fim >= now());
    v_preco := least(v_preco, coalesce(v_promo, v_preco));
    v_subtotal := v_subtotal + v_preco * v_qtd;
  end loop;
  v_subtotal := round(v_subtotal::numeric, 2);
  if v_subtotal <= 0 then raise exception 'Pedido sem valor valido.' using errcode = '23514'; end if;

  if nullif(trim(coalesce(new.discount_code, '')), '') is null then v_desc := 0;
  else v_desc := least(greatest(coalesce(new.discount_amount, 0), 0), v_subtotal); end if;

  v_base := greatest(0, round((v_subtotal - v_desc)::numeric, 2));

  if coalesce(new.pagamento, '') = 'credito_online' then
    select coalesce(taxa_credito_cliente_percent, 0) into v_pct_credito
      from public.payment_settings where id is true;
    v_acrescimo := round((v_base * coalesce(v_pct_credito, 0) / 100)::numeric, 2);
  end if;

  new.discount_amount := v_desc;
  new.subtotal_amount := v_subtotal;
  new.credit_surcharge_amount := v_acrescimo;
  new.total := round((v_base + v_acrescimo)::numeric, 2);
  new.gross_amount := new.total;
  new.platform_fee_amount := null;
  new.vendor_amount := null;
  return new;
end;
$$;


ALTER FUNCTION "public"."validar_preco_pedido"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_and_register_coupon_usage"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_cupom public.cupons%rowtype;
  v_expected numeric := 0;
  v_prior_orders int := 0;
begin
  if nullif(trim(coalesce(new.discount_code, '')), '') is null or coalesce(new.discount_amount, 0) <= 0 then
    return new;
  end if;

  new.discount_code := upper(trim(new.discount_code));

  if new.cliente_id is null then
    raise exception 'Cupom exige cliente logado.' using errcode = '23514';
  end if;

  select * into v_cupom
    from public.cupons
   where codigo = new.discount_code
     and ativo is true
     and (validade is null or validade >= now())
     and data_inicio <= now();

  if not found then
    raise exception 'Cupom invalido ou expirado.' using errcode = '23514';
  end if;

  if v_cupom.limite_uso is not null and coalesce(v_cupom.usos, 0) >= v_cupom.limite_uso then
    raise exception 'Cupom esgotado.' using errcode = '23514';
  end if;

  if v_cupom.vendedor_id is not null and v_cupom.vendedor_id <> new.vendedor_id then
    raise exception 'Cupom nao vale para esta loja.' using errcode = '23514';
  end if;

  if coalesce(new.subtotal_amount, new.total + new.discount_amount, new.total) < coalesce(v_cupom.valor_minimo, 0) then
    raise exception 'Pedido minimo do cupom nao atingido.' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.cupom_usos u
     where u.cliente_id = new.cliente_id
       and u.cupom_codigo = new.discount_code
  ) then
    raise exception 'Cupom ja usado por este cliente.' using errcode = '23505';
  end if;

  if new.discount_code = 'BEMVINDO20' then
    if not exists (
      select 1
        from auth.users u
        join public.profiles p on p.id = u.id
       where u.id = new.cliente_id
         and u.email_confirmed_at is not null
         and p.cpf_check_status = 'aprovado'
    ) then
      raise exception 'BEMVINDO20 exige e-mail confirmado e CPF valido.' using errcode = '23514';
    end if;

    select count(*) into v_prior_orders
      from public.pedidos p
     where p.cliente_id = new.cliente_id
       and p.id <> new.id
       and coalesce(p.status, '') not in ('cancelado','pagamento_recusado');

    if v_prior_orders > 0 then
      raise exception 'BEMVINDO20 vale somente na primeira compra.' using errcode = '23514';
    end if;
  end if;

  v_expected := case v_cupom.tipo
    when 'valor_fixo' then v_cupom.valor
    when 'percentual' then coalesce(new.subtotal_amount, new.total + new.discount_amount, new.total) * v_cupom.valor / 100
    when 'frete_gratis' then 0
    else 0
  end;
  v_expected := round(least(coalesce(new.subtotal_amount, new.total + new.discount_amount, new.total), greatest(v_expected, 0))::numeric, 2);

  if round(coalesce(new.discount_amount, 0)::numeric, 2) > v_expected + 0.01 then
    raise exception 'Desconto maior que o permitido pelo cupom.' using errcode = '23514';
  end if;

  if round(coalesce(new.total, 0)::numeric, 2) <> round((coalesce(new.subtotal_amount, new.total + new.discount_amount, new.total) - coalesce(new.discount_amount, 0))::numeric, 2) then
    raise exception 'Total do pedido nao confere com o desconto.' using errcode = '23514';
  end if;

  insert into public.cupom_usos (cupom_codigo, cliente_id, pedido_id, discount_amount)
  values (new.discount_code, new.cliente_id, new.id, coalesce(new.discount_amount, 0));

  update public.cupons
     set usos = coalesce(usos, 0) + 1,
         updated_at = now()
   where codigo = new.discount_code;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_and_register_coupon_usage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_review_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_pedido public.pedidos%rowtype;
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if v_actor is null or not private.has_role('cliente') then
    raise exception 'Avaliacao exige cliente autenticado.'
      using errcode = '42501';
  end if;

  select *
    into v_pedido
    from public.pedidos
   where id = new.pedido_id
     and cliente_id = v_actor
     and status = 'entregue';

  if not found then
    raise exception 'Avaliacao exige pedido entregue do proprio cliente.'
      using errcode = '42501';
  end if;

  if new.vendedor_id is distinct from v_pedido.vendedor_id then
    raise exception 'Vendedor da avaliacao nao corresponde ao pedido.'
      using errcode = '23514';
  end if;

  select p.nome
    into new.cliente_nome
    from public.profiles p
   where p.id = v_actor;

  new.vendedor_nome := v_pedido.vendedor_nome;
  new.comentario := nullif(left(trim(coalesce(new.comentario, '')), 1000), '');
  new.created_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."validate_review_insert"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."pedido_codigos_entrega" (
    "pedido_id" "uuid" NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "codigo" "text" NOT NULL,
    "tentativas" integer DEFAULT 0 NOT NULL,
    "bloqueado_ate" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirmado_em" timestamp with time zone,
    CONSTRAINT "pedido_codigos_entrega_codigo_check" CHECK (("codigo" ~ '^[0-9]{6}$'::"text")),
    CONSTRAINT "pedido_codigos_entrega_tentativas_check" CHECK (("tentativas" >= 0))
);


ALTER TABLE "private"."pedido_codigos_entrega" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."robo_config" (
    "chave" "text" NOT NULL,
    "valor" "text"
);


ALTER TABLE "private"."robo_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "titulo" "text" NOT NULL,
    "conteudo" "text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_policies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ativacao_tokens" (
    "token" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "criado_por" "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expira_em" timestamp with time zone DEFAULT ("now"() + '48:00:00'::interval) NOT NULL,
    "usado_em" timestamp with time zone
);


ALTER TABLE "public"."ativacao_tokens" OWNER TO "postgres";


COMMENT ON TABLE "public"."ativacao_tokens" IS 'Token de uso único do cadastro assistido. Entregue por QR code; troca a senha provisória e expira.';



CREATE TABLE IF NOT EXISTS "public"."authorized_ips" (
    "ip" "text" NOT NULL,
    "descricao" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."authorized_ips" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."avaliacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pedido_id" "uuid",
    "vendedor_id" "uuid",
    "vendedor_nome" "text",
    "cliente_nome" "text",
    "tipo" "text" DEFAULT 'loja'::"text",
    "nota" integer NOT NULL,
    "comentario" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "avaliacoes_nota_check" CHECK ((("nota" >= 1) AND ("nota" <= 5)))
);


ALTER TABLE "public"."avaliacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."avisos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "titulo" "text" NOT NULL,
    "mensagem" "text" NOT NULL,
    "tipo" "text" DEFAULT 'promo'::"text",
    "publico" "text" DEFAULT 'clientes'::"text",
    "cupom_codigo" "text",
    "ativo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "avisos_publico_check" CHECK (("publico" = ANY (ARRAY['clientes'::"text", 'ambulantes'::"text", 'restaurantes'::"text", 'todos'::"text"]))),
    CONSTRAINT "avisos_tipo_check" CHECK (("tipo" = ANY (ARRAY['promo'::"text", 'aviso'::"text", 'cupom'::"text"])))
);


ALTER TABLE "public"."avisos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blocked_ips" (
    "ip" "text" NOT NULL,
    "motivo" "text",
    "auto" boolean DEFAULT true NOT NULL,
    "hits" integer,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expira_em" timestamp with time zone
);


ALTER TABLE "public"."blocked_ips" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cupom_usos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cupom_codigo" "text" NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "pedido_id" "uuid" NOT NULL,
    "discount_amount" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cupom_usos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cupons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "codigo" "text" NOT NULL,
    "titulo" "text" NOT NULL,
    "descricao" "text",
    "tipo" "text" DEFAULT 'percentual'::"text" NOT NULL,
    "valor" numeric(10,2) DEFAULT 0 NOT NULL,
    "valor_minimo" numeric(10,2) DEFAULT 0 NOT NULL,
    "limite_uso" integer,
    "usos" integer DEFAULT 0 NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "publico" boolean DEFAULT true NOT NULL,
    "vendedor_id" "uuid",
    "vendedor_tipo" "text",
    "data_inicio" timestamp with time zone DEFAULT "now"() NOT NULL,
    "validade" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cupons_limite_uso_check" CHECK ((("limite_uso" IS NULL) OR ("limite_uso" > 0))),
    CONSTRAINT "cupons_tipo_check" CHECK (("tipo" = ANY (ARRAY['percentual'::"text", 'valor_fixo'::"text", 'frete_gratis'::"text"]))),
    CONSTRAINT "cupons_usos_check" CHECK (("usos" >= 0)),
    CONSTRAINT "cupons_valor_check" CHECK (("valor" >= (0)::numeric)),
    CONSTRAINT "cupons_valor_minimo_check" CHECK (("valor_minimo" >= (0)::numeric)),
    CONSTRAINT "cupons_vendedor_tipo_check" CHECK ((("vendedor_tipo" IS NULL) OR ("vendedor_tipo" = ANY (ARRAY['restaurante'::"text", 'ambulante'::"text"]))))
);


ALTER TABLE "public"."cupons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entregadores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurante_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "telefone" "text",
    "cpf" "text",
    "verificacao_id" "uuid",
    "status" "text" DEFAULT 'pendente'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "veiculo" "text" DEFAULT 'moto'::"text" NOT NULL,
    CONSTRAINT "entregadores_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'aprovado'::"text", 'rejeitado'::"text"]))),
    CONSTRAINT "entregadores_veiculo_check" CHECK (("veiculo" = ANY (ARRAY['moto'::"text", 'bicicleta'::"text"])))
);


ALTER TABLE "public"."entregadores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_ticket_lots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "evento_id" "uuid" NOT NULL,
    "source_ticket_id" "text",
    "nome" "text" NOT NULL,
    "descricao" "text",
    "preco_origem" numeric(10,2) DEFAULT 0 NOT NULL,
    "markup_percent" numeric(6,2) DEFAULT 25 NOT NULL,
    "markup_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "preco_venda" numeric(10,2) DEFAULT 0 NOT NULL,
    "moeda" "text" DEFAULT 'BRL'::"text" NOT NULL,
    "taxa_origem" numeric(10,2) DEFAULT 0 NOT NULL,
    "estoque_total" integer,
    "estoque_disponivel" integer,
    "status" "text" DEFAULT 'pendente_aprovacao'::"text" NOT NULL,
    "fonte_url" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "criado_por" "text" DEFAULT 'robo'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lote_ordem" integer,
    "lote_grupo" "text",
    "visto_na_fonte_em" timestamp with time zone,
    "markup_percent_credito" numeric(6,2) DEFAULT 35 NOT NULL,
    "preco_venda_credito" numeric(10,2) DEFAULT 0 NOT NULL,
    CONSTRAINT "event_ticket_lots_estoque_disponivel_check" CHECK ((("estoque_disponivel" IS NULL) OR ("estoque_disponivel" >= 0))),
    CONSTRAINT "event_ticket_lots_estoque_total_check" CHECK ((("estoque_total" IS NULL) OR ("estoque_total" >= 0))),
    CONSTRAINT "event_ticket_lots_markup_amount_check" CHECK (("markup_amount" >= (0)::numeric)),
    CONSTRAINT "event_ticket_lots_markup_percent_check" CHECK ((("markup_percent" >= (0)::numeric) AND ("markup_percent" <= (500)::numeric))),
    CONSTRAINT "event_ticket_lots_markup_percent_credito_check" CHECK ((("markup_percent_credito" >= (0)::numeric) AND ("markup_percent_credito" <= (500)::numeric))),
    CONSTRAINT "event_ticket_lots_preco_origem_check" CHECK (("preco_origem" >= (0)::numeric)),
    CONSTRAINT "event_ticket_lots_preco_venda_check" CHECK (("preco_venda" >= (0)::numeric)),
    CONSTRAINT "event_ticket_lots_status_check" CHECK (("status" = ANY (ARRAY['pendente_aprovacao'::"text", 'disponivel'::"text", 'pausado'::"text", 'esgotado'::"text"]))),
    CONSTRAINT "event_ticket_lots_taxa_origem_check" CHECK (("taxa_origem" >= (0)::numeric))
);


ALTER TABLE "public"."event_ticket_lots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_ticket_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid",
    "tipo" "text" NOT NULL,
    "titulo" "text" NOT NULL,
    "mensagem" "text" NOT NULL,
    "destinatario_email" "text",
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "event_ticket_notifications_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'lida'::"text", 'resolvida'::"text", 'falhou'::"text"]))),
    CONSTRAINT "event_ticket_notifications_tipo_check" CHECK (("tipo" = ANY (ARRAY['nova_venda'::"text", 'entrega_ingresso'::"text", 'reembolso'::"text", 'falha_email'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."event_ticket_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_ticket_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "evento_id" "uuid" NOT NULL,
    "ticket_lot_id" "uuid" NOT NULL,
    "cliente_id" "uuid",
    "cliente_nome" "text" DEFAULT 'Cliente PraiaGo'::"text" NOT NULL,
    "cliente_email" "text",
    "cliente_telefone" "text",
    "quantidade" integer DEFAULT 1 NOT NULL,
    "preco_origem_unit" numeric(10,2) DEFAULT 0 NOT NULL,
    "preco_unit" numeric(10,2) DEFAULT 0 NOT NULL,
    "subtotal_origem" numeric(10,2) DEFAULT 0 NOT NULL,
    "markup_total" numeric(10,2) DEFAULT 0 NOT NULL,
    "total" numeric(10,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'aguardando_pagamento'::"text" NOT NULL,
    "payment_provider" "text" DEFAULT 'pagarme'::"text" NOT NULL,
    "payment_status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "payment_reference" "text",
    "payment_checkout_url" "text",
    "payment_details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "delivery_status" "text" DEFAULT 'aguardando_pagamento'::"text" NOT NULL,
    "delivery_email_status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "entrega_observacao" "text",
    "entregue_por" "uuid",
    "delivered_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "canceled_at" timestamp with time zone,
    "refunded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metodo_pagamento" "text" DEFAULT 'pix'::"text" NOT NULL,
    CONSTRAINT "event_ticket_orders_delivery_email_status_check" CHECK (("delivery_email_status" = ANY (ARRAY['pendente'::"text", 'enviado'::"text", 'falhou'::"text", 'nao_configurado'::"text"]))),
    CONSTRAINT "event_ticket_orders_delivery_status_check" CHECK (("delivery_status" = ANY (ARRAY['aguardando_pagamento'::"text", 'entrega_pendente'::"text", 'enviado'::"text", 'falhou'::"text", 'cancelado'::"text"]))),
    CONSTRAINT "event_ticket_orders_metodo_pagamento_check" CHECK (("metodo_pagamento" = ANY (ARRAY['pix'::"text", 'debito'::"text", 'credito'::"text"]))),
    CONSTRAINT "event_ticket_orders_quantidade_check" CHECK ((("quantidade" > 0) AND ("quantidade" <= 20))),
    CONSTRAINT "event_ticket_orders_status_check" CHECK (("status" = ANY (ARRAY['aguardando_pagamento'::"text", 'pago'::"text", 'entrega_pendente'::"text", 'entregue'::"text", 'cancelado'::"text", 'pagamento_recusado'::"text", 'reembolso_solicitado'::"text", 'reembolso_aprovado'::"text", 'reembolsado'::"text", 'reembolso_negado'::"text", 'chargeback'::"text"])))
);


ALTER TABLE "public"."event_ticket_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_ticket_refunds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "requested_by" "uuid",
    "requested_by_role" "text" DEFAULT 'cliente'::"text" NOT NULL,
    "status" "text" DEFAULT 'pendente_admin'::"text" NOT NULL,
    "motivo" "text" NOT NULL,
    "valor" numeric(10,2),
    "resposta_admin" "text",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "processed_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_ticket_refunds_requested_by_role_check" CHECK (("requested_by_role" = ANY (ARRAY['cliente'::"text", 'bot'::"text", 'admin'::"text"]))),
    CONSTRAINT "event_ticket_refunds_status_check" CHECK (("status" = ANY (ARRAY['pendente_admin'::"text", 'aprovado'::"text", 'negado'::"text", 'processando'::"text", 'reembolsado'::"text", 'falhou'::"text"])))
);


ALTER TABLE "public"."event_ticket_refunds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."eventos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "titulo" "text" NOT NULL,
    "descricao" "text",
    "periodo" "text" DEFAULT 'noite'::"text" NOT NULL,
    "data" "date",
    "hora" "text",
    "local_nome" "text",
    "endereco" "text",
    "lat" double precision,
    "lng" double precision,
    "preco" numeric DEFAULT 0 NOT NULL,
    "categoria" "text" DEFAULT 'Festa'::"text",
    "emoji" "text" DEFAULT '🎉'::"text",
    "imagem_url" "text",
    "fonte" "text",
    "destaque" boolean DEFAULT false,
    "status" "text" DEFAULT 'ativo'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "fonte_url" "text",
    "descricao_curta" "text",
    "ingressos_enabled" boolean DEFAULT false NOT NULL,
    "markup_ingresso_percent" numeric(6,2) DEFAULT 10 NOT NULL,
    CONSTRAINT "eventos_periodo_check" CHECK (("periodo" = ANY (ARRAY['manha'::"text", 'tarde'::"text", 'noite'::"text", 'madrugada'::"text"]))),
    CONSTRAINT "eventos_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'ativo'::"text", 'inativo'::"text"])))
);

ALTER TABLE ONLY "public"."eventos" REPLICA IDENTITY FULL;


ALTER TABLE "public"."eventos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pedido_id" "uuid",
    "vendedor_id" "uuid",
    "tipo" "text" NOT NULL,
    "valor" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "descricao" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "settled_at" timestamp with time zone,
    "provider" "text" DEFAULT 'manual'::"text",
    "external_reference" "text",
    "disponivel_em" timestamp with time zone,
    "metodo" "text",
    CONSTRAINT "financial_ledger_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'em_espera'::"text", 'disponivel'::"text", 'solicitado'::"text", 'processando'::"text", 'pago'::"text", 'cancelado'::"text"]))),
    CONSTRAINT "financial_ledger_tipo_check" CHECK (("tipo" = ANY (ARRAY['taxa_plataforma'::"text", 'repasse_vendedor'::"text", 'comissao_devida'::"text", 'taxa_provedor'::"text", 'saque'::"text", 'estorno'::"text", 'chargeback'::"text", 'taxa_antecipacao'::"text", 'reembolso'::"text", 'ajuste'::"text"])))
);


ALTER TABLE "public"."financial_ledger" OWNER TO "postgres";


COMMENT ON CONSTRAINT "financial_ledger_status_check" ON "public"."financial_ledger" IS 'Ciclo de vida do lancamento: pendente -> em_espera -> disponivel -> solicitado/processando -> pago. Se faltar um valor aqui, liberar_repasses() e solicitar_saque() falham em silencio.';



CREATE TABLE IF NOT EXISTS "public"."fraude_flags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vendedor_id" "uuid" NOT NULL,
    "cliente_id" "uuid",
    "cliente_nome" "text",
    "pedido_id" "uuid",
    "motivo" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fraude_flags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ota_releases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "app_id" "text" NOT NULL,
    "platform" "text" DEFAULT 'all'::"text" NOT NULL,
    "channel" "text" DEFAULT 'production'::"text" NOT NULL,
    "version" "text" NOT NULL,
    "bundle_url" "text" NOT NULL,
    "checksum" "text",
    "min_native_version" "text",
    "enabled" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ota_releases_platform_check" CHECK (("platform" = ANY (ARRAY['all'::"text", 'android'::"text", 'ios'::"text"])))
);


ALTER TABLE "public"."ota_releases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pagamentos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pedido_id" "uuid",
    "ticket_order_id" "uuid",
    "provider" "text" DEFAULT 'pagarme'::"text" NOT NULL,
    "provider_order_id" "text",
    "provider_charge_id" "text",
    "metodo" "text" NOT NULL,
    "valor" numeric(12,2) NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "status_detalhe" "text",
    "pix_qr_code" "text",
    "pix_qr_code_base64" "text",
    "pix_expira_em" timestamp with time zone,
    "raw" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    "pix_qr_code_url" "text",
    CONSTRAINT "pagamentos_alvo_unico" CHECK (("num_nonnulls"("pedido_id", "ticket_order_id") = 1)),
    CONSTRAINT "pagamentos_metodo_check" CHECK (("metodo" = ANY (ARRAY['pix'::"text", 'credito'::"text", 'debito'::"text"]))),
    CONSTRAINT "pagamentos_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'pago'::"text", 'falhou'::"text", 'estornado'::"text", 'cancelado'::"text"]))),
    CONSTRAINT "pagamentos_valor_check" CHECK (("valor" >= (0)::numeric))
);


ALTER TABLE "public"."pagamentos" OWNER TO "postgres";


COMMENT ON TABLE "public"."pagamentos" IS 'Cobrancas no gateway (Pagar.me). Escrita SO por edge function/service_role.';



CREATE TABLE IF NOT EXISTS "public"."payment_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pedido_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "payment_status" "text" NOT NULL,
    "pagamento" "text",
    "valor" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_notifications_tipo_check" CHECK (("tipo" = ANY (ARRAY['pendente'::"text", 'aprovado'::"text", 'recusado'::"text", 'cancelado'::"text", 'estornado'::"text"]))),
    CONSTRAINT "payment_notifications_valor_check" CHECK (("valor" >= (0)::numeric))
);


ALTER TABLE "public"."payment_notifications" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_notifications" IS 'Eventos financeiros sem dados pessoais, visiveis apenas a admins autorizados.';



CREATE TABLE IF NOT EXISTS "public"."payment_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "platform_fee_percent" numeric(5,2) DEFAULT 10.00 NOT NULL,
    "platform_fee_fixed" numeric(10,2) DEFAULT 0.00 NOT NULL,
    "presencial_fee_mode" "text" DEFAULT 'cobrar_vendedor'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "repasse_dias" integer DEFAULT 7 NOT NULL,
    "platform_recipient_id" "text",
    "saque_rapido_ativo" boolean DEFAULT true NOT NULL,
    "saque_rapido_percent" numeric DEFAULT 5 NOT NULL,
    "saque_rapido_percent_credito" numeric DEFAULT 8 NOT NULL,
    "saque_rapido_credito_ativo" boolean DEFAULT false NOT NULL,
    "taxa_credito_cliente_percent" numeric DEFAULT 0 NOT NULL,
    CONSTRAINT "payment_settings_presencial_fee_mode_check" CHECK (("presencial_fee_mode" = ANY (ARRAY['cobrar_vendedor'::"text", 'isento'::"text", 'mensalidade'::"text"]))),
    CONSTRAINT "payment_settings_singleton" CHECK (("id" = true))
);


ALTER TABLE "public"."payment_settings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."payment_settings"."platform_recipient_id" IS 'Recebedor da PraiaGo no gateway. E o destino da comissao na regra de split — sem ele o split nao pode ser montado.';



COMMENT ON COLUMN "public"."payment_settings"."saque_rapido_percent" IS 'Taxa (%) da antecipacao. E receita da plataforma, nao repasse de custo: o PIX liquida em D+1 no gateway, quem segura o dinheiro ate o D+N e a nossa propria regra.';



COMMENT ON COLUMN "public"."payment_settings"."saque_rapido_credito_ativo" IS 'Nasce DESLIGADO: antecipar credito sem antecipacao contratada no gateway faz o saque falhar — o dinheiro so existe la em D+30.';



COMMENT ON COLUMN "public"."payment_settings"."taxa_credito_cliente_percent" IS 'Acrescimo (%) cobrado do CLIENTE ao pagar no credito. 0 = desligado. Vai inteiro pra plataforma; o vendedor recebe o mesmo de sempre.';



CREATE TABLE IF NOT EXISTS "public"."payment_webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "external_id" "text" NOT NULL,
    "signature_valid" boolean DEFAULT false NOT NULL,
    "processed" boolean DEFAULT false NOT NULL,
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "verification_method" "text" DEFAULT 'legacy'::"text" NOT NULL
);


ALTER TABLE "public"."payment_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pedidos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_nome" "text" NOT NULL,
    "zona" "text",
    "itens" "jsonb" NOT NULL,
    "total" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'novo'::"text",
    "pagamento" "text",
    "restaurante_id" "uuid",
    "ambulante_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "vendedor_id" "uuid",
    "vendedor_nome" "text",
    "cliente_id" "uuid",
    "reta" "text",
    "barraca" "text",
    "payment_provider" "text" DEFAULT 'manual'::"text",
    "payment_status" "text" DEFAULT 'pendente'::"text",
    "payment_reference" "text",
    "gross_amount" numeric(10,2),
    "platform_fee_amount" numeric(10,2),
    "vendor_amount" numeric(10,2),
    "settlement_status" "text" DEFAULT 'pendente'::"text",
    "paid_at" timestamp with time zone,
    "refunded_at" timestamp with time zone,
    "lat" double precision,
    "lng" double precision,
    "payment_checkout_url" "text",
    "payment_details" "jsonb" DEFAULT '{}'::"jsonb",
    "codigo_entrega" "text",
    "entrega_confirmada" boolean DEFAULT false NOT NULL,
    "reembolso_status" "text" DEFAULT 'nenhum'::"text" NOT NULL,
    "reembolso_motivo" "text",
    "reembolso_solicitado_em" timestamp with time zone,
    "reembolso_resolvido_em" timestamp with time zone,
    "reembolso_previsao" "text",
    "codigo_entrega_criado_em" timestamp with time zone,
    "entrega_confirmada_em" timestamp with time zone,
    "entrega_confirmada_por" "uuid",
    "repasse_liberado_em" timestamp with time zone,
    "subtotal_amount" numeric,
    "discount_amount" numeric DEFAULT 0 NOT NULL,
    "discount_code" "text",
    "discount_reason" "text",
    "cpf_nota" "text",
    "itens_detalhe" "jsonb",
    "credit_surcharge_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "cliente_telefone" "text",
    "estoque_baixado" boolean DEFAULT false NOT NULL,
    CONSTRAINT "pedidos_cliente_telefone_format" CHECK ((("cliente_telefone" IS NULL) OR ("cliente_telefone" ~ '^[0-9]{10,13}$'::"text")))
);


ALTER TABLE "public"."pedidos" OWNER TO "postgres";


COMMENT ON COLUMN "public"."pedidos"."credit_surcharge_amount" IS 'Acrescimo do cartao de credito cobrado do cliente. Somado ao total e a taxa da plataforma; NAO entra no vendor_amount.';



COMMENT ON COLUMN "public"."pedidos"."cliente_telefone" IS 'Telefone do perfil do cliente no momento da criacao do pedido; visivel somente pelas politicas do pedido.';



COMMENT ON COLUMN "public"."pedidos"."estoque_baixado" IS 'Se o estoque ja foi debitado por este pedido. Impede debito repetido em reentrega de webhook.';



CREATE TABLE IF NOT EXISTS "public"."produtos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vendedor_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "preco" numeric NOT NULL,
    "descricao" "text",
    "categoria" "text" NOT NULL,
    "emoji" "text",
    "ativo" boolean DEFAULT true,
    "foto" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "vendedor_nome" "text",
    "vendedor_categoria" "text",
    "vendedor_emoji" "text",
    "estoque" integer,
    CONSTRAINT "produtos_estoque_nao_negativo" CHECK ((("estoque" IS NULL) OR ("estoque" >= 0)))
);


ALTER TABLE "public"."produtos" OWNER TO "postgres";


COMMENT ON COLUMN "public"."produtos"."estoque" IS 'Unidades disponiveis. NULO = ilimitado (nao controla estoque). 0 = esgotado.';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "nome" "text",
    "email" "text",
    "role" "text",
    "verificado" boolean DEFAULT false,
    "email_verificado" boolean DEFAULT false,
    "telefone" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "online" boolean DEFAULT false,
    "categoria" "text",
    "emoji" "text" DEFAULT '??'::"text",
    "lat" double precision,
    "lng" double precision,
    "zona" "text",
    "avaliacao_media" numeric DEFAULT 0,
    "total_avaliacoes" integer DEFAULT 0,
    "cnpj" "text",
    "razao_social" "text",
    "endereco" "text",
    "telefone_comercial" "text",
    "status" "text" DEFAULT 'ativo'::"text" NOT NULL,
    "banido_em" timestamp with time zone,
    "ban_motivo" "text",
    "pix_chave" "text",
    "pix_tipo" "text",
    "repasse_preferencia" "text" DEFAULT 'pix'::"text",
    "permissions" "text"[],
    "horario_abre" "text",
    "horario_fecha" "text",
    "cpf" "text",
    "cpf_check_status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "cpf_confirmado_em" timestamp with time zone,
    "comissao_percent" numeric,
    "documento" "text",
    "documento_tipo" "text",
    "data_nascimento" "date",
    "foto_perfil_path" "text",
    "foto_capa_path" "text",
    "senha_provisoria" boolean DEFAULT false NOT NULL,
    "cadastro_origem" "text",
    "cadastrado_por" "uuid",
    "cadastrado_em" timestamp with time zone,
    "licenca_ambulante" "text",
    "horarios" "jsonb",
    "conta_demo" boolean DEFAULT false NOT NULL,
    CONSTRAINT "profiles_cpf_check_status_chk" CHECK (("cpf_check_status" = ANY (ARRAY['pendente'::"text", 'aprovado'::"text", 'rejeitado'::"text", 'dispensado'::"text"]))),
    CONSTRAINT "profiles_foto_capa_path_owner" CHECK ((("foto_capa_path" IS NULL) OR ("foto_capa_path" ~~ (("id")::"text" || '/capa-%'::"text")))),
    CONSTRAINT "profiles_foto_perfil_path_owner" CHECK ((("foto_perfil_path" IS NULL) OR ("foto_perfil_path" ~~ (("id")::"text" || '/perfil-%'::"text"))))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."foto_perfil_path" IS 'Caminho publico da foto de perfil no bucket perfis-vendedores.';



COMMENT ON COLUMN "public"."profiles"."foto_capa_path" IS 'Caminho publico da capa da vitrine no bucket perfis-vendedores.';



COMMENT ON COLUMN "public"."profiles"."senha_provisoria" IS 'true = conta criada pela equipe com senha temporária; o app exige troca no primeiro login.';



COMMENT ON COLUMN "public"."profiles"."cadastro_origem" IS 'null = cadastro normal pelo app. "evento" = cadastrado presencialmente pela equipe.';



COMMENT ON COLUMN "public"."profiles"."horarios" IS 'Horário por dia da semana. Array [{dia:0-6, aberto:bool, abre?:"HH:MM", fecha?:"HH:MM", vinte_quatro_horas?:bool}]. Null = usa horario_abre/horario_fecha (formato antigo).';



COMMENT ON COLUMN "public"."profiles"."conta_demo" IS 'Conta de revisao de loja ou teste interno. Nunca entra em vendedores_publicos, portanto nunca aparece no radar, nas listagens nem no mapa do app Cliente. Somente sysadmin pode ligar ou desligar.';



CREATE TABLE IF NOT EXISTS "public"."promocoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "titulo" "text" NOT NULL,
    "descricao" "text",
    "produto_id" "uuid" NOT NULL,
    "vendedor_id" "uuid" NOT NULL,
    "desconto_tipo" "text" DEFAULT 'preco_promocional'::"text" NOT NULL,
    "desconto_valor" numeric(10,2),
    "preco_original" numeric(10,2) DEFAULT 0 NOT NULL,
    "preco_promocional" numeric(10,2),
    "selo" "text" DEFAULT 'Oferta'::"text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "publico" boolean DEFAULT true NOT NULL,
    "prioridade" integer DEFAULT 0 NOT NULL,
    "data_inicio" timestamp with time zone DEFAULT "now"() NOT NULL,
    "data_fim" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "promocoes_desconto_obrigatorio_check" CHECK (((("desconto_tipo" = 'preco_promocional'::"text") AND ("preco_promocional" IS NOT NULL) AND ("preco_promocional" < "preco_original")) OR (("desconto_tipo" = 'percentual'::"text") AND ("desconto_valor" IS NOT NULL) AND ("desconto_valor" > (0)::numeric) AND ("desconto_valor" <= (95)::numeric)) OR (("desconto_tipo" = 'valor_fixo'::"text") AND ("desconto_valor" IS NOT NULL) AND ("desconto_valor" > (0)::numeric) AND ("desconto_valor" < "preco_original")))),
    CONSTRAINT "promocoes_desconto_tipo_check" CHECK (("desconto_tipo" = ANY (ARRAY['preco_promocional'::"text", 'percentual'::"text", 'valor_fixo'::"text"]))),
    CONSTRAINT "promocoes_desconto_valor_check" CHECK ((("desconto_valor" IS NULL) OR ("desconto_valor" >= (0)::numeric))),
    CONSTRAINT "promocoes_periodo_check" CHECK ((("data_fim" IS NULL) OR ("data_fim" > "data_inicio"))),
    CONSTRAINT "promocoes_preco_original_check" CHECK (("preco_original" >= (0)::numeric)),
    CONSTRAINT "promocoes_preco_promocional_check" CHECK ((("preco_promocional" IS NULL) OR ("preco_promocional" >= (0)::numeric)))
);


ALTER TABLE "public"."promocoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limit" (
    "ip" "text" NOT NULL,
    "bucket" timestamp with time zone NOT NULL,
    "hits" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."rate_limit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roadmap_ideias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "titulo" "text" NOT NULL,
    "descricao" "text",
    "categoria" "text" DEFAULT 'geral'::"text" NOT NULL,
    "prioridade" "text" DEFAULT 'media'::"text" NOT NULL,
    "status" "text" DEFAULT 'ideia'::"text" NOT NULL,
    "votos" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."roadmap_ideias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_type" "text" NOT NULL,
    "severity" "text" DEFAULT 'info'::"text" NOT NULL,
    "platform" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "user_id" "uuid",
    "actor_id" "uuid",
    "email" "text",
    "ip" "inet",
    "user_agent" "text",
    "route" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "resolution_notes" "text",
    CONSTRAINT "security_audit_logs_event_type_check" CHECK (("event_type" = ANY (ARRAY['login_success'::"text", 'login_failed'::"text", 'access_denied'::"text", 'signup_created'::"text", 'password_reset_requested'::"text", 'password_changed'::"text", 'fraud_flag_created'::"text", 'suspicious_activity'::"text", 'delivery_code_mismatch'::"text"]))),
    CONSTRAINT "security_audit_logs_platform_check" CHECK (("platform" = ANY (ARRAY['cliente'::"text", 'ambulante'::"text", 'restaurante'::"text", 'admin'::"text", 'seller_app'::"text", 'supabase'::"text", 'system'::"text", 'unknown'::"text"]))),
    CONSTRAINT "security_audit_logs_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'warning'::"text", 'error'::"text", 'high'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."security_audit_logs" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."security_login_risk_summary" WITH ("security_invoker"='true') AS
 SELECT "lower"("email") AS "email",
    "platform",
    "count"(*) FILTER (WHERE ("created_at" >= ("now"() - '00:15:00'::interval))) AS "falhas_15m",
    "count"(*) FILTER (WHERE ("created_at" >= ("now"() - '24:00:00'::interval))) AS "falhas_24h",
    "max"("created_at") AS "ultima_tentativa",
    "max"("severity") AS "maior_severidade"
   FROM "public"."security_audit_logs"
  WHERE (("event_type" = 'login_failed'::"text") AND ("email" IS NOT NULL))
  GROUP BY ("lower"("email")), "platform";


ALTER VIEW "public"."security_login_risk_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seller_recipients" (
    "vendedor_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "recipient_id" "text",
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "kyc_status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "kyc_motivo" "text",
    "settlement_delay_days" integer,
    "kyc_enviado_em" timestamp with time zone,
    "aprovado_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "banco_codigo" "text",
    "banco_nome" "text",
    "conta_mascarada" "text",
    "titular_nome" "text",
    "titular_documento_final" "text"
);


ALTER TABLE "public"."seller_recipients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."settlement_config" (
    "provider" "text" NOT NULL,
    "metodo" "text" NOT NULL,
    "delay_days" integer NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."settlement_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."signup_ips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ip" "text" NOT NULL,
    "user_id" "uuid",
    "email" "text",
    "role" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_mobile" boolean
);


ALTER TABLE "public"."signup_ips" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."signup_rules" (
    "id" boolean DEFAULT true NOT NULL,
    "um_por_ip" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "exigir_em_movel" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."signup_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_mensagens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "autor" "text" NOT NULL,
    "mensagem" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ticket_mensagens_autor_check" CHECK (("autor" = ANY (ARRAY['admin'::"text", 'usuario'::"text"])))
);


ALTER TABLE "public"."ticket_mensagens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plataforma" "text" NOT NULL,
    "usuario_nome" "text" NOT NULL,
    "usuario_email" "text" NOT NULL,
    "assunto" "text" NOT NULL,
    "mensagem" "text" NOT NULL,
    "status" "text" DEFAULT 'aberto'::"text",
    "prioridade" "text" DEFAULT 'media'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "resposta" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "usuario_id" "uuid",
    "nao_lida_usuario" boolean DEFAULT false NOT NULL,
    "nao_lida_admin" boolean DEFAULT true NOT NULL,
    "avaliacao_nota" integer,
    "avaliacao_comentario" "text",
    "avaliado_em" timestamp with time zone,
    "origem" "text" DEFAULT 'humano'::"text" NOT NULL,
    "ia_categoria" "text",
    "ia_resumo" "text",
    "ia_exige_comprovacao" boolean DEFAULT false NOT NULL,
    "ia_triagem_status" "text",
    "ia_decidido_por" "uuid",
    "ia_decidido_em" timestamp with time zone,
    "ia_observacao_admin" "text",
    "pedido_ref" "text",
    CONSTRAINT "tickets_ia_triagem_status_check" CHECK ((("ia_triagem_status" IS NULL) OR ("ia_triagem_status" = ANY (ARRAY['pendente'::"text", 'aprovado'::"text", 'negado'::"text"])))),
    CONSTRAINT "tickets_origem_check" CHECK (("origem" = ANY (ARRAY['humano'::"text", 'ia'::"text"])))
);

ALTER TABLE ONLY "public"."tickets" REPLICA IDENTITY FULL;


ALTER TABLE "public"."tickets" OWNER TO "postgres";


COMMENT ON COLUMN "public"."tickets"."origem" IS 'humano = aberto pelo proprio usuario; ia = escalonado pelo assistente';



COMMENT ON COLUMN "public"."tickets"."ia_exige_comprovacao" IS 'true quando o caso precisa de foto/comprovante e analise humana antes de decidir';



COMMENT ON COLUMN "public"."tickets"."ia_triagem_status" IS 'pendente | aprovado | negado — decisao do admin sobre o caso escalonado pela IA';



CREATE TABLE IF NOT EXISTS "public"."vendedores_publicos" (
    "id" "uuid" NOT NULL,
    "nome" "text",
    "categoria" "text",
    "emoji" "text",
    "role" "text",
    "avaliacao_media" numeric,
    "total_avaliacoes" integer,
    "online" boolean,
    "lat" double precision,
    "lng" double precision,
    "zona" "text",
    "verificado" boolean,
    "status" "text",
    "horario_abre" "text",
    "horario_fecha" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "foto_perfil_path" "text",
    "foto_capa_path" "text",
    "endereco" "text",
    "horarios" "jsonb"
);


ALTER TABLE "public"."vendedores_publicos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendor_payment_accounts" (
    "vendedor_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'abacatepay'::"text" NOT NULL,
    "provider_account_id" "text",
    "pix_key" "text",
    "bank_name" "text",
    "bank_agency" "text",
    "bank_account" "text",
    "holder_name" "text",
    "holder_document" "text",
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "vendor_payment_accounts_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'verificado'::"text", 'bloqueado'::"text"])))
);


ALTER TABLE "public"."vendor_payment_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."verificacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "tipo" "text" NOT NULL,
    "nome_completo" "text",
    "cpf" "text",
    "data_nascimento" "text",
    "rg_frente_url" "text",
    "rg_verso_url" "text",
    "selfie_url" "text",
    "licenca_ambulante" boolean,
    "praia_principal" "text",
    "foto_loja_url" "text",
    "cnpj" "text",
    "razao_social" "text",
    "num_funcionarios" integer,
    "horario_funcionamento" "text",
    "tipo_cozinha" "text",
    "restaurante_id" "uuid",
    "cnh_url" "text",
    "tipo_veiculo" "text",
    "placa" "text",
    "status" "text" DEFAULT 'pendente'::"text",
    "motivo_rejeicao" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "nome_check_status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "cpf_check_status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "cnpj_check_status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "nascimento_check_status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "email_check_status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "documento_check_status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "face_check_status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "local_check_status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "kyc_override" boolean DEFAULT false NOT NULL,
    "kyc_override_reason" "text",
    "kyc_override_by" "uuid",
    "kyc_override_at" timestamp with time zone,
    "validation_errors" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "verificacoes_check_status_values" CHECK ((("nome_check_status" = ANY (ARRAY['pendente'::"text", 'aprovado'::"text", 'rejeitado'::"text", 'dispensado'::"text"])) AND ("cpf_check_status" = ANY (ARRAY['pendente'::"text", 'aprovado'::"text", 'rejeitado'::"text", 'dispensado'::"text"])) AND ("cnpj_check_status" = ANY (ARRAY['pendente'::"text", 'aprovado'::"text", 'rejeitado'::"text", 'dispensado'::"text"])) AND ("nascimento_check_status" = ANY (ARRAY['pendente'::"text", 'aprovado'::"text", 'rejeitado'::"text", 'dispensado'::"text"])) AND ("email_check_status" = ANY (ARRAY['pendente'::"text", 'aprovado'::"text", 'rejeitado'::"text", 'dispensado'::"text"])) AND ("documento_check_status" = ANY (ARRAY['pendente'::"text", 'aprovado'::"text", 'rejeitado'::"text", 'dispensado'::"text"])) AND ("face_check_status" = ANY (ARRAY['pendente'::"text", 'aprovado'::"text", 'rejeitado'::"text", 'dispensado'::"text"])) AND ("local_check_status" = ANY (ARRAY['pendente'::"text", 'aprovado'::"text", 'rejeitado'::"text", 'dispensado'::"text"])))),
    CONSTRAINT "verificacoes_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'aprovado'::"text", 'rejeitado'::"text"]))),
    CONSTRAINT "verificacoes_tipo_check" CHECK (("tipo" = ANY (ARRAY['ambulante'::"text", 'restaurante'::"text", 'entregador'::"text"]))),
    CONSTRAINT "verificacoes_tipo_veiculo_check" CHECK ((("tipo_veiculo" IS NULL) OR ("tipo_veiculo" = ANY (ARRAY['moto'::"text", 'bicicleta'::"text"]))))
);


ALTER TABLE "public"."verificacoes" OWNER TO "postgres";


ALTER TABLE ONLY "private"."pedido_codigos_entrega"
    ADD CONSTRAINT "pedido_codigos_entrega_pkey" PRIMARY KEY ("pedido_id");



ALTER TABLE ONLY "private"."robo_config"
    ADD CONSTRAINT "robo_config_pkey" PRIMARY KEY ("chave");



ALTER TABLE ONLY "public"."app_policies"
    ADD CONSTRAINT "app_policies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_policies"
    ADD CONSTRAINT "app_policies_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."ativacao_tokens"
    ADD CONSTRAINT "ativacao_tokens_pkey" PRIMARY KEY ("token");



ALTER TABLE ONLY "public"."authorized_ips"
    ADD CONSTRAINT "authorized_ips_pkey" PRIMARY KEY ("ip");



ALTER TABLE ONLY "public"."avaliacoes"
    ADD CONSTRAINT "avaliacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."avisos"
    ADD CONSTRAINT "avisos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bank_account_change_requests"
    ADD CONSTRAINT "bank_account_change_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blocked_ips"
    ADD CONSTRAINT "blocked_ips_pkey" PRIMARY KEY ("ip");



ALTER TABLE ONLY "public"."cupom_usos"
    ADD CONSTRAINT "cupom_usos_cliente_id_cupom_codigo_key" UNIQUE ("cliente_id", "cupom_codigo");



ALTER TABLE ONLY "public"."cupom_usos"
    ADD CONSTRAINT "cupom_usos_pedido_id_key" UNIQUE ("pedido_id");



ALTER TABLE ONLY "public"."cupom_usos"
    ADD CONSTRAINT "cupom_usos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cupons"
    ADD CONSTRAINT "cupons_codigo_key" UNIQUE ("codigo");



ALTER TABLE ONLY "public"."cupons"
    ADD CONSTRAINT "cupons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entregadores"
    ADD CONSTRAINT "entregadores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_ticket_lots"
    ADD CONSTRAINT "event_ticket_lots_evento_id_nome_preco_origem_key" UNIQUE ("evento_id", "nome", "preco_origem");



ALTER TABLE ONLY "public"."event_ticket_lots"
    ADD CONSTRAINT "event_ticket_lots_evento_id_source_ticket_id_key" UNIQUE ("evento_id", "source_ticket_id");



ALTER TABLE ONLY "public"."event_ticket_lots"
    ADD CONSTRAINT "event_ticket_lots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_ticket_notifications"
    ADD CONSTRAINT "event_ticket_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_ticket_orders"
    ADD CONSTRAINT "event_ticket_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_ticket_refunds"
    ADD CONSTRAINT "event_ticket_refunds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."eventos"
    ADD CONSTRAINT "eventos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_ledger"
    ADD CONSTRAINT "financial_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fraude_flags"
    ADD CONSTRAINT "fraude_flags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ota_releases"
    ADD CONSTRAINT "ota_releases_app_id_platform_channel_version_key" UNIQUE ("app_id", "platform", "channel", "version");



ALTER TABLE ONLY "public"."ota_releases"
    ADD CONSTRAINT "ota_releases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pagamentos"
    ADD CONSTRAINT "pagamentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_notifications"
    ADD CONSTRAINT "payment_notifications_pedido_id_tipo_key" UNIQUE ("pedido_id", "tipo");



ALTER TABLE ONLY "public"."payment_notifications"
    ADD CONSTRAINT "payment_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_settings"
    ADD CONSTRAINT "payment_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_webhook_events"
    ADD CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_webhook_events"
    ADD CONSTRAINT "payment_webhook_events_provider_event_type_external_id_key" UNIQUE ("provider", "event_type", "external_id");



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."produtos"
    ADD CONSTRAINT "produtos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promocoes"
    ADD CONSTRAINT "promocoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_limit"
    ADD CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("ip", "bucket");



ALTER TABLE ONLY "public"."roadmap_ideias"
    ADD CONSTRAINT "roadmap_ideias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_audit_logs"
    ADD CONSTRAINT "security_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seller_recipients"
    ADD CONSTRAINT "seller_recipients_pkey" PRIMARY KEY ("vendedor_id");



ALTER TABLE ONLY "public"."settlement_config"
    ADD CONSTRAINT "settlement_config_pkey" PRIMARY KEY ("provider", "metodo");



ALTER TABLE ONLY "public"."signup_ips"
    ADD CONSTRAINT "signup_ips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."signup_rules"
    ADD CONSTRAINT "signup_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."solicitacoes_correcao_localizacao"
    ADD CONSTRAINT "solicitacoes_correcao_localizacao_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."solicitacoes_troca_nome"
    ADD CONSTRAINT "solicitacoes_troca_nome_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_mensagens"
    ADD CONSTRAINT "ticket_mensagens_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."tickets"
    ADD CONSTRAINT "tickets_avaliacao_nota_check" CHECK ((("avaliacao_nota" IS NULL) OR (("avaliacao_nota" >= 1) AND ("avaliacao_nota" <= 5)))) NOT VALID;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendedores_publicos"
    ADD CONSTRAINT "vendedores_publicos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendor_payment_accounts"
    ADD CONSTRAINT "vendor_payment_accounts_pkey" PRIMARY KEY ("vendedor_id");



ALTER TABLE ONLY "public"."verificacoes"
    ADD CONSTRAINT "verificacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_pkey" PRIMARY KEY ("vendedor_id");



CREATE UNIQUE INDEX "avaliacoes_pedido_unique" ON "public"."avaliacoes" USING "btree" ("pedido_id") WHERE ("pedido_id" IS NOT NULL);



CREATE INDEX "bank_change_pendentes_idx" ON "public"."bank_account_change_requests" USING "btree" ("created_at") WHERE ("status" = ANY (ARRAY['pendente'::"text", 'em_analise'::"text"]));



CREATE UNIQUE INDEX "bank_change_um_aberto_por_vendedor" ON "public"."bank_account_change_requests" USING "btree" ("vendedor_id") WHERE ("status" = ANY (ARRAY['pendente'::"text", 'em_analise'::"text"]));



CREATE INDEX "bank_change_vendedor_idx" ON "public"."bank_account_change_requests" USING "btree" ("vendedor_id", "created_at" DESC);



CREATE INDEX "cupons_ativo_validade_idx" ON "public"."cupons" USING "btree" ("ativo", "validade");



CREATE INDEX "cupons_publico_idx" ON "public"."cupons" USING "btree" ("publico") WHERE ("publico" = true);



CREATE INDEX "cupons_vendedor_idx" ON "public"."cupons" USING "btree" ("vendedor_id") WHERE ("vendedor_id" IS NOT NULL);



CREATE INDEX "event_ticket_lots_evento_idx" ON "public"."event_ticket_lots" USING "btree" ("evento_id");



CREATE INDEX "event_ticket_lots_status_idx" ON "public"."event_ticket_lots" USING "btree" ("status");



CREATE INDEX "event_ticket_lots_vigencia_idx" ON "public"."event_ticket_lots" USING "btree" ("evento_id", "lote_grupo", "lote_ordem");



CREATE INDEX "event_ticket_notifications_status_idx" ON "public"."event_ticket_notifications" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "event_ticket_orders_cliente_idx" ON "public"."event_ticket_orders" USING "btree" ("cliente_id");



CREATE INDEX "event_ticket_orders_evento_idx" ON "public"."event_ticket_orders" USING "btree" ("evento_id");



CREATE INDEX "event_ticket_orders_status_idx" ON "public"."event_ticket_orders" USING "btree" ("status");



CREATE INDEX "event_ticket_refunds_order_idx" ON "public"."event_ticket_refunds" USING "btree" ("order_id");



CREATE INDEX "event_ticket_refunds_status_idx" ON "public"."event_ticket_refunds" USING "btree" ("status");



CREATE UNIQUE INDEX "eventos_fonte_url_uidx" ON "public"."eventos" USING "btree" ("fonte_url") WHERE ("fonte_url" IS NOT NULL);



CREATE UNIQUE INDEX "eventos_titulo_data_uidx" ON "public"."eventos" USING "btree" ("lower"("titulo"), "data") WHERE ("data" IS NOT NULL);



CREATE UNIQUE INDEX "financial_ledger_pedido_tipo_uidx" ON "public"."financial_ledger" USING "btree" ("pedido_id", "tipo") WHERE ("pedido_id" IS NOT NULL);



CREATE INDEX "fraude_flags_vendedor_idx" ON "public"."fraude_flags" USING "btree" ("vendedor_id", "created_at");



CREATE INDEX "idx_ativacao_tokens_pendentes" ON "public"."ativacao_tokens" USING "btree" ("criado_em") WHERE ("usado_em" IS NULL);



CREATE INDEX "idx_ativacao_tokens_user" ON "public"."ativacao_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_ota_releases_lookup" ON "public"."ota_releases" USING "btree" ("app_id", "channel", "platform", "enabled", "created_at" DESC);



CREATE INDEX "idx_profiles_senha_provisoria" ON "public"."profiles" USING "btree" ("cadastrado_em") WHERE "senha_provisoria";



CREATE INDEX "idx_troca_nome_status" ON "public"."solicitacoes_troca_nome" USING "btree" ("status", "created_at" DESC);



CREATE UNIQUE INDEX "pagamentos_charge_uidx" ON "public"."pagamentos" USING "btree" ("provider", "provider_charge_id") WHERE ("provider_charge_id" IS NOT NULL);



CREATE INDEX "pagamentos_pedido_idx" ON "public"."pagamentos" USING "btree" ("pedido_id");



CREATE INDEX "pagamentos_status_idx" ON "public"."pagamentos" USING "btree" ("status");



CREATE INDEX "pagamentos_ticket_idx" ON "public"."pagamentos" USING "btree" ("ticket_order_id");



CREATE INDEX "payment_notifications_created_at_idx" ON "public"."payment_notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "payouts_status_idx" ON "public"."payouts" USING "btree" ("status");



CREATE INDEX "payouts_vendedor_idx" ON "public"."payouts" USING "btree" ("vendedor_id", "created_at" DESC);



CREATE INDEX "pedidos_cliente_id_idx" ON "public"."pedidos" USING "btree" ("cliente_id");



CREATE INDEX "profiles_cnpj_idx" ON "public"."profiles" USING "btree" ("cnpj") WHERE ("cnpj" IS NOT NULL);



CREATE UNIQUE INDEX "profiles_cnpj_uidx" ON "public"."profiles" USING "btree" ("cnpj") WHERE (NULLIF("cnpj", ''::"text") IS NOT NULL);



CREATE INDEX "profiles_conta_demo_idx" ON "public"."profiles" USING "btree" ("conta_demo") WHERE ("conta_demo" = true);



CREATE UNIQUE INDEX "profiles_cpf_cliente_uidx" ON "public"."profiles" USING "btree" ("cpf") WHERE (("cpf" IS NOT NULL) AND ("role" = 'cliente'::"text"));



CREATE INDEX "profiles_cpf_idx" ON "public"."profiles" USING "btree" ("cpf") WHERE ("cpf" IS NOT NULL);



CREATE UNIQUE INDEX "profiles_cpf_uidx" ON "public"."profiles" USING "btree" ("cpf") WHERE (NULLIF("cpf", ''::"text") IS NOT NULL);



CREATE INDEX "profiles_email_idx" ON "public"."profiles" USING "btree" ("lower"("email")) WHERE ("email" IS NOT NULL);



CREATE UNIQUE INDEX "profiles_email_lower_uidx" ON "public"."profiles" USING "btree" ("lower"("email")) WHERE (NULLIF(TRIM(BOTH FROM "email"), ''::"text") IS NOT NULL);



CREATE INDEX "profiles_status_idx" ON "public"."profiles" USING "btree" ("status");



CREATE INDEX "promocoes_produto_idx" ON "public"."promocoes" USING "btree" ("produto_id");



CREATE INDEX "promocoes_publicas_idx" ON "public"."promocoes" USING "btree" ("ativo", "publico", "data_inicio", "data_fim", "prioridade" DESC);



CREATE INDEX "promocoes_vendedor_idx" ON "public"."promocoes" USING "btree" ("vendedor_id");



CREATE INDEX "rate_limit_bucket_idx" ON "public"."rate_limit" USING "btree" ("bucket");



CREATE INDEX "security_audit_logs_created_idx" ON "public"."security_audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "security_audit_logs_email_idx" ON "public"."security_audit_logs" USING "btree" ("lower"("email"), "created_at" DESC) WHERE ("email" IS NOT NULL);



CREATE INDEX "security_audit_logs_event_idx" ON "public"."security_audit_logs" USING "btree" ("event_type", "created_at" DESC);



CREATE INDEX "security_audit_logs_severity_idx" ON "public"."security_audit_logs" USING "btree" ("severity", "created_at" DESC);



CREATE INDEX "security_audit_logs_user_idx" ON "public"."security_audit_logs" USING "btree" ("user_id", "created_at" DESC) WHERE ("user_id" IS NOT NULL);



CREATE INDEX "signup_ips_ip_idx" ON "public"."signup_ips" USING "btree" ("ip");



CREATE UNIQUE INDEX "solicitacoes_correcao_localizacao_ativa_uidx" ON "public"."solicitacoes_correcao_localizacao" USING "btree" ("restaurante_id") WHERE ("status" = ANY (ARRAY['pendente'::"text", 'aprovada'::"text"]));



CREATE INDEX "solicitacoes_correcao_localizacao_restaurante_idx" ON "public"."solicitacoes_correcao_localizacao" USING "btree" ("restaurante_id", "solicitado_em" DESC);



CREATE INDEX "solicitacoes_correcao_localizacao_revisado_por_idx" ON "public"."solicitacoes_correcao_localizacao" USING "btree" ("revisado_por") WHERE ("revisado_por" IS NOT NULL);



CREATE INDEX "solicitacoes_correcao_localizacao_status_idx" ON "public"."solicitacoes_correcao_localizacao" USING "btree" ("status", "solicitado_em" DESC);



CREATE INDEX "ticket_mensagens_ticket_idx" ON "public"."ticket_mensagens" USING "btree" ("ticket_id", "created_at");



CREATE INDEX "tickets_triagem_ia_idx" ON "public"."tickets" USING "btree" ("ia_triagem_status", "created_at" DESC) WHERE ("origem" = 'ia'::"text");



CREATE UNIQUE INDEX "uniq_troca_nome_pendente" ON "public"."solicitacoes_troca_nome" USING "btree" ("vendedor_id") WHERE ("status" = 'pendente'::"text");



CREATE INDEX "webhook_events_unprocessed_idx" ON "public"."payment_webhook_events" USING "btree" ("created_at") WHERE ("processed" = false);



CREATE OR REPLACE TRIGGER "on_avaliacao_inserida" AFTER INSERT ON "public"."avaliacoes" FOR EACH ROW EXECUTE FUNCTION "public"."atualiza_nota_vendedor"();



CREATE OR REPLACE TRIGGER "pagamentos_touch_trg" BEFORE UPDATE ON "public"."pagamentos" FOR EACH ROW EXECUTE FUNCTION "public"."pagamentos_touch"();



CREATE OR REPLACE TRIGGER "profiles_guard_conta_demo" BEFORE UPDATE OF "conta_demo" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "private"."reject_conta_demo_change"();



CREATE OR REPLACE TRIGGER "profiles_sync_vendedor_publico" AFTER INSERT OR DELETE OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_vendedor_publico"();



CREATE OR REPLACE TRIGGER "set_cupons_updated_at" BEFORE INSERT OR UPDATE ON "public"."cupons" FOR EACH ROW EXECUTE FUNCTION "public"."set_cupons_updated_at"();



CREATE OR REPLACE TRIGGER "set_pedido_customer_contact" BEFORE INSERT OR UPDATE OF "cliente_id", "cliente_telefone" ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."set_pedido_customer_contact"();



CREATE OR REPLACE TRIGGER "set_promocoes_updated_at" BEFORE UPDATE ON "public"."promocoes" FOR EACH ROW EXECUTE FUNCTION "public"."set_promocoes_updated_at"();



CREATE OR REPLACE TRIGGER "trg_00_validar_preco_pedido" BEFORE INSERT ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."validar_preco_pedido"();



CREATE OR REPLACE TRIGGER "trg_block_invalid_kyc_approval" BEFORE UPDATE OF "status", "kyc_override", "kyc_override_reason" ON "public"."verificacoes" FOR EACH ROW EXECUTE FUNCTION "public"."block_invalid_kyc_approval"();



CREATE OR REPLACE TRIGGER "trg_block_unconfirmed_delivery" BEFORE UPDATE OF "status" ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."block_unconfirmed_delivery"();



CREATE OR REPLACE TRIGGER "trg_bloquear_cancelamento_tardio" BEFORE UPDATE OF "status" ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."bloquear_cancelamento_tardio"();



CREATE OR REPLACE TRIGGER "trg_cancelar_ledger_do_pedido" AFTER UPDATE OF "status", "payment_status" ON "public"."pedidos" FOR EACH ROW WHEN (((("new"."status" = 'cancelado'::"text") OR ("new"."payment_status" = ANY (ARRAY['estornado'::"text", 'recusado'::"text", 'cancelado'::"text"]))) AND (("old"."status" IS DISTINCT FROM "new"."status") OR ("old"."payment_status" IS DISTINCT FROM "new"."payment_status")))) EXECUTE FUNCTION "public"."cancelar_ledger_do_pedido"();



CREATE OR REPLACE TRIGGER "trg_checar_ma_fe" AFTER INSERT ON "public"."fraude_flags" FOR EACH ROW EXECUTE FUNCTION "public"."checar_ma_fe"();



CREATE OR REPLACE TRIGGER "trg_create_delivery_code" AFTER INSERT ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."create_delivery_code"();



CREATE OR REPLACE TRIGGER "trg_create_order_financial_ledger" AFTER INSERT ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."create_order_financial_ledger"();



CREATE OR REPLACE TRIGGER "trg_create_order_financial_ledger_pago" AFTER UPDATE OF "payment_status" ON "public"."pedidos" FOR EACH ROW WHEN ((("new"."payment_status" = ANY (ARRAY['aprovado'::"text", 'presencial'::"text"])) AND ("old"."payment_status" IS DISTINCT FROM "new"."payment_status"))) EXECUTE FUNCTION "public"."create_order_financial_ledger"();



CREATE OR REPLACE TRIGGER "trg_enforce_banned_profile_visibility" BEFORE UPDATE OF "status" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_banned_profile_visibility"();



CREATE OR REPLACE TRIGGER "trg_estoque_pedido" AFTER INSERT OR UPDATE OF "status", "payment_status", "refunded_at" ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."mover_estoque_do_pedido"();



CREATE OR REPLACE TRIGGER "trg_fraude_flags_security_log" AFTER INSERT ON "public"."fraude_flags" FOR EACH ROW EXECUTE FUNCTION "private"."log_fraude_flag_created"();



CREATE OR REPLACE TRIGGER "trg_payment_notification" AFTER INSERT OR UPDATE OF "payment_status" ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."emit_payment_notification"();



CREATE OR REPLACE TRIGGER "trg_prepare_kyc_check_statuses" BEFORE INSERT OR UPDATE ON "public"."verificacoes" FOR EACH ROW EXECUTE FUNCTION "public"."prepare_kyc_check_statuses"();



CREATE OR REPLACE TRIGGER "trg_prepare_profile_cliente_cpf" BEFORE INSERT OR UPDATE OF "cpf", "role" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prepare_profile_cliente_cpf"();



CREATE OR REPLACE TRIGGER "trg_prepare_ticket_insert" BEFORE INSERT ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."prepare_ticket_insert"();



CREATE OR REPLACE TRIGGER "trg_prepare_ticket_message_insert" BEFORE INSERT ON "public"."ticket_mensagens" FOR EACH ROW EXECUTE FUNCTION "public"."prepare_ticket_message_insert"();



CREATE OR REPLACE TRIGGER "trg_protect_profile_verification_flags" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_profile_verification_flags"();



CREATE OR REPLACE TRIGGER "trg_protect_ticket_owner_update" BEFORE UPDATE ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."protect_ticket_owner_update"();



CREATE OR REPLACE TRIGGER "trg_proteger_localizacao_fixa_restaurante" BEFORE UPDATE OF "lat", "lng", "endereco" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."proteger_localizacao_fixa_restaurante"();



CREATE OR REPLACE TRIGGER "trg_release_coupon_on_unpaid_cancel" AFTER UPDATE OF "status", "payment_status" ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."release_coupon_on_unpaid_cancel"();



CREATE OR REPLACE TRIGGER "trg_reserve_event_ticket_stock" AFTER INSERT ON "public"."event_ticket_orders" FOR EACH ROW EXECUTE FUNCTION "public"."reserve_event_ticket_stock"();



CREATE OR REPLACE TRIGGER "trg_restore_event_ticket_stock" BEFORE UPDATE OF "status" ON "public"."event_ticket_orders" FOR EACH ROW EXECUTE FUNCTION "public"."restore_event_ticket_stock"();



CREATE OR REPLACE TRIGGER "trg_set_event_ticket_lot_pricing" BEFORE INSERT OR UPDATE ON "public"."event_ticket_lots" FOR EACH ROW EXECUTE FUNCTION "public"."set_event_ticket_lot_pricing"();



CREATE OR REPLACE TRIGGER "trg_set_event_ticket_order_totals" BEFORE INSERT OR UPDATE OF "ticket_lot_id", "quantidade" ON "public"."event_ticket_orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_event_ticket_order_totals"();



CREATE OR REPLACE TRIGGER "trg_set_order_finance_fields" BEFORE INSERT OR UPDATE OF "total", "pagamento", "gross_amount", "platform_fee_amount", "vendor_amount", "payment_provider", "payment_status", "settlement_status" ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."set_order_finance_fields"();



CREATE OR REPLACE TRIGGER "trg_sync_profile_verification_from_kyc" AFTER UPDATE OF "status" ON "public"."verificacoes" FOR EACH ROW EXECUTE FUNCTION "public"."sync_profile_verification_from_kyc"();



CREATE OR REPLACE TRIGGER "trg_validate_and_register_coupon_usage" AFTER INSERT ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."validate_and_register_coupon_usage"();



CREATE OR REPLACE TRIGGER "trg_validate_review_insert" BEFORE INSERT ON "public"."avaliacoes" FOR EACH ROW EXECUTE FUNCTION "public"."validate_review_insert"();



CREATE OR REPLACE TRIGGER "trg_zz_protect_order_update" BEFORE UPDATE ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."protect_order_update"();



ALTER TABLE ONLY "private"."pedido_codigos_entrega"
    ADD CONSTRAINT "pedido_codigos_entrega_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ativacao_tokens"
    ADD CONSTRAINT "ativacao_tokens_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ativacao_tokens"
    ADD CONSTRAINT "ativacao_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bank_account_change_requests"
    ADD CONSTRAINT "bank_account_change_requests_analisado_por_fkey" FOREIGN KEY ("analisado_por") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bank_account_change_requests"
    ADD CONSTRAINT "bank_account_change_requests_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cupom_usos"
    ADD CONSTRAINT "cupom_usos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cupom_usos"
    ADD CONSTRAINT "cupom_usos_cupom_codigo_fkey" FOREIGN KEY ("cupom_codigo") REFERENCES "public"."cupons"("codigo") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cupom_usos"
    ADD CONSTRAINT "cupom_usos_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entregadores"
    ADD CONSTRAINT "entregadores_verificacao_id_fkey" FOREIGN KEY ("verificacao_id") REFERENCES "public"."verificacoes"("id");



ALTER TABLE ONLY "public"."event_ticket_lots"
    ADD CONSTRAINT "event_ticket_lots_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_ticket_notifications"
    ADD CONSTRAINT "event_ticket_notifications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."event_ticket_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_ticket_orders"
    ADD CONSTRAINT "event_ticket_orders_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_ticket_orders"
    ADD CONSTRAINT "event_ticket_orders_entregue_por_fkey" FOREIGN KEY ("entregue_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_ticket_orders"
    ADD CONSTRAINT "event_ticket_orders_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."event_ticket_orders"
    ADD CONSTRAINT "event_ticket_orders_ticket_lot_id_fkey" FOREIGN KEY ("ticket_lot_id") REFERENCES "public"."event_ticket_lots"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."event_ticket_refunds"
    ADD CONSTRAINT "event_ticket_refunds_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_ticket_refunds"
    ADD CONSTRAINT "event_ticket_refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."event_ticket_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_ticket_refunds"
    ADD CONSTRAINT "event_ticket_refunds_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pagamentos"
    ADD CONSTRAINT "pagamentos_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pagamentos"
    ADD CONSTRAINT "pagamentos_ticket_order_id_fkey" FOREIGN KEY ("ticket_order_id") REFERENCES "public"."event_ticket_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_notifications"
    ADD CONSTRAINT "payment_notifications_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_ledger_entry_id_fkey" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."financial_ledger"("id");



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_entrega_confirmada_por_fkey" FOREIGN KEY ("entrega_confirmada_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."produtos"
    ADD CONSTRAINT "produtos_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_cadastrado_por_fkey" FOREIGN KEY ("cadastrado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promocoes"
    ADD CONSTRAINT "promocoes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."promocoes"
    ADD CONSTRAINT "promocoes_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promocoes"
    ADD CONSTRAINT "promocoes_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."security_audit_logs"
    ADD CONSTRAINT "security_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."security_audit_logs"
    ADD CONSTRAINT "security_audit_logs_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."security_audit_logs"
    ADD CONSTRAINT "security_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."seller_recipients"
    ADD CONSTRAINT "seller_recipients_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."solicitacoes_correcao_localizacao"
    ADD CONSTRAINT "solicitacoes_correcao_localizacao_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."solicitacoes_correcao_localizacao"
    ADD CONSTRAINT "solicitacoes_correcao_localizacao_revisado_por_fkey" FOREIGN KEY ("revisado_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."solicitacoes_troca_nome"
    ADD CONSTRAINT "solicitacoes_troca_nome_decidido_por_fkey" FOREIGN KEY ("decidido_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."solicitacoes_troca_nome"
    ADD CONSTRAINT "solicitacoes_troca_nome_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_mensagens"
    ADD CONSTRAINT "ticket_mensagens_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."verificacoes"
    ADD CONSTRAINT "verificacoes_kyc_override_by_fkey" FOREIGN KEY ("kyc_override_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."verificacoes"
    ADD CONSTRAINT "verificacoes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE "private"."pedido_codigos_entrega" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "No public OTA release access" ON "public"."ota_releases" TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."app_policies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_policies_admin_write" ON "public"."app_policies" TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



CREATE POLICY "app_policies_public_active" ON "public"."app_policies" FOR SELECT TO "authenticated", "anon" USING ((("ativo" IS TRUE) OR "private"."is_admin"()));



ALTER TABLE "public"."ativacao_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."authorized_ips" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authorized_ips_admin" ON "public"."authorized_ips" TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



ALTER TABLE "public"."avaliacoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "avaliacoes_delete_admin" ON "public"."avaliacoes" FOR DELETE TO "authenticated" USING ("private"."is_admin"());



CREATE POLICY "avaliacoes_insert_delivered_order" ON "public"."avaliacoes" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



CREATE POLICY "avaliacoes_select_public" ON "public"."avaliacoes" FOR SELECT TO "authenticated", "anon" USING (("vendedor_id" IS NOT NULL));



CREATE POLICY "avaliacoes_update_admin" ON "public"."avaliacoes" FOR UPDATE TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



ALTER TABLE "public"."avisos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "avisos_delete_admin" ON "public"."avisos" FOR DELETE TO "authenticated" USING ("private"."has_permission"('promocoes'::"text"));



CREATE POLICY "avisos_insert_admin" ON "public"."avisos" FOR INSERT TO "authenticated" WITH CHECK ("private"."has_permission"('promocoes'::"text"));



CREATE POLICY "avisos_select_active" ON "public"."avisos" FOR SELECT TO "authenticated", "anon" USING (("ativo" IS TRUE));



CREATE POLICY "avisos_update_admin" ON "public"."avisos" FOR UPDATE TO "authenticated" USING ("private"."has_permission"('promocoes'::"text")) WITH CHECK ("private"."has_permission"('promocoes'::"text"));



ALTER TABLE "public"."bank_account_change_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bank_change_insert" ON "public"."bank_account_change_requests" FOR INSERT WITH CHECK ((("vendedor_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'pendente'::"text") AND ("analisado_por" IS NULL) AND ("analisado_em" IS NULL) AND ("liberado_ate" IS NULL)));



CREATE POLICY "bank_change_select" ON "public"."bank_account_change_requests" FOR SELECT USING ((("vendedor_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'sysadmin'::"text"))))));



CREATE POLICY "bank_change_update_cancelar" ON "public"."bank_account_change_requests" FOR UPDATE USING ((("vendedor_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = ANY (ARRAY['pendente'::"text", 'em_analise'::"text"])))) WITH CHECK ((("vendedor_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'cancelado'::"text")));



ALTER TABLE "public"."blocked_ips" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "blocked_ips_admin" ON "public"."blocked_ips" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



ALTER TABLE "public"."cupom_usos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cupom_usos_select_own_or_admin" ON "public"."cupom_usos" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR ("cliente_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."cupons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cupons_delete_admin" ON "public"."cupons" FOR DELETE TO "authenticated" USING ("private"."is_admin"());



CREATE POLICY "cupons_insert_admin" ON "public"."cupons" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_admin"());



CREATE POLICY "cupons_select_public_active" ON "public"."cupons" FOR SELECT TO "authenticated", "anon" USING (("private"."is_admin"() OR (("ativo" IS TRUE) AND ("publico" IS TRUE) AND (("validade" IS NULL) OR ("validade" >= "now"())))));



CREATE POLICY "cupons_update_admin" ON "public"."cupons" FOR UPDATE TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



ALTER TABLE "public"."entregadores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "entregadores_delete_owner_or_admin" ON "public"."entregadores" FOR DELETE TO "authenticated" USING (("private"."is_admin"() OR ("restaurante_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "entregadores_insert_owner_or_admin" ON "public"."entregadores" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_admin"() OR ("restaurante_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "entregadores_select_owner_or_admin" ON "public"."entregadores" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR ("restaurante_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "entregadores_update_owner_or_admin" ON "public"."entregadores" FOR UPDATE TO "authenticated" USING (("private"."is_admin"() OR ("restaurante_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK (("private"."is_admin"() OR ("restaurante_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."event_ticket_lots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_ticket_lots_admin_write" ON "public"."event_ticket_lots" TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



CREATE POLICY "event_ticket_lots_public_available" ON "public"."event_ticket_lots" FOR SELECT TO "authenticated", "anon" USING (("private"."is_admin"() OR (("status" = 'disponivel'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."eventos" "e"
  WHERE (("e"."id" = "event_ticket_lots"."evento_id") AND ("e"."status" = 'ativo'::"text")))))));



ALTER TABLE "public"."event_ticket_notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_ticket_notifications_admin" ON "public"."event_ticket_notifications" TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



ALTER TABLE "public"."event_ticket_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_ticket_orders_admin_write" ON "public"."event_ticket_orders" TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



CREATE POLICY "event_ticket_orders_select_owner_admin" ON "public"."event_ticket_orders" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR ("cliente_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."event_ticket_refunds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_ticket_refunds_admin_write" ON "public"."event_ticket_refunds" TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



CREATE POLICY "event_ticket_refunds_insert_owner_request" ON "public"."event_ticket_refunds" FOR INSERT TO "authenticated" WITH CHECK ((("requested_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("requested_by_role" = 'cliente'::"text") AND ("status" = 'pendente_admin'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."event_ticket_orders" "o"
  WHERE (("o"."id" = "event_ticket_refunds"."order_id") AND ("o"."cliente_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("o"."status" = ANY (ARRAY['pago'::"text", 'entrega_pendente'::"text", 'entregue'::"text"])))))));



CREATE POLICY "event_ticket_refunds_select_owner_admin" ON "public"."event_ticket_refunds" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."event_ticket_orders" "o"
  WHERE (("o"."id" = "event_ticket_refunds"."order_id") AND ("o"."cliente_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."eventos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "eventos_delete_admin" ON "public"."eventos" FOR DELETE TO "authenticated" USING ("private"."is_admin"());



CREATE POLICY "eventos_insert_admin" ON "public"."eventos" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_admin"());



CREATE POLICY "eventos_select_active_or_admin" ON "public"."eventos" FOR SELECT TO "authenticated", "anon" USING ((("status" = 'ativo'::"text") OR "private"."is_admin"()));



CREATE POLICY "eventos_update_admin" ON "public"."eventos" FOR UPDATE TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



CREATE POLICY "ff_insert" ON "public"."fraude_flags" FOR INSERT TO "authenticated" WITH CHECK (("cliente_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "ff_select_admin" ON "public"."fraude_flags" FOR SELECT TO "authenticated" USING ("private"."is_admin"());



ALTER TABLE "public"."financial_ledger" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "financial_ledger_delete_admin" ON "public"."financial_ledger" FOR DELETE TO "authenticated" USING ("private"."is_admin"());



CREATE POLICY "financial_ledger_select_vendor_or_admin" ON "public"."financial_ledger" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR ("vendedor_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "financial_ledger_update_admin" ON "public"."financial_ledger" FOR UPDATE TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



ALTER TABLE "public"."fraude_flags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ota_releases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pagamentos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pagamentos_select_dono_ou_admin" ON "public"."pagamentos" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."pedidos" "p"
  WHERE (("p"."id" = "pagamentos"."pedido_id") AND (("p"."cliente_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("p"."vendedor_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("p"."restaurante_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("p"."ambulante_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



ALTER TABLE "public"."payment_notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_notifications_select_admin" ON "public"."payment_notifications" FOR SELECT TO "authenticated" USING (("private"."has_permission"('financeiro'::"text") OR "private"."has_permission"('pedidos'::"text")));



ALTER TABLE "public"."payment_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_settings_select_authenticated" ON "public"."payment_settings" FOR SELECT TO "authenticated" USING (("id" IS TRUE));



CREATE POLICY "payment_settings_write_admin" ON "public"."payment_settings" TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



ALTER TABLE "public"."payment_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payouts_leitura" ON "public"."payouts" FOR SELECT TO "authenticated" USING ((("vendedor_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."is_admin"()));



ALTER TABLE "public"."pedidos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pedidos_delete_admin" ON "public"."pedidos" FOR DELETE TO "authenticated" USING ("private"."has_permission"('pedidos'::"text"));



CREATE POLICY "pedidos_insert_checkout_safe" ON "public"."pedidos" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND ("cliente_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."has_role"('cliente'::"text") AND (COALESCE(((( SELECT "auth"."jwt"() AS "jwt") ->> 'is_anonymous'::"text"))::boolean, false) IS FALSE) AND (COALESCE("status", 'novo'::"text") = ANY (ARRAY['novo'::"text", 'aguardando_pagamento'::"text"])) AND (COALESCE("total", (0)::numeric) >= (0)::numeric) AND (COALESCE("discount_amount", (0)::numeric) >= (0)::numeric) AND (COALESCE("subtotal_amount", "total", (0)::numeric) >= COALESCE("total", (0)::numeric)) AND (COALESCE("payment_provider", 'manual'::"text") = ANY (ARRAY['manual'::"text", 'pagarme'::"text"])) AND ((("payment_provider" = 'manual'::"text") AND ("payment_status" = 'presencial'::"text")) OR (("payment_provider" = 'pagarme'::"text") AND ("payment_status" = 'pendente'::"text")))));



CREATE POLICY "pedidos_select_related_or_admin" ON "public"."pedidos" FOR SELECT TO "authenticated" USING (("private"."has_permission"('pedidos'::"text") OR "private"."has_permission"('financeiro'::"text") OR ("cliente_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("vendedor_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("restaurante_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("ambulante_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "pedidos_update_related_or_admin" ON "public"."pedidos" FOR UPDATE TO "authenticated" USING (("private"."is_admin"() OR ("cliente_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("vendedor_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("restaurante_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("ambulante_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK (("private"."is_admin"() OR ("cliente_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("vendedor_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("restaurante_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("ambulante_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."produtos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "produtos_delete_owner_or_admin" ON "public"."produtos" FOR DELETE TO "authenticated" USING (("private"."has_permission"('usuarios'::"text") OR (("vendedor_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("private"."has_role"('ambulante'::"text") OR "private"."has_role"('restaurante'::"text")))));



CREATE POLICY "produtos_insert_owner_or_admin" ON "public"."produtos" FOR INSERT TO "authenticated" WITH CHECK (("private"."has_permission"('usuarios'::"text") OR (("vendedor_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("private"."has_role"('ambulante'::"text") OR "private"."has_role"('restaurante'::"text")))));



CREATE POLICY "produtos_select_active_owner_or_admin" ON "public"."produtos" FOR SELECT TO "authenticated", "anon" USING (("private"."is_admin"() OR ("vendedor_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("ativo" IS TRUE) AND (EXISTS ( SELECT 1
   FROM "public"."vendedores_publicos" "vp"
  WHERE (("vp"."id" = "produtos"."vendedor_id") AND ("vp"."verificado" IS TRUE) AND (COALESCE("vp"."status", 'ativo'::"text") = 'ativo'::"text")))))));



CREATE POLICY "produtos_update_owner_or_admin" ON "public"."produtos" FOR UPDATE TO "authenticated" USING (("private"."has_permission"('usuarios'::"text") OR (("vendedor_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("private"."has_role"('ambulante'::"text") OR "private"."has_role"('restaurante'::"text"))))) WITH CHECK (("private"."has_permission"('usuarios'::"text") OR (("vendedor_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("private"."has_role"('ambulante'::"text") OR "private"."has_role"('restaurante'::"text")))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_delete_admin" ON "public"."profiles" FOR DELETE TO "authenticated" USING ("private"."is_admin"());



CREATE POLICY "profiles_select_self_or_admin" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR ("id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "profiles_update_own_non_admin_or_admin" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("private"."is_admin"() OR (("id" = ( SELECT "auth"."uid"() AS "uid")) AND (COALESCE("status", 'ativo'::"text") <> 'banido'::"text")))) WITH CHECK (("private"."is_admin"() OR (("id" = ( SELECT "auth"."uid"() AS "uid")) AND (COALESCE("role", 'cliente'::"text") = ANY (ARRAY['cliente'::"text", 'ambulante'::"text", 'restaurante'::"text", 'entregador'::"text"])) AND (COALESCE("status", 'ativo'::"text") <> 'banido'::"text"))));



ALTER TABLE "public"."promocoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "promocoes_delete_admin" ON "public"."promocoes" FOR DELETE TO "authenticated" USING ("private"."is_admin"());



CREATE POLICY "promocoes_insert_admin" ON "public"."promocoes" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_admin"());



CREATE POLICY "promocoes_select_public_active_or_admin" ON "public"."promocoes" FOR SELECT TO "authenticated", "anon" USING (("private"."is_admin"() OR (("ativo" IS TRUE) AND ("publico" IS TRUE) AND ("data_inicio" <= "now"()) AND (("data_fim" IS NULL) OR ("data_fim" >= "now"())))));



CREATE POLICY "promocoes_update_admin" ON "public"."promocoes" FOR UPDATE TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



ALTER TABLE "public"."rate_limit" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rate_limit_admin" ON "public"."rate_limit" FOR SELECT USING ("private"."is_admin"());



ALTER TABLE "public"."roadmap_ideias" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roadmap_ideias_delete" ON "public"."roadmap_ideias" FOR DELETE TO "authenticated" USING ("private"."is_admin"());



CREATE POLICY "roadmap_ideias_insert" ON "public"."roadmap_ideias" FOR INSERT TO "authenticated" WITH CHECK ((("length"(TRIM(BOTH FROM COALESCE("titulo", ''::"text"))) >= 3) AND ("length"(TRIM(BOTH FROM COALESCE("titulo", ''::"text"))) <= 120)));



CREATE POLICY "roadmap_ideias_modify" ON "public"."roadmap_ideias" FOR UPDATE TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



CREATE POLICY "roadmap_select" ON "public"."roadmap_ideias" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."security_audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "security_audit_select_admin" ON "public"."security_audit_logs" FOR SELECT TO "authenticated" USING ("private"."is_admin"());



CREATE POLICY "security_audit_update_admin" ON "public"."security_audit_logs" FOR UPDATE TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



ALTER TABLE "public"."seller_recipients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "seller_recipients_leitura" ON "public"."seller_recipients" FOR SELECT TO "authenticated" USING ((("vendedor_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."is_admin"()));



ALTER TABLE "public"."settlement_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "settlement_config_admin" ON "public"."settlement_config" FOR SELECT TO "authenticated" USING ("private"."is_admin"());



ALTER TABLE "public"."signup_ips" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "signup_ips_admin" ON "public"."signup_ips" FOR SELECT TO "authenticated" USING ("private"."is_admin"());



ALTER TABLE "public"."signup_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "signup_rules_admin" ON "public"."signup_rules" TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



ALTER TABLE "public"."solicitacoes_correcao_localizacao" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "solicitacoes_localizacao_select_owner_or_admin" ON "public"."solicitacoes_correcao_localizacao" FOR SELECT TO "authenticated" USING ((("restaurante_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."is_admin"()));



ALTER TABLE "public"."solicitacoes_troca_nome" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ticket_mensagens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tickets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tickets_delete_admin" ON "public"."tickets" FOR DELETE TO "authenticated" USING ("private"."has_permission"('atendimento'::"text"));



CREATE POLICY "tickets_insert_authenticated" ON "public"."tickets" FOR INSERT TO "authenticated" WITH CHECK ((("usuario_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_permission"('atendimento'::"text")));



CREATE POLICY "tickets_select_admin" ON "public"."tickets" FOR SELECT TO "authenticated" USING ("private"."has_permission"('atendimento'::"text"));



CREATE POLICY "tickets_select_own" ON "public"."tickets" FOR SELECT TO "authenticated" USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "tickets_update_admin" ON "public"."tickets" FOR UPDATE TO "authenticated" USING ("private"."has_permission"('atendimento'::"text")) WITH CHECK ("private"."has_permission"('atendimento'::"text"));



CREATE POLICY "tickets_update_own" ON "public"."tickets" FOR UPDATE TO "authenticated" USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "tm_insert" ON "public"."ticket_mensagens" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."id" = "ticket_mensagens"."ticket_id") AND (("t"."usuario_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_permission"('atendimento'::"text"))))));



CREATE POLICY "tm_select" ON "public"."ticket_mensagens" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."id" = "ticket_mensagens"."ticket_id") AND (("t"."usuario_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_permission"('atendimento'::"text"))))));



CREATE POLICY "troca_nome_admin_tudo" ON "public"."solicitacoes_troca_nome" TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



CREATE POLICY "troca_nome_dono_cancela" ON "public"."solicitacoes_troca_nome" FOR UPDATE TO "authenticated" USING ((("vendedor_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'pendente'::"text"))) WITH CHECK ((("vendedor_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = ANY (ARRAY['pendente'::"text", 'cancelada'::"text"]))));



CREATE POLICY "troca_nome_dono_cria" ON "public"."solicitacoes_troca_nome" FOR INSERT TO "authenticated" WITH CHECK ((("vendedor_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'pendente'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = ANY (ARRAY['ambulante'::"text", 'restaurante'::"text"])) AND (COALESCE("p"."status", 'ativo'::"text") = 'ativo'::"text"))))));



CREATE POLICY "troca_nome_dono_le" ON "public"."solicitacoes_troca_nome" FOR SELECT TO "authenticated" USING (("vendedor_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."vendedores_publicos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vendedores_publicos_select" ON "public"."vendedores_publicos" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."vendor_payment_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vendor_payment_accounts_insert_owner" ON "public"."vendor_payment_accounts" FOR INSERT TO "authenticated" WITH CHECK (("vendedor_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "vendor_payment_accounts_select_owner_or_admin" ON "public"."vendor_payment_accounts" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR ("vendedor_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "vendor_payment_accounts_update_owner" ON "public"."vendor_payment_accounts" FOR UPDATE TO "authenticated" USING (("vendedor_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("vendedor_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "vendor_payment_accounts_write_admin" ON "public"."vendor_payment_accounts" TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



ALTER TABLE "public"."verificacoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "verificacoes_delete_admin" ON "public"."verificacoes" FOR DELETE TO "authenticated" USING ("private"."is_admin"());



CREATE POLICY "verificacoes_insert_owner_pending" ON "public"."verificacoes" FOR INSERT TO "authenticated" WITH CHECK (((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("restaurante_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."is_admin"()) AND (COALESCE("status", 'pendente'::"text") = 'pendente'::"text")));



CREATE POLICY "verificacoes_select_owner_or_admin" ON "public"."verificacoes" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR ("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("restaurante_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "verificacoes_update_admin" ON "public"."verificacoes" FOR UPDATE TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



ALTER TABLE "public"."wallets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallets_leitura" ON "public"."wallets" FOR SELECT TO "authenticated" USING ((("vendedor_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."is_admin"()));



CREATE POLICY "webhook_events_admin" ON "public"."payment_webhook_events" FOR SELECT TO "authenticated" USING ("private"."is_admin"());





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."avaliacoes";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."avisos";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cupons";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."eventos";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."payment_notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."pedidos";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."produtos";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."promocoes";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."solicitacoes_correcao_localizacao";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."ticket_mensagens";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."tickets";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."vendedores_publicos";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."verificacoes";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






GRANT USAGE ON SCHEMA "private" TO "authenticated";
GRANT USAGE ON SCHEMA "private" TO "service_role";
GRANT USAGE ON SCHEMA "private" TO "anon";











































































































































































REVOKE ALL ON FUNCTION "private"."generate_delivery_code"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."has_permission"("p_section" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."has_permission"("p_section" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."has_permission"("p_section" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."has_realistic_name"("p_name" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."has_role"("p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."has_role"("p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."has_role"("p_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."is_admin"() TO "service_role";
GRANT ALL ON FUNCTION "private"."is_admin"() TO "anon";



REVOKE ALL ON FUNCTION "private"."is_adult_birthdate"("p_birth" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."is_sysadmin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_sysadmin"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."is_sysadmin"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."is_valid_cnpj"("p_cnpj" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."is_valid_cpf"("p_cpf" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."log_auth_password_changed"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."log_fraude_flag_created"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."only_digits"("p_value" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."reject_conta_demo_change"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."run_eventos_lifecycle"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."run_eventos_lifecycle"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_set_verificado"("p_user_id" "uuid", "p_verificado" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_verificado"("p_user_id" "uuid", "p_verificado" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_set_verificado"("p_user_id" "uuid", "p_verificado" boolean) TO "service_role";



GRANT ALL ON TABLE "public"."bank_account_change_requests" TO "anon";
GRANT ALL ON TABLE "public"."bank_account_change_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_account_change_requests" TO "service_role";



REVOKE ALL ON FUNCTION "public"."analisar_troca_conta"("p_pedido" "uuid", "p_decisao" "text", "p_parecer" "text", "p_horas" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."analisar_troca_conta"("p_pedido" "uuid", "p_decisao" "text", "p_parecer" "text", "p_horas" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."analisar_troca_conta"("p_pedido" "uuid", "p_decisao" "text", "p_parecer" "text", "p_horas" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."antecipar_saldo"("p_vendedor" "uuid", "p_grupo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."antecipar_saldo"("p_vendedor" "uuid", "p_grupo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."antecipar_saldo"("p_vendedor" "uuid", "p_grupo" "text") TO "service_role";



GRANT ALL ON TABLE "public"."solicitacoes_correcao_localizacao" TO "service_role";
GRANT SELECT ON TABLE "public"."solicitacoes_correcao_localizacao" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."aplicar_correcao_localizacao"("p_solicitacao_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_endereco" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."aplicar_correcao_localizacao"("p_solicitacao_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_endereco" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."aplicar_correcao_localizacao"("p_solicitacao_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_endereco" "text") TO "service_role";



GRANT ALL ON TABLE "public"."solicitacoes_troca_nome" TO "authenticated";
GRANT ALL ON TABLE "public"."solicitacoes_troca_nome" TO "service_role";



REVOKE ALL ON FUNCTION "public"."aprovar_troca_nome"("p_solicitacao_id" "uuid", "p_observacao" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."aprovar_troca_nome"("p_solicitacao_id" "uuid", "p_observacao" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."aprovar_troca_nome"("p_solicitacao_id" "uuid", "p_observacao" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."aprovar_verificacao"("p_verificacao_id" "uuid", "p_override" boolean, "p_override_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."aprovar_verificacao"("p_verificacao_id" "uuid", "p_override" boolean, "p_override_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."aprovar_verificacao"("p_verificacao_id" "uuid", "p_override" boolean, "p_override_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."atualiza_nota_vendedor"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."atualiza_nota_vendedor"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."block_invalid_kyc_approval"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."block_invalid_kyc_approval"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."block_unconfirmed_delivery"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."block_unconfirmed_delivery"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."bloquear_cancelamento_tardio"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bloquear_cancelamento_tardio"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancelar_ledger_do_pedido"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancelar_ledger_do_pedido"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."carteira_espelho"("p_vendedor" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."carteira_espelho"("p_vendedor" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."carteira_espelho"("p_vendedor" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."checar_ma_fe"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."checar_ma_fe"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cnpj_ja_cadastrado"("p_cnpj" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cnpj_ja_cadastrado"("p_cnpj" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirmar_entrega_pedido"("p_pedido_id" "uuid", "p_codigo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirmar_entrega_pedido"("p_pedido_id" "uuid", "p_codigo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirmar_entrega_pedido"("p_pedido_id" "uuid", "p_codigo" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_delivery_code"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_delivery_code"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_order_financial_ledger"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_order_financial_ledger"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."decidir_triagem_ia"("p_ticket_id" "uuid", "p_decisao" "text", "p_observacao" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decidir_triagem_ia"("p_ticket_id" "uuid", "p_decisao" "text", "p_observacao" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decidir_triagem_ia"("p_ticket_id" "uuid", "p_decisao" "text", "p_observacao" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."email_ja_cadastrado"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."email_ja_cadastrado"("p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."emit_payment_notification"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."emit_payment_notification"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_banned_profile_visibility"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_banned_profile_visibility"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_delivery_code"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_delivery_code"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_ip"("p_ip" "text", "p_limite" integer, "p_janela_seg" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_ip"("p_ip" "text", "p_limite" integer, "p_janela_seg" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_user_confirmed"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_user_confirmed"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."liberar_repasses"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."liberar_repasses"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."limpar_rate_limit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."limpar_rate_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_security_event"("p_event_type" "text", "p_platform" "text", "p_email" "text", "p_user_agent" "text", "p_route" "text", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_security_event"("p_event_type" "text", "p_platform" "text", "p_email" "text", "p_user_agent" "text", "p_route" "text", "p_metadata" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."log_security_event"("p_event_type" "text", "p_platform" "text", "p_email" "text", "p_user_agent" "text", "p_route" "text", "p_metadata" "jsonb") TO "authenticated";



GRANT ALL ON FUNCTION "public"."mover_estoque_do_pedido"() TO "anon";
GRANT ALL ON FUNCTION "public"."mover_estoque_do_pedido"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mover_estoque_do_pedido"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."obter_codigo_entrega"("p_pedido_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."obter_codigo_entrega"("p_pedido_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."obter_codigo_entrega"("p_pedido_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pagamentos_touch"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pagamentos_touch"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pode_trocar_conta"("p_vendedor" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pode_trocar_conta"("p_vendedor" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pode_trocar_conta"("p_vendedor" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."preparar_cadastro"("p_email" "text", "p_cpf" "text", "p_cnpj" "text", "p_ip" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."preparar_cadastro"("p_email" "text", "p_cpf" "text", "p_cnpj" "text", "p_ip" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."prepare_kyc_check_statuses"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prepare_kyc_check_statuses"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prepare_profile_cliente_cpf"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prepare_profile_cliente_cpf"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prepare_ticket_insert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prepare_ticket_insert"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prepare_ticket_message_insert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prepare_ticket_message_insert"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."previa_saque_rapido"("p_vendedor" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."previa_saque_rapido"("p_vendedor" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."previa_saque_rapido"("p_vendedor" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_order_update"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_order_update"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_profile_verification_flags"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_profile_verification_flags"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_ticket_owner_update"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_ticket_owner_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."proteger_localizacao_fixa_restaurante"() TO "anon";
GRANT ALL ON FUNCTION "public"."proteger_localizacao_fixa_restaurante"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."proteger_localizacao_fixa_restaurante"() TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."wallets" TO "anon";
GRANT ALL ON TABLE "public"."wallets" TO "authenticated";
GRANT ALL ON TABLE "public"."wallets" TO "service_role";



REVOKE ALL ON FUNCTION "public"."reconciliar_carteira"("p_vendedor" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reconciliar_carteira"("p_vendedor" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."recusar_troca_nome"("p_solicitacao_id" "uuid", "p_observacao" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recusar_troca_nome"("p_solicitacao_id" "uuid", "p_observacao" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recusar_troca_nome"("p_solicitacao_id" "uuid", "p_observacao" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rejeitar_verificacao"("p_verificacao_id" "uuid", "p_motivo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rejeitar_verificacao"("p_verificacao_id" "uuid", "p_motivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rejeitar_verificacao"("p_verificacao_id" "uuid", "p_motivo" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_coupon_on_unpaid_cancel"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_coupon_on_unpaid_cancel"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reserve_event_ticket_stock"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reserve_event_ticket_stock"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."restore_event_ticket_stock"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restore_event_ticket_stock"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."revisar_correcao_localizacao"("p_solicitacao_id" "uuid", "p_aprovar" boolean, "p_observacao" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revisar_correcao_localizacao"("p_solicitacao_id" "uuid", "p_aprovar" boolean, "p_observacao" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revisar_correcao_localizacao"("p_solicitacao_id" "uuid", "p_aprovar" boolean, "p_observacao" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rodar_robo_eventos"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rodar_robo_eventos"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rodar_robo_eventos"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_codigo_entrega"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_codigo_entrega"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_codigo_entrega"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_cupons_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_cupons_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_event_ticket_lot_pricing"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_event_ticket_lot_pricing"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_event_ticket_order_totals"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_event_ticket_order_totals"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_order_finance_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_order_finance_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_pedido_customer_contact"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_pedido_customer_contact"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_promocoes_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_promocoes_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."solicitar_correcao_localizacao"("p_motivo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."solicitar_correcao_localizacao"("p_motivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."solicitar_correcao_localizacao"("p_motivo" "text") TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."payouts" TO "anon";
GRANT ALL ON TABLE "public"."payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."payouts" TO "service_role";



REVOKE ALL ON FUNCTION "public"."solicitar_saque"("p_vendedor" "uuid", "p_valor" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."solicitar_saque"("p_vendedor" "uuid", "p_valor" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_profile_verification_from_kyc"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_profile_verification_from_kyc"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_vendedor_publico"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_vendedor_publico"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validar_preco_pedido"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validar_preco_pedido"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_and_register_coupon_usage"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_and_register_coupon_usage"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_review_insert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_review_insert"() TO "service_role";
























GRANT ALL ON TABLE "private"."pedido_codigos_entrega" TO "service_role";



GRANT ALL ON TABLE "public"."app_policies" TO "anon";
GRANT ALL ON TABLE "public"."app_policies" TO "authenticated";
GRANT ALL ON TABLE "public"."app_policies" TO "service_role";



GRANT ALL ON TABLE "public"."ativacao_tokens" TO "anon";
GRANT ALL ON TABLE "public"."ativacao_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."ativacao_tokens" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."authorized_ips" TO "anon";
GRANT ALL ON TABLE "public"."authorized_ips" TO "authenticated";
GRANT ALL ON TABLE "public"."authorized_ips" TO "service_role";



GRANT ALL ON TABLE "public"."avaliacoes" TO "service_role";
GRANT SELECT ON TABLE "public"."avaliacoes" TO "anon";
GRANT SELECT,INSERT ON TABLE "public"."avaliacoes" TO "authenticated";



GRANT ALL ON TABLE "public"."avisos" TO "service_role";
GRANT SELECT ON TABLE "public"."avisos" TO "anon";
GRANT SELECT,INSERT ON TABLE "public"."avisos" TO "authenticated";



GRANT ALL ON TABLE "public"."blocked_ips" TO "anon";
GRANT ALL ON TABLE "public"."blocked_ips" TO "authenticated";
GRANT ALL ON TABLE "public"."blocked_ips" TO "service_role";



GRANT ALL ON TABLE "public"."cupom_usos" TO "anon";
GRANT ALL ON TABLE "public"."cupom_usos" TO "authenticated";
GRANT ALL ON TABLE "public"."cupom_usos" TO "service_role";



GRANT ALL ON TABLE "public"."cupons" TO "service_role";
GRANT SELECT ON TABLE "public"."cupons" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."cupons" TO "authenticated";



GRANT ALL ON TABLE "public"."entregadores" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."entregadores" TO "authenticated";



GRANT ALL ON TABLE "public"."event_ticket_lots" TO "anon";
GRANT ALL ON TABLE "public"."event_ticket_lots" TO "authenticated";
GRANT ALL ON TABLE "public"."event_ticket_lots" TO "service_role";



GRANT ALL ON TABLE "public"."event_ticket_notifications" TO "anon";
GRANT ALL ON TABLE "public"."event_ticket_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."event_ticket_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."event_ticket_orders" TO "anon";
GRANT ALL ON TABLE "public"."event_ticket_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."event_ticket_orders" TO "service_role";



GRANT ALL ON TABLE "public"."event_ticket_refunds" TO "anon";
GRANT ALL ON TABLE "public"."event_ticket_refunds" TO "authenticated";
GRANT ALL ON TABLE "public"."event_ticket_refunds" TO "service_role";



GRANT ALL ON TABLE "public"."eventos" TO "service_role";
GRANT SELECT ON TABLE "public"."eventos" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."eventos" TO "authenticated";



GRANT ALL ON TABLE "public"."financial_ledger" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."financial_ledger" TO "authenticated";



GRANT ALL ON TABLE "public"."fraude_flags" TO "anon";
GRANT ALL ON TABLE "public"."fraude_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."fraude_flags" TO "service_role";



GRANT ALL ON TABLE "public"."ota_releases" TO "service_role";



GRANT ALL ON TABLE "public"."pagamentos" TO "anon";
GRANT ALL ON TABLE "public"."pagamentos" TO "authenticated";
GRANT ALL ON TABLE "public"."pagamentos" TO "service_role";



GRANT ALL ON TABLE "public"."payment_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."payment_settings" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."payment_settings" TO "authenticated";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."payment_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."payment_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."pedidos" TO "service_role";
GRANT INSERT ON TABLE "public"."pedidos" TO "anon";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."pedidos" TO "authenticated";



GRANT ALL ON TABLE "public"."produtos" TO "service_role";
GRANT SELECT ON TABLE "public"."produtos" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."produtos" TO "authenticated";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT,DELETE,UPDATE ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."promocoes" TO "anon";
GRANT ALL ON TABLE "public"."promocoes" TO "authenticated";
GRANT ALL ON TABLE "public"."promocoes" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limit" TO "anon";
GRANT ALL ON TABLE "public"."rate_limit" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limit" TO "service_role";



GRANT ALL ON TABLE "public"."roadmap_ideias" TO "anon";
GRANT ALL ON TABLE "public"."roadmap_ideias" TO "authenticated";
GRANT ALL ON TABLE "public"."roadmap_ideias" TO "service_role";



GRANT ALL ON TABLE "public"."security_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."security_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."security_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."security_login_risk_summary" TO "anon";
GRANT ALL ON TABLE "public"."security_login_risk_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."security_login_risk_summary" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."seller_recipients" TO "anon";
GRANT ALL ON TABLE "public"."seller_recipients" TO "authenticated";
GRANT ALL ON TABLE "public"."seller_recipients" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."settlement_config" TO "anon";
GRANT ALL ON TABLE "public"."settlement_config" TO "authenticated";
GRANT ALL ON TABLE "public"."settlement_config" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."signup_ips" TO "anon";
GRANT ALL ON TABLE "public"."signup_ips" TO "authenticated";
GRANT ALL ON TABLE "public"."signup_ips" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."signup_rules" TO "anon";
GRANT ALL ON TABLE "public"."signup_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."signup_rules" TO "service_role";



GRANT REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."ticket_mensagens" TO "anon";
GRANT ALL ON TABLE "public"."ticket_mensagens" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_mensagens" TO "service_role";



GRANT ALL ON TABLE "public"."tickets" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."tickets" TO "authenticated";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."vendedores_publicos" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."vendedores_publicos" TO "authenticated";
GRANT ALL ON TABLE "public"."vendedores_publicos" TO "service_role";



GRANT ALL ON TABLE "public"."vendor_payment_accounts" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."vendor_payment_accounts" TO "authenticated";



GRANT ALL ON TABLE "public"."verificacoes" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."verificacoes" TO "authenticated";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































