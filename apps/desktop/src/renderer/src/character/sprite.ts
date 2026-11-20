import type { Pose as Name } from '@shared/character'
import { gaze } from './moves/basics'
import { MOVES } from './moves'
import { drawn, mirror, type Frame } from './moves/kit'
import { PALETTE } from './palette'
import { draw, GRID, HEADROOM, wearHat, wearsHat, type Face } from './rig'

export { PALETTE } from './palette'
export { mirror } from './moves/kit'
export type { Frame } from './moves/kit'

// The character's animations: for each pose, a list of frames drawn by the rig (rig.ts) from key
// poses and the in-betweens eased between them. She's an original design: an elf mage with long
// pointed ears, long silver-white hair, amber eyes, a wide-brimmed crooked hat and a long robe in
// the tenant's accent colour. Frames are drawn the first time a pose is needed, then kept.
//
// Where things are:
// - every pose's move (how its frames are made, and whether it goes round): moves/, one file for
//   each kind (her habits by their HABITS `kind`), all listed in moves/index.ts;
// - the things she holds and the effects round her (toys, spells, visitors): props/, drawn by the
//   rig as a pose asks for them;
// - her colours: palette.ts (letters to CSS classes) and components/character.css.
// See docs/CUSTOMIZING.md for adding a habit.

/**
 * The grid's size in pixels: 96 wide, and 96 tall below the headroom, filling the bubble's window,
 * one pixel a DIP at her usual size (more at a bigger size; see CHARACTER_SIZES).
 */
export const SPRITE_SIZE = GRID

/** Rows above the grid, for her hat when she rises: a frame is this much taller than it's wide. */
export const SPRITE_HEADROOM = HEADROOM

/**
 * Watching the pointer, from the front: her eyes (and a little of her head) toward `gaze`, each
 * of x and y -1, 0 or 1 (left or up is -1). A frame each, drawn once and kept.
 */
const gazes = new Map<string, Frame>()

export function gazeFrame(gaze: { x: number; y: number }): Frame {
  const x = Math.max(-1, Math.min(1, Math.round(gaze.x)))
  const y = Math.max(-1, Math.min(1, Math.round(gaze.y)))
  const key = `${x},${y}`
  let frame = gazes.get(key)
  if (!frame) {
    const face: Face = y < 0 ? 'up' : y > 0 ? 'down' : 'neutral'
    frame = { rows: draw({ view: 'front', look: x, face, tilt: x * 0.04 }), ms: 1000 }
    gazes.set(key, frame)
  }
  return frame
}

let gazing: Frame[] | null = null

/**
 * Puts her hat on or takes it off (Settings → No hat): frames drawn from now on have it or not,
 * and those drawn already are forgotten, to be drawn again when they're asked for.
 */
export function setHat(on: boolean): void {
  if (wearsHat() === on) return
  wearHat(on)
  made.clear()
  shown.clear()
  gazes.clear()
  gazing = null
}

/** Her frames watching the sunset, from behind (see gaze): round and round. Drawn once, then kept. */
export function gazeFrames(): Frame[] {
  gazing ??= drawn(gaze())
  return gazing
}

/** Whether a pose's animation repeats (the habits and reactions play once). See moves/. */
export const LOOPS = Object.fromEntries(
  Object.entries(MOVES).map(([pose, move]) => [pose, move.loops]),
) as Record<Name, boolean>

export type Facing = 'left' | 'right'

const made = new Map<string, Frame[]>()

/** Which way a pose faces: poses with a way in their name (walking, pouncing, peeking) face that way. */
const wayOf = (pose: Name, facing: Facing): Facing =>
  pose.endsWith('-left') ? 'left' : pose.endsWith('-right') ? 'right' : facing

/** A pose's frames drawn facing `way` (from `right`, its frames facing right, if they're drawn). */
function drawFacing(pose: Name, way: Facing, right?: Frame[]): Frame[] {
  const move = MOVES[pose]
  if (way === 'right') return right ?? move.frames()
  return (move.left?.() ?? right ?? move.frames()).map((f) => ({ rows: mirror(f.rows), ms: f.ms }))
}

/**
 * A pose's frames, facing `facing` (walking faces the way she walks, whatever `facing` says).
 * Drawn the first time they're asked for, then kept.
 */
export function framesOf(pose: Name, facing: Facing): Frame[] {
  const way = wayOf(pose, facing)
  const key = `${pose}:${way}`
  let frames = made.get(key)
  if (!frames) {
    const right = made.get(`${pose}:right`) ?? MOVES[pose].frames()
    made.set(`${pose}:right`, right)
    frames = drawFacing(pose, way, right)
    made.set(key, frames)
  }
  return frames
}

/** A frame ready to show: its SVG paths (see framePaths), and how long it shows. */
export interface ShownFrame {
  paths: { className: string; d: string }[]
  ms: number
}

const shown = new Map<string, ShownFrame[]>()

/**
 * A pose's frames as framesOf has them, ready to show as SVG paths: what Character plays. Only
 * the paths are kept, not the frames' letters (nor her frames facing the other way), so her page
 * holds much less: all her poses' frames come to some thousands.
 */
export function shownFrames(pose: Name, facing: Facing): ShownFrame[] {
  const way = wayOf(pose, facing)
  const key = `${pose}:${way}`
  let frames = shown.get(key)
  if (!frames) {
    frames = drawFacing(pose, way).map((f) => ({ paths: framePaths(f.rows), ms: f.ms }))
    shown.set(key, frames)
  }
  return frames
}

/** How long a pose's frames last altogether (a habit's must match its HABITS `ms`). */
export const animationLength = (pose: Name): number =>
  framesOf(pose, 'right').reduce((total, f) => total + f.ms, 0)

/**
 * A frame as one SVG path per colour, each a set of rectangles: a run of same-coloured pixels
 * along a row, carried on down the rows below for as long as they have the same run. So a frame
 * is a few dozen elements rather than thousands, and its paths are short.
 */
export function framePaths(rows: string[]): { className: string; d: string }[] {
  const byColour = new Map<string, string[]>()
  // Runs still going down the rows (colour, start and end along the row): the row each began on.
  let open = new Map<string, number>()
  const close = (run: string, top: number, bottom: number) => {
    const [pixel, x, end] = run.split('|') as [string, string, string]
    const width = Number(end) - Number(x)
    const rects = byColour.get(pixel) ?? []
    rects.push(`M${x} ${top}h${width}v${bottom - top}h-${width}z`)
    byColour.set(pixel, rects)
  }
  rows.forEach((row, y) => {
    const runs = new Map<string, number>()
    let x = 0
    while (x < row.length) {
      const pixel = row[x]!
      let end = x + 1
      while (end < row.length && row[end] === pixel) end++
      if (pixel !== '.') {
        const run = `${pixel}|${x}|${end}`
        runs.set(run, open.get(run) ?? y)
      }
      x = end
    }
    for (const [run, top] of open) if (!runs.has(run)) close(run, top, y)
    open = runs
  })
  for (const [run, top] of open) close(run, top, rows.length)
  return [...byColour].map(([pixel, rects]) => ({
    className: PALETTE[pixel] ?? 'px-hair-line',
    d: rects.join(''),
  }))
}
