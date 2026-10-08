import {
  BUBBLE_BOX,
  UI,
  isLeftCorner,
  isTopCorner,
  panelWindowSize,
  type Corner,
  type Point,
  type Rect,
} from '@shared/geometry'

// Positions are the top-left corner of the bubble circle itself, not of its window.

export interface TravelBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** The bubble's resting place in `corner` of the work area (the screen minus the taskbar). */
export function homePosition(workArea: Rect, corner: Corner = 'bottom-right'): Point {
  return {
    x: isLeftCorner(corner)
      ? workArea.x + UI.edgeMargin
      : workArea.x + workArea.width - UI.edgeMargin - UI.bubbleSize,
    y: isTopCorner(corner)
      ? workArea.y + UI.edgeMargin
      : workArea.y + workArea.height - UI.edgeMargin - UI.bubbleSize,
  }
}

/** The corner nearest the bubble: whichever quarter of the work area its centre is in. */
export function nearestCorner(workArea: Rect, bubble: Point): Corner {
  const centreX = bubble.x + UI.bubbleSize / 2
  const centreY = bubble.y + UI.bubbleSize / 2
  const top = centreY < workArea.y + workArea.height / 2
  const left = centreX < workArea.x + workArea.width / 2
  return `${top ? 'top' : 'bottom'}-${left ? 'left' : 'right'}`
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

/**
 * The panel window shares the bubble window's corner that points into the screen's `corner`, so
 * it extends toward the middle of the screen (left and up from bottom-right, and so on).
 */
export function panelWindowBounds(
  bubble: Point,
  actionCount: number,
  corner: Corner = 'bottom-right',
): Rect {
  const box = bubbleWindowBounds(bubble)
  const size = panelWindowSize(actionCount)
  return {
    x: isLeftCorner(corner) ? box.x : box.x + box.width - size.width,
    y: isTopCorner(corner) ? box.y : box.y + box.height - size.height,
    ...size,
  }
}
