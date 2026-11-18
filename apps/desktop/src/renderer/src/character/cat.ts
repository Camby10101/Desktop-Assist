import { Canvas, Layer, type Point, type Ramp } from './raster'
import { mirror } from './sprite'

// Her familiar: a little black cat with gold eyes, drawn the way she is (raster.ts: shapes
// filled, shaded away from the light and outlined, as rows of palette letters; see PALETTE in
// sprite.ts), side on, facing right, on a grid of CAT_SIZE, its paws on the bottom row. Its
// poses: sitting (tail swishing, a blink), walking, curled up asleep, washing a paw, hopping
// about, and a puff of smoke (appearing and vanishing).

/** The cat's grid, square (pixels): its paws on the bottom row. */
export const CAT_SIZE = 32

export type CatPose = 'sit' | 'walk' | 'loaf' | 'groom' | 'hop' | 'puff'

export interface CatFrame {
  rows: string[]
  ms: number
}

/** Black fur: the darkest outline and shade, a dark base, a little lighter in the light. */
const RAMPS: Record<string, Ramp> = {
  fur: { line: 'u', shade: 'u', base: 'Q', light: 'o', form: 0.3 },
  // Smoke: white, shaded silver, outlined in grey so it shows on a light screen too.
  smoke: { line: 'D', shade: 'f', base: 'l', light: 'w' },
}
const LIGHT: Point = { x: -1, y: -1 }
const GROUND = CAT_SIZE - 1.4

/** A little "z", for sleeping. */
const Z = ['ffff', '..f.', '.f..', 'ffff']

interface Drawing {
  kind: Exclude<CatPose, 'puff'>
  /** How far through its cycle (0 to 1). */
  phase: number
  blink?: boolean
}

/** One frame of the cat, as rows of palette letters. */
export function drawCat({ kind, phase, blink }: Drawing): string[] {
  const canvas = new Canvas(CAT_SIZE)
  const ink = (layer: Layer) => canvas.ink(layer, RAMPS, LIGHT)
  const set = (p: Point, letter: string) => canvas.set(Math.floor(p.x), Math.floor(p.y), letter)
  const turn = phase * Math.PI * 2
  const sway = Math.sin(turn)

  if (kind === 'walk' || kind === 'hop') {
    const lift = kind === 'hop' ? Math.sin(phase * Math.PI) * 6 : 0
    const bob = kind === 'walk' ? Math.abs(Math.sin(turn)) * 0.6 : 0
    const y = 24.5 - lift - bob
    const stride = kind === 'walk' ? Math.sin(turn) * 2.4 : 0
    const tail = new Layer(CAT_SIZE)
    tail.chain(
      [
        { x: 7, y: y - 1.5 },
        { x: 4.5, y: y - 5 },
        { x: 3.6 + sway * 0.8, y: y - 9 },
        { x: 5.2 + sway, y: y - 11.5 },
      ],
      1.2,
      0.8,
      'fur',
    )
    ink(tail)
    // The far legs first, behind; then the body, the near legs and the head.
    const far = new Layer(CAT_SIZE)
    const foot = kind === 'hop' ? y + 4.5 : GROUND
    far.capsule(
      { x: 18, y: y + 1 },
      { x: 18 - stride + (kind === 'hop' ? 3 : 0), y: foot },
      1.1,
      1,
      'fur',
    )
    far.capsule(
      { x: 8.5, y: y + 1 },
      { x: 8.5 + stride - (kind === 'hop' ? 3 : 0), y: foot },
      1.2,
      1,
      'fur',
    )
    ink(far)
    const body = new Layer(CAT_SIZE)
    body.ellipse({ x: 14, y }, 7.5, 3.8, 'fur')
    body.capsule(
      { x: 19, y: y + 1 },
      { x: 19 + stride + (kind === 'hop' ? 4 : 0), y: foot },
      1.2,
      1,
      'fur',
    )
    body.capsule(
      { x: 9.5, y: y + 1 },
      { x: 9.5 - stride - (kind === 'hop' ? 4 : 0), y: foot },
      1.3,
      1,
      'fur',
    )
    ink(body)
    drawHead(canvas, ink, set, { x: 22.5, y: y - 5 }, blink ?? false)
    return canvas.rows()
  }

  if (kind === 'loaf') {
    const breath = Math.sin(turn) * 0.3
    const tail = new Layer(CAT_SIZE)
    tail.chain(
      [
        { x: 7.5, y: 29.5 },
        { x: 13, y: 30.6 },
        { x: 19, y: 30.6 },
        { x: 22.5, y: 29.8 },
      ],
      1.1,
      1,
      'fur',
    )
    const body = new Layer(CAT_SIZE)
    body.ellipse({ x: 15, y: 27.4 - breath }, 8, 3.8 + breath, 'fur')
    ink(body)
    ink(tail)
    const head = new Layer(CAT_SIZE)
    head.ellipse({ x: 21.5, y: 26 }, 4, 3.3, 'fur')
    head.polygon(
      [
        { x: 18.6, y: 24.2 },
        { x: 19.4, y: 21.4 },
        { x: 21, y: 23.2 },
      ],
      'fur',
    )
    head.polygon(
      [
        { x: 21.8, y: 23 },
        { x: 23.6, y: 21.2 },
        { x: 23.9, y: 24.2 },
      ],
      'fur',
    )
    ink(head)
    // Eyes shut (a gold line), a pink nose, and z's rising.
    set({ x: 22.5, y: 26 }, 'k')
    set({ x: 23.5, y: 26 }, 'k')
    set({ x: 25, y: 27 }, 'c')
    const z = (phase * 2) % 1
    canvas.stamp(Z, Math.round(24 + z * 3), Math.round(19 - z * 8))
    return canvas.rows()
  }

  // Sitting (or washing a paw): haunches, chest, front legs, the tail curled round beside it.
  const tail = new Layer(CAT_SIZE)
  tail.chain(
    [
      { x: 9, y: 29.2 },
      { x: 6, y: 29.6 },
      { x: 4, y: 28 },
      { x: 4.4 + sway, y: 25 },
      { x: 6 + sway * 1.2, y: 23.4 },
    ],
    1.3,
    0.9,
    'fur',
  )
  ink(tail)
  const body = new Layer(CAT_SIZE)
  body.ellipse({ x: 12.5, y: 27 }, 5.5, 4.3, 'fur')
  body.ellipse({ x: 17.2, y: 23 }, 3.4, 5.6, 'fur')
  body.capsule({ x: 17.2, y: 25 }, { x: 17.4, y: GROUND }, 1.2, 1.1, 'fur')
  if (kind === 'groom') {
    // A front paw up at its mouth, licked, up and down a little.
    body.capsule({ x: 19, y: 23.5 }, { x: 21.8, y: 18.4 + Math.sin(turn * 2) * 0.6 }, 1.1, 1, 'fur')
  } else {
    body.capsule({ x: 19, y: 25 }, { x: 19.3, y: GROUND }, 1.1, 1, 'fur')
  }
  ink(body)
  const tilt = kind === 'groom' ? 1 : 0
  drawHead(canvas, ink, set, { x: 19.6, y: 15.2 + tilt }, kind === 'groom' || (blink ?? false))
  return canvas.rows()
}

/** Its head at `at` (the middle of it): ears, a gold eye (shut: a line), a pink nose, whiskers. */
function drawHead(
  canvas: Canvas,
  ink: (layer: Layer) => void,
  set: (p: Point, letter: string) => void,
  at: Point,
  shut: boolean,
): void {
  const head = new Layer(CAT_SIZE)
  head.ellipse(at, 4.6, 4, 'fur')
  head.polygon(
    [
      { x: at.x - 3.3, y: at.y - 2 },
      { x: at.x - 2.7, y: at.y - 6.4 },
      { x: at.x - 0.5, y: at.y - 3.4 },
    ],
    'fur',
  )
  head.polygon(
    [
      { x: at.x + 0.5, y: at.y - 3.6 },
      { x: at.x + 2.9, y: at.y - 6.6 },
      { x: at.x + 3.5, y: at.y - 2.4 },
    ],
    'fur',
  )
  ink(head)
  set({ x: at.x + 2.3, y: at.y - 4.4 }, 'c')
  if (shut) {
    set({ x: at.x + 1.5, y: at.y - 0.3 }, 'k')
    set({ x: at.x + 2.5, y: at.y - 0.3 }, 'k')
  } else {
    set({ x: at.x + 1.5, y: at.y - 0.8 }, 'Y')
    set({ x: at.x + 2.5, y: at.y - 0.8 }, 'u')
    set({ x: at.x + 1.5, y: at.y + 0.2 }, 'Y')
    set({ x: at.x + 2.5, y: at.y + 0.2 }, 'Y')
  }
  set({ x: at.x + 4.4, y: at.y + 0.9 }, 'c')
  set({ x: at.x + 5.3, y: at.y + 1.9 }, 'D')
  set({ x: at.x + 6.2, y: at.y + 1.6 }, 'D')
}

/**
 * A puff of smoke, `t` (0 to 1) through: billows of white smoke swelling out from the middle,
 * sparkles in them, then thinning away to wisps.
 */
function drawPuff(t: number): string[] {
  const canvas = new Canvas(CAT_SIZE)
  const smoke = new Layer(CAT_SIZE)
  const grow = Math.min(1, t / 0.5)
  for (const [dx, dy, r] of [
    [0, 0, 4.5],
    [-5, 1.5, 3.5],
    [5, 1.5, 3.5],
    [-2.5, -3.5, 3.2],
    [3, -3.5, 3.2],
  ] as const) {
    smoke.ellipse(
      { x: 16 + dx * (0.6 + grow * 0.6), y: 24 + dy * (0.6 + grow * 0.6) },
      r * (0.4 + grow * 0.7),
      r * (0.4 + grow * 0.6),
      'smoke',
    )
  }
  canvas.ink(smoke, RAMPS, LIGHT)
  // Thinning away: more and more of it gone.
  if (t > 0.5) {
    const gone = (t - 0.5) / 0.5
    const rows = canvas.rows()
    rows.forEach((row, y) =>
      [...row].forEach((letter, x) => {
        const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0
        if (letter !== '.' && (hash % 100) / 100 < gone) canvas.set(x, y, '.')
      }),
    )
  }
  if (t < 0.75) {
    for (const [dx, dy] of [
      [-6, -4],
      [6, -2],
      [0, -8],
    ] as const) {
      canvas.set(16 + Math.round(dx * (0.7 + t)), 24 + Math.round(dy * (0.7 + t)), 'Y')
    }
  }
  return canvas.rows()
}

const made = new Map<string, CatFrame[]>()

/** A pose's frames, facing `facing`: drawn the first time they're asked for, then kept. */
export function catFrames(pose: CatPose, facing: 'left' | 'right'): CatFrame[] {
  const key = `${pose}:${facing}`
  let frames = made.get(key)
  if (frames) return frames
  const right = made.get(`${pose}:right`) ?? makeCat(pose)
  made.set(`${pose}:right`, right)
  frames = facing === 'right' ? right : right.map((f) => ({ rows: mirror(f.rows), ms: f.ms }))
  made.set(key, frames)
  return frames
}

/** How long a puff of smoke lasts (ms). */
export const PUFF_MS = 480

function makeCat(pose: CatPose): CatFrame[] {
  const cycle = (count: number, ms: number, draw: (phase: number, i: number) => string[]) =>
    Array.from({ length: count }, (_, i) => ({ rows: draw(i / count, i), ms }))
  switch (pose) {
    case 'sit':
      return cycle(12, 130, (phase, i) => drawCat({ kind: 'sit', phase, blink: i === 7 }))
    case 'walk':
      return cycle(8, 80, (phase) => drawCat({ kind: 'walk', phase }))
    case 'loaf':
      return cycle(8, 260, (phase) => drawCat({ kind: 'loaf', phase }))
    case 'groom':
      return cycle(8, 150, (phase) => drawCat({ kind: 'groom', phase }))
    case 'hop':
      return cycle(8, 70, (phase) => drawCat({ kind: 'hop', phase }))
    case 'puff':
      return cycle(6, PUFF_MS / 6, (phase) => drawPuff(phase))
  }
}
