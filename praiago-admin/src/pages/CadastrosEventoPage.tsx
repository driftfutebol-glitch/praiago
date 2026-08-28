// Relatorio de quem foi cadastrado pela equipe DENTRO do evento.
//
// Por que essa tela existe separada da de Usuarios: no dia do evento a equipe
// cadastra gente no balcao, e cada pessoa sai com uma senha provisoria e um QR
// pra trocar. Quem nao le o QR fica com a senha que a equipe digitou — e vai
// bater no suporte dizendo "nao consigo entrar". A lista de `senha_provisoria`
// ainda true e exatamente essa fila, e e o que o suporte precisa em maos.
//
// O filtro e `profiles.cadastro_origem = 'evento'`; cadastro normal pelo app
// grava NULO ai, entao nao polui a lista.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Download, KeyRound, Loader2, RefreshCw, Search, UserPlus, Users,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { alertDialog } from '../lib/dialog'

type Cadastrado = {
  id: string
  nome: string | null
  email: string | null
  telefone: string | null
  role: string | null
  cadastrado_em: string | null
  cadastrado_por: string | null
  senha_provisoria: boolean
}

type OperadorResumo = {
  id: string
  nome: string | null
  email: string | null
}

const ROLE: Record<string, { label: string; classes: string }> = {
  cliente: { label: 'Cliente', classes: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  restaurante: { label: 'Restaurante', classes: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  ambulante: { label: 'Ambulante', classes: 'bg-green-500/10 text-green-400 border-green-500/20' },
  entregador: { label: 'Entregador', classes: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
}

const TIPOS = ['todos', 'cliente', 'ambulante', 'restaurante'] as const
type Tipo = typeof TIPOS[number]

function dataHora(valor: string | null) {
  if (!valor) return '-'
  return format(new Date(valor), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })
}

/** Escapa um campo pro CSV: aspas duplicadas e o campo inteiro entre aspas. */
function csvCampo(valor: unknown) {
  return `"${String(valor ?? '').replace(/"/g, '""')}"`
}

export default function CadastrosEventoPage() {
  const [linhas, setLinhas] = useState<Cadastrado[]>([])
  const [operadores, setOperadores] = useState<Record<string, OperadorResumo>>({})
  const [carregando, setCarregando] = useState(true)
  const [tipo, setTipo] = useState<Tipo>('todos')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [busca, setBusca] = useState('')
  const [soProvisoria, setSoProvisoria] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id,nome,email,telefone,role,cadastrado_em,cadastrado_por,senha_provisoria')
      .eq('cadastro_origem', 'evento')
      .order('cadastrado_em', { ascending: false, nullsFirst: false })
      .limit(2000)

    if (error) {
      setCarregando(false)
      await alertDialog({ title: 'Erro ao carregar', message: error.message, tone: 'danger' })
      return
    }

    const lista = (data as Cadastrado[]) ?? []
    setLinhas(lista)

    // `cadastrado_por` aponta pra `auth.users`, nao pra `profiles` — o PostgREST
    // nao consegue embutir o operador no mesmo select. Dai a segunda consulta.
    const ids = Array.from(new Set(lista.map(l => l.cadastrado_por).filter((v): v is string => !!v)))
    if (ids.length > 0) {
      const { data: perfis } = await supabase.from('profiles').select('id,nome,email').in('id', ids)
      const mapa: Record<string, OperadorResumo> = {}
      for (const p of (perfis as OperadorResumo[]) ?? []) mapa[p.id] = p
      setOperadores(mapa)
    } else {
      setOperadores({})
    }

    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  function nomeOperador(id: string | null) {
    if (!id) return '-'
    const op = operadores[id]
    return op?.nome || op?.email || id
  }

  const filtradas = useMemo(() => {
    // O `ate` vira fim do dia: quem escolhe "ate 12/08" espera ver o que foi
    // cadastrado as 23h de 12/08, nao so ate a meia-noite.
    const inicio = de ? new Date(`${de}T00:00:00`).getTime() : null
    const fim = ate ? new Date(`${ate}T23:59:59.999`).getTime() : null
    const termo = busca.trim().toLowerCase()

    return linhas.filter(l => {
      if (tipo !== 'todos' && l.role !== tipo) return false
      if (soProvisoria && !l.senha_provisoria) return false
      if (inicio || fim) {
        if (!l.cadastrado_em) return false
        const t = new Date(l.cadastrado_em).getTime()
        if (inicio && t < inicio) return false
        if (fim && t > fim) return false
      }
      if (termo) {
        const alvo = `${l.nome ?? ''} ${l.email ?? ''} ${l.telefone ?? ''}`.toLowerCase()
        if (!alvo.includes(termo)) return false
      }
      return true
    })
  }, [linhas, tipo, de, ate, busca, soProvisoria])

  const pendentesSenha = useMemo(
    () => filtradas.filter(l => l.senha_provisoria).length,
    [filtradas],
  )

  function exportarCsv() {
    const cabecalho = ['Nome', 'E-mail', 'Telefone', 'Tipo', 'Cadastrado em', 'Cadastrado por', 'Senha provisoria']
    const corpo = filtradas.map(l => [
      l.nome ?? '',
      l.email ?? '',
      l.telefone ?? '',
      ROLE[l.role ?? '']?.label ?? l.role ?? '',
      dataHora(l.cadastrado_em),
      nomeOperador(l.cadastrado_por),
      l.senha_provisoria ? 'SIM' : 'nao',
    ])

    // `;` e BOM porque quem abre isso e o suporte, no Excel em pt-BR: com `,`
    // o Excel joga a linha inteira numa coluna so, e sem BOM come os acentos.
    const texto = '﻿' + [cabecalho, ...corpo]
      .map(linha => linha.map(csvCampo).join(';'))
      .join('\r\n')

    const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `cadastros-evento-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black text-slate-100 tracking-tight">Cadastros do evento</h1>
          <p className="text-slate-400 font-medium mt-1 max-w-3xl">
            Quem a equipe cadastrou no balcao do evento. Quem ainda esta com <strong>senha provisoria</strong> nao
            leu o QR e continua com a senha que a equipe gerou — e essa gente que bate no suporte.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportarCsv}
            disabled={filtradas.length === 0}
            className="h-10 px-4 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 flex items-center gap-2 text-xs font-black disabled:opacity-40"
          >
            <Download size={15} /> Exportar CSV
          </button>
          <button
            type="button"
            onClick={carregar}
            disabled={carregando}
            title="Atualizar lista"
            className="w-10 h-10 shrink-0 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 flex items-center justify-center disabled:opacity-50"
          >
            <RefreshCw size={17} className={carregando ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* Contadores: total do filtro atual + a fila que o suporte vai atender */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="flex items-center gap-2 text-slate-500 text-[10px] font-black uppercase tracking-widest">
            <Users size={13} /> Total no filtro
          </div>
          <div className="text-3xl font-black text-slate-100 mt-1">{filtradas.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">de {linhas.length} cadastrados no evento</div>
        </div>

        <div className={`rounded-xl border p-5 ${
          pendentesSenha > 0
            ? 'border-amber-500/30 bg-amber-500/5'
            : 'border-slate-800 bg-slate-900/50'
        }`}>
          <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${
            pendentesSenha > 0 ? 'text-amber-400' : 'text-slate-500'
          }`}>
            <KeyRound size={13} /> Ainda com senha provisoria
          </div>
          <div className={`text-3xl font-black mt-1 ${pendentesSenha > 0 ? 'text-amber-300' : 'text-slate-100'}`}>
            {pendentesSenha}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {pendentesSenha > 0 ? 'nao trocaram a senha ainda' : 'todo mundo ja trocou'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="flex items-center gap-2 text-slate-500 text-[10px] font-black uppercase tracking-widest">
            <UserPlus size={13} /> Por tipo
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(['cliente', 'ambulante', 'restaurante', 'entregador'] as const).map(r => {
              const n = filtradas.filter(l => l.role === r).length
              if (n === 0) return null
              return (
                <span key={r} className={`px-2 py-0.5 rounded-md border text-[10px] font-black uppercase ${ROLE[r].classes}`}>
                  {ROLE[r].label} {n}
                </span>
              )
            })}
            {filtradas.length === 0 && <span className="text-slate-600 text-xs font-bold">-</span>}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1.5">
          {TIPOS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`px-3 py-2 rounded-lg border text-xs font-black capitalize ${
                tipo === t
                  ? 'bg-purple-500/15 border-purple-500/30 text-purple-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">De</span>
          <input
            type="date" value={de} onChange={e => setDe(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm font-bold text-slate-200 outline-none focus:border-purple-500/40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">Ate</span>
          <input
            type="date" value={ate} onChange={e => setAte(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm font-bold text-slate-200 outline-none focus:border-purple-500/40"
          />
        </label>

        <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">Buscar</span>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="nome, e-mail ou telefone"
              className="w-full rounded-lg border border-slate-800 bg-slate-950/60 pl-9 pr-3 py-2 text-sm font-medium text-slate-200 placeholder:text-slate-600 outline-none focus:border-purple-500/40"
            />
          </div>
        </label>

        <button
          type="button"
          onClick={() => setSoProvisoria(v => !v)}
          className={`px-3 py-2 rounded-lg border text-xs font-black flex items-center gap-1.5 ${
            soProvisoria
              ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
              : 'bg-slate-950 border-slate-800 text-slate-400'
          }`}
        >
          <KeyRound size={13} /> So senha provisoria
        </button>

        {(tipo !== 'todos' || de || ate || busca || soProvisoria) && (
          <button
            type="button"
            onClick={() => { setTipo('todos'); setDe(''); setAte(''); setBusca(''); setSoProvisoria(false) }}
            className="px-3 py-2 rounded-lg border border-slate-800 bg-slate-950 text-slate-500 text-xs font-black"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Lista */}
      {carregando && linhas.length === 0 ? (
        <div className="py-14 flex items-center justify-center gap-2 text-slate-500 font-bold">
          <Loader2 size={18} className="animate-spin" /> Carregando cadastros...
        </div>
      ) : filtradas.length === 0 ? (
        <div className="py-14 text-center text-slate-500 rounded-xl border border-slate-800 bg-slate-900/50">
          <UserPlus size={30} className="mx-auto mb-3 opacity-50" />
          <div className="font-bold">
            {linhas.length === 0
              ? 'Ninguem foi cadastrado pelo sistema do evento ainda.'
              : 'Nenhum cadastro bate com esses filtros.'}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-600 border-b border-slate-800">
                <th className="text-left px-4 py-3">Pessoa</th>
                <th className="text-left px-4 py-3">Telefone</th>
                <th className="text-left px-4 py-3">Tipo</th>
                <th className="text-left px-4 py-3">Cadastrado em</th>
                <th className="text-left px-4 py-3">Cadastrado por</th>
                <th className="text-left px-4 py-3">Senha</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l, i) => {
                const role = l.role ? ROLE[l.role] : null
                return (
                  <motion.tr
                    key={l.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i, 15) * 0.012 }}
                    // Linha inteira em ambar quando a senha ainda e provisoria:
                    // e a fila do suporte, tem que saltar aos olhos na rolagem.
                    className={`border-b border-slate-800/50 last:border-0 ${
                      l.senha_provisoria ? 'bg-amber-500/[0.06]' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-100">{l.nome || 'Sem nome'}</div>
                      <div className="text-xs text-slate-500 font-mono">{l.email || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">{l.telefone || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-md border text-[10px] font-black uppercase ${
                        role?.classes || 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                      }`}>
                        {role?.label || l.role || 'sem tipo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs font-semibold">{dataHora(l.cadastrado_em)}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs font-semibold">{nomeOperador(l.cadastrado_por)}</td>
                    <td className="px-4 py-3">
                      {l.senha_provisoria ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-300 text-[10px] font-black uppercase">
                          <KeyRound size={11} /> Provisoria
                        </span>
                      ) : (
                        <span className="text-[10px] font-black uppercase text-slate-600">Ja trocou</span>
                      )}
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
