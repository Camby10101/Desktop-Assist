import { app } from 'electron'
import { z } from 'zod'
import type { Effort, Settings } from '@shared/types'
import type { BubbleAnchor } from './bubble/BubbleController'
import { readJsonFile, writeJsonFile } from './storage/jsonFile'

/** Fast answers by default; Balanced and Thorough think longer. */
export const DEFAULT_EFFORT: Effort = 'low'

const PreferencesSchema = z.object({
  autoStartInitialized: z.boolean().optional(),
  effort: z.enum(['low', 'medium', 'high']).optional(),
  /** Where the bubble was dragged to: a corner of a particular display. */
  bubbleAnchor: z
    .object({
      displayId: z.number(),
      corner: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']),
    })
    .optional(),
})
type Preferences = z.infer<typeof PreferencesSchema>

export class SettingsService {
  private prefs: Preferences = {}
  private saving: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly preferencesPath: string,
    private readonly screenshotsDir: string,
  ) {}

  /** Loads preferences. The first time an installed build runs, turns on "Start with Windows". */
  async init(): Promise<void> {
    const result = await readJsonFile(this.preferencesPath, PreferencesSchema)
    this.prefs = result.status === 'ok' ? result.value : {}
    if (app.isPackaged && !this.prefs.autoStartInitialized) {
      this.setAutoStart(true)
      await this.save({ autoStartInitialized: true })
    }
  }

  get(): Settings {
    const available = app.isPackaged
    return {
      // Read from Windows each time: the user can also change it in Settings > Apps > Startup.
      autoStart: available && app.getLoginItemSettings().openAtLogin,
      autoStartAvailable: available,
      screenshotsDir: this.screenshotsDir,
      effort: this.prefs.effort ?? DEFAULT_EFFORT,
    }
  }

  setAutoStart(enabled: boolean): Settings {
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: enabled })
    return this.get()
  }

  async setEffort(effort: Effort): Promise<Settings> {
    await this.save({ effort })
    return this.get()
  }

  get bubbleAnchor(): BubbleAnchor | null {
    return this.prefs.bubbleAnchor ?? null
  }

  async setBubbleAnchor(anchor: BubbleAnchor): Promise<void> {
    await this.save({ bubbleAnchor: anchor })
  }

  private async save(changes: Preferences): Promise<void> {
    this.prefs = { ...this.prefs, ...changes }
    // One write at a time, in order, so an older save can't finish last and overwrite a newer one.
    const snapshot = this.prefs
    const write = this.saving.then(() => writeJsonFile(this.preferencesPath, snapshot))
    this.saving = write.catch(() => {})
    await write
  }
}
