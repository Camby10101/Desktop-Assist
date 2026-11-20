// Her magic habits (HABITS, kind 'magic'): little spells, each drawn with its own effect (props/).

import { FIDGET_MS } from '@shared/character'
import { type Arm, type Face } from '../rig'
import { BLOOM, FLAME, FROST, POTION, RAIN, RAINBOW, SIGIL, STAR_CATCH, TOME } from '../props/magic'
import {
  type Key,
  smooth,
  lerp,
  ARM_DOWN,
  between,
  through,
  toward,
  CUPPED,
  blinking,
  type Moves,
  once,
} from './kit'

/**
 * A flame, seen diagonally: she holds her hand out, palm up, looking down at it; a spark kindles
 * there (she's delighted) and grows into a flickering flame; she leans in and blows it out, and
 * smiles as the smoke curls up.
 */
export function flame(): Key[] {
  return through(FIDGET_MS.flame, (t) => {
    const up = between(t, 0, 0.09) * (1 - between(t, 0.88, 0.97))
    const blowing = t > FLAME.blow[0] - 0.02 && t < FLAME.blow[1] + 0.02
    const face: Face = blowing
      ? 'sip'
      : t > 0.12 && t < 0.22
        ? 'happy'
        : t > FLAME.blow[1]
          ? blinking(t, 0.9, 'happy')
          : 'down'
    return {
      view: 'diagonal',
      flame: t,
      tilt: blowing ? 0.06 : 0.03 * up,
      face,
      arms: [toward({ shoulder: 0.55, elbow: 1.7 }, up), ARM_DOWN],
    }
  })
}

/**
 * Frost, from the front: she cups her hands in front of her and looks down into them as a
 * snowflake grows there; she smiles at it, it bursts into glitter (a start), and she smiles again
 * as it drifts down.
 */
export function frost(): Key[] {
  return through(FIDGET_MS.frost, (t) => {
    const ready = between(t, 0, 0.1) * (1 - between(t, 0.86, 0.96))
    const arm = toward(CUPPED, ready)
    const face: Face =
      t < FROST.grow[0]
        ? 'neutral'
        : t < FROST.grow[1]
          ? 'down'
          : t < FROST.burst[0]
            ? 'happy'
            : t < FROST.burst[0] + 0.06
              ? 'surprised'
              : blinking(t, 0.9, 'happy')
    return { view: 'front', frost: t, face, arms: [arm, arm] }
  })
}

/**
 * A flower, seen diagonally: she points down at the ground in front of her, head bowed, as
 * sparkles drip from her finger and a flower comes up and blooms; she smiles at it, lowers her
 * hand, and watches it scatter into sparkles.
 */
export function bloom(): Key[] {
  return through(FIDGET_MS.bloom, (t) => {
    const point = between(t, 0.02, 0.1) * (1 - between(t, 0.6, 0.7))
    const face: Face =
      t < BLOOM.open[0] ? 'down' : t < BLOOM.scatter[0] ? blinking(t, 0.78, 'happy') : 'awe'
    return {
      view: 'diagonal',
      bloom: t,
      tilt: 0.06 * point,
      face: t > 0.97 ? 'happy' : face,
      arms: [toward({ shoulder: 0.85, elbow: 0.05 }, point), ARM_DOWN],
    }
  })
}

/**
 * A sigil, from the front: she raises her hand and draws a star in the air beside her, her hand
 * moving with the point of light and her eyes on it; it flashes as it closes (a start), and she
 * smiles at it as it glows and fades, lowering her hand.
 */
export function sigil(): Key[] {
  return through(FIDGET_MS.sigil, (t) => {
    const raise = between(t, 0, 0.1) * (1 - between(t, 0.82, 0.94))
    const tracing = between(t, ...SIGIL.trace)
    const wobble = tracing > 0 && tracing < 1 ? Math.sin(tracing * Math.PI * 10) * 0.12 : 0
    const face: Face =
      t < SIGIL.trace[1]
        ? 'neutral'
        : t < SIGIL.trace[1] + 0.07
          ? 'surprised'
          : blinking(t, 0.9, 'happy')
    return {
      view: 'front',
      sigil: t,
      look: t > 0.08 && t < 0.84 ? 1 : 0,
      face,
      arms: [toward({ shoulder: 2.2 + wobble, elbow: 0.5 }, raise), ARM_DOWN],
    }
  })
}

/**
 * A rainbow, from the front: she raises both hands together over her head, then sweeps them apart
 * and down either side, painting the rainbow over her as they go; she lowers them, smiling, and
 * the rainbow shimmers and fades.
 */
export function rainbow(): Key[] {
  return through(FIDGET_MS.rainbow, (t) => {
    const up = between(t, 0, RAINBOW.paint[0])
    const sweep = between(t, ...RAINBOW.paint)
    const down = between(t, 0.5, 0.62)
    const shoulder =
      ARM_DOWN.shoulder +
      (2.9 - ARM_DOWN.shoulder) * up +
      (1.3 - 2.9) * smooth(sweep) +
      (ARM_DOWN.shoulder - 1.3) * down
    const arm: Arm = { shoulder, elbow: lerp(ARM_DOWN.elbow, 0.15, up * (1 - down)) }
    const face: Face =
      t < RAINBOW.paint[0] ? 'neutral' : t < 0.45 ? 'up' : blinking(t, 0.85, 'happy')
    return { view: 'front', rainbow: t, face, arms: [arm, arm] }
  })
}

/**
 * Her hat trick, from the front: her hat lifts off her head by itself (a start), spins round
 * twice showering sparkles over her while she looks up at it, delighted, her hands clasped, and
 * settles back on her head.
 */
export function hat(): Key[] {
  return through(FIDGET_MS.hat, (t) => {
    const lifted = smooth(between(t, 0.08, 0.3)) * (1 - smooth(between(t, 0.66, 0.84)))
    const spin = between(t, 0.26, 0.66)
    const delight = between(t, 0.28, 0.36) * (1 - between(t, 0.7, 0.8))
    const hands: Arm = { shoulder: 0.3, elbow: -0.9 }
    const face: Face =
      t < 0.06 ? 'neutral' : t < 0.22 ? 'surprised' : t < 0.68 ? 'up' : blinking(t, 0.9, 'happy')
    return {
      view: 'front',
      hatLift: lifted * 10,
      hatTurn: smooth(spin) * Math.PI * 4,
      shower: spin > 0 && spin < 1 ? spin : 0,
      face,
      arms: [toward(hands, delight), toward(hands, delight)],
    }
  })
}

/**
 * A falling star, from the front: she looks up as a star falls toward her, cups her hands and
 * catches it, smiles down at it glowing there, then tosses it back up into the sky, watching it
 * go, and smiles.
 */
export function star(): Key[] {
  return through(FIDGET_MS.star, (t) => {
    const catching = between(t, 0.2, 0.33) * (1 - between(t, STAR_CATCH.toss[0], 0.76))
    const toss =
      t >= STAR_CATCH.toss[0] && t < STAR_CATCH.toss[0] + 0.1
        ? Math.sin(between(t, STAR_CATCH.toss[0], STAR_CATCH.toss[0] + 0.1) * Math.PI)
        : 0
    const arm: Arm = {
      shoulder: lerp(ARM_DOWN.shoulder, CUPPED.shoulder, catching) + 1.9 * toss,
      elbow: lerp(ARM_DOWN.elbow, CUPPED.elbow, catching) * (1 - toss),
    }
    const face: Face =
      t < STAR_CATCH.fall[0]
        ? 'neutral'
        : t < STAR_CATCH.fall[1]
          ? 'up'
          : t < STAR_CATCH.toss[0]
            ? 'happy'
            : t < 0.88
              ? 'up'
              : blinking(t, 0.93, 'happy')
    return {
      view: 'front',
      star: t,
      look: t > 0.06 && t < 0.26 ? 1 : 0,
      face,
      arms: [arm, arm],
    }
  })
}

/**
 * A rain cloud, from the front: she looks up as a little cloud gathers over her, and droops as it
 * rains on her; she shoos it with a wave and it bursts into sparkles, and she smiles.
 */
export function rain(): Key[] {
  return through(FIDGET_MS.rain, (t) => {
    const shoo = between(t, 0.6, 0.63) * (1 - between(t, RAIN.burst[0], RAIN.burst[0] + 0.04))
    const arm: Arm = {
      shoulder: lerp(ARM_DOWN.shoulder, 2.6, shoo),
      elbow: lerp(ARM_DOWN.elbow, 0.6 + 0.4 * Math.sin(t * 90), shoo),
    }
    const face: Face =
      t < RAIN.gather[0]
        ? 'neutral'
        : t < RAIN.pour[0] + 0.03
          ? 'up'
          : t < 0.6
            ? 'down'
            : t < RAIN.burst[0]
              ? 'neutral'
              : blinking(t, 0.92, 'happy')
    return { view: 'front', rain: t, face, arms: [arm, ARM_DOWN] }
  })
}

/**
 * A potion, seen diagonally: she holds up a little flask and gives it a shake, watching it bubble
 * and change colour; the cork pops (a start), coloured smoke puffs out, and she smiles.
 */
export function potion(): Key[] {
  return through(FIDGET_MS.potion, (t) => {
    const up = between(t, 0, 0.08) * (1 - between(t, 0.88, 0.96))
    const shaking = t > 0.14 && t < 0.46 ? Math.sin(t * 160) * 0.12 : 0
    const arm = toward({ shoulder: 0.5, elbow: 2 + shaking }, up)
    const face: Face =
      t < 0.12
        ? 'neutral'
        : t < POTION.pop
          ? 'happy'
          : t < POTION.pop + 0.08
            ? 'surprised'
            : blinking(t, 0.9, 'happy')
    return { view: 'diagonal', potion: t, face, arms: [arm, ARM_DOWN] }
  })
}

/**
 * Her spellbook, from the front: she holds her hands out either side as the book rises open in
 * front of her, her hair lifting; she looks down at it as its pages turn by themselves, smiles as
 * the letters rise, and lowers her hands as it closes and vanishes.
 */
export function tome(): Key[] {
  return through(FIDGET_MS.tome, (t) => {
    const open = between(t, 0.02, 0.12) * (1 - between(t, 0.86, 0.96))
    const arm = toward({ shoulder: 0.85, elbow: -0.5 }, open)
    const face: Face =
      t < TOME.appear[1] ? 'neutral' : t < 0.5 ? 'down' : blinking(t, 0.92, 'happy')
    return { view: 'front', tome: t, lift: open, face, arms: [arm, arm] }
  })
}

/** Her magic habits, by pose (each plays once, for its HABITS `ms`). */
export const MAGIC_MOVES = {
  flame: once(flame),
  frost: once(frost),
  bloom: once(bloom),
  sigil: once(sigil),
  rainbow: once(rainbow),
  hat: once(hat),
  star: once(star),
  rain: once(rain),
  potion: once(potion),
  tome: once(tome),
} satisfies Moves
