import { useState } from 'react'
import { FolderPlus, Loader2, Plus, X } from 'lucide-react'
import { MENU_CATEGORY_LIMIT, menuCategoryKey, validateMenuCategory } from '../../../mobile/menuCategoryPolicy'

type Props = { categories: string[]; ready: boolean; disabled: boolean; error: string; initiallyOpen?: boolean; onRetry: () => void; onCreate: (name: string) => Promise<string>; onCreated: (name: string) => void }

export default function MenuCategoryManager({ categories, ready, disabled, error, initiallyOpen = false, onRetry, onCreate, onCreated }: Props) {
  const [open, setOpen] = useState(initiallyOpen)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const valid = validateMenuCategory(name)
  const duplicate = categories.some(category => menuCategoryKey(category) === menuCategoryKey(valid.name))
  const validation = name ? valid.error || (duplicate ? 'Você já tem uma categoria com esse nome.' : '') : ''

  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (disabled || !ready || saving) return
    if (valid.error || duplicate) { setMessage(valid.error || 'Você já tem uma categoria com esse nome.'); return }
    setSaving(true); setMessage('')
    try {
      const saved = await onCreate(valid.name)
      setName(''); setOpen(false)
      setMessage('Categoria criada. Adicione um produto nela para aparecer no Cliente.')
      onCreated(saved)
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível criar a categoria.') }
    finally { setSaving(false) }
  }

  return <section aria-label="Criar categorias do cardápio" className="menu-category-manager" style={{ marginBottom: 16, padding: 17, borderRadius: 18, border: '1px solid var(--line,#e2e8f0)', background: 'var(--surface,#fff)', color: 'var(--ink,#0f172a)' }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <FolderPlus size={20} color="var(--brand-blue,#c2410c)" />
      <div style={{ flex: 1, minWidth: 140 }}><strong style={{ display: 'block', fontSize: 14 }}>Categorias da sua vitrine</strong><span style={{ display: 'block', color: 'var(--muted,#64748b)', fontSize: 11, lineHeight: 1.5, marginTop: 3 }}>Crie uma aba e depois escolha os produtos que fazem parte dela.</span></div>
      <button type="button" disabled={disabled || !ready || saving || categories.length >= MENU_CATEGORY_LIMIT} onClick={() => { setOpen(value => !value); setMessage('') }} aria-expanded={open} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 12px', borderRadius: 12, border: '1px solid var(--line,#e2e8f0)', background: 'var(--surface-soft,#f8fafc)', color: 'var(--brand-blue,#c2410c)', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: disabled || !ready ? .5 : 1 }}>{open ? <X size={16} /> : <Plus size={16} />}{open ? 'Fechar' : 'Criar categoria'}</button>
    </div>
    {error && <div role="status" style={{ marginTop: 10, fontSize: 12, color: 'var(--danger,#b42335)' }}>{error} <button type="button" onClick={onRetry} style={{ minHeight: 34, border: 0, background: 'transparent', color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>Tentar novamente</button></div>}
    {categories.length >= MENU_CATEGORY_LIMIT && <p style={{ fontSize: 12 }}>Limite de 50 categorias atingido.</p>}
    {open && <form onSubmit={event => void create(event)} style={{ display: 'grid', gap: 10, marginTop: 17 }}>
      <label style={{ fontSize: 12, fontWeight: 700 }}>Nome da categoria<input autoFocus aria-label="Nome da nova categoria" value={name} maxLength={60} disabled={saving} onChange={event => { setName(event.target.value); setMessage('') }} placeholder="Ex.: Água de coco gelada" aria-invalid={Boolean(validation)} aria-describedby="new-menu-category-help" style={{ width: '100%', marginTop: 6, minHeight: 46, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--line,#cbd5e1)', background: 'var(--surface-soft,#f8fafc)', color: 'var(--ink,#0f172a)' }} /></label>
      <div id="new-menu-category-help" role="status" style={{ fontSize: 11, lineHeight: 1.5, color: validation ? 'var(--danger,#b42335)' : 'var(--muted,#64748b)' }}>{validation || 'Até 60 caracteres. Nomes ofensivos são bloqueados, inclusive variações com números e separadores.'}</div>
      <button type="submit" disabled={saving || !name.trim() || Boolean(validation)} style={{ minHeight: 44, border: 0, borderRadius: 12, padding: '0 16px', background: 'var(--brand-solid,#c2410c)', color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', gap: 7, alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: saving || !name.trim() || Boolean(validation) ? .5 : 1 }}>{saving ? <Loader2 size={17} className="animate-spin-slow" /> : <FolderPlus size={17} />}{saving ? 'Salvando…' : 'Salvar categoria'}</button>
    </form>}
    {message && <p role="status" style={{ color: 'var(--muted,#64748b)', fontSize: 12, lineHeight: 1.5, marginBottom: 0 }}>{message}</p>}
  </section>
}
