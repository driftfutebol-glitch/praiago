import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ferrazcode.praiago.ambulante',
  appName: 'PraiaGo Ambulante',
  webDir: 'dist',
  // DEV: live-reload no emulador (Vite do ambulante na porta 5175).
  // Para gerar um APK final/instalável, REMOVA o bloco `server`.
  server: {
    url: 'http://10.0.2.2:5175',
    cleartext: true,
  },
};

export default config;
