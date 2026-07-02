import type { CapacitorConfig } from '@capacitor/cli';

const liveReload = process.env.CAPACITOR_LIVE_RELOAD === 'true'

const config: CapacitorConfig = {
  appId: 'com.ferrazcode.praiago.cliente',
  appName: 'PraiaGo Cliente',
  webDir: 'dist',
  // DEV: live-reload no emulador. 10.0.2.2 = "localhost" do PC visto de dentro do
  // emulador Android. Aponta o WebView pro dev server do Vite (porta 5173), então
  // toda alteração no código recarrega sozinha no celular virtual.
  // Para gerar um APK final/instalável de verdade, REMOVA o bloco `server`.
  ...(liveReload ? { server: {
    url: 'http://10.0.2.2:5173',
    cleartext: true,
  } } : {}),
};

export default config;
