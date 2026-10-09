import type { Size } from '@shared/geometry'

/** Raw pixels, 4 bytes each (Electron's BGRA bitmaps), row after row with no padding. */
export interface Bitmap extends Size {
  data: Buffer
}

/** Stacked screenshots are never wider than this, to keep the combined image a sensible size. */
export const MAX_STACK_WIDTH = 2560

/** Height of the grey band between stacked screenshots, in pixels. */
export const STACK_GAP = 12

const GAP_PIXEL = Buffer.from([0x99, 0x99, 0x99, 0xff]) // opaque mid-grey

/** The width screenshots are scaled to before stacking: the narrowest one's, so none is enlarged. */
export function stackWidth(sizes: Size[]): number {
  return Math.min(MAX_STACK_WIDTH, ...sizes.map((size) => size.width))
}

/** One image of `bitmaps` from top to bottom, with a grey band between each. All must be as wide. */
export function stackBitmaps(bitmaps: Bitmap[]): Bitmap {
  const width = bitmaps[0]?.width
  if (width === undefined) throw new Error('Nothing to stack')
  for (const bitmap of bitmaps) {
    if (bitmap.width !== width) throw new Error('Stacked images must be the same width')
    if (bitmap.data.length !== bitmap.width * bitmap.height * 4) {
      throw new Error('Unexpected bitmap layout')
    }
  }
  const gap = Buffer.alloc(width * STACK_GAP * 4, GAP_PIXEL)
  const parts = bitmaps.flatMap((bitmap, i) => (i === 0 ? [bitmap.data] : [gap, bitmap.data]))
  const height = bitmaps.reduce((sum, b) => sum + b.height, 0) + STACK_GAP * (bitmaps.length - 1)
  return { width, height, data: Buffer.concat(parts) }
}
