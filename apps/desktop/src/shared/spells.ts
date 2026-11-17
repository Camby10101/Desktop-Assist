// Her spells, cast from the Spells menu beside the stack of icons above her: what each is called,
// and their timings. Shared by the main process (which casts them, moving her and opening the
// windows their effects are drawn in) and the pages (the menu, her animations, the effects).

export const SPELLS = ['clones', 'starfall', 'teleport', 'explosion'] as const
export type Spell = (typeof SPELLS)[number]

/** What the Spells menu calls each. */
export const SPELL_LABELS: Record<Spell, string> = {
  clones: 'Clones',
  starfall: 'Starfall',
  teleport: 'Teleport',
  explosion: 'Explosion',
}

/** Starfall: shooting stars across her screen for this long (ms), this many starting a second. */
export const STARFALL = { durationMs: 10_000, perSecond: 7 }

/**
 * Explosion: she chants for `chantMs` while a pillar of magic circles (`circles` of them) rises
 * above her, one after another; then the explosion goes off in the middle of the screen, over
 * `boomMs`.
 */
export const EXPLOSION = { chantMs: 15_000, circles: 7, boomMs: 3_600 }

/**
 * Teleport: she vanishes into white motes over `vanishMs`, moves, and forms out of them again over
 * `appearMs`. (The same as when the app starts, and when it's closed.)
 */
export const TELEPORT = { vanishMs: 900, appearMs: 900 }

/** The spells drawn in a window of their own over the screen, and how long it stays open (ms). */
export const SPELL_EFFECT_MS = {
  starfall: STARFALL.durationMs,
  explosion: EXPLOSION.chantMs + EXPLOSION.boomMs,
} as const
export type SpellEffect = keyof typeof SPELL_EFFECT_MS
