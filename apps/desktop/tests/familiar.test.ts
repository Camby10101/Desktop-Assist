import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FAMILIAR, FIDGET_MS, type Pose } from '@shared/character'
import { UI, BUBBLE_BOX, type Rect } from '@shared/geometry'
import { IPC } from '@shared/ipc'
import { createActionHandlers } from '../src/main/actions'
import { Familiar, SEE_EVERY_MS } from '../src/main/familiar'
import { familiarVisit, VISIT_GREETING_MS } from '../src/main/performances/familiarVisit'
import { CAT_SIZE, catFrames, PUFF_MS } from '../src/renderer/src/character/cat'
import { arriveCat, CAT, stepCat, type Cat, type CatRoom } from '../src/renderer/src/lib/familiar'

const WORK_AREA: Rect = { x: 0, y: 0, width: 1920, height: 1040 }
const standing = {
  workArea: WORK_AREA,
  bounds: { x: 1800, y: 926, width: 104, height: 114 },
  scale: 1,
}

describe('Familiar (the cat’s window)', () => {
  let opened: {
    bounds: Rect
    query: Record<string, string>
    sent: [string, unknown][]
    closed: boolean
  }[]
  let familiar: Familiar

  beforeEach(() => {
    vi.useFakeTimers()
    opened = []
    familiar = new Familiar({
      open: (bounds, query) => {
        const window = { bounds, query, sent: [] as [string, unknown][], closed: false }
        opened.push(window)
        return {
          close: () => (window.closed = true),
          send: (channel, payload) => void window.sent.push([channel, payload]),
        }
      },
      now: () => Date.now(),
    })
  })
  afterEach(() => {
    familiar.stop()
    vi.useRealTimers()
  })

  it('opens a strip along her taskbar, telling it her size, where she is and when the cat goes', () => {
    familiar.start(standing, FAMILIAR.summonMs)
    expect(opened).toHaveLength(1)
    expect(opened[0]!.bounds).toEqual({
      x: 0,
      y: 1040 - BUBBLE_BOX - UI.bubbleHeadroom,
      width: 1920,
      height: BUBBLE_BOX + UI.bubbleHeadroom,
    })
    expect(opened[0]!.query).toEqual({
      scale: '1',
      from: '1852',
      ends: String(Date.now() + FAMILIAR.summonMs),
    })
    expect(familiar.running).toBe(true)
    vi.advanceTimersByTime(FAMILIAR.summonMs)
    expect(opened[0]!.closed).toBe(true)
    expect(familiar.running).toBe(false)
  })

  it('tells the cat where she goes and what she does, but not more often than it needs', () => {
    familiar.start(standing, FAMILIAR.visitMs)
    const at = (x: number) => ({ ...standing.bounds, x })
    familiar.see(at(1700), 'walk-left')
    familiar.see(at(1690), null) // too soon: skipped
    vi.advanceTimersByTime(SEE_EVERY_MS)
    familiar.see(at(1680), null)
    familiar.see(at(1680), 'sit') // a new pose: always
    const sent = opened[0]!.sent.map(([channel, seen]) => [
      channel,
      (seen as { x: number; pose: Pose }).x,
      (seen as { pose: Pose }).pose,
    ])
    expect(sent).toEqual([
      [IPC.familiarSees, 1752, 'walk-left'],
      [IPC.familiarSees, 1732, 'walk-left'],
      [IPC.familiarSees, 1732, 'sit'],
    ])
  })

  it('stays longer when summoned during a visit, and only opens once', () => {
    familiar.start(standing, FAMILIAR.visitMs)
    vi.advanceTimersByTime(5000)
    familiar.start(standing, FAMILIAR.summonMs)
    expect(opened).toHaveLength(1)
    expect((opened[0]!.sent.at(-1)![1] as { ends: number }).ends).toBe(
      Date.now() + FAMILIAR.summonMs,
    )
    vi.advanceTimersByTime(FAMILIAR.visitMs)
    expect(familiar.running).toBe(true)
    vi.advanceTimersByTime(FAMILIAR.summonMs)
    expect(familiar.running).toBe(false)
  })

  it('is summoned from its icon, closing the panel', async () => {
    const calls: string[] = []
    const handlers = createActionHandlers({
      controller: { collapse: () => calls.push('collapse') } as never,
      screenshots: {} as never,
      openServiceDesk: null,
      startScreenSaver: () => {},
      summonFamiliar: () => calls.push('summon'),
      quit: () => {},
    })
    expect(await handlers.familiar()).toEqual({ ok: true })
    expect(calls).toEqual(['collapse', 'summon'])
  })
})

describe('the cat', () => {
  const room: CatRoom = { width: 1920, box: CAT_SIZE, scale: 1 }
  const step = (cat: Cat, her: { x: number; pose: Pose } | null, ms = 3000, random = () => 0.3) => {
    let now = 0
    for (let t = 0; t < ms; t += 50) cat = stepCat(cat, (now += 50), 50, room, her, random)
    return cat
  }
  const middle = (cat: Cat) => cat.x + room.box / 2

  it('appears beside her, on the side toward the middle of the screen', () => {
    const right = arriveCat(1850, room, 0)
    expect(middle(right)).toBeCloseTo(1850 - CAT.beside)
    expect(right.facing).toBe('right') // toward her
    const left = arriveCat(80, room, 0)
    expect(middle(left)).toBeCloseTo(80 + CAT.beside)
  })

  it('joins in: curls up beside her as she sits, hops when she dances, watches her magic', () => {
    const cat = arriveCat(1000, room, 0)
    const sat = step({ ...cat, x: 600 }, { x: 1000, pose: 'sit' }, 6000)
    expect(sat.pose).toBe('loaf')
    expect(Math.abs(middle(sat) - 1000)).toBeCloseTo(CAT.beside, 0)
    expect(step(cat, { x: 1000, pose: 'dance' }).pose).toBe('hop')
    const watching = step(cat, { x: 1000, pose: 'sigil' })
    expect(watching.pose).toBe('sit')
    expect(watching.facing).toBe(middle(watching) < 1000 ? 'right' : 'left')
  })

  it('follows her when she walks off, running when she’s far ahead', () => {
    const cat = arriveCat(1800, room, 0)
    const a = stepCat(cat, 50, 50, room, { x: 1300, pose: 'walk-left' }, () => 0.3)
    expect(a.pose).toBe('walk')
    expect(a.facing).toBe('left')
    expect(cat.x - a.x).toBeCloseTo((CAT.run * 50) / 1000) // far: running
    const caught = step(cat, { x: 1300, pose: 'walk-left' }, 6000)
    expect(Math.abs(middle(caught) - 1300)).toBeLessThan(CAT.follow + 1)
  })

  it('wanders near her on its own, washing and sitting, and never leaves the taskbar', () => {
    let cat = arriveCat(30, room, 0)
    const poses = new Set<string>()
    let r = 0
    const random = () => (r = (r * 9301 + 49297) % 233280) / 233280
    for (let now = 0; now < 120_000; now += 50) {
      cat = stepCat(cat, now, 50, room, { x: 30, pose: 'idle' }, random)
      poses.add(cat.pose)
      expect(cat.x).toBeGreaterThanOrEqual(0)
      expect(cat.x).toBeLessThanOrEqual(room.width - room.box)
      expect(Math.abs(middle(cat) - 30)).toBeLessThan(CAT.roam * 1.5 + room.box)
    }
    for (const pose of ['walk', 'sit', 'groom']) expect(poses).toContain(pose)
  })

  it('has frames for every pose, either way, and a puff of smoke', () => {
    for (const pose of ['sit', 'walk', 'loaf', 'groom', 'hop', 'puff'] as const) {
      const right = catFrames(pose, 'right')
      expect(right.length, pose).toBeGreaterThan(3)
      for (const frame of right) {
        expect(frame.rows).toHaveLength(CAT_SIZE)
        expect(frame.rows.join('')).toMatch(/[^.]/)
      }
      if (pose !== 'puff') expect(catFrames(pose, 'left')[0]!.rows).not.toEqual(right[0]!.rows)
    }
    const puff = catFrames('puff', 'right')
    expect(puff.reduce((total, f) => total + f.ms, 0)).toBeCloseTo(PUFF_MS)
    // Black with gold eyes.
    expect(catFrames('sit', 'right')[0]!.rows.join('')).toMatch(/Y/)
    expect(catFrames('sit', 'right')[0]!.rows.join('')).toMatch(/Q/)
  })
})

describe('a visit from her familiar', () => {
  it('has her stand while it comes, sit with it a while, and that’s it', () => {
    const visit = familiarVisit({ ...standing, box: { x: 1808, y: 940 } })
    expect(visit.at(0)).toEqual({ x: 1808, y: 940, pose: 'idle' })
    expect(visit.at(VISIT_GREETING_MS + 100)).toEqual({ x: 1808, y: 940, pose: 'sit' })
    expect(visit.at(VISIT_GREETING_MS + FIDGET_MS.sit)).toBeNull()
  })
})
