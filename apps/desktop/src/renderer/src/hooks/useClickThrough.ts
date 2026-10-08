import { useEffect } from 'react'

/**
 * Makes the panel window's see-through areas pass clicks to whatever is underneath. The main
 * process keeps the window ignoring the mouse (while still forwarding pointer moves to it), and
 * this hook switches mouse input on only while the pointer is over an element marked `data-hit`.
 *
 * There's deliberately no "pointer left the window" handling: switching mouse input on makes
 * Windows send a stale leave message, and reacting to it left the window click-through while the
 * pointer sat on real UI. A window with input on gets a real move as soon as the pointer is over
 * an empty area again, which switches it back off.
 */
export function useClickThrough(): void {
  useEffect(() => {
    // null = unknown (after a reset): the next decision is always sent.
    let interactive: boolean | null = false
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
      // While a button is held (selecting text, say) keep mouse input on, so the window doesn't
      // lose the release when the pointer briefly runs outside it.
      if (event.buttons !== 0) return
      set(hitAt(pointer.x, pointer.y))
    }
    // Content can change under a still pointer (a menu closes, the chat grows).
    const recheck = () =>
      requestAnimationFrame(() => {
        if (pointer) set(hitAt(pointer.x, pointer.y))
      })

    // The panel was just shown: the main process has made it click-through and says where the
    // pointer is. Decide once the page has rendered its open state.
    const offReset = window.assist.onClickThroughReset((point) => {
      interactive = null
      pointer = point
      requestAnimationFrame(() => {
        if (pointer) set(hitAt(pointer.x, pointer.y))
      })
    })

    // After a reload the main process may still have input switched on; resync.
    window.assist.setInteractive(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', recheck)
    return () => {
      offReset()
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', recheck)
      set(false)
    }
  }, [])
}
