import { useEffect, useRef, useState } from 'react'
import {
  Camera,
  BadgePercent,
  Boxes,
  CheckCircle2,
  Edit3,
  ImagePlus,
  Loader2,
  PackageOpen,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import CategoryTabs from '../components/CategoryTabs'
import ProductMenuOptions, { type MenuOptions } from '../components/ProductMenuOptions'
import ProductCategoryPicker, { CategoryPhoto } from '../components/ProductCategoryPicker'
import { getSessao } from '../lib/auth'
import { alertDialog, confirmDialog } from '../lib/dialog'
import { FEATURED_PRODUCT_CATEGORIES, getProductCategory } from '../lib/productCategories'
import { supabase } from '../lib/supabase'
import MenuCategoryManager from '../components/MenuCategoryManager'
import { useMenuCategories } from '../hooks/useMenuCategories'
import { menuCategoryKey, mergeMenuCategories, validateMenuCategory } from '../../../mobile/menuCategoryPolicy'
import { comboSummary, parseComboEntries, type ComboEntry } from '../../../mobile/comboOffers'

const PRODUCT_IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])

type Produto = {
  tipo_produto?: 'simples' | 'combo'
  combo_itens?: ComboEntry[]
  menu_secao?: string | null
  pizza_meio_a_meio?: boolean
  pizza_tamanho?: string | null
  id: string
  nome: string
  preco: number
  descricao: string | null
  categoria: string
  ativo: boolean
  foto: string | null
  emoji: string | null
  // NULO = a loja nao controla estoque desse item (ilimitado). 0 = esgotado.
  estoque: number | null
}

type ProfileInfo = {
  nome: string | null
  categoria: string | null
  emoji: string | null
  verificado: boolean | null
}

type ProductForm = MenuOptions & {
  tipo_produto: 'simples' | 'combo'
  combo_itens: ComboEntry[]
  id: string | null
  nome: string
  preco: string
  descricao: string
  categoria: string
  foto: string | null
  estoque: string
}

const emptyForm = (): ProductForm => ({
  tipo_produto: 'simples', combo_itens: [],
  id: null,
  menu_secao: '', pizza_meio_a_meio: false, pizza_tamanho: '',
  nome: '',
  preco: '',
  descricao: '',
  categoria: FEATURED_PRODUCT_CATEGORIES[0].label,
  foto: null,
  estoque: '',
})

const money = (value: number) => value.toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const inputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 46,
  border: '1px solid var(--line)',
  borderRadius: 8,
  background: 'var(--surface-soft)',
  color: 'var(--ink-strong)',
  padding: '11px 12px',
  outline: 0,
  fontSize: 14,
  fontWeight: 650,
}

export default function CardapioPage() {
  const sessao = getSessao()
  const fileRef = useRef<HTMLInputElement>(null)
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [profile, setProfile] = useState<ProfileInfo | null>(null)
  const [categoryFilter, setCategoryFilter] = useState('Todos')
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [modalOpen, setModalOpen] = useState(false)
  const [categoryFirst, setCategoryFirst] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const menuCategories = useMenuCategories(sessao?.id)
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [promotions, setPromotions] = useState<Record<string, { id: string; preco_promocional: number; ativo: boolean; data_fim: string | null }>>({})
  const [promoProductId, setPromoProductId] = useState<string | null>(null)
  const [promoPrice, setPromoPrice] = useState('')
  const [promoEnd, setPromoEnd] = useState('')
  const [savingPromo, setSavingPromo] = useState(false)

  useEffect(() => {
    if (!sessao?.id) return
    let active = true

    const load = async () => {
      const [{ data: products }, { data: profileData }, { data: offers }] = await Promise.all([
        supabase
          .from('produtos')
          .select('id,nome,preco,descricao,categoria,ativo,foto,emoji,estoque,menu_secao,pizza_meio_a_meio,pizza_tamanho,tipo_produto,combo_itens')
          .eq('vendedor_id', sessao.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('nome,categoria,emoji,verificado')
          .eq('id', sessao.id)
          .maybeSingle(),
        supabase.from('promocoes').select('id,produto_id,preco_promocional,ativo,data_fim')
          .eq('created_by', sessao.id).order('created_at', { ascending: false }),
      ])

      if (!active) return
      setProdutos((products || []) as Produto[])
      setProfile((profileData || null) as ProfileInfo | null)
      if (offers) setPromotions(Object.fromEntries([...offers].reverse().map(item => [item.produto_id, item])))
      setLoading(false)
    }

    void load()
    const channel = supabase
      .channel(`ambulante_produtos_${sessao.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos', filter: `vendedor_id=eq.${sessao.id}` }, load)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${sessao.id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promocoes', filter: `vendedor_id=eq.${sessao.id}` }, load)
      .subscribe()

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [sessao?.id])

  function openCreate(section = '', startWithCategory = false, combo = false) {
    if (profile?.verificado !== true) {
      void alertDialog({
        title: 'Verificação pendente',
        message: 'Seu cadastro precisa estar aprovado para publicar produtos.',
        tone: 'danger',
      })
      return
    }
    setForm(combo ? { ...emptyForm(), tipo_produto: 'combo', categoria: 'Combos', menu_secao: 'Combos e promoções' }
      : { ...emptyForm(), menu_secao: section === 'Todos' ? '' : section })
    setCategoryFirst(startWithCategory)
    setModalOpen(true)
  }

  function openEdit(product: Produto) {
    setCategoryFirst(false)
    setForm({
      id: product.id,
      tipo_produto: product.tipo_produto === 'combo' ? 'combo' : 'simples', combo_itens: parseComboEntries(product.combo_itens),
      menu_secao: product.menu_secao || '', pizza_meio_a_meio: product.pizza_meio_a_meio === true, pizza_tamanho: product.pizza_tamanho || '',
      nome: product.nome,
      preco: String(product.preco),
      descricao: product.descricao || '',
      categoria: product.tipo_produto === 'combo' ? 'Combos' : getProductCategory(product.categoria).label,
      foto: product.foto,
      // null vira '' (campo vazio = ilimitado); 0 tem que virar '0', nao '',
      // senao editar um item esgotado o transformaria em ilimitado sem querer.
      estoque: product.estoque == null ? '' : String(product.estoque),
    })
    setModalOpen(true)
  }

  function openPromotion(product: Produto) {
    const offer = promotions[product.id]
    setPromoProductId(product.id)
    setPromoPrice(offer ? String(offer.preco_promocional) : '')
    setPromoEnd(offer?.data_fim ? new Date(new Date(offer.data_fim).getTime() - new Date(offer.data_fim).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '')
  }

  async function savePromotion() {
    if (!sessao?.id || !promoProductId || savingPromo) return
    const product = produtos.find(item => item.id === promoProductId)
    const price = Number(promoPrice.replace(',', '.'))
    if (!product || !Number.isFinite(price) || price <= 0 || price >= product.preco) {
      await alertDialog({ title: 'Preço inválido', message: 'O valor da oferta deve ser menor que o preço normal.', tone: 'danger' })
      return
    }
    const endMs = promoEnd ? Date.parse(promoEnd) : null
    if (endMs !== null && !Number.isFinite(endMs)) {
      await alertDialog({ title: 'Prazo inválido', message: 'Confira a data de encerramento.', tone: 'danger' })
      return
    }
    const end = endMs === null ? null : new Date(endMs).toISOString()
    if (end && new Date(end).getTime() <= Date.now()) {
      await alertDialog({ title: 'Prazo inválido', message: 'Escolha uma data futura.', tone: 'danger' })
      return
    }
    const payload = { titulo: `Oferta: ${product.nome}`, descricao: product.descricao?.slice(0, 240) || null,
      produto_id: product.id, vendedor_id: sessao.id, created_by: sessao.id,
      preco_original: product.preco, preco_promocional: price, desconto_tipo: 'preco_promocional',
      selo: 'Oferta da banca', ativo: true, publico: true, data_inicio: new Date().toISOString(), data_fim: end }
    setSavingPromo(true)
    const current = promotions[product.id]
    const { error } = current
      ? await supabase.from('promocoes').update(payload).eq('id', current.id).eq('created_by', sessao.id)
      : await supabase.from('promocoes').insert(payload)
    setSavingPromo(false)
    if (error) { await alertDialog({ title: 'Não deu para publicar', message: error.message, tone: 'danger' }); return }
    setPromoProductId(null)
    const { data } = await supabase.from('promocoes').select('id,produto_id,preco_promocional,ativo,data_fim').eq('created_by', sessao.id).order('created_at', { ascending: false })
    if (data) setPromotions(Object.fromEntries([...data].reverse().map(item => [item.produto_id, item])))
  }

  async function pausePromotion(product: Produto) {
    const offer = promotions[product.id]
    if (!offer || !sessao?.id) return
    const { error } = await supabase.from('promocoes').update({ ativo: false }).eq('id', offer.id).eq('created_by', sessao.id)
    if (error) { await alertDialog({ title: 'Não deu para pausar', message: error.message, tone: 'danger' }); return }
    setPromotions(current => ({ ...current, [product.id]: { ...offer, ativo: false } }))
  }

  async function uploadPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !sessao?.id) return

    const extension = PRODUCT_IMAGE_TYPES.get(file.type.toLowerCase())
    if (!extension) {
      await alertDialog({ title: 'Arquivo inválido', message: 'Use uma foto JPG, PNG ou WebP.', tone: 'danger' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      await alertDialog({ title: 'Foto muito grande', message: 'A imagem pode ter no máximo 5 MB.', tone: 'danger' })
      return
    }

    setUploading(true)
    const path = `${sessao.id}/${crypto.randomUUID()}.${extension}`
    const { error } = await supabase.storage.from('produtos').upload(path, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    })

    if (error) {
      setUploading(false)
      await alertDialog({ title: 'Falha no envio', message: 'Não foi possível enviar a foto. Tente novamente.', tone: 'danger' })
      return
    }

    const { data } = supabase.storage.from('produtos').getPublicUrl(path)
    setForm(current => ({ ...current, foto: data.publicUrl }))
    setUploading(false)
  }

  async function saveProduct() {
    if (!sessao?.id || saving) return
    const price = Number(form.preco.replace(',', '.'))
    if (!form.nome.trim()) {
      await alertDialog({ title: 'Nome obrigatório', message: 'Informe o nome que o cliente verá.', tone: 'danger' })
      return
    }
    if (!Number.isFinite(price) || price <= 0) {
      await alertDialog({ title: 'Preço inválido', message: 'Informe um preço maior que zero.', tone: 'danger' })
      return
    }

    const isCombo = form.tipo_produto === 'combo'
    const comboEntries = isCombo ? parseComboEntries(form.combo_itens) : []
    const combo = isCombo ? comboSummary(comboEntries, produtos.filter(item => item.ativo), sessao.id) : null
    if (isCombo && (!combo || price >= combo.separatePrice || !form.foto)) {
      await alertDialog({ title: 'Confira o combo', message: 'Escolha de 2 a 10 itens disponíveis, uma foto e preço menor que a soma dos produtos.', tone: 'danger' })
      return
    }

    const category = getProductCategory(form.categoria)
    const section = isCombo ? { name: 'Combos e promoções', error: null } : form.menu_secao.trim() ? validateMenuCategory(form.menu_secao) : null
    if (section?.error) { await alertDialog({ title: 'Confira a categoria', message: section.error, tone: 'danger' }); return }
    const pizza = !isCombo && category.id === 'pizza' && form.pizza_meio_a_meio
    if (pizza && !form.pizza_tamanho) { await alertDialog({ title: 'Tamanho obrigatório', message: 'Selecione o tamanho para combinar sabores.', tone: 'danger' }); return }
    const payload = {
      tipo_produto: form.tipo_produto, combo_itens: comboEntries,
      menu_secao: section?.name || null, pizza_meio_a_meio: pizza, pizza_tamanho: pizza ? form.pizza_tamanho : null,
      nome: form.nome.trim(),
      preco: Number(price.toFixed(2)),
      descricao: form.descricao.trim(),
      categoria: isCombo ? 'Combos' : category.label,
      foto: form.foto,
      emoji: '',
      // Campo vazio grava NULO de proposito: "sem numero" quer dizer "nao
      // controlo estoque", que e diferente de zero (zero e esgotado).
      estoque: form.estoque.trim() === '' ? null : Math.max(0, Math.floor(Number(form.estoque) || 0)),
    }

    setSaving(true)
    const result = form.id
      ? await supabase.from('produtos').update(payload).eq('id', form.id).eq('vendedor_id', sessao.id).select().single()
      : await supabase.from('produtos').insert({
          ...payload,
          vendedor_id: sessao.id,
          vendedor_nome: profile?.nome || sessao.nome,
          vendedor_categoria: profile?.categoria || 'Ambulante',
          vendedor_emoji: profile?.emoji || '',
          ativo: true,
        }).select().single()

    setSaving(false)
    if (result.error) {
      await alertDialog({ title: 'Não foi possível salvar', message: result.error.message, tone: 'danger' })
      return
    }

    const saved = result.data as Produto
    setProdutos(current => form.id
      ? current.map(product => product.id === saved.id ? saved : product)
      : [saved, ...current])
    setModalOpen(false)
    setForm(emptyForm())
  }

  async function toggleActive(product: Produto) {
    const nextActive = !product.ativo
    setProdutos(current => current.map(item => item.id === product.id ? { ...item, ativo: nextActive } : item))
    const { error } = await supabase
      .from('produtos')
      .update({ ativo: nextActive })
      .eq('id', product.id)
      .eq('vendedor_id', sessao?.id)
    if (error) {
      setProdutos(current => current.map(item => item.id === product.id ? { ...item, ativo: product.ativo } : item))
      await alertDialog({ title: 'Não foi possível atualizar', message: 'Tente novamente em alguns instantes.', tone: 'danger' })
    }
  }

  async function removeProduct(product: Produto) {
    const confirmed = await confirmDialog({
      title: 'Excluir produto?',
      message: `${product.nome} será removido do catálogo do cliente.`,
      confirmText: 'Excluir',
      tone: 'danger',
    })
    if (!confirmed) return

    const { error } = await supabase
      .from('produtos')
      .delete()
      .eq('id', product.id)
      .eq('vendedor_id', sessao?.id)
    if (error) {
      await alertDialog({ title: 'Não foi possível excluir', message: 'Tente novamente.', tone: 'danger' })
      return
    }
    setProdutos(current => current.filter(item => item.id !== product.id))
  }

  const sections = mergeMenuCategories(menuCategories.categories, produtos.map(product => product.menu_secao?.trim() || product.categoria))
  const selectedCategory = sections.includes(categoryFilter) ? categoryFilter : 'Todos'
  const filtered = produtos.filter(product => selectedCategory === 'Todos' || menuCategoryKey(product.menu_secao?.trim() || product.categoria) === menuCategoryKey(selectedCategory))
  const comboCandidates = produtos.filter(product => product.ativo && product.tipo_produto !== 'combo')
  const comboDraft = comboSummary(parseComboEntries(form.combo_itens), comboCandidates, sessao?.id)
  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <h1>Cardápio</h1>
          <p>Produtos, fotos e categorias da sua vitrine.</p>
        </div>
        <button type="button" className="icon-button" onClick={() => openCreate()} disabled={profile?.verificado !== true} aria-label="Adicionar produto">
          <Plus size={21} />
        </button>
      </div>

      {profile?.verificado === false && (
        <div className="surface" style={{ marginBottom: 14, padding: 14, borderColor: 'var(--warning-line)', background: 'var(--surface-amber)', boxShadow: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'var(--warning)', fontSize: 13, fontWeight: 850 }}>
            <CheckCircle2 size={18} />
            Cadastro aguardando aprovação
          </div>
          <p style={{ margin: '6px 0 0', color: 'var(--warning)', fontSize: 12, lineHeight: 1.45, fontWeight: 600 }}>
            A publicação será liberada assim que a verificação for aprovada.
          </p>
        </div>
      )}

      <section className="menu-overview" aria-label="Organização do cardápio">
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.8)' }}>Sua vitrine</div>
        <h2>{loading ? 'Preparando cardápio' : `${produtos.length} ${produtos.length === 1 ? 'produto' : 'produtos'} em ${sections.length} ${sections.length === 1 ? 'categoria' : 'categorias'}`}</h2>
        <p>Organize por Bebidas, Lanches, Pizzas ou crie abas próprias. O cliente vê as seções com produtos publicados.</p>
        <div className="menu-overview-actions">
          <button type="button" onClick={() => openCreate(selectedCategory)} disabled={profile?.verificado !== true}>+ Novo produto</button>
          <button type="button" onClick={() => openCreate('', false, true)} disabled={profile?.verificado !== true}><Boxes size={16} /> Criar combo</button>
          <button type="button" onClick={() => setShowCategoryManager(current => !current)} disabled={profile?.verificado !== true} aria-expanded={showCategoryManager}>Criar categoria</button>
        </div>
      </section>

      {showCategoryManager && <MenuCategoryManager initiallyOpen categories={sections} ready={menuCategories.ready} disabled={profile?.verificado !== true} error={menuCategories.error} onRetry={() => void menuCategories.reload()} onCreate={menuCategories.createCategory} onCreated={name => { setCategoryFilter(name); openCreate(name, true) }} />}
      {!loading && sections.length > 0 && <div style={{ marginBottom: 16 }}><CategoryTabs categories={['Todos', ...sections]} value={selectedCategory} onChange={setCategoryFilter} counts={{ Todos: produtos.length, ...Object.fromEntries(sections.map(section => [section, produtos.filter(product => menuCategoryKey(product.menu_secao?.trim() || product.categoria) === menuCategoryKey(section)).length])) }} /></div>}
      {loading ? (
        <div className="surface shimmer" style={{ height: 132 }} />
      ) : filtered.length === 0 ? (
        <div className="surface" style={{ padding: '32px 20px', textAlign: 'center', boxShadow: 'none' }}>
          <PackageOpen size={34} color="var(--faint)" style={{ margin: '0 auto 12px' }} />
          <div style={{ color: 'var(--ink-strong)', fontSize: 16, fontWeight: 900 }}>{selectedCategory === 'Todos' ? 'Seu catálogo está vazio' : 'Essa categoria ainda não tem produtos'}</div>
          <p style={{ margin: '6px auto 16px', maxWidth: 260, color: 'var(--muted)', fontSize: 13, lineHeight: 1.45, fontWeight: 600 }}>
            {selectedCategory === 'Todos' ? 'Cadastre o primeiro produto com categoria e foto.' : 'Adicione um produto para esta aba aparecer no Cliente.'}
          </p>
          <button type="button" className="primary-button" onClick={() => openCreate(selectedCategory)} disabled={profile?.verificado !== true}>
            <Plus size={18} />
            Adicionar produto
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.map(product => {
            const category = getProductCategory(product.categoria)
            return (
              <motion.article layout key={product.id} className="surface" style={{ padding: 15, boxShadow: 'none', opacity: product.ativo ? 1 : 0.68 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 82, height: 82, flex: '0 0 82px', display: 'grid', placeItems: 'center', overflow: 'hidden', borderRadius: 15, background: 'var(--surface-soft)' }}>
                    {product.foto
                      ? <img src={product.foto} alt={product.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <CategoryPhoto category={category} size={72} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h2 style={{ margin: 0, color: 'var(--ink-strong)', fontSize: 15, lineHeight: 1.25, fontWeight: 900 }}>{product.nome}</h2>
                        {product.tipo_produto === 'combo' && <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginTop: 5, padding: '3px 8px', borderRadius: 999, background: 'var(--surface-amber)', color: 'var(--warning)', fontSize: 10, fontWeight: 900 }}><Boxes size={11} /> COMBO</span>}
                        {promotions[product.id]?.ativo && <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginTop: 5, padding: '3px 8px', borderRadius: 999, background: 'var(--surface-green)', color: 'var(--success)', fontSize: 10, fontWeight: 900 }}><BadgePercent size={11} /> OFERTA</span>}
                        {/* So aparece pra quem controla estoque: produto de
                            estoque nulo nao deve ganhar rotulo nenhum. */}
                        {product.estoque != null && (
                          <span style={{
                            display: 'inline-block', marginTop: 4, padding: '2px 8px', borderRadius: 999,
                            fontSize: 10.5, fontWeight: 900,
                            background: product.estoque === 0 ? 'var(--surface-red)' : product.estoque <= 3 ? 'var(--surface-amber)' : 'var(--surface-green)',
                            color: product.estoque === 0 ? '#b91c1c' : product.estoque <= 3 ? 'var(--warning)' : 'var(--success)',
                          }}>
                            {product.estoque === 0 ? 'ESGOTADO' : `${product.estoque} em estoque`}
                          </span>
                        )}
                        <div style={{ marginTop: 4, color: 'var(--success)', fontSize: 15, fontWeight: 900 }}>{money(Number(product.preco) || 0)}</div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={product.ativo}
                        aria-label={product.ativo ? 'Marcar como esgotado' : 'Disponibilizar produto'}
                        onClick={() => void toggleActive(product)}
                        className="status-pill"
                        style={{ border: 0, color: product.ativo ? 'var(--success)' : 'var(--muted)', background: product.ativo ? 'var(--surface-green)' : 'var(--surface-soft)', cursor: 'pointer' }}
                      >
                        <span className="status-dot" style={{ background: product.ativo ? '#18a957' : 'var(--faint)' }} />
                        {product.ativo ? 'Disponível' : 'Esgotado'}
                      </button>
                    </div>
                    <div style={{ marginTop: 7, color: category.color, fontSize: 11, fontWeight: 850 }}>{product.menu_secao?.trim() || category.label}{product.pizza_meio_a_meio ? ` · Meio a meio (${product.pizza_tamanho})` : ''}</div>
                  </div>
                </div>

                {product.descricao && (
                  <p style={{ margin: '10px 0 0', color: 'var(--muted)', fontSize: 12, lineHeight: 1.45, fontWeight: 600 }}>{product.descricao}</p>
                )}
                {product.tipo_produto === 'combo' && <p style={{ margin: '8px 0 0', color: 'var(--warning)', fontSize: 12, lineHeight: 1.4, fontWeight: 700 }}>Inclui: {comboSummary(parseComboEntries(product.combo_itens), produtos, sessao?.id)?.items.map(item => `${item.qtd}× ${item.nome}`).join(' + ') || 'Itens indisponíveis'}</p>}

                <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                  <button type="button" className="secondary-button" style={{ minHeight: 38, flex: 1 }} onClick={() => openEdit(product)}>
                    <Edit3 size={16} />
                    Editar
                  </button>
                  <button type="button" className="danger-button" style={{ minHeight: 38, width: 42, padding: 0 }} onClick={() => void removeProduct(product)} aria-label={`Excluir ${product.nome}`}>
                    <Trash2 size={16} />
                  </button>
                </div>
                {product.tipo_produto !== 'combo' && <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="button" className="secondary-button" style={{ flex: 1, minHeight: 38 }} onClick={() => openPromotion(product)}><BadgePercent size={15} /> {promotions[product.id] ? 'Editar oferta' : 'Criar oferta'}</button>
                  {promotions[product.id]?.ativo && <button type="button" className="secondary-button" style={{ minHeight: 38 }} onClick={() => void pausePromotion(product)}>Pausar</button>}
                </div>}
              </motion.article>
            )
          })}
        </div>
      )}

      <AnimatePresence>
        {modalOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 12000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <motion.button
              type="button"
              aria-label="Fechar formulário"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModalOpen(false)}
              style={{ position: 'absolute', inset: 0, width: '100%', border: 0, background: 'rgba(15,31,48,0.56)', backdropFilter: 'blur(4px)' }}
            />
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-form-title"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              style={{ width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', position: 'relative', zIndex: 1, padding: '20px 20px calc(28px + env(safe-area-inset-bottom))', borderRadius: '24px 24px 0 0', background: 'var(--surface)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
                <div>
                  <h2 id="product-form-title" style={{ margin: 0, color: 'var(--ink-strong)', fontSize: 20, fontWeight: 900 }}>
                    {form.id ? form.tipo_produto === 'combo' ? 'Editar combo' : 'Editar produto' : form.tipo_produto === 'combo' ? 'Novo combo da banca' : categoryFirst ? 'Nova categoria e produto' : 'Novo produto'}
                  </h2>
                  <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 12, fontWeight: 600 }}>Essas informações aparecem para o cliente.</p>
                </div>
                <button type="button" className="icon-button" onClick={() => setModalOpen(false)} aria-label="Fechar">
                  <X size={19} />
                </button>
              </div>

              <div style={{ display: 'grid', gap: 15 }}>
                {categoryFirst && <>
                  <ProductMenuOptions value={form} onChange={value => setForm(current => ({ ...current, ...value }))} pizza={getProductCategory(form.categoria).id === 'pizza'} sections={sections} />
                  <ProductCategoryPicker value={form.categoria} onChange={category => setForm(current => ({ ...current, categoria: category.label }))} />
                </>}
                <div>
                  <label className="field-label" htmlFor="product-name">Nome</label>
                  <input id="product-name" value={form.nome} maxLength={80} onChange={event => setForm(current => ({ ...current, nome: event.target.value }))} placeholder="Ex.: Água de coco 500 ml" style={{ ...inputStyle, marginTop: 7 }} />
                </div>

                <div>
                  <label className="field-label" htmlFor="product-price">Preço</label>
                  <input id="product-price" inputMode="decimal" value={form.preco} onChange={event => setForm(current => ({ ...current, preco: event.target.value }))} placeholder="0,00" style={{ ...inputStyle, marginTop: 7 }} />
                </div>

                {form.tipo_produto === 'combo' && <div className="surface" style={{ padding: 14, background: 'var(--surface-amber)', boxShadow: 'none' }}>
                  <label className="field-label" htmlFor="combo-items">Produtos do combo</label>
                  <select id="combo-items" value="" onChange={event => { const id = event.target.value; if (id) setForm(current => ({ ...current, combo_itens: [...current.combo_itens, { produto_id: id, qtd: 1 }] })) }} style={{ ...inputStyle, marginTop: 7 }}>
                    <option value="">Adicionar produto do cardápio</option>
                    {comboCandidates.filter(item => !form.combo_itens.some(entry => entry.produto_id === item.id)).map(item => <option key={item.id} value={item.id}>{item.nome} · {money(item.preco)}</option>)}
                  </select>
                  {form.combo_itens.map(entry => { const product = comboCandidates.find(item => item.id === entry.produto_id); return <div key={entry.produto_id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9, fontSize: 12, color: 'var(--ink-strong)' }}>
                    <span style={{ flex: 1 }}>{product?.nome || 'Produto indisponível'}</span>
                    <input aria-label={`Quantidade de ${product?.nome || 'item'}`} type="number" min={1} max={20} value={entry.qtd} onChange={event => setForm(current => ({ ...current, combo_itens: current.combo_itens.map(item => item.produto_id === entry.produto_id ? { ...item, qtd: Math.max(1, Math.min(20, Number(event.target.value) || 1)) } : item) }))} style={{ ...inputStyle, width: 62, minHeight: 38, padding: 6 }} />
                    <button type="button" className="icon-button" aria-label={`Remover ${product?.nome || 'item'}`} onClick={() => setForm(current => ({ ...current, combo_itens: current.combo_itens.filter(item => item.produto_id !== entry.produto_id) }))}><X size={15} /></button>
                  </div> })}
                  <p style={{ margin: '10px 0 0', color: 'var(--warning)', fontSize: 12, lineHeight: 1.45, fontWeight: 700 }}>{comboDraft ? `Separados: ${money(comboDraft.separatePrice)}. O combo precisa custar menos.` : 'Escolha de 2 a 10 produtos. O estoque é conferido em cada pedido.'}</p>
                </div>}

                <div>
                  <label className="field-label" htmlFor="product-stock">Estoque</label>
                  <div className="field-help">
                    Quantas unidades você tem hoje. <strong>Deixe vazio</strong> se não quer controlar —
                    aí o produto nunca esgota sozinho.
                  </div>
                  <input
                    id="product-stock"
                    inputMode="numeric"
                    value={form.estoque}
                    onChange={event => setForm(current => ({
                      // So digito: teclado de celular deixa passar ponto e
                      // virgula, e "1,5 cerveja" nao existe.
                      ...current, estoque: event.target.value.replace(/[^0-9]/g, '').slice(0, 5),
                    }))}
                    placeholder="Sem limite"
                    style={{ ...inputStyle, marginTop: 7 }}
                  />
                  {form.estoque.trim() === '0' && (
                    <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, color: 'var(--warning)' }}>
                      Com 0 o produto aparece como esgotado e o cliente não consegue pedir.
                    </div>
                  )}
                </div>

                <div>
                  <label className="field-label" htmlFor="product-description">Descrição</label>
                  <textarea id="product-description" value={form.descricao} maxLength={220} rows={3} onChange={event => setForm(current => ({ ...current, descricao: event.target.value }))} placeholder="Tamanho, sabores e o que acompanha" style={{ ...inputStyle, minHeight: 82, resize: 'vertical', marginTop: 7 }} />
                </div>

                {!categoryFirst && form.tipo_produto !== 'combo' && <>
                  <ProductCategoryPicker value={form.categoria} onChange={category => setForm(current => ({ ...current, categoria: category.label }))} />
                  <ProductMenuOptions value={form} onChange={value => setForm(current => ({ ...current, ...value }))} pizza={getProductCategory(form.categoria).id === 'pizza'} sections={sections} />
                </>}

                <div>
                  <div className="field-label">Foto do produto {form.tipo_produto === 'combo' ? '(obrigatória)' : ''}</div>
                  <div className="field-help">Use uma foto clara e sem texto cobrindo o produto.</div>
                  <input ref={fileRef} type="file" accept="image/*" onChange={uploadPhoto} style={{ display: 'none' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 9 }}>
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Escolher foto" style={{ width: 92, height: 76, display: 'grid', placeItems: 'center', flex: '0 0 92px', overflow: 'hidden', padding: 0, border: '1px dashed var(--line-strong)', borderRadius: 8, background: 'var(--surface-soft)', color: 'var(--info)', cursor: 'pointer' }}>
                      {uploading
                        ? <Loader2 className="animate-spin-slow" size={22} />
                        : form.foto
                          ? <img src={form.foto} alt="Prévia do produto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <ImagePlus size={24} />}
                    </button>
                    <div style={{ flex: 1, color: 'var(--muted)', fontSize: 12, lineHeight: 1.4, fontWeight: 600 }}>
                      {form.foto ? 'Foto pronta para publicar.' : 'JPG, PNG ou WebP de até 5 MB.'}
                      {form.foto && (
                        <button type="button" className="text-command" onClick={() => setForm(current => ({ ...current, foto: null }))} style={{ display: 'flex', paddingLeft: 0, color: 'var(--danger)' }}>
                          Remover foto
                        </button>
                      )}
                    </div>
                    <Camera size={18} color="var(--faint)" />
                  </div>
                </div>

                <button type="button" className="primary-button" onClick={() => void saveProduct()} disabled={saving || uploading} style={{ width: '100%', marginTop: 3 }}>
                  {saving ? <Loader2 className="animate-spin-slow" size={18} /> : null}
                  {saving ? 'Salvando' : form.tipo_produto === 'combo' ? 'Publicar combo' : 'Salvar produto'}
                </button>
              </div>
            </motion.section>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {promoProductId && <div style={{ position: 'fixed', inset: 0, zIndex: 12020, display: 'grid', placeItems: 'center', padding: 18 }}>
          <button type="button" aria-label="Fechar oferta" onClick={() => setPromoProductId(null)} style={{ position: 'absolute', inset: 0, border: 0, background: 'rgba(15,31,48,.72)' }} />
          <section role="dialog" aria-modal="true" aria-labelledby="offer-title" className="surface" style={{ position: 'relative', width: '100%', maxWidth: 440, padding: 22 }}>
            <h2 id="offer-title" style={{ margin: 0, color: 'var(--ink-strong)' }}>Oferta da banca</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.45 }}>O desconto aparece em destaque no Cliente. O servidor confere o preço ao fechar o pedido.</p>
            <label className="field-label" htmlFor="offer-price">Preço promocional</label>
            <input id="offer-price" inputMode="decimal" value={promoPrice} onChange={event => setPromoPrice(event.target.value)} placeholder="Ex.: 19,90" style={{ ...inputStyle, margin: '7px 0 15px' }} />
            <label className="field-label" htmlFor="offer-end">Termina em (opcional)</label>
            <input id="offer-end" type="datetime-local" value={promoEnd} onChange={event => setPromoEnd(event.target.value)} style={{ ...inputStyle, margin: '7px 0 20px' }} />
            <div style={{ display: 'flex', gap: 8 }}><button type="button" className="secondary-button" style={{ flex: 1 }} onClick={() => setPromoProductId(null)}>Cancelar</button><button type="button" className="primary-button" style={{ flex: 1 }} disabled={savingPromo} onClick={() => void savePromotion()}>{savingPromo ? 'Salvando...' : 'Publicar oferta'}</button></div>
          </section>
        </div>}
      </AnimatePresence>
    </div>
  )
}
