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
import type {
  AppState,
  AskAboutIssueResult,
  AskResult,
  AttachResult,
  RaiseResult,
  SendResult,
  UninstallResult,
} from '@shared/types'
import type { ActionHandlers } from './actions'
import type { PortalApps } from './apps/PortalApps'
import type { Atlassian } from './atlassian/Atlassian'
import type { AuthManager } from './auth/AuthManager'
import type { BubbleController } from './bubble/BubbleController'
import type { ChatSession, OutgoingImage } from './claude/ChatSession'
import { MAX_PROMPT_LENGTH, type ClaudeDesktop } from './claudeDesktop'
import { MAX_NOTE_LENGTH, type NotesStore } from './notes/NotesStore'
import type { ScreenshotService } from './screenshots/ScreenshotService'
import type { ServiceDesk } from './serviceDesk'
import type { SettingsService } from './settings'
import type { Updater } from './updates'

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
  /** Jira and Confluence, or null when the tenant has no Atlassian site. */
  atlassian: Atlassian | null
  /** Raising IT requests and the user's requests page, or null without request types. */
  serviceDesk: { desk: ServiceDesk; myRequestsUrl: string } | null
  /** Settings → Check for updates, or null when the tenant has no `updates`. */
  updater: Updater | null
  actions: ActionHandlers
  /** Settings → Uninstall. */
  uninstall(): UninstallResult
  getState(): AppState
}

const NoArgs = z.undefined()
const FilePath = z.string().min(1).max(1024)
const IssueKey = z.string().regex(/^[A-Z][A-Z0-9_]{1,9}-\d{1,7}$/)
/** Jira's time format: weeks, days, hours and minutes ("1h 30m"). */
const TimeSpent = z
  .string()
  .trim()
  .regex(/^(?=.*\d)(\d{1,3}w ?)?(\d{1,3}d ?)?(\d{1,3}h ?)?(\d{1,4}m)?$/)

/** What to say when an issue couldn't be handed to Claude Desktop. */
const ASK_PROBLEMS: Record<Extract<AskResult, { ok: false }>['reason'], string> = {
  empty: 'There was nothing to ask.',
  'too-long': 'That issue is too long to open in Claude.',
  'not-installed': "Claude Desktop isn't installed on this PC. Ask IT to install it.",
  'missing-screenshot': 'An attached screenshot is missing.',
  failed: "Couldn't open Claude Desktop. Try again.",
}
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

  on(IPC.bubbleClick, z.number().finite().optional(), (pressedAt) =>
    ctx.controller.clickBubble(pressedAt),
  )
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
  // Each click attaches the newest screenshot that isn't attached yet, so clicking again goes one
  // further back.
  handle(IPC.notesAttachLatest, NoArgs, async (): Promise<AttachResult> => {
    const next = await ctx.screenshots.latest((path) => ctx.notes.isAttached(path))
    if (!next) {
      const anyAttached = ctx.notes.get().attachments.length > 0
      return { ok: false, reason: anyAttached ? 'no-more' : 'no-screenshots' }
    }
    const notes = ctx.notes.addAttachment(next)
    return notes ? { ok: true, notes } : { ok: false, reason: 'no-more' }
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
  handle(IPC.settingsSetTheme, z.enum(['dark', 'light']), (theme) => ctx.settings.setTheme(theme))
  handle(
    IPC.settingsSetFavoriteApp,
    z.object({ id: z.string().min(1).max(200), favorite: z.boolean() }),
    ({ id, favorite }) => ctx.settings.setFavoriteApp(id, favorite),
  )

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
  if (ctx.atlassian) registerAtlassian(ctx.atlassian)
  if (ctx.serviceDesk) registerServiceDesk(ctx.serviceDesk)
  if (ctx.updater) registerUpdates(ctx.updater)

  function registerUpdates(updater: Updater): void {
    handle(IPC.updatesGet, NoArgs, () => updater.current)
    // Checking, downloading and installing take a while, so this returns straight away (already
    // "checking"); progress is broadcast on IPC.updateState.
    handle(IPC.updatesCheck, NoArgs, () => {
      void updater.checkAndInstall()
      return updater.current
    })
  }

  function registerAtlassian(atlassian: Atlassian): void {
    handle(IPC.atlassianGet, NoArgs, () => atlassian.current)
    // Connecting happens in the browser and can take minutes, so this returns straight away;
    // progress is broadcast on IPC.atlassianState. No tokens ever reach the renderer.
    handle(IPC.atlassianSignIn, NoArgs, () => void atlassian.signIn())
    handle(IPC.atlassianCancelSignIn, NoArgs, () => atlassian.cancelSignIn())
    handle(IPC.atlassianSignOut, NoArgs, () => atlassian.signOut())
    handle(IPC.atlassianRetry, NoArgs, () => void atlassian.retry())
    handle(IPC.atlassianFeed, z.boolean(), (refresh) => atlassian.feed(refresh))
    handle(IPC.atlassianMarkNotificationsRead, NoArgs, () => atlassian.markNotificationsRead())
    handle(IPC.atlassianMarkRequestsRead, IssueKey.optional(), (key) =>
      atlassian.markRequestsRead(key),
    )
    handle(IPC.atlassianSearch, z.string().max(200), (query) => atlassian.search(query))
    handle(IPC.atlassianIssue, IssueKey, (key) => atlassian.issue(key))
    handle(
      IPC.atlassianTransition,
      z.object({ key: IssueKey, transitionId: z.string().regex(/^\d{1,10}$/) }),
      ({ key, transitionId }) => atlassian.transition(key, transitionId),
    )
    handle(
      IPC.atlassianComment,
      z.object({ key: IssueKey, body: z.string().trim().min(1).max(10_000) }),
      ({ key, body }) => atlassian.comment(key, body),
    )
    handle(
      IPC.atlassianLogWork,
      z.object({ key: IssueKey, timeSpent: TimeSpent }),
      ({ key, timeSpent }) => atlassian.logWork(key, timeSpent),
    )
    handle(IPC.atlassianArticles, z.string().max(2000), (text) => atlassian.articles(text))
    handle(IPC.atlassianProjectKeys, NoArgs, () => atlassian.projectKeys())
    handle(
      IPC.atlassianAsk,
      z.object({ key: IssueKey, prompt: z.enum(['summarise', 'reply', 'next-steps']) }),
      async ({ key, prompt }): Promise<AskAboutIssueResult> => {
        const built = await atlassian.prompt(key, prompt, MAX_PROMPT_LENGTH)
        if (!built.ok) return built
        if (ctx.claudeDesktop) {
          const result = await ctx.claudeDesktop.ask(built.prompt, [])
          if (!result.ok) return { ok: false, message: ASK_PROBLEMS[result.reason] }
          // Claude Desktop is coming to the front; get out of its way.
          ctx.controller.collapse()
          return { ok: true, inChat: false }
        }
        if (ctx.builtIn) {
          const status = ctx.builtIn.chat.send(built.prompt, [], [])
          if (status === 'sent') return { ok: true, inChat: true }
          return {
            ok: false,
            message:
              status === 'busy'
                ? 'Claude is still answering. Try again in a moment.'
                : 'Sign in with JumpCloud first.',
          }
        }
        return { ok: false, message: "Asking Claude isn't set up." }
      },
    )
  }

  function registerServiceDesk({ desk, myRequestsUrl }: NonNullable<IpcContext['serviceDesk']>) {
    handle(IPC.serviceDeskPcDetails, NoArgs, () => desk.pcDetails())
    // The request: the form's fields, plus the screenshots attached to the text box.
    handle(
      IPC.serviceDeskRaise,
      z.object({
        requestTypeId: z.string().regex(/^\d{1,10}$/),
        summary: z.string().max(255),
        details: z.string().max(MAX_NOTE_LENGTH),
        includePcDetails: z.boolean(),
      }),
      async (request): Promise<RaiseResult> => {
        const result = await desk.raise(request, ctx.notes.get().attachments)
        // The browser is coming to the front; get out of its way.
        if (result.ok) ctx.controller.collapse()
        return result
      },
    )
    handle(IPC.serviceDeskOpenMyRequests, NoArgs, async () => {
      await shell.openExternal(myRequestsUrl)
      ctx.controller.collapse()
    })
  }

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
