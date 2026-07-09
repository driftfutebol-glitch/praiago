import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { ShieldAlert, ShieldCheck, Trash2, UserPlus, Crown, Loader2, Check } from 'lucide-react'
import { format } from 'date-fns'
import { confirmDialog, alertDialog } from '../lib/dialog'

// Seções do painel que podem ser liberadas/bloqueadas por admin.
// (a própria página de Administradores é exclusiva do sysadmin, não entra aqui)
const SECOES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'pedidos', label: 'Pedidos Globais' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'usuarios', label: 'Usuários' },
  { key: 'verificacoes', label: 'Verificações' },
  { key: 'eventos', label: 'Eventos' },
  { key: 'cupons', label: 'Cupons' },
  { key: 'promocoes', label: 'Promoções' },
  { key: 'atendimento', label: 'Atendimento' },
  { key: 'erros', label: 'Seguranca & Logs' },
]
const TODAS_SECOES = SECOES.map(s => s.key)

type Admin = {
  id: string
  nome: string | null
  email: string | null
  role: string
  status: string | null
  permissions: string[] | null
  created_at: string | null
}

export default function AdminsPage() {
  const [admins, setAdmins] = useState<Admin[]>([])
  const [meuId, setMeuId] = useState<string | null>(null)
  const [acaoId, setAcaoId] = useState<string | null>(null)

  // form do novo admin
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [tier, setTier] = useState<'admin' | 'sysadmin'>('admin')
  const [perms, setPerms] = useState<string[]>(TODAS_SECOES)
  const [criando, setCriando] = useState(false)

  async function load() {
    const { data } = await supabase
      .from('profiles')
      .select('id,nome,email,role,status,permissions,created_at')
      .in('role', ['admin', 'sysadmin'])
      .order('created_at', { ascending: true })
    if (data) setAdmins(data as Admin[])
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeuId(data.user?.id ?? null))
    load()
    const ch = supabase.channel('admin_admins')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function criarAdmin() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      return alertDialog({ title: 'E-mail inválido', message: 'Digite um e-mail válido (ele será o login).', tone: 'danger' })
    }
    if (senha.length < 6) {
      return alertDialog({ title: 'Senha curta', message: 'A senha precisa ter ao menos 6 caracteres.', tone: 'danger' })
    }
    setCriando(true)
    const { data, error } = await supabase.functions.invoke('admin-usuarios', {
      body: {
        action: 'criar',
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        senha,
        role: tier,
        permissions: tier === 'sysadmin' ? null : perms,
      },
    })
    setCriando(false)
    const erro = (data as { error?: string })?.error || (error ? error.message : '')
    if (erro) {
      return alertDialog({ title: 'Não deu pra criar', message: erro, tone: 'danger' })
    }
    await alertDialog({ title: 'Admin criado! ✅', message: `${email.trim().toLowerCase()} já pode entrar com a senha definida.`, tone: 'success' })
    setNome(''); setEmail(''); setSenha(''); setTier('admin'); setPerms(TODAS_SECOES)
    load()
  }

  async function alternarSecao(admin: Admin, secao: string) {
    if (admin.role === 'sysadmin') return
    const atuais = admin.permissions ?? TODAS_SECOES
    const novas = atuais.includes(secao) ? atuais.filter(s => s !== secao) : [...atuais, secao]
    setAcaoId(admin.id)
    const { error } = await supabase.from('profiles').update({ permissions: novas }).eq('id', admin.id)
    setAcaoId(null)
    if (error) return alertDialog({ title: 'Erro', message: error.message, tone: 'danger' })
    setAdmins(prev => prev.map(a => a.id === admin.id ? { ...a, permissions: novas } : a))
  }

  async function alterarTier(admin: Admin) {
    const virandoSys = admin.role !== 'sysadmin'
    const ok = await confirmDialog({
      title: virandoSys ? 'Promover a sysadmin?' : 'Rebaixar para admin?',
      message: virandoSys
        ? `${admin.nome || admin.email} terá acesso TOTAL e poderá gerenciar outros admins.`
        : `${admin.nome || admin.email} deixa de gerenciar admins e passa a ter só as permissões marcadas.`,
      confirmText: virandoSys ? 'Promover' : 'Rebaixar',
    })
    if (!ok) return
    setAcaoId(admin.id)
    const patch = virandoSys
      ? { role: 'sysadmin', permissions: null }
      : { role: 'admin', permissions: TODAS_SECOES }
    const { error } = await supabase.from('profiles').update(patch).eq('id', admin.id)
    setAcaoId(null)
    if (error) return alertDialog({ title: 'Erro', message: error.message, tone: 'danger' })
    load()
  }

  async function excluirAdmin(admin: Admin) {
    const ok = await confirmDialog({
      title: 'Excluir administrador?',
      message: `Isso apaga o login de ${admin.email} de vez (Auth + perfil). Não dá pra desfazer.`,
      confirmText: 'Excluir',
      tone: 'danger',
    })
    if (!ok) return
    setAcaoId(admin.id)
    const { data, error } = await supabase.functions.invoke('admin-usuarios', {
      body: { action: 'excluir', id: admin.id },
    })
    setAcaoId(null)
    const erro = (data as { error?: string })?.error || (error ? error.message : '')
    if (erro) return alertDialog({ title: 'Não deu pra excluir', message: erro, tone: 'danger' })
    setAdmins(prev => prev.filter(a => a.id !== admin.id))
  }

  return (
    <div className="space-y-6">
      <header className="mb-2">
        <h1 className="text-3xl font-black text-slate-100 tracking-tight flex items-center gap-3">
          <ShieldAlert className="text-purple-400" size={28} /> Administradores
        </h1>
        <p className="text-slate-400 font-medium">Crie logins de admin, defina o que cada um acessa e remova acessos.</p>
      </header>

      {/* Novo admin */}
      <div className="glass-panel rounded-2xl border-slate-800 p-6">
        <h2 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
          <UserPlus size={16} className="text-purple-400" /> Novo administrador
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1 tracking-wider">NOME</label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: João Silva"
              className="w-full bg-slate-900/50 border border-slate-800 rounded-lg py-2.5 px-3 text-sm text-slate-200 outline-none focus:border-purple-500/40" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1 tracking-wider">E-MAIL (login)</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="joao@praiago.com.br" type="email"
              className="w-full bg-slate-900/50 border border-slate-800 rounded-lg py-2.5 px-3 text-sm text-slate-200 outline-none focus:border-purple-500/40 font-mono" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1 tracking-wider">SENHA</label>
            <input value={senha} onChange={e => setSenha(e.target.value)} placeholder="mín. 6 caracteres" type="text"
              className="w-full bg-slate-900/50 border border-slate-800 rounded-lg py-2.5 px-3 text-sm text-slate-200 outline-none focus:border-purple-500/40 font-mono" />
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <span className="text-[11px] font-bold text-slate-400 tracking-wider">NÍVEL:</span>
          <button onClick={() => setTier('admin')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${tier === 'admin' ? 'bg-purple-500/15 text-purple-300 border-purple-500/30' : 'text-slate-500 border-slate-800 hover:text-slate-300'}`}>
            Admin (permissões específicas)
          </button>
          <button onClick={() => setTier('sysadmin')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1 ${tier === 'sysadmin' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'text-slate-500 border-slate-800 hover:text-slate-300'}`}>
            <Crown size={12} /> Sysadmin (acesso total)
          </button>
        </div>

        {tier === 'admin' && (
          <div className="mb-4">
            <div className="text-[11px] font-bold text-slate-400 mb-2 tracking-wider">SEÇÕES LIBERADAS</div>
            <div className="flex flex-wrap gap-2">
              {SECOES.map(s => {
                const on = perms.includes(s.key)
                return (
                  <button key={s.key}
                    onClick={() => setPerms(p => on ? p.filter(x => x !== s.key) : [...p, s.key])}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 ${on ? 'bg-green-500/10 text-green-300 border-green-500/25' : 'bg-slate-900/40 text-slate-500 border-slate-800 hover:text-slate-300'}`}>
                    {on && <Check size={12} />}{s.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <button onClick={criarAdmin} disabled={criando}
          className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold py-2.5 px-6 rounded-lg text-sm flex items-center gap-2 transition-colors">
          {criando ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
          {criando ? 'Criando...' : 'Criar administrador'}
        </button>
      </div>

      {/* Lista de admins */}
      <div className="space-y-3">
        {admins.map((a, i) => {
          const isSys = a.role === 'sysadmin'
          const souEu = a.id === meuId
          const liberadas = a.permissions ?? TODAS_SECOES
          return (
            <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="glass-panel rounded-2xl border-slate-800 p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${isSys ? 'bg-amber-500/10 border-amber-500/25' : 'bg-purple-500/10 border-purple-500/25'}`}>
                    {isSys ? <Crown size={20} className="text-amber-400" /> : <ShieldCheck size={20} className="text-purple-400" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-100">{a.nome || '—'}</h3>
                      {souEu && <span className="text-[9px] font-bold uppercase bg-sky-500/10 text-sky-300 border border-sky-500/20 px-1.5 py-0.5 rounded">você</span>}
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${isSys ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' : 'bg-purple-500/10 text-purple-300 border-purple-500/20'}`}>{a.role}</span>
                    </div>
                    <div className="text-xs text-slate-500 font-mono">{a.email}</div>
                    <div className="text-[10px] text-slate-600 font-mono mt-0.5">Desde {a.created_at ? format(new Date(a.created_at), 'dd/MM/yyyy') : '—'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!souEu && (
                    <button onClick={() => alterarTier(a)} disabled={acaoId === a.id}
                      className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide border bg-amber-500/10 text-amber-300 border-amber-500/20 hover:bg-amber-500/15 disabled:opacity-50 flex items-center gap-1">
                      <Crown size={12} /> {isSys ? 'Rebaixar' : 'Tornar sysadmin'}
                    </button>
                  )}
                  {!souEu && (
                    <button onClick={() => excluirAdmin(a)} disabled={acaoId === a.id}
                      className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide border bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/15 disabled:opacity-50 flex items-center gap-1">
                      <Trash2 size={12} /> Excluir
                    </button>
                  )}
                </div>
              </div>

              {/* Permissões */}
              <div className="mt-4 pt-4 border-t border-slate-800/50">
                {isSys ? (
                  <div className="text-xs text-amber-300/80 font-semibold flex items-center gap-2">
                    <Crown size={13} /> Acesso total a todas as seções (dono do sistema).
                  </div>
                ) : (
                  <>
                    <div className="text-[11px] font-bold text-slate-500 mb-2 tracking-wider">SEÇÕES LIBERADAS (clique pra ligar/desligar)</div>
                    <div className="flex flex-wrap gap-2">
                      {SECOES.map(s => {
                        const on = liberadas.includes(s.key)
                        return (
                          <button key={s.key} onClick={() => alternarSecao(a, s.key)} disabled={acaoId === a.id}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors flex items-center gap-1 disabled:opacity-50 ${on ? 'bg-green-500/10 text-green-300 border-green-500/25' : 'bg-slate-900/40 text-slate-600 border-slate-800 hover:text-slate-400'}`}>
                            {on && <Check size={11} />}{s.label}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )
        })}
        {admins.length === 0 && (
          <div className="text-center text-slate-500 py-12 font-bold">Nenhum administrador ainda.</div>
        )}
      </div>
    </div>
  )
}
