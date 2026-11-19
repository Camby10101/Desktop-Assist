import { plot, type Painter } from '../pixels'
import type { SaverFrame } from './scene'

// A dragon flying by in the sunset, far off over the hills: one every couple of minutes, across
// the whole sky, a different height each time and the other way the next, its great wings beating
// slowly, with a glide now and then. An original design, a silhouette against the sky: a horned
// head on an arching neck, bat wings with the low sun glowing through them, a long tail ending in
// a spade. Painted behind the hills and her (see ScreenSaverView), so it's in the background.

/**
 * When it comes (ms since the scene began): first `firstMs` in, then every `everyMs`, taking
 * `crossMs` to cross the sky; a wingbeat frame every `beatMs`, `flaps` flaps then a glide of
 * `glideMs`; and how high it flies (a share of the screen's height from the top, from-to).
 */
export const DRAGON = {
  firstMs: 40_000,
  everyMs: 120_000,
  crossMs: 22_000,
  beatMs: 120,
  flaps: 3,
  glideMs: 1_200,
  height: [0.1, 0.26],
} as const

/**
 * Its wingbeat, facing right (facing left, mirrored): `x` its body and its wings' bones, `m` its
 * near wing's membrane with the sun through it, `n` its far wing's (darker, behind), `e` its eye.
 */
export const DRAGON_FRAMES: readonly (readonly string[])[] = [
  // wings up
  [
    '................nnn.....................',
    '..........nn...nnnnxx...................',
    '...........nnxxxxxxxxxxx................',
    '...........nnmmnnnmmmxxxx...............',
    '...........nnnmmmxxxxmxx................',
    '...........nnnxxxxmmmmx.................',
    '.......nnnxxxxmmmmmmmxx.................',
    '........nxxnnnmmmmmmmx...........x......',
    '........nnmmmmmmmmmmx.........xx.x......',
    '.........nnmmmmmmmmxx..........xx.x.....',
    '..........nmmmmmmmmmx...........xxx.....',
    '...........nmmmmmmmmx..........xxxxe....',
    '...........nnmmmmmmmxx......xxxxxxxxxx..',
    '............nnmmmmmmmx.....xxxxxxxxxxxxx',
    '..............mmmmmmmx...xxxxxx....xxxx.',
    '...............mmmmmmxxxxxxxxx..........',
    '............xxxxxxxxxxxxxxxxx...........',
    '...........xxxxxxxxxxxxxxxxx............',
    '.........xxxxxxxxxxxxxxxxxx.............',
    '.......xxxxxxxxxxxxxxxxxxx..............',
    'xx..xxxxxxx.....xxxxx.x.................',
    'x.xxxxxx........x....xx.................',
    '................x....x..................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
  ],
  // wings out, a little up
  [
    '........................................',
    '........................................',
    '........................................',
    '............n...........................',
    '............nnxn........................',
    '......nn....nnnxxx......................',
    '......nnxxxxxxnmmxxx.............x......',
    '.......nnmmnnxxxxxxxxxx.......xx.x......',
    '....nnnnnmmmmmnmxxxxxxx........xx.x.....',
    '...nnnnnnxxxxxxxmmmmxx..........xxx.....',
    '....xxxxxxmmmmmmmmmxx..........xxxxe....',
    '......mmmmmmmmmmmmmxx.......xxxxxxxxxx..',
    '........mmmmmmmmmmmmx......xxxxxxxxxxxxx',
    '..........mmmmmmmmmmxx...xxxxxx....xxxx.',
    '............mmmmmmmmmxxxxxxxxx..........',
    '............xxmmmmxxxxxxxxxxx...........',
    '...........xxxxxxxxxxxxxxxxx............',
    '.........xxxxxxxxxxxxxxxxxx.............',
    '.......xxxxxxxxxxxxxxxxxxx..............',
    'xx..xxxxxxx.....xxxxx.x.................',
    'x.xxxxxx........x....xx.................',
    '................x....x..................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
  ],
  // wings out, a little down
  [
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '.................................x......',
    '..............................xx.x......',
    '...............................xx.x.....',
    '................................xxx.....',
    '...............................xxxxe....',
    '............................xxxxxxxxxx..',
    '...........................xxxxxxxxxxxxx',
    '.................nn......xxxxxx....xxxx.',
    '..............nnnxxxxxxxxxxxxx..........',
    '....nnnnnnnnxxxxxxxxmxxxxxxxx...........',
    '......nnnnnxxxxxxmmmxxxxxxxx............',
    '......xxxmmmmmmmmmmxxxxxxxx.............',
    '.......xxxxxxxxxmmmmxxxxxx..............',
    'xx..xxxxxxxmmmmxxxxxxxx.................',
    'x.xxxxxx..mmmmxxxxxxxxx.................',
    '.........xxxxx.mmmxx.x..................',
    '...............xxx......................',
    '...............x........................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
  ],
  // wings down
  [
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '.................................x......',
    '..............................xx.x......',
    '...............................xx.x.....',
    '................................xxx.....',
    '...............................xxxxe....',
    '............................xxxxxxxxxx..',
    '...........................xxxxxxxxxxxxx',
    '..................n......xxxxxx....xxxx.',
    '...............nnxxxxxxxxxxxxx..........',
    '............xxxxxxxxxxxxxxxxx...........',
    '...........xxxxxxxmmmxxxxxxx............',
    '.........xxxxxxmmmmmmxxxxxx.............',
    '.......xxxxxxxmmmmmmxxxxxx..............',
    'xx..xxxxxxxnnnmmmmmmx.x.................',
    'x.xxxxxxnnnnnmmmmmmmxxx.................',
    '..........nmmmmmmmmmmx..................',
    '.........xxxxmmmmmmmmxx.................',
    '...........nxxxxxmmmmmx.................',
    '..........nnn.mmxxxxxmxx................',
    '..............mmmmmmmxxx................',
    '.............mmmxxxxxxx.................',
    '.............xxx..mmxx..................',
    '..................mxx...................',
    '..................xx....................',
  ],
  // wings out, a little down
  [
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '.................................x......',
    '..............................xx.x......',
    '...............................xx.x.....',
    '................................xxx.....',
    '...............................xxxxe....',
    '............................xxxxxxxxxx..',
    '...........................xxxxxxxxxxxxx',
    '.................nn......xxxxxx....xxxx.',
    '..............nnnxxxxxxxxxxxxx..........',
    '....nnnnnnnnxxxxxxxxmxxxxxxxx...........',
    '......nnnnnxxxxxxmmmxxxxxxxx............',
    '......xxxmmmmmmmmmmxxxxxxxx.............',
    '.......xxxxxxxxxmmmmxxxxxx..............',
    'xx..xxxxxxxmmmmxxxxxxxx.................',
    'x.xxxxxx..mmmmxxxxxxxxx.................',
    '.........xxxxx.mmmxx.x..................',
    '...............xxx......................',
    '...............x........................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
  ],
  // wings out, a little up
  [
    '........................................',
    '........................................',
    '........................................',
    '............n...........................',
    '............nnxn........................',
    '......nn....nnnxxx......................',
    '......nnxxxxxxnmmxxx.............x......',
    '.......nnmmnnxxxxxxxxxx.......xx.x......',
    '....nnnnnmmmmmnmxxxxxxx........xx.x.....',
    '...nnnnnnxxxxxxxmmmmxx..........xxx.....',
    '....xxxxxxmmmmmmmmmxx..........xxxxe....',
    '......mmmmmmmmmmmmmxx.......xxxxxxxxxx..',
    '........mmmmmmmmmmmmx......xxxxxxxxxxxxx',
    '..........mmmmmmmmmmxx...xxxxxx....xxxx.',
    '............mmmmmmmmmxxxxxxxxx..........',
    '............xxmmmmxxxxxxxxxxx...........',
    '...........xxxxxxxxxxxxxxxxx............',
    '.........xxxxxxxxxxxxxxxxxx.............',
    '.......xxxxxxxxxxxxxxxxxxx..............',
    'xx..xxxxxxx.....xxxxx.x.................',
    'x.xxxxxx........x....xx.................',
    '................x....x..................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
  ],
]

/** Its colours against the sunset: dusky purples, the membranes warmer, a glint of an eye. */
const COLOURS: Readonly<Record<string, string>> = {
  x: '#2b1a3a',
  m: '#7a4566',
  n: '#4a2a4c',
  e: '#ffb36b',
}
/** The low sun catching its back: the top edge of its body and wings' bones. */
const RIM = '#6b3a55'
/** Its wings held out, a little up, gliding (the second frame). */
const GLIDE = 1

/** Where the dragon is at `t` (its picture's top-left), which frame, and which way: null if it isn't by. */
export function dragonAt(
  t: number,
  w: number,
  h: number,
): { x: number; y: number; frame: number; facing: 'left' | 'right' } | null {
  if (t < DRAGON.firstMs) return null
  const since = t - DRAGON.firstMs
  const pass = Math.floor(since / DRAGON.everyMs)
  const along = since % DRAGON.everyMs
  if (along >= DRAGON.crossMs) return null
  const u = along / DRAGON.crossMs
  const width = DRAGON_FRAMES[0]![0]!.length
  const rightward = pass % 2 === 0
  const from = -width - 4
  const to = w + 4
  const x = rightward ? from + (to - from) * u : to - (to - from) * u
  // A different height each pass (the same every time for that pass), and a slow swoop across.
  const [low, high] = DRAGON.height
  const share = low + (high - low) * fraction(Math.sin(pass * 12.9898 + 4.1) * 43758.5453)
  const y = h * share + Math.sin(u * Math.PI * 2) * h * 0.02
  // Its wings: `flaps` beats, then a glide with them held out level.
  const beats = DRAGON_FRAMES.length * DRAGON.beatMs * DRAGON.flaps
  const inCycle = along % (beats + DRAGON.glideMs)
  const frame = inCycle < beats ? Math.floor(inCycle / DRAGON.beatMs) % DRAGON_FRAMES.length : GLIDE
  return { x: Math.round(x), y: Math.round(y), frame, facing: rightward ? 'right' : 'left' }
}

/** The dragon at `frame.t`, if it's flying by: each pixel in its colour, the rim along its back. */
export function paintDragon(p: Painter, frame: SaverFrame): void {
  const at = dragonAt(frame.t, frame.w, frame.h)
  if (!at) return
  const rows = DRAGON_FRAMES[at.frame]!
  const letter = (r: number, c: number) => {
    const row = rows[r]
    if (!row) return '.'
    return (at.facing === 'right' ? row[c] : row[row.length - 1 - c]) ?? '.'
  }
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const here = letter(r, c)
      if (here === '.') continue
      const colour = here === 'x' && letter(r - 1, c) === '.' ? RIM : COLOURS[here]!
      plot(p, at.x + c, at.y + r, colour)
    }
  })
}

const fraction = (v: number) => v - Math.floor(v)
