import { plot, square, type Painter } from '../pixels'
import { seeded, STAR_COLOURS, STAR_DIRECTION, type Star } from '../spellMotion'
import { hillTop, paintBands, paintHill, type Hill, type SaverFrame } from './scene'

// The screen saver's starfall, on the screens she isn't on (see ScreenSaverView): the night sky,
// stars twinkling all over it, low dark hills along its bottom, and shooting stars falling through
// it without end, like her Starfall spell's but bigger: a broader head, and a longer tail. In
// pixels of the canvas (some 360 of them high), times in ms.

/** The night sky, from the top down to the hills: deep navy to a last violet glow. */
export const NIGHT_SKY = [
  '#08071d',
  '#0c0a27',
  '#110e31',
  '#17123b',
  '#1e1645',
  '#26194e',
  '#2f1c56',
  '#3a205d',
] as const

/** Low hills along the bottom, dark against the sky, a faint rim of starlight along each. */
export const NIGHT_HILLS: readonly Hill[] = [
  {
    base: 0.87,
    amp: 0.025,
    waves: [
      [1.9, 0.7],
      [4.6, 2.9],
      [10.1, 1.4],
    ],
    body: '#150e2e',
    deep: '#120c28',
    rim: '#4a3a85',
  },
  {
    base: 0.94,
    amp: 0.02,
    waves: [
      [1.3, 3.3],
      [3.4, 0.2],
      [7.9, 4.8],
    ],
    body: '#0b0820',
    deep: '#09071b',
    rim: '#32286a',
  },
]

/** Shooting stars: how many start a second, how long their tails are and the longest one falls. */
export const FALL = { perSecond: 6, tail: 44, longestMs: 2_300 }

/**
 * The shooting stars falling at `t`, any time at all: FALL.perSecond start each second (each at
 * its own moment within it), from along the top of the screen, a little above it and off its
 * right-hand side, falling down to the left at their own speeds. Each one's numbers come from its
 * place in the sequence, so every frame agrees.
 */
export function fallingStarsAt(t: number, w: number, h: number): Star[] {
  const gap = 1000 / FALL.perSecond
  const stars: Star[] = []
  const first = Math.max(0, Math.floor((t - FALL.longestMs) / gap) - 1)
  for (let k = first; k <= Math.floor(t / gap); k++) {
    const random = seeded(k * 7919 + 101)
    const born = k * gap + random() * gap
    const life = 1_300 + random() * (FALL.longestMs - 1_300)
    const startX = random() * w * 1.4
    const startY = random() < 0.3 ? random() * h * 0.35 : -random() * h * 0.2
    const speed = ((w + h) / 1_400) * (0.6 + random() * 0.5)
    const colour = STAR_COLOURS[Math.floor(random() * STAR_COLOURS.length)]!
    const age = t - born
    if (age < 0 || age > life) continue
    stars.push({
      x: startX + STAR_DIRECTION.dx * speed * age,
      y: startY + STAR_DIRECTION.dy * speed * age,
      ...STAR_DIRECTION,
      age,
      life,
      colour,
    })
  }
  return stars
}

/** The sky and the hills (they never change, so they're painted once). */
export function paintNight(p: Painter, w: number, h: number): void {
  paintBands(p, w, h, NIGHT_SKY, Math.round(h * 0.9))
  for (const hill of NIGHT_HILLS) {
    paintHill(
      p,
      hill,
      w,
      h,
      (x) => hillTop(hill, x, h),
      () => 0.6,
    )
  }
}

/**
 * The stars at `t`: twinkling all over the sky above the hills, a few brighter ones flashing; and
 * the shooting stars, each with a bright head three pixels across, a glow round it, and a long
 * tail two pixels wide behind it, white near the head and fading out in its colour.
 */
export function paintStarfall(p: Painter, frame: SaverFrame): void {
  const { t, w, h } = frame
  const random = seeded(3)
  for (let k = 0; k < 240; k++) {
    const x = random() * w
    const y = random() * h * 0.85
    const phase = random() * Math.PI * 2
    const colour = k % 5 === 0 ? '#fde68a' : k % 7 === 0 ? '#bae6fd' : '#ffffff'
    const glow = 0.35 + 0.65 * Math.sin(t / 700 + phase) ** 2
    plot(p, x, y, colour, glow * 0.85)
    if (k % 9 === 0 && glow > 0.8) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        plot(p, x + dx, y + dy, colour, (glow - 0.5) * 0.9)
      }
    }
  }
  for (const star of fallingStarsAt(t, w, h)) {
    const fade = Math.min(1, star.age / 150, (star.life - star.age) / 400)
    for (let k = 1; k <= FALL.tail; k++) {
      const tx = star.x - star.dx * k * 1.2
      const ty = star.y - star.dy * k * 1.2
      const left = 1 - k / (FALL.tail + 1)
      plot(p, tx, ty, k < 9 ? '#ffffff' : star.colour, fade * left)
      plot(p, tx + 1, ty, star.colour, fade * left * 0.6)
      if (k < 14) plot(p, tx - 1, ty, star.colour, fade * left * 0.3)
    }
    square(p, star.x - 1, star.y - 1, 3, '#ffffff', fade)
    for (const [dx, dy] of [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ] as const) {
      plot(p, star.x + dx, star.y + dy, star.colour, fade * 0.8)
    }
  }
}
