// Horário de funcionamento das lojas (definido pelo restaurante/ambulante no
// perfil dele). Tudo em horário de São Paulo, formato HH:MM.

function minutosAgoraSp(): number {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
  const [h, m] = partes.split(':').map(Number)
  return h * 60 + m
}

/** Dia da semana em São Paulo: 0 = domingo … 6 = sábado. */
function diaSemanaSp(): number {
  const nome = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
  }).format(new Date())
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(nome)
}

function paraMinutos(hhmm?: string | null): number | null {
  if (!hhmm) return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

// ── Horário por dia da semana ───────────────────────────────────────────────

export type DiaHorario = {
  /** 0 = domingo … 6 = sábado */
  dia: number
  aberto: boolean
  abre?: string | null
  fecha?: string | null
  vinte_quatro_horas?: boolean
}

export const NOMES_DOS_DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
export const SIGLAS_DOS_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** Aceita o que vier do banco (jsonb) sem confiar no formato. */
export function lerHorarios(bruto: unknown): DiaHorario[] | null {
  if (!Array.isArray(bruto)) return null
  const dias: DiaHorario[] = []
  for (const item of bruto) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const dia = Number(o.dia)
    if (!Number.isInteger(dia) || dia < 0 || dia > 6) continue
    dias.push({
      dia,
      aberto: o.aberto !== false,
      abre: typeof o.abre === 'string' ? o.abre : null,
      fecha: typeof o.fecha === 'string' ? o.fecha : null,
      vinte_quatro_horas: o.vinte_quatro_horas === true,
    })
  }
  return dias.length ? dias : null
}

/** Cria a grade padrão: todo dia aberto no mesmo horário. */
export function horariosPadrao(abre = '09:00', fecha = '18:00'): DiaHorario[] {
  return Array.from({ length: 7 }, (_, dia) => ({ dia, aberto: true, abre, fecha }))
}

/**
 * true se AGORA está dentro do horário, considerando o DIA da semana.
 *
 * A conta do dia tem uma sutileza: um horário que vira a madrugada (ex.: sábado
 * 22:00 → 04:00) ainda está valendo às 02:00 de DOMINGO. Então, quando a hora
 * atual é menor que o horário de abertura, quem manda é a regra do dia
 * ANTERIOR — senão a loja "fecharia" sozinha à meia-noite, no melhor momento de
 * venda de praia.
 */
export function dentroDosHorarios(horarios: DiaHorario[]): boolean {
  const agora = minutosAgoraSp()
  const hoje = diaSemanaSp()
  const ontem = (hoje + 6) % 7

  const doDia = (d: number) => horarios.find(h => h.dia === d) ?? null

  // 1) A regra de hoje pega o horário normal (e o começo de um turno noturno).
  const h = doDia(hoje)
  if (h && h.aberto) {
    if (h.vinte_quatro_horas) return true
    const a = paraMinutos(h.abre)
    const f = paraMinutos(h.fecha)
    if (a != null && f != null) {
      if (a === f) return true // 24h escrito como 00:00→00:00
      if (a < f) { if (agora >= a && agora < f) return true }
      else if (agora >= a) return true // entrou no turno que vai virar o dia
    }
  }

  // 2) Sobra do turno de ontem que atravessou a meia-noite.
  const o = doDia(ontem)
  if (o && o.aberto && !o.vinte_quatro_horas) {
    const a = paraMinutos(o.abre)
    const f = paraMinutos(o.fecha)
    if (a != null && f != null && a > f && agora < f) return true
  }

  return false
}

/**
 * Está aberto agora? Aceita os dois formatos:
 *  - `horarios` (por dia da semana) quando existir;
 *  - senão cai no par único abre/fecha, que é o formato antigo.
 * Sem nenhum dos dois → null (quem chama decide).
 */
export function estaAbertoAgora(
  horarios: unknown,
  abre?: string | null,
  fecha?: string | null,
): boolean | null {
  const grade = lerHorarios(horarios)
  if (grade) return dentroDosHorarios(grade)
  return dentroDoHorario(abre, fecha)
}

// ── Formato antigo (um par abre/fecha pra semana toda) ──────────────────────
// Mantido porque nem toda loja migrou: enquanto houver perfil sem `horarios`,
// remover isto deixaria essas lojas como "sem horário".

export function dentroDoHorario(abre?: string | null, fecha?: string | null): boolean | null {
  const a = paraMinutos(abre)
  const f = paraMinutos(fecha)
  if (a == null || f == null) return null
  const agora = minutosAgoraSp()
  if (a === f) return true // 24h
  if (a < f) return agora >= a && agora < f
  return agora >= a || agora < f // vira a madrugada
}

/** Texto amigável tipo iFood: "Aberto · fecha às 22:00" / "Fechado · abre às 18:00". */
export function labelHorario(aberto: boolean, abre?: string | null, fecha?: string | null): string {
  if (aberto) return fecha ? `Aberto · fecha às ${fecha}` : 'Aberto agora'
  return abre ? `Fechado · abre às ${abre}` : 'Fechado no momento'
}

/**
 * Texto do estado atual usando a grade por dia — sabe dizer quando reabre,
 * inclusive se for só depois de amanhã (loja que fecha segunda e terça).
 */
export function labelHorarioSemana(horarios: DiaHorario[]): string {
  const hoje = diaSemanaSp()
  const aberto = dentroDosHorarios(horarios)

  if (aberto) {
    const h = horarios.find(x => x.dia === hoje)
    if (h?.vinte_quatro_horas) return 'Aberto 24 horas'
    // Quem está segurando o turno pode ser o dia de ontem (turno da madrugada).
    const fecha = h?.fecha ?? horarios.find(x => x.dia === (hoje + 6) % 7)?.fecha
    return fecha ? `Aberto · fecha às ${fecha}` : 'Aberto agora'
  }

  // Procura o próximo dia com atendimento, começando por hoje.
  for (let i = 0; i < 7; i++) {
    const d = (hoje + i) % 7
    const h = horarios.find(x => x.dia === d)
    if (!h || !h.aberto) continue
    if (i === 0 && h.abre) return `Fechado · abre às ${h.abre}`
    if (i === 0) continue
    const quando = i === 1 ? 'amanhã' : NOMES_DOS_DIAS[d].toLowerCase()
    return h.vinte_quatro_horas ? `Fechado · abre ${quando}` : `Fechado · abre ${quando} às ${h.abre}`
  }
  return 'Fechado no momento'
}

/** Resumo pro cliente: agrupa dias seguidos com o mesmo horário. */
export function resumoDaSemana(horarios: DiaHorario[]): string[] {
  const texto = (h: DiaHorario) =>
    !h.aberto ? 'Fechado'
      : h.vinte_quatro_horas ? '24 horas'
        : h.abre && h.fecha ? `${h.abre} às ${h.fecha}` : 'Fechado'

  const linhas: string[] = []
  let i = 0
  // Começa na segunda, que é como todo mundo lê horário de loja.
  const ordem = [1, 2, 3, 4, 5, 6, 0]
  while (i < ordem.length) {
    const atual = horarios.find(h => h.dia === ordem[i])
    if (!atual) { i++; continue }
    const t = texto(atual)
    let j = i
    while (j + 1 < ordem.length) {
      const prox = horarios.find(h => h.dia === ordem[j + 1])
      if (!prox || texto(prox) !== t) break
      j++
    }
    const de = SIGLAS_DOS_DIAS[ordem[i]]
    const ate = SIGLAS_DOS_DIAS[ordem[j]]
    linhas.push(`${i === j ? de : `${de} a ${ate}`} · ${t}`)
    i = j + 1
  }
  return linhas
}
