import { BLIZZARD } from '@shared/spells'
import { line, plot, type Painter } from '../pixels'
import { between, easeOut, noise, seeded, type Scene } from '../spellMotion'

// Blizzard: snow blowing across the screen in gusts (flakes of three sizes, streaks of wind),
// frost creeping in from the corners of the screen, and snow piling up along the taskbar, under a
// faint cold tint, all melting away at the end.

/** How far the wind has blown the snow sideways by `t` (pixels, to the left): steady, in gusts. */
export function drift(t: number): number {
  return 0.09 * t + 90 * Math.sin(t / 1400) + 40 * Math.sin(t / 530)
}

/** How much of the blizzard there is at `t`, 0 to 1: building up, then melting away at the end. */
export function strength(t: number): number {
  return easeOut(t / 1500) * (1 - between(t, BLIZZARD.durationMs - 1200, BLIZZARD.durationMs))
}

/** How far the frost has crept in from each corner at `t` (pixels), at most a fifth of the screen. */
export function frostReach(t: number, w: number, h: number): number {
  return Math.min(w, h) * 0.2 * easeOut((t - 400) / 4500) * strength(t)
}

/** A frost crystal: a branch from a corner, with twigs off it at 60°, each shorter than the last. */
function crystal(
  p: Painter,
  from: { x: number; y: number },
  angle: number,
  length: number,
  alpha: number,
): void {
  const to = { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length }
  line(p, from, to, '#e0f2fe', alpha * 0.7)
  plot(p, to.x, to.y, '#ffffff', alpha)
  for (let d = 5; d < length - 2; d += 5) {
    const at = { x: from.x + Math.cos(angle) * d, y: from.y + Math.sin(angle) * d }
    const twig = (length - d) * 0.35
    for (const side of [-1, 1]) {
      const a = angle + side * (Math.PI / 3)
      line(
        p,
        at,
        { x: at.x + Math.cos(a) * twig, y: at.y + Math.sin(a) * twig },
        '#e0f2fe',
        alpha * 0.5,
      )
    }
  }
}

/** The blizzard spell at `scene.t`. */
export function drawBlizzard(p: Painter, scene: Scene): void {
  const { w, h } = scene
  const t = scene.still ? BLIZZARD.durationMs * 0.45 : scene.t
  const now = strength(t)

  // The cold: a faint blue over everything.
  p.rect(0, 0, w, h, '#bae6fd', 0.06 * now)

  // Frost from each corner: a fan of crystals growing in, each its own length.
  const reach = frostReach(t, w, h)
  const corners = [
    { x: 0, y: 0, a: 0 },
    { x: w - 1, y: 0, a: Math.PI / 2 },
    { x: w - 1, y: h - 1, a: Math.PI },
    { x: 0, y: h - 1, a: (Math.PI * 3) / 2 },
  ]
  const random = seeded(61)
  for (const corner of corners) {
    for (let k = 0; k < 6; k++) {
      const angle = corner.a + ((k + 0.5) / 6) * (Math.PI / 2) + (random() - 0.5) * 0.2
      const length = reach * (0.55 + random() * 0.45)
      if (length > 3) crystal(p, corner, angle, length, 0.8 * now)
    }
  }

  // Streaks of wind racing across.
  for (let k = 0; k < 14; k++) {
    const y = random() * h * 0.9
    const speed = 0.5 + random() * 0.5
    const phase = random() * (w + 60)
    const x = w + 30 - ((phase + t * speed) % (w + 60))
    const length = 10 + random() * 14
    line(p, { x, y }, { x: x + length, y: y - 1 }, '#ffffff', 0.25 * now)
  }

  // The snow: flakes of three sizes, the bigger ones nearer, so faster, blown by the wind and
  // swaying, wrapping round the screen; more of them as it builds.
  const blown = drift(t)
  for (let k = 0; k < BLIZZARD.flakes; k++) {
    const size = random() < 0.7 ? 0 : random() < 0.66 ? 1 : 2
    const fall = 0.025 + random() * 0.03 + size * 0.02
    const x0 = random() * (w + 40)
    const phase = random() * (h + 20)
    const sway = random() * Math.PI * 2
    if (k >= BLIZZARD.flakes * now) continue
    const y = ((phase + t * fall) % (h + 20)) - 10
    const x =
      ((((x0 - blown * (0.6 + size * 0.3) + Math.sin(t / 600 + sway) * 5) % (w + 40)) + w + 40) %
        (w + 40)) -
      20
    const alpha = (0.65 + size * 0.15) * now
    plot(p, x, y, '#ffffff', alpha)
    if (size >= 1) {
      plot(p, x + 1, y, '#e0f2fe', alpha * 0.8)
      plot(p, x - 1, y, '#e0f2fe', alpha * 0.8)
      plot(p, x, y + 1, '#e0f2fe', alpha * 0.8)
      plot(p, x, y - 1, '#e0f2fe', alpha * 0.8)
    }
    if (size === 2) {
      for (const [dx, dy] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ] as const) {
        plot(p, x + dx * 2, y + dy * 2, '#ffffff', alpha * 0.7)
      }
    }
  }

  // Snow piling up along the bottom: a white drift with a lumpy top, edged in pale blue.
  const pile = Math.min(h * 0.04, 22) * between(t, 1200, 7000) * now
  if (pile >= 1) {
    for (let x = 0; x < w; x += 2) {
      const height = pile * (0.55 + 0.45 * noise(x * 0.03, 7.5))
      p.rect(x, Math.round(h - height), 2, Math.ceil(height), '#f8fafc', 0.92 * now)
      p.rect(x, Math.round(h - height), 2, 1, '#bae6fd', 0.8 * now)
    }
  }
}
