import { VORTEX } from '@shared/spells'
import { disc, line, plot, ring, square, twinkle, type Painter } from '../pixels'
import { between, easeOut, seeded, type Scene } from '../spellMotion'

// Vortex: a portal tears open in the middle of the screen: a black heart ringed with light, four
// glowing arms spiralling round it, rings of bent light about it, sparks of lightning crackling at
// its rim, and specks drawn in from all over the screen, spiralling faster as they fall in. Then it
// collapses into itself and goes off in a flash and a shock wave.

/** How big the portal is at `t` (pixels): opening, steady (breathing a little), collapsing, gone. */
export function portalRadius(t: number, w: number, h: number): number {
  const full = Math.min(w, h) * 0.3
  if (t >= VORTEX.implodeAt) return 0
  const open = easeOut(t / VORTEX.openMs)
  const collapse = between(t, VORTEX.collapseAt, VORTEX.implodeAt) ** 2
  return full * open * (1 - collapse) * (1 + 0.04 * Math.sin(t / 180))
}

/** Where the portal opens: the middle of the screen, a little above it. */
const middle = (w: number, h: number) => ({ x: w / 2, y: h * 0.45 })

/** A colour along a spiral arm: white at its heart, then lilac, her colour, and blue at its ends. */
function armColour(share: number, accent: string): string {
  return share < 0.2 ? '#ffffff' : share < 0.45 ? '#e9d5ff' : share < 0.75 ? accent : '#60a5fa'
}

/** The vortex spell at `scene.t`. */
export function drawVortex(p: Painter, scene: Scene): void {
  const { w, h, accent } = scene
  const t = scene.still ? VORTEX.durationMs * 0.45 : scene.t
  const c = middle(w, h)
  const r = portalRadius(t, w, h)
  const spin = t * 0.0022 + between(t, VORTEX.collapseAt, VORTEX.implodeAt) * 6

  if (r > 1) {
    // Specks drawn in from all over the screen, spiralling round faster as they fall in.
    const random = seeded(71)
    const far = Math.hypot(w, h) * 0.6
    for (let k = 0; k < 200; k++) {
      const start = r * 1.2 + random() * (far - r)
      const angle = random() * Math.PI * 2
      const period = 1800 + random() * 1800
      const phase = random() * period
      const colour = k % 3 === 0 ? '#ffffff' : k % 3 === 1 ? accent : '#93c5fd'
      const u = ((t + phase) % period) / period
      const fall = start * (1 - u) ** 1.6 + r * 0.25
      const a = angle + u * u * 9 + spin
      const x = c.x + Math.cos(a) * fall
      const y = c.y + Math.sin(a) * fall * 0.85
      if (k % 3 === 0) square(p, x - 0.5, y - 0.5, 2, colour, Math.min(1, u * 4) * 0.9)
      else plot(p, x, y, colour, Math.min(1, u * 4) * 0.9)
      const back = start * (1 - Math.max(0, u - 0.03)) ** 1.6 + r * 0.25
      const ab = angle + Math.max(0, u - 0.03) ** 2 * 9 + spin
      plot(p, c.x + Math.cos(ab) * back, c.y + Math.sin(ab) * back * 0.85, colour, u * 0.5)
    }

    // Rings of bent light round it, dashed and turning, one each way.
    ring(p, c.x, c.y, r * 1.08, r * 0.92, accent, 0.5, spin * 0.7, 0.22)
    ring(p, c.x, c.y, r * 1.3, r * 1.1, '#93c5fd', 0.35, -spin * 0.5, 0.3)

    // A glow of her colour about it.
    disc(p, c.x, c.y, r * 0.8, r * 0.68, accent, 0.12)
    disc(p, c.x, c.y, r * 0.5, r * 0.43, '#e9d5ff', 0.1)

    // Four arms of light spiralling in to the heart, each three pixels wide, with a fainter
    // fourth along one side.
    for (let arm = 0; arm < 4; arm++) {
      for (let k = 0; k <= 90; k++) {
        const share = k / 90
        const a = spin + (arm * Math.PI) / 2 + share * 2.6
        const d = r * (0.3 + share * 0.72)
        const x = c.x + Math.cos(a) * d
        const y = c.y + Math.sin(a) * d * 0.85
        const colour = armColour(share, accent)
        const alpha = 1 - share * 0.6
        const across = { x: Math.cos(a + 1.57), y: Math.sin(a + 1.57) * 0.85 }
        plot(p, x, y, colour, alpha)
        plot(p, x + across.x, y + across.y, colour, alpha * 0.75)
        plot(p, x - across.x, y - across.y, colour, alpha * 0.75)
        plot(p, x + across.x * 2, y + across.y * 2, colour, alpha * 0.35)
      }
    }

    // The black heart, ringed with light.
    disc(p, c.x, c.y, r * 0.3, r * 0.26, '#0b0618', 0.95)
    ring(p, c.x, c.y, r * 0.3, r * 0.26, '#e9d5ff', 0.95)
    ring(p, c.x, c.y, r * 0.33, r * 0.29, accent, 0.6)

    // Lightning crackling at its rim: a new spark every tenth of a second.
    const crackle = seeded(Math.floor(t / 100) + 7)
    for (let k = 0; k < 3; k++) {
      const a = crackle() * Math.PI * 2
      const from = { x: c.x + Math.cos(a) * r * 0.85, y: c.y + Math.sin(a) * r * 0.72 }
      let at = from
      for (let s = 0; s < 4; s++) {
        const next = {
          x: at.x + (crackle() - 0.5) * r * 0.25,
          y: at.y + (crackle() - 0.5) * r * 0.2,
        }
        line(p, at, next, '#e0f2fe', 0.85)
        at = next
      }
    }
  }

  // The implosion: a white flash over the screen, a shock wave racing out, sparks flung outward.
  const after = t - VORTEX.implodeAt
  if (after >= 0 && !scene.still) {
    if (after < 200) p.rect(0, 0, w, h, '#ffffff', 0.6 * (1 - after / 200))
    const wave = easeOut(after / 900)
    const fade = 1 - between(after, 0, VORTEX.durationMs - VORTEX.implodeAt)
    ring(p, c.x, c.y, wave * Math.max(w, h) * 0.6, wave * Math.max(w, h) * 0.5, '#e9d5ff', fade)
    ring(
      p,
      c.x,
      c.y,
      wave * Math.max(w, h) * 0.58,
      wave * Math.max(w, h) * 0.48,
      accent,
      fade * 0.6,
    )
    const random = seeded(73)
    for (let k = 0; k < 60; k++) {
      const a = random() * Math.PI * 2
      const speed = (0.1 + random() * 0.2) * (Math.min(w, h) / 300)
      const x = c.x + Math.cos(a) * speed * after
      const y = c.y + Math.sin(a) * speed * after * 0.85
      if (k % 4 === 0) twinkle(p, x, y, accent, fade)
      else plot(p, x, y, '#ffffff', fade)
    }
  }
}
