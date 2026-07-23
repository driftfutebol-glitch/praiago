> ## ⚠️ DOCUMENTO HISTÓRICO — NÃO SIGA COMO INSTRUÇÃO
> Em **23/07/2026** o Mercado Pago foi **removido por completo** do PraiaGo
> (código, banco de dados e edge functions). O gateway agora é o **Pagar.me**.
> Tudo abaixo que cita Mercado Pago, OAuth de vendedor ou `mercadopago-*`
> **não existe mais**. O estado atual está em `supabase/.env.example` e na
> tabela nova `public.pagamentos`.

# 🏦 Pagamentos white-label — o que ficou pronto e o que VOCÊ faz na mão

> Feito enquanto você tava na academia. Nada de dinheiro real foi movido (spec).

## ✅ Pronto e testado (sem mover 1 centavo)

**Backend / dados**
- `PaymentProvider` — interface única (`supabase/functions/_shared/payment-provider.ts`).
- `AsaasProvider` — adapter completo pronto pra plugar a key (`_shared/asaas.ts`). Só roda quando existir `ASAAS_API_KEY`.
- Tabelas: `wallets`, `payouts`, `seller_recipients`, `settlement_config` (D+N **configurável**, sem D+7 fixo), `payment_webhook_events` (idempotente).
- Funções SQL: `carteira_espelho()` (espelho contábil read-only), `reconciliar_carteira()`, `solicitar_saque()` (atômico), `liberar_repasses()` (D+N) — **agendada no cron às 09:00**.
- Edge function `solicitar-saque` (auth do vendedor + registro atômico; chama o Asaas só se a key existir).

**Telas (seguindo o design que já existe)**
- **Carteira** no **ambulante** e **restaurante** (Perfil → Minha Carteira): saldo disponível/pendente, vendas brutas, comissão, líquido, taxa provedor, extrato, histórico de saques, **cadastrar chave Pix** e **Solicitar saque**.
- **Admin → Financeiro**: novo painel **"Saques solicitados"** (marcar pago manual enquanto o provedor não liga).

**Avaliação de provedores:** `supabase/PROVEDORES-AVALIACAO.md` → recomendação **Asaas**.

---

## 🙋 O que SÓ VOCÊ faz na mão

### 1. Escolher e abrir a conta do provedor (recomendo **Asaas**)
- Entrar em **https://www.asaas.com**, criar conta com o **CNPJ da Praia Go**, aprovar o contrato de marketplace/subcontas.
- **Não posso criar** essa conta — é conta financeira com CNPJ e verificação.

### 2. Me passar a API key de **SANDBOX**
- No painel Asaas: **Integrações → API** → copiar a **chave de sandbox**.
- Me manda que eu configuro os secrets no Supabase:
  `ASAAS_API_KEY`, `ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3`, `ASAAS_WEBHOOK_TOKEN` (um token que você inventa).

### 3. Validar no sandbox comigo (o passo "sandbox validado" do spec)
- Criar recebedor de teste → pagar um pedido fake → conferir o split → liberar (D+N) → sacar. Tudo em sandbox, sem dinheiro real.

### 4. Só depois: produção
- Trocar a key sandbox pela de produção + apontar o webhook do Asaas. **Aí sim** roda dinheiro de verdade.

---

## 🔜 O que EU ligo quando a key/decisão chegar
- Form de **dados de recebimento/KYC** no cadastro do vendedor → cria o recebedor automático por API.
- Edge function `asaas-webhook` (assinatura + idempotência) atualizando o ledger.
- Ligar o **checkout transparente ao Asaas** (hoje é Mercado Pago) — ou manter MP no recebimento e Asaas só no repasse, a gente decide.
- Testes automatizados + script de reconciliação (soma do ledger == carteira).

## ⚠️ Enquanto o provedor não liga
- Vendedor **consegue** cadastrar chave Pix e **solicitar saque** → o saque fica **"solicitado"** e você **marca como pago** no Admin → Financeiro depois de mandar o Pix na mão. Quando o Asaas ligar, isso vira automático.
