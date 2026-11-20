// Her snooze: nodding off (settle), sitting asleep (snooze, held for as long as nobody's at the
// PC) and waking (rouse).

import { type Pose } from '../rig'
import { type Key, tween, hold, crouch, FRONT, type Moves, once, repeating } from './kit'

/** Sitting asleep, from the front: hugging her knees, eyes shut, her head drooping a little more and less. */
export const asleep = (i: number, count: number, flipText = false): Pose => {
  const phase = (i / count) * Math.PI * 2
  return {
    view: 'front',
    sitting: true,
    face: 'blink',
    tilt: 0.1 + Math.sin(phase) * 0.025,
    zzz: i / count,
    flipText,
    arms: [
      { shoulder: 0.55, elbow: -1.15 },
      { shoulder: 0.55, elbow: -1.15 },
    ],
    legs: [
      { hip: 0.3, knee: 0.3 },
      { hip: 0.3, knee: 0.3 },
    ],
  }
}

/** Nodding off, from the front: she crouches and sits down, her eyes closing. */
export function settle(): Key[] {
  const squat: Pose = { view: 'front', face: 'blink', y: 5, legs: crouch(5) }
  return [
    ...tween({ ...FRONT, face: 'down' }, squat, 300),
    ...hold({ ...asleep(0, 1), zzz: undefined }, 600),
  ]
}

/** Snoozing, round and round: sitting asleep, z's floating up from her. */
export function snooze(flipText = false): Key[] {
  return Array.from({ length: 26 }, (_, i) => ({ pose: asleep(i, 26, flipText), ms: 100 }))
}

/** Woken from her snooze, from the front: she blinks awake, gets up, and smiles. */
export function rouse(): Key[] {
  const sat = { ...asleep(0, 1), zzz: undefined }
  const squat: Pose = { view: 'front', face: 'neutral', y: 5, legs: crouch(5) }
  return [
    ...hold(sat, 200),
    ...hold({ ...sat, face: 'surprised', tilt: 0 }, 200),
    ...hold({ ...sat, face: 'blink', tilt: 0 }, 100),
    ...tween({ ...sat, face: 'neutral', tilt: 0 }, squat, 250),
    ...tween(squat, FRONT, 300),
    ...hold({ view: 'front', face: 'happy' }, 350),
  ]
}

/** Her snooze, by pose. */
export const SNOOZE_MOVES = {
  settle: once(settle),
  // Its z's are drawn the other way round for facing left, so they read right once mirrored.
  snooze: repeating(snooze, () => snooze(true)),
  rouse: once(rouse),
} satisfies Moves
