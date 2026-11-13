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

// Positions are the top-left corner of the bubble's box (where the character is drawn, inside
// its window's padding), not of its window.

export interface TravelBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** How far from its corner the character can stand on this work area and still be wholly on it. */
export function maxInset(workArea: Rect): number {
  return Math.max(0, workArea.width - 2 * UI.edgeMargin - UI.bubbleSize)
}

/**
 * Where the character stands: on the taskbar (its window's bottom edge on the work area's), in the
 * bottom corner on `corner`'s side, `inset` along toward the middle of the screen. Only the side
 * of `corner` matters: the character always stands at the bottom.
 */
export function restPosition(workArea: Rect, corner: Corner = 'bottom-right', inset = 0): Point {
  const along = Math.min(Math.max(inset, 0), maxInset(workArea))
  return {
    x: isLeftCorner(corner)
      ? workArea.x + UI.edgeMargin + along
      : workArea.x + workArea.width - UI.edgeMargin - UI.bubbleSize - along,
    y: workArea.y + workArea.height - UI.bubblePad - UI.bubbleSize,
  }
}

/** The inset (see restPosition) of a character standing at `x`, kept on the work area. */
export function insetAt(workArea: Rect, corner: Corner, x: number): number {
  const inset = isLeftCorner(corner)
    ? x - (workArea.x + UI.edgeMargin)
    : workArea.x + workArea.width - UI.edgeMargin - UI.bubbleSize - x
  return Math.min(Math.max(inset, 0), maxInset(workArea))
}

/** The bottom corner nearest the character: whichever half of the work area its centre is in. */
export function nearestCorner(workArea: Rect, bubble: Point): Corner {
  const centreX = bubble.x + UI.bubbleSize / 2
  return centreX < workArea.x + workArea.width / 2 ? 'bottom-left' : 'bottom-right'
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
