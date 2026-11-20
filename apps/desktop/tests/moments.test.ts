import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FIDGET_MS,
  FIDGETS,
  HELD_POSES,
  inSeason,
  REACTION_MS,
  REACTIONS,
  TIMED,
} from '@shared/character'
import type { JiraFeed, JiraNotification, ServiceRequest } from '@shared/types'
import { hasNews } from '../src/main/atlassian/news'
import {
  nextActivity,
  PERFORMANCE_WEIGHT,
  pointerReaction,
  POINTER,
  WANDER,
} from '../src/main/bubble/wander'
import { gazeAt, Performances, WATCH_MS } from '../src/main/performances/performances'
import { draw } from '../src/renderer/src/character/rig'
import { animationLength, framesOf, gazeFrame, LOOPS } from '../src/renderer/src/character/sprite'

const rolls = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]!
}
const alone = WANDER.fidgetAfter
/** How often each habit comes up, over `steps` evenly spread rolls. */
function tally(options: Parameters<typeof nextActivity>[6], steps = 6000) {
  const counts = new Map<string, number>()
  for (let i = 0; i < steps; i++) {
    const next = nextActivity(
      alone,
      0,
      240,
      rolls(0.1, (i + 0.5) / steps),
      undefined,
      undefined,
      options,
    )
    const name =
      next.kind === 'fidget' ? next.pose : next.kind === 'perform' ? next.name : next.kind
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return counts
}

describe('her timed habits', () => {
  it('yawns only late at night, and has confetti only on Friday evenings', () => {
    expect(inSeason('yawn', new Date(2026, 10, 18, 23, 0))).toBe(true)
    expect(inSeason('yawn', new Date(2026, 10, 18, 5, 59))).toBe(true)
    expect(inSeason('yawn', new Date(2026, 10, 18, 6, 0))).toBe(false)
    expect(inSeason('yawn', new Date(2026, 10, 18, 21, 59))).toBe(false)
    const friday = (hour: number) => new Date(2026, 10, 20, hour, 0) // 20 November 2026 is a Friday
    expect(inSeason('confetti', friday(16))).toBe(true)
    expect(inSeason('confetti', friday(19))).toBe(true)
    expect(inSeason('confetti', friday(20))).toBe(false)
    expect(inSeason('confetti', friday(15))).toBe(false)
    expect(inSeason('confetti', new Date(2026, 10, 19, 17, 0))).toBe(false) // a Thursday
    expect(inSeason('hop', friday(3))).toBe(true)
  })

  it('never comes up out of its time, and confetti comes up five times as often as a habit in its', () => {
    const noon = tally({ when: new Date(2026, 10, 18, 12, 0) })
    expect(noon.get('yawn')).toBeUndefined()
    expect(noon.get('confetti')).toBeUndefined()
    const fridayEvening = tally({ when: new Date(2026, 10, 20, 17, 0) })
    expect(fridayEvening.get('confetti')! / fridayEvening.get('hop')!).toBeCloseTo(
      TIMED.confetti.weight,
      0,
    )
    const night = tally({ when: new Date(2026, 10, 18, 23, 30) })
    expect(night.get('yawn')! / night.get('hop')!).toBeCloseTo(1, 0)
    // Without the time, neither.
    expect(tally(undefined).get('yawn')).toBeUndefined()
  })

  it('draws the performances that can be done, the taskbar, pointer and battle ones a tenth as often', () => {
    const counts = tally({ performances: ['watch', 'carry', 'peek', 'familiar', 'battle'] }, 20_000)
    const hop = counts.get('hop')!
    expect(counts.get('watch')! / hop).toBeCloseTo(PERFORMANCE_WEIGHT.watch, 1)
    expect(counts.get('carry')! / hop).toBeCloseTo(0.1, 1)
    expect(counts.get('battle')! / hop).toBeCloseTo(0.1, 1)
    expect(counts.get('peek')! / hop).toBeCloseTo(1, 0)
    expect(counts.get('familiar')! / hop).toBeCloseTo(1, 0)
    expect(counts.get('swap')).toBeUndefined() // not offered
    // Not the same one twice running.
    for (let roll = 0; roll < 1; roll += 0.01) {
      const next = nextActivity(alone, 0, 240, rolls(0.1, roll), 'peek', undefined, {
        performances: ['peek'],
      })
      expect(next.kind === 'perform' && next.name).not.toBe('peek')
    }
  })
})

describe('her reactions to the pointer', () => {
  const her = { x: 1000, y: 900 }
  it('startles when it zips past close to her, not far off or slowly', () => {
    const zip = [
      { t: 0, x: 850, y: 880 },
      { t: 50, x: 1150, y: 900 },
    ]
    expect(pointerReaction(zip, her)).toBe('startle')
    const far = zip.map((s) => ({ ...s, y: s.y - 400 }))
    expect(pointerReaction(far, her)).toBeNull()
    const slow = [
      { t: 0, x: 990, y: 900 },
      { t: 50, x: 1010, y: 900 },
    ]
    expect(pointerReaction(slow, her)).toBeNull()
  })

  it('pounces when it’s wiggled near her, toward where it is', () => {
    const wiggle = (centre: number) =>
      Array.from({ length: 12 }, (_, i) => ({
        t: i * POINTER.everyMs,
        x: centre + (i % 2 ? 20 : -20),
        y: 880,
      }))
    expect(pointerReaction(wiggle(950), her)).toBe('pounce-left')
    expect(pointerReaction(wiggle(1060), her)).toBe('pounce-right')
    expect(pointerReaction(wiggle(1500), her)).toBeNull() // too far
    const still = Array.from({ length: 12 }, (_, i) => ({ t: i * 50, x: 990, y: 880 }))
    expect(pointerReaction(still, her)).toBeNull()
  })
})

describe('watching the pointer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('looks toward it, straight ahead when it’s close to her eyes', () => {
    const eyes = { x: 100, y: 100 }
    expect(gazeAt(eyes, { x: 110, y: 105 }, 30)).toEqual({ x: 0, y: 0 })
    expect(gazeAt(eyes, { x: 400, y: 100 }, 30)).toEqual({ x: 1, y: 0 })
    expect(gazeAt(eyes, { x: -200, y: -300 }, 30)).toEqual({ x: -1, y: -1 })
    expect(gazeAt(eyes, { x: 100, y: 600 }, 30)).toEqual({ x: 0, y: 1 })
  })

  it('watches for ten seconds where she stands, telling her page only when her gaze changes', async () => {
    let cursor = { x: 0, y: 0 }
    const gazes: unknown[] = []
    const performances = new Performances({
      displays: { cursor: () => cursor },
      onGaze: (g) => gazes.push(g),
    })
    expect(performances.available(false)).toContain('watch')
    const standing = {
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      bounds: { x: 1800, y: 930, width: 96, height: 110 },
      scale: 1,
      box: { x: 1808, y: 940 },
    }
    const watch = (await performances.prepare('watch', standing))!
    expect(watch.at(0)).toEqual({ x: 1808, y: 940, pose: 'watch' })
    watch.at(100)
    expect(gazes).toEqual([{ x: -1, y: -1 }])
    cursor = { x: 1856, y: 974 }
    watch.at(200)
    expect(gazes.at(-1)).toEqual({ x: 0, y: 0 })
    expect(watch.at(WATCH_MS)).toBeNull()
    watch.end(true)
    expect(gazes.at(-1)).toBeNull()
  })
})

describe('news', () => {
  const notification = (id: string, unread: boolean): JiraNotification => ({
    id,
    kind: 'assigned',
    key: 'SW-1',
    summary: 'Something',
    by: 'Grace Hopper',
    at: '2026-11-18T01:00:00.000Z',
    unread,
  })
  const feed = (
    notifications: JiraNotification[],
    requests: Partial<ServiceRequest>[] = [],
    status: 'ready' | 'loading' = 'ready',
  ): JiraFeed =>
    ({
      notifications: { status, items: notifications },
      requests: { status, items: requests as ServiceRequest[] },
    }) as JiraFeed

  it('is a new unread notification, or a new reply to a request', () => {
    const before = feed([notification('a', true)], [{ key: 'ISD-1', news: null }])
    expect(hasNews(before, feed([notification('a', true)], [{ key: 'ISD-1', news: null }]))).toBe(
      false,
    )
    expect(hasNews(before, feed([notification('b', true), notification('a', true)]))).toBe(true)
    expect(hasNews(before, feed([notification('a', false)]))).toBe(false) // read: nothing new
    expect(
      hasNews(before, feed([notification('a', true)], [{ key: 'ISD-1', news: 'Grace replied' }])),
    ).toBe(true)
  })

  it('isn’t whatever’s already there as it first loads', () => {
    expect(hasNews(null, feed([notification('a', true)]))).toBe(false)
    expect(hasNews(feed([], [], 'loading'), feed([notification('a', true)]))).toBe(false)
  })
})

describe('the new poses', () => {
  it('play each reaction for exactly as long as the main process waits', () => {
    for (const pose of REACTIONS) expect(animationLength(pose), pose).toBe(REACTION_MS[pose])
    for (const pose of ['yawn', 'confetti'] as const) {
      expect(FIDGETS).toContain(pose)
      expect(animationLength(pose)).toBe(FIDGET_MS[pose])
    }
  })

  it('hold her performances’ poses round and round, and pounce and peek either way', () => {
    // All but the portal's, which open, have her wave through it (or go back), and close, once,
    // and her casts in a battle (a thrust of her hand each).
    for (const pose of HELD_POSES) {
      expect(LOOPS[pose], pose).toBe(!pose.startsWith('portal') && !pose.startsWith('cast'))
    }
    for (const pose of REACTIONS) expect(LOOPS[pose], pose).toBe(false)
    const right = framesOf('pounce-right', 'left').map((f) => f.rows.join(''))
    const left = framesOf('pounce-left', 'right').map((f) => f.rows.join(''))
    expect(right).not.toEqual(left)
    expect(framesOf('peek-left', 'right')[0]!.rows).not.toEqual(
      framesOf('peek-right', 'right')[0]!.rows,
    )
  })

  it('looks every way at the pointer, a frame for each', () => {
    const frames = new Set<string>()
    for (const x of [-1, 0, 1])
      for (const y of [-1, 0, 1]) frames.add(gazeFrame({ x, y }).rows.join(''))
    expect(frames.size).toBe(9)
    expect(gazeFrame({ x: 5, y: -3 })).toBe(gazeFrame({ x: 1, y: -1 })) // kept, and kept in range
  })

  it('draws hearts, confetti, a scroll and a bead of sweat only when asked', () => {
    const plain = draw({ view: 'front' }).join('')
    for (const extra of [{ hearts: 0.3 }, { confetti: 0.4 }, { scroll: true }, { sweat: true }]) {
      expect(draw({ view: 'front', ...extra }).join(''), JSON.stringify(extra)).not.toBe(plain)
    }
    expect(
      draw({ view: 'front', hearts: 0, confetti: 0, scroll: false, sweat: false }).join(''),
    ).toBe(plain)
  })
})
