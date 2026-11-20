// Her visitors: the little spirit that comes to see her.

import type { Scene } from './kit'
import { SPARKLE, TWINKLE, stage } from './kit'

/**
 * The little spirit, wings up and wings down: a round glowing body (mint and teal) with dark dot
 * eyes, pale leaf wings, and a wisp of a tail.
 */
export const SPIRIT_FLAP = [
  [
    '.VV.......VV.',
    'VVVV.....VVVV',
    '.VVV.TTT.VVV.',
    '..VVTUUUTVV..',
    '...TUUUUUT...',
    '...TUWUWUT...',
    '...TUUUUUT...',
    '....TUUUT....',
    '.....TTT.....',
    '......T......',
  ],
  [
    '.............',
    '.............',
    '.....TTT.....',
    '....TUUUT....',
    '...TUUUUUT...',
    'VVVTUWUWUTVVV',
    'VVVTUUUUUTVVV',
    '.VVVTUUUTVVV.',
    '..V..TTT..V..',
    '......T......',
  ],
]

/**
 * The little spirit's visit (Pose.spirit): appearing beside her, flying to her, on her palm, a
 * loop round her head, waving, and gone (shares of the habit).
 */
export const SPIRIT = {
  appear: [0.02, 0.12],
  toHer: [0.12, 0.28],
  land: [0.3, 0.56],
  loop: [0.58, 0.78],
  wave: [0.8, 0.9],
  gone: [0.9, 0.99],
} as const

/**
 * The little spirit: appears beside her in a sparkle, flies to her, lands on her palm, loops
 * round her head (behind her on the far side), hovers beside her waving, and fades away.
 */
export function paintSpirit({ pose, canvas, set, hand, onHead }: Scene): void {
  const spirit = pose.spirit ?? 0
  if (spirit > 0 && spirit < 1) {
    const head = onHead({ x: 0, y: -4 })
    const beside = { x: head.x + 27, y: head.y + 6 }
    const before = { x: head.x + 10, y: head.y + 10 }
    const palm = { x: hand.x, y: hand.y - 6 }
    const toHer = stage(spirit, ...SPIRIT.toHer)
    const land = stage(spirit, ...SPIRIT.land)
    const loop = stage(spirit, ...SPIRIT.loop)
    const bob = Math.sin(spirit * 60) * 1
    let at = beside
    let behind = false
    if (spirit >= SPIRIT.toHer[0] && spirit < SPIRIT.land[0]) {
      at = {
        x: beside.x + (before.x - beside.x) * toHer,
        y: beside.y + (before.y - beside.y) * toHer + bob,
      }
    } else if (spirit >= SPIRIT.land[0] && spirit < SPIRIT.loop[0]) {
      const settle = Math.min(1, land * 4)
      at = {
        x: before.x + (palm.x - before.x) * settle,
        y: before.y + (palm.y - before.y) * settle + bob * 0.5,
      }
    } else if (spirit >= SPIRIT.loop[0] && spirit < SPIRIT.wave[0]) {
      const angle = Math.PI / 2 - loop * Math.PI * 2
      const ring = { x: head.x + 20 * Math.cos(angle), y: head.y + 4 + 6 * Math.sin(angle) }
      // Eases off her palm into the loop, and out of it to beside her.
      const into = Math.min(1, loop / 0.15)
      const outOf = Math.max(0, (loop - 0.85) / 0.15)
      const from = into < 1 ? palm : ring
      const to = outOf > 0 ? beside : ring
      const mix = into < 1 ? into : outOf
      at = { x: from.x + (to.x - from.x) * mix, y: from.y + (to.y - from.y) * mix }
      behind = Math.sin(angle) < 0 && into >= 1 && outOf === 0
    } else if (spirit >= SPIRIT.wave[0]) {
      const rise = stage(spirit, ...SPIRIT.gone)
      at = { x: beside.x + Math.sin(spirit * 90) * 1.5, y: beside.y - rise * 8 + bob }
    }
    const appear = stage(spirit, ...SPIRIT.appear)
    const gone = stage(spirit, ...SPIRIT.gone)
    if (appear >= 0.5 && gone < 0.5) {
      const rows = SPIRIT_FLAP[Math.floor(spirit * 70) % 2]!
      rows.forEach((row, dy) =>
        [...row].forEach((letter, dx) => {
          if (letter === '.') return
          set({ x: at.x - 6 + dx, y: at.y - 5 + dy }, letter, behind ? '.' : undefined)
        }),
      )
    }
    if (appear > 0 && appear < 1) {
      if (appear < 0.55) canvas.stamp(SPARKLE, beside.x - 2, beside.y - 2)
      else canvas.stamp(TWINKLE, beside.x - 1, beside.y - 1)
    }
    if (gone > 0 && gone < 1) {
      if (gone < 0.55) canvas.stamp(SPARKLE, at.x - 2, at.y - 2)
      else canvas.stamp(TWINKLE, at.x - 1, at.y - 1)
    }
  }
}
