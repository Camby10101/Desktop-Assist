import { app } from 'electron'
import { z } from 'zod'
import type { Effort, Settings } from '@shared/types'
import { readJsonFile, writeJsonFile } from './storage/jsonFile'

/** Fast answers by default; Balanced and Thorough think longer. */
export const DEFAULT_EFFORT: Effort = 'low'

const PreferencesSchema = z.object({
  autoStartInitialized: z.boolean().optional(),
  effort: z.enum(['low', 'medium', 'high']).optional(),
})
type Preferences = z.infer<typeof PreferencesSchema>

export class SettingsService {
  private prefs: Preferences = {}

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

  private async save(changes: Preferences): Promise<void> {
    this.prefs = { ...this.prefs, ...changes }
    await writeJsonFile(this.preferencesPath, this.prefs)
  }
}
