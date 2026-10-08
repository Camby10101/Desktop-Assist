import type { ActionId } from './actions'
import type { Corner } from './geometry'

/**
 * What the bubble is doing. The main process owns this; renderers only display it.
 * - `dragging`: following the mouse while the user drags it.
 * - `returning`: gliding into its corner after a bounce or a drag.
 * - `capturing`: windows are hidden while a screenshot is taken.
 */
export type Mode = 'collapsed' | 'expanded' | 'dragging' | 'bouncing' | 'returning' | 'capturing'

export interface Attachment {
  id: string
  /** Absolute path of the screenshot file. */
  path: string
  fileName: string
  /** ISO timestamp. */
  addedAt: string
}

/** The unsent draft in the text box. */
export interface Notes {
  text: string
  attachments: Attachment[]
  /** ISO timestamp of the last change, or null if nothing has been typed yet. */
  updatedAt: string | null
}

/** How hard Claude thinks before answering (the API's `effort`), shown as Fast/Balanced/Thorough. */
export type Effort = 'low' | 'medium' | 'high'

export interface Settings {
  autoStart: boolean
  /** Starting with Windows only works for an installed build, not `npm run dev`. */
  autoStartAvailable: boolean
  screenshotsDir: string
  effort: Effort
}

export interface Branding {
  companyName: string
  appName: string
  accentColor: string
  actions: ActionId[]
}

/**
 * Whether the saved Claude API key works.
 * - `invalid`: Anthropic rejected it; the chat box asks for a new one.
 * - `unreachable`: it couldn't be checked (offline); it's kept and chat stays available.
 */
export type ApiKeyStatus =
  | { state: 'missing' }
  | { state: 'checking' }
  | { state: 'valid' }
  | { state: 'invalid'; message: string }
  | { state: 'unreachable'; message: string }

export type ApiKeySubmitResult = { ok: true } | { ok: false; message: string }

/** One message as the chat shows it. */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Screenshots sent with a user message. */
  attachments: Attachment[]
  status: 'streaming' | 'done' | 'stopped' | 'error'
  /** Shown under the message, e.g. why it stopped. */
  notice?: string
  /** A failed reply that can be requested again. */
  retryable?: boolean
}

export type SendResult =
  | { ok: true; notes: Notes }
  | { ok: false; reason: 'busy' | 'empty' | 'no-key' | 'missing-screenshot' }

export interface AppState {
  mode: Mode
  /** The screen corner the bubble rests in; the panel lays itself out to open away from it. */
  corner: Corner
  notes: Notes
  settings: Settings
  branding: Branding
  version: string
  apiKey: ApiKeyStatus
  chat: ChatMessage[]
}

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string }

export type AttachResult =
  { ok: true; notes: Notes } | { ok: false; reason: 'no-screenshots' | 'already-attached' }
