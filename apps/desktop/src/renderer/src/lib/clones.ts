import { FIDGET_MS, type Pose } from '@shared/character'
import type { Facing } from '../character/sprite'

// How her clones wander (see ClonesView): each stands a moment, walks somewhere else along the
// taskbar, stands again, and so on, every one on its own timetable. Positions are DIPs from the
// left edge of the clones' window to the left edge of a clone's box.

export interface Clone {
  x: number
  /** Where it's walking to (when `walking`). */
  target: number
  /** Its walking speed (DIP per second). */
  speed: number
  facing: Facing
  walking: boolean
  /** Waving (her wave habit) while it stands, for once. */
  waving: boolean
  /** When it sets off again (when standing): ms, on the same clock as `now` below. */
  waitUntil: number
}

/** The room they have: the window's width, a clone's box, and her size. */
export interface Room {
  width: number
  box: number
  scale: number
}

export const CLONE_WALK = {
  /** Walking speed at her usual size (DIP per second), varied a little for each clone... */
  speed: 80,
  /** ...by up to this much either way. */
  speedSpread: 0.25,
  /** A stop lasts this long (ms, from-to). */
  pause: [300, 2000],
  /** Shorter walks aren't worth it (DIP at her usual size). */
  minWalk: 60,
  /** How often a clone waves when it stops (instead of just standing), 0 to 1. */
  waveChance: 0.2,
  /** The first set off one after another, this far apart (ms)... */
  stagger: 120,
  /** ...each up to this much later still (ms), so they don't leave in a line. */
  scatter: 900,
} as const

/**
 * `count` clones, all standing where she stands (`from`), each about to set off a moment after
 * the last, facing either way.
 */
export function spawnClones(
  count: number,
  from: number,
  now: number,
  room: Room,
  random: () => number,
): Clone[] {
  const x = Math.min(Math.max(from, 0), Math.max(0, room.width - room.box))
  return Array.from({ length: count }, (_, i) => ({
    x,
    target: x,
    speed: CLONE_WALK.speed * room.scale,
    facing: random() < 0.5 ? 'left' : 'right',
    walking: false,
    waving: false,
    waitUntil: now + 150 + i * CLONE_WALK.stagger + random() * CLONE_WALK.scatter,
  }))
}

/**
 * A clone a frame later (`dtMs` on, at `now`): walking on toward its target and stopping there
 * for a while (now and then waving, as she does), or, its stop over, setting off somewhere else at
 * a speed of its own.
 */
export function stepClone(
  clone: Clone,
  now: number,
  dtMs: number,
  room: Room,
  random: () => number,
): Clone {
  if (clone.walking) {
    const step = (clone.speed * Math.min(Math.max(dtMs, 0), 100)) / 1000
    const x =
      clone.target > clone.x
        ? Math.min(clone.target, clone.x + step)
        : Math.max(clone.target, clone.x - step)
    if (x !== clone.target) return { ...clone, x }
    // Arrived: now and then it waves (for as long as her wave takes), otherwise it just stands.
    const waving = random() < CLONE_WALK.waveChance
    const [shortest, longest] = CLONE_WALK.pause
    return {
      ...clone,
      x,
      walking: false,
      waving,
      waitUntil: now + (waving ? FIDGET_MS.wave : shortest + random() * (longest - shortest)),
    }
  }
  if (now < clone.waitUntil) return clone
  const target = walkTarget(clone.x, room, random())
  // Nowhere far enough to go: it stands a little longer (and stops waving, if it was).
  if (target === clone.x) {
    return { ...clone, waving: false, waitUntil: now + CLONE_WALK.pause[0] }
  }
  const spread = 1 + (random() * 2 - 1) * CLONE_WALK.speedSpread
  return {
    ...clone,
    target,
    walking: true,
    waving: false,
    facing: target > clone.x ? 'right' : 'left',
    speed: CLONE_WALK.speed * room.scale * spread,
  }
}

/**
 * Somewhere else along the window to walk to, at least CLONE_WALK.minWalk away (at her size)
 * when there's room: `roll` (0–1) picks among the places far enough away, either side.
 */
export function walkTarget(x: number, room: Room, roll: number): number {
  const far = Math.max(0, room.width - room.box)
  const minWalk = Math.min(CLONE_WALK.minWalk * room.scale, far / 2)
  const before = Math.max(0, x - minWalk)
  const after = Math.max(0, far - (x + minWalk))
  if (before + after === 0) return x
  const along = roll * (before + after)
  return along < before ? along : x + minWalk + (along - before)
}

/** What a clone looks like doing what it's doing: walking its way, waving, or standing. */
export function clonePose(clone: Clone): Pose {
  if (clone.waving) return 'wave'
  if (!clone.walking) return 'idle'
  return clone.facing === 'right' ? 'walk-right' : 'walk-left'
}
