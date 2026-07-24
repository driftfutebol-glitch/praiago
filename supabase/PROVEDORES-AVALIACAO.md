# Provedor de pagamento escolhido

Data de referencia: 24/07/2026.

## Escolha atual

O caminho atual do PraiaGo e Pagar.me.

Motivo operacional:

- Suporta recebedores/subcontas por API.
- Suporta split de pagamento.
- Permite Pix e cartao no checkout transparente.
- Permite modelo onde vendedor nao sai do app PraiaGo.
- Mantem a comissao PraiaGo separada do liquido do ambulante/restaurante.

## O que pedir/configurar no Pagar.me

- Conta da PraiaGo aprovada.
- Modo marketplace/split habilitado.
- Chave publica para tokenizacao de cartao no app.
- Chave secreta para Supabase Edge Functions.
- Webhook secret.
- Eventos de pagamento, reembolso, chargeback, recebedor e transferencia.
- Campos obrigatorios para criar recebedor pessoa fisica e pessoa juridica.

## Nao automatizar ainda

Nao mover dinheiro real ate validar em sandbox:

- criacao de recebedor;
- pagamento Pix;
- pagamento cartao;
- split;
- webhook idempotente;
- reembolso;
- saque/repasse.
