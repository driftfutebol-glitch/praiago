import { Capacitor } from '@capacitor/core'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

type ThemePreference = {
  darkMode: boolean
  setDarkMode: (value: boolean) => void
}

const storage = createJSONStorage(() => ({
  getItem: (key: string) => { try { return localStorage.getItem(key) } catch { return null } },
  setItem: (key: string, value: string) => { try { localStorage.setItem(key, value) } catch { /* A preferência funciona nesta sessão. */ } },
  removeItem: (key: string) => { try { localStorage.removeItem(key) } catch { /* Armazenamento indisponível. */ } },
}))

/** Preferência do aparelho, separada da conta e do app Cliente. */
export const useTheme = create<ThemePreference>()(persist(set => ({
  darkMode: false,
  setDarkMode: darkMode => set({ darkMode }),
}), {
  name: 'praiago-ambulante-theme', version: 1, storage,
  partialize: ({ darkMode }) => ({ darkMode }),
  merge: (saved, current) => ({
    ...current,
    darkMode: saved && typeof saved === 'object' && 'darkMode' in saved && typeof saved.darkMode === 'boolean'
      ? saved.darkMode : current.darkMode,
  }),
}))

function applyTheme(darkMode: boolean) {
  document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
  document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', darkMode ? '#11232d' : '#ffffff')
  if (Capacitor.isNativePlatform()) {
    // O plugin já faz parte do app; não altera permissões nem o pacote nativo.
    void import('@capacitor/status-bar').then(async ({ StatusBar, Style }) => {
      await StatusBar.setStyle({ style: darkMode ? Style.Light : Style.Dark })
      await StatusBar.setBackgroundColor({ color: darkMode ? '#11232d' : '#ffffff' })
    }).catch(() => { /* O navegador e plataformas sem barra nativa usam o CSS. */ })
  }
}

/** Aplica antes de montar o React para não trocar de tema depois do primeiro render. */
export function initializeTheme() {
  applyTheme(useTheme.getState().darkMode)
  useTheme.subscribe((current, previous) => {
    if (current.darkMode !== previous.darkMode) applyTheme(current.darkMode)
  })
  window.addEventListener('storage', event => {
    if (event.key === 'praiago-ambulante-theme' || event.key === null) void useTheme.persist.rehydrate()
  })
}
