import { UI, type Corner, type Point, type Rect } from '@shared/geometry'
import type { Mode } from '@shared/types'
import { glideDuration, glidePosition, launch, step, type Motion } from './bounce'
import {
  bubbleWindowBounds,
  homePosition,
  nearestCorner,
  panelWindowBounds,
  travelBox,
} from './layout'

/** The parts of a window the controller drives. Electron windows are adapted in windows.ts. */
export interface Surface {
  setBounds(bounds: Rect): void
  show(): void
  hide(): void
}

export interface PanelSurface extends Surface {
  focus(): void
}

/** One display: its id and work area (the screen minus the taskbar). */
export interface DisplayArea {
  id: number
  workArea: Rect
}

/** What the controller needs to know about the screens. Electron's `screen` is adapted in index.ts. */
export interface Displays {
  primary(): DisplayArea
  byId(id: number): DisplayArea | undefined
  /** The display containing `point`, or the closest one. */
  nearest(point: Point): DisplayArea
  /** Where the mouse pointer is. */
  cursor(): Point
}

/** Where the bubble rests: a corner of a particular display. */
export interface BubbleAnchor {
  displayId: number
  corner: Corner
}

export interface BubbleControllerDeps {
  bubble: Surface
  panel: PanelSurface
  displays: Displays
  actionCount: number
  /** Where the bubble was last time, if saved. */
  initialAnchor?: BubbleAnchor | null
  onModeChange(mode: Mode): void
  /** The bubble settled in a new corner or on a new display. */
  onAnchorChange(anchor: BubbleAnchor): void
  now?: () => number
  random?: () => number
  /** Things worth a line in the log, such as a click on the bubble that didn't open it. */
  onDiagnostic?: (message: string) => void
}

const FRAME_MS = 16
const DEFAULT_CORNER: Corner = 'bottom-right'
/** Matches the panel's fade-out in the renderer, so the window hides once it's invisible. */
export const PANEL_FADE_MS = 150
/**
 * Clicking the bubble while the panel is open can blur the panel just before the click lands.
 * A click this soon after a blur-collapse belongs to the same gesture and must not reopen it.
 */
export const BLUR_CLICK_GRACE_MS = 300
/**
 * A blur this soon after the panel opened doesn't close it. Another app can take the focus back
 * just as the panel opens (Claude Desktop, say, right after a question was handed to it); closing
 * then would make the click look like it did nothing. The panel stays open, unfocused, instead.
 */
export const OPEN_BLUR_GRACE_MS = 400
/** Lets Windows repaint the area under our windows before a screenshot. */
export const HIDE_SETTLE_MS = 150

/**
 * The bubble's state machine. Owns the mode, the bubble's position and its anchor (the display
 * and corner it rests in), and moves/shows/hides the two windows to match:
 *
 *   collapsed ⇄ expanded                     click, Esc, blur
 *   collapsed/expanded → dragging → returning → collapsed     drag, release (snaps to a corner)
 *   * → bouncing → returning → collapsed     Bounce action, then a click
 *   expanded → capturing → expanded          screenshot
 */
export class BubbleController {
  private mode: Mode = 'collapsed'
  private position: Point = { x: 0, y: 0 }
  private anchor: BubbleAnchor
  private motion: Motion | null = null
  private ticker: ReturnType<typeof setInterval> | null = null
  private hideTimer: ReturnType<typeof setTimeout> | null = null
  private lastBlurCollapse = Number.NEGATIVE_INFINITY
  private expandedAt = Number.NEGATIVE_INFINITY
  private expandAfterReturn = false
  private readonly now: () => number
  private readonly random: () => number

  constructor(private readonly deps: BubbleControllerDeps) {
    this.now = deps.now ?? (() => performance.now())
    this.random = deps.random ?? Math.random
    // Set now, not in start(): the pages ask for the corner as soon as they load, which can be
    // before start() runs.
    const saved = deps.initialAnchor
    this.anchor =
      saved && deps.displays.byId(saved.displayId)
        ? { ...saved }
        : { displayId: deps.displays.primary().id, corner: saved?.corner ?? DEFAULT_CORNER }
  }

  get currentMode(): Mode {
    return this.mode
  }

  get bubblePosition(): Point {
    return { ...this.position }
  }

  get corner(): Corner {
    return this.anchor.corner
  }

  /** Puts the bubble in its saved corner (or bottom-right of the main display) and shows it. */
  start(): void {
    this.position = this.home()
    this.placeWindows()
    this.deps.bubble.show()
  }

  clickBubble(): void {
    switch (this.mode) {
      case 'collapsed':
        if (this.now() - this.lastBlurCollapse >= BLUR_CLICK_GRACE_MS) this.expand()
        else this.deps.onDiagnostic?.('Bubble click ignored: the panel had just closed')
        return
      case 'expanded':
        this.collapse()
        return
      case 'bouncing':
        this.glideHome()
        return
      case 'dragging':
      case 'returning':
      case 'capturing':
        this.deps.onDiagnostic?.(`Bubble click ignored while ${this.mode}`)
        return
    }
  }

  /** Opens the panel. While bouncing, glides home first and then opens. */
  expand(): void {
    switch (this.mode) {
      case 'expanded':
        this.deps.panel.focus()
        return
      case 'bouncing':
        this.expandAfterReturn = true
        this.glideHome()
        return
      case 'returning':
        this.expandAfterReturn = true
        return
      case 'dragging':
      case 'capturing':
        return
      case 'collapsed':
        this.cancelHide()
        this.setMode('expanded')
        this.expandedAt = this.now()
        this.deps.panel.show()
        this.deps.panel.focus()
        return
    }
  }

  collapse(): void {
    if (this.mode !== 'expanded') return
    this.setMode('collapsed')
    this.cancelHide()
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null
      this.deps.panel.hide()
    }, PANEL_FADE_MS)
  }

  panelBlurred(): void {
    if (this.mode !== 'expanded') return
    if (this.now() - this.expandedAt < OPEN_BLUR_GRACE_MS) {
      this.deps.onDiagnostic?.('The panel lost the focus as it opened; kept it open')
      return
    }
    this.lastBlurCollapse = this.now()
    this.collapse()
  }

  /** The mouse pressed on the bubble and moved: the bubble follows the pointer until released. */
  startDrag(): void {
    if (this.mode !== 'collapsed' && this.mode !== 'expanded') return
    this.cancelHide()
    this.deps.panel.hide()
    const cursor = this.deps.displays.cursor()
    const grab = { x: cursor.x - this.position.x, y: cursor.y - this.position.y }
    this.setMode('dragging')
    this.runTicker(() => {
      const now = this.deps.displays.cursor()
      this.moveBubble({ x: now.x - grab.x, y: now.y - grab.y })
    })
  }

  /** Released: snap to the nearest corner of the display the bubble was dropped on. */
  endDrag(): void {
    if (this.mode !== 'dragging') return
    this.stopTicker()
    const centre = {
      x: Math.round(this.position.x + UI.bubbleSize / 2),
      y: Math.round(this.position.y + UI.bubbleSize / 2),
    }
    const display = this.deps.displays.nearest(centre)
    this.setAnchor({
      displayId: display.id,
      corner: nearestCorner(display.workArea, this.position),
    })
    this.glideHome()
  }

  startBounce(): void {
    if (this.mode !== 'collapsed' && this.mode !== 'expanded') return
    this.cancelHide()
    this.deps.panel.hide()
    this.motion = launch(this.position, this.random, this.anchor.corner)
    this.setMode('bouncing')
    this.runTicker((dtMs) => {
      if (!this.motion) return
      this.motion = step(this.motion, dtMs, travelBox(this.display().workArea))
      this.moveBubble({ x: this.motion.x, y: this.motion.y })
    })
  }

  /** Hides both windows, runs `task` (a screenshot), then reopens the panel. */
  async whileHidden<T>(task: () => Promise<T>): Promise<T> {
    if (this.mode !== 'expanded') throw new Error(`Can't hide the windows while ${this.mode}`)
    this.setMode('capturing')
    this.deps.panel.hide()
    this.deps.bubble.hide()
    try {
      await new Promise((resolve) => setTimeout(resolve, HIDE_SETTLE_MS))
      return await task()
    } finally {
      this.deps.bubble.show()
      this.setMode('expanded')
      this.expandedAt = this.now()
      this.deps.panel.show()
      this.deps.panel.focus()
    }
  }

  /**
   * The resolution, taskbar or monitors changed. If the bubble's display was unplugged, it moves
   * to the same corner of the main display. Moving bubbles re-read the display every frame.
   */
  displayChanged(): void {
    if (!this.deps.displays.byId(this.anchor.displayId)) {
      this.setAnchor({ displayId: this.deps.displays.primary().id, corner: this.anchor.corner })
    }
    if (this.mode === 'bouncing' || this.mode === 'returning' || this.mode === 'dragging') return
    this.position = this.home()
    this.placeWindows()
  }

  dispose(): void {
    this.stopTicker()
    this.cancelHide()
  }

  /** The anchor's display, or the main display if it's gone. */
  private display(): DisplayArea {
    return this.deps.displays.byId(this.anchor.displayId) ?? this.deps.displays.primary()
  }

  private home(): Point {
    return homePosition(this.display().workArea, this.anchor.corner)
  }

  /** Glides the bubble into its anchor corner, then switches to collapsed. */
  private glideHome(): void {
    this.motion = null
    const from = { ...this.position }
    const duration = glideDuration(from, this.home())
    const startedAt = this.now()
    this.setMode('returning')
    this.runTicker(() => {
      // Re-read home every frame in case the display changes mid-glide.
      const home = this.home()
      const t = (this.now() - startedAt) / duration
      if (t < 1) {
        this.moveBubble(glidePosition(from, home, t))
        return
      }
      this.stopTicker()
      this.position = home
      this.placeWindows()
      this.setMode('collapsed')
      if (this.expandAfterReturn) {
        this.expandAfterReturn = false
        this.expand()
      }
    })
  }

  private runTicker(onFrame: (dtMs: number) => void): void {
    this.stopTicker()
    let last = this.now()
    this.ticker = setInterval(() => {
      const now = this.now()
      onFrame(now - last)
      last = now
    }, FRAME_MS)
  }

  private stopTicker(): void {
    if (this.ticker) clearInterval(this.ticker)
    this.ticker = null
  }

  private moveBubble(position: Point): void {
    this.position = position
    this.deps.bubble.setBounds(bubbleWindowBounds(position))
  }

  private placeWindows(): void {
    this.deps.bubble.setBounds(bubbleWindowBounds(this.position))
    this.deps.panel.setBounds(
      panelWindowBounds(this.position, this.deps.actionCount, this.anchor.corner),
    )
  }

  private setAnchor(anchor: BubbleAnchor): void {
    if (anchor.displayId === this.anchor.displayId && anchor.corner === this.anchor.corner) return
    this.anchor = anchor
    this.deps.onAnchorChange({ ...anchor })
  }

  private cancelHide(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer)
    this.hideTimer = null
  }

  private setMode(mode: Mode): void {
    if (mode === this.mode) return
    this.mode = mode
    this.deps.onModeChange(mode)
  }
}
