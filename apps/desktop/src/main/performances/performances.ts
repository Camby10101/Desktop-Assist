import { bubbleMetrics, type Point, type Rect } from '@shared/geometry'
import type { Displays, Performance, Performer } from '../bubble/BubbleController'
import type { PerformanceName } from '../bubble/wander'

/** Where she stands as a performance begins (BubbleController.standingBox). */
export interface Standing {
  workArea: Rect
  bounds: Rect
  scale: number
  /** Her box's top-left (DIP). */
  box: Point
}

/** Watching the pointer: how long for (ms). */
export const WATCH_MS = 10_000

/** Which way she looks at the pointer: each of x and y -1, 0 or 1 (left and up are -1). */
export interface Gaze {
  x: number
  y: number
}

/**
 * Which way to look from her eyes (`eyes`, DIP) to the pointer: straight ahead while it's within
 * a little of her eyes either way (`near`), otherwise toward it.
 */
export function gazeAt(eyes: Point, pointer: Point, near: number): Gaze {
  const dx = pointer.x - eyes.x
  const dy = pointer.y - eyes.y
  return {
    x: Math.abs(dx) < near ? 0 : Math.sign(dx),
    y: dy < -near * 1.5 ? -1 : dy > near * 1.5 ? 1 : 0,
  }
}

/** Something that can get a performance ready (one of the kinds below). */
export type Prepare = (standing: Standing) => Promise<Performance | null>

export interface PerformancesDeps {
  displays: Pick<Displays, 'cursor'>
  /** Tells her page which way to look while she watches the pointer (null: done watching). */
  onGaze(gaze: Gaze | null): void
  /** The other performances there are (the familiar, the taskbar tricks, windows), by name. */
  more?: Partial<Record<PerformanceName, { prepare: Prepare; moves: boolean }>>
}

/**
 * Her performances (see Performer): watching the pointer, here, and whatever else is plugged in
 * (`more`): the familiar's visit, the taskbar tricks, peeking round and riding on windows.
 */
export class Performances implements Performer {
  constructor(private readonly deps: PerformancesDeps) {}

  available(canMove: boolean): readonly PerformanceName[] {
    const more = Object.entries(this.deps.more ?? {}) as [
      PerformanceName,
      { prepare: Prepare; moves: boolean },
    ][]
    return ['watch', ...more.filter(([, p]) => canMove || !p.moves).map(([name]) => name)]
  }

  async prepare(name: PerformanceName, standing: Standing): Promise<Performance | null> {
    if (name === 'watch') return this.watch(standing)
    const more = this.deps.more?.[name]
    return more ? more.prepare(standing) : null
  }

  /**
   * Watching the pointer for WATCH_MS where she stands: her eyes follow it (her page is told
   * which way, whenever that changes).
   */
  private watch(standing: Standing): Performance {
    const size = bubbleMetrics(standing.scale).size
    const eyes = { x: standing.box.x + size / 2, y: standing.box.y + size * 0.35 }
    let last = ''
    return {
      at: (t) => {
        if (t >= WATCH_MS) return null
        const gaze = gazeAt(eyes, this.deps.displays.cursor(), size * 0.35)
        const key = `${gaze.x},${gaze.y}`
        if (key !== last) {
          last = key
          this.deps.onGaze(gaze)
        }
        return { x: standing.box.x, y: standing.box.y, pose: 'watch' }
      },
      end: () => this.deps.onGaze(null),
    }
  }
}
