import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Rect } from '@shared/geometry'
import { Clones, robeQuery } from '../src/main/bubble/clones'
import { ScreenSaver } from '../src/main/screenSaver'
import { HEX_COLOR, hueOf, hueToHex, ROBE_SWATCHES } from '../src/renderer/src/lib/robeColors'

const css = readFileSync(resolve(__dirname, '../src/renderer/src/components/character.css'), 'utf8')
/** A class's rule in character.css. */
const rule = (className: string) => new RegExp(`\\.${className} \\{([^}]*)\\}`).exec(css)?.[1] ?? ''

describe('her robe colour', () => {
  afterEach(() => vi.useRealTimers())

  it('colours her robe and hat (the hat darker) from the chosen colour, the company’s without one', () => {
    for (const part of [
      'robe-line',
      'robe-shade',
      'robe',
      'robe-light',
      'hat',
      'hat-shade',
      'hat-light',
    ]) {
      expect(rule(`px-${part}`), part).toContain('var(--color-robe, var(--color-accent))')
    }
    // The hat: mixed with a dark colour, so a darker shade of whatever the robe is.
    expect(rule('px-hat')).toMatch(
      /color-mix\(in oklab, var\(--color-robe, var\(--color-accent\)\) 55%, #1a1433\)/,
    )
    // Her trim, gold and the rest don't change with it.
    for (const part of ['trim', 'gold', 'gem', 'hair', 'skin', 'boot']) {
      expect(rule(`px-${part}`), part).not.toContain('--color-robe')
    }
  })

  it('offers ready-made colours, all different and all proper colours', () => {
    expect(ROBE_SWATCHES.length).toBeGreaterThanOrEqual(6)
    expect(new Set(ROBE_SWATCHES.map((s) => s.color)).size).toBe(ROBE_SWATCHES.length)
    for (const swatch of ROBE_SWATCHES) expect(swatch.color).toMatch(HEX_COLOR)
  })

  it('turns the slider’s hue into a colour, and a colour back into its hue', () => {
    expect(hueToHex(0)).toBe('#d02525')
    expect(hueToHex(120)).toBe('#25d025')
    expect(hueToHex(240)).toBe('#2525d0')
    expect(hueToHex(360)).toBe(hueToHex(0))
    for (let hue = 0; hue < 360; hue += 15) {
      expect(hueToHex(hue)).toMatch(HEX_COLOR)
      expect(Math.abs(hueOf(hueToHex(hue)) - hue)).toBeLessThanOrEqual(1)
    }
    expect(hueOf('#808080')).toBe(0)
    expect(hueOf('nonsense')).toBe(0)
  })

  it('tells her clones and the screen saver the chosen colour, and nothing without one', () => {
    expect(robeQuery('#2563eb')).toEqual({ robe: '#2563eb' })
    expect(robeQuery(null)).toEqual({})
    vi.useFakeTimers()
    let robe: string | null = '#0d9488'
    const queries: Record<string, string>[] = []
    const clones = new Clones({
      accentColor: '#9333ea',
      robeColor: () => robe,
      open: (_bounds: Rect, query) => {
        queries.push(query)
        return { close: () => {} }
      },
    })
    const standing = {
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      bounds: { x: 1808, y: 936, width: 96, height: 104 },
      scale: 1,
    }
    clones.start(standing)
    expect(queries[0]).toMatchObject({ accent: '#9333ea', robe: '#0d9488' })
    robe = null
    clones.start(standing)
    expect(queries[1]).not.toHaveProperty('robe')
    clones.stop()

    robe = '#b91c1c'
    const saver = new ScreenSaver({
      accentColor: '#9333ea',
      robeColor: () => robe,
      displays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }],
      herDisplay: () => 1,
      open: (_bounds, query) => {
        queries.push(query)
        return { id: 1, end: () => {}, close: () => {} }
      },
      onStart: () => {},
      onEnd: () => {},
    })
    saver.start()
    expect(queries[2]).toMatchObject({ scene: 'sunset', robe: '#b91c1c' })
    saver.dispose()
  })
})
