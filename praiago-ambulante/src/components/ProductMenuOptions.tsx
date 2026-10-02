export type MenuOptions = { menu_secao: string; pizza_meio_a_meio: boolean; pizza_tamanho: string }
type Props = { value: MenuOptions; onChange: (value: MenuOptions) => void; pizza: boolean; sections: string[] }
const fieldStyle = { width: '100%', minHeight: 44, border: '1px solid #cbd5e1', borderRadius: 10, padding: '10px 12px', background: '#f8fafc', color: '#0f172a', fontSize: 16 }
export default function ProductMenuOptions({ value, onChange, pizza, sections }: Props) {
  return <fieldset style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, display: 'grid', gap: 12, minWidth: 0 }}>
    <legend style={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>Organização do cardápio</legend>
    <label style={{ color: '#475569', fontSize: 13 }}>Nome da seção / aba
      <input aria-label="Nome da seção do cardápio" list="menu-sections" value={value.menu_secao} maxLength={60} onChange={event => onChange({ ...value, menu_secao: event.target.value })} placeholder="Use a categoria ou crie sua própria seção" style={{ ...fieldStyle, marginTop: 6 }} />
      <datalist id="menu-sections">{sections.map(section => <option key={section} value={section} />)}</datalist>
      <span style={{ display: 'block', fontSize: 12, marginTop: 5 }}>Itens com o mesmo nome de seção aparecem juntos no cliente. Vazio usa a categoria.</span>
    </label>
    {pizza && <>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#0f172a' }}><input type="checkbox" checked={value.pizza_meio_a_meio} onChange={event => onChange({ ...value, pizza_meio_a_meio: event.target.checked })} />Oferecer este sabor na pizza meio a meio</label>
      {value.pizza_meio_a_meio && <label style={{ fontSize: 13, color: '#475569' }}>Tamanho da pizza
        <select aria-label="Tamanho da pizza meio a meio" value={value.pizza_tamanho} onChange={event => onChange({ ...value, pizza_tamanho: event.target.value })} style={{ ...fieldStyle, marginTop: 6 }}><option value="">Selecione o tamanho</option>{['Broto', 'Pequena', 'Média', 'Grande', 'Família'].map(size => <option key={size}>{size}</option>)}</select>
      </label>}
      <p style={{ margin: 0, fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>Dois sabores do mesmo tamanho. Preço: 50% de cada pizza inteira, somados e arredondados no total. Se controlar estoque, cada pedido reserva unidades inteiras por sabor (arredondando as metades para cima).</p>
    </>}
  </fieldset>
}
