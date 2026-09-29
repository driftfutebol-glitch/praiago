import { compareVersions, storeUrl, validTarget, type AppSlug, type StorePlatform } from '../supabase/functions/_shared/store-update.ts'

export const noticeEndpoint = 'https://kfxpzjqktbcsxlqapkyv.supabase.co/functions/v1/app-update'
type Notice = { id: string; app: AppSlug; platform: StorePlatform; version: string; message: string; url: string }
type Bridge = { platform(): string; nativeVersion(): Promise<string> }

export function usableNotice(value: unknown, app: AppSlug, platform: StorePlatform, native: string): value is Notice {
  if (!value || typeof value !== 'object') return false
  const n = value as Notice
  return /^[0-9a-f-]{36}$/i.test(n.id) && n.app === app && n.platform === platform
    && compareVersions(n.version, native) === 1 && n.url === storeUrl(app, platform)
    && typeof n.message === 'string' && n.message.length > 0 && n.message.length <= 300
}

/** Optional, native-only notice. Network/bridge/storage errors never block the app. */
export function installStoreUpdateNotice(app: AppSlug, bridge: Bridge) {
  if (!validTarget(app, bridge.platform()) || document.getElementById('praiago-store-notice-host')) return () => {}
  const platform = bridge.platform() as StorePlatform
  const host = document.createElement('div')
  host.id = 'praiago-store-notice-host'
  document.body.append(host)
  const shadow = host.attachShadow({ mode: 'open' })
  let stopped = false, inFlight = false, lastCheck = 0
  let displayedId: string | null = null
  let controller: AbortController | undefined
  const key = (id: string) => `praiago:update-dismiss:${app}:${platform}:${id}`
  function dismissed(id: string) {
    try { return Number(localStorage.getItem(key(id)) || 0) > Date.now() } catch { return false }
  }
  function show(n: Notice) {
    if (displayedId === n.id && shadow.querySelector('section')) return
    displayedId = n.id
    shadow.replaceChildren()
    const style = document.createElement('style')
    style.textContent = `
      :host { color-scheme: light dark; }
      .notice { position:fixed; top:calc(env(safe-area-inset-top,0px) + 8px); left:12px; right:12px;
        max-width:540px; margin:auto; z-index:1100; display:flex; align-items:center; gap:10px;
        padding:12px; border:1px solid #d7e7da; border-radius:18px; box-shadow:0 8px 28px #0002;
        background:#f5fff7; color:#17351e; font:14px/1.4 system-ui,sans-serif; }
      .copy {flex:1; min-width:0} strong {display:block;font-size:15px}
      p {margin:4px 0 0} a {display:inline-flex;align-items:center;min-height:44px;color:#fff;
        background:#137b37;padding:0 12px;border-radius:12px;font-weight:700;text-decoration:none;white-space:nowrap}
      button {border:0;background:transparent;color:inherit;min-width:44px;min-height:44px;font-size:24px;cursor:pointer}
      a:focus-visible,button:focus-visible{outline:3px solid #4799ff;outline-offset:2px}
      @media(prefers-color-scheme:dark){.notice{background:#17271e;color:#ecfff1;border-color:#365940}}
      @media(max-width:370px){.notice{flex-wrap:wrap}a{margin-left:0}.copy{flex-basis:70%}}
    `
    const panel = document.createElement('section')
    panel.className = 'notice'
    panel.setAttribute('role', 'status')
    panel.setAttribute('aria-label', 'Atualização do aplicativo')
    const copy = document.createElement('div'); copy.className = 'copy'
    const title = document.createElement('strong'); title.textContent = `Nova versão ${n.version}`
    const message = document.createElement('p'); message.textContent = n.message
    copy.append(title, message)
    const link = document.createElement('a'); link.href = n.url; link.target = '_blank'; link.rel = 'noopener noreferrer'
    link.textContent = 'Atualizar agora'
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', 'Lembrar amanhã')
    close.onclick = () => {
      try { localStorage.setItem(key(n.id), String(Date.now() + 86400000)) } catch { /* Storage is optional. */ }
      shadow.replaceChildren()
      displayedId = null
    }
    panel.append(copy, link, close); shadow.append(style, panel)
  }
  async function check() {
    if (stopped || inFlight || document.visibilityState === 'hidden' || Date.now() - lastCheck < 300000) return
    inFlight = true; lastCheck = Date.now(); controller = new AbortController()
    const timeout = window.setTimeout(() => controller?.abort(), 10000)
    try {
      const native = await bridge.nativeVersion()
      if (compareVersions(native, native) === null || stopped) return
      const query = new URLSearchParams({ app, platform, native })
      const response = await fetch(`${noticeEndpoint}?${query}`, { signal: controller.signal, cache: 'no-store' })
      if (!response.ok) return
      const result = await response.json()
      if (stopped) return
      if (usableNotice(result.notice, app, platform, native) && !dismissed(result.notice.id)) show(result.notice)
      else { shadow.replaceChildren(); displayedId = null } // Admin pause: remove on next successful check.
    } catch { /* Fail open: never interrupt login, payments or deliveries. */ }
    finally { window.clearTimeout(timeout); inFlight = false }
  }
  const onVisibility = () => { if (document.visibilityState === 'visible') void check() }
  document.addEventListener('visibilitychange', onVisibility)
  const timer = window.setInterval(() => { void check() }, 300000)
  void check()
  return () => {
    stopped = true; controller?.abort(); window.clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibility); host.remove()
  }
}
