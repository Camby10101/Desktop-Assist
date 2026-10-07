import { app, dialog, Menu, safeStorage, screen, type Tray } from 'electron'
import { once } from 'node:events'
import { join } from 'node:path'
import { BUBBLE_BOX, panelWindowSize } from '@shared/geometry'
import { IPC } from '@shared/ipc'
import tenantConfig from '@tenant/tenant.json'
import { createActionHandlers } from './actions'
import { BubbleController, type DisplayArea, type Displays } from './bubble/BubbleController'
import { bubbleSurface, createOverlayWindow, panelSurface } from './bubble/windows'
import { AnthropicBackend } from './claude/AnthropicBackend'
import { ApiKeyManager } from './claude/ApiKeyManager'
import { ApiKeyStore } from './claude/ApiKeyStore'
import { ChatSession } from './claude/ChatSession'
import { API_BASE_URL, buildSystemPrompt } from './claude/model'
import { registerIpc } from './ipc'
import { NotesStore } from './notes/NotesStore'
import { ScreenshotService } from './screenshots/ScreenshotService'
import { SettingsService } from './settings'
import { brandingOf, TenantSchema } from './tenant'
import { createTray } from './tray'

const SHUTDOWN_TIMEOUT_MS = 2000

// Keep dev runs (`npm run dev`) from sharing notes and the single-instance lock with an
// installed copy. Must happen before anything reads the userData path.
if (!app.isPackaged) {
  app.setPath('userData', join(app.getPath('appData'), `${app.getName()} (Dev)`))
}

let controller: BubbleController | null = null
let tray: Tray | null = null // module-level so it isn't garbage-collected

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // Launching it again just opens the panel of the copy that's already running.
  app.on('second-instance', () => controller?.expand())
  app.whenReady().then(start, fail)
}

async function start(): Promise<void> {
  const tenant = TenantSchema.parse(tenantConfig)
  Menu.setApplicationMenu(null)
  app.setAppUserModelId('com.morsemicro.desktopassist')

  const userData = app.getPath('userData')
  const screenshotsDir = join(app.getPath('pictures'), tenant.appName)
  const actionCount = tenant.actions.length

  const bubbleWindow = createOverlayWindow('bubble', { width: BUBBLE_BOX, height: BUBBLE_BOX })
  const panelWindow = createOverlayWindow('panel', panelWindowSize(actionCount))
  const windows = [bubbleWindow, panelWindow]
  // Listen now: the pages may finish loading while notes and settings are read below.
  const windowsReady = Promise.all(windows.map((win) => once(win, 'ready-to-show')))
  const broadcast = (channel: string, payload?: unknown) => {
    for (const win of windows) if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }

  const notes = new NotesStore(join(userData, 'notes.json'), {
    onError: (error) => console.error('Saving the text box failed', error),
  })
  await notes.load()

  const settings = new SettingsService(join(userData, 'preferences.json'), screenshotsDir)
  await settings.init()

  const bubble = new BubbleController({
    bubble: bubbleSurface(bubbleWindow),
    panel: panelSurface(panelWindow),
    displays: electronDisplays,
    actionCount,
    initialAnchor: settings.bubbleAnchor,
    onModeChange: (mode) => broadcast(IPC.modeChanged, mode),
    onAnchorChange: (anchor) => {
      broadcast(IPC.cornerChanged, anchor.corner)
      void settings.setBubbleAnchor(anchor) // remembered for next time
    },
  })
  controller = bubble
  panelWindow.on('blur', () => bubble.panelBlurred())

  const screenshots = new ScreenshotService(screenshotsDir, () =>
    screen.getDisplayMatching(bubbleWindow.getBounds()),
  )

  // Dev runs may point at a local test server; an installed app always talks to Anthropic.
  const devBaseUrl = !app.isPackaged ? process.env['ANTHROPIC_BASE_URL'] : undefined
  const backend = new AnthropicBackend(devBaseUrl || API_BASE_URL)
  const apiKeys = new ApiKeyManager({
    storage: new ApiKeyStore(join(userData, 'claude-api-key.bin'), {
      isAvailable: () => safeStorage.isEncryptionAvailable(),
      encrypt: (text) => safeStorage.encryptString(text),
      decrypt: (data) => safeStorage.decryptString(data),
    }),
    verify: (key) => backend.verifyKey(key),
    onStatus: (status) => broadcast(IPC.apiKeyStatus, status),
  })
  const chat = new ChatSession({
    backend,
    getApiKey: () => apiKeys.key,
    getEffort: () => settings.get().effort,
    system: buildSystemPrompt(tenant),
    onMessage: (message) => broadcast(IPC.chatMessage, message),
    onReset: () => broadcast(IPC.chatReset),
    onKeyProblem: (kind) => apiKeys.rejected(kind),
    onReplied: () => apiKeys.confirmed(),
  })
  // Test the saved key at every start; if it's missing or rejected, the chat box asks for one.
  void apiKeys.checkSaved()

  registerIpc({
    windows,
    controller: bubble,
    notes,
    screenshots,
    settings,
    apiKeys,
    chat,
    actions: createActionHandlers({ controller: bubble, screenshots, quit: () => app.quit() }),
    getState: () => ({
      mode: bubble.currentMode,
      corner: bubble.corner,
      notes: notes.get(),
      settings: settings.get(),
      branding: brandingOf(tenant),
      version: app.getVersion(),
      apiKey: apiKeys.status,
      chat: chat.list(),
    }),
  })

  tray = createTray({
    appName: tenant.appName,
    accentColor: tenant.accentColor,
    onOpen: () => bubble.expand(),
    onQuit: () => app.quit(),
  })

  const onDisplayChange = () => bubble.displayChanged()
  screen.on('display-added', onDisplayChange)
  screen.on('display-removed', onDisplayChange)
  screen.on('display-metrics-changed', onDisplayChange)

  // Save the text box before quitting. before-quit fires again after the second app.quit().
  let shuttingDown = false
  app.on('before-quit', (event) => {
    if (shuttingDown) return
    shuttingDown = true
    event.preventDefault()
    bubble.dispose()
    chat.stop()
    tray?.destroy() // otherwise the icon lingers in the tray until hovered
    const timeout = new Promise((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS))
    void Promise.race([notes.flush(), timeout]).finally(() => app.quit())
  })
  // Windows log-off / shutdown doesn't wait for async work.
  panelWindow.on('session-end', () => notes.flushSync())

  await windowsReady
  bubble.start()
}

/** Electron's `screen`, in the shape the bubble controller uses. All coordinates are DIPs. */
const toArea = (display: Electron.Display): DisplayArea => ({
  id: display.id,
  workArea: display.workArea,
})
const electronDisplays: Displays = {
  primary: () => toArea(screen.getPrimaryDisplay()),
  byId: (id) => {
    const display = screen.getAllDisplays().find((d) => d.id === id)
    return display && toArea(display)
  },
  nearest: (point) =>
    toArea(screen.getDisplayNearestPoint({ x: Math.round(point.x), y: Math.round(point.y) })),
  cursor: () => screen.getCursorScreenPoint(),
}

function fail(error: unknown): void {
  console.error(error)
  dialog.showErrorBox('Desktop Assist could not start', String(error))
  app.exit(1)
}
