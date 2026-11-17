import { CHARACTER_SIZES } from '@shared/geometry'

/** Her size as people say it: "½×", "1.5×", "6×". */
export function sizeLabel(scale: number): string {
  return `${scale === 0.5 ? '½' : scale === 0.75 ? '¾' : scale}×`
}

/** The next size down, or up, of CHARACTER_SIZES, no bigger than `max`; null at either end. */
export function nextSize(scale: number, way: 1 | -1, max: number): number | null {
  const sizes = CHARACTER_SIZES.filter((size) => size <= max)
  const next = way === 1 ? sizes.find((size) => size > scale) : sizes.findLast((s) => s < scale)
  return next ?? null
}
