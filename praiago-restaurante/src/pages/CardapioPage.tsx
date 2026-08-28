import { useState, useRef, useEffect } from 'react'
import { Plus, Trash2, Edit2, Check, X, Camera, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { getSessao } from '../lib/auth'
import { alertDialog, confirmDialog } from '../lib/dialog'
import ProductCategoryPicker, { CategoryPhoto } from '../components/ProductCategoryPicker'
import { getProductCategory } from '../lib/productCategories'

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
  // NULO = a loja nao controla estoque desse item (ilimitado). 0 = esgotado.
  estoque: number | null
}

type NovoForm = {
  nome: string
  preco: string
  descricao: string
  categoria: string
  emoji: string
  foto: string | null
  estoque: string
}

const NOVO_INICIAL: NovoForm = {
  nome: '',
  preco: '',
  descricao: '',
  categoria: 'Almoço',
  emoji: '🍽️',
  foto: null,
  estoque: '',
}

const FOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

function extensaoFoto(file: File) {
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
}

function caminhoFotoProduto(url: string | null) {
  if (!url) return null
  const marcador = '/storage/v1/object/public/produtos/'
  const indice = url.indexOf(marcador)
  if (indice < 0) return null
  try {
    return decodeURIComponent(url.slice(indice + marcador.length))
  } catch {
    return null
  }
}

export default function CardapioPage() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todos')
  const [editando, setEditando] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editPreco, setEditPreco] = useState('')
  const [editCategoria, setEditCategoria] = useState('')
  const [editEstoque, setEditEstoque] = useState('')
  const [adicionando, setAdicionando] = useState(false)
  const [loading, setLoading] = useState(true)
  const [verificado, setVerificado] = useState<boolean | null>(null)
  const [novo, setNovo] = useState<NovoForm>(NOVO_INICIAL)
  const [novaFotoArquivo, setNovaFotoArquivo] = useState<File | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [fotoProdutoId, setFotoProdutoId] = useState<string | null>(null)
  const [enviandoFotoId, setEnviandoFotoId] = useState<string | null>(null)
  const novaFotoRef = useRef<HTMLInputElement>(null)
  const trocarFotoRef = useRef<HTMLInputElement>(null)

  const sessao = getSessao()

  useEffect(() => {
    fetchProdutos()
    if (!sessao?.id) return

    let ativo = true
    const carregarVerificacao = () => {
      supabase.from('profiles').select('verificado').eq('id', sessao.id).maybeSingle()
        .then(({ data }) => { if (ativo) setVerificado(Boolean(data?.verificado)) })
    }

    carregarVerificacao()
    const ch = supabase.channel(`restaurante_cardapio_verificado_${sessao.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${sessao.id}` }, payload => {
        setVerificado(Boolean((payload.new as { verificado?: boolean | null }).verificado))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verificacoes', filter: `user_id=eq.${sessao.id}` }, () => carregarVerificacao())
      .subscribe()

    return () => {
      ativo = false
      supabase.removeChannel(ch)
    }
  }, [sessao?.id])

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
    const ok = await confirmDialog({ title: 'Excluir produto?', message: 'Ele some do cardápio pra sempre. Não dá pra desfazer.', confirmText: 'Excluir', tone: 'danger' })
    if (!ok) return
    const produto = produtos.find(p => p.id === id)
    const anteriores = produtos
    setProdutos(prev => prev.filter(p => p.id !== id))
    const { error } = await supabase.from('produtos').delete().eq('id', id)
    if (error) {
      setProdutos(anteriores)
      await alertDialog({ title: 'Erro', message: 'Não deu pra excluir. Tente de novo.', tone: 'danger' })
      return
    }

    const caminho = caminhoFotoProduto(produto?.foto ?? null)
    if (caminho) await supabase.storage.from('produtos').remove([caminho])
  }

  function erroDaFoto(file: File) {
    if (!FOTO_MIME_TYPES.includes(file.type)) return 'Use uma imagem JPG, PNG ou WebP.'
    if (file.size > 5 * 1024 * 1024) return 'A foto deve ter no maximo 5 MB.'
    return null
  }

  function selecionarNovaFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const erro = erroDaFoto(file)
    if (erro) {
      void alertDialog({ title: 'Foto invalida', message: erro, tone: 'danger' })
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setNovaFotoArquivo(file)
      setNovo(atual => ({ ...atual, foto: String(reader.result) }))
    }
    reader.readAsDataURL(file)
  }

  async function subirFoto(file: File) {
    if (!sessao) throw new Error('Sessao do restaurante indisponivel.')
    const nomeSeguro = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extensaoFoto(file)}`
    const caminho = `${sessao.id}/${nomeSeguro}`
    const { error } = await supabase.storage
      .from('produtos')
      .upload(caminho, file, { contentType: file.type, upsert: false })
    if (error) throw new Error(error.message)

    const { data } = supabase.storage.from('produtos').getPublicUrl(caminho)
    return { caminho, url: data.publicUrl }
  }

  async function trocarFotoProduto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const produto = produtos.find(p => p.id === fotoProdutoId)
    if (!file || !produto) return

    const erro = erroDaFoto(file)
    if (erro) {
      await alertDialog({ title: 'Foto invalida', message: erro, tone: 'danger' })
      return
    }

    setEnviandoFotoId(produto.id)
    let novoCaminho: string | null = null
    try {
      const upload = await subirFoto(file)
      novoCaminho = upload.caminho
      const { error } = await supabase
        .from('produtos')
        .update({ foto: upload.url })
        .eq('id', produto.id)
      if (error) throw new Error(error.message)

      setProdutos(atuais => atuais.map(p => p.id === produto.id ? { ...p, foto: upload.url } : p))
      const caminhoAnterior = caminhoFotoProduto(produto.foto)
      if (caminhoAnterior) await supabase.storage.from('produtos').remove([caminhoAnterior])
    } catch (error) {
      if (novoCaminho) await supabase.storage.from('produtos').remove([novoCaminho])
      console.error('Erro ao trocar foto do produto:', error)
      await alertDialog({ title: 'Nao deu pra enviar', message: 'Tente outra foto em instantes.', tone: 'danger' })
    } finally {
      setEnviandoFotoId(null)
      setFotoProdutoId(null)
    }
  }

  async function salvarEdicao(id: string) {
    const p = produtos.find(p => p.id === id)
    if (!p) return

    const newNome = editNome || p.nome
    const precoNum = parseFloat(editPreco)
    if (editPreco.trim() !== '' && (!Number.isFinite(precoNum) || precoNum <= 0 || precoNum > 100000)) {
      await alertDialog({ title: 'Preço inválido', message: 'Informe um preço maior que zero.', tone: 'danger' }); return
    }
    const newPreco = editPreco.trim() !== '' ? precoNum : p.preco

    const newCategoria = getProductCategory(editCategoria || p.categoria).label
    // Campo vazio grava NULO de proposito: "sem numero" quer dizer "nao
    // controlo estoque", que e diferente de zero (zero e esgotado).
    const newEstoque = editEstoque.trim() === ''
      ? null
      : Math.max(0, Math.floor(Number(editEstoque) || 0))

    setProdutos(prev => prev.map(p => p.id === id
      ? { ...p, nome: newNome, preco: newPreco, categoria: newCategoria, estoque: newEstoque }
      : p
    ))
    setEditando(null)

    await supabase.from('produtos')
      .update({ nome: newNome, preco: newPreco, categoria: newCategoria, estoque: newEstoque })
      .eq('id', id)
  }

  async function adicionarProduto() {
    if (!novo.nome.trim() || !sessao || salvando) return
    if (!verificado) {
      await alertDialog({ title: 'Verificacao obrigatoria', message: 'Complete o KYC para criar produtos. Enquanto nao aprovar, o restaurante nao aparece no mapa.', tone: 'danger' })
      return
    }

    const precoNum = parseFloat(novo.preco)
    if (!Number.isFinite(precoNum) || precoNum <= 0 || precoNum > 100000) {
      await alertDialog({ title: 'Preço inválido', message: 'Informe um preço maior que zero (e realista).', tone: 'danger' })
      return
    }

    setSalvando(true)
    let caminhoEnviado: string | null = null
    try {
      let fotoUrl: string | null = null
      if (novaFotoArquivo) {
        const upload = await subirFoto(novaFotoArquivo)
        caminhoEnviado = upload.caminho
        fotoUrl = upload.url
      }

      const { data, error } = await supabase.from('produtos').insert({
        vendedor_id: sessao.id,
        nome: novo.nome.trim(),
        preco: precoNum,
        descricao: novo.descricao.trim(),
        categoria: novo.categoria,
        ativo: true,
        emoji: novo.emoji,
        foto: fotoUrl,
        // Campo vazio grava NULO de proposito: "sem numero" quer dizer "nao
        // controlo estoque", que e diferente de zero (zero e esgotado).
        estoque: novo.estoque.trim() === ''
          ? null
          : Math.max(0, Math.floor(Number(novo.estoque) || 0)),
      }).select().single()
      if (error || !data) throw new Error(error?.message || 'Produto nao criado.')

      setProdutos(prev => [data, ...prev])
      setNovo(NOVO_INICIAL)
      setNovaFotoArquivo(null)
      setAdicionando(false)
    } catch (error) {
      if (caminhoEnviado) await supabase.storage.from('produtos').remove([caminhoEnviado])
      console.error('Erro ao adicionar produto:', error)
      await alertDialog({ title: 'Nao deu pra criar', message: error instanceof Error ? error.message : 'Confira sua verificacao e tente novamente.', tone: 'danger' })
    } finally {
      setSalvando(false)
    }
  }

  const todasCategorias = ['Todos', ...Array.from(new Set(produtos.map(p => getProductCategory(p.categoria).label)))]
  const filtrados = categoriaFiltro === 'Todos'
    ? produtos
    : produtos.filter(p => getProductCategory(p.categoria).label === categoriaFiltro)

  return (
    <div style={{ padding: '32px 0 48px', minHeight: '100vh', position: 'relative' }}>
      <input
        ref={trocarFotoRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={trocarFotoProduto}
        style={{ display: 'none' }}
      />

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{ padding: '0 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: '#0f172a', letterSpacing: -1, marginBottom: 8 }}>Cardápio</h1>
          <p style={{ color: '#64748b', fontSize: 16 }}>Gerencie seus pratos, bebidas e combos.</p>
        </div>
        <button onClick={() => { if (verificado) setAdicionando(true) }} disabled={!verificado} style={{ display: 'flex', alignItems: 'center', gap: 8, background: verificado ? 'linear-gradient(135deg, #f97316, #ea580c)' : '#cbd5e1', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 16, fontSize: 15, fontWeight: 700, cursor: verificado ? 'pointer' : 'not-allowed', boxShadow: verificado ? '0 10px 25px rgba(249,115,22,0.3)' : 'none', transition: 'transform 0.2s, box-shadow 0.2s' }} onMouseOver={e => { if (verificado) e.currentTarget.style.transform = 'translateY(-2px)' }} onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}>
          <Plus size={20} />
          Adicionar Item
        </button>
      </motion.div>

      {/* Gate de verificação: sem CNPJ aprovado, não anuncia produto e não aparece pro cliente */}
      {verificado === false && (
        <div style={{ margin: '0 40px 24px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 16, padding: '16px 20px' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#b45309', marginBottom: 4 }}>⚠️ Verificação pendente</div>
          <p style={{ fontSize: 14, color: '#92400e', margin: 0, lineHeight: 1.5 }}>
            Você precisa <strong>completar a verificação (CNPJ + documento)</strong> antes de anunciar produtos.
            Enquanto não verificar, seu restaurante <strong>não aparece no mapa</strong> pros clientes. Envie sua verificação no topo do painel.
          </p>
        </div>
      )}

      {/* Tabs / Filters */}
      <div style={{ padding: '0 40px', marginBottom: 32, display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }} className="hide-scrollbar">
        {todasCategorias.map(cat => (
          <button key={cat} onClick={() => setCategoriaFiltro(cat)} style={{ minHeight: 54, padding: cat === 'Todos' ? '8px 20px' : '6px 15px 6px 8px', borderRadius: 14, fontSize: 13, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s', background: categoriaFiltro === cat ? '#fff7ed' : '#ffffff', color: categoriaFiltro === cat ? '#ea580c' : '#475569', border: `1px solid ${categoriaFiltro === cat ? '#fdba74' : '#e2e8f0'}`, display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: categoriaFiltro === cat ? '0 7px 18px rgba(234,88,12,0.12)' : 'none' }}>
            {cat !== 'Todos' && <CategoryPhoto category={getProductCategory(cat)} size={40} />}
            <span>{cat}</span>
          </button>
        ))}
      </div>

      {/* Grid */}
      <div style={{ padding: '0 40px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
        <AnimatePresence>
          {loading ? (
            <div style={{ color: '#64748b', padding: 20 }}>Carregando cardápio do servidor...</div>
          ) : filtrados.map(p => (
            <motion.div key={p.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.2 }} style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)', borderRadius: 24, padding: 20, border: '1px solid rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
              {/* Badge Ativo */}
              <button onClick={() => toggleAtivo(p.id)} style={{ position: 'absolute', top: 20, right: 20, background: p.ativo ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${p.ativo ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, color: p.ativo ? '#4ade80' : '#f87171', padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}>
                {p.ativo ? 'ATIVO' : 'PAUSADO'}
              </button>

              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <div style={{ width: 72, height: 72, borderRadius: 16, background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, position: 'relative', overflow: 'hidden' }}>
                  {p.foto
                    ? <img src={p.foto} alt={p.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <CategoryPhoto category={getProductCategory(p.categoria)} size={72} />}
                  <button
                    type="button"
                    title={p.foto ? 'Trocar foto' : 'Adicionar foto'}
                    aria-label={p.foto ? `Trocar foto de ${p.nome}` : `Adicionar foto a ${p.nome}`}
                    disabled={enviandoFotoId === p.id}
                    onClick={() => {
                      setFotoProdutoId(p.id)
                      trocarFotoRef.current?.click()
                    }}
                    style={{
                      position: 'absolute', right: 4, bottom: 4, width: 28, height: 28,
                      borderRadius: 8, border: '1px solid rgba(255,255,255,0.7)',
                      background: '#ffffff', color: '#ea580c', cursor: enviandoFotoId === p.id ? 'wait' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 8px rgba(15,23,42,0.22)', padding: 0,
                    }}
                  >
                    {enviandoFotoId === p.id ? <Loader2 size={15} className="animate-spin-slow" /> : <Camera size={15} />}
                  </button>
                </div>
                <div style={{ flex: 1, paddingTop: 4 }}>
                  <div style={{ fontSize: 12, color: '#f97316', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                    {getProductCategory(p.categoria).label}
                  </div>
                  {/* So aparece pra quem controla estoque: produto de estoque
                      nulo nao deve ganhar rotulo nenhum. */}
                  {p.estoque != null && (
                    <span style={{
                      display: 'inline-block', marginBottom: 6, padding: '2px 9px', borderRadius: 999,
                      fontSize: 10.5, fontWeight: 900, letterSpacing: 0.3,
                      background: p.estoque === 0 ? '#fee2e2' : p.estoque <= 3 ? '#fef3c7' : '#dcfce7',
                      color: p.estoque === 0 ? '#b91c1c' : p.estoque <= 3 ? '#92400e' : '#166534',
                    }}>
                      {p.estoque === 0 ? 'ESGOTADO' : `${p.estoque} em estoque`}
                    </span>
                  )}
                  {editando === p.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input autoFocus value={editNome} onChange={e => setEditNome(e.target.value)} style={{ width: '100%', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8, padding: '7px 9px', color: '#0f172a', fontSize: 16, fontWeight: 700, outline: 'none' }} />
                      <input value={editPreco} onChange={e => setEditPreco(e.target.value)} type="number" step="0.01" style={{ width: '100%', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8, padding: '7px 9px', color: '#0f172a', fontSize: 16, fontWeight: 700, outline: 'none' }} />
                      {/* So digito: teclado de celular deixa passar ponto e
                          virgula, e "1,5 porcao" nao existe. */}
                      <input
                        value={editEstoque}
                        onChange={e => setEditEstoque(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
                        inputMode="numeric"
                        placeholder="Estoque (vazio = sem limite)"
                        title="Quantas unidades voce tem. Vazio = nao controla estoque."
                        style={{ width: '100%', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8, padding: '7px 9px', color: '#0f172a', fontSize: 15, fontWeight: 700, outline: 'none' }}
                      />
                      {editEstoque.trim() === '0' && (
                        <div style={{ fontSize: 11.5, fontWeight: 800, color: '#b45309', lineHeight: 1.35 }}>
                          Com 0 o produto aparece como esgotado e o cliente nao consegue pedir.
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', lineHeight: 1.2 }}>{p.nome}</h3>
                      <div style={{ fontSize: 18, color: '#4ade80', fontWeight: 800 }}>R$ {p.preco.toFixed(2)}</div>
                    </>
                  )}
                </div>
              </div>

              <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.5, margin: '0 0 20px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {p.descricao}
              </p>

              {editando === p.id && (
                <div style={{ margin: '0 0 18px' }}>
                  <ProductCategoryPicker value={editCategoria || p.categoria} onChange={category => setEditCategoria(category.label)} />
                </div>
              )}

              {/* Ações */}
              <div style={{ display: 'flex', gap: 8, borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 16 }}>
                {editando === p.id ? (
                  <>
                    <button onClick={() => salvarEdicao(p.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#10b981', color: '#fff', border: 'none', padding: '8px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                      <Check size={16} /> Salvar
                    </button>
                    <button onClick={() => setEditando(null)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', padding: '8px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                      <X size={16} /> Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setEditando(p.id); setEditNome(p.nome); setEditPreco(p.preco.toString()); setEditCategoria(getProductCategory(p.categoria).label); setEditEstoque(p.estoque == null ? '' : String(p.estoque)) }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(0,0,0,0.05)', color: '#334155', border: 'none', padding: '8px', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
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
          <div style={{ position: 'fixed', inset: 0, zIndex: 12000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAdicionando(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)' }} />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} style={{ width: '100%', maxWidth: 480, maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 24, padding: 32, position: 'relative', zIndex: 12001, boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
              <button onClick={() => setAdicionando(false)} style={{ position: 'absolute', top: 20, right: 20, background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X size={24} color="#94a3b8" />
              </button>
              
              <h2 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', marginBottom: 24 }}>Novo Item</h2>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>Nome do Produto</label>
                  <input value={novo.nome} onChange={e => setNovo({...novo, nome: e.target.value})} placeholder="Ex: Porção de Isca de Peixe" style={{ width: '100%', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 12, padding: '12px 16px', color: '#0f172a', fontSize: 16, outline: 'none' }} />
                </div>
                
                <div>
                  <div>
                    <label style={{ display: 'block', fontSize: 14, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>Preço (R$)</label>
                    <input value={novo.preco} onChange={e => setNovo({...novo, preco: e.target.value})} type="number" step="0.01" placeholder="0.00" style={{ width: '100%', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 12, padding: '12px 16px', color: '#0f172a', fontSize: 16, outline: 'none' }} />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>Estoque</label>
                  <div style={{ fontSize: 12.5, color: '#94a3b8', fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>
                    Quantas unidades voce tem hoje. <strong>Deixe vazio</strong> se nao quer controlar —
                    ai o produto nunca esgota sozinho.
                  </div>
                  {/* So digito: teclado de celular deixa passar ponto e
                      virgula, e "1,5 porcao" nao existe. */}
                  <input
                    value={novo.estoque}
                    onChange={e => setNovo({ ...novo, estoque: e.target.value.replace(/[^0-9]/g, '').slice(0, 5) })}
                    inputMode="numeric"
                    placeholder="Sem limite"
                    style={{ width: '100%', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 12, padding: '12px 16px', color: '#0f172a', fontSize: 16, outline: 'none' }}
                  />
                  {novo.estoque.trim() === '0' && (
                    <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, color: '#b45309' }}>
                      Com 0 o produto aparece como esgotado e o cliente nao consegue pedir.
                    </div>
                  )}
                </div>

                <ProductCategoryPicker value={novo.categoria} onChange={category => setNovo({ ...novo, categoria: category.label })} />

                <div>
                  <label style={{ display: 'block', fontSize: 14, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>Descrição</label>
                  <textarea value={novo.descricao} onChange={e => setNovo({...novo, descricao: e.target.value})} placeholder="Ingredientes e detalhes..." rows={3} style={{ width: '100%', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 12, padding: '12px 16px', color: '#0f172a', fontSize: 16, outline: 'none', resize: 'none' }} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>Foto do produto (opcional)</label>
                  <input
                    ref={novaFotoRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={selecionarNovaFoto}
                    style={{ display: 'none' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                      type="button"
                      title={novo.foto ? 'Trocar foto' : 'Adicionar foto'}
                      onClick={() => novaFotoRef.current?.click()}
                      style={{
                        width: 84, height: 84, borderRadius: 12,
                        border: `1.5px dashed ${novo.foto ? 'transparent' : 'rgba(249,115,22,0.45)'}`,
                        background: novo.foto ? 'transparent' : 'rgba(249,115,22,0.07)',
                        cursor: 'pointer', overflow: 'hidden', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0,
                      }}
                    >
                      {novo.foto
                        ? <img src={novo.foto} alt="Novo produto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <Camera size={25} color="#ea580c" />}
                    </button>
                    <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                      {novo.foto ? (
                        <button
                          type="button"
                          onClick={() => {
                            setNovaFotoArquivo(null)
                            setNovo(atual => ({ ...atual, foto: null }))
                          }}
                          style={{ border: 0, background: 'transparent', color: '#dc2626', fontWeight: 800, cursor: 'pointer', padding: 0 }}
                        >
                          Remover foto
                        </button>
                      ) : 'JPG, PNG ou WebP. Maximo 5 MB.'}
                    </div>
                  </div>
                </div>

                <button disabled={salvando} onClick={adicionarProduto} style={{ width: '100%', padding: '16px', borderRadius: 16, background: 'linear-gradient(135deg, #f97316, #ea580c)', border: 'none', color: '#fff', fontSize: 16, fontWeight: 800, marginTop: 16, cursor: salvando ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: salvando ? 0.7 : 1 }}>
                  {salvando ? <Loader2 size={20} className="animate-spin-slow" /> : <Plus size={20} />}
                  {salvando ? 'Salvando...' : 'Salvar Produto'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
