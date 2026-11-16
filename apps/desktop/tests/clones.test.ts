import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLONES, FIDGET_MS } from '@shared/character'
import { BUBBLE_BOX, type Rect } from '@shared/geometry'
import { Clones } from '../src/main/bubble/clones'
import {
  CLONE_WALK,
  clonePose,
  spawnClones,
  stepClone,
  walkTarget,
  type Clone,
  type Room,
} from '../src/renderer/src/lib/clones'

const WORK_AREA: Rect = { x: 0, y: 0, width: 1920, height: 1040 }

describe('Clones (the main process)', () => {
  let opened: { bounds: Rect; query: Record<string, string>; closed: boolean }[]
  let clones: Clones

  beforeEach(() => {
    vi.useFakeTimers()
    opened = []
    clones = new Clones({
      accentColor: '#9333ea',
      now: () => 1_000_000,
      open: (bounds, query) => {
        const window = { bounds, query, closed: false }
        opened.push(window)
        return { close: () => void (window.closed = true) }
      },
    })
  })

  afterEach(() => {
    clones.stop()
    vi.useRealTimers()
  })

  const standing = (x: number, scale = 1) => ({
    workArea: WORK_AREA,
    bounds: {
      x,
      y: 1040 - BUBBLE_BOX * scale,
      width: BUBBLE_BOX * scale,
      height: BUBBLE_BOX * scale,
    },
    scale,
  })

  it('opens one window along the taskbar, telling it where she stands, her size and colour', () => {
    clones.start(standing(1808, 2))
    expect(opened).toHaveLength(1)
    expect(opened[0]!.bounds).toEqual({
      x: 0,
      y: 1040 - BUBBLE_BOX * 2,
      width: 1920,
      height: BUBBLE_BOX * 2,
    })
    expect(opened[0]!.query).toEqual({
      from: '1808',
      scale: '2',
      accent: '#9333ea',
      ends: String(1_000_000 + CLONES.durationMs),
    })
    expect(clones.running).toBe(true)
  })

  it('closes the window once their time is up', () => {
    clones.start(standing(1808))
    vi.advanceTimersByTime(CLONES.durationMs - 1)
    expect(opened[0]!.closed).toBe(false)
    vi.advanceTimersByTime(1)
    expect(opened[0]!.closed).toBe(true)
    expect(clones.running).toBe(false)
  })

  it('starts a new lot when asked again, closing the old one', () => {
    clones.start(standing(1808))
    vi.advanceTimersByTime(4000)
    clones.start(standing(1000))
    expect(opened[0]!.closed).toBe(true)
    expect(opened[1]!.closed).toBe(false)
    vi.advanceTimersByTime(CLONES.durationMs - 1)
    expect(opened[1]!.closed).toBe(false) // a full thirty seconds from the second start
    vi.advanceTimersByTime(1)
    expect(opened[1]!.closed).toBe(true)
  })

  it('makes ten of her for thirty seconds', () => {
    expect(CLONES.count).toBe(10)
    expect(CLONES.durationMs).toBe(30_000)
  })
})

describe('how the clones wander (the page)', () => {
  const room: Room = { width: 1920, box: BUBBLE_BOX, scale: 1 }
  /** A random number generator that goes round a fixed list. */
  const rolls = (...values: number[]) => {
    let i = 0
    return () => values[i++ % values.length]!
  }

  it('starts them all where she stands, setting off one after another', () => {
    const clones = spawnClones(10, 1808, 0, room, rolls(0.5))
    expect(clones).toHaveLength(10)
    for (const clone of clones) {
      expect(clone.x).toBe(1808)
      expect(clone.walking).toBe(false)
      expect(clonePose(clone)).toBe('idle')
    }
    const starts = clones.map((clone) => clone.waitUntil)
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
    expect(new Set(starts).size).toBe(10)
  })

  it('keeps them inside the window', () => {
    const clones = spawnClones(3, 5000, 0, room, rolls(0.5))
    expect(clones[0]!.x).toBe(1920 - BUBBLE_BOX)
  })

  it('walks somewhere at least a little way off, then stops there a while', () => {
    let clone: Clone = spawnClones(1, 1000, 0, room, rolls(0.5))[0]!
    clone = stepClone(clone, clone.waitUntil, 16, room, rolls(0.9, 0.5))
    expect(clone.walking).toBe(true)
    expect(Math.abs(clone.target - 1000)).toBeGreaterThanOrEqual(CLONE_WALK.minWalk)
    expect(clonePose(clone)).toBe(clone.target > 1000 ? 'walk-right' : 'walk-left')
    let now = clone.waitUntil
    for (let i = 0; i < 10_000 && clone.walking; i++) {
      now += 16
      clone = stepClone(clone, now, 16, room, rolls(0.5))
      expect(clone.x).toBeGreaterThanOrEqual(0)
      expect(clone.x).toBeLessThanOrEqual(1920 - BUBBLE_BOX)
    }
    expect(clone.walking).toBe(false)
    expect(clone.x).toBe(clone.target)
    const [shortest, longest] = CLONE_WALK.pause
    expect(clone.waitUntil - now).toBeGreaterThanOrEqual(shortest)
    expect(clone.waitUntil - now).toBeLessThanOrEqual(longest)
    // It waits out its stop before going again.
    expect(stepClone(clone, now + 10, 16, room, rolls(0.5))).toBe(clone)
  })

  it('now and then waves when it stops, for as long as her wave takes, then walks on', () => {
    let clone: Clone = { ...spawnClones(1, 1000, 0, room, rolls(0.5))[0]!, waitUntil: 0 }
    clone = stepClone(clone, 0, 16, room, rolls(0.9, 0.5))
    expect(clone.walking).toBe(true)
    let now = 0
    // A low roll as it arrives: it waves.
    while (clone.walking) {
      now += 16
      clone = stepClone(clone, now, 16, room, rolls(0.1))
    }
    expect(clone.waving).toBe(true)
    expect(clonePose(clone)).toBe('wave')
    expect(clone.waitUntil - now).toBe(FIDGET_MS.wave)
    // Setting off again, it stops waving.
    clone = stepClone(clone, clone.waitUntil, 16, room, rolls(0.9, 0.5))
    expect(clone.waving).toBe(false)
    expect(clone.walking).toBe(true)
    expect(CLONE_WALK.waveChance).toBeGreaterThan(0)
    expect(CLONE_WALK.waveChance).toBeLessThan(0.5)
  })

  it('walks at about her speed for her size, each clone a little differently', () => {
    const big: Room = { width: 1920, box: BUBBLE_BOX * 2, scale: 2 }
    const clone = spawnClones(1, 0, 0, big, rolls(0.5))[0]!
    const slow = stepClone(clone, clone.waitUntil, 16, big, rolls(0.9, 0))
    const fast = stepClone(clone, clone.waitUntil, 16, big, rolls(0.9, 1))
    expect(slow.speed).toBeCloseTo(CLONE_WALK.speed * 2 * (1 - CLONE_WALK.speedSpread))
    expect(fast.speed).toBeCloseTo(CLONE_WALK.speed * 2 * (1 + CLONE_WALK.speedSpread))
  })

  it('picks places either side, far enough away', () => {
    expect(walkTarget(1000, room, 0)).toBe(0)
    expect(walkTarget(1000, room, 0.999)).toBeGreaterThan(1920 - BUBBLE_BOX - 5)
    for (let roll = 0; roll < 1; roll += 0.01) {
      expect(Math.abs(walkTarget(1000, room, roll) - 1000)).toBeGreaterThanOrEqual(60)
    }
    // A window too narrow to walk in: it stays put.
    expect(walkTarget(0, { width: BUBBLE_BOX, box: BUBBLE_BOX, scale: 1 }, 0.5)).toBe(0)
  })
})
