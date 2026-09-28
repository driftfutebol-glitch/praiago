import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn().mockImplementation(query => ({
  matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
})) })
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }
class TestBroadcastChannel { onmessage = null; close() {} }
beforeEach(() => {
  localStorage.clear()
  // Dados de teste nunca saem para produção.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Rede bloqueada nos testes')))
  vi.stubGlobal('BroadcastChannel', TestBroadcastChannel)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
