import { expect, it, vi } from 'vitest'

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))

it('aplica o tema antes de renderizar e persiste somente a preferência', async () => {
  vi.resetModules()
  const { initializeTheme, useTheme } = await import('../../praiago-ambulante/src/lib/theme')
  initializeTheme()
  expect(document.documentElement.dataset.theme).toBe('light')
  useTheme.getState().setDarkMode(true)
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(document.documentElement.style.colorScheme).toBe('dark')
  expect(JSON.parse(localStorage.getItem('praiago-ambulante-theme')!).state).toEqual({ darkMode: true })
  await useTheme.persist.rehydrate()
  expect(useTheme.getState().darkMode).toBe(true)
  useTheme.getState().setDarkMode(false)
  expect(document.documentElement.dataset.theme).toBe('light')
})

it('recusa preferência corrompida sem habilitar um valor não booleano', async () => {
  localStorage.setItem('praiago-ambulante-theme', JSON.stringify({ state: { darkMode: 'false', arbitrary: true }, version: 1 }))
  vi.resetModules()
  const { useTheme } = await import('../../praiago-ambulante/src/lib/theme')
  expect(useTheme.getState().darkMode).toBe(false)
})
