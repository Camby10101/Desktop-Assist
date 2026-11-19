import { describe, expect, it } from 'vitest'
import { draw, GRID, HEADROOM } from '../src/renderer/src/character/rig'
import { gazeFrames } from '../src/renderer/src/character/sprite'
import type { Painter } from '../src/renderer/src/lib/pixels'
import { backlit, DUSK, paintHer, parseColour, RIM } from '../src/renderer/src/lib/screensaver/her'
import {
  DRAGON,
  DRAGON_FRAMES,
  dragonAt,
  paintDragon,
} from '../src/renderer/src/lib/screensaver/dragon'
import { dither, type SaverFrame } from '../src/renderer/src/lib/screensaver/scene'
import {
  FALL,
  fallingStarsAt,
  paintNight,
  paintStarfall,
} from '../src/renderer/src/lib/screensaver/stars'
import {
  CLOUD_COUNT,
  cloudsAt,
  herSpot,
  HILLS,
  horizon,
  paintClouds,
  paintEveningStars,
  paintLife,
  paintSun,
  paintSunsetHills,
  paintSunsetSky,
  ridge,
  stripeAt,
  sunAt,
} from '../src/renderer/src/lib/screensaver/sunset'

// A 1920 × 1080 screen, three DIPs to a pixel.
const [W, H] = [640, 360]
const frame = (t: number): SaverFrame => ({ t, w: W, h: H })

/** A Painter that counts what's drawn on the canvas, and remembers each rectangle. */
function counter() {
  const rects: { x: number; y: number; width: number; height: number; colour: string }[] = []
  const painter: Painter = {
    rect(x, y, width, height, colour, alpha) {
      if (alpha <= 0.01 || x + width <= 0 || y + height <= 0 || x >= W || y >= H) return
      rects.push({ x, y, width, height, colour })
    },
  }
  return { rects, painter }
}

/** Whether every pixel of the canvas is covered by one of `rects`. */
function covers(rects: { x: number; y: number; width: number; height: number }[]): boolean {
  const seen = new Uint8Array(W * H)
  for (const r of rects) {
    for (let y = Math.max(0, r.y); y < Math.min(H, r.y + r.height); y++) {
      for (let x = Math.max(0, r.x); x < Math.min(W, r.x + r.width); x++) seen[y * W + x] = 1
    }
  }
  return seen.every((v) => v === 1)
}

describe('the screen saver’s scenes', () => {
  it('dithers a quarter, a half and three quarters of the pixels evenly', () => {
    for (const share of [0.25, 0.5, 0.75]) {
      let taken = 0
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (dither(x, y, share)) taken++
      expect(taken).toBe(16 * share)
    }
    expect(dither(0, 0, 0)).toBe(false)
    expect(dither(1, 1, 1)).toBe(true)
  })

  it('paints the whole sky and the whole night, and the hills down to the bottom', () => {
    const sky = counter()
    paintSunsetSky(sky.painter, W, H)
    expect(covers(sky.rects)).toBe(true)
    const night = counter()
    paintNight(night.painter, W, H)
    expect(covers(night.rects)).toBe(true)
    const hills = counter()
    paintSunsetHills(hills.painter, W, H)
    // The nearest hill reaches the bottom all the way across.
    for (let x = 0; x < W; x += 37) {
      expect(hills.rects.some((r) => r.x === x && r.y + r.height === H)).toBe(true)
    }
  })

  it('stands her on the crest of the nearest hill, left of the sun, the sun setting behind the hills', () => {
    const { x, feet } = herSpot(W, H)
    const near = HILLS.length - 1
    expect(x).toBeLessThan(sunAt(0, W, H).x)
    // The crest: the hill's top is no higher a little either side of her.
    for (const dx of [-12, -6, 6, 12]) {
      expect(ridge(near, x + dx, W, H)).toBeGreaterThanOrEqual(ridge(near, x, W, H) - 1.5)
    }
    expect(feet).toBe(Math.round(ridge(near, x, W, H)) + 1)
    // All of her on the screen, her hat against the sky above the horizon.
    expect(feet - (GRID + HEADROOM)).toBeGreaterThan(0)
    expect(feet - GRID).toBeLessThan(horizon(H))
    // The sun: low, its bottom behind the farthest hills, its top well clear of them.
    for (const t of [0, 10_000, 60_000]) {
      const sun = sunAt(t, W, H)
      const far = ridge(0, sun.x, W, H)
      expect(sun.y + sun.r).toBeGreaterThan(far)
      expect(sun.y - sun.r).toBeLessThan(far - sun.r)
    }
  })

  it('moves the sun only very slightly, and slides its stripes down', () => {
    const suns = Array.from({ length: 120 }, (_, i) => sunAt(i * 1000, W, H))
    const spread = (values: number[]) => Math.max(...values) - Math.min(...values)
    expect(spread(suns.map((s) => s.x))).toBeGreaterThan(0.5)
    expect(spread(suns.map((s) => s.x))).toBeLessThan(3)
    expect(spread(suns.map((s) => s.y))).toBeLessThan(4)
    // No stripes over its top half; some across its bottom half, and they move.
    expect(Array.from({ length: 20 }, (_, i) => stripeAt(-1 + i / 20, 0)).some(Boolean)).toBe(false)
    const rows = (t: number) => Array.from({ length: 40 }, (_, i) => stripeAt(i / 40, t))
    expect(rows(0).some(Boolean)).toBe(true)
    expect(rows(0)).not.toEqual(rows(2_000))
  })

  it('drifts the clouds slowly right across the sky, round and round, all of them above the horizon', () => {
    const before = cloudsAt(0, W, H)
    const after = cloudsAt(1_000, W, H)
    expect(before).toHaveLength(CLOUD_COUNT)
    before.forEach((cloud, k) => {
      expect(cloud.y).toBeLessThan(horizon(H))
      const moved = after[k]!.x - cloud.x
      // A pixel or two in a second, or back round from the far side.
      expect(moved > 0 && moved < 3).toBe(true)
    })
    // Over ten minutes every cloud comes round again: always on the screen or about to be.
    for (let t = 0; t < 600_000; t += 37_000) {
      for (const cloud of cloudsAt(t, W, H)) {
        expect(cloud.x).toBeGreaterThanOrEqual(-cloud.humps[0]!.length)
        expect(cloud.x).toBeLessThan(W + cloud.humps[0]!.length)
      }
    }
  })

  it('draws plenty in every part of the sunset at any moment', () => {
    for (const t of [0, 4_000, 300_000]) {
      for (const paint of [paintEveningStars, paintSun, paintClouds, paintLife]) {
        const drawn = counter()
        paint(drawn.painter, frame(t))
        expect(drawn.rects.length, `${paint.name} at ${t}`).toBeGreaterThan(10)
      }
    }
  })

  it('keeps stars falling on the other screens without end, bigger than the spell’s', () => {
    for (let t = 3_000; t < 3_600_000; t += 91_000) {
      const stars = fallingStarsAt(t, W, H)
      expect(stars.length).toBeGreaterThan(2)
      expect(stars.length).toBeLessThan(FALL.perSecond * 4)
      for (const star of stars) expect(star.age).toBeLessThanOrEqual(star.life)
    }
    // The same stars at the same moment, every time.
    expect(fallingStarsAt(12_345, W, H)).toEqual(fallingStarsAt(12_345, W, H))
    // Each head three pixels across (those on the screen).
    for (const t of [20_000, 41_000, 77_000]) {
      const drawn = counter()
      paintStarfall(drawn.painter, frame(t))
      const heads = drawn.rects.filter((r) => r.width === 3 && r.height === 3)
      const shown = fallingStarsAt(t, W, H).filter(
        (s) => s.x >= 1 && s.y >= 1 && s.x < W - 2 && s.y < H - 2,
      )
      expect(heads.length).toBe(shown.length)
    }
  })
})

describe('her, watching the sunset', () => {
  const letters = (rows: string[]) => new Set(rows.join(''))

  it('has her back to us: no face, nothing on her front, her hair over her back, her ears through it', () => {
    const front = draw({ view: 'front' })
    const back = draw({ view: 'front', back: true })
    // Her eyes, blush and mouth, the brooch's gem and the gold of her buttons and hat's moon.
    for (const letter of ['i', 'I', 'j', 'w', 'c', 'm', 'e', 'G']) {
      expect(letters(front).has(letter), letter).toBe(true)
      expect(letters(back).has(letter), letter).toBe(false)
    }
    // Her hair down the middle of her back, from under her hat to her waist.
    const middle = GRID / 2
    const hairy = (row: string) => 'OhlDL'.includes(row[middle] ?? '.')
    const down = back.filter((row, y) => y > HEADROOM + 28 && y < HEADROOM + 58)
    expect(down.every(hairy)).toBe(true)
    // Her ears, skin either side.
    expect(back.some((row) => /[sSz]/.test(row.slice(0, middle - 10)))).toBe(true)
    expect(back.some((row) => /[sSz]/.test(row.slice(middle + 10)))).toBe(true)
  })

  it('has her hair over her arms from the back, and her arms in front of her robe', () => {
    const back = draw({ view: 'front', back: true })
    // Her hair is as wide as her shoulders, covering her upper arms; lower down, by her elbows,
    // her sleeves (the robe's colour) show either side of it, and nothing of them crosses it.
    const middle = GRID / 2
    const elbows = HEADROOM + 54
    const row = back[elbows]!
    const hair = [...row].map((c, x) => ('OhlDL'.includes(c) ? x : -1)).filter((x) => x >= 0)
    const [from, to] = [Math.min(...hair), Math.max(...hair)]
    expect(from).toBeLessThan(middle)
    expect(to).toBeGreaterThan(middle)
    // Her hair is one unbroken band across her back there: no sleeve drawn over it.
    expect(row.slice(from, to + 1)).toMatch(/^[OhlDL]+$/)
    // And her sleeves are there, either side of it.
    expect(row.slice(0, from)).toMatch(/[qAav]/)
    expect(row.slice(to + 1)).toMatch(/[qAav]/)
  })

  it('sways very slightly, round and round, from the back', () => {
    const frames = gazeFrames()
    expect(frames).toBe(gazeFrames()) // drawn once
    const distinct = new Set(frames.map((f) => f.rows.join('\n')))
    expect(distinct.size).toBeGreaterThan(4)
    // Never far: no more than a couple of pixels' difference in where her hat's tip is.
    const tip = (rows: string[]) => {
      const y = rows.findIndex((row) => /[ngN]/.test(row))
      return rows[y]!.search(/[ngN]/)
    }
    const tips = frames.map((f) => tip(f.rows))
    expect(Math.max(...tips) - Math.min(...tips)).toBeLessThanOrEqual(4)
    for (const f of frames) expect(letters(f.rows).has('i')).toBe(false)
  })

  it('is dimmed toward the dusk, with a rim of warm light along her edges', () => {
    expect(parseColour('#ff8000')).toEqual({ r: 255, g: 128, b: 0, a: 1 })
    expect(parseColour('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 })
    expect(parseColour('oops')).toBeNull()
    expect(backlit('#ffffff', 1)).toBe(
      `rgb(${Object.values(parseColour(DUSK)!).slice(0, 3).join(', ')})`,
    )
    expect(backlit('#ffffff', 0)).toBe('rgb(255, 255, 255)')
    expect(backlit('rgba(0, 0, 0, 0.3)', 0)).toBe('rgba(0, 0, 0, 0.3)')
    const rows = ['....', '.hh.', '.hh.', '....']
    const drawn = counter()
    paintHer(drawn.painter, rows, 10, 20, { h: '#dedcef' }, 1)
    const fill = drawn.rects.filter((r) => r.colour === '#dedcef')
    expect(fill).toEqual([
      { x: 11, y: 21, width: 2, height: 1, colour: '#dedcef' },
      { x: 11, y: 22, width: 2, height: 1, colour: '#dedcef' },
    ])
    const rim = drawn.rects.filter((r) => r.colour === RIM)
    // Every pixel of a shape this small is on an edge.
    expect(rim).toHaveLength(4)
  })
})

describe('a dragon flying by in the sunset', () => {
  it('comes every couple of minutes, crossing the whole sky, and not in between', () => {
    expect(dragonAt(DRAGON.firstMs - 1, W, H)).toBeNull()
    expect(dragonAt(DRAGON.firstMs + DRAGON.crossMs + 1, W, H)).toBeNull()
    expect(dragonAt(DRAGON.firstMs + DRAGON.everyMs - 1, W, H)).toBeNull()
    expect(DRAGON.everyMs).toBeGreaterThanOrEqual(90_000)
    expect(DRAGON.everyMs).toBeLessThanOrEqual(180_000)
    const width = DRAGON_FRAMES[0]![0]!.length
    const start = dragonAt(DRAGON.firstMs, W, H)!
    const end = dragonAt(DRAGON.firstMs + DRAGON.crossMs - 1, W, H)!
    expect(start.x + width).toBeLessThanOrEqual(0) // off the left edge
    expect(end.x).toBeGreaterThanOrEqual(W - 4) // to the right edge
    expect(start.facing).toBe('right')
    // The next pass the other way.
    const next = dragonAt(DRAGON.firstMs + DRAGON.everyMs + 1_000, W, H)!
    expect(next.facing).toBe('left')
  })

  it('flies high in the sky, well above the hills, a different height each pass', () => {
    const heights = new Set<number>()
    for (let pass = 0; pass < 6; pass++) {
      for (let t = 0; t < DRAGON.crossMs; t += 500) {
        const at = dragonAt(DRAGON.firstMs + pass * DRAGON.everyMs + t, W, H)!
        expect(at.y).toBeGreaterThanOrEqual(0)
        expect(at.y + DRAGON_FRAMES[0]!.length).toBeLessThan(horizon(H))
        if (t === 0) heights.add(at.y)
      }
    }
    expect(heights.size).toBeGreaterThan(3)
  })

  it('beats its wings, gliding now and then, and every frame is the same size', () => {
    for (const rows of DRAGON_FRAMES) {
      expect(rows).toHaveLength(DRAGON_FRAMES[0]!.length)
      for (const row of rows) expect(row).toHaveLength(DRAGON_FRAMES[0]![0]!.length)
    }
    const frames = new Set<number>()
    for (let t = 0; t < DRAGON.crossMs; t += 40)
      frames.add(dragonAt(DRAGON.firstMs + t, W, H)!.frame)
    expect(frames.size).toBe(DRAGON_FRAMES.length)
  })

  it('paints itself when it’s by, and nothing otherwise', () => {
    const by = counter()
    paintDragon(by.painter, frame(DRAGON.firstMs + DRAGON.crossMs / 2))
    expect(by.rects.length).toBeGreaterThan(80)
    const gone = counter()
    paintDragon(gone.painter, frame(DRAGON.firstMs + DRAGON.crossMs + 5_000))
    expect(gone.rects).toHaveLength(0)
  })
})
