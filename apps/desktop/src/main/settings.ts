import { app } from 'electron'
import { z } from 'zod'
import type { Settings } from '@shared/types'
import { readJsonFile, writeJsonFile } from './storage/jsonFile'

const PreferencesSchema = z.object({ autoStartInitialized: z.boolean() })

export class SettingsService {
  constructor(
    private readonly preferencesPath: string,
    private readonly screenshotsDir: string,
  ) {}

  /** The first time an installed build runs, turn on "Start with Windows". */
  async init(): Promise<void> {
    if (!app.isPackaged) return
    const prefs = await readJsonFile(this.preferencesPath, PreferencesSchema)
    if (prefs.status === 'ok' && prefs.value.autoStartInitialized) return
    this.setAutoStart(true)
    await writeJsonFile(this.preferencesPath, { autoStartInitialized: true })
  }

  get(): Settings {
    const available = app.isPackaged
    return {
      // Read from Windows each time: the user can also change it in Settings > Apps > Startup.
      autoStart: available && app.getLoginItemSettings().openAtLogin,
      autoStartAvailable: available,
      screenshotsDir: this.screenshotsDir,
    }
  }

  setAutoStart(enabled: boolean): Settings {
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: enabled })
    return this.get()
  }
}
