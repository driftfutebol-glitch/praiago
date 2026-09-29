export function productMenuSection(category: string, description: string, section?: string | null): string {
  if (section?.trim()) return section.trim()
  if (category !== 'Pizza') return category
  return (description || '').match(/\n\nSeção do cardápio: (Pizzas (?:premium|salgadas|doces))\s*$/u)?.[1] || category
}

export function visibleProductDescription(description: string): string {
  return (description || '').replace(/\n\nSeção do cardápio: Pizzas (?:premium|salgadas|doces)\s*$/u, '').trim()
}
