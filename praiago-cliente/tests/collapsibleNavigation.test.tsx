import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { MemoryRouter } from 'react-router-dom'
import CollapsibleNavigation from '../src/components/CollapsibleNavigation'

let frames: Map<number, FrameRequestCallback>
let nextFrame: number
let cancelled: ReturnType<typeof vi.fn>
beforeEach(() => {
  frames = new Map()
  nextFrame = 0
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  }))
  cancelled = vi.fn((id: number) => frames.delete(id))
  vi.stubGlobal('cancelAnimationFrame', cancelled)
})

function Harness() {
  const main = useRef<HTMLElement>(null)
  return <><main ref={main} data-testid="scroller"><div data-testid="carousel" /></main><CollapsibleNavigation scrollRef={main} /></>
}
function mount() {
  const result = render(<MemoryRouter><Harness /></MemoryRouter>)
  const main = screen.getByTestId('scroller')
  Object.defineProperties(main, { scrollHeight: { value: 2000, configurable: true }, clientHeight: { value: 600, configurable: true } })
  return { ...result, main }
}
function scroll(main: HTMLElement, top: number) {
  main.scrollTop = top
  fireEvent.scroll(main)
  act(() => {
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach(callback => callback(0))
  })
}
function expectExpanded(value: boolean) {
  expect(screen.getByRole('button', { name: value ? 'Recolher menu de navegação' : 'Mostrar menu de navegação' }).getAttribute('aria-expanded')).toBe(String(value))
  const menu = document.getElementById('menu-principal')!
  expect(menu.getAttribute('aria-hidden')).toBe(String(!value))
  expect(menu.hasAttribute('inert')).toBe(!value)
}

describe('navigation without blocking page scrolling', () => {
  it('starts open with five stable destinations', () => {
    mount()
    expectExpanded(true)
    expect(screen.getAllByRole('link')).toHaveLength(5)
    expect(screen.getByRole('link', { name: 'Mapa' }).getAttribute('href')).toBe('/ambulantes')
  })
  it('collapses down and returns up without needing to reach the top', () => {
    const { main } = mount()
    scroll(main, 200)
    expectExpanded(false)
    scroll(main, 180)
    expectExpanded(true)
  })
  it('keeps the page position when manually hiding/showing', () => {
    const { main } = mount()
    scroll(main, 250)
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar menu de navegação' }))
    expectExpanded(true)
    expect(main.scrollTop).toBe(250)
    fireEvent.click(screen.getByRole('button', { name: 'Recolher menu de navegação' }))
    expectExpanded(false)
    expect(main.scrollTop).toBe(250)
  })
  it('does not flicker on tiny movements or reverse direction noise', () => {
    const { main } = mount()
    scroll(main, 80)
    scroll(main, 60)
    expectExpanded(true)
    scroll(main, 64)
    scroll(main, 62)
    scroll(main, 65)
    expectExpanded(true)
    scroll(main, 90)
    expectExpanded(false)
  })
  it('shows at the top and clamps negative iOS bounce', () => {
    const { main } = mount()
    scroll(main, 200)
    scroll(main, -40)
    expectExpanded(true)
    scroll(main, 0)
    expectExpanded(true)
  })
  it('does not mistake bottom overscroll for upward page scrolling', () => {
    const { main } = mount()
    scroll(main, 1400)
    scroll(main, 1500)
    scroll(main, 1400)
    expectExpanded(false)
  })
  it('ignores scrolling inside carousels or dialogs', () => {
    mount()
    const child = screen.getByTestId('carousel')
    child.scrollTop = 400
    fireEvent.scroll(child)
    act(() => [...frames.values()].forEach(callback => callback(0)))
    expectExpanded(true)
  })
  it('keeps keyboard-focused links visible', () => {
    const { main } = mount()
    const link = screen.getByRole('link', { name: 'Início' })
    // jsdom has no browser keyboard modality; model the :focus-visible state.
    vi.spyOn(link, 'matches').mockReturnValue(true)
    act(() => link.focus())
    scroll(main, 300)
    expectExpanded(true)
  })
  it('does not let pointer focus prevent auto-collapse after changing tabs', () => {
    const { main } = mount()
    const link = screen.getByRole('link', { name: 'Início' })
    vi.spyOn(link, 'matches').mockReturnValue(false)
    act(() => link.focus())
    scroll(main, 300)
    expectExpanded(false)
  })
  it('keeps focus on the same toggle after hiding and showing', () => {
    mount()
    const button = screen.getByRole('button', { name: 'Recolher menu de navegação' })
    act(() => button.focus())
    fireEvent.click(button)
    expectExpanded(false)
    expect(document.activeElement).toBe(button)
    expect(button.getAttribute('aria-controls')).toBe('menu-principal')
    fireEvent.click(button)
    expectExpanded(true)
    expect(document.activeElement).toBe(button)
  })
  it('opens again on a route change and marks the active destination', () => {
    mount()
    fireEvent.click(screen.getByRole('link', { name: 'Perfil' }))
    expectExpanded(true)
    expect(screen.getByRole('link', { name: 'Perfil' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Início' }).hasAttribute('aria-current')).toBe(false)
  })
  it('batches many scroll events into one animation frame', () => {
    const { main } = mount()
    main.scrollTop = 150
    fireEvent.scroll(main)
    fireEvent.scroll(main)
    fireEvent.scroll(main)
    expect(frames.size).toBe(1)
  })
  it('removes the listener and cancels a queued frame when unmounted', () => {
    const { main, unmount } = mount()
    fireEvent.scroll(main)
    const id = [...frames.keys()][0]
    unmount()
    expect(cancelled).toHaveBeenCalledWith(id)
    fireEvent.scroll(main)
    expect(frames.size).toBe(0)
  })
})
