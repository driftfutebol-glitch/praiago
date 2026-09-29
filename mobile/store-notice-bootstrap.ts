import { installStoreUpdateNotice } from './store-update-notice.ts'
import type { AppSlug } from '../supabase/functions/_shared/store-update.ts'

declare const PRAIAGO_NOTICE_APP: AppSlug
type ExistingBridge = {
  getPlatform?(): string
  Plugins?: { CapacitorUpdater?: { current(): Promise<{ native: string }> } }
}
const capacitor = (window as Window & { Capacitor?: ExistingBridge }).Capacitor
let attempts = 0
function start() {
  // The original bundle registers the already-installed updater plugin. No new native plugin.
  const updater = capacitor?.Plugins?.CapacitorUpdater
  if (!updater) { if (++attempts < 30) window.setTimeout(start, 1000); return }
  installStoreUpdateNotice(PRAIAGO_NOTICE_APP, {
    platform: () => capacitor?.getPlatform?.() || 'web',
    nativeVersion: async () => (await updater.current()).native,
  })
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
else start()
