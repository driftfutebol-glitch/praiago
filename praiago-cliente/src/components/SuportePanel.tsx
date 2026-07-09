// Painel de Suporte — conversa de verdade entre o usuário e o admin.
// O admin responde pelo painel dele; aqui o usuário vê e responde, em tempo real.
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, ChevronLeft, Plus, Headphones, MessageSquare, Star, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Ticket = {
  id: string
  assunto: string
  mensagem: string
  status: string
  created_at: string
  nao_lida_usuario?: boolean
  avaliacao_nota?: number | null
  avaliacao_comentario?: string | null
}
type Msg = { id: string; autor: string; mensagem: string; created_at: string }

const ACCENT = 'linear-gradient(135deg,#0ea5e9,#22c55e)'

export default function SuportePanel({
  onClose, usuarioId, usuarioNome, usuarioEmail, plataforma,
}: {
  onClose: () => void
  usuarioId: string
  usuarioNome: string
  usuarioEmail: string
  plataforma: string
}) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const aberto = tickets.find(t => t.id === abertoId) || null
  const [mensagens, setMensagens] = useState<Msg[]>([])
  const [texto, setTexto] = useState('')
  const [novo, setNovo] = useState(false)
  const [assunto, setAssunto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [nota, setNota] = useState(0)
  const [comentario, setComentario] = useState('')
  const fimRef = useRef<HTMLDivElement>(null)

  const carregarTickets = () => {
    supabase.from('tickets').select('id, assunto, mensagem, status, created_at, nao_lida_usuario, avaliacao_nota, avaliacao_comentario')
      .eq('usuario_id', usuarioId).order('updated_at', { ascending: false }).limit(30)
      .then(({ data }) => setTickets((data as Ticket[]) ?? []))
  }
  const carregarMensagens = (ticketId: string) => {
    supabase.from('ticket_mensagens').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true })
      .then(({ data }) => { setMensagens((data as Msg[]) ?? []); setTimeout(() => fimRef.current?.scrollIntoView(), 60) })
  }

  useEffect(() => { carregarTickets() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // realtime: novas mensagens (do admin) e mudanças nos tickets do usuário
  useEffect(() => {
    const ch = supabase.channel(`suporte_${usuarioId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_mensagens' }, (payload) => {
        const m = payload.new as Msg & { ticket_id: string }
        if (abertoId && m.ticket_id === abertoId) {
          setMensagens(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m])
          setTimeout(() => fimRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
        }
        carregarTickets()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets', filter: `usuario_id=eq.${usuarioId}` }, carregarTickets)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [usuarioId, abertoId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function abrir(t: Ticket) {
    setAbertoId(t.id); setNovo(false)
    carregarMensagens(t.id)
    if (t.nao_lida_usuario) await supabase.from('tickets').update({ nao_lida_usuario: false }).eq('id', t.id)
  }

  async function enviarAvaliacao() {
    if (!aberto || nota < 1) return
    setEnviando(true)
    await supabase.from('tickets').update({
      avaliacao_nota: nota,
      avaliacao_comentario: comentario.trim() || null,
      avaliado_em: new Date().toISOString(),
      nao_lida_admin: true,
    }).eq('id', aberto.id)
    setEnviando(false)
    setNota(0); setComentario('')
    carregarTickets()
  }

  async function criarTicket() {
    if (!assunto.trim() || !texto.trim()) return
    setEnviando(true)
    const { data, error } = await supabase.from('tickets').insert({
      plataforma, usuario_id: usuarioId, usuario_nome: usuarioNome, usuario_email: usuarioEmail,
      assunto: assunto.trim(), mensagem: texto.trim(), status: 'aberto', prioridade: 'media',
      nao_lida_admin: true, nao_lida_usuario: false,
    }).select().single()
    setEnviando(false)
    if (!error && data) {
      setAssunto(''); setTexto(''); setNovo(false)
      carregarTickets()
      abrir(data as Ticket)
    }
  }

  async function responder() {
    if (!texto.trim() || !aberto) return
    setEnviando(true)
    const msg = texto.trim()
    setTexto('')
    await supabase.from('ticket_mensagens').insert({ ticket_id: aberto.id, autor: 'usuario', mensagem: msg })
    await supabase.from('tickets').update({ nao_lida_admin: true, status: 'em_andamento', updated_at: new Date().toISOString() }).eq('id', aberto.id)
    setEnviando(false)
    carregarMensagens(aberto.id)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 12000, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 26, stiffness: 220 }}
        style={{ width: '100%', maxWidth: 480, height: '82vh', background: '#ffffff', borderTopLeftRadius: 28, borderTopRightRadius: 28, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          {(aberto || novo)
            ? <button onClick={() => { setAbertoId(null); setNovo(false) }} aria-label="Voltar" style={{ width: 36, height: 36, borderRadius: 12, border: 0, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronLeft size={18} color="#334155" /></button>
            : <div style={{ width: 36, height: 36, borderRadius: 12, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Headphones size={18} color="#fff" /></div>}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>{aberto ? aberto.assunto : novo ? 'Novo atendimento' : 'Suporte PraiaGo'}</div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{aberto ? 'Converse com nosso time' : 'A gente te ajuda por aqui 💙'}</div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ width: 36, height: 36, borderRadius: 12, border: 0, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={18} color="#334155" /></button>
        </div>

        {/* Lista de atendimentos */}
        {!aberto && !novo && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            <button onClick={() => { setNovo(true); setTexto('') }} style={{ width: '100%', border: 0, background: ACCENT, color: '#fff', borderRadius: 16, padding: 14, fontSize: 15, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
              <Plus size={18} /> Abrir novo atendimento
            </button>
            {tickets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                <MessageSquare size={30} color="#cbd5e1" style={{ margin: '0 auto 10px' }} />
                <div style={{ fontSize: 14, fontWeight: 700 }}>Nenhum atendimento ainda</div>
                <div style={{ fontSize: 12.5, marginTop: 4 }}>Precisa de ajuda? Toque no botão acima.</div>
              </div>
            ) : tickets.map(t => (
              <button key={t.id} onClick={() => abrir(t)} style={{ width: '100%', textAlign: 'left', border: '1px solid rgba(0,0,0,0.06)', background: '#f8fafc', borderRadius: 16, padding: 14, marginBottom: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.assunto}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginTop: 2 }}>{new Date(t.created_at).toLocaleDateString('pt-BR')} · {t.status === 'resolvido' ? 'Resolvido' : t.status === 'aberto' ? 'Aberto' : 'Em andamento'}</div>
                </div>
                {t.nao_lida_usuario && <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        )}

        {/* Novo atendimento */}
        {novo && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input value={assunto} onChange={e => setAssunto(e.target.value)} placeholder="Assunto (ex: problema no pedido)" style={{ width: '100%', boxSizing: 'border-box', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px', fontSize: 15, fontWeight: 600, color: '#0f172a', outline: 'none' }} />
            <textarea value={texto} onChange={e => setTexto(e.target.value)} placeholder="Conte o que aconteceu…" rows={5} style={{ width: '100%', boxSizing: 'border-box', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px', fontSize: 15, fontWeight: 500, color: '#0f172a', outline: 'none', resize: 'none' }} />
            <button onClick={criarTicket} disabled={enviando || !assunto.trim() || !texto.trim()} style={{ border: 0, background: ACCENT, color: '#fff', borderRadius: 14, padding: 15, fontSize: 15, fontWeight: 900, cursor: 'pointer', opacity: (enviando || !assunto.trim() || !texto.trim()) ? 0.5 : 1 }}>
              {enviando ? 'Enviando…' : 'Enviar atendimento'}
            </button>
          </div>
        )}

        {/* Thread */}
        {aberto && (() => {
          const resolvido = aberto.status === 'resolvido' || aberto.status === 'fechado'
          return (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Bolha autor="usuario" texto={aberto.mensagem} quando={aberto.created_at} nome={usuarioNome} />
              <AnimatePresence initial={false}>
                {mensagens.map(m => <Bolha key={m.id} autor={m.autor} texto={m.mensagem} quando={m.created_at} nome={m.autor === 'admin' ? 'Suporte PraiaGo' : usuarioNome} />)}
              </AnimatePresence>
              {resolvido && (
                <div style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 20, padding: '6px 14px', fontSize: 12.5, fontWeight: 800, margin: '4px 0' }}>
                  <CheckCircle2 size={14} /> Atendimento resolvido pelo suporte
                </div>
              )}
              <div ref={fimRef} />
            </div>

            {resolvido ? (
              aberto.avaliacao_nota ? (
                <div style={{ padding: 16, borderTop: '1px solid rgba(0,0,0,0.06)', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#334155' }}>Você avaliou este atendimento</div>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'center', margin: '8px 0' }}>
                    {[1, 2, 3, 4, 5].map(i => <Star key={i} size={22} color={i <= (aberto.avaliacao_nota || 0) ? '#f59e0b' : '#e2e8f0'} fill={i <= (aberto.avaliacao_nota || 0) ? '#f59e0b' : '#e2e8f0'} />)}
                  </div>
                  {aberto.avaliacao_comentario && <div style={{ fontSize: 12.5, color: '#64748b', fontStyle: 'italic' }}>"{aberto.avaliacao_comentario}"</div>}
                </div>
              ) : (
                <div style={{ padding: 16, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a', textAlign: 'center', marginBottom: 8 }}>Como foi o atendimento?</div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 10 }}>
                    {[1, 2, 3, 4, 5].map(i => (
                      <button key={i} onClick={() => setNota(i)} aria-label={`${i} estrelas`} style={{ border: 0, background: 'none', cursor: 'pointer', padding: 2 }}>
                        <Star size={30} color={i <= nota ? '#f59e0b' : '#e2e8f0'} fill={i <= nota ? '#f59e0b' : '#e2e8f0'} />
                      </button>
                    ))}
                  </div>
                  <input value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Deixe um comentário (opcional)" style={{ width: '100%', boxSizing: 'border-box', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '12px 14px', fontSize: 14, fontWeight: 500, color: '#0f172a', outline: 'none', marginBottom: 10 }} />
                  <button onClick={enviarAvaliacao} disabled={enviando || nota < 1} style={{ width: '100%', border: 0, background: ACCENT, color: '#fff', borderRadius: 14, padding: 13, fontSize: 14.5, fontWeight: 900, cursor: nota < 1 ? 'not-allowed' : 'pointer', opacity: (enviando || nota < 1) ? 0.5 : 1 }}>
                    {enviando ? 'Enviando…' : 'Enviar avaliação'}
                  </button>
                </div>
              )
            ) : (
              <div style={{ padding: 12, borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', gap: 8 }}>
                <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') responder() }} placeholder="Escreva sua mensagem…" style={{ flex: 1, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '13px 14px', fontSize: 15, fontWeight: 500, color: '#0f172a', outline: 'none' }} />
                <button onClick={responder} disabled={enviando || !texto.trim()} aria-label="Enviar" style={{ width: 50, borderRadius: 14, border: 0, background: ACCENT, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: (enviando || !texto.trim()) ? 0.5 : 1 }}><Send size={18} /></button>
              </div>
            )}
          </>
          )
        })()}
      </motion.div>
    </div>
  )
}

function Bolha({ autor, texto, quando, nome }: { autor: string; texto: string; quando: string; nome: string }) {
  const meu = autor === 'usuario'
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', justifyContent: meu ? 'flex-end' : 'flex-start' }}>
      <div style={{ maxWidth: '78%', padding: '10px 14px', borderRadius: 18, borderTopRightRadius: meu ? 4 : 18, borderTopLeftRadius: meu ? 18 : 4, background: meu ? ACCENT : '#f1f5f9', color: meu ? '#fff' : '#0f172a', fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}>
        {texto}
        <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>{nome} · {new Date(quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    </motion.div>
  )
}
