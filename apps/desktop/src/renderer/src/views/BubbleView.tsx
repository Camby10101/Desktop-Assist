import { useRef, type PointerEvent } from 'react'
import { UI } from '@shared/geometry'
import type { Mode } from '@shared/types'
import { useAccentColor, useAssistState } from '../hooks/useAssistState'
import { useClickThrough } from '../hooks/useClickThrough'
import { cn } from '../lib/cn'

// The tenant's logo: logo.png, or logo.svg (if a tenant has both, the PNG wins).
const logos = import.meta.glob<string>('@tenant/logo.{png,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
})
const logoUrl =
  Object.entries(logos).find(([path]) => path.endsWith('.png'))?.[1] ?? Object.values(logos)[0]

const ACTION_LABEL: Record<Mode, string> = {
  collapsed: 'Open',
  expanded: 'Close',
  dragging: 'Moving',
  bouncing: 'Stop bouncing',
  returning: 'Returning',
  capturing: 'Taking screenshot',
}

/** Moving the pointer further than this while pressed turns a click into a drag. */
const DRAG_THRESHOLD = 5

/**
 * The always-on-top logo bubble. A click goes to the main process, which decides what it means.
 * Press and move to drag it: the main process makes it follow the mouse, and on release snaps it
 * to the nearest corner of whichever display it's on.
 */
export function BubbleView() {
  useClickThrough()
  const state = useAssistState()
  useAccentColor(state?.branding.accentColor)
  const mode = state?.mode ?? 'collapsed'
  const appName = state?.branding.appName ?? 'Desktop Assist'

  const press = useRef<{ x: number; y: number; dragging: boolean } | null>(null)
  // A drag ends with a click event on the bubble; this stops it counting as a click.
  const swallowClick = useRef(false)

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    swallowClick.current = false
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
    <div className="flex h-full w-full items-center justify-center">
      <button
        data-hit
        type="button"
        aria-label={`${ACTION_LABEL[mode]} ${appName}`}
        title={mode === 'collapsed' ? 'Click to open, drag to move' : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPress}
        onLostPointerCapture={endPress}
        onClick={() => {
          if (swallowClick.current) swallowClick.current = false
          else window.assist.bubbleClick()
        }}
        style={{ width: UI.bubbleSize, height: UI.bubbleSize }}
        className={cn(
          'overflow-hidden rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.35)] outline-none',
          'transition-transform duration-150 ease-out motion-reduce:transition-none',
          mode === 'dragging' ? 'scale-105' : 'hover:scale-105 active:scale-95',
          mode === 'expanded' &&
            'ring-2 ring-accent ring-offset-2 ring-offset-white dark:ring-offset-zinc-900',
        )}
      >
        <img
          src={logoUrl}
          alt=""
          draggable={false}
          className="pointer-events-none size-full object-contain"
        />
      </button>
    </div>
  )
}
