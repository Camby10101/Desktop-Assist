import { isLeftCorner, isTopCorner, type Corner, type Point } from '@shared/geometry'
import type { TravelBox } from './layout'

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

/** Advances the motion by `dtMs`, reflecting off the edges of `box`. */
export function step(motion: Motion, dtMs: number, box: TravelBox): Motion {
  const dt = Math.min(Math.max(dtMs, 0), MAX_STEP_MS) / 1000
  const [x, vx] = reflect(motion.x + motion.vx * dt, motion.vx, box.minX, box.maxX)
  const [y, vy] = reflect(motion.y + motion.vy * dt, motion.vy, box.minY, box.maxY)
  return { x, y, vx, vy }
}

function reflect(position: number, velocity: number, min: number, max: number): [number, number] {
  if (max <= min) return [min, velocity]
  if (position < min) return [Math.min(min + (min - position), max), Math.abs(velocity)]
  if (position > max) return [Math.max(max - (position - max), min), -Math.abs(velocity)]
  return [position, velocity]
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
