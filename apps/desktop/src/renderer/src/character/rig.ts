import { UI } from '@shared/geometry'
import { Canvas, Layer, add, limb, rotate, type Point, type Ramp } from './raster'
import { DIAGONAL, DIAGONAL_EYES, DIAGONAL_MOUTH, SIDE_FACE } from './pictures'

// The character's rig: her skeleton and the shapes that hang on it, drawn as pixel art for one
// pose. She's an original design: an elf mage with long pointed ears, long silver-white hair
// down her back, amber eyes, a wide-brimmed crooked hat (a gold buckle on its band, a gold moon and
// stars on its crown, silver stitching round its brim), and a long robe in the tenant's accent
// colour with bell sleeves, silver trim, gold embroidery (a border of diamonds above the hem, a
// line above each cuff), silver stars, gold buttons, a sash with a gold buckle and a gem brooch,
// over dark stockings and laced boots with turned-down cuffs and buckled straps.
//
// A pose says which way she's seen from (front, diagonal or side, always facing right; frames
// facing left are mirrored), where her hips are, how she leans, her arms' and legs' angles, her
// face, and how the wind or a fall pushes her hair and robe. `draw()` turns a pose into a frame.
// She's about 88 pixels tall with her hat on a 96-pixel grid, her feet on the bottom row, and
// there are HEADROOM rows more above the grid for her hat when she rises off the ground.

export const GRID = 96
/**
 * Rows above the grid (y from -HEADROOM to -1) for her hat when she's off the ground: a hop,
 * levitating, being carried. Her window has the same room above her (UI.bubbleHeadroom).
 */
export const HEADROOM = UI.bubbleHeadroom

/**
 * Her hair's ripple as she walks (see Pose.flow): its wave number (radians a pixel down her hair,
 * so a wave is about 30 pixels long, as long as her hair), how far it sways at the length of her
 * hair below her head (pixels; less above, more at the tips), and how close together the points
 * are that let it bend.
 */
const RIPPLE = { k: 0.2, size: 1.2, step: 2 }

/** Each material's shades, as palette letters (see PALETTE in sprite.ts). */
const RAMPS: Record<string, Ramp> = {
  // A broad shadow across the side of each away from the light (`form`), less on her face.
  hair: { line: 'O', shade: 'D', base: 'h', light: 'l', form: 0.28 },
  skin: { line: 'K', shade: 'S', base: 's', light: 'z', form: 0.16 },
  robe: { line: 'q', shade: 'A', base: 'a', light: 'v', form: 0.3 },
  trim: { line: 'q', shade: 'F', base: 'f' },
  hat: { line: 'q', shade: 'N', base: 'n', light: 'g', form: 0.3 },
  stocking: { line: 'u', shade: 'Q', base: 'o', form: 0.35 },
  boot: { line: 'u', shade: 'B', base: 'b', light: 'y', form: 0.35 },
  cup: { line: 'u', shade: 'F', base: 'f', light: 'w' },
  orb: { line: 'O', shade: 'G', base: 'G', light: 'w' },
  book: { line: 'u', shade: 'N', base: 'n', light: 'g' },
  shadow: { line: 'x', shade: 'x', base: 'x' },
}

/** The light comes from up and to the left (of a figure facing right). */
const LIGHT: Point = { x: -1, y: -1 }

export type View = 'front' | 'diagonal' | 'side'
export type Face =
  'neutral' | 'blink' | 'happy' | 'surprised' | 'yawn' | 'sip' | 'down' | 'awe' | 'up' | 'chant'

/** Angles in radians from hanging straight down. */
export interface Arm {
  shoulder: number
  elbow: number
}
export interface Leg {
  hip: number
  knee: number
}

export interface Pose {
  view: View
  /** Her hips' offset from where they are standing still (pixels; negative y is up). */
  x?: number
  y?: number
  /** Her body tipped toward the way she faces (radians), and her head tilted. */
  lean?: number
  tilt?: number
  /**
   * Her arms and legs: [near, far] seen diagonally or side on (positive angles swing forward), or
   * [right of the picture, left] from the front (positive angles swing outward).
   */
  arms?: [Arm, Arm]
  legs?: [Leg, Leg]
  face?: Face
  /** Where her eyes look from the front: -1 left, 1 right. */
  look?: number
  /** Her hair and robe pushed sideways (pixels at the tips; negative is behind her). */
  wind?: number
  /**
   * A ripple running down her hair from her head to its tips (as she walks), this far through
   * its cycle (radians, one cycle 2π). Left out, her hair doesn't ripple.
   */
  flow?: number
  /** Her hair lifted (pixels at the tips), as when she's falling or carried up. */
  lift?: number
  /** Something in her hands: a teacup, her spellbook or a crystal ball (held in both hands). */
  prop?: 'cup' | 'book' | 'orb'
  /** Sparkles round her near hand, 0 to 1 (a little spell). */
  sparkle?: number
  /** Sitting on the taskbar with her knees up under her robe. */
  sitting?: boolean
  /** Her shadow on the taskbar (true unless said otherwise; not while she's carried). */
  shadow?: boolean
  /** A magic circle on the ground under her, 0 (none) to 1 (full size), as she levitates. */
  rune?: number
  /** How far its runes have turned (whole turns), and how far its sparks have risen. */
  spin?: number
  /** Her robe's hem held or flung out, this many pixels wider each side (a curtsy, a twirl). */
  spread?: number
  /** A little butterfly's flight, 0 to 1: coming to her raised hand, resting on it, flying off. */
  butterfly?: number
  /** Z's floating up from her as she dozes, 0 to 1 (none at 0). */
  zzz?: number
  /** Letters (the z's) drawn back to front, for a frame that will be mirrored to face left. */
  flipText?: boolean
  /** Three little orbs juggled between her hands (from the front), this far through (0 to 1). */
  juggle?: number
  /** Magic bubbles blown through a little wand ring at her near hand (seen diagonally), 0 to 1. */
  bubbles?: number
  /** A will-o'-wisp going round her (from the front), 0 to 1: see wispAt. */
  wisp?: number
  /** A sneeze's burst of sparkles flying out from her nose, 0 to 1 (none at 0). */
  burst?: number
  /** Her sparkle trail as she walks: how far through her stride she is (0 to 1; none if left out). */
  trail?: number
  /**
   * Dissolving into white motes, from 0 (all of her) to FADE.end (nothing left, the last motes
   * gone): see FADE. Played backwards, she forms out of them.
   */
  fade?: number
  /**
   * From the front only: turned round, her back to us (watching the sunset in the screen saver).
   * Her long hair falls over her back from the crown of her head, her ears through it, and nothing
   * on her front shows: no face, collar, brooch, buttons or buckles, nor the hat's buckle and moon.
   */
  back?: boolean
}

const DOWN: Arm = { shoulder: 0.08, elbow: 0 }
const STAND: Leg = { hip: 0, knee: 0 }

/** Thigh and shin, each (pixels); standing, her hips are this high above her ankles twice over. */
export const LEG_LENGTH = 16.5

// Face pictures, facing right; `.` is see-through. Eyes have a thick upper lid, a dark-to-light
// iris and a glint top right, calm and a little heavy-lidded; mouths are tiny.
const EYES = {
  front: {
    open: [
      ['eeeee', '.eiiw', '.iIIi', '.IjjI', '..jj.'],
      ['eeeee', 'iiwe.', 'iIIi.', 'IjjI.', '.jj..'],
    ],
    blink: [
      ['.....', '.....', 'eeeee', '.eee.'],
      ['.....', '.....', 'eeeee', '.eee.'],
    ],
    happy: [
      ['.....', '.eee.', 'e...e', '.....'],
      ['.....', '.eee.', 'e...e', '.....'],
    ],
    down: [
      ['.....', '.....', 'eeeee', '.iIi.'],
      ['.....', '.....', 'eeeee', '.iIi.'],
    ],
    // Looking up: the iris right under the lid, the row below it bare.
    up: [
      ['eeeee', '.iiiw', '.IjjI', '..jj.', '.....'],
      ['eeeee', 'iiiw.', 'IjjI.', '.jj..', '.....'],
    ],
  },
  diagonal: {
    open: [
      ['eeeee', '.eiiw', '.iIIi', '.IjjI', '..jj.'],
      ['eeee', 'iiw.', 'iIi.', 'Ijj.', 'jj..'],
    ],
    blink: [
      ['.....', '.....', 'eeeee', '.eee.'],
      ['....', '....', 'eeee', 'eee.'],
    ],
    happy: [
      ['.....', '.eee.', 'e...e', '.....'],
      ['....', '.ee.', 'e..e', '....'],
    ],
    down: [
      ['.....', '.....', 'eeeee', '.iIi.'],
      ['....', '....', 'eeee', 'iIi.'],
    ],
    up: [
      ['eeeee', '.iiiw', '.IjjI', '..jj.', '.....'],
      ['eeee', 'iiw.', 'Ijj.', 'jj..', '....'],
    ],
  },
  side: {
    // A thin lid with its lashes flicking back, over a tall round iris, wide open. The iris sits at
    // the front of the eye, under the front of her lid, so she looks the way she faces; its glint
    // is at its top back, toward the light. Looking up, the iris right under the lid. Closed, a
    // line across the middle.
    open: [['ee...', '.eeee', '..wii', '..wIi', '..iII', '..Ijj']],
    blink: [['.....', '.....', '.....', 'eeee.', '.ee..']],
    happy: [['.....', '.....', '..ee.', '.e..e', '.....']],
    down: [['.....', '.....', '.....', '.eeee', '..iI.']],
    up: [['ee...', '.eeee', '..wIi', '..iII', '..Ijj', '.....']],
  },
} as const

const MOUTHS: Record<Face, readonly string[]> = {
  neutral: ['mm'],
  blink: ['mm'],
  down: ['mm'],
  happy: ['m..m', '.mm.'],
  surprised: ['mm', 'mm'],
  yawn: ['.mm.', 'mmmm', 'mmmm', '.mm.'],
  sip: ['m'],
  awe: ['mm', 'mm'],
  up: ['m..m', '.mm.'],
  chant: ['mm', 'mm'],
}

/** A four-pointed sparkle, and a smaller one. */
const SPARKLE = ['..j..', '..l..', 'jlwlj', '..l..', '..j..']
const TWINKLE = ['.l.', 'lwl', '.l.']
/** A little magic butterfly, wings open and shut: teal wings, a white spot on each, a gold body. */
const BUTTERFLY_OPEN = ['GG.GG', 'GwkwG', '.G.G.']
const BUTTERFLY_SHUT = ['.GkG.', '..k..']
/** A dozer's z's: a big one and a small one, each with a darker shadow to the lower right. */
const Z_BIG = ['ffff.', '..fFF', '.fF..', 'ffffF', '.FFFF']
const Z_SMALL = ['fff.', '.fF.', 'fffF', '.FFF']
/** Juggling orbs: a teal one, a gold one and a pink one, each with a glint. */
const ORBS = [
  ['.G.', 'GwG', '.G.'],
  ['.Y.', 'YwY', '.Y.'],
  ['.c.', 'cwc', '.c.'],
]
/** A soap bubble, small and grown: a teal ring (see-through inside) with a white glint. */
const BUBBLE_SMALL = ['.G.', 'G.G', '.G.']
const BUBBLE_BIG = ['.GG.', 'Gw.G', 'G..G', '.GG.']
/** The little silver wand ring she blows bubbles through. */
const WAND_RING = ['.f.', 'f.f', '.f.']
/** A will-o'-wisp: a round teal light with a white heart. */
const WISP = ['.GG.', 'GwwG', 'GwwG', '.GG.']

/**
 * Juggling (Pose.juggle): how many times each orb goes round, hand to hand and back, while she
 * juggles; how far up its high arc goes above her hands, and its low pass back (pixels); and the
 * share of the way round spent on the high arc.
 */
export const JUGGLE = { rounds: 4, high: 28, low: 5, arc: 0.62 }

/**
 * Dissolving (Pose.fade): each of her pixels turns white `glow` before `fade` reaches its own point
 * between 0 and 1 (dissolveAt), then goes, and becomes a white mote that rises `rise` pixels as it
 * fades, over `life` more, so at `end` the last are gone; only `share` of them make a mote, so
 * it's a sprinkling, not a copy of her.
 */
export const FADE = { glow: 0.12, life: 0.45, rise: 12, share: 0.45, end: 1.45 }

/** A pixel's own random number, 0 to 1, the same every frame (`salt` for a second, different one). */
function hash(x: number, y: number, salt = 0): number {
  let h = Math.imul(x + 1013 * salt, 374761393) ^ Math.imul(y + 7919, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** When a pixel dissolves (0 to 1): in a random order, the top of her a little sooner. */
const dissolveAt = (x: number, y: number) => 0.8 * hash(x, y) + 0.2 * Math.max(0, y / GRID)

/**
 * Her sparkle trail (Pose.trail): how many sparkles she leaves a stride; how far each drifts back
 * from her heel over a whole stride (pixels: she walks WANDER.walkSpeed, 80 DIPs a second, and a
 * stride takes 0.66 s, about 53 DIPs, which is 53 sprite pixels at any size, so a sparkle stays
 * where she left it on the taskbar while her window moves on); and how long one lasts (shares of
 * a stride).
 */
export const TRAIL = { perStride: 4, drift: 53, life: 0.45 }

/**
 * Bubbles (Pose.bubbles): how many she blows, when the first comes and how far apart they come
 * (shares of the habit), how long each floats before it pops, and when she puts the wand away.
 */
export const BUBBLES = { count: 5, first: 0.1, gap: 0.12, life: 0.36, wandAway: 0.86 }

/**
 * Where the will-o'-wisp is (Pose.wisp, 0 to 1), from the middle of her chest: it appears at her
 * side, goes round her twice (a flat ellipse, bobbing; on the far half it's behind her), then
 * flies off up and away. Null before it comes and once it's gone.
 */
export function wispAt(t: number): { x: number; y: number; behind: boolean } | null {
  const [come, round, gone] = [0.06, 0.8, 0.96]
  if (t < come || t >= gone) return null
  if (t < round) {
    const angle = ((t - come) / (round - come)) * Math.PI * 4
    return {
      x: Math.cos(angle) * 20,
      y: Math.sin(angle) * 5 + Math.sin(angle * 3) * 1.5 - 4,
      behind: Math.sin(angle) < 0,
    }
  }
  const away = (t - round) / (gone - round)
  return { x: 20 + away * 14, y: -4 - away * away * 46, behind: false }
}

/** Which eyes a face uses. */
function eyesFor(face: Face): 'open' | 'blink' | 'happy' | 'down' | 'up' {
  if (face === 'blink' || face === 'yawn' || face === 'chant') return 'blink'
  if (face === 'happy' || face === 'sip') return 'happy'
  if (face === 'down') return 'down'
  if (face === 'awe' || face === 'up') return 'up'
  return 'open'
}

/** Draws one pose as rows of palette letters. */
export function draw(pose: Pose): string[] {
  const view = pose.view
  const frontView = view === 'front'
  /** Her back to us (from the front only): see Pose.back. */
  const fromBehind = frontView && pose.back === true
  const sitting = pose.sitting ?? false
  const hips: Point = { x: 48 + (pose.x ?? 0), y: (sitting ? 85 : 59) + (pose.y ?? 0) }
  const lean = pose.lean ?? 0
  const neck = add(hips, rotate({ x: 0, y: -21 }, lean))
  const head = add(neck, rotate({ x: 0, y: -11 }, lean + (pose.tilt ?? 0)))
  const headAngle = lean + (pose.tilt ?? 0)
  const wind = pose.wind ?? 0
  const flow = pose.flow
  const lift = pose.lift ?? 0
  const [nearArm, farArm] = pose.arms ?? [DOWN, DOWN]
  const [nearLeg, farLeg] = pose.legs ?? [STAND, STAND]
  const canvas = new Canvas(GRID, HEADROOM)
  const ink = (layer: Layer, outline = true) => canvas.ink(layer, RAMPS, LIGHT, outline)
  /**
   * Inks a layer of hair that lies over hair already drawn, its outline where it crosses that
   * hair a soft line in the hair's shade rather than a hard one, so they read as one head of hair.
   */
  const inkOverHair = (layer: Layer) => {
    const before = canvas.rows()
    ink(layer)
    for (let y = layer.minY - 1; y <= layer.maxY + 1; y++) {
      for (let x = layer.minX - 1; x <= layer.maxX + 1; x++) {
        const was = before[y + canvas.top]?.[x]
        const outline = layer.get(x, y) === undefined && canvas.get(x, y) === 'O'
        if (outline && was !== undefined && 'hlLD'.includes(was)) canvas.set(x, y, 'D')
      }
    }
  }
  // A point in a body part's own frame (its origin, turned with it).
  const at = (origin: Point, angle: number) => (p: Point) => add(origin, rotate(p, angle))
  const onHead = at(head, headAngle)
  const onBody = at(neck, lean)
  const onHips = at(hips, lean * 0.5)
  const shape = (points: number[][], frame: (p: Point) => Point) =>
    points.map(([x, y]) => frame({ x: x!, y: y! }))
  /**
   * Hair below the top of the head is blown by the wind, lifted by a fall and rippled as she walks
   * (`flow`): a wave running down it, so it sways more the further down it is, and bends.
   */
  const blown = (p: Point): Point => {
    const t = Math.max(0, (p.y + 2) / 20)
    const ripple = flow === undefined ? 0 : Math.sin(flow - p.y * RIPPLE.k) * RIPPLE.size * t
    return { x: p.x + wind * t + ripple, y: p.y - lift * t }
  }
  /**
   * A shape's points with more between them, one at least every RIPPLE.step pixels along each
   * edge, so a ripple bends its long edges into curves rather than just moving their ends.
   */
  const supple = (points: number[][]): number[][] =>
    points.flatMap(([x, y], i) => {
      const [nx, ny] = points[(i + 1) % points.length]!
      const pieces = Math.max(1, Math.ceil(Math.hypot(nx! - x!, ny! - y!) / RIPPLE.step))
      return Array.from({ length: pieces }, (_, j) => [
        x! + ((nx! - x!) * j) / pieces,
        y! + ((ny! - y!) * j) / pieces,
      ])
    })
  const set = (p: Point, letter: string, only?: string) => {
    const x = Math.floor(p.x)
    const y = Math.floor(p.y)
    if (!only || only.includes(canvas.get(x, y))) canvas.set(x, y, letter)
  }
  /** A small pattern (rows of letters, `.` see-through) centred on `p`, only over `only`. */
  const motif = (p: Point, rows: readonly string[], only: string) => {
    const x0 = Math.round(p.x) - Math.floor(rows[0]!.length / 2)
    const y0 = Math.round(p.y) - Math.floor(rows.length / 2)
    rows.forEach((row, dy) =>
      [...row].forEach((letter, dx) => {
        if (letter !== '.' && only.includes(canvas.get(x0 + dx, y0 + dy))) {
          canvas.set(x0 + dx, y0 + dy, letter)
        }
      }),
    )
  }

  // Arms: a bell sleeve with silver trim at its cuff, her hand peeking out.
  const shoulderAt = (side: 1 | -1): Point =>
    onBody(
      frontView
        ? { x: 6.5 * side, y: 2.5 }
        : view === 'diagonal'
          ? { x: side === 1 ? -4.5 : 4.5, y: 2.5 }
          : { x: 0.5, y: 2.5 },
    )
  const drawArm = (arm: Arm, side: 1 | -1) => {
    const layer = new Layer(GRID, HEADROOM)
    // From the front, positive angles swing each arm outward; otherwise forward.
    const sign = frontView ? side : 1
    const shoulder = shoulderAt(side)
    const upper = (arm.shoulder + lean) * sign
    const lower = (arm.shoulder + arm.elbow + lean) * sign
    const elbow = limb(shoulder, 11.5, upper)
    const wrist = limb(elbow, 10, lower)
    const cuff = limb(elbow, 8.8, lower)
    const hand = limb(wrist, 1, lower)
    // Across the forearm, for the sleeve's flat, widening opening.
    const across = { x: Math.cos(lower), y: -Math.sin(lower) }
    const edge = (p: Point, r: number, way: 1 | -1) => ({
      x: p.x + across.x * r * way,
      y: p.y + across.y * r * way,
    })
    const band = (from: Point, to: Point, r0: number, r1: number, material: string) =>
      layer.polygon(
        [edge(from, r0, 1), edge(to, r1, 1), edge(to, r1, -1), edge(from, r0, -1)],
        material,
      )
    layer.ellipse(hand, 1.9, 1.9, 'skin')
    layer.capsule(shoulder, elbow, 2.6, 2.9, 'robe')
    band(elbow, cuff, 2.9, 3.9, 'robe')
    band(cuff, wrist, 3.9, 4.2, 'trim')
    ink(layer)
    const above = limb(elbow, 7.9, lower)
    for (let r = -3.6; r <= 3.6; r += 0.5) set(edge(above, r, 1), 'Y', 'aAv')
    return hand
  }

  // Legs: dark stockings, then boots below the robe's hem.
  const hipAt = (side: 1 | -1): Point =>
    onHips(view === 'side' ? { x: 0, y: 0 } : { x: (frontView ? 3.2 : -2.6) * side, y: 0 })
  const drawLeg = (leg: Leg, side: 1 | -1) => {
    const layer = new Layer(GRID, HEADROOM)
    const sign = frontView ? side : 1
    const hip = hipAt(side)
    let knee: Point
    let ankle: Point
    if (sitting) {
      knee = { x: hip.x + side * (4 + leg.hip * 3), y: hip.y - 8 }
      ankle = { x: hip.x + side * (3.5 + leg.knee * 4), y: 92.5 }
    } else {
      knee = limb(hip, LEG_LENGTH, leg.hip * sign)
      ankle = limb(knee, LEG_LENGTH, (leg.hip - leg.knee) * sign)
    }
    const bootTop = add(ankle, { x: (knee.x - ankle.x) * 0.38, y: (knee.y - ankle.y) * 0.38 })
    layer.capsule(hip, knee, 3.2, 2.6, 'stocking')
    layer.capsule(knee, bootTop, 2.6, 2.4, 'stocking')
    layer.capsule(bootTop, ankle, 2.7, 2.5, 'boot')
    layer.polygon(
      (frontView
        ? [
            [-2.7, -0.5],
            [2.7, -0.5],
            [3.1, 3.2],
            [-3.1, 3.2],
          ]
        : [
            [-2.6, -0.5],
            [2.6, -0.5],
            [5.6, 1.6],
            [5.6, 3.2],
            [-2.6, 3.2],
          ]
      ).map(([x, y]) => ({ x: ankle.x + x!, y: ankle.y + y! })),
      'boot',
    )
    ink(layer)
    // Down the shaft (`along`) and across it (`across`, toward her front side on).
    const shaft = Math.hypot(ankle.x - bootTop.x, ankle.y - bootTop.y)
    const along = { x: (ankle.x - bootTop.x) / shaft, y: (ankle.y - bootTop.y) / shaft }
    const across = frontView ? { x: -along.y, y: along.x } : { x: 1, y: 0 }
    const onBoot = (d: number, r: number) => ({
      x: bootTop.x + along.x * d + across.x * r,
      y: bootTop.y + along.y * d + across.y * r,
    })
    for (let r = -2.6; r <= 2.6; r += 0.5) {
      set(onBoot(-1.6, r), 'y', 'bB')
      set(onBoot(-0.6, r), 'y', 'bB')
      set(onBoot(0.4, r), 'B', 'bBy')
    }
    // The laces down the front of the shaft (side on, its front edge): little crosses, a row of
    // plain leather between each.
    const lace = frontView ? 0 : 1.4
    for (let i = 0; 1.5 + i < shaft - 0.5; i++) {
      if (i % 3 === 0) {
        set(onBoot(1.5 + i, lace - 1), 'y', 'bB')
        set(onBoot(1.5 + i, lace + 1), 'y', 'bB')
      } else if (i % 3 === 1) {
        set(onBoot(1.5 + i, lace), 'y', 'bB')
      }
    }
    // A strap over her instep, buckled in gold on the outside.
    for (let r = -2.8; r <= 2.8; r += 0.5) set(onBoot(shaft + 0.6, r), 'B', 'by')
    set(onBoot(shaft + 0.6, frontView ? 1.8 * side : -1.2), 'Y', 'bBy')
  }

  if (view === 'diagonal') {
    // Hand-drawn: one flat picture of her (pictures.ts), then her expression on its face.
    const dy = Math.round(pose.y ?? 0)
    canvas.stamp(DIAGONAL.rows, DIAGONAL.x + Math.round(pose.x ?? 0), DIAGONAL.y + dy)
    const expression = pose.face ?? 'neutral'
    if (expression !== 'neutral') {
      const eyes = EYES.diagonal[eyesFor(expression)]
      const { near, far } = DIAGONAL_EYES
      canvas.stamp(['sssss', 'sssss', 'sssss', 'sssss', 'sssss'], near.x, near.y + dy)
      canvas.stamp(['ssss', 'ssss', 'ssss', 'ssss', 'ssss'], far.x, far.y + dy)
      canvas.stamp(eyes[0]!, near.x, near.y + dy)
      canvas.stamp(eyes[1]!, far.x, far.y + dy)
      const mouth = MOUTHS[expression]
      canvas.stamp(['ss'], DIAGONAL_MOUTH.x, DIAGONAL_MOUTH.y + dy)
      canvas.stamp(mouth, DIAGONAL_MOUTH.x + 1 - mouth[0]!.length / 2, DIAGONAL_MOUTH.y + dy)
    }
  } else {
    // Her shadow on the taskbar, smaller the higher she is; none while she's carried, when she's
    // nowhere near the taskbar.
    if (pose.shadow !== false) {
      const height = Math.max(0, -(pose.y ?? 0))
      const shadow = new Layer(GRID, HEADROOM)
      shadow.ellipse({ x: hips.x, y: 95.5 }, Math.max(6, 15 - height / 2), 1.6, 'shadow')
      ink(shadow, false)
    }

    // A magic circle on the ground under her: a teal ring, a dashed silver ring inside it turning,
    // bright runes going round, and sparks rising from it.
    const rune = pose.rune ?? 0
    if (rune > 0) {
      const turned = pose.spin ?? 0
      const spin = turned * Math.PI * 2
      const ring = (a: number, scale: number) => ({
        x: hips.x + Math.cos(a) * 15 * rune * scale,
        y: 92.8 + Math.sin(a) * 2.8 * rune * scale,
      })
      for (let a = 0; a < Math.PI * 2; a += 0.02) {
        set(ring(a, 1), 'G')
        if (Math.floor(((a + spin) * 6) / Math.PI) % 2 === 0) set(ring(a, 0.62), 'f')
      }
      for (let k = 0; k < 6; k++) set(ring(spin + (k * Math.PI) / 3, 1), 'w')
      for (let k = 0; k < 5; k++) {
        const rise = (turned * 1.5 + k / 5) % 1
        const from = ring((k * Math.PI * 2) / 5 + 0.6, 0.85)
        const spark = { x: from.x, y: from.y - rise * 24 * rune }
        set(spark, 'w')
        set({ x: spark.x, y: spark.y + 1 }, 'G')
      }
    }

    // Her long hair behind her, down to the small of her back, its ends in clumps of different
    // lengths. From the front it hangs down past her shoulders, no wider than them below her locks,
    // so none of it peeks out beside her sleeves. Side on it falls from the back of her head as one
    // mass, as long as it is from the front: its back edge straight from under her hat to its ends,
    // a little wider as it goes down.
    const back = new Layer(GRID, HEADROOM)
    const backHair =
      view === 'side'
        ? [
            [-6, -4],
            [-4.5, -9],
            [-1, -11.5],
            [3, -11.5],
            [6.5, -9],
            [7.5, -5],
            [6, -2],
            [-1, 2],
            // Down her back, behind her neck and robe...
            [-3, 9],
            [-5, 17],
            [-6.5, 24],
            // ...its ends, three clumps (as from the front)...
            [-6.8, 27.4],
            [-8.3, 25.4],
            [-9.9, 28.6],
            [-11.3, 25.8],
            [-12.9, 28],
            [-13.4, 25],
            // ...and back up, straight to the back of her head.
            [-8, -3],
          ]
        : [
            [-9.5, -2],
            [-8.5, -7.5],
            [-5, -10.8],
            [0, -11.8],
            [5, -10.8],
            [8.5, -7.5],
            [9.5, -2],
            [9, 8],
            [9, 18],
            [8.5, 27],
            [6, 24],
            [3, 26],
            [-3, 26],
            [-6, 24],
            [-8.5, 27],
            [-9, 18],
            [-9, 8],
          ]
    back.polygon(
      shape(supple(backHair), (p) => onHead(blown(p))),
      'hair',
    )
    ink(back)
    if (view === 'side') {
      // Strands: a darker line down between its clumps, from the gaps between their ends up into
      // the hair, so it reads as long hair rather than a flat shape.
      for (const [top, end] of [
        [
          [-8.6, 9],
          [-8.3, 25],
        ],
        [
          [-10, 6],
          [-11.3, 25.6],
        ],
      ] as const) {
        for (let t = 0; t <= 1; t += 0.05) {
          const p = { x: top[0] + (end[0] - top[0]) * t, y: top[1] + (end[1] - top[1]) * t }
          set(onHead(blown(p)), 'D', 'hl')
        }
      }
    }

    if (!frontView) drawArm(farArm, -1)
    // The far leg first, so the near one is in front of it.
    drawLeg(farLeg, -1)
    drawLeg(nearLeg, 1)

    // The robe's skirt: long and flared, swaying, silver trim along its hem.
    const robe = new Layer(GRID, HEADROOM)
    const swing = wind * 0.4
    const hem = sitting ? 11 : 22
    const flare = sitting ? 15 : (pose.spread ?? 0)
    const skirt = frontView
      ? [
          [-8.5, -2],
          [8.5, -2],
          [13 + flare + swing, hem],
          [-13 - flare + swing, hem],
        ]
      : [
          [-5, -2],
          [5.5, -2],
          [9.5 + flare + swing, hem],
          [-9 - flare + swing, hem],
        ]
    robe.polygon(shape(skirt, onHips), 'robe')
    // Its top: the bodice, narrower, up to her collar.
    const bodice = frontView
      ? [
          [-3.5, -1],
          [3.5, -1],
          [7.5, 1.5],
          [8.5, 5],
          [8, 12],
          [8.5, 21],
          [-8.5, 21],
          [-8, 12],
          [-8.5, 5],
          [-7.5, 1.5],
        ]
      : [
          [-3, -1],
          [2.5, -1],
          [5, 2],
          [6, 8],
          [5.5, 14],
          [6, 21],
          [-5.5, 21],
          [-5.5, 14],
          [-5, 6],
          [-4.5, 2],
        ]
    robe.polygon(shape(bodice, onBody), 'robe')
    ink(robe)
    // The trim along the hem.
    const hemLeft = skirt[3]!
    const hemRight = skirt[2]!
    for (let t = 0; t <= 1; t += 0.02) {
      const p = onHips({
        x: hemLeft[0]! + (hemRight[0]! - hemLeft[0]!) * t,
        y: hem - 1,
      })
      set(p, 'f', 'aAv')
    }
    if (view !== 'side' && !sitting && !fromBehind) {
      for (let t = -1; t < hem - 1; t += 0.5) {
        set(onHips({ x: (swing * t) / hem, y: t }), 'f', 'aAv')
      }
    }
    // The collar: a V of trim, the gem brooch at its point; a darker sash at her waist.
    const off = view === 'side' ? 3 : 0
    if (view !== 'side' && !fromBehind) {
      for (let t = 0; t <= 5; t += 0.5) {
        set(onBody({ x: -3 + t * 0.6 + off, y: t - 0.5 }), 'f', 'aAv')
        set(onBody({ x: 3 - t * 0.6 + off, y: t - 0.5 }), 'f', 'aAv')
      }
    }
    if (!fromBehind) {
      canvas.stamp(
        ['.G.', 'GGG', '.G.'],
        onBody({ x: off - 1, y: 4 }).x,
        onBody({ x: off, y: 4 }).y,
      )
    }
    for (let t = -9; t <= 9; t += 0.5) {
      set(onBody({ x: t, y: 18 }), 'A', 'av')
      set(onBody({ x: t, y: 19 }), 'q', 'av')
    }
    // Where the skirt's edges are at height y (in the hips' frame), from its corners.
    const skirtAt = (y: number) => {
      const t = (y + 2) / (hem + 2)
      return {
        left: skirt[0]![0]! + (skirt[3]![0]! - skirt[0]![0]!) * t,
        right: skirt[1]![0]! + (skirt[2]![0]! - skirt[1]![0]!) * t,
      }
    }
    const centre = (y: number) => (swing * y) / hem
    // Folds: creases falling from her hips and opening out toward the hem, each a line of the
    // robe's shade with its light beside it, on the side toward the light.
    if (!sitting) {
      for (const fold of frontView ? [-4.5, 4.5] : [-1.5]) {
        for (let y = 2; y < hem - 8; y += 0.5) {
          const x = fold * (1 + (y / hem) * 0.4) + centre(y)
          set(onHips({ x, y }), 'A', 'a')
          set(onHips({ x: x - 1, y }), 'v', 'a')
        }
      }
    }
    // The border: a gold line, and below it gold diamonds with gold dots between, just above the
    // silver trim of the hem; centred on the trim down her front, so it sways with it.
    const borderY = hem - 4.5
    const edges = skirtAt(borderY)
    for (let x = edges.left + 1; x <= edges.right - 1; x += 0.5) {
      set(onHips({ x, y: borderY - 3 }), 'k', 'aAv')
    }
    for (let k = -3; k <= 3; k++) {
      const x = centre(borderY) + (view === 'side' ? 6 * k : 6 * k + 3)
      if (x < edges.left + 2 || x > edges.right - 2) continue
      motif(onHips({ x, y: borderY }), ['.Y.', 'YaY', '.Y.'], 'aAv')
      const dot = x + 3
      if (dot < edges.right - 1.5 && Math.abs(dot - centre(borderY)) > 1) {
        motif(onHips({ x: dot, y: borderY }), ['k'], 'aAv')
      }
    }
    // Stars: a scattering of silver points over the skirt, in staggered rows.
    if (!sitting) {
      for (let row = 0; row < 3; row++) {
        const y = 2 + row * 4.5
        const span = skirtAt(y)
        for (let x = (row % 2) * 3 - 12; x <= 12; x += 6) {
          const nearTrim = frontView && Math.abs(x - centre(y)) < 1.5
          if (x > span.left + 2 && x < span.right - 2 && !nearTrim) {
            motif(onHips({ x, y }), ['f'], 'a')
          }
        }
      }
    }
    // Gold buttons down the bodice from the brooch (from the front), and the sash's gold buckle.
    if (frontView && !fromBehind) {
      for (const y of [7.5, 10.5, 13.5]) motif(onBody({ x: 0, y }), ['Y'], 'aAv')
    }
    if (!fromBehind) motif(onBody({ x: off, y: 18.5 }), ['YYY', 'YkY'], 'Aqav')

    // Her head: neck, face and chin.
    const face = new Layer(GRID, HEADROOM)
    face.capsule(
      onBody({ x: view === 'side' ? 0.5 : 0, y: -3.5 }),
      onBody({ x: 0, y: 0 }),
      2.1,
      2.1,
      'skin',
    )
    if (view === 'side') {
      // The back of her head; her face is drawn by hand on top of it, below. A pixel shorter than
      // from the front, as her face is side on.
      face.ellipse({ x: head.x, y: head.y - 0.5 }, 7, 8, 'skin')
    } else {
      const shift = 0
      face.ellipse(head, 7.5, 8.3, 'skin')
      face.polygon(
        shape(
          [
            [-7, 1],
            [7, 1],
            [5 + shift, 7],
            [shift, 9.8],
            [-5 + shift * 0.5, 7],
          ],
          onHead,
        ),
        'skin',
      )
    }
    ink(face)
    if (view === 'side') {
      canvas.stamp(
        SIDE_FACE.rows,
        Math.round(head.x) + SIDE_FACE.x,
        Math.round(head.y) + SIDE_FACE.y,
      )
    }

    // Her face: eyes, blush and mouth.
    const expression = pose.face ?? 'neutral'
    const eyes = EYES[view][eyesFor(expression)]
    const look = Math.round(pose.look ?? 0)
    const eyeY = head.y - 0.5
    const mouth = MOUTHS[expression]
    if (fromBehind) {
      // No face: the back of her head (her hair, below).
    } else if (frontView) {
      canvas.stamp(eyes[0]!, head.x + 1 + look, eyeY)
      canvas.stamp(eyes[1]!, head.x - 6 + look, eyeY)
      canvas.stamp(['cc'], head.x + 3 + look, head.y + 5)
      canvas.stamp(['cc'], head.x - 5 + look, head.y + 5)
      canvas.stamp(mouth, head.x - mouth[0]!.length / 2 + look * 0.5, head.y + 6)
      set(onHead({ x: 0.5 + look * 0.5, y: 5.2 }), 'S', 's')
    } else {
      // Higher than from the front, and taller: her iris level with the bridge of her nose and the
      // tip of her nose at the bottom of her eye, as anime profiles have it.
      canvas.stamp(eyes[0]!, head.x + 1.5, eyeY - 2)
      canvas.stamp(['cc'], head.x + 0.5, head.y + 3.5)
      // Her mouth: a short line in from the notch of her lips, between nose and chin.
      canvas.stamp(
        mouth.map((r) => r.slice(0, 2)),
        head.x + 4.5,
        head.y + 4.5,
      )
    }

    // Her fringe and the locks beside her face.
    const hair = new Layer(GRID, HEADROOM)
    const fringe =
      view === 'side'
        ? [
            [-3, -6.5],
            [-1, -10.5],
            [3, -11.5],
            // Its front curving out past her forehead (which is 8 out), so it stands off her face
            // rather than lying on it, its tip hanging a pixel in front of her brow...
            [7, -9.8],
            [9, -6.5],
            [9.5, -3.5],
            [9.2, -1.5],
            // ...then its jagged lower edge, clear of her eye.
            [7.6, -3.2],
            [6.5, -4],
            [5.5, -2.6],
            [4, -4],
            [2.5, -3.4],
            [1.5, -4.8],
            [-1, -4.8],
          ]
        : [
            [-9.2, -1.5],
            [-8.7, -7],
            [-5, -10.3],
            [0, -11.3],
            [5, -10.3],
            [8.7, -7],
            [9.2, -1.5],
            [7.5, -3.6],
            [6.5, -0.4],
            [4.5, -3.4],
            [3, 0],
            [1, -3.4],
            [-1, -0.2],
            [-3, -3.4],
            [-4.6, -0.6],
            [-6.5, -3.6],
            [-7.6, -1],
          ]
    const shiftHair = 0
    if (fromBehind) {
      // All of it, from the crown of her head down over her back: as wide as her shoulders, and a
      // little longer than it shows from the front, its ends in points of different lengths.
      const fall = [
        [-9.5, -2],
        [-8.5, -7.5],
        [-5, -10.8],
        [0, -11.8],
        [5, -10.8],
        [8.5, -7.5],
        [9.5, -2],
        [9.1, 8],
        [8.9, 18],
        [8.6, 27],
        [7.4, 29.6],
        [5.8, 27.6],
        [3.9, 31],
        [2, 28.8],
        [0, 32.2],
        [-2, 28.8],
        [-3.9, 31],
        [-5.8, 27.6],
        [-7.4, 29.6],
        [-8.6, 27],
        [-8.9, 18],
        [-9.1, 8],
      ]
      hair.polygon(
        shape(supple(fall), (p) => onHead(blown(p))),
        'hair',
      )
    } else {
      hair.polygon(
        shape(fringe, (p) => onHead(blown({ x: p.x + shiftHair, y: p.y }))),
        'hair',
      )
    }
    if (view === 'side') {
      // The back of her head: its back edge in line with her hair behind it, so they read as one,
      // and its front edge behind her ear, so her cheek shows.
      const crown = [
        [1.5, -11.6],
        [-3, -11],
        [-6.5, -8],
        [-8.1, -3],
        [-9.1, 2.5],
        [-10, 7],
        [-5.5, 7.4],
        [-3, 2],
        [-1.5, -2.5],
        [1, -5],
      ]
      hair.polygon(
        shape(supple(crown), (p) => onHead(blown(p))),
        'hair',
      )
    }
    const lock = (x: number, length: number) =>
      hair.chain(
        [
          { x, y: -3 },
          { x: x * 1.03, y: 3 },
          { x: x * 1.03, y: length * 0.6 },
          { x: x * 0.98, y: length },
        ].map((p) => onHead(blown(p))),
        1.9,
        0.6,
        'hair',
      )
    // Side on there's no lock: her hair behind her ear is the back hair. Nor from behind, where
    // it's all one fall of hair.
    if (view !== 'side' && !fromBehind) {
      lock(8.2 + shiftHair, 13)
      lock(-8.2 + shiftHair * 0.5, 13)
    }
    if (view === 'side') {
      inkOverHair(hair)
      // Under her ear, a tuft of hair over the back of her jaw: jagged along the bottom, curling
      // forward to a point. A shape of its own, so it's lit and shaded as a lock of its own.
      const tuft = new Layer(GRID, HEADROOM)
      tuft.polygon(
        shape(
          supple([
            [-2.8, -0.5],
            [-1.3, 2.6],
            [-0.3, 5],
            [0.7, 7.3],
            [-1.6, 6.5],
            [-2.9, 8.2],
            [-4.2, 6.8],
            [-5.8, 7.4],
            [-5.6, 4],
            [-4.4, 1],
          ]),
          (p) => onHead(blown(p)),
        ),
        'hair',
      )
      inkOverHair(tuft)
    } else {
      ink(hair)
    }
    if (fromBehind) {
      // Strands down her back, from under her hat to the gaps between the points of its ends,
      // curving out a little as it widens, so it reads as long hair rather than a flat shape: a
      // line of shade where it's lit, and of light where it's in shade (each pixel once).
      const done = new Set<number>()
      for (const [top, end] of [
        [-1, -1],
        [2.8, 2.9],
        [-4.6, -4.9],
        [6, 6.4],
        [-7.3, -7.5],
      ] as const) {
        for (let y = 1; y <= 28; y += 0.5) {
          const t = (y - 1) / 27
          const p = onHead(
            blown({ x: top + (end - top) * t + Math.sin(t * Math.PI) * 0.5 * Math.sign(top), y }),
          )
          const [x, row] = [Math.floor(p.x), Math.floor(p.y)]
          if (done.has(row * GRID + x)) continue
          done.add(row * GRID + x)
          const was = canvas.get(x, row)
          if (was === 'h' || was === 'l') canvas.set(x, row, 'D')
          else if (was === 'D') canvas.set(x, row, 'h')
        }
      }
      // Its sheen: a band of light across the back of her head, just under the brim of her hat.
      for (let dx = -6; dx <= 4; dx++) {
        set(onHead({ x: dx, y: 0.5 + Math.abs(dx + 1) * 0.15 }), 'L', 'hl')
        if (Math.abs(dx + 1) < 4)
          set(onHead({ x: dx, y: 1.5 + Math.abs(dx + 1) * 0.15 }), 'l', 'hD')
      }
    }
    // The shine on her hair: a band across the crown.
    for (let dx = -6; dx <= 6; dx++) {
      const curve = Math.abs(dx) * 0.18
      set(onHead({ x: dx + shiftHair, y: -7.5 + curve }), 'L', 'hl')
    }

    // Her long elf ears, through her hair: both from the front, one side on.
    const ears = new Layer(GRID, HEADROOM)
    const ear = (side: 1 | -1) =>
      ears.polygon(
        shape(
          [
            [6.6, -2.4],
            [13.5, -6.8],
            [12.2, -4.6],
            [7.2, 1.6],
          ],
          (p) => onHead({ x: p.x * side, y: p.y }),
        ),
        'skin',
      )
    if (frontView) {
      ear(1)
      ear(-1)
    } else {
      ears.polygon(
        shape(
          [
            [-0.5, -1.5],
            [-9.5, -7],
            [-8, -3.8],
            [-1, 2],
          ],
          onHead,
        ),
        'skin',
      )
    }
    ink(ears)

    // Her hat: a wide brim and a tall crooked crown with a silver band.
    const hat = new Layer(GRID, HEADROOM)
    // From behind the crown is mirrored too: its tip flops over to the other side of the picture.
    const tipLean = view === 'side' || fromBehind ? -1 : 1
    const hatCentre = view === 'side' ? 0.5 : 0
    hat.ellipse(onHead({ x: hatCentre, y: -9 }), view === 'side' ? 12.5 : 14, 2.7, 'hat')
    // The crown, rising to a tip that flops over to her right from the front; side on the whole
    // crown is mirrored (`tipLean`), so the tip flops back over its back edge, and its front edge
    // runs straight up to the bend.
    hat.polygon(
      shape(
        [
          [-6.5, -9.5],
          [-4.8, -14],
          [-2.5, -18],
          [0.5, -20.5],
          [4.5, -22],
          [3.2, -19.5],
          [3.4, -16],
          [5, -12.5],
          [6.5, -9.5],
        ],
        (p) => onHead({ x: p.x * tipLean + hatCentre, y: p.y - lift * 0.15 }),
      ),
      'hat',
    )
    ink(hat)
    for (let dx = -6; dx <= 6; dx += 0.5) {
      set(onHead({ x: dx + hatCentre, y: -11 }), 'f', 'ngN')
      set(onHead({ x: dx + hatCentre, y: -12 }), 'F', 'ngN')
    }
    for (let dx = 7.5; dx <= 13; dx += 2) {
      set(onHead({ x: hatCentre + dx, y: -8.6 }), 'F', 'ngN')
      set(onHead({ x: hatCentre - dx, y: -8.6 }), 'F', 'ngN')
    }
    // Its buckle, and the gold moon and stars on its front (none from behind).
    if (!fromBehind) {
      const hatSide = view === 'side' ? 1 : 0
      motif(onHead({ x: hatCentre + hatSide * 3, y: -11.5 }), ['YYY', 'YGY', 'YYY'], 'ngNfFq')
      const lifted = (x: number, y: number) =>
        onHead({ x: x * tipLean + hatCentre, y: y - lift * 0.15 })
      motif(lifted(-1.5, -15.5), ['.YY', 'Y..', 'Y..', '.YY'], 'ngN')
      motif(lifted(2, -14.5), ['Y'], 'ngN')
      motif(lifted(1.2, -18), ['k'], 'ngN')
      motif(lifted(-3.8, -13), ['k'], 'ngN')
    }
  }

  // The near arm last, in front of her (from the front, both arms), and anything she's holding.
  let hand: Point
  // The far hand too, from the front (where she can use both, to juggle).
  let farHand: Point | null = null
  if (frontView) {
    farHand = drawArm(farArm, -1)
    hand = drawArm(nearArm, 1)
  } else {
    hand = drawArm(nearArm, 1)
  }
  let orbAt: Point | null = null
  if (pose.prop) {
    const prop = new Layer(GRID, HEADROOM)
    if (pose.prop === 'orb') {
      // A crystal ball in both hands: from the front, between them in front of her; otherwise on
      // her near hand.
      orbAt = frontView ? { x: hips.x, y: hand.y - 4.5 } : add(hand, { x: 0.5, y: -4.5 })
      prop.ellipse(orbAt, 4.2, 4.2, 'orb')
    } else if (pose.prop === 'cup') {
      prop.polygon(
        shape(
          [
            [-2.4, -3],
            [2.4, -3],
            [1.8, 1],
            [-1.8, 1],
          ],
          (p) => add(hand, p),
        ),
        'cup',
      )
      prop.capsule(add(hand, { x: 2.8, y: -2 }), add(hand, { x: 2.6, y: 0 }), 0.9, 0.9, 'cup')
    } else {
      // An open book: two pages, the cover showing round them.
      prop.polygon(
        shape(
          [
            [-6, -4],
            [5, -4.5],
            [5.5, 1.5],
            [-5.5, 2],
          ],
          (p) => add(hand, p),
        ),
        'book',
      )
    }
    ink(prop)
    if (pose.prop === 'book') {
      for (let dy = -3; dy <= 0; dy++) {
        for (let dx = -4; dx <= 4; dx++) if (dx !== 0) set(add(hand, { x: dx, y: dy }), 'f', 'ngN')
      }
      for (let dy = -3; dy <= 0; dy++) set(add(hand, { x: 0, y: dy }), 'F')
    } else {
      // A wisp of steam.
      set(add(hand, { x: -0.5, y: -5 }), 'w')
      set(add(hand, { x: 0.5, y: -6.5 }), 'w')
    }
    if (orbAt) {
      // Inside it, a wisp of light turning (`spin`) and a glint; her fingers under it.
      const turn = (pose.spin ?? 0) * Math.PI * 2
      for (const k of [0, Math.PI]) {
        set(
          { x: orbAt.x + Math.cos(turn + k) * 2, y: orbAt.y + Math.sin(turn + k) * 1.5 },
          'f',
          'G',
        )
      }
      set({ x: orbAt.x - 2, y: orbAt.y - 2 }, 'w', 'G')
      canvas.stamp(['ss.ss'], orbAt.x - 2, orbAt.y + 4)
    } else {
      canvas.stamp(['ss'], hand.x - 1, hand.y)
    }
  }

  // A little butterfly: it flutters down to just above her raised hand, rests there opening and
  // shutting its wings, then flies off up and away (out of the frame).
  const flight = pose.butterfly ?? 0
  if (flight > 0.06 && flight < 0.92) {
    const perch = add(hand, { x: 0, y: -3 })
    const between = (from: Point, to: Point, t: number) => ({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    })
    let at: Point
    let open: boolean
    if (flight < 0.3) {
      const t = (flight - 0.06) / 0.24
      const eased = t * t * (3 - 2 * t)
      at = between(add(hand, { x: 16, y: -24 }), perch, eased)
      at = { x: at.x + Math.sin(t * 9) * 2 * (1 - t), y: at.y }
      open = Math.floor(flight * 80) % 2 === 0
    } else if (flight < 0.72) {
      at = perch
      open = Math.floor((flight - 0.3) / 0.07) % 2 === 0
    } else {
      at = between(perch, add(hand, { x: 22, y: -36 }), ((flight - 0.72) / 0.2) ** 1.4)
      open = Math.floor(flight * 80) % 2 === 0
    }
    if (open) canvas.stamp(BUTTERFLY_OPEN, at.x - 2, at.y - 1)
    else canvas.stamp(BUTTERFLY_SHUT, at.x - 2, at.y)
  }

  // Dozing: z's float up from above her hat, one after another, growing as they rise.
  const zzz = pose.zzz ?? 0
  if (zzz > 0) {
    for (let k = 0; k < 3; k++) {
      const life = zzz * 1.6 - k * 0.3
      if (life <= 0 || life >= 1) continue
      const at = onHead({ x: 7 + life * 6 + k * 1.5, y: -13 - life * 12 })
      canvas.stamp(life > 0.45 ? Z_BIG : Z_SMALL, at.x, at.y, pose.flipText)
    }
  }

  // Juggling: three orbs, a third of the way round apart, each thrown up in a high arc from her far
  // hand to her near one and passed quickly back underneath (a "shower"), just above her hands.
  const juggle = pose.juggle ?? 0
  if (juggle > 0 && juggle < 1 && farHand) {
    const left = farHand
    ORBS.forEach((orb, k) => {
      const round = (juggle * JUGGLE.rounds + k / ORBS.length) % 1
      const high = round < JUGGLE.arc
      const t = high ? round / JUGGLE.arc : (round - JUGGLE.arc) / (1 - JUGGLE.arc)
      const [from, to] = high ? [left, hand] : [hand, left]
      const up = (high ? JUGGLE.high : JUGGLE.low) * 4 * t * (1 - t)
      const at = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - 3 - up }
      canvas.stamp(orb, at.x - 1, at.y - 1)
    })
  }

  // Bubbles: the wand ring held up at her near hand, and bubbles drifting up and forward from in
  // front of her mouth, wobbling and growing, each popping in a twinkle.
  const bubbles = pose.bubbles ?? 0
  if (bubbles > 0) {
    if (bubbles < BUBBLES.wandAway) {
      set(add(hand, { x: 0.5, y: -1.5 }), 'F')
      canvas.stamp(WAND_RING, hand.x, hand.y - 4)
    }
    const dy = Math.round(pose.y ?? 0)
    const from = { x: DIAGONAL_MOUTH.x + 6, y: DIAGONAL_MOUTH.y - 2 + dy }
    for (let k = 0; k < BUBBLES.count; k++) {
      const life = (bubbles - BUBBLES.first - k * BUBBLES.gap) / BUBBLES.life
      if (life <= 0 || life > 1.12) continue
      const at = {
        x: from.x + life * 15 + Math.sin(life * 9 + k * 2) * 1.5,
        y: from.y - life * 21,
      }
      if (life > 1) canvas.stamp(TWINKLE, at.x - 1, at.y - 1)
      else if (life < 0.3) canvas.stamp(BUBBLE_SMALL, at.x - 1, at.y - 1)
      else canvas.stamp(BUBBLE_BIG, at.x - 1.5, at.y - 1.5)
    }
  }

  // A will-o'-wisp going round her, with a fading tail: on the far side of her it's behind her,
  // drawn only where nothing of her is.
  const wisp = pose.wisp ?? 0
  if (wisp > 0) {
    const chest = onBody({ x: 0, y: 2 })
    const trail = [wispAt(wisp - 0.012), wispAt(wisp - 0.006)]
    trail.forEach((p, k) => {
      if (p)
        set({ x: chest.x + p.x, y: chest.y + p.y }, k === 0 ? 'f' : 'G', p.behind ? '.' : undefined)
    })
    const at = wispAt(wisp)
    if (at) {
      WISP.forEach((row, dy) =>
        [...row].forEach((letter, dx) => {
          if (letter === '.') return
          const p = { x: chest.x + at.x - 1.5 + dx, y: chest.y + at.y - 1.5 + dy }
          set(p, letter, at.behind ? '.' : undefined)
        }),
      )
    }
  }

  // A sneeze's sparkles: flying out from her nose in a wide fan above it, out past her face and
  // hair, big at first, then twinkles, then single glints, and gone.
  const burst = pose.burst ?? 0
  if (burst > 0 && burst < 1) {
    const nose = onHead({ x: 0.5, y: 5 })
    for (let k = 0; k < 7; k++) {
      const angle = -Math.PI * (-0.1 + k * 0.2)
      const reach = 6 + burst * 22
      const at = {
        x: nose.x + Math.cos(angle) * reach,
        y: nose.y + Math.sin(angle) * reach * 0.5 - burst * 4,
      }
      if (burst < 0.5 && k % 2 === 0) canvas.stamp(SPARKLE, at.x - 2, at.y - 2)
      else if (burst < 0.8) canvas.stamp(TWINKLE, at.x - 1, at.y - 1)
      else set(at, 'w')
    }
  }

  // Her sparkle trail: little sparkles on the ground behind her heel, left behind as she walks
  // and fading as they drift back: a twinkle, then a glint, then a fainter one, and gone; every
  // other one gold. Only on empty ground or her shadow, never over her.
  if (pose.trail !== undefined) {
    for (let k = 0; k < TRAIL.perStride; k++) {
      const age = (((pose.trail - k / TRAIL.perStride) % 1) + 1) % 1
      if (age >= TRAIL.life) continue
      const at = { x: hips.x - 5 - age * TRAIL.drift - (k % 2) * 2, y: 93 - (k % 2) - age * 4 }
      const gold = k % 2 === 1
      if (age < 0.1) motif(at, gold ? ['.Y.', 'YwY', '.Y.'] : TWINKLE, '.x')
      else set(at, age < 0.25 ? (gold ? 'Y' : 'w') : gold ? 'k' : 'f', '.x')
    }
  }

  // A little spell: sparkles round her raised hand.
  const sparkle = pose.sparkle ?? 0
  if (sparkle > 0) {
    const spin = sparkle * Math.PI * 2
    canvas.stamp(SPARKLE, hand.x - 2 + Math.cos(spin) * 6, hand.y - 2 - 4 + Math.sin(spin) * 4)
    canvas.stamp(
      TWINKLE,
      hand.x - 1 + Math.cos(spin + 2.1) * 7,
      hand.y - 1 - 5 + Math.sin(spin + 2.1) * 5,
    )
    canvas.stamp(
      TWINKLE,
      hand.x - 1 + Math.cos(spin + 4.2) * 5,
      hand.y - 1 - 3 + Math.sin(spin + 4.2) * 3,
    )
  }

  castShadows(canvas)

  // Dissolving: her pixels go one by one (dissolveAt), each turning white just before (so a white
  // shimmer runs over her as she goes), and each that has a mote leaving it as a white speck that
  // rises, sways and fades to silver, drawn only where nothing of her is left. Played backwards
  // (fade going down), the motes come down into place and she forms out of them.
  const fade = pose.fade ?? 0
  if (fade > 0) {
    const her = canvas.rows()
    const each = (visit: (x: number, y: number, gone: number) => void) =>
      her.forEach((row, r) =>
        [...row].forEach((letter, x) => {
          const y = r - canvas.top
          if (letter !== '.') visit(x, y, fade - dissolveAt(x, y))
        }),
      )
    each((x, y, gone) => {
      if (gone >= 0) canvas.set(x, y, '.')
      else if (gone > -FADE.glow) canvas.set(x, y, 'w')
    })
    each((x, y, gone) => {
      if (gone < 0 || gone >= FADE.life || hash(x, y, 1) > FADE.share) return
      const mote = {
        x: x + 0.5 + Math.sin(x * 1.3 + y * 0.7) * gone * 10,
        y: y + 0.5 - (gone / FADE.life) * FADE.rise,
      }
      set(mote, gone < FADE.life * 0.5 ? 'w' : 'f', '.')
    })
  }
  return canvas.rows()
}

/** Letters by part, for castShadows. */
const HAT = 'nNgqfFYkG'
const HAIR = 'ODhlL'
const ROBE = 'aAvfFYkG'

/**
 * The shadows things cast on what's just below them, which is most of what makes her look solid
 * rather than flat: her hat's brim darkens the hair under it, her fringe her forehead (and her
 * hair the tops of her ears), the sash and her sleeves the robe below them, and the robe's hem
 * her stockings and boots. Each is a pixel deep, in the shade of what it falls on. It reads the
 * frame as it was before any of them, so shadows don't pile up, and works on whatever is there,
 * so the hand-drawn diagonal picture gets them too.
 */
function castShadows(canvas: Canvas): void {
  const rows = canvas.rows()
  for (let row = 1; row < rows.length; row++) {
    // Rows from the top of the frame, its headroom first; y is the canvas's own.
    const y = row - canvas.top
    for (let x = 0; x < rows[row]!.length; x++) {
      const here = rows[row]![x]!
      const above = rows[row - 1]![x]!
      const twoAbove = row > 1 ? rows[row - 2]![x]! : '.'
      let shade: string | null = null
      if ('hlL'.includes(here) && HAT.includes(above)) shade = 'D'
      else if ('sz'.includes(here) && HAIR.includes(above)) shade = 'S'
      // A seam inside the robe (the sash, a sleeve's edge): an outline with robe above it too.
      else if ('av'.includes(here) && above === 'q' && ROBE.includes(twoAbove)) shade = 'A'
      else if (here === 'o' && above === 'q') shade = 'Q'
      else if ('by'.includes(here) && above === 'q') shade = 'B'
      if (shade) canvas.set(x, y, shade)
    }
  }
}
