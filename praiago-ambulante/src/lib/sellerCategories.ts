export const SELLER_CATEGORIES = [
  { label: 'Água de coco', emoji: '🥥' },
  { label: 'Milho verde', emoji: '🌽' },
  { label: 'Churros', emoji: '🍩' },
  { label: 'Bebidas', emoji: '🥤' },
  { label: 'Açaí', emoji: '🍧' },
  { label: 'Sorvetes e picolés', emoji: '🍦' },
  { label: 'Salgados', emoji: '🥟' },
  { label: 'Lanches', emoji: '🥪' },
  { label: 'Espetinhos', emoji: '🍢' },
  { label: 'Doces', emoji: '🍬' },
  { label: 'Frutos do mar', emoji: '🦐' },
  { label: 'Outros alimentos', emoji: '🍽️' },
] as const

export function sellerCategory(label: string) {
  return SELLER_CATEGORIES.find(category => category.label === label) ?? null
}
