import type { Painter } from '../pixels'

// What the screen saver's scenes have in common (see ScreenSaverView): the frame they're drawn
// from, banded skies dithered from one colour into the next, and lines of rolling hills.

/** What a frame of a scene is drawn from. */
export interface SaverFrame {
  /** Since the scene began to show (ms). */
  t: number
  /** The canvas's size (pixels). */
  w: number
  h: number
}

/**
 * An ordered (2 × 2 Bayer) dither: whether the pixel at `x`, `y` takes the next colour when
 * `share` (0 to 1) of them do. A quarter, a half and three quarters make even checks.
 */
export function dither(x: number, y: number, share: number): boolean {
  const order = (y & 1) === 0 ? ((x & 1) === 0 ? 0 : 2) : (x & 1) === 0 ? 3 : 1
  return (order + 0.5) / 4 < share
}

/**
 * A sky of `colours` in bands, from the top of the canvas down to `bottom` (and the last colour
 * below it), each band dithered into the next over its lower rows, a quarter, a half, then three
 * quarters of the pixels.
 */
export function paintBands(
  p: Painter,
  w: number,
  h: number,
  colours: readonly string[],
  bottom: number,
): void {
  const last = colours.length - 1
  for (let y = 0; y < h; y++) {
    const along = Math.min(1, y / bottom) * last
    const band = Math.min(last, Math.floor(along))
    const into = along - band
    p.rect(0, y, w, 1, colours[band]!, 1)
    if (band >= last) continue
    const share = into < 0.55 ? 0 : into < 0.7 ? 0.25 : into < 0.85 ? 0.5 : 0.75
    if (share === 0) continue
    for (let x = 0; x < w; x++) {
      if (dither(x, y, share)) p.rect(x, y, 1, 1, colours[band + 1]!, 1)
    }
  }
}

/** A line of hills: how far down its tops are, how much they rise and fall, and their colours. */
export interface Hill {
  /** Its middle height, and how far it rises and falls about it (shares of the canvas's height). */
  base: number
  amp: number
  /** Three waves added together: how many to a canvas's height, and where each starts (radians). */
  waves: readonly (readonly [number, number])[]
  /** Its colour, a deeper one lower down, and the light along its top. */
  body: string
  deep: string
  rim: string
}

/** How far down the canvas `hill`'s top is, at `x` (pixels): its waves are the same at any width. */
export function hillTop(hill: Hill, x: number, h: number): number {
  const u = x / h
  const weights = [0.6, 0.3, 0.1]
  let rise = 0
  hill.waves.forEach(([count, phase], i) => {
    rise += weights[i]! * Math.sin(u * count * Math.PI * 2 + phase)
  })
  return h * hill.base + h * hill.amp * rise
}

/**
 * A line of hills down to the bottom of the canvas, a column of pixels at a time: its colour, a
 * deeper one over its lower part, and a rim of light along its top, as bright as `rim(x)` (0 to 1).
 * `top(x)` says where its top is.
 */
export function paintHill(
  p: Painter,
  hill: Hill,
  w: number,
  h: number,
  top: (x: number) => number,
  rim: (x: number) => number,
): void {
  for (let x = 0; x < w; x++) {
    const y = Math.round(top(x))
    p.rect(x, y, 1, h - y, hill.body, 1)
    const deep = Math.round(y + (h - y) * 0.4)
    p.rect(x, deep, 1, h - deep, hill.deep, 1)
    if (dither(x, deep - 1, 0.5)) p.rect(x, deep - 1, 1, 1, hill.deep, 1)
    const light = rim(x)
    p.rect(x, y, 1, 1, hill.rim, light)
    p.rect(x, y + 1, 1, 1, hill.rim, light * 0.35)
  }
}
