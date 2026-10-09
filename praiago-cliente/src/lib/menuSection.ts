import { validateMenuCategory } from '../../../mobile/menuCategoryPolicy'

export function productMenuSection(category: string, description: string, section?: string | null): string {
  if (section?.trim()) {
    const valid = validateMenuCategory(section)
    if (!valid.error) return valid.name
  }
  if (category !== 'Pizza') return validateMenuCategory(category).error ? 'Outros' : category
  return (description || '').match(/\n\nSeção do cardápio: (Pizzas (?:premium|salgadas|doces))\s*$/u)?.[1] || category
}

export function visibleProductDescription(description: string): string {
  return (description || '').replace(/\n\nSeção do cardápio: Pizzas (?:premium|salgadas|doces)\s*$/u, '').trim()
}
