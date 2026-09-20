import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Preferences = {
  reducedMotion: boolean
  notificationSounds: boolean
  mapStyle: 'praia' | 'ruas'
  setReducedMotion: (value: boolean) => void
  setNotificationSounds: (value: boolean) => void
  setMapStyle: (value: 'praia' | 'ruas') => void
}

/** Preferências deste aparelho, sem informações de conta ou localização. */
export const usePreferences = create<Preferences>()(persist(set => ({
  reducedMotion: false,
  notificationSounds: true,
  mapStyle: 'praia',
  setReducedMotion: reducedMotion => set({ reducedMotion }),
  setNotificationSounds: notificationSounds => set({ notificationSounds }),
  setMapStyle: mapStyle => set({ mapStyle }),
}), { name: 'praiago-cliente-preferences', version: 1 }))
