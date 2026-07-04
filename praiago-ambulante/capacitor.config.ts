import type { CapacitorConfig } from '@capacitor/cli';

const liveReload = process.env.CAPACITOR_LIVE_RELOAD === 'true'
const otaUpdateUrl =
  process.env.CAPACITOR_OTA_UPDATE_URL ??
  'https://kfxpzjqktbcsxlqapkyv.supabase.co/functions/v1/ota-update'

const config: CapacitorConfig = {
  appId: 'com.ferrazcode.praiago.ambulante',
  appName: 'PraiaGo Ambulante',
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
  // DEV: live-reload no emulador (Vite do ambulante na porta 5175).
  // SÃ³ entra quando CAPACITOR_LIVE_RELOAD=true â€” o APK normal usa o build embutido.
  ...(liveReload ? { server: {
    url: 'http://10.0.2.2:5175',
    cleartext: true,
  } } : {}),
};

export default config;
