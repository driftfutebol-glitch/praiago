import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import { usePreferences } from '../src/store/usePreferences'
const native = vi.hoisted(() => ({ enabled: false, setStyle: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.enabled } }))
vi.mock('@capacitor/status-bar', () => ({ StatusBar: { setStyle: native.setStyle }, Style: { Dark: 'DARK', Light: 'LIGHT' } }))
import AppearanceSync from '../src/components/AppearanceSync'

const key = 'praiago-cliente-preferences'
const bootstrap = readFileSync('public/theme-init.js', 'utf8')
beforeEach(() => {
  native.enabled = false
  native.setStyle.mockReset().mockResolvedValue(undefined)
  usePreferences.setState({ darkMode: false, reducedMotion: false, notificationSounds: true, mapStyle: 'praia' })
})
afterEach(() => vi.restoreAllMocks())

describe('Tema salvo neste aparelho', () => {
  it('mantém contraste mínimo nos textos e botões principais de ambos os temas', () => {
    const css = readFileSync('src/refresh.css', 'utf8')
    const luminance = (hex: string) => {
      const rgb = hex.match(/[a-f\d]{2}/gi)!.map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
    }
    for (const selector of [':root', 'html[data-theme="dark"]']) {
      const block = css.slice(css.indexOf(selector)).split('}')[0]
      const tokens = Object.fromEntries([...block.matchAll(/--pg-([\w-]+):\s*(#[a-f\d]{6})/gi)].map(match => [match[1], match[2]]))
      for (const [fg, bg] of [['ink','surface'], ['muted','surface'], ['muted','surface-alt'], ['ink','input'], ['action-ink','action'], ['success','success-bg'], ['danger','danger-bg'], ['warning','warning-bg']]) {
        const a = luminance(tokens[fg]), b = luminance(tokens[bg])
        expect((Math.max(a,b) + .05) / (Math.min(a,b) + .05), `${selector}: ${fg}/${bg}`).toBeGreaterThanOrEqual(4.5)
      }
      const gradient = block.match(/--pg-brand-gradient:([^;]+);/)![1]
      for (const stop of gradient.match(/#[a-f\d]{6}/gi)!) {
        const a = luminance(tokens['on-brand']), b = luminance(stop)
        expect((Math.max(a,b) + .05) / (Math.min(a,b) + .05), `${selector}: on-brand/${stop}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
  it('mantém transparência nos recortes das categorias, sem placas brancas', () => {
    for (const file of ['categorias-comida-v2.webp', 'bebidas-alcoolicas-v2.webp']) {
      const bytes = readFileSync(`public/images/${file}`)
      expect(bytes.toString('ascii', 0, 4), file).toBe('RIFF')
      expect(bytes.toString('ascii', 8, 16), file).toBe('WEBPVP8X')
      // O bit 4 do cabeçalho WebP estendido anuncia o canal alpha.
      expect(bytes[20] & 0x10, file).toBe(0x10)
    }
  })
  it('recupera modo escuro após reidratar e persiste apenas preferências', async () => {
    usePreferences.getState().setDarkMode(true)
    const saved = localStorage.getItem(key)!
    expect(Object.keys(JSON.parse(saved).state).sort()).toEqual(['darkMode', 'mapStyle', 'notificationSounds', 'reducedMotion'])
    usePreferences.setState({ darkMode: false })
    localStorage.setItem(key, saved)
    await usePreferences.persist.rehydrate()
    render(<AppearanceSync/>)
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
  it('preserva preferências antigas sem exigir recadastro', async () => {
    localStorage.setItem(key, JSON.stringify({ version: 1, state: { reducedMotion: true, notificationSounds: false, mapStyle: 'ruas' } }))
    await usePreferences.persist.rehydrate()
    expect(usePreferences.getState()).toMatchObject({ darkMode: false, reducedMotion: true, notificationSounds: false, mapStyle: 'ruas' })
  })
  it('ignora tipos inválidos e não permite sobrescrever ações do store', async () => {
    localStorage.setItem(key, JSON.stringify({ version: 1, state: { darkMode: 'true', mapStyle: 'invalid', setDarkMode: null } }))
    await usePreferences.persist.rehydrate()
    expect(usePreferences.getState().darkMode).toBe(false)
    expect(usePreferences.getState().mapStyle).toBe('praia')
    expect(typeof usePreferences.getState().setDarkMode).toBe('function')
  })
  it('continua funcionando com armazenamento corrompido ou bloqueado', async () => {
    localStorage.setItem(key, '{broken')
    await usePreferences.persist.rehydrate()
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError') })
    await usePreferences.persist.rehydrate()
    get.mockRestore()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    render(<AppearanceSync/>)
    act(() => usePreferences.getState().setDarkMode(true))
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
  it.each([true, false])('aplica a escolha antes do React, sem script inline (%s)', darkMode => {
    localStorage.setItem(key, JSON.stringify({ version: 1, state: { darkMode } }))
    runInNewContext(bootstrap, { localStorage, document })
    expect(document.documentElement.dataset.theme).toBe(darkMode ? 'dark' : 'light')
    const html = readFileSync('index.html', 'utf8')
    expect(html).toContain('<script src="/theme-init.js"></script>')
    expect(html).toContain("script-src 'self';")
  })
  it('a inicialização tolera armazenamento indisponível', () => {
    runInNewContext(bootstrap, { localStorage: { getItem: () => { throw new Error('blocked') } }, document })
    expect(document.documentElement.dataset.theme).toBe('light')
  })
  it('sincroniza ícones da barra nativa e tolera falha do plugin', async () => {
    native.enabled = true
    native.setStyle.mockRejectedValueOnce(new Error('unavailable'))
    render(<AppearanceSync/>)
    await waitFor(() => expect(native.setStyle).toHaveBeenCalledWith({ style: 'LIGHT' }))
    act(() => usePreferences.getState().setDarkMode(true))
    await waitFor(() => expect(native.setStyle).toHaveBeenLastCalledWith({ style: 'DARK' }))
    act(() => usePreferences.getState().setDarkMode(false))
    await waitFor(() => expect(native.setStyle).toHaveBeenLastCalledWith({ style: 'LIGHT' }))
  })
})
