import {
  BrowserWindow,
  ipcMain,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type WebContents,
} from 'electron'
import { z } from 'zod'
import { COMMAND_ACTION_IDS } from '@shared/actions'
import { IPC } from '@shared/ipc'
import type { AppState, AttachResult } from '@shared/types'
import type { ActionHandlers } from './actions'
import type { BubbleController } from './bubble/BubbleController'
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
  actions: ActionHandlers
  getState(): AppState
}

const NoArgs = z.undefined()
const FilePath = z.string().min(1).max(1024)

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
}
