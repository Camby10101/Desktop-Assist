import { useEffect, useState, type RefObject } from 'react'
import { UI } from '@shared/geometry'

/**
 * Keeps a menu that opens beside the action stack (Settings, Size) inside the panel window. It
 * lines up with its icon, `offset` from the bubble's edge of the window, unless that would push its
 * far edge out of the window (a long menu by an icon high up the stack), when it moves back toward
 * the bubble just enough to fit. One taller than the whole window scrolls (`maxHeight`). `menu` is
 * the menu's element, whose height is measured as it renders and changes (an item appearing, say).
 */
export function useFitInWindow(
  menu: RefObject<HTMLElement | null>,
  offset: number,
): { offset: number; maxHeight: number } {
  const [height, setHeight] = useState(0)
  useEffect(() => {
    const element = menu.current
    if (!element) return
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight))
    observer.observe(element)
    return () => observer.disconnect()
  }, [menu])
  // The window's height, less the room kept along its far edge for drop shadows.
  const room = window.innerHeight - UI.shadowPad
  return { offset: Math.max(0, Math.min(offset, room - height)), maxHeight: room }
}
