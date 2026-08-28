-- CPF aprovado fica vinculado definitivamente a conta. Usuarios comuns nao
-- podem substituir nem apagar o documento depois da primeira confirmacao.
create or replace function public.protect_profile_verification_flags()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'service_role')
     and not private.is_admin() then
    if old.cpf_check_status = 'aprovado'
       and new.cpf is distinct from old.cpf then
      raise exception 'CPF confirmado nao pode ser alterado.'
        using errcode = '23514';
    end if;

    if new.email_verificado is distinct from old.email_verificado then
      new.email_verificado := old.email_verificado;
    end if;

    if new.cpf is not distinct from old.cpf then
      new.cpf_check_status := old.cpf_check_status;
      new.cpf_confirmado_em := old.cpf_confirmado_em;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_profile_verification_flags()
from public, anon, authenticated;

comment on function public.protect_profile_verification_flags() is
  'Protege confirmacao de e-mail e torna o CPF aprovado imutavel para usuarios comuns.';
