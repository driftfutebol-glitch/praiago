-- Avaliação do atendimento (nota + comentário) pelo usuário, visível pro admin.
alter table public.tickets add column if not exists avaliacao_nota integer;
alter table public.tickets add column if not exists avaliacao_comentario text;
alter table public.tickets add column if not exists avaliado_em timestamptz;

alter table public.tickets
  drop constraint if exists tickets_avaliacao_nota_check;
alter table public.tickets
  add constraint tickets_avaliacao_nota_check
  check (avaliacao_nota is null or (avaliacao_nota between 1 and 5)) not valid;
