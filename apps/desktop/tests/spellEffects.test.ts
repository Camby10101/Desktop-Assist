import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Rect } from '@shared/geometry'
import { EXPLOSION, SPELL_EFFECT_MS } from '@shared/spells'
import { CHANT_SLACK_MS, SpellEffects } from '../src/main/bubble/spellEffects'

const WORK_AREA: Rect = { x: 0, y: 0, width: 1920, height: 1040 }
const standing = {
  workArea: WORK_AREA,
  bounds: { x: 1808, y: 936, width: 96, height: 104 },
  scale: 1,
}

describe('SpellEffects', () => {
  let opened: { bounds: Rect; query: Record<string, string>; closed: boolean }[]
  let effects: SpellEffects

  beforeEach(() => {
    vi.useFakeTimers()
    opened = []
    effects = new SpellEffects({
      accentColor: '#9333EA',
      open: (bounds, query) => {
        const window = { bounds, query, closed: false }
        opened.push(window)
        return { close: () => (window.closed = true) }
      },
      now: () => Date.now(),
    })
  })

  afterEach(() => {
    effects.stop()
    vi.useRealTimers()
  })

  it('opens one window over her display, telling it the spell, where she stands and when', () => {
    effects.start('starfall', standing)
    expect(opened).toHaveLength(1)
    expect(opened[0]!.bounds).toEqual(WORK_AREA)
    expect(opened[0]!.query).toEqual({
      spell: 'starfall',
      scale: '1',
      x: '1856',
      feet: '1040',
      starts: String(Date.now()),
      accent: '#9333EA',
    })
    expect(effects.running).toBe('starfall')
  })

  it('closes it once the spell is over', () => {
    effects.start('starfall', standing)
    vi.advanceTimersByTime(SPELL_EFFECT_MS.starfall - 10)
    expect(opened[0]!.closed).toBe(false)
    vi.advanceTimersByTime(20)
    expect(opened[0]!.closed).toBe(true)
    expect(effects.running).toBe(null)
  })

  it('shows one spell at a time', () => {
    effects.start('starfall', standing)
    effects.start('explosion', standing)
    expect(opened[0]!.closed).toBe(true)
    expect(effects.running).toBe('explosion')
  })

  it('knows when the explosion is still at its chant, so stopping it then calls it off', () => {
    expect(effects.chanting).toBe(false)
    effects.start('explosion', standing)
    expect(effects.chanting).toBe(true)
    vi.advanceTimersByTime(EXPLOSION.chantMs - CHANT_SLACK_MS - 10)
    expect(effects.chanting).toBe(true)
    // At the chant's end (when her pose changes back), the bang goes ahead.
    vi.advanceTimersByTime(CHANT_SLACK_MS)
    expect(effects.chanting).toBe(false)
    expect(effects.running).toBe('explosion')
    vi.advanceTimersByTime(EXPLOSION.boomMs + 20)
    expect(effects.running).toBe(null)
  })
})
