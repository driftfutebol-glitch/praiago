import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { corsHeaders, json } from '../_shared/cors.ts'
import { compareVersions, validTarget, storeUrl, type StorePlatform } from '../_shared/store-update.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const respond = (body: unknown, status = 200) => json(body, { status, headers: { 'Cache-Control': 'no-store' } })
  if (req.method !== 'GET') return respond({ error: 'method_not_allowed' }, 405)
  const query = new URL(req.url).searchParams
  const app = query.get('app'), platform = query.get('platform'), native = query.get('native')
  if (!validTarget(app, platform) || compareVersions(native, native) === null) return respond({ notice: null })
  try {
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const { data, error } = await client.from('app_update_notices').select('id,version,message')
      .eq('app', app).eq('platform', platform).eq('status', 'approved').maybeSingle()
    if (error) return respond({ notice: null }, 503)
    if (!data || compareVersions(data.version, native) !== 1) return respond({ notice: null })
    return respond({ notice: { ...data, app, platform, url: storeUrl(app, platform as StorePlatform) } })
  } catch { return respond({ notice: null }, 503) }
})
