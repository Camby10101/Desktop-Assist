// The toolkit her moves are made with: key poses (Key), the frames drawn from them (Frame, drawn),
// easing between poses (tween, mix), holding one (hold), a pose as a function of the time through
// a move (through, over), stock arm positions (ARM_DOWN, OUT_FRONT, OUT_SIDE, CUPPED), and Move:
// how a pose's frames are made and whether they go round (once, repeating).

import { type Pose as Name } from '@shared/character'
import { draw, LEG_LENGTH, type Arm, type Face, type Leg, type Pose } from '../rig'

/**
 * A frame as rows of letters (SPRITE_SIZE wide, SPRITE_SIZE + SPRITE_HEADROOM tall, the headroom
 * rows first), and how long it shows.
 */
export interface Frame {
  rows: string[]
  ms: number
}

/** A key pose and how long it shows. */
export interface Key {
  pose: Pose
  ms: number
}

/** Slow in, slow out. */
export const smooth = (t: number) => t * t * (3 - 2 * t)

export const lerp = (a = 0, b = 0, t: number) => a + (b - a) * t

export const mixArm = (a: Arm, b: Arm, t: number): Arm => ({
  shoulder: lerp(a.shoulder, b.shoulder, t),
  elbow: lerp(a.elbow, b.elbow, t),
})

export const mixLeg = (a: Leg, b: Leg, t: number): Leg => ({
  hip: lerp(a.hip, b.hip, t),
  knee: lerp(a.knee, b.knee, t),
})

export const ARM_DOWN: Arm = { shoulder: 0.08, elbow: 0.04 }

export const LEG_STAND: Leg = { hip: 0, knee: 0 }

/** Part of the way from pose `a` to pose `b`: numbers in between, the rest from the nearer one. */
export function mix(a: Pose, b: Pose, t: number): Pose {
  const [an = ARM_DOWN, af = ARM_DOWN] = a.arms ?? []
  const [bn = ARM_DOWN, bf = ARM_DOWN] = b.arms ?? []
  const [ln = LEG_STAND, lf = LEG_STAND] = a.legs ?? []
  const [mn = LEG_STAND, mf = LEG_STAND] = b.legs ?? []
  const near = t < 0.5 ? a : b
  return {
    ...near,
    view: a.view,
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    lean: lerp(a.lean, b.lean, t),
    tilt: lerp(a.tilt, b.tilt, t),
    look: lerp(a.look, b.look, t),
    wind: lerp(a.wind, b.wind, t),
    lift: lerp(a.lift, b.lift, t),
    rune: lerp(a.rune, b.rune, t),
    spin: lerp(a.spin, b.spin, t),
    spread: lerp(a.spread, b.spread, t),
    burst: lerp(a.burst, b.burst, t),
    arms: [mixArm(an, bn, t), mixArm(af, bf, t)],
    legs: [mixLeg(ln, mn, t), mixLeg(lf, mf, t)],
  }
}

/** In-betweens come about this often (ms): 25 frames a second. */
export const FRAME_MS = 40

/**
 * Frames easing from `a` to `b` (ending on `b`) over `ms`: one every FRAME_MS or so, their times
 * adding up to exactly `ms`.
 */
export function tween(a: Pose, b: Pose, ms: number): Key[] {
  const steps = Math.max(1, Math.round(ms / FRAME_MS))
  return Array.from({ length: steps }, (_, i) => ({
    pose: mix(a, b, smooth((i + 1) / steps)),
    ms: Math.round(((i + 1) * ms) / steps) - Math.round((i * ms) / steps),
  }))
}

export const hold = (pose: Pose, ms: number): Key[] => [{ pose, ms }]

/**
 * Legs bent so her feet stay on the ground with her hips `depth` pixels lower: the thigh and shin
 * at equal and opposite angles (outward from the front, forward side on).
 */
export function crouch(depth: number): [Leg, Leg] {
  const legs = LEG_LENGTH * 2
  const angle = Math.acos(Math.min(1, (legs - depth) / legs))
  const leg = { hip: angle, knee: angle * 2 }
  return [leg, leg]
}

export const FRONT: Pose = { view: 'front' }

export const DIAGONAL: Pose = { view: 'diagonal' }

/** Between 0 and 1: how far `t` is from `from` to `to`, eased in and out. */
export const between = (t: number, from: number, to: number) =>
  smooth(Math.min(1, Math.max(0, (t - from) / (to - from))))

/** How far through a span (as rig.ts's stage): 0 before it, 1 after it. */
export const span = (t: number, [from, to]: readonly [number, number]) =>
  Math.min(1, Math.max(0, (t - from) / (to - from)))

/** Her hands held out in front of her at her waist (from the front), for her cards. */
export const OUT_FRONT: Arm = { shoulder: 0.5, elbow: -1.45 }

/** Her hand held out to her side (from the front), clear of her robe, for her other toys. */
export const OUT_SIDE: Arm = { shoulder: 0.95, elbow: -0.4 }

/**
 * `ms` long, a frame about every FRAME_MS: `pose(t)` for each, `t` going from 0 to 1, their times
 * adding up to exactly `ms`.
 */
export function over(ms: number, pose: (t: number) => Pose): Key[] {
  const steps = Math.max(2, Math.round(ms / FRAME_MS))
  return Array.from({ length: steps }, (_, i) => ({
    pose: pose(i / (steps - 1)),
    ms: Math.round(((i + 1) * ms) / steps) - Math.round((i * ms) / steps),
  }))
}

/** Frames every FRAME_MS through a habit `ms` long, each made from how far through it is (0 to 1). */
export function through(ms: number, pose: (t: number) => Pose): Key[] {
  const steps = Math.round(ms / FRAME_MS)
  return Array.from({ length: steps }, (_, i) => ({ pose: pose(i / steps), ms: FRAME_MS }))
}

/** An arm part of the way (`share`, 0 to 1) from hanging down to `to`. */
export const toward = (to: Arm, share: number): Arm => ({
  shoulder: lerp(ARM_DOWN.shoulder, to.shoulder, share),
  elbow: lerp(ARM_DOWN.elbow, to.elbow, share),
})

/** Her forearms turned in and up, hands cupped together in front of her chest (from the front). */
export const CUPPED: Arm = { shoulder: 0.5, elbow: -1.45 }

/** A blink at `at` (a share of the habit) for a moment, otherwise `face`. */
export const blinking = (t: number, at: number, face: Face): Face =>
  t >= at && t < at + 0.03 ? 'blink' : face

export const drawn = (keys: Key[]): Frame[] =>
  keys.map(({ pose, ms }) => ({ rows: draw(pose), ms }))

/** The frame mirrored left to right. */
export function mirror(rows: string[]): string[] {
  return rows.map((row) => [...row].reverse().join(''))
}

/**
 * How a pose's frames are made: `frames` draws them (facing right), `loops` says whether they go
 * round and round (else they play once), and `left`, if there is one, draws them for facing left
 * before they're mirrored (for writing that has to read the right way round once mirrored).
 */
export interface Move {
  frames: () => Frame[]
  loops: boolean
  left?: () => Frame[]
}

/** Moves by pose: each file of moves exports one of these. */
export type Moves = Partial<Record<Name, Move>>

/** A move from key poses that plays once (`left`: see Move). */
export const once = (keys: () => Key[], left?: () => Key[]): Move => ({
  frames: () => drawn(keys()),
  loops: false,
  ...(left ? { left: () => drawn(left()) } : {}),
})

/** A move from key poses that goes round and round (`left`: see Move). */
export const repeating = (keys: () => Key[], left?: () => Key[]): Move => ({
  frames: () => drawn(keys()),
  loops: true,
  ...(left ? { left: () => drawn(left()) } : {}),
})
