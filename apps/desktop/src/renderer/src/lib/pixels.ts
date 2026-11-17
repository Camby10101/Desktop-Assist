// Drawing pixel art for her spells' effects, a pixel at a time. Everything draws through a
// Painter, the one thing it needs from a canvas (filling a rectangle with a colour), so the
// effects can be drawn, and tested, away from a page. On a page, spellArt.ts makes one of a
// canvas's 2D context.

/** What the spells draw with: fills a rectangle of pixels with `colour`, at `alpha` (0 to 1). */
export interface Painter {
  rect(x: number, y: number, width: number, height: number, colour: string, alpha: number): void
}

/** Sets one pixel (rounded to the nearest), if `alpha` is above nothing. */
export function plot(p: Painter, x: number, y: number, colour: string, alpha = 1): void {
  if (alpha <= 0) return
  p.rect(Math.round(x), Math.round(y), 1, 1, colour, Math.min(1, alpha))
}

/** A square of `size` pixels, its top-left corner at `x`, `y`. */
export function square(p: Painter, x: number, y: number, size: number, colour: string, alpha = 1) {
  if (alpha <= 0) return
  p.rect(Math.round(x), Math.round(y), size, size, colour, Math.min(1, alpha))
}

/** A plus-shaped twinkle: a white pixel and its four neighbours in `colour`, a little fainter. */
export function twinkle(p: Painter, x: number, y: number, colour: string, alpha = 1): void {
  plot(p, x, y, '#ffffff', alpha)
  plot(p, x + 1, y, colour, alpha * 0.8)
  plot(p, x - 1, y, colour, alpha * 0.8)
  plot(p, x, y + 1, colour, alpha * 0.8)
  plot(p, x, y - 1, colour, alpha * 0.8)
}

/** A straight line of pixels (Bresenham's), at most 2000 long. */
export function line(
  p: Painter,
  from: { x: number; y: number },
  to: { x: number; y: number },
  colour: string,
  alpha = 1,
): void {
  let x = Math.round(from.x)
  let y = Math.round(from.y)
  const x1 = Math.round(to.x)
  const y1 = Math.round(to.y)
  const dx = Math.abs(x1 - x)
  const dy = -Math.abs(y1 - y)
  const sx = x < x1 ? 1 : -1
  const sy = y < y1 ? 1 : -1
  let error = dx + dy
  for (let i = 0; i < 2000; i++) {
    plot(p, x, y, colour, alpha)
    if (x === x1 && y === y1) return
    const e2 = 2 * error
    if (e2 >= dy) {
      error += dy
      x += sx
    }
    if (e2 <= dx) {
      error += dx
      y += sy
    }
  }
}

/** An ellipse's outline, a pixel at a time; `gap` leaves every other `gap` radians out (dashes). */
export function ring(
  p: Painter,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  colour: string,
  alpha = 1,
  turn = 0,
  gap = 0,
): void {
  if (rx < 0.5) return
  const steps = Math.max(8, Math.ceil(Math.PI * 2 * Math.max(rx, ry)))
  for (let k = 0; k < steps; k++) {
    const a = (k / steps) * Math.PI * 2
    if (gap && Math.floor((a + turn) / gap) % 2 === 1) continue
    plot(p, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, colour, alpha)
  }
}

/** A filled ellipse, a row of pixels at a time. */
export function disc(
  p: Painter,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  colour: string,
  alpha = 1,
): void {
  if (alpha <= 0 || rx < 0.5 || ry < 0.5) return
  for (let dy = -Math.floor(ry); dy <= Math.floor(ry); dy++) {
    const half = rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2))
    if (half < 0.5) continue
    p.rect(
      Math.round(cx - half),
      Math.round(cy + dy),
      Math.round(half * 2),
      1,
      colour,
      Math.min(1, alpha),
    )
  }
}
