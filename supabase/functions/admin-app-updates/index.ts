import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { corsHeaders, json, readJson } from '../_shared/cors.ts'
import { compareVersions, stores, storeUrl, validTarget, type StorePlatform } from '../_shared/store-update.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, { status: 405 })
  const token = req.headers.get('Authorization') || ''
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const actorClient = createClient(url, anon, { global: { headers: { Authorization: token } }, auth: { persistSession: false } })
  const { data: auth, error: authError } = await actorClient.auth.getUser(token.replace(/^Bearer\s+/i, ''))
  if (authError || !auth.user) return json({ error: 'Entre no painel.' }, { status: 401 })
  const { data: allowed, error: guardError } = await actorClient.rpc('app_updates_owner')
  if (guardError || allowed !== true) return json({ error: 'Apenas o dono pode verificar atualizacoes.' }, { status: 403 })
  try {
    const body = await readJson<{ id?: string; confirmed?: boolean; evidence?: string }>(req)
    if (!body.id || !/^[0-9a-f-]{36}$/i.test(body.id)) return json({ error: 'Aviso invalido.' }, { status: 400 })
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const { data: notice, error } = await service.from('app_update_notices').select('id,app,platform,version,status').eq('id', body.id).single()
    if (error || !notice || !validTarget(notice.app, notice.platform)) return json({ error: 'Aviso nao encontrado.' }, { status: 404 })
    let evidence: Record<string, unknown>, method: string
    if (notice.platform === 'ios') {
      const expected = stores[notice.app]
      const apple = await fetch(`https://itunes.apple.com/lookup?id=${expected.apple}&country=br`, { signal: AbortSignal.timeout(10000) })
      if (!apple.ok) throw new Error('A consulta da Apple esta indisponivel. Tente novamente.')
      const lookup = await apple.json()
      const published = lookup.results?.find((x: { trackId: number; bundleId: string }) => x.trackId === expected.apple && x.bundleId === expected.bundle)
      if (!published || compareVersions(published.version, notice.version) !== 0) throw new Error('Essa versao ainda nao consta na App Store brasileira. O aviso continua inativo.')
      if (!Number.isFinite(Date.parse(published.currentVersionReleaseDate)) || Date.parse(published.currentVersionReleaseDate) > Date.now()) throw new Error('A data de publicacao da Apple ainda nao permite liberar o aviso.')
      evidence = { version: notice.version, store_version: published.version, method: 'apple_lookup', country: 'br', release_date: published.currentVersionReleaseDate, url: storeUrl(notice.app, 'ios') }
      method = 'apple_lookup'
    } else {
      const reference = String(body.evidence || '').trim()
      if (body.confirmed !== true || reference.length < 10 || reference.length > 1000) throw new Error('Confirme a publicacao em Producao no Play Console e informe a referencia da release.')
      evidence = { version: notice.version, method: 'play_console_manual', reference, declaration: 'Publicada em Producao e disponivel aos usuarios no Brasil', url: storeUrl(notice.app, notice.platform as StorePlatform) }
      method = 'play_console_manual'
    }
    const { error: saveError } = await service.rpc('record_app_update_verification', { p_id: notice.id, p_actor: auth.user.id, p_method: method, p_evidence: evidence })
    if (saveError) throw new Error(saveError.message)
    return json({ ok: true, method, evidence })
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Falha na verificacao.' }, { status: 400 }) }
})
