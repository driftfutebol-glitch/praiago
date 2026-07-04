import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'

export function markOtaBundleReady() {
  if (!Capacitor.isNativePlatform()) return

  void CapacitorUpdater.notifyAppReady().catch((error) => {
    console.warn('[ota] notifyAppReady failed', error)
  })
}
