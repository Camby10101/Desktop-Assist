// What the painters of the things round her (props/) draw with: the Scene, handed to each by the
// rig's draw() once she's drawn, and the marks several of them use.

import type { Pose } from '../rig'
import type { Canvas, Point } from '../raster'

/**
 * Where she is in the frame being drawn, and how to draw on it: what each painter in PROPS is
 * handed. Points are in the canvas's pixels.
 */
export interface Scene {
  /** What she's doing (the fields that ask for props: Pose in rig.ts). */
  pose: Pose
  /** The frame being drawn. */
  canvas: Canvas
  /** Sets one pixel to a palette letter (only over the letters in `only`, if given: `.` is empty). */
  set: (p: Point, letter: string, only?: string) => void
  /** A small pattern (rows of letters, `.` see-through) centred on `p`, only over `only`. */
  motif: (p: Point, rows: readonly string[], only: string) => void
  /** Her near hand. */
  hand: Point
  /** Her far hand, when it can be seen to hold things (from the front). */
  farHand: Point | null
  /** Her hips: the middle of her, low down. */
  hips: Point
  /** The middle of her head. */
  head: Point
  /** A point in her head's own frame, on the canvas (turned with her head). */
  onHead: (p: Point) => Point
  /** A point in her body's own frame, from her neck, on the canvas. */
  onBody: (p: Point) => Point
  /** A point moved as her hair is, by the wind and a fall (Pose.wind, Pose.lift). */
  blown: (p: Point) => Point
  /** How far a fall lifts her hair and robe (Pose.lift, 0 if not falling). */
  lift: number
}

/** Draws something round her, if the pose asks for it (most do nothing most of the time). */
export type Paint = (scene: Scene) => void

/** A four-pointed sparkle, and a smaller one. */
export const SPARKLE = ['..j..', '..l..', 'jlwlj', '..l..', '..j..']

export const TWINKLE = ['.l.', 'lwl', '.l.']

/** A gold twinkle, and a little gold star with a white heart. */
export const GOLD_TWINKLE = ['.Y.', 'YwY', '.Y.']

export const STAR = ['..Y..', '.YjY.', 'YjwjY', '.YjY.', 'Y...Y']

/** How far `t` is through the stretch from `from` to `to`: 0 before it, 1 after it. */
export const stage = (t: number, from: number, to: number) =>
  Math.min(1, Math.max(0, (t - from) / (to - from)))

/** A pixel's own random number, 0 to 1, the same every frame (`salt` for a second, different one). */
export function hash(x: number, y: number, salt = 0): number {
  let h = Math.imul(x + 1013 * salt, 374761393) ^ Math.imul(y + 7919, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
