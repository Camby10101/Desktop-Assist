import { describe, expect, it } from 'vitest'
import { actionBottom, BUBBLE_BOX, panelWindowSize, UI } from '@shared/geometry'
import {
  bubbleWindowBounds,
  homePosition,
  panelWindowBounds,
  travelBox,
} from '../src/main/bubble/layout'

const workArea = { x: 0, y: 0, width: 1920, height: 1040 } // 1080p minus a 40px taskbar

describe('homePosition', () => {
  it('sits in the bottom-right corner, 16px in from the work area edges', () => {
    expect(homePosition(workArea)).toEqual({ x: 1920 - 16 - 56, y: 1040 - 16 - 56 })
  })

  it('follows a work area that does not start at the origin (taskbar on top or left)', () => {
    const offset = { x: 48, y: 40, width: 1872, height: 1040 }
    expect(homePosition(offset)).toEqual({ x: 48 + 1872 - 72, y: 40 + 1040 - 72 })
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
  it('shares its bottom-right corner with the bubble window', () => {
    const home = homePosition(workArea)
    const bubble = bubbleWindowBounds(home)
    const panel = panelWindowBounds(home, 4)
    expect(panel.x + panel.width).toBe(bubble.x + bubble.width)
    expect(panel.y + panel.height).toBe(bubble.y + bubble.height)
  })

  it('fits on screen at home', () => {
    const panel = panelWindowBounds(homePosition(workArea), 4)
    expect(panel.x).toBeGreaterThanOrEqual(workArea.x)
    expect(panel.y).toBeGreaterThanOrEqual(workArea.y)
  })
})

describe('panelWindowSize', () => {
  it('is wide enough for the text box beside the bubble', () => {
    expect(panelWindowSize(4).width).toBe(
      UI.bubblePad + UI.bubbleSize + UI.gap + UI.panelWidth + UI.shadowPad,
    )
  })

  it('is tall enough for the text box at full height', () => {
    expect(panelWindowSize(4).height).toBe(UI.bubblePad + UI.panelMaxHeight + UI.shadowPad)
  })

  it('grows to fit a long action stack', () => {
    const top = actionBottom(11) + UI.actionSize
    expect(panelWindowSize(12).height).toBe(top + UI.shadowPad)
  })
})

describe('travelBox', () => {
  it('keeps the whole bubble inside the work area', () => {
    expect(travelBox(workArea)).toEqual({ minX: 0, minY: 0, maxX: 1920 - 56, maxY: 1040 - 56 })
  })
})
