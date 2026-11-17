import { FIDGET_MS } from '@shared/character'
import type { Rect } from '@shared/geometry'

/** The vision's window, as Vision uses it. index.ts makes it (see createOverlayWindow). */
export interface VisionWindow {
  close(): void
}

export interface VisionDeps {
  /**
   * Opens the vision's window over `bounds`, its page told (in its query string) her size, where
   * her middle is across it (DIPs from its left edge) and when the vision started.
   */
  open(bounds: Rect, query: Record<string, string>): VisionWindow
  /** Wall-clock time (ms), shared with the page, which keeps in time with her from it. */
  now?: () => number
}

/**
 * Where the vision is drawn: a column above her, from the top of her display's work area down to
 * her feet, two and a half times as wide as her window and centred on her (kept on the work
 * area), so the light can fall from the top of the screen and the logo come down over her head.
 */
export function visionBounds(workArea: Rect, bounds: Rect): Rect {
  const width = Math.min(Math.round(bounds.width * 2.5), workArea.width)
  const centre = bounds.x + bounds.width / 2
  const x = Math.min(
    Math.max(Math.round(centre - width / 2), workArea.x),
    workArea.x + workArea.width - width,
  )
  return { x, y: workArea.y, width, height: bounds.y + bounds.height - workArea.y }
}

/**
 * Her `vision` habit's light and logo (see VISION): a window that never takes the mouse or the
 * focus, behind her own, for as long as she's having it. index.ts starts it when her pose becomes
 * `vision` and stops it when the pose changes (the habit ends, or someone clicks her); it also
 * closes itself once the habit's time is up, in case nothing does.
 */
export class Vision {
  private current: { window: VisionWindow; timer: ReturnType<typeof setTimeout> } | null = null

  constructor(private readonly deps: VisionDeps) {}

  get running(): boolean {
    return this.current !== null
  }

  /** The light and the logo over where she stands (`standing` from BubbleController). */
  start(standing: { workArea: Rect; bounds: Rect; scale: number }): void {
    this.stop()
    const area = visionBounds(standing.workArea, standing.bounds)
    const window = this.deps.open(area, {
      scale: String(standing.scale),
      centre: String(Math.round(standing.bounds.x + standing.bounds.width / 2 - area.x)),
      starts: String((this.deps.now ?? Date.now)()),
    })
    const timer = setTimeout(() => this.stop(), FIDGET_MS.vision)
    this.current = { window, timer }
  }

  /** Closes the window now, if it's open. */
  stop(): void {
    if (!this.current) return
    clearTimeout(this.current.timer)
    this.current.window.close()
    this.current = null
  }
}
