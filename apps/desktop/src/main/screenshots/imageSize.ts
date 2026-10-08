import type { Size } from '@shared/geometry'

/** Screenshots sent to Claude are scaled so their longest side is at most this many pixels. */
export const MAX_IMAGE_EDGE = 1568

/** Scales `size` down (never up) so its longest side fits within `maxEdge`, keeping the shape. */
export function fitWithin(size: Size, maxEdge: number = MAX_IMAGE_EDGE): Size {
  const longest = Math.max(size.width, size.height)
  if (longest <= maxEdge) return { ...size }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  }
}
