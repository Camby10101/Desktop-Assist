import type { Fidget, SpellPose } from './character'

// Her spells, cast from the Spells menu beside the stack of icons above her: what each is called,
// and their timings. Shared by the main process (which casts them, moving her and opening the
// windows their effects are drawn in) and the pages (the menu, her animations, the effects).

/** In the menu's order: her own tricks first, then the sky, then the biggest. */
export const SPELLS = [
  'clones',
  'teleport',
  'familiar',
  'butterflies',
  'starfall',
  'fireworks',
  'blizzard',
  'thunderstorm',
  'phoenix',
  'vortex',
  'explosion',
] as const
export type Spell = (typeof SPELLS)[number]

/** What the Spells menu calls each. */
export const SPELL_LABELS: Record<Spell, string> = {
  clones: 'Clones',
  teleport: 'Teleport',
  familiar: 'Summon familiar',
  butterflies: 'Butterflies',
  starfall: 'Starfall',
  fireworks: 'Fireworks',
  blizzard: 'Blizzard',
  thunderstorm: 'Thunderstorm',
  phoenix: 'Phoenix',
  vortex: 'Vortex',
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

/**
 * Fireworks: `rockets` launched from along the taskbar, one about every `gapMs`, the last `finale`
 * of them together from `finaleAt` (ms), each bursting high over the screen.
 */
export const FIREWORKS = { durationMs: 9_000, rockets: 20, gapMs: 480, finale: 7, finaleAt: 6_200 }

/** Thunderstorm: clouds roll in over the top of the screen, rain, and `strikes` bolts of lightning. */
export const THUNDERSTORM = { durationMs: 9_000, strikes: 7 }

/** Blizzard: `flakes` snowflakes blowing across the screen, frost creeping in, snow piling up. */
export const BLIZZARD = { durationMs: 9_000, flakes: 340 }

/**
 * Vortex: a portal opens in the middle of the screen over `openMs`, swirls, pulling everything in,
 * collapses from `collapseAt` (ms) to `implodeAt`, and goes off in a flash.
 */
export const VORTEX = { durationMs: 8_000, openMs: 1_000, collapseAt: 6_300, implodeAt: 6_900 }

/** Butterflies: `count` magic butterflies burst out of her and flutter away across the screen. */
export const BUTTERFLIES = { durationMs: 8_000, count: 36 }

/** Phoenix: a bird of fire flies out of her, round the screen and away, over `flightMs`. */
export const PHOENIX = { durationMs: 7_500, flightMs: 6_000 }

/** The spells drawn in a window of their own over the screen, and how long it stays open (ms). */
export const SPELL_EFFECT_MS = {
  starfall: STARFALL.durationMs,
  explosion: EXPLOSION.chantMs + EXPLOSION.boomMs,
  fireworks: FIREWORKS.durationMs,
  thunderstorm: THUNDERSTORM.durationMs,
  blizzard: BLIZZARD.durationMs,
  vortex: VORTEX.durationMs,
  butterflies: BUTTERFLIES.durationMs,
  phoenix: PHOENIX.durationMs,
} as const
export type SpellEffect = keyof typeof SPELL_EFFECT_MS

/**
 * What she does as she casts each of those: one of her habits (casting a spell, twirling,
 * levitating, a butterfly coming to her finger), or her chant for the explosion.
 */
export const CAST_POSE: Record<SpellEffect, Fidget | SpellPose> = {
  starfall: 'spell',
  explosion: 'chant',
  fireworks: 'spell',
  thunderstorm: 'spell',
  blizzard: 'twirl',
  vortex: 'levitate',
  butterflies: 'butterfly',
  phoenix: 'spell',
}
