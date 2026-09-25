export function productMenuSection(category: string, description: string): string {
  if (category !== 'Pizza') return category
  return (description || '').match(/\n\nSeção do cardápio: (Pizzas (?:premium|salgadas|doces))\s*$/u)?.[1] || category
}

export function visibleProductDescription(description: string): string {
  return (description || '').replace(/\n\nSeção do cardápio: Pizzas (?:premium|salgadas|doces)\s*$/u, '').trim()
}
