// ============================================================================
// AsaasProvider — implementação de PaymentProvider (white-label marketplace)
// ============================================================================
// PRONTO PRA PLUGAR A KEY. Não faz nada até existir ASAAS_API_KEY no ambiente.
// Sandbox: https://sandbox.asaas.com/api/v3   Produção: https://api.asaas.com/v3
// Auth: header `access_token: <API_KEY>`.
//
// ⚠️ Antes de ligar em produção: validar CADA endpoint no SANDBOX do Asaas — os
// nomes de campo abaixo seguem a doc, mas podem exigir ajuste fino (é o passo
// "sandbox validado" do spec). NENHUM pagamento real sai daqui sem a key.
// ============================================================================
import type {
  PaymentProvider, DadosRecebedor, KycDocs, StatusRecebedor,
  CriarPagamentoInput, ResultadoPagamento, ResultadoTransferencia,
  SaldoRecebedor, EventoWebhook,
} from './payment-provider.ts'

function env(name: string, fallback = ''): string {
  return Deno.env.get(name) || fallback
}

const BASE = () => env('ASAAS_BASE_URL', 'https://sandbox.asaas.com/api/v3')
const KEY = () => env('ASAAS_API_KEY')          // key da CONTA MESTRE (plataforma)
const WEBHOOK_TOKEN = () => env('ASAAS_WEBHOOK_TOKEN')

function reais(centavos: number) { return Math.round(centavos) / 100 }

async function asaas<T>(path: string, init: RequestInit = {}, apiKey?: string): Promise<T> {
  const key = apiKey || KEY()
  if (!key) throw new Error('ASAAS_API_KEY ausente — provedor ainda não configurado.')
  const res = await fetch(`${BASE()}${path}`, {
    ...init,
    headers: {
      'access_token': key,
      'Content-Type': 'application/json',
      'User-Agent': 'PraiaGo',
      ...(init.headers ?? {}),
    },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = body?.errors?.[0]?.description || body?.message || `Asaas HTTP ${res.status}`
    throw new Error(String(msg))
  }
  return body as T
}

function mapEventoWebhook(evt: string): EventoWebhook['tipo'] {
  const m: Record<string, EventoWebhook['tipo']> = {
    PAYMENT_CREATED: 'pagamento_criado',
    PAYMENT_CONFIRMED: 'pagamento_aprovado',
    PAYMENT_RECEIVED: 'pagamento_aprovado',
    PAYMENT_OVERDUE: 'pagamento_recusado',
    PAYMENT_REFUNDED: 'reembolso',
    PAYMENT_CHARGEBACK_REQUESTED: 'chargeback',
    TRANSFER_CREATED: 'transferencia_realizada',
    TRANSFER_DONE: 'transferencia_realizada',
    TRANSFER_FAILED: 'transferencia_recusada',
    ACCOUNT_STATUS_APPROVED: 'recebedor_aprovado',
    ACCOUNT_STATUS_REJECTED: 'recebedor_reprovado',
  }
  return m[evt] || 'desconhecido'
}

export const AsaasProvider: PaymentProvider = {
  nome: 'asaas',

  // ── Recebedor = SUBCONTA Asaas (white-label, vendedor não vê o Asaas) ──────
  async criarRecebedor(d: DadosRecebedor): Promise<StatusRecebedor> {
    const body = {
      name: d.razaoSocial || d.nome,
      email: d.email || `vendedor-${d.vendedorId.slice(0, 8)}@praiago.com.br`,
      cpfCnpj: d.documento.numero,
      birthDate: d.dataNascimento || undefined,
      mobilePhone: d.telefone || undefined,
      address: d.endereco?.logradouro,
      addressNumber: d.endereco?.numero,
      complement: d.endereco?.complemento,
      province: d.endereco?.bairro,
      postalCode: d.endereco?.cep,
      // domicílio de saque
      ...(d.chavePix ? {} : {}),
    }
    const acc = await asaas<{ id: string; walletId: string; apiKey?: string }>(
      '/accounts', { method: 'POST', body: JSON.stringify(body) },
    )
    return {
      recipientId: acc.walletId || acc.id, // walletId é o que usamos no split/transfer
      status: 'pendente',
      kycStatus: 'em_analise',
    }
  },

  async enviarKyc(recipientId: string, _docs: KycDocs): Promise<StatusRecebedor> {
    // Asaas: documentos de KYC via /myAccount/documents da subconta (usa a apiKey dela).
    // Implementar o upload real na validação de sandbox. Por ora devolve em_analise.
    return { recipientId, status: 'pendente', kycStatus: 'em_analise' }
  },

  async consultarRecebedor(recipientId: string): Promise<StatusRecebedor> {
    const acc = await asaas<{ id: string; walletId?: string; accountStatus?: string; status?: string }>(
      `/accounts/${encodeURIComponent(recipientId)}`,
    ).catch(() => null)
    const raw = acc?.accountStatus || acc?.status || 'PENDING'
    const kyc: StatusRecebedor['kycStatus'] =
      raw === 'APPROVED' ? 'aprovado' : raw === 'REJECTED' ? 'reprovado' : 'em_analise'
    return { recipientId, status: kyc === 'aprovado' ? 'ativo' : 'pendente', kycStatus: kyc }
  },

  // ── Checkout transparente + split automático ──────────────────────────────
  async criarPagamento(input: CriarPagamentoInput): Promise<ResultadoPagamento> {
    const split = input.splits
      .filter(s => s.recipientId) // walletId do vendedor; a comissão fica na conta mestre (resto)
      .map(s => s.percentual != null
        ? { walletId: s.recipientId, percentualValue: s.percentual }
        : { walletId: s.recipientId, fixedValue: reais(s.valorCentavos || 0) })

    const billingType = input.metodo === 'pix' ? 'PIX' : 'CREDIT_CARD'
    const pay = await asaas<{ id: string; status: string }>('/payments', {
      method: 'POST',
      headers: { 'access_token': KEY() },
      body: JSON.stringify({
        billingType,
        value: reais(input.valorCentavos),
        dueDate: new Date().toISOString().slice(0, 10),
        description: input.descricao,
        externalReference: input.pedidoId,
        split,
        ...(input.cardToken ? { creditCardToken: input.cardToken } : {}),
      }),
    })

    if (billingType === 'PIX') {
      const qr = await asaas<{ encodedImage?: string; payload?: string; expirationDate?: string }>(
        `/payments/${pay.id}/pixQrCode`,
      ).catch(() => ({} as Record<string, string>))
      return {
        paymentId: pay.id, status: 'criado',
        pixCopiaCola: qr.payload, pixQrCodeBase64: qr.encodedImage, expiraEm: qr.expirationDate,
      }
    }
    return { paymentId: pay.id, status: pay.status === 'CONFIRMED' ? 'aprovado' : 'processando' }
  },

  async consultarPagamento(paymentId: string): Promise<ResultadoPagamento> {
    const p = await asaas<{ id: string; status: string }>(`/payments/${encodeURIComponent(paymentId)}`)
    const status: ResultadoPagamento['status'] =
      p.status === 'CONFIRMED' || p.status === 'RECEIVED' ? 'aprovado'
      : p.status === 'REFUNDED' || p.status === 'OVERDUE' ? 'recusado' : 'processando'
    return { paymentId: p.id, status }
  },

  async estornar(paymentId: string, valorCentavos?: number): Promise<{ ok: boolean }> {
    await asaas(`/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: 'POST',
      body: JSON.stringify(valorCentavos ? { value: reais(valorCentavos) } : {}),
    })
    return { ok: true }
  },

  // ── Saldo / transferência (o Asaas custodia o dinheiro do vendedor) ───────
  async consultarSaldo(_recipientId: string): Promise<SaldoRecebedor> {
    // Saldo é da subconta (usa a apiKey dela). Espelho real vem via webhooks no ledger.
    const bal = await asaas<{ balance?: number }>('/finance/balance').catch(() => ({ balance: 0 }))
    return {
      recipientId: _recipientId,
      saldoPendenteCentavos: 0,
      saldoDisponivelCentavos: Math.round((bal.balance || 0) * 100),
    }
  },

  async transferir(recipientId: string, valorCentavos: number, idempotencyKey: string): Promise<ResultadoTransferencia> {
    // Pix out pra chave do vendedor. operationType PIX + pixAddressKey.
    const t = await asaas<{ id: string; status: string }>('/transfers', {
      method: 'POST',
      headers: { 'access_token': KEY(), 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ value: reais(valorCentavos), operationType: 'PIX', pixAddressKey: recipientId }),
    })
    return {
      transferId: t.id,
      status: t.status === 'DONE' ? 'paga' : t.status === 'FAILED' ? 'recusada' : 'processando',
    }
  },

  // ── Webhook (Asaas valida por token no header configurado no painel) ──────
  validarAssinaturaWebhook(headers: Headers, _rawBody: string): boolean {
    const token = headers.get('asaas-access-token') || ''
    const esperado = WEBHOOK_TOKEN()
    return !!esperado && token === esperado
  },

  parseWebhook(rawBody: string): EventoWebhook {
    const b = JSON.parse(rawBody) as { event?: string; payment?: { id: string; value?: number; externalReference?: string }; transfer?: { id: string }; account?: { id: string } }
    return {
      tipo: mapEventoWebhook(b.event || ''),
      externalId: b.payment?.id || b.transfer?.id || b.account?.id || '',
      paymentId: b.payment?.id,
      transferId: b.transfer?.id,
      recipientId: b.account?.id,
      valorCentavos: b.payment?.value != null ? Math.round(b.payment.value * 100) : undefined,
      raw: b,
    }
  },
}
