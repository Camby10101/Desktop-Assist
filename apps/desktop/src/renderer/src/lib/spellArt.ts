import { EXPLOSION, STARFALL } from '@shared/spells'
import {
  between,
  blastAt,
  clamp01,
  easeOut,
  noise,
  pillarCircles,
  seeded,
  starsAt,
  type Circle,
  type Scene,
} from './spellMotion'

// The pixel art of her spells' effects (see SpellView): starfall's shooting stars, and the
// explosion's pillar of magic circles and its bang. Everything is drawn a pixel at a time on a
// small canvas that the page stretches over its window without smoothing, so it's crisp pixel art
// like her. Where things are, moment by moment, comes from lib/spellMotion.ts.

/** Sets one pixel, if it's on the canvas. */
function plot(g: CanvasRenderingContext2D, x: number, y: number, colour: string, alpha = 1) {
  if (alpha <= 0) return
  g.globalAlpha = Math.min(1, alpha)
  g.fillStyle = colour
  g.fillRect(Math.round(x), Math.round(y), 1, 1)
}

/** A plus-shaped twinkle: a pixel and its four neighbours, the middle brighter. */
function twinkle(g: CanvasRenderingContext2D, x: number, y: number, colour: string, alpha = 1) {
  plot(g, x, y, '#ffffff', alpha)
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    plot(g, x + dx, y + dy, colour, alpha * 0.8)
  }
}

/** A straight line of pixels (Bresenham's). */
function line(
  g: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  colour: string,
  alpha = 1,
) {
  let x = Math.round(from.x)
  let y = Math.round(from.y)
  const x1 = Math.round(to.x)
  const y1 = Math.round(to.y)
  const dx = Math.abs(x1 - x)
  const dy = -Math.abs(y1 - y)
  const sx = x < x1 ? 1 : -1
  const sy = y < y1 ? 1 : -1
  let error = dx + dy
  for (let i = 0; i < 2000; i++) {
    plot(g, x, y, colour, alpha)
    if (x === x1 && y === y1) return
    const e2 = 2 * error
    if (e2 >= dy) {
      error += dy
      x += sx
    }
    if (e2 <= dx) {
      error += dx
      y += sy
    }
  }
}

/** An ellipse's outline, a pixel at a time; `gap` leaves every other `gap` radians out (dashes). */
function ring(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  colour: string,
  alpha = 1,
  turn = 0,
  gap = 0,
) {
  if (rx < 0.5) return
  const steps = Math.max(8, Math.ceil(Math.PI * 2 * Math.max(rx, ry)))
  for (let k = 0; k < steps; k++) {
    const a = (k / steps) * Math.PI * 2
    if (gap && Math.floor((a + turn) / gap) % 2 === 1) continue
    plot(g, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, colour, alpha)
  }
}

// --------------------------------------------------------------------------------- starfall

/** Starfall: twinkling stars over the top of the screen, and shooting stars streaking down it. */
export function drawStarfall(g: CanvasRenderingContext2D, scene: Scene): void {
  const { t, w, h, still } = scene
  const shown = still ? 1 : Math.min(1, t / 600, (STARFALL.durationMs - t) / 1000)
  // Twinkles, over the top two thirds of the screen, each brightening and dimming in its time.
  const random = seeded(3)
  for (let i = 0; i < 130; i++) {
    const x = random() * w
    const y = random() * h * 0.66
    const phase = random() * Math.PI * 2
    const glow = still ? 0.7 : 0.5 + 0.5 * Math.sin(t / 260 + phase)
    if (glow > 0.75) twinkle(g, x, y, '#fde68a', shown * glow)
    else plot(g, x, y, '#ffffff', shown * glow)
  }
  if (still) return
  for (const star of starsAt(t, w, h)) {
    const fading = Math.min(1, (star.life - star.age) / 300) * shown
    // Its tail: back along its path, fading to nothing, with a fainter glow beside it.
    for (let k = 1; k <= 30; k++) {
      const tx = star.x - star.dx * k * 1.3
      const ty = star.y - star.dy * k * 1.3
      const left = 1 - k / 31
      plot(g, tx, ty, k < 6 ? '#ffffff' : star.colour, fading * left)
      plot(g, tx + 1, ty, star.colour, fading * left * 0.35)
    }
    // Its head: a bright square with a twinkle round it.
    twinkle(g, star.x, star.y, star.colour, fading)
    plot(g, star.x + 1, star.y, '#ffffff', fading)
    plot(g, star.x, star.y + 1, '#ffffff', fading)
    plot(g, star.x + 1, star.y + 1, '#ffffff', fading)
  }
}

// --------------------------------------------------------------------------------- explosion

/** One magic circle at `t`: rings, a turning ring of runes, a six-pointed star, a bright heart. */
function magicCircle(
  g: CanvasRenderingContext2D,
  c: Circle,
  t: number,
  power: number,
  accent: string,
) {
  const age = t - c.born
  if (age < 0) return
  const grown = easeOut(age / 450)
  const flash = 1 - between(age, 450, 900)
  const rx = c.rx * grown
  const ry = c.ry * grown
  const spin = (c.turn * age * (0.0008 + power * 0.004)) % (Math.PI * 2)
  const bright = 0.75 + power * 0.25
  // A soft glow filling it, in her colour.
  g.globalAlpha = 0.1 + power * 0.12
  g.fillStyle = accent
  for (let dy = -Math.floor(ry); dy <= Math.floor(ry); dy++) {
    const half = rx * Math.sqrt(Math.max(0, 1 - (dy / Math.max(1, ry)) ** 2))
    g.fillRect(Math.round(c.cx - half), Math.round(c.cy + dy), Math.round(half * 2), 1)
  }
  // Its rings: the outer one in her colour (white as it forms), a dashed one inside it turning.
  ring(g, c.cx, c.cy, rx, ry, flash > 0.3 ? '#ffffff' : accent, bright)
  ring(g, c.cx, c.cy, rx * 0.93, ry * 0.93, accent, bright * 0.7)
  ring(g, c.cx, c.cy, rx * 0.8, ry * 0.8, '#fde68a', bright, spin, 0.18)
  ring(g, c.cx, c.cy, rx * 0.58, ry * 0.58, accent, bright * 0.85)
  // Its runes: little marks round it, turning.
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + spin
    const x = c.cx + Math.cos(a) * rx * 0.69
    const y = c.cy + Math.sin(a) * ry * 0.69
    plot(g, x, y, '#fff7d6', bright)
    if (k % 2 === 0) plot(g, x, y - 1, '#fde68a', bright * 0.8)
  }
  // A six-pointed star inside it (two triangles), turning the other way.
  const points = Array.from({ length: 6 }, (_, k) => {
    const a = (k / 6) * Math.PI * 2 - spin * 1.5
    return { x: c.cx + Math.cos(a) * rx * 0.55, y: c.cy + Math.sin(a) * ry * 0.55 }
  })
  for (let k = 0; k < 6; k++) line(g, points[k]!, points[(k + 2) % 6]!, '#fde68a', bright * 0.8)
  plot(g, c.cx, c.cy, '#ffffff', bright)
  // As it forms, a flash of light round it.
  if (flash > 0)
    ring(
      g,
      c.cx,
      c.cy,
      rx * (1 + (1 - flash) * 0.3),
      ry * (1 + (1 - flash) * 0.3),
      '#ffffff',
      flash * 0.8,
    )
}

/**
 * The chant's pillar, from the moment she starts chanting: a magic circle under her feet, then the
 * circles above her one after another, a column of light rising through them and growing
 * brighter, sparks streaming up it, and in the last moments everything brighter and faster, the
 * column white.
 */
function drawPillar(g: CanvasRenderingContext2D, scene: Scene): void {
  const { feet, accent, still } = scene
  const t = still ? EXPLOSION.chantMs * 0.8 : scene.t
  const circles = pillarCircles(scene)
  const x = circles[0]!.cx
  const top = circles.at(-1)!.cy - circles.at(-1)!.ry - 8
  // How strong the magic is: growing through the chant, surging at the end.
  const power =
    between(t, 1500, EXPLOSION.chantMs - 1500) * 0.6 +
    between(t, EXPLOSION.chantMs - 1500, EXPLOSION.chantMs) * 0.4
  const surge = between(t, EXPLOSION.chantMs - 1500, EXPLOSION.chantMs)
  const flicker = still ? 1 : 0.85 + 0.15 * Math.sin(t / (60 - surge * 40))

  // The column of light: brightest in the middle, from her feet up past the top circle.
  const width = circles[0]!.rx * (0.5 + power * 0.3)
  const columnTop = top - (scene.feet - top) * 0.1
  for (let dx = -Math.ceil(width); dx <= Math.ceil(width); dx++) {
    const edge = 1 - Math.abs(dx) / width
    if (edge <= 0) continue
    g.globalAlpha = clamp01(edge * edge * (0.12 + power * 0.5) * flicker)
    g.fillStyle = surge > 0.7 || Math.abs(dx) < width * 0.25 ? '#ffffff' : '#fde68a'
    g.fillRect(Math.round(x + dx), Math.round(columnTop), 1, Math.round(feet - columnTop))
  }

  // The circle under her feet, turning, there from the start.
  const ground = {
    cx: x,
    cy: feet - 1,
    rx: circles[0]!.rx * 0.9,
    ry: circles[0]!.rx * 0.2,
    born: 0,
    turn: 1 as const,
  }
  magicCircle(g, ground, t, power, accent)
  for (const circle of circles) magicCircle(g, circle, t, power, accent)

  // Sparks streaming up the column, more as the magic grows, each looping back to the bottom.
  const random = seeded(11)
  const height = feet - columnTop
  for (let k = 0; k < 110; k++) {
    const offset = (random() - 0.5) * width * 2.2
    const speed = 0.04 + random() * 0.08
    const phase = random() * height
    const colour = k % 3 === 0 ? accent : k % 3 === 1 ? '#fde68a' : '#ffffff'
    if (k > 20 + power * 90) continue
    const y = feet - ((t * speed + phase) % height)
    const sway = Math.sin(t / 300 + k) * 2
    const alpha = (0.4 + 0.6 * ((feet - y) / height)) * flicker
    if (k % 5 === 0) twinkle(g, x + offset + sway, y, colour, alpha)
    else plot(g, x + offset + sway, y, colour, alpha)
  }

  // At the very end, a white flash up the whole column.
  const flare = between(t, EXPLOSION.chantMs - 200, EXPLOSION.chantMs)
  if (flare > 0) {
    g.globalAlpha = flare * 0.9
    g.fillStyle = '#ffffff'
    g.fillRect(Math.round(x - width), 0, Math.round(width * 2), Math.round(feet))
  }
  g.globalAlpha = 1
}

/** The explosion's palette, hottest first: white, yellow, orange, red, deep red, then smoke. */
const FIRE: [number, [number, number, number]][] = [
  [1.05, [255, 252, 232]],
  [0.82, [253, 224, 71]],
  [0.6, [251, 146, 60]],
  [0.38, [239, 68, 68]],
  [0.18, [127, 29, 29]],
  [0.0, [64, 52, 64]],
]

let fireCanvas: HTMLCanvasElement | null = null

/**
 * The explosion, `b` ms after the bang, in the middle of the screen: a white flash across the
 * screen, a fireball that bursts out with ragged, churning edges, cools from white through
 * yellow, orange and red to smoke as it rises, a shock wave racing out round it, and sparks
 * thrown out and falling.
 */
function drawBoom(g: CanvasRenderingContext2D, scene: Scene, b: number): void {
  const { w, h, still } = scene
  const at = still ? 700 : b
  const cx = w / 2
  const cy = h * 0.45 - (at / 1000) * Math.min(w, h) * 0.05
  const { fire, shock } = blastAt(at, w, h)
  const gone = 1 - between(at, EXPLOSION.boomMs - 800, EXPLOSION.boomMs)

  // The flash.
  if (!still && b < 220) {
    g.globalAlpha = 0.75 * (1 - b / 220)
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, w, h)
  }

  // The fireball, drawn a pixel at a time at half size (chunkier pixels) and stretched on.
  const size = Math.ceil(fire * 1.5) + 2
  if (size > 2) {
    fireCanvas ??= document.createElement('canvas')
    fireCanvas.width = size
    fireCanvas.height = size
    const fg = fireCanvas.getContext('2d')!
    const image = fg.createImageData(size, size)
    const cooling = between(at, 450, EXPLOSION.boomMs) * 1.25
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const dx = (i - size / 2) * 2
        const dy = (j - size / 2) * 2
        const d = Math.hypot(dx, dy * 1.1)
        const churn = noise(dx * 0.06 + at / 400, dy * 0.06 - at / 250)
        const n = d / Math.max(1, fire) + (churn - 0.5) * 0.5
        const heat = (1 - n) * 1.7 - cooling + (churn - 0.5) * 0.3
        if (n >= 1 || heat <= -0.05) continue
        const [, [r, gr, bl]] = FIRE.find(([limit]) => heat >= limit) ?? FIRE.at(-1)!
        const smoke = heat < 0.18
        const o = (j * size + i) * 4
        image.data[o] = r
        image.data[o + 1] = gr
        image.data[o + 2] = bl
        image.data[o + 3] = Math.round(255 * gone * (smoke ? clamp01(0.5 + heat * 3) : 1))
      }
    }
    fg.putImageData(image, 0, 0)
    g.globalAlpha = 1
    g.imageSmoothingEnabled = false
    g.drawImage(fireCanvas, Math.round(cx - size), Math.round(cy - size), size * 2, size * 2)
  }

  if (still) return
  // The shock wave: a ring racing out, fading.
  const wave = 1 - between(b, 0, 1000)
  if (wave > 0) {
    ring(g, cx, cy, shock, shock * 0.8, '#fff7d6', wave * 0.9)
    ring(g, cx, cy, shock * 0.97, shock * 0.8 * 0.97, '#fde68a', wave * 0.6)
  }
  // Sparks: thrown out in every direction, falling, with short tails, fading.
  const random = seeded(23)
  for (let k = 0; k < 90; k++) {
    const angle = random() * Math.PI * 2
    const speed = (0.08 + random() * 0.2) * (Math.min(w, h) / 300)
    const life = 900 + random() * 900
    if (b > life) continue
    const fade = 1 - b / life
    const sx = cx + Math.cos(angle) * speed * b
    const sy = cy + Math.sin(angle) * speed * b + 0.00006 * b * b * (Math.min(w, h) / 300)
    const colour = k % 3 === 0 ? '#ffffff' : k % 3 === 1 ? '#fde047' : '#fb923c'
    plot(g, sx, sy, colour, fade)
    plot(g, sx + 1, sy, colour, fade)
    plot(g, sx, sy + 1, colour, fade)
    plot(g, sx + 1, sy + 1, colour, fade)
    for (let k2 = 1; k2 <= 3; k2++) {
      plot(
        g,
        sx - Math.cos(angle) * k2 * 1.5,
        sy - Math.sin(angle) * k2 * 1.5,
        colour,
        fade * (0.6 - k2 * 0.15),
      )
    }
  }
  g.globalAlpha = 1
}

/** The explosion spell: the pillar while she chants, then the bang. */
export function drawExplosion(g: CanvasRenderingContext2D, scene: Scene): void {
  if (scene.t < EXPLOSION.chantMs) drawPillar(g, scene)
  else drawBoom(g, scene, scene.t - EXPLOSION.chantMs)
}
