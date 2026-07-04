import type { CapacitorConfig } from '@capacitor/cli'

const liveReload = process.env.CAPACITOR_LIVE_RELOAD === 'true'
const otaUpdateUrl =
  process.env.CAPACITOR_OTA_UPDATE_URL ??
  'https://kfxpzjqktbcsxlqapkyv.supabase.co/functions/v1/ota-update'

const config: CapacitorConfig = {
  appId: 'com.ferrazcode.praiago.restaurante',
  appName: 'PraiaGo Restaurante',
  webDir: 'dist',
  plugins: {
    CapacitorUpdater: {
      autoUpdate: 'atBackground',
      updateUrl: otaUpdateUrl,
      statsUrl: '',
      channelUrl: '',
      defaultChannel: process.env.CAPACITOR_OTA_CHANNEL ?? 'production',
      appReadyTimeout: 10000,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
    },
  },
  ...(liveReload ? {
    server: {
      url: 'http://10.0.2.2:5176',
      cleartext: true,
    },
  } : {}),
}

export default config
