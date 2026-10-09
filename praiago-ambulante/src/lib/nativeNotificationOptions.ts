import { Capacitor, registerPlugin } from '@capacitor/core'
interface NativeNotificationOptions {
  openSettings(): Promise<void>
  previewSound(): Promise<void>
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
