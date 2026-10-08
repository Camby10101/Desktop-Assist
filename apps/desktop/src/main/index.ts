import { app, dialog, Menu, safeStorage, screen, shell, type Tray } from 'electron'
import { once } from 'node:events'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { BUBBLE_BOX, panelWindowSize } from '@shared/geometry'
import { IPC } from '@shared/ipc'
import type { AuthStatus } from '@shared/types'
import tenantConfig from '@tenant/tenant.json'
import { createActionHandlers } from './actions'
import { AuthManager } from './auth/AuthManager'
import { summarizeIdToken, type IdTokenSummary } from './auth/idToken'
import { listenForRedirect } from './auth/loopback'
import { createOidc } from './auth/oidc'
import { BubbleController, type DisplayArea, type Displays } from './bubble/BubbleController'
import { bubbleSurface, createOverlayWindow, panelSurface } from './bubble/windows'
import { AnthropicBackend } from './claude/AnthropicBackend'
import { ChatSession } from './claude/ChatSession'
import { classifyError } from './claude/errors'
import { API_BASE_URL, buildSystemPrompt } from './claude/model'
import { registerIpc } from './ipc'
import { createLog } from './log'
import { NotesStore } from './notes/NotesStore'
import { ScreenshotService } from './screenshots/ScreenshotService'
import { SettingsService } from './settings'
import { SecretStore, type Encryptor } from './storage/SecretStore'
import {
  brandingOf,
  DevOverrideSchema,
  missingSettings,
  SignInSchema,
  TenantSchema,
  type Tenant,
} from './tenant'
import { createTray } from './tray'

const SHUTDOWN_TIMEOUT_MS = 2000

// Keep dev runs (`npm run dev`) from sharing notes, the sign-in and the single-instance lock with
// an installed copy. Must happen before anything reads the userData path. Automated tests give
// their dev runs a folder of their own with DESKTOP_ASSIST_DEV_USER_DATA.
if (!app.isPackaged) {
  app.setPath(
    'userData',
    process.env['DESKTOP_ASSIST_DEV_USER_DATA'] ||
      join(app.getPath('appData'), `${app.getName()} (Dev)`),
  )
}

let controller: BubbleController | null = null
let tray: Tray | null = null // module-level so it isn't garbage-collected

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // Launching it again just opens the panel of the copy that's already running.
  app.on('second-instance', () => controller?.expand())
  // .catch(fail) after .then(start): a failure inside start() must also show the error box.
  app.whenReady().then(start).catch(fail)
}

async function start(): Promise<void> {
  const tenant = TenantSchema.parse(tenantConfig)
  const { signIn, claudeAccess } = await withDevOverrides(tenant)
  Menu.setApplicationMenu(null)
  app.setAppUserModelId('com.morsemicro.desktopassist')

  const userData = app.getPath('userData')
  const screenshotsDir = join(app.getPath('pictures'), tenant.appName)
  const actionCount = tenant.actions.length
  // Problems go to %APPDATA%\Desktop Assist\logs, so an installed copy can be diagnosed too.
  const log = createLog(join(userData, 'logs', 'desktop-assist.log'))

  const notes = new NotesStore(join(userData, 'notes.json'), {
    onError: (error) => log('Saving the text box failed:', error),
  })
  await notes.load()

  const settings = new SettingsService(join(userData, 'preferences.json'), screenshotsDir)
  await settings.init()

  // The windows are created after the last `await`: from here to registerIpc() below nothing
  // waits, so the pages can't ask for the app state before there's anything to answer them.
  const bubbleWindow = createOverlayWindow('bubble', { width: BUBBLE_BOX, height: BUBBLE_BOX })
  const panelWindow = createOverlayWindow('panel', panelWindowSize(actionCount))
  const windows = [bubbleWindow, panelWindow]
  // Listen straight away, so a page that finishes loading quickly isn't missed.
  const windowsReady = Promise.all(windows.map((win) => once(win, 'ready-to-show')))
  const broadcast = (channel: string, payload?: unknown) => {
    for (const win of windows) if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }

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
  let lastIdToken: IdTokenSummary | { error: string } | null = null
  const backend = new AnthropicBackend({
    baseURL: devBaseUrl || API_BASE_URL,
    access: claudeAccess,
    identityToken: async () => {
      const token = await auth.freshIdToken()
      lastIdToken = summarizeIdToken(token) // what the token says, never the token itself
      return token
    },
  })
  const chat = new ChatSession({
    backend,
    canChat: () => auth.canChat,
    getEffort: () => settings.get().effort,
    system: buildSystemPrompt(tenant),
    onMessage: (message) => broadcast(IPC.chatMessage, message),
    onReset: () => broadcast(IPC.chatReset),
    onError: (error) => {
      log('Claude request failed:', error)
      // Anthropic refused to swap the sign-in: log what the token said, to compare with the rule.
      if (classifyError(error) === 'not-allowed') log('The JumpCloud ID token sent:', lastIdToken)
    },
  })

  const missing = missingSettings(signIn, claudeAccess)
  // Plain http is allowed only for a test identity provider on this PC, in dev runs.
  const localIssuer = !app.isPackaged && isLoopback(new URL(signIn.issuer))
  let authState: AuthStatus['state'] = 'checking'
  const auth = new AuthManager({
    oidc: missing.length === 0 ? createOidc(signIn, { allowInsecure: localIssuer }) : null,
    missing,
    store: new SecretStore(join(userData, 'jumpcloud-session.bin'), safeStorageEncryptor),
    redirectPort: signIn.redirectPort,
    listen: (port) => listenForRedirect(port),
    openBrowser: (url) => shell.openExternal(url),
    onStatus: (status) => {
      broadcast(IPC.authStatus, status)
      // Signing in took the user to their browser; bring the chat back once it's done.
      if (status.state === 'signed-in' && authState === 'signing-in') bubble.expand()
      authState = status.state
    },
    onSignedOut: (reason) => {
      backend.reset()
      // Logging out clears the chat. If the sign-in expired, it stays, so after signing back in
      // the user can carry on (Retry resends a message that failed).
      if (reason === 'logout') chat.newConversation()
    },
    onError: (error) => log('JumpCloud sign-in failed:', error),
  })
  // Renew the saved sign-in at every start; if there isn't one, the chat box offers to sign in.
  void auth.init()
  // Milestone 1 saved a Claude API key here. Nothing uses it any more, so don't leave it behind.
  void rm(join(userData, 'claude-api-key.bin'), { force: true }).catch(() => {})

  registerIpc({
    windows,
    controller: bubble,
    notes,
    screenshots,
    settings,
    auth,
    chat,
    actions: createActionHandlers({ controller: bubble, screenshots, quit: () => app.quit() }),
    getState: () => ({
      mode: bubble.currentMode,
      corner: bubble.corner,
      notes: notes.get(),
      settings: settings.get(),
      branding: brandingOf(tenant),
      version: app.getVersion(),
      auth: auth.status,
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

/** Windows DPAPI through Electron: only this Windows user can decrypt what it encrypts. */
const safeStorageEncryptor: Encryptor = {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: (text) => safeStorage.encryptString(text),
  decrypt: (data) => safeStorage.decryptString(data),
}

/**
 * Dev runs only: the sign-in and Claude access settings can be overridden from a JSON file named
 * by DESKTOP_ASSIST_DEV_CONFIG, to test against a local identity provider.
 */
async function withDevOverrides(tenant: Tenant): Promise<Pick<Tenant, 'signIn' | 'claudeAccess'>> {
  const path = !app.isPackaged ? process.env['DESKTOP_ASSIST_DEV_CONFIG'] : undefined
  if (!path) return tenant
  const override = DevOverrideSchema.parse(JSON.parse(await readFile(path, 'utf8')))
  return {
    signIn: SignInSchema.parse({ ...tenant.signIn, ...override.signIn }),
    claudeAccess: { ...tenant.claudeAccess, ...override.claudeAccess },
  }
}

function isLoopback(url: URL): boolean {
  return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
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
