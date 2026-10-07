import { describe, expect, it } from 'vitest'
import { actionOffset, BUBBLE_BOX, panelWindowSize, UI, type Corner } from '@shared/geometry'
import {
  bubbleWindowBounds,
  homePosition,
  nearestCorner,
  panelWindowBounds,
  travelBox,
} from '../src/main/bubble/layout'

const workArea = { x: 0, y: 0, width: 1920, height: 1040 } // 1080p minus a 40px taskbar
const CORNERS: Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

describe('homePosition', () => {
  it('sits in the bottom-right corner by default, 16px in from the work area edges', () => {
    expect(homePosition(workArea)).toEqual({ x: 1920 - 16 - 56, y: 1040 - 16 - 56 })
  })

  it('sits 16px in from the edges in every corner', () => {
    expect(homePosition(workArea, 'top-left')).toEqual({ x: 16, y: 16 })
    expect(homePosition(workArea, 'top-right')).toEqual({ x: 1920 - 72, y: 16 })
    expect(homePosition(workArea, 'bottom-left')).toEqual({ x: 16, y: 1040 - 72 })
  })

  it('follows a work area that does not start at the origin (a second monitor, a top taskbar)', () => {
    const second = { x: 1920, y: 40, width: 1280, height: 984 }
    expect(homePosition(second, 'top-left')).toEqual({ x: 1920 + 16, y: 40 + 16 })
    expect(homePosition(second)).toEqual({ x: 1920 + 1280 - 72, y: 40 + 984 - 72 })
  })
})

describe('nearestCorner', () => {
  it('picks the corner of the quarter the bubble is in', () => {
    expect(nearestCorner(workArea, { x: 100, y: 100 })).toBe('top-left')
    expect(nearestCorner(workArea, { x: 1500, y: 100 })).toBe('top-right')
    expect(nearestCorner(workArea, { x: 100, y: 900 })).toBe('bottom-left')
    expect(nearestCorner(workArea, { x: 1500, y: 900 })).toBe('bottom-right')
  })

  it('measures from the bubble centre, on displays that are not at the origin', () => {
    const second = { x: -1280, y: 0, width: 1280, height: 1024 } // a monitor to the left
    // Bubble's left edge is right of the middle only once its centre is: -640 is the middle.
    expect(nearestCorner(second, { x: -660, y: 10 })).toBe('top-right')
    expect(nearestCorner(second, { x: -700, y: 10 })).toBe('top-left')
  })

  it('every home position snaps back to its own corner', () => {
    for (const corner of CORNERS) {
      expect(nearestCorner(workArea, homePosition(workArea, corner))).toBe(corner)
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
    for (const corner of CORNERS) {
      const home = homePosition(workArea, corner)
      const bubble = bubbleWindowBounds(home)
      const panel = panelWindowBounds(home, 4, corner)
      const left = corner.endsWith('left')
      const top = corner.startsWith('top')
      expect(left ? panel.x : panel.x + panel.width).toBe(left ? bubble.x : bubble.x + bubble.width)
      expect(top ? panel.y : panel.y + panel.height).toBe(top ? bubble.y : bubble.y + bubble.height)
    }
  })

  it('fits on screen in every corner', () => {
    for (const corner of CORNERS) {
      const panel = panelWindowBounds(homePosition(workArea, corner), 4, corner)
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

describe('travelBox', () => {
  it('keeps the whole bubble inside the work area', () => {
    expect(travelBox(workArea)).toEqual({ minX: 0, minY: 0, maxX: 1920 - 56, maxY: 1040 - 56 })
  })
})
