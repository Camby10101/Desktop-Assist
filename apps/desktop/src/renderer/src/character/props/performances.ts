// What's drawn in her performances: the glow of magic charging in her hand in her battle.

import type { Scene } from './kit'
import { SPARKLE } from './kit'
import { add } from '../raster'

/**
 * A glow of magic charging in her near hand (her battle): a glint, then a ball, then a sparkle.
 */
export function paintCharge({ pose, canvas, set, hand }: Scene): void {
  const charge = pose.charge ?? 0
  if (charge > 0) {
    const at = add(hand, { x: 1.5, y: -1 })
    if (charge > 0.85) canvas.stamp(SPARKLE, at.x - 2, at.y - 2)
    else if (charge > 0.4) canvas.stamp(['.G.', 'GwG', '.G.'], at.x - 1, at.y - 1)
    else set(at, 'w')
  }
}
