import { describe, expect, it } from 'vitest'
import {
  MAX_STACK_WIDTH,
  STACK_GAP,
  stackBitmaps,
  stackWidth,
  type Bitmap,
} from '../src/main/screenshots/stack'

/** A bitmap filled with one BGRA colour. */
function solid(width: number, height: number, bgra: number[]): Bitmap {
  return { width, height, data: Buffer.alloc(width * height * 4, Buffer.from(bgra)) }
}

/** The BGRA bytes of the pixel at column x, row y. */
function pixel(bitmap: Bitmap, x: number, y: number): number[] {
  const at = (y * bitmap.width + x) * 4
  return [...bitmap.data.subarray(at, at + 4)]
}

describe('stackWidth', () => {
  it("is the narrowest screenshot's width, so none is enlarged", () => {
    expect(
      stackWidth([
        { width: 1920, height: 1080 },
        { width: 1366, height: 768 },
      ]),
    ).toBe(1366)
  })

  it('is capped, so stacking 4K screenshots stays a sensible size', () => {
    expect(
      stackWidth([
        { width: 3840, height: 2160 },
        { width: 3840, height: 2160 },
      ]),
    ).toBe(MAX_STACK_WIDTH)
  })
})

describe('stackBitmaps', () => {
  const red = [0, 0, 255, 255]
  const blue = [255, 0, 0, 255]

  it('puts the images top to bottom in order, with an opaque grey band between them', () => {
    const stacked = stackBitmaps([solid(4, 3, red), solid(4, 2, blue)])
    expect(stacked.width).toBe(4)
    expect(stacked.height).toBe(3 + STACK_GAP + 2)
    expect(stacked.data.length).toBe(stacked.width * stacked.height * 4)
    expect(pixel(stacked, 0, 0)).toEqual(red)
    expect(pixel(stacked, 3, 2)).toEqual(red)
    expect(pixel(stacked, 2, 3)).toEqual([0x99, 0x99, 0x99, 0xff])
    expect(pixel(stacked, 1, 3 + STACK_GAP - 1)).toEqual([0x99, 0x99, 0x99, 0xff])
    expect(pixel(stacked, 0, 3 + STACK_GAP)).toEqual(blue)
    expect(pixel(stacked, 3, stacked.height - 1)).toEqual(blue)
  })

  it('leaves a single image as it is', () => {
    const only = solid(5, 5, red)
    expect(stackBitmaps([only])).toEqual(only)
  })

  it('refuses images of different widths or with unexpected row padding', () => {
    expect(() => stackBitmaps([solid(4, 2, red), solid(5, 2, red)])).toThrow()
    expect(() => stackBitmaps([{ width: 4, height: 2, data: Buffer.alloc(40) }])).toThrow()
    expect(() => stackBitmaps([])).toThrow()
  })
})
