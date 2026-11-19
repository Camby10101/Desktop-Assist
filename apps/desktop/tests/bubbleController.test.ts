import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DRAG_CHECK,
  FIDGET_MS,
  LANDING,
  REACTION_MS,
  SNOOZE,
  SPELL_POSE_MS,
  type Pose,
} from '@shared/character'
import { UI, type CharacterSize, type Corner, type Point, type Rect } from '@shared/geometry'
import type { Habits, Mode } from '@shared/types'
import {
  BLUR_CLICK_GRACE_MS,
  BubbleController,
  HIDE_SETTLE_MS,
  OPEN_BLUR_GRACE_MS,
  PANEL_FADE_MS,
  type BubbleAnchor,
  type BubbleControllerDeps,
  type DisplayArea,
  type Performance,
} from '../src/main/bubble/BubbleController'
import { bubbleWindowBounds, panelWindowBounds, restPosition } from '../src/main/bubble/layout'
import { FLING, WANDER } from '../src/main/bubble/wander'

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

function makeController(
  initialAnchor: BubbleAnchor | null = null,
  initialScale?: number,
  initialHabits?: Habits,
  extra: Partial<BubbleControllerDeps> = {},
) {
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
    initialHabits,
    onModeChange: (mode) => modes.push(mode),
    onAnchorChange: (anchor) => anchors.push(anchor),
    onPoseChange: (pose) => poses.push(pose),
    onSizeChange: (size) => sizes.push(size),
    now: () => Date.now(),
    // With 0.5 every time: the first thing it does comes 8.5 s after settling, then one every
    // 14 s; a walk goes to the middle of the stretches far enough away.
    random: () => 0.5,
    ...extra,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  // A Wednesday at noon: no yawning (late at night) or confetti (Friday evenings).
  vi.setSystemTime(new Date(2026, 10, 18, 12, 0))
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
/** Moves time on `ms`, her page saying every so often that the mouse button is still down. */
function holdFor(ms: number) {
  for (let left = ms; left > 0; left -= DRAG_CHECK.everyMs) {
    vi.advanceTimersByTime(Math.min(left, DRAG_CHECK.everyMs))
    controller.dragHeld()
  }
}
/** How long walking `distance` takes, plus a frame. */
const walkMs = (distance: number) => (distance / WANDER.walkSpeed) * 1000 + 32

/**
 * Presses on the bubble's centre, moves the mouse to `to`, holds it still there a moment (so it's
 * a drop, not a throw), and lets go.
 */
function drag(to: Point) {
  const start = bubble.bounds!
  cursor = { x: start.x + 36, y: start.y + 36 }
  controller.startDrag()
  cursor = to
  holdFor(32 + FLING.sampleMs)
  controller.endDrag()
}

/**
 * Picks her up (and carries her to `from`, if given) and throws her: the mouse moving `step` each
 * frame for a few frames, then let go while it's still moving.
 */
function fling(step: Point, from?: Point) {
  const start = bubble.bounds!
  cursor = { x: start.x + 36, y: start.y + 36 }
  controller.startDrag()
  // Carried up to `from` first, if it says.
  if (from) {
    cursor = from
    holdFor(32 + FLING.sampleMs)
  }
  for (let i = 0; i < 8; i++) {
    cursor = { x: cursor.x + step.x, y: cursor.y + step.y }
    vi.advanceTimersByTime(16)
    controller.dragHeld()
  }
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
    // To 110 from the corner (the middle of 40–180, the stretch far enough away).
    vi.advanceTimersByTime(walkMs(110))
    expect(controller.currentPose).toBe('idle')
    expect(bubble.bounds).toEqual(home(PRIMARY.workArea, 'bottom-right', 110))
    // The panel would open from where it now stands.
    const position = restPosition(PRIMARY.workArea, 'bottom-right', 110)
    expect(panel.bounds).toEqual(panelWindowBounds(position, 4, 'bottom-right'))
    expect(modes).toEqual([]) // walking on its own isn't a change of mode
  })

  it('walks both ways, and fidgets only once it has been left alone a while', () => {
    vi.advanceTimersByTime(46_000)
    expect(poses).toEqual([
      'walk-left', // at 8.5 s, to 110 from the corner
      'idle',
      'walk-right', // at 24 s, back to 50
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
    holdFor(FIDGET_MS.sit + 100)
    expect(controller.currentPose).toBe('dragged') // the fidget's end doesn't interrupt
    controller.endDrag()
  })
})

describe('as Settings say', () => {
  /** Starts her again with these Settings. */
  function startWith(habits: Habits) {
    controller.dispose()
    controller = makeController(null, undefined, habits)
    controller.start()
  }

  it('stands still: never walks, but still does her idle animations once left alone', () => {
    startWith({ standStill: true, noIdles: false, noHat: false })
    vi.advanceTimersByTime(46_000)
    // Resting at 8.5 s and 22.5 s; alone for 30 s at 36.5 s.
    expect(poses).toEqual(['sit', 'idle'])
    expect(bubble.bounds).toEqual(home())
  })

  it('without idle animations: only ever strolls about', () => {
    startWith({ standStill: false, noIdles: true, noHat: false })
    vi.advanceTimersByTime(120_000)
    expect(poses.length).toBeGreaterThan(4)
    for (const pose of poses) expect(pose).toMatch(/^(walk-left|walk-right|idle)$/)
  })

  it('with both: does nothing on her own at all', () => {
    startWith({ standStill: true, noIdles: true, noHat: false })
    vi.advanceTimersByTime(120_000)
    expect(poses).toEqual([])
    expect(bubble.bounds).toEqual(home())
  })

  it('turned on mid-walk, stops where she is; turned off again, gets on with her day', () => {
    advanceUntil(() => controller.currentPose === 'walk-left')
    vi.advanceTimersByTime(500)
    controller.setHabits({ standStill: true, noIdles: true, noHat: false })
    expect(controller.currentPose).toBe('idle')
    const where = bubble.bounds
    vi.advanceTimersByTime(120_000)
    expect(bubble.bounds).toEqual(where)
    const before = poses.length
    controller.setHabits({ standStill: false, noIdles: false, noHat: false })
    vi.advanceTimersByTime(WANDER.delay[1] + 100)
    expect(poses.slice(before).some((pose) => pose !== 'idle')).toBe(true)
  })

  it('stays where she was dropped, however far from her corner, when she’s to stand still', () => {
    startWith({ standStill: true, noIdles: false, noHat: false })
    drag({ x: 900, y: 850 })
    vi.advanceTimersByTime(1000)
    expect(controller.currentMode).toBe('collapsed')
    expect(controller.currentPose).toBe('idle')
    const landed = bubble.bounds
    vi.advanceTimersByTime(10_000)
    expect(bubble.bounds).toEqual(landed)
  })
})

describe('the screen saver', () => {
  it('sleeps: the panel closes, she vanishes, her window hides, and she does nothing meanwhile', () => {
    controller.clickBubble()
    controller.sleep()
    expect(controller.currentMode).toBe('collapsed')
    expect(controller.currentPose).toBe('vanish')
    expect(bubble.visible).toBe(true)
    vi.advanceTimersByTime(SPELL_POSE_MS.vanish + 10)
    expect(bubble.visible).toBe(false)
    const before = poses.length
    controller.clickBubble()
    controller.expand()
    controller.startDrag()
    vi.advanceTimersByTime(120_000)
    expect(controller.currentMode).toBe('collapsed')
    expect(poses.slice(before)).toEqual([])
  })

  it('wakes: her window shows, she forms out of white motes, then gets on with her day', () => {
    controller.sleep()
    vi.advanceTimersByTime(SPELL_POSE_MS.vanish + 10)
    controller.wake()
    expect(bubble.visible).toBe(true)
    expect(bubble.bounds).toEqual(home())
    expect(controller.currentPose).toBe('appear')
    vi.advanceTimersByTime(SPELL_POSE_MS.appear + 10)
    expect(controller.currentPose).toBe('idle')
    vi.advanceTimersByTime(WANDER.delay[1] + 100)
    expect(poses.at(-1)).not.toBe('appear')
    expect(poses.slice(poses.lastIndexOf('appear') + 1).some((p) => p !== 'idle')).toBe(true)
  })

  it('stays gone when the screens change while she sleeps', () => {
    controller.sleep()
    vi.advanceTimersByTime(200)
    controller.displayChanged()
    expect(controller.currentPose).toBe('vanish')
    vi.advanceTimersByTime(SPELL_POSE_MS.vanish)
    expect(bubble.visible).toBe(false)
  })

  it('woken before she’s gone, she comes straight back', () => {
    controller.sleep()
    vi.advanceTimersByTime(200)
    controller.wake()
    vi.advanceTimersByTime(SPELL_POSE_MS.vanish)
    expect(bubble.visible).toBe(true)
  })
})

describe('casting spells', () => {
  it('plays a spell’s pose for its time, then stands idle and gets on with her day', () => {
    controller.act('chant')
    expect(controller.currentPose).toBe('chant')
    vi.advanceTimersByTime(SPELL_POSE_MS.chant - 100)
    expect(controller.currentPose).toBe('chant')
    vi.advanceTimersByTime(200)
    expect(controller.currentPose).toBe('idle')
    // ...and wanders again later.
    advanceUntil(() => controller.currentPose !== 'idle')
  })

  it('stops a spell when she’s clicked, and never finishes it', () => {
    const then = vi.fn()
    controller.act('vanish', then)
    controller.clickBubble()
    expect(controller.currentMode).toBe('expanded')
    expect(controller.currentPose).toBe('idle')
    vi.advanceTimersByTime(SPELL_POSE_MS.vanish + 100)
    expect(then).not.toHaveBeenCalled()
  })

  it('only acts collapsed: casting closes the panel first', () => {
    controller.expand()
    controller.act('chant')
    expect(controller.currentPose).toBe('idle')
  })

  it('teleports: vanishes, moves along the taskbar near her corner, appears, then stands', () => {
    const before = bubble.bounds!
    controller.teleport()
    expect(controller.currentPose).toBe('vanish')
    expect(bubble.bounds).toEqual(before) // not yet
    vi.advanceTimersByTime(SPELL_POSE_MS.vanish + 10)
    expect(controller.currentPose).toBe('appear')
    const after = bubble.bounds!
    expect(after.y).toBe(before.y) // still on the taskbar
    expect(Math.abs(after.x - before.x)).toBeGreaterThanOrEqual(WANDER.minWalk)
    // The panel would open from where she is now.
    expect(panel.bounds).toEqual(panelWindowBounds(boxOf(after), 4, 'bottom-right'))
    vi.advanceTimersByTime(SPELL_POSE_MS.appear + 10)
    expect(controller.currentPose).toBe('idle')
  })
})

describe('closing', () => {
  it('vanishes, then quits, ignoring clicks and drags meanwhile', () => {
    controller.expand()
    const done = vi.fn()
    controller.farewell(done)
    expect(controller.currentMode).toBe('collapsed')
    expect(controller.currentPose).toBe('vanish')
    controller.clickBubble()
    controller.startDrag()
    expect(controller.currentMode).toBe('collapsed')
    expect(controller.currentPose).toBe('vanish')
    vi.advanceTimersByTime(SPELL_POSE_MS.vanish - 10)
    expect(done).not.toHaveBeenCalled()
    vi.advanceTimersByTime(20)
    expect(done).toHaveBeenCalledOnce()
    // She does nothing more on her own.
    vi.advanceTimersByTime(60_000)
    expect(controller.currentPose).toBe('vanish')
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
    drag({ x: 1700, y: 850 }) // the right half, near enough to its corner
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
    drag({ x: 900, y: 850 }) // the left half of the main display, far from its corner
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
    drag({ x: 2650, y: 850 }) // the right half of the second display, far from its corner
    const inset = 3200 - 16 - UI.bubbleSize - (2650 - 28)
    vi.advanceTimersByTime(1000)
    expect(anchors).toEqual([{ displayId: 2, corner: 'bottom-right' }])
    expect(bubble.bounds!.y).toBe(home(SECOND.workArea).y) // on that display's taskbar
    expect(controller.currentPose).toBe('walk-right')
    vi.advanceTimersByTime(walkMs(inset - WANDER.zone))
    expect(bubble.bounds).toEqual(home(SECOND.workArea, 'bottom-right', WANDER.zone))
  })

  it('moves the panel to open toward the middle of the screen from the new corner', () => {
    drag({ x: 200, y: 850 }) // the left half, 156 from its corner
    vi.advanceTimersByTime(1000)
    const position = restPosition(PRIMARY.workArea, 'bottom-left', 200 - 28 - 16)
    expect(bubble.bounds).toEqual(bubbleWindowBounds(position))
    expect(panel.bounds).toEqual(panelWindowBounds(position, 4, 'bottom-left'))
    controller.clickBubble()
    expect(controller.currentMode).toBe('expanded')
  })

  it('opening while it walks back stops it, with the panel where it stands', () => {
    drag({ x: 900, y: 850 })
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
    controller.expand() // ignored while dragging
    expect(controller.currentMode).toBe('dragging')
    controller.endDrag()
  })
})

describe('throwing her, and hard landings', () => {
  it('lands hard when dropped from high up: splat, then up again, idle and on with her day', () => {
    drag({ x: 1700, y: 300 })
    advanceUntil(() => controller.currentMode === 'collapsed')
    expect(controller.currentPose).toBe('splat')
    expect(bubble.bounds!.y).toBe(home().y)
    vi.advanceTimersByTime(LANDING.splatMs - 100)
    expect(controller.currentPose).toBe('splat')
    vi.advanceTimersByTime(200)
    expect(controller.currentPose).toBe('idle')
  })

  it('lands softly when dropped from near the taskbar', () => {
    drag({ x: 1700, y: 850 })
    advanceUntil(() => controller.currentMode === 'collapsed')
    expect(controller.currentPose).toBe('idle')
  })

  it('flies on when let go while moving, tumbling, and lands on the taskbar further along', () => {
    fling({ x: -30, y: -10 }) // about 1900 DIP a second to the left, and up
    expect(controller.currentMode).toBe('returning')
    expect(controller.currentPose).toBe('flung')
    const released = bubble.bounds!
    vi.advanceTimersByTime(100)
    expect(bubble.bounds!.x).toBeLessThan(released.x - 50) // still going left
    expect(bubble.bounds!.y).toBeLessThan(released.y) // and up, for now
    advanceUntil(() => controller.currentMode === 'collapsed')
    expect(bubble.bounds!.y).toBe(home().y)
    expect(bubble.bounds!.x).toBeLessThan(released.x - 200)
  })

  it('bounces off the side of the screen, never leaving it, and lives near the corner it lands by', () => {
    // About 2200 DIP a second to the left, from high on the right: into the left side and back.
    fling({ x: -35, y: -10 }, { x: 1700, y: 400 })
    const edge = home(PRIMARY.workArea, 'bottom-left', 0).x
    let leftmost = Infinity
    advanceUntil(() => {
      leftmost = Math.min(leftmost, bubble.bounds!.x)
      return controller.currentMode === 'collapsed'
    })
    expect(leftmost).toBe(edge) // it got to the side, and no further
    expect(bubble.bounds!.x).toBeGreaterThan(edge) // and bounced back off it
    expect(anchors.at(-1)).toEqual({ displayId: 1, corner: 'bottom-left' })
  })

  it('lands hard when thrown down at the taskbar from high up', () => {
    fling({ x: 0, y: 40 }, { x: 1700, y: 200 })
    advanceUntil(() => controller.currentMode === 'collapsed')
    expect(controller.currentPose).toBe('splat')
  })

  it('can be caught in the air', () => {
    fling({ x: -30, y: -20 })
    vi.advanceTimersByTime(80)
    expect(controller.currentMode).toBe('returning')
    controller.startDrag()
    expect(controller.currentMode).toBe('dragging')
    expect(controller.currentPose).toBe('dragged')
    controller.endDrag()
  })

  it('stops a hard landing when she’s clicked, opening the panel', () => {
    drag({ x: 1700, y: 300 })
    advanceUntil(() => controller.currentPose === 'splat')
    controller.clickBubble()
    expect(controller.currentMode).toBe('expanded')
    expect(controller.currentPose).toBe('idle')
  })
})

describe('her performances', () => {
  /**
   * Starts her again with a performer offering `peek`, getting ready `performance` (or null), and
   * random numbers from `queue` before 0.5 as usual.
   */
  function withPerformer(performance: Performance | null) {
    const queue: number[] = []
    const asked: string[] = []
    controller.dispose()
    controller = makeController(null, undefined, undefined, {
      random: () => queue.shift() ?? 0.5,
      performer: {
        available: () => ['peek'],
        prepare: async (name) => {
          asked.push(name)
          return performance
        },
      },
    })
    controller.start()
    return { queue, asked }
  }
  /** A performance: walking her 300 DIP to the left over a second, peeking, then it's over. */
  function walkLeft() {
    const ended: boolean[] = []
    const from = boxOf(home())
    const performance: Performance = {
      at: (t) => (t >= 1000 ? null : { x: from.x - 0.3 * t, y: from.y, pose: 'peek-left' }),
      end: (finished) => void ended.push(finished),
    }
    return { performance, ended }
  }
  /** Moves time on to her third thing to do (39 s in), with rolls that pick the performance. */
  async function untilPerformance(queue: number[]) {
    vi.advanceTimersByTime(38_000)
    queue.push(0.1, 0.999)
    await vi.advanceTimersByTimeAsync(1_100)
  }

  it('plays one: she goes where it says, doing what it says, and stands there after', async () => {
    const { performance, ended } = walkLeft()
    const { queue, asked } = withPerformer(performance)
    const start = home().x
    await untilPerformance(queue)
    expect(asked).toEqual(['peek'])
    expect(controller.currentPose).toBe('peek-left')
    expect(bubble.bounds!.x).toBeLessThan(start)
    await vi.advanceTimersByTimeAsync(1_100)
    expect(ended).toEqual([true])
    expect(controller.currentPose).toBe('idle')
    expect(bubble.bounds!.y).toBe(home().y) // on the taskbar
    expect(bubble.bounds!.x).toBeLessThan(start - 250) // where it took her
  })

  it('is cut short by a click: it ends, and she stands on the taskbar where she was', async () => {
    const { performance, ended } = walkLeft()
    const { queue } = withPerformer(performance)
    await untilPerformance(queue)
    expect(controller.currentPose).toBe('peek-left')
    controller.clickBubble()
    expect(ended).toEqual([false])
    expect(controller.currentMode).toBe('expanded')
    expect(controller.currentPose).toBe('idle')
    expect(bubble.bounds!.y).toBe(home().y)
  })

  it('isn’t resting (kept at the top of the on-top windows) while it plays', async () => {
    const { performance } = walkLeft()
    const { queue } = withPerformer(performance)
    expect(controller.resting).toBe(true)
    await untilPerformance(queue)
    expect(controller.currentPose).toBe('peek-left')
    expect(controller.resting).toBe(false) // a trick's icons are meant to pass in front of her
    await vi.advanceTimersByTimeAsync(1_100)
    expect(controller.resting).toBe(true)
  })

  it('leaves a click to a performance that answers clicks itself (her portal), panel shut', async () => {
    const { performance, ended } = walkLeft()
    const clicks: number[] = []
    performance.clicked = (t) => {
      clicks.push(t)
      return true
    }
    const { queue } = withPerformer(performance)
    await untilPerformance(queue)
    vi.advanceTimersByTime(200)
    controller.clickBubble()
    controller.pet() // the second click of a double-click: the performance has it too
    expect(controller.currentMode).toBe('collapsed')
    expect(controller.currentPose).toBe('peek-left') // still under way
    expect(ended).toEqual([])
    expect(clicks).toHaveLength(2)
    expect(clicks[0]).toBeGreaterThan(0) // told how far in it is
    expect(clicks[0]).toBeLessThan(1000)
    // One that doesn't take it: the click opens the panel, ending it as usual.
    performance.clicked = () => false
    controller.clickBubble()
    expect(controller.currentMode).toBe('expanded')
    expect(ended).toEqual([false])
  })

  it('carries on as usual when one can’t be done just now', async () => {
    const { queue, asked } = withPerformer(null)
    await untilPerformance(queue)
    expect(asked).toEqual(['peek'])
    expect(controller.currentPose).toBe('idle')
    vi.advanceTimersByTime(WANDER.delay[1] + 100)
    expect(poses.length).toBeGreaterThan(4)
  })
})

describe('snoozing', () => {
  /** Starts her again with Windows saying nobody's used the mouse or keyboard for `idle()` seconds. */
  function withIdle(idle: () => number) {
    controller.dispose()
    controller = makeController(null, undefined, undefined, { idleSeconds: idle })
    controller.start()
  }

  it('settles down and snoozes when nobody’s been at the PC for five minutes, until someone is', () => {
    let idle = 0
    withIdle(() => idle)
    vi.advanceTimersByTime(2000)
    expect(controller.isSnoozing).toBe(false)
    idle = SNOOZE.afterMs / 1000
    vi.advanceTimersByTime(1000)
    expect(controller.isSnoozing).toBe(true)
    expect(controller.currentPose).toBe('settle')
    vi.advanceTimersByTime(REACTION_MS.settle + 100)
    expect(controller.currentPose).toBe('snooze')
    // It goes on: nothing else of hers comes along meanwhile.
    idle += 600
    vi.advanceTimersByTime(600_000)
    expect(controller.currentPose).toBe('snooze')
    // Someone's back: she wakes, gets up, and carries on.
    idle = 0
    vi.advanceTimersByTime(1000)
    expect(controller.isSnoozing).toBe(false)
    expect(controller.currentPose).toBe('rouse')
    vi.advanceTimersByTime(REACTION_MS.rouse + 100)
    expect(controller.currentPose).toBe('idle')
  })

  it('wakes when she’s clicked, opening the panel', () => {
    withIdle(() => SNOOZE.afterMs / 1000 + 10)
    vi.advanceTimersByTime(1000 + REACTION_MS.settle + 100)
    expect(controller.currentPose).toBe('snooze')
    controller.clickBubble()
    expect(controller.currentMode).toBe('expanded')
    expect(controller.isSnoozing).toBe(false)
    expect(controller.currentPose).toBe('idle')
  })

  it('doesn’t snooze while the screen saver’s on', () => {
    withIdle(() => SNOOZE.afterMs / 1000 + 10)
    controller.sleep()
    vi.advanceTimersByTime(5000)
    expect(controller.isSnoozing).toBe(false)
    expect(controller.currentPose).not.toBe('snooze')
  })
})

describe('her reactions', () => {
  it('plays one with the panel open, then stands idle, the panel still open', () => {
    controller.clickBubble()
    controller.react('scroll')
    expect(controller.currentPose).toBe('scroll')
    vi.advanceTimersByTime(REACTION_MS.scroll - 50)
    expect(controller.currentPose).toBe('scroll')
    vi.advanceTimersByTime(100)
    expect(controller.currentPose).toBe('idle')
    expect(controller.currentMode).toBe('expanded')
  })

  it('is petted: hearts and a wiggle, then idle and on with her day', () => {
    controller.pet()
    expect(controller.currentPose).toBe('pet')
    vi.advanceTimersByTime(REACTION_MS.pet + 50)
    expect(controller.currentPose).toBe('idle')
    expect(controller.currentMode).toBe('collapsed')
  })

  it('jumps when the pointer zips past her, and not again for a while', () => {
    const middle = { x: boxOf(home()).x + 48, y: boxOf(home()).y + 48 }
    const zip = () => {
      cursor = { x: middle.x - 300, y: middle.y }
      vi.advanceTimersByTime(50)
      cursor = { x: middle.x + 300, y: middle.y }
      vi.advanceTimersByTime(50)
    }
    vi.advanceTimersByTime(1000)
    zip()
    expect(controller.currentPose).toBe('startle')
    vi.advanceTimersByTime(REACTION_MS.startle + 50)
    expect(controller.currentPose).toBe('idle')
    zip()
    expect(controller.currentPose).toBe('idle') // resting from it
  })
})

describe('a drag whose release goes missing', () => {
  it('stays carried as long as her page says the button is still down', () => {
    controller.startDrag()
    holdFor(10_000)
    expect(controller.currentMode).toBe('dragging')
    controller.endDrag()
  })

  it('lets her go once her page stops saying so, and logs it', () => {
    const logged: string[] = []
    controller.dispose()
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
      onModeChange: (mode) => modes.push(mode),
      onAnchorChange: () => {},
      onDiagnostic: (message) => logged.push(message),
      now: () => Date.now(),
      random: () => 0.5,
    })
    controller.start()
    controller.startDrag()
    holdFor(1_000)
    vi.advanceTimersByTime(DRAG_CHECK.staleMs - 100)
    expect(controller.currentMode).toBe('dragging')
    vi.advanceTimersByTime(200)
    expect(controller.currentMode).toBe('returning') // falling to the taskbar
    expect(logged.at(-1)).toMatch(/no word that the mouse button is still down/)
    vi.advanceTimersByTime(1000)
    expect(controller.currentMode).toBe('collapsed')
  })

  it('lets her go when she’s clicked while carried', () => {
    controller.startDrag()
    holdFor(500)
    controller.clickBubble()
    expect(controller.currentMode).toBe('returning')
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
    drag({ x: 2100, y: 850 }) // second display, 136 from its bottom-left corner
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

describe('resting (her window kept at the top of the always-on-top windows meanwhile)', () => {
  it('is standing about with the panel closed: not open, carried, asleep or leaving', () => {
    expect(controller.resting).toBe(true)
    controller.clickBubble()
    expect(controller.resting).toBe(false)
    controller.collapse()
    expect(controller.resting).toBe(true)
    controller.startDrag()
    expect(controller.resting).toBe(false)
    controller.endDrag()
    vi.advanceTimersByTime(5000)
    expect(controller.resting).toBe(true)
    controller.sleep()
    expect(controller.resting).toBe(false)
    controller.wake()
    expect(controller.resting).toBe(true)
    controller.farewell(() => {})
    expect(controller.resting).toBe(false)
  })
})
