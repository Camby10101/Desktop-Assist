import type { Point, Rect } from '@shared/geometry'
import type { Mode } from '@shared/types'
import { glideDuration, glidePosition, launch, step, type Motion } from './bounce'
import { bubbleWindowBounds, homePosition, panelWindowBounds, travelBox } from './layout'

/** The parts of a window the controller drives. Electron windows are adapted in windows.ts. */
export interface Surface {
  setBounds(bounds: Rect): void
  show(): void
  hide(): void
}

export interface PanelSurface extends Surface {
  focus(): void
}

export interface BubbleControllerDeps {
  bubble: Surface
  panel: PanelSurface
  /** The area the bubble lives in: the primary display minus the taskbar. */
  getWorkArea(): Rect
  actionCount: number
  onModeChange(mode: Mode): void
  now?: () => number
  random?: () => number
}

const FRAME_MS = 16
/** Matches the panel's fade-out in the renderer, so the window hides once it's invisible. */
export const PANEL_FADE_MS = 140
/**
 * Clicking the bubble while the panel is open can blur the panel just before the click lands.
 * A click this soon after a blur-collapse belongs to the same gesture and must not reopen it.
 */
export const BLUR_CLICK_GRACE_MS = 300
/** Lets Windows repaint the area under our windows before a screenshot. */
export const HIDE_SETTLE_MS = 150

/**
 * The bubble's state machine. Owns the mode and the bubble's position, and moves/shows/hides
 * the two windows to match:
 *
 *   collapsed ⇄ expanded        click, Esc, blur
 *   * → bouncing → returning → collapsed     Bounce action, then a click
 *   expanded → capturing → expanded          screenshot
 */
export class BubbleController {
  private mode: Mode = 'collapsed'
  private position: Point = { x: 0, y: 0 }
  private motion: Motion | null = null
  private ticker: ReturnType<typeof setInterval> | null = null
  private hideTimer: ReturnType<typeof setTimeout> | null = null
  private lastBlurCollapse = Number.NEGATIVE_INFINITY
  private expandAfterReturn = false
  private readonly now: () => number
  private readonly random: () => number

  constructor(private readonly deps: BubbleControllerDeps) {
    this.now = deps.now ?? (() => performance.now())
    this.random = deps.random ?? Math.random
  }

  get currentMode(): Mode {
    return this.mode
  }

  get bubblePosition(): Point {
    return { ...this.position }
  }

  /** Puts the bubble in its corner and shows it. */
  start(): void {
    this.position = homePosition(this.deps.getWorkArea())
    this.placeWindows()
    this.deps.bubble.show()
  }

  clickBubble(): void {
    switch (this.mode) {
      case 'collapsed':
        if (this.now() - this.lastBlurCollapse >= BLUR_CLICK_GRACE_MS) this.expand()
        return
      case 'expanded':
        this.collapse()
        return
      case 'bouncing':
        this.returnHome()
        return
      case 'returning':
      case 'capturing':
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
        this.returnHome()
        return
      case 'returning':
        this.expandAfterReturn = true
        return
      case 'capturing':
        return
      case 'collapsed':
        this.cancelHide()
        this.setMode('expanded')
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
    this.lastBlurCollapse = this.now()
    this.collapse()
  }

  startBounce(): void {
    if (this.mode !== 'collapsed' && this.mode !== 'expanded') return
    this.cancelHide()
    this.deps.panel.hide()
    this.motion = launch(this.position, this.random)
    this.setMode('bouncing')
    this.runTicker((dtMs) => {
      if (!this.motion) return
      this.motion = step(this.motion, dtMs, travelBox(this.deps.getWorkArea()))
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
      this.deps.panel.show()
      this.deps.panel.focus()
    }
  }

  /** The resolution, taskbar or monitors changed: move home (bouncing re-reads it per frame). */
  displayChanged(): void {
    if (this.mode === 'bouncing' || this.mode === 'returning') return
    this.position = homePosition(this.deps.getWorkArea())
    this.placeWindows()
  }

  dispose(): void {
    this.stopTicker()
    this.cancelHide()
  }

  private returnHome(): void {
    this.motion = null
    const from = { ...this.position }
    const duration = glideDuration(from, homePosition(this.deps.getWorkArea()))
    const startedAt = this.now()
    this.setMode('returning')
    this.runTicker(() => {
      // Re-read home every frame in case the display changes mid-glide.
      const home = homePosition(this.deps.getWorkArea())
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
    this.deps.panel.setBounds(panelWindowBounds(this.position, this.deps.actionCount))
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
