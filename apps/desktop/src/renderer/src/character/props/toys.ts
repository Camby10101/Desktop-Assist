// Her toys, summoned for a few seconds each: a yo-yo, a spinning top, cards, a paper plane and a
// bouncy ball. Each appears in a sparkle and goes in a twinkle (poof, shows).

import type { Scene } from './kit'
import { SPARKLE, TWINKLE, stage } from './kit'
import { type Point, type Canvas } from '../raster'

/** Her yo-yo, spinning (two turns, a frame each): pink, a gold band, a white glint. */
export const YOYO_SPIN = [
  ['.cc.', 'cYwc', 'cwYc', '.cc.'],
  ['.cc.', 'cwYc', 'cYwc', '.cc.'],
]

/** Her spinning top, a handle up top and a silver point below, its stripes turning as it spins. */
export const TOP_SPIN = [
  ['..k..', 'YGYGY', '.YGY.', '..Y..', '..f..'],
  ['..k..', 'GYGYG', '.GYG.', '..G..', '..f..'],
]

/** A playing card in flight, and her deck in her hand: white with a silver edge and a pink pip. */
export const CARD = ['fff', 'fcf', 'fwf', 'fff']

export const DECK_STACK = ['ffff', 'fcwf', 'fwwf', 'Ffff', 'FFFF']

/** A paper plane flying right (flying left, it's mirrored): white paper, a silver fold under it. */
export const PAPER_PLANE = ['w......', 'wwww...', '.fwwwww', '..ff...']

/** Her bouncy ball, round and squashed flat as it hits the taskbar: teal with a white glint. */
export const BOUNCY_BALL = ['.GG.', 'GwGG', 'GGGG', '.GG.']

export const BOUNCY_BALL_FLAT = ['.GGGG.', 'GGwGGG', '.GGGG.']

/** Her yo-yo (Pose.yoyo): its drops (how many, how far down) and its loop round her hand. */
export const YOYO = {
  appear: [0.03, 0.13],
  drops: [0.13, 0.7],
  count: 4,
  length: 24,
  loop: [0.72, 0.86],
  radius: 14,
  gone: [0.88, 0.97],
} as const

/** Her spinning top (Pose.spinTop): spinning on her palm, then flicked up (this high) and caught. */
export const SPIN_TOP = {
  appear: [0.03, 0.13],
  spin: [0.13, 0.72],
  flick: [0.72, 0.84],
  height: 16,
  gone: [0.88, 0.97],
} as const

/** Her cards (Pose.deck): sprung across to her near hand, and back; how many; each card's flight. */
export const DECK = {
  appear: [0.03, 0.13],
  across: [0.15, 0.47],
  back: [0.5, 0.82],
  cards: 9,
  flight: 0.1,
  arc: 13,
  gone: [0.88, 0.97],
} as const

/** Her paper plane (Pose.plane): thrown, flying one loop round her (how wide, how deep), caught. */
export const PLANE = {
  appear: [0.03, 0.13],
  fly: [0.18, 0.84],
  rx: 28,
  ry: 8,
  gone: [0.88, 0.97],
} as const

/** Her bouncy ball (Pose.ball): bounced on the taskbar (how many times), then tossed up and caught. */
export const BALL = {
  appear: [0.03, 0.13],
  bounces: [0.14, 0.62],
  count: 4,
  toss: [0.66, 0.84],
  height: 30,
  gone: [0.88, 0.97],
} as const

/** Her toys' sparkle and twinkle as they come and go (see poof and shows). */
function toyKit(canvas: Canvas) {
  // A puff of sparkle where one of her toys appears (`k`, 0 to 1 through it) or goes: a sparkle,
  // then a twinkle.
  const poof = (at: Point, k: number) => {
    if (k <= 0 || k >= 1) return
    if (k < 0.55) canvas.stamp(SPARKLE, at.x - 2, at.y - 2)
    else canvas.stamp(TWINKLE, at.x - 1, at.y - 1)
  }
  /** Whether a toy shows: from half way through its sparkle to half way through its twinkle. */
  const shows = (appear: number, gone: number) => appear >= 0.5 && gone < 0.5
  return { poof, shows }
}

/**
 * Her yo-yo: in her near hand; spun down on its silver string and back up, a few times; then
 * swung out round her hand in a loop; then gone.
 */
export function paintYoyo({ pose, canvas, set, hand }: Scene): void {
  const { poof, shows } = toyKit(canvas)
  const yoyo = pose.yoyo ?? 0
  if (yoyo > 0 && yoyo < 1) {
    const grip = { x: hand.x, y: hand.y + 1 }
    const drops = stage(yoyo, ...YOYO.drops)
    const loop = stage(yoyo, ...YOYO.loop)
    let at = grip
    if (drops > 0 && drops < 1) {
      at = { x: grip.x, y: grip.y + YOYO.length * Math.sin(Math.PI * ((drops * YOYO.count) % 1)) }
    } else if (loop > 0 && loop < 1) {
      // Out, round over her hand and back in: down, out to the side, up, across, down again.
      const angle = Math.PI / 2 - loop * Math.PI * 2
      const r = YOYO.radius * Math.sin(Math.PI * loop)
      at = { x: grip.x + r * Math.cos(angle), y: grip.y + r * Math.sin(angle) }
    }
    const appear = stage(yoyo, ...YOYO.appear)
    const gone = stage(yoyo, ...YOYO.gone)
    if (shows(appear, gone)) {
      const length = Math.hypot(at.x - grip.x, at.y - grip.y)
      for (let s = 1; s < length; s++) {
        set(
          {
            x: grip.x + ((at.x - grip.x) * s) / length,
            y: grip.y + ((at.y - grip.y) * s) / length,
          },
          'f',
        )
      }
      canvas.stamp(YOYO_SPIN[Math.floor(yoyo * 50) % 2]!, at.x - 1.5, at.y - 1.5)
    }
    poof(grip, appear)
    poof(at, gone)
  }
}

/**
 * Her spinning top: spinning on her palm, wobbling more as it slows; flicked up and caught.
 */
export function paintSpinTop({ pose, canvas, hand }: Scene): void {
  const { poof, shows } = toyKit(canvas)
  const spinTop = pose.spinTop ?? 0
  if (spinTop > 0 && spinTop < 1) {
    // Standing on her palm, clear of her cuff.
    const palm = { x: hand.x + 1, y: hand.y - 3 }
    const spin = stage(spinTop, ...SPIN_TOP.spin)
    const flick = stage(spinTop, ...SPIN_TOP.flick)
    const wobble = spin > 0 && spin < 1 ? Math.sin(spinTop * 70) * (0.3 + spin * 0.9) : 0
    const lift = flick > 0 && flick < 1 ? SPIN_TOP.height * 4 * flick * (1 - flick) : 0
    const at = { x: palm.x + wobble, y: palm.y - lift }
    const appear = stage(spinTop, ...SPIN_TOP.appear)
    const gone = stage(spinTop, ...SPIN_TOP.gone)
    if (shows(appear, gone)) {
      const turning = spinTop < SPIN_TOP.flick[1] ? Math.floor(spinTop * 60) % 2 : 0
      canvas.stamp(TOP_SPIN[turning]!, at.x - 2, at.y - 5)
    }
    poof({ x: palm.x, y: palm.y - 3 }, appear)
    poof({ x: palm.x, y: palm.y - 3 }, gone)
  }
}

/**
 * Her cards: a deck in her far hand, sprung across to her near hand one after another in an arc,
 * then back again; then gone.
 */
export function paintDeck({ pose, canvas, hand, farHand }: Scene): void {
  const { poof, shows } = toyKit(canvas)
  const deck = pose.deck ?? 0
  if (deck > 0 && deck < 1 && farHand) {
    const far = { x: farHand.x, y: farHand.y - 2 }
    const near = { x: hand.x, y: hand.y - 2 }
    // How many cards are still to go, in the air, or there, for a spring from `a` to `b`.
    const spring = (span: readonly [number, number], a: Point, b: Point) => {
      const stagger = (span[1] - span[0] - DECK.flight) / (DECK.cards - 1)
      let waiting = 0
      let landed = 0
      for (let k = 0; k < DECK.cards; k++) {
        const u = (deck - span[0] - k * stagger) / DECK.flight
        if (u <= 0) waiting++
        else if (u >= 1) landed++
        else {
          const at = {
            x: a.x + (b.x - a.x) * u,
            y: a.y + (b.y - a.y) * u - DECK.arc * 4 * u * (1 - u),
          }
          canvas.stamp(CARD, at.x - 1, at.y - 2)
        }
      }
      return { waiting, landed }
    }
    const appear = stage(deck, ...DECK.appear)
    const gone = stage(deck, ...DECK.gone)
    let inFar: number = DECK.cards
    let inNear = 0
    if (deck >= DECK.across[0] && deck < DECK.back[0]) {
      const across = spring(DECK.across, far, near)
      inFar = across.waiting
      inNear = across.landed
    } else if (deck >= DECK.back[0] && deck < DECK.back[1] + DECK.flight) {
      const back = spring(DECK.back, near, far)
      inNear = back.waiting
      inFar = back.landed
    }
    if (shows(appear, gone)) {
      if (inFar > 0) canvas.stamp(DECK_STACK, far.x - 1.5, far.y - 2)
      if (inNear > 0) canvas.stamp(DECK_STACK, near.x - 1.5, near.y - 2)
    }
    poof(far, appear)
    poof(far, gone)
  }
}

/**
 * Her paper plane: in her near hand; thrown, it flies one loop round her, out to the side, behind
 * her (where only what isn't her shows it) and back across in front, to her hand; then gone.
 */
export function paintPlane({ pose, set, hand, onBody, canvas }: Scene): void {
  const { poof, shows } = toyKit(canvas)
  const plane = pose.plane ?? 0
  if (plane > 0 && plane < 1) {
    const held = { x: hand.x, y: hand.y - 2 }
    const fly = stage(plane, ...PLANE.fly)
    let at = held
    let behind = false
    let right = true
    if (fly > 0 && fly < 1) {
      const chest = onBody({ x: 0, y: 2 })
      const angle = Math.PI / 4 - fly * Math.PI * 2
      const loop = {
        x: chest.x + PLANE.rx * Math.cos(angle),
        y: chest.y + PLANE.ry * Math.sin(angle) + Math.sin(fly * Math.PI * 4) * 1.5,
      }
      // Leaving her hand and coming back to it, it eases between her hand and the loop.
      const ease = Math.min(1, fly / 0.12, (1 - fly) / 0.12)
      at = { x: held.x + (loop.x - held.x) * ease, y: held.y + (loop.y - held.y) * ease }
      behind = Math.sin(angle) < 0
      right = Math.sin(angle) >= 0
    }
    const appear = stage(plane, ...PLANE.appear)
    const gone = stage(plane, ...PLANE.gone)
    if (shows(appear, gone)) {
      PAPER_PLANE.forEach((row, dy) =>
        [...(right ? row : [...row].reverse().join(''))].forEach((letter, dx) => {
          if (letter === '.') return
          set({ x: at.x - 3 + dx, y: at.y - 2 + dy }, letter, behind ? '.' : undefined)
        }),
      )
    }
    poof(held, appear)
    poof(held, gone)
  }
}

/**
 * Her bouncy ball: in her near hand; bounced on the taskbar a few times (squashing as it hits),
 * then tossed up high and caught; then gone.
 */
export function paintBall({ pose, canvas, hand }: Scene): void {
  const { poof, shows } = toyKit(canvas)
  const ball = pose.ball ?? 0
  if (ball > 0 && ball < 1) {
    const top = { x: hand.x, y: hand.y + 2 }
    const ground = 93
    const bounces = stage(ball, ...BALL.bounces)
    const toss = stage(ball, ...BALL.toss)
    let at = top
    let flat = false
    if (bounces > 0 && bounces < 1) {
      // 1 in her hand, 0 on the taskbar: down fast, a sharp bounce, up again.
      const u = Math.abs(((bounces * BALL.count) % 1) * 2 - 1)
      at = { x: top.x, y: ground - (ground - top.y) * u }
      flat = u < 0.08
    } else if (toss > 0 && toss < 1) {
      at = { x: top.x, y: top.y - BALL.height * 4 * toss * (1 - toss) }
    }
    const appear = stage(ball, ...BALL.appear)
    const gone = stage(ball, ...BALL.gone)
    if (shows(appear, gone)) {
      if (flat) canvas.stamp(BOUNCY_BALL_FLAT, at.x - 2.5, ground)
      else canvas.stamp(BOUNCY_BALL, at.x - 1.5, at.y - 1.5)
    }
    poof(top, appear)
    poof(top, gone)
  }
}
