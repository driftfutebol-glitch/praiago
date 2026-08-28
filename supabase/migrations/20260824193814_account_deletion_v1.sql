-- Account deletion v1
--
-- Users initiate deletion from either mobile app. A client account can be
-- completed immediately when it has no operational/financial blockers. Seller
-- accounts always wait for a sysadmin review so profile cascades cannot erase
-- payout history or an unsettled balance.

create table public.account_deletion_requests (
  id                            uuid primary key default gen_random_uuid(),
  user_id                       uuid references auth.users(id) on delete set null,
  -- Stable, non-FK subject identifier while work is pending. It survives the
  -- Auth deletion so a retry can finish, then is cleared atomically with the
  -- completed transition to avoid retaining an account UUID forever.
  subject_id                    uuid,
  role                          text not null
                                  check (role in ('cliente', 'ambulante')),
  status                        text not null default 'requested'
                                  check (status in (
                                    'requested',
                                    'manual_review',
                                    'blocked',
                                    'processing',
                                    'completed',
                                    'failed'
                                  )),
  phase                         text not null default 'pending'
                                  check (phase in (
                                    'pending',
                                    'cleanup',
                                    'auth_delete',
                                    'auth_deleted',
                                    'completed'
                                  )),
  notification_email            text,
  blockers                      jsonb not null default '[]'::jsonb
                                  check (jsonb_typeof(blockers) = 'array'),
  requested_at                  timestamptz not null default now(),
  deadline_at                   timestamptz not null default (now() + interval '30 days'),
  processing_started_at         timestamptz,
  lock_token                    uuid,
  lock_expires_at               timestamptz,
  attempt_count                 integer not null default 0
                                  check (attempt_count >= 0),
  auth_delete_started_at        timestamptz,
  auth_deleted_at               timestamptz,
  completed_at                  timestamptz,
  processed_by                  uuid references auth.users(id) on delete set null,
  external_cleanup_confirmed_at timestamptz,
  external_cleanup_confirmed_by uuid references auth.users(id) on delete set null,
  last_error                    text,
  notification_sent_at          timestamptz,
  notification_error            text,
  updated_at                    timestamptz not null default now()
);

-- A retry must reuse the same protocol instead of creating multiple deletion
-- jobs for the same subject. subject_id deliberately survives deletion from
-- auth.users, so a crash between Auth deletion and completion remains
-- resumable under the original protocol.
create unique index account_deletion_one_open_per_subject_idx
  on public.account_deletion_requests (subject_id)
  where subject_id is not null and status <> 'completed';

create index account_deletion_queue_idx
  on public.account_deletion_requests (status, deadline_at);

alter table public.account_deletion_requests enable row level security;

-- There are deliberately no anon/authenticated policies. All reads and writes
-- go through the authenticated Edge Function, which derives the subject from
-- the verified JWT and uses service_role only on the server.
revoke all on table public.account_deletion_requests from public, anon, authenticated;
grant all on table public.account_deletion_requests to service_role;

-- Completion clears the raw Auth UUID from the protocol, but requests that
-- started earlier can still finish afterwards. Keep only a restricted,
-- domain-separated SHA-256 fingerprint so those late service-role writes are
-- rejected without retaining the account identifier itself.
create table public.account_deletion_tombstones (
  subject_fingerprint bytea primary key
    check (octet_length(subject_fingerprint) = 32),
  deletion_request_id uuid not null unique
    references public.account_deletion_requests(id) on delete restrict,
  completed_at timestamptz not null default now()
);

alter table public.account_deletion_tombstones enable row level security;
revoke all on table public.account_deletion_tombstones
  from public, anon, authenticated;
grant select, insert on table public.account_deletion_tombstones to service_role;

-- A provider recipient is created outside Postgres. This restricted operation
-- row is reserved before the HTTP POST and remains a hard deletion blocker
-- until the recipient is either linked locally or a sysadmin confirms the
-- provider-side cleanup. Pending rows intentionally retain the raw subject;
-- terminal rows clear both subject_id and recipient_id.
create table public.recipient_provisioning_operations (
  id                  uuid primary key default gen_random_uuid(),
  subject_id          uuid,
  deletion_request_id uuid
    references public.account_deletion_requests(id) on delete restrict,
  state               text not null default 'provisioning'
    check (state in ('provisioning', 'cleanup_pending', 'linked', 'cleaned')),
  recipient_id        text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  resolved_at         timestamptz,
  resolved_by         uuid references auth.users(id) on delete set null,
  check (recipient_id is null or length(recipient_id) between 3 and 200),
  check (
    (state in ('provisioning', 'cleanup_pending') and subject_id is not null)
    or
    (state in ('linked', 'cleaned') and subject_id is null and recipient_id is null)
  ),
  check (state <> 'cleanup_pending' or deletion_request_id is not null)
);

create unique index recipient_provisioning_one_pending_subject_idx
  on public.recipient_provisioning_operations (subject_id)
  where subject_id is not null and state in ('provisioning', 'cleanup_pending');

create index recipient_provisioning_deletion_request_idx
  on public.recipient_provisioning_operations (deletion_request_id, state)
  where deletion_request_id is not null;

alter table public.recipient_provisioning_operations enable row level security;
revoke all on table public.recipient_provisioning_operations
  from public, anon, authenticated, service_role;
-- Queue/blocker consumers need read access, while every state mutation remains
-- confined to the fenced SECURITY DEFINER RPCs below.
grant select on table public.recipient_provisioning_operations to service_role;

create function private.account_subject_fingerprint(p_subject uuid)
returns bytea
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select extensions.digest(
    p_subject::text || ':praiago-account-deletion-v1',
    'sha256'
  );
$$;

revoke all on function private.account_subject_fingerprint(uuid)
  from public, anon, authenticated;
grant execute on function private.account_subject_fingerprint(uuid) to service_role;

create function private.account_deletion_forbids_subject(p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_subject is not null
    and (
      exists (
        select 1
          from public.account_deletion_requests d
         where (d.subject_id = p_subject or d.user_id = p_subject)
           and d.status <> 'completed'
      )
      or exists (
        select 1
          from public.account_deletion_tombstones t
         where t.subject_fingerprint = private.account_subject_fingerprint(p_subject)
      )
    );
$$;

revoke all on function private.account_deletion_forbids_subject(uuid)
  from public, anon, authenticated, service_role;

create function public.begin_recipient_provisioning(p_subject uuid)
returns setof public.recipient_provisioning_operations
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_subject is null then
    raise exception 'recipient subject required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_subject::text, 17017));

  if private.account_deletion_forbids_subject(p_subject)
     or not exists (
       select 1
         from public.profiles p
        where p.id = p_subject
          and p.role in ('ambulante', 'restaurante')
          and coalesce(p.status, 'ativo') = 'ativo'
     ) then
    raise exception 'Conta indisponivel para criar recebedor.' using errcode = '42501';
  end if;

  return query
    select o.*
      from public.recipient_provisioning_operations o
     where o.subject_id = p_subject
       and o.state in ('provisioning', 'cleanup_pending')
     order by o.created_at, o.id
     limit 1;
  if found then return; end if;

  return query
    insert into public.recipient_provisioning_operations (subject_id, state)
    values (p_subject, 'provisioning')
    returning *;
end;
$$;

revoke all on function public.begin_recipient_provisioning(uuid)
  from public, anon, authenticated;
grant execute on function public.begin_recipient_provisioning(uuid) to service_role;

create function public.record_recipient_provisioning(
  p_operation_id uuid,
  p_subject uuid,
  p_recipient_id text
)
returns setof public.recipient_provisioning_operations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_recipient text;
  v_request_id uuid;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_operation_id is null or p_subject is null
     or nullif(trim(coalesce(p_recipient_id, '')), '') is null
     or length(p_recipient_id) > 200 then
    raise exception 'invalid recipient provisioning result';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_subject::text, 17017));

  select o.recipient_id
    into v_existing_recipient
    from public.recipient_provisioning_operations o
   where o.id = p_operation_id
     and o.subject_id = p_subject
     and o.state in ('provisioning', 'cleanup_pending')
   for update;
  if not found then
    raise exception 'recipient provisioning operation is not pending';
  end if;
  if v_existing_recipient is not null and v_existing_recipient <> p_recipient_id then
    raise exception 'recipient provisioning result does not match the reserved operation';
  end if;

  select d.id
    into v_request_id
    from public.account_deletion_requests d
   where (d.subject_id = p_subject or d.user_id = p_subject)
     and d.status <> 'completed'
   order by d.requested_at desc, d.id desc
   limit 1;

  return query
    update public.recipient_provisioning_operations o
       set recipient_id = coalesce(o.recipient_id, p_recipient_id),
           deletion_request_id = coalesce(o.deletion_request_id, v_request_id),
           state = case when v_request_id is not null then 'cleanup_pending' else o.state end,
           updated_at = now()
     where o.id = p_operation_id
       and o.subject_id = p_subject
       and o.state in ('provisioning', 'cleanup_pending')
    returning o.*;
end;
$$;

revoke all on function public.record_recipient_provisioning(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_recipient_provisioning(uuid, uuid, text)
  to service_role;

create function public.finalize_recipient_provisioning(
  p_operation_id uuid,
  p_subject uuid
)
returns setof public.recipient_provisioning_operations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_id text;
  v_request_id uuid;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_operation_id is null or p_subject is null then
    raise exception 'invalid recipient provisioning operation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_subject::text, 17017));

  select o.recipient_id
    into v_recipient_id
    from public.recipient_provisioning_operations o
   where o.id = p_operation_id
     and o.subject_id = p_subject
     and o.state in ('provisioning', 'cleanup_pending')
   for update;
  if not found then
    raise exception 'recipient provisioning operation is not pending';
  end if;

  select d.id
    into v_request_id
    from public.account_deletion_requests d
   where (d.subject_id = p_subject or d.user_id = p_subject)
     and d.status <> 'completed'
   order by d.requested_at desc, d.id desc
   limit 1;

  if v_request_id is not null then
    return query
      update public.recipient_provisioning_operations o
         set state = 'cleanup_pending',
             deletion_request_id = coalesce(o.deletion_request_id, v_request_id),
             updated_at = now()
       where o.id = p_operation_id
         and o.subject_id = p_subject
      returning o.*;
    return;
  end if;

  if v_recipient_id is null or not exists (
    select 1
      from public.seller_recipients r
     where r.vendedor_id = p_subject
       and r.recipient_id = v_recipient_id
  ) then
    raise exception 'recipient is not durably linked to the seller';
  end if;

  return query
    update public.recipient_provisioning_operations o
       set state = 'linked',
           subject_id = null,
           recipient_id = null,
           resolved_at = now(),
           updated_at = now()
     where o.id = p_operation_id
       and o.subject_id = p_subject
    returning o.*;
end;
$$;

revoke all on function public.finalize_recipient_provisioning(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_recipient_provisioning(uuid, uuid)
  to service_role;

create function public.resolve_recipient_provisioning(
  p_operation_id uuid,
  p_actor_id uuid
)
returns setof public.recipient_provisioning_operations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_operation_id is null or p_actor_id is null or not exists (
    select 1
      from public.profiles p
     where p.id = p_actor_id
       and p.role = 'sysadmin'
       and coalesce(p.status, 'ativo') = 'ativo'
  ) then
    raise exception 'active sysadmin required' using errcode = '42501';
  end if;

  select o.subject_id
    into v_subject
    from public.recipient_provisioning_operations o
   where o.id = p_operation_id
     and o.state in ('provisioning', 'cleanup_pending');
  if v_subject is null then
    raise exception 'recipient provisioning operation is not pending';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_subject::text, 17017));

  return query
    update public.recipient_provisioning_operations o
       set state = 'cleaned',
           subject_id = null,
           recipient_id = null,
           resolved_at = now(),
           resolved_by = p_actor_id,
           updated_at = now()
     where o.id = p_operation_id
       and o.subject_id = v_subject
       and o.state in ('provisioning', 'cleanup_pending')
    returning o.*;
  if not found then
    raise exception 'recipient provisioning operation changed concurrently';
  end if;
end;
$$;

revoke all on function public.resolve_recipient_provisioning(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_recipient_provisioning(uuid, uuid)
  to service_role;

-- Revoking refresh sessions does not invalidate an access JWT that is already
-- in memory. Every self-service write policy must therefore reject a subject
-- as soon as an open deletion protocol exists, independently of JWT age.
create function public.account_can_write(p_subject uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_subject is not null
    and p_subject = (select auth.uid())
    and exists (
      select 1
        from public.profiles p
       where p.id = p_subject
         and coalesce(p.status, 'ativo') = 'ativo'
    )
    and not private.account_deletion_forbids_subject(p_subject);
$$;

revoke all on function public.account_can_write(uuid) from public, anon;
grant execute on function public.account_can_write(uuid) to authenticated, service_role;

-- Public tables with owner/self writes. Administrative branches retain their
-- existing permissions; only the self-service branch is fenced.
alter policy profiles_update_own_non_admin_or_admin on public.profiles
using (
  private.is_admin()
  or (
    public.account_can_write()
    and id = (select auth.uid())
    and coalesce(status, 'ativo') <> 'banido'
  )
)
with check (
  private.is_admin()
  or (
    public.account_can_write()
    and id = (select auth.uid())
    and coalesce(role, 'cliente') in ('cliente', 'ambulante', 'restaurante', 'entregador')
    and coalesce(status, 'ativo') <> 'banido'
  )
);

alter policy produtos_insert_owner_or_admin on public.produtos
with check (
  private.has_permission('usuarios')
  or (
    public.account_can_write()
    and vendedor_id = (select auth.uid())
    and (private.has_role('ambulante') or private.has_role('restaurante'))
  )
);

alter policy produtos_update_owner_or_admin on public.produtos
using (
  private.has_permission('usuarios')
  or (
    public.account_can_write()
    and vendedor_id = (select auth.uid())
    and (private.has_role('ambulante') or private.has_role('restaurante'))
  )
)
with check (
  private.has_permission('usuarios')
  or (
    public.account_can_write()
    and vendedor_id = (select auth.uid())
    and (private.has_role('ambulante') or private.has_role('restaurante'))
  )
);

alter policy produtos_delete_owner_or_admin on public.produtos
using (
  private.has_permission('usuarios')
  or (
    public.account_can_write()
    and vendedor_id = (select auth.uid())
    and (private.has_role('ambulante') or private.has_role('restaurante'))
  )
);

alter policy pedidos_insert_checkout_safe on public.pedidos
with check (
  public.account_can_write()
  and (select auth.uid()) is not null
  and cliente_id = (select auth.uid())
  and private.has_role('cliente')
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) is false
  and coalesce(status, 'novo') in ('novo', 'aguardando_pagamento')
  and coalesce(total, 0) >= 0
  and coalesce(discount_amount, 0) >= 0
  and coalesce(subtotal_amount, total, 0) >= coalesce(total, 0)
  and coalesce(payment_provider, 'manual') in ('manual', 'pagarme')
  and (
    (payment_provider = 'manual' and payment_status = 'presencial')
    or (payment_provider = 'pagarme' and payment_status = 'pendente')
  )
);

alter policy pedidos_update_related_or_admin on public.pedidos
using (
  private.is_admin()
  or (
    public.account_can_write()
    and (
      cliente_id = (select auth.uid())
      or vendedor_id = (select auth.uid())
      or restaurante_id = (select auth.uid())
      or ambulante_id = (select auth.uid())
    )
  )
)
with check (
  private.is_admin()
  or (
    public.account_can_write()
    and (
      cliente_id = (select auth.uid())
      or vendedor_id = (select auth.uid())
      or restaurante_id = (select auth.uid())
      or ambulante_id = (select auth.uid())
    )
  )
);

alter policy tickets_insert_authenticated on public.tickets
with check (
  private.has_permission('atendimento')
  or (public.account_can_write() and usuario_id = (select auth.uid()))
);

alter policy tickets_update_own on public.tickets
using (public.account_can_write() and usuario_id = (select auth.uid()))
with check (public.account_can_write() and usuario_id = (select auth.uid()));

alter policy ff_insert on public.fraude_flags
with check (public.account_can_write() and cliente_id = (select auth.uid()));

alter policy vendor_payment_accounts_insert_owner on public.vendor_payment_accounts
with check (public.account_can_write() and vendedor_id = (select auth.uid()));

alter policy vendor_payment_accounts_update_owner on public.vendor_payment_accounts
using (public.account_can_write() and vendedor_id = (select auth.uid()))
with check (public.account_can_write() and vendedor_id = (select auth.uid()));

alter policy bank_change_insert on public.bank_account_change_requests
with check (
  public.account_can_write()
  and vendedor_id = (select auth.uid())
  and status = 'pendente'
  and analisado_por is null
  and analisado_em is null
  and liberado_ate is null
);

alter policy bank_change_update_cancelar on public.bank_account_change_requests
using (
  public.account_can_write()
  and vendedor_id = (select auth.uid())
  and status in ('pendente', 'em_analise')
)
with check (
  public.account_can_write()
  and vendedor_id = (select auth.uid())
  and status = 'cancelado'
);

alter policy avaliacoes_insert_delivered_order on public.avaliacoes
with check (public.account_can_write());

alter policy roadmap_ideias_insert on public.roadmap_ideias
with check (
  public.account_can_write()
  and length(trim(coalesce(titulo, ''))) >= 3
  and length(trim(coalesce(titulo, ''))) <= 120
);

alter policy event_ticket_refunds_insert_owner_request on public.event_ticket_refunds
with check (
  public.account_can_write()
  and requested_by = (select auth.uid())
  and requested_by_role = 'cliente'
  and status = 'pendente_admin'
  and exists (
    select 1
      from public.event_ticket_orders o
     where o.id = event_ticket_refunds.order_id
       and o.cliente_id = (select auth.uid())
       and o.status in ('pago', 'entrega_pendente', 'entregue')
  )
);

alter policy troca_nome_dono_cria on public.solicitacoes_troca_nome
with check (
  public.account_can_write()
  and vendedor_id = (select auth.uid())
  and status = 'pendente'
  and exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.role in ('ambulante', 'restaurante')
       and coalesce(p.status, 'ativo') = 'ativo'
  )
);

alter policy troca_nome_dono_cancela on public.solicitacoes_troca_nome
using (
  public.account_can_write()
  and vendedor_id = (select auth.uid())
  and status = 'pendente'
)
with check (
  public.account_can_write()
  and vendedor_id = (select auth.uid())
  and status in ('pendente', 'cancelada')
);

alter policy tm_insert on public.ticket_mensagens
with check (
  private.has_permission('atendimento')
  or (
    public.account_can_write()
    and exists (
      select 1
        from public.tickets t
       where t.id = ticket_mensagens.ticket_id
         and t.usuario_id = (select auth.uid())
    )
  )
);

alter policy verificacoes_insert_owner_pending on public.verificacoes
with check (
  (
    private.is_admin()
    or (
      public.account_can_write()
      and (
        user_id = (select auth.uid())
        or restaurante_id = (select auth.uid())
      )
    )
  )
  and coalesce(status, 'pendente') = 'pendente'
);

-- Storage writes are fenced too; deleteUser/session revocation alone does not
-- stop a still-valid access JWT from uploading new objects during cleanup.
alter policy produtos_auth_insert on storage.objects
with check (
  public.account_can_write()
  and bucket_id = 'produtos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

alter policy produtos_auth_update on storage.objects
using (
  public.account_can_write()
  and bucket_id = 'produtos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  public.account_can_write()
  and bucket_id = 'produtos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

alter policy produtos_auth_delete on storage.objects
using (
  public.account_can_write()
  and bucket_id = 'produtos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

alter policy kyc_documentos_insert_owner on storage.objects
with check (
  public.account_can_write()
  and bucket_id = 'kyc-documentos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

alter policy kyc_documentos_delete_unsubmitted_owner on storage.objects
using (
  public.account_can_write()
  and bucket_id = 'kyc-documentos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (
    select 1
      from public.verificacoes v
     where coalesce(v.user_id, v.restaurante_id) = (select auth.uid())
       and name in (
         coalesce(v.rg_frente_url, ''),
         coalesce(v.rg_verso_url, ''),
         coalesce(v.selfie_url, ''),
         coalesce(v.foto_loja_url, ''),
         coalesce(v.cnh_url, '')
       )
  )
);

alter policy perfis_vendedores_owner_insert on storage.objects
with check (
  public.account_can_write()
  and bucket_id = 'perfis-vendedores'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) = any (
    array['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic', 'heif']
  )
  and exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.role in ('cliente', 'ambulante', 'restaurante', 'entregador')
       and coalesce(p.status, 'ativo') = 'ativo'
  )
);

alter policy perfis_vendedores_owner_update on storage.objects
using (
  public.account_can_write()
  and bucket_id = 'perfis-vendedores'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  public.account_can_write()
  and bucket_id = 'perfis-vendedores'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) = any (
    array['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic', 'heif']
  )
  and exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.role in ('cliente', 'ambulante', 'restaurante', 'entregador')
       and coalesce(p.status, 'ativo') = 'ativo'
  )
);

alter policy perfis_vendedores_owner_delete on storage.objects
using (
  public.account_can_write()
  and bucket_id = 'perfis-vendedores'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.role in ('ambulante', 'restaurante', 'entregador')
       and coalesce(p.status, 'ativo') = 'ativo'
  )
);

-- Atomically fences one worker for a bounded lease. The Edge Function is the
-- only caller and invokes this RPC with service_role. SECURITY INVOKER is
-- intentional: the function needs no privilege escalation.
create function public.claim_account_deletion_request(
  p_request_id uuid,
  p_processed_by uuid,
  p_lease_seconds integer default 900
)
returns setof public.account_deletion_requests
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.account_deletion_requests
     set status = 'processing',
         lock_token = gen_random_uuid(),
         lock_expires_at = now()
           + make_interval(secs => greatest(60, least(coalesce(p_lease_seconds, 900), 1800))),
         attempt_count = attempt_count + 1,
         processing_started_at = coalesce(processing_started_at, now()),
         processed_by = coalesce(p_processed_by, processed_by),
         last_error = null,
         updated_at = now()
   where id = p_request_id
     and subject_id is not null
     and status <> 'completed'
     and (
       status <> 'processing'
       or lock_expires_at is null
       or lock_expires_at <= now()
     )
  returning *;
$$;

revoke all on function public.claim_account_deletion_request(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_account_deletion_request(uuid, uuid, integer)
  to service_role;

-- Payouts are accounting history, not disposable profile children. Preserve
-- them in pseudonymized form when the seller profile is eventually removed.
alter table public.payouts
  add column deletion_request_id uuid
    references public.account_deletion_requests(id) on delete restrict;

alter table public.financial_ledger
  add column deletion_request_id uuid
    references public.account_deletion_requests(id) on delete restrict;

alter table public.payouts
  drop constraint if exists payouts_vendedor_id_fkey;

alter table public.payouts
  alter column vendedor_id drop not null;

alter table public.payouts
  add constraint payouts_vendedor_id_fkey
    foreign key (vendedor_id)
    references public.profiles(id)
    on delete set null;

create index payouts_deletion_request_idx
  on public.payouts (deletion_request_id)
  where deletion_request_id is not null;

create index financial_ledger_deletion_request_idx
  on public.financial_ledger (deletion_request_id)
  where deletion_request_id is not null;

comment on table public.account_deletion_requests is
  'Deletion protocols initiated in-app. Completion is automatic only when safe; seller/financial cases require sysadmin review.';

comment on column public.account_deletion_requests.notification_email is
  'Kept only until the completion notice is sent, then cleared.';

comment on column public.account_deletion_requests.subject_id is
  'Non-FK Auth subject retained for idempotent recovery until the completed transition clears it.';

comment on function public.claim_account_deletion_request(uuid, uuid, integer) is
  'Atomically claims one deletion protocol for a fenced, expiring service_role worker lease.';

comment on column public.payouts.deletion_request_id is
  'Pseudonymous link that preserves payout history after the seller account is removed.';

comment on column public.financial_ledger.deletion_request_id is
  'Pseudonymous link that preserves accounting history after the seller account is removed.';

-- Every destructive worker transition is evaluated against the database
-- clock and the current lease token in one statement. Edge runtimes can have
-- clock skew; they are never authoritative for lease validity or timestamps.
create function public.transition_account_deletion_request(
  p_request_id uuid,
  p_lock_token uuid,
  p_action text,
  p_blockers jsonb default null,
  p_error text default null,
  p_actor_id uuid default null,
  p_lease_seconds integer default 900
)
returns setof public.account_deletion_requests
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_subject uuid;
begin
  if p_action not in (
    'renew',
    'cleanup',
    'auth_delete',
    'auth_deleted',
    'complete',
    'failed',
    'blocked',
    'manual_review',
    'external_confirm'
  ) then
    raise exception 'invalid deletion transition';
  end if;

  if p_blockers is not null and jsonb_typeof(p_blockers) <> 'array' then
    raise exception 'blockers must be a JSON array';
  end if;

  if p_action = 'external_confirm' then
    select d.subject_id
      into v_subject
      from public.account_deletion_requests d
     where d.id = p_request_id
       and d.status = 'processing'
       and d.lock_token = p_lock_token
       and d.lock_expires_at > now()
       and d.subject_id is not null
     for update;
    if not found then return; end if;

    perform pg_advisory_xact_lock(hashtextextended(v_subject::text, 17017));
    if exists (
      select 1
        from public.recipient_provisioning_operations o
       where o.state in ('provisioning', 'cleanup_pending')
         and (o.subject_id = v_subject or o.deletion_request_id = p_request_id)
    ) then
      raise exception 'pending recipient operation must be resolved before external confirmation';
    end if;
  end if;

  if p_action = 'complete' then
    -- Lock and fingerprint the subject in the same transaction that clears
    -- subject_id. A callback waiting on the per-subject advisory lock can
    -- therefore observe either the open protocol or its permanent tombstone,
    -- never a gap between the two states.
    select d.subject_id
      into v_subject
      from public.account_deletion_requests d
     where d.id = p_request_id
       and d.status = 'processing'
       and d.lock_token = p_lock_token
       and d.lock_expires_at > now()
       and d.phase = 'auth_deleted'
       and d.auth_deleted_at is not null
       and d.subject_id is not null
     for update;

    if not found then
      return;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(v_subject::text, 17017));

    if exists (
      select 1
        from public.recipient_provisioning_operations o
       where o.state in ('provisioning', 'cleanup_pending')
         and (o.subject_id = v_subject or o.deletion_request_id = p_request_id)
    ) then
      raise exception 'pending external recipient operation blocks account deletion';
    end if;

    insert into public.account_deletion_tombstones (
      subject_fingerprint,
      deletion_request_id,
      completed_at
    ) values (
      private.account_subject_fingerprint(v_subject),
      p_request_id,
      now()
    )
    on conflict (subject_fingerprint) do nothing;

    if not exists (
      select 1
        from public.account_deletion_tombstones t
       where t.subject_fingerprint = private.account_subject_fingerprint(v_subject)
         and t.deletion_request_id = p_request_id
    ) then
      raise exception 'account deletion fingerprint collision';
    end if;
  end if;

  return query
  update public.account_deletion_requests d
     set status = case p_action
           when 'complete' then 'completed'
           when 'failed' then 'failed'
           when 'blocked' then 'blocked'
           when 'manual_review' then 'manual_review'
           else d.status
         end,
         phase = case p_action
           when 'cleanup' then 'cleanup'
           when 'auth_delete' then 'auth_delete'
           when 'auth_deleted' then 'auth_deleted'
           when 'complete' then 'completed'
           else d.phase
         end,
         subject_id = case when p_action = 'complete' then null else d.subject_id end,
         user_id = case when p_action in ('auth_deleted', 'complete') then null else d.user_id end,
         blockers = case
           when p_action in ('blocked', 'manual_review') then coalesce(p_blockers, '[]'::jsonb)
           when p_action in ('cleanup', 'complete') then '[]'::jsonb
           else d.blockers
         end,
         last_error = case
           when p_action = 'failed' then left(coalesce(p_error, 'unknown deletion failure'), 4000)
           when p_action in ('cleanup', 'blocked', 'manual_review', 'complete') then null
           else d.last_error
         end,
         auth_delete_started_at = case
           when p_action = 'auth_delete' then coalesce(d.auth_delete_started_at, now())
           else d.auth_delete_started_at
         end,
         auth_deleted_at = case
           when p_action = 'auth_deleted' then coalesce(d.auth_deleted_at, now())
           else d.auth_deleted_at
         end,
         completed_at = case
           when p_action = 'complete' then coalesce(d.completed_at, now())
           else d.completed_at
         end,
         external_cleanup_confirmed_at = case
           when p_action = 'external_confirm' then coalesce(d.external_cleanup_confirmed_at, now())
           else d.external_cleanup_confirmed_at
         end,
         external_cleanup_confirmed_by = case
           when p_action = 'external_confirm' then coalesce(p_actor_id, d.external_cleanup_confirmed_by)
           else d.external_cleanup_confirmed_by
         end,
         lock_token = case
           when p_action in ('complete', 'failed', 'blocked', 'manual_review') then null
           else d.lock_token
         end,
         lock_expires_at = case
           when p_action in ('complete', 'failed', 'blocked', 'manual_review') then null
           else now() + make_interval(
             secs => greatest(60, least(coalesce(p_lease_seconds, 900), 1800))
           )
         end,
         updated_at = now()
   where d.id = p_request_id
     and d.status = 'processing'
     and d.lock_token = p_lock_token
     and d.lock_expires_at > now()
     and (
       p_action <> 'complete'
       or (d.phase = 'auth_deleted' and d.auth_deleted_at is not null)
     )
  returning d.*;
end;
$$;

revoke all on function public.transition_account_deletion_request(
  uuid, uuid, text, jsonb, text, uuid, integer
) from public, anon, authenticated;
grant execute on function public.transition_account_deletion_request(
  uuid, uuid, text, jsonb, text, uuid, integer
) to service_role;

comment on function public.transition_account_deletion_request(
  uuid, uuid, text, jsonb, text, uuid, integer
) is 'Fenced deletion state machine; lease checks and timestamps use the database clock.';

-- Fraud evidence is retained under restricted RLS, but only an unresolved
-- flag may block deletion. Once resolved, the direct subject link is removed
-- and the deletion protocol becomes the pseudonymous evidence reference.
alter table public.fraude_flags
  add column status text not null default 'aberta',
  add column resolved_at timestamptz,
  add column resolved_by uuid references auth.users(id) on delete set null,
  add column resolution_notes text,
  add column deletion_request_id uuid
    references public.account_deletion_requests(id) on delete restrict;

alter table public.fraude_flags
  add constraint fraude_flags_status_check
  check (status in ('aberta', 'em_analise', 'resolvida', 'arquivada'));

alter table public.fraude_flags
  alter column vendedor_id drop not null;

create index fraude_flags_open_seller_idx
  on public.fraude_flags (vendedor_id, created_at)
  where vendedor_id is not null and status in ('aberta', 'em_analise');

create index fraude_flags_deletion_request_idx
  on public.fraude_flags (deletion_request_id)
  where deletion_request_id is not null;

alter policy ff_insert on public.fraude_flags
with check (
  public.account_can_write()
  and cliente_id = (select auth.uid())
  and status = 'aberta'
  and resolved_at is null
  and resolved_by is null
  and deletion_request_id is null
);

create function public.resolver_fraude_flag(
  p_flag_id uuid,
  p_status text,
  p_resolution_notes text default null
)
returns public.fraude_flags
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.fraude_flags;
begin
  if not private.is_admin() then
    raise exception 'Sem permissao para resolver alerta antifraude.' using errcode = '42501';
  end if;
  if p_status not in ('resolvida', 'arquivada') then
    raise exception 'Status de resolucao invalido.' using errcode = '22023';
  end if;

  update public.fraude_flags
     set status = p_status,
         resolved_at = coalesce(resolved_at, now()),
         resolved_by = (select auth.uid()),
         resolution_notes = nullif(left(trim(coalesce(p_resolution_notes, '')), 2000), '')
   where id = p_flag_id
     and status in ('aberta', 'em_analise')
  returning * into v_result;

  if v_result.id is null then
    raise exception 'Alerta nao encontrado ou ja resolvido.' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

revoke all on function public.resolver_fraude_flag(uuid, text, text) from public, anon;
grant execute on function public.resolver_fraude_flag(uuid, text, text) to authenticated;

-- Closed support records are useful to prove how a dispute was handled. They
-- remain restricted to support staff but lose the account/name/e-mail link.
-- Open and in-progress records are blockers and are not touched by cleanup.
alter table public.tickets
  add column deletion_request_id uuid
    references public.account_deletion_requests(id) on delete restrict;

create index tickets_deletion_request_idx
  on public.tickets (deletion_request_id)
  where deletion_request_id is not null;

-- Event orders are retained as transaction evidence. Once anonymized, this
-- protocol link also lets the payment guard reject a late service-role payment
-- without needing the deleted client's UUID.
alter table public.event_ticket_orders
  add column deletion_request_id uuid
    references public.account_deletion_requests(id) on delete restrict;

create index event_ticket_orders_deletion_request_idx
  on public.event_ticket_orders (deletion_request_id)
  where deletion_request_id is not null;

-- Normal orders are retained as transaction history too. This marker lets the
-- payment trigger reject a delayed PIX/card write after cliente_id is scrubbed.
alter table public.pedidos
  add column deletion_request_id uuid
    references public.account_deletion_requests(id) on delete restrict;

create index pedidos_deletion_request_idx
  on public.pedidos (deletion_request_id)
  where deletion_request_id is not null;

-- The protocol marker is irreversible. Legacy service-role callbacks may still
-- update an old order after the client scrub, but they cannot restore the
-- client link/name/CPF or gateway details once this marker is present.
create function private.enforce_anonymized_order_privacy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.deletion_request_id is not null then
    new.deletion_request_id := old.deletion_request_id;
  end if;

  if new.deletion_request_id is not null then
    new.cliente_id := null;
    new.cliente_nome := 'Cliente removido';
    new.cpf_nota := null;
    new.payment_details := '{}'::jsonb;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_anonymized_order_privacy()
  from public, anon, authenticated, service_role;

create trigger pedidos_enforce_anonymized_privacy
before insert or update on public.pedidos
for each row execute function private.enforce_anonymized_order_privacy();

-- A client can create an order directly while the seller is entering account
-- deletion. Serialize both seller references with the deletion protocol so the
-- winning transaction is unambiguous: an order committed first is visible to
-- blockers; a deletion committed first rejects the new order. UUID ordering
-- avoids deadlocks when vendedor_id and ambulante_id differ.
create function private.reject_order_for_deleting_seller()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid;
begin
  for v_subject in
    select distinct s.subject_id
      from unnest(array[new.vendedor_id, new.ambulante_id]) as s(subject_id)
     where s.subject_id is not null
     order by s.subject_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_subject::text, 17017));

    if tg_op = 'INSERT' and not exists (
      select 1
        from public.profiles p
       where p.id = v_subject
         and coalesce(p.status, 'ativo') = 'ativo'
    ) then
      raise exception 'Pedido nao pode ser criado para vendedor inativo.'
        using errcode = '42501';
    end if;

    if private.account_deletion_forbids_subject(v_subject) then
      raise exception 'Conta do vendedor em exclusao nao aceita novos pedidos.'
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function private.reject_order_for_deleting_seller()
  from public, anon, authenticated, service_role;

create trigger pedidos_reject_deleting_seller
before insert or update of vendedor_id, ambulante_id on public.pedidos
for each row execute function private.reject_order_for_deleting_seller();

-- RLS checks the client's JWT before the statement, but it cannot serialize
-- that check with a concurrent deletion transaction. Fence cliente_id in the
-- database as well, including service-role inserts and post-completion writes.
create function private.reject_order_for_deleting_client()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cliente_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.cliente_id::text, 17017));

  if tg_op = 'INSERT' and not exists (
    select 1
      from public.profiles p
     where p.id = new.cliente_id
       and coalesce(p.status, 'ativo') = 'ativo'
  ) then
    raise exception 'Pedido nao pode ser criado para cliente inativo.'
      using errcode = '42501';
  end if;

  if private.account_deletion_forbids_subject(new.cliente_id) then
    raise exception 'Conta do cliente em exclusao nao aceita novos pedidos.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.reject_order_for_deleting_client()
  from public, anon, authenticated, service_role;

create trigger pedidos_reject_deleting_client
before insert or update of cliente_id on public.pedidos
for each row execute function private.reject_order_for_deleting_client();

-- Delivery codes live in a private table retained with the order and have no
-- Auth FK. Delete them during client cleanup and expose an assert-only mode for
-- the final zero-residue check immediately before deleting the Auth user.
create function public.cleanup_account_delivery_codes(
  p_subject uuid,
  p_delete boolean default true
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_subject is null then
    raise exception 'delivery-code subject required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_subject::text, 17017));

  if coalesce(p_delete, true) then
    delete from private.pedido_codigos_entrega c where c.cliente_id = p_subject;
    get diagnostics v_deleted = row_count;
  end if;

  if exists (
    select 1 from private.pedido_codigos_entrega c where c.cliente_id = p_subject
  ) then
    raise exception 'delivery-code residuals remain for deletion subject';
  end if;

  return v_deleted;
end;
$$;

revoke all on function public.cleanup_account_delivery_codes(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.cleanup_account_delivery_codes(uuid, boolean)
  to service_role;

-- Direct client inserts into fraud reports carry both the reporting client and
-- reported seller UUIDs. Fence every subject in deterministic order. UPDATE is
-- limited to identity columns so a sysadmin can still resolve an open flag
-- while a deletion is pending; cleanup that nulls the identities remains valid.
create function private.reject_fraud_flag_for_deleting_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid;
  v_subjects uuid[];
begin
  if tg_op = 'INSERT' then
    v_subjects := array[(select auth.uid()), new.cliente_id, new.vendedor_id];
  else
    -- A client cleanup nulls cliente_id while leaving vendedor_id untouched;
    -- a seller cleanup does the inverse. Only lock/check an identity newly
    -- assigned by this UPDATE, plus the authenticated actor when present.
    v_subjects := array[
      (select auth.uid()),
      case when new.cliente_id is distinct from old.cliente_id then new.cliente_id end,
      case when new.vendedor_id is distinct from old.vendedor_id then new.vendedor_id end
    ];
  end if;

  for v_subject in
    select distinct s.subject_id
      from unnest(v_subjects) as s(subject_id)
     where s.subject_id is not null
     order by s.subject_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_subject::text, 17017));
    if private.account_deletion_forbids_subject(v_subject) then
      raise exception 'Conta em exclusao nao aceita novo alerta de fraude.'
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function private.reject_fraud_flag_for_deleting_account()
  from public, anon, authenticated, service_role;

create trigger fraude_flags_reject_deleting_account
before insert or update of cliente_id, vendedor_id on public.fraude_flags
for each row execute function private.reject_fraud_flag_for_deleting_account();

-- Reviews do not store a client UUID, so auth.uid() is the authoritative
-- reporting client while vendedor_id fences the reviewed seller. The service
-- role has no auth.uid(), allowing the deletion cleanup to set vendedor_id null.
create function private.reject_review_for_deleting_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid;
begin
  for v_subject in
    select distinct s.subject_id
      from unnest(array[(select auth.uid()), new.vendedor_id]) as s(subject_id)
     where s.subject_id is not null
     order by s.subject_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_subject::text, 17017));
    if private.account_deletion_forbids_subject(v_subject) then
      raise exception 'Conta em exclusao nao aceita nova avaliacao.'
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function private.reject_review_for_deleting_account()
  from public, anon, authenticated, service_role;

create trigger avaliacoes_reject_deleting_account
before insert or update of vendedor_id on public.avaliacoes
for each row execute function private.reject_review_for_deleting_account();

-- Blocker checks use EXISTS in Postgres, so a row beyond PostgREST's default
-- 1,000-row cap can never be silently missed.
create function public.get_account_deletion_blockers(
  p_subject uuid,
  p_role text,
  p_external_cleanup_confirmed boolean default false
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if p_subject is null or p_role not in ('cliente', 'ambulante') then
    raise exception 'invalid deletion subject or role';
  end if;

  select coalesce(jsonb_agg(b.blocker order by b.sort_order), '[]'::jsonb)
    into v_result
    from (
      select 10 sort_order, 'pedido_em_andamento' blocker
       where p_role = 'cliente' and exists (
         select 1 from public.pedidos p
          where p.cliente_id = p_subject
            and coalesce(p.status, '') not in ('entregue', 'cancelado', 'pagamento_recusado')
       )
      union all
      select 20, 'reembolso_em_andamento'
       where p_role = 'cliente' and exists (
         select 1 from public.pedidos p
          where p.cliente_id = p_subject
            and coalesce(p.reembolso_status, '') not in (
              '', 'nenhum', 'rejeitado', 'recusado', 'reembolsado', 'cancelado', 'concluido'
            )
       )
      union all
      select 30, 'ingresso_ou_reembolso_em_andamento'
       where p_role = 'cliente' and exists (
         select 1 from public.event_ticket_orders e
          where e.cliente_id = p_subject
            and coalesce(e.status, '') not in (
              'entregue', 'cancelado', 'pagamento_recusado', 'reembolsado', 'reembolso_negado'
            )
       )
      union all
      select 40, 'reembolso_de_ingresso_em_andamento'
       where p_role = 'cliente' and exists (
         select 1 from public.event_ticket_refunds r
          where r.requested_by = p_subject
            and coalesce(r.status, '') not in ('negado', 'reembolsado')
       )
      union all
      select 50, 'chamado_ou_disputa_em_andamento'
       where exists (
         select 1 from public.tickets t
          where t.usuario_id = p_subject
            and coalesce(t.status, 'aberto') in ('aberto', 'em_andamento')
       )
      union all
      select 100, 'saldo_financeiro_pendente'
       where p_role = 'ambulante' and exists (
         select 1 from public.wallets w
          where w.vendedor_id = p_subject
            and (coalesce(w.saldo_a_liberar, 0) <> 0 or coalesce(w.saldo_disponivel, 0) <> 0)
       )
      union all
      select 110, 'saque_em_andamento'
       where p_role = 'ambulante' and exists (
         select 1 from public.payouts p
          where p.vendedor_id = p_subject and p.status in ('solicitado', 'processando')
       )
      union all
      select 120, 'repasse_ou_lancamento_pendente'
       where p_role = 'ambulante' and exists (
         select 1 from public.financial_ledger f
          where f.vendedor_id = p_subject
            and f.status in ('pendente', 'em_espera', 'disponivel', 'solicitado', 'processando')
       )
      union all
      select 130, 'pedido_do_vendedor_em_andamento'
       where p_role = 'ambulante' and exists (
         select 1 from public.pedidos p
          where (p.vendedor_id = p_subject or p.ambulante_id = p_subject)
            and coalesce(p.status, '') not in ('entregue', 'cancelado', 'pagamento_recusado')
       )
      union all
      select 140, 'reembolso_do_vendedor_em_andamento'
       where p_role = 'ambulante' and exists (
         select 1 from public.pedidos p
          where (p.vendedor_id = p_subject or p.ambulante_id = p_subject)
            and coalesce(p.reembolso_status, '') not in (
              '', 'nenhum', 'rejeitado', 'recusado', 'reembolsado', 'cancelado', 'concluido'
            )
       )
      union all
      select 150, 'chargeback_ou_estorno_pendente'
       where p_role = 'ambulante' and exists (
         select 1 from public.pedidos p
          where (p.vendedor_id = p_subject or p.ambulante_id = p_subject)
            and p.payment_status in ('chargeback', 'estorno_pendente')
       )
      union all
      select 160, 'troca_bancaria_em_analise'
       where p_role = 'ambulante' and exists (
         select 1 from public.bank_account_change_requests b
          where b.vendedor_id = p_subject and b.status in ('pendente', 'em_analise')
       )
      union all
      select 165, 'operacao_de_recebedor_externo_pendente'
       where p_role = 'ambulante' and exists (
         select 1
           from public.recipient_provisioning_operations o
          where o.subject_id = p_subject
            and o.state in ('provisioning', 'cleanup_pending')
       )
      union all
      select 170, 'conta_externa_aguardando_encerramento'
       where p_role = 'ambulante'
         and not coalesce(p_external_cleanup_confirmed, false)
         and (
           exists (
             select 1 from public.seller_recipients s
              where s.vendedor_id = p_subject and nullif(s.recipient_id, '') is not null
           )
           or exists (
             select 1 from public.vendor_payment_accounts v
              where v.vendedor_id = p_subject and nullif(v.provider_account_id, '') is not null
           )
         )
      union all
      select 180, 'analise_antifraude_pendente'
       where p_role = 'ambulante' and exists (
         select 1 from public.fraude_flags f
          where f.vendedor_id = p_subject and f.status in ('aberta', 'em_analise')
       )
    ) b;

  return v_result;
end;
$$;

revoke all on function public.get_account_deletion_blockers(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.get_account_deletion_blockers(uuid, text, boolean)
  to service_role;

-- Payments remain as restricted accounting records, but this irreversible
-- marker ensures a late gateway callback cannot put personal gateway payloads
-- or PIX material back after the account scrub has completed.
alter table public.pagamentos
  add column personal_data_erased_at timestamptz,
  add column deletion_request_id uuid
    references public.account_deletion_requests(id) on delete restrict;

create index pagamentos_deletion_request_idx
  on public.pagamentos (deletion_request_id)
  where deletion_request_id is not null;

alter table public.payment_webhook_events
  add column payment_id uuid references public.pagamentos(id) on delete set null;

create index payment_webhook_events_payment_idx
  on public.payment_webhook_events (payment_id, created_at)
  where payment_id is not null;

-- Existing events stored the provider order id inside the already-minimized
-- payload. Backfill the real relation before cleanup starts using it.
update public.payment_webhook_events e
   set payment_id = (
     select p.id
       from public.pagamentos p
      where p.provider = e.provider
        and p.provider_order_id = e.payload ->> 'order_id'
      order by p.created_at desc, p.id desc
      limit 1
   )
 where e.payment_id is null
   and nullif(e.payload ->> 'order_id', '') is not null;

create function private.enforce_erased_payment_privacy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.personal_data_erased_at is not null then
    new.personal_data_erased_at := old.personal_data_erased_at;
    new.deletion_request_id := coalesce(old.deletion_request_id, new.deletion_request_id);
  end if;

  if new.personal_data_erased_at is not null then
    new.raw := '{}'::jsonb;
    new.status_detalhe := null;
    new.pix_qr_code := null;
    new.pix_qr_code_base64 := null;
    new.pix_qr_code_url := null;
    new.pix_expira_em := null;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_erased_payment_privacy() from public, anon, authenticated;

create trigger pagamentos_enforce_erased_privacy
before insert or update on public.pagamentos
for each row execute function private.enforce_erased_payment_privacy();

create function private.enforce_erased_webhook_privacy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id text := nullif(new.payload ->> 'order_id', '');
begin
  if tg_op = 'UPDATE'
     and old.payment_id is not null
     and exists (
       select 1 from public.pagamentos p
        where p.id = old.payment_id and p.personal_data_erased_at is not null
     ) then
    new.payment_id := old.payment_id;
    new.payload := '{}'::jsonb;
    return new;
  end if;

  if new.payment_id is null and v_order_id is not null then
    select p.id
      into new.payment_id
      from public.pagamentos p
     where p.provider = new.provider
       and p.provider_order_id = v_order_id
     order by p.created_at desc, p.id desc
     limit 1;
  end if;

  if (
    new.payment_id is not null
    and exists (
      select 1 from public.pagamentos p
       where p.id = new.payment_id and p.personal_data_erased_at is not null
    )
  ) or (
    v_order_id is not null
    and exists (
      select 1 from public.pagamentos p
       where p.provider = new.provider
         and p.provider_order_id = v_order_id
         and p.personal_data_erased_at is not null
    )
  ) then
    new.payload := '{}'::jsonb;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_erased_webhook_privacy() from public, anon, authenticated;

create trigger payment_webhook_events_enforce_erased_privacy
before insert or update on public.payment_webhook_events
for each row execute function private.enforce_erased_webhook_privacy();

-- Move the current privileged implementations behind guarded wrappers. This
-- avoids duplicating their business logic while ensuring a still-valid JWT
-- cannot mutate financial/security state after a deletion protocol opens.
alter function public.antecipar_saldo(uuid, text)
  rename to account_deletion_unchecked_antecipar_saldo;
alter function public.account_deletion_unchecked_antecipar_saldo(uuid, text)
  set schema private;
revoke all on function private.account_deletion_unchecked_antecipar_saldo(uuid, text)
  from public, anon, authenticated;

create function public.antecipar_saldo(
  p_vendedor uuid,
  p_grupo text default 'rapido'
)
returns table(liberado numeric, taxa numeric)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is distinct from p_vendedor
     or not public.account_can_write(p_vendedor) then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  return query
    select * from private.account_deletion_unchecked_antecipar_saldo(p_vendedor, p_grupo);
end;
$$;

revoke all on function public.antecipar_saldo(uuid, text) from public, anon;
grant execute on function public.antecipar_saldo(uuid, text) to authenticated, service_role;

alter function public.confirmar_entrega_pedido(uuid, text)
  rename to account_deletion_unchecked_confirmar_entrega_pedido;
alter function public.account_deletion_unchecked_confirmar_entrega_pedido(uuid, text)
  set schema private;
revoke all on function private.account_deletion_unchecked_confirmar_entrega_pedido(uuid, text)
  from public, anon, authenticated;

create function public.confirmar_entrega_pedido(p_pedido_id uuid, p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(private.has_permission('pedidos'), false)
     and not public.account_can_write() then
    raise exception 'Sem permissao para confirmar este pedido.' using errcode = '42501';
  end if;
  return private.account_deletion_unchecked_confirmar_entrega_pedido(p_pedido_id, p_codigo);
end;
$$;

revoke all on function public.confirmar_entrega_pedido(uuid, text) from public, anon;
grant execute on function public.confirmar_entrega_pedido(uuid, text) to authenticated, service_role;

alter function public.log_security_event(text, text, text, text, text, jsonb)
  rename to account_deletion_unchecked_log_security_event;
alter function public.account_deletion_unchecked_log_security_event(text, text, text, text, text, jsonb)
  set schema private;
revoke all on function private.account_deletion_unchecked_log_security_event(
  text, text, text, text, text, jsonb
) from public, anon, authenticated;

create function public.log_security_event(
  p_event_type text,
  p_platform text default 'unknown',
  p_email text default null,
  p_user_agent text default null,
  p_route text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid := (select auth.uid());
begin
  if v_subject is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_subject::text, 17017));
  end if;
  if coalesce((select auth.role()), '') <> 'service_role'
     and not coalesce(private.is_admin(), false)
     and not public.account_can_write(v_subject) then
    raise exception 'Sem permissao para registrar evento.' using errcode = '42501';
  end if;
  return private.account_deletion_unchecked_log_security_event(
    p_event_type, p_platform, p_email, p_user_agent, p_route, p_metadata
  );
end;
$$;

revoke all on function public.log_security_event(text, text, text, text, text, jsonb)
  from public, anon;
grant execute on function public.log_security_event(text, text, text, text, text, jsonb)
  to authenticated, service_role;

alter function public.solicitar_saque(uuid, numeric)
  rename to account_deletion_unchecked_solicitar_saque;
alter function public.account_deletion_unchecked_solicitar_saque(uuid, numeric)
  set schema private;
revoke all on function private.account_deletion_unchecked_solicitar_saque(uuid, numeric)
  from public, anon, authenticated;

create function public.solicitar_saque(p_vendedor uuid, p_valor numeric)
returns public.payouts
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Sem permissao para solicitar saque.' using errcode = '42501';
  end if;
  if p_vendedor is null then
    raise exception 'Vendedor obrigatorio.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_vendedor::text, 17017));

  if not exists (
    select 1 from public.profiles p
     where p.id = p_vendedor and coalesce(p.status, 'ativo') = 'ativo'
  ) or private.account_deletion_forbids_subject(p_vendedor) then
    raise exception 'Conta indisponivel para saque.' using errcode = '42501';
  end if;
  return private.account_deletion_unchecked_solicitar_saque(p_vendedor, p_valor);
end;
$$;

revoke all on function public.solicitar_saque(uuid, numeric) from public, anon, authenticated;
grant execute on function public.solicitar_saque(uuid, numeric) to service_role;

-- Serialize the opening/transition of a deletion protocol with ticket writes
-- for the same subject. This closes the race where an AI/service-role request
-- started before deletion and tried to persist PII after the protocol opened.
create function private.serialize_account_deletion_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid;
begin
  if tg_op = 'INSERT' then
    v_subject := coalesce(new.subject_id, new.user_id);
  else
    v_subject := coalesce(new.subject_id, old.subject_id, new.user_id, old.user_id);
  end if;
  if v_subject is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_subject::text, 17017));
  end if;
  return new;
end;
$$;

revoke all on function private.serialize_account_deletion_subject()
  from public, anon, authenticated, service_role;

create trigger account_deletion_serialize_subject
before insert or update of subject_id, user_id, status
on public.account_deletion_requests
for each row execute function private.serialize_account_deletion_subject();

-- Link any provider operation only after the request row exists. Doing this in
-- the BEFORE trigger would violate the immediate FK when a protocol is first
-- inserted; the advisory lock above remains held for this AFTER trigger.
create function private.link_recipient_provisioning_to_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid := coalesce(new.subject_id, new.user_id);
begin
  if v_subject is not null and new.status <> 'completed' then
    update public.recipient_provisioning_operations o
       set deletion_request_id = coalesce(o.deletion_request_id, new.id),
           state = case
             when o.recipient_id is not null then 'cleanup_pending'
             else o.state
           end,
           updated_at = now()
     where o.subject_id = v_subject
       and o.state in ('provisioning', 'cleanup_pending');
  end if;
  return new;
end;
$$;

revoke all on function private.link_recipient_provisioning_to_deletion()
  from public, anon, authenticated, service_role;

create trigger account_deletion_link_recipient_operation
after insert or update of subject_id, user_id, status
on public.account_deletion_requests
for each row execute function private.link_recipient_provisioning_to_deletion();

create function private.reject_ticket_for_deleting_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Administrative/internal tickets without a user subject remain valid.
  if new.usuario_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.usuario_id::text, 17017));
  if private.account_deletion_forbids_subject(new.usuario_id) then
    raise exception 'Conta com exclusao em andamento nao aceita novos chamados.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.reject_ticket_for_deleting_account()
  from public, anon, authenticated, service_role;

create trigger tickets_reject_deleting_account
before insert or update of usuario_id on public.tickets
for each row execute function private.reject_ticket_for_deleting_account();

create function private.reject_event_ticket_order_for_deleting_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Administrative imports without a client subject remain possible.
  if new.cliente_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.cliente_id::text, 17017));
  if private.account_deletion_forbids_subject(new.cliente_id) then
    raise exception 'Conta com exclusao em andamento nao aceita novas compras de ingresso.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.reject_event_ticket_order_for_deleting_account()
  from public, anon, authenticated, service_role;

create trigger event_ticket_orders_reject_deleting_account
before insert or update of cliente_id on public.event_ticket_orders
for each row execute function private.reject_event_ticket_order_for_deleting_account();

create function private.reject_payment_for_deleting_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid;
  v_deletion_request_id uuid;
begin
  if new.pedido_id is null and new.ticket_order_id is null then
    return new;
  end if;
  if new.pedido_id is not null and new.ticket_order_id is not null then
    raise exception 'Pagamento nao pode pertencer a dois pedidos.';
  end if;

  if new.pedido_id is not null then
    select o.cliente_id, o.deletion_request_id
      into v_subject, v_deletion_request_id
      from public.pedidos o
     where o.id = new.pedido_id;
  else
    select o.cliente_id, o.deletion_request_id
      into v_subject, v_deletion_request_id
      from public.event_ticket_orders o
     where o.id = new.ticket_order_id;
  end if;

  if v_deletion_request_id is not null then
    raise exception 'Pedido anonimizado nao aceita novos pagamentos.'
      using errcode = '42501';
  end if;

  if v_subject is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_subject::text, 17017));
    if private.account_deletion_forbids_subject(v_subject) then
      raise exception 'Conta com exclusao em andamento nao aceita novos pagamentos.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.reject_payment_for_deleting_account()
  from public, anon, authenticated, service_role;

create trigger pagamentos_reject_deleting_account
before insert or update of pedido_id, ticket_order_id on public.pagamentos
for each row execute function private.reject_payment_for_deleting_account();

create function private.reject_security_log_for_deleting_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid;
begin
  -- Lock in UUID order so a rare log with different user/actor subjects cannot
  -- deadlock another transaction doing the same checks in reverse order.
  for v_subject in
    select distinct s.subject_id
      from unnest(array[new.user_id, new.actor_id]) as s(subject_id)
     where s.subject_id is not null
     order by s.subject_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_subject::text, 17017));
    if private.account_deletion_forbids_subject(v_subject) then
      raise exception 'Conta com exclusao em andamento nao aceita novo log pessoal.'
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function private.reject_security_log_for_deleting_account()
  from public, anon, authenticated, service_role;

create trigger security_audit_logs_reject_deleting_account
before insert or update of user_id, actor_id on public.security_audit_logs
for each row execute function private.reject_security_log_for_deleting_account();

create function private.reject_seller_finance_for_deleting_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.vendedor_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.vendedor_id::text, 17017));
  if private.account_deletion_forbids_subject(new.vendedor_id) then
    raise exception 'Conta com exclusao em andamento nao aceita novo movimento financeiro.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.reject_seller_finance_for_deleting_account()
  from public, anon, authenticated, service_role;

create trigger payouts_reject_deleting_account
before insert or update of vendedor_id on public.payouts
for each row execute function private.reject_seller_finance_for_deleting_account();

create trigger financial_ledger_reject_deleting_account
before insert or update of vendedor_id on public.financial_ledger
for each row execute function private.reject_seller_finance_for_deleting_account();

create function private.reject_recipient_for_deleting_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.vendedor_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.vendedor_id::text, 17017));
  if private.account_deletion_forbids_subject(new.vendedor_id) then
    raise exception 'Conta com exclusao em andamento nao aceita novo recebedor.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.reject_recipient_for_deleting_account()
  from public, anon, authenticated, service_role;

create trigger seller_recipients_reject_deleting_account
before insert or update of vendedor_id on public.seller_recipients
for each row execute function private.reject_recipient_for_deleting_account();

comment on table public.account_deletion_tombstones is
  'Restricted SHA-256 fingerprints that fence late writes after a deletion protocol clears the raw Auth UUID.';
