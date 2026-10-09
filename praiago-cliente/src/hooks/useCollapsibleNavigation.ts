import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

/** Observe only the page scroller, never horizontal carousels or modal contents. */
export function useCollapsibleNavigation(
  scrollRef: RefObject<HTMLElement | null>,
  navigationRef: RefObject<HTMLElement | null>,
  pathname: string,
) {
  const [expanded, setExpanded] = useState(true)
  const movement = useRef({ previous: 0, distance: 0 })

  const resetMovement = useCallback(() => {
    movement.current = { previous: Math.max(0, scrollRef.current?.scrollTop ?? 0), distance: 0 }
  }, [scrollRef])
  const toggle = useCallback(() => {
    resetMovement()
    setExpanded(value => !value)
  }, [resetMovement])

  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    resetMovement()
    setExpanded(true)
    let frame: number | null = null

    const update = () => {
      frame = null
      // Clamp overscroll/bounce on iOS so it cannot invert the direction.
      const top = Math.max(0, Math.min(scroller.scrollTop, scroller.scrollHeight - scroller.clientHeight))
      const delta = top - movement.current.previous
      movement.current.previous = top
      if (delta === 0) return
      const focused = document.activeElement
      const keyboardNavigation = focused instanceof HTMLElement && focused.matches(':focus-visible') && navigationRef.current?.contains(focused)
      if (top <= 24 || keyboardNavigation) {
        movement.current.distance = 0
        setExpanded(true)
        return
      }
      const previousDistance = movement.current.distance
      movement.current.distance = Math.sign(delta) === Math.sign(previousDistance) ? previousDistance + delta : delta
      // Hysteresis prevents tiny finger movements from making the menu flicker.
      if (movement.current.distance >= 24) {
        setExpanded(false)
        movement.current.distance = 0
      } else if (movement.current.distance <= -12) {
        setExpanded(true)
        movement.current.distance = 0
      }
    }
    const onScroll = () => {
      if (frame === null) frame = requestAnimationFrame(update)
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [scrollRef, navigationRef, pathname, resetMovement])

  return { expanded, toggle }
}
