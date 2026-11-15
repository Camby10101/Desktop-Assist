import { describe, expect, it } from 'vitest'
import { actionOffset, BUBBLE_BOX, panelWindowSize, UI, type Corner } from '@shared/geometry'
import {
  bubbleWindowBounds,
  insetAt,
  maxInset,
  nearestCorner,
  panelWindowBounds,
  restPosition,
  travelAreas,
  travelBox,
} from '../src/main/bubble/layout'

const workArea = { x: 0, y: 0, width: 1920, height: 1040 } // 1080p minus a 40px taskbar
const CORNERS: Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const BOTTOM: Corner[] = ['bottom-left', 'bottom-right']
/** The character's box stands so its window's bottom edge is on the taskbar. */
const STANDING_Y = 1040 - UI.bubblePad - UI.bubbleSize
/** The character's box, right in the right-hand corner. */
const RIGHT_X = 1920 - 16 - UI.bubbleSize

describe('restPosition', () => {
  it('stands on the taskbar in the bottom-right corner by default, 16px in from the side', () => {
    expect(restPosition(workArea)).toEqual({ x: RIGHT_X, y: STANDING_Y })
    expect(bubbleWindowBounds(restPosition(workArea))).toMatchObject({
      y: 1040 - BUBBLE_BOX, // the window's bottom edge is the taskbar's top
    })
  })

  it('stands in the bottom-left corner too; a top corner means the bottom one below it', () => {
    expect(restPosition(workArea, 'bottom-left')).toEqual({ x: 16, y: STANDING_Y })
    expect(restPosition(workArea, 'top-left')).toEqual({ x: 16, y: STANDING_Y })
    expect(restPosition(workArea, 'top-right')).toEqual(restPosition(workArea, 'bottom-right'))
  })

  it('stands further along toward the middle by its inset, never off the work area', () => {
    expect(restPosition(workArea, 'bottom-right', 100)).toEqual({
      x: RIGHT_X - 100,
      y: STANDING_Y,
    })
    expect(restPosition(workArea, 'bottom-left', 100)).toEqual({ x: 16 + 100, y: STANDING_Y })
    expect(restPosition(workArea, 'bottom-left', 99_999).x).toBe(RIGHT_X)
    expect(restPosition(workArea, 'bottom-left', -50).x).toBe(16)
  })

  it('follows a work area that does not start at the origin (a second monitor, a top taskbar)', () => {
    const second = { x: 1920, y: 40, width: 1280, height: 984 }
    expect(restPosition(second, 'bottom-left')).toEqual({
      x: 1920 + 16,
      y: 40 + 984 - UI.bubblePad - UI.bubbleSize,
    })
    expect(restPosition(second)).toEqual({
      x: 1920 + 1280 - 16 - UI.bubbleSize,
      y: 40 + 984 - UI.bubblePad - UI.bubbleSize,
    })
  })
})

describe('insetAt and maxInset', () => {
  it('turn a position back into an inset, the opposite of restPosition', () => {
    for (const corner of BOTTOM) {
      for (const inset of [0, 37, 240, 900]) {
        expect(insetAt(workArea, corner, restPosition(workArea, corner, inset).x)).toBe(inset)
      }
    }
  })

  it('keep it on the work area', () => {
    expect(maxInset(workArea)).toBe(1920 - 2 * 16 - UI.bubbleSize)
    expect(insetAt(workArea, 'bottom-right', 5000)).toBe(0) // off the right edge: in the corner
    expect(insetAt(workArea, 'bottom-right', -5000)).toBe(maxInset(workArea))
    expect(maxInset({ x: 0, y: 0, width: 50, height: 50 })).toBe(0)
  })
})

describe('nearestCorner', () => {
  it('picks the bottom corner on the side of the half the character is in', () => {
    expect(nearestCorner(workArea, { x: 100, y: 100 })).toBe('bottom-left')
    expect(nearestCorner(workArea, { x: 1500, y: 100 })).toBe('bottom-right')
    expect(nearestCorner(workArea, { x: 100, y: 900 })).toBe('bottom-left')
    expect(nearestCorner(workArea, { x: 1500, y: 900 })).toBe('bottom-right')
  })

  it('measures from the character centre, on displays that are not at the origin', () => {
    const second = { x: -1280, y: 0, width: 1280, height: 1024 } // a monitor to the left
    // Its left edge is right of the middle only once its centre is: -640 is the middle.
    expect(nearestCorner(second, { x: -660, y: 10 })).toBe('bottom-right')
    expect(nearestCorner(second, { x: -700, y: 10 })).toBe('bottom-left')
  })

  it('every resting place belongs to its own corner', () => {
    for (const corner of BOTTOM) {
      expect(nearestCorner(workArea, restPosition(workArea, corner, 240))).toBe(corner)
    }
  })
})

describe('bubbleWindowBounds', () => {
  it('wraps the bubble in its padding', () => {
    expect(bubbleWindowBounds({ x: 100, y: 200 })).toEqual({
      x: 100 - UI.bubblePad,
      y: 200 - UI.bubblePad,
      width: BUBBLE_BOX,
      height: BUBBLE_BOX,
    })
  })

  it('rounds fractional positions from the bounce animation', () => {
    const bounds = bubbleWindowBounds({ x: 100.4, y: 200.6 })
    expect(bounds.x).toBe(92)
    expect(bounds.y).toBe(193)
  })
})

describe('panelWindowBounds', () => {
  it('shares the bubble window corner that points into the screen corner', () => {
    // A top-corner box, as the panel's layout still allows, for completeness.
    const topHome = (corner: Corner) => ({ ...restPosition(workArea, corner), y: 16 })
    for (const corner of CORNERS) {
      const home = corner.startsWith('top') ? topHome(corner) : restPosition(workArea, corner)
      const bubble = bubbleWindowBounds(home)
      const panel = panelWindowBounds(home, 4, corner)
      const left = corner.endsWith('left')
      const top = corner.startsWith('top')
      expect(left ? panel.x : panel.x + panel.width).toBe(left ? bubble.x : bubble.x + bubble.width)
      expect(top ? panel.y : panel.y + panel.height).toBe(top ? bubble.y : bubble.y + bubble.height)
    }
  })

  it('fits on screen from wherever the character wanders near either bottom corner', () => {
    for (const corner of BOTTOM) {
      for (const inset of [0, 240]) {
        const panel = panelWindowBounds(restPosition(workArea, corner, inset), 4, corner)
        expect(panel.x).toBeGreaterThanOrEqual(workArea.x)
        expect(panel.y).toBeGreaterThanOrEqual(workArea.y)
        expect(panel.x + panel.width).toBeLessThanOrEqual(workArea.x + workArea.width)
        expect(panel.y + panel.height).toBeLessThanOrEqual(workArea.y + workArea.height)
      }
    }
  })

  it('fits on screen with the character anywhere in its half of the screen', () => {
    for (const corner of BOTTOM) {
      const panel = panelWindowBounds(
        restPosition(workArea, corner, 1920 / 2 - 16 - UI.bubbleSize),
        4,
        corner,
      )
      expect(panel.x).toBeGreaterThanOrEqual(workArea.x)
      expect(panel.y).toBeGreaterThanOrEqual(workArea.y)
      expect(panel.x + panel.width).toBeLessThanOrEqual(workArea.x + workArea.width)
      expect(panel.y + panel.height).toBeLessThanOrEqual(workArea.y + workArea.height)
    }
  })
})

describe('panelWindowSize', () => {
  it('is wide enough for the chat card beside the bubble', () => {
    expect(panelWindowSize(4).width).toBe(
      UI.bubblePad + UI.bubbleSize + UI.gap + UI.panelWidth + UI.shadowPad,
    )
  })

  it('is tall enough for the chat card at full height plus a toast beyond it', () => {
    expect(panelWindowSize(4).height).toBe(
      UI.bubblePad + UI.panelMaxHeight + UI.toastRoom + UI.shadowPad,
    )
  })

  it('grows to fit a long action stack', () => {
    const far = actionOffset(14) + UI.actionSize
    expect(panelWindowSize(15).height).toBe(far + UI.shadowPad)
  })
})

describe('travelAreas', () => {
  const laptop = {
    bounds: { x: 0, y: 0, width: 1536, height: 864 },
    workArea: { x: 0, y: 0, width: 1536, height: 816 }, // taskbar along the bottom
  }
  const above = {
    bounds: { x: -750, y: -1440, width: 3440, height: 1440 },
    workArea: { x: -750, y: -1440, width: 3440, height: 1392 }, // taskbar along the shared edge
  }

  it('adds the stretch of a taskbar that another display lies right beyond', () => {
    expect(travelAreas([laptop, above])).toEqual([
      laptop.workArea,
      above.workArea,
      // Only the part of the upper monitor's taskbar above the laptop; the laptop's own taskbar,
      // on an outer edge, stays out.
      { x: 0, y: -48, width: 1536, height: 48 },
    ])
  })

  it('needs the displays to touch', () => {
    const apart = {
      ...above,
      bounds: { ...above.bounds, y: -1500 },
      workArea: { ...above.workArea, y: -1500 },
    }
    expect(travelAreas([laptop, apart])).toEqual([laptop.workArea, apart.workArea])
  })

  it('works for a taskbar down the side between two monitors side by side', () => {
    const left = {
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1858, height: 1080 }, // taskbar on the right
    }
    const right = {
      bounds: { x: 1920, y: 100, width: 1280, height: 1024 },
      workArea: { x: 1920, y: 100, width: 1280, height: 1024 },
    }
    expect(travelAreas([left, right])).toContainEqual({ x: 1858, y: 100, width: 62, height: 980 })
  })
})

describe('travelBox', () => {
  it('keeps the whole bubble inside the work area', () => {
    expect(travelBox(workArea)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 1920 - UI.bubbleSize,
      maxY: 1040 - UI.bubbleSize,
    })
  })
})
