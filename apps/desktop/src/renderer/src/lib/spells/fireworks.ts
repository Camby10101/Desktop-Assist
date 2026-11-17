import { FIREWORKS } from '@shared/spells'
import { disc, plot, square, twinkle, type Painter } from '../pixels'
import { easeOut, seeded, type Scene } from '../spellMotion'

// Fireworks: rockets climbing from along the taskbar, each bursting high over the screen in one of
// four kinds (a round peony, a ring, a drooping golden willow, crackling glitter), then a finale
// of several at once.

/** The kinds of burst, and the colours they come in. */
const KINDS = ['peony', 'ring', 'willow', 'glitter'] as const
type Kind = (typeof KINDS)[number]
const COLOURS = ['#f87171', '#fbbf24', '#4ade80', '#60a5fa', '#f472b6', '#c084fc', '#ffffff']

/** How many sparks each kind throws, and how long they last (ms). */
const SPARKS: Record<Kind, { count: number; life: number }> = {
  peony: { count: 80, life: 1600 },
  ring: { count: 56, life: 1400 },
  willow: { count: 60, life: 2500 },
  glitter: { count: 70, life: 1900 },
}

/** One rocket: when it launches, from where, where and when it bursts, and how. */
export interface Rocket {
  launch: number
  x: number
  burstX: number
  burstY: number
  /** How long it climbs (ms). */
  rise: number
  kind: Kind
  colour: string
  /** How fast its sparks fly out (pixels a ms). */
  speed: number
  seed: number
}

/**
 * The show: FIREWORKS.rockets, one about every FIREWORKS.gapMs (the first from beside her), then
 * the last FIREWORKS.finale of them close together from FIREWORKS.finaleAt. Each climbs from the
 * bottom of the screen to somewhere over its top half and bursts.
 */
export function rockets(w: number, h: number, from: number): Rocket[] {
  const random = seeded(31)
  const steady = FIREWORKS.rockets - FIREWORKS.finale
  return Array.from({ length: FIREWORKS.rockets }, (_, i) => {
    const launch =
      i < steady
        ? 150 + i * FIREWORKS.gapMs + random() * 200
        : FIREWORKS.finaleAt + (i - steady) * 110 + random() * 120
    const x = i === 0 ? from : w * (0.08 + random() * 0.84)
    return {
      launch,
      x,
      burstX: Math.min(w * 0.95, Math.max(w * 0.05, x + (random() - 0.5) * w * 0.1)),
      burstY: h * (0.1 + random() * 0.32),
      rise: 650 + random() * 400,
      kind: KINDS[Math.floor(random() * KINDS.length)]!,
      colour: COLOURS[Math.floor(random() * COLOURS.length)]!,
      speed: (0.07 + random() * 0.05) * (Math.min(w, h) / 300),
      seed: 100 + i,
    }
  })
}

/** Where a spark is `age` ms after its burst: flying out, slowing, falling. */
function spark(
  rocket: Rocket,
  angle: number,
  speed: number,
  age: number,
  gravity: number,
): { x: number; y: number } {
  // It slows as it goes (air): out to speed × 450 at most, the willow's further and slower.
  const drag = rocket.kind === 'willow' ? 650 : 450
  const out = speed * drag * (1 - Math.exp(-age / drag))
  return {
    x: rocket.burstX + Math.cos(angle) * out,
    y: rocket.burstY + Math.sin(angle) * out + gravity * age * age,
  }
}

/** The fireworks spell at `scene.t`. */
export function drawFireworks(p: Painter, scene: Scene): void {
  const { w, h } = scene
  const t = scene.still ? FIREWORKS.durationMs * 0.45 : scene.t
  const shown = scene.still ? 1 : Math.min(1, (FIREWORKS.durationMs - t) / 600)
  const gravity = 0.00004 * (h / 520)
  for (const rocket of rockets(w, h, scene.x)) {
    const age = t - rocket.launch
    if (age < 0) continue
    // Climbing: a bright head, a wobble, and a trail of sparks behind it.
    if (age < rocket.rise) {
      const climb = easeOut(age / rocket.rise)
      const x = rocket.x + (rocket.burstX - rocket.x) * climb + Math.sin(age / 40) * 0.6
      const y = h + (rocket.burstY - h) * climb
      square(p, x, y, 2, '#fff7d6', shown)
      for (let k = 1; k <= 8; k++) {
        const back = Math.max(0, age - k * 28) / rocket.rise
        const by = h + (rocket.burstY - h) * easeOut(back)
        plot(
          p,
          x + Math.sin(k * 2.3 + age / 30),
          by,
          k < 3 ? '#fde68a' : '#fb923c',
          shown * (1 - k / 9),
        )
      }
      continue
    }
    // Bursting: a flash at the heart, then the sparks.
    const burst = age - rocket.rise
    const { count, life } = SPARKS[rocket.kind]
    if (burst > life) continue
    if (burst < 140) {
      const flash = 1 - burst / 140
      square(p, rocket.burstX - 3, rocket.burstY - 3, 6, '#ffffff', flash * shown)
      twinkle(p, rocket.burstX, rocket.burstY, rocket.colour, shown)
    }
    // A soft glow in its colour, spreading and fading.
    if (burst < 500) {
      const glow = burst / 500
      const size = 10 + glow * 30
      disc(p, rocket.burstX, rocket.burstY, size, size, rocket.colour, 0.14 * (1 - glow) * shown)
    }
    const random = seeded(rocket.seed)
    // The willow's sparks are heavier: they droop.
    const fall = rocket.kind === 'willow' ? gravity * 1.6 : gravity
    for (let k = 0; k < count; k++) {
      const angle = (k / count) * Math.PI * 2 + random() * 0.15
      const speed = rocket.kind === 'ring' ? rocket.speed : rocket.speed * (0.45 + random() * 0.55)
      const second = random() < 0.35
      const colour = rocket.kind === 'willow' ? '#fbbf24' : second ? '#ffffff' : rocket.colour
      const fade = (1 - burst / life) ** 0.6 * shown
      const at = spark(rocket, angle, speed, burst, fall)
      // Glitter crackles: sparks flashing white and off as they go.
      if (rocket.kind === 'glitter' && burst > life * 0.35) {
        if (Math.sin(burst / 25 + k * 1.7) > 0.2) plot(p, at.x, at.y, '#ffffff', fade)
        continue
      }
      square(p, at.x - 0.5, at.y - 0.5, 2, colour, fade)
      // A tail back along its path, long and golden for the willow.
      const tail = rocket.kind === 'willow' ? 7 : 3
      for (let j = 1; j <= tail; j++) {
        const back = spark(rocket, angle, speed, Math.max(0, burst - j * 45), fall)
        plot(p, back.x, back.y, colour, fade * (1 - j / (tail + 1)) * 0.7)
      }
    }
  }
}
