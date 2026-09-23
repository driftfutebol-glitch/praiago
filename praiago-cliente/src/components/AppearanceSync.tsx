import { useLayoutEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { usePreferences } from '../store/usePreferences'

// Serializa toques rápidos para a chamada nativa mais antiga não vencer a última.
let statusBarUpdate = Promise.resolve()

/** Uma única assinatura de tema, independente de conta e de navegação. */
export default function AppearanceSync() {
  const darkMode = usePreferences(s => s.darkMode)
  useLayoutEffect(() => {
    const theme = darkMode ? 'dark' : 'light'
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    document.documentElement.style.backgroundColor = darkMode ? '#081e25' : '#f7f8f4'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', darkMode ? '#081e25' : '#f7f8f4')
    if (Capacitor.isNativePlatform()) {
      statusBarUpdate = statusBarUpdate.then(() => StatusBar.setStyle({
        // No Capacitor, Dark é o estilo para fundo escuro (ícones claros).
        style: usePreferences.getState().darkMode ? Style.Dark : Style.Light,
      })).catch(() => { /* O tema web permanece funcional se o plugin não estiver disponível. */ })
    }
  }, [darkMode])
  return null
}
