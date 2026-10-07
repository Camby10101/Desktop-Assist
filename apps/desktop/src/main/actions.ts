import type { CommandActionId } from '@shared/actions'
import type { ActionResult } from '@shared/types'
import type { BubbleController } from './bubble/BubbleController'
import type { ScreenshotService } from './screenshots/ScreenshotService'

export type ActionHandlers = Record<CommandActionId, () => Promise<ActionResult>>

/** Main-process handlers for the `command` actions in the registry (src/shared/actions.ts). */
export function createActionHandlers(deps: {
  controller: BubbleController
  screenshots: ScreenshotService
  quit: () => void
}): ActionHandlers {
  return {
    async screenshot() {
      try {
        await deps.controller.whileHidden(() => deps.screenshots.capture())
        return { ok: true, message: 'Screenshot saved' }
      } catch (error) {
        console.error('Screenshot failed', error)
        return { ok: false, message: "Couldn't take a screenshot" }
      }
    },
    async bounce() {
      deps.controller.startBounce()
      return { ok: true }
    },
    async close() {
      deps.quit()
      return { ok: true }
    },
  }
}
