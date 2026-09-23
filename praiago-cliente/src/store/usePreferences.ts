import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

type Preferences = {
  darkMode: boolean
  reducedMotion: boolean
  notificationSounds: boolean
  mapStyle: 'praia' | 'ruas'
  setReducedMotion: (value: boolean) => void
  setNotificationSounds: (value: boolean) => void
  setMapStyle: (value: 'praia' | 'ruas') => void
  setDarkMode: (value: boolean) => void
}

// A escolha continua funcionando nesta sessão se o aparelho negar armazenamento.
const storage = createJSONStorage(() => ({
  getItem: (name: string) => { try { return localStorage.getItem(name) } catch { return null } },
  setItem: (name: string, value: string) => { try { localStorage.setItem(name, value) } catch { /* armazenamento indisponível */ } },
  removeItem: (name: string) => { try { localStorage.removeItem(name) } catch { /* armazenamento indisponível */ } },
}))

/** Preferências deste aparelho, sem informações de conta ou localização. */
export const usePreferences = create<Preferences>()(persist(set => ({
  darkMode: false,
  reducedMotion: false,
  notificationSounds: true,
  mapStyle: 'praia',
  setReducedMotion: reducedMotion => set({ reducedMotion }),
  setNotificationSounds: notificationSounds => set({ notificationSounds }),
  setMapStyle: mapStyle => set({ mapStyle }),
  setDarkMode: darkMode => set({ darkMode }),
}), {
  name: 'praiago-cliente-preferences', version: 1, storage,
  partialize: ({ darkMode, reducedMotion, notificationSounds, mapStyle }) => ({ darkMode, reducedMotion, notificationSounds, mapStyle }),
  merge: (persisted, current) => {
    const saved = (persisted && typeof persisted === 'object' ? persisted : {}) as Partial<Preferences>
    return {
      ...current,
      darkMode: typeof saved.darkMode === 'boolean' ? saved.darkMode : current.darkMode,
      reducedMotion: typeof saved.reducedMotion === 'boolean' ? saved.reducedMotion : current.reducedMotion,
      notificationSounds: typeof saved.notificationSounds === 'boolean' ? saved.notificationSounds : current.notificationSounds,
      mapStyle: saved.mapStyle === 'praia' || saved.mapStyle === 'ruas' ? saved.mapStyle : current.mapStyle,
    }
  },
}))
