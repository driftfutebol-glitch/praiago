# 🏖️ PraiaGo — Roteiro Completo do Projeto (handoff)

> Documento de continuidade. Lê isto primeiro ao abrir uma nova janela/sessão.
> Atualizado em: Jun/2026.

---

## 1. O que é o PraiaGo
Plataforma que conecta **ambulantes** e **restaurantes** a **clientes** na praia (Praia Grande, SP) via GPS em tempo real. É **só intermediação** (não vende/entrega; pagamento vai direto ao vendedor via AbacatePay/Pix).

## 2. Estrutura (pasta `C:\Users\User\Desktop\trabalho\`)
| App | Pasta | Porta dev | Tema | Papel |
|---|---|---|---|---|
| 🛍️ Cliente | `praiago-cliente` | 5175 | **claro (em conversão)** | faz pedidos, vê ambulantes/eventos |
| 🥥 Ambulante | `praiago-ambulante` | 5174 | claro | vende na praia, radar de zonas |
| 🍽️ Restaurante | `praiago-restaurante` | 5176 | **escuro (a converter p/ claro)** | painel de pedidos, mapa tático |
| 🏢 Admin | `praiago-admin` | 5173/5177 | **escuro (MANTÉM escuro)** | KYC, tickets, pedidos, usuários, eventos |
| 🤖 IA | `praiago-ia` | — | — | (apoio IA) |
| 🛵 Entregador | `praiago-entregador` | 5177 | — | **NÃO MEXER (fora do escopo)** |

**Stack:** React 19 + Vite + TypeScript + Tailwind v4 + Zustand + React-Leaflet + framer-motion + Capacitor + **Supabase**.

## 3. Supabase (banco) — conectado via MCP
- **Project ref:** `kfxpzjqktbcsxlqapkyv` · URL `https://kfxpzjqktbcsxlqapkyv.supabase.co`
- **Acesso direto do Claude:** arquivo **`.mcp.json`** na raiz (server "supabase" + Personal Access Token). Está no `.gitignore`. Se o MCP não conectar numa nova sessão, conferir o token.
- **Setup SQL:** `praiago-fase5-setup.sql` (idempotente — pode rodar de novo).

### Tabelas (todas com RLS habilitado)
- `profiles` (id=auth.uid, nome, email, role, verificado, email_verificado, telefone)
- `verificacoes` (KYC: rg/selfie/cnpj/cnh, status pendente/aprovado/rejeitado)
- `entregadores` (do restaurante)
- `pedidos` (id, **cliente_nome, zona, itens[], total, status, pagamento**, restaurante_id, ambulante_id, created_at)
- `produtos` (vazia — cardápio ainda vem do `catalogo.ts`)
- `tickets` (id, plataforma, **usuario_nome, usuario_email, assunto, mensagem, status, prioridade, resposta, updated_at**, created_at)
- `eventos` (id, titulo, **periodo[manha/tarde/noite]**, data, hora, local_nome, endereco, lat, lng, **preco**, categoria, emoji, destaque, status, fonte)

### Triggers
- `handle_new_user` → cria `profiles` automaticamente no cadastro (corrige "cadastro não entra").
- `handle_user_confirmed` → marca email_verificado quando confirma e-mail.

### Realtime ligado em: profiles, verificacoes, entregadores, tickets, eventos, pedidos.

## 4. Autenticação
- **Supabase Auth** (`supabase.auth.signUp/signInWithPassword`) no cliente/ambulante/restaurante.
- Após cadastro: **auto-login** se a confirmação de e-mail estiver desligada.
- ⚠️ **AÇÃO NO PAINEL:** Authentication → Providers → Email → **desligar "Confirm email"** (senão dá **erro 429** "limite excedido" e o cadastro não entra). Opcional: aumentar Rate Limits.
- Admin: login é **placeholder** (estado `isAdmin`, NÃO usa Supabase Auth ainda).

## 5. Fluxos conectados (tudo real, sem dados fictícios)
- **Pedido:** cliente monta carrinho → checkout (reta/barraca + pagamento pix/cartão/dinheiro) → `criarPedido` **insere na tabela `pedidos`** → aparece no **admin** (Pedidos Globais, realtime) e no **restaurante** (store useOrders). *Tabela vazia hoje porque nenhum pedido real foi concluído ainda.*
- **Suporte (chatbot → admin):** `AiChatbot.tsx` (cliente/ambulante/restaurante) → "Falar com Suporte" → **insere em `tickets`** → **admin → Atendimento → "Todas (Global)"** (com **badge de tickets abertos em tempo real** na sidebar). Já há 3 tickets reais no banco.
- **Cadastro:** signup → trigger cria `profiles` → admin → Usuários / Verificações.
- **Eventos:** admin → **Conteúdo → Eventos** (criar/editar/destacar/excluir) → aparece no **cliente → aba Eventos** (filtros manhã/tarde/noite, preço, "Ver local" no Google Maps, compartilhar). Realtime. Pronto p/ um **agente de automação** inserir eventos (campo `fonte`).

## 6. GPS, rotas e zonas
- `useGPS` (cliente + ambulante) **reescrito** com `navigator.geolocation` (fix rápido + watch, tolerante a timeout/permissão, posição sempre válida). Ambulante publica payload enriquecido (id/nome/emoji/zona) → aparece no **Radar do cliente**.
- `useRoute` = OSRM (rota de rua real) com debounce curto + cancelamento.
- Restaurante MapaPage: marcador do restaurante usa **GPS real do dispositivo** (sem ponto fantasma).
- **Zonas** (`lib/praiagoZones.ts`, sincronizado nos 3 apps): heatmap fictício **zerado** (`getMockHeatData()` retorna `[]`). Os polígonos das zonas estavam **desalinhados** (costa é diagonal, fiz retângulos retos) → **escondidos no mapa do restaurante** (`camadas.zonas/heatmap = false`). **PENDENTE:** refazer os polígonos seguindo a diagonal real da costa, OU manter escondidos até ter dados reais.

## 7. Segurança (estado e pendências)
**Feito:** `.gitignore` ignora `.env*`, `.mcp.json`, scripts `*.mjs`/`*.cjs` (que tinham chaves), `.agents/`. CSP nos index.html. Validação de payloads de realtime. Removida chave de IA hardcoded dos chatbots. Revogado `execute` da função perigosa `rls_auto_enable`. `SECURITY.md` com blueprint.

**⚠️ PENDÊNCIAS CRÍTICAS:**
1. **ROTACIONAR 2 CHAVES VAZADAS** (apareceram em texto puro nos scripts): o **Personal Access Token `sbp_...`** (Account → Tokens) e a **Secret Key `sb_secret_...`** (Project Settings → API Keys). Trocar e atualizar o `.mcp.json` com o novo PAT.
2. **RLS está ABERTO** (`USING(true)`) em todas as tabelas — o linter de segurança acusa. NÃO dá pra travar enquanto o **admin usar a chave anon sem login Supabase**. Próximo passo grande: **login real do admin no Supabase + políticas por `role`**.
3. **Leaked Password Protection** desligado → ligar em Auth (1 toggle).

## 8. Git / PR
- Remote: `github.com/driftfutebol-glitch/praiago` · `gh` logado como `driftfutebol-glitch`.
- Branch de trabalho: **`feat/supabase-auth-mapas-seguranca`** · **PR #1**: https://github.com/driftfutebol-glitch/praiago/pull/1
- Último commit: `aa0e347`. **Há mudanças locais não commitadas** (tema claro do cliente, esconder zonas) — subir pro PR com `git add ... && git commit && git push` (conferir que **nenhum segredo** entre: `git diff --cached | grep -E "sb_secret_|sbp_"` deve dar 0).

## 9. Como rodar
Em cada app: `npm install` (1ª vez) → `npm run dev`. Portas fixas (cliente 5175, ambulante 5174, restaurante 5176; admin pega 5173 ou 5177).
Para liberar portas no Windows: `Get-NetTCPConnection -LocalPort 5173,5174,5175,5176,5177 -State Listen | %{ Stop-Process -Id $_.OwningProcess -Force }`.

## 10. TODO / próximos passos (em ordem sugerida)
1. **Terminar tema claro do RESTAURANTE** (cliente já está quase; admin fica escuro de propósito). Converter páginas/`index.css` do restaurante dark→light.
2. **Refinar/remover zonas** do mapa (polígonos na diagonal da costa real).
3. **Login real do admin (Supabase Auth) + travar RLS por role** (a maior pendência de segurança).
4. **Rotacionar as 2 chaves** e desligar "Confirm email".
5. **Agente de automação de eventos** (Edge Function que insere em `eventos`).
6. **Cardápio real:** mover produtos do `catalogo.ts` para a tabela `produtos` (cadastro pelo vendedor).
7. **Cliente GPS "não dá tela"** — investigar (permissão / Leaflet) — usuário ia testar.

## 11. Notas importantes
- Se aparecer **dado fictício** (pedido/zona antiga), é **cache do navegador** (Zustand `persist` no localStorage) → aba anônima ou limpar dados do site.
- O app do **entregador NÃO deve ser alterado**.
- O **admin permanece escuro** (cyber/glassmorphism) — só os apps de usuário ficam claros.
