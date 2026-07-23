// ============================================================================
// PaymentProvider — contrato ÚNICO de pagamentos (white-label marketplace)
// ============================================================================
// TODO o resto do sistema fala com esta interface, NUNCA com o SDK/HTTP de um
// provedor específico. Trocar de provedor = escrever um novo arquivo que
// implementa esta interface (ex: asaas.ts, pagarme.ts, iugu.ts) e apontar as
// edge functions pra ele. Nenhuma tabela/tela muda.
//
// Princípios (spec Praia Go):
//   • Comprador NÃO tem conta em provedor nenhum.
//   • Vendedor NÃO cria conta, NÃO instala app, NÃO faz login em provedor.
//     A Praia Go cria o recebedor/subconta por API nos bastidores.
//   • O dinheiro do vendedor fica CUSTODIADO NO PROVEDOR (sem custódia na conta
//     da Praia Go) e é liquidado pelo próprio provedor.
//   • Prazo de liquidação = settlement_delay CONFIGURÁVEL (nunca D+7 no código).
//   • Idempotência e validação de assinatura de webhook são obrigatórias.
// ============================================================================

export type Documento = { tipo: 'CPF' | 'CNPJ'; numero: string }

export type DadosRecebedor = {
  vendedorId: string
  nome: string
  razaoSocial?: string
  documento: Documento
  dataNascimento?: string        // ISO (obrigatório p/ CPF na maioria dos provedores)
  email?: string
  telefone?: string
  endereco?: {
    cep: string; logradouro: string; numero: string; complemento?: string
    bairro: string; cidade: string; uf: string
  }
  // Domicílio de saque: chave Pix OU dados bancários (um dos dois)
  chavePix?: string
  banco?: { banco: string; agencia: string; conta: string; tipoConta: 'corrente' | 'poupanca'; titular: string }
}

export type KycDocs = {
  // Documentos p/ KYC (base64), conforme exigência do provedor
  documentoIdentidade?: string   // RG/CNH
  comprovanteEndereco?: string
  contratoSocial?: string        // p/ CNPJ
  selfie?: string
}

export type StatusRecebedor = {
  recipientId: string
  status: 'pendente' | 'ativo' | 'bloqueado' | 'recusado'
  kycStatus: 'pendente' | 'em_analise' | 'aprovado' | 'reprovado'
  motivo?: string
}

export type SplitRule = {
  // Quem recebe o quê no pagamento (split automático no provedor)
  recipientId: string
  // valor fixo em centavos OU percentual (0-100) — o provider decide o formato
  valorCentavos?: number
  percentual?: number
  // esse recebedor arca com a tarifa do provedor / é responsável por estorno?
  arcaTarifa?: boolean
  responsavelEstorno?: boolean
}

export type CriarPagamentoInput = {
  pedidoId: string               // external_reference (idempotência)
  metodo: 'pix' | 'credito' | 'debito'
  valorCentavos: number
  descricao: string
  // Split: comissão Praia Go (conta mestre) + líquido do vendedor (recebedor)
  splits: SplitRule[]
  // cartão: token gerado no app (checkout transparente). pix: ignorado.
  cardToken?: string
  parcelas?: number
  pagador?: { nome?: string; email?: string; documento?: Documento }
  idempotencyKey: string
}

export type ResultadoPagamento = {
  paymentId: string
  status: 'criado' | 'processando' | 'aprovado' | 'recusado'
  // pix transparente:
  pixCopiaCola?: string
  pixQrCodeBase64?: string
  expiraEm?: string
  // cartão:
  statusDetalhe?: string
}

export type ResultadoTransferencia = {
  transferId: string
  status: 'solicitada' | 'processando' | 'paga' | 'recusada'
  motivo?: string
}

export type SaldoRecebedor = {
  recipientId: string
  saldoPendenteCentavos: number     // ainda não liquidado pelo provedor
  saldoDisponivelCentavos: number   // liquidado e sacável
  previsaoLiquidacao?: string
}

export type EventoWebhook = {
  tipo:
    | 'pagamento_criado' | 'pagamento_aprovado' | 'pagamento_recusado'
    | 'saldo_liberado' | 'transferencia_realizada' | 'transferencia_recusada'
    | 'reembolso' | 'chargeback'
    | 'recebedor_aprovado' | 'recebedor_reprovado'
    | 'desconhecido'
  externalId: string               // id do recurso no provedor (idempotência)
  paymentId?: string
  recipientId?: string
  transferId?: string
  valorCentavos?: number
  raw: unknown
}

/**
 * Contrato que Pagar.me (atual) / Asaas / Iugu implementam. Métodos podem lançar erro;
 * quem chama trata e nunca credita/debita sem uma entrada no ledger.
 */
export interface PaymentProvider {
  readonly nome: 'pagarme' | 'asaas' | 'iugu'

  // ── Onboarding / KYC (recebedor criado por API, vendedor não sai do app) ──
  criarRecebedor(dados: DadosRecebedor): Promise<StatusRecebedor>
  enviarKyc(recipientId: string, docs: KycDocs): Promise<StatusRecebedor>
  consultarRecebedor(recipientId: string): Promise<StatusRecebedor>

  // ── Checkout transparente + split automático ──────────────────────────────
  criarPagamento(input: CriarPagamentoInput): Promise<ResultadoPagamento>
  consultarPagamento(paymentId: string): Promise<ResultadoPagamento>
  estornar(paymentId: string, valorCentavos?: number): Promise<{ ok: boolean }>

  // ── Saldo / liquidação / transferência (provedor custodia o dinheiro) ─────
  consultarSaldo(recipientId: string): Promise<SaldoRecebedor>
  transferir(recipientId: string, valorCentavos: number, idempotencyKey: string): Promise<ResultadoTransferencia>

  // ── Webhooks (assinatura + normalização) ──────────────────────────────────
  validarAssinaturaWebhook(headers: Headers, rawBody: string): boolean
  parseWebhook(rawBody: string): EventoWebhook
}
