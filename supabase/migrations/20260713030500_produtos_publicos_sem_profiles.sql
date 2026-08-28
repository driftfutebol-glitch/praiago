-- Public product listing cannot depend on direct anon access to profiles.
-- Use the sanitized vendor cache instead.

drop policy if exists produtos_select_active_owner_or_admin on public.produtos;
create policy produtos_select_active_owner_or_admin on public.produtos
for select to anon, authenticated
using (
  private.is_admin()
  or vendedor_id = (select auth.uid())
  or (
    ativo is true
    and exists (
      select 1
      from public.vendedores_publicos vp
      where vp.id = produtos.vendedor_id
        and vp.verificado is true
        and coalesce(vp.status, 'ativo') = 'ativo'
    )
  )
);

-- Avoid exposing the audit RPC to anonymous traffic. Login/signup flows tolerate
-- audit failures before authentication; sensitive logs remain server/admin-only.
revoke execute on function public.log_security_event(text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.log_security_event(text, text, text, text, text, jsonb) to authenticated, service_role;
