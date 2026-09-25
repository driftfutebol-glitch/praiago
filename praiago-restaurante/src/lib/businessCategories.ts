export const BUSINESS_CATEGORIES = [
  'Restaurante',
  'Pizzaria',
  'Bar',
  'Adega',
  'Lanchonete',
  'Cafeteria',
  'Pastelaria',
  'Padaria',
  'Sorveteria',
  'Quiosque',
  'Açaí',
  'Comida japonesa',
  'Outros',
] as const

export function businessCategoryOptions(current: string) {
  return current && !BUSINESS_CATEGORIES.some(category => category === current)
    ? [current, ...BUSINESS_CATEGORIES]
    : BUSINESS_CATEGORIES
}
