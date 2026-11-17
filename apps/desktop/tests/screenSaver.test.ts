import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Rect } from '@shared/geometry'
import { SCREEN_SAVER } from '@shared/screenSaver'
import { ScreenSaver } from '../src/main/screenSaver'

// Two monitors, the whole of each (taskbars included); she's on the second.
const DISPLAYS = [
  { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
  { id: 2, bounds: { x: 1920, y: 0, width: 2560, height: 1440 } },
]

describe('ScreenSaver', () => {
  let opened: {
    id: number
    bounds: Rect
    query: Record<string, string>
    focus: boolean
    ended: boolean
    closed: boolean
  }[]
  let events: string[]
  let saver: ScreenSaver

  beforeEach(() => {
    vi.useFakeTimers()
    opened = []
    events = []
    saver = new ScreenSaver({
      accentColor: '#9333EA',
      displays: () => DISPLAYS,
      herDisplay: () => 2,
      open: (bounds, query, focus) => {
        const window = {
          id: 100 + opened.length,
          bounds,
          query,
          focus,
          ended: false,
          closed: false,
        }
        opened.push(window)
        return {
          id: window.id,
          end: () => (window.ended = true),
          close: () => (window.closed = true),
        }
      },
      onStart: () => events.push('start'),
      onEnd: () => events.push('end'),
      now: () => Date.now(),
    })
  })

  afterEach(() => {
    saver.dispose()
    vi.useRealTimers()
  })

  it('covers every display, taskbar and all: the sunset on hers, which takes the focus, stars elsewhere', () => {
    saver.start()
    expect(opened.map((w) => w.bounds)).toEqual(DISPLAYS.map((d) => d.bounds))
    const starts = String(Date.now())
    expect(opened.map((w) => w.query)).toEqual([
      { scene: 'stars', starts, accent: '#9333EA' },
      { scene: 'sunset', starts, accent: '#9333EA' },
    ])
    expect(opened.map((w) => w.focus)).toEqual([false, true])
    expect(events).toEqual(['start']) // she goes
    expect(saver.running).toBe(true)
  })

  it('starts once, however often it’s asked', () => {
    saver.start()
    saver.start()
    expect(opened).toHaveLength(2)
    expect(events).toEqual(['start'])
  })

  it('woken by one of its pages: every scene fades away, then the windows close and she’s back', () => {
    saver.start()
    saver.wakeFrom(opened[0]!.id)
    expect(opened.every((w) => w.ended && !w.closed)).toBe(true)
    expect(events).toEqual(['start'])
    vi.advanceTimersByTime(SCREEN_SAVER.fadeOutMs - 10)
    expect(opened.some((w) => w.closed)).toBe(false)
    vi.advanceTimersByTime(20)
    expect(opened.every((w) => w.closed)).toBe(true)
    expect(events).toEqual(['start', 'end'])
    expect(saver.running).toBe(false)
    // Woken twice (two screens at once, say): still only the once.
    saver.wakeFrom(opened[1]!.id)
    expect(events).toEqual(['start', 'end'])
  })

  it('pays no attention to word from anything but its own pages', () => {
    saver.start()
    saver.wakeFrom(7)
    vi.advanceTimersByTime(SCREEN_SAVER.fadeOutMs * 2)
    expect(opened.some((w) => w.ended || w.closed)).toBe(false)
    expect(saver.running).toBe(true)
  })

  it('can start again once it’s over', () => {
    saver.start()
    saver.stop()
    vi.advanceTimersByTime(SCREEN_SAVER.fadeOutMs)
    saver.start()
    expect(opened).toHaveLength(4)
    expect(events).toEqual(['start', 'end', 'start'])
  })

  it('closes at once when the app quits, without bringing her back', () => {
    saver.start()
    saver.dispose()
    expect(opened.every((w) => w.closed)).toBe(true)
    vi.advanceTimersByTime(SCREEN_SAVER.fadeOutMs * 2)
    expect(events).toEqual(['start'])
  })
})
