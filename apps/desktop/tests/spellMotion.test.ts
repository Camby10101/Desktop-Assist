import { describe, expect, it } from 'vitest'
import { EXPLOSION, STARFALL } from '@shared/spells'
import { blastAt, noise, pillarCircles, seeded, starsAt } from '../src/renderer/src/lib/spellMotion'

describe('the spells’ pixel art', () => {
  it('draws the same random things every frame', () => {
    const a = seeded(5)
    const b = seeded(5)
    for (let i = 0; i < 20; i++) expect(a()).toBe(b())
    for (let i = 0; i < 200; i++) {
      const n = noise(i * 0.37, i * 0.73)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThanOrEqual(1)
    }
  })

  it('has shooting stars falling down to the left all through starfall, and none after', () => {
    const [w, h] = [960, 520]
    for (const t of [1500, 3000, 6000, 8000]) {
      const stars = starsAt(t, w, h)
      expect(stars.length).toBeGreaterThan(2)
      for (const star of stars) {
        expect(star.dx).toBeLessThan(0)
        expect(star.dy).toBeGreaterThan(0)
        expect(star.age).toBeLessThanOrEqual(star.life)
      }
    }
    expect(starsAt(STARFALL.durationMs + 100, w, h)).toEqual([])
  })

  it('stacks the pillar’s magic circles above her hat, on the screen, one after another', () => {
    const scene = { w: 960, h: 520, x: 480, feet: 520, height: 46 }
    const circles = pillarCircles(scene)
    expect(circles).toHaveLength(EXPLOSION.circles)
    circles.forEach((circle, i) => {
      expect(circle.cy + circle.ry).toBeLessThan(scene.feet - scene.height) // above her hat
      expect(circle.cy - circle.ry).toBeGreaterThan(0)
      expect(circle.cx).toBe(scene.x)
      if (i > 0) {
        expect(circle.cy).toBeLessThan(circles[i - 1]!.cy) // each above the last
        expect(circle.born).toBeGreaterThan(circles[i - 1]!.born) // and after it
      }
    })
    expect(circles.at(-1)!.born).toBeLessThan(EXPLOSION.chantMs * 0.7)
    // With her right in a corner, the pillar moves in a little, so most of it is on the screen.
    const cornered = pillarCircles({ ...scene, x: 955 })
    for (const circle of cornered) expect(circle.cx + circle.rx * 0.8).toBeLessThanOrEqual(960)
  })

  it('bursts the explosion out fast, then lets it grow slowly as it cools', () => {
    const at = (b: number) => blastAt(b, 960, 520)
    expect(at(0).fire).toBe(0)
    expect(at(650).fire).toBeGreaterThan(at(100).fire)
    expect(at(EXPLOSION.boomMs).fire).toBeGreaterThan(at(650).fire)
    expect(at(EXPLOSION.boomMs).fire).toBeLessThan(at(650).fire * 1.3)
    expect(at(1000).shock).toBeGreaterThan(at(650).fire * 2)
  })
})
