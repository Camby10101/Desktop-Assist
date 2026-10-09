import { app, nativeTheme } from 'electron'
import { z } from 'zod'
import type { Effort, Settings, Theme } from '@shared/types'
import type { BubbleAnchor } from './bubble/BubbleController'
import { readJsonFile, writeJsonFile } from './storage/jsonFile'

/** Fast answers by default; Balanced and Thorough think longer. */
export const DEFAULT_EFFORT: Effort = 'low'

const PreferencesSchema = z.object({
  autoStartInitialized: z.boolean().optional(),
  effort: z.enum(['low', 'medium', 'high']).optional(),
  /** Claude Desktop: send the question in Claude, not just fill it in. On unless turned off. */
  autoSend: z.boolean().optional(),
  /** Light or dark mode; dark until the user switches. */
  theme: z.enum(['dark', 'light']).optional(),
  /** Apps starred in the Apps list (their IDs), shown first. */
  favoriteApps: z.array(z.string().min(1).max(200)).max(500).optional(),
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
    // Before any window shows, so it never flashes the other mode.
    nativeTheme.themeSource = this.get().theme
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
      autoSend: this.prefs.autoSend ?? true,
      favoriteApps: this.prefs.favoriteApps ?? [],
      theme: this.prefs.theme ?? 'dark',
      canUninstall: available,
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

  async setAutoSend(autoSend: boolean): Promise<Settings> {
    await this.save({ autoSend })
    return this.get()
  }

  /**
   * Light or dark mode for every Desktop Assist window, whatever Windows uses: Electron's
   * `themeSource` sets what the pages see as prefers-color-scheme, which the styles follow.
   */
  async setTheme(theme: Theme): Promise<Settings> {
    nativeTheme.themeSource = theme
    await this.save({ theme })
    return this.get()
  }

  /** Stars an app in the Apps list, or takes its star away. */
  async setFavoriteApp(id: string, favorite: boolean): Promise<Settings> {
    const others = (this.prefs.favoriteApps ?? []).filter((favoriteId) => favoriteId !== id)
    await this.save({ favoriteApps: favorite ? [...others, id] : others })
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
