import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { DRAG_CHECK, SPELL_POSE_MS } from '@shared/character'
import { bubbleMetrics, DEFAULT_SIZE, isLeftCorner } from '@shared/geometry'
import type { Mode } from '@shared/types'
import { Character } from '../components/Character'
import { useAccentColor, useAssistState, useRobeColor } from '../hooks/useAssistState'

const ACTION_LABEL: Record<Mode, string> = {
  collapsed: 'Open',
  expanded: 'Close',
  dragging: 'Moving',
  returning: 'Returning',
  capturing: 'Taking screenshot',
}

/** Moving the pointer further than this while pressed turns a click into a drag. */
const DRAG_THRESHOLD = 5

/** How long she waits for word that her window is showing before she's just there (ms). */
const ARRIVAL_WAIT_MS = 4000

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
  useRobeColor(state?.settings.robeColor)
  const mode = state?.mode ?? 'collapsed'
  const appName = state?.branding.appName ?? 'Desktop Wizard'
  // Her window, as big as she is (with room above her hat); she faces the middle of the screen,
  // away from her corner.
  const { box, headroom } = bubbleMetrics(state?.size.scale ?? DEFAULT_SIZE)
  const corner = state?.corner ?? 'bottom-right'

  // As the app starts, she forms out of white motes (her `appear` pose) before doing as she's told.
  // Her window is shown a little after this page is ready (once the panel's is too), so she waits
  // for word that it's showing, and until then isn't drawn at all, so she never flashes up whole
  // first. Without the word (the page reloaded, say), she's just there after a few seconds.
  const [arrival, setArrival] = useState<'waiting' | 'arriving' | 'here'>('waiting')
  useEffect(() => {
    let timer = setTimeout(() => setArrival('here'), ARRIVAL_WAIT_MS)
    const stop = window.assist.onArrive(() => {
      clearTimeout(timer)
      setArrival('arriving')
      timer = setTimeout(() => setArrival('here'), SPELL_POSE_MS.appear)
    })
    return () => {
      stop()
      clearTimeout(timer)
    }
  }, [])

  // Whether the main mouse button is down, as the latest pointer event anywhere in the window
  // says. While she's carried, a button found up means the release went missing (a busy PC can
  // lose it): she's let go at once. And every so often the main process is told it's still down;
  // without that word it lets her go itself (DRAG_CHECK), so she never stays stuck to the pointer.
  const held = useRef(false)
  const carried = useRef(false)
  useEffect(() => {
    carried.current = mode === 'dragging'
    if (!carried.current) return
    const timer = setInterval(() => {
      if (held.current) window.assist.bubbleDragHold()
      else window.assist.bubbleDragEnd()
    }, DRAG_CHECK.everyMs)
    return () => clearInterval(timer)
  }, [mode])
  useEffect(() => {
    const track = (event: globalThis.PointerEvent) => {
      held.current = event.type !== 'pointercancel' && (event.buttons & 1) === 1
      if (!held.current && carried.current) window.assist.bubbleDragEnd()
    }
    const kinds = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const
    for (const kind of kinds) window.addEventListener(kind, track, true)
    return () => {
      for (const kind of kinds) window.removeEventListener(kind, track, true)
    }
  }, [])

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
      {arrival !== 'waiting' && (
        <Character
          pose={arrival === 'arriving' ? 'appear' : (state?.pose ?? 'idle')}
          facing={isLeftCorner(corner) ? 'right' : 'left'}
          box={box}
          expanded={mode === 'expanded'}
        />
      )}
    </button>
  )
}
