// Her poses of her own for her spells (SPELL_POSES).

import { SPELL_POSE_MS } from '@shared/character'
import { FADE } from '../rig'
import { type Key, FRAME_MS, over, type Moves, once, repeating } from './kit'

/**
 * Chanting (her explosion spell), from the front: arms raised high, eyes shut and her lips moving,
 * a magic circle turning under her, sparkles circling her hand, her hair and robe lifting in the
 * updraft. Round and round, for as long as the chant lasts.
 */
export function chant(): Key[] {
  return Array.from({ length: 32 }, (_, i) => {
    const phase = (i / 32) * Math.PI * 2
    const sway = Math.sin(phase) * 0.06
    return {
      pose: {
        view: 'front',
        face: Math.floor(i / 3) % 2 === 1 ? 'chant' : 'blink',
        arms: [
          { shoulder: 2.45 + sway, elbow: -0.1 },
          { shoulder: 2.45 - sway, elbow: -0.1 },
        ],
        rune: 1,
        spin: i / 32,
        sparkle: i / 32,
        lift: 1.5 + Math.sin(phase * 2) * 0.8,
        wind: Math.sin(phase) * 0.6,
        spread: 1.5 + Math.sin(phase * 2) * 0.8,
      },
      ms: FRAME_MS,
    }
  })
}

/**
 * Vanishing, from the front: a smile, then her eyes close and she dissolves into white motes that
 * drift up and fade (see FADE in the rig), the top of her first, until there's nothing left.
 */
export function vanish(): Key[] {
  return over(SPELL_POSE_MS.vanish, (t) => ({
    view: 'front',
    face: t < 0.25 ? 'happy' : 'blink',
    fade: t * FADE.end,
  }))
}

/**
 * Appearing: vanishing backwards. White motes come down out of nowhere and she forms out of them,
 * her eyes shut, then open with a smile, standing as usual by the end.
 */
export function appear(): Key[] {
  return over(SPELL_POSE_MS.appear, (t) => ({
    view: 'front',
    face: t < 0.75 ? 'blink' : t < 0.95 ? 'happy' : 'neutral',
    fade: (1 - t) * FADE.end,
  }))
}

/** Her spell poses, by pose. */
export const SPELL_MOVES = {
  // The chant goes round for as long as it lasts; vanishing and appearing play once.
  chant: repeating(chant),
  vanish: once(vanish),
  appear: once(appear),
} satisfies Moves
