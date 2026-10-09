import {
  app,
  clipboard,
  ClipboardItem,
  dialog,
  Menu,
  net,
  Notification,
  safeStorage,
  screen,
  shell,
  type Tray,
} from 'electron'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { BUBBLE_BOX, panelWindowSize } from '@shared/geometry'
import { IPC } from '@shared/ipc'
import type { AppsState, AuthStatus } from '@shared/types'
import tenantConfig from '@tenant/tenant.json'
import { createActionHandlers } from './actions'
import { fetchLogo, mcpConnector } from './apps/mcp'
import { PortalApps } from './apps/PortalApps'
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
import { ClaudeDesktop, NEW_CHAT_LINK } from './claudeDesktop'
import { registerIpc, type BuiltInChat } from './ipc'
import { createLog, type Log } from './log'
import { sendInClaude } from './sendInClaude'
import { uninstall } from './uninstall'
import { NotesStore } from './notes/NotesStore'
import { ScreenshotService } from './screenshots/ScreenshotService'
import { SettingsService } from './settings'
import { SecretStore, type Encryptor } from './storage/SecretStore'
import {
  brandingOf,
  DevOverrideSchema,
  missingSettings,
  TenantSchema,
  type ClaudeAccessConfig,
  type SignInConfig,
  type Tenant,
} from './tenant'
import { createTray } from './tray'

const SHUTDOWN_TIMEOUT_MS = 2000
/** The installer's product name (electron-builder.cjs): its uninstaller is named after it. */
const PRODUCT_NAME = 'Desktop Assist'

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
  const tenant = await withDevOverrides(TenantSchema.parse(tenantConfig))
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
    onDiagnostic: (message) => log(message),
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

  const { chatApp, signIn, claudeAccess } = tenant
  const builtIn =
    chatApp === 'built-in' && signIn && claudeAccess
      ? startBuiltInChat({
          tenant,
          signIn,
          claudeAccess,
          userData,
          settings,
          log,
          broadcast,
          bubble,
        })
      : null
  const claudeDesktop =
    chatApp === 'claude-desktop'
      ? new ClaudeDesktop({
          isInstalled: () => app.getApplicationNameForProtocol(NEW_CHAT_LINK) !== '',
          openLink: (url) => shell.openExternal(url),
          copyScreenshots: async (paths) => {
            const image = screenshots.forClipboard(paths)
            if (!image) return false
            const png = new Blob([image.toPNG()], { type: 'image/png' })
            await clipboard.write([new ClipboardItem({ 'image/png': png })])
            return true
          },
          autoSend: () => settings.get().autoSend,
          sendInClaude: async (question, paste) => {
            const outcome = await sendInClaude({ question, paste })
            // Not a failure as such (the user is told to finish in Claude), but worth knowing.
            if (outcome !== 'sent') log(`Sending in Claude Desktop stopped: ${outcome}`)
            return outcome
          },
          notify: ({ title, body }) => {
            if (!Notification.isSupported()) return
            const notification = new Notification({ title, body })
            // Windows shows it in the bottom-right corner, over the bubble when it's there:
            // clicking it should do what clicking the bubble would.
            notification.on('click', () => bubble.expand())
            notification.show()
          },
          onError: (error) => log('Handing a question to Claude Desktop failed:', error),
        })
      : null
  // Electron's fetch, so a proxy set in Windows is used.
  const netFetch = (url: string | URL, init?: RequestInit) => net.fetch(String(url), init)
  const { portal, serviceDesk } = tenant
  let appsStatus: AppsState['status'] = 'loading'
  const portalApps = portal
    ? new PortalApps({
        appName: tenant.appName,
        redirectPort: portal.redirectPort,
        connector: mcpConnector({
          serverUrl: portal.appsServer,
          client: { name: tenant.appName, version: app.getVersion() },
          fetch: netFetch,
        }),
        store: new SecretStore(join(userData, 'jumpcloud-apps.bin'), safeStorageEncryptor),
        listen: (port) => listenForRedirect(port),
        openBrowser: (url) => shell.openExternal(url),
        fetchLogo: (url) => fetchLogo(netFetch, url),
        onState: (state) => {
          broadcast(IPC.appsState, state)
          // Connecting took the user to their browser; bring the list back once it's done.
          if (appsStatus === 'signing-in' && state.status !== 'signing-in') bubble.expand()
          appsStatus = state.status
        },
        onError: (message, error) => log(message, error),
      })
    : null
  // Load the Apps list in the background, so it's there when the panel first opens. It never
  // opens the browser: without a saved connection it just waits for "Sign in with JumpCloud".
  void portalApps?.get()
  if (!builtIn) {
    // Chats happen in Claude Desktop: a JumpCloud sign-in saved by the built-in chat isn't needed.
    void rm(join(userData, 'jumpcloud-session.bin'), { force: true }).catch(() => {})
  }
  // Milestone 1 saved a Claude API key here. Nothing uses it any more, so don't leave it behind.
  void rm(join(userData, 'claude-api-key.bin'), { force: true }).catch(() => {})

  registerIpc({
    windows,
    controller: bubble,
    notes,
    screenshots,
    settings,
    builtIn,
    claudeDesktop,
    apps: portal && portalApps ? { list: portalApps, portalUrl: portal.url } : null,
    actions: createActionHandlers({
      controller: bubble,
      screenshots,
      openServiceDesk: serviceDesk ? () => shell.openExternal(serviceDesk.url) : null,
      quit: () => app.quit(),
    }),
    uninstall: () =>
      uninstall({
        isPackaged: app.isPackaged,
        exePath: app.getPath('exe'),
        productName: PRODUCT_NAME,
        exists: existsSync,
        stopStartingWithWindows: () => app.setLoginItemSettings({ openAtLogin: false }),
        runDetached: (path) => spawn(path, [], { detached: true, stdio: 'ignore' }).unref(),
        quit: () => app.quit(),
        onError: (error) => log('Starting the uninstaller failed:', error),
      }),
    getState: () => ({
      mode: bubble.currentMode,
      corner: bubble.corner,
      notes: notes.get(),
      settings: settings.get(),
      branding: brandingOf(tenant),
      version: app.getVersion(),
      auth: builtIn?.auth.status ?? null,
      chat: builtIn?.chat.list() ?? [],
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
    builtIn?.chat.stop()
    void portalApps?.dispose()
    tray?.destroy() // otherwise the icon lingers in the tray until hovered
    const timeout = new Promise((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS))
    void Promise.race([notes.flush(), timeout]).finally(() => app.quit())
  })
  // Windows log-off / shutdown doesn't wait for async work.
  panelWindow.on('session-end', () => notes.flushSync())

  await windowsReady
  bubble.start()
}

/**
 * The built-in chat: JumpCloud sign-in, and Claude reached with the signed-in user's ID token
 * through Workload Identity Federation.
 */
function startBuiltInChat(deps: {
  tenant: Tenant
  signIn: SignInConfig
  claudeAccess: ClaudeAccessConfig
  userData: string
  settings: SettingsService
  log: Log
  broadcast: (channel: string, payload?: unknown) => void
  bubble: BubbleController
}): BuiltInChat {
  const { tenant, signIn, claudeAccess, userData, settings, log, broadcast, bubble } = deps

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
  return { auth, chat }
}

/** Windows DPAPI through Electron: only this Windows user can decrypt what it encrypts. */
const safeStorageEncryptor: Encryptor = {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: (text) => safeStorage.encryptString(text),
  decrypt: (data) => safeStorage.decryptString(data),
}

/**
 * Dev runs only: where chats happen, and the sign-in and Claude access settings, can be
 * overridden from a JSON file named by DESKTOP_ASSIST_DEV_CONFIG, to test against a local
 * identity provider.
 */
async function withDevOverrides(tenant: Tenant): Promise<Tenant> {
  const path = !app.isPackaged ? process.env['DESKTOP_ASSIST_DEV_CONFIG'] : undefined
  if (!path) return tenant
  const override = DevOverrideSchema.parse(JSON.parse(await readFile(path, 'utf8')))
  return TenantSchema.parse({
    ...tenant,
    chatApp: override.chatApp ?? tenant.chatApp,
    startPage: override.startPage ?? tenant.startPage,
    portal: override.portal ? { ...tenant.portal, ...override.portal } : tenant.portal,
    signIn: override.signIn ? { ...tenant.signIn, ...override.signIn } : tenant.signIn,
    claudeAccess: override.claudeAccess
      ? { ...tenant.claudeAccess, ...override.claudeAccess }
      : tenant.claudeAccess,
  })
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
