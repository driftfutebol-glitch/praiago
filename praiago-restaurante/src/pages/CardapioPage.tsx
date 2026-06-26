import { useState, useRef, useEffect } from 'react'
import { Plus, Trash2, Camera, Edit2, Check, X } from 'lucide-react'

const STORAGE_KEY = 'praiago_restaurante_cardapio'

type Produto = {
  id: number
  nome: string
  preco: number
  descricao: string
  categoria: string
  ativo: boolean
  foto: string | null
  emoji: string
}

const defaultProdutos: Produto[] = [
  { id: 1, nome: 'Moqueca de Camarão', preco: 65, descricao: 'Com arroz, farofa e pirão. Serve 2 pessoas.', categoria: 'Pratos', ativo: true, foto: null, emoji: '🦐' },
  { id: 2, nome: 'Filé de Tilápia Grelhado', preco: 48, descricao: 'Com batata frita, arroz e salada.', categoria: 'Pratos', ativo: true, foto: null, emoji: '🐟' },
  { id: 3, nome: 'Caipirinha de Limão', preco: 18, descricao: 'Cachaça artesanal, limão taiti, açúcar.', categoria: 'Bebidas', ativo: true, foto: null, emoji: '🍹' },
  { id: 4, nome: 'Prato Executivo', preco: 35, descricao: 'Arroz, feijão, frango grelhado, salada.', categoria: 'Executivo', ativo: true, foto: null, emoji: '🍽️' },
]

function loadProdutos(): Produto[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : defaultProdutos
  } catch { return defaultProdutos }
}

const categorias = ['Pratos', 'Frutos do Mar', 'Bebidas', 'Executivo', 'Sobremesas', 'Petiscos']
const emojis = ['🦐', '🐟', '🦀', '🦑', '🍽️', '🍹', '🥤', '🍰', '🥗', '🍝', '🥩', '🍖']

type NovoForm = { nome: string; preco: string; descricao: string; categoria: string; emoji: string }

export default function CardapioPage() {
  const [produtos, setProdutos] = useState<Produto[]>(loadProdutos)
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todos')
  const [editando, setEditando] = useState<number | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editPreco, setEditPreco] = useState('')
  const [adicionando, setAdicionando] = useState(false)
  const [novo, setNovo] = useState<NovoForm>({ nome: '', preco: '', descricao: '', categoria: 'Pratos', emoji: '🍽️' })
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({})

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(produtos))
  }, [produtos])

  function handleFoto(e: React.ChangeEvent<HTMLInputElement>, id: number) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setProdutos(prev => prev.map(p => p.id === id ? { ...p, foto: reader.result as string } : p))
    }
    reader.readAsDataURL(file)
  }

  function toggleAtivo(id: number) {
    setProdutos(prev => prev.map(p => p.id === id ? { ...p, ativo: !p.ativo } : p))
  }

  function deletar(id: number) {
    setProdutos(prev => prev.filter(p => p.id !== id))
  }

  function salvarEdicao(id: number) {
    setProdutos(prev => prev.map(p => p.id === id
      ? { ...p, nome: editNome || p.nome, preco: parseFloat(editPreco) || p.preco }
      : p
    ))
    setEditando(null)
  }

  function adicionarProduto() {
    if (!novo.nome.trim()) return
    const prod: Produto = {
      id: Date.now(),
      nome: novo.nome,
      preco: parseFloat(novo.preco) || 0,
      descricao: novo.descricao,
      categoria: novo.categoria,
      ativo: true,
      foto: null,
      emoji: novo.emoji,
    }
    setProdutos(prev => [...prev, prod])
    setNovo({ nome: '', preco: '', descricao: '', categoria: 'Pratos', emoji: '🍽️' })
    setAdicionando(false)
  }

  const todasCategorias = ['Todos', ...Array.from(new Set(produtos.map(p => p.categoria)))]
  const filtrados = categoriaFiltro === 'Todos' ? produtos : produtos.filter(p => p.categoria === categoriaFiltro)

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ padding: '24px 32px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0 }}>Cardápio</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
            📸 Clique na foto de cada prato para fazer upload da imagem real
          </p>
        </div>
        <button onClick={() => setAdicionando(true)} style={{
          background: 'linear-gradient(135deg, #f97316, #ea580c)',
          border: 'none', borderRadius: 24, padding: '12px 22px',
          color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 14px rgba(249,115,22,0.3)',
        }}>
          <Plus size={18} /> Novo prato
        </button>
      </div>

      {/* Filtro por categoria */}
      <div style={{ padding: '0 32px', display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 16 }}>
        {todasCategorias.map(cat => (
          <button key={cat} onClick={() => setCategoriaFiltro(cat)} style={{
            padding: '7px 18px', borderRadius: 24, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
            background: categoriaFiltro === cat ? 'linear-gradient(135deg, #f97316, #ea580c)' : '#f1f5f9',
            color: categoriaFiltro === cat ? '#fff' : '#64748b',
            fontSize: 13, fontWeight: 600,
          }}>{cat}</button>
        ))}
      </div>

      {/* Formulário novo produto */}
      {adicionando && (
        <div style={{ margin: '0 32px 20px', background: '#fff', borderRadius: 20, padding: 24, border: '2px solid #f97316', boxShadow: '0 4px 24px rgba(249,115,22,0.1)' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>Novo prato / produto</div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 6 }}>ÍCONE</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {emojis.map(e => (
                <button key={e} onClick={() => setNovo(n => ({ ...n, emoji: e }))} style={{
                  width: 42, height: 42, borderRadius: 10, fontSize: 20,
                  border: novo.emoji === e ? '2px solid #f97316' : '1px solid #e2e8f0',
                  background: novo.emoji === e ? '#fff7ed' : '#f8fafc', cursor: 'pointer',
                }}>{e}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>NOME</div>
              <input value={novo.nome} onChange={e => setNovo(n => ({ ...n, nome: e.target.value }))}
                placeholder="Ex: Moqueca de Camarão"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>PREÇO (R$)</div>
              <input value={novo.preco} onChange={e => setNovo(n => ({ ...n, preco: e.target.value }))}
                placeholder="0,00" type="number"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>DESCRIÇÃO</div>
            <input value={novo.descricao} onChange={e => setNovo(n => ({ ...n, descricao: e.target.value }))}
              placeholder="Com arroz, farofa e pirão..."
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>CATEGORIA</div>
            <select value={novo.categoria} onChange={e => setNovo(n => ({ ...n, categoria: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', background: '#fff' }}>
              {categorias.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={adicionarProduto} style={{
              flex: 1, background: 'linear-gradient(135deg, #f97316, #ea580c)',
              border: 'none', borderRadius: 12, padding: '14px 0',
              color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>Adicionar ao cardápio</button>
            <button onClick={() => setAdicionando(false)} style={{
              padding: '14px 18px', background: '#f1f5f9', border: 'none', borderRadius: 12, cursor: 'pointer',
            }}>
              <X size={18} color="#64748b" />
            </button>
          </div>
        </div>
      )}

      {/* Grid de produtos */}
      <div style={{ padding: '0 32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {filtrados.map(produto => (
          <div key={produto.id} style={{
            background: '#fff', borderRadius: 20, overflow: 'hidden',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            border: produto.ativo ? '1px solid #e2e8f0' : '2px solid #fecaca',
            opacity: produto.ativo ? 1 : 0.65,
          }}>
            {/* Foto */}
            <div
              onClick={() => fileRefs.current[produto.id]?.click()}
              style={{ height: 160, position: 'relative', cursor: 'pointer', overflow: 'hidden', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {produto.foto
                ? <img src={produto.foto} alt={produto.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 72 }}>{produto.emoji}</span>
              }
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)',
                padding: '20px 16px 12px',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Camera size={16} color="#fff" />
                <span style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>
                  {produto.foto ? 'Trocar foto' : 'Adicionar foto real'}
                </span>
              </div>
              <input
                ref={el => { fileRefs.current[produto.id] = el }}
                type="file" accept="image/*"
                style={{ display: 'none' }}
                onChange={e => handleFoto(e, produto.id)}
              />
              <span style={{
                position: 'absolute', top: 10, right: 10,
                background: produto.ativo ? '#22c55e' : '#ef4444',
                color: '#fff', fontSize: 10, fontWeight: 700,
                padding: '3px 10px', borderRadius: 20,
              }}>{produto.ativo ? 'Ativo' : 'Pausado'}</span>
              <span style={{
                position: 'absolute', top: 10, left: 10,
                background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                color: '#fff', fontSize: 10, fontWeight: 700,
                padding: '3px 10px', borderRadius: 20,
              }}>{produto.categoria}</span>
            </div>

            {/* Info */}
            <div style={{ padding: '14px 16px' }}>
              {editando === produto.id ? (
                <div>
                  <input value={editNome} onChange={e => setEditNome(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #f97316', fontSize: 14, marginBottom: 8, boxSizing: 'border-box', outline: 'none' }} />
                  <input value={editPreco} onChange={e => setEditPreco(e.target.value)} type="number" placeholder="Preço R$"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, marginBottom: 10, boxSizing: 'border-box', outline: 'none' }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => salvarEdicao(produto.id)} style={{
                      flex: 1, background: '#22c55e', border: 'none', borderRadius: 8,
                      padding: '9px 0', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    }}><Check size={14} /> Salvar</button>
                    <button onClick={() => setEditando(null)} style={{
                      flex: 1, background: '#f1f5f9', border: 'none', borderRadius: 8,
                      padding: '9px 0', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{produto.nome}</div>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10, lineHeight: 1.4 }}>{produto.descricao}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
                      R$ {produto.preco.toFixed(2).replace('.', ',')}
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => toggleAtivo(produto.id)} style={{
                        background: produto.ativo ? '#fef2f2' : '#f0fdf4',
                        border: 'none', borderRadius: 8, padding: '7px 12px', cursor: 'pointer',
                        fontSize: 12, fontWeight: 700,
                        color: produto.ativo ? '#ef4444' : '#16a34a',
                      }}>{produto.ativo ? 'Pausar' : 'Ativar'}</button>
                      <button onClick={() => { setEditando(produto.id); setEditNome(produto.nome); setEditPreco(String(produto.preco)) }} style={{
                        background: '#f0f9ff', border: 'none', borderRadius: 8, padding: '7px 12px',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        fontSize: 12, fontWeight: 700, color: '#0ea5e9',
                      }}><Edit2 size={12} /> Editar</button>
                      <button onClick={() => deletar(produto.id)} style={{
                        background: '#fff5f5', border: 'none', borderRadius: 8, padding: '7px 10px',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}><Trash2 size={14} color="#ef4444" /></button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
