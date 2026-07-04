import type { CapacitorConfig } from '@capacitor/cli';

const liveReload = process.env.CAPACITOR_LIVE_RELOAD === 'true'
const otaUpdateUrl =
  process.env.CAPACITOR_OTA_UPDATE_URL ??
  'https://kfxpzjqktbcsxlqapkyv.supabase.co/functions/v1/ota-update'

const config: CapacitorConfig = {
  appId: 'com.ferrazcode.praiago.cliente',
  appName: 'PraiaGo Cliente',
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
  // DEV: live-reload no emulador. 10.0.2.2 = "localhost" do PC visto de dentro do
  // emulador Android. Aponta o WebView pro dev server do Vite (porta 5173), entÃ£o
  // toda alteraÃ§Ã£o no cÃ³digo recarrega sozinha no celular virtual.
  // Para gerar um APK final/instalÃ¡vel de verdade, REMOVA o bloco `server`.
  ...(liveReload ? { server: {
    url: 'http://10.0.2.2:5173',
    cleartext: true,
  } } : {}),
};

export default config;
