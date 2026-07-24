-- Corrige gate de KYC: profile.verificado e a fonte que libera ambulante/restaurante.
-- Tambem permite aprovacao manual sem documento completo via override admin auditavel.

create or replace function public.aprovar_verificacao(
  p_verificacao_id uuid,
  p_override boolean default false,
  p_override_reason text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

revoke all on function public.aprovar_verificacao(uuid, boolean, text) from public, anon;
grant execute on function public.aprovar_verificacao(uuid, boolean, text) to authenticated;

-- Reconcilia usuarios ja aprovados que continuaram presos no app por profile.verificado=false.
update public.profiles p
   set verificado = true
 where coalesce(p.status, 'ativo') <> 'banido'
   and exists (
     select 1
       from public.verificacoes v
      where coalesce(v.user_id, v.restaurante_id) = p.id
        and v.status = 'aprovado'
   );
