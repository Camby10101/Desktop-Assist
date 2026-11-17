import { PHOENIX } from '@shared/spells'
import { disc, plot, square, twinkle, type Painter } from '../pixels'
import { between, clamp01, noise, seeded, type Scene } from '../spellMotion'

// Phoenix: a ring of fire at her, and out of it a bird of fire: it climbs, swoops across the
// screen, turns a loop in the middle of it and flies off the far side, its wings of flame beating,
// its tail streaming, a glow about it and a trail of embers drifting down behind it, cooling from
// white to red as they fall.

type Point = { x: number; y: number }

/** When the bird leaves her (ms). */
const TAKE_OFF = 300

/**
 * The bird's way across the screen, through these points: from her, up, across to the middle of
 * the screen (towards whichever side has more room), round a loop there, and away off the far side.
 */
export function phoenixPath(scene: Pick<Scene, 'w' | 'h' | 'x' | 'feet' | 'height'>): Point[] {
  const { w, h } = scene
  const start = { x: scene.x, y: scene.feet - scene.height * 0.6 }
  const dir = scene.x > w / 2 ? -1 : 1
  const loop = { x: w * 0.5, y: h * 0.34 }
  const r = Math.min(w, h) * 0.13
  return [
    start,
    { x: start.x + dir * w * 0.02, y: start.y - h * 0.22 },
    { x: loop.x - dir * r * 2.2, y: loop.y + r * 1.1 },
    { x: loop.x, y: loop.y + r },
    { x: loop.x + dir * r, y: loop.y },
    { x: loop.x, y: loop.y - r },
    { x: loop.x - dir * r, y: loop.y },
    { x: loop.x, y: loop.y + r * 0.95 },
    { x: loop.x + dir * w * 0.25, y: h * 0.18 },
    { x: dir > 0 ? w + 80 : -80, y: h * 0.05 },
  ]
}

/** The smooth curve through `points` (Catmull-Rom), `u` of the way along it (0 to 1). */
function along(points: Point[], u: number): Point {
  const s = clamp01(u) * (points.length - 1)
  const i = Math.min(points.length - 2, Math.floor(s))
  const f = s - i
  const p0 = points[i - 1] ?? points[i]!
  const p1 = points[i]!
  const p2 = points[i + 1]!
  const p3 = points[i + 2] ?? p2
  const at = (a: number, b: number, c: number, d: number) =>
    0.5 *
    (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f ** 3)
  return { x: at(p0.x, p1.x, p2.x, p3.x), y: at(p0.y, p1.y, p2.y, p3.y) }
}

/** Where the bird is at `t`, and which way it's heading (radians), or null before or after its flight. */
export function flightAt(
  t: number,
  scene: Pick<Scene, 'w' | 'h' | 'x' | 'feet' | 'height'>,
): (Point & { heading: number }) | null {
  const u = (t - TAKE_OFF) / PHOENIX.flightMs
  if (u < 0 || u > 1) return null
  const points = phoenixPath(scene)
  const here = along(points, u)
  const ahead = along(points, u + 0.004)
  const behind = along(points, u - 0.004)
  return { ...here, heading: Math.atan2(ahead.y - behind.y, ahead.x - behind.x) }
}

/** Fire, by how hot (1 white, then yellow, orange, red, 0 deep red). */
const fire = (heat: number) =>
  heat > 0.8
    ? '#fff7d6'
    : heat > 0.6
      ? '#fde68a'
      : heat > 0.4
        ? '#fb923c'
        : heat > 0.2
          ? '#ef4444'
          : '#7f1d1d'

/** How big the bird is: each of its own units this many pixels, each drawn this many across. */
const BIRD = 2

/** The bird at `at`, heading its way, wings beating with `t`. */
function bird(p: Painter, at: Point & { heading: number }, t: number, alpha: number): void {
  const f = { x: Math.cos(at.heading), y: Math.sin(at.heading) }
  // Across it, the way that's down on the screen, so it stays the right way up flying either way
  // (its crest and eye on top).
  const s = f.x >= 0 ? { x: -f.y, y: f.x } : { x: f.y, y: -f.x }
  // A point given along its body (forward) and across it, in its own units.
  const place = (forward: number, across: number) => ({
    x: at.x + (f.x * forward + s.x * across) * BIRD,
    y: at.y + (f.y * forward + s.y * across) * BIRD,
  })
  const dot = (forward: number, across: number, colour: string, a = alpha) => {
    const q = place(forward, across)
    square(p, q.x - BIRD / 2, q.y - BIRD / 2, BIRD, colour, a)
  }

  // Its glow.
  disc(p, at.x, at.y, 17 * BIRD, 13 * BIRD, '#fb923c', 0.12 * alpha)
  disc(p, at.x, at.y, 10 * BIRD, 8 * BIRD, '#fde68a', 0.12 * alpha)

  // Its tail: five streaks of flame streaming back, flickering, cooling to red at their ends.
  for (let i = 0; i < 5; i++) {
    const spread = (i - 2) * 0.17
    const length = 14 + 5 * noise(t / 90, i * 3.1)
    for (let j = 0; j < length; j++) {
      const share = j / length
      const wobble = Math.sin(t / 60 + j * 0.5 + i) * 1.4 * share
      dot(
        -6 - Math.cos(spread) * j,
        Math.sin(spread) * j * 1.6 + wobble,
        fire(1 - share),
        alpha * (1 - share * 0.6),
      )
    }
  }

  // Its wings, beating: each a triangle of flame from its body to a tip, hot at the root.
  const beat = Math.sin(t / 85)
  for (const side of [-1, 1]) {
    const span = 6 + 10 * (0.55 + 0.45 * beat)
    const root = [
      { forward: 3, across: 0 },
      { forward: -4, across: 0 },
    ]
    const tip = { forward: -8, across: side * span }
    const n = 16
    for (let a = 0; a <= n; a++) {
      for (let b = 0; b <= n - a; b++) {
        const u = a / n
        const v = b / n
        const forward =
          root[0]!.forward +
          (root[1]!.forward - root[0]!.forward) * u +
          (tip.forward - root[0]!.forward) * v
        const across = (tip.across - root[0]!.across) * v
        dot(forward, across, fire(1 - v * 0.9))
      }
    }
    // Feathers of flame off its trailing edge.
    for (let k = 1; k <= 3; k++)
      dot(-8 - k, side * span * (0.55 + k * 0.12), '#ef4444', alpha * 0.8)
  }

  // Its body, head, crest, beak and eye.
  for (let forward = -6; forward <= 6; forward += 0.7) {
    for (let across = -2.5; across <= 2.5; across += 0.7) {
      if ((forward / 6) ** 2 + (across / 2.5) ** 2 > 1) continue
      dot(forward, across, forward > 1 ? '#fff7d6' : Math.abs(across) > 1.6 ? '#fb923c' : '#fde68a')
    }
  }
  for (let forward = 5.5; forward <= 9.5; forward += 0.7) {
    for (let across = -2.2; across <= 2.2; across += 0.7) {
      if ((forward - 7.5) ** 2 + across ** 2 > 2.4 ** 2) continue
      dot(forward, across, '#fff7d6')
    }
  }
  for (let k = 0; k < 3; k++)
    dot(6.5 - k * 1.2, -3 - k * 0.8 - Math.abs(Math.sin(t / 70 + k)), fire(0.7 - k * 0.15))
  dot(10, 0, '#fbbf24')
  dot(11, 0, '#fbbf24')
  dot(8.5, -0.8, '#7c2d12')
}

/** The phoenix spell at `scene.t`. */
export function drawPhoenix(p: Painter, scene: Scene): void {
  const t = scene.still ? TAKE_OFF + PHOENIX.flightMs * 0.45 : scene.t
  const shown = scene.still ? 1 : 1 - between(t, PHOENIX.durationMs - 600, PHOENIX.durationMs)
  const start = { x: scene.x, y: scene.feet - scene.height * 0.6 }

  // The ring of fire it rises out of.
  if (t < 600 && !scene.still) {
    const spread = t / 600
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2
      twinkle(
        p,
        start.x + Math.cos(a) * spread * 24,
        start.y + Math.sin(a) * spread * 14,
        '#fb923c',
        1 - spread,
      )
    }
  }

  // Its embers: dropped all along its way, drifting down and sideways, cooling as they go.
  const random = seeded(83)
  for (let k = 0; k < 420; k++) {
    const born = TAKE_OFF + (k / 420) * PHOENIX.flightMs
    const jitter = { x: (random() - 0.5) * 14, y: (random() - 0.5) * 10 }
    const drift = { x: (random() - 0.5) * 0.025, y: 0.012 + random() * 0.025 }
    const life = 700 + random() * 1000
    const age = t - born
    if (age < 0 || age > life) continue
    const from = flightAt(born, scene)
    if (!from) continue
    const share = age / life
    const x = from.x + jitter.x + drift.x * age
    const y = from.y + jitter.y + drift.y * age
    if (k % 7 === 0 && share < 0.3) twinkle(p, x, y, '#fde68a', shown * (1 - share))
    else if (share < 0.4) square(p, x - 0.5, y - 0.5, 2, fire(1 - share), shown)
    else plot(p, x, y, fire(1 - share), shown * (1 - share * 0.6))
  }

  const at = flightAt(t, scene)
  if (at) bird(p, at, t, shown)
}
