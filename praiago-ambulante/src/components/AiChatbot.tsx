import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, X, Send, Bot, Headphones, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getSessao } from '../lib/auth'

type Message = {
  id: string
  role: 'bot' | 'user'
  text: string
}

export default function AiChatbot({ plataforma = 'ambulante' }: { plataforma?: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'bot', text: 'Olá, Ambulante Parceiro! Sou a IA do PraiaGo. Como posso te ajudar com as vendas hoje?' }
  ])
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<'ai' | 'ticket'>('ai')
  const [ticketSubject, setTicketSubject] = useState('')
  const [loading, setLoading] = useState(false)
  
  const endRef = useRef<HTMLDivElement>(null)
  
  const sessao = getSessao()

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

  const addMessage = (role: 'bot' | 'user', text: string) => {
    setMessages(prev => [...prev, { id: Math.random().toString(), role, text }])
  }

  const handleSendAI = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim()) return

    const userText = input.trim()
    addMessage('user', userText)
    setInput('')
    
    if (userText.toLowerCase().includes('suporte') || userText.toLowerCase().includes('humano') || userText.toLowerCase().includes('atendente')) {
      startTicketFlow()
      return
    }

    setLoading(true)
    
    try {
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY
      
      if (!apiKey) {
        addMessage('bot', '⚠️ A chave da IA não está configurada (VITE_OPENAI_API_KEY). Por favor, fale com o suporte técnico para configurar.')
        return
      }

      // Convert messages to OpenAI format
      const apiMessages = [
        { role: 'system', content: `Você é um assistente virtual gentil e prestativo do aplicativo PraiaGo para a plataforma: ${plataforma}. Você ajuda clientes, ambulantes ou restaurantes a entender o aplicativo. Seja breve e prestativo. 
Regras e Termos da PraiaGo que você deve seguir e informar quando perguntado:
1. A PraiaGo é apenas uma plataforma de intermediação tecnológica. Não somos fornecedores, não vendemos e não entregamos produtos. Conectamos consumidores a ambulantes e restaurantes.
2. O ambulante/restaurante é autônomo e responsável pela qualidade, higiene, preço e entrega do produto.
3. Pagamentos são processados via AbacatePay (Pix ou cartão) diretamente para o vendedor.
4. Problemas com pedidos, reembolsos ou trocas devem ser resolvidos diretamente com o vendedor.
1. A PraiaGo é uma plataforma de intermediação tecnológica que conecta usuários a vendedores parceiros.
2. Todo o atendimento comercial, qualidade dos produtos, preços e entregas são de inteira responsabilidade do vendedor parceiro.
3. Pagamentos são realizados através do sistema AbacatePay diretamente ao vendedor.
4. Qualquer dúvida ou problema com o pedido deve ser tratado diretamente com o vendedor.
5. A PraiaGo apenas facilita o contato e a visibilidade.
Nunca invente dados. Se o usuário quiser falar com um humano, mande digitar "suporte".` },
        ...messages.filter(m => m.id !== 'welcome').map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text })),
        { role: 'user', content: userText }
      ]

      const response = await fetch('/api/ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'blackboxai/blackbox-pro',
          messages: apiMessages,
          temperature: 0.7,
        })
      })

      if (!response.ok) throw new Error('Falha na API da OpenAI')
      
      const data = await response.json()
      const aiReply = data.choices[0].message.content
      
      addMessage('bot', aiReply)
    } catch (err) {
      console.error(err)
      addMessage('bot', '❌ Desculpe, não consegui conectar à minha inteligência no momento. Tente novamente mais tarde.')
    } finally {
      setLoading(false)
    }
  }

  const startTicketFlow = () => {
    setMode('ticket')
    addMessage('bot', 'Certo, vou conectar você com nossa base de suporte humano. Sobre o que você gostaria de falar? (Ex: Radar não funciona, Dúvida financeira)')
  }

  const handleSendTicket = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim()) return

    const userText = input.trim()
    addMessage('user', userText)
    setInput('')

    if (!ticketSubject) {
      setTicketSubject(userText)
      addMessage('bot', 'Entendido. Escreva os detalhes do problema para facilitar o atendimento, por favor.')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.from('tickets').insert({
        plataforma: plataforma,
        usuario_nome: sessao?.nome || 'Usuário Não Logado',
        usuario_email: sessao?.email || 'N/A',
        assunto: ticketSubject,
        mensagem: userText,
        status: 'aberto',
        prioridade: 'media'
      })

      if (error) throw error

      addMessage('bot', '✅ Seu chamado foi aberto com sucesso na nossa base! Em breve um operador responderá pelo painel.')
      setMode('ai')
      setTicketSubject('')
    } catch (err) {
      console.error(err)
      addMessage('bot', '❌ Houve um erro de comunicação. Tente novamente mais tarde.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            style={{
              position: 'fixed',
              bottom: 80,
              right: 24,
              width: 64,
              height: 64,
              borderRadius: 32,
              background: 'linear-gradient(135deg, #10b981, #059669)',
              border: 'none',
              boxShadow: '0 10px 25px rgba(16,185,129,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 9999
            }}
          >
            <MessageCircle size={32} color="#fff" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: 20, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.95 }}
            style={{
              position: 'fixed',
              bottom: 80,
              right: 24,
              width: 350,
              height: 500,
              maxHeight: '80vh',
              borderRadius: 24,
              background: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 9999,
              overflow: 'hidden'
            }}
          >
            <div style={{
              padding: '16px 20px',
              background: 'linear-gradient(90deg, rgba(16,185,129,0.1), rgba(5,150,105,0.1))',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', background: '#10b981',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Bot size={20} color="#fff" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>Suporte PraiaGo</h3>
                  <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: 3, background: '#4ade80', boxShadow: '0 0 5px #4ade80' }} />
                    Online
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}
              >
                <X size={24} color="#94a3b8" />
              </button>
            </div>

            <div style={{ flex: 1, padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }} className="hide-scrollbar">
              {messages.map(msg => (
                <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'bot' ? 'flex-start' : 'flex-end' }}>
                  <div style={{
                    maxWidth: '85%',
                    padding: '12px 16px',
                    borderRadius: 20,
                    borderBottomLeftRadius: msg.role === 'bot' ? 4 : 20,
                    borderBottomRightRadius: msg.role === 'user' ? 4 : 20,
                    background: msg.role === 'bot' ? 'rgba(255,255,255,0.05)' : '#10b981',
                    color: msg.role === 'bot' ? '#e2e8f0' : '#fff',
                    fontSize: 14,
                    lineHeight: 1.5,
                    border: msg.role === 'bot' ? '1px solid rgba(255,255,255,0.1)' : 'none'
                  }}>
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>

            {mode === 'ai' && (
              <div style={{ padding: '0 20px 10px', display: 'flex', gap: 8, overflowX: 'auto' }} className="hide-scrollbar">
                <button
                  onClick={() => setInput('Radar não funciona')}
                  style={{ whiteSpace: 'nowrap', padding: '6px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', fontSize: 12, cursor: 'pointer' }}
                >
                  Radar não funciona
                </button>
                <button
                  onClick={startTicketFlow}
                  style={{ whiteSpace: 'nowrap', padding: '6px 12px', borderRadius: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <Headphones size={14} /> Falar com Suporte
                </button>
              </div>
            )}

            <form onSubmit={mode === 'ai' ? handleSendAI : handleSendTicket} style={{
              padding: 16, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 8
            }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={mode === 'ticket' ? "Detalhes do problema..." : "Pergunte algo à IA..."}
                disabled={loading}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 16,
                  background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff', fontSize: 14, outline: 'none'
                }}
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                style={{
                  width: 44, height: 44, borderRadius: 16,
                  background: input.trim() && !loading ? '#10b981' : 'rgba(255,255,255,0.05)',
                  border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: input.trim() && !loading ? 'pointer' : 'default', transition: 'background 0.2s'
                }}
              >
                {loading ? <Loader2 size={20} color="#fff" style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={20} color={input.trim() ? '#fff' : '#64748b'} />}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
