// What's drawn round her basic moves: the sparkle trail she leaves walking, and the dust and dizzy
// stars of a hard landing.

import type { Scene } from './kit'
import { TWINKLE, GOLD_TWINKLE, STAR } from './kit'

/**
 * Her sparkle trail (Pose.trail): how many sparkles she leaves a stride; how far each drifts back
 * from her heel over a whole stride (pixels: she walks WANDER.walkSpeed, 80 DIPs a second, and a
 * stride takes 0.66 s, about 53 DIPs, which is 53 sprite pixels at any size, so a sparkle stays
 * where she left it on the taskbar while her window moves on); and how long one lasts (shares of
 * a stride).
 */
export const TRAIL = { perStride: 4, drift: 53, life: 0.45 }

/**
 * Her sparkle trail: little sparkles on the ground behind her heel, left behind as she walks
 * and fading as they drift back: a twinkle, then a glint, then a fainter one, and gone; every
 * other one gold. Only on empty ground or her shadow, never over her.
 */
export function paintTrail({ pose, set, motif, hips }: Scene): void {
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
}

/**
 * Dust from a hard landing: puffs thrown out along the ground either side of her, rising a
 * little and thinning out, only on empty ground or her shadow.
 */
export function paintDust({ pose, set, motif, hips }: Scene): void {
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
}

/**
 * Dizzy stars going round above her head (a hard landing): in front of her on the near half of
 * the circle, behind her on the far half.
 */
export function paintDizzy({ pose, set, onHead }: Scene): void {
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
}
