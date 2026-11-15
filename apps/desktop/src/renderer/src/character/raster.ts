// A tiny pixel-art rasteriser for the character: shapes drawn straight onto a grid of pixels (no
// smoothing), then cel-shaded and outlined the way pixel artists do it by hand. Each body part is
// drawn into a Layer of materials (hair, skin, robe...); `ink()` turns a layer into palette
// letters, shading the side away from the light and outlining it in a dark shade of its own
// material, and lays it over the frame so far. Coordinates are in pixels; a pixel's centre is at
// (x + 0.5, y + 0.5).

export interface Point {
  x: number
  y: number
}

/** A material's letters (see PALETTE in sprite.ts): outline, shadow, base, and optionally light. */
export interface Ramp {
  line: string
  shade: string
  base: string
  light?: string
}

/** A body part's pixels, each the name of its material (or undefined: not part of it). */
export class Layer {
  readonly cells: (string | undefined)[]
  /** The box round every pixel set so far (empty while minX > maxX). */
  minX = Infinity
  minY = Infinity
  maxX = -Infinity
  maxY = -Infinity
  constructor(readonly size: number) {
    this.cells = new Array<string | undefined>(size * size)
  }

  get(x: number, y: number): string | undefined {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return undefined
    return this.cells[y * this.size + x]
  }

  set(x: number, y: number, material: string | undefined): void {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return
    this.cells[y * this.size + x] = material
    if (material === undefined) return
    this.minX = Math.min(this.minX, x)
    this.minY = Math.min(this.minY, y)
    this.maxX = Math.max(this.maxX, x)
    this.maxY = Math.max(this.maxY, y)
  }

  /** Fills every pixel whose centre passes `inside`, within the box from `min` to `max`. */
  fill(min: Point, max: Point, material: string, inside: (x: number, y: number) => boolean): void {
    const x0 = Math.max(0, Math.floor(min.x))
    const y0 = Math.max(0, Math.floor(min.y))
    const x1 = Math.min(this.size - 1, Math.ceil(max.x))
    const y1 = Math.min(this.size - 1, Math.ceil(max.y))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (inside(x + 0.5, y + 0.5)) this.set(x, y, material)
      }
    }
  }

  /** A filled polygon (even-odd rule). */
  polygon(points: Point[], material: string): void {
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    this.fill(
      { x: Math.min(...xs), y: Math.min(...ys) },
      { x: Math.max(...xs), y: Math.max(...ys) },
      material,
      (px, py) => {
        let inside = false
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const a = points[i]!
          const b = points[j]!
          if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside
          }
        }
        return inside
      },
    )
  }

  /** A filled ellipse. */
  ellipse(centre: Point, rx: number, ry: number, material: string): void {
    this.fill(
      { x: centre.x - rx, y: centre.y - ry },
      { x: centre.x + rx, y: centre.y + ry },
      material,
      (px, py) => ((px - centre.x) / rx) ** 2 + ((py - centre.y) / ry) ** 2 <= 1,
    )
  }

  /** A thick line from `a` to `b`, `ra` wide at `a` tapering (or swelling) to `rb` at `b`. */
  capsule(a: Point, b: Point, ra: number, rb: number, material: string): void {
    const r = Math.max(ra, rb)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length2 = dx * dx + dy * dy || 1
    this.fill(
      { x: Math.min(a.x, b.x) - r, y: Math.min(a.y, b.y) - r },
      { x: Math.max(a.x, b.x) + r, y: Math.max(a.y, b.y) + r },
      material,
      (px, py) => {
        const t = Math.min(1, Math.max(0, ((px - a.x) * dx + (py - a.y) * dy) / length2))
        const cx = a.x + dx * t
        const cy = a.y + dy * t
        return Math.hypot(px - cx, py - cy) <= ra + (rb - ra) * t
      },
    )
  }

  /** A chain of thick lines through `points`, its width going from `ra` to `rb`. */
  chain(points: Point[], ra: number, rb: number, material: string): void {
    for (let i = 0; i < points.length - 1; i++) {
      const t0 = i / (points.length - 1)
      const t1 = (i + 1) / (points.length - 1)
      this.capsule(points[i]!, points[i + 1]!, ra + (rb - ra) * t0, ra + (rb - ra) * t1, material)
    }
  }
}

/** A frame being drawn: rows of palette letters, `.` where nothing is drawn yet. */
export class Canvas {
  readonly cells: string[]
  constructor(readonly size: number) {
    this.cells = new Array<string>(size * size).fill('.')
  }

  get(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return '.'
    return this.cells[y * this.size + x]!
  }

  set(x: number, y: number, letter: string): void {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return
    this.cells[y * this.size + x] = letter
  }

  /**
   * Lays a layer over the frame: each pixel shaded by where it sits in its shape, then a one-pixel
   * outline round the shape in its material's darkest shade. `light` is where the light comes
   * from (a small offset, such as up and to the left): a pixel whose neighbour that way is outside
   * the shape is lit, and one whose neighbour the other way (twice as far) is outside is in shade.
   */
  ink(layer: Layer, ramps: Record<string, Ramp>, light: Point, outline = true): void {
    const inside = (x: number, y: number) => layer.get(x, y) !== undefined
    for (let y = layer.minY; y <= layer.maxY; y++) {
      for (let x = layer.minX; x <= layer.maxX; x++) {
        const material = layer.get(x, y)
        if (material === undefined) continue
        const ramp = ramps[material]!
        const shaded =
          !inside(x - light.x * 2, y - light.y * 2) || !inside(x - light.x, y - light.y)
        const lit = !inside(x + light.x, y + light.y)
        this.set(x, y, shaded ? ramp.shade : lit && ramp.light ? ramp.light : ramp.base)
      }
    }
    if (!outline) return
    for (let y = layer.minY - 1; y <= layer.maxY + 1; y++) {
      for (let x = layer.minX - 1; x <= layer.maxX + 1; x++) {
        if (inside(x, y)) continue
        const next =
          layer.get(x - 1, y) ?? layer.get(x + 1, y) ?? layer.get(x, y - 1) ?? layer.get(x, y + 1)
        if (next !== undefined) this.set(x, y, ramps[next]!.line)
      }
    }
  }

  /** Stamps a small hand-drawn picture (rows of letters, `.` see-through) at a place. */
  stamp(rows: readonly string[], x: number, y: number, flip = false): void {
    rows.forEach((row, dy) => {
      const letters = flip ? [...row].reverse() : [...row]
      letters.forEach((letter, dx) => {
        if (letter !== '.') this.set(Math.round(x) + dx, Math.round(y) + dy, letter)
      })
    })
  }

  rows(): string[] {
    const rows: string[] = []
    for (let y = 0; y < this.size; y++) {
      rows.push(this.cells.slice(y * this.size, (y + 1) * this.size).join(''))
    }
    return rows
  }
}

/** `v` turned by `angle` (radians, clockwise on screen). */
export function rotate(v: Point, angle: number): Point {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c }
}

export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y })

/**
 * The end of a limb `length` long from `origin`, at `angle` from straight down: positive swings
 * it toward the way she faces (+x), negative behind her.
 */
export function limb(origin: Point, length: number, angle: number): Point {
  return { x: origin.x + Math.sin(angle) * length, y: origin.y + Math.cos(angle) * length }
}
