// Her reactions (REACTIONS): played once, in answer to something.

import { REACTION_MS } from '@shared/character'
import { type Arm, type Face, type Pose } from '../rig'
import {
  type Key,
  ARM_DOWN,
  tween,
  hold,
  crouch,
  FRONT,
  DIAGONAL,
  between,
  through,
  toward,
  blinking,
  type Moves,
  once,
} from './kit'

import { juggle } from './charms'

/** Petted, from the front: a happy little wiggle, her hands clasped, hearts floating up. */
export function pet(): Key[] {
  return through(REACTION_MS.pet, (t) => {
    const wiggle = Math.sin(t * Math.PI * 8) * (1 - between(t, 0.75, 1))
    const clasp = between(t, 0, 0.1) * (1 - between(t, 0.85, 1))
    const hands = toward({ shoulder: 0.3, elbow: -0.9 }, clasp)
    return {
      view: 'front',
      hearts: t,
      x: Math.round(wiggle),
      tilt: wiggle * 0.06,
      face: blinking(t, 0.5, 'happy'),
      arms: [hands, hands],
    }
  })
}

/** A new notification, from the front: she hops up holding a scroll open in front of her, delighted. */
export function scroll(): Key[] {
  return through(REACTION_MS.scroll, (t) => {
    const up = between(t, 0, 0.12) * (1 - between(t, 0.82, 0.94))
    const hop = (from: number) =>
      t > from && t < from + 0.16 ? Math.sin(between(t, from, from + 0.16) * Math.PI) : 0
    const bounce = hop(0.12) + hop(0.34) * 0.6
    const arm = toward({ shoulder: 1.25, elbow: -2.35 }, up)
    return {
      view: 'front',
      scroll: up > 0.85,
      y: Math.round(-5 * bounce),
      lift: 2 * bounce,
      face: blinking(t, 0.7, 'happy'),
      arms: [arm, arm],
    }
  })
}

/** Startled, from the front: a jump straight up, hair flying, arms out, wide-eyed; then a blink. */
export function startle(): Key[] {
  const crouched: Pose = { view: 'front', face: 'surprised', y: 2, legs: crouch(2) }
  const air: Pose = {
    view: 'front',
    face: 'surprised',
    y: -8,
    lift: 4,
    arms: [
      { shoulder: 1.6, elbow: 0.3 },
      { shoulder: 1.6, elbow: 0.3 },
    ],
  }
  return [
    ...hold(crouched, 80),
    ...tween(crouched, air, 160),
    ...hold(air, 140),
    ...tween(air, { ...FRONT, face: 'surprised' }, 200),
    ...hold({ ...FRONT, face: 'surprised' }, 180),
    ...hold({ view: 'front', face: 'blink' }, 120),
    ...hold(FRONT, 120),
  ]
}

/**
 * Pouncing at the pointer, seen diagonally (mirrored to go left): she crouches, leaps up and
 * forward with both hands reaching to grab it, lands, and looks at her empty hands.
 */
export function pounce(): Key[] {
  const crouched: Pose = { ...DIAGONAL, face: 'down', y: 4, legs: crouch(4), tilt: 0.05 }
  const leap: Pose = {
    ...DIAGONAL,
    face: 'surprised',
    x: 4,
    y: -8,
    lift: 3,
    arms: [
      { shoulder: 2.3, elbow: 0.2 },
      { shoulder: 2.1, elbow: 0.2 },
    ],
    legs: [
      { hip: -0.3, knee: 0.6 },
      { hip: 0.4, knee: 0.8 },
    ],
  }
  const landed: Pose = {
    ...DIAGONAL,
    face: 'down',
    x: 6,
    arms: [{ shoulder: 0.8, elbow: 1.2 }, ARM_DOWN],
  }
  return [
    ...tween(DIAGONAL, crouched, 200),
    ...hold(crouched, 120),
    ...tween(crouched, leap, 180),
    ...hold(leap, 120),
    ...tween(leap, landed, 200),
    ...hold(landed, 300),
    ...hold({ ...landed, face: 'blink' }, 100),
    ...tween(landed, DIAGONAL, 180),
  ]
}

/** Lifting something by magic, from the front: her arms rise overhead, palms up, eyes on it. */
export function lift(): Key[] {
  const up: Pose = {
    view: 'front',
    face: 'up',
    arms: [
      { shoulder: 2.6, elbow: 0.5 },
      { shoulder: 2.6, elbow: 0.5 },
    ],
  }
  return [...tween({ ...FRONT, face: 'down' }, up, 560), ...hold(up, 240)]
}

/** Setting something down by magic, from the front: her arms come down from overhead, eyes on it. */
export function lower(): Key[] {
  const up: Pose = {
    view: 'front',
    face: 'up',
    arms: [
      { shoulder: 2.6, elbow: 0.5 },
      { shoulder: 2.6, elbow: 0.5 },
    ],
  }
  return [...hold(up, 120), ...tween(up, { ...FRONT, face: 'down' }, 520), ...hold(FRONT, 160)]
}

/**
 * Guilty, from the front (after a prank): hands behind her back, she glances one way and the
 * other, a bead of sweat by her forehead, then gives a sheepish smile.
 */
export function guilty(): Key[] {
  const behind: [Arm, Arm] = [
    { shoulder: 0.02, elbow: -0.35 },
    { shoulder: 0.02, elbow: -0.35 },
  ]
  const glance = (look: number, face: Face = 'neutral'): Pose => ({
    view: 'front',
    face,
    look,
    sweat: true,
    tilt: look * 0.04,
    arms: behind,
  })
  return [
    ...tween(FRONT, glance(0), 200),
    ...hold(glance(-1), 320),
    ...hold(glance(1), 320),
    ...hold(glance(-1), 280),
    ...hold(glance(1), 280),
    ...hold(glance(0, 'blink'), 120),
    ...hold(glance(0, 'happy'), 640),
    ...tween(glance(0, 'happy'), FRONT, 240),
  ]
}

/** Juggling with her hands alone (what she juggles is drawn by someone else): see juggle. */
export function toss(): Key[] {
  return juggle().map(({ pose, ms }) => ({ pose: { ...pose, juggle: undefined }, ms }))
}

/** Her reactions, by pose (each plays once, for its REACTION_MS). */
export const REACTION_MOVES = {
  pet: once(pet),
  scroll: once(scroll),
  startle: once(startle),
  'pounce-left': once(pounce),
  'pounce-right': once(pounce),
  lift: once(lift),
  lower: once(lower),
  guilty: once(guilty),
  toss: once(toss),
} satisfies Moves
