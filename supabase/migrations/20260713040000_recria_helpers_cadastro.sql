-- Recria os helpers de checagem de cadastro (o restaurante usa pro aviso de
-- "e-mail/CNPJ já cadastrado"). Retornam só boolean — não expõem dado.
-- Convivem com os índices únicos de profiles (email/cpf/cnpj), que fazem a
-- proteção dura no insert.
create or replace function public.email_ja_cadastrado(p_email text)
returns boolean language sql security definer set search_path = public as $$
  select exists(select 1 from public.profiles where lower(email) = lower(trim(p_email)));
$$;
create or replace function public.cnpj_ja_cadastrado(p_cnpj text)
returns boolean language sql security definer set search_path = public as $$
  select exists(select 1 from public.profiles where cnpj = regexp_replace(coalesce(p_cnpj,''), '\D', '', 'g') and coalesce(cnpj,'') <> '');
$$;
revoke all on function public.email_ja_cadastrado(text) from public;
revoke all on function public.cnpj_ja_cadastrado(text) from public;
grant execute on function public.email_ja_cadastrado(text) to anon, authenticated;
grant execute on function public.cnpj_ja_cadastrado(text) to anon, authenticated;
