import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn().mockImplementation(query => ({
  matches: false, media: query, onchange: null,
  addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
})) })
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
HTMLElement.prototype.scrollIntoView = vi.fn()
beforeEach(() => {
  localStorage.clear()
  // Nenhum teste pode falar com produção, nem com o gateway de pagamento.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Rede bloqueada nos testes')))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
