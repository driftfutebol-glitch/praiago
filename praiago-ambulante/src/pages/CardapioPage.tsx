import { useState, useRef, useEffect } from 'react'
import { Plus, Trash2, Camera, Edit2, Check, X } from 'lucide-react'

const STORAGE_KEY = 'praiago_ambulante_cardapio'

type Produto = {
  id: number
  nome: string
  preco: number
  descricao: string
  ativo: boolean
  foto: string | null
  emoji: string
}

const defaultProdutos: Produto[] = [
  { id: 1, nome: 'Água de Coco', preco: 8, descricao: 'Gelada, direto do coco 🥥', ativo: true, foto: null, emoji: '🥥' },
  { id: 2, nome: 'Mate Gelado', preco: 6, descricao: 'Mate limão com bastante gelo', ativo: true, foto: null, emoji: '🧉' },
  { id: 3, nome: 'Biscoito Globo', preco: 5, descricao: 'Salgado ou doce, crocante', ativo: true, foto: null, emoji: '🍪' },
  { id: 4, nome: 'Espetinho', preco: 7, descricao: 'Frango, queijo ou carne', ativo: false, foto: null, emoji: '🍢' },
]

function loadProdutos(): Produto[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : defaultProdutos
  } catch { return defaultProdutos }
}

type NovoForm = { nome: string; preco: string; descricao: string; emoji: string }

export default function CardapioPage() {
  const [produtos, setProdutos] = useState<Produto[]>(loadProdutos)
  const [editando, setEditando] = useState<number | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editPreco, setEditPreco] = useState('')
  const [adicionando, setAdicionando] = useState(false)
  const [novo, setNovo] = useState<NovoForm>({ nome: '', preco: '', descricao: '', emoji: '🍽️' })
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
      ativo: true,
      foto: null,
      emoji: novo.emoji,
    }
    setProdutos(prev => [...prev, prod])
    setNovo({ nome: '', preco: '', descricao: '', emoji: '🍽️' })
    setAdicionando(false)
  }

  const emojis = ['🥥', '🧉', '🍢', '🍦', '🍕', '🌽', '🐟', '🍪', '🍹', '🫐', '🍉', '🥤']

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', paddingBottom: 32 }}>
      {/* Header */}
      <div style={{ background: '#fff', padding: '20px 20px 16px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Meu Cardápio</h1>
          <button onClick={() => setAdicionando(true)} style={{
            background: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
            border: 'none', borderRadius: 24, padding: '10px 18px',
            color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Plus size={16} /> Novo produto
          </button>
        </div>
        <p style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
          📸 Fotos e preços aparecem para os clientes em tempo real
        </p>
      </div>

      {/* Formulário novo produto */}
      {adicionando && (
        <div style={{ margin: '16px 20px', background: '#fff', borderRadius: 18, padding: 20, border: '2px solid #0ea5e9', boxShadow: '0 4px 20px rgba(14,165,233,0.1)' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 14 }}>+ Novo produto</div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 6 }}>ÍCONE</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {emojis.map(e => (
                <button key={e} onClick={() => setNovo(n => ({ ...n, emoji: e }))} style={{
                  width: 40, height: 40, borderRadius: 10, fontSize: 20,
                  border: novo.emoji === e ? '2px solid #0ea5e9' : '1px solid #e2e8f0',
                  background: novo.emoji === e ? '#eff6ff' : '#f8fafc',
                  cursor: 'pointer',
                }}>{e}</button>
              ))}
            </div>
          </div>

          {([
            { label: 'NOME DO PRODUTO', field: 'nome', placeholder: 'Ex: Água de Coco', type: 'text' },
            { label: 'DESCRIÇÃO', field: 'descricao', placeholder: 'Ex: Gelada, direto do coco', type: 'text' },
            { label: 'PREÇO (R$)', field: 'preco', placeholder: '0,00', type: 'number' },
          ] as const).map(({ label, field, placeholder, type }) => (
            <div key={field} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>{label}</div>
              <input
                value={novo[field]}
                onChange={e => setNovo(n => ({ ...n, [field]: e.target.value }))}
                placeholder={placeholder}
                type={type || 'text'}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: '1px solid #e2e8f0', fontSize: 14, outline: 'none',
                  boxSizing: 'border-box', background: '#f8fafc',
                }}
              />
            </div>
          ))}

          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={adicionarProduto} style={{
              flex: 1, background: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
              border: 'none', borderRadius: 12, padding: '13px 0',
              color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>Adicionar ao cardápio</button>
            <button onClick={() => setAdicionando(false)} style={{
              padding: '13px 16px', background: '#f1f5f9', border: 'none',
              borderRadius: 12, cursor: 'pointer',
            }}>
              <X size={18} color="#64748b" />
            </button>
          </div>
        </div>
      )}

      {/* Lista de produtos */}
      <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {produtos.map(produto => (
          <div key={produto.id} style={{
            background: '#fff', borderRadius: 18, overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
            border: produto.ativo ? '1px solid #e2e8f0' : '1px solid #fecaca',
            opacity: produto.ativo ? 1 : 0.7,
          }}>
            <div style={{ display: 'flex' }}>
              {/* Foto / Emoji com botão câmera */}
              <div
                onClick={() => fileRefs.current[produto.id]?.click()}
                style={{
                  width: 110, height: 110, flexShrink: 0, position: 'relative', cursor: 'pointer',
                  background: produto.foto ? 'transparent' : '#f8fafc',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {produto.foto
                  ? <img src={produto.foto} alt={produto.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 50 }}>{produto.emoji}</span>
                }
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'rgba(0,0,0,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'column', gap: 2,
                }}>
                  <Camera size={20} color="#fff" />
                  <span style={{ fontSize: 9, color: '#fff', fontWeight: 700 }}>
                    {produto.foto ? 'TROCAR' : 'FOTO'}
                  </span>
                </div>
                <input
                  ref={el => { fileRefs.current[produto.id] = el }}
                  type="file" accept="image/*" capture="environment"
                  style={{ display: 'none' }}
                  onChange={e => handleFoto(e, produto.id)}
                />
              </div>

              {/* Info */}
              <div style={{ flex: 1, padding: '14px 16px' }}>
                {editando === produto.id ? (
                  <div>
                    <input
                      value={editNome}
                      onChange={e => setEditNome(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1.5px solid #0ea5e9', fontSize: 14, marginBottom: 8, boxSizing: 'border-box', outline: 'none' }}
                    />
                    <input
                      value={editPreco}
                      onChange={e => setEditPreco(e.target.value)}
                      type="number" placeholder="Preço R$"
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      <button onClick={() => salvarEdicao(produto.id)} style={{
                        flex: 1, background: '#22c55e', border: 'none', borderRadius: 8,
                        padding: '8px 0', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      }}><Check size={13} /> Salvar</button>
                      <button onClick={() => setEditando(null)} style={{
                        flex: 1, background: '#f1f5f9', border: 'none', borderRadius: 8,
                        padding: '8px 0', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      }}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>{produto.nome}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{produto.descricao}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#22c55e' }}>
                      R$ {produto.preco.toFixed(2).replace('.', ',')}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Actions bar */}
            <div style={{ borderTop: '1px solid #f1f5f9', display: 'flex' }}>
              <button onClick={() => toggleAtivo(produto.id)} style={{
                flex: 1, background: produto.ativo ? '#f0fdf4' : '#fef2f2',
                border: 'none', padding: '11px 0', cursor: 'pointer',
                fontSize: 12, fontWeight: 700,
                color: produto.ativo ? '#16a34a' : '#ef4444',
                borderRight: '1px solid #f1f5f9',
              }}>
                {produto.ativo ? '✓ Disponível' : '✗ Pausado'}
              </button>
              <button onClick={() => { setEditando(produto.id); setEditNome(produto.nome); setEditPreco(String(produto.preco)) }} style={{
                flex: 1, background: '#f0f9ff', border: 'none', padding: '11px 0',
                cursor: 'pointer', borderRight: '1px solid #f1f5f9',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                fontSize: 12, fontWeight: 700, color: '#0ea5e9',
              }}>
                <Edit2 size={13} /> Editar
              </button>
              <button onClick={() => deletar(produto.id)} style={{
                flex: 1, background: '#fff5f5', border: 'none', padding: '11px 0', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                fontSize: 12, fontWeight: 700, color: '#ef4444',
              }}>
                <Trash2 size={13} /> Excluir
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
