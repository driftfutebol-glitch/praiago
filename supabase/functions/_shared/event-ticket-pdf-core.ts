export type AdmissionPdfTicket = {
  id?: string; status: string; code: string | null; ordinal: number; order_id: string;
  event: { titulo: string; data: string | null; hora: string | null; local_nome: string | null; endereco: string | null };
  lot: { nome: string; grupo: string | null; ordem?: number | null };
  order: { status: string; payment_status: string; quantidade: number; cliente_nome: string | null; cliente_cpf?: string | null; paid_at: string | null };
}
export type QrMatrix = { size: number; get(row: number, column: number): number | boolean }
export function admissionQrPayload(ticket: AdmissionPdfTicket): string {
  if (ticket.status !== 'valido' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticket.code || '')
    || !['pago', 'entrega_pendente', 'entregue'].includes(ticket.order.status)
    || ticket.order.payment_status !== 'aprovado' || !ticket.order.paid_at) throw new Error('Ingresso indisponível para entrada.')
  return `praiago:ticket:${ticket.code}`
}
function ticketDate(ticket: AdmissionPdfTicket): string {
  if (!ticket.event.data || !/^\d{4}-\d{2}-\d{2}$/.test(ticket.event.data)) return 'Data a confirmar'
  const value = new Date(`${ticket.event.data}T12:00:00`)
  if (!Number.isFinite(value.getTime())) return 'Data a confirmar'
  return `${value.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}${ticket.event.hora ? ` às ${ticket.event.hora.slice(0,5)}` : ''}`
}

// Single-page, vector PDF. Base-14 Helvetica/WinAnsi works offline, without
// downloading fonts, transmitting the admission code, or a large PDF bundle.
const EXTENDED: Record<number, number> = { 0x20ac: 128, 0x2013: 150, 0x2014: 151, 0x2018: 145, 0x2019: 146, 0x201c: 147, 0x201d: 148, 0x2022: 149, 0x2026: 133 }
function literal(value: string): string {
  return `(${Array.from(value).map(character => {
    const point = character.codePointAt(0) || 32
    const byte = point <= 255 ? point : EXTENDED[point] || 63
    if (byte === 40 || byte === 41 || byte === 92) return `\\${String.fromCharCode(byte)}`
    if (byte < 32 || byte > 126) return `\\${byte.toString(8).padStart(3, '0')}`
    return String.fromCharCode(byte)
  }).join('')})`
}
function lines(value: string, max = 43, count = 3): string[] {
  const width = (input: string) => Array.from(input).reduce((sum, character) => sum + (/[WMwm@%]/.test(character) ? 1.85 : /[A-ZÀ-Ý]/.test(character) ? 1.35 : /[il1.,:! ']/.test(character) ? .6 : 1), 0)
  function truncate(input: string, limit: number) {
    let result = input
    while (result && width(result) > limit) result = result.slice(0, -1)
    return `${result}...`
  }
  const words = value.replace(/\s+/g, ' ').trim().split(' ')
  const output: string[] = []
  let current = ''
  for (const original of words) {
    const word = width(original) > max ? truncate(original, max - 3) : original
    if (current && width(`${current} ${word}`) > max) { output.push(current); current = '' }
    current = `${current}${current ? ' ' : ''}${word}`
  }
  if (current) output.push(current)
  if (output.length > count) { output.length = count; output[count - 1] = truncate(output[count - 1], max - 3) }
  return output
}

export function renderTicketPdfWithMatrix(ticket: AdmissionPdfTicket, matrix: QrMatrix): Uint8Array {
  admissionQrPayload(ticket)
  if (!Number.isInteger(matrix.size) || matrix.size < 21 || matrix.size > 177) throw new Error('Invalid QR matrix')
  const qr = { modules: matrix }
  const commands: string[] = ['1 1 1 rg 0 0 420 595 re f', '0.035 0.13 0.16 rg 0 517 420 78 re f']
  function text(value: string, x: number, y: number, size = 11, bold = false, color = '0.035 0.13 0.16') {
    commands.push(`${color} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td ${literal(value)} Tj ET`)
  }
  text('PRAIAGO', 26, 561, 24, true, '1 1 1')
  text('SEU INGRESSO DIGITAL', 26, 538, 10, false, '0.6 0.94 0.84')
  const titleLines = lines(ticket.event.titulo, 36, 2)
  titleLines.forEach((line, index) => text(line, 26, 487 - index * 20, 17, true))
  const infoTop = titleLines.length === 1 ? 455 : 435
  text(ticketDate(ticket), 26, infoTop, 11)
  lines(`${ticket.event.local_nome || 'Local do evento'} - ${ticket.event.endereco || ''}`, 60, 2).forEach((line, index) => text(line, 26, infoTop - 19 - index * 15, 10, false, '0.29 0.37 0.39'))
  text(lines(`${ticket.lot.ordem ? `${ticket.lot.ordem}º lote - ` : ''}${ticket.lot.grupo ? `${ticket.lot.grupo} - ` : ''}${ticket.lot.nome}`, 54, 1)[0], 26, 375, 12, true)
  text(`Ingresso ${ticket.ordinal} de ${ticket.order.quantidade || ticket.ordinal}`, 26, 356, 10)
  if (ticket.order.cliente_nome) text(lines(ticket.order.cliente_nome, 55, 1)[0], 26, 338, 10)
  const cpf = (ticket.order.cliente_cpf || '').replace(/[^0-9]/g, '')
  if (/^\d{11}$/.test(cpf)) text(`CPF: ${cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')}`, 26, 322, 9)

  // Quiet zone >=4 modules and solid black on white, regardless of dark theme.
  const module = 196 / (qr.modules.size + 8), start = 112 + module * 4, base = 112 + module * 4
  commands.push('0 0 0 rg')
  for (let row = 0; row < qr.modules.size; row++) {
    for (let column = 0; column < qr.modules.size; column++) {
      if (qr.modules.get(row, column)) commands.push(`${(start + column * module).toFixed(3)} ${(base + (qr.modules.size - row - 1) * module).toFixed(3)} ${module.toFixed(3)} ${module.toFixed(3)} re f`)
    }
  }
  text('Apresente este QR na portaria.', 123, 98, 10, true)
  text('Entrada única. Não compartilhe o ingresso.', 100, 80, 10)
  text(`Código: ${ticket.code}`, 26, 59, 9)
  text(`Pedido: ${ticket.order_id.toUpperCase()}`, 26, 41, 8, false, '0.29 0.37 0.39')
  text('Cancelamento ou reembolso invalida este ingresso.', 26, 23, 9, false, '0.29 0.37 0.39')

  const content = commands.join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]
  let output = '%PDF-1.4\n', offsets = [0]
  objects.forEach((object, index) => { offsets.push(output.length); output += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xref = output.length
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(output)
}
