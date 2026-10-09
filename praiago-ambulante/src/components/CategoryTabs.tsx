import { useState } from 'react'
import { List, X } from 'lucide-react'

type Props = {
  categories: string[]
  value: string
  onChange: (category: string) => void
  counts?: Record<string, number>
}

export default function CategoryTabs({ categories, value, onChange, counts }: Props) {
  const [open, setOpen] = useState(false)

  function choose(category: string) {
    onChange(category)
    setOpen(false)
  }

  return (
    <div style={{ minWidth: 0, padding: 5, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface)', boxShadow: '0 6px 22px rgba(20,73,79,.055)' }}>
      <nav aria-label="Categorias do cardápio" style={{ display: 'flex', alignItems: 'center', minWidth: 0, gap: 4 }}>
        <button
          type="button"
          aria-label={open ? 'Fechar categorias' : 'Ver todas as categorias'}
          aria-expanded={open}
          onClick={() => setOpen(current => !current)}
          style={{ width: 44, height: 44, flexShrink: 0, display: 'grid', placeItems: 'center', border: 0, borderRadius: 12, background: 'var(--surface-green)', color: 'var(--brand-blue)', cursor: 'pointer' }}
        >
          {open ? <X size={20} /> : <List size={20} />}
        </button>
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none', flex: 1, minWidth: 0 }}>
          {categories.map(category => {
            const selected = value === category
            return (
              <button
                type="button"
                key={category}
                aria-current={selected ? 'true' : undefined}
                onClick={event => {
                  choose(category)
                  const row = event.currentTarget.parentElement
                  row?.scrollTo?.({ left: event.currentTarget.offsetLeft - (row.clientWidth - event.currentTarget.clientWidth) / 2, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
                }}
                onKeyDown={event => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                  event.preventDefault()
                  const index = categories.indexOf(category)
                  const next = event.key === 'Home' ? 0 : event.key === 'End' ? categories.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + categories.length) % categories.length
                  const button = event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined
                  button?.focus()
                  choose(categories[next])
                }}
                style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 13px', flexShrink: 0, border: 0, borderRadius: 12, background: selected ? '#087f95' : 'transparent', color: selected ? '#fff' : 'var(--muted)', fontSize: 13, fontWeight: selected ? 850 : 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {category}
                {counts?.[category] !== undefined && <span style={{ minWidth: 20, padding: '2px 5px', borderRadius: 999, background: selected ? 'rgba(255,255,255,.22)' : 'var(--surface-soft)', color: selected ? '#fff' : 'var(--muted)', fontSize: 10, fontWeight: 850 }}>{counts[category]}</span>}
              </button>
            )
          })}
        </div>
      </nav>
      {open && (
        <div aria-label="Lista de categorias" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 7px 6px' }}>
          {categories.map(category => (
            <button key={category} type="button" onClick={() => choose(category)} style={{ minHeight: 40, border: '1px solid var(--line)', borderRadius: 11, padding: '8px 11px', background: value === category ? 'var(--surface-green)' : 'var(--surface)', color: 'var(--ink)', fontSize: 12, fontWeight: 750, cursor: 'pointer' }}>
              {category}{counts?.[category] !== undefined ? ` · ${counts[category]}` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
