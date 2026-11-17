import { disc, plot, type Painter } from '../pixels'
import { noise, seeded } from '../spellMotion'
import { dither, hillTop, paintBands, paintHill, type Hill, type SaverFrame } from './scene'

// The screen saver's sunset, on her screen (see ScreenSaverView): a banded evening sky, violet to
// gold, a few stars still out at its top; the sun low over the hills, drifting very slightly and
// glowing, stripes of sky sliding down through it; long clouds drifting slowly across, lit pink
// and gold from below; four lines of rolling hills, hazy in the distance, rimmed with light; and
// on the crest of the nearest, her, watching it (lib/screensaver/her.ts), birds gliding by and
// fireflies over the grass. In pixels of the canvas (some 360 of them high), times in ms.

/** The sky, from the top down to the horizon: night, violet, rose, coral, gold. */
export const SUNSET_SKY = [
  '#1b1838',
  '#251c4a',
  '#33205a',
  '#462467',
  '#5c2a72',
  '#76307a',
  '#93387e',
  '#b0437e',
  '#cb5479',
  '#e2686f',
  '#f08466',
  '#f7a462',
  '#fbc56c',
  '#fde19a',
] as const

/** The sun's rows, from its top (pale gold) down to its bottom (orange). */
const SUN_ROWS = ['#fff7d1', '#fff0b3', '#ffe28f', '#ffd277', '#ffbf66', '#ffa95c', '#ff9257']

/** The hills, far to near: hazy mauve in the distance, deepening to a dark green-blue at hand. */
export const HILLS: readonly Hill[] = [
  {
    base: 0.575,
    amp: 0.016,
    waves: [
      [3.1, 0.4],
      [7.3, 2.1],
      [15.7, 4.4],
    ],
    body: '#a65a82',
    deep: '#9a5280',
    rim: '#ffb08a',
  },
  {
    base: 0.64,
    amp: 0.028,
    waves: [
      [2.2, 2.6],
      [5.1, 0.9],
      [11.3, 3.1],
    ],
    body: '#71407a',
    deep: '#663a72',
    rim: '#f2937f',
  },
  {
    base: 0.73,
    amp: 0.035,
    waves: [
      [1.6, 4.2],
      [3.9, 1.3],
      [8.9, 5.5],
    ],
    body: '#3d3a64',
    deep: '#35335a',
    rim: '#d97c84',
  },
  {
    base: 0.87,
    amp: 0.03,
    waves: [
      [1.2, 1.1],
      [2.9, 3.8],
      [6.4, 2.6],
    ],
    body: '#1f2d40',
    deep: '#1a2738',
    rim: '#c76f74',
  },
]

/** Where the sun sets and where she stands, across the canvas (shares of its width). */
export const SUNSET = { sunX: 0.6, herX: 0.4 }

/** How far down the horizon is: where the sky is brightest, just under the farthest hills. */
export const horizon = (h: number): number => Math.round(h * 0.6)

/**
 * How far down the canvas a line of hills' top is at `x` (0 is the farthest, 3 the nearest). The
 * nearest rises to a crest where she stands.
 */
export function ridge(layer: number, x: number, w: number, h: number): number {
  const top = hillTop(HILLS[layer]!, x, h)
  if (layer < HILLS.length - 1) return top
  const crest = h * 0.085 * Math.exp(-(((x - w * SUNSET.herX) / (h * 0.5)) ** 2))
  return top - crest
}

/** Where she stands: on the crest of the nearest hill, left of the sun (`feet`, her soles' row). */
export function herSpot(w: number, h: number): { x: number; feet: number } {
  const x = Math.round(w * SUNSET.herX)
  return { x, feet: Math.round(ridge(HILLS.length - 1, x, w, h)) + 1 }
}

/** The sun at `t`: low over the hills, half behind the farthest, drifting very slightly. */
export function sunAt(t: number, w: number, h: number): { x: number; y: number; r: number } {
  return {
    x: w * SUNSET.sunX + Math.sin(t / 17_000) * 1.2,
    y: horizon(h) - h * 0.065 + Math.sin(t / 9_000) * 1.5,
    r: h * 0.11,
  }
}

/** Whether a row this far down the sun (-1 its top, 1 its bottom) is a stripe of sky at `t`. */
export function stripeAt(depth: number, t: number): boolean {
  if (depth < 0.05) return false
  // Four to the sun's height, thicker lower down, sliding down one place every eight seconds.
  const place = (depth * 4 - t / 8_000) % 1
  return (place + 1) % 1 < 0.1 + depth * 0.3
}

/** A cloud: where its flat underside is, and the humps along it. */
export interface Cloud {
  x: number
  y: number
  /** Each hump's offset along it, length and height (pixels). */
  humps: { dx: number; length: number; height: number }[]
  /** Its colour, and the light underneath it (from the sun below). */
  body: string
  light: string
}

/** How many clouds there are. */
export const CLOUD_COUNT = 8

/**
 * The clouds at `t`: long and low, spread down the sky from the top to near the horizon, each
 * drifting slowly right at its own pace and round again. Purple high up, rose and coral lower,
 * gold underneath near the sun.
 */
export function cloudsAt(t: number, w: number, h: number): Cloud[] {
  const random = seeded(11)
  const low = horizon(h)
  return Array.from({ length: CLOUD_COUNT }, (_, k) => {
    const y = Math.round(h * (0.1 + (0.38 * k) / (CLOUD_COUNT - 1)) + (random() - 0.5) * h * 0.04)
    const length = Math.round(h * (0.18 + random() * 0.22))
    const height = 3 + Math.floor(random() * 3)
    // A pixel or two a second at this size: crossing the screen takes minutes.
    const speed = (0.7 + random() * 1.3) * (h / 360)
    const span = w + length * 2
    const start = random() * span
    const humps = [
      { dx: 0, length, height },
      {
        dx: Math.round(length * (0.1 + random() * 0.15)),
        length: Math.round(length * 0.42),
        height: height + 3 + Math.floor(random() * 3),
      },
      {
        dx: Math.round(length * (0.45 + random() * 0.15)),
        length: Math.round(length * 0.34),
        height: height + 2 + Math.floor(random() * 3),
      },
      {
        dx: Math.round(length * (0.7 + random() * 0.1)),
        length: Math.round(length * 0.22),
        height: height + 1,
      },
    ]
    const share = y / low
    const [body, light] =
      share < 0.35
        ? ['#6a3479', '#a3568f']
        : share < 0.6
          ? ['#9a4279', '#df6f80']
          : share < 0.8
            ? ['#cf5e7a', '#f8a580']
            : ['#ee8a72', '#ffd896']
    return { x: ((start + (speed * t) / 1000) % span) - length, y, humps, body, light }
  })
}

/** The sky, behind everything (it never changes, so it's painted once). */
export function paintSunsetSky(p: Painter, w: number, h: number): void {
  paintBands(p, w, h, SUNSET_SKY, horizon(h))
}

/** The stars still out at the top of the sky, twinkling, fainter lower down. */
export function paintEveningStars(p: Painter, frame: SaverFrame): void {
  const { t, w, h } = frame
  const random = seeded(5)
  for (let k = 0; k < 60; k++) {
    const x = random() * w
    const y = random() * h * 0.3
    const phase = random() * Math.PI * 2
    const glow = 0.45 + 0.55 * Math.sin(t / 900 + phase) ** 2
    const fade = 1 - y / (h * 0.3)
    plot(p, x, y, '#fff7e6', glow * fade * 0.9)
    if (k % 7 === 0 && glow > 0.85) {
      plot(p, x - 1, y, '#f9d5ff', fade * 0.5)
      plot(p, x + 1, y, '#f9d5ff', fade * 0.5)
      plot(p, x, y - 1, '#f9d5ff', fade * 0.5)
      plot(p, x, y + 1, '#f9d5ff', fade * 0.5)
    }
  }
}

/**
 * The sun at `t`: its glow, breathing slowly; a haze of its light along the horizon; and the sun
 * itself, a row at a time, stripes of sky sliding down through its lower half.
 */
export function paintSun(p: Painter, frame: SaverFrame): void {
  const { t, w, h } = frame
  const sun = sunAt(t, w, h)
  const breath = 1 + Math.sin(t / 2_300) * 0.03
  disc(p, sun.x, sun.y, sun.r * 3.9 * breath, sun.r * 2.4 * breath, '#ff8f7a', 0.07)
  disc(p, sun.x, sun.y, sun.r * 2.7 * breath, sun.r * 1.9 * breath, '#ffb27a', 0.09)
  disc(p, sun.x, sun.y, sun.r * 1.7 * breath, sun.r * 1.5 * breath, '#ffd9a0', 0.14)
  disc(p, sun.x, horizon(h) - 3, w * 0.55, h * 0.05, '#ffd39a', 0.16)
  const r = sun.r
  for (let dy = -Math.floor(r); dy <= Math.floor(r); dy++) {
    const half = r * Math.sqrt(Math.max(0, 1 - (dy / r) ** 2))
    if (half < 0.5 || stripeAt(dy / r, t)) continue
    const share = (dy + r) / (2 * r)
    const colour = SUN_ROWS[Math.min(SUN_ROWS.length - 1, Math.floor(share * SUN_ROWS.length))]!
    p.rect(Math.round(sun.x - half), Math.round(sun.y + dy), Math.round(half * 2), 1, colour, 1)
  }
}

/**
 * The clouds at `t`, each hump a row at a time from its underside up to its rounded top: lit along
 * the bottom by the sun below, the light dithered up into the cloud's colour.
 */
export function paintClouds(p: Painter, frame: SaverFrame): void {
  for (const cloud of cloudsAt(frame.t, frame.w, frame.h)) {
    for (const hump of cloud.humps) {
      for (let row = 0; row < hump.height; row++) {
        const across = hump.length * Math.sqrt(1 - (row / hump.height) ** 2)
        const left = Math.round(cloud.x + hump.dx + (hump.length - across) / 2)
        const y = cloud.y - row
        p.rect(left, y, Math.round(across), 1, row < 2 ? cloud.light : cloud.body, 1)
        if (row !== 2) continue
        for (let x = left; x < left + Math.round(across); x++) {
          if (dither(x, y, 0.5)) p.rect(x, y, 1, 1, cloud.light, 1)
        }
      }
    }
  }
}

/**
 * The hills (they never change, so they're painted once), far to near, each rimmed with light,
 * brightest toward the sun; grass along the top of the nearest, a few flowers in it, and her long
 * shadow falling toward us down its slope from where she stands.
 */
export function paintSunsetHills(p: Painter, w: number, h: number): void {
  const sunX = w * SUNSET.sunX
  const towardSun = (x: number) => Math.exp(-(((x - sunX) / (w * 0.32)) ** 2))
  HILLS.forEach((hill, layer) => {
    paintHill(
      p,
      hill,
      w,
      h,
      (x) => ridge(layer, x, w, h),
      (x) => 0.35 + 0.6 * towardSun(x),
    )
  })
  const near = HILLS.length - 1
  const hill = HILLS[near]!
  const random = seeded(17)
  // Grass: tufts along the top, a pixel to three high, their tips catching the light.
  for (let x = 0; x < w; x += 2 + Math.floor(random() * 3)) {
    const top = Math.round(ridge(near, x, w, h))
    const tall = 1 + Math.floor(random() * 3)
    for (let k = 1; k <= tall; k++) {
      p.rect(x, top - k, 1, 1, k === tall ? hill.rim : hill.body, k === tall ? 0.8 : 1)
    }
  }
  // Flowers in the grass, dim with the sun behind them.
  const flowers = ['#7d4f7e', '#8e6a62', '#6e5a8a']
  for (let k = 0; k < 70; k++) {
    const x = Math.floor(random() * w)
    const y = Math.round(ridge(near, x, w, h)) + 3 + Math.floor(random() * h * 0.1)
    p.rect(x, y, 1, 1, flowers[k % flowers.length]!, 0.9)
  }
  // Her shadow, long in the evening light, down the slope toward us and a little to the left.
  const { x, feet } = herSpot(w, h)
  const length = Math.round(h * 0.1)
  for (let k = 0; k < length; k++) {
    const half = 4 - (k / length) * 1.5
    const middle = x - k * 0.35
    p.rect(
      Math.round(middle - half),
      feet + k,
      Math.round(half * 2),
      1,
      '#0b1420',
      0.4 * (1 - k / length),
    )
  }
}

/** Two little birds' shapes: wings up, and wings down. */
const BIRD = [
  ['x...x', '.x.x.', '..x..'],
  ['.....', 'xx.xx', '..x..'],
]

/**
 * Life in the scene at `t`: three birds gliding across the sky now and then, wings beating, and
 * fireflies drifting over the grass of the nearest hill, glowing and fading.
 */
export function paintLife(p: Painter, frame: SaverFrame): void {
  const { t, w, h } = frame
  for (let k = 0; k < 3; k++) {
    // Across the screen in 50 s, one after another, then a while with none.
    const crossing = 50_000
    const cycle = 80_000
    const along = (t + k * 1_800) % cycle
    if (along > crossing) continue
    const x = -10 + ((w + 20) * along) / crossing + k * 6
    const y = h * (0.2 + k * 0.03) + Math.sin(along / 1_500 + k) * 2
    const wings = BIRD[Math.floor((t + k * 170) / 260) % 2]!
    wings.forEach((row, dy) =>
      [...row].forEach((c, dx) => {
        if (c === 'x') plot(p, x + dx - 2, y + dy - 1, '#2a1838', 0.85)
      }),
    )
  }
  const near = HILLS.length - 1
  const random = seeded(23)
  for (let k = 0; k < 18; k++) {
    const homeX = random() * w
    const homeY = ridge(near, homeX, w, h) - h * (0.01 + random() * 0.1)
    const phase = random() * Math.PI * 2
    const x = homeX + (noise(t / 5_000 + k * 7, 1) - 0.5) * 24
    const y = homeY + (noise(2, t / 4_000 + k * 7) - 0.5) * 14
    const glow = Math.max(0, Math.sin(t / 900 + phase))
    if (glow < 0.1) continue
    plot(p, x, y, '#fff9c4', glow)
    plot(p, x - 1, y, '#d9f99d', glow * 0.4)
    plot(p, x + 1, y, '#d9f99d', glow * 0.4)
    plot(p, x, y - 1, '#d9f99d', glow * 0.4)
    plot(p, x, y + 1, '#d9f99d', glow * 0.4)
  }
}
