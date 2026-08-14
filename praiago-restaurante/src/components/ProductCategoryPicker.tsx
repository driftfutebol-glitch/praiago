import { Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  FEATURED_PRODUCT_CATEGORIES,
  PRODUCT_CATEGORIES,
  getProductCategory,
  normalizeCategory,
  type ProductCategory,
} from '../lib/productCategories'

export function CategoryPhoto({ category, size = 54 }: { category: ProductCategory; size?: number }) {
  const [column, row] = category.sprite
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: 'block',
        backgroundImage: 'url(/images/categorias-comida-v1.webp)',
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${size * 5}px ${size * 6}px`,
        backgroundPosition: `${-column * size}px ${-row * size}px`,
      }}
    />
  )
}

export default function ProductCategoryPicker({ value, onChange }: { value: string; onChange: (category: ProductCategory) => void }) {
  const [showAll, setShowAll] = useState(false)
  const [query, setQuery] = useState('')
  const selected = getProductCategory(value)
  const categories = showAll ? PRODUCT_CATEGORIES : FEATURED_PRODUCT_CATEGORIES
  const visibleCategories = useMemo(() => {
    const normalized = normalizeCategory(query)
    if (!normalized) return categories
    return PRODUCT_CATEGORIES.filter(category => (
      normalizeCategory(category.label).includes(normalized) || category.aliases.some(alias => alias.includes(normalized))
    ))
  }, [categories, query])

  return (
    <div>
      <div className="category-picker-toolbar">
        <div>
          <div className="restaurant-field-label">Categoria</div>
          <div className="restaurant-field-help">Define onde o produto aparece no app Cliente.</div>
        </div>
        <button type="button" className="category-text-command" onClick={() => { setShowAll(current => !current); setQuery('') }}>
          {showAll ? 'Ver menos' : 'Todas'}
        </button>
      </div>

      {showAll && (
        <div className="category-search">
          <Search size={17} />
          <input aria-label="Buscar categoria" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar categoria" />
          {query && <button type="button" aria-label="Limpar busca" onClick={() => setQuery('')}><X size={16} /></button>}
        </div>
      )}

      <div className={`category-picker-grid ${showAll ? 'is-expanded' : ''}`}>
        {visibleCategories.map(category => {
          const active = selected.id === category.id
          return (
            <button
              type="button"
              key={category.id}
              className={`category-option ${active ? 'is-active' : ''}`}
              aria-pressed={active}
              onClick={() => onChange(category)}
              style={{ '--category-color': category.color } as React.CSSProperties}
            >
              <CategoryPhoto category={category} size={48} />
              <span>{category.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
