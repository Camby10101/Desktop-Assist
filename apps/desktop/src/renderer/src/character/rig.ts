import { UI } from '@shared/geometry'
import { Canvas, Layer, add, limb, rotate, type Point, type Ramp } from './raster'
import { DIAGONAL, DIAGONAL_EYES, DIAGONAL_HATLESS, DIAGONAL_MOUTH, SIDE_FACE } from './pictures'

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

/** Whether she wears her hat: Settings → No hat takes it off (see setHat in sprite.ts). */
let wearingHat = true

/** Puts her hat on or takes it off, for every frame drawn after (sprite.ts redraws them). */
export function wearHat(on: boolean): void {
  wearingHat = on
}

/** Whether she's wearing her hat. */
export const wearsHat = (): boolean => wearingHat
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
  /** Her yo-yo (from the front), this far through its habit (0 to 1): see YOYO. */
  yoyo?: number
  /** Her spinning top on her palm (from the front), this far through (0 to 1): see SPIN_TOP. */
  spinTop?: number
  /** Her deck of cards, sprung between her hands (from the front), this far through: see DECK. */
  deck?: number
  /** Her paper plane, flying a loop round her (from the front), this far through: see PLANE. */
  plane?: number
  /** Her bouncy ball, bounced and tossed (from the front), this far through: see BALL. */
  ball?: number
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
  /** A flame in her near palm (seen diagonally), 0 to 1: kindled, flickering, blown out in smoke. */
  flame?: number
  /** A snowflake forming over her cupped hands (from the front), 0 to 1, then bursting into glitter. */
  frost?: number
  /** A flower growing up in front of her (seen diagonally), 0 to 1: blooming, then scattering. */
  bloom?: number
  /** A star traced in light in the air beside her (from the front), 0 to 1: flaring, then fading. */
  sigil?: number
  /** A rainbow over her (from the front), 0 to 1: painted from the top outward, then fading. */
  rainbow?: number
  /** Her hat lifted off her head (pixels up), and turned about its middle (radians; 0 faces us). */
  hatLift?: number
  hatTurn?: number
  /** Sparkles showering down from under her lifted hat, 0 to 1 (none at 0). */
  shower?: number
  /** A falling star (from the front), 0 to 1: falling into her hands, glowing, tossed back up. */
  star?: number
  /** A little rain cloud over her (from the front), 0 to 1: gathering, raining, bursting. */
  rain?: number
  /** A potion in her near hand (seen diagonally), 0 to 1: bubbling, uncorked in a puff of smoke. */
  potion?: number
  /** Her spellbook floating open in front of her (from the front), 0 to 1: see TOME. */
  tome?: number
  /** Stars going round above her head after a hard landing, this far round (whole turns). */
  dizzy?: number
  /** Dust puffing out along the ground either side of her after a hard landing, 0 to 1. */
  dust?: number
  /** Confetti bursting up from her hands and fluttering down round her, 0 to 1. */
  confetti?: number
  /** Hearts floating up from her (petted), 0 to 1. */
  hearts?: number
  /** A scroll held open in front of her in both hands (from the front). */
  scroll?: boolean
  /** A bead of sweat by her forehead (nervous). */
  sweat?: boolean
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
/** Her yo-yo, spinning (two turns, a frame each): pink, a gold band, a white glint. */
const YOYO_SPIN = [
  ['.cc.', 'cYwc', 'cwYc', '.cc.'],
  ['.cc.', 'cwYc', 'cYwc', '.cc.'],
]
/** Her spinning top, a handle up top and a silver point below, its stripes turning as it spins. */
const TOP_SPIN = [
  ['..k..', 'YGYGY', '.YGY.', '..Y..', '..f..'],
  ['..k..', 'GYGYG', '.GYG.', '..G..', '..f..'],
]
/** A playing card in flight, and her deck in her hand: white with a silver edge and a pink pip. */
const CARD = ['fff', 'fcf', 'fwf', 'fff']
const DECK_STACK = ['ffff', 'fcwf', 'fwwf', 'Ffff', 'FFFF']
/** A paper plane flying right (flying left, it's mirrored): white paper, a silver fold under it. */
const PAPER_PLANE = ['w......', 'wwww...', '.fwwwww', '..ff...']
/** Her bouncy ball, round and squashed flat as it hits the taskbar: teal with a white glint. */
const BOUNCY_BALL = ['.GG.', 'GwGG', 'GGGG', '.GG.']
const BOUNCY_BALL_FLAT = ['.GGGG.', 'GGwGGG', '.GGGG.']
/** A soap bubble, small and grown: a teal ring (see-through inside) with a white glint. */
const BUBBLE_SMALL = ['.G.', 'G.G', '.G.']
const BUBBLE_BIG = ['.GG.', 'Gw.G', 'G..G', '.GG.']
/** The little silver wand ring she blows bubbles through. */
const WAND_RING = ['.f.', 'f.f', '.f.']
/** A will-o'-wisp: a round teal light with a white heart. */
const WISP = ['.GG.', 'GwwG', 'GwwG', '.GG.']
/** A gold twinkle, and a little gold star with a white heart. */
const GOLD_TWINKLE = ['.Y.', 'YwY', '.Y.']
const STAR = ['..Y..', '.YjY.', 'YjwjY', '.YjY.', 'Y...Y']
/**
 * A flame, tip first, from a spark to its fullest: dark red round its edge, orange, a yellow
 * heart and a white core, its tip leaning to one side (mirrored, it flickers to the other).
 */
const FLAMES = [
  ['j', 'w'],
  ['.m.', '.I.', 'IjI', '.I.'],
  ['..m..', '.mI..', '.IjI.', 'mIwjI', '.IjI.'],
  ['..m....', '..mI...', '..IIm..', '.mIjIm.', '.IjwjI.', 'mIjwwIm', '.IjwjI.', '..III..'],
]
/** A little potion flask: a cork (`o`), glass, and the potion inside (`X`), with a glint. */
const FLASK = ['..o..', '.fof.', '.fXf.', 'fXXXf', 'fXwXf', 'fXXXf', '.fff.']
/** The colours the potion goes through as it bubbles: teal, her colour, pink, gold. */
const POTION_COLOURS = ['G', 'a', 'c', 'Y']
/** The glowing letters that rise out of her spellbook. */
const GLYPHS = [
  ['Y.', 'YY', '.Y'],
  ['.Y', 'Y.', 'YY'],
  ['YY', 'Y.', 'YY'],
  ['Y.Y', '.Y.'],
]
/** A flower, half open and open: pink petals, a gold heart. */
const BUD = ['.c.', 'cmc', '.P.']
const FLOWER_HALF = ['.c.c.', 'ccYcc', '.cmc.']
const FLOWER = ['.cc.cc.', 'cccmccc', '.cmYmc.', 'cccmccc', '.cc.cc.']
/** The rainbow's bands, outside in: red, orange, yellow, teal, and her colour for its violet. */
const RAINBOW_BANDS = ['m', 'I', 'j', 'G', 'a']
/** A heart, big and small: pink, outlined in red. */
const HEART = ['.m.m.', 'mcmcm', 'mcccm', '.mcm.', '..m..']
const HEART_SMALL = ['c.c', 'ccc', '.c.']
/** A scroll: a sheet of parchment between its two rolled ends, lines of writing and a red seal. */
const SCROLL = [
  'Ff.........fF',
  'FflllllllllfF',
  'FflDDDlDDllfF',
  'FflDDlDDDllfF',
  'FflDDDDlDllfF',
  'FfllllllmmlfF',
  'Ff.........fF',
]
/** A bead of sweat. */
const SWEAT = ['.w.', 'wGw', 'GGG', '.G.']
/** Confetti's colours: pink, teal, gold, her colour, red, yellow and white. */
const CONFETTI = ['c', 'G', 'Y', 'a', 'm', 'j', 'w']

/** How far `t` is through the stretch from `from` to `to`: 0 before it, 1 after it. */
const stage = (t: number, from: number, to: number) =>
  Math.min(1, Math.max(0, (t - from) / (to - from)))

/**
 * The flame (Pose.flame): when the spark comes, when it's burning fully, and when she blows it out
 * (from and to); shares of the habit.
 */
export const FLAME = { kindle: 0.1, full: 0.3, blow: [0.62, 0.7] as const }

/** The snowflake (Pose.frost): growing (from, to), then bursting into glitter (from, to). */
export const FROST = { grow: [0.12, 0.45] as const, burst: [0.72, 0.97] as const }

/**
 * The flower (Pose.bloom): sparkles dripping from her finger, the stem growing, the flower opening
 * and finally scattering (each from, to); and how far in front of her it grows (pixels).
 */
export const BLOOM = {
  drip: [0.08, 0.34] as const,
  grow: [0.26, 0.5] as const,
  open: [0.5, 0.62] as const,
  scatter: [0.86, 0.98] as const,
  ahead: 18,
}

/**
 * The star traced in the air (Pose.sigil): tracing it (from, to), then fading (from, to); and how
 * far out its points and the corners between them are (pixels).
 */
export const SIGIL = {
  trace: [0.1, 0.55] as const,
  fade: [0.8, 0.96] as const,
  outer: 8.5,
  inner: 3.6,
}

/**
 * The rainbow (Pose.rainbow): painted from its top outward (from, to) as her hands sweep apart,
 * fading (from, to); how far round it goes either side of its top (radians), and how big it is.
 */
export const RAINBOW = {
  paint: [0.12, 0.45] as const,
  fade: [0.76, 0.96] as const,
  span: 1.94,
  rx: 44,
  ry: 42,
}

/** The falling star (Pose.star): falling (from, to), in her hands, then tossed up (from, to). */
export const STAR_CATCH = { fall: [0.08, 0.35] as const, toss: [0.72, 0.86] as const }

/** The rain cloud (Pose.rain): gathering, raining and bursting (each from, to). */
export const RAIN = {
  gather: [0.05, 0.25] as const,
  pour: [0.25, 0.72] as const,
  burst: [0.72, 0.9] as const,
}

/** The potion (Pose.potion): when the cork pops, and the smoke puffing out (until). */
export const POTION = { pop: 0.5, puffed: 0.95 }

/**
 * Her spellbook floating (Pose.tome): appearing (from, to), its pages turning (from, to, and how
 * many), the glowing letters rising (from, to), and closing and vanishing (from, to each).
 */
export const TOME = {
  appear: [0.04, 0.16] as const,
  turn: [0.2, 0.76] as const,
  pages: 4,
  letters: [0.22, 0.84] as const,
  close: [0.8, 0.9] as const,
  vanish: [0.9, 0.98] as const,
}

/**
 * Juggling (Pose.juggle): how many times each orb goes round, hand to hand and back, while she
 * juggles; how far up its high arc goes above her hands, and its low pass back (pixels); and the
 * share of the way round spent on the high arc.
 */
export const JUGGLE = { rounds: 4, high: 28, low: 5, arc: 0.62 }

// Her toys, each summoned into her hand in a sparkle (`appear`) and gone in a twinkle (`gone`),
// with what she does with it between: shares of the habit (0 to 1), and sizes in pixels.

/** Her yo-yo (Pose.yoyo): its drops (how many, how far down) and its loop round her hand. */
export const YOYO = {
  appear: [0.03, 0.13],
  drops: [0.13, 0.7],
  count: 4,
  length: 24,
  loop: [0.72, 0.86],
  radius: 14,
  gone: [0.88, 0.97],
} as const
/** Her spinning top (Pose.spinTop): spinning on her palm, then flicked up (this high) and caught. */
export const SPIN_TOP = {
  appear: [0.03, 0.13],
  spin: [0.13, 0.72],
  flick: [0.72, 0.84],
  height: 16,
  gone: [0.88, 0.97],
} as const
/** Her cards (Pose.deck): sprung across to her near hand, and back; how many; each card's flight. */
export const DECK = {
  appear: [0.03, 0.13],
  across: [0.15, 0.47],
  back: [0.5, 0.82],
  cards: 9,
  flight: 0.1,
  arc: 13,
  gone: [0.88, 0.97],
} as const
/** Her paper plane (Pose.plane): thrown, flying one loop round her (how wide, how deep), caught. */
export const PLANE = {
  appear: [0.03, 0.13],
  fly: [0.18, 0.84],
  rx: 28,
  ry: 8,
  gone: [0.88, 0.97],
} as const
/** Her bouncy ball (Pose.ball): bounced on the taskbar (how many times), then tossed up and caught. */
export const BALL = {
  appear: [0.03, 0.13],
  bounces: [0.14, 0.62],
  count: 4,
  toss: [0.66, 0.84],
  height: 30,
  gone: [0.88, 0.97],
} as const

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
  /**
   * Her arms when she's seen from behind: drawn before her head and hair (see below), so her long
   * hair falls over them while they're still in front of her robe. Null otherwise.
   */
  let armsFromBehind: { hand: Point; farHand: Point } | null = null
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
  /** A leg, clipped to below `hemLine` (the robe's hem: its left end, then its right). */
  const drawLeg = (leg: Leg, side: 1 | -1, hemLine: readonly Point[]) => {
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
    // Under her long robe, nothing of her leg shows above its hem, however she bends: crouching
    // (her knees go out to the sides), sitting, or sprawled after a fall. Without this her thighs
    // showed beside the robe as she sat down, and her stockings beside her waist once she sat.
    const [hemLeft, hemRight] = hemLine as [Point, Point]
    const hemAt = (x: number) =>
      hemLeft.y + ((hemRight.y - hemLeft.y) * (x - hemLeft.x)) / (hemRight.x - hemLeft.x)
    for (let y = Math.floor(layer.minY); y <= layer.maxY; y++) {
      for (let x = Math.floor(layer.minX); x <= layer.maxX; x++) {
        if (y + 0.5 < hemAt(x + 0.5) - 1) layer.set(x, y, undefined)
      }
    }
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
    // The picture has her shadow in it: left out when she has none (thrown, in the air).
    // Without her hat (Settings → No hat), the picture of her with the top of her head drawn instead.
    const drawing = wearingHat ? DIAGONAL : DIAGONAL_HATLESS
    const picture =
      pose.shadow === false ? drawing.rows.map((row) => row.replace(/x/g, '.')) : drawing.rows
    canvas.stamp(picture, DIAGONAL.x + Math.round(pose.x ?? 0), DIAGONAL.y + dy)
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
    // The robe's skirt, measured before her legs are drawn: they never show above its hem.
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

    // The far leg first, so the near one is in front of it.
    const hemLine = shape([skirt[3]!, skirt[2]!], onHips)
    drawLeg(farLeg, -1, hemLine)
    drawLeg(nearLeg, 1, hemLine)

    // The robe's skirt: long and flared, swaying, silver trim along its hem (measured above).
    const robe = new Layer(GRID, HEADROOM)
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

    // From behind, her arms go here: in front of her robe, and behind her hair, which falls down
    // her back over them (drawn after them). Drawn last, as from the front, they floated over it.
    if (fromBehind) armsFromBehind = { farHand: drawArm(farArm, -1), hand: drawArm(nearArm, 1) }

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

    // Her hat: a wide brim and a tall crooked crown with a silver band (unless it's off: wearHat).
    if (wearingHat) {
      const hat = new Layer(GRID, HEADROOM)
      // From behind the crown is mirrored too: its tip flops over to the other side of the picture.
      const tipLean = view === 'side' || fromBehind ? -1 : 1
      const hatCentre = view === 'side' ? 0.5 : 0
      // Lifted off her head and turning (her hat trick): narrowing to its edge and widening again,
      // its back to us, then its front (never quite to nothing); a point on it at `x`, `y`.
      const hatLift = pose.hatLift ?? 0
      const facing = Math.cos(pose.hatTurn ?? 0)
      const across = (facing < 0 ? -1 : 1) * Math.max(0.15, Math.abs(facing))
      const onHat = (x: number, y: number) => onHead({ x: hatCentre + x * across, y: y - hatLift })
      hat.ellipse(onHat(0, -9), (view === 'side' ? 12.5 : 14) * Math.abs(across), 2.7, 'hat')
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
          (p) => onHat(p.x * tipLean, p.y - lift * 0.15),
        ),
        'hat',
      )
      ink(hat)
      for (let dx = -6; dx <= 6; dx += 0.5) {
        set(onHat(dx, -11), 'f', 'ngN')
        set(onHat(dx, -12), 'F', 'ngN')
      }
      for (let dx = 7.5; dx <= 13; dx += 2) {
        set(onHat(dx, -8.6), 'F', 'ngN')
        set(onHat(-dx, -8.6), 'F', 'ngN')
      }
      // Its buckle, and the gold moon and stars on its front (none from behind, nor while its back
      // or its edge is to us as it turns).
      if (!fromBehind && across > 0.5) {
        const hatSide = view === 'side' ? 1 : 0
        motif(onHat(hatSide * 3, -11.5), ['YYY', 'YGY', 'YYY'], 'ngNfFq')
        const lifted = (x: number, y: number) => onHat(x * tipLean, y - lift * 0.15)
        motif(lifted(-1.5, -15.5), ['.YY', 'Y..', 'Y..', '.YY'], 'ngN')
        motif(lifted(2, -14.5), ['Y'], 'ngN')
        motif(lifted(1.2, -18), ['k'], 'ngN')
        motif(lifted(-3.8, -13), ['k'], 'ngN')
      }
    }
  }

  // The near arm last, in front of her (from the front, both arms), and anything she's holding.
  let hand: Point
  // The far hand too, from the front (where she can use both, to juggle).
  let farHand: Point | null = null
  const behind = armsFromBehind as { hand: Point; farHand: Point } | null
  if (behind) {
    // From behind they're drawn already, under her hair.
    hand = behind.hand
    farHand = behind.farHand
  } else if (frontView) {
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

  // A puff of sparkle where one of her toys appears (`k`, 0 to 1 through it) or goes: a sparkle,
  // then a twinkle.
  const poof = (at: Point, k: number) => {
    if (k <= 0 || k >= 1) return
    if (k < 0.55) canvas.stamp(SPARKLE, at.x - 2, at.y - 2)
    else canvas.stamp(TWINKLE, at.x - 1, at.y - 1)
  }
  /** Whether a toy shows: from half way through its sparkle to half way through its twinkle. */
  const shows = (appear: number, gone: number) => appear >= 0.5 && gone < 0.5

  // Her yo-yo: in her near hand; spun down on its silver string and back up, a few times; then
  // swung out round her hand in a loop; then gone.
  const yoyo = pose.yoyo ?? 0
  if (yoyo > 0 && yoyo < 1) {
    const grip = { x: hand.x, y: hand.y + 1 }
    const drops = stage(yoyo, ...YOYO.drops)
    const loop = stage(yoyo, ...YOYO.loop)
    let at = grip
    if (drops > 0 && drops < 1) {
      at = { x: grip.x, y: grip.y + YOYO.length * Math.sin(Math.PI * ((drops * YOYO.count) % 1)) }
    } else if (loop > 0 && loop < 1) {
      // Out, round over her hand and back in: down, out to the side, up, across, down again.
      const angle = Math.PI / 2 - loop * Math.PI * 2
      const r = YOYO.radius * Math.sin(Math.PI * loop)
      at = { x: grip.x + r * Math.cos(angle), y: grip.y + r * Math.sin(angle) }
    }
    const appear = stage(yoyo, ...YOYO.appear)
    const gone = stage(yoyo, ...YOYO.gone)
    if (shows(appear, gone)) {
      const length = Math.hypot(at.x - grip.x, at.y - grip.y)
      for (let s = 1; s < length; s++) {
        set(
          {
            x: grip.x + ((at.x - grip.x) * s) / length,
            y: grip.y + ((at.y - grip.y) * s) / length,
          },
          'f',
        )
      }
      canvas.stamp(YOYO_SPIN[Math.floor(yoyo * 50) % 2]!, at.x - 1.5, at.y - 1.5)
    }
    poof(grip, appear)
    poof(at, gone)
  }

  // Her spinning top: spinning on her palm, wobbling more as it slows; flicked up and caught.
  const spinTop = pose.spinTop ?? 0
  if (spinTop > 0 && spinTop < 1) {
    // Standing on her palm, clear of her cuff.
    const palm = { x: hand.x + 1, y: hand.y - 3 }
    const spin = stage(spinTop, ...SPIN_TOP.spin)
    const flick = stage(spinTop, ...SPIN_TOP.flick)
    const wobble = spin > 0 && spin < 1 ? Math.sin(spinTop * 70) * (0.3 + spin * 0.9) : 0
    const lift = flick > 0 && flick < 1 ? SPIN_TOP.height * 4 * flick * (1 - flick) : 0
    const at = { x: palm.x + wobble, y: palm.y - lift }
    const appear = stage(spinTop, ...SPIN_TOP.appear)
    const gone = stage(spinTop, ...SPIN_TOP.gone)
    if (shows(appear, gone)) {
      const turning = spinTop < SPIN_TOP.flick[1] ? Math.floor(spinTop * 60) % 2 : 0
      canvas.stamp(TOP_SPIN[turning]!, at.x - 2, at.y - 5)
    }
    poof({ x: palm.x, y: palm.y - 3 }, appear)
    poof({ x: palm.x, y: palm.y - 3 }, gone)
  }

  // Her cards: a deck in her far hand, sprung across to her near hand one after another in an arc,
  // then back again; then gone.
  const deck = pose.deck ?? 0
  if (deck > 0 && deck < 1 && farHand) {
    const far = { x: farHand.x, y: farHand.y - 2 }
    const near = { x: hand.x, y: hand.y - 2 }
    // How many cards are still to go, in the air, or there, for a spring from `a` to `b`.
    const spring = (span: readonly [number, number], a: Point, b: Point) => {
      const stagger = (span[1] - span[0] - DECK.flight) / (DECK.cards - 1)
      let waiting = 0
      let landed = 0
      for (let k = 0; k < DECK.cards; k++) {
        const u = (deck - span[0] - k * stagger) / DECK.flight
        if (u <= 0) waiting++
        else if (u >= 1) landed++
        else {
          const at = {
            x: a.x + (b.x - a.x) * u,
            y: a.y + (b.y - a.y) * u - DECK.arc * 4 * u * (1 - u),
          }
          canvas.stamp(CARD, at.x - 1, at.y - 2)
        }
      }
      return { waiting, landed }
    }
    const appear = stage(deck, ...DECK.appear)
    const gone = stage(deck, ...DECK.gone)
    let inFar: number = DECK.cards
    let inNear = 0
    if (deck >= DECK.across[0] && deck < DECK.back[0]) {
      const across = spring(DECK.across, far, near)
      inFar = across.waiting
      inNear = across.landed
    } else if (deck >= DECK.back[0] && deck < DECK.back[1] + DECK.flight) {
      const back = spring(DECK.back, near, far)
      inNear = back.waiting
      inFar = back.landed
    }
    if (shows(appear, gone)) {
      if (inFar > 0) canvas.stamp(DECK_STACK, far.x - 1.5, far.y - 2)
      if (inNear > 0) canvas.stamp(DECK_STACK, near.x - 1.5, near.y - 2)
    }
    poof(far, appear)
    poof(far, gone)
  }

  // Her paper plane: in her near hand; thrown, it flies one loop round her, out to the side, behind
  // her (where only what isn't her shows it) and back across in front, to her hand; then gone.
  const plane = pose.plane ?? 0
  if (plane > 0 && plane < 1) {
    const held = { x: hand.x, y: hand.y - 2 }
    const fly = stage(plane, ...PLANE.fly)
    let at = held
    let behind = false
    let right = true
    if (fly > 0 && fly < 1) {
      const chest = onBody({ x: 0, y: 2 })
      const angle = Math.PI / 4 - fly * Math.PI * 2
      const loop = {
        x: chest.x + PLANE.rx * Math.cos(angle),
        y: chest.y + PLANE.ry * Math.sin(angle) + Math.sin(fly * Math.PI * 4) * 1.5,
      }
      // Leaving her hand and coming back to it, it eases between her hand and the loop.
      const ease = Math.min(1, fly / 0.12, (1 - fly) / 0.12)
      at = { x: held.x + (loop.x - held.x) * ease, y: held.y + (loop.y - held.y) * ease }
      behind = Math.sin(angle) < 0
      right = Math.sin(angle) >= 0
    }
    const appear = stage(plane, ...PLANE.appear)
    const gone = stage(plane, ...PLANE.gone)
    if (shows(appear, gone)) {
      PAPER_PLANE.forEach((row, dy) =>
        [...(right ? row : [...row].reverse().join(''))].forEach((letter, dx) => {
          if (letter === '.') return
          set({ x: at.x - 3 + dx, y: at.y - 2 + dy }, letter, behind ? '.' : undefined)
        }),
      )
    }
    poof(held, appear)
    poof(held, gone)
  }

  // Her bouncy ball: in her near hand; bounced on the taskbar a few times (squashing as it hits),
  // then tossed up high and caught; then gone.
  const ball = pose.ball ?? 0
  if (ball > 0 && ball < 1) {
    const top = { x: hand.x, y: hand.y + 2 }
    const ground = 93
    const bounces = stage(ball, ...BALL.bounces)
    const toss = stage(ball, ...BALL.toss)
    let at = top
    let flat = false
    if (bounces > 0 && bounces < 1) {
      // 1 in her hand, 0 on the taskbar: down fast, a sharp bounce, up again.
      const u = Math.abs(((bounces * BALL.count) % 1) * 2 - 1)
      at = { x: top.x, y: ground - (ground - top.y) * u }
      flat = u < 0.08
    } else if (toss > 0 && toss < 1) {
      at = { x: top.x, y: top.y - BALL.height * 4 * toss * (1 - toss) }
    }
    const appear = stage(ball, ...BALL.appear)
    const gone = stage(ball, ...BALL.gone)
    if (shows(appear, gone)) {
      if (flat) canvas.stamp(BOUNCY_BALL_FLAT, at.x - 2.5, ground)
      else canvas.stamp(BOUNCY_BALL, at.x - 1.5, at.y - 1.5)
    }
    poof(top, appear)
    poof(top, gone)
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

  // A flame in her palm: a spark, growing and flickering (its tip leaning one way, then the
  // other), then blown out, leaning away from her as it shrinks, into a curl of smoke rising with a
  // few sparks.
  const flame = pose.flame ?? 0
  if (flame > 0 && flame < 1) {
    const palm = add(hand, { x: 0.5, y: -1 })
    const blown = stage(flame, ...FLAME.blow)
    if (flame >= FLAME.kindle && blown < 1) {
      const grown = stage(flame, FLAME.kindle, FLAME.full)
      const size =
        blown > 0 ? (blown < 0.5 ? 2 : 1) : grown < 0.25 ? 0 : grown < 0.6 ? 1 : grown < 1 ? 2 : 3
      const picture = FLAMES[size]!
      const flicker = blown === 0 && hash(Math.floor(flame * 60), 3) < 0.5
      const x = palm.x - (picture[0]!.length - 1) / 2 + (blown > 0 ? 1 + blown * 2 : 0)
      canvas.stamp(picture, x, palm.y - picture.length + 1, flicker)
    }
    const smoke = stage(flame, FLAME.blow[1], 0.95)
    if (smoke > 0 && smoke < 1) {
      for (let k = 0; k < 5; k++) {
        const life = smoke * 1.6 - k * 0.15
        if (life <= 0 || life >= 1) continue
        const at = { x: palm.x + 1 + Math.sin(life * 6 + k) * 2, y: palm.y - 2 - life * 18 }
        if (life < 0.4) canvas.stamp(['ff', 'ff'], at.x, at.y)
        else set(at, life < 0.75 ? 'f' : 'F')
      }
      for (let k = 0; k < 3; k++) {
        const life = smoke * 2 - k * 0.2
        if (life <= 0 || life >= 1) continue
        set(
          { x: palm.x + (k - 1) * (2 + life * 4), y: palm.y - 3 - life * 10 },
          life < 0.5 ? 'Y' : 'k',
        )
      }
    }
  }

  // A snowflake over her cupped hands: six arms growing out from its heart, branching, a glint
  // going round its tips; then it bursts into glitter that flies out and drifts down, twinkling.
  const frost = pose.frost ?? 0
  if (frost > 0 && frost < 1 && farHand) {
    const c = {
      x: (hand.x + farHand.x) / 2,
      y: Math.min(hand.y, farHand.y) - 9 + Math.sin(frost * 25) * 0.6,
    }
    const burst = stage(frost, ...FROST.burst)
    const grown = stage(frost, ...FROST.grow)
    if (burst === 0 && grown > 0) {
      const reach = 1 + grown * 5
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 2 + (k * Math.PI) / 3
        const out = { x: Math.cos(a), y: Math.sin(a) }
        for (let r = 1; r <= reach; r += 0.5) {
          set({ x: c.x + out.x * r, y: c.y + out.y * r }, r > reach - 1 ? 'G' : 'w')
        }
        if (reach < 3.5) continue
        for (const side of [-1, 1]) {
          const b = a + (side * Math.PI) / 3
          const from = { x: c.x + out.x * reach * 0.55, y: c.y + out.y * reach * 0.55 }
          for (let r = 0.5; r <= reach * 0.35; r += 0.5) {
            set({ x: from.x + Math.cos(b) * r, y: from.y + Math.sin(b) * r }, 'f')
          }
        }
      }
      set(c, 'w')
      if (grown >= 1) {
        const a = Math.PI / 2 + ((Math.floor(frost * 24) % 6) * Math.PI) / 3
        canvas.stamp(TWINKLE, c.x - 1 + Math.cos(a) * reach, c.y - 1 + Math.sin(a) * reach)
      }
    } else if (burst > 0 && burst < 1) {
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2 + 0.2
        const out = 3 + (1 - (1 - burst) ** 2) * 14
        const at = {
          x: c.x + Math.cos(a) * out,
          y: c.y + Math.sin(a) * out * 0.6 + burst * burst * 12,
        }
        if (burst < 0.3 && k % 3 === 0) canvas.stamp(TWINKLE, at.x - 1, at.y - 1)
        else set(at, (k + Math.floor(burst * 10)) % 3 === 0 ? 'w' : k % 2 ? 'G' : 'f')
      }
    }
  }

  // A flower: sparkles drip from her pointing finger to the ground in front of her, where a sprout
  // comes up, grows leaves and a bud, and opens into a pink flower that sways and twinkles; at the
  // end it glows and scatters into sparkles.
  const bloom = pose.bloom ?? 0
  if (bloom > 0 && bloom < 1) {
    const ground = { x: hips.x + BLOOM.ahead, y: 94 }
    const drip = stage(bloom, ...BLOOM.drip)
    if (drip > 0 && drip < 1) {
      const tip = add(hand, { x: 1, y: 1 })
      for (let k = 0; k < 3; k++) {
        const fall = (drip * 3 + k / 3) % 1
        const at = {
          x: tip.x + (ground.x - tip.x) * fall,
          y: tip.y + (ground.y - 2 - tip.y) * fall,
        }
        set(at, k === 1 ? 'Y' : 'w')
      }
    }
    const grown = stage(bloom, ...BLOOM.grow)
    const open = stage(bloom, ...BLOOM.open)
    const scatter = stage(bloom, ...BLOOM.scatter)
    if (grown > 0 && scatter === 0) {
      const tall = Math.round(1 + grown * 12)
      const sway = Math.sin(bloom * 16) * 0.8 * stage(bloom, 0.6, 0.66)
      for (let k = 0; k < tall; k++) set({ x: ground.x + (sway * k) / tall, y: ground.y - k }, 'E')
      // Leaves either side as it grows: a pair low down, then one higher up.
      for (const [height, side] of [
        [3, -1],
        [5, 1],
        [8, -1],
      ] as const) {
        if (tall < height + 2) continue
        set({ x: ground.x + side, y: ground.y - height }, 'E')
        set({ x: ground.x + side * 2, y: ground.y - height - 1 }, 'E')
        set({ x: ground.x + side * 3, y: ground.y - height - 1 }, 'P')
      }
      const top = { x: ground.x + sway, y: ground.y - tall }
      if (open > 0) {
        const flower = open < 0.5 ? FLOWER_HALF : FLOWER
        canvas.stamp(flower, top.x - (flower[0]!.length - 1) / 2, top.y - (flower.length - 1) / 2)
        if (open >= 1 && Math.floor(bloom * 30) % 4 === 0) {
          canvas.stamp(TWINKLE, top.x + 3, top.y - 6)
        }
      } else if (grown >= 1) {
        canvas.stamp(BUD, top.x - 1, top.y - 1)
      }
    } else if (scatter > 0 && scatter < 1) {
      const top = { x: ground.x, y: ground.y - 13 }
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2
        const at = {
          x: top.x + Math.cos(a) * scatter * 9,
          y: top.y + Math.sin(a) * scatter * 4 - scatter * 10,
        }
        if (scatter < 0.35 && k % 2 === 0) canvas.stamp(TWINKLE, at.x - 1, at.y - 1)
        else set(at, scatter < 0.6 ? (k % 2 ? 'c' : 'Y') : 'w')
      }
    }
  }

  // A star traced in the air beside her: a point of light draws its outline, five points round,
  // in gold; it flashes white as it closes, glows with a sparkle at its heart, and fades away a
  // pixel at a time, motes rising from its points.
  const sigil = pose.sigil ?? 0
  if (sigil > 0 && sigil < 1) {
    const c = { x: hips.x + 20, y: head.y - 7 }
    const corners = Array.from({ length: 10 }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const r = i % 2 === 0 ? SIGIL.outer : SIGIL.inner
      return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r }
    })
    const along = (s: number) => {
      const i = Math.floor(s) % 10
      const [from, to] = [corners[i]!, corners[(i + 1) % 10]!]
      return { x: from.x + (to.x - from.x) * (s % 1), y: from.y + (to.y - from.y) * (s % 1) }
    }
    const traced = stage(sigil, ...SIGIL.trace) * 10
    const flash = sigil >= SIGIL.trace[1] && sigil < SIGIL.trace[1] + 0.06
    const fading = stage(sigil, ...SIGIL.fade)
    if (fading < 1) {
      for (let s = 0; s < Math.min(10, traced); s += 0.08) {
        const p = along(s)
        if (fading > 0 && hash(Math.round(p.x), Math.round(p.y), 5) < fading) continue
        set(p, flash ? 'w' : 'Y')
      }
    }
    if (traced > 0 && traced < 10) {
      const tip = along(traced)
      canvas.stamp(TWINKLE, tip.x - 1, tip.y - 1)
    } else if (traced >= 10 && fading === 0) {
      const glint = Math.floor(sigil * 20) % 2 === 0 ? SPARKLE : TWINKLE
      canvas.stamp(glint, c.x - (glint.length - 1) / 2, c.y - (glint.length - 1) / 2)
    } else if (fading > 0 && fading < 1) {
      for (let k = 0; k < 5; k++) {
        const point = corners[k * 2]!
        set({ x: point.x, y: point.y - 1 - fading * 8 }, fading < 0.5 ? 'w' : 'f')
      }
    }
  }

  // A rainbow over her, behind her: painted from its top outward either side as her hands sweep
  // apart, five bands of colour; glints run along it; then it fades away a pixel at a time.
  const rainbow = pose.rainbow ?? 0
  if (rainbow > 0 && rainbow < 1) {
    const centre = { x: hips.x, y: hips.y - 4 }
    const reach = stage(rainbow, ...RAINBOW.paint) * RAINBOW.span
    const fading = stage(rainbow, ...RAINBOW.fade)
    RAINBOW_BANDS.forEach((letter, b) => {
      for (let a = -reach; a <= reach; a += 0.012) {
        const p = {
          x: centre.x + Math.sin(a) * (RAINBOW.rx - b),
          y: centre.y - Math.cos(a) * (RAINBOW.ry - b),
        }
        if (fading > 0 && hash(Math.round(p.x), Math.round(p.y), 7) < fading) continue
        set(p, letter, '.')
      }
    })
    if (reach >= RAINBOW.span && fading === 0) {
      for (let k = 0; k < 3; k++) {
        const a = ((((rainbow * 3 + k / 3) % 1) * 2 - 1) * RAINBOW.span) / 1.05
        const p = {
          x: centre.x + Math.sin(a) * (RAINBOW.rx - 2),
          y: centre.y - Math.cos(a) * (RAINBOW.ry - 2),
        }
        motif(p, TWINKLE, '.' + RAINBOW_BANDS.join(''))
      }
    }
  }

  // Her hat trick: sparkles showering down from under her lifted hat as it spins, over her.
  const shower = pose.shower ?? 0
  if (shower > 0 && shower < 1) {
    const brim = onHead({ x: 0, y: -9 - (pose.hatLift ?? 0) })
    for (let k = 0; k < 7; k++) {
      const round = shower * 3 + k / 7
      const life = round % 1
      const at = {
        x: brim.x + (hash(k, Math.floor(round), 9) - 0.5) * 22,
        y: brim.y + 2 + life * 26,
      }
      if (life < 0.25) canvas.stamp(k % 2 ? GOLD_TWINKLE : TWINKLE, at.x - 1, at.y - 1)
      else set(at, life < 0.6 ? (k % 2 ? 'Y' : 'w') : 'f')
    }
  }

  // A falling star: it streaks down from high to one side into her cupped hands, its tail behind
  // it; glows there, glinting; then she tosses it back up and away, leaving twinkles in the air.
  const star = pose.star ?? 0
  if (star > 0 && star < 1 && farHand) {
    const cupped = { x: (hand.x + farHand.x) / 2, y: Math.min(hand.y, farHand.y) - 3 }
    const [fallFrom, fallTo] = STAR_CATCH.fall
    const [tossFrom, tossTo] = STAR_CATCH.toss
    if (star >= fallFrom && star < fallTo) {
      const from = { x: hips.x + 34, y: -6 }
      const path = (t: number) => ({
        x: from.x + (cupped.x - from.x) * t,
        y: from.y + (cupped.y - from.y) * t * t,
      })
      const t = stage(star, fallFrom, fallTo)
      for (let k = 8; k >= 1; k--) {
        if (t - k * 0.03 < 0) continue
        set(path(t - k * 0.03), k < 3 ? 'w' : k < 6 ? 'j' : 'Y')
      }
      const at = path(t)
      canvas.stamp(STAR, at.x - 2, at.y - 2)
    } else if (star >= fallTo && star < tossFrom) {
      canvas.stamp(STAR, cupped.x - 2, cupped.y - 2)
      const glint = Math.floor(star * 30) % 3
      if (glint === 0) set({ x: cupped.x - 4, y: cupped.y - 3 }, 'w')
      if (glint === 1) set({ x: cupped.x + 4, y: cupped.y - 4 }, 'w')
      if (glint === 2) set({ x: cupped.x + 1, y: cupped.y - 6 }, 'j')
    } else if (star >= tossFrom && star < tossTo) {
      const t = stage(star, tossFrom, tossTo)
      const at = { x: cupped.x + t * 6, y: cupped.y - t * 62 }
      for (let k = 1; k <= 6; k++) set({ x: at.x - k * 0.5, y: at.y + k * 2 }, k < 3 ? 'w' : 'j')
      canvas.stamp(STAR, at.x - 2, at.y - 2)
    }
    const after = stage(star, tossFrom + 0.04, 0.98)
    if (after > 0 && after < 1) {
      for (let k = 0; k < 4; k++) {
        const life = after * 1.6 - k * 0.15
        if (life <= 0 || life >= 1) continue
        const at = { x: cupped.x + 1 + k * 1.5, y: cupped.y - 14 - k * 11 }
        if (life < 0.4) canvas.stamp(GOLD_TWINKLE, at.x - 1, at.y - 1)
        else set(at, life < 0.7 ? 'Y' : 'k')
      }
    }
  }

  // A little rain cloud: it gathers over her hat, light on top and grey beneath, and rains on her
  // (and round her, splashing on the ground); shooed, it shakes and bursts into sparkles.
  const rain = pose.rain ?? 0
  if (rain > 0 && rain < 1) {
    const gather = stage(rain, ...RAIN.gather)
    const burst = stage(rain, ...RAIN.burst)
    const shake = rain > 0.6 && rain < RAIN.burst[0] ? Math.round(Math.sin(rain * 200)) : 0
    const c = { x: head.x + 1 + shake, y: Math.max(-5, head.y - 28) }
    if (gather > 0 && burst === 0) {
      const humps = [
        { dx: -6, r: 4 },
        { dx: 0, r: 5.5 },
        { dx: 6, r: 4.5 },
      ]
      const cloud = new Set<string>()
      for (let y = Math.floor(c.y - 7); y <= c.y + 2; y++) {
        for (let x = Math.floor(c.x - 13); x <= c.x + 13; x++) {
          const inside = humps.some(({ dx, r }) => {
            const rx = r * 1.3 * gather
            const ry = r * gather
            return ((x + 0.5 - c.x - dx * gather) / rx) ** 2 + ((y + 0.5 - c.y) / ry) ** 2 <= 1
          })
          if (inside) cloud.add(`${x},${y}`)
        }
      }
      for (const key of cloud) {
        const [x, y] = key.split(',').map(Number) as [number, number]
        const edge = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) => !cloud.has(`${x + dx!},${y + dy!}`))
        set({ x, y }, edge ? 'O' : y >= c.y + 1 ? 'F' : y <= c.y - 2 ? 'l' : 'f')
      }
    }
    const pour = stage(rain, ...RAIN.pour)
    if (pour > 0 && pour < 1) {
      const top = c.y + 3
      for (let k = 0; k < 8; k++) {
        const x = c.x - 9 + k * 2.6
        const fall = (pour * 9 + hash(k, 1, 11)) % 1
        const y = top + fall * (93 - top)
        set({ x, y: y - 1 }, 'w')
        set({ x, y }, 'G')
        if (fall > 0.9) {
          set({ x: x - 1, y: 93 }, 'f', '.x')
          set({ x: x + 1, y: 93 }, 'f', '.x')
        }
      }
    }
    if (burst > 0 && burst < 1) {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2
        const at = { x: c.x + Math.cos(a) * burst * 14, y: c.y + Math.sin(a) * burst * 7 }
        if (burst < 0.4 && k % 2 === 0)
          canvas.stamp(k % 4 ? GOLD_TWINKLE : TWINKLE, at.x - 1, at.y - 1)
        else set(at, burst < 0.7 ? (k % 2 ? 'G' : 'w') : 'f')
      }
    }
  }

  // A potion in a little flask in her hand, bubbling and changing colour; the cork pops off and
  // flies away, and puffs of coloured smoke curl up out of it, fading.
  const potion = pose.potion ?? 0
  if (potion > 0 && potion < 1) {
    const corner = { x: Math.round(hand.x) - 2, y: Math.round(hand.y) - 7 }
    const corked = potion < POTION.pop
    if (potion > 0.04 && potion < 0.92) {
      const colour = POTION_COLOURS[Math.floor(potion * 12) % POTION_COLOURS.length]!
      FLASK.forEach((row, dy) =>
        [...row].forEach((letter, dx) => {
          if (letter === '.' || (letter === 'o' && !corked)) return
          const drawn = letter === 'X' ? colour : letter === 'o' ? 'i' : letter
          canvas.set(corner.x + dx, corner.y + dy, drawn)
        }),
      )
      const bubble = Math.floor(potion * 40) % 3
      set({ x: corner.x + 1 + (bubble % 2) * 2, y: corner.y + 5 - bubble }, 'w', colour)
      canvas.stamp(['ss'], hand.x - 1, hand.y)
    }
    const flying = stage(potion, POTION.pop, POTION.pop + 0.12)
    if (flying > 0 && flying < 1) {
      set({ x: corner.x + 2 + flying * 8, y: corner.y - flying * 14 + flying * flying * 10 }, 'i')
    }
    const puff = stage(potion, POTION.pop, POTION.puffed)
    if (puff > 0 && puff < 1) {
      for (let k = 0; k < 6; k++) {
        const life = puff * 1.8 - k * 0.15
        if (life <= 0 || life >= 1) continue
        const letter = ['c', 'a', 'G'][k % 3]!
        const at = {
          x: corner.x + 2 + Math.sin(life * 7 + k * 2) * (2 + life * 4),
          y: corner.y - 1 - life * 20,
        }
        if (life < 0.45) canvas.stamp([letter + letter, letter + letter], at.x, at.y)
        else set(at, life < 0.8 ? letter : 'w')
      }
    }
  }

  // Her spellbook, floating open in front of her, bobbing: it rises into place opening, its pages
  // turn by themselves, right to left, glowing letters rise out of it and fade; then it closes and
  // vanishes in a twinkle.
  const tome = pose.tome ?? 0
  if (tome > 0 && tome < 1) {
    const appear = stage(tome, ...TOME.appear)
    const close = stage(tome, ...TOME.close)
    const vanish = stage(tome, ...TOME.vanish)
    const c = {
      x: Math.round(hips.x),
      y: Math.round(hips.y - 16 + (1 - appear) * 6 + Math.sin(tome * 18)),
    }
    if (appear > 0 && vanish === 0) {
      const half = Math.round(1 + 6 * appear * (1 - close))
      // Its outline, dark against her robe, then its covers with a gold edge.
      for (let dx = -half - 2; dx <= half + 2; dx++) {
        for (let dy = -3; dy <= 5; dy++) set({ x: c.x + dx, y: c.y + dy }, 'u')
      }
      for (let dx = -half - 1; dx <= half + 1; dx++) set({ x: c.x + dx, y: c.y + 3 }, 'n')
      for (let dx = -half; dx <= half; dx++) set({ x: c.x + dx, y: c.y + 4 }, 'Y')
      for (let dy = -1; dy <= 2; dy++) {
        set({ x: c.x - half - 1, y: c.y + dy }, 'n')
        set({ x: c.x + half + 1, y: c.y + dy }, 'n')
      }
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          if (dy === -2 && Math.abs(dx) === half && half > 1) continue
          const text =
            (dy === -1 || dy === 1) &&
            Math.abs(dx) > 1 &&
            Math.abs(dx) < half &&
            (dx + dy) % 2 === 0
          set({ x: c.x + dx, y: c.y + dy }, dx === 0 || text ? 'F' : 'f')
        }
      }
      const turning = stage(tome, ...TOME.turn)
      if (turning > 0 && turning < 1 && close === 0) {
        const edge = Math.round(Math.cos(((turning * TOME.pages) % 1) * Math.PI) * half)
        const [from, to] = edge > 0 ? [1, edge] : [edge, -1]
        for (let dx = from; dx <= to; dx++) {
          for (let dy = -3; dy <= 1; dy++)
            set({ x: c.x + dx, y: c.y + dy }, dx === edge ? 'F' : 'w')
        }
      }
      if (appear < 1) canvas.stamp(TWINKLE, c.x + half + 1, c.y - 4)
    }
    const letters = stage(tome, ...TOME.letters)
    if (letters > 0 && letters < 1) {
      for (let k = 0; k < 6; k++) {
        const raw = letters * 3 - k / 6
        if (raw < 0 || raw >= 2.6) continue
        const life = raw % 1
        if (life > 0.9) continue
        const glyph = GLYPHS[k % GLYPHS.length]!.map((row) =>
          life < 0.6 ? row : row.replace(/Y/g, 'k'),
        )
        // Up and out to one side of her or the other, clear of her face.
        const side = k % 2 === 0 ? 1 : -1
        const at = {
          x: c.x + side * (5 + life * 16) + Math.sin(life * 6 + k) - 1,
          y: c.y - 3 - life * 20,
        }
        canvas.stamp(glyph, at.x, at.y)
      }
    }
    if (vanish > 0 && vanish < 1) {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2
        const at = { x: c.x + Math.cos(a) * vanish * 9, y: c.y + Math.sin(a) * vanish * 5 }
        if (vanish < 0.5) canvas.stamp(k % 2 ? GOLD_TWINKLE : TWINKLE, at.x - 1, at.y - 1)
        else set(at, 'w')
      }
    }
  }

  // Dust from a hard landing: puffs thrown out along the ground either side of her, rising a
  // little and thinning out, only on empty ground or her shadow.
  const dust = pose.dust ?? 0
  if (dust > 0 && dust < 1) {
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const life = dust * 1.3 - k * 0.12
        if (life <= 0 || life >= 1) continue
        const at = { x: hips.x + side * (22 + life * 14 + k * 3), y: 93 - life * 5 - k }
        if (life < 0.45) motif(at, ['ff', 'fF'], '.x')
        else set(at, life < 0.75 ? 'f' : 'F', '.x')
      }
    }
  }

  // Dizzy stars going round above her head (a hard landing): in front of her on the near half of
  // the circle, behind her on the far half.
  if (pose.dizzy !== undefined) {
    // Above her hat's tip, wherever it is (knocked down over her eyes, it's lower).
    const middle = onHead({ x: 0, y: -25 - (pose.hatLift ?? 0) })
    for (let k = 0; k < 3; k++) {
      const a = pose.dizzy * Math.PI * 2 + (k * Math.PI * 2) / 3
      const at = { x: middle.x + Math.cos(a) * 12, y: middle.y + Math.sin(a) * 3.5 }
      const behind = Math.sin(a) < 0
      const star = k === 1 ? GOLD_TWINKLE : STAR
      const half = (star.length - 1) / 2
      star.forEach((row, dy) =>
        [...row].forEach((letter, dx) => {
          if (letter === '.') return
          set({ x: at.x - half + dx, y: at.y - half + dy }, letter, behind ? '.' : undefined)
        }),
      )
    }
  }

  // A scroll held open in front of her, its rolled ends in her hands.
  if (pose.scroll && farHand) {
    const middle = { x: (hand.x + farHand.x) / 2, y: (hand.y + farHand.y) / 2 }
    canvas.stamp(SCROLL, middle.x - (SCROLL[0]!.length - 1) / 2, middle.y - SCROLL.length + 2)
  }

  // A bead of sweat beside her forehead, on the side away from her hat's tip.
  if (pose.sweat) {
    const at = onHead({ x: -10, y: -4 })
    canvas.stamp(SWEAT, at.x - 1, at.y - 1)
  }

  // Hearts floating up from her, swaying, one after another, big then small, and gone.
  const hearts = pose.hearts ?? 0
  if (hearts > 0 && hearts < 1) {
    for (let k = 0; k < 4; k++) {
      const life = hearts * 1.6 - k * 0.2
      if (life <= 0 || life >= 1) continue
      const side = k % 2 === 0 ? 1 : -1
      const at = onHead({
        x: side * (6 + life * 6) + Math.sin(life * 9 + k) * 1.5,
        y: -8 - life * 24,
      })
      const heart = life < 0.55 ? HEART : HEART_SMALL
      canvas.stamp(heart, at.x - (heart[0]!.length - 1) / 2, at.y - (heart.length - 1) / 2)
    }
  }

  // Confetti: a burst from her raised hands, the pieces flying up and out, then fluttering down
  // round her, side to side, each its own colour, until they're gone.
  const confetti = pose.confetti ?? 0
  if (confetti > 0.08 && confetti < 1) {
    const from = farHand
      ? { x: (hand.x + farHand.x) / 2, y: Math.min(hand.y, farHand.y) - 2 }
      : hand
    const t = (confetti - 0.08) / 0.92
    for (let k = 0; k < 34; k++) {
      const spread = (hash(k, 1, 13) - 0.5) * 2
      const rise = 18 + hash(k, 2, 13) * 22
      const up = Math.min(1, t / 0.25)
      const down = Math.max(0, t - 0.25)
      const at = {
        x:
          from.x +
          spread * 30 * Math.min(1, t / 0.3) +
          Math.sin(t * 14 + k) * 2 * Math.min(1, down * 4),
        y: from.y - rise * (1 - (1 - up) ** 2) + down * down * 140 + down * 20,
      }
      if (at.y > 94 || t > 0.97) continue
      const colour = CONFETTI[k % CONFETTI.length]!
      set(at, colour)
      // Every other piece a little strip, turning as it falls.
      if (k % 2 === 0) {
        const flat = Math.floor(t * 20 + k) % 2 === 0
        set({ x: at.x + (flat ? 1 : 0), y: at.y + (flat ? 0 : 1) }, colour)
      }
    }
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
