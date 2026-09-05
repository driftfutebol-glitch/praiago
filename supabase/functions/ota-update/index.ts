import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { corsHeaders, json, readJson } from '../_shared/cors.ts'

type UpdateRequest = {
  app_id?: string
  platform?: string
  version_name?: string
  version_build?: string
  version_code?: string
  defaultChannel?: string
}

type OtaRelease = {
  app_id: string
  platform: string
  channel: string
  version: string
  bundle_url: string
  checksum: string | null
  min_native_version: string | null
  notes: string | null
  created_at: string
}

function env(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} nao configurado.`)
  return value
}

function serviceClient() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })
}

function normalizePlatform(platform?: string) {
  const value = String(platform || '').toLowerCase()
  if (value === 'ios') return 'ios'
  if (value === 'android') return 'android'
  return 'all'
}

function getChannel(req: Request, body: UpdateRequest) {
  const url = new URL(req.url)
  return url.searchParams.get('channel') || body.defaultChannel || 'production'
}

function upToDate(version?: string) {
  return json({
    kind: 'up_to_date',
    error: 'no_new_version_available',
    message: 'No new version available',
    version: version || '',
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ kind: 'failed', error: 'method_not_allowed', message: 'Metodo nao permitido.' }, { status: 405 })
  }

  try {
    const body = await readJson<UpdateRequest>(req)
    const appId = String(body.app_id || '').trim()
    const platform = normalizePlatform(body.platform)
    const channel = getChannel(req, body)
    const currentVersion = String(body.version_name || '').trim()

    if (!appId) return upToDate(currentVersion)

    const { data, error } = await serviceClient()
      .from('ota_releases')
      .select('app_id,platform,channel,version,bundle_url,checksum,min_native_version,notes,created_at')
      .eq('app_id', appId)
      .eq('channel', channel)
      .eq('enabled', true)
      .in('platform', ['all', platform])
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) throw error

    const release = (data?.[0] ?? null) as OtaRelease | null

    // Registro de quem perguntou. Existe porque "publiquei" contra "nao chegou"
    // nao tinha arbitro: sem isto nao da para saber se o aparelho sequer chega a
    // perguntar. Um iPhone que nunca aparece aqui tem problema no binario; um
    // que aparece e continua na versao velha tem problema em baixar ou aplicar.
    //
    // Nunca derruba a resposta: se o registro falhar, a atualizacao segue.
    const registrar = (servida: string, resposta: string) =>
      serviceClient()
        .from('ota_checagens')
        .insert({
          app_id: appId,
          platform,
          versao_informada: currentVersion || '(vazio)',
          versao_servida: servida,
          resposta,
          user_agent: req.headers.get('user-agent'),
          ip: (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null,
        })
        .then(() => {}, () => {})

    if (!release || release.version === currentVersion) {
      void registrar(currentVersion, release ? 'ja_atualizado' : 'sem_release')
      return upToDate(currentVersion)
    }

    void registrar(release.version, 'ofereceu_atualizacao')

    return json({
      version: release.version,
      old: currentVersion,
      url: release.bundle_url,
      checksum: release.checksum || '',
      breaking: false,
      message: release.notes || 'Atualizacao PraiaGo disponivel.',
      comment: release.notes || undefined,
    })
  } catch (error) {
    return json({
      kind: 'failed',
      error: 'ota_update_error',
      message: error instanceof Error ? error.message : 'Erro ao verificar atualizacao.',
    }, { status: 500 })
  }
})
