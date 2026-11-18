import type { Pose } from '@shared/character'
import type { Rect } from '@shared/geometry'
import { IPC } from '@shared/ipc'
import { cloneStrip } from './bubble/layout'

/** The familiar's window, as Familiar uses it. index.ts makes it (see createOverlayWindow). */
export interface FamiliarWindow {
  close(): void
  send(channel: string, payload: unknown): void
}

export interface FamiliarDeps {
  /**
   * Opens the cat's window over `bounds` (a strip along her display's taskbar), its page told (in
   * its query string) her size, where she stands across it (`from`, DIPs from its left edge) and
   * when the cat goes (`ends`).
   */
  open(bounds: Rect, query: Record<string, string>): FamiliarWindow
  /** Wall-clock time (ms), shared with the page. */
  now?: () => number
}

/** How often her page hears where she is, at most, while she moves (ms). */
export const SEE_EVERY_MS = 40

/**
 * Her familiar, the black cat (see FamiliarView): summoned for a minute from its icon, or visiting
 * as one of her habits. Its window is a strip along the taskbar of her display, which never takes
 * the mouse; it's told where she is and what she's doing as that changes (see), so the cat can
 * follow her and join in. It closes once the cat's time is up.
 */
export class Familiar {
  private current: {
    window: FamiliarWindow
    strip: Rect
    timer: ReturnType<typeof setTimeout>
    ends: number
  } | null = null
  private lastSeen = { at: Number.NEGATIVE_INFINITY, pose: '' as Pose | '' }

  constructor(private readonly deps: FamiliarDeps) {}

  get running(): boolean {
    return this.current !== null
  }

  /**
   * Brings the cat beside her (`standing`, from BubbleController) for `durationMs`. If it's here
   * already, it stays at least that long from now.
   */
  start(standing: { workArea: Rect; bounds: Rect; scale: number }, durationMs: number): void {
    const ends = this.now() + durationMs
    if (this.current) {
      if (ends <= this.current.ends) return
      clearTimeout(this.current.timer)
      this.current.ends = ends
      this.current.timer = setTimeout(() => this.stop(), durationMs)
      // Its page told at once that the cat's staying longer.
      this.lastSeen.at = Number.NEGATIVE_INFINITY
      this.see(standing.bounds, null)
      return
    }
    const strip = cloneStrip(standing.workArea, standing.scale)
    const middle = standing.bounds.x + standing.bounds.width / 2
    const window = this.deps.open(strip, {
      scale: String(standing.scale),
      from: String(Math.round(middle - strip.x)),
      ends: String(ends),
    })
    this.current = { window, strip, timer: setTimeout(() => this.stop(), durationMs), ends }
  }

  /**
   * Where she is (her window's bounds) and what she's doing (`pose`, or null if that's not what
   * changed), for the cat; at most every SEE_EVERY_MS while she just moves.
   */
  see(bounds: Rect, pose: Pose | null): void {
    const current = this.current
    if (!current) return
    const now = this.now()
    const changed = pose !== null && pose !== this.lastSeen.pose
    if (!changed && now - this.lastSeen.at < SEE_EVERY_MS) return
    if (pose !== null) this.lastSeen.pose = pose
    this.lastSeen.at = now
    current.window.send(IPC.familiarSees, {
      x: Math.round(bounds.x + bounds.width / 2 - current.strip.x),
      pose: pose ?? (this.lastSeen.pose || 'idle'),
      ends: current.ends,
    })
  }

  /** Sends the cat away now (closing its window), if it's here. */
  stop(): void {
    if (!this.current) return
    clearTimeout(this.current.timer)
    this.current.window.close()
    this.current = null
    this.lastSeen = { at: Number.NEGATIVE_INFINITY, pose: '' }
  }

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }
}
