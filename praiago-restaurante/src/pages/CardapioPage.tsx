import { useState, useRef, useEffect } from 'react'
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

const categorias = ['Pratos', 'Frutos do Mar', 'Bebidas', 'Executivo', 'Sobremesas', 'Petiscos', 'Outros']
const emojis = ['🦐', '🐟', '🦀', '🦑', '🍽️', '🍹', '🥤', '🍰', '🥗', '🍝', '🥩', '🍖', '🍔']

type NovoForm = { nome: string; preco: string; descricao: string; categoria: string; emoji: string }

export default function CardapioPage() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todos')
  const [editando, setEditando] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editPreco, setEditPreco] = useState('')
  const [adicionando, setAdicionando] = useState(false)
  const [loading, setLoading] = useState(true)
  const [novo, setNovo] = useState<NovoForm>({ nome: '', preco: '', descricao: '', categoria: 'Pratos', emoji: '🍽️' })
  
  const sessao = getSessao()

  useEffect(() => {
    fetchProdutos()
  }, [])

  async function fetchProdutos() {
    if (!sessao) return
    setLoading(true)
    const { data, error } = await supabase
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
      nome: novo.nome,
      preco: parseFloat(novo.preco) || 0,
      descricao: novo.descricao,
      categoria: novo.categoria,
      ativo: true,
      emoji: novo.emoji,
    }
    
    const { data, error } = await supabase.from('produtos').insert(prod).select().single()
    if (data) {
      setProdutos(prev => [data, ...prev])
      setNovo({ nome: '', preco: '', descricao: '', categoria: 'Pratos', emoji: '🍽️' })
      setAdicionando(false)
    } else {
      console.error("Erro ao adicionar produto:", error)
    }
  }

  const todasCategorias = ['Todos', ...Array.from(new Set(produtos.map(p => p.categoria)))]
  const filtrados = categoriaFiltro === 'Todos' ? produtos : produtos.filter(p => p.categoria === categoriaFiltro)

  return (
    <div style={{ padding: '32px 0 48px', minHeight: '100vh', position: 'relative' }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{ padding: '0 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: '#f8fafc', letterSpacing: -1, marginBottom: 8 }}>Cardápio</h1>
          <p style={{ color: '#94a3b8', fontSize: 16 }}>Gerencie seus pratos, bebidas e combos.</p>
        </div>
        <button onClick={() => setAdicionando(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 16, fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 10px 25px rgba(249,115,22,0.3)', transition: 'transform 0.2s, box-shadow 0.2s' }} onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}>
          <Plus size={20} />
          Adicionar Item
        </button>
      </motion.div>

      {/* Tabs / Filters */}
      <div style={{ padding: '0 40px', marginBottom: 32, display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }} className="hide-scrollbar">
        {todasCategorias.map(cat => (
          <button key={cat} onClick={() => setCategoriaFiltro(cat)} style={{ padding: '8px 20px', borderRadius: 20, fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s', background: categoriaFiltro === cat ? 'rgba(249,115,22,0.15)' : 'rgba(255,255,255,0.05)', color: categoriaFiltro === cat ? '#f97316' : '#94a3b8', border: `1px solid ${categoriaFiltro === cat ? 'rgba(249,115,22,0.3)' : 'transparent'}` }}>
            {cat}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div style={{ padding: '0 40px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
        <AnimatePresence>
          {loading ? (
            <div style={{ color: '#94a3b8', padding: 20 }}>Carregando cardápio do servidor...</div>
          ) : filtrados.map(p => (
            <motion.div key={p.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.2 }} style={{ background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(10px)', borderRadius: 24, padding: 20, border: '1px solid rgba(255,255,255,0.05)', position: 'relative', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
              {/* Badge Ativo */}
              <button onClick={() => toggleAtivo(p.id)} style={{ position: 'absolute', top: 20, right: 20, background: p.ativo ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${p.ativo ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, color: p.ativo ? '#4ade80' : '#f87171', padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}>
                {p.ativo ? 'ATIVO' : 'ESGOTADO'}
              </button>

              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <div style={{ width: 72, height: 72, borderRadius: 16, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, position: 'relative', overflow: 'hidden' }}>
                  {p.foto ? <img src={p.foto} alt={p.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : p.emoji}
                </div>
                <div style={{ flex: 1, paddingTop: 4 }}>
                  <div style={{ fontSize: 12, color: '#f97316', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                    {p.categoria}
                  </div>
                  {editando === p.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input autoFocus value={editNome} onChange={e => setEditNome(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 8, padding: '4px 8px', color: '#fff', fontSize: 16, fontWeight: 700 }} />
                      <input value={editPreco} onChange={e => setEditPreco(e.target.value)} type="number" step="0.01" style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 8, padding: '4px 8px', color: '#fff', fontSize: 16, fontWeight: 700 }} />
                    </div>
                  ) : (
                    <>
                      <h3 style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc', margin: '0 0 4px', lineHeight: 1.2 }}>{p.nome}</h3>
                      <div style={{ fontSize: 18, color: '#4ade80', fontWeight: 800 }}>R$ {p.preco.toFixed(2)}</div>
                    </>
                  )}
                </div>
              </div>

              <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.5, margin: '0 0 20px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {p.descricao}
              </p>

              {/* Ações */}
              <div style={{ display: 'flex', gap: 8, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
                {editando === p.id ? (
                  <>
                    <button onClick={() => salvarEdicao(p.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#10b981', color: '#fff', border: 'none', padding: '8px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                      <Check size={16} /> Salvar
                    </button>
                    <button onClick={() => setEditando(null)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', padding: '8px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                      <X size={16} /> Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setEditando(p.id); setEditNome(p.nome); setEditPreco(p.preco.toString()) }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', border: 'none', padding: '8px', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      <Edit2 size={16} /> Editar
                    </button>
                    <button onClick={() => deletar(p.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', padding: '8px', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
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
          <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAdicionando(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)' }} />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} style={{ width: '100%', maxWidth: 480, background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: 32, position: 'relative', zIndex: 101, boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
              <button onClick={() => setAdicionando(false)} style={{ position: 'absolute', top: 20, right: 20, background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X size={24} color="#94a3b8" />
              </button>
              
              <h2 style={{ fontSize: 24, fontWeight: 900, color: '#f8fafc', marginBottom: 24 }}>Novo Item</h2>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, color: '#94a3b8', fontWeight: 600, marginBottom: 8 }}>Nome do Produto</label>
                  <input value={novo.nome} onChange={e => setNovo({...novo, nome: e.target.value})} placeholder="Ex: Porção de Isca de Peixe" style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px 16px', color: '#fff', fontSize: 16, outline: 'none' }} />
                </div>
                
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 14, color: '#94a3b8', fontWeight: 600, marginBottom: 8 }}>Preço (R$)</label>
                    <input value={novo.preco} onChange={e => setNovo({...novo, preco: e.target.value})} type="number" step="0.01" placeholder="0.00" style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px 16px', color: '#fff', fontSize: 16, outline: 'none' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 14, color: '#94a3b8', fontWeight: 600, marginBottom: 8 }}>Categoria</label>
                    <select value={novo.categoria} onChange={e => setNovo({...novo, categoria: e.target.value})} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px 16px', color: '#fff', fontSize: 16, outline: 'none', appearance: 'none' }}>
                      {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, color: '#94a3b8', fontWeight: 600, marginBottom: 8 }}>Descrição</label>
                  <textarea value={novo.descricao} onChange={e => setNovo({...novo, descricao: e.target.value})} placeholder="Ingredientes e detalhes..." rows={3} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px 16px', color: '#fff', fontSize: 16, outline: 'none', resize: 'none' }} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, color: '#94a3b8', fontWeight: 600, marginBottom: 8 }}>Ícone / Emoji</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {emojis.map(e => (
                      <button key={e} onClick={() => setNovo({...novo, emoji: e})} style={{ width: 44, height: 44, borderRadius: 12, fontSize: 24, background: novo.emoji === e ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${novo.emoji === e ? '#f97316' : 'rgba(255,255,255,0.1)'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={adicionarProduto} style={{ width: '100%', padding: '16px', borderRadius: 16, background: 'linear-gradient(135deg, #f97316, #ea580c)', border: 'none', color: '#fff', fontSize: 16, fontWeight: 800, marginTop: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Plus size={20} /> Salvar Produto
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
