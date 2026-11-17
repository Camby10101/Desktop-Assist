import { describe, expect, it } from 'vitest'
import {
  BLIZZARD,
  BUTTERFLIES,
  FIREWORKS,
  PHOENIX,
  SPELL_EFFECT_MS,
  THUNDERSTORM,
  VORTEX,
} from '@shared/spells'
import type { Painter } from '../src/renderer/src/lib/pixels'
import type { Scene } from '../src/renderer/src/lib/spellMotion'
import { drawBlizzard, drift, frostReach, strength } from '../src/renderer/src/lib/spells/blizzard'
import { drawButterflies, flier } from '../src/renderer/src/lib/spells/butterflies'
import { drawFireworks, rockets } from '../src/renderer/src/lib/spells/fireworks'
import { drawPhoenix, flightAt, phoenixPath } from '../src/renderer/src/lib/spells/phoenix'
import { bolts, cloudDepth, drawThunderstorm } from '../src/renderer/src/lib/spells/thunderstorm'
import { drawVortex, portalRadius } from '../src/renderer/src/lib/spells/vortex'

// A 1920 × 1040 work area, in the effects' pixels (2 DIPs each), with her in the right-hand corner.
const [W, H] = [960, 520]
const scene = (t: number, still = false): Scene => ({
  t,
  w: W,
  h: H,
  x: 900,
  feet: 520,
  height: 46,
  accent: '#9333ea',
  still,
})

/** A Painter that counts what's drawn (anything at all, and anything on the screen). */
function counter() {
  const drawn = { any: 0, onScreen: 0 }
  const painter: Painter = {
    rect(x, y, width, height, _colour, alpha) {
      if (alpha <= 0.01) return
      drawn.any++
      if (x + width > 0 && y + height > 0 && x < W && y < H) drawn.onScreen++
    },
  }
  return { drawn, painter }
}

const DRAW = {
  fireworks: drawFireworks,
  thunderstorm: drawThunderstorm,
  blizzard: drawBlizzard,
  vortex: drawVortex,
  butterflies: drawButterflies,
  phoenix: drawPhoenix,
}

describe('the newer spells', () => {
  it('each draws plenty on the screen part way through, still or moving, and nothing once it’s over', () => {
    for (const [spell, draw] of Object.entries(DRAW)) {
      const length = SPELL_EFFECT_MS[spell as keyof typeof DRAW]
      for (const still of [false, true]) {
        const middle = counter()
        draw(middle.painter, scene(length * 0.45, still))
        expect(middle.drawn.onScreen, `${spell} at half way`).toBeGreaterThan(50)
      }
      const end = counter()
      draw(end.painter, scene(length))
      expect(end.drawn.any, `${spell} at its end`).toBe(0)
    }
  })

  it('launches fireworks from the bottom of the screen to burst over its top half, then a finale', () => {
    const show = rockets(W, H, 900)
    expect(show).toHaveLength(FIREWORKS.rockets)
    expect(show[0]!.x).toBe(900) // the first from beside her
    for (const rocket of show) {
      expect(rocket.burstY).toBeLessThan(H / 2)
      expect(rocket.burstX).toBeGreaterThan(0)
      expect(rocket.burstX).toBeLessThan(W)
      // Burst in time for its sparks to be seen before the end.
      expect(rocket.launch + rocket.rise).toBeLessThan(FIREWORKS.durationMs - 1000)
    }
    const finale = show.slice(-FIREWORKS.finale)
    for (const rocket of finale) expect(rocket.launch).toBeGreaterThanOrEqual(FIREWORKS.finaleAt)
  })

  it('brings in the storm clouds, and strikes down from them to the ground, once beside her', () => {
    expect(cloudDepth(0, H)).toBe(0)
    expect(cloudDepth(3000, H)).toBeGreaterThan(H * 0.2)
    expect(cloudDepth(THUNDERSTORM.durationMs, H)).toBe(0)
    const strikes = bolts(W, H, 900)
    expect(strikes).toHaveLength(THUNDERSTORM.strikes)
    for (const bolt of strikes) {
      expect(bolt.path[0]!.y).toBeLessThan(H * 0.25) // from the clouds
      expect(bolt.path.at(-1)!.y).toBe(H - 1) // to the ground
      expect(bolt.at).toBeLessThan(THUNDERSTORM.durationMs - 1300) // while the clouds are in
      for (const branch of bolt.branches) expect(branch.at(-1)!.y).toBeGreaterThan(branch[0]!.y)
    }
    expect(strikes.some((bolt) => Math.abs(bolt.path.at(-1)!.x - 900) < 15)).toBe(true)
  })

  it('builds the blizzard up and melts it away, frost creeping no further than a fifth of the screen', () => {
    expect(strength(0)).toBe(0)
    expect(strength(4000)).toBeCloseTo(1)
    expect(strength(BLIZZARD.durationMs)).toBe(0)
    for (let t = 0; t <= BLIZZARD.durationMs; t += 500) {
      expect(frostReach(t, W, H)).toBeLessThanOrEqual(H * 0.2)
    }
    expect(frostReach(5000, W, H)).toBeGreaterThan(H * 0.15)
    expect(drift(8000)).toBeGreaterThan(drift(1000)) // the wind keeps blowing one way
  })

  it('opens the vortex, holds it, collapses it to nothing and lets it go off', () => {
    expect(portalRadius(0, W, H)).toBe(0)
    const full = portalRadius(3000, W, H)
    expect(full).toBeGreaterThan(H * 0.25)
    expect(full).toBeLessThan(H * 0.32)
    expect(portalRadius(VORTEX.collapseAt + 300, W, H)).toBeLessThan(full)
    expect(portalRadius(VORTEX.implodeAt, W, H)).toBe(0)
  })

  it('lets the butterflies out of her one after another, flapping their way up and away', () => {
    const middle = { x: 900, y: 520 - 46 * 0.55 }
    for (let k = 0; k < BUTTERFLIES.count; k++) {
      expect(flier(k, 0, scene(0))).toBeNull()
      const first = flier(k, 3000, scene(3000))
      expect(first).not.toBeNull()
    }
    // Each starts at her middle and goes up.
    const one = flier(0, 600, scene(600))!
    expect(Math.hypot(one.x - middle.x, one.y - middle.y)).toBeLessThan(60)
    const later = flier(0, 5000, scene(5000))!
    expect(later.y).toBeLessThan(one.y)
    // ...flapping.
    const wings = new Set(
      Array.from({ length: 20 }, (_, i) => flier(0, 2000 + i * 40, scene(0))!.open),
    )
    expect(wings.size).toBe(2)
  })

  it('flies the phoenix out of her, round a loop and off the far side of the screen', () => {
    const path = phoenixPath(scene(0))
    expect(path[0]).toEqual({ x: 900, y: 520 - 46 * 0.6 })
    expect(path.at(-1)!.x).toBeLessThan(0) // she's on the right, so it leaves on the left
    expect(flightAt(0, scene(0))).toBeNull()
    expect(flightAt(PHOENIX.durationMs, scene(0))).toBeNull()
    const start = flightAt(320, scene(0))!
    expect(Math.hypot(start.x - 900, start.y - (520 - 46 * 0.6))).toBeLessThan(20)
    // On its loop it heads back the way it came for a while (the top of the loop).
    const headings = Array.from(
      { length: 60 },
      (_, i) => flightAt(300 + (i / 60) * PHOENIX.flightMs, scene(0))!.heading,
    )
    expect(headings.some((a) => Math.cos(a) > 0.5)).toBe(true)
    expect(headings.some((a) => Math.cos(a) < -0.5)).toBe(true)
  })
})
