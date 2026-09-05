import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import {
  Ban, FlaskConical, Plus, RotateCcw, Search, ShieldCheck, ShieldX, UserMinus, X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { alertDialog, confirmDialog, promptDialog } from '../lib/dialog'
import { registrarAcaoAdmin } from '../lib/auditoriaAdmin'
import { TIPOS_TESTER, corApp, rotuloApp, tipoTester } from '../lib/dispositivos'

// Página das contas que NÃO são gente usando o PraiaGo de verdade.
//
// Existe porque a lista de Usuários virou um amontoado: conta de revisão da
// Apple, conta da equipe e cliente real na mesma grade, distinguíveis só por um
// `conta_demo` booleano que não dizia por que aquela conta existia. Quem abria
// a tela para achar um vendedor tinha que garimpar.
//
// Aqui elas ficam separadas, com o motivo escrito. Em Usuários elas somem da
// aba "Todos" — continuam visíveis na aba própria, para ninguém achar que
// foram apagadas.

type Perfil = {
  id: string
  nome: string | null
  email: string | null
  role: string
  status: string | null
  verificado: boolean | null
  conta_demo: boolean | null
  tester_tipo: string | null
  tester_motivo: string | null
  tester_desde: string | null
  created_at: string | null
}

export default function TestersPage() {
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [carregando, setCarregando] = useState(true)
  const [acaoId, setAcaoId] = useState<string | null>(null)
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [buscaAdicionar, setBuscaAdicionar] = useState('')
  const [mostrarAdicionar, setMostrarAdicionar] = useState(false)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,nome,email,role,status,verificado,conta_demo,tester_tipo,tester_motivo,tester_desde,created_at')
      .order('created_at', { ascending: false })
    if (!error && data) setPerfis(data as Perfil[])
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
    const ch = supabase
      .channel('admin_testers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [carregar])

  const testers = useMemo(
    () => perfis.filter(p => p.conta_demo && (filtroTipo === 'todos' || (p.tester_tipo || 'revisao') === filtroTipo)),
    [perfis, filtroTipo],
  )

  const contagem = useMemo(() => {
    const base: Record<string, number> = { revisao: 0, interno: 0, beta: 0 }
    for (const p of perfis) {
      if (!p.conta_demo) continue
      const t = p.tester_tipo || 'revisao'
      base[t] = (base[t] || 0) + 1
    }
    return base
  }, [perfis])

  // Candidatos a virar testador: só contas que ainda NÃO são, e só quando há
  // busca digitada. Listar todo mundo aqui recriaria a bagunça que esta tela
  // veio desfazer.
  const candidatos = useMemo(() => {
    const termo = buscaAdicionar.trim().toLowerCase()
    if (!termo) return []
    return perfis
      .filter(p => !p.conta_demo && p.role !== 'sysadmin')
      .filter(p =>
        (p.nome || '').toLowerCase().includes(termo) ||
        (p.email || '').toLowerCase().includes(termo) ||
        p.id.toLowerCase().includes(termo))
      .slice(0, 8)
  }, [perfis, buscaAdicionar])

  // Só pergunta o motivo. O tipo entra como "interno" e se troca no próprio
  // card, num toque — pedir para digitar "revisao/interno/beta" numa caixa de
  // texto seria transformar três botões em três chances de errar a grafia.
  async function marcarComoTester(p: Perfil) {
    const motivo = await promptDialog({
      title: `Marcar ${p.nome || p.email} como testador`,
      message: 'Por que esta conta existe? Uma linha basta — "conta do Bruno para testar entrega", "revisor da Apple". Ela some do radar, das listagens e do mapa dos clientes.',
      defaultValue: '',
      confirmText: 'Marcar como testador',
    })
    if (motivo === null) return

    await aplicar(p, {
      conta_demo: true,
      tester_tipo: 'interno',
      tester_motivo: motivo.trim() || null,
      tester_desde: new Date().toISOString(),
    }, 'marcar_tester', { tipo: 'interno', motivo: motivo.trim() || null })
    setBuscaAdicionar('')
    setMostrarAdicionar(false)
  }

  async function tirarDeTester(p: Perfil) {
    if (!await confirmDialog({
      title: 'Voltar a ser conta normal?',
      message: `${p.nome || p.email} volta a aparecer para os clientes: radar, listagens e mapa. Use isto quando a conta virar um usuário de verdade.`,
      confirmText: 'Voltar ao normal',
    })) return
    await aplicar(p, {
      conta_demo: false,
      tester_tipo: null,
      tester_motivo: null,
      tester_desde: null,
    }, 'desmarcar_tester')
  }

  async function trocarTipo(p: Perfil, chave: string) {
    if ((p.tester_tipo || 'revisao') === chave) return
    await aplicar(p, { tester_tipo: chave }, 'marcar_tester', { tipo: chave, apenas_tipo: true })
  }

  async function editarMotivo(p: Perfil) {
    const motivo = await promptDialog({
      title: 'Por que esta conta existe?',
      message: 'Uma linha basta. Some da lista quando ninguém lembra mais para que servia.',
      defaultValue: p.tester_motivo || '',
      confirmText: 'Salvar',
    })
    if (motivo === null) return
    await aplicar(p, { tester_motivo: motivo.trim() || null }, 'marcar_tester', { motivo: motivo.trim() || null })
  }

  async function alternarBanimento(p: Perfil) {
    const jaBanido = p.status === 'banido'
    const motivo = jaBanido
      ? null
      : await promptDialog({ title: 'Bloquear conta de teste', message: 'Qual o motivo?', defaultValue: 'Conta de teste encerrada', tone: 'danger', confirmText: 'Bloquear' })
    if (!jaBanido && !motivo) return
    await aplicar(p, {
      status: jaBanido ? 'ativo' : 'banido',
      banido_em: jaBanido ? null : new Date().toISOString(),
      ban_motivo: jaBanido ? null : motivo,
      online: false,
    }, jaBanido ? 'desbanir_conta' : 'banir_conta', { motivo: motivo ?? null })
  }

  async function alternarVerificado(p: Perfil) {
    const liberar = !p.verificado
    setAcaoId(p.id)
    const { error } = await supabase.rpc('admin_set_verificado', { p_user_id: p.id, p_verificado: liberar })
    if (error) {
      await alertDialog({ title: 'Erro', message: error.message, tone: 'danger' })
    } else {
      void registrarAcaoAdmin(liberar ? 'verificar_conta' : 'desverificar_conta', p.email, {
        usuario_id: p.id, nome: p.nome, papel: p.role, conta_de_teste: true,
      })
      setPerfis(prev => prev.map(x => x.id === p.id ? { ...x, verificado: liberar } : x))
    }
    setAcaoId(null)
  }

  async function aplicar(
    p: Perfil,
    campos: Record<string, unknown>,
    acao: Parameters<typeof registrarAcaoAdmin>[0],
    detalhes: Record<string, unknown> = {},
  ) {
    setAcaoId(p.id)
    const { error } = await supabase.from('profiles').update(campos).eq('id', p.id)
    if (error) {
      await alertDialog({ title: 'Erro', message: 'Não foi possível salvar: ' + error.message, tone: 'danger' })
    } else {
      void registrarAcaoAdmin(acao, p.email, { usuario_id: p.id, nome: p.nome, papel: p.role, ...detalhes })
      setPerfis(prev => prev.map(x => x.id === p.id ? { ...x, ...campos } as Perfil : x))
    }
    setAcaoId(null)
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-100 tracking-tight flex items-center gap-3">
            <FlaskConical size={26} className="text-violet-400" />
            Testadores
          </h1>
          <p className="text-slate-400 font-medium">
            Contas que não são usuários de verdade: revisores das lojas, equipe e convidados.
            Todas somem do radar, das listagens e do mapa do app Cliente.
          </p>
        </div>
        <button
          onClick={() => setMostrarAdicionar(v => !v)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide border bg-violet-500/10 text-violet-300 border-violet-500/25 hover:bg-violet-500/20 transition-colors"
        >
          {mostrarAdicionar ? <X size={14} /> : <Plus size={14} />}
          {mostrarAdicionar ? 'Fechar' : 'Marcar uma conta'}
        </button>
      </header>

      {mostrarAdicionar && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel border-violet-500/20 rounded-2xl p-5 space-y-3"
        >
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              autoFocus
              value={buscaAdicionar}
              onChange={e => setBuscaAdicionar(e.target.value)}
              placeholder="Procure pelo nome, e-mail ou ID da conta que virou teste..."
              className="w-full bg-slate-900/50 border border-slate-800 rounded-xl py-2.5 pl-9 pr-4 text-sm text-slate-200 outline-none focus:border-violet-500/30"
            />
          </div>
          {buscaAdicionar.trim() && candidatos.length === 0 && (
            <p className="text-xs text-slate-500 font-medium">Nenhuma conta comum com esse texto.</p>
          )}
          <div className="space-y-2">
            {candidatos.map(c => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-200 truncate">{c.nome || '(sem nome)'}</div>
                  <div className="text-[11px] font-mono text-slate-500 truncate">{c.email || c.id}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${corApp(c.role)}`}>{rotuloApp(c.role)}</span>
                  <button
                    onClick={() => marcarComoTester(c)}
                    disabled={acaoId === c.id}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide border bg-violet-500/10 text-violet-300 border-violet-500/25 hover:bg-violet-500/20 disabled:opacity-50"
                  >
                    Marcar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Resumo por tipo — clicável, é também o filtro */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => setFiltroTipo('todos')}
          className={`glass-panel rounded-2xl p-5 text-left transition-colors ${
            filtroTipo === 'todos' ? 'border-violet-500/40' : 'border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="text-3xl font-black text-slate-100">{contagem.revisao + contagem.interno + contagem.beta}</div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mt-1">Todas as contas de teste</div>
        </button>
        {TIPOS_TESTER.map(t => (
          <button
            key={t.chave}
            onClick={() => setFiltroTipo(t.chave)}
            title={t.descricao}
            className={`glass-panel rounded-2xl p-5 text-left transition-colors ${
              filtroTipo === t.chave ? 'border-violet-500/40' : 'border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="text-3xl font-black text-slate-100">{contagem[t.chave] || 0}</div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mt-1">{t.rotulo}</div>
          </button>
        ))}
      </div>

      {carregando && <div className="text-center text-slate-500 py-12 font-bold">Carregando...</div>}

      {!carregando && testers.length === 0 && (
        <div className="glass-panel border-slate-800 rounded-2xl text-center text-slate-500 py-14 px-6">
          <FlaskConical size={28} className="mx-auto mb-3 text-slate-700" />
          <p className="font-bold text-slate-400">Nenhuma conta de teste neste filtro.</p>
          <p className="text-xs mt-1">
            Use “Marcar uma conta” para tirar da lista de usuários uma conta que na verdade é de teste.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {testers.map((p, i) => {
          const tipo = tipoTester(p.tester_tipo)
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.3 }}
              className="glass-panel border-violet-500/25 hover:border-violet-500/40 p-5 rounded-2xl flex flex-col relative overflow-hidden transition-colors"
            >
              <div className="absolute top-0 left-0 w-full h-0.5 bg-violet-500" />

              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-100 truncate">{p.nome || '(sem nome)'}</h3>
                  <span className="text-[10px] font-mono text-slate-600">{p.id.substring(0, 12)}...</span>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${tipo.cor}`}>{tipo.rotulo}</span>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${corApp(p.role)}`}>{rotuloApp(p.role)}</span>
                </div>
              </div>

              {p.email && <div className="text-xs text-slate-500 mb-1 truncate font-mono">{p.email}</div>}

              <button
                onClick={() => editarMotivo(p)}
                className={`text-left text-xs rounded-lg border px-3 py-2 mt-2 transition-colors ${
                  p.tester_motivo
                    ? 'text-slate-300 border-slate-800 bg-slate-900/40 hover:border-slate-700'
                    : 'text-amber-300/80 border-amber-500/20 bg-amber-500/5 hover:border-amber-500/40'
                }`}
              >
                {p.tester_motivo || 'Sem motivo escrito — clique para explicar por que esta conta existe.'}
              </button>

              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {p.verificado && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-500/10 border border-green-500/15 text-[9px] font-bold text-green-400 uppercase tracking-wider">
                    <ShieldCheck size={11} /> Verificado
                  </span>
                )}
                {p.status === 'banido' && (
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase border bg-red-500/10 text-red-400 border-red-500/20">
                    Bloqueado
                  </span>
                )}
                <span className="text-[10px] font-mono text-slate-600 ml-auto">
                  Testando desde {p.tester_desde || p.created_at ? format(new Date(p.tester_desde || p.created_at!), 'dd/MM/yyyy') : '—'}
                </span>
              </div>

              {/* Troca de tipo sem sair da tela */}
              <div className="flex items-center gap-1 mt-3 p-1 rounded-xl bg-slate-900/40 border border-slate-800">
                {TIPOS_TESTER.map(t => (
                  <button
                    key={t.chave}
                    onClick={() => trocarTipo(p, t.chave)}
                    disabled={acaoId === p.id}
                    title={t.descricao}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wide transition-colors disabled:opacity-50 ${
                      (p.tester_tipo || 'revisao') === t.chave
                        ? 'bg-violet-500/15 text-violet-300 border border-violet-500/25'
                        : 'text-slate-500 hover:text-slate-300 border border-transparent'
                    }`}
                  >
                    {t.rotulo.split(' ')[0]}
                  </button>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {(p.role === 'ambulante' || p.role === 'restaurante' || p.role === 'entregador') && (
                  <button
                    onClick={() => alternarVerificado(p)}
                    disabled={acaoId === p.id}
                    className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-colors flex items-center justify-center gap-1 disabled:opacity-50 ${
                      p.verificado
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/15'
                        : 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/15'
                    }`}
                  >
                    {p.verificado ? <ShieldX size={12} /> : <ShieldCheck size={12} />}
                    {p.verificado ? 'Tirar KYC' : 'Liberar KYC'}
                  </button>
                )}
                <button
                  onClick={() => alternarBanimento(p)}
                  disabled={acaoId === p.id}
                  className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-colors flex items-center justify-center gap-1 disabled:opacity-50 ${
                    p.status === 'banido'
                      ? 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/15'
                      : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/15'
                  }`}
                >
                  {p.status === 'banido' ? <RotateCcw size={12} /> : <Ban size={12} />}
                  {p.status === 'banido' ? 'Desbloquear' : 'Bloquear'}
                </button>
              </div>

              <button
                onClick={() => tirarDeTester(p)}
                disabled={acaoId === p.id}
                className="mt-2 w-full px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide border bg-slate-500/10 text-slate-400 border-slate-600/20 hover:bg-slate-500/15 disabled:opacity-50 flex items-center justify-center gap-1"
              >
                <UserMinus size={12} />
                {acaoId === p.id ? 'Salvando' : 'Voltar a ser conta normal'}
              </button>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
