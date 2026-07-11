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

function paraMinutos(hhmm?: string | null): number | null {
  if (!hhmm) return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

/**
 * true se AGORA está dentro do horário abre→fecha. Suporta horário que vira a
 * noite (ex: 18:00 → 02:00). Sem horário definido → null (quem chama decide).
 */
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
