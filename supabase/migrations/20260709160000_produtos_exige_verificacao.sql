-- Vendedor só cria produto se estiver verificado (verificado=true, aprovado pelo
-- admin). À prova de bypass (server-side). Admin sempre pode. Combinado com o
-- gate de UI nos apps e o filtro do catálogo do cliente (não verificado some do
-- mapa/lista).
alter policy produtos_insert_owner_or_admin on public.produtos
with check (
  private.is_admin() or (
    vendedor_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.verificado is true)
  )
);
