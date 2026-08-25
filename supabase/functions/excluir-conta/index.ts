import { createClient } from 'npm:@supabase/supabase-js@2.108.2'
import { corsHeaders, json, readJson } from '../_shared/cors.ts'
import { sendTransactionalEmail } from '../_shared/email.ts'

// The function spans tables added by several historical migrations and the
// project does not yet ship generated Database types for Edge Functions.
// deno-lint-ignore no-explicit-any
type AdminClient = ReturnType<typeof createClient<any>>
type AccountRole = 'cliente' | 'ambulante'
type RequestStatus =
  | 'requested'
  | 'manual_review'
  | 'blocked'
  | 'processing'
  | 'completed'
  | 'failed'
type DeletionPhase = 'pending' | 'cleanup' | 'auth_delete' | 'auth_deleted' | 'completed'

type DeletionRequest = {
  id: string
  user_id: string | null
  subject_id: string | null
  role: AccountRole
  status: RequestStatus
  phase: DeletionPhase
  lock_token: string | null
  lock_expires_at: string | null
  attempt_count: number
  auth_delete_started_at: string | null
  auth_deleted_at: string | null
  notification_email: string | null
  blockers: string[]
  requested_at: string
  deadline_at: string
  completed_at: string | null
  external_cleanup_confirmed_at: string | null
  notification_sent_at: string | null
}

type ClaimedDeletionRequest = DeletionRequest & {
  status: 'processing'
  lock_token: string
  lock_expires_at: string
}

type RequestBody = {
  action?: 'request' | 'list' | 'process' | 'notify' | 'run-queue' | 'resolve-recipient-operation'
  requestId?: string
  operationId?: string
  externalCleanupConfirmed?: boolean
  page?: number
  pageSize?: number
  batchSize?: number
}

class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

class LeaseBusyError extends Error {}
class LeaseLostError extends Error {}

const STORAGE_BUCKETS = ['perfis-vendedores', 'kyc-documentos', 'produtos']
const MUTATION_BATCH_SIZE = 100
const LEASE_SECONDS = 900

type DbError = { message?: string } | null
type PageResult<T> = { data: T[] | null; error: DbError }
type Heartbeat = () => Promise<void>
type TransitionAction =
  | 'renew'
  | 'cleanup'
  | 'auth_delete'
  | 'auth_deleted'
  | 'complete'
  | 'failed'
  | 'blocked'
  | 'manual_review'
  | 'external_confirm'

function nowIso() {
  return new Date().toISOString()
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Erro desconhecido.')
  }
  return String(error || 'Erro desconhecido.')
}

function must(error: { message?: string } | null, context: string) {
  if (error) throw new Error(`${context}: ${error.message || 'falha no banco'}`)
}

function unique(values: string[]) {
  return [...new Set(values)]
}

async function updateRequest(
  admin: AdminClient,
  requestId: string,
  patch: Record<string, unknown>,
) {
  const { error } = await admin
    .from('account_deletion_requests')
    .update({ ...patch, updated_at: nowIso() })
    .eq('id', requestId)
  must(error, 'Falha ao atualizar o protocolo de exclusao')
}

async function getRequestById(admin: AdminClient, requestId: string) {
  const { data, error } = await admin
    .from('account_deletion_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle()
  must(error, 'Falha ao consultar o protocolo de exclusao')
  return (data || null) as DeletionRequest | null
}

async function claimRequest(
  admin: AdminClient,
  requestId: string,
  processedBy: string | null,
) {
  const { data, error } = await admin.rpc('claim_account_deletion_request', {
    p_request_id: requestId,
    p_processed_by: processedBy,
    p_lease_seconds: LEASE_SECONDS,
  })
  must(error, 'Falha ao reservar o protocolo de exclusao')

  const row = (Array.isArray(data) ? data[0] : data) as DeletionRequest | undefined
  if (!row) {
    const current = await getRequestById(admin, requestId)
    if (current?.status === 'completed') return current
    throw new LeaseBusyError('O protocolo ja esta sendo processado por outro worker.')
  }
  if (!row.subject_id || !row.lock_token || !row.lock_expires_at || row.status !== 'processing') {
    throw new Error('O banco retornou uma reserva de exclusao invalida.')
  }
  return row as ClaimedDeletionRequest
}

async function transitionClaim(
  admin: AdminClient,
  request: ClaimedDeletionRequest,
  action: TransitionAction,
  context: string,
  options: {
    blockers?: string[]
    error?: string
    actorId?: string | null
  } = {},
) {
  const { data, error } = await admin.rpc('transition_account_deletion_request', {
    p_request_id: request.id,
    p_lock_token: request.lock_token,
    p_action: action,
    p_blockers: options.blockers ?? null,
    p_error: options.error ?? null,
    p_actor_id: options.actorId ?? null,
    p_lease_seconds: LEASE_SECONDS,
  })
  must(error, context)
  const row = (Array.isArray(data) ? data[0] : data) as DeletionRequest | undefined
  if (!row) throw new LeaseLostError('A reserva do protocolo expirou ou pertence a outro worker.')
  return row
}

async function renewLease(admin: AdminClient, request: ClaimedDeletionRequest) {
  const renewed = await transitionClaim(admin, request, 'renew', 'Falha ao renovar a reserva do protocolo')
  if (!renewed.lock_expires_at) throw new LeaseLostError('O banco nao renovou a reserva do protocolo.')
  request.lock_expires_at = renewed.lock_expires_at
}

async function releaseClaim(
  admin: AdminClient,
  request: ClaimedDeletionRequest,
  status: 'manual_review' | 'blocked',
  blockers: string[],
) {
  return await transitionClaim(admin, request, status, 'Falha ao liberar o protocolo de exclusao', {
    blockers,
  })
}

async function markClaimFailed(
  admin: AdminClient,
  request: ClaimedDeletionRequest,
  error: unknown,
) {
  try {
    await transitionClaim(admin, request, 'failed', 'Falha ao registrar erro no protocolo de exclusao', {
      error: errorMessage(error),
    })
    return true
  } catch (updateError) {
    console.error('Falha ao registrar erro no protocolo de exclusao:', errorMessage(updateError))
    return false
  }
}

async function assertNoRows(
  query: PromiseLike<PageResult<Record<string, unknown>>>,
  context: string,
) {
  const { data, error } = await query
  must(error, context)
  if ((data || []).length > 0) throw new Error(`${context}: ainda existem residuos vinculados.`)
}

async function findOpenRequest(admin: AdminClient, userId: string) {
  const { data, error } = await admin
    .from('account_deletion_requests')
    .select('*')
    .eq('subject_id', userId)
    .neq('status', 'completed')
    .maybeSingle()
  must(error, 'Falha ao consultar o protocolo de exclusao')
  return (data || null) as DeletionRequest | null
}

async function createOrReuseRequest(
  admin: AdminClient,
  userId: string,
  role: AccountRole,
  email: string | null,
) {
  const existing = await findOpenRequest(admin, userId)
  if (existing) {
    if (!existing.notification_email && email) {
      await updateRequest(admin, existing.id, { notification_email: email })
      existing.notification_email = email
    }
    return existing
  }

  const { data, error } = await admin
    .from('account_deletion_requests')
    .insert({
      user_id: userId,
      subject_id: userId,
      role,
      notification_email: email,
      status: 'requested',
    })
    .select('*')
    .single()

  if (error?.code === '23505') {
    const concurrent = await findOpenRequest(admin, userId)
    if (concurrent) return concurrent
  }
  must(error, 'Falha ao criar o protocolo de exclusao')
  return data as DeletionRequest
}

async function deletionBlockers(
  admin: AdminClient,
  userId: string,
  role: AccountRole,
  externalCleanupConfirmed: boolean,
) {
  const { data, error } = await admin.rpc('get_account_deletion_blockers', {
    p_subject: userId,
    p_role: role,
    p_external_cleanup_confirmed: externalCleanupConfirmed,
  })
  must(error, 'Falha ao verificar impedimentos da exclusao')
  if (!Array.isArray(data)) throw new Error('O banco retornou impedimentos em formato invalido.')
  return unique(data.map(String))
}

async function walkUserStorage(
  admin: AdminClient,
  bucket: string,
  rootPrefix: string,
  heartbeat: Heartbeat,
  onFiles: (paths: string[]) => Promise<void> | void,
) {
  const queue = [rootPrefix]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const prefix = queue.shift() as string
    if (visited.has(prefix)) continue
    visited.add(prefix)
    const files: string[] = []

    for (let offset = 0; ; offset += 100) {
      await heartbeat()
      const { data, error } = await admin.storage.from(bucket).list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) {
        if (/bucket.*not found|not found.*bucket/i.test(error.message)) return
        throw new Error(`Falha ao listar ${bucket}/${prefix}: ${error.message}`)
      }

      for (const item of data || []) {
        const path = prefix ? `${prefix}/${item.name}` : item.name
        if (item.id || item.metadata) files.push(path)
        else if (!visited.has(path)) queue.push(path)
      }
      if ((data || []).length < 100) break
    }

    for (let start = 0; start < files.length; start += MUTATION_BATCH_SIZE) {
      await onFiles(files.slice(start, start + MUTATION_BATCH_SIZE))
    }
  }
}

async function removeUserStorage(admin: AdminClient, userId: string, heartbeat: Heartbeat) {
  for (const bucket of STORAGE_BUCKETS) {
    await walkUserStorage(admin, bucket, userId, heartbeat, async (paths) => {
      await heartbeat()
      const { error } = await admin.storage.from(bucket).remove(paths)
      if (error) throw new Error(`Falha ao remover arquivos de ${bucket}: ${error.message}`)
    })
  }
}

async function assertUserStorageEmpty(admin: AdminClient, userId: string, heartbeat: Heartbeat) {
  for (const bucket of STORAGE_BUCKETS) {
    await walkUserStorage(admin, bucket, userId, heartbeat, (paths) => {
      if (paths.length > 0) {
        throw new Error(`Falha ao confirmar limpeza de Storage: ${bucket} ainda possui objetos.`)
      }
    })
  }
}

async function anonymizeSecurityAndSupport(
  admin: AdminClient,
  userId: string,
  requestId: string,
  email: string | null,
  heartbeat: Heartbeat,
) {
  for (;;) {
    await heartbeat()
    const tickets = await admin
      .from('tickets')
      .select('id,status')
      .eq('usuario_id', userId)
      .order('id')
      .limit(MUTATION_BATCH_SIZE)
    must(tickets.error, 'Falha ao localizar chamados do usuario')
    const rows = tickets.data || []
    if (rows.length === 0) break
    if (rows.some((row) => ['aberto', 'em_andamento'].includes(String(row.status || 'aberto')))) {
      throw new Error('Existe chamado ou disputa em andamento; a exclusao precisa aguardar a resolucao.')
    }

    const ids = rows.map((row) => String(row.id))
    const ticketUpdate = await admin
      .from('tickets')
      .update({
        usuario_id: null,
        usuario_nome: 'Usuario removido',
        usuario_email: '',
        avaliacao_comentario: null,
        nao_lida_usuario: false,
        deletion_request_id: requestId,
      })
      .in('id', ids)
      .eq('usuario_id', userId)
    must(ticketUpdate.error, 'Falha ao pseudonimizar chamados resolvidos')
  }

  await heartbeat()
  const signupIps = await admin.from('signup_ips').delete().eq('user_id', userId)
  must(signupIps.error, 'Falha ao remover o historico de cadastro')
  if (email) {
    await heartbeat()
    const signupIpsByEmail = await admin.from('signup_ips').delete().eq('email', email)
    must(signupIpsByEmail.error, 'Falha ao remover o historico de cadastro por e-mail')
  }

  // Defense in depth: the live FK also cascades on Auth deletion, but tokens
  // must be invalidated while the protocol is still in manual_review/cleanup.
  await heartbeat()
  const activationTokens = await admin.from('ativacao_tokens').delete().eq('user_id', userId)
  must(activationTokens.error, 'Falha ao invalidar tokens de ativacao da conta')

  await heartbeat()
  const security = await admin
    .from('security_audit_logs')
    .update({
      user_id: null,
      actor_id: null,
      email: null,
      ip: null,
      user_agent: null,
      metadata: {},
      resolution_notes: null,
    })
    .or(`user_id.eq.${userId},actor_id.eq.${userId}`)
  must(security.error, 'Falha ao anonimizar auditoria de seguranca')
  if (email) {
    await heartbeat()
    const securityByEmail = await admin
      .from('security_audit_logs')
      .update({
        user_id: null,
        actor_id: null,
        email: null,
        ip: null,
        user_agent: null,
        metadata: {},
        resolution_notes: null,
      })
      .eq('email', email)
    must(securityByEmail.error, 'Falha ao anonimizar auditoria por e-mail')
  }
}

async function sanitizePayments(
  admin: AdminClient,
  linkColumn: 'pedido_id' | 'ticket_order_id',
  linkedIds: string[],
  requestId: string,
  heartbeat: Heartbeat,
) {
  if (linkedIds.length === 0) return
  let lastPaymentId: string | null = null
  for (;;) {
    await heartbeat()
    let query = admin
      .from('pagamentos')
      .select('id')
      .in(linkColumn, linkedIds)
      .order('id')
      .limit(MUTATION_BATCH_SIZE)
    if (lastPaymentId) query = query.gt('id', lastPaymentId)

    const payments = await query
    must(payments.error, 'Falha ao localizar pagamentos para anonimizar')
    const rows = payments.data || []
    if (rows.length === 0) break

    const paymentIds = rows.map((row) => String(row.id))
    const paymentUpdate = await admin
      .from('pagamentos')
      .update({
        personal_data_erased_at: nowIso(),
        deletion_request_id: requestId,
        status_detalhe: null,
        pix_qr_code: null,
        pix_qr_code_base64: null,
        pix_qr_code_url: null,
        pix_expira_em: null,
        raw: {},
      })
      .in('id', paymentIds)
    must(paymentUpdate.error, 'Falha ao anonimizar pagamentos')

    const sanitized = await admin
      .from('pagamentos')
      .select('id,personal_data_erased_at,pix_qr_code,pix_qr_code_base64,pix_qr_code_url,pix_expira_em,raw')
      .in('id', paymentIds)
    must(sanitized.error, 'Falha ao confirmar anonimizacao dos pagamentos')
    if ((sanitized.data || []).some((row) => (
      row.personal_data_erased_at === null
      || row.pix_qr_code !== null
      || row.pix_qr_code_base64 !== null
      || row.pix_qr_code_url !== null
      || row.pix_expira_em !== null
      || JSON.stringify(row.raw || {}) !== '{}'
    ))) {
      throw new Error('A confirmacao encontrou dados sensiveis residuais em pagamentos.')
    }

    const webhooks = await admin
      .from('payment_webhook_events')
      .update({ payload: {} })
      .in('payment_id', paymentIds)
    must(webhooks.error, 'Falha ao anonimizar eventos de pagamento')
    const webhookResidual = await admin
      .from('payment_webhook_events')
      .select('id')
      .in('payment_id', paymentIds)
      .neq('payload', '{}')
      .limit(1)
    must(webhookResidual.error, 'Falha ao confirmar anonimizacao dos eventos de pagamento')
    if ((webhookResidual.data || []).length > 0) {
      throw new Error('A confirmacao encontrou payload residual em evento de pagamento.')
    }

    lastPaymentId = paymentIds[paymentIds.length - 1]
    if (rows.length < MUTATION_BATCH_SIZE) break
  }
}

async function deleteEvaluationsForOrders(
  admin: AdminClient,
  orderIds: string[],
  heartbeat: Heartbeat,
) {
  for (let start = 0; start < orderIds.length; start += 100) {
    await heartbeat()
    const result = await admin
      .from('avaliacoes')
      .delete()
      .in('pedido_id', orderIds.slice(start, start + 100))
    must(result.error, 'Falha ao remover avaliacoes do usuario')
    await assertNoRows(
      admin.from('avaliacoes').select('id').in('pedido_id', orderIds.slice(start, start + 100)).limit(1),
      'Falha ao confirmar remocao das avaliacoes do usuario',
    )
  }
}

async function anonymizeClient(
  admin: AdminClient,
  userId: string,
  requestId: string,
  email: string | null,
  heartbeat: Heartbeat,
) {
  // The private delivery-code table is not exposed through PostgREST. A
  // service-role-only RPC deletes it under the same subject lock as new orders
  // and verifies that no UUID/code residue remains.
  await heartbeat()
  const deliveryCodes = await admin.rpc('cleanup_account_delivery_codes', {
    p_subject: userId,
    p_delete: true,
  })
  must(deliveryCodes.error, 'Falha ao remover os codigos privados de entrega')

  for (;;) {
    await heartbeat()
    const orders = await admin
      .from('pedidos')
      .select('id')
      .eq('cliente_id', userId)
      .order('id')
      .limit(MUTATION_BATCH_SIZE)
    must(orders.error, 'Falha ao localizar pedidos para anonimizar')
    const orderIds = (orders.data || []).map((row) => String(row.id))
    if (orderIds.length === 0) break

    await deleteEvaluationsForOrders(admin, orderIds, heartbeat)
    await sanitizePayments(admin, 'pedido_id', orderIds, requestId, heartbeat)
    await heartbeat()
    const orderUpdate = await admin
      .from('pedidos')
      .update({
        cliente_id: null,
        cliente_nome: 'Cliente removido',
        cliente_telefone: null,
        deletion_request_id: requestId,
        cpf_nota: null,
        zona: null,
        reta: null,
        barraca: null,
        lat: null,
        lng: null,
        codigo_entrega: null,
        payment_checkout_url: null,
        payment_details: {},
        reembolso_motivo: null,
      })
      .in('id', orderIds)
      .eq('cliente_id', userId)
    must(orderUpdate.error, 'Falha ao anonimizar pedidos do cliente')
    await assertNoRows(
      admin.from('pedidos').select('id').in('id', orderIds).eq('cliente_id', userId).limit(1),
      'Falha ao confirmar anonimizacao dos pedidos do cliente',
    )
  }

  await anonymizeSecurityAndSupport(admin, userId, requestId, email, heartbeat)

  for (;;) {
    await heartbeat()
    const eventOrders = await admin
      .from('event_ticket_orders')
      .select('id')
      .eq('cliente_id', userId)
      .order('id')
      .limit(MUTATION_BATCH_SIZE)
    must(eventOrders.error, 'Falha ao localizar ingressos para anonimizar')
    const eventOrderIds = (eventOrders.data || []).map((row) => String(row.id))
    if (eventOrderIds.length === 0) break

    await sanitizePayments(admin, 'ticket_order_id', eventOrderIds, requestId, heartbeat)
    const notificationUpdate = await admin
      .from('event_ticket_notifications')
      .update({
        destinatario_email: null,
        mensagem: 'Notificacao de compra anonimizada.',
        metadata: {},
      })
      .in('order_id', eventOrderIds)
    must(notificationUpdate.error, 'Falha ao anonimizar notificacoes de ingresso')

    await assertNoRows(
      admin.from('event_ticket_notifications').select('id').in('order_id', eventOrderIds)
        .not('destinatario_email', 'is', null).limit(1),
      'Falha ao confirmar remocao do e-mail das notificacoes de ingresso',
    )
    await assertNoRows(
      admin.from('event_ticket_notifications').select('id').in('order_id', eventOrderIds)
        .neq('mensagem', 'Notificacao de compra anonimizada.').limit(1),
      'Falha ao confirmar minimizacao das notificacoes de ingresso',
    )
    await assertNoRows(
      admin.from('event_ticket_notifications').select('id').in('order_id', eventOrderIds)
        .neq('metadata', '{}').limit(1),
      'Falha ao confirmar remocao dos metadados das notificacoes de ingresso',
    )

    await heartbeat()
    const eventOrderUpdate = await admin
      .from('event_ticket_orders')
      .update({
        cliente_id: null,
        cliente_nome: 'Cliente removido',
        cliente_email: null,
        cliente_telefone: null,
        deletion_request_id: requestId,
        payment_checkout_url: null,
        payment_details: {},
        entrega_observacao: null,
      })
      .in('id', eventOrderIds)
      .eq('cliente_id', userId)
    must(eventOrderUpdate.error, 'Falha ao anonimizar compras de ingresso')
    await assertNoRows(
      admin.from('event_ticket_orders').select('id').in('id', eventOrderIds)
        .eq('cliente_id', userId).limit(1),
      'Falha ao confirmar anonimizacao das compras de ingresso',
    )
  }

  await heartbeat()
  const eventRefundUpdate = await admin
    .from('event_ticket_refunds')
    .update({ requested_by: null, motivo: 'Solicitacao de usuario removido', metadata: {} })
    .eq('requested_by', userId)
  must(eventRefundUpdate.error, 'Falha ao anonimizar reembolsos de ingresso')

  await heartbeat()
  const fraudFlags = await admin
    .from('fraude_flags')
    .update({ cliente_id: null, cliente_nome: null, deletion_request_id: requestId })
    .eq('cliente_id', userId)
  must(fraudFlags.error, 'Falha ao anonimizar alertas antifraude do cliente')
}

async function anonymizeSeller(
  admin: AdminClient,
  userId: string,
  requestId: string,
  email: string | null,
  heartbeat: Heartbeat,
) {
  await anonymizeSecurityAndSupport(admin, userId, requestId, email, heartbeat)

  await heartbeat()
  const evaluations = await admin
    .from('avaliacoes')
    .update({ vendedor_id: null, vendedor_nome: 'Vendedor removido' })
    .eq('vendedor_id', userId)
  must(evaluations.error, 'Falha ao anonimizar avaliacoes ligadas ao vendedor')

  await heartbeat()
  const payouts = await admin
    .from('payouts')
    .update({ vendedor_id: null, chave_pix: null, deletion_request_id: requestId })
    .eq('vendedor_id', userId)
  must(payouts.error, 'Falha ao preservar o historico de saques')

  await heartbeat()
  const ledger = await admin
    .from('financial_ledger')
    .update({ vendedor_id: null, deletion_request_id: requestId })
    .eq('vendedor_id', userId)
  must(ledger.error, 'Falha ao preservar o livro financeiro')

  await heartbeat()
  const sellerOrders = await admin
    .from('pedidos')
    .update({
      vendedor_id: null,
      vendedor_nome: 'Vendedor removido',
    })
    .eq('vendedor_id', userId)
  must(sellerOrders.error, 'Falha ao anonimizar o vendedor nos pedidos')

  await heartbeat()
  const courierOrders = await admin
    .from('pedidos')
    .update({ ambulante_id: null })
    .eq('ambulante_id', userId)
  must(courierOrders.error, 'Falha ao anonimizar o ambulante nos pedidos')

  await heartbeat()
  const openFraud = await admin
    .from('fraude_flags')
    .select('id')
    .eq('vendedor_id', userId)
    .in('status', ['aberta', 'em_analise'])
    .limit(1)
  must(openFraud.error, 'Falha ao reconfirmar alertas antifraude abertos')
  if ((openFraud.data || []).length > 0) {
    throw new Error('Existe analise antifraude pendente; a exclusao precisa aguardar a resolucao.')
  }

  const resolvedFraud = await admin
    .from('fraude_flags')
    .update({ vendedor_id: null, deletion_request_id: requestId })
    .eq('vendedor_id', userId)
    .in('status', ['resolvida', 'arquivada'])
  must(resolvedFraud.error, 'Falha ao pseudonimizar evidencias antifraude resolvidas')

  await heartbeat()
  const paymentAccount = await admin
    .from('vendor_payment_accounts')
    .delete()
    .eq('vendedor_id', userId)
  must(paymentAccount.error, 'Falha ao remover dados bancarios do vendedor')

  await heartbeat()
  const coupons = await admin
    .from('cupons')
    .update({ ativo: false, vendedor_id: null, vendedor_tipo: null })
    .eq('vendedor_id', userId)
  must(coupons.error, 'Falha ao desativar cupons do vendedor')

  await heartbeat()
  const bankChanges = await admin
    .from('bank_account_change_requests')
    .delete()
    .eq('vendedor_id', userId)
  must(bankChanges.error, 'Falha ao remover solicitacoes bancarias do vendedor')

  await heartbeat()
  const recipient = await admin
    .from('seller_recipients')
    .delete()
    .eq('vendedor_id', userId)
  must(recipient.error, 'Falha ao remover o recebedor local do vendedor')
}

async function assertCommonResiduals(
  admin: AdminClient,
  userId: string,
  email: string | null,
) {
  await assertNoRows(
    admin.from('tickets').select('id').eq('usuario_id', userId).limit(1),
    'Falha ao confirmar remocao dos chamados',
  )
  await assertNoRows(
    admin.from('signup_ips').select('id').eq('user_id', userId).limit(1),
    'Falha ao confirmar remocao do historico de cadastro',
  )
  await assertNoRows(
    admin.from('ativacao_tokens').select('token').eq('user_id', userId).limit(1),
    'Falha ao confirmar invalidacao dos tokens de ativacao',
  )
  await assertNoRows(
    admin.from('security_audit_logs').select('id')
      .or(`user_id.eq.${userId},actor_id.eq.${userId}`).limit(1),
    'Falha ao confirmar anonimizacao da auditoria de seguranca',
  )
  if (email) {
    await assertNoRows(
      admin.from('signup_ips').select('id').eq('email', email).limit(1),
      'Falha ao confirmar remocao do cadastro por e-mail',
    )
    await assertNoRows(
      admin.from('security_audit_logs').select('id').eq('email', email).limit(1),
      'Falha ao confirmar anonimizacao da auditoria por e-mail',
    )
  }
}

async function assertClientResiduals(
  admin: AdminClient,
  userId: string,
  requestId: string,
  email: string | null,
) {
  await assertCommonResiduals(admin, userId, email)
  const deliveryCodes = await admin.rpc('cleanup_account_delivery_codes', {
    p_subject: userId,
    p_delete: false,
  })
  must(deliveryCodes.error, 'Falha ao confirmar remocao dos codigos privados de entrega')
  await assertNoRows(
    admin.from('pedidos').select('id').eq('cliente_id', userId).limit(1),
    'Falha ao confirmar anonimizacao final dos pedidos do cliente',
  )
  await assertNoRows(
    admin.from('event_ticket_orders').select('id').eq('cliente_id', userId).limit(1),
    'Falha ao confirmar anonimizacao final dos ingressos',
  )
  await assertNoRows(
    admin.from('event_ticket_refunds').select('id').eq('requested_by', userId).limit(1),
    'Falha ao confirmar anonimizacao final dos reembolsos de ingresso',
  )
  await assertNoRows(
    admin.from('fraude_flags').select('id').eq('cliente_id', userId).limit(1),
    'Falha ao confirmar anonimizacao final dos alertas antifraude',
  )
  await assertNoRows(
    admin.from('pagamentos').select('id').eq('deletion_request_id', requestId)
      .is('personal_data_erased_at', null).limit(1),
    'Falha ao confirmar o marcador de privacidade dos pagamentos',
  )
  await assertNoRows(
    admin.from('pagamentos').select('id').eq('deletion_request_id', requestId)
      .neq('raw', '{}').limit(1),
    'Falha ao confirmar a remocao do payload dos pagamentos',
  )
  await assertNoRows(
    admin.from('payment_webhook_events').select('id,pagamentos!inner(deletion_request_id)')
      .eq('pagamentos.deletion_request_id', requestId).neq('payload', '{}').limit(1),
    'Falha ao confirmar a remocao do payload dos webhooks',
  )
}

async function assertSellerResiduals(
  admin: AdminClient,
  userId: string,
  email: string | null,
) {
  await assertCommonResiduals(admin, userId, email)
  await assertNoRows(
    admin.from('avaliacoes').select('id').eq('vendedor_id', userId).limit(1),
    'Falha ao confirmar anonimizacao final das avaliacoes do vendedor',
  )
  await assertNoRows(
    admin.from('payouts').select('id').eq('vendedor_id', userId).limit(1),
    'Falha ao confirmar pseudonimizacao final dos saques',
  )
  await assertNoRows(
    admin.from('financial_ledger').select('id').eq('vendedor_id', userId).limit(1),
    'Falha ao confirmar pseudonimizacao final do livro financeiro',
  )
  await assertNoRows(
    admin.from('pedidos').select('id')
      .or(`vendedor_id.eq.${userId},ambulante_id.eq.${userId}`).limit(1),
    'Falha ao confirmar anonimizacao final dos pedidos do vendedor',
  )
  await assertNoRows(
    admin.from('vendor_payment_accounts').select('vendedor_id').eq('vendedor_id', userId).limit(1),
    'Falha ao confirmar remocao final da conta de pagamento',
  )
  await assertNoRows(
    admin.from('cupons').select('id').eq('vendedor_id', userId).limit(1),
    'Falha ao confirmar desvinculacao final dos cupons',
  )
  await assertNoRows(
    admin.from('bank_account_change_requests').select('id').eq('vendedor_id', userId).limit(1),
    'Falha ao confirmar remocao final das solicitacoes bancarias',
  )
  await assertNoRows(
    admin.from('seller_recipients').select('vendedor_id').eq('vendedor_id', userId).limit(1),
    'Falha ao confirmar remocao final do recebedor local',
  )
  await assertNoRows(
    admin.from('fraude_flags').select('id').eq('vendedor_id', userId).limit(1),
    'Falha ao confirmar ausencia de analise antifraude do vendedor',
  )
}

async function hardDeleteAuthUser(admin: AdminClient, userId: string) {
  const { error } = await admin.auth.admin.deleteUser(userId)
  const status = error && 'status' in error ? Number(error.status) : 0
  if (error && status !== 404 && !/not found|does not exist|user.*missing/i.test(error.message)) {
    throw new Error(`Falha ao excluir o usuario do Auth: ${error.message}`)
  }
}

async function notifyCompletion(admin: AdminClient, request: DeletionRequest) {
  if (!request.notification_email || request.notification_sent_at) return true

  try {
    const sent = await sendTransactionalEmail({
      to: request.notification_email,
      subject: 'Sua conta PraiaGo foi excluida',
      html: [
        '<p>Ola,</p>',
        '<p>A exclusao permanente da sua conta PraiaGo foi concluida.</p>',
        `<p>Protocolo: <strong>${request.id}</strong></p>`,
        '<p>Registros transacionais que precisem ser mantidos por obrigacao legal ou contabil foram preservados de forma restrita e sem manter o seu perfil ativo.</p>',
      ].join(''),
      text: `A exclusao permanente da sua conta PraiaGo foi concluida. Protocolo: ${request.id}.`,
    })
    if (sent.provider === 'not_configured') {
      throw new Error('Provedor de e-mail transacional nao configurado.')
    }
    const noticeUpdate = await admin
      .from('account_deletion_requests')
      .update({
        notification_email: null,
        notification_sent_at: nowIso(),
        notification_error: null,
        updated_at: nowIso(),
      })
      .eq('id', request.id)
      .eq('status', 'completed')
    must(noticeUpdate.error, 'Falha ao registrar a notificacao de conclusao')
    return true
  } catch (error) {
    const noticeError = await admin
      .from('account_deletion_requests')
      .update({ notification_error: errorMessage(error), updated_at: nowIso() })
      .eq('id', request.id)
      .eq('status', 'completed')
    if (noticeError.error) {
      console.error('Falha ao registrar erro de notificacao:', noticeError.error.message)
    }
    return false
  }
}

async function completeDeletion(
  admin: AdminClient,
  initialRequest: ClaimedDeletionRequest,
) {
  let request = initialRequest
  const userId = request.subject_id
  if (!userId) throw new Error('O protocolo nao possui mais um identificador recuperavel.')
  const heartbeat = async () => await renewLease(admin, request)

  try {
    if (request.phase !== 'auth_deleted') {
      await heartbeat()
      const cleanupState = await transitionClaim(
        admin,
        request,
        'cleanup',
        'Falha ao iniciar a limpeza da conta',
      )
      request = cleanupState as ClaimedDeletionRequest

      await removeUserStorage(admin, userId, heartbeat)
      if (request.role === 'cliente') {
        await anonymizeClient(admin, userId, request.id, request.notification_email, heartbeat)
        await heartbeat()
        await assertClientResiduals(admin, userId, request.id, request.notification_email)
      } else {
        await anonymizeSeller(admin, userId, request.id, request.notification_email, heartbeat)
        await heartbeat()
        await assertSellerResiduals(admin, userId, request.notification_email)
      }

      const authDeleteState = await transitionClaim(
        admin,
        request,
        'auth_delete',
        'Falha ao registrar o inicio da exclusao no Auth',
      )
      request = authDeleteState as ClaimedDeletionRequest

      // A second sweep happens directly before Auth deletion. RLS now rejects
      // residual access-JWT writes, and this closes any object race that began
      // before the deletion protocol was created.
      await removeUserStorage(admin, userId, heartbeat)
      await assertUserStorageEmpty(admin, userId, heartbeat)
      await hardDeleteAuthUser(admin, userId)

      const authDeletedState = await transitionClaim(
        admin,
        request,
        'auth_deleted',
        'Falha ao registrar a exclusao no Auth',
      )
      request = authDeletedState as ClaimedDeletionRequest
    }

    await heartbeat()
    const completedRequest = await transitionClaim(
      admin,
      request,
      'complete',
      'Falha ao concluir o protocolo de exclusao',
    )
    const completedAt = completedRequest.completed_at || nowIso()

    const notified = await notifyCompletion(admin, completedRequest)
    return { completedAt, notified }
  } catch (error) {
    // A response/network failure can happen after the UPDATE committed. Never
    // move a completed protocol back to failed.
    try {
      const current = await getRequestById(admin, request.id)
      if (current?.status === 'completed') {
        const notified = await notifyCompletion(admin, current)
        return { completedAt: current.completed_at || nowIso(), notified }
      }
    } catch (readError) {
      console.error('Falha ao conferir o estado apos erro de exclusao:', readError)
    }
    await markClaimFailed(admin, request, error)
    throw error
  }
}

async function lockPendingAccount(
  admin: AdminClient,
  userId: string,
  userToken: string,
) {
  const profileUpdate = await admin
    .from('profiles')
    .update({
      status: 'banido',
      banido_em: nowIso(),
      ban_motivo: 'Exclusao permanente solicitada pelo titular.',
      online: false,
      lat: null,
      lng: null,
    })
    .eq('id', userId)
    .select('id')
    .maybeSingle()
  must(profileUpdate.error, 'Falha ao bloquear a conta durante a exclusao')
  const profileLocked = Boolean(profileUpdate.data)

  const signOut = await admin.auth.admin.signOut(userToken, 'global')
  if (signOut.error) console.error('Falha ao revogar sessoes da conta em exclusao:', signOut.error.message)

  const ban = await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' })
  if (ban.error) console.error('Falha ao bloquear novos logins da conta em exclusao:', ban.error.message)
  return {
    profileLocked,
    sessionsRevoked: !signOut.error,
    authBanned: !ban.error,
    accessLocked: profileLocked && !signOut.error && !ban.error,
  }
}

async function requireSysadmin(admin: AdminClient, actorId: string) {
  const { data, error } = await admin
    .from('profiles')
    .select('role,status')
    .eq('id', actorId)
    .maybeSingle()
  must(error, 'Falha ao validar o administrador')
  if (data?.role !== 'sysadmin' || data?.status !== 'ativo') {
    throw new HttpError(403, 'Apenas um sysadmin ativo pode processar exclusoes.')
  }
}

async function resolveRecipientOperation(
  admin: AdminClient,
  actorId: string,
  operationId: string | undefined,
) {
  await requireSysadmin(admin, actorId)
  if (!operationId) throw new HttpError(400, 'operationId obrigatorio.')
  const { data, error } = await admin.rpc('resolve_recipient_provisioning', {
    p_operation_id: operationId,
    p_actor_id: actorId,
  })
  must(error, 'Falha ao confirmar a limpeza do recebedor externo')
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new HttpError(409, 'A operacao nao esta mais pendente.')
  return json({
    ok: true,
    operationId,
    state: String(row.state || 'cleaned'),
    resolvedAt: row.resolved_at || null,
  })
}

async function processAsAdmin(
  admin: AdminClient,
  actorId: string,
  body: RequestBody,
) {
  await requireSysadmin(admin, actorId)
  if (!body.requestId) throw new HttpError(400, 'requestId obrigatorio.')

  const request = await getRequestById(admin, body.requestId)
  if (!request) throw new HttpError(404, 'Protocolo nao encontrado.')
  if (request.status === 'completed') {
    return json({ ok: true, completed: true, requestId: request.id })
  }
  if (!request.subject_id) throw new HttpError(409, 'O protocolo concluido nao pode ser reprocessado.')

  if (request.role === 'ambulante' && body.externalCleanupConfirmed) {
    const pendingRecipient = await admin
      .from('recipient_provisioning_operations')
      .select('id')
      .eq('deletion_request_id', request.id)
      .in('state', ['provisioning', 'cleanup_pending'])
      .limit(1)
    must(pendingRecipient.error, 'Falha ao conferir operacoes externas pendentes')
    if ((pendingRecipient.data || []).length > 0) {
      throw new HttpError(
        409,
        'Resolva a operacao de recebedor pendente antes de confirmar a limpeza externa.',
      )
    }
  }

  let claimed: ClaimedDeletionRequest | null = null
  try {
    const claim = await claimRequest(admin, request.id, actorId)
    if (claim.status === 'completed') {
      return json({ ok: true, completed: true, requestId: request.id })
    }
    claimed = claim as ClaimedDeletionRequest
    if (request.role === 'ambulante' && body.externalCleanupConfirmed) {
      const confirmed = await transitionClaim(
        admin,
        claimed,
        'external_confirm',
        'Falha ao registrar a confirmacao da limpeza externa',
        { actorId },
      )
      claimed = confirmed as ClaimedDeletionRequest
      request.external_cleanup_confirmed_at = confirmed.external_cleanup_confirmed_at
    }
    await renewLease(admin, claimed)
    const blockers = await deletionBlockers(
      admin,
      request.subject_id,
      request.role,
      Boolean(request.external_cleanup_confirmed_at),
    )

    if (blockers.length) {
      await releaseClaim(admin, claimed, 'blocked', blockers)
      return json({
        ok: false,
        completed: false,
        requestId: request.id,
        status: 'blocked',
        blockers,
        deadlineAt: request.deadline_at,
      }, { status: 409 })
    }

    await renewLease(admin, claimed)
    const result = await completeDeletion(admin, claimed)
    return json({
      ok: true,
      completed: true,
      requestId: request.id,
      notificationPending: !result.notified,
      completedAt: result.completedAt,
    })
  } catch (error) {
    if (error instanceof LeaseBusyError) {
      throw new HttpError(409, 'Este protocolo ja esta em processamento. Tente novamente depois.')
    }
    if (claimed) await markClaimFailed(admin, claimed, error)
    throw error
  }
}

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left)
  const b = new TextEncoder().encode(right)
  let difference = a.length ^ b.length
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] || 0) ^ (b[index] || 0)
  }
  return difference === 0
}

function retryReady(row: { status: string; attempt_count: number; updated_at: string }) {
  if (row.status === 'requested') return true
  const updatedAt = Date.parse(row.updated_at)
  if (!Number.isFinite(updatedAt)) return false
  const delayMs = row.status === 'failed'
    ? Math.min(6 * 60 * 60, 60 * 2 ** Math.min(Math.max(row.attempt_count - 1, 0), 8)) * 1000
    : 15 * 60 * 1000
  return Date.now() - updatedAt >= delayMs
}

async function runQueue(
  req: Request,
  admin: AdminClient,
  actorId: string,
  body: RequestBody,
) {
  await requireSysadmin(admin, actorId)
  const expectedSecret = Deno.env.get('ACCOUNT_DELETION_WORKER_SECRET') || ''
  const providedSecret = req.headers.get('x-account-deletion-worker-secret') || ''
  // A verified active sysadmin JWT is always required. Deployments may add a
  // second internal secret without making the interactive operation depend on
  // a secret that has not been provisioned yet.
  if (expectedSecret && (!providedSecret || !constantTimeEqual(providedSecret, expectedSecret))) {
    throw new HttpError(403, 'Credencial interna do consumidor invalida.')
  }

  const batchSize = Math.max(1, Math.min(Math.trunc(Number(body.batchSize) || 5), 10))
  const { data, error } = await admin
    .from('account_deletion_requests')
    .select('id,status,role,attempt_count,updated_at,external_cleanup_confirmed_at')
    .in('status', ['requested', 'failed', 'blocked', 'manual_review'])
    .order('deadline_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(batchSize * 10)
  must(error, 'Falha ao carregar a fila de exclusoes')

  const candidates = (data || []).filter((row) => (
    retryReady(row)
    && (
      row.role !== 'ambulante'
      || row.status !== 'manual_review'
      || Boolean(row.external_cleanup_confirmed_at)
    )
  )).slice(0, batchSize)

  const results: Array<Record<string, unknown>> = []
  for (const candidate of candidates) {
    try {
      const response = await processAsAdmin(admin, actorId, { action: 'process', requestId: candidate.id })
      const payload = await response.json() as Record<string, unknown>
      results.push({ requestId: candidate.id, httpStatus: response.status, ...payload })
    } catch (error) {
      results.push({ requestId: candidate.id, ok: false, error: errorMessage(error) })
    }
  }

  return json({ ok: true, attempted: results.length, results })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, { status: 405 })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!supabaseUrl || !serviceKey || !anonKey) {
      throw new HttpError(500, 'Funcao sem as chaves do Supabase configuradas.')
    }
    if (!token) throw new HttpError(401, 'Sessao obrigatoria.')

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser(token)
    if (userError || !userData.user) throw new HttpError(401, 'Sessao invalida ou expirada.')

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const body = await readJson<RequestBody>(req)
    const action = body.action || 'request'

    if (action === 'list') {
      await requireSysadmin(admin, userData.user.id)
      const page = Math.max(1, Math.trunc(Number(body.page) || 1))
      const pageSize = Math.max(1, Math.min(Math.trunc(Number(body.pageSize) || 50), 100))
      const from = (page - 1) * pageSize
      const { data: requests, error, count } = await admin
        .from('account_deletion_requests')
        .select('id,role,status,phase,attempt_count,blockers,requested_at,deadline_at,completed_at,notification_sent_at,notification_error', { count: 'exact' })
        .order('deadline_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1)
      must(error, 'Falha ao listar protocolos')
      const requestIds = (requests || []).map((row) => String(row.id))
      let recipientOperations: Array<Record<string, unknown>> = []
      if (requestIds.length > 0) {
        const operations = await admin
          .from('recipient_provisioning_operations')
          .select('id,deletion_request_id,state,recipient_id,created_at,updated_at')
          .in('deletion_request_id', requestIds)
          .in('state', ['provisioning', 'cleanup_pending'])
          .order('created_at', { ascending: true })
          .limit(pageSize)
        must(operations.error, 'Falha ao listar operacoes externas pendentes')
        recipientOperations = (operations.data || []) as Array<Record<string, unknown>>
      }
      return json({
        ok: true,
        requests: requests || [],
        recipientOperations,
        page,
        pageSize,
        total: count || 0,
      })
    }

    if (action === 'run-queue') return await runQueue(req, admin, userData.user.id, body)

    if (action === 'process') {
      return await processAsAdmin(admin, userData.user.id, body)
    }

    if (action === 'resolve-recipient-operation') {
      return await resolveRecipientOperation(admin, userData.user.id, body.operationId)
    }

    if (action === 'notify') {
      await requireSysadmin(admin, userData.user.id)
      if (!body.requestId) throw new HttpError(400, 'requestId obrigatorio.')
      const { data, error } = await admin
        .from('account_deletion_requests')
        .select('*')
        .eq('id', body.requestId)
        .maybeSingle()
      must(error, 'Falha ao consultar o protocolo')
      if (!data) throw new HttpError(404, 'Protocolo nao encontrado.')
      const deletion = data as DeletionRequest
      if (deletion.status !== 'completed') throw new HttpError(409, 'A exclusao ainda nao terminou.')
      const notified = await notifyCompletion(admin, deletion)
      return json({ ok: notified, notificationPending: !notified }, { status: notified ? 200 : 503 })
    }

    if (action !== 'request') throw new HttpError(400, 'Acao desconhecida.')

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle()
    must(profileError, 'Falha ao consultar o perfil')
    if (!profile || !['cliente', 'ambulante'].includes(String(profile.role))) {
      throw new HttpError(403, 'Somente contas de cliente ou ambulante podem usar este fluxo.')
    }

    const role = profile.role as AccountRole
    const deletion = await createOrReuseRequest(
      admin,
      userData.user.id,
      role,
      userData.user.email || null,
    )

    let accessLocked = false
    try {
      const lockState = await lockPendingAccount(admin, userData.user.id, token)
      accessLocked = lockState.accessLocked
    } catch (lockError) {
      await updateRequest(admin, deletion.id, { last_error: 'account_lock_failed' })
      console.error('Falha ao bloquear conta com exclusao pendente:', lockError)
    }

    let claimed: ClaimedDeletionRequest | null = null
    try {
      const claim = await claimRequest(admin, deletion.id, null)
      if (claim.status === 'completed') {
        return json({ ok: true, completed: true, requestId: deletion.id })
      }
      claimed = claim as ClaimedDeletionRequest
      await renewLease(admin, claimed)

      if (!deletion.subject_id) throw new Error('O protocolo nao possui identificador para continuar.')
      const blockers = await deletionBlockers(admin, deletion.subject_id, role, false)

      if (role === 'cliente' && blockers.length === 0) {
        await renewLease(admin, claimed)
        const result = await completeDeletion(admin, claimed)
        return json({
          ok: true,
          completed: true,
          requestId: deletion.id,
          completedAt: result.completedAt,
          notificationPending: !result.notified,
        })
      }

      await releaseClaim(admin, claimed, 'manual_review', blockers)
      return json({
        ok: true,
        completed: false,
        requestId: deletion.id,
        status: 'manual_review',
        deadlineAt: deletion.deadline_at,
        accessLocked,
        message: 'Solicitacao registrada. A exclusao sera concluida em ate 30 dias.',
      }, { status: 202 })
    } catch (error) {
      if (error instanceof LeaseBusyError) {
        return json({
          ok: true,
          completed: false,
          requestId: deletion.id,
          status: 'processing',
          deadlineAt: deletion.deadline_at,
          accessLocked,
          message: 'A exclusao da conta ja esta em processamento.',
        }, { status: 202 })
      }

      if (claimed) await markClaimFailed(admin, claimed, error)
      return json({
        ok: true,
        completed: false,
        requestId: deletion.id,
        status: 'failed',
        deadlineAt: deletion.deadline_at,
        accessLocked,
        message: 'Solicitacao registrada e encaminhada para conclusao manual.',
      }, { status: 202 })
    }
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    console.error('excluir-conta:', error)
    return json({ error: errorMessage(error) }, { status })
  }
})
