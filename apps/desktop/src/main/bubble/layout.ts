import {
  DEFAULT_SIZE,
  UI,
  bubbleMetrics,
  isLeftCorner,
  isTopCorner,
  panelWindowSize,
  type Corner,
  type Point,
  type Rect,
} from '@shared/geometry'

// Positions are the top-left corner of the bubble's box (where the character is drawn, inside
// its window's padding), not of its window. `scale` is her size (see CHARACTER_SIZES): the box
// and its padding grow with her, the margin to the screen's side doesn't.

/** How far from its corner the character can stand on this work area and still be wholly on it. */
export function maxInset(workArea: Rect, scale: number = DEFAULT_SIZE): number {
  return Math.max(0, workArea.width - 2 * UI.edgeMargin - bubbleMetrics(scale).size)
}

/**
 * Where the character stands: on the taskbar (its window's bottom edge on the work area's), in the
 * bottom corner on `corner`'s side, `inset` along toward the middle of the screen. Only the side
 * of `corner` matters: the character always stands at the bottom.
 */
export function restPosition(
  workArea: Rect,
  corner: Corner = 'bottom-right',
  inset = 0,
  scale: number = DEFAULT_SIZE,
): Point {
  const { size, pad } = bubbleMetrics(scale)
  const along = Math.min(Math.max(inset, 0), maxInset(workArea, scale))
  return {
    x: isLeftCorner(corner)
      ? workArea.x + UI.edgeMargin + along
      : workArea.x + workArea.width - UI.edgeMargin - size - along,
    y: workArea.y + workArea.height - pad - size,
  }
}

/** The inset (see restPosition) of a character standing at `x`, kept on the work area. */
export function insetAt(
  workArea: Rect,
  corner: Corner,
  x: number,
  scale: number = DEFAULT_SIZE,
): number {
  const inset = isLeftCorner(corner)
    ? x - (workArea.x + UI.edgeMargin)
    : workArea.x + workArea.width - UI.edgeMargin - bubbleMetrics(scale).size - x
  return Math.min(Math.max(inset, 0), maxInset(workArea, scale))
}

/** The bottom corner nearest the character: whichever half of the work area its centre is in. */
export function nearestCorner(workArea: Rect, bubble: Point, scale: number = DEFAULT_SIZE): Corner {
  const centreX = bubble.x + bubbleMetrics(scale).size / 2
  return centreX < workArea.x + workArea.width / 2 ? 'bottom-left' : 'bottom-right'
}

/** Her window: her box and its padding, and her headroom above them (see bubbleMetrics). */
export function bubbleWindowBounds(bubble: Point, scale: number = DEFAULT_SIZE): Rect {
  const { pad, box, headroom } = bubbleMetrics(scale)
  return {
    x: Math.round(bubble.x) - pad,
    y: Math.round(bubble.y) - pad - headroom,
    width: box,
    height: box + headroom,
  }
}

/**
 * The panel window shares the bubble window's corner that points into the screen's `corner`, so
 * it extends toward the middle of the screen (left and up from bottom-right, and so on). A top
 * corner is the top of her padding, below her headroom, so the panel lines up with her box the
 * same way from either end.
 */
export function panelWindowBounds(
  bubble: Point,
  actionCount: number,
  corner: Corner = 'bottom-right',
  scale: number = DEFAULT_SIZE,
): Rect {
  const box = bubbleWindowBounds(bubble, scale)
  const size = panelWindowSize(actionCount, scale)
  return {
    x: isLeftCorner(corner) ? box.x : box.x + box.width - size.width,
    y: isTopCorner(corner)
      ? box.y + bubbleMetrics(scale).headroom
      : box.y + box.height - size.height,
    ...size,
  }
}

/**
 * Where her clones walk: a strip as tall as her window (headroom and all) along the bottom of the
 * work area, its bottom edge on the taskbar, so they stand where she does.
 */
export function cloneStrip(workArea: Rect, scale: number = DEFAULT_SIZE): Rect {
  const { box, headroom } = bubbleMetrics(scale)
  return {
    x: workArea.x,
    y: workArea.y + workArea.height - box - headroom,
    width: workArea.width,
    height: box + headroom,
  }
}
