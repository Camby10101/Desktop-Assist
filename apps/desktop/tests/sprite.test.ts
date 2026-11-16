import { describe, expect, it } from 'vitest'
import { FIDGET_MS, FIDGETS, type Pose as PoseName } from '@shared/character'
import { Canvas, Layer, limb, rotate } from '../src/renderer/src/character/raster'
import { draw, GRID, HEADROOM, type Pose } from '../src/renderer/src/character/rig'
import {
  LOOPS,
  PALETTE,
  SPRITE_HEADROOM,
  SPRITE_SIZE,
  animationLength,
  framePaths,
  framesOf,
  mirror,
} from '../src/renderer/src/character/sprite'

const POSES: PoseName[] = ['idle', 'walk-left', 'walk-right', 'dragged', ...FIDGETS]
const DOWN_ARM = { shoulder: 0.08, elbow: 0 }
/** Her shoes and their outline: what's on the ground when she stands on it. */
const FEET = /[bBy]/
const lowRows = (rows: string[]) => rows.slice(-4).join('')
/** Her grid without the headroom above it, so a row's number is the rig's y. */
const drawn = (pose: Pose) => draw(pose).slice(HEADROOM)

/** A frame back from its paths: which pixels each colour covers. */
function decode(paths: { className: string; d: string }[]): string[] {
  const grid = Array.from({ length: SPRITE_SIZE + SPRITE_HEADROOM }, () =>
    Array<string>(SPRITE_SIZE).fill('.'),
  )
  const letterOf = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [v, k]))
  for (const { className, d } of paths) {
    for (const [, x, y, n] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
      for (let i = 0; i < Number(n); i++) grid[Number(y)]![Number(x) + i] = letterOf[className]!
    }
  }
  return grid.map((row) => row.join(''))
}

// Drawing every pose's frames takes a few seconds, more when the other test files run alongside.
describe('the animations', { timeout: 30_000 }, () => {
  it('have frames for every pose, each a full grid (and the headroom above it) of known colours', () => {
    expect(SPRITE_SIZE).toBe(96)
    for (const pose of POSES) {
      const frames = framesOf(pose, 'right')
      expect(frames.length).toBeGreaterThan(1)
      for (const { rows, ms } of frames) {
        expect(rows).toHaveLength(SPRITE_SIZE + SPRITE_HEADROOM)
        for (const row of rows) {
          expect(row).toHaveLength(SPRITE_SIZE)
          expect([...row].every((pixel) => pixel === '.' || pixel in PALETTE)).toBe(true)
        }
        expect(ms).toBeGreaterThan(0)
      }
    }
  })

  it('stand her on the bottom rows, except in the air or while she is carried', () => {
    for (const pose of ['idle', 'walk-right', 'stretch', 'sip', 'read', 'spell', 'look'] as const) {
      for (const { rows } of framesOf(pose, 'right')) expect(lowRows(rows)).toMatch(FEET)
    }
    // At the top of the hop her feet are off the ground, her shadow still on it.
    const hop = framesOf('hop', 'right')
    const peak = hop.find((f) => !FEET.test(lowRows(f.rows)))
    expect(peak).toBeDefined()
    expect(lowRows(peak!.rows)).toContain('x')
    expect(lowRows(hop[0]!.rows)).toMatch(FEET)
    expect(lowRows(hop.at(-1)!.rows)).toMatch(FEET)
    for (const { rows } of framesOf('dragged', 'right')) {
      expect(lowRows(rows)).not.toMatch(FEET)
      expect(rows.join('')).not.toContain('x') // no shadow while she's carried
    }
  })

  it('float her up over a magic circle while she levitates, and back down', () => {
    const frames = framesOf('levitate', 'right')
    const aloft = frames.filter((f) => !FEET.test(lowRows(f.rows)))
    expect(aloft.length).toBeGreaterThan(20)
    // Under her, on the ground, the circle's teal ring.
    for (const { rows } of aloft) expect(lowRows(rows)).toContain('G')
    expect(lowRows(frames[0]!.rows)).toMatch(FEET)
    expect(lowRows(frames.at(-1)!.rows)).toMatch(FEET)
    expect(lowRows(frames.at(-1)!.rows)).not.toContain('G')
  })

  it('play each fidget for exactly as long as the main process waits', () => {
    for (const fidget of FIDGETS) {
      expect(animationLength(fidget)).toBe(FIDGET_MS[fidget])
      expect(LOOPS[fidget]).toBe(false)
    }
    expect(LOOPS.idle && LOOPS['walk-left'] && LOOPS['walk-right'] && LOOPS.dragged).toBe(true)
  })

  it('face left as the mirror image of facing right, and walk the way they go', () => {
    const left = framesOf('idle', 'left')
    framesOf('idle', 'right').forEach((frame, i) =>
      expect(left[i]!.rows).toEqual(mirror(frame.rows)),
    )
    // Walking ignores the way she'd otherwise face.
    expect(framesOf('walk-left', 'right')).toBe(framesOf('walk-left', 'left'))
    expect(framesOf('walk-left', 'left')[0]!.rows).toEqual(
      mirror(framesOf('walk-right', 'left')[0]!.rows),
    )
  })

  it('breathe and blink while idle, and look different walking', () => {
    const idle = new Set(framesOf('idle', 'right').map((f) => f.rows.join('\n')))
    expect(idle.size).toBeGreaterThanOrEqual(3)
    const walking = new Set(framesOf('walk-right', 'right').map((f) => f.rows.join('\n')))
    expect(walking.size).toBe(12)
  })

  it('come about every 40 ms when easing between poses, for smooth movement', () => {
    // Everything but the glance (mostly held poses) moves in many small steps.
    for (const fidget of FIDGETS.filter((f) => f !== 'look')) {
      const frames = framesOf(fidget, 'right')
      expect(frames.length).toBeGreaterThanOrEqual(animationLength(fidget) / 160)
    }
    expect(framesOf('idle', 'right')).toHaveLength(32)
  })

  it('keep the dozer’s z’s the right way round when she faces left', () => {
    // A row of the big z with its diagonal stroke going down to the left: "fFF" either way she faces.
    const hasZ = (frames: { rows: string[] }[]) =>
      frames.some((f) => f.rows.some((row) => row.includes('fFF')))
    expect(hasZ(framesOf('doze', 'right'))).toBe(true)
    expect(hasZ(framesOf('doze', 'left'))).toBe(true)
    // Otherwise facing left is still the mirror image.
    expect(framesOf('doze', 'left')[0]!.rows).toEqual(mirror(framesOf('doze', 'right')[0]!.rows))
  })

  it('have room above her hat when she rises, so it never goes out of the top', () => {
    for (const pose of ['hop', 'levitate'] as const) {
      const frames = framesOf(pose, 'right')
      for (const { rows } of frames) expect(rows[0]).toBe('.'.repeat(SPRITE_SIZE))
      // At the top of the jump, or floating, her hat is up in the headroom.
      const above = (rows: string[]) => /[^.]/.test(rows.slice(0, SPRITE_HEADROOM).join(''))
      expect(frames.some(({ rows }) => above(rows))).toBe(true)
    }
  })

  it('are drawn once, then kept', () => {
    expect(framesOf('wave', 'right')).toBe(framesOf('wave', 'right'))
  })
})

describe('the rig', () => {
  it('draws her from the front, diagonally and side on, each different', () => {
    const views = (['front', 'diagonal', 'side'] as const).map((view) => draw({ view }).join('\n'))
    expect(new Set(views).size).toBe(3)
    for (const view of views) expect(view.split('\n')).toHaveLength(GRID + HEADROOM)
  })

  it('draws a teacup, a spellbook and sparkles only when asked', () => {
    const arms: Pose['arms'] = [
      { shoulder: 0.35, elbow: 1.75 },
      { shoulder: 0.15, elbow: 0.3 },
    ]
    const plain = draw({ view: 'diagonal', arms }).join('')
    expect(draw({ view: 'diagonal', arms, prop: 'cup' }).join('')).not.toBe(plain)
    expect(draw({ view: 'diagonal', arms, prop: 'book' }).join('')).not.toBe(plain)
    expect(draw({ view: 'diagonal', arms, sparkle: 0.3 }).join('')).not.toBe(plain)
  })

  it('gives her a hat above her head and long ears beside it', () => {
    const rows = draw({ view: 'front' })
    const top = rows.findIndex((row) => /[^.x]/.test(row))
    expect(rows[top]).toMatch(/[qnNg]/) // the hat is the highest thing
    // Her ears reach out well past her face (which starts at about x = 40).
    const leftmostSkin = Math.min(
      ...rows.slice(top, top + 40).map((row) => {
        const at = row.search(/[sSzK]/)
        return at === -1 ? Infinity : at
      }),
    )
    expect(leftmostSkin).toBeLessThanOrEqual(37)
  })

  it('patterns her clothes the same way from every side', () => {
    for (const view of ['front', 'diagonal', 'side'] as const) {
      const rows = drawn({ view })
      const top = rows.findIndex((row) => /[^.x]/.test(row))
      const hat = rows.slice(top, top + 18).join('')
      const robe = rows.slice(56, 82).join('')
      const boots = rows.slice(82).join('')
      // A gold buckle with a gem on the hat's band, and a gold moon and stars on its crown.
      expect(hat).toMatch(/Y/)
      expect(hat).toMatch(/G/)
      // Gold embroidery above the hem (diamonds, a line), silver stars and the sash's buckle.
      expect(robe.match(/Y/g)!.length).toBeGreaterThan(10)
      expect(robe).toMatch(/k/)
      // The boots: a light cuff and laces, and gold buckles on their straps.
      expect(boots).toMatch(/y/)
      expect(boots).toMatch(/Y/)
    }
  })

  it('keeps her hair behind her from the front, the same either side and none past her sleeves', () => {
    const rows = drawn({ view: 'front' })
    const hair = /[ODhlL]/
    // Her face below her fringe, and the middle of her robe: no hair over them.
    for (const row of rows.slice(27, 60)) expect(row.slice(45, 52)).not.toMatch(hair)
    // Her fringe and locks: as far out on her right as on her left.
    for (const row of rows.slice(22, 39)) {
      const left = row.search(hair)
      const right = row.length - 1 - [...row].reverse().join('').search(hair)
      expect(left + right).toBe(95)
    }
    // Below her locks nothing of her hair beside her sleeves (her braid hangs down her back).
    for (const row of rows.slice(39, 70)) {
      expect(row.slice(30, 40)).not.toMatch(hair)
      expect(row.slice(56, 66)).not.toMatch(hair)
    }
  })

  it('hangs her hair down her back side on as one clump, narrowing into her braid', () => {
    const rows = drawn({ view: 'side' })
    // Behind her shoulders: one outline, at its back edge, and no more than 7 pixels to her robe.
    for (const row of rows.slice(37, 48)) {
      const clump = row.match(/[ODhlL]+/)![0]
      expect(clump.match(/O/g)).toHaveLength(1)
      expect(clump.length).toBeLessThanOrEqual(7)
    }
    // Its ribbon, near the end, behind her robe.
    expect(rows.slice(50, 57).some((row) => /v/.test(row.slice(30, 41)))).toBe(true)
  })

  it('shades her: a broad shadow on the side away from the light, and the shadows things cast', () => {
    for (const view of ['front', 'diagonal', 'side'] as const) {
      const rows = drawn({ view })
      // Her skirt, a row above its border: a broad band of shade on the right, light on the left.
      const skirt = rows[70]!.replace(/[^aAv]/g, '')
      expect(skirt.match(/A/g)!.length).toBeGreaterThanOrEqual(4)
      expect(skirt.slice(-3)).toBe('AAA')
      // Under her hat no hair is lit, and under her hair no skin is.
      for (let y = 1; y < rows.length; y++) {
        for (let x = 0; x < GRID; x++) {
          const above = rows[y - 1]![x]!
          const here = rows[y]![x]!
          if ('nNgfFYkGq'.includes(above)) expect('hlL'.includes(here)).toBe(false)
          if ('ODhlL'.includes(above)) expect('sz'.includes(here)).toBe(false)
        }
      }
    }
  })

  it('shows her face side on, her cheek clear of her hair, and a tuft under her ear', () => {
    const rows = drawn({ view: 'side' })
    for (const row of rows.slice(29, 35)) expect(row.slice(49, 54)).not.toMatch(/[ODhlL]/)
    for (const letter of ['e', 'I', 'c', 'm']) expect(rows.slice(26, 36).join('')).toContain(letter)
    // The tuft: hair under her ear, over the back of her jaw.
    for (const row of rows.slice(30, 34)) expect(row.slice(44, 48)).toMatch(/[hlD]/)
  })

  it('looks up, from every side, with her irises right under her lids', () => {
    for (const view of ['front', 'diagonal', 'side'] as const) {
      expect(draw({ view, face: 'up' }).join('')).not.toBe(draw({ view }).join(''))
    }
    // From the front, the row under her lids is iris for both eyes, the row below the glint.
    const rows = draw({ view: 'front', face: 'up' })
    const lids = rows.findIndex((row) => row.includes('eeeee'))
    expect(rows[lids + 1]!.match(/i/g)!.length).toBeGreaterThanOrEqual(6)
    // The vision habit has her looking up for most of it, while the logo is over her.
    const lookingUp = (frame: string[]) => {
      const at = frame.findIndex((row) => row.includes('eeeee'))
      return at >= 0 && (frame[at + 1]!.match(/i/g)?.length ?? 0) >= 6
    }
    const frames = framesOf('vision', 'right')
    expect(frames.filter((f) => lookingUp(f.rows)).length).toBeGreaterThan(frames.length / 2)
    expect(lookingUp(frames[0]!.rows)).toBe(false)
    expect(lookingUp(frames.at(-1)!.rows)).toBe(false)
  })

  it('draws the new habits’ things only when asked: a crystal ball, a butterfly, z’s, a flared robe', () => {
    const plain = draw({ view: 'front' })
    // The crystal ball, teal, between her hands in front of her waist.
    const holding: Pose['arms'] = [
      { shoulder: 0.25, elbow: -1.55 },
      { shoulder: 0.25, elbow: -1.55 },
    ]
    const withOrb = drawn({ view: 'front', prop: 'orb', arms: holding })
    expect(withOrb.slice(44, 56).join('')).toMatch(/G{5}/)
    expect(drawn({ view: 'front', arms: holding }).slice(44, 56).join('')).not.toMatch(/G{5}/)
    // The butterfly on her raised hand, part way through its visit, and not before it comes.
    const raised: Pose['arms'] = [{ shoulder: 1.55, elbow: 0.95 }, DOWN_ARM]
    const resting = draw({ view: 'front', arms: raised, butterfly: 0.5 }).join('')
    expect(resting).not.toBe(draw({ view: 'front', arms: raised }).join(''))
    expect(draw({ view: 'front', arms: raised, butterfly: 0.02 }).join('')).toBe(
      draw({ view: 'front', arms: raised }).join(''),
    )
    // Z's above her head while she dozes.
    const dozing = draw({ view: 'front', zzz: 0.5 })
    expect(dozing.slice(0, HEADROOM + 20).join('')).not.toBe(plain.slice(0, HEADROOM + 20).join(''))
    // A flared robe is wider at the hem.
    const width = (rows: string[]) => rows[HEADROOM + 80]!.replace(/\./g, '').length
    expect(width(draw({ view: 'front', spread: 6 }))).toBeGreaterThan(width(plain) + 8)
  })

  it('puts her face on: eyes, blush and mouth', () => {
    const rows = draw({ view: 'front' }).join('')
    for (const letter of ['e', 'I', 'w', 'c', 'm']) expect(rows).toContain(letter)
  })

  it('sits her down with her hips near the taskbar', () => {
    const top = (rows: string[]) => rows.findIndex((row) => /[^.x]/.test(row))
    expect(top(draw({ view: 'front', sitting: true }))).toBeGreaterThan(
      top(draw({ view: 'front' })) + 20,
    )
  })
})

describe('the rasteriser', () => {
  it('shades a broad band across the side away from the light, for materials with a form shadow', () => {
    const layer = new Layer(30)
    layer.ellipse({ x: 15, y: 15 }, 10, 10, 'cloth')
    const canvas = new Canvas(30)
    canvas.ink(
      layer,
      { cloth: { line: 'k', shade: 'S', base: 'b', light: 'L', form: 0.3 } },
      { x: -1, y: -1 },
    )
    const middle = canvas.rows()[15]!.replace(/[.k]/g, '')
    const shade = middle.match(/S+$/)![0].length
    expect(shade).toBeGreaterThanOrEqual(Math.floor(middle.length * 0.3))
    expect(shade).toBeLessThanOrEqual(Math.ceil(middle.length * 0.3) + 1)
    expect(middle[0]).toBe('L')
  })

  it('fills shapes, shades the side away from the light and outlines them', () => {
    const layer = new Layer(20)
    layer.ellipse({ x: 10, y: 10 }, 6, 6, 'cloth')
    const canvas = new Canvas(20)
    canvas.ink(layer, { cloth: { line: 'k', shade: 'S', base: 'b', light: 'L' } }, { x: -1, y: -1 })
    const rows = canvas.rows()
    expect(rows[10]![10]).toBe('b') // the middle
    expect(rows[10]![15]).toBe('S') // the side away from the light
    expect(rows[4]![9]).toBe('L') // the edge toward it
    expect(rows[10]![3]).toBe('k') // the outline, outside the shape
    expect(rows[0]![0]).toBe('.')
  })

  it('draws lines, polygons and stamps in place', () => {
    const layer = new Layer(10)
    layer.capsule({ x: 1, y: 5 }, { x: 8, y: 5 }, 1, 1, 'a')
    layer.polygon(
      [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 3 },
        { x: 0, y: 3 },
      ],
      'b',
    )
    expect(layer.get(5, 5)).toBe('a')
    expect(layer.get(1, 1)).toBe('b')
    expect(layer.get(5, 1)).toBeUndefined()
    const canvas = new Canvas(10)
    canvas.stamp(['ab', '.c'], 2, 2)
    canvas.stamp(['ab'], 2, 6, true)
    expect(
      canvas
        .rows()
        .slice(2, 4)
        .map((r) => r.slice(2, 4)),
    ).toEqual(['ab', '.c'])
    expect(canvas.rows()[6]!.slice(2, 4)).toBe('ba')
  })

  it('swings limbs forward with positive angles', () => {
    expect(limb({ x: 0, y: 0 }, 10, 0)).toEqual({ x: 0, y: 10 })
    expect(limb({ x: 0, y: 0 }, 10, Math.PI / 2).x).toBeCloseTo(10)
    expect(rotate({ x: 1, y: 0 }, Math.PI / 2).y).toBeCloseTo(1)
  })
})

describe('framePaths', () => {
  it('draws exactly the frame, one path per colour', () => {
    for (const pose of ['idle', 'walk-right', 'sip'] as const) {
      for (const { rows } of framesOf(pose, 'right').slice(0, 3)) {
        const paths = framePaths(rows)
        expect(decode(paths)).toEqual(rows)
        expect(new Set(paths.map((p) => p.className)).size).toBe(paths.length)
      }
    }
  })
})
