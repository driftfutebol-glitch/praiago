import ResponsiveTable from '../components/ResponsiveTable'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, LockKeyhole, RefreshCw, Search, ShieldAlert, type LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import IpsAutorizados from '../components/IpsAutorizados'

type SecurityLog = {
  id: string
  created_at: string
  event_type: string
  severity: 'info' | 'warning' | 'high' | 'critical'
  platform: string
  email: string | null
  user_agent: string | null
  route: string | null
  metadata: Record<string, unknown> | null
  resolved_at: string | null
  resolution_notes: string | null
}

const EVENT_LABELS: Record<string, string> = {
  login_success: 'Login aprovado',
  login_failed: 'Falha de login',
  access_denied: 'Acesso negado',
  signup_created: 'Cadastro criado',
  password_reset_requested: 'Reset de senha solicitado',
  password_changed: 'Senha alterada',
  fraud_flag_created: 'Fraude denunciada',
  suspicious_activity: 'Atividade suspeita',
  delivery_code_mismatch: 'Código de entrega errado',
  // Tudo que um administrador faz entra sob este tipo, e o metadata diz qual
  // ação foi. Um tipo por ação exigiria um ALTER na constraint do banco a cada
  // botão novo — e mudança de schema em produção aqui é cara.
  admin_action: 'Ação de administrador',
}

// Rótulo legível para o campo `acao` do metadata de uma ação de admin.
const ACAO_ADMIN: Record<string, string> = {
  banir_conta: 'baniu a conta',
  desbanir_conta: 'desbaniu a conta',
  verificar_conta: 'liberou KYC na mão',
  desverificar_conta: 'tirou a verificação',
  resetar_senha: 'resetou a senha',
  abrir_exclusao: 'abriu exclusão',
  concluir_exclusao: 'APAGOU a conta',
  aprovar_kyc: 'aprovou o KYC',
  rejeitar_kyc: 'rejeitou o KYC',
  criar_admin: 'criou um administrador',
  excluir_admin: 'excluiu um administrador',
  liberar_saque: 'liberou saque',
  alterar_permissoes: 'mudou o nível de acesso',
  marcar_tester: 'marcou como conta de teste',
  desmarcar_tester: 'devolveu a conta aos usuários normais',
}

const SEVERITY_CLASS: Record<SecurityLog['severity'], string> = {
  info: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
  warning: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  high: 'bg-orange-500/10 text-orange-300 border-orange-500/20',
  critical: 'bg-red-500/10 text-red-300 border-red-500/20',
}

function fmtDate(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ErrorsPage() {
  const [logs, setLogs] = useState<SecurityLog[]>([])
  const [busca, setBusca] = useState('')
  const [severity, setSeverity] = useState('all')
  const [review, setReview] = useState('all')
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState('')
  const [loading, setLoading] = useState(true)

  async function carregar() {
    setLoading(true)
    setLoadError(false)
    try {
    const { data, error } = await supabase
      .from('security_audit_logs')
      .select('id,created_at,event_type,severity,platform,email,user_agent,route,metadata,resolved_at,resolution_notes')
      .order('created_at', { ascending: false })
      .limit(250)

    if (!error && data) setLogs(data as SecurityLog[])
    else setLoadError(true)
    } catch { setLoadError(true) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    carregar()
    const ch = supabase.channel('admin_security_audit_logs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'security_audit_logs' }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return logs.filter(log => (severity==='all'||log.severity===severity) && (review==='all'||(review==='pending'?!log.resolved_at:!!log.resolved_at)) && (!q||[
      log.event_type,
      EVENT_LABELS[log.event_type],
      log.severity,
      log.platform,
      log.email,
      log.route,
      log.user_agent,
      JSON.stringify(log.metadata ?? {}),
    ].some(value => String(value ?? '').toLowerCase().includes(q))))
  }, [logs, busca, severity, review])

  const abertos = logs.filter(log => !log.resolved_at)
  const criticos = abertos.filter(log => log.severity === 'critical').length
  const altos = abertos.filter(log => log.severity === 'high').length
  const falhasLogin = logs.filter(log => log.event_type === 'login_failed').length

  async function resolver(log: SecurityLog) {
    const { data: userData } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('security_audit_logs')
      .update({
        resolved_at: new Date().toISOString(),
        resolved_by: userData.user?.id ?? null,
        resolution_notes: 'Revisado pelo admin.',
      })
      .eq('id', log.id)

    if (!error) {setActionError('');carregar()}
    else setActionError('Não foi possível marcar este registro como revisado. Tente novamente.')
  }

  return (
    <div className="space-y-6">
      <header className="admin-hero"><div><div className="admin-hero-eyebrow"><ShieldAlert size={15}/>Proteção da operação</div><h1>Segurança & Logs</h1><p>Auditoria de acessos, ações administrativas e atividades suspeitas. Uma visão clara para decidir com segurança.</p></div><div className="admin-hero-aside"><button className="admin-secondary-button" disabled={loading} onClick={()=>void carregar()}><RefreshCw size={16}/>Atualizar registros</button><small>Resumo dos últimos 250 registros carregados</small></div></header>
      {loadError&&<p className="admin-inline-warning" role="alert">Não foi possível atualizar os logs. Os registros anteriores, se houver, foram mantidos. Atualize para tentar novamente.</p>}
      {actionError&&<p className="admin-inline-warning" role="alert">{actionError}</p>}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Metric icon={ShieldAlert} label="Não revisados" value={loading||loadError?'—':abertos.length} color="purple"/>
        <Metric icon={AlertTriangle} label="Críticos pendentes" value={loading||loadError?'—':criticos} color="red"/>
        <Metric icon={LockKeyhole} label="Alta severidade" value={loading||loadError?'—':altos} color="orange"/>
        <Metric icon={Search} label="Falhas de login" value={loading||loadError?'—':falhasLogin} color="amber"/>
      </div>
      <IpsAutorizados/>
      <section className="admin-section-card">
        <div className="admin-section-heading"><div><h2>Histórico de eventos</h2><p>Busca e filtros nos últimos 250 registros. Não revisado não significa necessariamente uma ameaça.</p></div></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input aria-label="Buscar nos logs" value={busca} onChange={event=>setBusca(event.target.value)} placeholder="Evento, usuário, IP ou rota" className="w-full bg-slate-950/50 border border-slate-700 rounded-xl py-3 pl-10 pr-3"/></div>
          <select aria-label="Filtrar severidade" value={severity} onChange={event=>setSeverity(event.target.value)} className="bg-slate-950/50 border border-slate-700 rounded-xl p-3"><option value="all">Todas as severidades</option><option value="critical">Crítica</option><option value="high">Alta</option><option value="warning">Aviso</option><option value="info">Informação</option></select>
          <select aria-label="Filtrar revisão" value={review} onChange={event=>setReview(event.target.value)} className="bg-slate-950/50 border border-slate-700 rounded-xl p-3"><option value="all">Todos os registros</option><option value="pending">Não revisados</option><option value="reviewed">Revisados</option></select>
        </div>
      </section>
      <div className="glass-panel rounded-2xl overflow-hidden border-slate-800">
        <ResponsiveTable label="Histórico de segurança" className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900/80 text-slate-400 text-xs font-bold uppercase tracking-wider border-b border-slate-800">
              <th className="p-4">Quando</th>
              <th className="p-4">Evento</th>
              <th className="p-4">Severidade</th>
              <th className="p-4">Origem</th>
              <th className="p-4">Detalhes</th>
              <th className="p-4 text-right">Acao</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50 text-sm">
            {filtrados.map(log => (
              <tr key={log.id} className={`${log.resolved_at ? 'opacity-55' : ''} hover:bg-slate-800/20 transition-colors`}>
                <td className="p-4 text-slate-400 whitespace-nowrap">{fmtDate(log.created_at)}</td>
                <td className="p-4">
                  <div className="font-bold text-slate-100">{EVENT_LABELS[log.event_type] || log.event_type}</div>
                  <div className="text-xs text-slate-500 font-mono">{log.id.slice(0, 8)}</div>
                </td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase border ${SEVERITY_CLASS[log.severity]}`}>
                    {log.severity}
                  </span>
                </td>
                <td className="p-4">
                  <div className="font-bold text-slate-200">{log.platform}</div>
                  <div className="text-xs text-slate-500">{log.email || 'sem e-mail'}</div>
                </td>
                <td className="p-4 max-w-md">
                  {/* Ação de admin ganha uma frase legível. Despejar o JSON cru
                      aqui — que é o que acontecia — significa que ninguém lê:
                      a informação existe e mesmo assim ninguém audita. */}
                  {log.event_type === 'admin_action' ? (
                    <>
                      <div className="text-slate-200 text-xs font-bold">
                        {String((log.metadata as Record<string, unknown>)?.por_email || 'admin desconhecido')}
                        {' '}
                        <span className="text-purple-300">
                          {ACAO_ADMIN[String((log.metadata as Record<string, unknown>)?.acao)] ||
                            String((log.metadata as Record<string, unknown>)?.acao || 'fez algo')}
                        </span>
                        {log.email ? <> de <span className="text-slate-300">{log.email}</span></> : null}
                      </div>
                      <div className="text-slate-500 text-xs font-mono">
                        IP {String((log.metadata as Record<string, unknown>)?.ip || '—')} · {log.route || 'sem rota'}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-slate-300 text-xs line-clamp-2">{log.route || 'sem rota'}</div>
                      <div className="text-slate-500 text-xs line-clamp-2">{JSON.stringify(log.metadata ?? {})}</div>
                    </>
                  )}
                </td>
                <td className="p-4 text-right">
                  {log.resolved_at ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-bold">
                      <CheckCircle2 size={14} /> Revisado
                    </span>
                  ) : (
                    <button onClick={() => resolver(log)} className="p-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-colors inline-flex items-center gap-2 text-xs font-bold">
                      <CheckCircle2 size={14} /> Marcar revisado
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && filtrados.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500 font-bold">Nenhum log encontrado.</td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500 font-bold">Carregando logs...</td>
              </tr>
            )}
          </tbody>
        </ResponsiveTable>
      </div>
    </div>
  )
}

function Metric({ icon: Icon, label, value, color }: { icon: LucideIcon; label: string; value: number | string; color: 'purple' | 'red' | 'orange' | 'amber' }) {
  const colorMap = {
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    red: 'text-red-400 bg-red-500/10 border-red-500/20',
    orange: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  }

  return (
    <div className="glass-panel p-4 sm:p-5 rounded-2xl border-slate-800">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${colorMap[color]}`}>
        <Icon size={20} />
      </div>
      <div className="text-2xl font-black text-slate-100 mt-4">{value}</div>
      <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">{label}</div>
    </div>
  )
}
