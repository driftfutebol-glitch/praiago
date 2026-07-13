import { supabase } from './supabase'

type SecurityEvent =
  | 'login_success'
  | 'login_failed'
  | 'access_denied'
  | 'signup_created'
  | 'password_reset_requested'
  | 'password_changed'
  | 'fraud_flag_created'
  | 'suspicious_activity'

export async function logSecurityEvent(
  eventType: SecurityEvent,
  email?: string | null,
  metadata: Record<string, unknown> = {},
) {
  try {
    const { data } = await supabase.auth.getSession()
    if (!data.session) return

    await supabase.rpc('log_security_event', {
      p_event_type: eventType,
      p_platform: 'ambulante',
      p_email: email ? email.trim().toLowerCase() : null,
      p_user_agent: navigator.userAgent,
      p_route: window.location.pathname,
      p_metadata: metadata,
    })
  } catch (error) {
    console.warn('Falha ao registrar auditoria de seguranca', error)
  }
}
