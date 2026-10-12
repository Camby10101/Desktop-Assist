import { UI, isLeftCorner, isTopCorner, type Corner, type Point, type Rect } from '@shared/geometry'
import { travelBox } from './layout'

/** Position (DIP) and velocity (DIP per second) of the bouncing bubble. */
export interface Motion {
  x: number
  y: number
  vx: number
  vy: number
}

export const BOUNCE_SPEED = 280
/** Longer gaps (e.g. the machine was asleep) are treated as one short step. */
const MAX_STEP_MS = 100

/** Sets off away from the bubble's corner, into the screen, at a random 25°–65° angle. */
export function launch(
  from: Point,
  random: () => number = Math.random,
  corner: Corner = 'bottom-right',
  speed = BOUNCE_SPEED,
): Motion {
  const angle = ((25 + random() * 40) * Math.PI) / 180
  const dx = isLeftCorner(corner) ? 1 : -1
  const dy = isTopCorner(corner) ? 1 : -1
  return {
    x: from.x,
    y: from.y,
    vx: dx * speed * Math.cos(angle),
    vy: dy * speed * Math.sin(angle),
  }
}

/**
 * Advances the motion by `dtMs` across `areas` (the work areas of all the displays), reflecting
 * off their outer edges. The bubble can be anywhere it's wholly on screen, so it crosses from one
 * display to the next where they meet, and bounces off an edge with no display beyond it (such as
 * the part of a taller monitor's side that a shorter one doesn't reach).
 */
export function step(motion: Motion, dtMs: number, areas: Rect[]): Motion {
  const dt = Math.min(Math.max(dtMs, 0), MAX_STEP_MS) / 1000
  const start = onScreen(motion, areas)
  // One direction at a time, so hitting a side wall only turns the bubble sideways.
  const [x, vx] = reflect(start.x, motion.vx * dt, motion.vx, (x) => fits(x, start.y, areas))
  const [y, vy] = reflect(start.y, motion.vy * dt, motion.vy, (y) => fits(x, y, areas))
  return { x, y, vx, vy }
}

/** Whether the bubble at (x, y) is wholly inside the displays' work areas. */
function fits(x: number, y: number, areas: Rect[]): boolean {
  const size = UI.bubbleSize
  // Its corners, the middle of each side and its centre: enough to catch a gap between displays.
  for (const px of [x, x + size / 2, x + size]) {
    for (const py of [y, y + size / 2, y + size]) {
      const inside = areas.some(
        (a) => px >= a.x && px <= a.x + a.width && py >= a.y && py <= a.y + a.height,
      )
      if (!inside) return false
    }
  }
  return true
}

/**
 * The position after moving `delta` along one direction from `from` (where the bubble fits),
 * with the velocity: reflected off the wall it would have gone through.
 */
function reflect(
  from: number,
  delta: number,
  velocity: number,
  fitsAt: (position: number) => boolean,
): [number, number] {
  const to = from + delta
  if (fitsAt(to)) return [to, velocity]
  // Find the wall: the furthest point towards `to` where the bubble still fits.
  let inside = from
  let outside = to
  while (Math.abs(outside - inside) > 0.001) {
    const middle = (inside + outside) / 2
    if (fitsAt(middle)) inside = middle
    else outside = middle
  }
  const back = inside - (to - inside)
  return [fitsAt(back) ? back : inside, -velocity]
}

/**
 * The bubble's position if it fits on screen; otherwise (a display was unplugged or shrank
 * mid-bounce) the nearest place on the closest display.
 */
function onScreen(position: Point, areas: Rect[]): Point {
  if (areas.length === 0 || fits(position.x, position.y, areas)) return position
  const placed = areas.map((area) => {
    const box = travelBox(area)
    const x = Math.min(Math.max(position.x, box.minX), Math.max(box.minX, box.maxX))
    const y = Math.min(Math.max(position.y, box.minY), Math.max(box.minY, box.maxY))
    return { x, y, distance: Math.hypot(x - position.x, y - position.y) }
  })
  const nearest = placed.reduce((best, p) => (p.distance < best.distance ? p : best))
  return { x: nearest.x, y: nearest.y }
}

/** Glide length scales with distance, kept between 0.3 s and 0.9 s. */
export function glideDuration(from: Point, to: Point): number {
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  return Math.min(900, Math.max(300, distance / 1.5))
}

/** Position at progress `t` (0–1) along the glide home, easing out as it settles. */
export function glidePosition(from: Point, to: Point, t: number): Point {
  const progress = Math.min(Math.max(t, 0), 1)
  const eased = 1 - (1 - progress) ** 3
  return { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased }
}
