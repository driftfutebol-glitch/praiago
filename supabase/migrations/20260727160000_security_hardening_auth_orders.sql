-- Security hardening: authorization must be enforced in Postgres, never only
-- by the client applications.

create or replace function private.is_sysadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.role = 'sysadmin'
       and coalesce(p.status, 'ativo') <> 'banido'
  );
$$;

create or replace function private.has_permission(p_section text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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

create or replace function private.has_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.role = p_role
       and coalesce(p.status, 'ativo') <> 'banido'
  );
$$;

revoke all on function private.is_sysadmin() from public, anon;
revoke all on function private.has_permission(text) from public, anon;
revoke all on function private.has_role(text) from public, anon;
grant execute on function private.is_sysadmin() to authenticated, service_role;
grant execute on function private.has_permission(text) to authenticated, service_role;
grant execute on function private.has_role(text) to authenticated, service_role;

-- A confirmed CPF is immutable. Regular users can edit only ordinary profile
-- fields; role, permissions, KYC, bans and financial configuration are server
-- or administrator-owned.
create or replace function public.protect_profile_verification_flags()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
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

revoke all on function public.protect_profile_verification_flags()
from public, anon, authenticated;

drop policy if exists profiles_insert_own_non_admin on public.profiles;
revoke insert on table public.profiles from anon, authenticated;

-- Checkout values sent by an app are hints only. Postgres decides provider,
-- payment state, platform fee and seller amount.
create or replace function public.set_order_finance_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg record;
  gross numeric(10,2);
  fee numeric(10,2);
  vendor_value numeric(10,2);
  method text;
  presencial boolean;
begin
  select platform_fee_percent, platform_fee_fixed, presencial_fee_mode
    into cfg
    from public.payment_settings
   where id is true;

  gross := coalesce(new.total, 0)::numeric(10,2);
  fee := round(
    (
      gross * coalesce(cfg.platform_fee_percent, 10.00) / 100
      + coalesce(cfg.platform_fee_fixed, 0.00)
    )::numeric,
    2
  );
  vendor_value := greatest(0, round((gross - fee)::numeric, 2));
  method := coalesce(new.pagamento, 'pix');
  presencial := method in (
    'dinheiro',
    'cartao_fisico',
    'debito_fisico',
    'credito_fisico'
  );

  new.gross_amount := gross;
  new.platform_fee_amount := fee;
  new.vendor_amount := vendor_value;

  if tg_op = 'INSERT' or new.pagamento is distinct from old.pagamento then
    new.payment_provider := case when presencial then 'manual' else 'pagarme' end;
    new.payment_status := case when presencial then 'presencial' else 'pendente' end;
    new.settlement_status := case
      when presencial then coalesce(cfg.presencial_fee_mode, 'cobrar_vendedor')
      else 'pendente'
    end;
  end if;

  return new;
end;
$$;

revoke all on function public.set_order_finance_fields()
from public, anon, authenticated;

drop policy if exists pedidos_insert_checkout_safe on public.pedidos;
create policy pedidos_insert_checkout_safe
on public.pedidos
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and cliente_id = (select auth.uid())
  and private.has_role('cliente')
  and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is false
  and coalesce(status, 'novo') in ('novo', 'aguardando_pagamento')
  and coalesce(total, 0) >= 0
  and coalesce(discount_amount, 0) >= 0
  and coalesce(subtotal_amount, total, 0) >= coalesce(total, 0)
  and coalesce(payment_provider, 'manual') in ('manual', 'pagarme')
  and (
    (payment_provider = 'manual' and payment_status = 'presencial')
    or
    (payment_provider = 'pagarme' and payment_status = 'pendente')
  )
);

drop policy if exists pedidos_select_related_or_admin on public.pedidos;
create policy pedidos_select_related_or_admin
on public.pedidos
for select
to authenticated
using (
  private.has_permission('pedidos')
  or private.has_permission('financeiro')
  or cliente_id = (select auth.uid())
  or vendedor_id = (select auth.uid())
  or restaurante_id = (select auth.uid())
  or ambulante_id = (select auth.uid())
);

drop policy if exists pedidos_delete_admin on public.pedidos;
create policy pedidos_delete_admin
on public.pedidos
for delete
to authenticated
using (private.has_permission('pedidos'));

create or replace function public.protect_order_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
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

revoke all on function public.protect_order_update()
from public, anon, authenticated;

drop trigger if exists trg_zz_protect_order_update on public.pedidos;
create trigger trg_zz_protect_order_update
before update
on public.pedidos
for each row
execute function public.protect_order_update();

-- The delivery code is not stored in the seller-readable pedidos row.
create table if not exists private.pedido_codigos_entrega (
  pedido_id uuid primary key references public.pedidos(id) on delete cascade,
  cliente_id uuid not null,
  codigo text not null check (codigo ~ '^[0-9]{6}$'),
  tentativas integer not null default 0 check (tentativas >= 0),
  bloqueado_ate timestamptz,
  created_at timestamptz not null default now(),
  confirmado_em timestamptz
);

alter table private.pedido_codigos_entrega enable row level security;
revoke all on table private.pedido_codigos_entrega from public, anon, authenticated;
grant all on table private.pedido_codigos_entrega to service_role;

create or replace function private.generate_delivery_code()
returns text
language sql
volatile
set search_path = ''
as $$
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

create or replace function public.create_delivery_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.pedido_codigos_entrega (pedido_id, cliente_id, codigo)
  values (new.id, new.cliente_id, private.generate_delivery_code())
  on conflict (pedido_id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_delivery_code()
from public, anon, authenticated;

drop trigger if exists trg_codigo_entrega on public.pedidos;
drop trigger if exists trg_ensure_delivery_code on public.pedidos;
drop trigger if exists trg_create_delivery_code on public.pedidos;
create trigger trg_create_delivery_code
after insert
on public.pedidos
for each row
execute function public.create_delivery_code();

update public.pedidos
   set codigo_entrega = null,
       codigo_entrega_criado_em = null
 where codigo_entrega is not null
    or codigo_entrega_criado_em is not null;

create or replace function public.obter_codigo_entrega(p_pedido_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
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

revoke all on function public.obter_codigo_entrega(uuid) from public, anon;
grant execute on function public.obter_codigo_entrega(uuid) to authenticated;

create or replace function public.confirmar_entrega_pedido(
  p_pedido_id uuid,
  p_codigo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function public.confirmar_entrega_pedido(uuid, text)
from public, anon;
grant execute on function public.confirmar_entrega_pedido(uuid, text)
to authenticated;

-- Reviews require an authenticated client and a delivered order owned by that
-- client. Names and seller association are derived on the server.
create unique index if not exists avaliacoes_pedido_unique
on public.avaliacoes (pedido_id)
where pedido_id is not null;

create or replace function public.validate_review_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function public.validate_review_insert()
from public, anon, authenticated;

drop trigger if exists trg_validate_review_insert on public.avaliacoes;
create trigger trg_validate_review_insert
before insert
on public.avaliacoes
for each row
execute function public.validate_review_insert();

drop policy if exists avaliacoes_insert_valid on public.avaliacoes;
create policy avaliacoes_insert_delivered_order
on public.avaliacoes
for insert
to authenticated
with check ((select auth.uid()) is not null);

revoke insert on table public.avaliacoes from anon;
grant insert on table public.avaliacoes to authenticated;

-- Only administrators can broadcast notices.
drop policy if exists avisos_insert_authenticated_notice_or_admin on public.avisos;
create policy avisos_insert_admin
on public.avisos
for insert
to authenticated
with check (private.has_permission('promocoes'));

revoke insert on table public.avisos from anon;
grant insert on table public.avisos to authenticated;

drop policy if exists avisos_update_admin on public.avisos;
create policy avisos_update_admin
on public.avisos
for update
to authenticated
using (private.has_permission('promocoes'))
with check (private.has_permission('promocoes'));

drop policy if exists avisos_delete_admin on public.avisos;
create policy avisos_delete_admin
on public.avisos
for delete
to authenticated
using (private.has_permission('promocoes'));

-- Product ownership also requires the authenticated account to still be a
-- seller. A client cannot write products by guessing its own UUID.
drop policy if exists produtos_insert_owner_or_admin on public.produtos;
create policy produtos_insert_owner_or_admin
on public.produtos
for insert
to authenticated
with check (
  private.has_permission('usuarios')
  or (
    vendedor_id = (select auth.uid())
    and (
      private.has_role('ambulante')
      or private.has_role('restaurante')
    )
  )
);

drop policy if exists produtos_update_owner_or_admin on public.produtos;
create policy produtos_update_owner_or_admin
on public.produtos
for update
to authenticated
using (
  private.has_permission('usuarios')
  or (
    vendedor_id = (select auth.uid())
    and (
      private.has_role('ambulante')
      or private.has_role('restaurante')
    )
  )
)
with check (
  private.has_permission('usuarios')
  or (
    vendedor_id = (select auth.uid())
    and (
      private.has_role('ambulante')
      or private.has_role('restaurante')
    )
  )
);

drop policy if exists produtos_delete_owner_or_admin on public.produtos;
create policy produtos_delete_owner_or_admin
on public.produtos
for delete
to authenticated
using (
  private.has_permission('usuarios')
  or (
    vendedor_id = (select auth.uid())
    and (
      private.has_role('ambulante')
      or private.has_role('restaurante')
    )
  )
);

-- Support tickets cannot be opened anonymously and owners cannot overwrite
-- administrator replies, priority or AI triage fields.
create or replace function public.prepare_ticket_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

create or replace function public.protect_ticket_owner_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
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

revoke all on function public.prepare_ticket_insert()
from public, anon, authenticated;
revoke all on function public.protect_ticket_owner_update()
from public, anon, authenticated;

drop trigger if exists trg_prepare_ticket_insert on public.tickets;
create trigger trg_prepare_ticket_insert
before insert
on public.tickets
for each row
execute function public.prepare_ticket_insert();

drop trigger if exists trg_protect_ticket_owner_update on public.tickets;
create trigger trg_protect_ticket_owner_update
before update
on public.tickets
for each row
execute function public.protect_ticket_owner_update();

drop policy if exists tickets_insert_support_request on public.tickets;
create policy tickets_insert_authenticated
on public.tickets
for insert
to authenticated
with check (usuario_id = (select auth.uid()) or private.has_permission('atendimento'));

drop policy if exists tickets_select_admin on public.tickets;
create policy tickets_select_admin
on public.tickets
for select
to authenticated
using (private.has_permission('atendimento'));

drop policy if exists tickets_update_admin on public.tickets;
create policy tickets_update_admin
on public.tickets
for update
to authenticated
using (private.has_permission('atendimento'))
with check (private.has_permission('atendimento'));

drop policy if exists tickets_delete_admin on public.tickets;
create policy tickets_delete_admin
on public.tickets
for delete
to authenticated
using (private.has_permission('atendimento'));

revoke insert on table public.tickets from anon;
grant insert on table public.tickets to authenticated;

create or replace function public.prepare_ticket_message_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
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

revoke all on function public.prepare_ticket_message_insert()
from public, anon, authenticated;

drop trigger if exists trg_prepare_ticket_message_insert on public.ticket_mensagens;
create trigger trg_prepare_ticket_message_insert
before insert
on public.ticket_mensagens
for each row
execute function public.prepare_ticket_message_insert();

drop policy if exists tm_select on public.ticket_mensagens;
create policy tm_select
on public.ticket_mensagens
for select
to authenticated
using (
  exists (
    select 1
      from public.tickets t
     where t.id = ticket_mensagens.ticket_id
       and (
         t.usuario_id = (select auth.uid())
         or private.has_permission('atendimento')
       )
  )
);

drop policy if exists tm_insert on public.ticket_mensagens;
create policy tm_insert
on public.ticket_mensagens
for insert
to authenticated
with check (
  exists (
    select 1
      from public.tickets t
     where t.id = ticket_mensagens.ticket_id
       and (
         t.usuario_id = (select auth.uid())
         or private.has_permission('atendimento')
       )
  )
);

-- Remove public account enumeration helpers and fix a mutable search_path
-- finding on an internal timestamp trigger.
revoke all on function public.email_ja_cadastrado(text)
from public, anon, authenticated;
revoke all on function public.cnpj_ja_cadastrado(text)
from public, anon, authenticated;

alter function public.pagamentos_touch() set search_path = '';
revoke all on function public.pagamentos_touch()
from public, anon, authenticated;
