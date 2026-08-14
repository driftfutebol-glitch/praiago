import { useEffect, useRef, useState } from 'react'
import {
  Camera,
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
import ProductCategoryPicker, { CategoryPhoto } from '../components/ProductCategoryPicker'
import { getSessao } from '../lib/auth'
import { alertDialog, confirmDialog } from '../lib/dialog'
import { FEATURED_PRODUCT_CATEGORIES, getProductCategory } from '../lib/productCategories'
import { supabase } from '../lib/supabase'

const PRODUCT_IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])

type Produto = {
  id: string
  nome: string
  preco: number
  descricao: string | null
  categoria: string
  ativo: boolean
  foto: string | null
  emoji: string | null
}

type ProfileInfo = {
  nome: string | null
  categoria: string | null
  emoji: string | null
  verificado: boolean | null
}

type ProductForm = {
  id: string | null
  nome: string
  preco: string
  descricao: string
  categoria: string
  foto: string | null
}

const emptyForm = (): ProductForm => ({
  id: null,
  nome: '',
  preco: '',
  descricao: '',
  categoria: FEATURED_PRODUCT_CATEGORIES[0].label,
  foto: null,
})

const money = (value: number) => value.toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const inputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 46,
  border: '1px solid #dfe6ed',
  borderRadius: 8,
  background: '#f8fafc',
  color: '#132238',
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
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!sessao?.id) return
    let active = true

    const load = async () => {
      const [{ data: products }, { data: profileData }] = await Promise.all([
        supabase
          .from('produtos')
          .select('id,nome,preco,descricao,categoria,ativo,foto,emoji')
          .eq('vendedor_id', sessao.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('nome,categoria,emoji,verificado')
          .eq('id', sessao.id)
          .maybeSingle(),
      ])

      if (!active) return
      setProdutos((products || []) as Produto[])
      setProfile((profileData || null) as ProfileInfo | null)
      setLoading(false)
    }

    void load()
    const channel = supabase
      .channel(`ambulante_produtos_${sessao.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos', filter: `vendedor_id=eq.${sessao.id}` }, load)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${sessao.id}` }, load)
      .subscribe()

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [sessao?.id])

  function openCreate() {
    if (profile?.verificado !== true) {
      void alertDialog({
        title: 'Verificação pendente',
        message: 'Seu cadastro precisa estar aprovado para publicar produtos.',
        tone: 'danger',
      })
      return
    }
    setForm(emptyForm())
    setModalOpen(true)
  }

  function openEdit(product: Produto) {
    setForm({
      id: product.id,
      nome: product.nome,
      preco: String(product.preco),
      descricao: product.descricao || '',
      categoria: getProductCategory(product.categoria).label,
      foto: product.foto,
    })
    setModalOpen(true)
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

    const category = getProductCategory(form.categoria)
    const payload = {
      nome: form.nome.trim(),
      preco: Number(price.toFixed(2)),
      descricao: form.descricao.trim(),
      categoria: category.label,
      foto: form.foto,
      emoji: '',
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

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <h1>Produtos</h1>
          <p>Organize o que os clientes encontram no PraiaGo.</p>
        </div>
        <button type="button" className="icon-button" onClick={openCreate} disabled={profile?.verificado !== true} aria-label="Adicionar produto">
          <Plus size={21} />
        </button>
      </div>

      {profile?.verificado === false && (
        <div className="surface" style={{ marginBottom: 14, padding: 14, borderColor: '#f4d39f', background: '#fffaf2', boxShadow: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#b54708', fontSize: 13, fontWeight: 850 }}>
            <CheckCircle2 size={18} />
            Cadastro aguardando aprovação
          </div>
          <p style={{ margin: '6px 0 0', color: '#7b5b2e', fontSize: 12, lineHeight: 1.45, fontWeight: 600 }}>
            A publicação será liberada assim que a verificação for aprovada.
          </p>
        </div>
      )}

      {loading ? (
        <div className="surface shimmer" style={{ height: 132 }} />
      ) : produtos.length === 0 ? (
        <div className="surface" style={{ padding: '32px 20px', textAlign: 'center', boxShadow: 'none' }}>
          <PackageOpen size={34} color="#718096" style={{ margin: '0 auto 12px' }} />
          <div style={{ color: '#132238', fontSize: 16, fontWeight: 900 }}>Seu catálogo está vazio</div>
          <p style={{ margin: '6px auto 16px', maxWidth: 260, color: '#617089', fontSize: 13, lineHeight: 1.45, fontWeight: 600 }}>
            Cadastre o primeiro produto com categoria e foto.
          </p>
          <button type="button" className="primary-button" onClick={openCreate} disabled={profile?.verificado !== true}>
            <Plus size={18} />
            Adicionar produto
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {produtos.map(product => {
            const category = getProductCategory(product.categoria)
            return (
              <motion.article layout key={product.id} className="surface" style={{ padding: 12, boxShadow: 'none', opacity: product.ativo ? 1 : 0.68 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 78, height: 78, flex: '0 0 78px', display: 'grid', placeItems: 'center', overflow: 'hidden', borderRadius: 8, background: '#f2f5f7' }}>
                    {product.foto
                      ? <img src={product.foto} alt={product.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <CategoryPhoto category={category} size={72} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h2 style={{ margin: 0, color: '#132238', fontSize: 15, lineHeight: 1.25, fontWeight: 900 }}>{product.nome}</h2>
                        <div style={{ marginTop: 4, color: '#148447', fontSize: 15, fontWeight: 900 }}>{money(Number(product.preco) || 0)}</div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={product.ativo}
                        aria-label={product.ativo ? 'Marcar como esgotado' : 'Disponibilizar produto'}
                        onClick={() => void toggleActive(product)}
                        className="status-pill"
                        style={{ border: 0, color: product.ativo ? '#148447' : '#617089', background: product.ativo ? '#eaf8ef' : '#edf1f5', cursor: 'pointer' }}
                      >
                        <span className="status-dot" style={{ background: product.ativo ? '#18a957' : '#8793a5' }} />
                        {product.ativo ? 'Disponível' : 'Esgotado'}
                      </button>
                    </div>
                    <div style={{ marginTop: 7, color: category.color, fontSize: 11, fontWeight: 850 }}>{category.label}</div>
                  </div>
                </div>

                {product.descricao && (
                  <p style={{ margin: '10px 0 0', color: '#617089', fontSize: 12, lineHeight: 1.45, fontWeight: 600 }}>{product.descricao}</p>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid #e7ecf1' }}>
                  <button type="button" className="secondary-button" style={{ minHeight: 38, flex: 1 }} onClick={() => openEdit(product)}>
                    <Edit3 size={16} />
                    Editar
                  </button>
                  <button type="button" className="danger-button" style={{ minHeight: 38, width: 42, padding: 0 }} onClick={() => void removeProduct(product)} aria-label={`Excluir ${product.nome}`}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </motion.article>
            )
          })}
        </div>
      )}

      <AnimatePresence>
        {modalOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
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
              style={{ width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', position: 'relative', zIndex: 1, padding: '18px 18px 28px', borderRadius: '8px 8px 0 0', background: '#fff' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
                <div>
                  <h2 id="product-form-title" style={{ margin: 0, color: '#132238', fontSize: 20, fontWeight: 900 }}>
                    {form.id ? 'Editar produto' : 'Novo produto'}
                  </h2>
                  <p style={{ margin: '4px 0 0', color: '#617089', fontSize: 12, fontWeight: 600 }}>Essas informações aparecem para o cliente.</p>
                </div>
                <button type="button" className="icon-button" onClick={() => setModalOpen(false)} aria-label="Fechar">
                  <X size={19} />
                </button>
              </div>

              <div style={{ display: 'grid', gap: 15 }}>
                <div>
                  <label className="field-label" htmlFor="product-name">Nome</label>
                  <input id="product-name" value={form.nome} maxLength={80} onChange={event => setForm(current => ({ ...current, nome: event.target.value }))} placeholder="Ex.: Água de coco 500 ml" style={{ ...inputStyle, marginTop: 7 }} />
                </div>

                <div>
                  <label className="field-label" htmlFor="product-price">Preço</label>
                  <input id="product-price" inputMode="decimal" value={form.preco} onChange={event => setForm(current => ({ ...current, preco: event.target.value }))} placeholder="0,00" style={{ ...inputStyle, marginTop: 7 }} />
                </div>

                <div>
                  <label className="field-label" htmlFor="product-description">Descrição</label>
                  <textarea id="product-description" value={form.descricao} maxLength={220} rows={3} onChange={event => setForm(current => ({ ...current, descricao: event.target.value }))} placeholder="Tamanho, sabores e o que acompanha" style={{ ...inputStyle, minHeight: 82, resize: 'vertical', marginTop: 7 }} />
                </div>

                <ProductCategoryPicker value={form.categoria} onChange={category => setForm(current => ({ ...current, categoria: category.label }))} />

                <div>
                  <div className="field-label">Foto do produto</div>
                  <div className="field-help">Use uma foto clara e sem texto cobrindo o produto.</div>
                  <input ref={fileRef} type="file" accept="image/*" onChange={uploadPhoto} style={{ display: 'none' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 9 }}>
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Escolher foto" style={{ width: 92, height: 76, display: 'grid', placeItems: 'center', flex: '0 0 92px', overflow: 'hidden', padding: 0, border: '1px dashed #b9c8d6', borderRadius: 8, background: '#f7fafc', color: '#008fc0', cursor: 'pointer' }}>
                      {uploading
                        ? <Loader2 className="animate-spin-slow" size={22} />
                        : form.foto
                          ? <img src={form.foto} alt="Prévia do produto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <ImagePlus size={24} />}
                    </button>
                    <div style={{ flex: 1, color: '#617089', fontSize: 12, lineHeight: 1.4, fontWeight: 600 }}>
                      {form.foto ? 'Foto pronta para publicar.' : 'JPG, PNG ou WebP de até 5 MB.'}
                      {form.foto && (
                        <button type="button" className="text-command" onClick={() => setForm(current => ({ ...current, foto: null }))} style={{ display: 'flex', paddingLeft: 0, color: '#dc3c4d' }}>
                          Remover foto
                        </button>
                      )}
                    </div>
                    <Camera size={18} color="#8793a5" />
                  </div>
                </div>

                <button type="button" className="primary-button" onClick={() => void saveProduct()} disabled={saving || uploading} style={{ width: '100%', marginTop: 3 }}>
                  {saving ? <Loader2 className="animate-spin-slow" size={18} /> : null}
                  {saving ? 'Salvando' : 'Salvar produto'}
                </button>
              </div>
            </motion.section>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
