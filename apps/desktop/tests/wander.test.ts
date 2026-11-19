import { describe, expect, it } from 'vitest'
import { FIDGETS } from '@shared/character'
import {
  FIDGET_WEIGHT,
  WANDER,
  activityDelay,
  fallDuration,
  fallPosition,
  FLING,
  flightStep,
  impactSpeed,
  isHardLanding,
  releaseVelocity,
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
  it('leaves her hat trick out while her hat’s off (No hat), and only that', () => {
    const picked = (hat: boolean) => {
      const poses = new Set<string>()
      for (let i = 0; i < 400; i++) {
        const next = nextActivity(alone, 0, 240, rolls(0.1, (i + 0.5) / 400), undefined, {
          walk: true,
          fidget: true,
          hat,
        })
        if (next.kind === 'fidget') poses.add(next.pose)
      }
      return poses
    }
    expect(picked(true)).toContain('hat')
    expect(picked(false)).not.toContain('hat')
    expect(picked(false).size).toBe(picked(true).size - 1)
  })

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

describe('throwing her', () => {
  it('measures how fast the pointer was going as she was let go, over the last moment only', () => {
    const samples = [
      { t: 0, x: 0, y: 0 },
      { t: 900, x: 0, y: 0 },
      { t: 950, x: 50, y: 0 },
      { t: 1000, x: 100, y: -50 },
    ]
    expect(releaseVelocity(samples, 1000)).toEqual({ x: 1000, y: -500 })
    // Held still for the last moment: still.
    const held = [...samples, { t: 1100, x: 100, y: -50 }, { t: 1200, x: 100, y: -50 }]
    expect(releaseVelocity(held, 1200)).toEqual({ x: 0, y: 0 })
    // Too little to tell, and never faster than the most.
    expect(releaseVelocity([{ t: 0, x: 0, y: 0 }], 0)).toEqual({ x: 0, y: 0 })
    const flick = releaseVelocity(
      [
        { t: 0, x: 0, y: 0 },
        { t: 50, x: 5000, y: 0 },
      ],
      50,
    )
    expect(Math.hypot(flick.x, flick.y)).toBeCloseTo(FLING.maxSpeed)
  })

  it('flies under gravity, turned back by the sides and top, and lands on the floor', () => {
    const room = { minX: 0, maxX: 1000, minY: 0, floor: 900 }
    let flight = { x: 500, y: 500, vx: 600, vy: -800 }
    const first = flightStep(flight, 16, room)
    expect(first.flight.vy).toBeGreaterThan(flight.vy) // gravity
    expect(first.flight.x).toBeGreaterThan(flight.x)
    expect(first.landed).toBe(false)
    // Into the right-hand side: back the other way, slower.
    const side = flightStep({ x: 995, y: 500, vx: 1000, vy: 0 }, 16, room)
    expect(side.flight.x).toBe(1000)
    expect(side.flight.vx).toBeCloseTo(-1000 * FLING.bounce)
    // Into the top: back down.
    const top = flightStep({ x: 500, y: 2, vx: 0, vy: -1000 }, 16, room)
    expect(top.flight.y).toBe(0)
    expect(top.flight.vy).toBeGreaterThan(0)
    // On and on until it lands, never outside the room.
    let landed = false
    for (let i = 0; i < 500 && !landed; i++) {
      const step = flightStep(flight, 16, room)
      flight = step.flight
      landed = step.landed
      expect(flight.x).toBeGreaterThanOrEqual(0)
      expect(flight.x).toBeLessThanOrEqual(1000)
      if (landed) {
        expect(flight.y).toBe(900)
        expect(step.impact).toBeGreaterThan(0)
      }
    }
    expect(landed).toBe(true)
  })

  it('counts a long fall as a hard landing, and a short one as soft', () => {
    expect(impactSpeed(0)).toBe(0)
    expect(impactSpeed(100)).toBeCloseTo(Math.sqrt(2 * WANDER.gravity * 100))
    expect(isHardLanding(impactSpeed(100))).toBe(false)
    expect(isHardLanding(impactSpeed(500))).toBe(true)
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
