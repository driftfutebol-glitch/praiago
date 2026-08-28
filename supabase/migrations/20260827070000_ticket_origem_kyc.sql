-- `origem = 'kyc'` para o chamado de verificacao da conta.
--
-- A restricao original so conhecia 'humano' e 'ia', que eram as duas maneiras
-- de um chamado nascer ate agora: alguem escreveu, ou o assistente abriu. O
-- chamado de verificacao e um terceiro caso — nasce de um botao, sem texto de
-- ninguem — e a tela do admin usa a origem para saber que ali ele precisa
-- gerar um link na Pagar.me em vez de responder uma duvida.
--
-- Pego em teste com a conta de verdade: o painel local nao tinha a restricao,
-- entao o fluxo passou local e quebrou no primeiro toque em producao. Ficou a
-- licao de que esqueleto de teste permissivo demais nao prova nada.

begin;

alter table public.tickets drop constraint if exists tickets_origem_check;

alter table public.tickets
  add constraint tickets_origem_check
  check (origem = any (array['humano'::text, 'ia'::text, 'kyc'::text]));

commit;
