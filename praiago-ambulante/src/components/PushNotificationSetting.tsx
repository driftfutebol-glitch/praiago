import { useEffect, useRef, useState } from 'react'
import { Bell, BellRing, Settings2, Volume2 } from 'lucide-react'
import { enablePush, usePushState } from '../lib/pushNotifications'
import { supabase } from '../lib/supabase'
import { hasNotificationOptions, openNotificationSettings, previewNotificationSound } from '../lib/nativeNotificationOptions'
import { useSessao } from '../lib/auth'
const app = 'ambulante' as const
export default function PushNotificationSetting() {
  const state = usePushState()
  const userId = useSessao()?.id
  const [news, setNews] = useState(false)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const currentUser = useRef(userId)
  currentUser.current = userId
  useEffect(() => {
    let active = true
    setReady(false); setNews(false); setSaving(false); setMessage('')
    if (!userId || !state.supported) return
    void Promise.resolve(supabase.rpc('get_push_preference', { p_app: app })).then(({ data, error }) => {
      if (!active) return
      if (!error) { setNews(data === true); setReady(true) }
    }).catch(() => { /* Keep optional notices disabled until the preference can be read. */ })
    return () => { active = false }
  }, [userId, state.supported])
  if (!state.supported) return null
  const nativeOptions = hasNotificationOptions()
  async function saveNews(enabled: boolean) {
    if (!ready || saving) return
    setSaving(true); setMessage('')
    const requestUser = userId
    try {
      const { error } = await supabase.rpc('set_push_preference', { p_app: app, p_enabled: enabled })
      if (currentUser.current !== requestUser) return
      if (error) throw error
      setNews(enabled); setMessage(enabled ? 'Novidades autorizadas. Você pode desativar quando quiser.' : 'Novidades desativadas. Avisos dos seus pedidos continuam separados.')
    } catch {
      if (currentUser.current === requestUser) setMessage('Não foi possível salvar. Sua preferência anterior foi mantida.')
    } finally {
      if (currentUser.current === requestUser) setSaving(false)
    }
  }
  async function action(job: () => Promise<void>) {
    setMessage('')
    try { await job() } catch (e) { setMessage(e instanceof Error ? e.message : 'Confira as configurações do Android.') }
  }
  const button = { minHeight: 44, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--pg-line,var(--line))', background: 'var(--pg-surface-alt,#f2f7fa)', color: 'var(--pg-ink,var(--ink-strong))', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 } as const
  return <section aria-label="Central de notificações no Perfil" style={{ padding: 18, margin: '14px 0', borderRadius: 20, border: '1px solid var(--pg-line,var(--line))', background: 'var(--pg-surface,#ffffff)', color: 'var(--pg-ink,var(--ink-strong))', overflow: 'hidden' }}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <img src="/praiago-notification-logo.png" alt="PraiaGo" style={{ width: 46, height: 46, borderRadius: 13, flexShrink: 0 }}/>
      <div><h3 style={{ fontSize: 16, fontWeight: 900, margin: 0 }}>Central de notificações</h3>
        <p style={{ fontSize: 12, color: 'var(--pg-muted,var(--muted))', margin: '4px 0 0' }}>Pedidos, novidades e som PraiaGo.</p></div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 15, padding: 12, borderRadius: 12, background: 'var(--pg-brand-soft,#edf8ff)', fontSize: 12, lineHeight: 1.6 }}>
      {state.registered ? <BellRing size={18}/> : <Bell size={18}/>}
      <span>{state.registered ? 'Aparelho registrado para avisos de pedidos.' : 'Ative os avisos para acompanhar seus pedidos fora do app.'}</span>
    </div>
    {!state.registered && <button type="button" disabled={state.busy} onClick={() => void enablePush()} style={{ ...button, width: '100%', marginTop: 12 }}>
      {state.busy ? 'Ativando…' : state.permission === 'denied' ? 'Tentar ativar novamente' : 'Ativar avisos de pedidos'}
    </button>}
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0', marginTop: 4, borderBottom: '1px solid var(--pg-line,var(--line))', fontSize: 13 }}>
      <div style={{ flex: 1 }}><strong>Receber novidades do PraiaGo</strong><p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--pg-muted,var(--muted))', lineHeight: 1.6 }}>Avisos opcionais do Admin. Desativar não cancela os avisos dos pedidos.</p></div>
      <input type="checkbox" role="switch" aria-label="Receber novidades do PraiaGo" checked={news} disabled={!ready || saving} onChange={e => void saveNews(e.target.checked)} style={{ width: 22, height: 22, flexShrink: 0, accentColor: '#0891b2' }}/>
    </label>
    {!ready && <p style={{ fontSize: 11, color: 'var(--pg-muted,var(--muted))' }}>Conecte-se para carregar sua preferência de novidades.</p>}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
      <button type="button" style={button} onClick={() => void action(previewNotificationSound)} disabled={!nativeOptions}><Volume2 size={17}/>Ouvir som PraiaGo</button>
      <button type="button" style={button} onClick={() => void action(openNotificationSettings)} disabled={!nativeOptions}><Settings2 size={17}/>Ajustar no Android</button>
    </div>
    {!nativeOptions && <p style={{ fontSize: 11, color: 'var(--pg-muted,var(--muted))' }}>O som próprio e estes atalhos precisam da nova versão instalada pela Play Store.</p>}
    {(message || state.message) && <p role="status" style={{ fontSize: 12, lineHeight: 1.6, marginTop: 12 }}>{message || state.message}</p>}
    <p style={{ fontSize: 10, color: 'var(--pg-muted,var(--muted))', margin: '12px 0 0', lineHeight: 1.6 }}>Logo, banner, som e vibração seguem as configurações do Android. O modo silencioso e Não Perturbe são respeitados.</p>
  </section>
}
