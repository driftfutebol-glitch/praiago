# Repasse PraiaGo - carteira, split e saque

Data de referencia: 24/07/2026.

## Regra de negocio

- Cliente paga dentro do PraiaGo.
- PraiaGo fica com a comissao da plataforma.
- Ambulante/restaurante recebe o liquido.
- O vendedor nao cria conta nem faz login em gateway externo.
- O vendedor informa dados cadastrais/KYC e chave Pix no app.
- O provedor alvo para o split e repasse automatico e Pagar.me.

## Modelo de dinheiro

`financial_ledger` e a fonte de verdade.

- `taxa_plataforma`: valor da comissao PraiaGo.
- `repasse_vendedor`: valor liquido do ambulante/restaurante.
- `saque`: retirada solicitada pelo vendedor.
- `estorno`/`chargeback`: ajustes negativos.

`wallets` e cache reconciliavel.

- `saldo_a_liberar`: repasses ainda retidos.
- `saldo_disponivel`: saldo ja liberado e ainda nao sacado.
- `total_sacado`: historico de saques pagos.

`payouts` registra cada saque via Pix.

- `provider` indica o gateway ou `pendente_config`.
- `provider_transfer_id` guarda o id da transferencia no provedor quando a automacao existir.
- Enquanto Pagar.me nao estiver ligado, o saque fica `solicitado` e o admin paga manualmente.

## Fluxo esperado com Pagar.me

1. Cadastro do vendedor coleta dados de recebedor/KYC e chave Pix.
2. Edge Function cria/atualiza recebedor no Pagar.me.
3. Checkout cria cobranca com split: comissao PraiaGo + liquido do vendedor.
4. Webhook confirma pagamento e grava ledger idempotente.
5. Regra D+N libera saldo no espelho da carteira.
6. Saque Pix usa o recebedor/chave Pix e salva `provider_transfer_id`.
7. Webhook confirma transferencia ou falha.

## Compliance

Evitar custodia manual prolongada na conta da PraiaGo. O desenho correto e o provedor custodiar o saldo do vendedor e liquidar pelo recebedor/subconta. O modo manual so deve ser usado enquanto o gateway ainda nao esta contratado, configurado e validado em sandbox.

## Pendente

- Implementar adapter/edge functions Pagar.me reais.
- Criar formulario completo de dados do recebedor para ambulante/restaurante.
- Validar sandbox antes de producao.
- Adicionar rotina de reconciliacao: soma do ledger igual a carteira.
