import type { ActionId } from './actions'

/**
 * What the bubble is doing. The main process owns this; renderers only display it.
 * - `returning`: gliding back to the corner after a bounce.
 * - `capturing`: windows are hidden while a screenshot is taken.
 */
export type Mode = 'collapsed' | 'expanded' | 'bouncing' | 'returning' | 'capturing'

export interface Attachment {
  id: string
  /** Absolute path of the screenshot file. */
  path: string
  fileName: string
  /** ISO timestamp. */
  addedAt: string
}

export interface Notes {
  text: string
  attachments: Attachment[]
  /** ISO timestamp of the last change, or null if nothing has been typed yet. */
  updatedAt: string | null
}

export interface Settings {
  autoStart: boolean
  /** Starting with Windows only works for an installed build, not `npm run dev`. */
  autoStartAvailable: boolean
  screenshotsDir: string
}

export interface Branding {
  companyName: string
  appName: string
  accentColor: string
  actions: ActionId[]
}

export interface AppState {
  mode: Mode
  notes: Notes
  settings: Settings
  branding: Branding
  version: string
}

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string }

export type AttachResult =
  { ok: true; notes: Notes } | { ok: false; reason: 'no-screenshots' | 'already-attached' }
