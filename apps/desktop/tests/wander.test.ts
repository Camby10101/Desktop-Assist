import { describe, expect, it } from 'vitest'
import { FIDGETS } from '@shared/character'
import {
  FIDGET_WEIGHT,
  WANDER,
  activityDelay,
  fallDuration,
  fallPosition,
  nextActivity,
  walkStep,
  walkTarget,
} from '../src/main/bubble/wander'

const rolls = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]!
}

describe('activityDelay', () => {
  it('waits a few seconds after settling, and longer between things after that', () => {
    expect(activityDelay(() => 0, true)).toBe(WANDER.firstDelay[0])
    expect(activityDelay(() => 1, true)).toBe(WANDER.firstDelay[1])
    expect(activityDelay(() => 0, false)).toBe(WANDER.delay[0])
    expect(activityDelay(() => 0.5, false)).toBe((WANDER.delay[0] + WANDER.delay[1]) / 2)
  })
})

describe('nextActivity', () => {
  it('only strolls about until it has been left alone a while', () => {
    for (const roll of [0, 0.2, 0.5, 0.9]) {
      expect(nextActivity(WANDER.fidgetAfter - 1, 0, 240, rolls(roll, 0.5)).kind).toBe('walk')
    }
  })

  it('after that, more often than not does one of her fidgets instead', () => {
    const alone = WANDER.fidgetAfter
    expect(nextActivity(alone, 0, 240, rolls(0.1, 0))).toEqual({ kind: 'fidget', pose: 'hop' })
    expect(nextActivity(alone, 0, 240, rolls(0.1, 0.99))).toEqual({ kind: 'fidget', pose: 'dance' })
    expect(nextActivity(alone, 0, 240, rolls(0.8, 0.5)).kind).toBe('walk')
  })

  it('rarely has the vision: about a fifth as often as any other fidget', () => {
    const alone = WANDER.fidgetAfter
    const counts = new Map<string, number>()
    const steps = 10_000
    for (let i = 0; i < steps; i++) {
      const next = nextActivity(alone, 0, 240, rolls(0.1, (i + 0.5) / steps))
      if (next.kind === 'fidget') counts.set(next.pose, (counts.get(next.pose) ?? 0) + 1)
    }
    const vision = counts.get('vision')!
    expect(vision / steps).toBeCloseTo(FIDGET_WEIGHT.vision! / (FIDGETS.length - 1 + 0.2), 2)
    expect(vision * 4).toBeLessThan(counts.get('hop')!)
  })

  it('never does the same fidget twice in a row', () => {
    const alone = WANDER.fidgetAfter
    for (const last of FIDGETS) {
      for (let roll = 0; roll < 1; roll += 0.05) {
        const next = nextActivity(alone, 0, 240, rolls(0.1, roll), last)
        expect(next.kind === 'fidget' && next.pose).not.toBe(last)
        expect(next.kind).toBe('fidget')
      }
    }
  })
})

describe('nextActivity, as Settings allow', () => {
  const alone = WANDER.fidgetAfter
  it('rests instead of walking when she’s to stand still, still fidgeting once left alone', () => {
    const still = { walk: false, fidget: true }
    expect(nextActivity(alone - 1, 0, 240, rolls(0.1, 0.5), undefined, still)).toEqual({
      kind: 'rest',
    })
    expect(nextActivity(alone, 0, 240, rolls(0.8, 0.5), undefined, still)).toEqual({ kind: 'rest' })
    expect(nextActivity(alone, 0, 240, rolls(0.1, 0), undefined, still)).toEqual({
      kind: 'fidget',
      pose: 'hop',
    })
  })

  it('only ever walks without her idle animations, and does nothing with neither', () => {
    for (const roll of [0, 0.1, 0.5, 0.9]) {
      const busy = nextActivity(alone * 2, 0, 240, rolls(roll, 0.5), undefined, {
        walk: true,
        fidget: false,
      })
      expect(busy.kind).toBe('walk')
      const neither = nextActivity(alone * 2, 0, 240, rolls(roll, 0.5), undefined, {
        walk: false,
        fidget: false,
      })
      expect(neither).toEqual({ kind: 'rest' })
    }
  })
})

describe('walkTarget', () => {
  it('picks somewhere else in the zone, far enough away to be worth the walk', () => {
    for (let roll = 0; roll <= 1; roll += 0.05) {
      for (const inset of [0, 60, 120, 200, 240]) {
        const to = walkTarget(inset, 240, roll)
        expect(to).toBeGreaterThanOrEqual(0)
        expect(to).toBeLessThanOrEqual(240)
        expect(Math.abs(to - inset)).toBeGreaterThanOrEqual(WANDER.minWalk - 1e-9)
      }
    }
  })

  it('goes either way: toward its corner or away from it', () => {
    expect(walkTarget(120, 240, 0)).toBe(0)
    expect(walkTarget(120, 240, 1)).toBe(240)
  })

  it('comes back into the zone from beyond it', () => {
    expect(walkTarget(600, 240, 0.5)).toBeLessThanOrEqual(240)
  })

  it('walks to the far end of a zone too small to choose from', () => {
    expect(walkTarget(0, 30, 0.5)).toBe(30)
    expect(walkTarget(30, 30, 0.5)).toBe(0)
  })
})

describe('walkStep', () => {
  it('moves at walking speed, never past where it is going', () => {
    expect(walkStep(0, 100, 500)).toBe(WANDER.walkSpeed * 0.1) // a long gap counts as 100 ms
    expect(walkStep(0, 100, 50)).toBeCloseTo(WANDER.walkSpeed * 0.05)
    expect(walkStep(100, 0, 50)).toBeCloseTo(100 - WANDER.walkSpeed * 0.05)
    expect(walkStep(99, 100, 50)).toBe(100)
    expect(walkStep(1, 0, 50)).toBe(0)
  })
})

describe('falling', () => {
  const from = { x: 500, y: 100 }
  const to = { x: 520, y: 900 }

  it('takes as long as gravity takes to drop that far', () => {
    expect(fallDuration(from, to)).toBeCloseTo(Math.sqrt((2 * 800) / WANDER.gravity) * 1000)
    expect(fallDuration({ x: 0, y: 895 }, { x: 0, y: 900 })).toBe(150) // a short drop, still seen
    expect(fallDuration({ x: 0, y: 950 }, to)).toBe(200) // dropped over the taskbar: a hop up
  })

  it('speeds up as it falls, landing exactly where it stands', () => {
    expect(fallPosition(from, to, 0)).toEqual(from)
    expect(fallPosition(from, to, 1)).toEqual(to)
    const half = fallPosition(from, to, 0.5)
    expect(half.y).toBeLessThan(500) // a quarter of the way down at half the time
    expect(half.x).toBe(510)
  })
})
