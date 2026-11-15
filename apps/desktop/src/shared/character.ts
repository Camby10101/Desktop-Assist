// The character that stands in for the bubble: what she's doing (her pose), shared by the main
// process (which decides) and the bubble's page (which animates it).

/**
 * Things she does now and then, once she's been left alone for a while (each plays once):
 * - `hop`: a little jump.
 * - `wave`: waves at you.
 * - `stretch`: stretches her arms up and side to side, yawning.
 * - `sip`: a sip of tea.
 * - `read`: reads her spellbook (and smiles at something in it).
 * - `spell`: a little spell, sparkles circling her hand.
 * - `levitate`: floats up over a glowing magic circle, hovers with her eyes shut, and settles.
 * - `sit`: sits on the taskbar, her robe spread round her, swaying, then gets up.
 * - `look`: glances one way and the other.
 */
export const FIDGETS = [
  'hop',
  'wave',
  'stretch',
  'sip',
  'read',
  'spell',
  'levitate',
  'sit',
  'look',
] as const
export type Fidget = (typeof FIDGETS)[number]

/**
 * - `idle`: standing, breathing, blinking now and then.
 * - `walk-left`, `walk-right`: walking along the taskbar (the window moves with her).
 * - `dragged`: dangling while she's dragged, thrown about by Bounce, or falling after a drop.
 * - one of the FIDGETS.
 */
export type Pose = 'idle' | 'walk-left' | 'walk-right' | 'dragged' | Fidget

/** How long each fidget plays (ms): the main process goes back to idle after it. */
export const FIDGET_MS: Record<Fidget, number> = {
  hop: 1200,
  wave: 2000,
  stretch: 2400,
  sip: 3200,
  read: 4000,
  spell: 2400,
  levitate: 3600,
  sit: 6000,
  look: 2400,
}

export const isFidget = (pose: Pose): pose is Fidget =>
  (FIDGETS as readonly string[]).includes(pose)
