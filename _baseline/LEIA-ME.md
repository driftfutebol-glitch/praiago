# Retrato do banco de producao

Capturado em 25/08/2026 com `supabase db dump --linked`.

## Por que este diretorio existe

O historico de migrations deste projeto ficou divergente: 71 alteracoes
foram feitas direto pelo SQL editor do painel e nunca viraram arquivo
aqui. Elas nao voltam — o conteudo original se perdeu.

Isso significa que **as migrations deste repositorio nao reconstroem o
banco de producao**. Se precisar recriar o banco do zero, parta destes
arquivos, nao da pasta `supabase/migrations`.

## Arquivos

- `producao-schema.sql` — schema `public` e `private`: 45 tabelas,
  80 funcoes, 97 politicas.
- `storage-schema.sql` — schema `storage`: buckets e as 11 politicas.

Somente estrutura. Nenhum `INSERT`, nenhum dado de cliente.

## Como montar uma replica para testar migrations

Ordem importa:

1. Container `public.ecr.aws/supabase/postgres:17.6.1.127`.
2. Criar `auth.jwt()` como usuario **supabase_admin** (o `postgres` nao
   tem permissao no schema `auth`, e o dump nao traz essa funcao).
3. Carregar `producao-schema.sql` **duas vezes** — a primeira dispara
   restart do Postgres por causa das extensoes.
4. Carregar `storage-schema.sql` **depois**, porque as politicas dele
   referenciam `public.profiles`, `public.verificacoes` e o schema
   `private`.

Foi assim que as migrations de 24 e 25/08 foram testadas antes de irem
para producao.
