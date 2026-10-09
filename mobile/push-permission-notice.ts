type Permission = { receive: string }
export type PermissionBridge = {
  platform(): string
  nativeVersion(): Promise<string>
  available(): boolean
  checkPermissions(): Promise<Permission>
  requestPermissions(): Promise<Permission>
}

/** Permission only. Never register FCM on the historical APKs without Firebase configuration. */
export function installPushPermissionNotice(app: 'cliente'|'ambulante', bridge: PermissionBridge) {
  const target = app === 'cliente' ? '1.0.9' : '1.0.4'
  const hostId = 'praiago-push-permission-host'
  const key = `praiago:push-permission-dismiss:${app}:${target}`
  let stopped = false, busy = false
  let host: HTMLDivElement | undefined
  const dismissed = () => {
    try { return Number(localStorage.getItem(key) || 0) > Date.now() } catch { return false }
  }
  async function start() {
    try {
      if (bridge.platform() !== 'android' || !bridge.available() || document.getElementById(hostId) || dismissed()) return
      if ((await bridge.nativeVersion()).trim() !== target || stopped) return
      const permission = await bridge.checkPermissions()
      if (stopped || permission.receive === 'granted' || document.getElementById(hostId)) return
      // Unexpected bridge results fail open, without interrupting the existing application.
      if (!['prompt','prompt-with-rationale','denied'].includes(permission.receive)) return
      host = document.createElement('div'); host.id = hostId
      document.body.append(host)
      const shadow = host.attachShadow({mode:'open'})
      const style = document.createElement('style')
      style.textContent = `
        :host{color-scheme:light dark}
        section{position:fixed;bottom:calc(env(safe-area-inset-bottom,0px) + 82px);left:12px;right:12px;
          max-width:520px;margin:auto;padding:16px;border:1px solid #b7d9e6;border-radius:18px;
          background:#f2fbff;color:#153343;box-shadow:0 8px 30px #0003;z-index:1090;font:14px/1.5 system-ui,sans-serif}
        strong{display:block;font-size:16px}p{margin:8px 0 12px}nav{display:flex;gap:8px;flex-wrap:wrap}
        button{min-height:44px;padding:10px 14px;border-radius:12px;border:1px solid #52798b;
          background:transparent;color:inherit;font:inherit;cursor:pointer}
        .primary{background:#006580;color:white;border-color:#006580;font-weight:700}
        button:disabled{opacity:.65;cursor:wait}button:focus-visible{outline:3px solid #438dff;outline-offset:2px}
        @media(prefers-color-scheme:dark){section{background:#142c38;color:#ecfaff;border-color:#426879}.primary{background:#087c97}}
      `
      const panel = document.createElement('section'); panel.setAttribute('aria-label','Permissão de notificações')
      const title = document.createElement('strong'); title.textContent = 'Prepare os avisos de pedidos'
      const copy = document.createElement('p'); copy.setAttribute('role','status')
      copy.textContent = 'Autorize as notificações no Android. O recebimento dos avisos será liberado na atualização com a integração completa; autorizar agora não ativa o envio.'
      const nav = document.createElement('nav')
      const allow = document.createElement('button'); allow.type = 'button'; allow.className = 'primary'; allow.textContent = 'Permitir notificações'
      const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Agora não'
      close.onclick = () => {
        try { localStorage.setItem(key,String(Date.now()+86400000)) } catch { /* Optional storage. */ }
        host?.remove()
      }
      allow.onclick = async () => {
        if (busy || stopped) return
        busy = true; allow.disabled = true
        try {
          const result = await bridge.requestPermissions()
          if (stopped) return
          if (result.receive === 'granted') {
            copy.textContent = 'Permissão autorizada. Os avisos de pedidos ainda dependem da próxima versão do app e da liberação do serviço.'
            allow.remove(); close.textContent = 'Entendi'
          } else {
            copy.textContent = 'Permissão não autorizada. Se o Android não mostrar a pergunta novamente, você pode permitir as notificações nas configurações do celular. O app continua funcionando.'
          }
        } catch {
          if (!stopped) copy.textContent = 'Não foi possível abrir a permissão. O aplicativo continua funcionando normalmente; tente novamente depois.'
        } finally { busy = false; allow.disabled = false }
      }
      nav.append(allow,close); panel.append(title,copy,nav); shadow.append(style,panel)
    } catch { /* Missing native bridge/configuration must not break login, cart or orders. */ }
  }
  void start()
  return () => { stopped = true; host?.remove() }
}
