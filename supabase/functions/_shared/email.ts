type EmailPayload = {
  to: string
  subject: string
  html: string
  text?: string
}

export function emailEnv(name: string, fallback = '') {
  return Deno.env.get(name) || fallback
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function sendTransactionalEmail(payload: EmailPayload) {
  const from = emailEnv('EMAIL_FROM', 'PraiaGo <noreply@praiago.local>')
  const text = payload.text || stripHtml(payload.html)
  const resendKey = emailEnv('RESEND_API_KEY')
  if (resendKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text,
      }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.message || 'Falha ao enviar e-mail via Resend.')
    return { provider: 'resend', data }
  }

  const mailgunKey = emailEnv('MAILGUN_API_KEY')
  const mailgunDomain = emailEnv('MAILGUN_DOMAIN')
  if (mailgunKey && mailgunDomain) {
    const body = new URLSearchParams()
    body.set('from', from)
    body.set('to', payload.to)
    body.set('subject', payload.subject)
    body.set('html', payload.html)
    body.set('text', text)
    const res = await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`api:${mailgunKey}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.message || 'Falha ao enviar e-mail via Mailgun.')
    return { provider: 'mailgun', data }
  }

  return { provider: 'not_configured', data: null }
}
