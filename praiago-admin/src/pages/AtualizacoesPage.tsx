import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { storeUrl, type AppSlug, type StorePlatform } from '../lib/storeUpdates'

type Notice = { id: string; app: AppSlug; platform: StorePlatform; version: string; message: string; status: string; verification_method: string | null; verified_at: string | null; created_at: string }
type Event = { id: number; notice_id: string; action: string; created_at: string }
const labels: Record<string, string> = { pending: 'Aguardando conferência', verified: 'Conferido · falta aprovação', approved: 'Aviso ativo', rejected: 'Negado', paused: 'Pausado' }
const actions: Record<string, string> = { create: 'Cadastrado', verified: 'Loja conferida', approve: 'Aprovado', reject: 'Negado', pause: 'Pausado', replaced: 'Substituído por outro aviso' }
const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-slate-100'
const buttonClass = 'min-h-11 rounded-xl border border-slate-700 px-4 py-2 text-sm font-bold disabled:opacity-40'

export default function AtualizacoesPage() {
  const [notices, setNotices] = useState<Notice[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [app, setApp] = useState<AppSlug>('cliente')
  const [platform, setPlatform] = useState<StorePlatform>('android')
  const [version, setVersion] = useState('')
  const [message, setMessage] = useState('Uma nova versão do PraiaGo está disponível. Atualize pela loja para aproveitar as melhorias.')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [selection, setSelection] = useState<{ notice: Notice; action: 'verify' | 'approve' | 'reject' | 'pause' } | null>(null)
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const reload = useCallback(async () => {
    const [n, e] = await Promise.all([
      supabase.from('app_update_notices').select('id,app,platform,version,message,status,verification_method,verified_at,created_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('app_update_notice_events').select('id,notice_id,action,created_at').order('created_at', { ascending: false }).limit(100),
    ])
    if (n.error || e.error) throw new Error(n.error?.message || e.error?.message)
    setNotices(n.data || []); setEvents(e.data || [])
  }, [])
  useEffect(() => { void reload().catch(e => setError(e.message)) }, [reload])
  async function run(task: () => Promise<void>) {
    setBusy(true); setError(''); setSuccess('')
    try { await task(); await reload() } catch (e) {
      setError(e instanceof Error ? e.message : e && typeof e === 'object' && 'message' in e ? String(e.message) : 'Não foi possível concluir.')
    }
    finally { setBusy(false) }
  }
  function select(notice: Notice, action: 'verify' | 'approve' | 'reject' | 'pause') {
    setSelection({ notice, action }); setReason(''); setConfirmed(false); setError(''); setSuccess('')
  }
  async function execute() {
    if (!selection) return
    const { notice, action } = selection
    await run(async () => {
      if (action === 'verify') {
        const { data, error: invokeError } = await supabase.functions.invoke('admin-app-updates', { body: { id: notice.id, confirmed, evidence: reason } })
        if (invokeError) {
          const context = (invokeError as { context?: Response }).context
          const detail = context ? await context.json().catch(() => null) : null
          throw new Error(detail?.error || invokeError.message)
        }
        if (!data?.ok) throw new Error(data?.error || 'A loja não confirmou a versão.')
        setSuccess('Loja conferida. O aviso ainda está inativo; aprove quando quiser liberá-lo.')
      } else {
        const { error: actionError } = await supabase.rpc('admin_app_update_action', { p_action: action, p_id: notice.id, p_reason: reason || null })
        if (actionError) throw actionError
        setSuccess(action === 'approve' ? 'Aviso autorizado para os apps que já possuem o sistema instalado. Isso não publica uma build na loja.' : 'Aviso atualizado. A próxima consulta dos apps refletirá a mudança.')
      }
      setSelection(null)
    })
  }
  const verifyAndroid = selection?.action === 'verify' && selection.notice.platform === 'android'
  const destructive = selection?.action === 'reject' || selection?.action === 'pause'
  return <div className="mx-auto max-w-5xl space-y-6 text-slate-100">
    <header><h1 className="text-3xl font-black">Atualizações dos aplicativos</h1><p className="mt-2 text-slate-400">Cliente e Ambulante · Play Store e App Store · controle exclusivo do dono.</p></header>
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
      Cadastrar não envia aviso. Confira a publicação na loja, depois aprove. O aviso é opcional e não interrompe pedidos. OTA instala o sistema; a aprovação libera o aviso remotamente. Esta tela não envia builds ao Play Console ou à Apple.
    </div>
    {error && <p role="alert" className="rounded-xl bg-red-500/10 p-4 text-red-300">{error}</p>}
    {success && <p role="status" className="rounded-xl bg-emerald-500/10 p-4 text-emerald-300">{success}</p>}
    <form className="space-y-4 rounded-2xl border border-slate-800 p-5" onSubmit={e => { e.preventDefault(); void run(async () => {
      const { error: createError } = await supabase.rpc('admin_app_update_action', { p_action: 'create', p_app: app, p_platform: platform, p_version: version.trim(), p_message: message.trim() })
      if (createError) throw createError
      setVersion(''); setSuccess('Aviso cadastrado como pendente. Nenhum usuário foi avisado.')
    }) }}>
      <h2 className="text-xl font-bold">Preparar novo aviso</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <label>Aplicativo<select className={inputClass} value={app} onChange={e => setApp(e.target.value as AppSlug)}><option value="cliente">PraiaGo Cliente</option><option value="ambulante">PraiaGo Ambulante</option></select></label>
        <label>Loja<select className={inputClass} value={platform} onChange={e => setPlatform(e.target.value as StorePlatform)}><option value="android">Play Store · Android</option><option value="ios">App Store · iPhone</option></select></label>
        <label>Versão publicada<input className={inputClass} value={version} onChange={e => setVersion(e.target.value)} required maxLength={20} pattern="[0-9]{1,6}(\.[0-9]{1,6}){0,2}" placeholder="Ex.: 1.1.0" /></label>
      </div>
      <label className="block">Texto do aviso<textarea className={inputClass} value={message} onChange={e => setMessage(e.target.value)} required maxLength={300} rows={2} /></label>
      <p className="text-xs text-slate-400">Use a versão nativa que aparece na loja, não o número do pacote OTA. Faça um cadastro para cada aplicativo e loja.</p>
      <button className={`${buttonClass} bg-purple-600`} disabled={busy}>Cadastrar aviso pendente</button>
    </form>
    {selection && <section className="space-y-4 rounded-2xl border border-purple-500/50 bg-slate-900 p-5" aria-label="Confirmar ação">
      <h2 className="text-lg font-bold">{selection.action === 'verify' ? 'Conferir publicação' : selection.action === 'approve' ? 'Aprovar envio do aviso' : 'Retirar aviso'} · {selection.notice.app} {selection.notice.version}</h2>
      {selection.action === 'verify' && <a href={storeUrl(selection.notice.app, selection.notice.platform)} target="_blank" rel="noopener noreferrer" className="text-purple-300 underline">Abrir página oficial na loja</a>}
      {verifyAndroid ? <>
        <p className="text-sm text-amber-200">Conferência manual: ainda não há integração autenticada com a API do Play Console. Não marque uma release em teste ou em análise como publicada.</p>
        <label className="block">Referência da release no Play Console<input className={inputClass} value={reason} onChange={e => setReason(e.target.value)} maxLength={1000} placeholder="Nome da release, versão, código e data da publicação" /></label>
        <label className="flex gap-3"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Confirmei que esta versão está em Produção e disponível para usuários no Brasil.</label>
      </> : selection.action === 'verify' ? <p className="text-sm text-slate-300">A API pública da Apple deve retornar esta versão exata para este aplicativo na loja brasileira. Se ainda não saiu, o aviso permanece inativo.</p> : null}
      {destructive && <label className="block">Motivo<textarea className={inputClass} value={reason} onChange={e => setReason(e.target.value)} maxLength={500} rows={2} /></label>}
      {selection.action === 'approve' && <p className="text-sm text-slate-300">Libera “Atualizar agora” somente para quem está em versão nativa inferior. A conferência precisa ter menos de 24 horas. O aviso ativo anterior dessa loja será pausado.</p>}
      <div className="flex flex-wrap gap-3"><button className={`${buttonClass} bg-purple-600`} disabled={busy || (verifyAndroid && (!confirmed || reason.trim().length < 10)) || (destructive && reason.trim().length < 5)} onClick={() => void execute()}>Confirmar</button><button className={buttonClass} disabled={busy} onClick={() => setSelection(null)}>Cancelar</button></div>
    </section>}
    <section className="space-y-4"><h2 className="text-xl font-bold">Avisos e aprovações</h2>
      <button className={buttonClass} disabled={busy} onClick={() => void run(reload)}>Recarregar</button>
      {notices.length === 0 && <p className="text-slate-400">Nenhum aviso cadastrado. O sistema não mostra versões fictícias aos usuários.</p>}
      {notices.map(n => <article key={n.id} className="space-y-3 rounded-2xl border border-slate-800 p-5">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="text-lg font-bold">PraiaGo {n.app === 'cliente' ? 'Cliente' : 'Ambulante'} · {n.platform === 'ios' ? 'App Store' : 'Play Store'} · {n.version}</h3><span className={n.status === 'approved' ? 'text-emerald-300' : 'text-slate-300'}>{labels[n.status]}</span></div>
        <p className="text-slate-300">{n.message}</p>
        <p className="text-xs text-slate-400">{n.verified_at ? `Conferido em ${new Date(n.verified_at).toLocaleString('pt-BR')} · ${n.verification_method === 'apple_lookup' ? 'API pública da Apple' : 'Play Console: confirmação manual'}` : 'Publicação ainda não conferida.'}</p>
        <div className="flex flex-wrap gap-2">
          {['pending','verified','paused'].includes(n.status) && <button className={buttonClass} disabled={busy} onClick={() => select(n, 'verify')}>Conferir loja</button>}
          {n.status === 'verified' && <button className={`${buttonClass} text-emerald-300`} disabled={busy} onClick={() => select(n, 'approve')}>Aprovar aviso</button>}
          {['pending','verified'].includes(n.status) && <button className={`${buttonClass} text-red-300`} disabled={busy} onClick={() => select(n, 'reject')}>Negar</button>}
          {n.status === 'approved' && <button className={`${buttonClass} text-amber-300`} disabled={busy} onClick={() => select(n, 'pause')}>Pausar aviso</button>}
        </div>
        <details className="text-xs text-slate-400"><summary className="cursor-pointer py-2">Histórico de ações</summary><ul className="space-y-1">{events.filter(e => e.notice_id === n.id).map(e => <li key={e.id}>{new Date(e.created_at).toLocaleString('pt-BR')} · {actions[e.action] || e.action}</li>)}</ul></details>
      </article>)}
    </section>
  </div>
}
