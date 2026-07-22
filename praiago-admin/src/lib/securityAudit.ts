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
    // nao exige sessao: eventos pre-login (login_failed/access_denied/reset) sao os mais importantes
    await supabase.rpc('log_security_event', {
      p_event_type: eventType,
      p_platform: 'admin',
      p_email: email ? email.trim().toLowerCase() : null,
      p_user_agent: navigator.userAgent,
      p_route: window.location.pathname,
      p_metadata: metadata,
    })
  } catch (error) {
    console.warn('Falha ao registrar auditoria de seguranca', error)
  }
}
