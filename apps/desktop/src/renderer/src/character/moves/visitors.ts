// Her visitors (HABITS, kind 'visitor'): habits where something comes to see her.

import { FIDGET_MS } from '@shared/character'
import { type Arm, type Face } from '../rig'
import { SPIRIT } from '../props/visitors'
import {
  type Key,
  lerp,
  ARM_DOWN,
  between,
  OUT_SIDE,
  through,
  toward,
  blinking,
  type Moves,
  once,
} from './kit'

/**
 * A little spirit visiting, from the front: it appears beside her and she looks round, surprised,
 * then smiles; she holds her hand out and it lands on her palm (hearts), her head tilting to it;
 * it loops round her head and she follows it; it hovers beside her and they wave to each other;
 * and it fades away.
 */
export function spirit(): Key[] {
  return through(FIDGET_MS.spirit, (t) => {
    const holding =
      between(t, SPIRIT.toHer[1] - 0.04, SPIRIT.land[0]) *
      (1 - between(t, SPIRIT.land[1], SPIRIT.loop[0] + 0.04))
    const waving =
      between(t, SPIRIT.wave[0] - 0.03, SPIRIT.wave[0]) *
      (1 - between(t, SPIRIT.wave[1], SPIRIT.gone[0] + 0.02))
    const swing = Math.sin(t * 90) * waving
    const hold = toward(OUT_SIDE, holding)
    const arm: Arm =
      waving > 0
        ? {
            shoulder: lerp(hold.shoulder, 2.5 + 0.15 * swing, waving),
            elbow: lerp(hold.elbow, 0.3 + 0.35 * swing, waving),
          }
        : hold
    const landed = t >= SPIRIT.land[0] + 0.06 && t < SPIRIT.land[1]
    const hearts = t >= 0.4 && t < 0.56 ? (t - 0.4) / 0.16 : 0
    const face: Face =
      t < SPIRIT.appear[1]
        ? 'neutral'
        : t < SPIRIT.toHer[0] + 0.06
          ? 'surprised'
          : blinking(t, 0.66, 'happy')
    return {
      view: 'front',
      spirit: t,
      face,
      tilt: landed ? 0.07 : 0,
      hearts,
      arms: [arm, ARM_DOWN],
    }
  })
}

/** Her visitors, by pose (each plays once, for its HABITS `ms`). */
export const VISITOR_MOVES = {
  spirit: once(spirit),
} satisfies Moves
