-- `autor = 'sistema'` nas mensagens de chamado.
--
-- Ate agora so existiam duas vozes numa conversa de atendimento: 'admin' e
-- 'usuario'. O chamado de verificacao tem uma terceira — o proprio sistema,
-- que escreve a abertura ("estamos preparando o seu link") e o encerramento
-- ("conta liberada, pode sacar"). Nenhuma das duas e de gente.
--
-- Poderia ter usado 'admin' e fingir que um humano escreveu. Nao vale: o app
-- pinta a mensagem do atendimento de um jeito e a do sistema de outro, e o
-- vendedor precisa distinguir "alguem olhou o meu caso" de "isto e
-- automatico". Fingir tambem estragaria o gatilho de aviso, que dispara em
-- mensagem de 'admin' — o encerramento viraria um "seu link chegou" falso.
--
-- Encontrado testando com a conta real, logo depois do irmao deste arquivo
-- (tickets_origem_check). As duas restricoes moram no schema de base, que nao
-- esta nas migrations locais: por isso nao apareceram ao ler o codigo.

begin;

alter table public.ticket_mensagens drop constraint if exists ticket_mensagens_autor_check;

alter table public.ticket_mensagens
  add constraint ticket_mensagens_autor_check
  check (autor = any (array['admin'::text, 'usuario'::text, 'sistema'::text]));

commit;
