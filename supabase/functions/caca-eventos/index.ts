// Robo caca-eventos do PraiaGo.
// Coleta eventos de fontes configuradas, normaliza e salva como PENDENTE.
// O admin aprova antes de aparecer para clientes.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-caca-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const ROBO_VERSION = 'v2'
const DEFAULT_MARKUP_PERCENT = 10

const ALVOS_SUGERIDOS = [
  { nome: 'Rocket Blue', foco: 'balada, shows, madrugada, ingressos' },
  { nome: 'Blue House', foco: 'balada, noite, madrugada, ingressos' },
  { nome: 'Arena PG / Arena Torcida PG', foco: 'shows, esporte, telão, festas e eventos de dia/noite' },
  { nome: 'Donna G / Dona Gê Beach Bar', foco: 'pagode, música ao vivo, agenda semanal, quiosque Guilhermina' },
  { nome: 'Ocian Restaurante', foco: 'música ao vivo, eventos familiares, reinauguração, datas especiais' },
  { nome: 'Major Quiosque / Mojor Quiosque', foco: 'quiosques, praia, música ao vivo, agenda de fim de semana' },
  { nome: 'Atlântico Quiosque', foco: 'quiosque, praia, música ao vivo, eventos ao pôr do sol' },
  { nome: 'PIG / Casa do Pig / Porks', foco: 'shows, noite, comida, ingressos' },
  { nome: 'Adegas de Praia Grande', foco: 'pagode, funk, resenha, noite, madrugada' },
  { nome: 'Portinho Forro do Mato', foco: 'forro, flashback, shows, noite' },
  { nome: 'Guiche Web Praia Grande', foco: 'ingressos, shows, eventos pagos' },
  { nome: 'RoleAgora Praia Grande', foco: 'bares, pubs, shows locais, agenda da cidade' },
  { nome: 'Vila Junina / festas sazonais', foco: 'familia, comida, tarde, noite' },
  { nome: 'Agenda cultural Praia Grande', foco: 'eventos publicos, esportes, shows' },
]

const ALVOS_PG = [
  'rocket beach',
  'rocket sea',
  'blue house',
  'casa do pig',
  'pig praia grande',
  'porks praia grande',
  'portinho forro do mato',
  'forro do mato',
  'stand ipa',
  'beach lounge',
  'arena pg',
  'arena torcida pg',
  'arenapg13',
  'donna g',
  'dona ge',
  'dona gê',
  'donnaguilherminabar',
  'donna guilhermina',
  'ocian restaurante',
  'ocianrestaurante',
  'major quiosque',
  'mojor quiosque',
  'atlantico quiosque',
  'atlântico quiosque',
  'quiosque atlantico',
  'quiosque atlântico',
  'quiosque ocian',
  'embaixador bar',
  'confraria do forte',
  'marechal mallet',
]

type Periodo = 'manha' | 'tarde' | 'noite' | 'madrugada'

type IngressoBruto = {
  id?: string
  source_ticket_id?: string
  nome?: string
  title?: string
  name?: string
  descricao?: string
  description?: string
  preco?: number | string
  price?: number | string
  taxa?: number | string
  fee?: number | string
  moeda?: string
  currency?: string
  status?: string
  availability?: string
  estoque_disponivel?: number | string | null
  fonte_url?: string
  metadata?: Record<string, unknown>
}

type EventoBruto = {
  titulo?: string
  title?: string
  name?: string
  nome?: string
  descricao?: string
  description?: string
  descricao_curta?: string
  data?: string
  data_evento?: string
  date?: string
  startDate?: string
  startsAt?: string
  endDate?: string
  hora?: string
  local_nome?: string
  venue?: string
  local?: string
  cidade?: string
  endereco?: string
  address?: string
  lat?: number | string | null
  lng?: number | string | null
  latitude?: number | string | null
  longitude?: number | string | null
  preco?: number | string
  price?: number | string
  categoria?: string
  genre?: string
  emoji?: string
  url?: string
  url_amigavel?: string
  fonte_url?: string
  periodo?: string
  ingressos?: IngressoBruto[]
}

type Fonte = {
  url: string
  nome?: string
  categoria?: string
  local_nome?: string
}

const FONTES_PADRAO: Fonte[] = [
  { url: 'https://www.guicheweb.com.br/', nome: 'Guiche Web Praia Grande', categoria: 'Ingressos' },
  { url: 'https://www.articket.com.br/', nome: 'ArTicket', categoria: 'Ingressos' },
  { url: 'https://www.roleagora.com.br/', nome: 'RoleAgora Praia Grande', categoria: 'Agenda local' },
]

type EventoNormalizado = {
  titulo: string
  descricao_curta: string | null
  periodo: Periodo
  data: string | null
  hora: string | null
  local_nome: string | null
  endereco: string | null
  lat: number | null
  lng: number | null
  preco: number
  categoria: string
  emoji: string
  fonte: 'robo'
  fonte_url: string | null
  destaque: boolean
  status: 'pendente'
  ingressos?: IngressoNormalizado[]
}

type IngressoNormalizado = {
  source_ticket_id: string | null
  nome: string
  descricao: string | null
  preco_origem: number
  taxa_origem: number
  moeda: string
  estoque_disponivel: number | null
  fonte_url: string | null
  metadata: Record<string, unknown>
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function env(name: string) {
  return Deno.env.get(name) || ''
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function number(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      const n = Number(value.replace(',', '.').replace(/[^\d.-]/g, ''))
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

function money(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value !== 'string') continue

    const raw = value.trim()
    if (!raw) continue
    const cleaned = raw.replace(/\s/g, '').replace(/[^\d,.-]/g, '')
    if (!/\d/.test(cleaned)) continue

    const negative = cleaned.startsWith('-')
    const unsigned = cleaned.replace(/-/g, '')
    const lastComma = unsigned.lastIndexOf(',')
    const lastDot = unsigned.lastIndexOf('.')
    let normalized = unsigned

    if (lastComma >= 0 && lastDot >= 0) {
      const decimalSep = lastComma > lastDot ? ',' : '.'
      const thousandSep = decimalSep === ',' ? '.' : ','
      normalized = unsigned.split(thousandSep).join('').replace(decimalSep, '.')
    } else if (lastComma >= 0) {
      const cents = unsigned.length - lastComma - 1
      normalized = cents === 3 ? unsigned.replace(/,/g, '') : unsigned.replace(',', '.')
    } else if (lastDot >= 0) {
      const cents = unsigned.length - lastDot - 1
      normalized = cents === 3 ? unsigned.replace(/\./g, '') : unsigned
    }

    const n = Number(`${negative ? '-' : ''}${normalized}`)
    if (Number.isFinite(n)) return n
  }
  return null
}

function semAcento(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function mencionaAlvoPg(value: string) {
  const blob = semAcento(value)
  return ALVOS_PG.some(alvo => blob.includes(semAcento(alvo)))
}

function absolutizarUrl(value?: string, base?: string) {
  const raw = (value || '').trim()
  if (!raw) return ''
  try {
    return new URL(raw, base || undefined).toString()
  } catch {
    return raw
  }
}

function resumo(texto?: string): string | null {
  if (!texto) return null
  const limpo = texto.replace(/\s+/g, ' ').trim()
  if (!limpo) return null
  return limpo.length > 180 ? `${limpo.slice(0, 177)}...` : limpo
}

function splitDataHora(value?: string) {
  if (!value) return { data: null as string | null, hora: null as string | null }
  const raw = value.trim()
  const isoComFuso = raw.match(/^\d{4}-\d{2}-\d{2}T/)
  if (isoComFuso) {
    const dataIso = new Date(raw)
    if (!Number.isNaN(dataIso.getTime())) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(dataIso)
      const map = Object.fromEntries(parts.map(part => [part.type, part.value]))
      const hour = map.hour === '24' ? '00' : map.hour
      return { data: `${map.year}-${map.month}-${map.day}`, hora: `${hour}:${map.minute}` }
    }
  }

  const rawAscii = semAcento(raw)
  const temFaixa = /\b(de|ate|a)\b|-|\u2013/.test(rawAscii)
  const dataMatch = raw.match(/(\d{4}-\d{2}-\d{2})/)
  const brMatches = [...raw.matchAll(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/g)]
  const brMatch = brMatches.length > 1 && temFaixa ? brMatches[brMatches.length - 1] : brMatches[0]
  const mesMatches = [...rawAscii.matchAll(/\b(?:dia\s+)?(\d{1,2})\s+(?:de\s+)?([a-z]{3,})(?:\s+(?:de\s+)?)?(\d{4})?/g)]
  const mesMatch = mesMatches.length > 1 && temFaixa ? mesMatches[mesMatches.length - 1] : mesMatches[0]
  const mesNumero = mesMatch ? mesPt(mesMatch[2]) : ''
  const horaMatch = raw.match(/(\d{1,2}):(\d{2})/)
  const data = dataMatch
    ? dataMatch[1]
    : brMatch
      ? `${brMatch[3] || new Date().getFullYear()}-${brMatch[2].padStart(2, '0')}-${brMatch[1].padStart(2, '0')}`
      : mesMatch && mesNumero
        ? `${mesMatch[3] || new Date().getFullYear()}-${mesNumero}-${mesMatch[1].padStart(2, '0')}`
        : null
  const hora = horaMatch ? `${horaMatch[1].padStart(2, '0')}:${horaMatch[2]}` : null
  return { data, hora }
}

function htmlText(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function mesPt(valor: string) {
  const key = semAcento(valor).slice(0, 3)
  const meses: Record<string, string> = {
    jan: '01',
    fev: '02',
    mar: '03',
    abr: '04',
    mai: '05',
    jun: '06',
    jul: '07',
    ago: '08',
    set: '09',
    out: '10',
    nov: '11',
    dez: '12',
  }
  return meses[key] || ''
}

function dataComAnoProvavel(dia: string, mes: string) {
  const mm = mesPt(mes)
  if (!mm) return null
  const hoje = new Date()
  let ano = hoje.getFullYear()
  const data = new Date(`${ano}-${mm}-${dia.padStart(2, '0')}T00:00:00`)
  const ontem = new Date(hoje)
  ontem.setDate(ontem.getDate() - 1)
  ontem.setHours(0, 0, 0, 0)
  if (data < ontem) ano += 1
  return `${ano}-${mm}-${dia.padStart(2, '0')}`
}

function periodoPelaHora(hora?: string | null, periodo?: string): Periodo {
  if (periodo && ['manha', 'tarde', 'noite', 'madrugada'].includes(periodo)) return periodo as Periodo
  const h = Number((hora || '').split(':')[0])
  if (!Number.isFinite(h)) return 'noite'
  if (h < 5) return 'madrugada'
  if (h < 12) return 'manha'
  if (h < 18) return 'tarde'
  return 'noite'
}

function normalizarIngressos(items: IngressoBruto[] | undefined, fonteUrl: string | null, fallbackPreco: number | null): IngressoNormalizado[] {
  const candidatos = Array.isArray(items) ? [...items] : []
  if (!candidatos.length && fallbackPreco && fallbackPreco > 0) {
    candidatos.push({
      nome: 'Entrada',
      preco: fallbackPreco,
      fonte_url: fonteUrl || undefined,
    })
  }

  const vistos = new Set<string>()
  const ingressos: IngressoNormalizado[] = []
  for (const item of candidatos) {
    const preco = money(item.preco, item.price)
    if (preco === null || preco <= 0) continue
    const nome = text(item.nome, item.title, item.name, 'Entrada')
    const sourceTicketId = text(item.source_ticket_id, item.id) || null
    const key = `${sourceTicketId || nome}|${preco}`
    if (vistos.has(key)) continue
    vistos.add(key)

    const estoque = number(item.estoque_disponivel)
    ingressos.push({
      source_ticket_id: sourceTicketId,
      nome,
      descricao: resumo(text(item.descricao, item.description)),
      preco_origem: Math.round(preco * 100) / 100,
      taxa_origem: Math.max(0, Math.round((money(item.taxa, item.fee) || 0) * 100) / 100),
      moeda: text(item.moeda, item.currency, 'BRL') || 'BRL',
      estoque_disponivel: estoque === null ? null : Math.max(0, Math.floor(estoque)),
      fonte_url: absolutizarUrl(text(item.fonte_url, fonteUrl), fonteUrl || undefined) || fonteUrl,
      metadata: {
        status_origem: text(item.status),
        availability: text(item.availability),
        origem: item.metadata || null,
      },
    })
  }

  return ingressos
}

function emojiPorCategoria(cat?: string): string {
  const c = (cat || '').toLowerCase()
  if (c.includes('balada') || c.includes('dj') || c.includes('club')) return '🎧'
  if (c.includes('mus') || c.includes('show')) return '🎵'
  if (c.includes('esport') || c.includes('corr') || c.includes('surf')) return '🏄'
  if (c.includes('gastro') || c.includes('food') || c.includes('comida')) return '🍽️'
  if (c.includes('junina') || c.includes('arraia')) return '🎊'
  if (c.includes('feira') || c.includes('artesan')) return '🛍️'
  if (c.includes('infan') || c.includes('kids') || c.includes('crianca')) return '🎈'
  if (c.includes('cultur') || c.includes('teatro') || c.includes('arte')) return '🎭'
  return '🎉'
}

function normalizar(e: EventoBruto, fonte?: Fonte): EventoNormalizado | null {
  const dataHora = splitDataHora(text(e.startDate, e.startsAt, e.data, e.data_evento, e.date, e.endDate))
  const hora = text(e.hora) || dataHora.hora
  const categoria = text(e.categoria, e.genre, fonte?.categoria, 'Evento')
  const titulo = text(e.titulo, e.title, e.name, e.nome)
  if (titulo.length < 3) return null
  const fonteUrl = absolutizarUrl(text(e.fonte_url, e.url, e.url_amigavel, fonte?.url), fonte?.url)
  const fallbackPreco = money(e.preco, e.price)
  const ingressos = normalizarIngressos(e.ingressos, fonteUrl || null, fallbackPreco)

  return {
    titulo,
    descricao_curta: resumo(text(e.descricao_curta, e.descricao, e.description)),
    periodo: periodoPelaHora(hora, e.periodo),
    data: dataHora.data,
    hora: hora || null,
    local_nome: text(e.local_nome, e.venue, e.local, fonte?.local_nome, fonte?.nome) || null,
    endereco: text(e.endereco, e.address, e.cidade) || null,
    lat: number(e.lat, e.latitude),
    lng: number(e.lng, e.longitude),
    preco: fallbackPreco || 0,
    categoria,
    emoji: text(e.emoji) || emojiPorCategoria(categoria),
    fonte: 'robo',
    fonte_url: fonteUrl || null,
    destaque: false,
    status: 'pendente',
    ingressos,
  }
}

function futuroOuSemData(ev: EventoNormalizado) {
  if (!ev.data) return false
  const agoraSp = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const hora = ev.hora && /^\d{2}:\d{2}/.test(ev.hora) ? ev.hora : '23:59'
  const data = new Date(`${ev.data}T${hora}:00`)
  return !Number.isNaN(data.getTime()) && data >= agoraSp
}

function dentroDePraiaGrande(ev: EventoNormalizado) {
  const blob = semAcento(`${ev.titulo || ''} ${ev.local_nome || ''} ${ev.endereco || ''} ${ev.descricao_curta || ''} ${ev.fonte_url || ''}`)
  if (!blob) return false
  if (blob.includes('praia grande')) return true
  if (/\b(pg|boqueirao|canto do forte|guilhermina|aviacao|tupi|ocian|caicara|solemar)\b/.test(blob)) return true
  if (mencionaAlvoPg(blob)) return true
  return false
}

// Mesmo filtro de dentroDePraiaGrande, mas aplicado no evento BRUTO (antes de
// normalizar) — usado só pra ORDENAR quem detalha primeiro (não pra excluir
// ninguém — a exclusão de verdade é sempre dentroDePraiaGrande no final, com
// dados completos da página do evento). Fica mais solto de propósito: um
// falso positivo aqui custa 1 requisição extra; um falso negativo aqui
// significava um evento de PG nunca ganhar preço (foi o bug do "MC Daniel").
function pareceSerPraiaGrande(e: EventoBruto): boolean {
  const blob = semAcento(`${text(e.titulo, e.title, e.name, e.nome)} ${text(e.local_nome, e.venue, e.local)} ${text(e.endereco, e.address)} ${text(e.fonte_url, e.url)}`)
  if (!blob) return false
  if (blob.includes('praia grande')) return true
  if (/\b(pg|boqueirao|canto do forte|guilhermina|aviacao|tupi|ocian|caicara|solemar|rocket|porks|embaixador|quiosque)\b/.test(blob)) return true
  if (mencionaAlvoPg(blob)) return true
  return false
}

function dedupeKey(ev: EventoNormalizado) {
  return `${ev.titulo.toLowerCase()}|${ev.data || ''}|${ev.local_nome || ''}`
}

function parseFontes(raw: string): Fonte[] {
  if (!raw.trim()) return []

  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map(normalizarFonte).filter(Boolean) as Fonte[]
  } catch {
    // aceita lista simples por linha ou virgula
  }

  return raw
    .split(/\r?\n|,/)
    .map(item => normalizarFonte(item.trim()))
    .filter(Boolean) as Fonte[]
}

function normalizarFonte(value: unknown): Fonte | null {
  if (typeof value === 'string') return value.trim() ? { url: value.trim() } : null
  const obj = asRecord(value)
  if (!obj) return null
  const url = text(obj.url, obj.fonte_url)
  if (!url) return null
  return {
    url,
    nome: text(obj.nome, obj.name) || undefined,
    categoria: text(obj.categoria, obj.category) || undefined,
    local_nome: text(obj.local_nome, obj.venue) || undefined,
  }
}

function fontesDoPedido(body: Record<string, unknown>) {
  const envFontes = [
    ...parseFontes(env('EVENTOS_SOURCE_URLS')),
    ...parseFontes(env('EVENTOS_SOURCE_URL')),
  ]
  const bodyFontes = Array.isArray(body.fontes)
    ? body.fontes.map(normalizarFonte).filter(Boolean) as Fonte[]
    : []

  const map = new Map<string, Fonte>()
  const usarPadrao = body.fontes_padrao !== false && body.default_sources !== false
  for (const fonte of [...(usarPadrao ? FONTES_PADRAO : []), ...envFontes, ...bodyFontes]) map.set(fonte.url, fonte)
  return [...map.values()]
}

function objetosDeEvento(value: unknown, out: Record<string, unknown>[] = [], depth = 0) {
  if (depth > 5 || out.length > 250) return out
  if (Array.isArray(value)) {
    for (const item of value) objetosDeEvento(item, out, depth + 1)
    return out
  }

  const obj = asRecord(value)
  if (!obj) return out

  const type = text(obj['@type']).toLowerCase()
  const pareceEvento = type.includes('event') || (!!text(obj.titulo, obj.title, obj.name, obj.nome) && !!text(obj.startDate, obj.startsAt, obj.data, obj.data_evento, obj.date, obj.hora))
  if (pareceEvento) out.push(obj)

  for (const key of ['eventos', 'events', 'items', 'item', 'item_eventos', 'item_proximos', 'data', 'results', 'records', 'rows', 'lista', '@graph']) {
    if (key in obj) objetosDeEvento(obj[key], out, depth + 1)
  }

  return out
}

function brutoDeObjeto(obj: Record<string, unknown>, fonte: Fonte): EventoBruto {
  const location = asRecord(obj.location)
  const geo = asRecord(location?.geo)
  const address = asRecord(location?.address)
  const offers = Array.isArray(obj.offers) ? asRecord(obj.offers[0]) : asRecord(obj.offers)
  const offerItems = Array.isArray(obj.offers) ? obj.offers : offers ? [offers] : []
  const ingressos = offerItems
    .map(offer => asRecord(offer))
    .filter((offer): offer is Record<string, unknown> => !!offer)
    .map((offer, idx): IngressoBruto => ({
      id: text(offer.id, offer.sku, idx + 1),
      nome: text(offer.name, offer.title, 'Entrada'),
      preco: text(offer.price, offer.lowPrice),
      moeda: text(offer.priceCurrency, 'BRL'),
      availability: text(offer.availability),
      fonte_url: absolutizarUrl(text(offer.url, fonte.url), fonte.url),
    }))
    .filter(item => money(item.preco) !== null)

  return {
    titulo: text(obj.titulo, obj.title, obj.name, obj.nome),
    descricao: text(obj.descricao, obj.description),
    data: text(obj.data, obj.data_evento, obj.date, obj.startDate, obj.startsAt),
    startDate: text(obj.startDate),
    startsAt: text(obj.startsAt),
    hora: text(obj.hora),
    local_nome: text(obj.local_nome, obj.venue, obj.local, location?.name, fonte.local_nome, fonte.nome),
    endereco: text(obj.endereco, obj.address, obj.cidade, location?.addressFormatted, address?.streetAddress, address?.addressLocality),
    lat: number(obj.lat, obj.latitude, geo?.latitude),
    lng: number(obj.lng, obj.longitude, geo?.longitude),
    preco: money(obj.preco, obj.price, offers?.price) || undefined,
    categoria: text(obj.categoria, obj.category, obj.genre, fonte.categoria),
    emoji: text(obj.emoji),
    url: absolutizarUrl(text(obj.url, obj.url_amigavel, offers?.url, fonte.url), fonte.url),
    fonte_url: absolutizarUrl(text(obj.fonte_url, obj.url, obj.url_amigavel, offers?.url, fonte.url), fonte.url),
    periodo: text(obj.periodo),
    ingressos,
  }
}

function extrairJsonLd(html: string, fonte: Fonte) {
  const eventos: EventoBruto[] = []
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const match of scripts) {
    const raw = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()
    try {
      const parsed = JSON.parse(raw)
      for (const obj of objetosDeEvento(parsed)) eventos.push(brutoDeObjeto(obj, fonte))
    } catch {
      // JSON-LD quebrado em site externo: ignora esta tag.
    }
  }
  return eventos
}

function metaContent(html: string, key: string) {
  const prop = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match =
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'))
  return htmlText(match?.[1] || '')
}

function pareceChamadaDeEvento(value: string) {
  const blob = semAcento(value)
  return /\b(agenda|show|musica ao vivo|pagode|samba|dj|festa|evento|open|reinauguracao|aniversario|matine|reservas?|ingressos?|convites?|sabado|domingo|sexta|feriado)\b/.test(blob)
}

function extrairSocialHtml(html: string, fonte: Fonte): EventoBruto[] {
  const title = metaContent(html, 'og:title') || metaContent(html, 'twitter:title')
  const description = metaContent(html, 'og:description') || metaContent(html, 'description') || metaContent(html, 'twitter:description')
  const visible = htmlText(html)
  const combined = `${title} ${description} ${visible}`.slice(0, 6000)
  const dataHora = splitDataHora(combined)
  if (!dataHora.data || !pareceChamadaDeEvento(combined)) return []

  const alvoNoTexto = mencionaAlvoPg(`${combined} ${fonte.nome || ''} ${fonte.local_nome || ''} ${fonte.url}`)
  const mencionaPg = semAcento(combined).includes('praia grande') || semAcento(combined).includes('guilhermina') || semAcento(combined).includes('ocian') || alvoNoTexto
  if (!mencionaPg) return []

  const tituloBase = title
    .replace(/\s*\(@[^)]+\).*/i, '')
    .replace(/\s*on Instagram.*/i, '')
    .replace(/\s*\|.*$/, '')
    .trim()

  return [{
    titulo: tituloBase || `Agenda ${fonte.nome || fonte.local_nome || 'PraiaGo'}`,
    descricao: resumo(description || visible),
    data: dataHora.data,
    hora: dataHora.hora || undefined,
    local_nome: fonte.local_nome || fonte.nome || (alvoNoTexto ? 'Praia Grande' : undefined),
    endereco: semAcento(combined).includes('praia grande') ? 'Praia Grande, SP' : undefined,
    categoria: fonte.categoria || 'Agenda social',
    emoji: '🎶',
    fonte_url: fonte.url,
    url: fonte.url,
  }]
}

function extrairLinksSociais(html: string, fonte: Fonte) {
  const links = new Set<string>()
  const host = new URL(fonte.url).hostname
  const instagram = host.includes('instagram.com')
  const facebook = host.includes('facebook.com')
  if (!instagram && !facebook) return []

  const regex = instagram
    ? /(?:https?:\/\/(?:www\.)?instagram\.com)?\/(p|reel)\/([A-Za-z0-9_-]+)/g
    : /https?:\/\/(?:www\.)?facebook\.com\/[^"'<>\s]+/g

  for (const match of html.matchAll(regex)) {
    const raw = match[0]
    const url = instagram
      ? `https://www.instagram.com/${match[1]}/${match[2]}/`
      : raw.replace(/\\u0025/g, '%').replace(/\\\//g, '/')
    links.add(url)
  }

  return [...links].slice(0, Math.max(1, Math.min(30, number(env('SOCIAL_DETAIL_MAX')) || 12)))
}

async function buscarDetalhesSociais(html: string, fonte: Fonte) {
  const eventos = [...extrairSocialHtml(html, fonte)]
  for (const url of extrairLinksSociais(html, fonte)) {
    try {
      const res = await fetchComRetry(url, {
        signal: AbortSignal.timeout(12000),
        headers: {
          Accept: 'text/html,*/*;q=0.8',
          'User-Agent': `PraiaGoCacaEventos/${ROBO_VERSION}`,
        },
      }, 1)
      if (!res.ok) continue
      const detalheFonte = { ...fonte, url }
      eventos.push(...extrairSocialHtml(await res.text(), detalheFonte))
    } catch {
      // Rede social pode bloquear scraping; o robo segue com as outras fontes.
    }
  }
  return eventos
}

function extrairCardsArticket(html: string, fonte: Fonte) {
  const eventos: EventoBruto[] = []
  const cards = html.matchAll(/<a\s+href=["']([^"']+)["'][^>]*class=["'][^"']*home-card[\s\S]*?<\/a>/gi)

  for (const match of cards) {
    const href = match[1]
    const card = match[0]
    const titulo = htmlText(card.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || '')
    const local = htmlText(card.match(/<span[^>]*class=["'][^"']*text-\[12px\][^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '')
    const dataRaw = htmlText(card.match(/<span[^>]*class=["'][^"']*flex-none[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '')
    const horaRaw = htmlText(card.match(/<span[^>]*class=["'][^"']*text-white\/50[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '')
    const dataMatch = dataRaw.match(/(\d{1,2})\s+([a-zA-ZçÇ]+)/)
    const horaMatch = horaRaw.match(/(\d{1,2})h(\d{2})?/)
    const data = dataMatch ? dataComAnoProvavel(dataMatch[1], dataMatch[2]) || undefined : undefined
    const hora = horaMatch ? `${horaMatch[1].padStart(2, '0')}:${(horaMatch[2] || '00').padStart(2, '0')}` : undefined

    if (!titulo || !data) continue

    eventos.push({
      titulo,
      data,
      hora,
      local_nome: local || fonte.local_nome || fonte.nome,
      categoria: fonte.categoria || 'Ingressos',
      fonte_url: absolutizarUrl(href, fonte.url),
      url: absolutizarUrl(href, fonte.url),
      emoji: '🎫',
    })
  }

  return eventos
}

function extrairObjetoBalanceado(texto: string, inicio: number) {
  let depth = 0
  let inString = false
  let escape = false
  let quote = ''
  for (let i = inicio; i < texto.length; i++) {
    const ch = texto[i]
    if (inString) {
      if (escape) {
        escape = false
      } else if (ch === '\\') {
        escape = true
      } else if (ch === quote) {
        inString = false
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = true
      quote = ch
      continue
    }
    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) return texto.slice(inicio, i + 1)
    }
  }
  return ''
}

function extrairIngressosArticket(html: string, fonte: Fonte): IngressoBruto[] {
  const ticketKey = html.indexOf('tickets:')
  if (ticketKey < 0) return []
  const inicio = html.indexOf('{', ticketKey)
  if (inicio < 0) return []
  const rawTickets = extrairObjetoBalanceado(html, inicio)
  if (!rawTickets) return []

  try {
    const parsed = JSON.parse(rawTickets) as Record<string, unknown>
    return Object.entries(parsed).map(([id, value]) => {
      const item = asRecord(value) || {}
      return {
        id,
        source_ticket_id: id,
        nome: text(item.title, item.name, 'Entrada'),
        preco: money(item.price),
        taxa: money(item.fee),
        moeda: 'BRL',
        fonte_url: fonte.url,
        metadata: item,
      } as IngressoBruto & { metadata?: Record<string, unknown> }
    }).filter(item => {
      const preco = money(item.preco)
      return preco !== null && preco > 0
    })
  } catch {
    return []
  }
}

function anexarIngressos(eventos: EventoBruto[], ingressos: IngressoBruto[]) {
  if (!ingressos.length) return eventos
  return eventos.map(evento => ({
    ...evento,
    ingressos: [...(evento.ingressos || []), ...ingressos],
  }))
}

function mesclarDetalheArticket(base: EventoBruto, detalhes: EventoBruto[], ingressos: IngressoBruto[]) {
  const detalhe = detalhes[0] || {}
  return {
    ...base,
    descricao: text(detalhe.descricao, base.descricao),
    descricao_curta: text(detalhe.descricao_curta, base.descricao_curta),
    data: text(detalhe.data, base.data),
    startDate: text(detalhe.startDate, base.startDate),
    hora: text(detalhe.hora, base.hora),
    local_nome: text(detalhe.local_nome, base.local_nome),
    endereco: text(detalhe.endereco, base.endereco),
    lat: number(detalhe.lat, base.lat),
    lng: number(detalhe.lng, base.lng),
    fonte_url: text(base.fonte_url, detalhe.fonte_url),
    url: text(base.url, detalhe.url),
    ingressos: [...(base.ingressos || []), ...(detalhe.ingressos || []), ...ingressos],
  } as EventoBruto
}

// Busca com 1 retry curto pra falha transitória de rede (timeout, DNS,
// conexão resetada). NÃO reage a 4xx/5xx do servidor com retry — se a página
// não existe, tentar de novo não muda nada.
async function fetchComRetry(url: string, init: RequestInit, tentativas = 2): Promise<Response> {
  let ultimoErro: unknown
  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fetch(url, init)
      return res
    } catch (err) {
      ultimoErro = err
      if (i < tentativas - 1) await new Promise(r => setTimeout(r, 400 * (i + 1)))
    }
  }
  throw ultimoErro instanceof Error ? ultimoErro : new Error('Falha de rede desconhecida.')
}

// Normaliza + filtra (futuro, Praia Grande, dedupe) + grava UM evento no banco
// na hora. Usado tanto durante o detalhamento (salva incrementalmente, pra não
// perder tudo se a função for interrompida no meio) quanto no loop final.
// Idempotente: rodar duas vezes pro mesmo evento não duplica nada (unique
// index em fonte_url/titulo+data, upsert nos lotes).
async function salvarEventoBruto(
  supabase: ReturnType<typeof createClient>,
  bruto: EventoBruto,
  vistos: Set<string>,
): Promise<{ estado: 'salvo' | 'ja_visto' | 'fora_de_escopo' | 'erro'; ingressosSalvos: number }> {
  const ev = normalizar(bruto)
  if (!ev) return { estado: 'fora_de_escopo', ingressosSalvos: 0 }
  if (!futuroOuSemData(ev) || !dentroDePraiaGrande(ev)) return { estado: 'fora_de_escopo', ingressosSalvos: 0 }

  const key = dedupeKey(ev)
  if (vistos.has(key)) return { estado: 'ja_visto', ingressosSalvos: 0 }
  vistos.add(key)

  try {
    const { ingressos, ...eventoRow } = ev
    const { data: inserido, error } = await supabase.from('eventos').insert(eventoRow).select('id').maybeSingle()
    const eventoId = inserido?.id || await localizarEvento(supabase, ev)

    let ingressosSalvos = 0
    if (eventoId) {
      const { salvos } = await salvarIngressos(supabase, eventoId, ingressos)
      ingressosSalvos = salvos
    }
    return { estado: error && !eventoId ? 'erro' : 'salvo', ingressosSalvos }
  } catch {
    return { estado: 'erro', ingressosSalvos: 0 }
  }
}

type StatsEnriquecimento = {
  candidatos: number
  detalhesConsultados: number
  detalhesOk: number
  detalhesFalhos: number
  salvosIncrementais: number
  ingressosIncrementais: number
  tempoEsgotado: boolean
}

async function enriquecerDetalhesArticket(
  eventos: EventoBruto[],
  fonte: Fonte,
  ctx: { supabase: ReturnType<typeof createClient>; vistos: Set<string>; deadlineAt: number; stats: StatsEnriquecimento },
) {
  const maxDetalhes = Math.max(1, Math.min(150, number(env('ARTICKET_DETAIL_MAX')) || 100))

  // Dedupe por URL absoluta ANTES de gastar requisição — carrosséis costumam
  // repetir o mesmo card várias vezes no HTML.
  const vistosUrl = new Set<string>()
  const candidatosBrutos = eventos.filter(evento => {
    const url = absolutizarUrl(text(evento.fonte_url, evento.url), fonte.url)
    if (!url || !url.includes('articket.com.br/e/')) return true // não é da articket, segue sem dedupe por url
    if (vistosUrl.has(url)) return false
    vistosUrl.add(url)
    return true
  })

  // Prioriza quem já parece ser de Praia Grande — assim, se o orçamento de
  // tempo/requisições acabar, os eventos que IMPORTAM já foram detalhados.
  const candidatos = [...candidatosBrutos].sort((a, b) => Number(pareceSerPraiaGrande(b)) - Number(pareceSerPraiaGrande(a)))
  ctx.stats.candidatos += candidatos.filter(c => {
    const url = absolutizarUrl(text(c.fonte_url, c.url), fonte.url)
    return url.includes('articket.com.br/e/')
  }).length

  const enriquecidos: EventoBruto[] = []
  let consultados = 0

  for (const evento of candidatos) {
    const url = absolutizarUrl(text(evento.fonte_url, evento.url), fonte.url)
    const esgotouTempo = Date.now() >= ctx.deadlineAt
    if (esgotouTempo) ctx.stats.tempoEsgotado = true

    if (!url || !url.includes('articket.com.br/e/') || consultados >= maxDetalhes || esgotouTempo) {
      enriquecidos.push(evento)
      continue
    }

    try {
      consultados++
      ctx.stats.detalhesConsultados++
      const detalheFonte = { ...fonte, url }
      const res = await fetchComRetry(url, {
        signal: AbortSignal.timeout(12000),
        headers: {
          Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
          'User-Agent': `PraiaGoCacaEventos/${ROBO_VERSION}`,
        },
      })
      if (!res.ok) throw new Error(`detalhe respondeu ${res.status}`)
      const html = await res.text()
      const detalhes = [...extrairJsonLd(html, detalheFonte), ...extrairDetalheHtmlGenerico(html, detalheFonte)]
      const ingressos = extrairIngressosArticket(html, detalheFonte)
      const mesclado = mesclarDetalheArticket(evento, detalhes, ingressos)
      ctx.stats.detalhesOk++

      // Salva JÁ — não espera terminar os outros ~100 eventos. Se a função
      // parar no meio (timeout da plataforma), o que já foi detalhado fica
      // gravado. O loop final ainda roda por cima, mas o dedupe (vistos) faz
      // ele pular quem já foi salvo aqui — sem duplicar nem retrabalhar.
      const salvo = await salvarEventoBruto(ctx.supabase, mesclado, ctx.vistos)
      if (salvo.estado === 'salvo') ctx.stats.salvosIncrementais++
      ctx.stats.ingressosIncrementais += salvo.ingressosSalvos
      enriquecidos.push(mesclado)
    } catch {
      ctx.stats.detalhesFalhos++
      enriquecidos.push(evento)
    }
  }

  return enriquecidos
}

function extrairDetalheHtmlGenerico(html: string, fonte: Fonte) {
  const titulo = htmlText(
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    || html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    || ''
  )
  const visivel = htmlText(html)
  const quando = visivel.match(/\bQuando\b\s+(.{0,140}?)(?:\bLocal\b|\bSobre\b|\bComprar\b|$)/i)?.[1]
  const local = visivel.match(/\bLocal\b\s+(.{0,180}?)(?:\bComo chegar\b|\bOrganizador\b|\bIngressos\b|\bSobre\b|$)/i)?.[1]
  if (!titulo || !quando) return []

  return [{
    titulo,
    data: quando,
    local_nome: local ? local.split(/\s{2,}|RUA|R |AVENIDA|AV /i)[0].trim() : fonte.local_nome || fonte.nome,
    endereco: local || undefined,
    categoria: fonte.categoria || 'Ingressos',
    fonte_url: fonte.url,
    url: fonte.url,
  } as EventoBruto]
}

function extrairRoleAgoraNextData(html: string, fonte: Fonte) {
  const match = html.match(/<script id=["']__NEXT_DATA__["'] type=["']application\/json["']>([\s\S]*?)<\/script>/i)
  if (!match) return []

  try {
    const parsed = JSON.parse(match[1])
    const root = asRecord(parsed)
    const props = asRecord(root?.props)
    const pageProps = asRecord(props?.pageProps)
    const events = Array.isArray(pageProps?.events) ? pageProps.events : []

    return events.map((event): EventoBruto => {
      const ev = asRecord(event) || {}
      const location = asRecord(ev.location)
      const slug = text(ev.slug)
      const pageUrl = slug ? `https://www.roleagora.com.br/event/${slug}` : fonte.url
      const artistNames = Array.isArray(ev.artistNames)
        ? ev.artistNames.filter(item => typeof item === 'string').join(', ')
        : ''

      return {
        titulo: text(ev.name, ev.title),
        descricao: resumo(text(ev.description, artistNames)) || undefined,
        startDate: text(ev.startsAt, ev.startDate),
        local_nome: text(location?.name, fonte.local_nome, fonte.nome),
        endereco: text(location?.addressFormatted, location?.address, fonte.nome),
        lat: number(location?.lat),
        lng: number(location?.lng),
        categoria: text(ev.eventTypeName, ev.categoryName, fonte.categoria, 'Evento'),
        fonte_url: pageUrl,
        url: pageUrl,
      }
    })
  } catch {
    return []
  }
}

function extrairJson(payload: unknown, fonte: Fonte) {
  return objetosDeEvento(payload).map(obj => brutoDeObjeto(obj, fonte))
}

function eventosGuicheDoPayload(payload: unknown, fonte: Fonte) {
  return objetosDeEvento(payload).map(obj => ({
    ...brutoDeObjeto(obj, fonte),
    titulo: text(obj.nome, obj.titulo, obj.title, obj.name),
    data: text(obj.data, obj.data_evento, obj.date, obj.startDate),
    local_nome: text(obj.local, obj.local_nome, obj.venue, fonte.local_nome, fonte.nome),
    endereco: text(obj.cidade, obj.endereco, obj.address),
    categoria: text(obj.categoria, fonte.categoria, 'Ingressos'),
    fonte_url: absolutizarUrl(text(obj.url_amigavel, obj.fonte_url, obj.url, fonte.url), fonte.url),
    url: absolutizarUrl(text(obj.url_amigavel, obj.url, fonte.url), fonte.url),
  } as EventoBruto))
}

async function postGuicheWeb(acao: string, offset?: number) {
  const body = new URLSearchParams()
  body.set('a', acao)
  if (offset !== undefined) body.set('offset', String(offset))

  const res = await fetch('https://www.guicheweb.com.br/webservices/api/api.php', {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': `PraiaGoCacaEventos/${ROBO_VERSION}`,
    },
    body: body.toString(),
  })
  if (!res.ok) throw new Error(`Guiche Web respondeu ${res.status}`)
  return await res.json()
}

async function buscarGuicheWeb(fonte: Fonte) {
  const eventos: EventoBruto[] = []
  const vistos = new Set<string>()
  const maxPaginas = Math.max(1, Math.min(50, number(env('GUICHEWEB_MAX_PAGES')) || 20))
  const coletar = (candidatos: EventoBruto[]) => {
    for (const ev of candidatos) {
      const key = text(ev.fonte_url, ev.url, ev.titulo)
      if (!key || vistos.has(key)) continue
      vistos.add(key)
      eventos.push(ev)
    }
  }

  coletar(eventosGuicheDoPayload(await postGuicheWeb('carregar_home'), fonte))

  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const payload = await postGuicheWeb('carregar_eventos', pagina * 20)
    const candidatos = eventosGuicheDoPayload(payload, fonte)
    if (!candidatos.length) break
    coletar(candidatos)
  }

  return eventos
}

async function buscarFonte(
  fonte: Fonte,
  ctx: { supabase: ReturnType<typeof createClient>; vistos: Set<string>; deadlineAt: number; stats: StatsEnriquecimento },
) {
  const parsedUrl = new URL(fonte.url)
  if (parsedUrl.hostname.includes('guicheweb.com.br') && (parsedUrl.pathname === '/' || parsedUrl.pathname === '')) {
    return buscarGuicheWeb(fonte)
  }

  const res = await fetchComRetry(fonte.url, {
    headers: {
      Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
      'User-Agent': `PraiaGoCacaEventos/${ROBO_VERSION}`,
    },
  })
  if (!res.ok) throw new Error(`Fonte ${fonte.url} respondeu ${res.status}`)

  const contentType = res.headers.get('content-type') || ''
  const body = await res.text()

  if (contentType.includes('json') || body.trim().startsWith('{') || body.trim().startsWith('[')) {
    return extrairJson(JSON.parse(body), fonte)
  }

  const roleAgora = parsedUrl.hostname.includes('roleagora.com.br') ? extrairRoleAgoraNextData(body, fonte) : []
  const sociais = parsedUrl.hostname.includes('instagram.com') || parsedUrl.hostname.includes('facebook.com')
    ? await buscarDetalhesSociais(body, fonte)
    : []
  let eventos = [...roleAgora, ...sociais, ...extrairJsonLd(body, fonte), ...extrairCardsArticket(body, fonte), ...extrairDetalheHtmlGenerico(body, fonte)]
  if (parsedUrl.hostname.includes('articket.com.br') && !parsedUrl.pathname.startsWith('/e/')) {
    // A home do articket lista eventos do Brasil inteiro (~100 cards). O
    // dedupe/priorização/limite de tempo já acontecem dentro de
    // enriquecerDetalhesArticket — aqui só repassa todo mundo pra lá.
    eventos = await enriquecerDetalhesArticket(eventos, fonte, ctx)
  }
  const ingressosArticket = parsedUrl.hostname.includes('articket.com.br') ? extrairIngressosArticket(body, fonte) : []
  return anexarIngressos(eventos, ingressosArticket)
}

async function localizarEvento(supabase: ReturnType<typeof createClient>, ev: EventoNormalizado) {
  if (ev.fonte_url) {
    const { data } = await supabase
      .from('eventos')
      .select('id')
      .eq('fonte_url', ev.fonte_url)
      .maybeSingle()
    if (data?.id) return data.id as string
  }

  if (ev.data) {
    const { data } = await supabase
      .from('eventos')
      .select('id')
      .eq('titulo', ev.titulo)
      .eq('data', ev.data)
      .maybeSingle()
    if (data?.id) return data.id as string
  }

  return null
}

// Margem do PraiaGo na revenda do ingresso (nosso lucro). Padrao 10% — mesmo
// valor usado pelos lotes criados manualmente pelo admin (markup_percent
// default no banco). Ajustável via EVENTOS_MARKUP_PERCENT se precisar mudar.
function markupPercent() {
  const m = Number(env('EVENTOS_MARKUP_PERCENT'))
  return Number.isFinite(m) && m >= 0 && m <= 500 ? m : DEFAULT_MARKUP_PERCENT
}

async function salvarIngressos(supabase: ReturnType<typeof createClient>, eventoId: string, ingressos: IngressoNormalizado[] | undefined) {
  const ingressosValidos = (ingressos || []).filter(ingresso => Number.isFinite(ingresso.preco_origem) && ingresso.preco_origem > 0)
  if (!ingressosValidos.length) return { salvos: 0 }

  const markup = markupPercent()
  let salvos = 0
  let menorPreco = Number.POSITIVE_INFINITY

  for (const ingresso of ingressosValidos) {
    const precoBase = Math.max(0, ingresso.preco_origem + ingresso.taxa_origem)
    const precoVenda = Math.round((precoBase * (1 + markup / 100)) * 100) / 100
    const metadata = {
      ...ingresso.metadata,
      robo_version: ROBO_VERSION,
      preco_origem: ingresso.preco_origem,
      taxa_origem: ingresso.taxa_origem,
      preco_base: precoBase,
      markup_percent: markup,
      preco_venda_estimado: precoVenda,
    }
    // "a partir de R$": menor preço PAGO com estoque (ignora cortesia/R$0 pra
    // não mostrar "a partir de R$0" quando existe ingresso pago)
    if (precoVenda > 0 && (ingresso.estoque_disponivel === null || ingresso.estoque_disponivel > 0)) {
      menorPreco = Math.min(menorPreco, precoVenda)
    }

    // Procura o lote existente pra PRESERVAR a aprovação do admin quando o robô
    // roda de novo (monitoramento de estoque). Sem isso, re-caçar zeraria a
    // aprovação. O gatilho do banco marca 'esgotado' sozinho quando estoque = 0.
    let existenteId: string | null = null
    let existenteStatus: string | null = null
    if (ingresso.source_ticket_id) {
      const { data } = await supabase.from('event_ticket_lots').select('id,status').eq('evento_id', eventoId).eq('source_ticket_id', ingresso.source_ticket_id).maybeSingle()
      if (data) { existenteId = data.id as string; existenteStatus = data.status as string }
    }
    if (!existenteId) {
      const { data } = await supabase.from('event_ticket_lots').select('id,status').eq('evento_id', eventoId).eq('nome', ingresso.nome).eq('preco_origem', ingresso.preco_origem).maybeSingle()
      if (data) { existenteId = data.id as string; existenteStatus = data.status as string }
    }

    if (existenteId) {
      const patch: Record<string, unknown> = {
        preco_origem: ingresso.preco_origem,
        markup_percent: markup,
        taxa_origem: ingresso.taxa_origem,
        estoque_disponivel: ingresso.estoque_disponivel,
        metadata,
      }
      // se estava esgotado e voltou a ter estoque, reabre a venda
      if (existenteStatus === 'esgotado' && (ingresso.estoque_disponivel === null || ingresso.estoque_disponivel > 0)) {
        patch.status = 'disponivel'
      }
      const { error } = await supabase.from('event_ticket_lots').update(patch).eq('id', existenteId)
      if (!error) salvos++
    } else {
      const { error } = await supabase.from('event_ticket_lots').insert({
        evento_id: eventoId,
        source_ticket_id: ingresso.source_ticket_id,
        nome: ingresso.nome,
        descricao: ingresso.descricao,
        preco_origem: ingresso.preco_origem,
        markup_percent: markup,
        taxa_origem: ingresso.taxa_origem,
        moeda: ingresso.moeda,
        estoque_total: ingresso.estoque_disponivel,
        estoque_disponivel: ingresso.estoque_disponivel,
        status: 'pendente_aprovacao',
        fonte_url: ingresso.fonte_url,
        metadata,
        criado_por: 'robo',
      })
      if (!error) salvos++
    }
  }

  if (salvos > 0) {
    const update: Record<string, unknown> = { ingressos_enabled: true }
    if (Number.isFinite(menorPreco)) update.preco = menorPreco
    await supabase.from('eventos').update(update).eq('id', eventoId)
  }

  return { salvos }
}

async function aplicarCicloDeVidaEventos(supabase: ReturnType<typeof createClient>) {
  const hojeSp = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const amanha = new Date(new Date(`${hojeSp}T00:00:00`).getTime() + 24 * 60 * 60 * 1000)
  const amanhaSp = amanha.toISOString().slice(0, 10)

  const { data: lotesZerados } = await supabase
    .from('event_ticket_lots')
    .update({ status: 'esgotado', updated_at: new Date().toISOString() })
    .in('status', ['disponivel', 'pausado', 'pendente_aprovacao'])
    .not('estoque_disponivel', 'is', null)
    .lte('estoque_disponivel', 0)
    .select('id')

  const { data: lotesPrecoInvalido } = await supabase
    .from('event_ticket_lots')
    .update({ status: 'pausado', updated_at: new Date().toISOString() })
    .in('status', ['disponivel', 'pendente_aprovacao'])
    .or('preco_origem.lte.0,preco_venda.lte.0')
    .select('id')

  const { data: passados } = await supabase
    .from('eventos')
    .update({ status: 'inativo', destaque: false })
    .in('status', ['ativo', 'pendente'])
    .not('data', 'is', null)
    .lt('data', hojeSp)
    .select('id')

  const ids = (passados ?? []).map((e: { id: string }) => e.id)
  let lotesEncerrados = 0
  if (ids.length) {
    const { data } = await supabase
      .from('event_ticket_lots')
      .update({ status: 'esgotado', updated_at: new Date().toISOString() })
      .in('evento_id', ids)
      .in('status', ['disponivel', 'pausado', 'pendente_aprovacao'])
      .select('id')
    lotesEncerrados = data?.length || 0
  }

  const { data: candidatosDestaque } = await supabase
    .from('eventos')
    .select('id,event_ticket_lots(status)')
    .eq('status', 'ativo')
    .gte('data', hojeSp)
    .lte('data', amanhaSp)

  const idsDestaque = (candidatosDestaque ?? [])
    .filter((ev: { event_ticket_lots?: Array<{ status?: string }> }) => {
      const lotes = ev.event_ticket_lots || []
      return lotes.length === 0 || lotes.some(lote => lote.status !== 'esgotado')
    })
    .map((ev: { id: string }) => ev.id)

  if (idsDestaque.length) {
    await supabase
      .from('eventos')
      .update({ destaque: true })
      .in('id', idsDestaque)
  }

  return {
    hoje_sp: hojeSp,
    amanha_sp: amanhaSp,
    eventos_encerrados: ids.length,
    lotes_esgotados: lotesZerados?.length || 0,
    lotes_preco_invalido: lotesPrecoInvalido?.length || 0,
    lotes_encerrados_por_evento: lotesEncerrados,
    eventos_destacados: idsDestaque.length,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = env('SUPABASE_URL')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = env('SUPABASE_ANON_KEY')
  const authHeader = req.headers.get('Authorization') || ''

  if (!supabaseUrl || (!serviceKey && !anonKey)) {
    return json({ error: 'Supabase URL/key nao configurada na funcao.' }, 500)
  }

  const secret = env('CACA_EVENTOS_SECRET')
  const cronOk = !!secret && req.headers.get('x-caca-secret') === secret
  let adminOk = false

  if (!cronOk) {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (token) {
      const authClient = createClient(supabaseUrl, anonKey || serviceKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      })
      const { data: userData } = await authClient.auth.getUser(token)
      const uid = userData?.user?.id
      if (uid) {
        const { data: perfil } = await authClient.from('profiles').select('role,status').eq('id', uid).maybeSingle()
        adminOk = (perfil?.role === 'admin' || perfil?.role === 'sysadmin') && perfil?.status !== 'banido'
      }
    }
  }

  if (!cronOk && !adminOk) return json({ error: 'Nao autorizado.' }, 401)
  if (cronOk && !serviceKey) return json({ error: 'Configure SUPABASE_SERVICE_ROLE_KEY para uso via cron.' }, 500)

  const supabase = createClient(supabaseUrl, serviceKey || anonKey, {
    global: serviceKey ? undefined : { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const brutos: EventoBruto[] = Array.isArray(body.eventos) ? body.eventos as EventoBruto[] : []
    const fontes = body.buscar ? fontesDoPedido(body) : []
    const erros_fontes: Array<{ url: string; erro: string }> = []
    const vistos = new Set<string>()
    const stats: StatsEnriquecimento = {
      candidatos: 0,
      detalhesConsultados: 0,
      detalhesOk: 0,
      detalhesFalhos: 0,
      salvosIncrementais: 0,
      ingressosIncrementais: 0,
      tempoEsgotado: false,
    }
    const ctx = {
      supabase,
      vistos,
      deadlineAt: Date.now() + Math.max(15000, Math.min(240000, number(env('CACA_EVENTOS_DEADLINE_MS')) || 180000)),
      stats,
    }

    for (const fonte of fontes) {
      try {
        brutos.push(...await buscarFonte(fonte, ctx))
      } catch (error) {
        erros_fontes.push({ url: fonte.url, erro: error instanceof Error ? error.message : 'falha desconhecida' })
      }
    }

    const validos = brutos
      .map(ev => normalizar(ev))
      .filter((ev): ev is EventoNormalizado => !!ev)
      .filter(ev => futuroOuSemData(ev) && dentroDePraiaGrande(ev))
      .filter(ev => {
        const key = dedupeKey(ev)
        if (vistos.has(key)) return false
        vistos.add(key)
        return true
      })

    let inseridos = 0
    let ignorados = 0
    let ingressos_salvos = 0

    for (const ev of validos) {
      const { ingressos, ...eventoRow } = ev
      const { data: inserido, error } = await supabase
        .from('eventos')
        .insert(eventoRow)
        .select('id')
        .maybeSingle()

      const eventoId = inserido?.id || await localizarEvento(supabase, ev)

      if (error) {
        ignorados++
      } else {
        inseridos++
      }

      if (eventoId) {
        const { salvos } = await salvarIngressos(supabase, eventoId, ingressos)
        ingressos_salvos += salvos
      }
    }

    // Ciclo automatico: destaca hoje/amanha, encerra passado e esgota lotes.
    const lifecycle = await aplicarCicloDeVidaEventos(supabase)

    return json({
      ok: true,
      version: ROBO_VERSION,
      markup_percent_padrao: markupPercent(),
      recebidos: validos.length + stats.salvosIncrementais,
      inseridos: inseridos + stats.salvosIncrementais,
      ignorados,
      ingressos_salvos: ingressos_salvos + stats.ingressosIncrementais,
      eventos_encerrados: lifecycle.eventos_encerrados,
      lifecycle,
      status: 'pendente',
      fontes_consultadas: fontes.length,
      erros_fontes,
      enriquecimento: stats,
      alvos_sugeridos: ALVOS_SUGERIDOS,
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro no robo de eventos.' }, 500)
  }
})
