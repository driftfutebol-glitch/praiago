import { useEffect, useRef, useState } from 'react'
import type { Produto } from '../lib/catalogo'
import { compatiblePizza, halfPizzaPrice, pizzaCartKey } from '../lib/pizzaCart'
import { visibleProductDescription } from '../lib/menuSection'

export default function PizzaBuilder({ products, onAdd, onClose }: { products: Produto[]; onAdd: (key: string) => Promise<boolean>; onClose: () => void }) {
  const pizzas = products.filter(product => product.pizza_meio_a_meio && product.categoria === 'Pizza' && product.pizza_tamanho)
  const sizes = [...new Set(pizzas.map(product => product.pizza_tamanho!))].filter(size => pizzas.filter(product => product.pizza_tamanho === size).length >= 2)
  const [size, setSize] = useState(sizes[0] || '')
  const [firstId, setFirstId] = useState('')
  const [secondId, setSecondId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDivElement>(null)
  const available = pizzas.filter(product => product.pizza_tamanho === size)
  const first = available.find(product => product.id === firstId), second = available.find(product => product.id === secondId)
  const valid = first && second && compatiblePizza(first, second)
  const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    return () => previous?.focus()
  }, [])
  async function add() {
    if (!valid || saving) return
    setSaving(true); setError('')
    try { if (await onAdd(pizzaCartKey(first.id, second.id))) onClose() }
    catch { setError('Não foi possível adicionar. Tente novamente.') }
    finally { setSaving(false) }
  }
  return <div style={{ position: 'fixed', inset: 0, zIndex: 11000, background: 'rgba(0,0,0,.55)', display: 'grid', alignItems: 'end' }}>
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="pizza-title" onKeyDown={event => {
      if (event.key === 'Escape' && !saving) onClose()
      if (event.key !== 'Tab') return
      const items = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled)')
      if (!items?.length) return
      if (event.shiftKey && (document.activeElement === items[0] || document.activeElement === dialog.current)) { event.preventDefault(); items[items.length - 1].focus() }
      if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus() }
    }} style={{ background: 'var(--pg-surface)', color: 'var(--pg-ink)', borderRadius: '24px 24px 0 0', padding: '24px 24px calc(24px + env(safe-area-inset-bottom))', width: '100%', maxWidth: 520, margin: '0 auto', maxHeight: '92dvh', overflowY: 'auto', outline: 0 }}>
      <button type="button" onClick={onClose} disabled={saving} aria-label="Fechar montagem da pizza" style={{ float: 'right', border: 0, background: 'transparent', color: 'inherit', padding: 8 }}>✕</button>
      <h2 id="pizza-title" style={{ fontSize: 22, marginBottom: 8 }}>Monte sua pizza meio a meio</h2>
      <p style={{ color: 'var(--pg-muted)', fontSize: 13, lineHeight: 1.5 }}>Escolha dois sabores do mesmo tamanho. Você paga metade do preço de cada pizza inteira.</p>
      <div style={{ display: 'grid', gap: 16, marginTop: 20 }}>
        <label>Tamanho<select aria-label="Tamanho" value={size} onChange={event => { setSize(event.target.value); setFirstId(''); setSecondId('') }} style={{ width: '100%', padding: 12, marginTop: 6, borderRadius: 12, fontSize: 16, background: 'var(--pg-surface-alt)', color: 'inherit' }}>{sizes.map(item => <option key={item}>{item}</option>)}</select></label>
        {([{ label: 'Primeiro sabor', id: firstId, other: secondId, set: setFirstId, product: first }, { label: 'Segundo sabor', id: secondId, other: firstId, set: setSecondId, product: second }]).map(field => <div key={field.label}>
          <label>{field.label}<select aria-label={field.label} value={field.id} onChange={event => field.set(event.target.value)} style={{ width: '100%', padding: 12, marginTop: 6, borderRadius: 12, fontSize: 16, background: 'var(--pg-surface-alt)', color: 'inherit' }}><option value="">Escolha um sabor</option>{available.map(product => <option key={product.id} value={product.id} disabled={product.id === field.other || product.estoque === 0}>{product.nome} · inteira {money(product.preco)}{product.estoque === 0 ? ' · Esgotado' : ''}</option>)}</select></label>
          {field.product && <p style={{ color: 'var(--pg-muted)', fontSize: 12, marginTop: 6 }}>{visibleProductDescription(field.product.desc)}</p>}
        </div>)}
        {valid && <div style={{ background: 'var(--pg-surface-alt)', borderRadius: 14, padding: 14 }}><p style={{ fontSize: 12, color: 'var(--pg-muted)', margin: '0 0 8px' }}>({money(first.preco)} + {money(second.preco)}) ÷ 2</p><strong style={{ fontSize: 20 }}>Total: {money(halfPizzaPrice(first.preco, second.preco))}</strong></div>}
        {error && <p role="alert">{error}</p>}
        <button type="button" disabled={!valid || saving} onClick={() => void add()} style={{ minHeight: 52, border: 0, borderRadius: 14, background: valid ? 'var(--pg-action)' : 'var(--pg-surface-alt)', color: valid ? 'var(--pg-action-ink)' : 'var(--pg-muted)', fontWeight: 850 }}>{saving ? 'Adicionando…' : 'Adicionar pizza ao carrinho'}</button>
      </div>
    </div>
  </div>
}
