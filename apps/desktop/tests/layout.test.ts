import { describe, expect, it } from 'vitest'
import {
  actionOffset,
  BUBBLE_BOX,
  CHARACTER_SIZES,
  isInside,
  largestSize,
  panelLayout,
  panelWindowSize,
  snapSize,
  UI,
  type Corner,
} from '@shared/geometry'
import {
  bubbleWindowBounds,
  cloneStrip,
  insetAt,
  maxInset,
  nearestCorner,
  panelWindowBounds,
  restPosition,
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
      // The window's bottom edge is the taskbar's top.
      y: 1040 - BUBBLE_BOX - UI.bubbleHeadroom,
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
  it('wraps the bubble in its padding, with room above for her hat', () => {
    expect(bubbleWindowBounds({ x: 100, y: 200 })).toEqual({
      x: 100 - UI.bubblePad,
      y: 200 - UI.bubblePad - UI.bubbleHeadroom,
      width: BUBBLE_BOX,
      height: BUBBLE_BOX + UI.bubbleHeadroom,
    })
    expect(bubbleWindowBounds({ x: 100, y: 200 }, 2)).toEqual({
      x: 100 - UI.bubblePad * 2,
      y: 200 - (UI.bubblePad + UI.bubbleHeadroom) * 2,
      width: BUBBLE_BOX * 2,
      height: (BUBBLE_BOX + UI.bubbleHeadroom) * 2,
    })
  })

  it('rounds fractional positions from a fall or a walk', () => {
    const bounds = bubbleWindowBounds({ x: 100.4, y: 200.6 })
    expect(bounds.x).toBe(92)
    expect(bounds.y).toBe(193 - UI.bubbleHeadroom)
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
      // From a top corner, the top of her padding, below the headroom over her hat.
      expect(top ? panel.y : panel.y + panel.height).toBe(
        top ? bubble.y + UI.bubbleHeadroom : bubble.y + bubble.height,
      )
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

describe('her size', () => {
  it('comes in steps from half her usual size to six times it, all whole DIPs', () => {
    expect(CHARACTER_SIZES[0]).toBe(0.5)
    expect(CHARACTER_SIZES.at(-1)).toBe(6)
    for (const scale of CHARACTER_SIZES) {
      expect(Number.isInteger(UI.bubbleSize * scale)).toBe(true)
      expect(Number.isInteger(UI.bubblePad * scale)).toBe(true)
    }
  })

  it('snaps any number to the nearest size', () => {
    expect(snapSize(2.2)).toBe(2)
    expect(snapSize(0.1)).toBe(0.5)
    expect(snapSize(99)).toBe(6)
    expect(snapSize(Number.NaN)).toBe(1)
  })

  it('grows her window and box from her feet, keeping 16px from the side', () => {
    const position = restPosition(workArea, 'bottom-right', 0, 3)
    const bounds = bubbleWindowBounds(position, 3)
    expect(bounds.width).toBe(BUBBLE_BOX * 3)
    expect(bounds.y + bounds.height).toBe(workArea.height)
    expect(position.x + UI.bubbleSize * 3).toBe(workArea.width - UI.edgeMargin)
    expect(maxInset(workArea, 3)).toBe(workArea.width - 32 - UI.bubbleSize * 3)
    expect(insetAt(workArea, 'bottom-right', position.x, 3)).toBe(0)
    expect(nearestCorner(workArea, position, 3)).toBe('bottom-right')
  })

  it('moves the chat card and the actions out beside and above her', () => {
    const usual = panelLayout(1)
    const big = panelLayout(4)
    expect(big.chatX - usual.chatX).toBe(UI.bubblePad * 3 + UI.bubbleSize * 3)
    expect(big.actionsY - usual.actionsY).toBe(UI.bubblePad * 3 + UI.bubbleSize * 3)
    expect(actionOffset(2, 4)).toBe(big.actionsY + 2 * (UI.actionSize + UI.actionGap))
    const panel = panelWindowBounds(
      restPosition(workArea, 'bottom-right', 0, 4),
      4,
      'bottom-right',
      4,
    )
    expect(panel.width).toBe(panelWindowSize(4, 4).width)
    expect(panel.y + panel.height).toBe(workArea.height)
  })

  it('is at most as big as lets her panel fit the screen', () => {
    expect(largestSize(workArea, 8)).toBe(6)
    expect(largestSize({ width: 1280, height: 680 }, 4)).toBe(5)
    expect(largestSize({ width: 1366, height: 720 }, 9)).toBeLessThan(6)
    expect(largestSize({ width: 300, height: 300 }, 9)).toBe(0.5) // never less than the smallest
    for (const scale of CHARACTER_SIZES.filter(
      (s) => s <= largestSize({ width: 1366, height: 720 }, 9),
    )) {
      expect(panelWindowSize(9, scale).height).toBeLessThanOrEqual(720)
    }
  })
})

describe('cloneStrip', () => {
  it('runs along the bottom of the work area, as tall as her window', () => {
    const second = { x: 1920, y: 0, width: 1280, height: 984 }
    expect(cloneStrip(second, 2)).toEqual({
      x: 1920,
      y: 984 - (BUBBLE_BOX + UI.bubbleHeadroom) * 2,
      width: 1280,
      height: (BUBBLE_BOX + UI.bubbleHeadroom) * 2,
    })
  })
})

describe('isInside (is the pointer over her window?)', () => {
  const win = { x: 100, y: 900, width: 96, height: 104 }
  it('counts the left and top edges in, and the right and bottom edges out', () => {
    expect(isInside({ x: 100, y: 900 }, win)).toBe(true)
    expect(isInside({ x: 148, y: 950 }, win)).toBe(true)
    expect(isInside({ x: 195, y: 1003 }, win)).toBe(true)
    expect(isInside({ x: 196, y: 950 }, win)).toBe(false)
    expect(isInside({ x: 148, y: 1004 }, win)).toBe(false)
    expect(isInside({ x: 99, y: 950 }, win)).toBe(false)
    expect(isInside({ x: 148, y: 899 }, win)).toBe(false)
  })
})
