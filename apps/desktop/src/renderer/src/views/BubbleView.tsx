import { useRef, type PointerEvent } from 'react'
import { bubbleMetrics, DEFAULT_SIZE, isLeftCorner } from '@shared/geometry'
import type { Mode } from '@shared/types'
import { Character } from '../components/Character'
import { useAccentColor, useAssistState } from '../hooks/useAssistState'

const ACTION_LABEL: Record<Mode, string> = {
  collapsed: 'Open',
  expanded: 'Close',
  dragging: 'Moving',
  returning: 'Returning',
  capturing: 'Taking screenshot',
}

/** Moving the pointer further than this while pressed turns a click into a drag. */
const DRAG_THRESHOLD = 5

/**
 * The always-on-top character (the "bubble"), filling its small window. A click goes to the main
 * process, which decides what it means. Press and move to drag it: the main process makes it
 * follow the mouse, and on release it falls onto the taskbar. What it's doing (its pose) comes
 * from the main process too; Character animates it.
 */
export function BubbleView() {
  // No useClickThrough here: the bubble window always takes the mouse (see bubble/windows.ts).
  const state = useAssistState()
  useAccentColor(state?.branding.accentColor)
  const mode = state?.mode ?? 'collapsed'
  const appName = state?.branding.appName ?? 'Desktop Wizard'
  // Her window, as big as she is (with room above her hat); she faces the middle of the screen,
  // away from her corner.
  const { box, headroom } = bubbleMetrics(state?.size.scale ?? DEFAULT_SIZE)
  const corner = state?.corner ?? 'bottom-right'

  const press = useRef<{ x: number; y: number; dragging: boolean } | null>(null)
  // When the button last went down: the main process uses it to tell whether this press is what
  // closed the panel (see BubbleController.clickBubble).
  const pressedAt = useRef<number | undefined>(undefined)
  // A drag ends with a click event on the bubble; this stops it counting as a click.
  const swallowClick = useRef(false)

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    swallowClick.current = false
    pressedAt.current = Date.now()
    event.currentTarget.setPointerCapture(event.pointerId)
    press.current = { x: event.screenX, y: event.screenY, dragging: false }
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = press.current
    if (!current || current.dragging) return
    // Screen coordinates, because the window itself moves once the drag starts.
    if (Math.hypot(event.screenX - current.x, event.screenY - current.y) > DRAG_THRESHOLD) {
      current.dragging = true
      window.assist.bubbleDragStart()
    }
  }

  function endPress() {
    const current = press.current
    press.current = null
    if (current?.dragging) {
      swallowClick.current = true
      window.assist.bubbleDragEnd()
    }
  }

  return (
    <button
      data-hit
      type="button"
      aria-label={`${ACTION_LABEL[mode]} ${appName}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPress}
      onLostPointerCapture={endPress}
      onClick={() => {
        if (swallowClick.current) swallowClick.current = false
        // A click from the keyboard has no press: it's "now".
        else window.assist.bubbleClick(pressedAt.current ?? Date.now())
        pressedAt.current = undefined
      }}
      style={{ width: box, height: box + headroom }}
      // No focus outline: clicking her focuses the button, and Chromium can count that as
      // keyboard focus and draw the accent-coloured ring round her window.
      className="block cursor-grab outline-none focus-visible:outline-none active:cursor-grabbing"
    >
      <Character
        pose={state?.pose ?? 'idle'}
        facing={isLeftCorner(corner) ? 'right' : 'left'}
        box={box}
        expanded={mode === 'expanded'}
      />
    </button>
  )
}
