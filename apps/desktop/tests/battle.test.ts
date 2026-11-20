import { describe, expect, it, vi } from 'vitest'
import {
  BATTLE,
  battleFrame,
  battleLength,
  MONSTER_KINDS,
  planBattle,
  wandAt,
  type BattlePlan,
} from '@shared/battle'
import { bubbleMetrics, type Rect } from '@shared/geometry'
import { Battle } from '../src/main/performances/battle'

const AREA: Rect = { x: 0, y: 0, width: 1920, height: 1032 }
const { size, pad } = bubbleMetrics(1)
/** Her standing on the taskbar, her box's left edge at `x`. */
const standingAt = (x: number, scale = 1) => ({
  workArea: AREA,
  bounds: {
    x: x - pad,
    y: AREA.height - size - pad * 2,
    width: size + pad * 2,
    height: size + pad * 2,
  },
  box: { x, y: AREA.height - size * scale - pad * scale },
  scale,
})

/** Every moment of the battle, 20 ms apart. */
function moments(plan: BattlePlan) {
  const frames = []
  for (let t = 0; t <= battleLength(plan) + 40; t += 20) frames.push({ t, ...battleFrame(plan, t) })
  return frames
}

describe('her battle with monsters', () => {
  it('brings them on from the far side of her screen, to stop on it, short of her', () => {
    for (const [x, side] of [
      [1800, -1],
      [60, 1],
    ] as const) {
      const plan = planBattle(standingAt(x), () => 0.5)
      expect(plan.side).toBe(side)
      expect(plan.ground).toBe(AREA.height) // the top of the taskbar
      expect(plan.monsters.map((m) => m.kind).sort()).toEqual([...MONSTER_KINDS].sort())
      const middle = x + size / 2
      for (const monster of plan.monsters) {
        expect(monster.stop).toBeGreaterThan(AREA.x)
        expect(monster.stop).toBeLessThan(AREA.x + AREA.width)
        expect(Math.abs(monster.stop - middle)).toBeGreaterThanOrEqual(150)
        expect(Math.sign(monster.stop - middle)).toBe(side)
      }
      // They come on from off the screen.
      expect(side === 1 ? plan.edge > AREA.width : plan.edge < 0).toBe(true)
    }
  })

  it('has her startled, then ready, casting at each in turn, and hopping once they’re all gone', () => {
    const plan = planBattle(standingAt(1800), () => 0.3)
    const frames = moments(plan)
    expect(battleFrame(plan, 0).her).toBe('startle')
    expect(battleFrame(plan, BATTLE.noticeMs + 20).her).toMatch(/^(ready|cast)-left$/)
    // Three casts, each its own run of frames.
    const runs = frames.filter(
      (f, i) => f.her === 'cast-left' && frames[i - 1]?.her !== 'cast-left',
    )
    expect(runs).toHaveLength(3)
    // Never the other way.
    expect(frames.some((f) => f.her === 'cast-right' || f.her === 'ready-right')).toBe(false)
    const hops = frames.filter((f) => f.her === 'hop')
    expect(hops.length).toBeGreaterThan(0)
    expect(hops[0]!.monsters).toEqual([]) // only once they’re all gone
    expect(frames.at(-1)!.done).toBe(true)
  })

  it('knocks each one hit back off the screen the way it came, tumbling', () => {
    const plan = planBattle(standingAt(60), () => 0.7)
    const frames = moments(plan)
    for (const kind of MONSTER_KINDS) {
      const seen = frames.flatMap((f) => f.monsters.filter((m) => m.kind === kind))
      const knocked = seen.filter((m) => m.state === 'knocked')
      expect(seen[0]!.state).toBe('coming')
      expect(seen.some((m) => m.state === 'waiting')).toBe(true)
      expect(knocked.length).toBeGreaterThan(10)
      // It ends up back off the screen, turned over and over, having gone up and come down.
      expect(Math.abs(knocked.at(-1)!.x - plan.edge)).toBeLessThan(40)
      expect(Math.abs(knocked.at(-1)!.spin)).toBeGreaterThan(Math.PI * 2)
      const top = Math.min(...knocked.map((m) => m.y))
      expect(top).toBeLessThan(knocked[0]!.y - 20)
      // Facing her all the way.
      expect(new Set(seen.map((m) => m.facing))).toEqual(new Set(['left']))
    }
  })

  it('sends each bolt from her hand to a monster, which bursts as it’s hit', () => {
    const plan = planBattle(standingAt(1800), () => 0.5)
    const frames = moments(plan)
    const wand = wandAt(plan)
    const flying = frames.filter((f) => f.bolts.length > 0)
    expect(flying.length).toBeGreaterThan(0)
    // Every bolt between her hand and the far side, going their way.
    for (const f of flying) {
      for (const bolt of f.bolts) {
        expect(bolt.way).toBe(-1)
        expect(bolt.x).toBeLessThanOrEqual(wand.x + 1)
      }
    }
    // The first bolt starts near her hand; a burst follows where it ended.
    const first = flying[0]!.bolts[0]!
    expect(Math.hypot(first.x - wand.x, first.y - wand.y)).toBeLessThan(30)
    const bursts = frames.filter((f) => f.bursts.length > 0)
    expect(bursts.length).toBeGreaterThan(0)
    expect(bursts[0]!.t).toBeGreaterThan(flying[0]!.t)
  })

  it('brings each on in a few seconds, however far it has to come, and stops further off when she’s bigger', () => {
    const near = planBattle(standingAt(900), () => 0.5)
    const far = planBattle(standingAt(60), () => 0.5)
    for (const plan of [near, far]) {
      for (const monster of plan.monsters) {
        expect(monster.walk).toBeGreaterThanOrEqual(BATTLE.walkMs * 0.8)
        expect(monster.walk).toBeLessThanOrEqual(BATTLE.walkMs + 1_200)
      }
    }
    expect(battleLength(far)).toBeLessThan(15_000)
    const big = planBattle(standingAt(60, 2), () => 0.5)
    expect(big.monsters[0]!.stop - 60).toBeGreaterThan(far.monsters[0]!.stop - 60)
  })
})

describe('Battle', () => {
  it('opens its window along the bottom of her screen, holds her where she stands in step, and closes', () => {
    const close = vi.fn()
    const open = vi.fn<(bounds: Rect, query: Record<string, string>) => { close(): void }>(() => ({
      close,
    }))
    const battle = new Battle({ open, random: () => 0.5, now: () => 1_000 })
    const standing = standingAt(1700)
    const performance = battle.prepare(standing)
    const [bounds, query] = open.mock.calls[0]!
    expect(bounds.x).toBe(AREA.x)
    expect(bounds.width).toBe(AREA.width)
    expect(bounds.y + bounds.height).toBe(AREA.y + AREA.height)
    expect(bounds.height).toBeGreaterThan(size + pad * 2)
    expect(query['starts']).toBe('1000')
    const plan = JSON.parse(query['plan']!) as BattlePlan
    expect(plan).toEqual(planBattle(standing, () => 0.5))
    expect(performance.at(0)).toEqual({ ...standing.box, pose: 'startle' })
    expect(performance.at(BATTLE.noticeMs + 10)!.pose).toMatch(/-left$/)
    expect(performance.at(battleLength(plan))).toBeNull()
    expect(close).not.toHaveBeenCalled()
    performance.end(true)
    expect(close).toHaveBeenCalledOnce()
  })
})
