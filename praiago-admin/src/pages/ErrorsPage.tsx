import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, LockKeyhole, RefreshCw, Search, ShieldAlert, type LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'

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
  const [loading, setLoading] = useState(true)

  async function carregar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('security_audit_logs')
      .select('id,created_at,event_type,severity,platform,email,user_agent,route,metadata,resolved_at,resolution_notes')
      .order('created_at', { ascending: false })
      .limit(250)

    if (!error && data) setLogs(data as SecurityLog[])
    setLoading(false)
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
    if (!q) return logs
    return logs.filter(log => [
      log.event_type,
      EVENT_LABELS[log.event_type],
      log.severity,
      log.platform,
      log.email,
      log.route,
      log.user_agent,
      JSON.stringify(log.metadata ?? {}),
    ].some(value => String(value ?? '').toLowerCase().includes(q)))
  }, [logs, busca])

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

    if (!error) carregar()
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-100 tracking-tight">Seguranca & Logs</h1>
          <p className="text-slate-400 font-medium">Auditoria de login, senha, fraude e acessos suspeitos.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar evento, e-mail, rota..."
              className="bg-slate-900/50 border border-slate-800 rounded-lg py-2 pl-10 pr-4 text-slate-200 outline-none focus:border-purple-500/50 w-72"
            />
          </div>
          <button onClick={carregar} className="px-4 py-2 rounded-lg bg-slate-900/70 border border-slate-800 text-slate-300 hover:text-white inline-flex items-center gap-2 font-bold text-sm">
            <RefreshCw size={16} /> Atualizar
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Metric icon={ShieldAlert} label="Alertas abertos" value={abertos.length} color="purple" />
        <Metric icon={AlertTriangle} label="Criticos" value={criticos} color="red" />
        <Metric icon={LockKeyhole} label="Alta severidade" value={altos} color="orange" />
        <Metric icon={Search} label="Falhas de login" value={falhasLogin} color="amber" />
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden border-slate-800">
        <table className="w-full text-left border-collapse">
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
                  <div className="text-slate-300 text-xs line-clamp-2">{log.route || 'sem rota'}</div>
                  <div className="text-slate-500 text-xs line-clamp-2">{JSON.stringify(log.metadata ?? {})}</div>
                </td>
                <td className="p-4 text-right">
                  {log.resolved_at ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-bold">
                      <CheckCircle2 size={14} /> Resolvido
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
        </table>
      </div>
    </div>
  )
}

function Metric({ icon: Icon, label, value, color }: { icon: LucideIcon; label: string; value: number; color: 'purple' | 'red' | 'orange' | 'amber' }) {
  const colorMap = {
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    red: 'text-red-400 bg-red-500/10 border-red-500/20',
    orange: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  }

  return (
    <div className="glass-panel p-5 rounded-2xl border-slate-800">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${colorMap[color]}`}>
        <Icon size={20} />
      </div>
      <div className="text-2xl font-black text-slate-100 mt-4">{value}</div>
      <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">{label}</div>
    </div>
  )
}
