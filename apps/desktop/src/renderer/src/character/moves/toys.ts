// Her toys (HABITS, kind 'toy'): habits where she summons a toy and plays with it a few seconds.

import { FIDGET_MS } from '@shared/character'
import { type Arm, type Face } from '../rig'
import { BALL, DECK, PLANE, SPIN_TOP, YOYO } from '../props/toys'
import {
  type Key,
  lerp,
  ARM_DOWN,
  between,
  span,
  OUT_FRONT,
  OUT_SIDE,
  through,
  toward,
  blinking,
  type Moves,
  once,
} from './kit'

/**
 * Her yo-yo, from the front: she holds her hand out and a yo-yo appears in it in a sparkle; she
 * spins it down and up, watching it, her hand giving a little flick as each drop starts; then
 * raises her hand and swings it round in a loop, smiling; and it vanishes in a twinkle.
 */
export function yoyo(): Key[] {
  return through(FIDGET_MS.yoyo, (t) => {
    const ready = between(t, 0, 0.08) * (1 - between(t, 0.92, 1))
    const drops = span(t, YOYO.drops)
    const flick =
      drops > 0 && drops < 1
        ? Math.max(0, Math.cos(drops * YOYO.count * Math.PI * 2)) ** 6 * 0.25
        : 0
    const looping =
      between(t, YOYO.loop[0] - 0.04, YOYO.loop[0]) *
      (1 - between(t, YOYO.loop[1], YOYO.loop[1] + 0.04))
    const arm: Arm = {
      shoulder: lerp(ARM_DOWN.shoulder, OUT_SIDE.shoulder + 0.4 * looping, ready),
      elbow: lerp(ARM_DOWN.elbow, OUT_SIDE.elbow + 0.3 * looping, ready) + flick,
    }
    const face: Face = drops > 0 && drops < 1 ? 'down' : t > YOYO.loop[0] ? 'happy' : 'neutral'
    return { view: 'front', yoyo: t, face, arms: [arm, ARM_DOWN] }
  })
}

/**
 * Her spinning top, from the front: she holds her palm out and a top appears on it, spinning; she
 * watches it wobble; flicks her hand to send it up, catches it, smiles; and it vanishes.
 */
export function top(): Key[] {
  return through(FIDGET_MS.top, (t) => {
    const ready = between(t, 0, 0.08) * (1 - between(t, 0.92, 1))
    const flick = span(t, SPIN_TOP.flick)
    const toss = flick > 0 && flick < 0.25 ? Math.sin((flick / 0.25) * Math.PI) * 0.35 : 0
    const arm = toward({ shoulder: OUT_SIDE.shoulder, elbow: OUT_SIDE.elbow + toss }, ready)
    const face: Face =
      t < SPIN_TOP.spin[0] ? 'neutral' : t < SPIN_TOP.flick[0] ? 'down' : flick < 1 ? 'up' : 'happy'
    return { view: 'front', spinTop: t, face, arms: [arm, ARM_DOWN] }
  })
}

/**
 * Her cards, from the front: she holds both hands out and a deck appears in her far hand; she
 * springs the cards across to her other hand in an arc, and back, her hands bobbing as they go;
 * smiles; and they vanish.
 */
export function cards(): Key[] {
  return through(FIDGET_MS.cards, (t) => {
    const ready = between(t, 0, 0.08) * (1 - between(t, 0.92, 1))
    const springing =
      (t > DECK.across[0] && t < DECK.across[1]) || (t > DECK.back[0] && t < DECK.back[1])
    const bob = springing ? Math.sin(t * 120) * 0.08 : 0
    const arm = (d: number) =>
      toward({ shoulder: OUT_FRONT.shoulder, elbow: OUT_FRONT.elbow + d }, ready)
    const face: Face = t > DECK.back[1] ? 'happy' : blinking(t, 0.48, 'neutral')
    return { view: 'front', deck: t, face, arms: [arm(bob), arm(-bob)] }
  })
}

/**
 * Her paper plane, from the front: she raises her hand and a paper plane appears in it; she throws
 * it, watching it fly round her, her head turning after it; holds her hand out as it comes back,
 * catches it, smiles; and it vanishes.
 */
export function plane(): Key[] {
  return through(FIDGET_MS.plane, (t) => {
    const raised = between(t, 0, 0.08)
    const thrown = between(t, PLANE.fly[0] - 0.05, PLANE.fly[0])
    const catching = between(t, PLANE.fly[1] - 0.1, PLANE.fly[1] - 0.02)
    const away = 1 - between(t, 0.92, 1)
    const holding = toward({ shoulder: 1.3, elbow: -1 }, raised)
    const throwing: Arm = {
      shoulder: lerp(holding.shoulder, 0.5, thrown),
      elbow: lerp(holding.elbow, 0, thrown),
    }
    const flying: Arm = {
      shoulder: lerp(
        throwing.shoulder,
        ARM_DOWN.shoulder,
        between(t, PLANE.fly[0], PLANE.fly[0] + 0.1),
      ),
      elbow: lerp(throwing.elbow, ARM_DOWN.elbow, between(t, PLANE.fly[0], PLANE.fly[0] + 0.1)),
    }
    const reach = {
      shoulder: lerp(flying.shoulder, 0.8, catching),
      elbow: lerp(flying.elbow, -0.9, catching),
    }
    const arm = toward(reach, away)
    const fly = span(t, PLANE.fly)
    const turn = fly > 0 && fly < 1 ? Math.cos(Math.PI / 4 - fly * Math.PI * 2) : 0
    const face: Face = fly > 0 && fly < 1 ? 'up' : t > PLANE.fly[1] ? 'happy' : 'neutral'
    return { view: 'front', plane: t, face, tilt: 0.08 * turn, arms: [arm, ARM_DOWN] }
  })
}

/**
 * Her bouncy ball, from the front: she holds her hand out and a ball appears in it; she bounces it
 * on the taskbar, her hand pushing it down each time, watching; tosses it up high, looking up, and
 * catches it, smiling; and it vanishes.
 */
export function ball(): Key[] {
  return through(FIDGET_MS.ball, (t) => {
    const ready = between(t, 0, 0.08) * (1 - between(t, 0.92, 1))
    const bounces = span(t, BALL.bounces)
    const push =
      bounces > 0 && bounces < 1
        ? Math.max(0, Math.cos(bounces * BALL.count * Math.PI * 2)) ** 4 * 0.35
        : 0
    const toss = span(t, BALL.toss)
    const up = toss > 0 && toss < 0.2 ? Math.sin((toss / 0.2) * Math.PI) * 0.6 : 0
    const arm = toward(
      { shoulder: OUT_SIDE.shoulder + up, elbow: OUT_SIDE.elbow + push - up * 0.5 },
      ready,
    )
    const face: Face =
      bounces > 0 && bounces < 1
        ? 'down'
        : toss > 0 && toss < 1
          ? 'up'
          : t > BALL.toss[1]
            ? 'happy'
            : 'neutral'
    return { view: 'front', ball: t, face, arms: [arm, ARM_DOWN] }
  })
}

/** Her toys, by pose (each plays once, for its HABITS `ms`). */
export const TOY_MOVES = {
  yoyo: once(yoyo),
  top: once(top),
  cards: once(cards),
  plane: once(plane),
  ball: once(ball),
} satisfies Moves
