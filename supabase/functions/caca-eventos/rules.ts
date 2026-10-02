// Regras puras do Caça Eventos. Também são exercitadas por testes locais.
export type PrecoSituacao = 'a_confirmar' | 'gratuito' | 'pago'

export function semAcento(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export function canonicalSourceUrl(raw: string) {
  try {
    const url = new URL(raw)
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|igshid|ref|source)$/i.test(key)) url.searchParams.delete(key)
    }
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    return url.toString()
  } catch {
    return raw.trim()
  }
}

export function eventIdentity(title: string, date: string | null) {
  return `${semAcento(title).replace(/[^a-z0-9]+/g, ' ').trim()}|${date || ''}`
}

const BAIRROS_PG = /\b(boqueirao|canto do forte|guilhermina|aviacao|tupi|ocian|mirim|caicara|solemar|melvi|sitio do campo|caca e pesca|quietude|tude bastos|cidade ocian|vila mirim|vila tupi|vila guilhermina|vila sonia|nova mirim|balneario florida|balneario maracana|jardim melvi|jardim real|jardim imperador|cidade da crianca)\b/
const OUTRAS_CIDADES = /\b(santos|sao vicente|mongagua|itanhaem|guaruja|cubatao|bertioga|peruibe|palmas|sao paulo|sorocaba|campinas)\b/
const ALVOS_CONFIRMADOS = [
  'rocket beach', 'rocket sea', 'blue house', 'casa do pig', 'porks praia grande',
  'portinho forro do mato', 'arena pg', 'arena torcida pg', 'donna guilhermina',
  'ocian restaurante', 'major quiosque', 'mojor quiosque', 'atlantico quiosque',
  'donna g', 'dona ge', 'porks praia grande', 'embaixador bar', 'confraria do forte',
]

export function isPraiaGrande(place: { titulo?: string | null; local_nome?: string | null; endereco?: string | null; cidade?: string | null }) {
  const cidade = semAcento(place.cidade || '')
  const local = semAcento(`${place.local_nome || ''} ${place.endereco || ''}`)
  const titulo = semAcento(place.titulo || '')
  if (/\b(evento sera online|evento online|100% online)\b/.test(local)) return false
  if (cidade && OUTRAS_CIDADES.test(cidade) && !/\bpraia grande\b/.test(cidade)) return false
  if (OUTRAS_CIDADES.test(local) && !/\bpraia grande\b/.test(local)) return false
  if (/\bpraia grande\b/.test(`${cidade} ${local}`)) return true
  if (BAIRROS_PG.test(local)) return true
  if (ALVOS_CONFIRMADOS.some(alvo => local.includes(alvo))) return true
  // Título explícito é aceitável apenas se não há cidade conflitante.
  return /\bpraia grande\b/.test(titulo) || BAIRROS_PG.test(titulo)
}

export function priceSituation(args: { price: number | null; ticketsWithPositivePrice: number; title?: string; description?: string; freeFlag?: unknown }): PrecoSituacao {
  if (args.ticketsWithPositivePrice > 0 || (args.price !== null && args.price > 0)) return 'pago'
  if (args.freeFlag === true || args.freeFlag === 'true') return 'gratuito'
  const evidence = semAcento(`${args.title || ''} ${args.description || ''}`)
  if (/\b(entrada franca|entrada gratuita|ingressos? gratuitos?|evento gratuito|acesso gratuito|gratuito para todos|show gratuito)\b/.test(evidence)) return 'gratuito'
  if (/\b(entrada|ingressos?|admissao)\s*(?:a partir de|por|:)\s*r\$\s*\d/.test(evidence)) return 'pago'
  return 'a_confirmar'
}

export function parseLot(nome: string, loteFonte?: string) {
  const alvo = semAcento(`${nome} ${loteFonte || ''}`)
  const numero = alvo.match(/\b(\d{1,2})\s*[ºo°ª]?\s*lote\b|\blote\s*[ºo°ª]?\s*(\d{1,2})\b/)
  const palavras = alvo.match(/\b(primeiro|segundo|terceiro|quarto|quinto)\s+lote\b/)
  const ordens: Record<string, number> = { primeiro: 1, segundo: 2, terceiro: 3, quarto: 4, quinto: 5 }
  const ordem = numero ? Number(numero[1] || numero[2])
    : palavras ? ordens[palavras[1]]
      : /\b(ultimo|ultima)\s+lote\b/.test(alvo) ? 99
        : /\b(promocional|promo|pre[- ]?venda)\b/.test(alvo) ? 0 : null
  const grupo = semAcento(nome)
    .replace(/\b\d{1,2}\s*[ºo°ª]?\s*lote\b|\blote\s*[ºo°ª]?\s*\d{1,2}\b/g, ' ')
    .replace(/\b(primeiro|segundo|terceiro|quarto|quinto|ultimo|ultima)\s+lote\b/g, ' ')
    .replace(/\b(lote|promocional|promo|pre[- ]?venda)\b/g, ' ')
    .replace(/[-–—|:,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { ordem, grupo: grupo || semAcento(nome).trim() }
}

// A listagem pública da Sympla usa payloads JSON escapados do Next.js.
// Extrair somente searchDataResult evita depender de classes CSS efêmeras.
export function parseSymplaListing(html: string): Record<string, unknown>[] {
  for (const match of html.matchAll(/self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/g)) {
    try {
      const packet = JSON.parse(match[1]) as string
      if (!packet.includes('searchDataResult')) continue
      const tree = JSON.parse(packet.slice(packet.indexOf(':') + 1)) as unknown
      const visit = (value: unknown, depth = 0): Record<string, unknown>[] | null => {
        if (depth > 8 || !value || typeof value !== 'object') return null
        if (Array.isArray(value)) {
          for (const item of value) { const found = visit(item, depth + 1); if (found) return found }
          return null
        }
        const obj = value as Record<string, unknown>
        const search = obj.searchDataResult as Record<string, unknown> | undefined
        if (Array.isArray(search?.data)) return search.data.filter(item => item && typeof item === 'object') as Record<string, unknown>[]
        for (const item of Object.values(obj)) { const found = visit(item, depth + 1); if (found) return found }
        return null
      }
      const found = visit(tree)
      if (found) return found
    } catch { /* outros pacotes RSC não são listagens */ }
  }
  return []
}
