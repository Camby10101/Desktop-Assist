import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Rect } from '@shared/geometry'
import type { Mode } from '@shared/types'
import {
  BLUR_CLICK_GRACE_MS,
  BubbleController,
  HIDE_SETTLE_MS,
  PANEL_FADE_MS,
} from '../src/main/bubble/BubbleController'
import { bubbleWindowBounds, homePosition } from '../src/main/bubble/layout'

class FakeSurface {
  visible = false
  focused = false
  bounds: Rect | null = null
  setBounds = (bounds: Rect) => {
    this.bounds = bounds
  }
  show = () => {
    this.visible = true
  }
  hide = () => {
    this.visible = false
    this.focused = false
  }
  focus = () => {
    this.focused = true
  }
}

let workArea: Rect
let bubble: FakeSurface
let panel: FakeSurface
let modes: Mode[]
let controller: BubbleController

beforeEach(() => {
  vi.useFakeTimers()
  workArea = { x: 0, y: 0, width: 1920, height: 1040 }
  bubble = new FakeSurface()
  panel = new FakeSurface()
  modes = []
  controller = new BubbleController({
    bubble,
    panel,
    getWorkArea: () => workArea,
    actionCount: 4,
    onModeChange: (mode) => modes.push(mode),
    now: () => Date.now(),
    random: () => 0.5,
  })
  controller.start()
})

afterEach(() => {
  controller.dispose()
  vi.useRealTimers()
})

const home = () => bubbleWindowBounds(homePosition(workArea))

describe('start', () => {
  it('shows the bubble in its corner with the panel hidden', () => {
    expect(bubble.visible).toBe(true)
    expect(bubble.bounds).toEqual(home())
    expect(panel.visible).toBe(false)
    expect(controller.currentMode).toBe('collapsed')
  })
})

describe('clicking the bubble', () => {
  it('opens and focuses the panel', () => {
    controller.clickBubble()
    expect(controller.currentMode).toBe('expanded')
    expect(panel.visible).toBe(true)
    expect(panel.focused).toBe(true)
  })

  it('closes the panel again, hiding it after the fade-out', () => {
    controller.clickBubble()
    controller.clickBubble()
    expect(controller.currentMode).toBe('collapsed')
    expect(panel.visible).toBe(true) // still fading out
    vi.advanceTimersByTime(PANEL_FADE_MS)
    expect(panel.visible).toBe(false)
  })

  it('reopening during the fade-out keeps the panel visible', () => {
    controller.clickBubble()
    controller.clickBubble()
    controller.clickBubble()
    vi.advanceTimersByTime(PANEL_FADE_MS * 2)
    expect(controller.currentMode).toBe('expanded')
    expect(panel.visible).toBe(true)
  })
})

describe('clicking away (panel blur)', () => {
  it('collapses the panel', () => {
    controller.clickBubble()
    controller.panelBlurred()
    expect(controller.currentMode).toBe('collapsed')
  })

  it('does not reopen when the blur came from clicking the bubble itself', () => {
    controller.clickBubble()
    controller.panelBlurred()
    controller.clickBubble() // the same click, arriving just after the blur
    expect(controller.currentMode).toBe('collapsed')
  })

  it('reopens on a later click', () => {
    controller.clickBubble()
    controller.panelBlurred()
    vi.advanceTimersByTime(BLUR_CLICK_GRACE_MS)
    controller.clickBubble()
    expect(controller.currentMode).toBe('expanded')
  })
})

describe('bounce', () => {
  it('hides the panel and moves the bubble around the work area', () => {
    controller.clickBubble()
    controller.startBounce()
    expect(controller.currentMode).toBe('bouncing')
    expect(panel.visible).toBe(false)

    const seen = new Set<string>()
    for (let i = 0; i < 600; i++) {
      vi.advanceTimersByTime(16)
      const { x, y, width, height } = bubble.bounds!
      seen.add(`${x},${y}`)
      // The visible bubble (inside the padding) stays within the work area.
      expect(x + 8).toBeGreaterThanOrEqual(workArea.x)
      expect(y + 8).toBeGreaterThanOrEqual(workArea.y)
      expect(x + width - 8).toBeLessThanOrEqual(workArea.x + workArea.width)
      expect(y + height - 8).toBeLessThanOrEqual(workArea.y + workArea.height)
    }
    expect(seen.size).toBeGreaterThan(100)
  })

  it('stops on click and glides back to the corner', () => {
    controller.startBounce()
    vi.advanceTimersByTime(2000)
    expect(bubble.bounds).not.toEqual(home())

    controller.clickBubble()
    expect(controller.currentMode).toBe('returning')
    controller.clickBubble() // ignored mid-glide
    expect(controller.currentMode).toBe('returning')

    vi.advanceTimersByTime(1000)
    expect(controller.currentMode).toBe('collapsed')
    expect(bubble.bounds).toEqual(home())
    expect(modes).toEqual(['bouncing', 'returning', 'collapsed'])
  })

  it('opening from the tray while bouncing glides home, then opens', () => {
    controller.startBounce()
    vi.advanceTimersByTime(1000)
    controller.expand()
    vi.advanceTimersByTime(1000)
    expect(controller.currentMode).toBe('expanded')
    expect(bubble.bounds).toEqual(home())
    expect(panel.visible).toBe(true)
  })
})

describe('whileHidden (screenshots)', () => {
  it('hides both windows while the task runs, then reopens the panel', async () => {
    controller.clickBubble()
    let visibleDuringTask: boolean[] = []
    const result = controller.whileHidden(async () => {
      visibleDuringTask = [bubble.visible, panel.visible]
      return 'saved.png'
    })
    expect(controller.currentMode).toBe('capturing')
    await vi.advanceTimersByTimeAsync(HIDE_SETTLE_MS)
    await expect(result).resolves.toBe('saved.png')
    expect(visibleDuringTask).toEqual([false, false])
    expect(controller.currentMode).toBe('expanded')
    expect(bubble.visible && panel.visible && panel.focused).toBe(true)
  })

  it('restores the windows even if the task fails', async () => {
    controller.clickBubble()
    const result = controller.whileHidden(async () => {
      throw new Error('capture failed')
    })
    const settled = expect(result).rejects.toThrow('capture failed')
    await vi.advanceTimersByTimeAsync(HIDE_SETTLE_MS)
    await settled
    expect(controller.currentMode).toBe('expanded')
    expect(bubble.visible).toBe(true)
  })

  it('ignores blur while capturing', async () => {
    controller.clickBubble()
    const result = controller.whileHidden(async () => {
      controller.panelBlurred()
    })
    await vi.advanceTimersByTimeAsync(HIDE_SETTLE_MS)
    await result
    expect(controller.currentMode).toBe('expanded')
  })
})

describe('display changes', () => {
  it('moves the bubble to the new corner', () => {
    workArea = { x: 0, y: 0, width: 2560, height: 1400 }
    controller.displayChanged()
    expect(bubble.bounds).toEqual(home())
  })

  it('lets a bounce carry on in the new area', () => {
    controller.startBounce()
    workArea = { x: 0, y: 0, width: 1280, height: 680 }
    controller.displayChanged()
    expect(controller.currentMode).toBe('bouncing')
    vi.advanceTimersByTime(3000)
    expect(bubble.bounds!.x + 8).toBeLessThanOrEqual(1280 - 56)
  })
})
