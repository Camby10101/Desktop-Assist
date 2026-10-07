/**
 * A filled, anti-aliased circle as raw premultiplied BGRA pixels: the format
 * nativeImage.createFromBitmap expects on Windows. Used as the tray icon until a tenant ships
 * its own.
 */
export function circleBitmap(size: number, hexColor: string): Buffer {
  const [r, g, b] = parseHexColor(hexColor)
  const pixels = Buffer.alloc(size * size * 4)
  const centre = size / 2
  const radius = size / 2 - 0.5
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x + 0.5 - centre, y + 0.5 - centre)
      const alpha = Math.min(1, Math.max(0, radius - distance + 0.5))
      const i = (y * size + x) * 4
      pixels[i] = Math.round(b * alpha)
      pixels[i + 1] = Math.round(g * alpha)
      pixels[i + 2] = Math.round(r * alpha)
      pixels[i + 3] = Math.round(255 * alpha)
    }
  }
  return pixels
}

export function parseHexColor(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) throw new Error(`Not a #RRGGBB colour: ${hex}`)
  return [parseInt(match[1]!, 16), parseInt(match[2]!, 16), parseInt(match[3]!, 16)]
}
