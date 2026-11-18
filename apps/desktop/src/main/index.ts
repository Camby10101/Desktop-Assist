import {
  app,
  clipboard,
  ClipboardItem,
  desktopCapturer,
  dialog,
  ipcMain,
  Menu,
  net,
  Notification,
  powerMonitor,
  safeStorage,
  screen,
  shell,
  type Tray,
} from 'electron'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { hostname, release, version as osVersion } from 'node:os'
import { join } from 'node:path'
import { bubbleMetrics, isInside, panelWindowSize, type Rect } from '@shared/geometry'
import { IPC } from '@shared/ipc'
import { FAMILIAR } from '@shared/character'
import { CAST_POSE, type Spell } from '@shared/spells'
import type { AppsState, AtlassianState, AuthStatus, JiraFeed } from '@shared/types'
import tenantConfig from '@tenant/tenant.json'
import { createActionHandlers } from './actions'
import { fetchLogo } from './apps/logos'
import { PortalApps } from './apps/PortalApps'
import { Atlassian, AtlassianMemorySchema } from './atlassian/Atlassian'
import { AuthManager } from './auth/AuthManager'
import { summarizeIdToken, type IdTokenSummary } from './auth/idToken'
import { listenForRedirect } from './auth/loopback'
import { createOidc } from './auth/oidc'
import { BubbleController, type DisplayArea, type Displays } from './bubble/BubbleController'
import { Clones } from './bubble/clones'
import { SpellEffects } from './bubble/spellEffects'
import { Vision } from './bubble/vision'
import { runFrontCheck, watchBubbleFront } from './bubble/frontCheck'
import {
  bringToFront,
  bubbleSurface,
  createOverlayWindow,
  keepOnTop,
  panelSurface,
} from './bubble/windows'
import { AnthropicBackend } from './claude/AnthropicBackend'
import { ChatSession } from './claude/ChatSession'
import { classifyError } from './claude/errors'
import { API_BASE_URL, buildSystemPrompt } from './claude/model'
import { ClaudeDesktop, NEW_CHAT_LINK } from './claudeDesktop'
import { debugSwitches } from './debugging'
import { registerIpc, type BuiltInChat } from './ipc'
import { createLog, type Log } from './log'
import { mcpConnector } from './mcp/connector'
import { sendInClaude } from './sendInClaude'
import { uninstall } from './uninstall'
import { INSTALLER_ARGS, saveDownload, Updater } from './updates'
import { NotesStore } from './notes/NotesStore'
import { ScreenshotService } from './screenshots/ScreenshotService'
import { myRequestsUrl, ServiceDesk, windowsVersion } from './serviceDesk'
import { adoptFormerData, FORMER_NAME, PRODUCT_NAME } from './formerName'
import { hasNews } from './atlassian/news'
import { Performances, type Standing } from './performances/performances'
import { TRICKS, type TrickName } from '@shared/tricks'
import { Familiar } from './familiar'
import { TaskbarTricks } from './performances/taskbarTricks'
import { WindowTricks } from './performances/windowTricks'
import { ShellProbe, type PhysicalRect } from './shell/probe'
import { familiarVisit } from './performances/familiarVisit'
import { ScreenSaver } from './screenSaver'
import { SettingsService } from './settings'
import { readJsonFile, writeJsonFile } from './storage/jsonFile'
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

// Its data folder, which must be settled before anything reads the userData path. An installed
// copy's is %APPDATA%\Desktop Wizard: the first time after an update from Desktop Assist (its old
// name), the old folder is moved across (see formerName.ts). Dev runs (`npm run dev`) have one of
// their own, so they don't share notes, the sign-in and the single-instance lock with an installed
// copy; automated tests give theirs a folder of its own with DESKTOP_ASSIST_DEV_USER_DATA.
if (app.isPackaged) {
  app.setPath('userData', adoptFormerData(app.getPath('appData'), PRODUCT_NAME, FORMER_NAME))
} else {
  app.setPath(
    'userData',
    process.env['DESKTOP_ASSIST_DEV_USER_DATA'] ||
      adoptFormerData(app.getPath('appData'), `${app.getName()} (Dev)`, `${FORMER_NAME} (Dev)`),
  )
}

let controller: BubbleController | null = null
let tray: Tray | null = null // module-level so it isn't garbage-collected
// An installed copy won't start with debugging switched on: another program could use it to drive
// the app, and through it Jira with the user's sign-in. Dev runs and the automated tests need it.
const refusedSwitches = app.isPackaged
  ? debugSwitches((name) => app.commandLine.hasSwitch(name))
  : []

if (refusedSwitches.length) {
  createLog(join(app.getPath('userData'), 'logs', 'desktop-wizard.log'))(
    `Refused to start with ${refusedSwitches.map((name) => `--${name}`).join(' ')}`,
  )
  app.exit(1)
} else if (!app.requestSingleInstanceLock()) {
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
  // Problems go to %APPDATA%\Desktop Wizard\logs, so an installed copy can be diagnosed too.
  const log = createLog(join(userData, 'logs', 'desktop-wizard.log'))

  const notes = new NotesStore(join(userData, 'notes.json'), {
    onError: (error) => log('Saving the text box failed:', error),
  })
  await notes.load()

  const settings = new SettingsService(join(userData, 'preferences.json'), screenshotsDir)
  await settings.init()

  // The windows are created after the last `await`: from here to registerIpc() below nothing
  // waits, so the pages can't ask for the app state before there's anything to answer them.
  const { box, headroom } = bubbleMetrics()
  const bubbleWindow = createOverlayWindow('bubble', { width: box, height: box + headroom })
  const panelWindow = createOverlayWindow('panel', panelWindowSize(actionCount))
  const windows = [bubbleWindow, panelWindow]
  const stopKeepingOnTop = windows.map(keepOnTop)
  // Listen straight away, so a page that finishes loading quickly isn't missed.
  const windowsReady = Promise.all(windows.map((win) => once(win, 'ready-to-show')))
  const broadcast = (channel: string, payload?: unknown) => {
    for (const win of windows) if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }

  /**
   * A window that only shows something over the screen (her clones, her vision's light and logo,
   * or a spell's effects): it shows once its page is drawn, behind her own window, which is put
   * back in front.
   */
  // `above`: over her too (her taskbar tricks' icons pass in front of her); otherwise she's put
  // back in front of it.
  const openOverlay =
    (view: 'clones' | 'vision' | 'spell' | 'familiar' | 'trick', above = false) =>
    (bounds: Rect, query: Record<string, string>) => {
      const win = createOverlayWindow(view, { width: bounds.width, height: bounds.height }, query)
      win.setBounds(bounds)
      win.once('ready-to-show', () => {
        win.showInactive()
        if (!above) bringToFront(bubbleWindow, false)
      })
      return {
        id: win.webContents.id,
        close: () => !win.isDestroyed() && win.destroy(),
        send: (channel: string, payload: unknown) => {
          if (!win.isDestroyed()) win.webContents.send(channel, payload)
        },
      }
    }
  // Her familiar, the black cat: summoned, or visiting; it's told where she is as she moves.
  const familiar = new Familiar({ open: openOverlay('familiar') })
  // Her vision's light and logo, over her for as long as she's having it.
  const vision = new Vision({ open: openOverlay('vision') })
  // Her spells' effects, drawn over the screen (all but her clones and her teleport).
  const effects = new SpellEffects({ accentColor: tenant.accentColor, open: openOverlay('spell') })

  // Her performances: watching the pointer (its gaze goes to her page), and more (see below).
  const herWindow = bubbleSurface(bubbleWindow)
  // Windows' own shell, looked at (never touched) through UI Automation: the taskbar's buttons and
  // the windows on the screen, for her tricks. Windows only.
  const shellProbe =
    process.platform === 'win32'
      ? new ShellProbe({
          spawn: (encoded) =>
            spawn(
              'powershell.exe',
              [
                '-NoLogo',
                '-NoProfile',
                '-NonInteractive',
                '-ExecutionPolicy',
                'Bypass',
                '-EncodedCommand',
                encoded,
              ],
              { windowsHide: true },
            ),
        })
      : null
  const toDip = (r: PhysicalRect): Rect => {
    const d = screen.screenToDipRect(null, r)
    return { x: d.x, y: d.y, width: d.width, height: d.height }
  }
  const displayAt = (p: { x: number; y: number }) => {
    const d = screen.getDisplayNearestPoint({ x: Math.round(p.x), y: Math.round(p.y) })
    return { id: d.id, bounds: d.bounds, workArea: d.workArea, scaleFactor: d.scaleFactor }
  }
  // A trick's plan and icons, for its page when it asks (only its own page gets them).
  const tricksWaiting = new Map<number, string>()
  ipcMain.on(IPC.trickReady, (event) => {
    const trick = tricksWaiting.get(event.sender.id)
    if (trick) event.sender.send(IPC.trickPlan, trick)
  })
  // Her tricks with the taskbar's icons: copies cut out of a screenshot (it never leaves the PC).
  const taskbarTricks = shellProbe
    ? new TaskbarTricks({
        taskbar: () => shellProbe.taskbar(),
        toDip,
        displayAt,
        capture: async (display) => {
          const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: {
              width: Math.round(display.bounds.width * display.scaleFactor),
              height: Math.round(display.bounds.height * display.scaleFactor),
            },
          })
          const source =
            sources.find((s) => s.display_id === String(display.id)) ??
            (sources.length === 1 ? sources[0] : undefined)
          if (!source || source.thumbnail.isEmpty()) return null
          const image = source.thumbnail
          return { crop: (r) => image.crop(r).toDataURL() }
        },
        open: (bounds, query, trick) => {
          const window = openOverlay('trick', true)(bounds, query)
          tricksWaiting.set(window.id, trick)
          return {
            close: () => {
              tricksWaiting.delete(window.id)
              window.close()
            },
          }
        },
        random: Math.random,
      })
    : null
  // Her tricks with the windows on the screen: peeking round one, and riding on one.
  const windowTricks = shellProbe
    ? new WindowTricks({
        windows: () => shellProbe.windows(),
        window: (handle) => shellProbe.window(handle),
        toDip,
        displayAt,
        occlude: (rect) => bubbleWindow.webContents.send(IPC.occlude, rect),
        ownPid: process.pid,
      })
    : null
  const trick = (name: TrickName) =>
    taskbarTricks
      ? { moves: true, prepare: (standing: Standing) => taskbarTricks.prepare(name, standing) }
      : undefined
  const performances = new Performances({
    displays: electronDisplays,
    onGaze: (gaze) => bubbleWindow.webContents.send(IPC.gaze, gaze),
    more: {
      // Peeking round a window, and waving through a portal on top of one (Windows only).
      ...(windowTricks
        ? {
            peek: { moves: true, prepare: (standing: Standing) => windowTricks.peek(standing) },
            portal: { moves: true, prepare: (standing: Standing) => windowTricks.portal(standing) },
          }
        : {}),
      // Her tricks with the taskbar's icons (Windows only).
      ...Object.fromEntries(TRICKS.flatMap((name) => (trick(name) ? [[name, trick(name)!]] : []))),
      // A visit from her familiar: it appears beside her, and she sits down with it a while.
      familiar: {
        moves: false,
        prepare: async (standing) => {
          familiar.start(standing, FAMILIAR.visitMs)
          return familiarVisit(standing)
        },
      },
    },
  })

  const bubble = new BubbleController({
    performer: performances,
    // How long since anyone used the mouse or keyboard, anywhere: she snoozes when it's a while.
    idleSeconds: () => powerMonitor.getSystemIdleTime(),
    bubble: {
      ...herWindow,
      // Her familiar watches where she goes.
      setBounds: (bounds) => {
        herWindow.setBounds(bounds)
        familiar.see(bounds, null)
      },
    },
    panel: panelSurface(panelWindow),
    displays: electronDisplays,
    actionCount,
    initialAnchor: settings.bubbleAnchor,
    initialScale: settings.characterScale,
    initialHabits: settings.get(),
    onDiagnostic: (message) => log(message),
    onModeChange: (mode) => broadcast(IPC.modeChanged, mode),
    onPoseChange: (pose) => {
      broadcast(IPC.poseChanged, pose)
      familiar.see(bubbleWindow.getBounds(), pose)
      if (pose === 'vision') vision.start(bubble.standing)
      else vision.stop()
      // The explosion is called off if she stops chanting before it's done (someone clicked her,
      // or picked her up).
      if (pose !== 'chant' && effects.chanting) effects.stop()
    },
    onSizeChange: (size) => broadcast(IPC.sizeChanged, size),
    onAnchorChange: (anchor) => {
      broadcast(IPC.cornerChanged, anchor.corner)
      void settings.setBubbleAnchor(anchor) // remembered for next time
    },
  })
  controller = bubble
  panelWindow.on('blur', () => bubble.panelBlurred())

  // Her clones: a window along the taskbar.
  const clones = new Clones({
    accentColor: tenant.accentColor,
    robeColor: () => settings.get().robeColor,
    open: openOverlay('clones'),
  })

  // The screen saver: a window over the whole of every display, in front of the taskbar too (from
  // the "screen-saver" level up, Windows keeps it there), the one on her display taking the focus
  // so it hears the keyboard. Each is placed twice: Windows can size a window placed on a display
  // with another scale by the first's, until it's there.
  const screenSaver = new ScreenSaver({
    accentColor: tenant.accentColor,
    robeColor: () => settings.get().robeColor,
    displays: () => screen.getAllDisplays().map(({ id, bounds }) => ({ id, bounds })),
    herDisplay: () => screen.getDisplayMatching(bubbleWindow.getBounds()).id,
    open: (bounds, query, focus) => {
      const win = createOverlayWindow('screensaver', bounds, query)
      win.setAlwaysOnTop(true, 'screen-saver')
      win.setBounds(bounds)
      win.once('ready-to-show', () => {
        win.setBounds(bounds)
        if (focus) win.show()
        else win.showInactive()
        win.moveTop()
      })
      return {
        id: win.webContents.id,
        end: () => !win.isDestroyed() && win.webContents.send(IPC.screensaverEnd),
        close: () => !win.isDestroyed() && win.destroy(),
      }
    },
    onStart: () => bubble.sleep(),
    onEnd: () => bubble.wake(),
  })

  /** The Spells menu: the panel closes, so the spell can be seen, and she casts it. */
  const castSpell = (spell: Spell) => {
    bubble.collapse()
    if (spell === 'clones') {
      clones.start(bubble.standing)
      bubble.act('spell')
    } else if (spell === 'teleport') {
      bubble.teleport()
    } else if (spell === 'familiar') {
      // Her black cat, for a minute, as she casts.
      familiar.start(bubble.standing, FAMILIAR.summonMs)
      bubble.act('spell')
    } else {
      // The rest are drawn over the screen while she acts them out (the explosion while she
      // chants).
      effects.start(spell, bubble.standing)
      bubble.act(CAST_POSE[spell])
    }
  }

  const screenshots = new ScreenshotService(screenshotsDir, () =>
    screen.getDisplayMatching(bubbleWindow.getBounds()),
  )

  /**
   * A Windows notification. Windows shows it in the bottom-right corner, over the bubble when it's
   * there: clicking it does what clicking the bubble would.
   */
  const notify = ({ title, body }: { title: string; body: string }) => {
    if (!Notification.isSupported()) return
    const notification = new Notification({ title, body })
    notification.on('click', () => bubble.expand())
    notification.show()
  }
  /** Screenshots go on the clipboard as one image, for pasting where a link can't carry them. */
  const copyScreenshots = async (paths: string[]) => {
    const image = screenshots.forClipboard(paths)
    if (!image) return false
    const png = new Blob([image.toPNG()], { type: 'image/png' })
    await clipboard.write([new ClipboardItem({ 'image/png': png })])
    return true
  }

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
          copyScreenshots,
          autoSend: () => settings.get().autoSend,
          sendInClaude: async (question, paste) => {
            const outcome = await sendInClaude({ question, paste })
            // Not a failure as such (the user is told to finish in Claude), but worth knowing.
            if (outcome !== 'sent') log(`Sending in Claude Desktop stopped: ${outcome}`)
            return outcome
          },
          notify,
          onError: (error) => log('Handing a question to Claude Desktop failed:', error),
        })
      : null
  // Electron's fetch, so a proxy set in Windows is used.
  const netFetch = (url: string | URL, init?: RequestInit) => net.fetch(String(url), init)
  const { updates } = tenant
  const updater = updates
    ? new Updater({
        currentVersion: app.getVersion(),
        releasesUrl: `${updates.api}/repos/${updates.repo}/releases?per_page=30`,
        downloads: `${updates.downloads}/${updates.repo}/releases/download/`,
        publicKey: updates.publicKey,
        fetch: netFetch,
        save: (name, chunks) =>
          saveDownload(join(app.getPath('temp'), `${tenant.appName} update`), name, chunks),
        // The installer runs on its own: it waits for this app to quit, replaces it, and starts
        // the new version. A development run has no installed copy to replace.
        install: app.isPackaged
          ? (path) => spawn(path, INSTALLER_ARGS, { detached: true, stdio: 'ignore' }).unref()
          : null,
        notify,
        quit: () => app.quit(),
        onState: (state) => {
          broadcast(IPC.updateState, state)
          if (state.status === 'downloaded') {
            log(
              `Development run: downloaded ${state.version} to ${state.path}; an installed copy ` +
                `would now run it with ${INSTALLER_ARGS.join(' ')}`,
            )
          }
        },
        onError: (message, error) => log(message, error),
      })
    : null
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

  const requests = serviceDesk?.requests
  const memoryPath = join(userData, 'atlassian.json')
  let atlassianStatus: AtlassianState['status'] = 'loading'
  /** The feed last time, to tell what's new (see hasNews). */
  let lastFeed: JiraFeed | null = null
  const atlassian = tenant.atlassian
    ? new Atlassian({
        appName: tenant.appName,
        site: tenant.atlassian.site,
        redirectPort: tenant.atlassian.redirectPort,
        knowledgeSpaces: tenant.atlassian.knowledgeSpaces,
        requests:
          serviceDesk && requests
            ? {
                helpCentre: serviceDesk.url,
                portalId: requests.portalId,
                projectKey: requests.projectKey,
              }
            : null,
        connector: mcpConnector({
          serverUrl: tenant.atlassian.mcpServer,
          client: { name: tenant.appName, version: app.getVersion() },
          fetch: netFetch,
        }),
        store: new SecretStore(join(userData, 'atlassian.bin'), safeStorageEncryptor),
        memory: {
          load: async () => {
            const read = await readJsonFile(memoryPath, AtlassianMemorySchema)
            return read.status === 'ok' ? read.value : {}
          },
          save: async (memory) => void (await writeJsonFile(memoryPath, memory)),
        },
        listen: (port) => listenForRedirect(port),
        openBrowser: (url) => shell.openExternal(url),
        onState: (state) => {
          broadcast(IPC.atlassianState, state)
          // Connecting took the user to their browser; bring the panel back once it's done.
          if (atlassianStatus === 'signing-in' && state.status !== 'signing-in') bubble.expand()
          atlassianStatus = state.status
        },
        onFeed: (feed) => {
          broadcast(IPC.jiraFeed, feed)
          // Something new: she hops up holding a scroll.
          if (hasNews(lastFeed, feed)) bubble.react('scroll')
          lastFeed = feed
        },
        notify,
        onError: (message, error) => log(message, error),
      })
    : null
  // Uses a saved connection to Atlassian, if there is one, and starts checking notifications.
  void atlassian?.init()
  const desk =
    serviceDesk && requests
      ? new ServiceDesk({
          helpCentre: serviceDesk.url,
          portalId: requests.portalId,
          requestTypeIds: requests.requestTypes.map((type) => type.id),
          pcInfo: () => ({
            computerName: hostname(),
            windows: windowsVersion(osVersion(), release()),
            appName: tenant.appName,
            appVersion: app.getVersion(),
          }),
          openLink: (url) => shell.openExternal(url),
          copyScreenshots,
          notify,
          onError: (error) => log('Opening the request form failed:', error),
        })
      : null
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
    atlassian,
    serviceDesk:
      serviceDesk && desk ? { desk, myRequestsUrl: myRequestsUrl(serviceDesk.url) } : null,
    updater,
    actions: createActionHandlers({
      controller: bubble,
      screenshots,
      openServiceDesk: serviceDesk ? () => shell.openExternal(serviceDesk.url) : null,
      startScreenSaver: () => screenSaver.start(),
      quit: () => app.quit(),
    }),
    castSpell,
    screenSaver,
    pointerOverBubble: () =>
      bubbleWindow.isVisible() && isInside(screen.getCursorScreenPoint(), bubbleWindow.getBounds()),
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
      pose: bubble.currentPose,
      size: bubble.size,
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
    // As the Close icon does: she vanishes, then the app quits.
    onQuit: () => {
      screenSaver.dispose()
      bubble.farewell(() => app.quit())
    },
  })

  const onDisplayChange = () => {
    // The screen saver's windows no longer fit the screens: it ends, and she comes back.
    screenSaver.stop()
    bubble.displayChanged()
  }
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
    clones.stop()
    vision.stop()
    effects.stop()
    familiar.stop()
    shellProbe?.dispose()
    screenSaver.dispose()
    for (const stop of stopKeepingOnTop) stop()
    builtIn?.chat.stop()
    void portalApps?.dispose()
    atlassian?.dispose()
    tray?.destroy() // otherwise the icon lingers in the tray until hovered
    const timeout = new Promise((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS))
    void Promise.race([notes.flush(), timeout]).finally(() => app.quit())
  })
  // Windows log-off / shutdown doesn't wait for async work.
  panelWindow.on('session-end', () => notes.flushSync())

  await windowsReady
  bubble.start()
  // Her window is showing now: she forms out of white motes (BubbleView).
  bubbleWindow.webContents.send(IPC.bubbleArrive)
  // For its first ten minutes, make sure the bubble isn't stuck behind other apps' windows.
  const stopWatchingFront = watchBubbleFront({
    isResting: () => bubble.currentMode === 'collapsed',
    check: () =>
      runFrontCheck(
        bubbleWindow.getNativeWindowHandle().readBigUInt64LE(0).toString(),
        process.pid,
      ),
    bringToFront: (reshow) => bringToFront(bubbleWindow, reshow),
    log,
  })
  app.once('before-quit', stopWatchingFront)
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
    atlassian: override.atlassian
      ? { ...tenant.atlassian, ...override.atlassian }
      : tenant.atlassian,
    updates: override.updates ? { ...tenant.updates, ...override.updates } : tenant.updates,
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
  bounds: display.bounds,
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
  dialog.showErrorBox('Desktop Wizard could not start', String(error))
  app.exit(1)
}
