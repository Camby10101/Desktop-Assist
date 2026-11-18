import type { Pose } from '@shared/character'
import type { CatPose } from '../character/cat'

// What her familiar (the black cat) does, moment by moment (see FamiliarView): it wanders along
// the taskbar near her, sits, washes, follows her when she walks off, and joins in with what she's
// doing: curls up beside her when she sits or dozes, hops about when she dances or cheers, sits and
// watches her magic. Positions are DIPs from the left edge of the cat's window (a strip along the
// taskbar); `x` is the left edge of the cat's box.

export interface Cat {
  x: number
  facing: 'left' | 'right'
  pose: Exclude<CatPose, 'puff'>
  /** Where it's walking to, if it is. */
  target: number | null
  /** When it next makes up its mind (ms, the same clock as `now`). */
  until: number
}

/** Where it lives: the strip's width, the cat's box (DIP), and how big she is (and so it is). */
export interface CatRoom {
  width: number
  box: number
  scale: number
}

/** Her, as the cat sees her: the middle of her box (DIP across the strip) and what she's doing. */
export interface Her {
  x: number
  pose: Pose
}

export const CAT = {
  /** Walking and running speeds at her usual size (DIP per second); it runs when it's far behind. */
  walk: 70,
  run: 160,
  /** How far behind her it lets itself get before it follows (DIP at her usual size)... */
  follow: 70,
  /** ...and how far it runs before it walks. */
  far: 220,
  /** Beside her (DIP from her middle to its box's middle, at her usual size). */
  beside: 40,
  /** How far from her it wanders (DIP at her usual size). */
  roam: 220,
  /** A sit, a wash or a nap on its own lasts this long (ms, from-to). */
  rest: [1800, 4500],
} as const

/** What she's doing that the cat joins in with: curling up, hopping about, or sitting to watch. */
const RESTFUL: readonly Pose[] = ['sit', 'doze', 'yawn', 'splat']
const LIVELY: readonly Pose[] = [
  'dance',
  'twirl',
  'hop',
  'confetti',
  'startle',
  'pet',
  'scroll',
  'pounce-left',
  'pounce-right',
  'wave',
]
const MOVING: readonly Pose[] = ['walk-left', 'walk-right', 'flung', 'dragged']

/** The cat as it appears, in a puff of smoke, beside her (toward the middle of the screen). */
export function arriveCat(her: number, room: CatRoom, now: number): Cat {
  const side = her > room.width / 2 ? -1 : 1
  const x = clampX(her + side * CAT.beside * room.scale - room.box / 2, room)
  return { x, facing: side === 1 ? 'left' : 'right', pose: 'sit', target: null, until: now + 1500 }
}

function clampX(x: number, room: CatRoom): number {
  return Math.min(Math.max(x, 0), Math.max(0, room.width - room.box))
}

/** The cat `dtMs` later, at `now`, seeing her (`her`, null if it can't). */
export function stepCat(
  cat: Cat,
  now: number,
  dtMs: number,
  room: CatRoom,
  her: Her | null,
  random: () => number,
): Cat {
  const middle = cat.x + room.box / 2
  const scale = room.scale
  const towardHer = (to: number) => (to > middle ? 'right' : 'left') as Cat['facing']
  const beside = her
    ? clampX(her.x + Math.sign(middle - her.x || 1) * CAT.beside * scale - room.box / 2, room)
    : 0

  // Going somewhere: on its way there, faster when it's far.
  const walkTo = (target: number, then: Cat['pose']): Cat => {
    const distance = target - cat.x
    if (Math.abs(distance) < 2) {
      return {
        ...cat,
        x: target,
        target: null,
        pose: then,
        facing: her ? towardHer(her.x) : cat.facing,
      }
    }
    const speed = (Math.abs(distance) > CAT.far * scale ? CAT.run : CAT.walk) * scale
    const step = Math.min(Math.abs(distance), (speed * Math.min(dtMs, 100)) / 1000)
    return {
      ...cat,
      x: cat.x + Math.sign(distance) * step,
      target,
      pose: 'walk',
      facing: distance > 0 ? 'right' : 'left',
    }
  }

  if (her) {
    // Joining in with her: beside her, curled up, hopping, or sitting to watch.
    if (RESTFUL.includes(her.pose)) return walkTo(beside, 'loaf')
    if (LIVELY.includes(her.pose)) {
      const there = walkTo(beside, 'hop')
      return there.pose === 'walk' ? there : { ...there, pose: 'hop' }
    }
    // Following her when she goes off (or is carried off).
    const behind = Math.abs(her.x - middle) > CAT.follow * scale
    if (MOVING.includes(her.pose) && behind) return walkTo(beside, 'sit')
    if (her.pose !== 'idle' && !MOVING.includes(her.pose)) {
      // Any other habit or trick of hers: it sits and watches.
      return Math.abs(her.x - middle) > CAT.far * scale
        ? walkTo(beside, 'sit')
        : { ...cat, target: null, pose: 'sit', facing: towardHer(her.x) }
    }
    if (Math.abs(her.x - middle) > CAT.roam * scale * 1.5) return walkTo(beside, 'sit')
  }

  // On its own: going where it was going, or resting until it makes up its mind again.
  if (cat.target !== null) return walkTo(cat.target, random() < 0.5 ? 'sit' : 'groom')
  if (now < cat.until) return cat
  const roll = random()
  const [from, to] = CAT.rest
  const until = now + from + random() * (to - from)
  if (roll < 0.55) {
    const centre = her ? her.x : middle
    const target = clampX(centre + (random() * 2 - 1) * CAT.roam * scale - room.box / 2, room)
    return { ...walkTo(target, 'sit'), until }
  }
  const pose: Cat['pose'] = roll < 0.75 ? 'groom' : roll < 0.9 ? 'sit' : 'loaf'
  return { ...cat, pose, target: null, until }
}
