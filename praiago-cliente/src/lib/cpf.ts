export function apenasDigitosCpf(valor: string) {
  return valor.replace(/\D/g, '').slice(0, 11)
}

export function formatarCpf(valor: string) {
  const d = apenasDigitosCpf(valor)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/**
 * CPF para MOSTRAR na tela: `***.224.548-**`.
 *
 * A tela de perfil imprimia o CPF inteiro depois de validado. Nao havia motivo:
 * quem esta olhando ja sabe o proprio numero, e o que a tela precisa dizer e
 * "esta validado". Documento completo aparecendo em tela e algo que so ajuda
 * quem esta ao lado, ou quem pegou o aparelho.
 */
export function cpfMascarado(valor: string) {
  const d = apenasDigitosCpf(valor)
  if (d.length !== 11) return ''
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
}

export function validarCpf(valor: string) {
  const d = apenasDigitosCpf(valor)
  if (d.length !== 11 || d === d[0].repeat(11)) return false

  let soma = 0
  for (let i = 0; i < 9; i += 1) soma += Number(d[i]) * (10 - i)
  let digito = 11 - (soma % 11)
  if (digito >= 10) digito = 0
  if (digito !== Number(d[9])) return false

  soma = 0
  for (let i = 0; i < 10; i += 1) soma += Number(d[i]) * (11 - i)
  digito = 11 - (soma % 11)
  if (digito >= 10) digito = 0
  return digito === Number(d[10])
}
