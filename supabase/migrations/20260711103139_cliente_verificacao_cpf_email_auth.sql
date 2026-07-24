-- Cliente: CPF vem do cadastro e e-mail confirmado vem somente do Supabase Auth/SMTP.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nome, email, role, cpf, email_verificado)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email,
    'cliente',
    nullif(private.only_digits(new.raw_user_meta_data->>'cpf'), ''),
    (new.email_confirmed_at is not null)
  )
  on conflict (id) do update
  set nome = coalesce(public.profiles.nome, excluded.nome),
      email = excluded.email,
      cpf = coalesce(public.profiles.cpf, excluded.cpf),
      email_verificado = excluded.email_verificado or public.profiles.email_verificado;

  return new;
end;
$$;

create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set email = new.email,
         email_verificado = (new.email_confirmed_at is not null)
   where id = new.id;

  return new;
end;
$$;

create or replace function public.protect_profile_verification_flags()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'service_role')
     and not private.is_admin() then
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

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_user_confirmed() from public, anon, authenticated;
revoke all on function public.protect_profile_verification_flags() from public, anon, authenticated;

drop trigger if exists trg_protect_profile_verification_flags on public.profiles;
create trigger trg_protect_profile_verification_flags
before update
on public.profiles
for each row
execute function public.protect_profile_verification_flags();

update public.profiles p
set email_verificado = (u.email_confirmed_at is not null),
    email = u.email,
    cpf = coalesce(p.cpf, nullif(private.only_digits(u.raw_user_meta_data->>'cpf'), ''))
from auth.users u
where u.id = p.id;
