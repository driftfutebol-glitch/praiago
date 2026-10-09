import { Capacitor, registerPlugin } from '@capacitor/core'
interface NativeNotificationOptions {
  openSettings(): Promise<void>
  previewSound(): Promise<void>
  capabilities(): Promise<{orderProgressV1:boolean}>
}
const options = registerPlugin<NativeNotificationOptions>('PraiaGoNotifications')
export function hasNotificationOptions() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('PraiaGoNotifications')
}
export async function openNotificationSettings() {
  if (!hasNotificationOptions()) throw new Error('Instale a nova versão da Play Store para abrir as configurações por aqui.')
  await options.openSettings()
}
export async function previewNotificationSound() {
  if (!hasNotificationOptions()) throw new Error('O som PraiaGo estará disponível na nova versão da Play Store.')
  await options.previewSound()
}
export async function supportsOrderProgress() {
  if (!hasNotificationOptions()) return false
  try { return (await options.capabilities()).orderProgressV1 === true }
  catch { return false } // An older native build may have received newer web code over OTA.
}
