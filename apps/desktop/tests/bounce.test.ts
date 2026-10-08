import { describe, expect, it } from 'vitest'
import {
  BOUNCE_SPEED,
  glideDuration,
  glidePosition,
  launch,
  step,
  type Motion,
} from '../src/main/bubble/bounce'

const box = { minX: 0, minY: 0, maxX: 1000, maxY: 500 }

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
    const next = step({ x: 500, y: 250, vx: 100, vy: -50 }, 100, box)
    expect(next).toEqual({ x: 510, y: 245, vx: 100, vy: -50 })
  })

  it('bounces off the left and top edges', () => {
    const next = step({ x: 5, y: 2, vx: -100, vy: -100 }, 100, box)
    expect(next.x).toBeCloseTo(5) // overshot to -5, reflected to +5
    expect(next.y).toBeCloseTo(8)
    expect(next.vx).toBe(100)
    expect(next.vy).toBe(100)
  })

  it('bounces off the right and bottom edges', () => {
    const next = step({ x: 995, y: 498, vx: 100, vy: 100 }, 100, box)
    expect(next.x).toBeCloseTo(995)
    expect(next.y).toBeCloseTo(492)
    expect(next.vx).toBe(-100)
    expect(next.vy).toBe(-100)
  })

  it('treats a long pause (sleep, a busy main thread) as a single short step', () => {
    const next = step({ x: 500, y: 250, vx: 100, vy: 0 }, 60_000, box)
    expect(next.x).toBe(510)
  })

  it('never leaves the box', () => {
    let seed = 42
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    let motion = launch({ x: 944, y: 444 }, random, 'bottom-right', 2000)
    for (let i = 0; i < 5000; i++) {
      motion = step(motion, 16 + random() * 40, box)
      expect(motion.x).toBeGreaterThanOrEqual(box.minX)
      expect(motion.x).toBeLessThanOrEqual(box.maxX)
      expect(motion.y).toBeGreaterThanOrEqual(box.minY)
      expect(motion.y).toBeLessThanOrEqual(box.maxY)
    }
  })

  it('pins the bubble when the area is too small to move in', () => {
    const tiny = { minX: 10, minY: 10, maxX: 10, maxY: 10 }
    expect(step({ x: 10, y: 10, vx: 100, vy: 100 }, 16, tiny)).toMatchObject({ x: 10, y: 10 })
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
