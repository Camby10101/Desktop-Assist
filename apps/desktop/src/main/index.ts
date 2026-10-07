import { app, dialog, Menu, screen, type Tray } from 'electron'
import { once } from 'node:events'
import { join } from 'node:path'
import { BUBBLE_BOX, panelWindowSize } from '@shared/geometry'
import { IPC } from '@shared/ipc'
import tenantConfig from '@tenant/tenant.json'
import { createActionHandlers } from './actions'
import { BubbleController } from './bubble/BubbleController'
import { bubbleSurface, createOverlayWindow, panelSurface } from './bubble/windows'
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
    onSaved: () => broadcast(IPC.notesSaved),
    onError: (error) => console.error('Saving the text box failed', error),
  })
  await notes.load()

  const settings = new SettingsService(join(userData, 'preferences.json'), screenshotsDir)
  await settings.init()

  const bubble = new BubbleController({
    bubble: bubbleSurface(bubbleWindow),
    panel: panelSurface(panelWindow),
    getWorkArea: () => screen.getPrimaryDisplay().workArea,
    actionCount,
    onModeChange: (mode) => broadcast(IPC.modeChanged, mode),
  })
  controller = bubble
  panelWindow.on('blur', () => bubble.panelBlurred())

  const screenshots = new ScreenshotService(screenshotsDir, () =>
    screen.getDisplayMatching(bubbleWindow.getBounds()),
  )

  registerIpc({
    windows,
    controller: bubble,
    notes,
    screenshots,
    settings,
    actions: createActionHandlers({ controller: bubble, screenshots, quit: () => app.quit() }),
    getState: () => ({
      mode: bubble.currentMode,
      notes: notes.get(),
      settings: settings.get(),
      branding: brandingOf(tenant),
      version: app.getVersion(),
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
    tray?.destroy() // otherwise the icon lingers in the tray until hovered
    const timeout = new Promise((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS))
    void Promise.race([notes.flush(), timeout]).finally(() => app.quit())
  })
  // Windows log-off / shutdown doesn't wait for async work.
  panelWindow.on('session-end', () => notes.flushSync())

  await windowsReady
  bubble.start()
}

function fail(error: unknown): void {
  console.error(error)
  dialog.showErrorBox('Desktop Assist could not start', String(error))
  app.exit(1)
}
