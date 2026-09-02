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

  // SMTP direto — e por aqui que o Google Workspace entra. Nao ha API HTTP de
  // envio no Workspace sem montar OAuth de service account com delegacao de
  // dominio; SMTP com senha de app resolve o mesmo com uma variavel.
  //
  // Porta 465 com TLS implicito de proposito: no ambiente das Edge Functions o
  // STARTTLS da 587 e o que costuma falhar.
  const smtpUser = emailEnv('SMTP_USER')
  const smtpPassword = emailEnv('SMTP_PASSWORD')
  if (smtpUser && smtpPassword) {
    const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts')
    const client = new SMTPClient({
      connection: {
        hostname: emailEnv('SMTP_HOST', 'smtp.gmail.com'),
        port: Number(emailEnv('SMTP_PORT', '465')),
        tls: true,
        auth: { username: smtpUser, password: smtpPassword },
      },
    })
    try {
      await client.send({
        // O Gmail reescreve o remetente que nao pertence a conta autenticada.
        // Se EMAIL_FROM apontar para outro endereco, o que chega e o smtpUser —
        // entao vale manter os dois iguais.
        from,
        to: payload.to,
        subject: payload.subject,
        content: text,
        html: payload.html,
      })
      return { provider: 'smtp', data: null }
    } finally {
      await client.close()
    }
  }

  // Sem RESEND_API_KEY nem MAILGUN_*, esta funcao sempre devolveu 'not_configured'
  // e quem chamou seguiu em frente como se tivesse enviado. O aviso de chamado
  // de KYC e o aviso de exclusao de conta sumiram assim, sem uma linha de log —
  // o unico sintoma era ninguem receber nada.
  //
  // Continua sem lancar erro de proposito: e-mail que nao sai nao pode derrubar
  // a operacao que o disparou. Mas agora aparece no log da funcao.
  console.error(
    `[email] NAO ENVIADO para ${payload.to} ("${payload.subject}"): ` +
    'nenhum provedor configurado. Defina SMTP_USER + SMTP_PASSWORD (Google Workspace), ' +
    'ou RESEND_API_KEY, ou MAILGUN_API_KEY + MAILGUN_DOMAIN nos secrets do projeto.',
  )
  return { provider: 'not_configured', data: null }
}
