import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { Apple, Globe, Search, Smartphone, TrendingUp, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  APPS, PLATAFORMAS, type Plataforma,
  corApp, corPlataforma, normalizarPlataforma, rotuloApp, rotuloPlataforma,
} from '../lib/dispositivos'

// Quantas contas entraram, de qual aparelho e em qual app.
//
// A lista de Usuários responde "quem existe". Ela não responde "quantos
// entraram esta semana" nem "de iPhone ou de Android" — e essa é a pergunta que
// se faz para saber se o app está andando.
//
// O aparelho vem de `signup_ips.plataforma`, gravado pela edge function
// 'cadastro' desde 05/09/2026. Cadastro mais antigo não tem essa informação e
// aparece como "não registrado". É de propósito: o que existia antes era o
// `is_mobile`, que fala da OPERADORA do IP — iPhone no Wi-Fi de casa contava
// como "não móvel". Deduzir aparelho daquilo seria inventar número.

type Perfil = {
  id: string
  nome: string | null
  email: string | null
  role: string
  created_at: string | null
  conta_demo: boolean | null
  status: string | null
}

type Cadastro = {
  user_id: string | null
  email: string | null
  ip: string | null
  plataforma: string | null
  app: string | null
  modelo: string | null
  created_at: string | null
}

type Linha = Perfil & {
  plataforma: Plataforma
  app: string | null
  modelo: string | null
  ip: string | null
}

const PERIODOS = [
  { chave: 'hoje', rotulo: 'Hoje', dias: 1 },
  { chave: '7d', rotulo: '7 dias', dias: 7 },
  { chave: '30d', rotulo: '30 dias', dias: 30 },
  { chave: '90d', rotulo: '90 dias', dias: 90 },
  { chave: 'tudo', rotulo: 'Tudo', dias: 0 },
]

const ICONE_PLATAFORMA: Record<Plataforma, typeof Apple> = {
  ios: Apple,
  android: Smartphone,
  web: Globe,
  desconhecida: Globe,
}

// Chave do dia em horário de Brasília, não em UTC.
//
// `toISOString().slice(0,10)` parece resolver e não resolve: quem se cadastra
// às 22h daqui já é o dia seguinte em UTC, e a barra do gráfico ia parar no dia
// errado. Todo fim de tarde e noite — que é justamente quando praia gera
// cadastro — cairia na coluna de amanhã.
function chaveDoDia(data: Date) {
  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

function inicioDoPeriodo(dias: number): Date | null {
  if (!dias) return null
  const d = new Date()
  if (dias === 1) {
    d.setHours(0, 0, 0, 0)
    return d
  }
  d.setDate(d.getDate() - dias)
  return d
}

export default function NovosUsuariosPage() {
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [cadastros, setCadastros] = useState<Cadastro[]>([])
  const [carregando, setCarregando] = useState(true)
  const [periodo, setPeriodo] = useState('30d')
  const [incluirTesters, setIncluirTesters] = useState(false)
  const [busca, setBusca] = useState('')

  const carregar = useCallback(async () => {
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id,nome,email,role,created_at,conta_demo,status')
        .order('created_at', { ascending: false }),
      supabase
        .from('signup_ips')
        .select('user_id,email,ip,plataforma,app,modelo,created_at')
        .order('created_at', { ascending: false }),
    ])
    if (p) setPerfis(p as Perfil[])
    if (c) setCadastros(c as Cadastro[])
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
    const ch = supabase
      .channel('admin_novos_usuarios')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [carregar])

  // A conta é o `profiles` — é ele que diz quem virou usuário de verdade. O
  // signup_ips só acrescenta de onde veio, e nem toda conta tem linha lá:
  // sysadmin criado na mão, conta migrada, cadastro anterior à edge function.
  const linhas = useMemo<Linha[]>(() => {
    const porId = new Map<string, Cadastro>()
    const porEmail = new Map<string, Cadastro>()
    for (const c of cadastros) {
      if (c.user_id && !porId.has(c.user_id)) porId.set(c.user_id, c)
      const e = (c.email || '').toLowerCase()
      if (e && !porEmail.has(e)) porEmail.set(e, c)
    }
    return perfis.map(p => {
      const c = porId.get(p.id) || porEmail.get((p.email || '').toLowerCase())
      return {
        ...p,
        plataforma: normalizarPlataforma(c?.plataforma),
        app: c?.app || (['cliente', 'ambulante', 'restaurante', 'entregador'].includes(p.role) ? p.role : null),
        modelo: c?.modelo || null,
        ip: c?.ip || null,
      }
    })
  }, [perfis, cadastros])

  const filtradas = useMemo(() => {
    const dias = PERIODOS.find(x => x.chave === periodo)?.dias ?? 30
    const corte = inicioDoPeriodo(dias)
    const termo = busca.trim().toLowerCase()
    return linhas.filter(l => {
      if (!incluirTesters && l.conta_demo) return false
      if (l.role === 'sysadmin') return false
      if (corte && (!l.created_at || new Date(l.created_at) < corte)) return false
      if (!termo) return true
      return (l.nome || '').toLowerCase().includes(termo) ||
        (l.email || '').toLowerCase().includes(termo) ||
        (l.ip || '').includes(termo)
    })
  }, [linhas, periodo, incluirTesters, busca])

  const porPlataforma = useMemo(() => {
    const base: Record<Plataforma, number> = { ios: 0, android: 0, web: 0, desconhecida: 0 }
    for (const l of filtradas) base[l.plataforma]++
    return base
  }, [filtradas])

  const porApp = useMemo(() => {
    const base: Record<string, number> = {}
    for (const l of filtradas) {
      const k = l.app || 'outro'
      base[k] = (base[k] || 0) + 1
    }
    return base
  }, [filtradas])

  // Últimos 14 dias, sempre — independente do filtro de período, porque o
  // gráfico serve para ver o ritmo, não para repetir o número do card.
  const porDia = useMemo(() => {
    const dias: { dia: string; rotulo: string; total: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - i)
      dias.push({ dia: chaveDoDia(d), rotulo: format(d, 'dd/MM'), total: 0 })
    }
    const indice = new Map(dias.map((d, i) => [d.dia, i]))
    for (const l of linhas) {
      if (!incluirTesters && l.conta_demo) continue
      if (l.role === 'sysadmin' || !l.created_at) continue
      const i = indice.get(chaveDoDia(new Date(l.created_at)))
      if (i !== undefined) dias[i].total++
    }
    return dias
  }, [linhas, incluirTesters])

  const picoDia = Math.max(1, ...porDia.map(d => d.total))
  const semDispositivo = porPlataforma.desconhecida

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black text-slate-100 tracking-tight flex items-center gap-3">
          <UserPlus size={26} className="text-emerald-400" />
          Novos usuários
        </h1>
        <p className="text-slate-400 font-medium">
          Quem entrou, de qual aparelho e em qual app. Contas de teste ficam de fora por padrão.
        </p>
      </header>

      {/* Filtros */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1 glass-panel rounded-xl p-1 border-slate-800">
          {PERIODOS.map(p => (
            <button
              key={p.chave}
              onClick={() => setPeriodo(p.chave)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                periodo === p.chave
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                  : 'text-slate-500 hover:text-slate-300 border border-transparent'
              }`}
            >
              {p.rotulo}
            </button>
          ))}
        </div>

        <button
          onClick={() => setIncluirTesters(v => !v)}
          className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
            incluirTesters
              ? 'bg-violet-500/15 text-violet-300 border-violet-500/25'
              : 'bg-slate-900/50 text-slate-500 border-slate-800 hover:text-slate-300'
          }`}
        >
          {incluirTesters ? 'Contando testadores' : 'Testadores de fora'}
        </button>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Nome, e-mail ou IP..."
            className="bg-slate-900/50 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-sm text-slate-200 outline-none focus:border-emerald-500/30 w-64 transition-colors"
          />
        </div>

        <div className="ml-auto text-xs text-slate-500 font-mono">
          {filtradas.length} cadastro(s)
        </div>
      </div>

      {/* Aparelho */}
      <div>
        <div className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.2em] font-mono mb-2">De qual aparelho</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {PLATAFORMAS.map(p => {
            const Icone = ICONE_PLATAFORMA[p.chave]
            return (
              <div key={p.chave} className="glass-panel border-slate-800 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <Icone size={18} className={p.cor.split(' ')[0]} />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{p.rotulo}</span>
                </div>
                <div className="text-3xl font-black text-slate-100">{porPlataforma[p.chave]}</div>
              </div>
            )
          })}
        </div>
      </div>

      {semDispositivo > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-200/90 leading-relaxed">
          <strong className="font-bold">{semDispositivo}</strong> cadastro(s) sem aparelho registrado.
          O app só passou a informar iPhone ou Android em 05/09/2026 — quem se cadastrou antes disso, ou por
          uma versão do app anterior à atualização, fica assim para sempre. Cadastro novo já entra identificado.
        </div>
      )}

      {/* App */}
      <div>
        <div className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.2em] font-mono mb-2">Em qual app</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {APPS.map(a => (
            <div key={a.chave} className="glass-panel border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-2">
                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${a.cor}`}>{a.rotulo}</span>
              </div>
              <div className="text-3xl font-black text-slate-100">{porApp[a.chave] || 0}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Ritmo dos últimos 14 dias */}
      <div className="glass-panel border-slate-800 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-emerald-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Últimos 14 dias</span>
        </div>
        <div className="flex items-end gap-1.5 h-28">
          {porDia.map(d => (
            <div key={d.dia} className="flex-1 flex flex-col items-center gap-1.5 group">
              <div className="w-full flex-1 flex items-end">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(4, (d.total / picoDia) * 100)}%` }}
                  transition={{ duration: 0.4 }}
                  title={`${d.rotulo}: ${d.total}`}
                  className={`w-full rounded-t ${d.total ? 'bg-emerald-500/60 group-hover:bg-emerald-400' : 'bg-slate-800'} transition-colors`}
                />
              </div>
              <span className="text-[8px] font-mono text-slate-600 leading-none">{d.rotulo.slice(0, 2)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Lista */}
      {carregando && <div className="text-center text-slate-500 py-12 font-bold">Carregando...</div>}

      {!carregando && filtradas.length === 0 && (
        <div className="glass-panel border-slate-800 rounded-2xl text-center text-slate-500 py-14 font-bold">
          Nenhum cadastro neste período.
        </div>
      )}

      {filtradas.length > 0 && (
        <div className="glass-panel border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-600 font-bold">
                  <th className="text-left px-5 py-3">Quando</th>
                  <th className="text-left px-5 py-3">Quem</th>
                  <th className="text-left px-5 py-3">App</th>
                  <th className="text-left px-5 py-3">Aparelho</th>
                  <th className="text-left px-5 py-3">IP</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((l, i) => (
                  <motion.tr
                    key={l.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i, 20) * 0.015 }}
                    className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/20 transition-colors"
                  >
                    <td className="px-5 py-3 whitespace-nowrap text-xs font-mono text-slate-500">
                      {l.created_at ? format(new Date(l.created_at), 'dd/MM/yyyy HH:mm') : '—'}
                    </td>
                    <td className="px-5 py-3 min-w-[200px]">
                      <div className="font-bold text-slate-200 flex items-center gap-2">
                        {l.nome || '(sem nome)'}
                        {l.conta_demo && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase border bg-violet-500/10 text-violet-300 border-violet-500/25">
                            Teste
                          </span>
                        )}
                        {l.status === 'banido' && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase border bg-red-500/10 text-red-400 border-red-500/20">
                            Bloqueado
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-slate-600 truncate">{l.email || l.id}</div>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${corApp(l.app)}`}>
                        {rotuloApp(l.app)}
                      </span>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${corPlataforma(l.plataforma)}`}>
                        {rotuloPlataforma(l.plataforma)}
                      </span>
                      {l.modelo && <div className="text-[10px] font-mono text-slate-600 mt-1">{l.modelo}</div>}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-xs font-mono text-slate-500">{l.ip || '—'}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
