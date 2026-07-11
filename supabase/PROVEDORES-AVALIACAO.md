# Avaliação de provedores — white-label marketplace (Praia Go)

Requisito: **recebedor/subconta criado por API**, vendedor **nunca acessa o provedor**,
provedor **custodia o dinheiro** (sem custódia na Praia Go), **split automático**,
**liquidação configurável**, **Pix out**, **KYC por API**, **sandbox pra validar antes**.

## Comparativo (pesquisa jul/2026)

| Critério | **Asaas** | **Pagar.me** (Stone) | **Iugu** |
|---|---|---|---|
| Subconta/recebedor por API | ✅ subcontas | ✅ recebedores | ✅ subcontas |
| **White-label** (vendedor não vê a marca, não sai do app) | ✅✅ **explícito na doc** | ⚠️ marca Stone/Pagar.me aparece mais | ⚠️ menos white-label |
| KYC por API | ✅ (cada subconta com KYC + API key) | ✅ (dados mín. BACEN Circ. 3.978) | ✅ (`request_verification`, docs base64, ~2 dias) |
| Split automático | ✅ (`walletId`, exclusivo API) | ✅✅ split rules + recebíveis por recebedor | ✅ conta mestre + subcontas (plano Marketplace) |
| Provedor custodia (0 custódia Praia Go) | ✅ | ✅ | ✅ |
| Pix in + Pix/TED out | ✅ | ✅ | ✅ |
| **Sandbox pra validar criação de subconta** | ✅ completo | ✅ | ⚠️ **subconta só cria em PRODUÇÃO** |
| Custo / facilidade de onboarding | 💚 barato, rápido, SMB | 💛 robusto, mais enterprise | 💛 intermediário |
| Melhor pra | **MVP white-label, Pix-first** | escala/alto volume | marketplace médio |

## Recomendação

1. **Asaas — recomendado pra começar.** Bate ponto a ponto com o teu spec: doc de
   **white-label** dizendo que o cliente *"não sai da sua plataforma e não vê a marca Asaas"*,
   subconta + KYC + split + Pix out por API, **sandbox completo**, barato. Ideal pro MVP.
2. **Pagar.me — opção de escala.** Infra Stone, split/recebíveis mais robustos. Vale quando
   o volume crescer; onboarding/contrato mais pesado.
3. **Iugu — 3º.** Capaz, mas **subconta só é criável em produção** — atrapalha o requisito
   de "validar sandbox antes de mandar dinheiro real".

> Tudo atrás da interface `PaymentProvider` (`_shared/payment-provider.ts`): dá pra começar
> no Asaas e trocar/adicionar Pagar.me depois **sem reescrever ledger, carteira ou telas**.

## Fontes
- Pagar.me — [Recebedores](https://docs.pagar.me/v4/docs/criando-um-recebedor-1) · [Split](https://docs.pagar.me/docs/pedidos-com-split) · [Criar recebedor (ref)](https://docs.pagar.me/reference/criar-recebedor-1)
- Iugu — [Criar/verificar subconta](https://dev.iugu.com/docs/criar-verificar-e-configurar-subconta) · [Split](https://dev.iugu.com/docs/split-de-pagamentos) · [Fluxo Marketplace](https://dev.iugu.com/docs/fluxo-marketplace)
- Asaas — [Criação de subcontas](https://docs.asaas.com/docs/criacao-de-subcontas) · [White label](https://docs.asaas.com/docs/sobre-white-label) · [Split](https://docs.asaas.com/docs/split-de-pagamentos)

## O que NÃO fazer ainda (spec)
Nenhum pagamento real até: **provedor escolhido + contrato aprovado + sandbox validado**.
O que já existe é só a **abstração + modelo de dados espelho** — zero dinheiro real movido.
