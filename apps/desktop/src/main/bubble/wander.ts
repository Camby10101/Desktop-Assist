import { FIDGETS, type Fidget } from '@shared/character'
import type { Point } from '@shared/geometry'

// What the character does on its own while nobody is using it, and how it falls when dropped.
// Positions along the taskbar are "insets": how far the character stands from its corner (0 is
// right in the corner, growing toward the middle of the screen).

export const WANDER = {
  /** How far from its corner the character wanders (DIP). */
  zone: 240,
  /** Walking speed (DIP per second). */
  walkSpeed: 80,
  /** Shorter walks aren't worth it. */
  minWalk: 40,
  /** The first thing it does after settling comes this long after (ms, from-to)... */
  firstDelay: [5000, 12000],
  /** ...and then one thing every so often. */
  delay: [8000, 20000],
  /** Fidgets only once it's been left alone this long (ms). */
  fidgetAfter: 30_000,
  /** Falling after a drop (DIP per second squared). */
  gravity: 2500,
} as const

export type Activity = { kind: 'walk'; to: number } | { kind: 'fidget'; pose: Fidget }

/** How long until the next thing the character does on its own (ms). */
export function activityDelay(random: () => number, first: boolean): number {
  const [from, to] = first ? WANDER.firstDelay : WANDER.delay
  return from + random() * (to - from)
}

/**
 * What to do next, after being left alone for `idleMs`, standing `inset` from her corner with
 * room to wander up to `zone` (WANDER.zone, or less on a narrow screen). Until she's been alone a
 * while she only strolls about; after that, more often than not she does one of her fidgets
 * instead, any but the one she did last (`last`), so she doesn't repeat herself.
 */
export function nextActivity(
  idleMs: number,
  inset: number,
  zone: number,
  random: () => number,
  last?: Fidget,
): Activity {
  if (idleMs >= WANDER.fidgetAfter && random() < 0.6) {
    const choices = FIDGETS.filter((fidget) => fidget !== last)
    return { kind: 'fidget', pose: choices[Math.floor(random() * choices.length)]! }
  }
  return { kind: 'walk', to: walkTarget(inset, zone, random()) }
}

/**
 * Somewhere else in the zone to walk to, at least WANDER.minWalk away when the zone allows: `roll`
 * (0–1) picks the spot among those that are far enough.
 */
export function walkTarget(inset: number, zone: number, roll: number): number {
  const from = Math.min(Math.max(inset, 0), zone)
  // The stretches of the zone far enough away: before the character, and after it.
  const before = Math.max(0, from - WANDER.minWalk)
  const after = Math.max(0, zone - (from + WANDER.minWalk))
  if (before + after === 0) return zone - from > from ? zone : 0 // a tiny zone: the far end
  const along = roll * (before + after)
  return along < before ? along : from + WANDER.minWalk + (along - before)
}

/** One frame of walking: `dtMs` closer to `to` at walking speed, never past it. */
export function walkStep(from: number, to: number, dtMs: number): number {
  const step = (WANDER.walkSpeed * Math.min(Math.max(dtMs, 0), 100)) / 1000
  return to > from ? Math.min(to, from + step) : Math.max(to, from - step)
}

/**
 * How long the fall from `from` to `to` takes (ms): as long as gravity takes to drop that far, or
 * a short hop when it was dropped below where it stands (over the taskbar).
 */
export function fallDuration(from: Point, to: Point): number {
  const drop = to.y - from.y
  if (drop <= 0) return 200
  return Math.max(150, Math.sqrt((2 * drop) / WANDER.gravity) * 1000)
}

/** Position at progress `t` (0–1) of the fall: speeding up as it falls, like a dropped thing. */
export function fallPosition(from: Point, to: Point, t: number): Point {
  const progress = Math.min(Math.max(t, 0), 1)
  const falling = to.y > from.y
  const eased = falling ? progress ** 2 : 1 - (1 - progress) ** 2
  return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * eased }
}
