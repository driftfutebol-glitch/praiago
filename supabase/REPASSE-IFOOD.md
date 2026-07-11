# Repasse estilo iFood — PraiaGo

Sistema de **carteira do vendedor + retenção + saque via Pix**, com comissão da plataforma
por pedido. Adaptado à stack real do PraiaGo (não é o NestJS do spec genérico).

## Stack (confirmada)

| Camada | Spec genérico | PraiaGo (real) |
|---|---|---|
| Backend | Node/NestJS | **Supabase** (Postgres + Edge Functions Deno) |
| DB | Postgres | **Postgres (Supabase)** |
| Front | React | **React + Vite + Zustand** (cliente/ambulante/restaurante/admin) |
| `PaymentProvider` | interface TS | **`supabase/functions/_shared/mercadopago.ts`** (toda chamada ao MP passa por aqui) |

> **Regra de ouro:** nenhum outro arquivo fala com o SDK/HTTP do Mercado Pago direto —
> tudo passa por `_shared/mercadopago.ts`. Trocar pra Asaas/Iugu/Zoop = reimplementar
> só esse módulo (métodos: `authorizeSeller`, `createPayment`, `refund`, `payoutPix`,
> `getPaymentStatus`).

## Modelo de dados (livro-razão como fonte de verdade)

```
profiles (vendedor)
  └─ comissao_percent        → comissão da plataforma POR vendedor (null = usa a global)

payment_settings (linha única)
  ├─ platform_fee_percent    → comissão GLOBAL (fallback)
  └─ repasse_dias            → D+N configurável (default 7)

mercadopago_vendor_accounts  → credenciais OAuth do vendedor (access/refresh token)
vendor_payment_accounts      → chave Pix + dados bancários p/ saque

financial_ledger  (JÁ EXISTIA — livro-razão)
  tipo:   repasse_vendedor | taxa_plataforma | comissao_devida | saque | estorno
  status: pendente | em_espera | disponivel | pago | cancelado
  disponivel_em: data de liberação (pagamento/entrega + repasse_dias)

wallets  (NOVO — cache reconciliável, 1 por vendedor)
  ├─ saldo_a_liberar    = Σ repasse_vendedor (pendente + em_espera)   ← retido, NÃO sacável
  └─ saldo_disponivel   = Σ repasse_vendedor (disponivel) − saques    ← sacável por Pix

payouts  (NOVO — saques via Pix)
  valor, chave_pix, status (solicitado→processando→pago/falhou), mp_transfer_id, ledger_entry_id
```

**Nunca mover saldo sem uma entrada no ledger.** `saldo_a_liberar`/`saldo_disponivel` são
sempre recomputáveis pela função `reconciliar_carteira(vendedor)`.

## Fluxo do dinheiro (por pedido)

1. **Checkout** → cria pagamento no MP. A comissão da plataforma sai via `application_fee`
   (split automático) quando o vendedor tem MP vinculado.
2. **Webhook `payment.approved`** → cria/atualiza no ledger:
   - `taxa_plataforma` → **pago** na hora (nossa comissão).
   - `repasse_vendedor` → **pendente** (aguarda **confirmação de entrega** — melhor que só D+7).
3. **Entrega confirmada** (código do cliente) → `repasse_vendedor` vira **em_espera**,
   `disponivel_em = agora + repasse_dias` (D+7). Entra em `saldo_a_liberar`.
4. **Job diário (D+7)** → `em_espera` com `disponivel_em <= hoje` vira **disponivel**;
   move de `saldo_a_liberar` → `saldo_disponivel`.
5. **Saque** → vendedor pede Pix ≤ `saldo_disponivel`; `payoutPix` transfere; cria
   `payout` + ledger `saque`.
6. **Estorno** → antes de liberar: marca `cancelado`. Depois: entra `estorno` negativo.

## ⚠️ COMPLIANCE — custódia de dinheiro de terceiros (Banco Central)

O ponto sensível está no **modo de recebimento do vendedor**:

| Situação | Onde o dinheiro cai | Custódia? | D+7 é nosso? |
|---|---|---|---|
| Vendedor **com** MP vinculado (`settlement=pago_split`) | **direto na conta MP do vendedor**, menos a comissão | ❌ não | ❌ MP decide a liberação |
| Vendedor **sem** MP (`settlement=repasse_manual_pendente`) | **na conta da plataforma**, repassamos depois | ⚠️ **SIM** | ✅ nós controlamos |

> 🚨 **O modo "repasse manual" faz a plataforma segurar dinheiro de terceiros** — isso pode
> nos enquadrar como **instituição de pagamento** regulada pelo BACEN. Está sinalizado no
> código (`mercadopago-pix`/`mercadopago-card` no fallback, e no webhook em
> `repasse_manual_pendente`).

**Caminho mais seguro (recomendado p/ D+7 real):** provedor com **subconta + liberação
configurável por API** (Asaas/Iugu/Zoop). Como tudo passa por `PaymentProvider`, dá pra
trocar sem reescrever ledger/carteira/cron. Decisão comercial/jurídica do time.

## Status de implementação

| Fase | Item | Estado |
|---|---|---|
| 0 | Stack + `PaymentProvider` (`_shared/mercadopago.ts`) | ✅ existe |
| 1 | OAuth vendedor (`mercadopago-oauth-start/callback`) | ✅ existe |
| 1 | Renovação de token (refresh) | ✅ existe (`getSellerAccessToken`) |
| 2 | Ledger + settings + credenciais | ✅ existe |
| 2 | **wallets + payouts + comissao_percent + reconciliar** | ✅ **criado agora** |
| 3 | Checkout + split (PIX/cartão no app) | ✅ existe |
| 3 | Webhook cria ledger com comissão **por vendedor** | 🔜 ajustar |
| 4 | Job diário D+7 (`em_espera`→`disponivel`) | 🔜 falta |
| 5 | Saque Pix (`payoutPix` + endpoint) | 🔜 falta |
| 5 | Tela de carteira (ambulante/restaurante) | 🔜 falta |
| 6 | Estorno pós-liberação | 🔶 parcial (`pedido-reembolso`) |
| 7 | Testes + script de reconciliação + admin financeiro | 🔜 falta |

## Trocar de provedor de pagamento

Implementar a mesma interface num novo arquivo `_shared/asaas.ts` (ou `iugu.ts`) e apontar
as edge functions pra ele. Nenhuma tabela muda. Segredos sempre em variáveis de ambiente
(`MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `APP_BASE_URL`).
