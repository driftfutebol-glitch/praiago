import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'
import { Ban, RotateCcw, Trash2, UserCheck, ShieldCheck, ShieldX, Search, Eye, EyeOff, UserRoundPlus } from 'lucide-react'
import { format } from 'date-fns'
import { confirmDialog, alertDialog, promptDialog } from '../lib/dialog'
import { registrarAcaoAdmin } from '../lib/auditoriaAdmin'

type Protocolo = {
  id: string
  role: string
  status: string
  blockers: string[] | null
  notification_email: string | null
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [busca, setBusca] = useState('')
  const [filtroRole, setFiltroRole] = useState('todos')
  const [acaoId, setAcaoId] = useState<string | null>(null)

  // Protocolos de exclusão já abertos, indexados por e-mail (é o que a rota
  // 'list' devolve — ela não expõe o subject_id de propósito).
  //
  // Sem isto o botão mentia: a conta já estava no protocolo, e "Solicitar
  // exclusão" reabria o MESMO protocolo e o estacionava de novo em revisão
  // manual. Dava para clicar a tarde inteira e o contador de tentativas só
  // subia. Conta de vendedor nunca conclui sozinha — falta sempre a confirmação
  // de que o recebedor foi encerrado no Pagar.me, e não havia onde dar ela.
  const [protocolos, setProtocolos] = useState<Record<string, Protocolo>>({})

  const carregarProtocolos = useCallback(async (tentativa = 1) => {
    // Mesma corrida da página de Exclusões: a sessão do supabase-js é
    // restaurada do localStorage depois da montagem, e `functions.invoke`
    // manda o token que existir naquele instante. Sem esperar, a chamada saía
    // sem Authorization, voltava 401, e o botão continuava dizendo "Solicitar
    // exclusão" para uma conta que já tinha protocolo aberto.
    const { data: sess } = await supabase.auth.getSession()
    if (!sess.session) {
      if (tentativa <= 5) setTimeout(() => void carregarProtocolos(tentativa + 1), 400 * tentativa)
      return
    }
    const { data, error } = await supabase.functions.invoke('excluir-conta', {
      body: { action: 'list', pageSize: 100 },
    })
    const resp = (data || {}) as { requests?: Protocolo[]; error?: string }
    if (error || resp.error) {
      const status = (error as { context?: { status?: number } } | null)?.context?.status
      if (status === 401 && tentativa <= 5) setTimeout(() => void carregarProtocolos(tentativa + 1), 400 * tentativa)
      return
    }
    const porEmail: Record<string, Protocolo> = {}
    for (const p of resp.requests || []) {
      if (p.status === 'completed' || !p.notification_email) continue
      porEmail[p.notification_email.toLowerCase()] = p
    }
    setProtocolos(porEmail)
  }, [])

  const carregar = useCallback(async () => {
    // Puxa da tabela public.profiles (admin le todos via RLS is_admin).
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (data) setUsuarios(data)
  }, [])

  useEffect(() => {
    carregar()
    carregarProtocolos()
    // Atualiza em tempo real: cadastro novo, verificacao, banimento etc.
    const ch = supabase
      .channel('admin_usuarios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [carregar, carregarProtocolos])

  async function concluirExclusao(u: any, p: Protocolo) {
    const alvo = u.email || u.nome || u.id
    const ehVendedor = u.role !== 'cliente'
    if (!await confirmDialog({
      title: 'Concluir exclusão definitiva?',
      message: ehVendedor
        ? `A conta de ${alvo} é apagada AGORA: documentos de KYC, fotos, login. Pedidos viram anônimos. Não dá para desfazer.\n\nAo continuar você confirma que o recebedor desta conta já foi encerrado no Pagar.me — é a única coisa que o sistema não verifica sozinho.`
        : `A conta de ${alvo} é apagada AGORA: dados pessoais, fotos e login. Não dá para desfazer.`,
      confirmText: 'Apagar de vez',
      tone: 'danger',
    })) return

    setAcaoId(u.id)
    const { data, error } = await supabase.functions.invoke('excluir-conta', {
      body: {
        action: 'process',
        requestId: p.id,
        ...(ehVendedor ? { externalCleanupConfirmed: true } : {}),
      },
    })
    const resp = (data || {}) as { error?: string; completed?: boolean; blockers?: string[]; message?: string }

    if (error || resp.error) {
      let msg = resp.error || 'Não foi possível concluir a exclusão.'
      try {
        const j = await (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context?.json?.()
        if (j?.error) msg = j.error
      } catch { /* usa a msg padrão */ }
      await alertDialog({ title: 'Erro', message: msg, tone: 'danger' })
      setAcaoId(null)
      return
    }

    if (resp.completed === false) {
      await alertDialog({
        title: 'Ainda não concluiu',
        message: resp.blockers?.length
          ? `Impedimentos: ${resp.blockers.join(', ')}.`
          : resp.message || 'O protocolo continua em revisão.',
      })
      await carregarProtocolos()
    } else {
      void registrarAcaoAdmin('concluir_exclusao', u.email, {
        usuario_id: u.id, nome: u.nome, papel: u.role, protocolo: p.id,
      })
      await alertDialog({
        title: 'Conta apagada',
        message: `${alvo} foi removido. O e-mail e o CPF ficam livres para um cadastro novo.`,
      })
      setUsuarios(prev => prev.filter(item => item.id !== u.id))
      await carregarProtocolos()
    }
    setAcaoId(null)
  }

  const roleConfig: Record<string, { color: string; bg: string; border: string; bar: string }> = {
    restaurante: { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', bar: 'bg-orange-500' },
    ambulante: { color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', bar: 'bg-green-500' },
    cliente: { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', bar: 'bg-blue-500' },
    entregador: { color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', bar: 'bg-purple-500' },
  }

  const filtrados = usuarios.filter(u => {
    const matchBusca = !busca || 
      (u.nome && u.nome.toLowerCase().includes(busca.toLowerCase())) ||
      (u.email && u.email.toLowerCase().includes(busca.toLowerCase())) ||
      (u.cnpj && String(u.cnpj).toLowerCase().includes(busca.toLowerCase())) ||
      u.id.toLowerCase().includes(busca.toLowerCase())
    // 'revisao' nao e um role: e a aba das contas de loja/teste.
    //
    // Fora dessa aba, conta de teste NAO aparece. Era a queixa: revisor da
    // Apple, conta da equipe e cliente de verdade na mesma grade, sem nada que
    // separasse — quem abria a tela para achar um vendedor tinha que garimpar.
    // Elas continuam a um clique, na aba Revisao e na tela de Testadores.
    const matchRole =
      filtroRole === 'revisao' ? !!u.conta_demo :
      u.conta_demo ? false :
      filtroRole === 'todos' ? true :
      u.role === filtroRole
    // Busca por texto ignora a aba de papel de proposito. Quem digita um e-mail
    // inteiro quer AQUELA conta, nao "aquela conta se ela for do papel que por
    // acaso esta selecionado". Uma conta que virou ambulante sumia da aba
    // Cliente e a conclusao natural era que ela tinha deixado de existir —
    // aconteceu exatamente isso procurando a conta de um vendedor.
    return busca ? matchBusca : (matchBusca && matchRole)
  })

  const roles = ['todos', ...new Set(usuarios.map(u => u.role).filter(Boolean)), 'revisao']
  const totalDemo = usuarios.filter(u => u.conta_demo).length

  // Conta de revisao: some de vendedores_publicos, que e a unica fonte do
  // radar, das listagens e do mapa do app Cliente. O corte e no banco, feito
  // pelo gatilho sync_vendedor_publico — nao depende de filtro em tela.
  async function alternarContaDemo(u: any) {
    const jaDemo = !!u.conta_demo
    if (!jaDemo) {
      const ok = await confirmDialog({
        title: 'Marcar como conta de revisão',
        message: `${u.nome || u.email || u.id} deixará de aparecer para os clientes: some do radar, das listagens e do mapa. A conta continua funcionando normalmente para quem entrar nela. Use para Apple, Google Play e testes internos.`,
        confirmText: 'Marcar',
      })
      if (!ok) return
    }

    setAcaoId(u.id)
    // Marcar aqui é o mesmo que marcar na tela de Testadores: se a conta vira
    // de teste, ela ganha tipo e data para não chegar lá sem contexto — o
    // motivo se escreve por lá, num clique no card.
    const campos = jaDemo
      ? { conta_demo: false, tester_tipo: null, tester_motivo: null, tester_desde: null }
      : { conta_demo: true, tester_tipo: 'interno', tester_desde: new Date().toISOString() }
    const { error } = await supabase
      .from('profiles')
      .update(campos)
      .eq('id', u.id)

    if (error) {
      alertDialog({
        title: 'Erro',
        message: 'Não foi possível alterar esta conta: ' + error.message,
        tone: 'danger',
      })
    } else {
      void registrarAcaoAdmin(jaDemo ? 'desmarcar_tester' : 'marcar_tester', u.email, {
        usuario_id: u.id, nome: u.nome, papel: u.role,
      })
      setUsuarios(prev => prev.map(item =>
        item.id === u.id ? { ...item, ...campos } : item
      ))
    }
    setAcaoId(null)
  }

  async function alternarBanimento(u: any) {
    const jaBanido = u.status === 'banido'
    const motivo = jaBanido ? null : await promptDialog({ title: 'Bloquear usuário', message: 'Qual o motivo do bloqueio?', defaultValue: 'Violação das regras da plataforma', tone: 'danger', confirmText: 'Bloquear' })
    if (!jaBanido && !motivo) return

    setAcaoId(u.id)
    const atualizacao = {
      status: jaBanido ? 'ativo' : 'banido',
      banido_em: jaBanido ? null : new Date().toISOString(),
      ban_motivo: jaBanido ? null : motivo,
      online: false,
    }

    const { error } = await supabase.from('profiles').update(atualizacao).eq('id', u.id)
    if (!error) {
      void registrarAcaoAdmin(jaBanido ? 'desbanir_conta' : 'banir_conta', u.email, {
        usuario_id: u.id, nome: u.nome, papel: u.role, motivo: motivo ?? null,
      })
      setUsuarios(prev => prev.map(item => item.id === u.id ? { ...item, ...atualizacao } : item))
    } else {
      alertDialog({ title: 'Erro', message: 'Não foi possível atualizar este usuário: ' + error.message, tone: 'danger' })
    }
    setAcaoId(null)
  }

  async function alternarVerificado(u: any) {
    const liberar = !u.verificado
    const ok = liberar
      ? await confirmDialog({ title: 'Liberar KYC manualmente?', message: `Marcar ${u.nome || u.email} como VERIFICADO? Ele passa a aparecer no mapa e pode vender.`, confirmText: 'Liberar' })
      : await confirmDialog({ title: 'Remover verificação?', message: `Tirar a verificação de ${u.nome || u.email}? Ele volta a ficar travado até novo KYC.`, tone: 'danger', confirmText: 'Remover' })
    if (!ok) return
    setAcaoId(u.id)
    const { error } = await supabase.rpc('admin_set_verificado', { p_user_id: u.id, p_verificado: liberar })
    if (!error) {
      // Liberação manual de KYC é a ação mais sensível desta tela: passa por
      // cima da conferência de documento. Sem registro, ninguém sabe depois
      // quem liberou um vendedor que nunca enviou RG.
      void registrarAcaoAdmin(liberar ? 'verificar_conta' : 'desverificar_conta', u.email, {
        usuario_id: u.id, nome: u.nome, papel: u.role, sem_kyc_no_banco: true,
      })
      setUsuarios(prev => prev.map(item => item.id === u.id ? { ...item, verificado: liberar } : item))
    } else {
      alertDialog({ title: 'Erro', message: 'Não foi possível atualizar a verificação: ' + error.message, tone: 'danger' })
    }
    setAcaoId(null)
  }

  async function resetarPerfil(u: any) {
    if (!await confirmDialog({ title: 'Resetar usuário?', message: `Resetar os dados operacionais de ${u.nome || u.email}?`, confirmText: 'Resetar' })) return
    setAcaoId(u.id)
    const atualizacao = {
      status: 'ativo',
      verificado: false,
      email_verificado: false,
      online: false,
      lat: null,
      lng: null,
      zona: null,
      banido_em: null,
      ban_motivo: null,
    }

    const { error } = await supabase.from('profiles').update(atualizacao).eq('id', u.id)
    await supabase.from('verificacoes').delete().eq('user_id', u.id)
    if (!error) {
      setUsuarios(prev => prev.map(item => item.id === u.id ? { ...item, ...atualizacao } : item))
    } else {
      alertDialog({ title: 'Erro', message: 'Não foi possível resetar este usuário: ' + error.message, tone: 'danger' })
    }
    setAcaoId(null)
  }

  // A exclusão de conta de usuário final deixou de ser um deleteUser direto e
  // passou a ser o protocolo da Edge Function excluir-conta: varredura dos três
  // buckets de Storage, anonimização de pedidos e pagamentos, pseudonimização do
  // histórico de repasse e tombstone no fim. Por isso esta tela não apaga mais
  // nada por conta própria — apagar verificacoes/produtos/profiles daqui era
  // justamente destruir a evidência antes do protocolo poder trabalhar nela.
  async function excluirConta(u: any) {
    const alvo = u.email || u.nome || u.id
    const ehVendedor = u.role !== 'cliente'
    if (!await confirmDialog({
      title: 'Abrir exclusão definitiva?',
      message: ehVendedor
        ? `A conta de ${alvo} é bloqueada agora e entra no protocolo de exclusão. Conta vendedora não conclui na hora: fica em revisão manual até alguém confirmar o encerramento do recebedor no Pagar.me. Acompanhe pela fila (RUNBOOK-EXCLUSAO-CONTAS).`
        : `A conta de ${alvo} é bloqueada agora e entra no protocolo de exclusão. Sem pedido, reembolso ou chamado em aberto, a exclusão conclui nesta mesma chamada e não dá para desfazer.`,
      confirmText: 'Abrir exclusão',
      tone: 'danger',
    })) return

    setAcaoId(u.id)
    const { data, error } = await supabase.functions.invoke('admin-usuarios', {
      body: { action: 'excluir', id: u.id },
    })
    const resp = (data || {}) as {
      error?: string
      protocolo?: boolean
      completed?: boolean
      status?: string
      requestId?: string
      blockers?: string[]
      message?: string
    }

    if (error || resp.error) {
      let msg = resp.error || 'Não foi possível excluir a conta.'
      try {
        const p = await (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context?.json?.()
        if (p?.error) msg = p.error
      } catch { /* usa a msg padrão */ }
      alertDialog({ title: 'Erro', message: msg, tone: 'danger' })
      setAcaoId(null)
      return
    }

    void registrarAcaoAdmin('abrir_exclusao', u.email, {
      usuario_id: u.id, nome: u.nome, papel: u.role, protocolo: resp.requestId ?? null,
    })

    if (resp.completed === false) {
      const impedimentos = resp.blockers?.length
        ? `\n\nImpedimentos: ${resp.blockers.join(', ')}.`
        : ''
      await alertDialog({
        title: 'Exclusão na fila',
        message: `${resp.message || 'Protocolo aberto. A conta já está bloqueada.'}${impedimentos}\n\nProtocolo: ${resp.requestId || '—'}`,
      })
      // A conta continua na lista, agora banida: recarrega para mostrar o estado
      // real em vez de sumir com ela e dar a impressão de exclusão concluída.
      // E recarrega os protocolos, para o botão já virar "Concluir exclusão"
      // em vez de continuar oferecendo abrir o que acabou de ser aberto.
      await carregar()
      await carregarProtocolos()
      setAcaoId(null)
      return
    }

    setUsuarios(prev => prev.filter(item => item.id !== u.id))
    setAcaoId(null)
  }

  return (
    <div className="space-y-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-100 tracking-tight">Usuários do Sistema</h1>
          <p className="text-slate-400 font-medium">
            Gente de verdade usando o PraiaGo: clientes, ambulantes, restaurantes e entregadores.
            {totalDemo > 0 && (
              <>
                {' '}
                <Link to="/testers" className="text-violet-400 hover:text-violet-300 font-bold underline decoration-violet-500/30 underline-offset-2">
                  {totalDemo} conta{totalDemo > 1 ? 's' : ''} de teste
                </Link>{' '}
                {totalDemo > 1 ? 'ficam' : 'fica'} fora desta lista.
              </>
            )}
          </p>
        </div>
        <Link
          to="/novos-usuarios"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide border bg-emerald-500/10 text-emerald-300 border-emerald-500/25 hover:bg-emerald-500/20 transition-colors"
        >
          <UserRoundPlus size={14} />
          Quem entrou
        </Link>
      </header>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar nome, e-mail, CNPJ ou ID..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="bg-slate-900/50 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-sm text-slate-200 outline-none focus:border-purple-500/30 w-72 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1 glass-panel rounded-xl p-1 border-slate-800">
          {roles.map(role => (
            <button
              key={role}
              onClick={() => setFiltroRole(role)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${
                filtroRole === role
                  ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
                  : 'text-slate-500 hover:text-slate-300 border border-transparent'
              }`}
            >
              {role === 'todos' ? 'Todos' : role === 'revisao' ? `Revisão${totalDemo ? ` (${totalDemo})` : ''}` : role}
            </button>
          ))}
        </div>
        <div className="ml-auto text-xs text-slate-500 font-mono">
          {filtrados.length} usuário(s)
        </div>
      </div>

      {/* Users Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtrados.map((u, i) => {
          const rc = roleConfig[u.role] || roleConfig.cliente
          return (
            <motion.div
              key={u.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.3 }}
              className={`glass-panel p-5 rounded-2xl flex flex-col relative overflow-hidden transition-all duration-300 ${
                u.conta_demo
                  ? 'border-violet-500/40 hover:border-violet-500/60'
                  : 'border-slate-800 hover:border-slate-700/50'
              }`}
            >
              {/* Top color bar */}
              <div className={`absolute top-0 left-0 w-full h-0.5 ${u.conta_demo ? 'bg-violet-500' : rc.bar}`} />
              {u.conta_demo && (
                <span className="absolute top-3 right-3 px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-300 border border-violet-500/25 text-[9px] font-black uppercase tracking-wider">
                  Revisão
                </span>
              )}
              
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-100">{u.nome}</h3>
                  <span className="text-[10px] font-mono text-slate-600">{u.id.substring(0, 12)}...</span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Verificado Badge */}
                  {u.verificado ? (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-500/10 border border-green-500/15">
                      <ShieldCheck size={11} className="text-green-400" />
                      <span className="text-[9px] font-bold text-green-400 uppercase tracking-wider">Verificado</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/50 border border-slate-700/30">
                      <ShieldX size={11} className="text-slate-600" />
                      <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">Não Verif.</span>
                    </div>
                  )}
                  <div className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${rc.bg} ${rc.color} ${rc.border}`}>
                    {u.role}
                  </div>
                  {u.status === 'banido' && (
                    <div className="px-2 py-0.5 rounded text-[9px] font-bold uppercase border bg-red-500/10 text-red-400 border-red-500/20">
                      Banido
                    </div>
                  )}
                </div>
              </div>

              {/* Extra info */}
              {u.email && (
                <div className="text-xs text-slate-500 mb-1 truncate font-mono">{u.email}</div>
              )}
              {u.telefone && (
                <div className="text-xs text-slate-500 mb-1 font-mono">{u.telefone}</div>
              )}
              {u.cnpj && (
                <div className="text-xs text-slate-500 mb-1 font-mono">CNPJ {u.cnpj}</div>
              )}
              {u.ban_motivo && (
                <div className="text-xs text-red-300 mb-2 rounded-lg border border-red-500/10 bg-red-500/5 px-3 py-2">
                  Motivo: {u.ban_motivo}
                </div>
              )}
              
              <div className="mt-auto pt-3 border-t border-slate-800/50 flex justify-between items-center gap-3 text-xs">
                <span className={`${u.status === 'banido' ? 'text-red-400' : 'text-slate-400'} font-medium flex items-center gap-1`}>
                  <UserCheck size={12} />
                  {u.status === 'banido' ? 'Bloqueado' : 'Ativo'}
                </span>
                <button
                  onClick={() => alternarBanimento(u)}
                  disabled={acaoId === u.id}
                  className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-colors flex items-center gap-1 ${
                    u.status === 'banido'
                      ? 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/15'
                      : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/15'
                  } disabled:opacity-50`}
                >
                  {u.status === 'banido' ? <RotateCcw size={12} /> : <Ban size={12} />}
                  {acaoId === u.id ? 'Salvando' : u.status === 'banido' ? 'Desbanir' : 'Banir'}
                </button>
                <span className="text-slate-600 text-[10px] font-mono">
                  Desde {u.created_at ? format(new Date(u.created_at), 'dd/MM/yyyy') : '—'}
                </span>
              </div>
              {(u.role === 'ambulante' || u.role === 'restaurante' || u.role === 'entregador') && (
                <button
                  onClick={() => alternarVerificado(u)}
                  disabled={acaoId === u.id}
                  className={`mt-3 w-full px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-colors flex items-center justify-center gap-1 ${
                    u.verificado
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/15'
                      : 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/15'
                  } disabled:opacity-50`}
                >
                  {u.verificado ? <ShieldX size={12} /> : <ShieldCheck size={12} />}
                  {u.verificado ? 'Tirar verificação' : 'Liberar KYC manual'}
                </button>
              )}
              <button
                onClick={() => alternarContaDemo(u)}
                disabled={acaoId === u.id}
                className={`mt-3 w-full px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-colors flex items-center justify-center gap-1 ${
                  u.conta_demo
                    ? 'bg-violet-500/10 text-violet-400 border-violet-500/20 hover:bg-violet-500/15'
                    : 'bg-slate-500/10 text-slate-400 border-slate-500/20 hover:bg-slate-500/15'
                } disabled:opacity-50`}
              >
                {u.conta_demo ? <Eye size={12} /> : <EyeOff size={12} />}
                {u.conta_demo ? 'Voltar a aparecer' : 'Ocultar dos clientes'}
              </button>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => resetarPerfil(u)}
                  disabled={acaoId === u.id}
                  className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide border bg-sky-500/10 text-sky-400 border-sky-500/20 hover:bg-sky-500/15 disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  <RotateCcw size={12} />
                  Resetar
                </button>
                {/* O botão diz o próximo passo real daquela conta. Se já existe
                    protocolo aberto, "Solicitar exclusão" não solicitava nada —
                    reabria o mesmo protocolo e voltava para a fila. */}
                {(() => {
                  const p = protocolos[String(u.email || '').toLowerCase()]
                  const travado = !!p && (p.blockers || []).length > 0
                  if (p && !travado) {
                    return (
                      <button
                        onClick={() => concluirExclusao(u, p)}
                        disabled={acaoId === u.id}
                        title="Apaga a conta agora, de vez. Não dá para desfazer."
                        className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide border bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30 disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        <Trash2 size={12} />
                        Concluir exclusão
                      </button>
                    )
                  }
                  if (travado) {
                    return (
                      <button
                        disabled
                        title={`Impedimentos: ${(p.blockers || []).join(', ')}`}
                        className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide border bg-amber-500/10 text-amber-400 border-amber-500/25 cursor-not-allowed flex items-center justify-center gap-1"
                      >
                        <Trash2 size={12} />
                        Exclusão travada
                      </button>
                    )
                  }
                  return (
                    <button
                      onClick={() => excluirConta(u)}
                      disabled={acaoId === u.id}
                      title="Abre o protocolo de exclusão: bloqueia a conta e entra na fila."
                      className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide border bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/15 disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      <Trash2 size={12} />
                      Solicitar exclusão
                    </button>
                  )
                })()}
              </div>
            </motion.div>
          )
        })}
        
        {filtrados.length === 0 && (
          <div className="col-span-full text-center text-slate-500 py-12 font-bold">Nenhum perfil encontrado.</div>
        )}
      </div>
    </div>
  )
}
