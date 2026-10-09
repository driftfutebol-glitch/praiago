// Shared by the customer catalogue and restaurant dashboard. São Paulo time,
// including yesterday's overnight shift. No automatic fallback to "online".
export type SellerSchedule = {
  horarios?: unknown
  horario_abre?: string | null
  horario_fecha?: string | null
}
function minutes(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim())
  if (!match) return null
  const h = Number(match[1]), m = Number(match[2])
  return h <= 23 && m <= 59 ? h * 60 + m : null
}
export function restaurantOpen(schedule: SellerSchedule, date = new Date()): boolean | null {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const value = (type: string) => parts.find(p => p.type === type)?.value || ''
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday'))
  const now = Number(value('hour')) * 60 + Number(value('minute'))
  const rows = Array.isArray(schedule.horarios) ? schedule.horarios.filter(
    (row): row is Record<string, unknown> => !!row && typeof row === 'object'
      && Number.isInteger(Number(row.dia)) && Number(row.dia) >= 0 && Number(row.dia) <= 6,
  ) : []
  if (rows.length) {
    const today = rows.find(r => Number(r.dia) === day)
    if (today && today.aberto !== false) {
      if (today.vinte_quatro_horas === true) return true
      const a = minutes(today.abre), f = minutes(today.fecha)
      if (a !== null && f !== null && (a === f || (a < f ? now >= a && now < f : now >= a))) return true
    }
    const yesterday = rows.find(r => Number(r.dia) === (day + 6) % 7)
    if (yesterday && yesterday.aberto !== false && yesterday.vinte_quatro_horas !== true) {
      const a = minutes(yesterday.abre), f = minutes(yesterday.fecha)
      if (a !== null && f !== null && a > f && now < f) return true
    }
    return false
  }
  const a = minutes(schedule.horario_abre), f = minutes(schedule.horario_fecha)
  if (a === null || f === null) return null
  return a === f || (a < f ? now >= a && now < f : now >= a || now < f)
}
export function sellerOpen(role: string, online: boolean | null | undefined, schedule: SellerSchedule, date = new Date()): boolean {
  if (role === 'ambulante') return online === true
  if (role === 'restaurante') return restaurantOpen(schedule, date) === true
  return false
}
