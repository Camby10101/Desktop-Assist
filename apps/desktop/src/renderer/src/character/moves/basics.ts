// Her basic moves: standing, walking, being carried, thrown and landing hard, and gazing at the
// screen saver's sunset from behind.

import { LANDING } from '@shared/character'
import { draw, type Arm, type Face, type Leg, type Pose } from '../rig'
import {
  type Key,
  type Frame,
  tween,
  hold,
  crouch,
  FRONT,
  mirror,
  type Moves,
  once,
  repeating,
} from './kit'

/** Standing, breathing (a pixel lower on the out-breath), her hair stirring; a blink. */
export function idle(): Key[] {
  return Array.from({ length: 32 }, (_, i) => {
    const phase = (i / 32) * Math.PI * 2
    const breath = (1 - Math.cos(phase)) / 2
    const arm = { shoulder: 0.07 + breath * 0.04, elbow: 0.05 }
    return {
      pose: {
        view: 'front',
        y: Math.round(breath),
        wind: Math.sin(phase + 1) * 0.8,
        arms: [arm, arm],
        face: i === 21 || i === 22 ? 'blink' : 'neutral',
      },
      ms: 75,
    }
  })
}

/**
 * Walking, side on, facing right: twelve frames, two steps. Each leg swings forward with its knee
 * bent, plants and pushes back; the arms swing against the legs; her body rises as her legs pass;
 * her hair trails behind her, a ripple running down it once a stride, so it flows; and she leaves a
 * trail of little sparkles on the ground behind her.
 */
export function walk(): Key[] {
  return Array.from({ length: 12 }, (_, i) => {
    const phase = (i / 12) * Math.PI * 2
    const swing = Math.sin(phase)
    const forward = Math.cos(phase)
    return {
      pose: {
        view: 'side',
        y: Math.round(-1.5 * forward ** 2),
        lean: 0.07,
        wind: -2 + Math.sin(phase - 0.8) * 0.4,
        flow: phase,
        trail: i / 12,
        legs: [
          { hip: 0.45 * swing, knee: 0.12 + 0.65 * Math.max(0, forward) ** 1.5 },
          { hip: -0.45 * swing, knee: 0.12 + 0.65 * Math.max(0, -forward) ** 1.5 },
        ],
        arms: [
          { shoulder: -0.4 * swing, elbow: 0.25 + 0.2 * Math.max(0, -swing) },
          { shoulder: 0.4 * swing, elbow: 0.25 + 0.2 * Math.max(0, swing) },
        ],
      },
      ms: 55,
    }
  })
}

/**
 * Carried by her collar: off the ground, arms up, legs kicking, swaying, hair lifted, and no
 * shadow under her (she's in the air, wherever the pointer takes her).
 */
export function dragged(): Key[] {
  return Array.from({ length: 12 }, (_, i) => {
    const phase = (i / 12) * Math.PI * 2
    const kick = Math.sin(phase * 2)
    return {
      pose: {
        view: 'front',
        face: 'surprised',
        shadow: false,
        x: Math.round(Math.sin(phase)),
        y: -4,
        tilt: Math.sin(phase) * 0.05,
        lift: 3,
        wind: Math.sin(phase) * 1.5,
        arms: [
          { shoulder: 2.4 + 0.25 * kick, elbow: 0.3 },
          { shoulder: 2.55 - 0.25 * kick, elbow: 0.3 },
        ],
        legs: [
          { hip: 0.12 + 0.12 * kick, knee: 0.25 + 0.35 * Math.max(0, kick) },
          { hip: 0.12 - 0.12 * kick, knee: 0.25 + 0.35 * Math.max(0, -kick) },
        ],
      },
      ms: 55,
    }
  })
}

/**
 * Watching the sunset, her back to us (the screen saver): standing, breathing, swaying very
 * slightly from side to side in the evening breeze, her hair and robe stirring with it, round and
 * round every few seconds.
 */
export function gaze(): Key[] {
  const count = 48
  return Array.from({ length: count }, (_, i) => {
    const phase = (i / count) * Math.PI * 2
    const breath = (1 - Math.cos(phase * 2)) / 2
    const arm = { shoulder: 0.07 + breath * 0.03, elbow: 0.05 }
    return {
      pose: {
        view: 'front',
        back: true,
        lean: Math.sin(phase) * 0.02,
        y: Math.round(breath),
        wind: 0.6 + Math.sin(phase + 0.8) * 1.2,
        arms: [arm, arm],
      },
      ms: 100,
    }
  })
}

/**
 * Thrown, flying through the air: she tumbles round and round (front, side, her back, the other
 * side), arms and legs flailing, her hair flying up, wide-eyed, and no shadow under her. Round and
 * round until she lands.
 */
export function flung(): Frame[] {
  const frames: Frame[] = []
  for (let i = 0; i < 12; i++) {
    const phase = (i / 12) * Math.PI * 4
    const flail = Math.sin(phase * 1.5)
    const pose = {
      face: 'surprised' as const,
      shadow: false,
      lift: 3,
      wind: Math.sin(phase) * 2,
      arms: [
        { shoulder: 2.3 + 0.5 * flail, elbow: 0.5 },
        { shoulder: 2.3 - 0.5 * flail, elbow: 0.5 },
      ] as [Arm, Arm],
      legs: [
        { hip: 0.2 + 0.25 * flail, knee: 0.4 + 0.3 * Math.max(0, flail) },
        { hip: 0.2 - 0.25 * flail, knee: 0.4 + 0.3 * Math.max(0, -flail) },
      ] as [Leg, Leg],
    }
    // Six turns of her a tumble: front, diagonal, side, her back, then the side and diagonal facing
    // the other way.
    const turn = i % 6
    const rows =
      turn === 0
        ? draw({ ...pose, view: 'front' })
        : turn === 1
          ? draw({ ...pose, view: 'diagonal' })
          : turn === 2
            ? draw({ ...pose, view: 'side' })
            : turn === 3
              ? draw({ ...pose, view: 'front', back: true })
              : turn === 4
                ? mirror(draw({ ...pose, view: 'side' }))
                : mirror(draw({ ...pose, view: 'diagonal' }))
    frames.push({ rows, ms: 70 })
  }
  return frames
}

/**
 * A hard landing, from the front: she hits the ground flat (crouched, arms flung up, hair and hat
 * flying up) in a puff of dust, and thumps down on her bottom with her hat knocked down over her
 * eyes; she sits there dazed, head wobbling, stars going round her head; pushes her hat back up
 * (a start), shakes her head, gets up, and smiles sheepishly. LANDING.splatMs in all.
 */
export function splat(): Key[] {
  const legsOut: [Leg, Leg] = [
    { hip: 0.5, knee: 0.15 },
    { hip: 0.5, knee: 0.15 },
  ]
  const propped: Arm = { shoulder: 0.95, elbow: 0.1 }
  const impact: Pose = {
    view: 'front',
    face: 'surprised',
    y: 6,
    legs: crouch(6),
    lift: 4,
    hatLift: 4,
    dust: 0.04,
    arms: [
      { shoulder: 2.6, elbow: 0.3 },
      { shoulder: 2.6, elbow: 0.3 },
    ],
  }
  const dazed = (i: number, count: number): Pose => ({
    view: 'front',
    sitting: true,
    face: 'blink',
    hatLift: -9,
    tilt: Math.sin((i / count) * Math.PI * 4) * 0.08,
    dizzy: (i / count) * 2.5,
    dust: 0.12 + (i / count) * 0.88,
    arms: [propped, propped],
    legs: legsOut,
  })
  const pushing = (hatLift: number, face: Face): Pose => ({
    view: 'front',
    sitting: true,
    face,
    hatLift,
    arms: [{ shoulder: 2.75, elbow: 1.3 }, propped],
    legs: legsOut,
  })
  const shaking = (tilt: number): Pose => ({
    view: 'front',
    sitting: true,
    face: 'blink',
    tilt,
    arms: [propped, propped],
    legs: legsOut,
  })
  const squat: Pose = {
    view: 'front',
    y: 5,
    legs: crouch(5),
    arms: [
      { shoulder: 0.3, elbow: 0.2 },
      { shoulder: 0.3, elbow: 0.2 },
    ],
  }
  const keys: Key[] = [
    ...hold(impact, 120),
    ...hold({ ...dazed(0, 1), face: 'surprised', hatLift: -3, dizzy: undefined, dust: 0.08 }, 80),
    ...Array.from({ length: 22 }, (_, i) => ({ pose: dazed(i, 22), ms: 60 })),
    ...tween(pushing(-9, 'blink'), pushing(0, 'surprised'), 280),
    ...hold(pushing(0, 'surprised'), 160),
    ...hold(pushing(0, 'blink'), 100),
    ...[0.12, -0.12, 0.1, -0.08].map((tilt) => ({ pose: shaking(tilt), ms: 70 })),
    ...hold(squat, 160),
    ...tween(squat, FRONT, 240),
  ]
  const used = keys.reduce((total, key) => total + key.ms, 0)
  return [
    ...keys,
    ...hold({ view: 'front', face: 'happy' }, LANDING.splatMs - used - 120),
    ...hold({ view: 'front', face: 'blink' }, 120),
  ]
}

/** Her basic moves, by pose. */
export const BASIC_MOVES = {
  idle: repeating(idle),
  'walk-right': repeating(walk),
  'walk-left': repeating(walk),
  dragged: repeating(dragged),
  // Tumbling through the air goes round until she lands; her hard landing plays once.
  flung: { frames: flung, loops: true },
  splat: once(splat),
} satisfies Moves
