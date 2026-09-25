import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getProductCategory } from '../lib/productCategories'
import { baseProductCategory, descriptionWithMenuSection } from '../lib/menuSection'

type Variant = { label: string; price: number }
type ImportProduct = {
  name: string
  description: string
  category: string
  menuSection?: string
  image?: string
  price?: number
  variants?: Variant[]
}
type ImportManifest = { version: 1; products: ImportProduct[] }
type PreparedProduct = {
  name: string
  description: string
  category: string
  price: number
  image?: string
}

function prepareManifest(value: unknown): PreparedProduct[] {
  if (!value || typeof value !== 'object') throw new Error('Arquivo JSON inválido.')
  const manifest = value as ImportManifest
  if (manifest.version !== 1 || !Array.isArray(manifest.products) || manifest.products.length === 0 || manifest.products.length > 200) {
    throw new Error('Use um JSON versão 1 com 1 a 200 produtos.')
  }
  const prepared: PreparedProduct[] = []
  for (const product of manifest.products) {
    const name = String(product.name || '').trim()
    const description = String(product.description || '').trim()
    // A categoria ampla continua no manifesto para busca. A seção do
    // cardápio é a categoria exibida dentro da loja e gravada no produto.
    const category = String(product.menuSection || product.category || '').trim()
    const image = product.image ? String(product.image).trim() : undefined
    if (!name || name.length > 120 || description.length > 1000 || !category || getProductCategory(category).label !== category) {
      throw new Error(`Confira nome, descrição e categoria de ${name || 'um item'}.`)
    }
    if (image && (!/^[a-z0-9][a-z0-9._-]*\.(png|jpg|jpeg|webp)$/i.test(image) || image.includes('..'))) {
      throw new Error(`Nome de foto inválido em ${name}.`)
    }
    const variants = product.variants?.length ? product.variants : [{ label: '', price: Number(product.price) }]
    if (variants.length > 8) throw new Error(`Muitas opções de tamanho em ${name}.`)
    for (const variant of variants) {
      const label = String(variant.label || '').trim()
      const fullName = label ? `${name} (${label})` : name
      const price = Number(variant.price)
      if (fullName.length > 120 || !Number.isFinite(price) || price <= 0 || price > 100000) {
        throw new Error(`Preço ou tamanho inválido em ${fullName}.`)
      }
      prepared.push({ name: fullName, description: descriptionWithMenuSection(image ? `${description}\nFoto ilustrativa.` : description, category), category, price, image })
    }
  }
  if (prepared.length > 500) throw new Error('O arquivo gera itens demais.')
  const names = prepared.map(item => item.name.toLocaleLowerCase('pt-BR'))
  if (new Set(names).size !== names.length) throw new Error('Há nomes duplicados no arquivo.')
  return prepared
}

export default function BulkProductImport({ sellerId, existingProducts, onClose, onImported }: {
  sellerId: string
  existingProducts: Array<{ id: string; nome: string; categoria: string; descricao: string }>
  onClose: () => void
  onImported: () => Promise<void>
}) {
  const [products, setProducts] = useState<PreparedProduct[]>([])
  const [photos, setPhotos] = useState<File[]>([])
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [saving, setSaving] = useState(false)
  const existing = useMemo(() => new Map(existingProducts.map(item => [item.nome.toLocaleLowerCase('pt-BR'), item])), [existingProducts])
  const pending = products.filter(item => !existing.has(item.name.toLocaleLowerCase('pt-BR')))
  const updates = products.flatMap(item => {
    const found = existing.get(item.name.toLocaleLowerCase('pt-BR'))
    if (!found) return []
    const category = baseProductCategory(item.category)
    const description = descriptionWithMenuSection(found.descricao, item.category)
    return found.categoria !== category || found.descricao !== description
      ? [{ id: found.id, name: item.name, category, description }]
      : []
  })
  const photoMap = useMemo(() => new Map(photos.map(file => [file.name.toLocaleLowerCase('pt-BR'), file])), [photos])
  const missing = [...new Set(pending.map(item => item.image).filter((name): name is string => Boolean(name && !photoMap.has(name.toLocaleLowerCase('pt-BR')))))]

  async function readManifest(file?: File) {
    setError('')
    setProducts([])
    if (!file) return
    try {
      if (file.size > 200_000) throw new Error('Arquivo grande demais (máximo 200 KB).')
      setProducts(prepareManifest(JSON.parse(await file.text())))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível ler o arquivo.')
    }
  }

  async function importProducts() {
    if (saving || (pending.length === 0 && updates.length === 0) || missing.length) return
    setSaving(true)
    setError('')
    let completed = 0
    let reclassified = 0
    try {
      for (const item of updates) {
        setProgress(`Organizando ${reclassified + 1} de ${updates.length}: ${item.name}`)
        const { error } = await supabase.from('produtos').update({ categoria: item.category, descricao: item.description }).eq('id', item.id).eq('vendedor_id', sellerId)
        if (error) throw error
        reclassified++
      }
      for (const item of pending) {
        setProgress(`Salvando ${completed + 1} de ${pending.length}: ${item.name}`)
        let uploadedPath: string | null = null
        let photoUrl: string | null = null
        try {
          const photo = item.image ? photoMap.get(item.image.toLocaleLowerCase('pt-BR')) : undefined
          if (photo) {
            if (!['image/png', 'image/jpeg', 'image/webp'].includes(photo.type) || photo.size > 5 * 1024 * 1024) {
              throw new Error(`Foto inválida ou maior que 5 MB: ${photo.name}`)
            }
            uploadedPath = `${sellerId}/${crypto.randomUUID()}.${photo.name.split('.').pop()?.toLowerCase()}`
            const { error: uploadError } = await supabase.storage.from('produtos').upload(uploadedPath, photo, { contentType: photo.type, upsert: false })
            if (uploadError) throw uploadError
            photoUrl = supabase.storage.from('produtos').getPublicUrl(uploadedPath).data.publicUrl
          }
          const { error: insertError } = await supabase.from('produtos').insert({
            vendedor_id: sellerId,
            nome: item.name,
            descricao: item.description,
            preco: item.price,
            categoria: baseProductCategory(item.category),
            foto: photoUrl,
            emoji: '🍕',
            estoque: null,
            ativo: true,
          })
          if (insertError) throw insertError
        } catch (cause) {
          if (uploadedPath) await supabase.storage.from('produtos').remove([uploadedPath])
          throw cause
        }
        completed++
      }
      setProgress(`${completed} itens novos e ${reclassified} categorias atualizadas com sucesso.`)
      await onImported()
    } catch (cause) {
      setError(`Importação interrompida após ${completed} item(ns) novo(s) e ${reclassified} categoria(s). ${cause instanceof Error ? cause.message : 'Tente novamente.'} Reabra o arquivo para continuar sem duplicar os já salvos.`)
      await onImported()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Importar cardápio" style={{ position: 'fixed', inset: 0, zIndex: 12000, background: 'rgba(15,23,42,.72)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ width: 'min(100%, 560px)', maxHeight: '90vh', overflowY: 'auto', background: '#fff', color: '#0f172a', borderRadius: 22, padding: 24, boxShadow: '0 24px 70px rgba(0,0,0,.28)' }}>
        <h2 style={{ margin: '0 0 8px' }}>Importar cardápio</h2>
        <p style={{ color: '#475569', lineHeight: 1.5 }}>Selecione o JSON de produtos e as fotos indicadas nele. Cada tamanho vira um item com seu próprio preço. Itens existentes não serão duplicados; só a seção do cardápio será atualizada quando estiver diferente. As seções de pizza mantêm a categoria Pizza para compatibilidade com o app público.</p>
        <label style={{ display: 'block', fontWeight: 700, marginBottom: 12 }}>Cardápio JSON
          <input type="file" accept=".json,application/json" disabled={saving} onChange={event => void readManifest(event.target.files?.[0])} style={{ display: 'block', marginTop: 6 }} />
        </label>
        <label style={{ display: 'block', fontWeight: 700, marginBottom: 16 }}>Fotos dos produtos
          <input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={saving} onChange={event => setPhotos(Array.from(event.target.files || []))} style={{ display: 'block', marginTop: 6 }} />
        </label>
        {products.length > 0 && <p role="status">{products.length} itens no arquivo · {pending.length} novos · {updates.length} categorias para atualizar · {products.length - pending.length - updates.length} sem mudanças.</p>}
        {missing.length > 0 && <p style={{ color: '#b45309' }}>Faltam {missing.length} foto(s): {missing.slice(0, 5).join(', ')}{missing.length > 5 ? '…' : ''}</p>}
        {progress && <p role="status">{progress}</p>}
        {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" disabled={saving} onClick={onClose} style={{ padding: '12px 18px', borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>Fechar</button>
          <button type="button" disabled={saving || (pending.length === 0 && updates.length === 0) || missing.length > 0} onClick={() => void importProducts()} style={{ padding: '12px 18px', borderRadius: 12, border: 0, color: '#fff', background: '#ea580c', cursor: 'pointer', opacity: saving || (pending.length === 0 && updates.length === 0) || missing.length ? .5 : 1 }}>Aplicar cardápio</button>
        </div>
      </div>
    </div>
  )
}
