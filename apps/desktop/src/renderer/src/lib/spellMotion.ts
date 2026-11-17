import { EXPLOSION, STARFALL } from '@shared/spells'

// Where things are in her spells' effects, moment by moment (see lib/spellArt.ts, which draws
// them): starfall's shooting stars, the explosion's magic circles and how big its blast is. In the
// effects' pixels (twice the size of hers), times in ms since the spell was cast. Anything random
// comes from a seeded generator, so each frame has the same stars, sparks and smoke. Nothing here
// draws, so it can be tested away from a page.

/** What a frame is drawn from. */
export interface Scene {
  /** Since the spell was cast (ms). */
  t: number
  /** The canvas's size (pixels). */
  w: number
  h: number
  /** Where she stands across it, and how far down her feet are (pixels). */
  x: number
  feet: number
  /** How many canvas pixels she is tall (her 92 sprite pixels, hat to boots). */
  height: number
  /** Her accent colour (the robe, the magic circles). */
  accent: string
  /** Windows' reduced-motion setting: nothing moves; things just show. */
  still: boolean
}

/** A seeded random number generator (mulberry32): the same numbers, 0 to 1, every time. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** `v` kept between 0 and 1. */
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
/** Fast at first, slowing to a stop. */
export const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3
/** 0 before `from`, 1 after `to`, in between in a straight line. */
export const between = (t: number, from: number, to: number) => clamp01((t - from) / (to - from))

/** A lattice point's random number, for noise. */
function lattice(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Smooth value noise, 0 to 1: turbulence for fire and smoke. */
export function noise(x: number, y: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const top = lattice(x0, y0) + (lattice(x0 + 1, y0) - lattice(x0, y0)) * sx
  const bottom = lattice(x0, y0 + 1) + (lattice(x0 + 1, y0 + 1) - lattice(x0, y0 + 1)) * sx
  return top + (bottom - top) * sy
}

/** A shooting star in the sky: where its head is, which way it's going, and how old it is. */
export interface Star {
  x: number
  y: number
  /** Its direction (a unit vector: down and to the left). */
  dx: number
  dy: number
  /** How long it's been falling, and how long it falls for (ms). */
  age: number
  life: number
  colour: string
}

/** The shooting stars' colours, and the way they all fall: down, and a little to the left. */
export const STAR_COLOURS = ['#fff7d6', '#fde68a', '#bae6fd', '#fbcfe8', '#ddd6fe']
export const STAR_DIRECTION = { dx: -0.5, dy: 0.866 }

/**
 * The shooting stars falling at `t`: STARFALL.perSecond start each second (each up to 0.3 s
 * late), from along the top of the screen and off its right-hand side, each falling down to the
 * left for a second or so, at its own speed.
 */
export function starsAt(t: number, w: number, h: number): Star[] {
  const random = seeded(7)
  const count = Math.floor((STARFALL.durationMs / 1000) * STARFALL.perSecond)
  const stars: Star[] = []
  for (let i = 0; i < count; i++) {
    // Every number is drawn whether or not the star is falling yet, so each keeps its own.
    const born = (i / STARFALL.perSecond) * 1000 + random() * 300
    const life = 900 + random() * 700
    const startX = random() * w * 1.4
    const startY = -random() * h * 0.25
    const speed = ((w + h) / 1400) * (0.7 + random() * 0.6)
    const colour = STAR_COLOURS[Math.floor(random() * STAR_COLOURS.length)]!
    const age = t - born
    // None starts too late to be gone by the end.
    if (age < 0 || age > life || born + 1600 > STARFALL.durationMs - 100) continue
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

/** One of the pillar's magic circles: where it is, how big, when it comes, and which way it turns. */
export interface Circle {
  cx: number
  cy: number
  rx: number
  ry: number
  born: number
  turn: 1 | -1
}

/**
 * The pillar's magic circles, EXPLOSION.circles of them, stacked up from just above her hat to
 * near the top of the screen: flat ellipses (seen from the side, like the one under her feet),
 * every other one a little bigger and turning the other way, coming one after another over the
 * first two thirds of the chant.
 */
export function pillarCircles(scene: Pick<Scene, 'w' | 'h' | 'x' | 'feet' | 'height'>): Circle[] {
  const n = EXPLOSION.circles
  const size = Math.min(scene.w * 0.2, Math.max(20, scene.height * 1.25))
  // The lowest clear of her hat (the biggest circles are 1.2 × size across, and 0.3 as deep).
  const bottom = scene.feet - scene.height - size * 0.36 - 3
  const top = Math.min(bottom - 6 * (n - 1), Math.max(10, scene.h * 0.08))
  const gap = (bottom - top) / (n - 1)
  // Above her, but with most of every circle on the screen (80% of the bigger ones, which are 1.2
  // times as wide), even with her right in a corner.
  const cx = Math.min(Math.max(scene.x, size * 0.96), scene.w - size * 0.96)
  return Array.from({ length: n }, (_, i) => {
    const rx = size * (i % 2 === 0 ? 1 : 1.2)
    return {
      cx,
      cy: bottom - i * gap,
      rx,
      ry: rx * 0.3,
      born: 500 + i * ((EXPLOSION.chantMs * 0.66) / n),
      turn: i % 2 === 0 ? 1 : -1,
    }
  })
}

/** The explosion's size at `b` ms after the bang: its fireball's radius, and its shock wave's. */
export function blastAt(b: number, w: number, h: number): { fire: number; shock: number } {
  const full = Math.min(w, h) * 0.36
  const fire = full * (easeOut(b / 650) + 0.25 * between(b, 650, EXPLOSION.boomMs))
  const shock = full * 2.6 * easeOut(b / 1000)
  return { fire, shock }
}
