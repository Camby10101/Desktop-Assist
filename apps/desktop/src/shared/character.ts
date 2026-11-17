// The character that stands in for the bubble: what she's doing (her pose), shared by the main
// process (which decides) and the bubble's page (which animates it).

import { EXPLOSION, TELEPORT } from './spells'

/**
 * Things she does now and then, once she's been left alone for a while (each plays once):
 * - `hop`: a little jump.
 * - `wave`: waves at you.
 * - `stretch`: stretches her arms up and side to side, yawning.
 * - `sip`: a sip of tea.
 * - `vision`: a light shines down from above and brings the company's logo down to her; she looks
 *   up at it in wonder for a moment, then it rises away again (see VISION).
 * - `curtsy`: holds her robe out at the sides and dips in a little curtsy, smiling.
 * - `orb`: gazes into a crystal ball, which swirls and sparkles, then smiles at what she sees.
 * - `read`: reads her spellbook (and smiles at something in it).
 * - `spell`: a little spell, sparkles circling her hand.
 * - `levitate`: floats up over a glowing magic circle, hovers with her eyes shut, and settles.
 * - `sit`: sits on the taskbar, her robe spread round her, swaying, then gets up.
 * - `twirl`: spins round three times, her robe flaring out, and lands smiling.
 * - `butterfly`: holds up a finger; a little magic butterfly flutters down to it, rests, and flies
 *   off.
 * - `doze`: nods off where she stands (floating z's), wakes with a start and looks about.
 * - `look`: glances one way and the other.
 * - `juggle`: juggles three little glowing orbs, then catches them and smiles.
 * - `bubbles`: blows magic bubbles through a little wand ring; they drift up, wobble and pop.
 * - `wisp`: a will-o'-wisp goes round her twice, behind her and in front, her eyes following it,
 *   then flies off; she waves it goodbye.
 * - `sneeze`: "ah... ah... choo!", and the sneeze bursts into sparkles; a sheepish smile.
 * - `dance`: a little jig, stepping side to side, an arm up and a hand on her hip, then the other.
 */
export const FIDGETS = [
  'hop',
  'wave',
  'stretch',
  'sip',
  'vision',
  'curtsy',
  'orb',
  'read',
  'spell',
  'levitate',
  'sit',
  'twirl',
  'butterfly',
  'doze',
  'look',
  'juggle',
  'bubbles',
  'wisp',
  'sneeze',
  'dance',
] as const
export type Fidget = (typeof FIDGETS)[number]

/**
 * What she does for her spells (src/shared/spells.ts), only when one is cast:
 * - `chant`: arms raised, eyes shut, a magic circle under her and her hair and robe lifting, as she
 *   chants (round and round, for as long as the explosion's chant lasts).
 * - `vanish`: she dissolves into white motes that drift up and fade (teleporting; and when the app
 *   is closed), and `appear`: the motes come down and she forms out of them (teleporting; and
 *   when the app starts).
 */
export const SPELL_POSES = ['chant', 'vanish', 'appear'] as const
export type SpellPose = (typeof SPELL_POSES)[number]

/** How long each of her spells' poses lasts (ms). */
export const SPELL_POSE_MS: Record<SpellPose, number> = {
  chant: EXPLOSION.chantMs,
  vanish: TELEPORT.vanishMs,
  appear: TELEPORT.appearMs,
}

export const isSpellPose = (pose: Pose): pose is SpellPose =>
  (SPELL_POSES as readonly string[]).includes(pose)

/**
 * - `idle`: standing, breathing, blinking now and then.
 * - `walk-left`, `walk-right`: walking along the taskbar (the window moves with her).
 * - `dragged`: dangling while she's dragged, or falling after a drop.
 * - one of the FIDGETS, or one of the SPELL_POSES.
 */
export type Pose = 'idle' | 'walk-left' | 'walk-right' | 'dragged' | Fidget | SpellPose

/** How long each fidget plays (ms): the main process goes back to idle after it. */
export const FIDGET_MS: Record<Fidget, number> = {
  hop: 1200,
  wave: 2000,
  stretch: 2400,
  sip: 3200,
  vision: 8600,
  curtsy: 2200,
  orb: 4400,
  read: 4000,
  spell: 2400,
  levitate: 3600,
  sit: 6000,
  twirl: 2200,
  butterfly: 4800,
  doze: 5600,
  look: 2400,
  juggle: 4400,
  bubbles: 4400,
  wisp: 4800,
  sneeze: 3000,
  dance: 3200,
}

export const isFidget = (pose: Pose): pose is Fidget =>
  (FIDGETS as readonly string[]).includes(pose)

/**
 * The `vision` habit's timetable (ms from its start), shared by her animation (sprite.ts) and the
 * window that draws the light and the logo above her (VisionView), so she looks up as it comes:
 * the light fades in, the logo comes down and hovers over her head for five seconds, rises away,
 * and the light fades out.
 */
export const VISION = {
  lightIn: [0, 600],
  descend: [300, 1800],
  ascend: [6800, 8000],
  lightOut: [7900, 8600],
} as const

/**
 * Her clones (the Clones spell): how many, how long they last (ms), and how long they take to
 * fade in and out at either end.
 */
export const CLONES = { count: 10, durationMs: 30_000, fadeMs: 400 } as const
