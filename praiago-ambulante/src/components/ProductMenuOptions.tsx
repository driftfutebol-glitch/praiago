import { useId } from 'react'
import { validateMenuCategory } from '../../../mobile/menuCategoryPolicy'
export type MenuOptions = { menu_secao: string; pizza_meio_a_meio: boolean; pizza_tamanho: string }
type Props = { value: MenuOptions; onChange: (value: MenuOptions) => void; pizza: boolean; sections: string[] }
const fieldStyle = { width: '100%', minHeight: 44, border: '1px solid var(--line-strong)', borderRadius: 10, padding: '10px 12px', background: 'var(--surface-soft)', color: 'var(--ink-strong)', fontSize: 16 }
const sectionSuggestions = ['Bebidas', 'Lanches', 'Petiscos', 'Pizzas salgadas', 'Pizzas doces', 'Combos', 'Sobremesas']
export default function ProductMenuOptions({ value, onChange, pizza, sections }: Props) {
  const listId = useId()
  const sectionError = value.menu_secao.trim() ? validateMenuCategory(value.menu_secao).error : null
  return <fieldset style={{ border: '1px solid var(--line)', borderRadius: 18, padding: 15, display: 'grid', gap: 12, minWidth: 0, background: 'var(--surface-soft)' }}>
    <legend style={{ fontWeight: 850, color: 'var(--ink)', fontSize: 14 }}>Categoria visível para o cliente</legend>
    <label style={{ color: 'var(--muted)', fontSize: 13 }}>Nome da aba do cardápio
      <input aria-label="Nome da seção do cardápio" list={listId} aria-invalid={Boolean(sectionError)} aria-describedby={`${listId}-help`} value={value.menu_secao} maxLength={60} onChange={event => onChange({ ...value, menu_secao: event.target.value })} placeholder="Ex.: Pizzas doces" style={{ ...fieldStyle, marginTop: 6 }} />
      <datalist id={listId}>{[...new Set([...sections, ...sectionSuggestions])].map(section => <option key={section} value={section} />)}</datalist>
      <span id={`${listId}-help`} role="status" style={{ display: 'block', fontSize: 12, marginTop: 6, color: sectionError ? 'var(--danger)' : 'var(--muted)' }}>{sectionError || 'Escolha uma categoria criada ou escreva um nome respeitoso.'}</span>
      <span style={{ display: 'block', fontSize: 12, marginTop: 5 }}>Produtos com o mesmo nome aparecem juntos na mesma aba. Se deixar vazio, usamos a categoria do produto.</span>
    </label>
    <div aria-label="Sugestões de categorias" style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
      {[...new Set([...sections, ...sectionSuggestions])].map(section => <button key={section} type="button" onClick={() => onChange({ ...value, menu_secao: section })} aria-pressed={value.menu_secao === section} style={{ flexShrink: 0, minHeight: 36, padding: '7px 10px', border: `1px solid ${value.menu_secao === section ? '#087f95' : 'var(--line)'}`, borderRadius: 10, background: value.menu_secao === section ? 'var(--surface-green)' : 'var(--surface)', color: value.menu_secao === section ? '#075e72' : 'var(--muted)', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{section}</button>)}
    </div>
    {pizza && <>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--ink-strong)' }}><input type="checkbox" checked={value.pizza_meio_a_meio} onChange={event => onChange({ ...value, pizza_meio_a_meio: event.target.checked })} />Oferecer este sabor na pizza meio a meio</label>
      {value.pizza_meio_a_meio && <label style={{ fontSize: 13, color: 'var(--muted)' }}>Tamanho da pizza
        <select aria-label="Tamanho da pizza meio a meio" value={value.pizza_tamanho} onChange={event => onChange({ ...value, pizza_tamanho: event.target.value })} style={{ ...fieldStyle, marginTop: 6 }}><option value="">Selecione o tamanho</option>{['Broto', 'Pequena', 'Média', 'Grande', 'Família'].map(size => <option key={size}>{size}</option>)}</select>
      </label>}
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>Dois sabores do mesmo tamanho. Preço: 50% de cada pizza inteira, somados e arredondados no total. Se controlar estoque, cada pedido reserva unidades inteiras por sabor (arredondando as metades para cima).</p>
    </>}
  </fieldset>
}
