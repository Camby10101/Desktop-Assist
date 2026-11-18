import {
  LANDING,
  PORTAL,
  PORTAL_BACK_MS,
  PORTAL_MS,
  SPELL_POSE_MS,
  type Pose,
} from '@shared/character'
import { bubbleMetrics, UI, type Point, type Rect } from '@shared/geometry'
import type { Performance } from '../bubble/BubbleController'
import { fallDuration, impactSpeed, isHardLanding } from '../bubble/wander'
import type { PhysicalRect, ShellWindow, WindowNow } from '../shell/probe'
import type { Standing } from './performances'
import type { TrickDisplay } from './taskbarTricks'

// Her tricks with the windows on the screen (looked at, never touched): peeking round the edge of
// one that comes down to the taskbar near her (she goes behind it: her window is clipped where it
// is), and waving through a portal she opens on top of one, which goes along with it if it's
// dragged, and drops her if it goes.

/** A window she can use: where it is (DIPs) and how to ask after it. */
export interface UsableWindow {
  handle: number
  rect: Rect
}

/** Classes of windows that aren't apps' (the desktop, the taskbars). */
const NOT_APPS = new Set(['Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'Progman', 'WorkerW'])

/**
 * The windows she might use on her display: apps' (not hers, the desktop or the taskbars), in
 * their normal state (not maximised, minimised or filling the screen), and big enough.
 */
export function usableWindows(
  windows: readonly ShellWindow[],
  display: TrickDisplay,
  ownPid: number,
  toDip: (rect: PhysicalRect) => Rect,
): UsableWindow[] {
  const area = display.workArea
  return windows
    .filter(
      (w) =>
        w.state === 'normal' &&
        w.pid !== ownPid &&
        !NOT_APPS.has(w.className) &&
        w.name.trim() !== '',
    )
    .map((w) => ({ handle: w.handle, rect: toDip(w.rect) }))
    .filter(({ rect: r }) => {
      const middle = { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      const onDisplay =
        middle.x >= display.bounds.x &&
        middle.x < display.bounds.x + display.bounds.width &&
        middle.y >= display.bounds.y &&
        middle.y < display.bounds.y + display.bounds.height
      const fills = r.width >= area.width - 10 && r.height >= area.height - 10
      return onDisplay && !fills && r.width >= 200 && r.height >= 150
    })
}

/** A peek: the window, its edge she peeks round (its x), and which side of it she's outside on. */
export interface PeekPlan {
  window: UsableWindow
  edge: number
  /** 1: she's outside to the right of it (its right edge); -1: to the left (its left edge). */
  side: 1 | -1
}

/**
 * The window edge she can peek round, if there's one: a window that comes down over the taskbar
 * height she stands at (covering at least her top half), with room for her beside its edge on the
 * outside; the edge nearest her, within `reach` DIPs of her.
 */
export function peekEdge(
  windows: readonly UsableWindow[],
  standing: Standing,
  reach: number,
): PeekPlan | null {
  const size = bubbleMetrics(standing.scale).size
  const area = standing.workArea
  const ground = standing.box.y
  let best: (PeekPlan & { distance: number }) | null = null
  for (const window of windows) {
    const r = window.rect
    const covers = r.y + r.height >= ground + size * 0.45 && r.y <= ground + size * 0.2
    if (!covers) continue
    for (const side of [1, -1] as const) {
      const edge = side === 1 ? r.x + r.width : r.x
      const outside =
        side === 1
          ? edge + size + UI.edgeMargin <= area.x + area.width
          : edge - size - UI.edgeMargin >= area.x
      if (!outside) continue
      const distance = Math.abs(edge - (standing.box.x + size / 2))
      if (distance > reach) continue
      if (!best || distance < best.distance) best = { window, edge, side, distance }
    }
  }
  return best ? { window: best.window, edge: best.edge, side: best.side } : null
}

/** A peek's timetable (ms): going there, slipping behind, peeking, coming out, and going back. */
export const PEEK = { walk: 130, behindMs: 900, peekMs: 3600, outMs: 900, teleport: 360 } as const

interface Step {
  ms: number
  at: (u: number) => { x: number; pose: Pose }
}

/** Walking her box from one x to another (or by magic if it's far), as steps. */
function goSteps(from: number, to: number, scale: number): Step[] {
  const distance = Math.abs(to - from)
  if (distance < 2) return []
  if (distance > PEEK.teleport * scale) {
    return [
      { ms: SPELL_POSE_MS.vanish, at: () => ({ x: from, pose: 'vanish' }) },
      { ms: SPELL_POSE_MS.appear, at: () => ({ x: to, pose: 'appear' }) },
    ]
  }
  const pose: Pose = to < from ? 'walk-left' : 'walk-right'
  return [
    {
      ms: (distance / (PEEK.walk * scale)) * 1000,
      at: (u) => ({ x: from + (to - from) * u, pose }),
    },
  ]
}

/** The steps of a peek: where her box is (x) and her pose, step by step. */
export function peekSteps(plan: PeekPlan, standing: Standing): Step[] {
  const { scale } = standing
  const size = bubbleMetrics(scale).size
  // Outside, beside the edge; behind it with a little of her showing, peeking out.
  const pad = UI.bubblePad * scale
  const outside = plan.side === 1 ? plan.edge + pad + 2 * scale : plan.edge - size - pad - 2 * scale
  const peeking = plan.side === 1 ? plan.edge - size * 0.62 : plan.edge - size * 0.38
  const inward: Pose = plan.side === 1 ? 'walk-left' : 'walk-right'
  const outward: Pose = plan.side === 1 ? 'walk-right' : 'walk-left'
  const peekPose: Pose = plan.side === 1 ? 'peek-right' : 'peek-left'
  return [
    ...goSteps(standing.box.x, outside, scale),
    { ms: PEEK.behindMs, at: (u) => ({ x: outside + (peeking - outside) * u, pose: inward }) },
    { ms: PEEK.peekMs, at: () => ({ x: peeking, pose: peekPose }) },
    { ms: PEEK.outMs, at: (u) => ({ x: peeking + (outside - peeking) * u, pose: outward }) },
    ...goSteps(outside, standing.box.x, scale),
  ]
}

/** Where a timeline of steps is at `t`, or null once it's over. */
export function stepAt(steps: readonly Step[], t: number): { x: number; pose: Pose } | null {
  let left = t
  for (const step of steps) {
    if (left < step.ms) return step.at(step.ms > 0 ? left / step.ms : 1)
    left -= step.ms
  }
  return null
}

/** A portal: the window, and where along its top it opens (DIPs from its left edge to her box's). */
export interface PortalPlan {
  window: UsableWindow
  along: number
}

/**
 * A window she can open a portal on, if there's one: its top edge well above the taskbar (with room
 * above it on the screen for the portal), wide enough; the one whose top is nearest above her, the
 * portal at the point along it nearest her.
 */
export function portalSpot(
  windows: readonly UsableWindow[],
  standing: Standing,
): PortalPlan | null {
  const size = bubbleMetrics(standing.scale).size
  const area = standing.workArea
  const ground = standing.box.y
  const candidates = windows.filter(
    ({ rect: r }) =>
      r.y >= area.y + size * 1.1 && r.y <= ground - size * 0.6 && r.width >= size * 2.6,
  )
  if (candidates.length === 0) return null
  const her = standing.box.x
  const nearest = candidates.reduce((a, b) => {
    const distance = (w: UsableWindow) =>
      Math.abs(Math.min(Math.max(her, w.rect.x), w.rect.x + w.rect.width - size) - her)
    return distance(b) < distance(a) ? b : a
  })
  const r = nearest.rect
  const along = Math.min(Math.max(her, r.x + 10), r.x + r.width - size - 10) - r.x
  return { window: nearest, along }
}

/** How often the window under her portal is asked after, so the portal goes along with it (ms). */
export const PORTAL_WATCH_MS = 100

export interface WindowTricksDeps {
  windows(): Promise<ShellWindow[]>
  window(handle: number): Promise<WindowNow>
  toDip(rect: PhysicalRect): Rect
  displayAt(point: Point): TrickDisplay
  /** Her page is told what's in front of her (a window's rect, DIPs), to hide her behind it; null: nothing. */
  occlude(rect: Rect | null): void
  /** This app's process, whose windows are hers (never used). */
  ownPid: number
  now?: () => number
}

/**
 * Her tricks with the windows on the screen: peeking round one (see peekEdge) and waving through a
 * portal on top of one (see portalSpot). Getting one ready asks the shell for the windows; while it's under way the
 * window is asked after now and then, so she goes along with it, or stops if it goes.
 */
export class WindowTricks {
  constructor(private readonly deps: WindowTricksDeps) {}

  private async usable(standing: Standing): Promise<UsableWindow[]> {
    const display = this.deps.displayAt({
      x: standing.bounds.x + standing.bounds.width / 2,
      y: standing.bounds.y + standing.bounds.height / 2,
    })
    return usableWindows(await this.deps.windows(), display, this.deps.ownPid, this.deps.toDip)
  }

  /** Watches a window every `ms`: where it is now, or null once it's gone (closed, minimised or maximised). */
  private watch(handle: number, ms: number): { now: () => Rect | null; stop: () => void } {
    let rect: Rect | null | undefined = undefined
    let stopped = false
    const look = async () => {
      if (stopped) return
      try {
        const seen = await this.deps.window(handle)
        rect = seen.state === 'normal' && seen.rect ? this.deps.toDip(seen.rect) : null
      } catch {
        rect = null
      }
      if (!stopped && rect !== null) timer = setTimeout(() => void look(), ms)
    }
    let timer = setTimeout(() => void look(), ms)
    return {
      now: () => (rect === undefined ? undefined : rect) as Rect | null,
      stop: () => {
        stopped = true
        clearTimeout(timer)
      },
    }
  }

  async peek(standing: Standing): Promise<Performance | null> {
    const plan = peekEdge(await this.usable(standing), standing, 700 * standing.scale)
    if (!plan) return null
    const steps = peekSteps(plan, standing)
    const watching = this.watch(plan.window.handle, 250)
    const first = plan.window.rect
    let shown: Rect | null = null
    return {
      at: (t) => {
        const step = stepAt(steps, t)
        if (!step) return null
        const now = watching.now()
        // The window moved, or went: the peek's off.
        if (
          now === null ||
          (now &&
            (Math.abs(now.x - first.x) > 2 ||
              Math.abs(now.y - first.y) > 2 ||
              Math.abs(now.width - first.width) > 2))
        ) {
          return null
        }
        if (shown === null) {
          shown = first
          this.deps.occlude(first)
        }
        return { x: step.x, y: standing.box.y, pose: step.pose }
      },
      end: () => {
        watching.stop()
        this.deps.occlude(null)
      },
    }
  }

  /**
   * Waving through a portal on top of a window: she vanishes from the taskbar, a portal opens on
   * the window's top edge and she waves through it a while (her `portal` pose, PORTAL_MS), and then
   * she appears back home. Clicked meanwhile, she goes back at once: she sinks away, the portal
   * closes (her `portal-back` pose, PORTAL_BACK_MS), and she appears back home. Dragged, the window
   * takes the portal (and her) with it; minimised, maximised or closed, it drops her to the
   * taskbar, hard from up there.
   */
  async portal(standing: Standing): Promise<Performance | null> {
    const plan = portalSpot(await this.usable(standing), standing)
    if (!plan) return null
    const size = bubbleMetrics(standing.scale).size
    const watching = this.watch(plan.window.handle, PORTAL_WATCH_MS)
    const home = standing.box
    let window = plan.window.rect
    // Dropped (the window went): from where, when, how long the fall takes and how hard she lands.
    let fall: { from: Point; at: number; ms: number; hard: boolean } | null = null
    // Clicked in the portal: when she started going back.
    let back: number | null = null
    const pad = UI.bubblePad * standing.scale
    // Her box with her feet (the portal's foot) on the window's top edge.
    const top = () => ({ x: window.x + plan.along, y: window.y - size - pad + 2 * standing.scale })
    const vanish = SPELL_POSE_MS.vanish
    const appear = SPELL_POSE_MS.appear
    return {
      at: (t) => {
        if (fall) {
          const since = t - fall.at
          if (since < fall.ms) {
            const u = since / fall.ms
            return {
              x: fall.from.x,
              y: fall.from.y + (home.y - fall.from.y) * u * u,
              pose: 'flung',
            }
          }
          if (fall.hard && since < fall.ms + LANDING.splatMs)
            return { x: fall.from.x, y: home.y, pose: 'splat' }
          return null
        }
        // Vanishing from the taskbar.
        if (t < vanish) return { x: home.x, y: home.y, pose: 'vanish' }
        // The portal's open until it closes on its own, or sooner if she was sent back.
        const closes = back === null ? vanish + PORTAL_MS : back + PORTAL_BACK_MS
        if (t < closes) {
          const now = watching.now()
          if (now) window = now
          const spot = top()
          if (now === null) {
            // The window's gone from under the portal: she drops to the taskbar.
            const drop = home.y - spot.y
            fall = {
              from: spot,
              at: t,
              ms: fallDuration({ x: 0, y: 0 }, { x: 0, y: Math.max(0, drop) }),
              hard: isHardLanding(impactSpeed(drop)),
            }
            return { x: spot.x, y: spot.y, pose: 'flung' }
          }
          return { ...spot, pose: back === null ? 'portal' : 'portal-back' }
        }
        // The portal's closed: she appears back home.
        if (t < closes + appear) return { x: home.x, y: home.y, pose: 'appear' }
        return null
      },
      clicked: (t) => {
        // Before the portal opens, and once she's falling or home again, a click is just a click.
        if (fall || t < vanish) return false
        if (back !== null) return t < back + PORTAL_BACK_MS + appear // already on her way
        const sinking = vanish + PORTAL.openMs + PORTAL.riseMs + PORTAL.waveMs
        if (t >= vanish + PORTAL_MS) return false
        // Still waving (or rising): she goes back now. Sinking already: she's going anyway.
        if (t < sinking) back = t
        return true
      },
      end: () => watching.stop(),
    }
  }
}
