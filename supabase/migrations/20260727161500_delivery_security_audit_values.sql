-- Delivery confirmation records a dedicated event and seller-app source.
-- Keep the audit constraints explicit while allowing those server values.

alter table public.security_audit_logs
  drop constraint if exists security_audit_logs_event_type_check;
alter table public.security_audit_logs
  add constraint security_audit_logs_event_type_check
  check (
    event_type in (
      'login_success',
      'login_failed',
      'access_denied',
      'signup_created',
      'password_reset_requested',
      'password_changed',
      'fraud_flag_created',
      'suspicious_activity',
      'delivery_code_mismatch'
    )
  );

alter table public.security_audit_logs
  drop constraint if exists security_audit_logs_platform_check;
alter table public.security_audit_logs
  add constraint security_audit_logs_platform_check
  check (
    platform in (
      'cliente',
      'ambulante',
      'restaurante',
      'admin',
      'seller_app',
      'supabase',
      'system',
      'unknown'
    )
  );

alter table public.security_audit_logs
  drop constraint if exists security_audit_logs_severity_check;
alter table public.security_audit_logs
  add constraint security_audit_logs_severity_check
  check (severity in ('info', 'warning', 'error', 'high', 'critical'));
