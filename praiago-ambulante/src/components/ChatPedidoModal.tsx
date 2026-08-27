import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Send, X, MessageCircle } from 'lucide-react'
import { useChatPedido } from '../hooks/useChatPedido'

// Conversa com o cliente de um pedido.
//
// O app do cliente tinha um chat de mentira: respondia sozinho "Combinado! To
// chegando" assinado com o nome da loja, e nada chegava aqui. O vendedor
// nunca soube que existia gente falando com ele. Agora chega — e daqui da
// para responder.
//
// Quem e quem vem do banco (`autor_papel`), nunca do app: por isso o balao da
// direita e sempre "vendedor" e nao ha jeito de forjar isso pela tela.

export default function ChatPedidoModal({
  pedidoId,
  clienteNome,
  onClose,
}: {
  pedidoId: string
  clienteNome: string
  onClose: () => void
}) {
  const [texto, setTexto] = useState('')
  const fim = useRef<HTMLDivElement | null>(null)
  const { mensagens, carregando, enviando, erro, enviar } = useChatPedido(pedidoId, true)

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensagens.length])

  async function mandar() {
    const t = texto.trim()
    if (!t || enviando) return
    // Limpa so depois do servidor aceitar: falhou, o texto continua no campo.
    if (await enviar(t)) setTexto('')
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(19,34,56,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label={`Conversa com ${clienteNome}`}
        style={{
          width: '100%', maxWidth: 560, background: '#fff',
          borderRadius: '24px 24px 0 0',
          // dvh acompanha o teclado do iOS. Com vh, o campo de escrever some
          // atras do teclado no exato momento em que se vai usar ele.
          height: 'min(78dvh, 660px)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '16px 18px', borderBottom: '1px solid #dfe6ed' }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: '#eaf6fa', display: 'grid', placeItems: 'center', color: '#007fa6' }}>
            <MessageCircle size={19} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#132238', fontSize: 15, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clienteNome}</div>
            <div style={{ marginTop: 2, color: '#617089', fontSize: 11.5, fontWeight: 700 }}>Mensagens deste pedido</div>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar conversa"><X size={18} /></button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {carregando && <div style={{ margin: 'auto', color: '#8793a5', fontSize: 12.5, fontWeight: 750 }}>Abrindo conversa…</div>}

          {!carregando && mensagens.length === 0 && (
            <div style={{ margin: 'auto', maxWidth: 260, textAlign: 'center', color: '#617089', fontSize: 13, fontWeight: 650, lineHeight: 1.5 }}>
              Nenhuma mensagem ainda. O que você escrever aqui aparece no app
              do cliente na hora.
            </div>
          )}

          {mensagens.map(m => {
            const meu = m.papel === 'vendedor'
            return (
              <div
                key={m.id}
                style={{
                  alignSelf: meu ? 'flex-end' : 'flex-start', maxWidth: '78%',
                  background: meu ? '#148447' : '#f1f5f9',
                  color: meu ? '#fff' : '#132238',
                  padding: '10px 14px', borderRadius: 18,
                  borderBottomRightRadius: meu ? 4 : 18, borderBottomLeftRadius: meu ? 18 : 4,
                  fontSize: 13.5, lineHeight: 1.45, wordBreak: 'break-word',
                }}
              >
                {m.texto}
                <div style={{ marginTop: 3, fontSize: 10, fontWeight: 700, opacity: 0.72, textAlign: 'right' }}>
                  {new Date(m.criadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            )
          })}
          <div ref={fim} />
        </div>

        {erro && <div style={{ padding: '0 18px 8px', color: '#b42335', fontSize: 12, fontWeight: 750 }}>{erro}</div>}

        <div style={{ display: 'flex', gap: 9, padding: '14px 18px calc(14px + env(safe-area-inset-bottom))', borderTop: '1px solid #dfe6ed' }}>
          <input
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void mandar() }}
            placeholder="Escreva para o cliente…"
            aria-label="Mensagem"
            maxLength={1000}
            style={{
              flex: 1, minWidth: 0, background: '#f6f8fb', color: '#132238',
              border: '1px solid #dfe6ed', borderRadius: 14,
              // 16px evita o zoom automatico do Safari ao focar o campo.
              padding: '13px 16px', fontSize: 16, outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={() => void mandar()}
            disabled={!texto.trim() || enviando}
            aria-label="Enviar"
            style={{
              width: 48, flexShrink: 0, borderRadius: 14, border: 'none',
              background: (!texto.trim() || enviando) ? '#e3e9f0' : '#148447',
              color: (!texto.trim() || enviando) ? '#8793a5' : '#fff',
              cursor: (!texto.trim() || enviando) ? 'default' : 'pointer',
              display: 'grid', placeItems: 'center',
            }}
          >
            <Send size={19} />
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
