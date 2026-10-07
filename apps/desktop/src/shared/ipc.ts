import type { CommandActionId } from './actions'
import type {
  ActionResult,
  ApiKeyStatus,
  ApiKeySubmitResult,
  AppState,
  AttachResult,
  ChatMessage,
  Effort,
  Mode,
  Notes,
  SendResult,
  Settings,
} from './types'

/** IPC channel names. The preload maps them onto `window.assist`; src/main/ipc.ts handles them. */
export const IPC = {
  getState: 'assist:get-state',
  bubbleClick: 'assist:bubble-click',
  collapse: 'assist:collapse',
  setInteractive: 'assist:set-interactive',
  invokeAction: 'assist:invoke-action',
  openExternal: 'assist:open-external',
  copyText: 'assist:copy-text',
  notesSetText: 'assist:notes-set-text',
  notesAttachLatest: 'assist:notes-attach-latest',
  notesRemoveAttachment: 'assist:notes-remove-attachment',
  screenshotThumbnail: 'assist:screenshot-thumbnail',
  screenshotOpen: 'assist:screenshot-open',
  screenshotsOpenFolder: 'assist:screenshots-open-folder',
  settingsGet: 'assist:settings-get',
  settingsSetAutoStart: 'assist:settings-set-auto-start',
  settingsSetEffort: 'assist:settings-set-effort',
  apiKeySubmit: 'assist:api-key-submit',
  apiKeyRecheck: 'assist:api-key-recheck',
  apiKeyForget: 'assist:api-key-forget',
  chatSend: 'assist:chat-send',
  chatStop: 'assist:chat-stop',
  chatRetry: 'assist:chat-retry',
  chatNew: 'assist:chat-new',
  // main → renderer
  modeChanged: 'assist:mode-changed',
  apiKeyStatus: 'assist:api-key-status',
  chatMessage: 'assist:chat-message',
  chatReset: 'assist:chat-reset',
} as const

/** The API the preload exposes to renderers as `window.assist`. */
export interface AssistApi {
  getState(): Promise<AppState>
  bubbleClick(): void
  collapse(): void
  /** Tell the main process whether the pointer is over real UI (true) or a see-through area. */
  setInteractive(interactive: boolean): void
  invokeAction(id: CommandActionId): Promise<ActionResult>
  /** Opens an http(s) link in the default browser. */
  openExternal(url: string): Promise<void>
  copyText(text: string): Promise<void>
  notes: {
    setText(text: string): void
    attachLatestScreenshot(): Promise<AttachResult>
    removeAttachment(id: string): Promise<Notes>
  }
  screenshots: {
    /** A small data-URL preview, or null if the file is missing. */
    thumbnail(path: string): Promise<string | null>
    open(path: string): Promise<boolean>
    openFolder(): Promise<void>
  }
  settings: {
    get(): Promise<Settings>
    setAutoStart(enabled: boolean): Promise<Settings>
    setEffort(effort: Effort): Promise<Settings>
  }
  apiKey: {
    /** Checks the key with Anthropic and stores it only if it works. */
    submit(key: string): Promise<ApiKeySubmitResult>
    recheck(): Promise<void>
    forget(): Promise<void>
  }
  chat: {
    /** Sends the draft text plus the draft's attached screenshots. */
    send(text: string): Promise<SendResult>
    stop(): Promise<void>
    retry(): Promise<void>
    newConversation(): Promise<void>
  }
  onModeChanged(callback: (mode: Mode) => void): () => void
  onApiKeyStatus(callback: (status: ApiKeyStatus) => void): () => void
  /** A message was added or changed (streamed text arrives this way). */
  onChatMessage(callback: (message: ChatMessage) => void): () => void
  onChatReset(callback: () => void): () => void
}
