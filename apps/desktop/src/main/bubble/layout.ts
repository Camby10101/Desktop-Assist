import { BUBBLE_BOX, UI, panelWindowSize, type Point, type Rect } from '@shared/geometry'

// Positions are the top-left corner of the bubble circle itself, not of its window.

export interface TravelBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** The bubble's resting place: bottom-right of the work area (above the taskbar). */
export function homePosition(workArea: Rect): Point {
  return {
    x: workArea.x + workArea.width - UI.edgeMargin - UI.bubbleSize,
    y: workArea.y + workArea.height - UI.edgeMargin - UI.bubbleSize,
  }
}

/** Every position where the bubble is fully inside the work area. */
export function travelBox(workArea: Rect): TravelBox {
  return {
    minX: workArea.x,
    minY: workArea.y,
    maxX: workArea.x + workArea.width - UI.bubbleSize,
    maxY: workArea.y + workArea.height - UI.bubbleSize,
  }
}

export function bubbleWindowBounds(bubble: Point): Rect {
  return {
    x: Math.round(bubble.x) - UI.bubblePad,
    y: Math.round(bubble.y) - UI.bubblePad,
    width: BUBBLE_BOX,
    height: BUBBLE_BOX,
  }
}

/** The panel window shares its bottom-right corner with the bubble window. */
export function panelWindowBounds(bubble: Point, actionCount: number): Rect {
  const box = bubbleWindowBounds(bubble)
  const size = panelWindowSize(actionCount)
  return {
    x: box.x + box.width - size.width,
    y: box.y + box.height - size.height,
    ...size,
  }
}
