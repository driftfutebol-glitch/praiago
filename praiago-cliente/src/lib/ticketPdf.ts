import { create } from 'qrcode'
import { ticketQrPayload, type OwnedTicket } from './ownedTickets'
import { renderTicketPdfWithMatrix } from '../../../supabase/functions/_shared/event-ticket-pdf-core'

export function createTicketPdf(ticket: OwnedTicket): Blob {
  const qr = create(ticketQrPayload(ticket), { errorCorrectionLevel: 'M' })
  return new Blob([new Uint8Array(renderTicketPdfWithMatrix(ticket, qr.modules)).buffer], { type: 'application/pdf' })
}

export async function exportTicketPdf(ticket: OwnedTicket): Promise<void> {
  const blob = createTicketPdf(ticket), filename = `PraiaGo-ingresso-${ticket.order_id.slice(0, 8)}-${ticket.ordinal}.pdf`
  const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  if (capacitor?.isNativePlatform?.()) {
    const file = new File([blob], filename, { type: 'application/pdf' })
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: ticket.event.titulo })
      return
    }
    throw new Error('O QR já está disponível nesta tela. Para baixar o PDF, abra sua conta PraiaGo no navegador; este aparelho não permite exportar arquivos pelo app.')
  }
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = filename; anchor.style.display = 'none'
    document.body.appendChild(anchor); anchor.click(); anchor.remove()
  } finally { window.setTimeout(() => URL.revokeObjectURL(url), 60_000) }
}
