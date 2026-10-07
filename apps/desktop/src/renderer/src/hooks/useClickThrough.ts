import { useEffect } from 'react'

/**
 * Makes the window's see-through areas pass clicks to whatever is underneath. The main process
 * starts every overlay window ignoring the mouse (while still forwarding pointer moves), and
 * this hook switches mouse input on only while the pointer is over an element marked `data-hit`.
 */
export function useClickThrough(): void {
  useEffect(() => {
    let interactive = false
    let pointer: { x: number; y: number } | null = null

    const set = (next: boolean) => {
      if (next === interactive) return
      interactive = next
      window.assist.setInteractive(next)
    }
    const hitAt = (x: number, y: number) =>
      document.elementFromPoint(x, y)?.closest('[data-hit]') != null

    const onMove = (event: MouseEvent) => {
      pointer = { x: event.clientX, y: event.clientY }
      // While a button is held (dragging the bubble, selecting text) keep mouse input on, so
      // the window doesn't lose the release when the pointer briefly runs outside it.
      if (event.buttons !== 0) return
      set(hitAt(pointer.x, pointer.y))
    }
    // Content can change under a still pointer (a menu closes, the text box shrinks).
    const recheck = () =>
      requestAnimationFrame(() => {
        if (pointer) set(hitAt(pointer.x, pointer.y))
      })
    const onLeave = () => {
      pointer = null
      set(false)
    }

    // After a reload the main process may still have input switched on; resync.
    window.assist.setInteractive(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', recheck)
    document.documentElement.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', recheck)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      set(false)
    }
  }, [])
}
