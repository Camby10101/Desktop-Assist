// Every pose's move, by name: one place that says how each pose is drawn and whether it goes round.
// Each kind of move has its own file here (the habits by HABITS `kind`); to add one, write its
// function in the right file, add it to that file's list at the bottom, and it's in. TypeScript
// won't build without a move for every pose (Pose in shared/character.ts).

import type { Pose as Name } from '@shared/character'
import { BASIC_MOVES } from './basics'
import { CHARM_MOVES } from './charms'
import { EVERYDAY_MOVES } from './everyday'
import type { Move } from './kit'
import { MAGIC_MOVES } from './magic'
import { PERFORMANCE_MOVES } from './performances'
import { REACTION_MOVES } from './reactions'
import { SNOOZE_MOVES } from './snooze'
import { SPELL_MOVES } from './spells'
import { TOY_MOVES } from './toys'
import { VISITOR_MOVES } from './visitors'

export const MOVES: Record<Name, Move> = {
  ...BASIC_MOVES,
  ...EVERYDAY_MOVES,
  ...CHARM_MOVES,
  ...MAGIC_MOVES,
  ...TOY_MOVES,
  ...VISITOR_MOVES,
  ...REACTION_MOVES,
  ...SNOOZE_MOVES,
  ...SPELL_MOVES,
  ...PERFORMANCE_MOVES,
}
