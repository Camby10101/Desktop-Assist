// What's drawn round her everyday habits: a dozer's z's, a sneeze's sparkles, confetti.

import type { Scene } from './kit'
import { SPARKLE, TWINKLE, hash } from './kit'

/** A dozer's z's: a big one and a small one, each with a darker shadow to the lower right. */
export const Z_BIG = ['ffff.', '..fFF', '.fF..', 'ffffF', '.FFFF']

export const Z_SMALL = ['fff.', '.fF.', 'fffF', '.FFF']

/** Confetti's colours: pink, teal, gold, her colour, red, yellow and white. */
export const CONFETTI = ['c', 'G', 'Y', 'a', 'm', 'j', 'w']

/**
 * Dozing: z's float up from above her hat, one after another, growing as they rise.
 */
export function paintZzz({ pose, canvas, onHead }: Scene): void {
  const zzz = pose.zzz ?? 0
  if (zzz > 0) {
    for (let k = 0; k < 3; k++) {
      const life = zzz * 1.6 - k * 0.3
      if (life <= 0 || life >= 1) continue
      const at = onHead({ x: 7 + life * 6 + k * 1.5, y: -13 - life * 12 })
      canvas.stamp(life > 0.45 ? Z_BIG : Z_SMALL, at.x, at.y, pose.flipText)
    }
  }
}

/**
 * A sneeze's sparkles: flying out from her nose in a wide fan above it, out past her face and
 * hair, big at first, then twinkles, then single glints, and gone.
 */
export function paintSneeze({ pose, canvas, set, onHead }: Scene): void {
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
}

/**
 * Confetti: a burst from her raised hands, the pieces flying up and out, then fluttering down
 * round her, side to side, each its own colour, until they're gone.
 */
export function paintConfetti({ pose, set, hand, farHand }: Scene): void {
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
}
