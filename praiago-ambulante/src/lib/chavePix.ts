// Validacao de chave Pix (DICT do Banco Central).
// Existem exatamente 5 tipos e mais nada. Aceitar texto livre aqui e pior do
// que parece: o cadastro "funciona", o vendedor acha que esta tudo certo, e o
// erro so aparece semanas depois — na hora do saque, com o dinheiro parado.
export type TipoChavePix = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria'

export type ChavePixOk = { ok: true; tipo: TipoChavePix; valor: string; rotulo: string }
export type ChavePixErro = { ok: false; erro: string }
export type ChavePixResultado = ChavePixOk | ChavePixErro

/** Texto pronto pra mostrar na tela dizendo o que o vendedor pode cadastrar. */
export const TIPOS_CHAVE_PIX = 'CPF, CNPJ, celular com DDD, e-mail ou chave aleatória'

function digitos(v: string) {
  return String(v ?? '').replace(/\D/g, '')
}

function cpfValido(cpf: string) {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false
  let soma = 0
  for (let i = 0; i < 9; i++) soma += Number(cpf[i]) * (10 - i)
  let d1 = (soma * 10) % 11
  if (d1 === 10) d1 = 0
  if (d1 !== Number(cpf[9])) return false
  soma = 0
  for (let i = 0; i < 10; i++) soma += Number(cpf[i]) * (11 - i)
  let d2 = (soma * 10) % 11
  if (d2 === 10) d2 = 0
  return d2 === Number(cpf[10])
}

function cnpjValido(cnpj: string) {
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false
  const calc = (base: string, pesos: number[]) => {
    const soma = base.split('').reduce((a, n, i) => a + Number(n) * pesos[i], 0)
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  const d1 = calc(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  if (d1 !== Number(cnpj[12])) return false
  const d2 = calc(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return d2 === Number(cnpj[13])
}

/**
 * Reconhece o tipo da chave e devolve JA NORMALIZADA no formato que o provedor
 * de Pix espera (CPF/CNPJ so digitos, telefone com +55, e-mail minusculo).
 * Guardar normalizado evita o classico "cadastrei com ponto e o saque falhou".
 */
export function validarChavePix(bruto: string): ChavePixResultado {
  const v = String(bruto ?? '').trim()
  if (!v) return { ok: false, erro: 'Digite sua chave Pix.' }

  // Chave aleatoria (EVP): UUID de 32 hex. Checa antes de tudo porque tem
  // formato proprio e nao se confunde com nenhum outro tipo.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    return { ok: true, tipo: 'aleatoria', valor: v.toLowerCase(), rotulo: 'Chave aleatória' }
  }

  if (v.includes('@')) {
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v) || v.length > 77) {
      return { ok: false, erro: 'E-mail inválido. Confira e tente de novo.' }
    }
    return { ok: true, tipo: 'email', valor: v.toLowerCase(), rotulo: 'E-mail' }
  }

  const d = digitos(v)
  if (!d) {
    return { ok: false, erro: `Chave Pix não reconhecida. Use ${TIPOS_CHAVE_PIX}.` }
  }

  // 11 digitos e ambiguo (CPF ou celular): o digito verificador decide.
  if (d.length === 11 && cpfValido(d)) {
    return { ok: true, tipo: 'cpf', valor: d, rotulo: 'CPF' }
  }
  if (d.length === 14) {
    if (!cnpjValido(d)) return { ok: false, erro: 'CNPJ inválido. Confira os números.' }
    return { ok: true, tipo: 'cnpj', valor: d, rotulo: 'CNPJ' }
  }
  if (d.length === 10 || d.length === 11) {
    return { ok: true, tipo: 'telefone', valor: `+55${d}`, rotulo: 'Celular' }
  }
  // Ja veio com o codigo do pais
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    return { ok: true, tipo: 'telefone', valor: `+${d}`, rotulo: 'Celular' }
  }

  if (d.length === 11) return { ok: false, erro: 'CPF inválido. Confira os números.' }
  return { ok: false, erro: `Chave Pix não reconhecida. Use ${TIPOS_CHAVE_PIX}.` }
}

/** Esconde o miolo da chave pra exibir em tela sem vazar o dado inteiro. */
export function mascararChavePix(chave: string): string {
  const v = String(chave ?? '').trim()
  if (v.length <= 6) return v
  if (v.includes('@')) {
    const [nome, dominio] = v.split('@')
    const visivel = nome.slice(0, 2)
    return `${visivel}${'•'.repeat(Math.max(2, nome.length - 2))}@${dominio}`
  }
  return `${v.slice(0, 3)}${'•'.repeat(Math.max(3, v.length - 6))}${v.slice(-3)}`
}
