# Operacao da fila de exclusao de contas

Este fluxo e operado pela Edge Function `excluir-conta`. Todas as acoes abaixo
exigem um JWT valido de um perfil `sysadmin` com status `ativo`; o ator e sempre
derivado de `auth.getUser()` e nunca e aceito no corpo da requisicao.

Nao use a service-role key no computador do operador. Obtenha uma sessao normal
de sysadmin e envie apenas o access token dessa sessao no header `Authorization`.

## Consultar a fila

Envie `POST /functions/v1/excluir-conta` com:

```json
{ "action": "list", "page": 1, "pageSize": 50 }
```

A resposta inclui `total`, `page`, `pageSize` e no maximo 100 protocolos por
pagina. A listagem nao devolve o UUID do titular nem o e-mail de notificacao.
O campo `recipientOperations` lista somente operacoes externas ainda pendentes
dos protocolos da pagina, com `id`, `state` e `recipient_id` para o sysadmin
localizar o recebedor no painel do Pagar.me.

## Resolver uma criacao concorrente de recebedor

`pagarme-recebedor` reserva uma operacao duravel no banco antes de enviar dados
ao Pagar.me. Se uma exclusao abrir durante a chamada externa, a operacao fica em
`cleanup_pending` e bloqueia a conclusao mesmo que `externalCleanupConfirmed`
tenha sido enviado.

No painel do Pagar.me, localize o `recipient_id` mostrado por `list` e solicite
a exclusao ou anonimizacao definitiva do recebedor. Desativar transferencias
automaticas, sozinho, nao equivale a apagar os dados cadastrais. Quando o
provedor confirmar a limpeza, envie:

```json
{
  "action": "resolve-recipient-operation",
  "operationId": "UUID_DA_OPERACAO"
}
```

Essa acao exige JWT de sysadmin ativo, grava `resolved_by`/`resolved_at` e limpa
o UUID do titular e o `recipient_id` da operacao. Para uma operacao
`provisioning` sem `recipient_id` (por exemplo, queda entre reserva e resposta),
confirme primeiro no Pagar.me que o POST idempotente nao criou um recebedor.
Nunca resolva a operacao apenas para contornar o blocker.

## Processar um protocolo revisado

Para cliente, ou para repetir um protocolo `failed`/`blocked`, envie:

```json
{ "action": "process", "requestId": "UUID_DO_PROTOCOLO" }
```

Para ambulante, confirme primeiro no Pagar.me que a conta/recebedor externo foi
encerrado, resolva qualquer item de `recipientOperations` e somente entao envie:

```json
{
  "action": "process",
  "requestId": "UUID_DO_PROTOCOLO",
  "externalCleanupConfirmed": true
}
```

A confirmacao externa fica auditada com o sysadmin autenticado. O processamento
usa claim atomico e lease no banco; repetir a mesma chamada e idempotente. Nunca
marque `externalCleanupConfirmed` apenas para contornar um blocker.

## Consumir um lote seguro

Para escolher protocolos no servidor, respeitar backoff e processar um lote
limitado sem enviar `requestId`, use:

```json
{ "action": "run-queue", "batchSize": 5 }
```

O limite maximo e 10. Protocolos `failed` usam backoff exponencial (ate 6 horas)
e `blocked`/`manual_review` aguardam pelo menos 15 minutos. Um ambulante em
`manual_review` so entra no lote depois que a limpeza externa foi confirmada.

O JWT de sysadmin e sempre obrigatorio. Se o secret opcional
`ACCOUNT_DELETION_WORKER_SECRET` for configurado no Supabase, inclua tambem o
header `x-account-deletion-worker-secret`; a funcao passa a exigir os dois
fatores. Nao configure cron sem um mecanismo separado de identidade/autorizacao.

## Reenviar notificacao concluida

Para um protocolo `completed` com notificacao pendente:

```json
{ "action": "notify", "requestId": "UUID_DO_PROTOCOLO" }
```

Antes de considerar o incidente encerrado, confirme `completed`,
`notification_sent_at` preenchido e ausencia de `notification_error`. O envio
de e-mail ainda deve ser tratado como at-least-once: uma falha de rede depois do
provedor aceitar a mensagem pode causar nova tentativa.
