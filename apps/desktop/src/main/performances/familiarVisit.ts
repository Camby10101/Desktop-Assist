import { FIDGET_MS } from '@shared/character'
import type { Performance } from '../bubble/BubbleController'
import type { Standing } from './performances'

/** A visit from her familiar: how long she waits for it to come before she sits down (ms). */
export const VISIT_GREETING_MS = 1200

/**
 * Her side of a visit from her familiar (the cat itself is Familiar's): she stands where she is as
 * it appears beside her, then sits down with it for a while (her `sit` habit, getting up again at
 * the end of it), and that's it; the cat stays on a little after.
 */
export function familiarVisit(standing: Standing): Performance {
  const { x, y } = standing.box
  return {
    at: (t) => {
      if (t < VISIT_GREETING_MS) return { x, y, pose: 'idle' }
      if (t < VISIT_GREETING_MS + FIDGET_MS.sit) return { x, y, pose: 'sit' }
      return null
    },
    end: () => {},
  }
}
