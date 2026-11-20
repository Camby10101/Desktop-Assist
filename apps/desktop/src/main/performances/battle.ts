import { battleFrame, planBattle } from '@shared/battle'
import { BUBBLE_BOX, UI, type Rect } from '@shared/geometry'
import type { Performance } from '../bubble/BubbleController'
import type { Standing } from './performances'

export interface BattleDeps {
  /**
   * Opens the battle's window over `bounds` (a strip along the bottom of her screen), its page told
   * (in its query string) the plan and when it began.
   */
  open(bounds: Rect, query: Record<string, string>): { close(): void }
  random: () => number
  now?: () => number
}

/** How tall the battle's strip is, against her window's: room for the monsters' tumbles. */
const STRIP_HEIGHT = 1.7

/**
 * Her battle with monsters (shared/battle.ts): getting one ready plans it where she stands and
 * opens its window, where the monsters and her spells are drawn; the performance holds her where
 * she stands, in the battle's poses, until it's over (or she's clicked or picked up).
 */
export class Battle {
  constructor(private readonly deps: BattleDeps) {}

  prepare(standing: Standing): Performance {
    const plan = planBattle(standing, this.deps.random)
    const area = standing.workArea
    const height = Math.round((BUBBLE_BOX + UI.bubbleHeadroom) * standing.scale * STRIP_HEIGHT)
    const bottom = area.y + area.height
    const window = this.deps.open(
      { x: area.x, y: bottom - height, width: area.width, height },
      { plan: JSON.stringify(plan), starts: String((this.deps.now ?? Date.now)()) },
    )
    return {
      at: (t) => {
        const frame = battleFrame(plan, t)
        return frame.done ? null : { x: standing.box.x, y: standing.box.y, pose: frame.her }
      },
      end: () => window.close(),
    }
  }
}
