import { BUTTERFLIES } from '@shared/spells'
import { plot, square, twinkle, type Painter } from '../pixels'
import { between, seeded, type Scene } from '../spellMotion'

// Butterflies: a burst of sparkles at her, and out of it a swarm of little magic butterflies,
// each its own colour (some bigger, nearer), fluttering up and away across the screen along wavy
// paths of their own, flapping, each with a glittering trail.

/** Wings open and shut, as rows of pixels: W the wings, S a white spot on each, k the gold body. */
const OPEN = ['WW.WW', 'WSkSW', '.W.W.']
const SHUT = ['.WkW.', '..k..']
const WINGS = ['#2dd4bf', '#f472b6', '#fbbf24', '#60a5fa', '#fb923c', '#a3e635', '#e879f9']

/** Where a butterfly is: its middle, whether its wings are open, its colour and size. */
export interface Flier {
  x: number
  y: number
  open: boolean
  colour: string
  size: 2 | 3
}

/** Where she is, as the butterflies come out of her: her middle (pixels). */
const heart = (scene: Pick<Scene, 'x' | 'feet' | 'height'>) => ({
  x: scene.x,
  y: scene.feet - scene.height * 0.55,
})

/**
 * Butterfly `k` (of BUTTERFLIES.count) at `t`, or null before it comes out of her: each leaves her
 * a moment after the last, heading up and outward at its own speed, weaving side to side, bobbing
 * as it flaps, its wings opening and shutting at its own pace.
 */
export function flier(
  k: number,
  t: number,
  scene: Pick<Scene, 'x' | 'feet' | 'height'>,
): Flier | null {
  const random = seeded(200 + k)
  const born = k * 55 + random() * 500
  const heading = -Math.PI / 2 + (random() - 0.5) * 2.4
  const speed = 0.05 + random() * 0.06
  const weave = 8 + random() * 10
  const sway = random() * Math.PI * 2
  const flap = 100 + random() * 60
  const colour = WINGS[Math.floor(random() * WINGS.length)]!
  const size = random() < 0.3 ? 3 : 2
  const age = t - born
  if (age < 0) return null
  const from = heart(scene)
  const along = speed * age
  const across = Math.sin(age / 320 + sway) * weave
  return {
    x: from.x + Math.cos(heading) * along - Math.sin(heading) * across,
    y: from.y + Math.sin(heading) * along + Math.cos(heading) * across + Math.sin(age / 90) * 1.5,
    open: Math.floor(age / flap) % 2 === 0,
    colour,
    size,
  }
}

/** One butterfly, its wings as they are, `size` pixels a pixel. */
function draw(p: Painter, b: Flier, alpha: number): void {
  const rows = b.open ? OPEN : SHUT
  const left = b.x - (rows[0]!.length * b.size) / 2
  const top = b.y - (rows.length * b.size) / 2
  rows.forEach((row, j) =>
    [...row].forEach((letter, i) => {
      if (letter === '.') return
      const colour = letter === 'W' ? b.colour : letter === 'S' ? '#ffffff' : '#b3832c'
      square(p, left + i * b.size, top + j * b.size, b.size, colour, alpha)
    }),
  )
}

/** The butterflies spell at `scene.t`. */
export function drawButterflies(p: Painter, scene: Scene): void {
  const t = scene.still ? BUTTERFLIES.durationMs * 0.35 : scene.t
  const shown = scene.still
    ? 1
    : 1 - between(t, BUTTERFLIES.durationMs - 900, BUTTERFLIES.durationMs)
  const from = heart(scene)

  // The burst they come out of: a ring of sparkles, spreading and fading.
  if (t < 700 && !scene.still) {
    const spread = t / 700
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      twinkle(
        p,
        from.x + Math.cos(a) * spread * 22,
        from.y + Math.sin(a) * spread * 16,
        '#fde68a',
        1 - spread,
      )
    }
  }

  for (let k = 0; k < BUTTERFLIES.count; k++) {
    const b = flier(k, t, scene)
    if (!b) continue
    // Its trail: where it was a little while ago, glittering and fading.
    for (let j = 1; j <= 5; j++) {
      const before = flier(k, t - j * 70, scene)
      if (!before) break
      const glint = (k + j + Math.floor(t / 120)) % 4 === 0
      plot(p, before.x, before.y + 2, glint ? '#ffffff' : '#fde68a', shown * (1 - j / 6) * 0.8)
    }
    draw(p, b, shown)
  }
}
