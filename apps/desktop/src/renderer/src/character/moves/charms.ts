// Her charms (HABITS, kind 'charm'): habits with a touch of magic in them.

import { FIDGET_MS } from '@shared/character'
import { type Arm, type Pose } from '../rig'
import { BUBBLES, JUGGLE, wispAt } from '../props/charms'
import {
  type Key,
  lerp,
  ARM_DOWN,
  FRAME_MS,
  tween,
  hold,
  crouch,
  FRONT,
  DIAGONAL,
  between,
  type Moves,
  once,
} from './kit'

/** A little spell: her hand up, sparkles circling it, then gone with a smile. */
export function spell(): Key[] {
  const casting = (sparkle: number, face: Pose['face'] = 'neutral'): Pose => ({
    view: 'diagonal',
    face,
    tilt: -0.05,
    sparkle,
    arms: [
      { shoulder: 1.6, elbow: 0.6 },
      { shoulder: 0.15, elbow: 0.2 },
    ],
  })
  const circling: Key[] = Array.from({ length: 24 }, (_, i) => ({
    pose: casting(0.05 + i / 24, i > 16 ? 'happy' : 'neutral'),
    ms: 55,
  }))
  return [
    ...tween(DIAGONAL, casting(0), 240),
    ...circling,
    ...hold(casting(0, 'happy'), 400),
    ...tween(casting(0, 'happy'), DIAGONAL, 240),
    ...hold(DIAGONAL, 200),
  ]
}

/**
 * A vision, from the front, in time with the light and the logo above her (VISION): as the light
 * appears she looks up, wide-eyed, her hands lifting a little; as the logo arrives she smiles and
 * her arms open, and she gazes up at it while it hovers, blinking once; she watches it rise away,
 * then settles and blinks.
 */
export function vision(): Key[] {
  const looking = (face: Pose['face'], out: number, i = 0): Pose => {
    // A breath every second or so, so she isn't frozen while she watches.
    const breath = Math.sin((i / 25) * Math.PI * 2) * 0.03
    const arm = { shoulder: 0.1 + out * 0.35 + breath, elbow: out * 0.5 }
    return { view: 'front', face, arms: [arm, arm] }
  }
  // Frames about every FRAME_MS, their times adding up to exactly `ms` (as tween's do).
  const watching = (face: Pose['face'], out: number, ms: number): Key[] => {
    const steps = Math.round(ms / FRAME_MS)
    return Array.from({ length: steps }, (_, i) => ({
      pose: looking(face, out, i),
      ms: Math.round(((i + 1) * ms) / steps) - Math.round((i * ms) / steps),
    }))
  }
  return [
    ...hold(FRONT, 400),
    ...tween(FRONT, looking('awe', 0.4), 320),
    ...watching('awe', 0.4, 1100),
    ...tween(looking('awe', 0.4), looking('up', 0.7), 400),
    ...watching('up', 0.7, 2000),
    ...hold({ ...looking('up', 0.7), face: 'blink' }, 120),
    ...watching('up', 0.7, 2480),
    ...tween(looking('up', 0.7), looking('up', 0.3), 1200),
    ...tween(looking('up', 0.3), FRONT, 400),
    ...hold({ ...FRONT, face: 'blink' }, 120),
    ...hold(FRONT, 60),
  ]
}

/**
 * Levitating: eyes shut, her arms drift out, a magic circle opens on the ground and she floats up
 * over it, her hair and robe lifting; she hovers, bobbing, smiling, the runes turning and sparks
 * rising; then she sinks, lands with a little bend of the knees, and the circle fades.
 */
export function levitate(): Key[] {
  const floating = (
    y: number,
    rune: number,
    out: number,
    face: Pose['face'],
    spin: number,
    lift = 0,
    wind = 0,
  ): Pose => {
    const arm = { shoulder: 0.1 + out * 0.45, elbow: out * 0.35 }
    return { view: 'front', y, rune, spin, lift, wind, face, arms: [arm, arm] }
  }
  const gather = floating(0, 0.5, 0.5, 'blink', 0)
  const risen = floating(-7, 1, 1, 'blink', 0.15, 2.5)
  // Hovering: a pixel up and down, the robe fluttering, a smile in the middle; one turn of runes.
  const hovering: Key[] = Array.from({ length: 40 }, (_, i) => {
    const phase = (i / 40) * Math.PI * 2
    const face = i >= 14 && i < 30 ? 'happy' : 'blink'
    return {
      pose: floating(
        -7 - Math.round(Math.sin(phase)),
        1,
        1,
        face,
        0.15 + i / 40,
        2.5 + Math.sin(phase) * 0.5,
        Math.sin(phase * 2) * 1.2,
      ),
      ms: 40,
    }
  })
  const last = hovering.at(-1)!.pose
  const sunk = floating(0, 0.4, 0.5, 'blink', 1.3, 0.5)
  const land: Pose = { ...floating(2, 0, 0.3, 'neutral', 1.4), legs: crouch(2) }
  return [
    ...hold(FRONT, 120),
    ...tween(FRONT, gather, 320),
    ...tween(gather, risen, 600),
    ...hovering,
    ...tween(last, sunk, 480),
    ...tween(sunk, land, 160),
    ...tween(land, FRONT, 200),
    ...hold(FRONT, 120),
  ]
}

/**
 * Gazing into a crystal ball, from the front: she brings it up in both hands, looks down into it
 * as a wisp of light turns inside and sparkles circle it, then smiles at what she sees and puts it
 * away.
 */
export function orb(): Key[] {
  const holding = (face: Pose['face'], spin = 0, sparkle = 0): Pose => ({
    view: 'front',
    prop: 'orb',
    face,
    spin,
    sparkle,
    // Both forearms turned in and up, so her hands meet in front of her waist.
    arms: [
      { shoulder: 0.25, elbow: -1.55 },
      { shoulder: 0.25, elbow: -1.55 },
    ],
  })
  const gazing: Key[] = Array.from({ length: 40 }, (_, i) => ({
    pose: holding('down', i / 20, i >= 8 ? (i - 8) / 32 : 0),
    ms: 50,
  }))
  return [
    ...hold(FRONT, 200),
    ...tween(FRONT, holding('neutral'), 400),
    ...tween(holding('neutral'), holding('down'), 200),
    ...gazing,
    ...tween(holding('down', 2), holding('happy', 2.4), 300),
    ...tween(holding('happy', 2.4), holding('happy', 3), 600),
    ...hold(holding('blink', 3), 120),
    ...tween(holding('happy', 3), FRONT, 400),
    ...hold(FRONT, 180),
  ]
}

/**
 * A butterfly, from the front: she holds up a finger beside her; a little magic butterfly flutters
 * down to it and rests there, opening and shutting its wings, while she watches it, smiling; then
 * it flies off up and away, and she lowers her hand.
 */
export function butterfly(): Key[] {
  const steps = Math.round(FIDGET_MS.butterfly / FRAME_MS)
  return Array.from({ length: steps }, (_, i) => {
    const t = i / steps
    // Her near hand up beside her head (raised over the first 8%, lowered over the last 10%).
    const up = Math.min(1, t / 0.08, (1 - t) / 0.1)
    const lift = up * up * (3 - 2 * up)
    const arm = { shoulder: 0.08 + 1.47 * lift, elbow: 0.95 * lift }
    return {
      pose: {
        view: 'front',
        butterfly: t,
        arms: [arm, ARM_DOWN],
        look: t > 0.04 && t < 0.92 ? 1 : 0,
        face: t > 0.32 && t < 0.72 ? 'happy' : 'neutral',
      },
      ms: FRAME_MS,
    }
  })
}

/**
 * Juggling, from the front: her hands come up in front of her and three little orbs fly between
 * them, up in a high arc from her far hand to her near one and quickly back underneath, each hand
 * dipping as it throws; then they're gone into her hands and she smiles.
 */
export function juggle(): Key[] {
  const steps = Math.round(FIDGET_MS.juggle / FRAME_MS)
  const [start, end] = [0.1, 0.88]
  return Array.from({ length: steps }, (_, i) => {
    const t = i / steps
    const ready = between(t, 0, 0.08) * (1 - between(t, 0.92, 1))
    const playing = t >= start && t < end
    const progress = playing ? (t - start) / (end - start) : 0
    // A hand dips as an orb leaves it: three throws a round from each, the near hand's a little
    // after the far one's (when an orb comes to the end of its high arc).
    const dip = (at: number) =>
      playing
        ? Math.max(0, Math.cos((progress * JUGGLE.rounds - at) * 3 * Math.PI * 2)) ** 4 * 0.2
        : 0
    const arm = (d: number): Arm => ({ shoulder: 0.1 + 0.4 * ready - d, elbow: -1.45 * ready + d })
    return {
      pose: {
        view: 'front',
        juggle: progress,
        arms: [arm(dip(JUGGLE.arc)), arm(dip(0))],
        face: t >= end + 0.02 ? 'happy' : 'neutral',
      },
      ms: FRAME_MS,
    }
  })
}

/**
 * Bubbles, seen diagonally: she holds a little wand ring up in front of her mouth and blows
 * through it, puffing before each bubble; they drift up and away, wobbling, and pop. She puts the
 * wand away and watches the last ones go, smiling.
 */
export function bubbles(): Key[] {
  const steps = Math.round(FIDGET_MS.bubbles / FRAME_MS)
  const blowing: Arm = { shoulder: 0.75, elbow: 2.45 }
  return Array.from({ length: steps }, (_, i) => {
    const t = i / steps
    const up = between(t, 0, 0.08) * (1 - between(t, BUBBLES.wandAway, BUBBLES.wandAway + 0.06))
    const arm: Arm = {
      shoulder: lerp(ARM_DOWN.shoulder, blowing.shoulder, up),
      elbow: lerp(ARM_DOWN.elbow, blowing.elbow, up),
    }
    // A puff just before each bubble comes.
    const puffing = Array.from(
      { length: BUBBLES.count },
      (_, k) => BUBBLES.first + k * BUBBLES.gap,
    ).some((at) => t > at - 0.045 && t <= at + 0.005)
    const face: Pose['face'] = puffing
      ? 'sip'
      : t > 0.9 && t < 0.93
        ? 'blink'
        : t > BUBBLES.wandAway - 0.1
          ? 'happy'
          : 'neutral'
    return { pose: { view: 'diagonal', bubbles: t, arms: [arm, ARM_DOWN], face }, ms: FRAME_MS }
  })
}

/**
 * A will-o'-wisp, from the front: a little light appears beside her (she's surprised), goes round
 * her twice, behind her and in front (see wispAt), her eyes following it and a smile as it passes
 * in front; then it flies off up and away, and she waves it goodbye.
 */
export function wisp(): Key[] {
  const steps = Math.round(FIDGET_MS.wisp / FRAME_MS)
  return Array.from({ length: steps }, (_, i) => {
    const t = i / steps
    const at = wispAt(t)
    const bye = between(t, 0.8, 0.84) * (1 - between(t, 0.94, 0.98))
    const arm: Arm = {
      shoulder: 0.08 + 1.45 * bye,
      elbow: (0.75 + 0.35 * Math.sin(t * 70)) * bye,
    }
    const inFront = at !== null && !at.behind && Math.abs(at.x) < 12
    return {
      pose: {
        view: 'front',
        wisp: t,
        look: at === null ? 0 : at.x > 7 ? 1 : at.x < -7 ? -1 : 0,
        arms: [arm, ARM_DOWN],
        face: t > 0.06 && t < 0.14 ? 'surprised' : inFront || bye > 0 ? 'happy' : 'neutral',
      },
      ms: FRAME_MS,
    }
  })
}

/** Her charms, by pose (each plays once, for its HABITS `ms`). */
export const CHARM_MOVES = {
  spell: once(spell),
  vision: once(vision),
  levitate: once(levitate),
  orb: once(orb),
  butterfly: once(butterfly),
  juggle: once(juggle),
  bubbles: once(bubbles),
  wisp: once(wisp),
} satisfies Moves
