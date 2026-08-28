-- Horário de funcionamento gerenciado pelo próprio restaurante/ambulante.
-- Formato HH:MM (ex: 08:00 / 22:30). null = sem horário definido (sempre "aberto"
-- pra restaurante; ambulante continua dependendo do toggle online).
alter table public.profiles add column if not exists horario_abre text;
alter table public.profiles add column if not exists horario_fecha text;
