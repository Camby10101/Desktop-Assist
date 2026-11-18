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
 * - `flame`: a flame kindles in her palm, flickers and grows; she blows it out in a curl of smoke.
 * - `frost`: a snowflake grows over her cupped hands, glinting, then bursts into glitter.
 * - `bloom`: she points at the ground; sparkles drip down and a flower sprouts, blooms and
 *   scatters into sparkles.
 * - `sigil`: she traces a star in the air in gold light; it flares, glows and fades away.
 * - `rainbow`: her hands sweep apart overhead, painting a rainbow over her, which shimmers and
 *   fades.
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
 * - `hat`: her hat floats up off her head and spins, showering sparkles, then settles back.
 * - `star`: a falling star drops into her cupped hands, glows there, and she tosses it back up.
 * - `rain`: a little cloud gathers over her and rains on her; she shoos it and it bursts into
 *   sparkles.
 * - `potion`: a flask in her hand bubbles and changes colour; the cork pops and coloured smoke
 *   puffs out.
 * - `tome`: her spellbook floats open in front of her, its pages turning by themselves and glowing
 *   letters rising out of it, then closes and vanishes.
 * - `dance`: a little jig, stepping side to side, an arm up and a hand on her hip, then the other.
 * - `yawn`: a big yawn behind her hand, then a sleepy sway (late at night only: see TIMED).
 * - `confetti`: a cheer and a burst of confetti (Friday evenings only, and often then: see TIMED).
 */
export const FIDGETS = [
  'hop',
  'wave',
  'stretch',
  'sip',
  'vision',
  'curtsy',
  'orb',
  'flame',
  'frost',
  'bloom',
  'sigil',
  'rainbow',
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
  'hat',
  'star',
  'rain',
  'potion',
  'tome',
  'yawn',
  'confetti',
  'dance',
] as const
export type Fidget = (typeof FIDGETS)[number]

/**
 * Poses of her own for her spells (src/shared/spells.ts), only when one is cast (for most, she
 * plays one of her habits instead: see CAST_POSE):
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
 * - `flung`: thrown, flying through the air, tumbling head over heels, arms and legs flailing.
 * - `splat`: a hard landing: down on her bottom in a puff of dust, her hat knocked down over her
 *   eyes and stars going round her head; she pushes it back up, shakes her head and gets up, with
 *   a sheepish smile (for LANDING.splatMs).
 * - one of the FIDGETS, the SPELL_POSES, the REACTIONS or the HELD_POSES.
 */
export type Pose =
  | 'idle'
  | 'walk-left'
  | 'walk-right'
  | 'dragged'
  | 'flung'
  | 'splat'
  | Fidget
  | SpellPose
  | Reaction
  | HeldPose

/** Her hard landing (the `splat` pose): how long it lasts (ms). */
export const LANDING = { splatMs: 3200 } as const

/** How long each fidget plays (ms): the main process goes back to idle after it. */
export const FIDGET_MS: Record<Fidget, number> = {
  hop: 1200,
  wave: 2000,
  stretch: 2400,
  sip: 3200,
  vision: 8600,
  curtsy: 2200,
  orb: 4400,
  flame: 3600,
  frost: 4000,
  bloom: 4400,
  sigil: 3600,
  rainbow: 4000,
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
  hat: 3600,
  star: 4400,
  rain: 4400,
  potion: 4000,
  tome: 4800,
  yawn: 3600,
  confetti: 3200,
  dance: 3200,
}

/**
 * Habits only for certain times (local time): yawning late at night (from `from` o'clock to `to`,
 * across midnight), and confetti on Friday evenings (day 5, 16:00 to 20:00), five times as likely
 * then as any other habit.
 */
export const TIMED = {
  yawn: { from: 22, to: 6, weight: 1 },
  confetti: { day: 5, from: 16, to: 20, weight: 5 },
} as const

/** Whether a timed habit (TIMED) can happen at `when`; any other habit always can. */
export function inSeason(fidget: Fidget, when: Date): boolean {
  const hour = when.getHours()
  if (fidget === 'yawn') return hour >= TIMED.yawn.from || hour < TIMED.yawn.to
  if (fidget === 'confetti') {
    return (
      when.getDay() === TIMED.confetti.day &&
      hour >= TIMED.confetti.from &&
      hour < TIMED.confetti.to
    )
  }
  return true
}

/**
 * Things she does in answer to something, played once (see REACTION_MS):
 * - `pet`: double-clicked: a happy wiggle, hearts floating up.
 * - `scroll`: a new Jira notification or reply to a request: she hops up holding a scroll.
 * - `startle`: the pointer zipped past her: she jumps.
 * - `pounce-left`, `pounce-right`: the pointer wiggled near her: she leaps at it, that way.
 * - `lift`, `lower`: her arms rise (lifting something by magic), or come down (setting it down).
 * - `guilty`: caught out (after a prank): nervous glances either way, a bead of sweat.
 * - `toss`: juggling, hands only (what she juggles is drawn elsewhere: the taskbar's icons).
 * - `settle`: nodding off: she sits down, eyes closing (into her `snooze`).
 * - `rouse`: woken from her snooze: she blinks awake and gets up.
 */
export const REACTIONS = [
  'pet',
  'scroll',
  'startle',
  'pounce-left',
  'pounce-right',
  'lift',
  'lower',
  'guilty',
  'toss',
  'settle',
  'rouse',
] as const
export type Reaction = (typeof REACTIONS)[number]

/** How long each reaction lasts (ms). */
export const REACTION_MS: Record<Reaction, number> = {
  pet: 1800,
  scroll: 2400,
  startle: 1000,
  'pounce-left': 1400,
  'pounce-right': 1400,
  lift: 800,
  lower: 800,
  guilty: 2400,
  toss: 4400,
  settle: 900,
  rouse: 1400,
}

/**
 * Snoozing: with no mouse or keyboard about for `afterMs` (nobody at the PC), she sits down and
 * snoozes until there is again (input less than `wakeMs` ago). Not while the screen saver's on.
 */
export const SNOOZE = { afterMs: 5 * 60_000, wakeMs: 1500 } as const

/**
 * Poses that go round and round for as long as something else says (her performances):
 * - `watch`: her eyes on the pointer, wherever it is (the gaze comes from the main process).
 * - `peek-left`, `peek-right`: leaning out round the edge of a window she's behind, that way.
 * - `ride`: sitting on top of a window, arms up, the wind in her hair.
 * - `snooze`: sitting asleep, head nodding, z's floating up (nobody's been at the PC a while).
 */
export const HELD_POSES = ['watch', 'peek-left', 'peek-right', 'ride', 'snooze'] as const
export type HeldPose = (typeof HELD_POSES)[number]

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
 * While she's carried, her page says every `everyMs` that the mouse button is still down; without
 * that for `staleMs` (the release went missing, as a busy PC can lose it, or the page is stuck),
 * the main process lets her go, so she never stays stuck to the pointer.
 */
export const DRAG_CHECK = { everyMs: 250, staleMs: 2000 } as const

/**
 * Her familiar, the black cat: summoned from its icon it stays `summonMs`; visiting, as one of her
 * habits, `visitMs` (ms).
 */
export const FAMILIAR = { summonMs: 60_000, visitMs: 16_000 } as const

/**
 * Her clones (the Clones spell): how many, how long they last (ms), and how long they take to
 * fade in and out at either end.
 */
export const CLONES = { count: 10, durationMs: 30_000, fadeMs: 400 } as const
