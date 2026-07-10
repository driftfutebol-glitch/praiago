-- Fix: aprovar/rejeitar verificação (RPC) precisa refletir em profiles.verificado,
-- que é o que o app usa pra liberar criar produto e aparecer no mapa. As RPCs
-- só mexiam na tabela verificacoes. Agora: aprovar → verificado=true, rejeitar →
-- verificado=false.

create or replace function public.aprovar_verificacao(p_verificacao_id uuid, p_override boolean default false, p_override_reason text default null::text)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_actor uuid := auth.uid(); v public.verificacoes%rowtype;
begin
  if v_actor is null or not private.is_admin() then
    raise exception 'Apenas administradores podem aprovar KYC.' using errcode = '42501';
  end if;
  select * into v from public.verificacoes where id = p_verificacao_id for update;
  if not found then raise exception 'Verificacao nao encontrada.' using errcode = 'P0002'; end if;
  update public.verificacoes
     set documento_check_status = case when nullif(coalesce(rg_frente_url, cnh_url, ''), '') is not null then 'aprovado' else documento_check_status end,
         face_check_status = case when nullif(coalesce(selfie_url, ''), '') is not null then 'aprovado' else face_check_status end,
         local_check_status = case
           when tipo = 'entregador' then 'dispensado'
           when tipo = 'restaurante' and nullif(coalesce(foto_loja_url, ''), '') is not null then 'aprovado'
           when tipo = 'ambulante' and nullif(coalesce(praia_principal, ''), '') is not null then 'aprovado'
           else local_check_status end,
         kyc_override = p_override,
         kyc_override_reason = case when p_override then nullif(trim(coalesce(p_override_reason, '')), '') else null end,
         kyc_override_by = case when p_override then v_actor else null end,
         kyc_override_at = case when p_override then now() else null end,
         status = 'aprovado', motivo_rejeicao = null
   where id = p_verificacao_id returning * into v;
  update public.profiles set verificado = true where id = coalesce(v.user_id, v.restaurante_id);
  return jsonb_build_object('ok', true, 'verificacao_id', v.id, 'user_id', coalesce(v.user_id, v.restaurante_id), 'override', v.kyc_override, 'status', v.status);
end; $function$;

create or replace function public.rejeitar_verificacao(p_verificacao_id uuid, p_motivo text)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_actor uuid := auth.uid(); v public.verificacoes%rowtype;
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
   where id = p_verificacao_id returning * into v;
  if not found then raise exception 'Verificacao nao encontrada.' using errcode = 'P0002'; end if;
  update public.profiles set verificado = false where id = coalesce(v.user_id, v.restaurante_id);
  return jsonb_build_object('ok', true, 'verificacao_id', v.id, 'status', v.status);
end; $function$;
