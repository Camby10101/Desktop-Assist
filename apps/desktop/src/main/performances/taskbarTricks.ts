import { bubbleMetrics, UI, type Point, type Rect } from '@shared/geometry'
import { iconOf, trickFrame, type TrickName, type TrickPlan } from '@shared/tricks'
import type { Performance } from '../bubble/BubbleController'
import type { PhysicalRect, TaskbarButton } from '../shell/probe'
import type { Standing } from './performances'

/** A display as the tricks need it (Electron's, in DIPs, and how many pixels a DIP is). */
export interface TrickDisplay {
  id: number
  bounds: Rect
  workArea: Rect
  scaleFactor: number
}

/** A screenshot of a display, to cut its taskbar icons out of: a part of it (physical pixels) as a PNG data URL. */
export interface Screenshot {
  crop(rect: PhysicalRect): string
}

export interface TaskbarTricksDeps {
  /** The taskbars' buttons (physical pixels): ShellProbe.taskbar. */
  taskbar(): Promise<TaskbarButton[]>
  /** Physical pixels to DIPs (on the screen). */
  toDip(rect: PhysicalRect): Rect
  /** The display at a point. */
  displayAt(point: Point): TrickDisplay
  /** A screenshot of a display, or null if it can't be taken. */
  capture(display: TrickDisplay): Promise<Screenshot | null>
  /**
   * Opens the trick's window over `bounds`, its page told (in its query string) when it began, and
   * given `trick` (its plan and icons, JSON) when it asks: too much for a query string.
   */
  open(bounds: Rect, query: Record<string, string>, trick: string): { close(): void }
  random: () => number
  now?: () => number
}

/** Buttons that aren't apps' (by the names Windows gives them), left alone. */
const NOT_APPS = /^(start|search|task view|widgets|copilot|chat|show hidden icons|show desktop)\b/i

/**
 * The apps' buttons on a display's taskbar (at its bottom), left to right, in DIPs: squarish ones
 * as tall as the taskbar nearly, not the Start button, search, task view or widgets, and not the
 * little icons by the clock.
 */
export function appButtons(
  buttons: readonly TaskbarButton[],
  display: TrickDisplay,
  toDip: (rect: PhysicalRect) => Rect,
): Rect[] {
  const bottom = display.workArea.y + display.workArea.height
  const height = display.bounds.y + display.bounds.height - bottom
  if (height < 16) return []
  return buttons
    .filter((b) => !NOT_APPS.test(b.name.trim()))
    .map((b) => toDip(b.rect))
    .filter((r) => {
      const inside =
        r.x >= display.bounds.x &&
        r.x + r.width <= display.bounds.x + display.bounds.width &&
        r.y >= bottom - 2
      const squarish = r.width / r.height > 0.7 && r.width / r.height < 1.35
      return inside && squarish && r.height >= height * 0.7
    })
    .sort((a, b) => a.x - b.x)
}

/** Runs of `count` buttons side by side (each next to the last), left to right. */
export function runsOf(buttons: readonly Rect[], count: number): Rect[][] {
  const runs: Rect[][] = []
  for (let i = 0; i + count <= buttons.length; i++) {
    const run = buttons.slice(i, i + count)
    if (run.every((b, k) => k === 0 || b.x - (run[k - 1]!.x + run[k - 1]!.width) < 8))
      runs.push(run)
  }
  return runs
}

/**
 * Her tricks with the taskbar's icons (see shared/tricks.ts): getting one ready finds the apps'
 * buttons on her display's taskbar, picks the icons it needs, cuts them out of a screenshot (with
 * a strip of plain taskbar beside each, to cover the real one while it's out), and opens the trick's
 * window over the bottom of the screen. Nothing on the taskbar is touched.
 */
export class TaskbarTricks {
  constructor(private readonly deps: TaskbarTricksDeps) {}

  async prepare(name: TrickName, standing: Standing): Promise<Performance | null> {
    const display = this.deps.displayAt({
      x: standing.bounds.x + standing.bounds.width / 2,
      y: standing.bounds.y + standing.bounds.height / 2,
    })
    const buttons = appButtons(await this.deps.taskbar(), display, this.deps.toDip)
    const count = name === 'juggle-icons' ? 3 : name === 'swap' ? 2 : 1
    const runs = runsOf(buttons, count)
    if (runs.length === 0) return null
    const slots = runs[Math.floor(this.deps.random() * runs.length)]!
    const screenshot = await this.deps.capture(display)
    if (!screenshot) return null

    const { scale, box } = standing
    const size = bubbleMetrics(scale).size
    const area = display.workArea
    const middle = slots.reduce((sum, s) => sum + s.x + s.width / 2, 0) / slots.length
    const plan: TrickPlan = {
      name,
      size,
      ground: box.y,
      from: box.x,
      scale,
      slots,
      side: middle < display.bounds.x + display.bounds.width / 2 ? 1 : -1,
      minX: area.x + UI.edgeMargin,
      maxX: area.x + area.width - UI.edgeMargin - size,
    }
    // Physical pixels of the screenshot, for a part of the screen in DIPs.
    const physical = (r: Rect): PhysicalRect => ({
      x: Math.round((r.x - display.bounds.x) * display.scaleFactor),
      y: Math.round((r.y - display.bounds.y) * display.scaleFactor),
      width: Math.max(1, Math.round(r.width * display.scaleFactor)),
      height: Math.max(1, Math.round(r.height * display.scaleFactor)),
    })
    const icons = slots.map((slot) => {
      const icon = iconOf(slot)
      return screenshot.crop(
        physical({
          x: icon.x - icon.size / 2,
          y: icon.y - icon.size / 2,
          width: icon.size,
          height: icon.size,
        }),
      )
    })
    // A strip of the button's own background, just inside its left edge, stretched over it.
    const patches = slots.map((slot) =>
      screenshot.crop(physical({ x: slot.x + 2, y: slot.y, width: 2, height: slot.height })),
    )

    const top = Math.max(display.bounds.y, plan.ground - 200 * scale)
    const band = {
      x: display.bounds.x,
      y: top,
      width: display.bounds.width,
      height: display.bounds.y + display.bounds.height - top,
    }
    const window = this.deps.open(
      band,
      { starts: String((this.deps.now ?? Date.now)()) },
      JSON.stringify({ plan, icons, patches }),
    )
    return {
      at: (t) => {
        const frame = trickFrame(plan, t)
        return frame.done ? null : frame.her
      },
      end: () => window.close(),
    }
  }
}
