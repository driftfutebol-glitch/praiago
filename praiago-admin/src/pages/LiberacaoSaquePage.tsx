import { useCallback, useEffect, useState } from 'react'
import {
  ShieldAlert, ExternalLink, Send, Loader2, CheckCircle2, Clock, RefreshCw,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

// Fila de liberação de saque (o KYC do recebedor na Pagar.me).
//
// Por que tem tela própria, separada de Atendimento: este chamado não se
// responde lendo e escrevendo. Ele exige sair daqui, abrir o painel da
// Pagar.me, gerar um link e voltar — e o link vive 5 minutos. Misturado com
// as dúvidas de cliente, ele se perde na lista, e perder este significa
// vendedor sem receber o próprio dinheiro.
//
// A geração automática existe no código e está bloqueada: o endpoint público
// da Pagar.me responde 401 para esta conta, de qualquer IP. Enquanto eles não
// liberam, esta tela é o trilho manual.

const PAGARME_MERCHANT = 'merch_Nv59PdnHDlc591xW'
const PAGARME_ACCOUNT = 'acc_e60kz6Jirfxgz48B'

/** Mesma janela que o app do vendedor usa para apagar o botão. */
const VALIDADE_LINK_MS = 5 * 60_000

type Chamado = {
  id: string
  usuario_id: string
  usuario_nome: string
  usuario_email: string | null
  plataforma: string
  mensagem: string
  status: string
  created_at: string
  nao_lida_admin: boolean | null
}

type Mensagem = { id: string; autor: string; mensagem: string; created_at: string }

const extrairLink = (t: string) => t.match(/https?:\/\/[^\s<>"')]+/)?.[0] ?? null
const extrairRecebedor = (t: string) => t.match(/re_[a-z0-9]+/i)?.[0] ?? null

function desde(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

export default function LiberacaoSaquePage() {
  const [chamados, setChamados] = useState<Chamado[]>([])
  const [mensagens, setMensagens] = useState<Record<string, Mensagem[]>>({})
  const [rascunho, setRascunho] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [agora, setAgora] = useState(() => Date.now())

  // Relógio próprio: o "vence em 3:12" precisa andar sem ninguém tocar em nada.
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('tickets')
      .select('id,usuario_id,usuario_nome,usuario_email,plataforma,mensagem,status,created_at,nao_lida_admin')
      .eq('origem', 'kyc')
      .in('status', ['aberto', 'em_andamento'])
      .order('created_at', { ascending: true })

    const lista = (data as Chamado[] | null) ?? []
    setChamados(lista)

    if (lista.length) {
      const { data: msgs } = await supabase
        .from('ticket_mensagens')
        .select('id,ticket_id,autor,mensagem,created_at')
        .in('ticket_id', lista.map(c => c.id))
        .order('created_at', { ascending: true })

      const porTicket: Record<string, Mensagem[]> = {}
      for (const m of (msgs as (Mensagem & { ticket_id: string })[] | null) ?? []) {
        ;(porTicket[m.ticket_id] ||= []).push(m)
      }
      setMensagens(porTicket)
    } else {
      setMensagens({})
    }
    setCarregando(false)
  }, [])

  useEffect(() => {
    void carregar()
    const canal = supabase
      .channel('admin_liberacao_saque')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => void carregar())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_mensagens' }, () => void carregar())
      .subscribe()
    return () => { void supabase.removeChannel(canal) }
  }, [carregar])

  async function enviarLink(c: Chamado) {
    const texto = (rascunho[c.id] || '').trim()
    if (!texto) return
    setEnviando(c.id)
    // O gatilho do banco cuida do resto: cria o aviso no aparelho do vendedor
    // e move o chamado para "em andamento".
    const { error } = await supabase
      .from('ticket_mensagens')
      .insert({ ticket_id: c.id, mensagem: texto })
    setEnviando(null)
    if (!error) {
      setRascunho(r => ({ ...r, [c.id]: '' }))
      void carregar()
    }
  }

  function estadoDoLink(c: Chamado) {
    const doAdmin = (mensagens[c.id] || []).filter(m => m.autor === 'admin' && extrairLink(m.mensagem))
    const ultimo = doAdmin[doAdmin.length - 1]
    if (!ultimo) return { fase: 'nenhum' as const, resta: 0 }
    const resta = new Date(ultimo.created_at).getTime() + VALIDADE_LINK_MS - agora
    return { fase: resta > 0 ? ('valido' as const) : ('vencido' as const), resta: Math.max(0, resta) }
  }

  const relogio = (ms: number) => {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-100 flex items-center gap-2">
            <ShieldAlert size={22} className="text-amber-400" />
            Liberação de saque
          </h1>
          <p className="text-slate-400 text-sm mt-1 max-w-2xl">
            Vendedores esperando o link de verificação da Pagar.me. Gere o link no painel deles e
            cole aqui — <strong className="text-amber-300">o link vale 5 minutos</strong>, então só gere
            quando a pessoa estiver com o documento em mãos.
          </p>
        </div>
        <button
          onClick={() => void carregar()}
          className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700 text-slate-300 text-xs font-bold hover:bg-slate-800"
        >
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {carregando ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 size={16} className="animate-spin" /> Carregando…
        </div>
      ) : chamados.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center">
          <CheckCircle2 size={28} className="text-emerald-400 mx-auto mb-3" />
          <p className="text-slate-200 font-bold">Nenhum vendedor esperando</p>
          <p className="text-slate-500 text-sm mt-1">
            Quando alguém pedir a verificação pelo app, o chamado aparece aqui e você recebe um e-mail.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {chamados.map(c => {
            const rec = extrairRecebedor(c.mensagem)
            const link = estadoDoLink(c)
            const conversa = mensagens[c.id] || []
            const ultimaDoVendedor = [...conversa].reverse().find(m => m.autor === 'usuario')

            return (
              <div
                key={c.id}
                className={`rounded-2xl border p-5 ${
                  c.status === 'aberto'
                    ? 'border-amber-500/40 bg-amber-500/[0.04]'
                    : 'border-slate-800 bg-slate-900/40'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-slate-100 font-black">{c.usuario_nome}</span>
                      <span className="px-2 py-0.5 rounded bg-slate-700/50 text-slate-300 text-[10px] font-black uppercase">
                        {c.plataforma}
                      </span>
                      {c.status === 'aberto' && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-black uppercase">
                          esperando
                        </span>
                      )}
                    </div>
                    <div className="text-slate-500 text-xs mt-1 font-mono">
                      {c.usuario_email} · aberto {desde(c.created_at)}
                    </div>
                  </div>

                  {rec && (
                    <a
                      href={`https://dash.pagar.me/${PAGARME_MERCHANT}/${PAGARME_ACCOUNT}/${rec}/recipient-details`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-bold hover:bg-amber-500/20 font-mono"
                    >
                      <ExternalLink size={14} /> {rec}
                    </a>
                  )}
                </div>

                {ultimaDoVendedor && (
                  <div className="mt-3 rounded-lg bg-slate-800/40 border border-slate-700/60 px-3 py-2">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-0.5">
                      O vendedor escreveu
                    </div>
                    <div className="text-slate-300 text-sm">{ultimaDoVendedor.mensagem}</div>
                  </div>
                )}

                {link.fase === 'valido' && (
                  <div className="mt-3 flex items-center gap-2 text-emerald-300 text-sm font-bold">
                    <Clock size={15} /> Link enviado — vence em {relogio(link.resta)}
                  </div>
                )}
                {link.fase === 'vencido' && (
                  <div className="mt-3 flex items-center gap-2 text-slate-400 text-sm font-semibold">
                    <Clock size={15} /> O último link já venceu. Gere outro se ele pedir.
                  </div>
                )}

                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <input
                    value={rascunho[c.id] || ''}
                    onChange={e => setRascunho(r => ({ ...r, [c.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') void enviarLink(c) }}
                    placeholder="Cole aqui o link gerado na Pagar.me"
                    className="flex-1 px-3 py-2.5 rounded-lg bg-slate-950/60 border border-slate-700 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-500/60 font-mono"
                  />
                  <button
                    onClick={() => void enviarLink(c)}
                    disabled={enviando === c.id || !(rascunho[c.id] || '').trim()}
                    className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 text-slate-950 text-sm font-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-400"
                  >
                    {enviando === c.id
                      ? <><Loader2 size={15} className="animate-spin" /> Enviando…</>
                      : <><Send size={15} /> Enviar pro vendedor</>}
                  </button>
                </div>

                <p className="text-slate-600 text-[11px] mt-2">
                  Ele recebe um aviso no aparelho na hora, e o link vira botão dentro do app.
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
