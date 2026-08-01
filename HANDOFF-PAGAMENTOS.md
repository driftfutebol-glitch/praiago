# Pagamentos PraiaGo - estado atual

Data de referencia: 01/08/2026.

## Decisao atual

- O provedor de pagamentos do fluxo novo e Pagar.me.
- O cliente paga dentro do aplicativo nativo PraiaGo por Pix ou cartao.
- Ambulante e restaurante nao vinculam uma conta externa no aplicativo.
- Chaves secretas ficam somente em Supabase Edge Function Secrets.
- A chave publica fica no `.env` ignorado do app cliente e entra no bundle nativo.

## Integracao ativa

- `pagarme-pix` v9, com JWT obrigatorio.
- `pagarme-card` v8, com JWT obrigatorio.
- `pagarme-check-payment` v5, com JWT obrigatorio.
- `pagarme-webhook` v7, publico para o gateway e validado server-to-server.
- O valor cobrado vem do pedido no banco, nunca do frontend.
- Dados brutos do cartao sao enviados diretamente ao endpoint de tokenizacao do
  Pagar.me; somente o token chega ao backend PraiaGo.
- O webhook nao confia no status recebido. O payload apenas aponta o pedido;
  `GET /orders/{order_id}` relê o estado com a secret key no servidor.
- Antes de aprovar, o webhook confere id do gateway, `code` do pedido PraiaGo,
  valor e moeda, e processa o mesmo evento de forma idempotente.
- A consulta antiga `GET /hooks/{hook_id}` foi retirada porque os webhooks
  reais estavam retornando 400 nessa rota e eram rejeitados com HTTP 401.
- A URL oficial da imagem do QR Code PIX agora e persistida e exibida no app;
  antes apenas o copia-e-cola aparecia, embora o gateway enviasse a imagem.
- O checkout reutiliza o mesmo pedido online pendente. Uma falha de pre-check
  nao cria outro pedido nem tenta consumir o mesmo cupom uma segunda vez.
- O telefone digitado no checkout e salvo antes de criar o pedido online.
- O admin recebe alertas persistentes e em tempo real para pagamento pendente,
  aprovado, recusado, cancelado e estornado, protegidos por RLS.
- Falhas de persistencia deixam o evento pendente para nova tentativa. Uma
  cobranca ja aceita pelo gateway nunca e apresentada como falha local.
- Logs nao imprimem payloads do Pagar.me com CPF, e-mail ou telefone.

## Configuracao verificada

- `praiago-cliente/.env` existe, esta ignorado e nao e rastreado pelo Git.
- `VITE_PAGARME_PUBLIC_KEY` tem formato de producao, foi reconhecida pelo
  endpoint oficial e permite CORS para a origem nativa `https://localhost`.
- O teste da chave publica usou cartao propositalmente invalido: nenhum token e
  nenhuma cobranca foram criados.
- `PAGARME_SECRET_KEY`, `PAGARME_WEBHOOK_USER` e
  `PAGARME_WEBHOOK_PASS` continuam guardados no Supabase. Os dois ultimos foram
  preservados, embora a v7 do webhook nao dependa mais de Basic Auth.
- Nenhuma secret key foi encontrada no bundle web ou no AAB.

## Build Android

- Aplicativo: PraiaGo Cliente.
- Versao: `1.0.3`.
- Version code: `4`.
- AAB assinado: `praiago-cliente/android/app/build/outputs/bundle/release/app-release.aab`.
- APK assinado: `praiago-cliente/android/app/build/outputs/apk/release/app-release.apk`.
- SHA-256 do AAB: `9078AA9F4301FEBFB8DF4D39387316344CEFBA72641643B7D1CF3DCA20726177`.
- SHA-256 do APK: `C2EDC818256590E75CFEB306DD83FF350BA316BC624F534098F859EF923F910D`.

## Validacoes concluidas

- Build TypeScript/Vite: aprovado.
- Lint: sem erros; permanecem avisos React Hooks anteriores a esta integracao.
- Testes unitarios Android: aprovados.
- AAB e APK: gerados e assinaturas verificadas.
- Funcoes de Pix, cartao e consulta recusam chamadas sem login.
- Webhook rejeita evento de pagamento falso e nao grava o teste no banco.
- Um Pix real ja foi gerado pela conta Pagar.me; a exigencia de telefone foi
  corrigida antes das versoes atuais.
- Build do cliente e do admin aprovado depois da correcao de QR, cupom e alertas.
- A migracao `payment_checkout_reliability` foi aplicada no Supabase; duas URLs
  de QR existentes foram recuperadas sem alterar pedidos ou pagamentos.

## Proxima confirmacao operacional

1. Reenviar no painel Pagar.me um webhook que falhou antes da v7, ou gerar um
   novo Pix controlado, e confirmar resposta HTTP 200.
2. Conferir uma linha `provider = 'pagarme'` e `processed = true` em
   `payment_webhook_events`.
3. Fazer uma compra controlada por cartao para validar autorizacao, recusa e
   reconciliacao ponta a ponta. O teste de configuracao nao criou cobranca.
4. Subir o AAB `1.0.3 (4)` na faixa de teste da Play Store antes de producao.

## Marketplace ainda pendente

- Criar recebedor/subconta Pagar.me para cada ambulante e restaurante aprovado.
- Validar os campos KYC exigidos pelo contrato Pagar.me.
- Aplicar split server-side com a comissao PraiaGo e o liquido do vendedor.
- Reconciliar liquidacao, estorno e chargeback no ledger financeiro.
- Ate esse trabalho ser concluido, as cobrancas atuais pertencem a conta
  principal PraiaGo; nao anunciar repasse automatico ao vendedor.

## Regras de seguranca

- Nunca versionar `.env`, `key.properties`, `.jks`, `.keystore` ou secrets do
  Supabase.
- Nunca imprimir chaves, payload completo do gateway ou dados de cartao em log.
- Nunca marcar pedido pago usando apenas o corpo de um webhook.
- Nao remover ou substituir secrets existentes sem rotacao planejada.
