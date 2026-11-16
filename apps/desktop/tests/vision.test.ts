import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FIDGET_MS, VISION } from '@shared/character'
import { BUBBLE_BOX, type Rect } from '@shared/geometry'
import { Vision, visionBounds } from '../src/main/bubble/vision'

const WORK_AREA: Rect = { x: 0, y: 0, width: 1920, height: 1040 }
const herWindow = (x: number, scale = 1): Rect => ({
  x,
  y: 1040 - BUBBLE_BOX * scale,
  width: BUBBLE_BOX * scale,
  height: BUBBLE_BOX * scale,
})

describe('visionBounds', () => {
  it('is a column from the top of the screen down to her feet, centred on her', () => {
    const area = visionBounds(WORK_AREA, herWindow(1000))
    expect(area).toEqual({ x: 1000 + 48 - 120, y: 0, width: 240, height: 1040 })
  })

  it('stays on the work area when she stands in a corner', () => {
    expect(visionBounds(WORK_AREA, herWindow(1808)).x).toBe(1920 - 240)
    expect(visionBounds(WORK_AREA, herWindow(8)).x).toBe(0)
  })

  it('grows with her', () => {
    expect(visionBounds(WORK_AREA, herWindow(1000, 2)).width).toBe(480)
  })
})

describe('Vision', () => {
  let opened: { bounds: Rect; query: Record<string, string>; closed: boolean }[]
  let vision: Vision

  beforeEach(() => {
    vi.useFakeTimers()
    opened = []
    vision = new Vision({
      now: () => 5_000_000,
      open: (bounds, query) => {
        const window = { bounds, query, closed: false }
        opened.push(window)
        return { close: () => void (window.closed = true) }
      },
    })
  })

  afterEach(() => {
    vision.stop()
    vi.useRealTimers()
  })

  const standing = (x: number, scale = 1) => ({
    workArea: WORK_AREA,
    bounds: herWindow(x, scale),
    scale,
  })

  it('opens one window over her, telling it her size, where her middle is and when it started', () => {
    vision.start(standing(1000))
    expect(opened).toHaveLength(1)
    expect(opened[0]!.bounds).toEqual(visionBounds(WORK_AREA, herWindow(1000)))
    expect(opened[0]!.query).toEqual({ scale: '1', centre: '120', starts: '5000000' })
    expect(vision.running).toBe(true)
  })

  it('closes when stopped (the habit ends, or someone clicks her)', () => {
    vision.start(standing(1000))
    vision.stop()
    expect(opened[0]!.closed).toBe(true)
    expect(vision.running).toBe(false)
  })

  it('closes itself once the habit is over, in case nothing stops it', () => {
    vision.start(standing(1000))
    vi.advanceTimersByTime(FIDGET_MS.vision)
    expect(opened[0]!.closed).toBe(true)
  })

  it("has a timetable inside the habit's time, the logo coming down before it rises", () => {
    expect(VISION.descend[1]).toBeLessThan(VISION.ascend[0])
    expect(VISION.lightOut[1]).toBeLessThanOrEqual(FIDGET_MS.vision)
  })
})
