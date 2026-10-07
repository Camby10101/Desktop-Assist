import { describe, expect, it } from 'vitest'
import { circleBitmap, parseHexColor } from '../src/main/trayIcon'

describe('circleBitmap', () => {
  const size = 32
  const pixels = circleBitmap(size, '#1B6AC9')
  const pixel = (x: number, y: number) => [
    ...pixels.subarray((y * size + x) * 4, (y * size + x) * 4 + 4),
  ]

  it('is size × size BGRA pixels', () => {
    expect(pixels.length).toBe(size * size * 4)
  })

  it('fills the centre with the colour, in BGRA order', () => {
    expect(pixel(16, 16)).toEqual([0xc9, 0x6a, 0x1b, 0xff])
  })

  it('leaves the corners transparent', () => {
    expect(pixel(0, 0)).toEqual([0, 0, 0, 0])
    expect(pixel(31, 31)).toEqual([0, 0, 0, 0])
  })

  it('anti-aliases the edge with premultiplied alpha', () => {
    const [b, g, r, a] = pixel(16, 0)
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThan(255)
    expect(b).toBeLessThanOrEqual(a!)
    expect(g).toBeLessThanOrEqual(a!)
    expect(r).toBeLessThanOrEqual(a!)
  })
})

describe('parseHexColor', () => {
  it('parses #RRGGBB', () => {
    expect(parseHexColor('#ff8000')).toEqual([255, 128, 0])
  })

  it('rejects anything else', () => {
    expect(() => parseHexColor('red')).toThrow()
    expect(() => parseHexColor('#fff')).toThrow()
  })
})
