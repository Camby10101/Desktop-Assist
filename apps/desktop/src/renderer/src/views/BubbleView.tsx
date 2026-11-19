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
/** While she glows (the pointer's over her), how often the page checks it still is (ms). */
const HOVER_CHECK_MS = 250

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

  // Behind a window (peeking round it): the part of her it covers is hidden, kept up to date
  // every frame as her window moves.
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    let frame = 0
    let occluder: { x: number; y: number; width: number; height: number } | null = null
    const clip = () => {
      const element = button.current
      if (!element) return
      if (!occluder) {
        element.style.clipPath = ''
        return
      }
      const { width, height } = element.getBoundingClientRect()
      const x = occluder.x - window.screenX
      const y = occluder.y - window.screenY
      const hole = `M${x} ${y} H${x + occluder.width} V${y + occluder.height} H${x} Z`
      element.style.clipPath = `path(evenodd, "M0 0 H${width} V${height} H0 Z ${hole}")`
      frame = requestAnimationFrame(clip)
    }
    const stop = window.assist.onOcclude((rect) => {
      occluder = rect
      cancelAnimationFrame(frame)
      clip()
    })
    return () => {
      stop()
      cancelAnimationFrame(frame)
    }
  }, [])

  // The glow round her while the pointer's over her. Not CSS's :hover: the page is only told about
  // the pointer when it moves over her window, so when her window moves out from under a still
  // pointer (she walks off, falls after a drag, hides for the screen saver), :hover stayed on. So
  // the page keeps it itself, and while it's on, checks with the main process, which knows where
  // the pointer really is, every HOVER_CHECK_MS.
  const [hovered, setHovered] = useState(false)
  useEffect(() => {
    if (!hovered) return
    let alive = true
    const timer = setInterval(() => {
      void window.assist.bubblePointerInside().then((inside) => {
        if (alive && !inside) setHovered(false)
      })
    }, HOVER_CHECK_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [hovered])

  // Which way she looks while she watches the pointer (the main process says, as it moves).
  const [gaze, setGaze] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => window.assist.onGaze(setGaze), [])

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
    setHovered(true)
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
      ref={button}
      data-hit
      type="button"
      aria-label={`${ACTION_LABEL[mode]} ${appName}`}
      onPointerDown={onPointerDown}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onPointerMove={onPointerMove}
      onPointerUp={endPress}
      onLostPointerCapture={endPress}
      onClick={(event) => {
        if (swallowClick.current) swallowClick.current = false
        // The second click of a double-click pets her, and only that: the first one opened or
        // closed the panel.
        else if (event.detail >= 2) window.assist.bubblePet()
        // A click from the keyboard has no press: it's "now".
        else window.assist.bubbleClick(pressedAt.current ?? Date.now())
        pressedAt.current = undefined
      }}
      data-hovered={hovered || undefined}
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
          gaze={gaze}
          hat={!state?.settings.noHat}
        />
      )}
    </button>
  )
}
