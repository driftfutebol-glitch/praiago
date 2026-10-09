import { alertDialog, promptDialog } from './dialog'
import { validExceptionReason } from './adminExceptions'

export async function askExceptionReason(title: string, message: string): Promise<string | null> {
  const reason = await promptDialog({ title, message, placeholder: 'Descreva o ocorrido e a conferência realizada', confirmText: 'Continuar' })
  if (reason === null) return null
  if (!validExceptionReason(reason)) {
    await alertDialog({ title: 'Motivo obrigatório', message: 'Descreva o motivo com 15 a 500 caracteres. A ação ficará no histórico de auditoria.', tone: 'danger' })
    return null
  }
  return reason.trim()
}
