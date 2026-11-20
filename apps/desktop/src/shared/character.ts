// The character that stands in for the bubble: what she's doing (her pose), shared by the main
// process (which decides) and the bubble's page (which animates it).

import { EXPLOSION, TELEPORT } from './spells'

/**
 * What kind of habit it is, which says where it's made: its move in character/moves/ (everyday.ts,
 * charms.ts, magic.ts, toys.ts or visitors.ts) and anything it draws round her in the same-named
 * file in character/props/.
 */
export type HabitKind = 'everyday' | 'charm' | 'magic' | 'toy' | 'visitor'

/** One of her habits (see HABITS). */
export interface Habit {
  /** How long it plays (ms): its move's frames add up to exactly this (the tests check). */
  ms: number
  kind: HabitKind
  /** How likely it is to come up, against 1 for most (the vision is a rare treat); 1 if not given. */
  weight?: number
}

/**
 * Her habits: things she does now and then once she's been left alone a while, each played once,
 * for its `ms` (the main process goes back to idle after it). To add one: an entry here, its move
 * in the file for its kind (character/moves/), and anything it draws round her (character/props/);
 * see docs/CUSTOMIZING.md. Two only come up at certain times (yawn and confetti: see TIMED).
 */
const HABIT_LIST = {
  /** A little jump. */
  hop: { ms: 1200, kind: 'everyday' },
  /** Waves at you. */
  wave: { ms: 2000, kind: 'everyday' },
  /** Stretches her arms up and side to side, yawning. */
  stretch: { ms: 2400, kind: 'everyday' },
  /** A sip of tea. */
  sip: { ms: 3200, kind: 'everyday' },
  /**
   * A light shines down from above and brings the company's logo down to her; she looks up at it
   * in wonder for a moment, then it rises away again (see VISION).
   */
  vision: { ms: 8600, kind: 'charm', weight: 0.2 },
  /** Holds her robe out at the sides and dips in a little curtsy, smiling. */
  curtsy: { ms: 2200, kind: 'everyday' },
  /** Gazes into a crystal ball, which swirls and sparkles, then smiles at what she sees. */
  orb: { ms: 4400, kind: 'charm' },
  /** A flame kindles in her palm, flickers and grows; she blows it out in a curl of smoke. */
  flame: { ms: 3600, kind: 'magic' },
  /** A snowflake grows over her cupped hands, glinting, then bursts into glitter. */
  frost: { ms: 4000, kind: 'magic' },
  /**
   * She points at the ground; sparkles drip down and a flower sprouts, blooms and scatters into
   * sparkles.
   */
  bloom: { ms: 4400, kind: 'magic' },
  /** She traces a star in the air in gold light; it flares, glows and fades away. */
  sigil: { ms: 3600, kind: 'magic' },
  /** Her hands sweep apart overhead, painting a rainbow over her, which shimmers and fades. */
  rainbow: { ms: 4000, kind: 'magic' },
  /** Reads her spellbook (and smiles at something in it). */
  read: { ms: 4000, kind: 'everyday' },
  /** A little spell, sparkles circling her hand. */
  spell: { ms: 2400, kind: 'charm' },
  /** Floats up over a glowing magic circle, hovers with her eyes shut, and settles. */
  levitate: { ms: 3600, kind: 'charm' },
  /** Sits on the taskbar, her robe spread round her, swaying, then gets up. */
  sit: { ms: 6000, kind: 'everyday' },
  /** Spins round three times, her robe flaring out, and lands smiling. */
  twirl: { ms: 2200, kind: 'everyday' },
  /** Holds up a finger; a little magic butterfly flutters down to it, rests, and flies off. */
  butterfly: { ms: 4800, kind: 'charm' },
  /** Nods off where she stands (floating z's), wakes with a start and looks about. */
  doze: { ms: 5600, kind: 'everyday' },
  /** Glances one way and the other. */
  look: { ms: 2400, kind: 'everyday' },
  /** Juggles three little glowing orbs, then catches them and smiles. */
  juggle: { ms: 4400, kind: 'charm' },
  /** Blows magic bubbles through a little wand ring; they drift up, wobble and pop. */
  bubbles: { ms: 4400, kind: 'charm' },
  /**
   * A will-o'-wisp goes round her twice, behind her and in front, her eyes following it, then
   * flies off; she waves it goodbye.
   */
  wisp: { ms: 4800, kind: 'charm' },
  /** "ah... ah... choo!", and the sneeze bursts into sparkles; a sheepish smile. */
  sneeze: { ms: 3000, kind: 'everyday' },
  /** Her hat floats up off her head and spins, showering sparkles, then settles back. */
  hat: { ms: 3600, kind: 'magic' },
  /** A falling star drops into her cupped hands, glows there, and she tosses it back up. */
  star: { ms: 4400, kind: 'magic' },
  /** A little cloud gathers over her and rains on her; she shoos it and it bursts into sparkles. */
  rain: { ms: 4400, kind: 'magic' },
  /** A flask in her hand bubbles and changes colour; the cork pops and coloured smoke puffs out. */
  potion: { ms: 4000, kind: 'magic' },
  /**
   * Her spellbook floats open in front of her, its pages turning by themselves and glowing letters
   * rising out of it, then closes and vanishes.
   */
  tome: { ms: 4800, kind: 'magic' },
  /**
   * A glowing yo-yo appears in her hand in a sparkle; she spins it down and up on its silver
   * string, swings it round in a loop, and it vanishes in a twinkle.
   */
  yoyo: { ms: 3600, kind: 'toy' },
  /**
   * A little spinning top appears on her palm, spins there, wobbling, and she flicks it up and
   * catches it.
   */
  top: { ms: 3600, kind: 'toy' },
  /**
   * A deck of cards appears in her hand; she springs them in an arc to her other hand and back,
   * then they vanish.
   */
  cards: { ms: 4000, kind: 'toy' },
  /**
   * A paper plane appears in her hand; she throws it, it flies a loop round her (behind her and
   * back in front), and she catches it.
   */
  plane: { ms: 4400, kind: 'toy' },
  /**
   * A bouncy ball appears in her hand; she bounces it on the taskbar, tosses it up high and
   * catches it.
   */
  ball: { ms: 4000, kind: 'toy' },
  /**
   * A little spirit with leaf wings appears beside her in a swirl of sparkles; it flies to her,
   * lands on her palm (hearts), loops round her head, they wave to each other, and it fades.
   */
  spirit: { ms: 6400, kind: 'visitor' },
  /** A big yawn behind her hand, then a sleepy sway (late at night only: see TIMED). */
  yawn: { ms: 3600, kind: 'everyday' },
  /** A cheer and a burst of confetti (Friday evenings only, and often then: see TIMED). */
  confetti: { ms: 3200, kind: 'everyday' },
  /** A little jig, stepping side to side, an arm up and a hand on her hip, then the other. */
  dance: { ms: 3200, kind: 'everyday' },
} satisfies Record<string, Habit>

export type Fidget = keyof typeof HABIT_LIST

/** Her habits, by name (see HABIT_LIST above for what each one is). */
export const HABITS: Readonly<Record<Fidget, Habit>> = HABIT_LIST

/** Her habits' names, in the order above. */
export const FIDGETS = Object.keys(HABIT_LIST) as readonly Fidget[]

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

/** How long each habit plays (ms): see HABITS. */
export const FIDGET_MS = Object.fromEntries(
  FIDGETS.map((fidget) => [fidget, HABITS[fidget].ms]),
) as Record<Fidget, number>

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
 * - `portal`: waving through a portal open on top of a window (it opens, she rises into it, waves,
 *   sinks away and it closes: played once, for PORTAL_MS).
 * - `portal-back`: clicked in her portal: she sinks away at once and it closes (PORTAL_BACK_MS).
 * - `ready-left`, `ready-right`: facing monsters that way (her battle: shared/battle.ts), seen
 *   diagonally, her hand out toward them with a glow charging in it.
 * - `cast-left`, `cast-right`: casting a bolt at them: a thrust of her hand, the glow flaring.
 * - `snooze`: sitting asleep, head nodding, z's floating up (nobody's been at the PC a while).
 */
export const HELD_POSES = [
  'watch',
  'peek-left',
  'peek-right',
  'portal',
  'portal-back',
  'snooze',
  'ready-left',
  'ready-right',
  'cast-left',
  'cast-right',
] as const
export type HeldPose = (typeof HELD_POSES)[number]

/**
 * Her portal (the `portal` performance, on top of a window: see windowTricks.ts), in order (ms): it
 * opens, she rises into it (as if on its far side), waves a while, sinks away, and it closes. Her
 * `portal` pose plays the lot once (sprite.ts), and the performance waits for it.
 */
export const PORTAL = { openMs: 600, riseMs: 320, waveMs: 5440, sinkMs: 320, closeMs: 520 } as const
export const PORTAL_MS =
  PORTAL.openMs + PORTAL.riseMs + PORTAL.waveMs + PORTAL.sinkMs + PORTAL.closeMs
/** Clicked in her portal, she goes back at once: she sinks away, and it closes (her `portal-back` pose). */
export const PORTAL_BACK_MS = PORTAL.sinkMs + PORTAL.closeMs

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
