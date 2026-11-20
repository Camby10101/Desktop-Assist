// What's drawn round her charms: a butterfly, juggled orbs, bubbles, a will-o'-wisp, a little spell.

import type { Scene } from './kit'
import { SPARKLE, TWINKLE } from './kit'
import { add, type Point } from '../raster'
import { DIAGONAL_MOUTH } from '../pictures'

/** A little magic butterfly, wings open and shut: teal wings, a white spot on each, a gold body. */
export const BUTTERFLY_OPEN = ['GG.GG', 'GwkwG', '.G.G.']

export const BUTTERFLY_SHUT = ['.GkG.', '..k..']

/** Juggling orbs: a teal one, a gold one and a pink one, each with a glint. */
export const ORBS = [
  ['.G.', 'GwG', '.G.'],
  ['.Y.', 'YwY', '.Y.'],
  ['.c.', 'cwc', '.c.'],
]

/** A soap bubble, small and grown: a teal ring (see-through inside) with a white glint. */
export const BUBBLE_SMALL = ['.G.', 'G.G', '.G.']

export const BUBBLE_BIG = ['.GG.', 'Gw.G', 'G..G', '.GG.']

/** The little silver wand ring she blows bubbles through. */
export const WAND_RING = ['.f.', 'f.f', '.f.']

/** A will-o'-wisp: a round teal light with a white heart. */
export const WISP = ['.GG.', 'GwwG', 'GwwG', '.GG.']

/**
 * Juggling (Pose.juggle): how many times each orb goes round, hand to hand and back, while she
 * juggles; how far up its high arc goes above her hands, and its low pass back (pixels); and the
 * share of the way round spent on the high arc.
 */
export const JUGGLE = { rounds: 4, high: 28, low: 5, arc: 0.62 }

// Her toys, each summoned into her hand in a sparkle (`appear`) and gone in a twinkle (`gone`),
// with what she does with it between: shares of the habit (0 to 1), and sizes in pixels.

/**
 * Bubbles (Pose.bubbles): how many she blows, when the first comes and how far apart they come
 * (shares of the habit), how long each floats before it pops, and when she puts the wand away.
 */
export const BUBBLES = { count: 5, first: 0.1, gap: 0.12, life: 0.36, wandAway: 0.86 }

/**
 * Where the will-o'-wisp is (Pose.wisp, 0 to 1), from the middle of her chest: it appears at her
 * side, goes round her twice (a flat ellipse, bobbing; on the far half it's behind her), then
 * flies off up and away. Null before it comes and once it's gone.
 */
export function wispAt(t: number): { x: number; y: number; behind: boolean } | null {
  const [come, round, gone] = [0.06, 0.8, 0.96]
  if (t < come || t >= gone) return null
  if (t < round) {
    const angle = ((t - come) / (round - come)) * Math.PI * 4
    return {
      x: Math.cos(angle) * 20,
      y: Math.sin(angle) * 5 + Math.sin(angle * 3) * 1.5 - 4,
      behind: Math.sin(angle) < 0,
    }
  }
  const away = (t - round) / (gone - round)
  return { x: 20 + away * 14, y: -4 - away * away * 46, behind: false }
}

/**
 * A little butterfly: it flutters down to just above her raised hand, rests there opening and
 * shutting its wings, then flies off up and away (out of the frame).
 */
export function paintButterfly({ pose, canvas, hand }: Scene): void {
  const flight = pose.butterfly ?? 0
  if (flight > 0.06 && flight < 0.92) {
    const perch = add(hand, { x: 0, y: -3 })
    const between = (from: Point, to: Point, t: number) => ({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    })
    let at: Point
    let open: boolean
    if (flight < 0.3) {
      const t = (flight - 0.06) / 0.24
      const eased = t * t * (3 - 2 * t)
      at = between(add(hand, { x: 16, y: -24 }), perch, eased)
      at = { x: at.x + Math.sin(t * 9) * 2 * (1 - t), y: at.y }
      open = Math.floor(flight * 80) % 2 === 0
    } else if (flight < 0.72) {
      at = perch
      open = Math.floor((flight - 0.3) / 0.07) % 2 === 0
    } else {
      at = between(perch, add(hand, { x: 22, y: -36 }), ((flight - 0.72) / 0.2) ** 1.4)
      open = Math.floor(flight * 80) % 2 === 0
    }
    if (open) canvas.stamp(BUTTERFLY_OPEN, at.x - 2, at.y - 1)
    else canvas.stamp(BUTTERFLY_SHUT, at.x - 2, at.y)
  }
}

/**
 * Juggling: three orbs, a third of the way round apart, each thrown up in a high arc from her far
 * hand to her near one and passed quickly back underneath (a "shower"), just above her hands.
 */
export function paintJuggle({ pose, canvas, hand, farHand }: Scene): void {
  const juggle = pose.juggle ?? 0
  if (juggle > 0 && juggle < 1 && farHand) {
    const left = farHand
    ORBS.forEach((orb, k) => {
      const round = (juggle * JUGGLE.rounds + k / ORBS.length) % 1
      const high = round < JUGGLE.arc
      const t = high ? round / JUGGLE.arc : (round - JUGGLE.arc) / (1 - JUGGLE.arc)
      const [from, to] = high ? [left, hand] : [hand, left]
      const up = (high ? JUGGLE.high : JUGGLE.low) * 4 * t * (1 - t)
      const at = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - 3 - up }
      canvas.stamp(orb, at.x - 1, at.y - 1)
    })
  }
}

/**
 * Bubbles: the wand ring held up at her near hand, and bubbles drifting up and forward from in
 * front of her mouth, wobbling and growing, each popping in a twinkle.
 */
export function paintBubbles({ pose, canvas, set, hand }: Scene): void {
  const bubbles = pose.bubbles ?? 0
  if (bubbles > 0) {
    if (bubbles < BUBBLES.wandAway) {
      set(add(hand, { x: 0.5, y: -1.5 }), 'F')
      canvas.stamp(WAND_RING, hand.x, hand.y - 4)
    }
    const dy = Math.round(pose.y ?? 0)
    const from = { x: DIAGONAL_MOUTH.x + 6, y: DIAGONAL_MOUTH.y - 2 + dy }
    for (let k = 0; k < BUBBLES.count; k++) {
      const life = (bubbles - BUBBLES.first - k * BUBBLES.gap) / BUBBLES.life
      if (life <= 0 || life > 1.12) continue
      const at = {
        x: from.x + life * 15 + Math.sin(life * 9 + k * 2) * 1.5,
        y: from.y - life * 21,
      }
      if (life > 1) canvas.stamp(TWINKLE, at.x - 1, at.y - 1)
      else if (life < 0.3) canvas.stamp(BUBBLE_SMALL, at.x - 1, at.y - 1)
      else canvas.stamp(BUBBLE_BIG, at.x - 1.5, at.y - 1.5)
    }
  }
}

/**
 * A will-o'-wisp going round her, with a fading tail: on the far side of her it's behind her,
 * drawn only where nothing of her is.
 */
export function paintWisp({ pose, set, onBody }: Scene): void {
  const wisp = pose.wisp ?? 0
  if (wisp > 0) {
    const chest = onBody({ x: 0, y: 2 })
    const trail = [wispAt(wisp - 0.012), wispAt(wisp - 0.006)]
    trail.forEach((p, k) => {
      if (p)
        set({ x: chest.x + p.x, y: chest.y + p.y }, k === 0 ? 'f' : 'G', p.behind ? '.' : undefined)
    })
    const at = wispAt(wisp)
    if (at) {
      WISP.forEach((row, dy) =>
        [...row].forEach((letter, dx) => {
          if (letter === '.') return
          const p = { x: chest.x + at.x - 1.5 + dx, y: chest.y + at.y - 1.5 + dy }
          set(p, letter, at.behind ? '.' : undefined)
        }),
      )
    }
  }
}

/**
 * A little spell: sparkles round her raised hand.
 */
export function paintSpell({ pose, canvas, hand }: Scene): void {
  const sparkle = pose.sparkle ?? 0
  if (sparkle > 0) {
    const spin = sparkle * Math.PI * 2
    canvas.stamp(SPARKLE, hand.x - 2 + Math.cos(spin) * 6, hand.y - 2 - 4 + Math.sin(spin) * 4)
    canvas.stamp(
      TWINKLE,
      hand.x - 1 + Math.cos(spin + 2.1) * 7,
      hand.y - 1 - 5 + Math.sin(spin + 2.1) * 5,
    )
    canvas.stamp(
      TWINKLE,
      hand.x - 1 + Math.cos(spin + 4.2) * 5,
      hand.y - 1 - 3 + Math.sin(spin + 4.2) * 3,
    )
  }
}
