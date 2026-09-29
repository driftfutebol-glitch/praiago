import { useState } from 'react'
import { List, X } from 'lucide-react'

type Props = { categories: string[]; value: string; onChange: (category: string) => void }
export default function CategoryTabs({ categories, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  function choose(category: string) { onChange(category); setOpen(false) }
  return <div style={{ background: 'var(--pg-surface, #fff)', borderBottom: '1px solid var(--pg-line, #e2e8f0)', minWidth: 0 }}>
    <nav aria-label="Categorias do cardápio" style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
      <button type="button" aria-label={open ? 'Fechar categorias' : 'Ver todas as categorias'} aria-expanded={open} onClick={() => setOpen(current => !current)} style={{ flexShrink: 0, padding: 12, border: 0, background: 'transparent', color: 'var(--pg-ink, #0f172a)', cursor: 'pointer' }}>{open ? <X size={20} /> : <List size={20} />}</button>
      <div style={{ display: 'flex', overflowX: 'auto', scrollbarWidth: 'thin', flex: 1, minWidth: 0 }}>
        {categories.map(category => <button type="button" key={category} aria-current={value === category ? 'true' : undefined} onClick={event => { choose(category); event.currentTarget.parentElement?.scrollTo?.({ left: event.currentTarget.offsetLeft - (event.currentTarget.parentElement.clientWidth - event.currentTarget.clientWidth) / 2, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }) }} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const index = categories.indexOf(category)
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? categories.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + categories.length) % categories.length
          const button = event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined
          button?.focus(); choose(categories[next])
        }} style={{ minHeight: 52, padding: '12px 16px', flexShrink: 0, border: 0, borderBottom: `2px solid ${value === category ? 'var(--pg-action, #ea580c)' : 'transparent'}`, background: 'transparent', color: value === category ? 'var(--pg-ink, #0f172a)' : 'var(--pg-muted, #64748b)', fontSize: 14, fontWeight: value === category ? 850 : 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{category}</button>)}
      </div>
    </nav>
    {open && <div aria-label="Lista de categorias" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
      {categories.map(category => <button key={category} type="button" onClick={() => choose(category)} style={{ border: '1px solid var(--pg-line, #e2e8f0)', borderRadius: 10, padding: '10px 12px', background: 'var(--pg-surface-alt, #f8fafc)', color: 'var(--pg-ink, #0f172a)', cursor: 'pointer' }}>{category}</button>)}
    </div>}
  </div>
}
