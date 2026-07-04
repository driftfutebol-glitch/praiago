grant select, insert on table public.pedidos to anon;
grant select, insert, update on table public.pedidos to authenticated;
grant select, insert, update, delete on table public.pedidos to service_role;

notify pgrst, 'reload schema';
