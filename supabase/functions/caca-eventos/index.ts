// Robo caca-eventos do PraiaGo.
// Coleta eventos de fontes configuradas, normaliza e salva como PENDENTE.
// O admin aprova antes de aparecer para clientes.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-caca-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const ALVOS_SUGERIDOS = [
  { nome: 'Rocket Blue', foco: 'balada, shows, madrugada, ingressos' },
  { nome: 'Blue House', foco: 'balada, noite, madrugada, ingressos' },
  { nome: 'PIG / pubs e bares', foco: 'shows, noite, comida, ingressos' },
  { nome: 'Vila Junina / festas sazonais', foco: 'familia, comida, tarde, noite' },
  { nome: 'Agenda cultural Praia Grande', foco: 'eventos publicos, esportes, shows' },
]

type Periodo = 'manha' | 'tarde' | 'noite' | 'madrugada'

type EventoBruto = {
  titulo?: string
  title?: string
  name?: string
  descricao?: string
  description?: string
  descricao_curta?: string
  data?: string
  date?: string
  startDate?: string
  hora?: string
  local_nome?: string
  venue?: string
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
  fonte_url?: string
  periodo?: string
}

type Fonte = {
  url: string
  nome?: string
  categoria?: string
  local_nome?: string
}

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

function resumo(texto?: string): string | null {
  if (!texto) return null
  const limpo = texto.replace(/\s+/g, ' ').trim()
  if (!limpo) return null
  return limpo.length > 180 ? `${limpo.slice(0, 177)}...` : limpo
}

function splitDataHora(value?: string) {
  if (!value) return { data: null as string | null, hora: null as string | null }
  const raw = value.trim()
  const dataMatch = raw.match(/(\d{4}-\d{2}-\d{2})/)
  const brMatch = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  const horaMatch = raw.match(/(\d{1,2}):(\d{2})/)
  const data = dataMatch ? dataMatch[1] : brMatch ? `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}` : null
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
  const key = valor.normalize('NFD').replace(/\p{Diacritic}/gu, '').slice(0, 3).toLowerCase()
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
  const dataHora = splitDataHora(text(e.startDate, e.data, e.date))
  const hora = text(e.hora) || dataHora.hora
  const categoria = text(e.categoria, e.genre, fonte?.categoria, 'Evento')
  const titulo = text(e.titulo, e.title, e.name)
  if (titulo.length < 3) return null

  return {
    titulo,
    descricao_curta: resumo(text(e.descricao_curta, e.descricao, e.description)),
    periodo: periodoPelaHora(hora, e.periodo),
    data: dataHora.data,
    hora: hora || null,
    local_nome: text(e.local_nome, e.venue, fonte?.local_nome, fonte?.nome) || null,
    endereco: text(e.endereco, e.address) || null,
    lat: number(e.lat, e.latitude),
    lng: number(e.lng, e.longitude),
    preco: number(e.preco, e.price) || 0,
    categoria,
    emoji: text(e.emoji) || emojiPorCategoria(categoria),
    fonte: 'robo',
    fonte_url: text(e.fonte_url, e.url, fonte?.url) || null,
    destaque: false,
    status: 'pendente',
  }
}

function futuroOuSemData(ev: EventoNormalizado) {
  if (!ev.data) return true
  const agoraSp = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const hora = ev.hora && /^\d{2}:\d{2}/.test(ev.hora) ? ev.hora : '23:59'
  const data = new Date(`${ev.data}T${hora}:00`)
  return Number.isNaN(data.getTime()) || data >= agoraSp
}

function dentroDePraiaGrande(ev: EventoNormalizado) {
  const blob = `${ev.local_nome || ''} ${ev.endereco || ''} ${ev.descricao_curta || ''} ${ev.fonte_url || ''}`.toLowerCase()
  if (!blob) return false
  if (blob.includes('praia grande')) return true
  if (/\b(pg|boqueirao|canto do forte|guilhermina|aviacao|tupi|ocian|caicara|solemar)\b/.test(blob)) return true
  if (/(rocket beach|rocket sea|blue house|casa do pig|porks praia grande|marechal mallet)/.test(blob)) return true
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
  for (const fonte of [...envFontes, ...bodyFontes]) map.set(fonte.url, fonte)
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
  const pareceEvento = type.includes('event') || !!text(obj.titulo, obj.title, obj.name) && !!text(obj.startDate, obj.data, obj.date, obj.hora)
  if (pareceEvento) out.push(obj)

  for (const key of ['eventos', 'events', 'items', 'data', 'results', '@graph']) {
    if (key in obj) objetosDeEvento(obj[key], out, depth + 1)
  }

  return out
}

function brutoDeObjeto(obj: Record<string, unknown>, fonte: Fonte): EventoBruto {
  const location = asRecord(obj.location)
  const geo = asRecord(location?.geo)
  const address = asRecord(location?.address)
  const offers = Array.isArray(obj.offers) ? asRecord(obj.offers[0]) : asRecord(obj.offers)

  return {
    titulo: text(obj.titulo, obj.title, obj.name),
    descricao: text(obj.descricao, obj.description),
    data: text(obj.data, obj.date, obj.startDate),
    startDate: text(obj.startDate),
    hora: text(obj.hora),
    local_nome: text(obj.local_nome, obj.venue, location?.name, fonte.local_nome, fonte.nome),
    endereco: text(obj.endereco, obj.address, address?.streetAddress, address?.addressLocality),
    lat: number(obj.lat, obj.latitude, geo?.latitude),
    lng: number(obj.lng, obj.longitude, geo?.longitude),
    preco: number(obj.preco, obj.price, offers?.price) || undefined,
    categoria: text(obj.categoria, obj.category, obj.genre, fonte.categoria),
    emoji: text(obj.emoji),
    url: text(obj.url, offers?.url, fonte.url),
    fonte_url: text(obj.fonte_url, obj.url, offers?.url, fonte.url),
    periodo: text(obj.periodo),
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
      fonte_url: href,
      url: href,
      emoji: '🎫',
    })
  }

  return eventos
}

function extrairJson(payload: unknown, fonte: Fonte) {
  return objetosDeEvento(payload).map(obj => brutoDeObjeto(obj, fonte))
}

async function buscarFonte(fonte: Fonte) {
  const res = await fetch(fonte.url, {
    headers: {
      Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
      'User-Agent': 'PraiaGoCacaEventos/1.0',
    },
  })
  if (!res.ok) throw new Error(`Fonte ${fonte.url} respondeu ${res.status}`)

  const contentType = res.headers.get('content-type') || ''
  const body = await res.text()

  if (contentType.includes('json') || body.trim().startsWith('{') || body.trim().startsWith('[')) {
    return extrairJson(JSON.parse(body), fonte)
  }

  return [...extrairJsonLd(body, fonte), ...extrairCardsArticket(body, fonte)]
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

    for (const fonte of fontes) {
      try {
        brutos.push(...await buscarFonte(fonte))
      } catch (error) {
        erros_fontes.push({ url: fonte.url, erro: error instanceof Error ? error.message : 'falha desconhecida' })
      }
    }

    const vistos = new Set<string>()
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

    for (const ev of validos) {
      const { error } = await supabase.from('eventos').insert(ev)
      if (error) {
        ignorados++
      } else {
        inseridos++
      }
    }

    return json({
      ok: true,
      recebidos: validos.length,
      inseridos,
      ignorados,
      status: 'pendente',
      fontes_consultadas: fontes.length,
      erros_fontes,
      alvos_sugeridos: ALVOS_SUGERIDOS,
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro no robo de eventos.' }, 500)
  }
})
