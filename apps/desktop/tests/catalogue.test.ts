import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FIDGETS,
  HABITS,
  HELD_POSES,
  REACTIONS,
  SPELL_POSES,
  type HabitKind,
} from '@shared/character'
import { MOVES } from '../src/renderer/src/character/moves'
import { CHARM_MOVES } from '../src/renderer/src/character/moves/charms'
import { EVERYDAY_MOVES } from '../src/renderer/src/character/moves/everyday'
import { MAGIC_MOVES } from '../src/renderer/src/character/moves/magic'
import { TOY_MOVES } from '../src/renderer/src/character/moves/toys'
import { VISITOR_MOVES } from '../src/renderer/src/character/moves/visitors'
import { PALETTE } from '../src/renderer/src/character/palette'
import { PROPS } from '../src/renderer/src/character/props'
import * as basics from '../src/renderer/src/character/props/basics'
import * as charms from '../src/renderer/src/character/props/charms'
import * as everyday from '../src/renderer/src/character/props/everyday'
import * as magic from '../src/renderer/src/character/props/magic'
import * as performances from '../src/renderer/src/character/props/performances'
import * as reactions from '../src/renderer/src/character/props/reactions'
import * as toys from '../src/renderer/src/character/props/toys'
import * as visitors from '../src/renderer/src/character/props/visitors'

// The character's catalogue holds together: each habit (HABITS) has its move in the file for its
// kind, every pose has exactly one move, every colour letter has a colour, and every prop painter
// is drawn. These are what docs/CUSTOMIZING.md's steps rely on.

const BY_KIND: Record<HabitKind, Record<string, unknown>> = {
  everyday: EVERYDAY_MOVES,
  charm: CHARM_MOVES,
  magic: MAGIC_MOVES,
  toy: TOY_MOVES,
  visitor: VISITOR_MOVES,
}

describe('the character’s catalogue', () => {
  it('files each habit’s move with the others of its kind, and nowhere else', () => {
    for (const fidget of FIDGETS) {
      const { kind } = HABITS[fidget]
      expect(Object.keys(BY_KIND[kind]), `${fidget} (${kind})`).toContain(fidget)
      for (const [other, moves] of Object.entries(BY_KIND)) {
        if (other !== kind)
          expect(Object.keys(moves), `${fidget} in ${other}`).not.toContain(fidget)
      }
    }
    // And nothing filed as a habit that isn't one.
    const filed = Object.values(BY_KIND).flatMap((moves) => Object.keys(moves))
    expect(filed.sort()).toEqual([...FIDGETS].sort())
  })

  it('has one move for every pose, the habits and reactions each played once', () => {
    const poses = [
      'idle',
      'walk-left',
      'walk-right',
      'dragged',
      'flung',
      'splat',
      ...FIDGETS,
      ...SPELL_POSES,
      ...REACTIONS,
      ...HELD_POSES,
    ]
    expect(Object.keys(MOVES).sort()).toEqual([...new Set(poses)].sort())
    for (const pose of [...FIDGETS, ...REACTIONS]) expect(MOVES[pose].loops, pose).toBe(false)
  })

  it('gives every colour letter a colour in character.css', () => {
    const css = readFileSync(
      resolve(__dirname, '../src/renderer/src/components/character.css'),
      'utf8',
    )
    for (const [letter, className] of Object.entries(PALETTE)) {
      expect(css, `${letter}: .${className}`).toMatch(new RegExp(`\\.${className}\\b`))
    }
    // Each letter one colour.
    expect(new Set(Object.keys(PALETTE)).size).toBe(Object.keys(PALETTE).length)
  })

  it('draws every prop painter, once each', () => {
    const painters = [
      basics,
      charms,
      everyday,
      magic,
      performances,
      reactions,
      toys,
      visitors,
    ].flatMap((file) =>
      Object.entries(file)
        .filter(([name, value]) => name.startsWith('paint') && typeof value === 'function')
        .map(([, value]) => value),
    )
    expect(painters.length).toBeGreaterThan(20)
    for (const paint of painters) expect(PROPS.filter((p) => p === paint)).toHaveLength(1)
    expect(PROPS).toHaveLength(painters.length)
  })
})
