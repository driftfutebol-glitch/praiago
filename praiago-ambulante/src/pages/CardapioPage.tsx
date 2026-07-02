import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { getSessao } from '../lib/auth'

type Produto = {
  id: string
  vendedor_id?: string
  nome: string
  preco: number
  descricao: string
  categoria: string
  ativo: boolean
  foto: string | null
  emoji: string
}

type NovoForm = { nome: string; preco: string; descricao: string; emoji: string }

export default function CardapioPage() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [editando, setEditando] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editPreco, setEditPreco] = useState('')
  const [adicionando, setAdicionando] = useState(false)
  const [loading, setLoading] = useState(true)
  const [novo, setNovo] = useState<NovoForm>({ nome: '', preco: '', descricao: '', emoji: '🍽️' })
  
  const sessao = getSessao()

  useEffect(() => {
    fetchProdutos()
  }, [])

  async function fetchProdutos() {
    if (!sessao) return
    setLoading(true)
    const { data, error: _err2 } = await supabase
      .from('produtos')
      .select('*')
      .eq('vendedor_id', sessao.id)
      .order('created_at', { ascending: false })
      
    if (data) {
      setProdutos(data)
    }
    setLoading(false)
  }

  async function toggleAtivo(id: string) {
    const prod = produtos.find(p => p.id === id)
    if (!prod) return
    
    // Update Optimistically
    setProdutos(prev => prev.map(p => p.id === id ? { ...p, ativo: !p.ativo } : p))
    
    const { error: _err } = await supabase.from('produtos').update({ ativo: !prod.ativo }).eq('id', id)
    if (_err) {
      // Revert on error
      setProdutos(prev => prev.map(p => p.id === id ? { ...p, ativo: prod.ativo } : p))
      console.error(_err)
    }
  }

  async function deletar(id: string) {
    setProdutos(prev => prev.filter(p => p.id !== id))
    await supabase.from('produtos').delete().eq('id', id)
  }

  async function salvarEdicao(id: string) {
    const p = produtos.find(p => p.id === id)
    if (!p) return
    
    const newNome = editNome || p.nome
    const newPreco = parseFloat(editPreco) || p.preco

    setProdutos(prev => prev.map(p => p.id === id
      ? { ...p, nome: newNome, preco: newPreco }
      : p
    ))
    setEditando(null)
    
    await supabase.from('produtos').update({ nome: newNome, preco: newPreco }).eq('id', id)
  }

  async function adicionarProduto() {
    if (!novo.nome.trim() || !sessao) return
    
    const prod = {
      vendedor_id: sessao.id,
      vendedor_nome: sessao.nome,        // pro cliente mostrar o nome da loja
      vendedor_categoria: 'Ambulante',
      vendedor_emoji: '🥥',
      nome: novo.nome,
      preco: parseFloat(novo.preco) || 0,
      descricao: novo.descricao,
      categoria: 'Ambulante', // Ambulante n tem categoria na UI
      ativo: true,
      emoji: novo.emoji,
    }
    
    const { data, error } = await supabase.from('produtos').insert(prod).select().single()
    if (data) {
      setProdutos(prev => [data, ...prev])
      setNovo({ nome: '', preco: '', descricao: '', emoji: '🍽️' })
      setAdicionando(false)
    } else {
      console.error("Erro ao adicionar produto:", error)
    }
  }

  const emojis = ['🥥', '🧉', '🍢', '🍦', '🍕', '🌽', '🐟', '🍪', '🍹', '🫐', '🍉', '🥤']

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(0,0,0,0.05)', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', letterSpacing: -0.5 }}>Cardápio</h1>
            <p style={{ fontSize: 13, color: '#64748b', marginTop: 4, fontWeight: 500 }}>
              Suas mudanças aparecem na hora pros clientes ⚡
            </p>
          </div>
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => setAdicionando(true)} style={{
            background: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
            border: 'none', borderRadius: 20, padding: '12px 20px',
            color: '#fff', fontSize: 14, fontWeight: 900, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 25px rgba(34,197,94,0.3)'
          }}>
            <Plus size={18} strokeWidth={3} />
            Add Item
          </motion.button>
        </div>
      </div>

      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <AnimatePresence>
          {loading ? (
            <div style={{ color: '#64748b', padding: 20 }}>Carregando cardápio...</div>
          ) : produtos.map(p => (
            <motion.div key={p.id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }} style={{
              background: 'rgba(255,255,255,0.02)', borderRadius: 24, padding: 20,
              border: '1px solid rgba(0,0,0,0.05)', position: 'relative'
            }}>
              
              <button onClick={() => toggleAtivo(p.id)} style={{
                position: 'absolute', top: 20, right: 20, padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 800, cursor: 'pointer', border: 'none',
                background: p.ativo ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
                color: p.ativo ? '#4ade80' : '#f87171'
              }}>
                {p.ativo ? 'ATIVO' : 'ESGOTADO'}
              </button>

              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, overflow: 'hidden' }}>
                  {p.foto ? <img src={p.foto} alt={p.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : p.emoji}
                </div>
                
                <div style={{ flex: 1, paddingTop: 4 }}>
                  {editando === p.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input autoFocus value={editNome} onChange={e => setEditNome(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, padding: '6px 10px', color: '#fff', fontSize: 15, fontWeight: 700 }} />
                      <input value={editPreco} onChange={e => setEditPreco(e.target.value)} type="number" step="0.01" style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, padding: '6px 10px', color: '#fff', fontSize: 15, fontWeight: 700 }} />
                    </div>
                  ) : (
                    <>
                      <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', maxWidth: '70%' }}>{p.nome}</h3>
                      <div style={{ fontSize: 16, color: '#4ade80', fontWeight: 800 }}>R$ {p.preco.toFixed(2)}</div>
                    </>
                  )}
                </div>
              </div>

              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px', lineHeight: 1.5 }}>{p.descricao}</p>

              <div style={{ display: 'flex', gap: 8, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                {editando === p.id ? (
                  <>
                    <button onClick={() => salvarEdicao(p.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#10b981', color: '#fff', border: 'none', padding: '10px', borderRadius: 16, fontSize: 14, fontWeight: 700 }}>
                      <Check size={16} /> Salvar
                    </button>
                    <button onClick={() => setEditando(null)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(0,0,0,0.08)', color: '#fff', border: 'none', padding: '10px', borderRadius: 16, fontSize: 14, fontWeight: 700 }}>
                      <X size={16} /> Cancela
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setEditando(p.id); setEditNome(p.nome); setEditPreco(p.preco.toString()) }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(0,0,0,0.05)', color: '#334155', border: 'none', padding: '10px', borderRadius: 16, fontSize: 13, fontWeight: 700 }}>
                      <Edit2 size={16} /> Editar
                    </button>
                    <button onClick={() => deletar(p.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(239,68,68,0.1)', color: '#f87171', border: 'none', padding: '10px', borderRadius: 16, fontSize: 13, fontWeight: 700 }}>
                      <Trash2 size={16} /> Excluir
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Modal Adicionar */}
      <AnimatePresence>
        {adicionando && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAdicionando(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)' }} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} style={{ width: '100%', maxWidth: 480, background: '#ffffff', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: '32px 24px', position: 'relative', zIndex: 101, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
              <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2, margin: '0 auto 24px' }} />
              
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', marginBottom: 24 }}>Adicionar Produto</h2>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>NOME</label>
                  <input value={novo.nome} onChange={e => setNovo({...novo, nome: e.target.value})} placeholder="Ex: Cerveja Gelada" style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '14px 16px', color: '#fff', fontSize: 16, outline: 'none' }} />
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>PREÇO (R$)</label>
                  <input value={novo.preco} onChange={e => setNovo({...novo, preco: e.target.value})} type="number" step="0.01" placeholder="0.00" style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '14px 16px', color: '#fff', fontSize: 16, outline: 'none' }} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>DESCRIÇÃO</label>
                  <input value={novo.descricao} onChange={e => setNovo({...novo, descricao: e.target.value})} placeholder="350ml trincando..." style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '14px 16px', color: '#fff', fontSize: 16, outline: 'none' }} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>EMOJI</label>
                  <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }} className="hide-scrollbar">
                    {emojis.map(e => (
                      <button key={e} onClick={() => setNovo({...novo, emoji: e})} style={{ minWidth: 44, height: 44, borderRadius: 12, fontSize: 20, background: novo.emoji === e ? 'rgba(14,165,233,0.2)' : 'rgba(0,0,0,0.05)', border: `1px solid ${novo.emoji === e ? '#0ea5e9' : 'rgba(0,0,0,0.08)'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={adicionarProduto} style={{ width: '100%', padding: '16px', borderRadius: 20, background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', border: 'none', color: '#fff', fontSize: 16, fontWeight: 900, marginTop: 8, cursor: 'pointer', boxShadow: '0 8px 25px rgba(34,197,94,0.3)' }}>
                  Salvar Produto
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
