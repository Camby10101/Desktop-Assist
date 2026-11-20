// What's drawn in her reactions: the scroll she holds up, a bead of sweat, and hearts.

import type { Scene } from './kit'

/** A heart, big and small: pink, outlined in red. */
export const HEART = ['.m.m.', 'mcmcm', 'mcccm', '.mcm.', '..m..']

export const HEART_SMALL = ['c.c', 'ccc', '.c.']

/** A scroll: a sheet of parchment between its two rolled ends, lines of writing and a red seal. */
export const SCROLL = [
  'Ff.........fF',
  'FflllllllllfF',
  'FflDDDlDDllfF',
  'FflDDlDDDllfF',
  'FflDDDDlDllfF',
  'FfllllllmmlfF',
  'Ff.........fF',
]

/** A bead of sweat. */
export const SWEAT = ['.w.', 'wGw', 'GGG', '.G.']

/**
 * A scroll held open in front of her, its rolled ends in her hands.
 */
export function paintScroll({ pose, canvas, hand, farHand }: Scene): void {
  if (pose.scroll && farHand) {
    const middle = { x: (hand.x + farHand.x) / 2, y: (hand.y + farHand.y) / 2 }
    canvas.stamp(SCROLL, middle.x - (SCROLL[0]!.length - 1) / 2, middle.y - SCROLL.length + 2)
  }
}

/**
 * A bead of sweat beside her forehead, on the side away from her hat's tip.
 */
export function paintSweat({ pose, canvas, onHead }: Scene): void {
  if (pose.sweat) {
    const at = onHead({ x: -10, y: -4 })
    canvas.stamp(SWEAT, at.x - 1, at.y - 1)
  }
}

/**
 * Hearts floating up from her, swaying, one after another, big then small, and gone.
 */
export function paintHearts({ pose, canvas, onHead }: Scene): void {
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
}
