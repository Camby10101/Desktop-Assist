import type { Rect } from '@shared/geometry'
import { SCREEN_SAVER, type SaverScene } from '@shared/screenSaver'
import { robeQuery } from './bubble/clones'

/** One of the screen saver's windows, as ScreenSaver uses it. index.ts makes them. */
export interface SaverWindow {
  /** Its page's id, to know its messages from anyone else's. */
  readonly id: number
  /** Tells its page to fade away. */
  end(): void
  close(): void
}

export interface ScreenSaverDeps {
  /** The tenant's accent colour, for her robe and hat... */
  accentColor: string
  /** ...unless another is chosen for her robe in Settings (`#rrggbb`, or null). */
  robeColor?: () => string | null
  /** Every display, the whole of it (the taskbar too). */
  displays(): { id: number; bounds: Rect }[]
  /** The display she's on. */
  herDisplay(): number
  /**
   * Opens a window over `bounds`, in front of everything, the taskbar included, its page told
   * (in its query string) which scene, when it started and the accent colour. The window on her
   * display takes the focus (`focus`), for the keyboard.
   */
  open(bounds: Rect, query: Record<string, string>, focus: boolean): SaverWindow
  /** It's starting: she vanishes, as the screens whiten. */
  onStart(): void
  /** It's over, the screens clear again: she comes back. */
  onEnd(): void
  /** Wall-clock time (ms), shared with the pages, which keep in time from it. */
  now?: () => number
}

/**
 * The screen saver (see shared/screenSaver.ts): a window over every display, the sunset on hers and
 * the starfall on the rest. Their pages say when the user's back (wakeFrom); then they fade away,
 * close, and she returns.
 */
export class ScreenSaver {
  private windows: SaverWindow[] = []
  private ending: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly deps: ScreenSaverDeps) {}

  get running(): boolean {
    return this.windows.length > 0
  }

  /** Covers every screen. Once is enough: starting it again while it's running does nothing. */
  start(): void {
    if (this.running) return
    const her = this.deps.herDisplay()
    const starts = String((this.deps.now ?? Date.now)())
    this.windows = this.deps.displays().map((display) => {
      const scene: SaverScene = display.id === her ? 'sunset' : 'stars'
      const query = {
        scene,
        starts,
        accent: this.deps.accentColor,
        ...robeQuery(this.deps.robeColor?.()),
      }
      return this.deps.open(display.bounds, query, display.id === her)
    })
    this.deps.onStart()
  }

  /**
   * Word from a page (by its id) that the user's back: the mouse moved, a click or a key. Only its
   * own windows' pages are listened to.
   */
  wakeFrom(senderId: number): void {
    if (this.windows.some((window) => window.id === senderId)) this.stop()
  }

  /** Fades the scenes away, then closes their windows, and she comes back. */
  stop(): void {
    if (!this.running || this.ending) return
    for (const window of this.windows) window.end()
    this.ending = setTimeout(() => this.close(true), SCREEN_SAVER.fadeOutMs)
  }

  /** Closes its windows at once (the app is quitting). */
  dispose(): void {
    this.close(false)
  }

  private close(comeBack: boolean): void {
    if (this.ending) clearTimeout(this.ending)
    this.ending = null
    const wasRunning = this.running
    for (const window of this.windows) window.close()
    this.windows = []
    if (wasRunning && comeBack) this.deps.onEnd()
  }
}
