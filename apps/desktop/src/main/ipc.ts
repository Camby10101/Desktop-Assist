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
import type { AppState, AskResult, AttachResult, SendResult, UninstallResult } from '@shared/types'
import type { ActionHandlers } from './actions'
import type { PortalApps } from './apps/PortalApps'
import type { AuthManager } from './auth/AuthManager'
import type { BubbleController } from './bubble/BubbleController'
import type { ChatSession, OutgoingImage } from './claude/ChatSession'
import type { ClaudeDesktop } from './claudeDesktop'
import { MAX_NOTE_LENGTH, type NotesStore } from './notes/NotesStore'
import type { ScreenshotService } from './screenshots/ScreenshotService'
import type { SettingsService } from './settings'

/** The built-in chat and the JumpCloud sign-in it needs. */
export interface BuiltInChat {
  auth: AuthManager
  chat: ChatSession
}

export interface IpcContext {
  /** Only these windows' renderers may call in. */
  windows: BrowserWindow[]
  controller: BubbleController
  notes: NotesStore
  screenshots: ScreenshotService
  settings: SettingsService
  /** The built-in chat and its sign-in, or null when chats happen in Claude Desktop. */
  builtIn: BuiltInChat | null
  /** Hands questions to Claude Desktop, or null when the chat is built in. */
  claudeDesktop: ClaudeDesktop | null
  /** The Apps list and the portal it comes from, or null when the tenant has no portal. */
  apps: { list: PortalApps; portalUrl: string } | null
  actions: ActionHandlers
  /** Settings → Uninstall. */
  uninstall(): UninstallResult
  getState(): AppState
}

const NoArgs = z.undefined()
const FilePath = z.string().min(1).max(1024)
/** Only web and email links may be opened from the chat (no file:, javascript: and so on). */
const ExternalUrl = z
  .string()
  .max(4096)
  .refine((value) => {
    try {
      return ['http:', 'https:', 'mailto:'].includes(new URL(value).protocol)
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
  on(IPC.bubbleDragStart, NoArgs, () => ctx.controller.startDrag())
  on(IPC.bubbleDragEnd, NoArgs, () => ctx.controller.endDrag())
  on(IPC.collapse, NoArgs, () => ctx.controller.collapse())
  on(IPC.setInteractive, z.boolean(), (interactive, event) => {
    BrowserWindow.fromWebContents(event.sender)?.setIgnoreMouseEvents(!interactive, {
      forward: true,
    })
  })

  handle(IPC.invokeAction, z.enum(COMMAND_ACTION_IDS), (id) => ctx.actions[id]())
  handle(IPC.appUninstall, NoArgs, () => ctx.uninstall())
  handle(IPC.openExternal, ExternalUrl, (url) => shell.openExternal(url))
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
  handle(IPC.notesClear, NoArgs, () => ctx.notes.clear())

  handle(IPC.screenshotThumbnail, FilePath, (path) => ctx.screenshots.thumbnail(path))
  handle(IPC.screenshotOpen, FilePath, (path) => ctx.screenshots.open(path))
  handle(IPC.screenshotsOpenFolder, NoArgs, () => ctx.screenshots.openFolder())

  handle(IPC.settingsGet, NoArgs, () => ctx.settings.get())
  handle(IPC.settingsSetAutoStart, z.boolean(), (enabled) => ctx.settings.setAutoStart(enabled))
  handle(IPC.settingsSetEffort, z.enum(['low', 'medium', 'high']), (effort) =>
    ctx.settings.setEffort(effort),
  )
  handle(IPC.settingsSetAutoSend, z.boolean(), (autoSend) => ctx.settings.setAutoSend(autoSend))

  if (ctx.claudeDesktop) registerClaudeDesktop(ctx.claudeDesktop)
  if (ctx.apps) registerApps(ctx.apps)

  function registerApps({ list, portalUrl }: NonNullable<IpcContext['apps']>): void {
    handle(IPC.appsGet, z.boolean(), (refresh) => list.get(refresh))
    // Connecting happens in the browser and can take minutes, so this returns straight away;
    // progress is broadcast on IPC.appsState. No tokens ever reach the renderer.
    handle(IPC.appsSignIn, NoArgs, () => void list.signIn())
    handle(IPC.appsCancelSignIn, NoArgs, () => list.cancelSignIn())
    handle(IPC.appsOpen, z.string().min(1).max(200), async (id) => {
      const opened = await list.open(id)
      // The browser is coming to the front; get out of its way.
      if (opened) ctx.controller.collapse()
      return opened
    })
    handle(IPC.appsOpenPortal, NoArgs, async () => {
      await shell.openExternal(portalUrl)
      ctx.controller.collapse()
    })
  }
  if (ctx.builtIn) registerBuiltInChat(ctx.builtIn)

  function registerClaudeDesktop(claudeDesktop: ClaudeDesktop): void {
    handle(IPC.claudeDesktopInstalled, NoArgs, () => claudeDesktop.isInstalled())
    // Hands the draft over: the text from the box, plus the screenshots attached to it.
    handle(
      IPC.claudeDesktopAsk,
      z.string().max(MAX_NOTE_LENGTH),
      async (text): Promise<AskResult> => {
        const result = await claudeDesktop.ask(text, ctx.notes.get().attachments)
        if (!result.ok) return result
        // Claude Desktop is coming to the front; get out of its way.
        ctx.controller.collapse()
        return { ...result, notes: ctx.notes.clear() }
      },
    )
  }

  function registerBuiltInChat({ auth, chat }: BuiltInChat): void {
    // Sign-in happens in the browser and can take minutes, so these return straight away;
    // progress is broadcast on IPC.authStatus. No tokens ever reach the renderer.
    handle(IPC.authSignIn, NoArgs, () => void auth.signIn())
    handle(IPC.authCancel, NoArgs, () => auth.cancelSignIn())
    handle(IPC.authSignOut, NoArgs, () => auth.signOut())
    handle(IPC.authRetry, NoArgs, () => void auth.retry())

    // Sends the draft: the text from the box plus the screenshots attached to it.
    handle(IPC.chatSend, z.string().max(MAX_NOTE_LENGTH), (text): SendResult => {
      if (chat.busy) return { ok: false, reason: 'busy' }
      const draft = ctx.notes.get()
      const images: OutgoingImage[] = []
      for (const attachment of draft.attachments) {
        const image = ctx.screenshots.forClaude(attachment.path)
        if (!image) return { ok: false, reason: 'missing-screenshot' }
        images.push(image)
      }
      const status = chat.send(text, images, draft.attachments)
      if (status !== 'sent') return { ok: false, reason: status }
      return { ok: true, notes: ctx.notes.clear() }
    })
    handle(IPC.chatStop, NoArgs, () => chat.stop())
    handle(IPC.chatRetry, NoArgs, () => chat.retry())
    handle(IPC.chatNew, NoArgs, () => chat.newConversation())
  }
}
