// Pedido de troca do nome da banca (precisa de aprovacao do admin).
//
// Por que o vendedor nao troca sozinho: o nome e o que o cliente reconhece na
// busca, no historico de pedidos e nas avaliacoes. Troca livre deixaria
// qualquer banca "renascer limpa" depois de uma sequencia de notas ruins — a
// reputacao ficaria presa a um rotulo descartavel.
//
// O banco ja garante as regras (RLS por dono + indice unico parcial
// `uniq_troca_nome_pendente`). Este modulo so traduz os erros do Postgres em
// frases que o vendedor entende.
import { supabase } from './supabase'

export type StatusTrocaNome = 'pendente' | 'aprovada' | 'recusada' | 'cancelada'

export type SolicitacaoTrocaNome = {
  id: string
  nome_atual: string
  nome_novo: string
  motivo: string | null
  status: StatusTrocaNome
  observacao_admin: string | null
  created_at: string
  decidido_em: string | null
}

export const MIN_NOME_LOJA = 3
export const MAX_NOME_LOJA = 60
export const MIN_MOTIVO_TROCA = 10

const COLUNAS = 'id,nome_atual,nome_novo,motivo,status,observacao_admin,created_at,decidido_em'

/** Colapsa espacos repetidos: "Agua  do  Ze" e "Agua do Ze" sao o mesmo nome. */
export function normalizarNomeLoja(valor: string) {
  return String(valor ?? '').trim().replace(/\s+/g, ' ')
}

export function validarPedidoTrocaNome(nomeNovo: string, nomeAtual: string, motivo: string): string {
  const novo = normalizarNomeLoja(nomeNovo)
  if (novo.length < MIN_NOME_LOJA) return `O nome novo precisa ter pelo menos ${MIN_NOME_LOJA} letras.`
  if (novo.length > MAX_NOME_LOJA) return `O nome novo pode ter no maximo ${MAX_NOME_LOJA} caracteres.`
  // Sem essa checagem o vendedor gastaria um pedido (e a fila do admin) so pra
  // corrigir um espaco ou a caixa das letras.
  if (novo.toLowerCase() === normalizarNomeLoja(nomeAtual).toLowerCase()) {
    return 'Esse ja e o nome atual da banca.'
  }
  if (normalizarNomeLoja(motivo).length < MIN_MOTIVO_TROCA) {
    return 'Explique em poucas palavras por que precisa trocar o nome.'
  }
  return ''
}

export async function ultimaSolicitacaoTrocaNome(vendedorId: string) {
  const { data } = await supabase
    .from('solicitacoes_troca_nome')
    .select(COLUNAS)
    .eq('vendedor_id', vendedorId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as SolicitacaoTrocaNome | null) ?? null
}

export type ResultadoTrocaNome =
  | { ok: true; solicitacao: SolicitacaoTrocaNome }
  | { ok: false; erro: string }

export async function pedirTrocaNome(input: {
  vendedorId: string
  nomeAtual: string
  nomeNovo: string
  motivo: string
}): Promise<ResultadoTrocaNome> {
  const { data, error } = await supabase
    .from('solicitacoes_troca_nome')
    .insert({
      vendedor_id: input.vendedorId,
      nome_atual: normalizarNomeLoja(input.nomeAtual),
      nome_novo: normalizarNomeLoja(input.nomeNovo),
      motivo: normalizarNomeLoja(input.motivo) || null,
      status: 'pendente',
    })
    .select(COLUNAS)
    .single()

  if (error) return { ok: false, erro: mensagemDoErro(error.code) }
  return { ok: true, solicitacao: data as SolicitacaoTrocaNome }
}

/** Desistir do pedido enquanto ninguem decidiu. A RLS so aceita se for do dono. */
export async function cancelarTrocaNome(id: string): Promise<ResultadoTrocaNome> {
  const { data, error } = await supabase
    .from('solicitacoes_troca_nome')
    .update({ status: 'cancelada' })
    .eq('id', id)
    .eq('status', 'pendente')
    .select(COLUNAS)
    .maybeSingle()

  if (error) return { ok: false, erro: mensagemDoErro(error.code) }
  if (!data) return { ok: false, erro: 'Esse pedido ja foi decidido pela equipe.' }
  return { ok: true, solicitacao: data as SolicitacaoTrocaNome }
}

function mensagemDoErro(code?: string) {
  // 23505 = o indice unico parcial barrou um segundo pedido pendente. E a
  // regra "um pedido por vez" funcionando; sem traduzir, o vendedor veria o
  // texto cru do Postgres.
  if (code === '23505') return 'Voce ja tem um pedido de troca em analise. Aguarde a resposta da equipe.'
  if (code === '42501') return 'Sua conta nao pode pedir troca de nome agora. Fale com o suporte.'
  return 'Nao deu pra enviar o pedido agora. Tente de novo em instantes.'
}
