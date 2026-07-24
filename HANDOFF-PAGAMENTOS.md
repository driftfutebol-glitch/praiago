# Pagamentos PraiaGo - estado atual

Data de referencia: 24/07/2026.

## Decisao atual

- O gateway antigo nao deve ser usado nas telas, docs ou fluxos novos.
- O provedor alvo agora e Pagar.me.
- Cliente paga dentro do app PraiaGo por Pix ou cartao.
- Ambulante/restaurante nao vincula conta em gateway externo.
- Ambulante/restaurante preenche dados cadastrais/KYC e chave Pix no PraiaGo.
- PraiaGo recebe a comissao pelo split do pagamento.
- O vendedor recebe o liquido conforme regras do recebedor/subconta configurado no Pagar.me.

## Ja existe

- Cliente usa `payment_provider: 'pagarme'` para pagamento online.
- Camada de pagamento do app cliente aponta para edge functions `pagarme-*`.
- `supabase/.env.example` ja lista os secrets esperados do Pagar.me.
- Carteira/saques no ambulante e restaurante trabalham com chave Pix e saldo espelho.
- Admin > Financeiro mostra saques solicitados e permite marcar Pix manual como pago.

## Ainda pendente para ligar Pagar.me

1. Conta/contrato PraiaGo aprovado no Pagar.me.
2. Chaves de sandbox e producao.
3. Webhook secret e URL apontando para Supabase Edge Function.
4. Edge functions reais:
   - `pagarme-pix`
   - `pagarme-card`
   - `pagarme-check-payment`
   - `pagarme-webhook`
5. Cadastro de recebedor/subconta para ambulante/restaurante com os campos exigidos pelo Pagar.me.
6. Teste em sandbox: criar recebedor, pagar pedido, validar split, validar webhook, validar saque/repasse.

## Enquanto Pagar.me nao estiver ligado

- Pedido presencial continua manual.
- Saque do vendedor fica com status `solicitado`.
- Admin confirma o Pix no painel Financeiro depois de pagar manualmente.
- Nenhum dinheiro real deve ser automatizado antes do sandbox estar validado.
