import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UI, type Rect } from '@shared/geometry'
import {
  iconOf,
  TRICKS,
  trickFrame,
  trickLength,
  type TrickName,
  type TrickPlan,
} from '@shared/tricks'
import {
  appButtons,
  runsOf,
  TaskbarTricks,
  type TrickDisplay,
} from '../src/main/performances/taskbarTricks'
import {
  peekEdge,
  peekSteps,
  rideSpot,
  stepAt,
  usableWindows,
  WindowTricks,
  type UsableWindow,
} from '../src/main/performances/windowTricks'
import { ShellProbe, type ShellWindow, type TaskbarButton } from '../src/main/shell/probe'

// A 1920 × 1080 display with a 60-pixel taskbar, its buttons from 404 across, 55 wide.
const DISPLAY: TrickDisplay = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1020 },
  scaleFactor: 1,
}
const SIZE = UI.bubbleSize
const PAD = UI.bubblePad
const GROUND = 1020 - UI.bubblePad - SIZE
const button = (k: number): Rect => ({ x: 404 + 55 * k, y: 1020, width: 55, height: 60 })
const plan = (name: TrickName, from = 1808): TrickPlan => ({
  name,
  size: SIZE,
  ground: GROUND,
  from,
  scale: 1,
  slots:
    name === 'juggle-icons'
      ? [button(1), button(2), button(3)]
      : name === 'swap'
        ? [button(1), button(2)]
        : [button(1)],
  side: 1,
  minX: 8,
  maxX: 1920 - 8 - SIZE,
})
const identity = (r: Rect) => r
const standing = (x = 1808) => ({
  workArea: DISPLAY.workArea,
  bounds: {
    x: x - UI.bubblePad,
    y: GROUND - UI.bubblePad - UI.bubbleHeadroom,
    width: 104,
    height: 112,
  },
  scale: 1,
  box: { x, y: GROUND },
})

describe('the taskbar tricks’ timelines', () => {
  it('each goes to its icons and comes back where she was, only ever drawing an icon out of a covered button', () => {
    for (const name of TRICKS) {
      for (const from of [1808, 500]) {
        const p = plan(name, from)
        const total = trickLength(p)
        expect(total, name).toBeGreaterThan(2000)
        expect(trickFrame(p, 0).her.x, name).toBeCloseTo(from)
        for (let t = 0; t < total; t += 40) {
          const frame = trickFrame(p, t)
          expect(frame.done).toBe(false)
          for (const icon of frame.icons)
            expect(frame.covered, `${name} at ${t}`).toContain(icon.slot)
          if (name !== 'perch') expect(frame.her.y).toBe(GROUND)
          expect(frame.her.x).toBeGreaterThanOrEqual(p.minX - 0.01)
          expect(frame.her.x).toBeLessThanOrEqual(p.maxX + 0.01)
        }
        const end = trickFrame(p, total + 1)
        expect(end.done).toBe(true)
        expect(end.covered).toEqual([])
        expect(trickFrame(p, total - 1).her.x).toBeCloseTo(from, 0)
      }
    }
  })

  it('goes by magic when the icons are far, and walks when they’re near', () => {
    const poses = (p: TrickPlan) => {
      const seen = new Set<string>()
      for (let t = 0; t < trickLength(p); t += 40) seen.add(trickFrame(p, t).her.pose)
      return seen
    }
    expect(poses(plan('tap', 1808))).toContain('vanish')
    expect(poses(plan('tap', 500))).not.toContain('vanish')
  })

  it('perches on the icon, sitting on top of it, below where she stands', () => {
    const p = plan('perch', 500)
    const sitting = Array.from({ length: 300 }, (_, i) => trickFrame(p, i * 40)).find(
      (f) => f.her.pose === 'sit',
    )!
    const icon = iconOf(button(1))
    expect(sitting.her.y).toBeGreaterThan(GROUND)
    expect(sitting.her.y + SIZE + PAD).toBeCloseTo(icon.y - icon.size / 2 + 3, 0)
  })

  it('swaps two icons over while she looks guilty, then swaps them back', () => {
    const p = plan('swap', 500)
    const guilty = Array.from({ length: 400 }, (_, i) => trickFrame(p, i * 40)).find(
      (f) => f.her.pose === 'guilty',
    )!
    expect(guilty.covered.sort()).toEqual([0, 1])
    const [a, b] = [iconOf(button(1)), iconOf(button(2))]
    expect(guilty.icons).toEqual([
      { slot: 0, x: b.x, y: b.y, angle: 0 },
      { slot: 1, x: a.x, y: a.y, angle: 0 },
    ])
  })

  it('juggles the three icons about her hands, and knocks one flying to land on the taskbar', () => {
    const juggle = plan('juggle-icons', 500)
    const tossing = Array.from({ length: 400 }, (_, i) => trickFrame(juggle, i * 40)).filter(
      (f) => f.her.pose === 'toss',
    )
    expect(tossing.length).toBeGreaterThan(50)
    for (const f of tossing) {
      expect(f.icons).toHaveLength(3)
      for (const icon of f.icons) {
        expect(Math.abs(icon.x - (f.her.x + SIZE / 2))).toBeLessThan(SIZE * 0.4)
        expect(icon.y).toBeLessThan(GROUND + SIZE)
      }
    }
    const knock = plan('knock', 500)
    const flown = Array.from({ length: 400 }, (_, i) => trickFrame(knock, i * 40)).filter(
      (f) => f.her.pose === 'walk-right' && f.icons.length === 1,
    )
    expect(flown.length).toBeGreaterThan(0)
    expect(flown[0]!.icons[0]!.x).toBeGreaterThan(iconOf(button(1)).x + 100) // flown off toward the middle
  })
})

describe('the taskbar’s app buttons', () => {
  const tb = (name: string, rect: Rect): TaskbarButton => ({ name, rect, bar: null })
  it('are the squarish ones along the bottom, not Start, search, task view or the little icons', () => {
    const buttons = [
      tb('Start', { x: 0, y: 1020, width: 69, height: 60 }),
      tb('Search', { x: 72, y: 1030, width: 275, height: 40 }),
      tb('Task View', { x: 349, y: 1020, width: 55, height: 60 }),
      tb('Chrome pinned', button(1)),
      tb('Files pinned', button(0)),
      tb('Volume', { x: 1800, y: 1030, width: 24, height: 24 }),
      tb('Other screen', { x: 2400, y: 1020, width: 55, height: 60 }),
    ]
    expect(appButtons(buttons, DISPLAY, identity)).toEqual([button(0), button(1)])
  })

  it('come in runs of neighbours for the tricks that need two or three', () => {
    const gap = { x: 900, y: 1020, width: 55, height: 60 }
    const all = [button(0), button(1), button(2), gap]
    expect(runsOf(all, 3)).toEqual([[button(0), button(1), button(2)]])
    expect(runsOf(all, 2)).toHaveLength(2)
    expect(runsOf(all, 1)).toHaveLength(4)
  })
})

describe('TaskbarTricks', () => {
  it('gets a trick ready: cuts the icons out, opens its window over the bottom of the screen, moves her in step', async () => {
    const opened: {
      bounds: Rect
      query: Record<string, string>
      trick: string
      closed: boolean
    }[] = []
    const crops: Rect[] = []
    const tricks = new TaskbarTricks({
      taskbar: async () => [{ name: 'Chrome pinned', rect: button(1), bar: null }],
      toDip: identity,
      displayAt: () => DISPLAY,
      capture: async () => ({
        crop: (r) => (crops.push(r), `data:image/png;base64,${crops.length}`),
      }),
      open: (bounds, query, trick) => {
        const window = { bounds, query, trick, closed: false }
        opened.push(window)
        return { close: () => (window.closed = true) }
      },
      random: () => 0,
      now: () => 1000,
    })
    const performance = (await tricks.prepare('tap', standing()))!
    expect(performance).not.toBeNull()
    expect(opened[0]!.bounds).toEqual({
      x: 0,
      y: GROUND - 200,
      width: 1920,
      height: 1080 - (GROUND - 200),
    })
    const sent = JSON.parse(opened[0]!.trick) as {
      plan: TrickPlan
      icons: string[]
      patches: string[]
    }
    expect(sent.plan.slots).toEqual([button(1)])
    expect(sent.icons).toHaveLength(1)
    expect(sent.patches).toHaveLength(1)
    expect(opened[0]!.query.starts).toBe('1000')
    expect(performance.at(0)).toMatchObject({ x: 1808, y: GROUND })
    expect(performance.at(10 ** 7)).toBeNull()
    performance.end(true)
    expect(opened[0]!.closed).toBe(true)
    // Not enough buttons for juggling: no trick.
    expect(await tricks.prepare('juggle-icons', standing())).toBeNull()
  })
})

describe('ShellProbe', () => {
  /** A pretend PowerShell: answers each request line with `answer(request)`. */
  function fakeShell(answer: (request: string) => unknown) {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const child = Object.assign(new PassThrough(), {
      stdin,
      stdout,
      stderr: new PassThrough(),
      killed: false,
      kill: vi.fn(),
    })
    let buffer = ''
    stdin.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      for (let i = buffer.indexOf('\n'); i >= 0; i = buffer.indexOf('\n')) {
        const line = buffer.slice(0, i)
        buffer = buffer.slice(i + 1)
        const [id, ...rest] = line.split(' ')
        const result = answer(rest.join(' '))
        if (result !== undefined) stdout.write(`${JSON.stringify({ id, ok: true, result })}\n`)
      }
    })
    return child
  }

  it('asks the shell for the taskbar, the windows and one window, starting it once', async () => {
    let started = 0
    const probe = new ShellProbe({
      spawn: () => {
        started++
        return fakeShell((request) =>
          request === 'taskbar'
            ? [{ name: 'Chrome pinned', rect: button(1), bar: null }]
            : request === 'windows'
              ? [
                  {
                    handle: 7,
                    name: 'Notes',
                    className: 'Notepad',
                    pid: 9,
                    state: 'normal',
                    rect: button(0),
                  },
                  { broken: true },
                ]
              : { handle: 7, state: 'normal', rect: button(0) },
        ) as never
      },
    })
    expect(await probe.taskbar()).toEqual([{ name: 'Chrome pinned', rect: button(1), bar: null }])
    expect(await probe.windows()).toHaveLength(1)
    expect(await probe.window(7)).toEqual({ handle: 7, state: 'normal', rect: button(0) })
    expect(started).toBe(1)
    await expect(probe.window(Number.NaN)).rejects.toThrow()
    probe.dispose()
  })

  it('gives up on a request that isn’t answered', async () => {
    vi.useFakeTimers()
    const probe = new ShellProbe({
      spawn: () => fakeShell(() => undefined) as never,
      timeoutMs: 1000,
    })
    const asking = probe.taskbar()
    vi.advanceTimersByTime(1000)
    await expect(asking).rejects.toThrow(/didn't answer/)
    probe.dispose()
    vi.useRealTimers()
  })
})

describe('the window tricks', () => {
  const win = (handle: number, rect: Rect, extra: Partial<ShellWindow> = {}): ShellWindow => ({
    handle,
    name: 'A window',
    className: 'Notepad',
    pid: 50,
    state: 'normal',
    rect,
    ...extra,
  })

  it('only uses apps’ windows in their normal state, not hers, the desktop or ones filling the screen', () => {
    const windows = [
      win(1, { x: 800, y: 300, width: 900, height: 800 }),
      win(2, { x: 800, y: 300, width: 900, height: 800 }, { state: 'maximized' }),
      win(3, { x: 800, y: 300, width: 900, height: 800 }, { pid: 99 }),
      win(4, { x: 0, y: 0, width: 1920, height: 1080 }, { className: 'Progman' }),
      win(5, { x: 0, y: 0, width: 1920, height: 1020 }),
      win(6, { x: 3000, y: 300, width: 900, height: 800 }),
      win(7, { x: 800, y: 300, width: 100, height: 80 }),
    ]
    expect(usableWindows(windows, DISPLAY, 99, identity).map((w) => w.handle)).toEqual([1])
  })

  it('peeks round the nearest edge of a window that comes down over her, from outside it', () => {
    const tall: UsableWindow = { handle: 1, rect: { x: 600, y: 300, width: 1000, height: 760 } }
    const high: UsableWindow = { handle: 2, rect: { x: 1000, y: 100, width: 500, height: 400 } }
    const peek = peekEdge([tall, high], standing(1808), 700)!
    expect(peek).toEqual({ window: tall, edge: 1600, side: 1 })
    expect(peekEdge([high], standing(1808), 700)).toBeNull()
    expect(peekEdge([tall], standing(100), 300)).toBeNull() // too far
    const steps = peekSteps(peek, standing(1808))
    const poses = Array.from({ length: 300 }, (_, i) => stepAt(steps, i * 40))
      .filter(Boolean)
      .map((s) => s!.pose)
    expect(poses).toContain('walk-left')
    expect(poses).toContain('peek-right')
    const peeking = Array.from({ length: 300 }, (_, i) => stepAt(steps, i * 40)).find(
      (s) => s?.pose === 'peek-right',
    )!
    expect(peeking.x).toBeLessThan(1600) // behind it...
    expect(peeking.x + SIZE).toBeGreaterThan(1600) // ...with a little of her out past its edge
  })

  it('rides on a window high enough above the taskbar, sitting along it near her', () => {
    const high: UsableWindow = { handle: 2, rect: { x: 1000, y: 300, width: 600, height: 400 } }
    const low: UsableWindow = { handle: 3, rect: { x: 1000, y: 900, width: 600, height: 100 } }
    expect(rideSpot([low], standing())).toBeNull()
    expect(rideSpot([high, low], standing(1808))).toEqual({ window: high, along: 600 - SIZE - 10 })
  })

  describe('under way', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    function tricks(windows: ShellWindow[], now: () => { state: string; rect: Rect | null }) {
      const occluded: (Rect | null)[] = []
      const performer = new WindowTricks({
        windows: async () => windows,
        window: async (handle) => ({ handle, ...now() }),
        toDip: identity,
        displayAt: () => DISPLAY,
        occlude: (rect) => void occluded.push(rect),
        ownPid: 99,
      })
      return { performer, occluded }
    }

    it('hides her behind the window she peeks round, and stops if it moves', async () => {
      const rect = { x: 600, y: 300, width: 1000, height: 760 }
      let current: Rect = rect
      const { performer, occluded } = tricks([win(1, rect)], () => ({
        state: 'normal',
        rect: current,
      }))
      const peek = (await performer.peek(standing(1808)))!
      expect(peek.at(0)).not.toBeNull()
      expect(occluded).toEqual([rect])
      current = { ...rect, x: 700 }
      await vi.advanceTimersByTimeAsync(300)
      expect(peek.at(400)).toBeNull()
      peek.end(false)
      expect(occluded.at(-1)).toBeNull()
    })

    it('rides along on the window as it moves, and falls off (hard, from up there) when it goes', async () => {
      const rect = { x: 1000, y: 300, width: 600, height: 400 }
      let current: { state: string; rect: Rect | null } = { state: 'normal', rect }
      const { performer } = tricks([win(2, rect)], () => current)
      const ride = (await performer.ride(standing(1808)))!
      expect(ride.at(0)!.pose).toBe('vanish')
      await vi.advanceTimersByTimeAsync(200)
      const seat = ride.at(2000)!
      expect(seat.pose).toBe('ride')
      expect(seat.y + SIZE + PAD).toBeCloseTo(300 + 2, 0)
      current = { state: 'normal', rect: { ...rect, x: 1200, y: 250 } }
      await vi.advanceTimersByTimeAsync(200)
      const moved = ride.at(2500)!
      expect(moved.x - seat.x).toBeCloseTo(200)
      expect(moved.y - seat.y).toBeCloseTo(-50)
      current = { state: 'minimized', rect: null }
      await vi.advanceTimersByTimeAsync(200)
      expect(ride.at(3000)!.pose).toBe('flung')
      const poses = Array.from({ length: 200 }, (_, i) => ride.at(3000 + i * 40)?.pose)
      expect(poses).toContain('splat')
      expect(poses.at(-1)).toBeUndefined() // over
      ride.end(true)
    })
  })
})
