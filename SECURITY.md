# 🔒 Segurança do PraiaGo

Guia prático de segurança dos apps **cliente**, **ambulante** e **restaurante**
(o app entregador segue os mesmos princípios).

---

## 0. A verdade que muda tudo

Os apps PraiaGo são **client-side** (React/Vite + Capacitor). Isso significa:

> **Tudo que vai para o aparelho do usuário é público.**
> Código, chaves `VITE_*`, lógica de validação — qualquer um pode ler abrindo o
> DevTools ou descompilando o APK. **Não existe segredo no cliente.**

Por isso a pergunta "como proteger contra MOD APK / hacker / engenharia reversa?"
tem **uma resposta só**:

> **A segurança mora no servidor (Supabase), nunca no app.**
> O app é uma "tela burra". Quem decide o que pode ou não pode é o banco, via
> **RLS (Row Level Security)** + **Auth**. Se isso estiver certo, um APK modificado
> não consegue fazer nada que um usuário comum não pudesse — porque o servidor
> recusa.

O resto deste documento é como fazer isso.

---

## 1. Segredos e `.env`  ✅ (já configurado)

| Item | Status |
|---|---|
| `.env` no `.gitignore` dos 3 apps | ✅ feito |
| `.env.example` documentando só chaves públicas | ✅ feito |
| Keystore/`*.jks`/`key.properties` no `.gitignore` | ✅ feito |
| Nenhum segredo hardcoded no código | ✅ verificado |

**Regras:**
- A `VITE_SUPABASE_ANON_KEY` **é pública por design** — pode ir no app. Ela sozinha
  não dá acesso a nada além do que o RLS permite.
- A **`service_role` key** (e a senha do banco / connection string) **NUNCA** entram
  em nenhum app, `.env` de front, nem repositório. Elas vivem só em backend/Edge
  Functions/servidor que você controla.
- Se algum dia uma chave secreta for commitada por engano: **rotacione** (gere outra)
  no painel do Supabase. Apagar o commit não basta — já foi exposta.

### IA e APIs pagas

- Chaves de IA, Mercado Pago, banco e qualquer API paga ficam em **Supabase Edge
  Function Secrets**.
- O front chama Edge Functions autenticadas, por exemplo `ai-chat`; ele nunca envia
  `Authorization: Bearer <chave-do-provedor>` direto do app.
- Variáveis `VITE_*` são públicas. Use `VITE_*` apenas para URL do Supabase e anon
  key, que dependem de Auth/RLS para ficarem seguras.

---

## 2. Banco de dados único e seguro (multi-tenant com RLS)

Sim, dá para ter **um único banco** para os 4 apps com segurança total — é assim que
o iFood/Uber funcionam. O segredo é **RLS**: cada linha só é visível/editável por
quem tem direito. Exemplo de esquema mínimo:

```sql
-- Perfis (1 por usuário do Supabase Auth)
create table profiles (
  id    uuid primary key references auth.users(id) on delete cascade,
  nome  text not null,
  role  text not null check (role in ('cliente','ambulante','restaurante','entregador'))
);

create table vendedores (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null references profiles(id),   -- dono (ambulante/restaurante)
  nome      text not null,
  aberto    boolean default true
);

create table produtos (
  id          uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references vendedores(id) on delete cascade,
  nome        text not null,
  preco_cents int  not null check (preco_cents >= 0)   -- dinheiro em inteiro!
);

create table pedidos (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references profiles(id),
  vendedor_id   uuid not null references vendedores(id),
  entregador_id uuid references profiles(id),
  status        text not null default 'novo'
                check (status in ('novo','preparando','pronto','entregando','entregue','cancelado')),
  total_cents   int  not null default 0,
  created_at    timestamptz default now()
);
```

### Ativar RLS e as políticas

```sql
alter table profiles  enable row level security;
alter table vendedores enable row level security;
alter table produtos  enable row level security;
alter table pedidos   enable row level security;

-- Perfil: cada um lê/edita só o seu
create policy "perfil próprio" on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- Produtos: qualquer logado VÊ; só o dono do vendedor EDITA
create policy "produtos visíveis" on produtos
  for select using (true);
create policy "dono edita produtos" on produtos
  for all using (
    exists (select 1 from vendedores v
            where v.id = produtos.vendedor_id and v.owner_id = auth.uid())
  );

-- Pedidos: cliente vê os seus; dono do vendedor vê os do seu negócio;
--          entregador vê os atribuídos a ele
create policy "ver meus pedidos" on pedidos
  for select using (
    cliente_id = auth.uid()
    or entregador_id = auth.uid()
    or exists (select 1 from vendedores v
               where v.id = pedidos.vendedor_id and v.owner_id = auth.uid())
  );

-- Cliente cria pedido SÓ em nome próprio
create policy "cliente cria pedido" on pedidos
  for insert with check (cliente_id = auth.uid());

-- Atualizar status: só o dono do vendedor ou o entregador atribuído
create policy "atualizar pedido" on pedidos
  for update using (
    entregador_id = auth.uid()
    or exists (select 1 from vendedores v
               where v.id = pedidos.vendedor_id and v.owner_id = auth.uid())
  );
```

Com isso, **mesmo um APK modificado** que tente `select * from pedidos` só recebe os
pedidos que aquele usuário pode ver. Não há o que hackear no app.

### Preço à prova de adulteração (importante!)

Nunca confie no `total` enviado pelo cliente — senão um MOD APK paga R$ 0,01.
Calcule o total **no servidor**, a partir do `preco_cents` real dos produtos, via
função `SECURITY DEFINER`:

```sql
create or replace function criar_pedido(p_vendedor uuid, p_itens jsonb)
returns uuid language plpgsql security definer as $$
declare v_id uuid; v_total int;
begin
  -- soma preço REAL do banco, ignorando qualquer valor vindo do cliente
  select coalesce(sum(pr.preco_cents * (i->>'qtd')::int), 0) into v_total
  from jsonb_array_elements(p_itens) i
  join produtos pr on pr.id = (i->>'produto_id')::uuid
  where pr.vendedor_id = p_vendedor;

  insert into pedidos (cliente_id, vendedor_id, total_cents, status)
  values (auth.uid(), p_vendedor, v_total, 'novo')
  returning id into v_id;
  return v_id;
end $$;
```

O app chama `supabase.rpc('criar_pedido', {...})` — o preço é decidido pelo banco.

---

## 3. Injeção de SQL (SQLi)

- Usando o **SDK do Supabase** (`.from('pedidos').select()...`), as queries são
  **parametrizadas** automaticamente (PostgREST). **SQLi por aí é impossível** — não
  dá para "fechar aspas e injetar".
- O risco existe **só** se você escrever SQL cru concatenando string. Então:
  - Em funções/RPC, **nunca** monte SQL com `||` de input do usuário. Use parâmetros
    (`$1`) ou `format(..., %L)`.
  - Valide os tipos na entrada (uuid é uuid, int é int) — o `check` e os tipos das
    colunas já barram lixo.

---

## 4. Contra MOD APK / engenharia reversa

**Não é possível impedir** que alguém descompile/modifique o APK — é um arquivo no
aparelho dele. O que **resolve de verdade** é o servidor não confiar no app (seções
2 e 3). Camadas extras (apenas "lombadas", não muros):

- **Play Integrity API** (Google) — o backend verifica se a requisição veio de um app
  genuíno e não adulterado, e recusa as demais. É a defesa real contra MOD APK.
- **Ofuscação** (R8/ProGuard no build release) — dificulta ler o código. Ative
  `minifyEnabled true` no `android/app/build.gradle`.
- **Certificate pinning** — impede interceptar o tráfego (man-in-the-middle).
- **Assine o APK** com keystore própria e **guarde a keystore fora do repo**
  (já está no `.gitignore`). Habilite **Play App Signing**.
- Nunca embuta lógica de negócio sensível (preço, permissão, cupom) só no app.

---

## 5. Autenticação

- Troque o placeholder atual (`lib/auth.ts` com `localStorage`) por **Supabase Auth**
  (e-mail/senha, magic link, ou OAuth). O Supabase guarda o token com segurança e
  renova sozinho.
- O `role` do usuário fica na tabela `profiles` (não no app) — o RLS usa `auth.uid()`,
  que **não é falsificável** pelo cliente (vem do JWT assinado pelo Supabase).
- Sessão expira; force re-login. Não guarde senha em lugar nenhum do front.

---

## 6. Validação de entrada  ✅ (1ª camada feita)

- No front já sanitizamos o que chega via realtime (`lib/validation.ts`): tipos,
  faixas (lat/lng, total), tamanho e remoção de `<>`/caracteres de controle.
- **Isso é só a 1ª camada.** Repita a validação **no servidor** (constraints `check`,
  tipos, RLS, RPC) — porque o front pode ser ignorado por um cliente malicioso.
- XSS: o React **escapa** tudo que renderiza e o projeto **não usa**
  `dangerouslySetInnerHTML`/`eval` → risco baixo. Mantenha assim.

---

## 7. Cabeçalhos e CSP  ✅ (CSP feito)

- **CSP** adicionada nos 3 `index.html` — bloqueia scripts/origens não previstos.
- No deploy **web** (restaurante), configure também no servidor/host:
  - `Strict-Transport-Security` (HTTPS obrigatório)
  - `X-Frame-Options: DENY` / `frame-ancestors 'none'` (anti-clickjacking — só via
    header HTTP, o `<meta>` é ignorado pelo navegador para esta diretiva)
  - `X-Content-Type-Options: nosniff`
- Sirva tudo por **HTTPS**.

---

## 8. Abuso / rate limiting

- Ative rate limiting de Auth no painel do Supabase (tentativas de login).
- Para endpoints sensíveis, use **Edge Functions** com limitação por IP/usuário.
- Monitore: o Supabase tem logs e alertas. Ative MFA na sua conta do Supabase.

---

## ✅ Checklist antes de ir para produção

- [ ] Projeto Supabase criado; `.env` preenchido (anon key) — `service_role` **fora** do app
- [ ] **RLS habilitado** em todas as tabelas + políticas testadas
- [ ] Total/preço calculado no servidor (RPC `SECURITY DEFINER`)
- [ ] Supabase Auth no lugar do placeholder localStorage
- [ ] Keystore Android guardada com segurança (não no git) + Play App Signing
- [ ] `minifyEnabled true` (ofuscação) no build release
- [ ] Play Integrity API no backend (anti-MOD-APK)
- [ ] HTTPS + headers de segurança no deploy web
- [ ] Validação repetida no servidor (não confiar no front)
- [ ] Segredos rotacionados se algum dia vazaram

---

### Resumo em uma frase
**O app pode ser hackeado/modificado à vontade — e tudo bem, desde que o Supabase
(RLS + Auth + cálculo de preço no servidor) seja a fonte da verdade.** É aí que mora
a segurança, não no APK.
