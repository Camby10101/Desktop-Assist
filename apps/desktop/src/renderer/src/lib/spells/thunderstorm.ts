import { THUNDERSTORM } from '@shared/spells'
import { disc, line, plot, twinkle, type Painter } from '../pixels'
import { between, easeOut, noise, seeded, type Scene } from '../spellMotion'

// Thunderstorm: dark clouds roll in over the top of the screen, rain pours from them and splashes
// along the taskbar, and bolts of lightning crack down to it, branching as they go, each with a
// flash over the whole screen (one strikes right beside her).

type Point = { x: number; y: number }

/** A bolt of lightning: when it strikes, its jagged path from the clouds down, and its branches. */
export interface Bolt {
  at: number
  path: Point[]
  branches: Point[][]
}

/** How long a bolt shows (ms): flickering on and off, three times. */
const BOLT_MS = 280
const flickering = (age: number) =>
  age < 70 || (age > 110 && age < 180) || (age > 220 && age < BOLT_MS)

/** How far down the clouds hang, at their fullest (a share of the screen's height). */
const CLOUD = 0.24

/** A jagged line from `from` to `to`: its middle pushed sideways, and again in each half. */
function jagged(from: Point, to: Point, rough: number, random: () => number, depth = 5): Point[] {
  if (depth === 0) return [from, to]
  const middle = {
    x: (from.x + to.x) / 2 + (random() - 0.5) * rough,
    y: (from.y + to.y) / 2 + (random() - 0.5) * rough * 0.25,
  }
  return [
    ...jagged(from, middle, rough / 2, random, depth - 1),
    ...jagged(middle, to, rough / 2, random, depth - 1).slice(1),
  ]
}

/**
 * The storm's bolts: THUNDERSTORM.strikes of them, about a second apart once the clouds are in,
 * each from the clouds' underside down to the bottom of the screen (the third right beside her),
 * with two or three branches forking off partway down.
 */
export function bolts(w: number, h: number, beside: number): Bolt[] {
  const random = seeded(47)
  const base = h * CLOUD * 0.75
  return Array.from({ length: THUNDERSTORM.strikes }, (_, i) => {
    const at = 1500 + i * 950 + random() * 300
    const top = { x: w * (0.1 + random() * 0.8), y: base }
    const bottom =
      i === 2
        ? { x: beside + (random() - 0.5) * 20, y: h - 1 }
        : { x: top.x + (random() - 0.5) * w * 0.15, y: h - 1 }
    if (i === 2) top.x = bottom.x + (random() - 0.5) * w * 0.08
    const path = jagged(top, bottom, (h - base) * 0.35, random)
    const branches = Array.from({ length: 2 + Math.floor(random() * 2) }, () => {
      const from = path[Math.floor(path.length * (0.2 + random() * 0.4))]!
      const to = {
        x: from.x + (random() - 0.5) * w * 0.12,
        y: from.y + (h - from.y) * (0.3 + random() * 0.3),
      }
      return jagged(from, to, (to.y - from.y) * 0.4, random, 4)
    })
    return { at, path, branches }
  })
}

/** How far down the clouds hang at `t` (pixels): rolling in, then away at the end. */
export function cloudDepth(t: number, h: number): number {
  return (
    h *
    CLOUD *
    easeOut(t / 1500) *
    (1 - between(t, THUNDERSTORM.durationMs - 1300, THUNDERSTORM.durationMs))
  )
}

/** The thunderstorm spell at `scene.t`. */
export function drawThunderstorm(p: Painter, scene: Scene): void {
  const { w, h } = scene
  const t = scene.still ? THUNDERSTORM.durationMs * 0.45 : scene.t
  const depth = cloudDepth(t, h)
  const storm = depth / (h * CLOUD)
  const strikes = bolts(w, h, scene.x)
  const flashing = !scene.still && strikes.some((bolt) => t - bolt.at >= 0 && t - bolt.at < 60)

  // The flash: the whole screen lit for a moment.
  if (flashing) p.rect(0, 0, w, h, '#e0f2fe', 0.22)

  // Rain: slanting streaks falling from the clouds, more as the storm grows.
  const random = seeded(53)
  for (let k = 0; k < 380; k++) {
    const x0 = random() * w * 1.25
    const speed = 0.7 + random() * 0.5
    const phase = random() * h
    if (k >= 380 * storm) continue
    const y = depth * 0.6 + ((phase + t * speed) % (h - depth * 0.6))
    const x = x0 - (y - depth * 0.6) * 0.25
    for (let j = 0; j < 5; j++) {
      plot(p, x + j * 0.25, y - j, j < 2 ? '#bfdbfe' : '#93c5fd', 0.6 - j * 0.1)
    }
  }
  // Splashes along the bottom: little crowns of water, coming and going.
  for (let k = 0; k < 50; k++) {
    const x = random() * w
    const phase = random() * 320
    const age = (t + phase) % 320
    if (k >= 50 * storm || age > 160) continue
    const spread = age / 40
    plot(p, x - spread, h - 2 - spread * 0.6, '#bfdbfe', 0.6 * (1 - age / 160))
    plot(p, x + spread, h - 2 - spread * 0.6, '#bfdbfe', 0.6 * (1 - age / 160))
    plot(p, x, h - 1, '#93c5fd', 0.5 * (1 - age / 160))
  }

  // Lightning: each bolt flickering for a moment, a white core with a blue glow; its branches
  // thinner; a burst of sparks where it hits.
  for (const bolt of strikes) {
    const age = t - bolt.at
    if (scene.still || age < 0 || age > BOLT_MS || !flickering(age)) continue
    for (let k = 0; k < bolt.path.length - 1; k++) {
      const [a, b] = [bolt.path[k]!, bolt.path[k + 1]!]
      line(p, { x: a.x - 1, y: a.y }, { x: b.x - 1, y: b.y }, '#93c5fd', 0.55)
      line(p, { x: a.x + 1, y: a.y }, { x: b.x + 1, y: b.y }, '#93c5fd', 0.55)
      line(p, a, b, '#ffffff', 1)
    }
    for (const branch of bolt.branches) {
      for (let k = 0; k < branch.length - 1; k++)
        line(p, branch[k]!, branch[k + 1]!, '#e0f2fe', 0.85)
    }
    const hit = bolt.path.at(-1)!
    disc(p, hit.x, hit.y, 8, 3, '#e0f2fe', 0.5)
    for (let k = 0; k < 6; k++)
      twinkle(
        p,
        hit.x + Math.cos(k) * (4 + age / 25),
        hit.y - Math.abs(Math.sin(k)) * (2 + age / 30),
        '#bfdbfe',
        0.9,
      )
  }

  // The clouds: a dark bank over the top, its underside lumpy and rolling, lighter towards it (and
  // lit up during a flash).
  for (let x = 0; x < w; x += 2) {
    const lump = noise(x * 0.018 + t * 0.00025, 1.5) * 0.45 + noise(x * 0.06 - t * 0.0004, 4) * 0.2
    const bottom = depth * (0.6 + lump)
    if (bottom < 1) continue
    const alpha = 0.92 * Math.min(1, storm * 1.5)
    p.rect(x, 0, 2, Math.round(bottom * 0.55), flashing ? '#4b5563' : '#111827', alpha)
    p.rect(
      x,
      Math.round(bottom * 0.55),
      2,
      Math.round(bottom * 0.3),
      flashing ? '#6b7280' : '#1f2937',
      alpha,
    )
    p.rect(
      x,
      Math.round(bottom * 0.85),
      2,
      Math.max(1, Math.round(bottom * 0.15)),
      flashing ? '#9ca3af' : '#374151',
      alpha,
    )
  }
}
