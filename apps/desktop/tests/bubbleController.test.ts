import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FIDGET_MS, type Pose } from '@shared/character'
import { UI, type CharacterSize, type Corner, type Point, type Rect } from '@shared/geometry'
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
import { bubbleWindowBounds, panelWindowBounds, restPosition } from '../src/main/bubble/layout'
import { WANDER } from '../src/main/bubble/wander'

/** Her box's position, from her window's bounds: in by its padding, below its headroom. */
const boxOf = (window: Rect): Point => ({
  x: window.x + UI.bubblePad,
  y: window.y + UI.bubblePad + UI.bubbleHeadroom,
})

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
const PRIMARY: DisplayArea = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
}
const SECOND: DisplayArea = {
  id: 2,
  bounds: { x: 1920, y: 0, width: 1280, height: 1024 },
  workArea: { x: 1920, y: 0, width: 1280, height: 984 },
}

let screens: DisplayArea[]
let cursor: Point
let bubble: FakeSurface
let panel: FakeSurface
let modes: Mode[]
let poses: Pose[]
let anchors: BubbleAnchor[]
let sizes: CharacterSize[]
let controller: BubbleController

function makeController(initialAnchor: BubbleAnchor | null = null, initialScale?: number) {
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
    initialScale,
    onModeChange: (mode) => modes.push(mode),
    onAnchorChange: (anchor) => anchors.push(anchor),
    onPoseChange: (pose) => poses.push(pose),
    onSizeChange: (size) => sizes.push(size),
    now: () => Date.now(),
    // With 0.5 every time: the first thing it does comes 8.5 s after settling, then one every
    // 14 s; a walk goes to the middle of the stretches far enough away.
    random: () => 0.5,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  screens = [
    { ...PRIMARY, bounds: { ...PRIMARY.bounds }, workArea: { ...PRIMARY.workArea } },
    SECOND,
  ]
  cursor = { x: 0, y: 0 }
  bubble = new FakeSurface()
  panel = new FakeSurface()
  modes = []
  poses = []
  anchors = []
  sizes = []
  controller = makeController()
  controller.start()
})

afterEach(() => {
  controller.dispose()
  vi.useRealTimers()
})

const workArea = () => screens[0]!.workArea
/** The character's window standing `inset` from `corner` of `area`. */
const home = (area: Rect = workArea(), corner: Corner = 'bottom-right', inset = 0) =>
  bubbleWindowBounds(restPosition(area, corner, inset))
const FIRST_ACTIVITY_MS = WANDER.firstDelay[0] + 0.5 * (WANDER.firstDelay[1] - WANDER.firstDelay[0])
/** Moves time on a frame at a time until `done()` (at most a minute). */
function advanceUntil(done: () => boolean) {
  for (let i = 0; i < 60_000 / 16 && !done(); i++) vi.advanceTimersByTime(16)
  expect(done()).toBe(true)
}
/** How long walking `distance` takes, plus a frame. */
const walkMs = (distance: number) => (distance / WANDER.walkSpeed) * 1000 + 32

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
  it('stands the character on the taskbar bottom-right of the main display, panel hidden', () => {
    expect(bubble.visible).toBe(true)
    expect(bubble.bounds).toEqual(home())
    expect(bubble.bounds!.y + bubble.bounds!.height).toBe(1040) // on the taskbar
    expect(panel.visible).toBe(false)
    expect(controller.currentMode).toBe('collapsed')
    expect(controller.currentPose).toBe('idle')
    expect(controller.corner).toBe('bottom-right')
  })

  it('returns to the saved corner and display', () => {
    controller.dispose()
    controller = makeController({ displayId: 2, corner: 'bottom-left' })
    controller.start()
    expect(bubble.bounds).toEqual(home(SECOND.workArea, 'bottom-left'))
    expect(controller.corner).toBe('bottom-left')
  })

  it('takes a top corner saved by an older version as the bottom corner below it', () => {
    controller.dispose()
    controller = makeController({ displayId: 2, corner: 'top-left' })
    expect(controller.corner).toBe('bottom-left') // known before start(), for pages that load first
    controller.start()
    expect(bubble.bounds).toEqual(home(SECOND.workArea, 'bottom-left'))
  })

  it("uses the same corner of the main display if the saved display isn't connected", () => {
    controller.dispose()
    controller = makeController({ displayId: 99, corner: 'bottom-left' })
    controller.start()
    expect(bubble.bounds).toEqual(home(PRIMARY.workArea, 'bottom-left'))
  })
})

describe('on its own', () => {
  it('stands idle, then strolls along the taskbar near its corner, then stands again', () => {
    vi.advanceTimersByTime(FIRST_ACTIVITY_MS - 100)
    expect(poses).toEqual([])
    vi.advanceTimersByTime(200)
    // From the right-hand corner toward the middle: walking left, along the taskbar only.
    expect(controller.currentPose).toBe('walk-left')
    expect(controller.currentMode).toBe('collapsed')
    vi.advanceTimersByTime(500)
    expect(bubble.bounds!.x).toBeLessThan(home().x)
    expect(bubble.bounds!.y).toBe(home().y)
    // To 140 from the corner (the middle of 40–240, the stretch far enough away).
    vi.advanceTimersByTime(walkMs(140))
    expect(controller.currentPose).toBe('idle')
    expect(bubble.bounds).toEqual(home(PRIMARY.workArea, 'bottom-right', 140))
    // The panel would open from where it now stands.
    const position = restPosition(PRIMARY.workArea, 'bottom-right', 140)
    expect(panel.bounds).toEqual(panelWindowBounds(position, 4, 'bottom-right'))
    expect(modes).toEqual([]) // walking on its own isn't a change of mode
  })

  it('walks both ways, and fidgets only once it has been left alone a while', () => {
    vi.advanceTimersByTime(46_000)
    expect(poses).toEqual([
      'walk-left', // at 8.5 s, to 140 from the corner
      'idle',
      'walk-right', // at 24 s, back to 80
      'idle',
      'sit', // at 39 s: alone for 30 s now (for six seconds)
      'idle',
    ])
  })

  it("doesn't do the same fidget twice in a row", () => {
    vi.advanceTimersByTime(64_000)
    expect(poses).toEqual([
      'walk-left',
      'idle',
      'walk-right',
      'idle',
      'sit',
      'idle',
      'levitate',
      'idle',
    ])
  })

  it('plays a fidget for as long as its animation lasts, standing still', () => {
    advanceUntil(() => controller.currentPose === 'sit')
    const where = bubble.bounds
    vi.advanceTimersByTime(FIDGET_MS.sit - 100)
    expect(controller.currentPose).toBe('sit')
    expect(bubble.bounds).toEqual(where)
    vi.advanceTimersByTime(200)
    expect(controller.currentPose).toBe('idle')
  })

  it('stops where it is when clicked, and the panel opens from there', () => {
    vi.advanceTimersByTime(FIRST_ACTIVITY_MS + 600)
    expect(controller.currentPose).toBe('walk-left')
    controller.clickBubble()
    expect(controller.currentMode).toBe('expanded')
    expect(controller.currentPose).toBe('idle')
    const where = bubble.bounds!
    expect(where.x).toBeLessThan(home().x)
    expect(panel.bounds).toEqual(panelWindowBounds(boxOf(where), 4, 'bottom-right'))
    vi.advanceTimersByTime(5000)
    expect(bubble.bounds).toEqual(where) // the walk doesn't carry on
  })

  it('does nothing on its own while the panel is open, and starts again once it closes', () => {
    controller.clickBubble()
    vi.advanceTimersByTime(60_000)
    expect(poses).toEqual([])
    expect(bubble.bounds).toEqual(home())
    controller.clickBubble()
    vi.advanceTimersByTime(WANDER.delay[0] + 0.5 * (WANDER.delay[1] - WANDER.delay[0]) + 100)
    expect(controller.currentPose).toMatch(/^walk-/)
  })

  it('stops a fidget when dragged, and dangles instead', () => {
    advanceUntil(() => controller.currentPose === 'sit')
    controller.startDrag()
    expect(controller.currentPose).toBe('dragged')
    vi.advanceTimersByTime(FIDGET_MS.sit + 100)
    expect(controller.currentPose).toBe('dragged') // the fidget's end doesn't interrupt
    controller.endDrag()
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

  it('stays closed when the press on the bubble is what closed it (the bubble took the focus)', () => {
    openForAWhile()
    const pressedAt = Date.now()
    vi.advanceTimersByTime(10)
    controller.panelBlurred() // the bubble took the focus as the button went down
    vi.advanceTimersByTime(BLUR_CLICK_GRACE_MS + 500) // a slow click: released much later
    controller.clickBubble(pressedAt)
    expect(controller.currentMode).toBe('collapsed')
  })

  it('reopens straight away after clicking somewhere else, however quick the next click', () => {
    openForAWhile()
    controller.panelBlurred() // clicked another app
    vi.advanceTimersByTime(100) // well inside the old 300 ms grace
    controller.clickBubble(Date.now())
    expect(controller.currentMode).toBe('expanded')
    expect(panel.visible).toBe(true)
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
    void controller.whileHidden(() => new Promise(() => {})) // a screenshot that never ends
    controller.clickBubble(Date.now())
    expect(messages).toEqual(['Bubble click ignored while capturing'])
  })
})

describe('dragging', () => {
  it('the character dangles from the mouse, keeping the point where it was grabbed', () => {
    const start = bubble.bounds!
    cursor = { x: start.x + 20, y: start.y + 30 }
    controller.startDrag()
    expect(controller.currentMode).toBe('dragging')
    expect(controller.currentPose).toBe('dragged')
    cursor = { x: 900, y: 500 }
    vi.advanceTimersByTime(16)
    expect(bubble.bounds).toMatchObject({ x: 880, y: 470 })
    controller.endDrag()
  })

  it('falls straight down onto the taskbar where it was dropped', () => {
    drag({ x: 1700, y: 300 }) // the right half, near enough to its corner
    expect(controller.currentMode).toBe('returning')
    expect(controller.currentPose).toBe('dragged')
    const dropped = bubble.bounds!
    vi.advanceTimersByTime(200)
    expect(bubble.bounds!.y).toBeGreaterThan(dropped.y) // on its way down
    expect(bubble.bounds!.x).toBe(dropped.x)
    vi.advanceTimersByTime(1000)
    expect(controller.currentMode).toBe('collapsed')
    expect(controller.currentPose).toBe('idle')
    expect(bubble.bounds).toEqual({ ...dropped, y: home().y })
    expect(anchors).toEqual([]) // still the right-hand corner
  })

  it('dropped far from a corner, it walks back toward the nearer one', () => {
    drag({ x: 900, y: 300 }) // the left half of the main display, far from its corner
    vi.advanceTimersByTime(1000)
    expect(anchors).toEqual([{ displayId: 1, corner: 'bottom-left' }])
    expect(controller.currentMode).toBe('collapsed')
    expect(controller.currentPose).toBe('walk-left')
    const landed = bubble.bounds!.x
    vi.advanceTimersByTime(walkMs(landed + 8 - 16 - WANDER.zone))
    expect(controller.currentPose).toBe('idle')
    expect(bubble.bounds).toEqual(home(PRIMARY.workArea, 'bottom-left', WANDER.zone))
  })

  it('lives near a corner of the other display when dropped there', () => {
    drag({ x: 2650, y: 300 }) // the right half of the second display, far from its corner
    const inset = 3200 - 16 - UI.bubbleSize - (2650 - 28)
    vi.advanceTimersByTime(1000)
    expect(anchors).toEqual([{ displayId: 2, corner: 'bottom-right' }])
    expect(bubble.bounds!.y).toBe(home(SECOND.workArea).y) // on that display's taskbar
    expect(controller.currentPose).toBe('walk-right')
    vi.advanceTimersByTime(walkMs(inset - WANDER.zone))
    expect(bubble.bounds).toEqual(home(SECOND.workArea, 'bottom-right', WANDER.zone))
  })

  it('moves the panel to open toward the middle of the screen from the new corner', () => {
    drag({ x: 200, y: 200 }) // the left half, 156 from its corner
    vi.advanceTimersByTime(1000)
    const position = restPosition(PRIMARY.workArea, 'bottom-left', 200 - 28 - 16)
    expect(bubble.bounds).toEqual(bubbleWindowBounds(position))
    expect(panel.bounds).toEqual(panelWindowBounds(position, 4, 'bottom-left'))
    controller.clickBubble()
    expect(controller.currentMode).toBe('expanded')
  })

  it('opening while it walks back stops it, with the panel where it stands', () => {
    drag({ x: 900, y: 300 })
    vi.advanceTimersByTime(2000)
    expect(controller.currentPose).toBe('walk-left')
    controller.clickBubble()
    const where = bubble.bounds!
    expect(controller.currentMode).toBe('expanded')
    expect(panel.bounds).toEqual(panelWindowBounds(boxOf(where), 4, 'bottom-left'))
    vi.advanceTimersByTime(5000)
    expect(bubble.bounds).toEqual(where)
  })

  it('dropping it back near its corner keeps the corner', () => {
    drag({ x: 1800, y: 950 })
    vi.advanceTimersByTime(1000)
    expect(anchors).toEqual([])
    expect(bubble.bounds).toEqual(
      home(PRIMARY.workArea, 'bottom-right', 1920 - 16 - UI.bubbleSize - (1800 - 28)),
    )
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
  it('moves the character onto the taskbar of the resized display', () => {
    screens[0]!.bounds = { x: 0, y: 0, width: 2560, height: 1440 }
    screens[0]!.workArea = { x: 0, y: 0, width: 2560, height: 1400 }
    controller.displayChanged()
    expect(bubble.bounds).toEqual(home())
  })

  it('moves to the same corner of the main display when its display is unplugged', () => {
    drag({ x: 2100, y: 100 }) // second display, 136 from its bottom-left corner
    vi.advanceTimersByTime(1000)
    screens = [screens[0]!]
    controller.displayChanged()
    expect(bubble.bounds).toEqual(home(PRIMARY.workArea, 'bottom-left', 136))
    expect(anchors.at(-1)).toEqual({ displayId: 1, corner: 'bottom-left' })
  })

  it('stops a fidget too, standing idle again', () => {
    advanceUntil(() => controller.currentPose === 'sit')
    controller.displayChanged()
    expect(controller.currentPose).toBe('idle')
  })

  it('stops a walk and stands it back on the taskbar, as far along as still fits', () => {
    vi.advanceTimersByTime(FIRST_ACTIVITY_MS + 600)
    expect(controller.currentPose).toBe('walk-left')
    screens[0]!.workArea = { x: 0, y: 0, width: 1920, height: 1000 } // a taller taskbar
    controller.displayChanged()
    expect(controller.currentPose).toBe('idle')
    expect(bubble.bounds!.y + bubble.bounds!.height).toBe(1000)
  })

  it('shrinks her to fit a smaller screen, and grows her back once there is room', () => {
    controller.setScale(6)
    screens[0]!.bounds = { x: 0, y: 0, width: 1280, height: 720 }
    screens[0]!.workArea = { x: 0, y: 0, width: 1280, height: 680 }
    controller.displayChanged()
    // At 6× the panel (its actions above her) would be taller than the screen.
    expect(controller.size).toEqual({ scale: 5, max: 5 })
    expect(bubble.bounds).toEqual(
      bubbleWindowBounds(restPosition(workArea(), 'bottom-right', 0, 5), 5),
    )
    screens[0]!.bounds = { ...PRIMARY.bounds }
    screens[0]!.workArea = { ...PRIMARY.workArea }
    controller.displayChanged()
    expect(controller.size).toEqual({ scale: 6, max: 6 })
  })
})

describe('her size', () => {
  it('starts at her usual size', () => {
    expect(controller.size).toEqual({ scale: 1, max: 6 })
    expect(bubble.bounds).toEqual(home())
  })

  it('starts at the size saved last time, snapped to one of her sizes', () => {
    controller.dispose()
    controller = makeController(null, 2.2)
    controller.start()
    expect(controller.size.scale).toBe(2)
    expect(bubble.bounds).toEqual(
      bubbleWindowBounds(restPosition(workArea(), 'bottom-right', 0, 2), 2),
    )
  })

  it('grows where she stands: feet on the taskbar, her corner side kept, both windows resized', () => {
    controller.clickBubble()
    const before = bubble.bounds!
    expect(controller.setScale(3)).toEqual({ scale: 3, max: 6 })
    const after = bubble.bounds!
    expect(after.width).toBe(before.width * 3)
    expect(after.y + after.height).toBe(1040) // still on the taskbar
    expect(after.x + after.width - 24).toBe(before.x + before.width - 8) // 16 from the side
    const position = restPosition(workArea(), 'bottom-right', 0, 3)
    expect(panel.bounds).toEqual(panelWindowBounds(position, 4, 'bottom-right', 3))
    expect(sizes).toEqual([{ scale: 3, max: 6 }])
    expect(controller.currentMode).toBe('expanded') // the panel stays open
  })

  it('shrinks to half her size, and no smaller', () => {
    controller.setScale(0.5)
    expect(bubble.bounds!.width).toBe(48)
    controller.setScale(0.1)
    expect(controller.size.scale).toBe(0.5)
  })

  it("doesn't say anything when her size doesn't change", () => {
    controller.setScale(1)
    expect(sizes).toEqual([])
  })

  it('keeps her to the biggest size that fits a small screen', () => {
    screens[0]!.workArea = { x: 0, y: 0, width: 1280, height: 680 }
    controller.displayChanged()
    expect(controller.setScale(6)).toEqual({ scale: 5, max: 5 })
  })

  it('walks faster the bigger she is, her steps as long as she is big', () => {
    controller.setScale(2)
    vi.advanceTimersByTime(FIRST_ACTIVITY_MS + 100)
    expect(controller.currentPose).toBe('walk-left')
    const from = bubble.bounds!.x
    vi.advanceTimersByTime(1000)
    // Twice the usual speed, give or take a frame.
    expect(from - bubble.bounds!.x).toBeGreaterThan(WANDER.walkSpeed * 2 - 5)
    expect(from - bubble.bounds!.x).toBeLessThan(WANDER.walkSpeed * 2 + 5)
  })

  it('says where she stands, for her clones', () => {
    controller.setScale(2)
    expect(controller.standing).toEqual({
      workArea: PRIMARY.workArea,
      bounds: bubbleWindowBounds(restPosition(workArea(), 'bottom-right', 0, 2), 2),
      scale: 2,
    })
  })
})
