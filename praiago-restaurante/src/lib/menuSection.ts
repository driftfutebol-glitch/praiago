export const PIZZA_MENU_SECTIONS = ['Pizzas premium', 'Pizzas salgadas', 'Pizzas doces'] as const

const SECTION_LINE = '\n\nSeção do cardápio: '

export function isPizzaMenuSection(value: string): boolean {
  return PIZZA_MENU_SECTIONS.some(section => section === value)
}

export function baseProductCategory(section: string): string {
  return isPizzaMenuSection(section) ? 'Pizza' : section
}

export function visibleProductDescription(description: string): string {
  return (description || '').replace(/\n\nSeção do cardápio: Pizzas (?:premium|salgadas|doces)\s*$/u, '').trim()
}

export function productMenuSection(category: string, description: string, section?: string | null): string {
  if (section?.trim()) return section.trim()
  if (category !== 'Pizza') return category
  const legacySection = (description || '').match(/\n\nSeção do cardápio: (Pizzas (?:premium|salgadas|doces))\s*$/u)?.[1]
  return legacySection || category
}

export function descriptionWithMenuSection(description: string, section: string): string {
  const clean = visibleProductDescription(description)
  return isPizzaMenuSection(section) ? `${clean}${SECTION_LINE}${section}` : clean
}
