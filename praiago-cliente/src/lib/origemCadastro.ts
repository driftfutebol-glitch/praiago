import { Capacitor } from '@capacitor/core'

// De qual app e de qual aparelho saiu este cadastro.
//
// Vai junto no corpo da edge function 'cadastro', que grava em signup_ips. Sem
// isto o painel so tinha o IP e um `is_mobile` que fala da OPERADORA — iPhone
// no Wi-Fi de casa contava como "nao movel". A pergunta que o admin faz de
// verdade e "quantos entraram de iPhone esta semana", e ela nao tinha resposta.
//
// `Capacitor.getPlatform()` e JavaScript puro do @capacitor/core: entra por OTA,
// sem build nova na loja. Um plugin nativo como @capacitor/device daria o modelo
// exato, mas exigiria passar pela Apple de novo so para contar aparelho — por
// isso o modelo aqui e um palpite do user-agent, e a plataforma e que e certa.
export function origemDoCadastro() {
  const plataforma = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web'
  return { app: 'cliente', plataforma, modelo: modeloAproximado() }
}

function modeloAproximado(): string | null {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (!ua) return null
  // Android carrega o modelo no proprio user-agent: "... Android 14; SM-A536E)".
  const android = ua.match(/Android[^;)]*;\s*([^;)]+)/)
  if (android) return android[1].trim().slice(0, 60) || null
  if (/\biPad\b/.test(ua)) return 'iPad'
  if (/\biPhone\b/.test(ua)) return 'iPhone'
  return null
}
