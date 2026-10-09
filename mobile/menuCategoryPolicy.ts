/** A mesma política é usada pelos dois vendedores e pela vitrine do Cliente. */
export const MENU_CATEGORY_MAX_LENGTH = 60
export const MENU_CATEGORY_LIMIT = 50
export const MENU_CATEGORY_OFFENSIVE_MESSAGE = 'Escolha um nome respeitoso. Palavrões e termos ofensivos não são permitidos nas categorias.'

const forbiddenWords = new Set([
  'porra', 'merda', 'caralho', 'cacete', 'puta', 'puto', 'putaria',
  'foda', 'fodase', 'foder', 'fodido', 'fodida', 'fudido', 'fudida',
  'buceta', 'boceta', 'piroca', 'pica', 'xereca', 'cu',
  'arrombado', 'arrombada', 'viado', 'viadinho', 'fdp', 'pqp',
].map(word => word.replace(/(.)\1+/g, '$1')))

const leet: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' }
const invisible = /[\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g

export function menuCategoryKey(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(invisible, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function hasOffensiveCategoryName(value: string) {
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(invisible, '').toLowerCase().replace(/[013457@$!]/g, char => leet[char])
  const tokens = normalized.match(/[a-z0-9]+/g) || []
  // Junta também palavras soletradas com pontos/espaços, sem bloquear substrings
  // legítimas como "Cuscuz", "Assados" ou "Picanha".
  for (let start = 0; start < tokens.length; start++) {
    let word = ''
    for (let end = start; end < Math.min(start + 12, tokens.length); end++) {
      word += tokens[end]
      const compact = word.replace(/(.)\1+/g, '$1')
      if (forbiddenWords.has(compact) || (compact.endsWith('s') && forbiddenWords.has(compact.slice(0, -1)))) return true
      if (word.length > 32) break
    }
  }
  return false
}

export function validateMenuCategory(value: string): { name: string; error: string | null } {
  const name = value.normalize('NFKC').trim().replace(/ +/g, ' ')
  if (/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/.test(name)) {
    return { name, error: 'Use um nome sem quebras de linha ou caracteres invisíveis.' }
  }
  if (Array.from(name).length < 2 || Array.from(name).length > MENU_CATEGORY_MAX_LENGTH || !/[a-zA-Z\u00c0-\u024f]/.test(name)) {
    return { name, error: 'A categoria deve ter de 2 a 60 caracteres e pelo menos uma letra.' }
  }
  if (['todos', 'pizzas meio a meio'].includes(menuCategoryKey(name))) return { name, error: 'Esse nome é reservado pelo aplicativo. Escolha outro nome.' }
  if (hasOffensiveCategoryName(name)) return { name, error: MENU_CATEGORY_OFFENSIVE_MESSAGE }
  return { name, error: null }
}

export function mergeMenuCategories(...lists: string[][]) {
  const unique = new Map<string, string>()
  for (const name of lists.flat()) {
    const valid = validateMenuCategory(name)
    if (!valid.error && !unique.has(menuCategoryKey(valid.name))) unique.set(menuCategoryKey(valid.name), valid.name)
  }
  return [...unique.values()]
}
