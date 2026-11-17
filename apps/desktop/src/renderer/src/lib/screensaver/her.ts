import type { Painter } from '../pixels'

// Her in the screen saver's sunset, her back to us (character/sprite.ts's gazeFrames), painted a
// pixel row at a time on the scene's canvas, one of her sprite's pixels to one of its. The sun is
// in front of her, so her colours are dimmed toward the dusk and a rim of warm light runs round
// her edges, brightest on the sun's side.

/** The colour her colours are dimmed toward with the sun behind her, and the light round her. */
export const DUSK = '#2a1a3e'
export const RIM = '#ffc58f'

/** The letter of her shadow on the ground (see PALETTE in character/sprite.ts): no rim for it. */
const SHADOW = 'x'

/** `#rrggbb` (or `rgb(r, g, b)` / `rgba(r, g, b, a)`) as its numbers, or null if it isn't one. */
export function parseColour(colour: string): { r: number; g: number; b: number; a: number } | null {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour)
  if (hex) {
    const [r, g, b] = hex.slice(1).map((v) => parseInt(v, 16)) as [number, number, number]
    return { r, g, b, a: 1 }
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
    colour,
  )
  if (!rgb) return null
  return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: Number(rgb[4] ?? 1) }
}

/** `colour` dimmed `amount` (0 to 1) of the way toward the dusk, keeping its opacity. */
export function backlit(colour: string, amount = 0.4): string {
  const c = parseColour(colour)
  const dusk = parseColour(DUSK)!
  if (!c) return colour
  const mix = (a: number, b: number) => Math.round(a + (b - a) * amount)
  const [r, g, b] = [mix(c.r, dusk.r), mix(c.g, dusk.g), mix(c.b, dusk.b)]
  return c.a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${c.a})`
}

/**
 * A frame of her (`rows` of palette letters, `.` see-through) with its top-left pixel at `x`,
 * `y`: each run of one letter along a row in its colour from `colours` (already dimmed), then the
 * rim of light along her edges: where the pixel beside her toward the sun (`sunSide`, 1 for
 * right) is empty, above her, and fainter on her other side.
 */
export function paintHer(
  p: Painter,
  rows: readonly string[],
  x: number,
  y: number,
  colours: Readonly<Record<string, string>>,
  sunSide: 1 | -1,
): void {
  const at = (r: number, c: number) => rows[r]?.[c] ?? '.'
  const empty = (r: number, c: number) => at(r, c) === '.' || at(r, c) === SHADOW
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length;) {
      const letter = row[c]!
      let end = c + 1
      while (end < row.length && row[end] === letter) end++
      const colour = colours[letter]
      if (letter !== '.' && colour) p.rect(x + c, y + r, end - c, 1, colour, 1)
      c = end
    }
  })
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (empty(r, c)) continue
      const light = empty(r, c + sunSide)
        ? 0.6
        : empty(r - 1, c)
          ? 0.4
          : empty(r, c - sunSide)
            ? 0.22
            : 0
      if (light > 0) p.rect(x + c, y + r, 1, 1, RIM, light)
    }
  })
}
