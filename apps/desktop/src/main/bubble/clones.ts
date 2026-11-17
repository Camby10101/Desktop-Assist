import { CLONES } from '@shared/character'
import type { Rect } from '@shared/geometry'
import { cloneStrip } from './layout'

/** Her robe's colour for a page's query string (`robe`), if one is chosen. */
export const robeQuery = (color: string | null | undefined): Record<string, string> =>
  color ? { robe: color } : {}

/** A window of clones, as Clones uses it. index.ts makes them (see createOverlayWindow). */
export interface CloneWindow {
  close(): void
}

export interface ClonesDeps {
  /**
   * Opens a window of clones over `bounds`, its page told (in its query string) where she stands
   * in it (`from`, DIPs from its left edge), her size, the accent colour and when they end.
   */
  open(bounds: Rect, query: Record<string, string>): CloneWindow
  /** The tenant's accent colour, for the clones' robes and hats... */
  accentColor: string
  /** ...unless another is chosen for her robe in Settings (`#rrggbb`, or null). */
  robeColor?: () => string | null
  /** Wall-clock time (ms), shared with the page, which fades the clones out at the end. */
  now?: () => number
}

/**
 * Her clones (the Clones spell): CLONES.count of her, for CLONES.durationMs, walking about the
 * taskbar of her display at her size and stopping now and then (the page in the window decides
 * where; see ClonesView). They're all in one window along the bottom of the screen, which never
 * takes the mouse or the focus: they have no panel, and clicks go to whatever is under them. The
 * window closes once their time is up; asking again before then starts a new lot.
 */
export class Clones {
  private current: { window: CloneWindow; timer: ReturnType<typeof setTimeout> } | null = null

  constructor(private readonly deps: ClonesDeps) {}

  get running(): boolean {
    return this.current !== null
  }

  /** Clones of her where she stands (`standing` from BubbleController), for their time. */
  start(standing: { workArea: Rect; bounds: Rect; scale: number }): void {
    this.stop()
    const strip = cloneStrip(standing.workArea, standing.scale)
    const window = this.deps.open(strip, {
      from: String(Math.round(standing.bounds.x - strip.x)),
      scale: String(standing.scale),
      accent: this.deps.accentColor,
      ends: String((this.deps.now ?? Date.now)() + CLONES.durationMs),
      ...robeQuery(this.deps.robeColor?.()),
    })
    const timer = setTimeout(() => this.stop(), CLONES.durationMs)
    this.current = { window, timer }
  }

  /** Closes the clones' window now, if there is one. */
  stop(): void {
    if (!this.current) return
    clearTimeout(this.current.timer)
    this.current.window.close()
    this.current = null
  }
}
