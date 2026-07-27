import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ExternalLink, Loader2, MapPin, RefreshCw, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { alertDialog, confirmDialog, promptDialog } from '../lib/dialog'

type RestauranteResumo = {
  id: string
  nome: string | null
  email: string | null
  cnpj: string | null
  endereco: string | null
  lat: number | null
  lng: number | null
}
type SolicitacaoLocalizacao = {
  id: string
  restaurante_id: string
  status: 'pendente' | 'aprovada' | 'rejeitada' | 'utilizada' | 'cancelada'
  motivo: string
  endereco_atual: string | null
  lat_atual: number | null
  lng_atual: number | null
  novo_endereco: string | null
  nova_lat: number | null
  nova_lng: number | null
  observacao_admin: string | null
  solicitado_em: string
  revisado_em: string | null
  autorizado_ate: string | null
  utilizado_em: string | null
  restaurante: RestauranteResumo | RestauranteResumo[] | null
}

const STATUS = {
  pendente: { label: 'Pendente', classes: 'bg-amber-500/10 text-amber-300 border-amber-500/25' },
  aprovada: { label: 'Autorizada', classes: 'bg-green-500/10 text-green-300 border-green-500/25' },
  rejeitada: { label: 'Rejeitada', classes: 'bg-red-500/10 text-red-300 border-red-500/25' },
  utilizada: { label: 'Concluida', classes: 'bg-sky-500/10 text-sky-300 border-sky-500/25' },
  cancelada: { label: 'Expirada', classes: 'bg-slate-500/10 text-slate-400 border-slate-500/25' },
} as const

function restauranteDa(solicitacao: SolicitacaoLocalizacao) {
  return Array.isArray(solicitacao.restaurante)
    ? solicitacao.restaurante[0] ?? null
    : solicitacao.restaurante
}

function dataHora(valor: string | null) {
  if (!valor) return '-'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(valor))
}

function mapaUrl(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return null
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

export default function LocalizacoesPage() {
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoLocalizacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [acaoId, setAcaoId] = useState<string | null>(null)
  const [aba, setAba] = useState<'pendentes' | 'historico'>('pendentes')

  const carregar = useCallback(async () => {
    setCarregando(true)
    const { data, error } = await supabase
      .from('solicitacoes_correcao_localizacao')
      .select(`
        id,restaurante_id,status,motivo,endereco_atual,lat_atual,lng_atual,
        novo_endereco,nova_lat,nova_lng,observacao_admin,solicitado_em,
        revisado_em,autorizado_ate,utilizado_em,
        restaurante:profiles!restaurante_id(id,nome,email,cnpj,endereco,lat,lng)
      `)
      .order('solicitado_em', { ascending: false })
      .limit(100)
    setCarregando(false)
    if (error) {
      await alertDialog({ title: 'Erro ao carregar', message: error.message, tone: 'danger' })
      return
    }
    setSolicitacoes((data as unknown as SolicitacaoLocalizacao[]) ?? [])
  }, [])

  useEffect(() => {
    carregar()
    const channel = supabase
      .channel('admin_correcoes_localizacao')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'solicitacoes_correcao_localizacao',
      }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [carregar])

  const pendentes = useMemo(
    () => solicitacoes.filter(item => item.status === 'pendente'),
    [solicitacoes],
  )
  const exibidas = aba === 'pendentes'
    ? pendentes
    : solicitacoes.filter(item => item.status !== 'pendente')

  async function revisar(item: SolicitacaoLocalizacao, aprovar: boolean) {
    let observacao = 'Autorizado apos conferencia do ponto atual.'
    if (aprovar) {
      const restaurante = restauranteDa(item)
      const ok = await confirmDialog({
        title: 'Autorizar correcao?',
        message: `${restaurante?.nome || 'Restaurante'} podera alterar endereco e GPS uma unica vez, no prazo de 7 dias.`,
        confirmText: 'Autorizar',
        tone: 'success',
      })
      if (!ok) return
    } else {
      const resposta = await promptDialog({
        title: 'Rejeitar solicitacao',
        message: 'Informe o motivo que sera mostrado ao restaurante.',
        placeholder: 'Ex.: confirme o endereco com o suporte.',
        confirmText: 'Rejeitar',
        tone: 'danger',
      })
      if (!resposta?.trim()) return
      observacao = resposta.trim()
    }

    setAcaoId(item.id)
    const { data, error } = await supabase.rpc('revisar_correcao_localizacao', {
      p_solicitacao_id: item.id,
      p_aprovar: aprovar,
      p_observacao: observacao,
    })
    setAcaoId(null)
    if (error) {
      await alertDialog({ title: 'Nao foi possivel revisar', message: error.message, tone: 'danger' })
      return
    }
    setSolicitacoes(atuais => atuais.map(atual =>
      atual.id === item.id
        ? { ...atual, ...(data as Partial<SolicitacaoLocalizacao>) }
        : atual
    ))
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-100 tracking-tight">Correcoes de localizacao</h1>
          <p className="text-slate-400 font-medium mt-1">
            O ponto do restaurante e fixo. Compare a localizacao atual antes de liberar uma alteracao de uso unico.
          </p>
        </div>
        <button
          type="button"
          onClick={carregar}
          disabled={carregando}
          title="Atualizar solicitacoes"
          className="w-10 h-10 shrink-0 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 flex items-center justify-center disabled:opacity-50"
        >
          <RefreshCw size={17} className={carregando ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAba('pendentes')}
          className={`px-4 py-2 rounded-lg border text-sm font-black ${
            aba === 'pendentes'
              ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
              : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          Pendentes ({pendentes.length})
        </button>
        <button
          type="button"
          onClick={() => setAba('historico')}
          className={`px-4 py-2 rounded-lg border text-sm font-black ${
            aba === 'historico'
              ? 'bg-purple-500/15 border-purple-500/30 text-purple-300'
              : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          Historico
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
        <table className="w-full min-w-[1050px] text-left">
          <thead className="bg-slate-900 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Restaurante</th>
              <th className="px-4 py-3">Ponto atual</th>
              <th className="px-4 py-3">Motivo</th>
              <th className="px-4 py-3">Solicitado</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Acao</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {exibidas.map(item => {
              const restaurante = restauranteDa(item)
              const atualUrl = mapaUrl(item.lat_atual, item.lng_atual)
              const novoUrl = mapaUrl(item.nova_lat, item.nova_lng)
              const status = STATUS[item.status]
              return (
                <tr key={item.id} className="align-top hover:bg-slate-800/25">
                  <td className="px-4 py-4">
                    <div className="font-bold text-slate-100">{restaurante?.nome || 'Restaurante'}</div>
                    <div className="text-xs text-slate-500 mt-1">{restaurante?.email || item.restaurante_id}</div>
                    {restaurante?.cnpj && <div className="text-[10px] font-mono text-slate-600 mt-1">CNPJ {restaurante.cnpj}</div>}
                  </td>
                  <td className="px-4 py-4 max-w-[280px]">
                    <div className="text-xs text-slate-300 leading-relaxed">{item.endereco_atual || 'Endereco nao informado'}</div>
                    <div className="text-[10px] font-mono text-slate-500 mt-1">
                      {item.lat_atual != null && item.lng_atual != null
                        ? `${Number(item.lat_atual).toFixed(6)}, ${Number(item.lng_atual).toFixed(6)}`
                        : 'Sem coordenadas'}
                    </div>
                    {atualUrl && (
                      <a href={atualUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-sky-400 mt-2">
                        <MapPin size={12} /> Abrir ponto atual <ExternalLink size={11} />
                      </a>
                    )}
                    {novoUrl && (
                      <a href={novoUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-bold text-green-400 mt-1">
                        <CheckCircle2 size={12} /> Ver ponto corrigido <ExternalLink size={11} />
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-4 max-w-[300px]">
                    <div className="text-sm text-slate-300 leading-relaxed">{item.motivo}</div>
                    {item.observacao_admin && (
                      <div className="text-xs text-slate-500 mt-2">Admin: {item.observacao_admin}</div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-xs text-slate-400 whitespace-nowrap">
                    {dataHora(item.solicitado_em)}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex px-2.5 py-1 rounded-md border text-[10px] font-black uppercase ${status.classes}`}>
                      {status.label}
                    </span>
                    {item.status === 'aprovada' && (
                      <div className="text-[10px] text-slate-500 mt-2">Ate {dataHora(item.autorizado_ate)}</div>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {item.status === 'pendente' ? (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => revisar(item, false)}
                          disabled={acaoId === item.id}
                          className="px-3 py-2 rounded-lg border border-red-500/25 bg-red-500/10 text-red-300 text-xs font-black flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <XCircle size={14} /> Rejeitar
                        </button>
                        <button
                          type="button"
                          onClick={() => revisar(item, true)}
                          disabled={acaoId === item.id}
                          className="px-3 py-2 rounded-lg border border-green-500/25 bg-green-500/10 text-green-300 text-xs font-black flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {acaoId === item.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                          Autorizar
                        </button>
                      </div>
                    ) : (
                      <div className="text-right text-[10px] text-slate-600">
                        {dataHora(item.utilizado_em || item.revisado_em)}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {!carregando && exibidas.length === 0 && (
          <div className="py-14 text-center text-slate-500">
            <MapPin size={30} className="mx-auto mb-3 opacity-50" />
            <div className="font-bold">
              {aba === 'pendentes' ? 'Nenhuma correcao aguardando analise.' : 'Nenhuma solicitacao no historico.'}
            </div>
          </div>
        )}
        {carregando && (
          <div className="py-14 flex items-center justify-center gap-2 text-slate-500 font-bold">
            <Loader2 size={18} className="animate-spin" /> Carregando solicitacoes...
          </div>
        )}
      </div>
    </div>
  )
}
