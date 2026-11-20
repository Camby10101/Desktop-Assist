// Her everyday habits (HABITS, kind 'everyday'): little things anyone might do.

import { FIDGET_MS } from '@shared/character'
import { draw, type Arm, type Leg, type Pose } from '../rig'
import {
  type Key,
  type Frame,
  ARM_DOWN,
  LEG_STAND,
  FRAME_MS,
  tween,
  hold,
  crouch,
  FRONT,
  DIAGONAL,
  between,
  through,
  toward,
  blinking,
  mirror,
  type Moves,
  once,
} from './kit'

/** A hop: crouch, spring up with her arms flung up, float, fall, land with a bounce. */
export function hop(): Key[] {
  const up: [Arm, Arm] = [
    { shoulder: 2.4, elbow: 0.2 },
    { shoulder: 2.4, elbow: 0.2 },
  ]
  const tuck: [Leg, Leg] = [
    { hip: 0.2, knee: 0.55 },
    { hip: 0.2, knee: 0.55 },
  ]
  const low: Pose = {
    view: 'front',
    y: 3,
    legs: crouch(3),
    arms: [
      { shoulder: -0.2, elbow: 0.3 },
      { shoulder: -0.2, elbow: 0.3 },
    ],
  }
  const launch: Pose = { view: 'front', y: -3, arms: up, face: 'happy', lift: -2 }
  const rise: Pose = { view: 'front', y: -5, arms: up, legs: tuck, face: 'happy', lift: -1 }
  const apex: Pose = { view: 'front', y: -6, arms: up, legs: tuck, face: 'happy', lift: 1 }
  const float: Pose = { ...apex, lift: 2 }
  const fall: Pose = { view: 'front', y: -4, arms: up, face: 'happy', lift: 3 }
  const touch: Pose = { view: 'front', y: -1, arms: up, face: 'happy', lift: 3 }
  const land: Pose = {
    view: 'front',
    y: 3,
    legs: crouch(3),
    arms: [
      { shoulder: 0.9, elbow: 0.2 },
      { shoulder: 0.9, elbow: 0.2 },
    ],
    face: 'happy',
  }
  const recover: Pose = {
    view: 'front',
    y: 1,
    legs: crouch(1),
    arms: [
      { shoulder: 0.4, elbow: 0.1 },
      { shoulder: 0.4, elbow: 0.1 },
    ],
  }
  return [
    ...hold(FRONT, 60),
    ...tween(FRONT, low, 140),
    ...tween(low, launch, 80),
    ...tween(launch, rise, 90),
    ...tween(rise, apex, 120),
    ...tween(apex, float, 100),
    ...tween(float, fall, 80),
    ...tween(fall, touch, 70),
    ...tween(touch, land, 130),
    ...tween(land, recover, 110),
    ...tween(recover, FRONT, 140),
    ...hold(FRONT, 80),
  ]
}

/** A wave, seen diagonally: her hand up, waving to and fro, head tilted, smiling. */
export function wave(): Key[] {
  const hand = (elbow: number): Pose => ({
    view: 'diagonal',
    tilt: 0.08,
    face: 'happy',
    arms: [{ shoulder: 3.2, elbow }, ARM_DOWN],
  })
  // The upper arm raised out in front, the forearm upright, swinging to and fro: four waves.
  const waving: Key[] = Array.from({ length: 24 }, (_, i) => ({
    pose: hand(0.1 + 0.3 * Math.sin((i / 6) * Math.PI * 2)),
    ms: 50,
  }))
  return [
    ...hold(DIAGONAL, 100),
    ...tween(DIAGONAL, hand(0.1), 180),
    ...waving,
    ...tween(hand(0.1), DIAGONAL, 180),
    ...hold(DIAGONAL, 340),
  ]
}

/** A stretch: arms up, a yawn, a lean one way and the other, arms down. */
export function stretch(): Key[] {
  const up = (lean: number, face: Pose['face']): Pose => ({
    view: 'front',
    y: -1,
    lean,
    face,
    arms: [
      { shoulder: 2.85, elbow: 0.12 },
      { shoulder: 2.85, elbow: 0.12 },
    ],
  })
  return [
    ...tween(FRONT, up(0, 'blink'), 320),
    ...hold(up(0, 'yawn'), 400),
    ...tween(up(0, 'yawn'), up(0.14, 'blink'), 300),
    ...hold(up(0.14, 'blink'), 200),
    ...tween(up(0.14, 'blink'), up(-0.14, 'blink'), 300),
    ...hold(up(-0.14, 'blink'), 200),
    ...tween(up(-0.14, 'blink'), up(0, 'neutral'), 240),
    ...tween(up(0, 'neutral'), FRONT, 320),
    ...hold(FRONT, 120),
  ]
}

/** A sip of tea, seen diagonally: the cup up to her mouth, a sip, down, a contented smile. */
export function sip(): Key[] {
  const low = (face: Pose['face'] = 'neutral'): Pose => ({
    view: 'diagonal',
    prop: 'cup',
    face,
    arms: [
      { shoulder: 0.35, elbow: 1.75 },
      { shoulder: 0.15, elbow: 0.3 },
    ],
  })
  const drinking = (tilt: number): Pose => ({
    view: 'diagonal',
    prop: 'cup',
    face: 'sip',
    tilt,
    arms: [
      { shoulder: 0.65, elbow: 2.65 },
      { shoulder: 0.15, elbow: 0.3 },
    ],
  })
  return [
    ...hold(low(), 300),
    ...tween(low(), drinking(-0.1), 280),
    ...tween(drinking(-0.1), drinking(-0.16), 800),
    ...tween(drinking(-0.16), low('happy'), 280),
    ...hold(low('happy'), 700),
    ...hold(low('blink'), 120),
    ...hold(low(), 300),
    ...tween(low(), { ...DIAGONAL, prop: undefined }, 240),
    ...hold(DIAGONAL, 180),
  ]
}

/** Reading her spellbook, seen diagonally: head down, turning a page, a smile at something. */
export function read(): Key[] {
  const reading = (turn: number, face: Pose['face'] = 'down'): Pose => ({
    view: 'diagonal',
    prop: 'book',
    face,
    tilt: 0.12,
    arms: [
      { shoulder: 0.35, elbow: 1.7 },
      { shoulder: 0.45, elbow: 1.5 + turn },
    ],
  })
  // Turning a page: her far hand sweeps across and back.
  const turning = [
    ...tween(reading(0), reading(0.35), 240),
    ...tween(reading(0.35), reading(0), 240),
  ]
  return [
    ...tween({ ...DIAGONAL, prop: 'book' }, reading(0), 240),
    ...hold(reading(0), 600),
    ...turning,
    ...hold(reading(0), 500),
    ...hold(reading(0, 'happy'), 600),
    ...hold(reading(0, 'blink'), 120),
    ...hold(reading(0), 300),
    ...turning,
    ...hold(reading(0), 200),
    ...tween(reading(0), { ...DIAGONAL, prop: undefined }, 240),
    ...hold(DIAGONAL, 240),
  ]
}

/** Sitting on the taskbar, her robe spread round her, swaying gently, looking about, then up again. */
export function sit(): Key[] {
  const hug: [Arm, Arm] = [
    { shoulder: 0.55, elbow: -1.15 },
    { shoulder: 0.55, elbow: -1.15 },
  ]
  const sitting = (i: number): Pose => {
    const phase = (i / 46) * Math.PI * 4
    return {
      view: 'front',
      sitting: true,
      x: Math.round(Math.sin(phase)),
      tilt: Math.sin(phase) * 0.06,
      wind: Math.sin(phase) * 1.2,
      arms: hug,
      legs: [
        { hip: 0.3 + 0.3 * Math.sin(phase), knee: 0.3 },
        { hip: 0.3 + 0.3 * Math.sin(phase), knee: 0.3 },
      ],
      look: i >= 16 && i < 22 ? -1 : i >= 30 && i < 36 ? 1 : 0,
      face: i === 12 || i === 40 ? 'blink' : i >= 24 && i < 28 ? 'happy' : 'neutral',
    }
  }
  const squat: Pose = {
    view: 'front',
    y: 5,
    legs: crouch(5),
    arms: [
      { shoulder: 0.3, elbow: 0.2 },
      { shoulder: 0.3, elbow: 0.2 },
    ],
  }
  return [
    ...tween(FRONT, squat, 240),
    ...hold(sitting(0), 120),
    ...Array.from({ length: 46 }, (_, i) => ({ pose: sitting(i), ms: 110 })),
    ...hold(squat, 160),
    ...tween(squat, FRONT, 240),
    ...hold(FRONT, 180),
  ]
}

/** A curtsy, from the front: her robe held out at the sides, a dip with her head tilted, smiling. */
export function curtsy(): Key[] {
  const holding = (depth: number, spread: number, face: Pose['face'], tilt = 0): Pose => ({
    view: 'front',
    y: depth,
    legs: crouch(depth),
    spread,
    face,
    tilt,
    // Hands out low at her sides, holding the robe's edges.
    arms: [
      { shoulder: 0.5, elbow: -0.3 },
      { shoulder: 0.5, elbow: -0.3 },
    ],
  })
  const dip = holding(4, 6, 'happy', 0.1)
  return [
    ...hold(FRONT, 160),
    ...tween(FRONT, holding(0, 4, 'neutral'), 280),
    ...tween(holding(0, 4, 'neutral'), dip, 420),
    ...tween(dip, dip, 500),
    ...tween(dip, holding(0, 4, 'happy'), 420),
    ...tween(holding(0, 4, 'happy'), FRONT, 300),
    ...hold(FRONT, 120),
  ]
}

/**
 * A twirl: she spins round three times on the spot, arms out, her robe flaring wider as she goes
 * and her hair swinging, then lands, smiling, as the robe settles. A turn is the views in order,
 * front, diagonal, side, then the side and diagonal mirrored (facing the other way): her back,
 * which she has no picture of, goes by in between too fast to miss.
 */
export function twirl(): Frame[] {
  const out: [Arm, Arm] = [
    { shoulder: 0.9, elbow: 0.2 },
    { shoulder: 0.9, elbow: 0.2 },
  ]
  const front = (spread: number, wind = 0, face: Pose['face'] = 'happy') =>
    draw({ view: 'front', spread, wind, face, arms: out })
  const diagonal = draw({ view: 'diagonal', face: 'happy', arms: [out[0], ARM_DOWN] })
  const side = (spread: number) =>
    draw({ view: 'side', spread, wind: -2, face: 'happy', arms: out })
  const turn = (spread: number, ms: number): Frame[] => [
    { rows: diagonal, ms },
    { rows: side(spread), ms },
    { rows: mirror(side(spread)), ms },
    { rows: mirror(diagonal), ms },
    { rows: front(spread), ms },
  ]
  return [
    { rows: draw(FRONT), ms: 200 },
    { rows: front(2), ms: 120 },
    ...turn(4, 70),
    ...turn(6, 60),
    ...turn(5, 70),
    { rows: front(6, 1), ms: 160 },
    { rows: front(4, -1), ms: 120 },
    { rows: front(2, 0.5), ms: 120 },
    { rows: front(0), ms: 200 },
    { rows: draw({ view: 'front', face: 'blink' }), ms: 120 },
    { rows: draw(FRONT), ms: 160 },
  ]
}

/**
 * Dozing, from the front: her eyes close, her head droops and she sways a little while z's float
 * up from her; her head nods, and she wakes with a start, hair flying, looks one way and the other,
 * and blinks.
 */
export function doze(flipText = false): Key[] {
  const steps = Math.round(FIDGET_MS.doze / FRAME_MS)
  return Array.from({ length: steps }, (_, i) => {
    const t = i / steps
    if (t < 0.6) {
      // Nodding off: eyes heavy, then shut; head drooping further, a deeper nod near the end.
      const droop = Math.min(1, t / 0.15)
      const nod = t > 0.48 && t < 0.56 ? 0.06 : 0
      return {
        pose: {
          view: 'front',
          face: t < 0.06 ? 'down' : 'blink',
          tilt: 0.12 * droop + nod,
          x: Math.round(Math.sin(t * 14) * 0.6),
          zzz: t > 0.1 ? (t - 0.1) / 0.5 : 0,
          flipText,
        },
        ms: FRAME_MS,
      }
    }
    if (t < 0.68) {
      // Awake with a start.
      return {
        pose: {
          view: 'front',
          face: 'surprised',
          y: -2,
          lift: 1.5,
          arms: [
            { shoulder: 0.45, elbow: 0.2 },
            { shoulder: 0.45, elbow: 0.2 },
          ],
        },
        ms: FRAME_MS,
      }
    }
    // Looking about, then a blink.
    return {
      pose: {
        view: 'front',
        look: t < 0.76 ? -1 : t < 0.84 ? 1 : 0,
        face: t > 0.9 && t < 0.93 ? 'blink' : 'neutral',
      },
      ms: FRAME_MS,
    }
  })
}

/**
 * A glance one way, then the other (the second a mirror image), her eyes leading her head, then a
 * blink.
 */
export function look(): Frame[] {
  const front = draw(FRONT)
  const eyesRight = draw({ view: 'front', look: 1 })
  const eyesLeft = draw({ view: 'front', look: -1 })
  const glance = draw({ view: 'diagonal', tilt: 0.04 })
  return [
    { rows: front, ms: 260 },
    { rows: eyesRight, ms: 80 },
    { rows: glance, ms: 520 },
    { rows: eyesRight, ms: 80 },
    { rows: front, ms: 120 },
    { rows: eyesLeft, ms: 80 },
    { rows: mirror(glance), ms: 520 },
    { rows: eyesLeft, ms: 80 },
    { rows: front, ms: 120 },
    { rows: draw({ view: 'front', face: 'blink' }), ms: 120 },
    { rows: front, ms: 420 },
  ]
}

/**
 * A sneeze, from the front: her nose twitches, "ah..." (her head goes back), a breath, "ah..."
 * (further back, eyes shut), "choo!" (forward, hair flying, hands up), and the sneeze bursts into
 * sparkles that fly out and fade; she looks surprised, then smiles sheepishly and blinks.
 */
export function sneeze(): Key[] {
  const twitch: Pose = { view: 'front', face: 'surprised' }
  const ah = (tilt: number, face: Pose['face']): Pose => ({ view: 'front', face, tilt, lift: -0.5 })
  const hands: [Arm, Arm] = [
    { shoulder: 0.3, elbow: -0.9 },
    { shoulder: 0.3, elbow: -0.9 },
  ]
  const choo: Pose = { view: 'front', face: 'blink', tilt: 0.1, lift: 1.5, arms: hands, burst: 0.1 }
  const after: Pose = { view: 'front', face: 'surprised', tilt: 0.03, burst: 0.55 }
  const sheepish: Pose = { view: 'front', face: 'happy', burst: 1 }
  return [
    ...hold(FRONT, 200),
    ...hold(twitch, 160),
    ...tween(twitch, ah(-0.06, 'down'), 360),
    ...tween(ah(-0.06, 'down'), ah(-0.03, 'down'), 160),
    ...tween(ah(-0.03, 'down'), ah(-0.1, 'blink'), 420),
    ...tween(ah(-0.1, 'blink'), choo, 80),
    ...tween(choo, after, 520),
    ...tween(after, sheepish, 480),
    ...hold({ view: 'front', face: 'happy' }, 360),
    ...hold({ view: 'front', face: 'blink' }, 120),
    ...hold(FRONT, 140),
  ]
}

/**
 * A little jig, from the front: she steps to one side with that arm up and her other hand on her
 * hip, then hops, kicking her other foot out, her robe swinging and her hair flying the other way;
 * then the other side, seven beats in all, and back to standing.
 */
export function dance(): Key[] {
  const up: Arm = { shoulder: 2.4, elbow: 0.6 }
  const hip: Arm = { shoulder: 0.55, elbow: -1.6 }
  const kick: Leg = { hip: 0.35, knee: 0.5 }
  const step = (side: 1 | -1, hopping: boolean): Pose => ({
    view: 'front',
    face: 'happy',
    x: 2 * side,
    y: hopping ? -2 : 0,
    wind: -1.2 * side,
    spread: 2,
    arms: side === 1 ? [up, hip] : [hip, up],
    legs: hopping ? (side === 1 ? [LEG_STAND, kick] : [kick, LEG_STAND]) : [LEG_STAND, LEG_STAND],
  })
  const beats: Key[] = []
  let last: Pose = FRONT
  for (let beat = 0; beat < 7; beat++) {
    const side = beat % 2 === 0 ? 1 : -1
    beats.push(
      ...tween(last, step(side, false), 190),
      ...tween(step(side, false), step(side, true), 190),
    )
    last = step(side, true)
  }
  return [...hold(FRONT, 160), ...beats, ...tween(last, FRONT, 260), ...hold(FRONT, 120)]
}

/**
 * A yawn, from the front: she lifts her hand to her mouth and her head goes back in a big yawn,
 * then she blinks sleepily, swaying, and comes round.
 */
export function yawn(): Key[] {
  const handUp: [Arm, Arm] = [{ shoulder: 0.35, elbow: -2.55 }, ARM_DOWN]
  const yawning = (tilt: number): Pose => ({ view: 'front', face: 'yawn', tilt, arms: handUp })
  const sleepy = (i: number): Pose => ({
    view: 'front',
    face: i % 4 === 1 ? 'blink' : 'down',
    tilt: 0.05 * Math.sin((i / 8) * Math.PI * 2),
    x: Math.round(Math.sin((i / 8) * Math.PI * 2)),
  })
  return [
    ...hold(FRONT, 200),
    ...tween(FRONT, yawning(-0.06), 520),
    ...tween(yawning(-0.06), yawning(-0.1), 1000),
    ...tween(yawning(-0.1), { ...sleepy(0), arms: [ARM_DOWN, ARM_DOWN] }, 360),
    ...Array.from({ length: 8 }, (_, i) => ({ pose: sleepy(i), ms: 140 })),
    ...hold({ view: 'front', face: 'blink' }, 160),
    ...hold(FRONT, 240),
  ]
}

/**
 * Confetti, from the front (Friday evenings): she throws her hands up with a little hop, confetti
 * bursting up from them and fluttering down round her as she cheers, waving her arms.
 */
export function confetti(): Key[] {
  return through(FIDGET_MS.confetti, (t) => {
    const up = between(t, 0.02, 0.1) * (1 - between(t, 0.86, 0.96))
    const hop = t > 0.08 && t < 0.26 ? Math.sin(between(t, 0.08, 0.26) * Math.PI) : 0
    const wave = Math.sin(t * 40) * 0.2 * between(t, 0.25, 0.3)
    const arm = (side: number): Arm => toward({ shoulder: 2.6 + wave * side, elbow: 0.3 }, up)
    return {
      view: 'front',
      confetti: t,
      y: Math.round(-6 * hop),
      lift: 2 * hop,
      face: t < 0.04 ? 'neutral' : blinking(t, 0.9, 'happy'),
      arms: [arm(1), arm(-1)],
    }
  })
}

/** Her everyday habits, by pose (each plays once, for its HABITS `ms`). */
export const EVERYDAY_MOVES = {
  hop: once(hop),
  wave: once(wave),
  stretch: once(stretch),
  sip: once(sip),
  read: once(read),
  sit: once(sit),
  curtsy: once(curtsy),
  twirl: { frames: twirl, loops: false },
  // Its z's are drawn the other way round for facing left, so they read right once mirrored.
  doze: once(doze, () => doze(true)),
  look: { frames: look, loops: false },
  sneeze: once(sneeze),
  dance: once(dance),
  yawn: once(yawn),
  confetti: once(confetti),
} satisfies Moves
