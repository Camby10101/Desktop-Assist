import { describe, expect, it } from 'vitest'
import { UI } from '@shared/geometry'
import {
  BOUNCE_SPEED,
  glideDuration,
  glidePosition,
  launch,
  step,
  type Motion,
} from '../src/main/bubble/bounce'

const box = { minX: 0, minY: 0, maxX: 1000, maxY: 500 }
/** The work area where the bubble's top-left corner can be anywhere in `box`. */
const area = [{ x: 0, y: 0, width: 1000 + UI.bubbleSize, height: 500 + UI.bubbleSize }]

describe('launch', () => {
  it('heads up and to the left at the bounce speed', () => {
    const motion = launch({ x: 900, y: 400 }, () => 0.5)
    expect(motion.vx).toBeLessThan(0)
    expect(motion.vy).toBeLessThan(0)
    expect(Math.hypot(motion.vx, motion.vy)).toBeCloseTo(BOUNCE_SPEED)
  })

  it('heads away from whichever corner the bubble is in', () => {
    const tl = launch({ x: 0, y: 0 }, () => 0.5, 'top-left')
    const tr = launch({ x: 0, y: 0 }, () => 0.5, 'top-right')
    const bl = launch({ x: 0, y: 0 }, () => 0.5, 'bottom-left')
    expect([Math.sign(tl.vx), Math.sign(tl.vy)]).toEqual([1, 1])
    expect([Math.sign(tr.vx), Math.sign(tr.vy)]).toEqual([-1, 1])
    expect([Math.sign(bl.vx), Math.sign(bl.vy)]).toEqual([1, -1])
  })

  it('picks an angle between 25° and 65°', () => {
    const angle = (m: Motion) => (Math.atan2(-m.vy, -m.vx) * 180) / Math.PI
    expect(angle(launch({ x: 0, y: 0 }, () => 0))).toBeCloseTo(25)
    expect(angle(launch({ x: 0, y: 0 }, () => 1))).toBeCloseTo(65)
  })
})

describe('step', () => {
  it('moves by velocity × time', () => {
    const next = step({ x: 500, y: 250, vx: 100, vy: -50 }, 100, area)
    expect(next).toEqual({ x: 510, y: 245, vx: 100, vy: -50 })
  })

  it('bounces off the left and top edges', () => {
    const next = step({ x: 5, y: 2, vx: -100, vy: -100 }, 100, area)
    expect(next.x).toBeCloseTo(5) // overshot to -5, reflected to +5
    expect(next.y).toBeCloseTo(8)
    expect(next.vx).toBe(100)
    expect(next.vy).toBe(100)
  })

  it('bounces off the right and bottom edges', () => {
    const next = step({ x: 995, y: 498, vx: 100, vy: 100 }, 100, area)
    expect(next.x).toBeCloseTo(995)
    expect(next.y).toBeCloseTo(492)
    expect(next.vx).toBe(-100)
    expect(next.vy).toBe(-100)
  })

  it('treats a long pause (sleep, a busy main thread) as a single short step', () => {
    const next = step({ x: 500, y: 250, vx: 100, vy: 0 }, 60_000, area)
    expect(next.x).toBe(510)
  })

  it('never leaves the box', () => {
    let seed = 42
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    let motion = launch({ x: 944, y: 444 }, random, 'bottom-right', 2000)
    for (let i = 0; i < 5000; i++) {
      motion = step(motion, 16 + random() * 40, area)
      expect(motion.x).toBeGreaterThanOrEqual(box.minX)
      expect(motion.x).toBeLessThanOrEqual(box.maxX)
      expect(motion.y).toBeGreaterThanOrEqual(box.minY)
      expect(motion.y).toBeLessThanOrEqual(box.maxY)
    }
  })

  it('pins the bubble when the area is just big enough for it', () => {
    const tiny = [{ x: 10, y: 10, width: UI.bubbleSize, height: UI.bubbleSize }]
    expect(step({ x: 10, y: 10, vx: 100, vy: 100 }, 16, tiny)).toMatchObject({ x: 10, y: 10 })
  })

  // Two monitors side by side: a 1920×1040 main one, and a shorter one to its right.
  const twoScreens = [
    { x: 0, y: 0, width: 1920, height: 1040 },
    { x: 1920, y: 0, width: 1280, height: 600 },
  ]

  it('crosses onto the next display where they meet', () => {
    const next = step({ x: 1900, y: 100, vx: 280, vy: 0 }, 100, twoScreens)
    expect(next.x).toBeCloseTo(1928)
    expect(next.vx).toBe(280)
  })

  it("bounces off the part of the edge the other display doesn't reach", () => {
    const next = step({ x: 1860, y: 800, vx: 280, vy: 0 }, 100, twoScreens)
    expect(next.x).toBeCloseTo(1864 - 24) // wall at 1920 - 56 = 1864: 28 forward, 24 past it, back
    expect(next.vx).toBe(-280)
  })

  it('bounces off the bottom of the shorter display', () => {
    const next = step({ x: 2500, y: 540, vx: 0, vy: 100 }, 100, twoScreens)
    expect(next.y).toBeCloseTo(544 - 6) // wall at 600 - 56
    expect(next.vy).toBe(-100)
  })

  it('roams over both displays and never leaves them', () => {
    let seed = 7
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    let motion = launch({ x: 1848, y: 968 }, random, 'bottom-right', 2000)
    let visitedSecond = false
    for (let i = 0; i < 20_000; i++) {
      motion = step(motion, 16 + random() * 40, twoScreens)
      const on = (a: (typeof twoScreens)[number], px: number, py: number) =>
        px >= a.x && px <= a.x + a.width && py >= a.y && py <= a.y + a.height
      for (const [px, py] of [
        [motion.x, motion.y],
        [motion.x + UI.bubbleSize, motion.y + UI.bubbleSize],
        [motion.x + UI.bubbleSize, motion.y],
        [motion.x, motion.y + UI.bubbleSize],
      ] as const) {
        expect(twoScreens.some((a) => on(a, px, py))).toBe(true)
      }
      if (motion.x > 1920) visitedSecond = true
    }
    expect(visitedSecond).toBe(true)
  })

  it('moves back on screen if its display went away mid-bounce', () => {
    const next = step({ x: 2500, y: 100, vx: 0, vy: 0 }, 16, [twoScreens[0]!])
    expect(next).toMatchObject({ x: 1920 - UI.bubbleSize, y: 100 })
  })
})

describe('glide home', () => {
  it('takes between 0.3 s and 0.9 s depending on distance', () => {
    expect(glideDuration({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(300)
    expect(glideDuration({ x: 0, y: 0 }, { x: 900, y: 0 })).toBe(600)
    expect(glideDuration({ x: 0, y: 0 }, { x: 5000, y: 0 })).toBe(900)
  })

  it('starts at the bubble, ends at home and eases out', () => {
    const from = { x: 0, y: 0 }
    const to = { x: 100, y: 200 }
    expect(glidePosition(from, to, 0)).toEqual(from)
    expect(glidePosition(from, to, 1)).toEqual(to)
    expect(glidePosition(from, to, 2)).toEqual(to)
    expect(glidePosition(from, to, 0.5).x).toBeGreaterThan(50)
  })
})
