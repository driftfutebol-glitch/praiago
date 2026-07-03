import type { CapacitorConfig } from '@capacitor/cli';

const liveReload = process.env.CAPACITOR_LIVE_RELOAD === 'true'

const config: CapacitorConfig = {
  appId: 'com.ferrazcode.praiago.ambulante',
  appName: 'PraiaGo Ambulante',
  webDir: 'dist',
  // DEV: live-reload no emulador (Vite do ambulante na porta 5175).
  // Só entra quando CAPACITOR_LIVE_RELOAD=true — o APK normal usa o build embutido.
  ...(liveReload ? { server: {
    url: 'http://10.0.2.2:5175',
    cleartext: true,
  } } : {}),
};

export default config;
