import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Corner, Point, Rect } from '@shared/geometry'
import type { Mode } from '@shared/types'
import {
  BLUR_CLICK_GRACE_MS,
  BubbleController,
  HIDE_SETTLE_MS,
  OPEN_BLUR_GRACE_MS,
  PANEL_FADE_MS,
  type BubbleAnchor,
  type DisplayArea,
} from '../src/main/bubble/BubbleController'
import { bubbleWindowBounds, homePosition, panelWindowBounds } from '../src/main/bubble/layout'

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

// Two monitors: the main one, and a smaller one to its right.
const PRIMARY: DisplayArea = { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }
const SECOND: DisplayArea = { id: 2, workArea: { x: 1920, y: 0, width: 1280, height: 984 } }

let screens: DisplayArea[]
let cursor: Point
let bubble: FakeSurface
let panel: FakeSurface
let modes: Mode[]
let anchors: BubbleAnchor[]
let controller: BubbleController

function makeController(initialAnchor: BubbleAnchor | null = null) {
  return new BubbleController({
    bubble,
    panel,
    displays: {
      primary: () => screens[0]!,
      byId: (id) => screens.find((s) => s.id === id),
      nearest: (p) =>
        screens.find(
          ({ workArea: a }) =>
            p.x >= a.x && p.x < a.x + a.width && p.y >= a.y && p.y < a.y + a.height,
        ) ?? screens[0]!,
      cursor: () => cursor,
    },
    actionCount: 4,
    initialAnchor,
    onModeChange: (mode) => modes.push(mode),
    onAnchorChange: (anchor) => anchors.push(anchor),
    now: () => Date.now(),
    random: () => 0.5,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  screens = [{ ...PRIMARY, workArea: { ...PRIMARY.workArea } }, SECOND]
  cursor = { x: 0, y: 0 }
  bubble = new FakeSurface()
  panel = new FakeSurface()
  modes = []
  anchors = []
  controller = makeController()
  controller.start()
})

afterEach(() => {
  controller.dispose()
  vi.useRealTimers()
})

const workArea = () => screens[0]!.workArea
const home = (area: Rect = workArea(), corner: Corner = 'bottom-right') =>
  bubbleWindowBounds(homePosition(area, corner))

/** Presses on the bubble's centre, moves the mouse to `to`, and lets go. */
function drag(to: Point) {
  const start = bubble.bounds!
  cursor = { x: start.x + 36, y: start.y + 36 }
  controller.startDrag()
  cursor = to
  vi.advanceTimersByTime(32)
  controller.endDrag()
}

describe('start', () => {
  it('shows the bubble bottom-right of the main display, with the panel hidden', () => {
    expect(bubble.visible).toBe(true)
    expect(bubble.bounds).toEqual(home())
    expect(panel.visible).toBe(false)
    expect(controller.currentMode).toBe('collapsed')
    expect(controller.corner).toBe('bottom-right')
  })

  it('returns to the saved corner and display', () => {
    controller.dispose()
    controller = makeController({ displayId: 2, corner: 'top-left' })
    controller.start()
    expect(bubble.bounds).toEqual(home(SECOND.workArea, 'top-left'))
    expect(controller.corner).toBe('top-left')
  })

  it('knows the saved corner before start(), for pages that load first', () => {
    controller.dispose()
    controller = makeController({ displayId: 2, corner: 'top-left' })
    expect(controller.corner).toBe('top-left')
  })

  it("uses the same corner of the main display if the saved display isn't connected", () => {
    controller.dispose()
    controller = makeController({ displayId: 99, corner: 'top-right' })
    controller.start()
    expect(bubble.bounds).toEqual(home(PRIMARY.workArea, 'top-right'))
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
  // The panel has been open a moment, as when a person clicks away from it.
  function openForAWhile() {
    controller.clickBubble()
    vi.advanceTimersByTime(OPEN_BLUR_GRACE_MS)
  }

  it('collapses the panel', () => {
    openForAWhile()
    controller.panelBlurred()
    expect(controller.currentMode).toBe('collapsed')
  })

  it('does not reopen when the blur came from clicking the bubble itself', () => {
    openForAWhile()
    controller.panelBlurred()
    controller.clickBubble() // the same click, arriving just after the blur
    expect(controller.currentMode).toBe('collapsed')
  })

  it('reopens on a later click', () => {
    openForAWhile()
    controller.panelBlurred()
    vi.advanceTimersByTime(BLUR_CLICK_GRACE_MS)
    controller.clickBubble()
    expect(controller.currentMode).toBe('expanded')
  })

  it('stays open when another app takes the focus back just as it opens', () => {
    controller.clickBubble()
    vi.advanceTimersByTime(OPEN_BLUR_GRACE_MS - 50)
    controller.panelBlurred()
    expect(controller.currentMode).toBe('expanded')
    expect(panel.visible).toBe(true)
    // A real click away afterwards still closes it.
    vi.advanceTimersByTime(100)
    controller.panelBlurred()
    expect(controller.currentMode).toBe('collapsed')
  })

  it('logs a click that did nothing', () => {
    const messages: string[] = []
    controller = new BubbleController({
      bubble,
      panel,
      displays: {
        primary: () => screens[0]!,
        byId: (id) => screens.find((s) => s.id === id),
        nearest: () => screens[0]!,
        cursor: () => cursor,
      },
      actionCount: 4,
      initialAnchor: null,
      onModeChange: () => {},
      onAnchorChange: () => {},
      now: () => Date.now(),
      onDiagnostic: (message) => messages.push(message),
    })
    controller.start()
    controller.clickBubble()
    vi.advanceTimersByTime(OPEN_BLUR_GRACE_MS)
    controller.panelBlurred()
    controller.clickBubble()
    expect(messages).toEqual(['Bubble click ignored: the panel had just closed'])
  })
})

describe('dragging', () => {
  it('the bubble follows the mouse, keeping the point where it was grabbed', () => {
    const start = bubble.bounds!
    cursor = { x: start.x + 20, y: start.y + 30 }
    controller.startDrag()
    expect(controller.currentMode).toBe('dragging')
    cursor = { x: 900, y: 500 }
    vi.advanceTimersByTime(16)
    expect(bubble.bounds).toMatchObject({ x: 880, y: 470 })
    controller.endDrag()
  })

  it('snaps to the nearest corner when released, gliding there', () => {
    drag({ x: 300, y: 200 }) // top-left quarter of the main display
    expect(controller.currentMode).toBe('returning')
    vi.advanceTimersByTime(1000)
    expect(controller.currentMode).toBe('collapsed')
    expect(bubble.bounds).toEqual(home(PRIMARY.workArea, 'top-left'))
    expect(anchors).toEqual([{ displayId: 1, corner: 'top-left' }])
  })

  it('snaps to a corner of the other display when dropped there', () => {
    drag({ x: 3000, y: 900 }) // bottom-right quarter of the second display
    vi.advanceTimersByTime(1000)
    expect(bubble.bounds).toEqual(home(SECOND.workArea, 'bottom-right'))
    expect(anchors).toEqual([{ displayId: 2, corner: 'bottom-right' }])
  })

  it('moves the panel to open toward the middle of the screen from the new corner', () => {
    drag({ x: 300, y: 200 })
    vi.advanceTimersByTime(1000)
    const position = homePosition(PRIMARY.workArea, 'top-left')
    expect(panel.bounds).toEqual(panelWindowBounds(position, 4, 'top-left'))
    controller.clickBubble()
    expect(controller.currentMode).toBe('expanded')
  })

  it('dropping back in the same corner changes nothing', () => {
    drag({ x: 1800, y: 950 })
    vi.advanceTimersByTime(1000)
    expect(anchors).toEqual([])
    expect(bubble.bounds).toEqual(home())
  })

  it('closes the open panel when a drag starts', () => {
    controller.clickBubble()
    controller.startDrag()
    expect(panel.visible).toBe(false)
    expect(controller.currentMode).toBe('dragging')
    controller.clickBubble() // ignored while dragging
    controller.expand() // ignored while dragging
    expect(controller.currentMode).toBe('dragging')
    controller.endDrag()
  })

  it("can't start while bouncing", () => {
    controller.startBounce()
    controller.startDrag()
    expect(controller.currentMode).toBe('bouncing')
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
      expect(x + 8).toBeGreaterThanOrEqual(workArea().x)
      expect(y + 8).toBeGreaterThanOrEqual(workArea().y)
      expect(x + width - 8).toBeLessThanOrEqual(workArea().x + workArea().width)
      expect(y + height - 8).toBeLessThanOrEqual(workArea().y + workArea().height)
    }
    expect(seen.size).toBeGreaterThan(100)
  })

  it('stays on the display the bubble is on, and returns to its corner there', () => {
    drag({ x: 2100, y: 100 }) // second display, top-left
    vi.advanceTimersByTime(1000)
    controller.startBounce()
    for (let i = 0; i < 300; i++) {
      vi.advanceTimersByTime(16)
      expect(bubble.bounds!.x + 8).toBeGreaterThanOrEqual(SECOND.workArea.x)
    }
    controller.clickBubble()
    vi.advanceTimersByTime(1000)
    expect(bubble.bounds).toEqual(home(SECOND.workArea, 'top-left'))
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
  it('moves the bubble to its corner of the resized display', () => {
    screens[0]!.workArea = { x: 0, y: 0, width: 2560, height: 1400 }
    controller.displayChanged()
    expect(bubble.bounds).toEqual(home())
  })

  it('moves to the same corner of the main display when its display is unplugged', () => {
    drag({ x: 2100, y: 100 }) // second display, top-left
    vi.advanceTimersByTime(1000)
    screens = [screens[0]!]
    controller.displayChanged()
    expect(bubble.bounds).toEqual(home(PRIMARY.workArea, 'top-left'))
    expect(anchors.at(-1)).toEqual({ displayId: 1, corner: 'top-left' })
  })

  it('lets a bounce carry on in the new area', () => {
    controller.startBounce()
    screens[0]!.workArea = { x: 0, y: 0, width: 1280, height: 680 }
    controller.displayChanged()
    expect(controller.currentMode).toBe('bouncing')
    vi.advanceTimersByTime(3000)
    expect(bubble.bounds!.x + 8).toBeLessThanOrEqual(1280 - 56)
  })
})
