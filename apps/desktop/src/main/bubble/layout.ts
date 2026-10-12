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

/**
 * Where a bouncing bubble may go: every display's work area, plus the parts of a taskbar that lie
 * between two displays (where a monitor stacked above another has its taskbar along the edge they
 * share, say), so the bubble can pass over that taskbar from one display to the other. A taskbar
 * on an outer edge stays a wall.
 */
export function travelAreas(displays: { bounds: Rect; workArea: Rect }[]): Rect[] {
  const areas = displays.map((display) => display.workArea)
  for (const { bounds: b, workArea: w } of displays) {
    // The strips of the screen outside its work area (normally just the taskbar's).
    const strips = [
      { side: 'top', rect: { x: b.x, y: b.y, width: b.width, height: w.y - b.y } },
      {
        side: 'bottom',
        rect: {
          x: b.x,
          y: w.y + w.height,
          width: b.width,
          height: b.y + b.height - (w.y + w.height),
        },
      },
      { side: 'left', rect: { x: b.x, y: b.y, width: w.x - b.x, height: b.height } },
      {
        side: 'right',
        rect: {
          x: w.x + w.width,
          y: b.y,
          width: b.x + b.width - (w.x + w.width),
          height: b.height,
        },
      },
    ].filter((strip) => strip.rect.width > 0 && strip.rect.height > 0)
    for (const { side, rect } of strips) {
      for (const { bounds: n } of displays) {
        if (n === b) continue
        const bridge = bridgeTo(side, rect, b, n)
        if (bridge) areas.push(bridge)
      }
    }
  }
  return areas
}

/** Edges this close count as touching (scaled displays can be a pixel out). */
const TOUCHING = 1

/**
 * The part of `strip` (on `side` of the display with `bounds`) that another display (`other`)
 * lies right beyond, or null if `other` isn't there.
 */
function bridgeTo(side: string, strip: Rect, bounds: Rect, other: Rect): Rect | null {
  const near = (a: number, b: number) => Math.abs(a - b) <= TOUCHING
  const vertical = side === 'top' || side === 'bottom'
  const touching =
    side === 'top'
      ? near(other.y + other.height, bounds.y)
      : side === 'bottom'
        ? near(other.y, bounds.y + bounds.height)
        : side === 'left'
          ? near(other.x + other.width, bounds.x)
          : near(other.x, bounds.x + bounds.width)
  if (!touching) return null
  // Only as far along the edge as the other display reaches.
  if (vertical) {
    const from = Math.max(strip.x, other.x)
    const to = Math.min(strip.x + strip.width, other.x + other.width)
    return to > from ? { ...strip, x: from, width: to - from } : null
  }
  const from = Math.max(strip.y, other.y)
  const to = Math.min(strip.y + strip.height, other.y + other.height)
  return to > from ? { ...strip, y: from, height: to - from } : null
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
