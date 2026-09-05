-- Testadores separados dos usuarios reais, e origem do cadastro registrada.
--
-- Duas queixas viraram esta migration:
--
-- 1) A tela de Usuarios estava impossivel de ler: conta de revisao da Apple,
--    conta de teste interno e cliente de verdade na mesma lista, sem nada que
--    dissesse qual e qual alem de um `conta_demo` booleano sem contexto.
--    Agora `tester_tipo` diz POR QUE aquela conta existe, e o admin tem uma
--    pagina so para elas.
--
-- 2) Nao havia como responder "quantos entraram esta semana, de iPhone ou de
--    Android, no Cliente ou no Ambulante". A unica coisa que o cadastro
--    gravava era o IP e um `is_mobile` que fala da OPERADORA, nao do aparelho:
--    Wi-Fi de casa no iPhone gravava is_mobile = false.
--
-- JA APLICADA EM PRODUCAO em 05/09/2026 via `supabase db query --linked`.
-- Este arquivo existe como registro. NAO rodar `supabase db push` neste
-- projeto: o historico local diverge do remoto em dezenas de migrations.

alter table public.signup_ips
  add column if not exists user_agent text,
  add column if not exists plataforma text,  -- ios | android | web
  add column if not exists app text,         -- cliente | ambulante | restaurante
  add column if not exists modelo text;      -- ex.: "iPhone", "SM-A536E"

-- O `role` do cadastro ja identifica o app de origem nas linhas antigas.
update public.signup_ips
   set app = role
 where app is null and role in ('cliente','ambulante','restaurante','entregador');

alter table public.profiles
  add column if not exists tester_tipo text,    -- revisao | interno | beta
  add column if not exists tester_motivo text,
  add column if not exists tester_desde timestamptz;

-- Quem ja estava marcado como conta_demo era, na pratica, conta de revisao
-- das lojas — foi para isso que a marca nasceu.
update public.profiles
   set tester_tipo = coalesce(tester_tipo, 'revisao'),
       tester_desde = coalesce(tester_desde, created_at)
 where conta_demo = true;

create index if not exists signup_ips_created_at_idx on public.signup_ips (created_at desc);
