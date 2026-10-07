import {
  BrowserWindow,
  clipboard,
  ipcMain,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type WebContents,
} from 'electron'
import { z } from 'zod'
import { COMMAND_ACTION_IDS } from '@shared/actions'
import { IPC } from '@shared/ipc'
import type { AppState, AttachResult, SendResult } from '@shared/types'
import type { ActionHandlers } from './actions'
import type { BubbleController } from './bubble/BubbleController'
import type { ApiKeyManager } from './claude/ApiKeyManager'
import type { ChatSession, OutgoingImage } from './claude/ChatSession'
import { MAX_NOTE_LENGTH, type NotesStore } from './notes/NotesStore'
import type { ScreenshotService } from './screenshots/ScreenshotService'
import type { SettingsService } from './settings'

export interface IpcContext {
  /** Only these windows' renderers may call in. */
  windows: BrowserWindow[]
  controller: BubbleController
  notes: NotesStore
  screenshots: ScreenshotService
  settings: SettingsService
  apiKeys: ApiKeyManager
  chat: ChatSession
  actions: ActionHandlers
  getState(): AppState
}

const NoArgs = z.undefined()
const FilePath = z.string().min(1).max(1024)
/** Only web links may be opened from the chat (no file:, javascript: and so on). */
const WebUrl = z
  .string()
  .max(4096)
  .refine((value) => {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol)
    } catch {
      return false
    }
  })

/** Wires every renderer request to the main process. All arguments are validated with zod. */
export function registerIpc(ctx: IpcContext): void {
  const trusted = (sender: WebContents) => ctx.windows.some((w) => w.webContents.id === sender.id)

  function handle<S extends z.ZodType, R>(
    channel: string,
    schema: S,
    run: (arg: z.output<S>) => R | Promise<R>,
  ): void {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, raw: unknown) => {
      if (!trusted(event.sender)) throw new Error(`Untrusted sender for ${channel}`)
      return run(schema.parse(raw))
    })
  }

  function on<S extends z.ZodType>(
    channel: string,
    schema: S,
    run: (arg: z.output<S>, event: IpcMainEvent) => void,
  ): void {
    ipcMain.on(channel, (event: IpcMainEvent, raw: unknown) => {
      if (!trusted(event.sender)) return
      const parsed = schema.safeParse(raw)
      if (parsed.success) run(parsed.data, event)
    })
  }

  handle(IPC.getState, NoArgs, () => ctx.getState())

  on(IPC.bubbleClick, NoArgs, () => ctx.controller.clickBubble())
  on(IPC.collapse, NoArgs, () => ctx.controller.collapse())
  on(IPC.setInteractive, z.boolean(), (interactive, event) => {
    BrowserWindow.fromWebContents(event.sender)?.setIgnoreMouseEvents(!interactive, {
      forward: true,
    })
  })

  handle(IPC.invokeAction, z.enum(COMMAND_ACTION_IDS), (id) => ctx.actions[id]())
  handle(IPC.openExternal, WebUrl, (url) => shell.openExternal(url))
  handle(IPC.copyText, z.string().max(1_000_000), (text) => clipboard.writeText(text))

  on(IPC.notesSetText, z.string().max(MAX_NOTE_LENGTH), (text) => ctx.notes.setText(text))
  handle(IPC.notesAttachLatest, NoArgs, async (): Promise<AttachResult> => {
    const latest = await ctx.screenshots.latest()
    if (!latest) return { ok: false, reason: 'no-screenshots' }
    const notes = ctx.notes.addAttachment(latest)
    return notes ? { ok: true, notes } : { ok: false, reason: 'already-attached' }
  })
  handle(IPC.notesRemoveAttachment, z.string().min(1).max(64), (id) =>
    ctx.notes.removeAttachment(id),
  )

  handle(IPC.screenshotThumbnail, FilePath, (path) => ctx.screenshots.thumbnail(path))
  handle(IPC.screenshotOpen, FilePath, (path) => ctx.screenshots.open(path))
  handle(IPC.screenshotsOpenFolder, NoArgs, () => ctx.screenshots.openFolder())

  handle(IPC.settingsGet, NoArgs, () => ctx.settings.get())
  handle(IPC.settingsSetAutoStart, z.boolean(), (enabled) => ctx.settings.setAutoStart(enabled))
  handle(IPC.settingsSetEffort, z.enum(['low', 'medium', 'high']), (effort) =>
    ctx.settings.setEffort(effort),
  )

  // The key comes in once, goes straight to Anthropic to be checked, and is stored encrypted.
  handle(IPC.apiKeySubmit, z.string().max(1000), (key) => ctx.apiKeys.submit(key))
  handle(IPC.apiKeyRecheck, NoArgs, () => ctx.apiKeys.checkSaved())
  handle(IPC.apiKeyForget, NoArgs, () => ctx.apiKeys.forget())

  // Sends the draft: the text from the box plus the screenshots attached to it.
  handle(IPC.chatSend, z.string().max(MAX_NOTE_LENGTH), (text): SendResult => {
    if (ctx.chat.busy) return { ok: false, reason: 'busy' }
    const draft = ctx.notes.get()
    const images: OutgoingImage[] = []
    for (const attachment of draft.attachments) {
      const image = ctx.screenshots.forClaude(attachment.path)
      if (!image) return { ok: false, reason: 'missing-screenshot' }
      images.push(image)
    }
    const status = ctx.chat.send(text, images, draft.attachments)
    if (status !== 'sent') return { ok: false, reason: status }
    return { ok: true, notes: ctx.notes.clear() }
  })
  handle(IPC.chatStop, NoArgs, () => ctx.chat.stop())
  handle(IPC.chatRetry, NoArgs, () => ctx.chat.retry())
  handle(IPC.chatNew, NoArgs, () => ctx.chat.newConversation())
}
