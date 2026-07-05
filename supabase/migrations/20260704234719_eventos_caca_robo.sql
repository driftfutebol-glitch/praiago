-- Suporte ao robo de eventos: fonte original, resumo curto, dedupe,
-- aprovacao manual e eventos de madrugada.
alter table public.eventos
  add column if not exists fonte_url text,
  add column if not exists descricao_curta text;

create unique index if not exists eventos_fonte_url_uidx
on public.eventos (fonte_url)
where fonte_url is not null;

create unique index if not exists eventos_titulo_data_uidx
on public.eventos (lower(titulo), data)
where data is not null;

alter table public.eventos
  drop constraint if exists eventos_periodo_check;

alter table public.eventos
  add constraint eventos_periodo_check
  check (periodo in ('manha', 'tarde', 'noite', 'madrugada'));

alter table public.eventos
  drop constraint if exists eventos_status_check;

alter table public.eventos
  add constraint eventos_status_check
  check (status in ('pendente', 'ativo', 'inativo'));

drop policy if exists "eventos_select_active" on public.eventos;
drop policy if exists "eventos_select_active_or_admin" on public.eventos;

create policy "eventos_select_active_or_admin"
on public.eventos
for select
to anon, authenticated
using (status = 'ativo' or private.is_admin());

notify pgrst, 'reload schema';
