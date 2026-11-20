// What's drawn for her magic habits: a flame, a snowflake, a flower, a traced star, a rainbow,
// her hat trick, a falling star, a rain cloud, a potion and her spellbook.

import type { Scene } from './kit'
import { SPARKLE, TWINKLE, GOLD_TWINKLE, STAR, stage, hash } from './kit'
import { add } from '../raster'

/**
 * A flame, tip first, from a spark to its fullest: dark red round its edge, orange, a yellow
 * heart and a white core, its tip leaning to one side (mirrored, it flickers to the other).
 */
export const FLAMES = [
  ['j', 'w'],
  ['.m.', '.I.', 'IjI', '.I.'],
  ['..m..', '.mI..', '.IjI.', 'mIwjI', '.IjI.'],
  ['..m....', '..mI...', '..IIm..', '.mIjIm.', '.IjwjI.', 'mIjwwIm', '.IjwjI.', '..III..'],
]

/** A little potion flask: a cork (`o`), glass, and the potion inside (`X`), with a glint. */
export const FLASK = ['..o..', '.fof.', '.fXf.', 'fXXXf', 'fXwXf', 'fXXXf', '.fff.']

/** The colours the potion goes through as it bubbles: teal, her colour, pink, gold. */
export const POTION_COLOURS = ['G', 'a', 'c', 'Y']

/** The glowing letters that rise out of her spellbook. */
export const GLYPHS = [
  ['Y.', 'YY', '.Y'],
  ['.Y', 'Y.', 'YY'],
  ['YY', 'Y.', 'YY'],
  ['Y.Y', '.Y.'],
]

/** A flower, half open and open: pink petals, a gold heart. */
export const BUD = ['.c.', 'cmc', '.P.']

export const FLOWER_HALF = ['.c.c.', 'ccYcc', '.cmc.']

export const FLOWER = ['.cc.cc.', 'cccmccc', '.cmYmc.', 'cccmccc', '.cc.cc.']

/** The rainbow's bands, outside in: red, orange, yellow, teal, and her colour for its violet. */
export const RAINBOW_BANDS = ['m', 'I', 'j', 'G', 'a']

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
 * A flame in her palm: a spark, growing and flickering (its tip leaning one way, then the
 * other), then blown out, leaning away from her as it shrinks, into a curl of smoke rising with a
 * few sparks.
 */
export function paintFlame({ pose, canvas, set, hand }: Scene): void {
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
}

/**
 * A snowflake over her cupped hands: six arms growing out from its heart, branching, a glint
 * going round its tips; then it bursts into glitter that flies out and drifts down, twinkling.
 */
export function paintFrost({ pose, canvas, set, hand, farHand }: Scene): void {
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
}

/**
 * A flower: sparkles drip from her pointing finger to the ground in front of her, where a sprout
 * comes up, grows leaves and a bud, and opens into a pink flower that sways and twinkles; at the
 * end it glows and scatters into sparkles.
 */
export function paintBloom({ pose, canvas, set, hand, hips }: Scene): void {
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
}

/**
 * A star traced in the air beside her: a point of light draws its outline, five points round,
 * in gold; it flashes white as it closes, glows with a sparkle at its heart, and fades away a
 * pixel at a time, motes rising from its points.
 */
export function paintSigil({ pose, canvas, set, hips, head }: Scene): void {
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
}

/**
 * A rainbow over her, behind her: painted from its top outward either side as her hands sweep
 * apart, five bands of colour; glints run along it; then it fades away a pixel at a time.
 */
export function paintRainbow({ pose, set, motif, hips }: Scene): void {
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
}

/**
 * Her hat trick: sparkles showering down from under her lifted hat as it spins, over her.
 */
export function paintHatTrick({ pose, canvas, set, onHead }: Scene): void {
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
}

/**
 * A falling star: it streaks down from high to one side into her cupped hands, its tail behind
 * it; glows there, glinting; then she tosses it back up and away, leaving twinkles in the air.
 */
export function paintFallingStar({ pose, canvas, set, hand, farHand, hips }: Scene): void {
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
}

/**
 * A little rain cloud: it gathers over her hat, light on top and grey beneath, and rains on her
 * (and round her, splashing on the ground); shooed, it shakes and bursts into sparkles.
 */
export function paintRain({ pose, canvas, set, head }: Scene): void {
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
}

/**
 * A potion in a little flask in her hand, bubbling and changing colour; the cork pops off and
 * flies away, and puffs of coloured smoke curl up out of it, fading.
 */
export function paintPotion({ pose, canvas, set, hand }: Scene): void {
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
}

/**
 * Her spellbook, floating open in front of her, bobbing: it rises into place opening, its pages
 * turn by themselves, right to left, glowing letters rise out of it and fade; then it closes and
 * vanishes in a twinkle.
 */
export function paintTome({ pose, canvas, set, hips }: Scene): void {
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
}
