# Main process: startup, IPC and app plumbing

[← Code Guide](CODE_GUIDE.md)

The _main process_ is the Node.js side of an Electron app: the single process that owns the
windows, the files, the tray icon and the network. This page covers how it starts and how the
pages talk to it. `index.ts` creates every service and wires them together, `ipc.ts` answers the
pages' requests, and the smaller files hold the problem log, the tenant config, the user's
preferences, the commands behind the action icons, uninstalling and the tray icon. The services
themselves (sign-in, Claude, the bubble, the draft and screenshots, Claude Desktop, the Apps list)
each have their own page.

## `src/main/index.ts`: startup and shutdown

The main process's entry point. electron-vite builds it into `out/main/index.js`, and the
`main` field of `apps/desktop/package.json` tells Electron to run that file. It works in three
stages:

1. **As soon as the file loads**, module-level code picks the data folder and makes sure only one
   copy of the app is running.
2. **Once Electron is ready**, `start()` creates the windows and every service, connects them with
   callbacks, registers the IPC handlers and the tray icon, and finally shows the bubble. Where
   questions go depends on the tenant's `chatApp`: `start()` either sets up the built-in chat (with
   [`startBuiltInChat()`](#startbuiltinchat)) or hands questions over to the Claude Desktop app
   (`ClaudeDesktop`, see [Claude Desktop](9-claude-desktop.md)). If the tenant has a `portal`, it
   also sets up the Apps list (`PortalApps`, see [Your apps](10-apps.md)).
3. **When the app quits**, a `before-quit` handler saves the draft before letting it close.

The key idea is that the services don't know about each other or about Electron's globals. Each
one is handed what it needs (callbacks, small adapter objects) when it's created, which is why the
tests can drive them with fakes. `index.ts` is the only file that knows about all of them.

### Module-level code

<!-- code: apps/desktop/src/main/index.ts#SHUTDOWN_TIMEOUT_MS,PRODUCT_NAME,controller,tray -->

[`src/main/index.ts`, lines 56–72](../../apps/desktop/src/main/index.ts#L56-L72)

```ts
const SHUTDOWN_TIMEOUT_MS = 2000

/** The installer's product name (electron-builder.cjs): its uninstaller is named after it. */
const PRODUCT_NAME = 'Desktop Assist'

let controller: BubbleController | null = null

let tray: Tray | null = null
```

<!-- /code -->

This runs the moment Electron loads the file, before the app is ready. The block shows only the
four declarations. Two `if` statements sit between them (they can't be shown on their own), so
they're quoted in the bullets below, in the order they run.

- `SHUTDOWN_TIMEOUT_MS = 2000`: the longest quitting will wait for the draft to be saved (see
  [Quitting](#quitting) below).
- `PRODUCT_NAME = 'Desktop Assist'`: the installer's product name, set in `electron-builder.cjs`.
  The installer names its uninstaller after it ("Uninstall Desktop Assist.exe"), which is how
  Settings → Uninstall finds it (see [`src/main/uninstall.ts`](#srcmainuninstallts-uninstalling)).
- `if (!app.isPackaged)`: `app.isPackaged` is true for an installed build and false for
  `npm run dev`. Dev runs move their _userData_ folder (Electron's per-app data folder, normally
  `%APPDATA%\Desktop Assist`) to `Desktop Assist (Dev)`, so they don't share the draft, the saved
  sign-in or the single-instance lock with an installed copy.
- `process.env['DESKTOP_ASSIST_DEV_USER_DATA'] ||`: the automated tests name a folder of their
  own in this environment variable, so they never touch your dev data. `app.setPath('userData', …)`
  has to run before anything reads that path, which is why this is at the very top of the file.
- `let controller`: the bubble controller, kept at module level so the `second-instance` handler
  below can reach it. It stays `null` until `start()` has created it.
- `let tray`: if JavaScript frees the `Tray` object (garbage collection, which happens once
  nothing refers to it), its icon can vanish from the notification area. A module-level variable
  keeps it alive for the whole run.
- `if (!app.requestSingleInstanceLock())`: the _single-instance lock_ lets only one copy of the
  app run per data folder. A second copy fails to get the lock and quits at once (`app.quit()`).
- `app.on('second-instance', () => controller?.expand())`: Electron fires `second-instance` in
  the copy that's already running when another copy tries to start. So launching the app again
  (from the Start menu, say) just opens the panel. The `?.` skips the call if `start()` hasn't
  created the controller yet.
- `app.whenReady().then(start).catch(fail)`: windows, the screen and the tray can only be used
  once Electron has finished starting up, and `whenReady()` returns a promise for that moment.
  Then `start()` runs. If anything fails along the way, [`fail()`](#fail) shows the error.
- `.catch(fail) after .then(start)`: as the comment says, the order matters. Written as
  `.then(start, fail)`, `fail` would only run if `whenReady()` itself failed; an error thrown
  inside `start()` would go unhandled and no error box would appear. A `.catch()` at the end
  catches a failure from either step.

### `start()`

Builds the whole app once Electron is ready. It's long, so it's shown below in pieces, in source
order. Only declarations (`const`, `let`) can be picked out as pieces; the plain statements in
between, such as `registerIpc({...})` and the `before-quit` handler, are quoted in the bullets.
The link above each piece opens the full source. The built-in chat's own pieces (the Claude
backend, the conversation and the JumpCloud sign-in) are in a separate function,
[`startBuiltInChat()`](#startbuiltinchat), which `start()` calls only when the tenant uses it.

#### The tenant config

<!-- code: apps/desktop/src/main/index.ts#start.tenant -->

[`src/main/index.ts`, line 84](../../apps/desktop/src/main/index.ts#L84)

```ts
const tenant = await withDevOverrides(TenantSchema.parse(tenantConfig))
```

<!-- /code -->

- `TenantSchema.parse(tenantConfig)`: `tenantConfig` is the bundled `tenant.json` (the `@tenant`
  import shortcut points at `tenants/<TENANT>/`). TypeScript only checks it at build time, so it's
  checked again here against the schema in `tenant.ts`. A bad config throws and the app doesn't
  start.
- `await withDevOverrides(...)`: in dev runs, a JSON file can change where chats happen and the
  JumpCloud and Claude access settings (see [`withDevOverrides()`](#withdevoverrides)). It returns
  a whole tenant, checked again, so the rest of `start()` simply reads `tenant`. In an installed
  build it's the bundled config unchanged.
- `Menu.setApplicationMenu(null)`: removes Electron's default menu (File, Edit, View and so on)
  and the keyboard shortcuts that come with it, such as reload and developer tools.
- `app.setAppUserModelId('com.morsemicro.desktopassist')`: the _AppUserModelID_ is how Windows
  identifies an app, for example to label its notifications (such as the "Screenshot copied"
  one when a question goes to Claude Desktop). It matches `appId` in `electron-builder.cjs`, the
  ID the installer registers.

#### Folders, the draft and preferences

<!-- code: apps/desktop/src/main/index.ts#start.userData,screenshotsDir,actionCount,log,notes,settings -->

[`src/main/index.ts`, lines 88–99](../../apps/desktop/src/main/index.ts#L88-L99)

```ts
const userData = app.getPath('userData')

const screenshotsDir = join(app.getPath('pictures'), tenant.appName)

const actionCount = tenant.actions.length

// Problems go to %APPDATA%\Desktop Assist\logs, so an installed copy can be diagnosed too.
const log = createLog(join(userData, 'logs', 'desktop-assist.log'))

const notes = new NotesStore(join(userData, 'notes.json'), {
  onError: (error) => log('Saving the text box failed:', error),
})

const settings = new SettingsService(join(userData, 'preferences.json'), screenshotsDir)
```

<!-- /code -->

- `app.getPath('pictures')`: the user's Pictures folder. Screenshots go in a subfolder named
  after the app (`appName` in `tenant.json`).
- `createLog(join(userData, 'logs', 'desktop-assist.log'))`: the problem log (see
  [`src/main/log.ts`](#srcmainlogts-the-problem-log)). `log` is a function: `log(message, detail)`
  appends a line to `%APPDATA%\Desktop Assist\logs\desktop-assist.log` and prints it to the
  terminal. An installed copy has no terminal, so this file is the only record of what went wrong.
- `new NotesStore(join(userData, 'notes.json'), ...)`: the unsent draft in the text box. It's
  followed by `await notes.load()`, which reads the saved draft before anything can ask for it.
  `onError` only logs: a failed save shouldn't interrupt the user (see
  [The draft, screenshots and safe files](6-drafts-and-screenshots.md)).
- `new SettingsService(join(userData, 'preferences.json'), screenshotsDir)`: the user's
  preferences, followed by `await settings.init()`, which loads them and, on an installed build's
  first run, turns on "Start with Windows" (see [`SettingsService.init()`](#settingsserviceinit)).

#### The two windows

<!-- code: apps/desktop/src/main/index.ts#start.bubbleWindow,panelWindow,windows,windowsReady,broadcast -->

[`src/main/index.ts`, lines 102–111](../../apps/desktop/src/main/index.ts#L102-L111)

```ts
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
```

<!-- /code -->

The windows are created only now, after the last `await`, and the comment above them says why. A
page starts loading as soon as its window exists, and its first request is for the app state
(`getState`). From here down to `registerIpc()`, `start()` never waits, so JavaScript runs it all
in one go and can't handle anything else in between, a page's request included. By the time a
page's request is handled, its handler has been registered.

- `createOverlayWindow('bubble', ...)`: creates a hidden, frameless, transparent, always-on-top
  window and starts loading the page into it (`bubble/windows.ts`, see
  [The bubble](5-bubble.md)). The bubble window is just big enough for the bubble; the panel
  window's size depends on how many action icons the tenant has (`panelWindowSize()`).
- `once(win, 'ready-to-show')`: Node's `once()` turns the next firing of an event into a promise.
  `ready-to-show` fires when a hidden window's page has painted for the first time. The listeners
  are attached as soon as the windows exist, because an event that fires before anyone is
  listening is lost and the promise would never resolve. `start()` waits for it at the very end.
- `broadcast`: sends a message to both pages. `webContents.send(channel, payload)` is how the
  main process pushes a message to a page (the page listens through the preload's `on...`
  functions, see [Shared code and the preload bridge](1-shared-and-preload.md)). `isDestroyed()`
  skips a window that has already been closed, which happens while quitting.

#### The bubble controller

<!-- code: apps/desktop/src/main/index.ts#start.bubble -->

[`src/main/index.ts`, lines 113–125](../../apps/desktop/src/main/index.ts#L113-L125)

```ts
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
```

<!-- /code -->

`BubbleController` is the bubble's state machine: it decides when the panel opens, where the
bubble sits, and moves and shows the windows to match (see [The bubble](5-bubble.md)). It never
touches Electron directly; everything it needs is passed in here.

- `bubbleSurface(bubbleWindow)`, `panelSurface(panelWindow)`: small adapters (in
  `bubble/windows.ts`) that give the controller just "set bounds, show, hide, focus" for each
  window.
- `displays: electronDisplays`: the adapter for Electron's `screen` module, defined further down
  this file ([`electronDisplays`](#toarea-and-electrondisplays)).
- `initialAnchor: settings.bubbleAnchor`: the corner and display the bubble was dragged to last
  time, or `null` the first time.
- `onModeChange`: every mode change (collapsed, expanded, dragging and so on) is broadcast, so the
  pages can animate to match.
- `onDiagnostic: (message) => log(message)`: the controller notes bubble clicks it ignored, and a
  blur it ignored just after opening, in the problem log (see [The bubble](5-bubble.md)).
- `onAnchorChange`: when the bubble settles in a new corner, the panel is told (it lays itself out
  to open away from that corner) and the new anchor is saved. `void` in front of a promise means
  "start this and don't wait for it"; it also tells the linter the missing `await` is deliberate.
- `controller = bubble` (the next line): makes the controller reachable from the module-level
  `second-instance` handler.
- `panelWindow.on('blur', () => bubble.panelBlurred())`: `blur` fires when the panel loses
  keyboard focus, for example when the user clicks another app. The controller then closes the
  panel (unless it has only just opened).

#### Screenshots

<!-- code: apps/desktop/src/main/index.ts#start.screenshots -->

[`src/main/index.ts`, lines 129–131](../../apps/desktop/src/main/index.ts#L129-L131)

```ts
const screenshots = new ScreenshotService(screenshotsDir, () =>
  screen.getDisplayMatching(bubbleWindow.getBounds()),
)
```

<!-- /code -->

- `screen.getDisplayMatching(bubbleWindow.getBounds())`: the screenshot service is given a
  function rather than a fixed display, so each capture takes the display the bubble is on at
  that moment.

#### The chat: built in, or in Claude Desktop

<!-- code: apps/desktop/src/main/index.ts#start.builtIn,claudeDesktop -->

[`src/main/index.ts`, lines 134–176](../../apps/desktop/src/main/index.ts#L134-L176)

```ts
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
```

<!-- /code -->

Where questions go is the tenant's `chatApp` (see [`CHAT_APPS`](#chat_apps)). Exactly one of
these two is created and the other stays `null`; everything after this point checks which one
exists.

- `const { chatApp, signIn, claudeAccess } = tenant` (the line before): the three settings that
  decide it. `signIn` and `claudeAccess` are optional in the schema.
- `chatApp === 'built-in' && signIn && claudeAccess`: the schema already refuses a built-in chat
  without `signIn` and `claudeAccess`, but TypeScript can't see that rule (it's a `.refine()`).
  Checking them here tells it they exist, so they can be passed on as definite values.
- `startBuiltInChat({`: creates the Claude backend, the conversation and the JumpCloud sign-in,
  and returns the two that the rest of the app talks to (see
  [`startBuiltInChat()`](#startbuiltinchat)). It isn't `async`, so nothing here waits, as the
  comment in [The two windows](#the-two-windows) requires.
- `new ClaudeDesktop({`: hands questions over to the Claude Desktop app (see
  [Claude Desktop](9-claude-desktop.md)). `ClaudeDesktop` knows nothing about Electron: the
  functions given to it here do the Electron and Windows work, which is what lets
  `tests/claudeDesktop.test.ts` replace them with fakes.
- `app.getApplicationNameForProtocol(NEW_CHAT_LINK) !== ''`: asks Windows which app opens
  `claude://` links. Claude Desktop registers itself for them when it's installed; with no app
  registered, Electron returns an empty string.
- `openLink: (url) => shell.openExternal(url)`: hands the `claude://` link to Windows, which opens
  it in Claude Desktop, the same way it opens a web link in the browser.
- `screenshots.forClipboard(paths)`: the attached screenshots as one image (several are stacked;
  see [The draft, screenshots and safe files](6-drafts-and-screenshots.md)). `null` means a file
  is missing, and `return false` makes `ClaudeDesktop` report `missing-screenshot`.
- `new Blob([image.toPNG()], { type: 'image/png' })`: the image encoded as PNG and wrapped in a
  `Blob` (a block of bytes labelled with its media type), which is what a clipboard item holds.
- `clipboard.write([new ClipboardItem({ 'image/png': png })])`: puts the image on the Windows
  clipboard, replacing whatever was there. This is Electron 44's clipboard API, modelled on the
  browser's; Electron 44 removed the older `clipboard.writeImage()`. `write()` returns a promise,
  hence the `await`.
- `autoSend: () => settings.get().autoSend`: the user's "Send in Claude automatically" setting. A
  function rather than a value, so each question uses the setting as it is at that moment.
- `sendInClaude: async (question, paste) => {`: presses Ctrl+V and Enter in Claude Desktop once it
  shows the question (`sendInClaude()` in `sendInClaude.ts`, see
  [Claude Desktop](9-claude-desktop.md)). The wrapper logs any outcome but `sent` ("Sending in
  Claude Desktop stopped: not-ready", say). As the comment says, that isn't a failure as such:
  the user gets a notification saying what's left to do. But it's worth having in the log if
  someone reports that questions aren't being sent.
- `notify: ({ title, body }) => {`: a Windows notification, used to say what's left to do in
  Claude: paste the screenshot, or press Enter. The panel can't say it, because it closes as
  Claude Desktop opens. `if (!Notification.isSupported()) return`: where Windows can't show
  notifications, nothing is shown.
- `notification.on('click', () => bubble.expand())`: as the comment says, Windows shows
  notifications in the bottom-right corner of the screen, which is where the bubble usually is.
  Someone reaching for the bubble can easily click the notification instead, so clicking it opens
  the panel, as the bubble would.
- `onError: (error) => log('Handing a question to Claude Desktop failed:', error)`: if copying or
  opening fails, the panel shows a short message; if the sending helper can't run, the user gets
  a notification. Either way the log gets the details.

Two statements follow:

- `if (!builtIn) {`, `void rm(join(userData, 'jumpcloud-session.bin'), ...)`: with Claude
  Desktop, a JumpCloud sign-in saved by the built-in chat (which Morse Micro used until 3.1) is no
  longer needed, so the file is deleted rather than left on disk.
- `void rm(join(userData, 'claude-api-key.bin'), { force: true }).catch(() => {})`: an earlier
  version saved a Claude API key in this file. Nothing uses it now, so it's deleted. `force: true`
  means "no error if it isn't there", and `.catch(() => {})` ignores any other failure. The
  JumpCloud file above is deleted the same way.

#### The Apps list

<!-- code: apps/desktop/src/main/index.ts#start.netFetch,appsStatus,portalApps -->

[`src/main/index.ts`, lines 177–202](../../apps/desktop/src/main/index.ts#L177-L202)

```ts
// Electron's fetch, so a proxy set in Windows is used.
const netFetch = (url: string | URL, init?: RequestInit) => net.fetch(String(url), init)

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
```

<!-- /code -->

The apps in the user's JumpCloud User Portal, which the panel opens on or shows behind the Apps
icon (see [Your apps](10-apps.md)). It's only set up when the tenant has a `portal`; otherwise
`portalApps` is `null` and the Apps channels aren't answered.

- `netFetch`: Electron's `net.fetch()`, in the shape of the standard `fetch()`. Electron's version
  goes through Chromium's network stack, so a proxy set up in Windows (common on company networks)
  is used, as it is in the browser. Node's own `fetch` would ignore it. `String(url)` because
  `net.fetch()` takes the address as text.
- `const { portal } = tenant` (the line before `appsStatus`): the portal settings from
  `tenant.json`, or `undefined`.
- `let appsStatus`: the list's previous status, for the same reason as `authState` in the built-in
  chat's sign-in: inside `onState`, the new one has already arrived.
- `mcpConnector({ serverUrl: portal.appsServer, ... })`: the real connection to JumpCloud's apps
  server, through the MCP SDK (`apps/mcp.ts`). `client` is how Desktop Assist introduces itself to
  the server: its name and version.
- `new SecretStore(join(userData, 'jumpcloud-apps.bin'), safeStorageEncryptor)`: where the
  connection to the portal (the app's registration and the user's tokens) is kept between runs,
  encrypted with Windows DPAPI like the built-in chat's sign-in, in a file of its own.
- `listen: (port) => listenForRedirect(port)`, `openBrowser: (url) => shell.openExternal(url)`:
  the same local web server and browser opening as the built-in chat's JumpCloud sign-in, on the
  portal's own port (`portal.redirectPort`).
- `fetchLogo: (url) => fetchLogo(netFetch, url)`: fetches an app's logo and turns it into a
  `data:` URL for the page.
- `broadcast(IPC.appsState, state)`: every change in the list's state goes to the pages.
- `if (appsStatus === 'signing-in' && state.status !== 'signing-in') bubble.expand()`: connecting
  sent the user to their browser. When it's finished (or failed), the panel opens again, so they
  see the list (or why not) without clicking the bubble.
- `onError: (message, error) => log(message, error)`: problems loading the list or connecting go
  to the problem log; the list shows its own short message.
- `void portalApps?.get()` (the next statement): starts loading the list in the background at
  startup, so it's ready when the panel first opens, which for Morse Micro is on the Apps list. As
  the comment says, it never opens the browser: without a saved connection it just settles on the
  Sign in button. `?.` skips it when there's no portal.

#### IPC, the tray and display changes

<!-- code: apps/desktop/src/main/index.ts#start.onDisplayChange -->

[`src/main/index.ts`, line 253](../../apps/desktop/src/main/index.ts#L253)

```ts
const onDisplayChange = () => bubble.displayChanged()
```

<!-- /code -->

Everything else in this part of `start()` is plain statements:

- `registerIpc({`: connects the pages' requests to the services (see
  [`registerIpc()`](#registeripc)). It's given both windows (only they may call in), every
  service, and `builtIn` and `claudeDesktop`, one of them `null`, so it only answers the channels
  of the chat in use.
- `apps: portal && portalApps ? { list: portalApps, portalUrl: portal.url } : null`: the Apps
  list and the portal's own address (for "Open the JumpCloud portal"), or `null` without a portal.
  Checking `portal` again lets TypeScript know `portal.url` exists.
- `uninstall: () => uninstall({`: Settings → Uninstall (see
  [`uninstall()`](#uninstall)). Everything it needs from Electron and Node is passed in: where the
  running `.exe` is (`app.getPath('exe')`), `existsSync` to check the uninstaller is there,
  turning off Start with Windows, and starting the uninstaller with
  `spawn(path, [], { detached: true, stdio: 'ignore' }).unref()`. `detached` runs it as a process
  of its own, `stdio: 'ignore'` connects nothing to it, and `unref()` tells Node not to wait for
  it, so it carries on after Desktop Assist has quit.
- `actions: createActionHandlers({ controller: bubble, screenshots, quit: () => app.quit() })`:
  the commands behind the Screenshot, Bounce and Close icons (`actions.ts`).
- `getState: () => ({`: builds the snapshot a page asks for when it first loads: the bubble's mode
  and corner, the draft, the settings, the branding, the app version (`app.getVersion()`, from
  `package.json`), the sign-in status and the chat so far. After that the page keeps up through
  the broadcasts above.
- `auth: builtIn?.auth.status ?? null`, `chat: builtIn?.chat.list() ?? []`: `?.` reads on only if
  `builtIn` isn't `null` (otherwise the whole expression is `undefined`), and `??` gives the value
  to use instead. So with Claude Desktop there's no sign-in status (`null`) and the chat is always
  empty: the panel shows just the text box.
- `tray = createTray({`: adds the icon in the notification area. `onOpen` opens the panel and
  `onQuit` quits (see [`createTray()`](#createtray)).
- `screen.on('display-added', onDisplayChange)`: the same handler also runs for
  `display-removed` and `display-metrics-changed` (a resolution, scaling or taskbar change).
  `BubbleController.displayChanged()` moves the bubble back into its corner, or onto the main
  display if its own display was unplugged.

#### Quitting

<!-- code: apps/desktop/src/main/index.ts#start.shuttingDown -->

[`src/main/index.ts`, lines 258–259](../../apps/desktop/src/main/index.ts#L258-L259)

```ts
// Save the text box before quitting. before-quit fires again after the second app.quit().
let shuttingDown = false
```

<!-- /code -->

The `app.on('before-quit', (event) => {` handler that follows makes sure the draft reaches the
disk before the app closes. `before-quit` fires when something calls `app.quit()`: the tray's
Quit or the Close icon. It doesn't fire when Windows shuts down or logs off, which is what the
`session-end` handler at the end is for.

- `if (shuttingDown) return`: the handler ends by calling `app.quit()` again, which fires
  `before-quit` a second time. This flag lets that second one through.
- `event.preventDefault()`: cancels this first quit, to make time for the steps below.
- `bubble.dispose()`, `builtIn?.chat.stop()`: stops the bubble's animation timers and, with the
  built-in chat, aborts a reply that is still streaming.
- `void portalApps?.dispose()`: closes the Apps list's connection to JumpCloud, and stops waiting
  for a browser sign-in if one is under way.
- `tray?.destroy()`: removes the tray icon now. Otherwise it can linger in the tray until the
  mouse passes over it.
- `Promise.race([notes.flush(), timeout])`: waits for the draft to be written, or
  `SHUTDOWN_TIMEOUT_MS` (2 seconds), whichever comes first, so a stuck disk can't stop the app
  from closing. `.finally(() => app.quit())` then quits for real.
- `panelWindow.on('session-end', () => notes.flushSync())`: when Windows logs off or shuts down,
  it doesn't wait for asynchronous work, so `session-end` (a Windows-only window event) saves the
  draft with a blocking write instead.

Finally, `await windowsReady` waits until both pages have painted, and `bubble.start()` puts the
bubble in its corner and shows it. Waiting avoids showing a window before its page has drawn
anything.

### `startBuiltInChat()`

The built-in chat: Claude in the panel, reached through the Claude API with the user's JumpCloud
sign-in. `start()` calls it only when the tenant's `chatApp` is `built-in`; with Claude Desktop
none of this is created.

Its one parameter, `deps`, holds what it needs from `start()`: the `tenant` (for the system
prompt), its `signIn` and `claudeAccess` settings (passed separately because here they're known to
exist), the `userData` folder, the `settings` service, the problem `log`, `broadcast` and the
`bubble` controller. The first line takes them all out of `deps` again
(`const { tenant, signIn, claudeAccess, ... } = deps`), so the code below reads as it did when it
was part of `start()`. It returns a [`BuiltInChat`](#builtinchat): the `AuthManager` and the
`ChatSession`, which `registerIpc()` and `getState` use.

#### Claude

<!-- code: apps/desktop/src/main/index.ts#startBuiltInChat.devBaseUrl,lastIdToken,backend,chat -->

[`src/main/index.ts`, lines 294–318](../../apps/desktop/src/main/index.ts#L294-L318)

```ts
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
```

<!-- /code -->

- `devBaseUrl`: lets a dev run send Claude requests to a local mock server named in
  `ANTHROPIC_BASE_URL`. An installed build ignores the variable, so it can't be redirected.
- `let lastIdToken`: a summary of the last JumpCloud ID token handed to Anthropic, kept only so it
  can be logged if Anthropic refuses it. It's `null` until the first message is sent, and
  `{ error: string }` if the token couldn't be decoded.
- `identityToken: async () => {`: how `AnthropicBackend` gets a JumpCloud ID token to swap for
  Claude access (see [Talking to Claude](4-claude.md)). It gets a new token from
  `auth.freshIdToken()` and hands it on unchanged.
- `const token = await auth.freshIdToken()`: `auth` is only declared further down. That's fine
  because this function only runs later, when the first message is sent, by which time `auth`
  exists. Calling it any earlier would throw.
- `lastIdToken = summarizeIdToken(token)`: records what the token says (who issued it, its
  audience, its lifetime, which claims it has) without the token itself, which could be swapped
  for Claude access. `summarizeIdToken()` is in `auth/idToken.ts` (see
  [JumpCloud sign-in](3-sign-in.md)).
- `canChat: () => auth.canChat`, `getEffort: () => settings.get().effort`: functions rather than
  values, so `ChatSession` reads the current sign-in and the current Fast/Balanced/Thorough choice
  each time it sends.
- `system: buildSystemPrompt(tenant)`: the system prompt (Claude's standing instructions), built
  once from the app name, company name and any extra `systemPrompt` in `tenant.json`.
- `onMessage`, `onReset`: each new or changed chat message, and "New conversation", are broadcast
  to the pages.
- `log('Claude request failed:', error)`: the chat itself shows a plain-English message; the log
  gets the full error, including the status code and request ID.
- `if (classifyError(error) === 'not-allowed')`: `classifyError()` (in `claude/errors.ts`) sorts
  errors by what they mean for the user. `not-allowed` means Anthropic refused to swap the
  JumpCloud token for Claude access. The token summary is then logged too, so it can be compared
  with the federation rule in the Claude Console.
- This logging was added to track down a real refusal. It had two causes: `tenant.json` held the
  claude.ai organization ID instead of the Claude Console one, and the federation rule had no
  expected audience. Without one, Anthropic requires the token's audience (`aud`) to be
  `https://api.anthropic.com`, which JumpCloud ID tokens never have; the rule's audience must be
  the JumpCloud client ID.

#### Sign-in

<!-- code: apps/desktop/src/main/index.ts#startBuiltInChat.missing,localIssuer,authState,auth -->

[`src/main/index.ts`, lines 320–344](../../apps/desktop/src/main/index.ts#L320-L344)

```ts
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
```

<!-- /code -->

`AuthManager` owns the JumpCloud sign-in (see [JumpCloud sign-in](3-sign-in.md)). JumpCloud is
an _OpenID Connect_ (OIDC) provider: a standard way for an app to sign users in through the
company's identity service in the browser.

- `missingSettings(signIn, claudeAccess)`: the IDs still blank in `tenant.json`. If any are
  missing, `oidc` is `null` and the chat box lists what IT still has to fill in instead of
  offering to sign in.
- `localIssuer`: OIDC normally requires `https`. A dev run pointed at a test identity provider on
  this PC (`isLoopback()`) may use plain `http`; `createOidc(..., { allowInsecure })` passes that
  on to the OIDC library.
- `let authState`: the previous sign-in state. Inside `onStatus`, `auth.status` already holds the
  new state, so the old one has to be remembered here.
- `new SecretStore(join(userData, 'jumpcloud-session.bin'), safeStorageEncryptor)`: where the
  sign-in is kept between runs, encrypted with
  [`safeStorageEncryptor`](#safestorageencryptor).
- `listen: (port) => listenForRedirect(port)`: starts the small web server on `127.0.0.1` that the
  browser returns to after sign-in. `openBrowser: (url) => shell.openExternal(url)` opens the
  JumpCloud page in the user's default browser.
- `if (status.state === 'signed-in' && authState === 'signing-in') bubble.expand()`: signing in
  sent the user to their browser. When it completes, the panel opens again so they can carry on
  chatting. Renewing at startup goes from `checking` to `signed-in`, so it doesn't pop the panel
  open.
- `backend.reset()`: whenever nobody is signed in any more, `AnthropicBackend` drops its Claude
  client and the Claude token it holds, so nothing from the old sign-in is reused.
- `if (reason === 'logout') chat.newConversation()`: Log out clears the chat. If the sign-in
  merely expired, the conversation stays so the user can sign back in and press Retry.
- `onError: (error) => log('JumpCloud sign-in failed:', error)`: a failed sign-in or renewal goes
  to the problem log; the chat box shows its own short message.

Two statements end the function:

- `void auth.init()`: loads the saved sign-in and renews it with JumpCloud. It isn't awaited, so
  the windows appear while that happens; the result reaches the pages through `onStatus`. Waiting
  for it would make this function `async`, and `start()` would then let a page's request in
  before `registerIpc()` has run.
- `return { auth, chat }`: the two services the IPC handlers and `getState` need. The backend
  stays inside: only `chat` and `onSignedOut` use it.

### `safeStorageEncryptor`

<!-- code: apps/desktop/src/main/index.ts#safeStorageEncryptor -->

[`src/main/index.ts`, lines 350–355](../../apps/desktop/src/main/index.ts#L350-L355)

```ts
/** Windows DPAPI through Electron: only this Windows user can decrypt what it encrypts. */
const safeStorageEncryptor: Encryptor = {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: (text) => safeStorage.encryptString(text),
  decrypt: (data) => safeStorage.decryptString(data),
}
```

<!-- /code -->

The encryption `SecretStore` uses for the saved sign-in. `SecretStore` only knows the small
`Encryptor` interface (so the tests can give it a fake); this object fills it in with Electron's
`safeStorage`.

- `safeStorage`: Electron's API for encrypting strings with the operating system's own
  protection. On Windows that's _DPAPI_, which ties the encrypted data to the signed-in Windows
  user, so another user of the same PC can't decrypt it.
- `isAvailable`: `safeStorage` only works once the app is ready. Nothing calls these methods
  before then, because the `SecretStore` is created inside `startBuiltInChat()`, which `start()`
  calls.

### `withDevOverrides()`

<!-- code: apps/desktop/src/main/index.ts#withDevOverrides -->

[`src/main/index.ts`, lines 357–376](../../apps/desktop/src/main/index.ts#L357-L376)

```ts
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
```

<!-- /code -->

Returns the tenant config to use. In an installed build, or when `DESKTOP_ASSIST_DEV_CONFIG`
isn't set, that's simply `tenant.json`. In a dev run, the JSON file named by that variable can
replace where chats happen (`chatApp`) and some of the sign-in and Claude access settings, for
example to try the built-in chat against a test identity provider, without editing `tenant.json`.

- `return tenant`: no override file, so the tenant is used as it is.
- `DevOverrideSchema.parse(JSON.parse(await readFile(path, 'utf8')))`: the file is checked
  against [`DevOverrideSchema`](#devoverrideschema), in which every field is optional.
- `override.chatApp ?? tenant.chatApp`: the override's choice if it has one, otherwise the
  tenant's.
- `override.signIn ? { ...tenant.signIn, ...override.signIn } : tenant.signIn`: `...` copies an
  object's properties, and later ones win, so the override's fields replace the tenant's. The
  merge only happens when the override has a `signIn`; a Claude Desktop tenant without one keeps
  having none, rather than an empty object. `portal` and `claudeAccess` work the same way, so a
  dev run can point the Apps list at a test server. `startPage` is replaced like `chatApp`.
- `TenantSchema.parse({`: the result is checked again as a whole tenant, so an override can't
  produce an invalid config. For example, switching to the built-in chat without sign-in settings
  fails here, and the app shows the error instead of starting.

### `isLoopback()`

<!-- code: apps/desktop/src/main/index.ts#isLoopback -->

[`src/main/index.ts`, lines 378–380](../../apps/desktop/src/main/index.ts#L378-L380)

```ts
function isLoopback(url: URL): boolean {
  return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
}
```

<!-- /code -->

Whether a URL points at this PC. The three names are the IPv4 address, the usual name and the
IPv6 address for "this machine"; the URL parser keeps the square brackets around IPv6 addresses
in `hostname`. Used only to decide whether plain `http` is allowed for a dev identity provider.

### `toArea` and `electronDisplays`

<!-- code: apps/desktop/src/main/index.ts#toArea,electronDisplays -->

[`src/main/index.ts`, lines 382–396](../../apps/desktop/src/main/index.ts#L382-L396)

```ts
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
```

<!-- /code -->

The adapter between Electron's `screen` module and the `Displays` interface `BubbleController`
uses (see [The bubble](5-bubble.md)). Keeping Electron behind this small interface is what lets
`tests/bubbleController.test.ts` run the controller with two fake displays.

- `toArea`: keeps only what the controller needs from a display: its ID and its work area (the
  screen minus the taskbar).
- `DIPs`: device-independent pixels. On a display scaled to 150%, one DIP is 1.5 physical pixels.
  Electron's window positions and display sizes are all in DIPs, so the controller never has to
  think about scaling.
- `return display && toArea(display)`: if no display has that ID any more (it was unplugged),
  this returns `undefined` rather than throwing.
- `Math.round(point.x)`: the bubble's position can be fractional while it animates, but this
  Electron call takes whole numbers.
- `screen.getCursorScreenPoint()`: where the mouse pointer is, used while dragging the bubble.

These are defined at module level, before the app is ready, but `screen` is only touched when a
method is called, which happens after `start()` has begun.

### `fail()`

<!-- code: apps/desktop/src/main/index.ts#fail -->

[`src/main/index.ts`, lines 398–402](../../apps/desktop/src/main/index.ts#L398-L402)

```ts
function fail(error: unknown): void {
  console.error(error)
  dialog.showErrorBox('Desktop Assist could not start', String(error))
  app.exit(1)
}
```

<!-- /code -->

Shows a plain error box and exits. It's the `.catch()` of `app.whenReady().then(start)`, so it
runs for any error during startup: an invalid `tenant.json`, an unreadable dev override file or
preferences file, and so on. Errors after `start()` has finished don't come here.

- `dialog.showErrorBox(...)`: a simple, blocking message box. Unlike most dialogs, Electron allows
  it before the app is ready.
- `app.exit(1)`: quits immediately with exit code 1, closing any windows already created and
  without firing `before-quit`. There's nothing to save yet, and an app that half-started would
  otherwise keep running with nothing on screen.

## `src/main/log.ts`: the problem log

A small log of problems, written to `%APPDATA%\Desktop Assist\logs\desktop-assist.log` (in a dev
run, the `Desktop Assist (Dev)` folder) and printed to the terminal as well. An installed copy has
no terminal, so without this file there would be no way to see why something failed on a user's
PC, for example why Anthropic refused their sign-in. `start()` in `index.ts` creates the one log
and gives it to the error callbacks of `NotesStore`, `ClaudeDesktop` and `PortalApps`, the
uninstaller and the bubble controller's notes, or of `ChatSession` and `AuthManager` with the
built-in chat. It's never given tokens, only errors and summaries such as
the ID token summary.

### `MAX_LOG_BYTES` and `Log`

<!-- code: apps/desktop/src/main/log.ts#MAX_LOG_BYTES,Log -->

[`src/main/log.ts`, lines 4–7](../../apps/desktop/src/main/log.ts#L4-L7)

```ts
/** When the log passes this size it's moved to `<name>.old` and a new one is started. */
const MAX_LOG_BYTES = 1_000_000

export type Log = (message: string, detail?: unknown) => void
```

<!-- /code -->

- `MAX_LOG_BYTES = 1_000_000`: about 1 MB. Past that, the file is renamed to
  `desktop-assist.log.old` (replacing any older one) and a new log is started, so the two files
  together stay around 2 MB at most.
- `type Log = (message: string, detail?: unknown) => void`: the type of a function. Callers pass a
  short message and, optionally, the thing that went wrong (usually an error).

### `createLog()`

<!-- code: apps/desktop/src/main/log.ts#createLog -->

[`src/main/log.ts`, lines 9–25](../../apps/desktop/src/main/log.ts#L9-L25)

```ts
/**
 * A small log file for problems (and the terminal, in dev runs), so an installed copy, which has
 * no terminal, can still be diagnosed. Never pass it tokens: only errors and summaries.
 */
export function createLog(path: string): Log {
  return (message, detail) => {
    const line = `${new Date().toISOString()} ${message}${detail === undefined ? '' : ` ${describe(detail)}`}`
    console.error(line)
    try {
      mkdirSync(dirname(path), { recursive: true })
      if (sizeOf(path) > MAX_LOG_BYTES) renameSync(path, `${path}.old`)
      appendFileSync(path, `${line}\n`)
    } catch {
      // Logging must never break the app.
    }
  }
}
```

<!-- /code -->

Returns the logging function for one file. The returned function remembers `path` (a _closure_),
so callers only ever pass the message and detail.

- `new Date().toISOString()`: each line starts with the time, in UTC (for example
  `2026-10-08T09:15:00.000Z`), then the message, then the detail as described by
  [`describe()`](#describe).
- `console.error(line)`: the same line in the terminal, for dev runs.
- `mkdirSync(dirname(path), { recursive: true })`: creates the `logs` folder if it isn't there.
  The file calls are synchronous (the `...Sync` versions), which keeps this simple; the log is
  only written when something goes wrong, so the short pause doesn't matter.
- `if (sizeOf(path) > MAX_LOG_BYTES) renameSync(path, ...)`: checked before every line. Renaming
  onto an existing `.old` file replaces it.
- `catch`: as the comment says, logging must never break the app. If the disk is full or the file
  is locked, that line is simply lost (it was still printed to the terminal).

### `sizeOf()`

<!-- code: apps/desktop/src/main/log.ts#sizeOf -->

[`src/main/log.ts`, lines 27–33](../../apps/desktop/src/main/log.ts#L27-L33)

```ts
function sizeOf(path: string): number {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}
```

<!-- /code -->

The log file's size in bytes. `statSync` throws if the file doesn't exist yet, which counts as 0.

### `describe()`

<!-- code: apps/desktop/src/main/log.ts#describe -->

[`src/main/log.ts`, lines 35–63](../../apps/desktop/src/main/log.ts#L35-L63)

```ts
/** An error with the details that matter (status, request ID, response body, cause), or JSON. */
export function describe(detail: unknown): string {
  if (detail instanceof Error) {
    const extra = detail as Error & {
      status?: unknown
      statusCode?: unknown
      requestID?: unknown
      requestId?: unknown
      body?: unknown
      error?: unknown
    }
    const fields = {
      status: extra.status ?? extra.statusCode,
      requestId: extra.requestID ?? extra.requestId,
      // A refused sign-in swap keeps Anthropic's answer in `body`; other API errors in `error`.
      body: extra.body ?? extra.error,
    }
    const known = Object.entries(fields).filter(([, value]) => value != null)
    const parts = [`${detail.name}: ${detail.message}`]
    if (known.length) parts.push(JSON.stringify(Object.fromEntries(known)))
    if (detail.cause !== undefined) parts.push(`(cause: ${describe(detail.cause)})`)
    return parts.join(' ')
  }
  try {
    return JSON.stringify(detail)
  } catch {
    return String(detail)
  }
}
```

<!-- /code -->

Turns the `detail` into one line of text. Errors need special handling: `JSON.stringify` of an
`Error` gives `{}`, because its message and name aren't the kind of property JSON includes.

- `detail as Error & {`: tells TypeScript the error may also have these extra fields, so they can
  be read. `&` combines two types.
- `extra.status ?? extra.statusCode`, `extra.requestID ?? extra.requestId`: libraries name these
  differently. The Anthropic SDK's API errors have `status` and `requestID`. Its error for a
  refused token swap has `statusCode`, `requestId` and `body` (Anthropic's response, which says
  why it refused). Taking whichever exists covers both. The request ID is what Anthropic support
  needs to find a request.
- `body: extra.body ?? extra.error`: Anthropic's response to the failed request. The refused-swap
  error keeps it in `body`; the SDK's other API errors keep it in `error` (for example
  `{"type":"error","error":{"type":"rate_limit_error",…}}`), so either is logged.
- `value != null`: `!=` (rather than `!==`) is false for both `null` and `undefined`, so fields
  the error doesn't have are left out.
- `JSON.stringify(Object.fromEntries(known))`: the fields found, as JSON, for example
  `{"status":401,"requestId":"req_…"}`.
- `describe(detail.cause)`: an error can carry the error that caused it in `cause`. The Anthropic
  SDK wraps sign-in errors this way, so the cause is described too (and its cause, and so on,
  since `describe()` calls itself).
- `return JSON.stringify(detail)`: anything that isn't an error, such as the ID token summary, is
  written as JSON. `JSON.stringify` throws for some values (an object that refers to itself, for
  example), and `String(detail)` is used instead.

## `src/main/ipc.ts`: handling requests from the pages

_IPC_ (inter-process communication) is how the pages, which run in separate renderer processes,
ask the main process to do things. The preload script gives each page `window.assist`, whose
functions send messages on named channels (listed in `src/shared/ipc.ts`; see
[Shared code and the preload bridge](1-shared-and-preload.md)). This file registers the main
process's answer to every channel.

Two rules apply to every request: it must come from one of the app's own two windows, and its
argument must pass a _zod schema_. zod is a validation library: a schema describes the shape a
value must have (a string of at most so many characters, one of three words, and so on), and
`schema.parse(value)` returns the value if it matches or throws if it doesn't. The pages are
trusted code, but checking at this boundary means a bug or an injected script in a page can't
send the main process something unexpected.

Only the channels of the features in use are answered. With the built-in chat, the sign-in and
chat channels have handlers; with Claude Desktop, the two `claudeDesktop...` channels do instead.
The Apps list's channels are answered only when the tenant has a portal.

### `BuiltInChat`

<!-- code: apps/desktop/src/main/ipc.ts#BuiltInChat -->

[`src/main/ipc.ts`, lines 24–28](../../apps/desktop/src/main/ipc.ts#L24-L28)

```ts
/** The built-in chat and the JumpCloud sign-in it needs. */
export interface BuiltInChat {
  auth: AuthManager
  chat: ChatSession
}
```

<!-- /code -->

The two services of the built-in chat that the handlers call: `AuthManager` (the JumpCloud
sign-in, see [JumpCloud sign-in](3-sign-in.md)) and `ChatSession` (the conversation, see
[Talking to Claude](4-claude.md)). [`startBuiltInChat()`](#startbuiltinchat) in `index.ts`
creates them and returns them in this shape. Keeping them together means there is no state in
which one exists without the other.

### `IpcContext`

<!-- code: apps/desktop/src/main/ipc.ts#IpcContext -->

[`src/main/ipc.ts`, lines 30–47](../../apps/desktop/src/main/ipc.ts#L30-L47)

```ts
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
```

<!-- /code -->

Everything the handlers need, passed in by `start()` in `index.ts`. The main process's services
are created there, so this file only needs their types, not how to build them.

- `windows: BrowserWindow[]`: the bubble and panel windows; requests from any other page are
  refused.
- `builtIn: BuiltInChat | null`, `claudeDesktop: ClaudeDesktop | null`: where questions go.
  Exactly one of the two is set, depending on the tenant's `chatApp` (see
  [The chat: built in, or in Claude Desktop](#the-chat-built-in-or-in-claude-desktop)).
- `apps: { list: PortalApps; portalUrl: string } | null`: the Apps list, and the portal's address
  for "Open the JumpCloud portal"; `null` when the tenant has no portal.
- `uninstall(): UninstallResult`: Settings → Uninstall, ready-wired in `start()`.
- `getState(): AppState`: builds the full snapshot a page asks for when it first loads (defined
  in `start()`).

### `NoArgs`, `FilePath` and `ExternalUrl`

<!-- code: apps/desktop/src/main/ipc.ts#NoArgs,FilePath,ExternalUrl -->

[`src/main/ipc.ts`, lines 49–61](../../apps/desktop/src/main/ipc.ts#L49-L61)

```ts
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
```

<!-- /code -->

Schemas used by several channels.

- `z.undefined()`: for channels that take no argument. `ipcRenderer.invoke(channel)` with no
  argument arrives as `undefined`; anything else is rejected.
- `FilePath`: only checks for a sensible string. The real check, that the file is inside the
  screenshots folder, is done by `ScreenshotService` (`owns()`).
- `.refine(...)`: adds a custom check to a schema. Here the string must parse as a URL and use
  `http:`, `https:` (opened in the browser) or `mailto:` (opened in the email app), so a link in a
  Claude reply can't open a local file (`file:`), run script (`javascript:`) or launch another
  program through its own URL scheme. `new URL()` throws for
  text that isn't a URL, hence the `try`/`catch`.

### `registerIpc()`

<!-- code: apps/desktop/src/main/ipc.ts#registerIpc -->

[`src/main/ipc.ts`, lines 63–194](../../apps/desktop/src/main/ipc.ts#L63-L194)

```ts
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
```

<!-- /code -->

Registers a handler for every channel the app uses, once, at startup. The first part sets up a
sender check and two helpers; the rest is one line (or a few) per channel, grouped by area. The
channels of the two kinds of chat are registered by two inner functions, `registerClaudeDesktop()`
and `registerBuiltInChat()`, and only one of them runs.

**The sender check and the two helpers**

- `trusted`: whether a message came from one of the app's two windows. `event.sender` is the
  _WebContents_ (Electron's object for the page inside a window) that sent it, and each one has a
  unique `id`. The windows already refuse to open other pages or navigate away
  (`bubble/windows.ts`), so this is a second line of defence.
- `function handle<S extends z.ZodType, R>(`: for request-and-reply channels, which the page
  calls with `ipcRenderer.invoke()` and gets a promise back. `S` and `R` are _type parameters_:
  `S` is the schema's type and `R` the result's, so each call is type-checked against its schema.
- `z.output<S>`: the TypeScript type a schema produces, so `run` receives a correctly typed
  argument.
- `throw new Error(...)`, `schema.parse(raw)`: when a handler throws (an untrusted sender, or an
  argument that fails the schema), Electron rejects the page's promise with the error message.
- `function on<S extends z.ZodType>(`: for one-way messages, which the page sends with
  `ipcRenderer.send()` and gets nothing back. These are the frequent ones (clicks, every
  keystroke, the pointer moving). With no reply to carry an error, a bad message is simply
  dropped (`safeParse` checks without throwing).

**The bubble and the windows**

- `handle(IPC.getState, ...)`: the snapshot each page loads at startup.
- `IPC.bubbleClick`, `IPC.bubbleDragStart`, `IPC.bubbleDragEnd`, `IPC.collapse`: forwarded to the
  matching `BubbleController` methods.
- `setIgnoreMouseEvents(!interactive, { forward: true })`: click-through for the panel. While the
  pointer is over a see-through area, the page asks for mouse input to be ignored, so clicks go to
  the window underneath; `forward: true` keeps sending pointer movement to the page so it can
  tell when the pointer comes back over real UI. `BrowserWindow.fromWebContents()` finds the
  window that sent the message.

**Actions, links and the clipboard**

- `z.enum(COMMAND_ACTION_IDS)`: only the `command` actions (Screenshot, Bounce, Close) are
  accepted. `ctx.actions[id]()` runs the matching handler from `actions.ts` and returns its
  result, which the panel shows as a toast. The Settings icon is a `popover` action that never
  leaves the page.
- `shell.openExternal(url)`: opens a link from a Claude reply (or the Claude Desktop download
  page) in the default browser, after `ExternalUrl` has checked it (an email link opens the email
  app instead).
- `z.string().max(1_000_000)`: the text of a chat message whose Copy button was pressed, capped
  at a million characters (`_` is just a digit separator). `clipboard.writeText` puts it on the Windows clipboard.

**The draft**

- `on(IPC.notesSetText, ...)`: sent on every keystroke, so it's one-way. The length cap matches
  what `NotesStore` keeps (`MAX_NOTE_LENGTH`).
- `IPC.notesAttachLatest`: finds the newest screenshot in the folder and attaches it to the draft.
  It answers `no-screenshots` if there are none and `already-attached` if `addAttachment()`
  returns `null` because that file is already attached.
- `z.string().min(1).max(64)`: an attachment ID (a UUID, 36 characters).
- `IPC.notesClear`: empties the text box and removes its screenshots (Clear text box in the
  Settings menu, with Claude Desktop). It returns the empty draft, which the panel shows.

**Screenshots and settings**

- `IPC.screenshotThumbnail`, `IPC.screenshotOpen`, `IPC.screenshotsOpenFolder`: a small preview
  for a chip, opening a screenshot in the default image viewer, and opening the folder. The two
  that take a path refuse one outside the screenshots folder.
- `IPC.settingsGet`, `IPC.settingsSetAutoStart`, `IPC.settingsSetEffort`,
  `IPC.settingsSetAutoSend`: the Settings menu. Each returns the full, current settings, so the
  menu always shows what actually took effect. (The menu offers the response style only with the
  built-in chat, and "Send in Claude automatically" only with Claude Desktop.)

**Uninstall**

- `handle(IPC.appUninstall, NoArgs, () => ctx.uninstall())`: Settings → Uninstall. On success the
  app is already quitting.

**Built-in chat, Claude Desktop and the Apps list**

- `if (ctx.claudeDesktop) registerClaudeDesktop(ctx.claudeDesktop)`,
  `if (ctx.builtIn) registerBuiltInChat(ctx.builtIn)`: `start()` sets exactly one of the two, so
  only that chat's channels get handlers. If a page called one of the other chat's channels
  anyway, Electron would reject its promise, because nothing is registered for it.
- `if (ctx.apps) registerApps(ctx.apps)`: the same for the Apps list, when there's a portal.
- `function registerClaudeDesktop(...)`, `function registerBuiltInChat(...)`: declared inside
  `registerIpc()`, so they can use `handle()` and `ctx`. `registerApps()` too. They're called above
  the lines that declare them, which works because JavaScript sets up a block's `function`
  declarations before running it (this is called _hoisting_).

**Claude Desktop** (`registerClaudeDesktop()`)

- `IPC.claudeDesktopInstalled`: whether Claude Desktop is installed, which the panel asks each
  time it opens.
- `handle(IPC.claudeDesktopAsk, ...)`: hands the draft to Claude Desktop (see
  [`ClaudeDesktop.ask()`](9-claude-desktop.md)): the text from the box plus the screenshots
  attached to the draft. The length cap is the draft's own; `ask()` applies Claude Desktop's
  lower limit itself and answers `too-long`.
- `if (!result.ok) return result`: a failure (`empty`, `too-long`, `not-installed`,
  `missing-screenshot` or `failed`) goes straight back to the panel, which shows a toast. The
  draft is kept.
- `ctx.controller.collapse()`: on success Claude Desktop comes to the front with the question, so
  the panel closes to get out of its way. `ask()` returns as soon as Claude is opening, so this
  happens straight away; sending the question in Claude carries on in the background.
- `{ ...result, notes: ctx.notes.clear() }`: the outcome (including how many screenshots were
  copied) plus the emptied draft, so the text box clears, as after sending in the built-in chat.

**The Apps list** (`registerApps()`)

- `({ list, portalUrl }: NonNullable<IpcContext['apps']>)`: `IpcContext['apps']` is the type of
  that field, and `NonNullable<...>` the same without `null`, since this only runs when there is a
  portal.
- `handle(IPC.appsGet, z.boolean(), (refresh) => list.get(refresh))`: the list, loading it if
  needed. The preload always sends `true` or `false`.
- `() => void list.signIn()`: connecting happens in the browser and can take minutes, so, as with
  the built-in chat's sign-in, the call returns at once and progress arrives as `IPC.appsState`
  broadcasts. No token ever reaches the page.
- `z.string().min(1).max(200)`: an app's ID from the list.
- `if (opened) ctx.controller.collapse()`: the app is opening in the browser, which comes to the
  front, so the panel closes. If there was no link, the panel stays and shows a toast.
- `shell.openExternal(portalUrl)`: "Open the JumpCloud portal" opens the portal's address from
  `tenant.json` (never one sent by the page), then closes the panel.

**Sign-in** (`registerBuiltInChat()`)

- `({ auth, chat }: BuiltInChat)`: the parameter is unpacked straight away into its two
  services, so the handlers below can say `auth` and `chat`.
- `() => void auth.signIn()`: signing in happens in the browser and can take minutes. `void`
  discards the promise, so the page's call returns at once; progress arrives as `IPC.authStatus`
  broadcasts. Retry works the same way.
- `auth.cancelSignIn()`: stops waiting for the browser (it closes the local listener).
- No handler returns a token: the pages only ever see the status and the user's name.

**Chat** (`registerBuiltInChat()`)

- `handle(IPC.chatSend, ...)`: sends the text plus the screenshots attached to the draft.
- `if (chat.busy) return { ok: false, reason: 'busy' }`: checked first so the screenshots
  aren't processed for nothing while a reply is still streaming.
- `ctx.screenshots.forClaude(attachment.path)`: shrinks each attached screenshot and encodes it as
  JPEG for Claude. If any file has gone missing, nothing is sent and the panel shows a toast.
- `chat.send(text, images, draft.attachments)`: starts the reply and returns straight away
  (it streams in through `IPC.chatMessage`). Anything but `'sent'` (`busy`, `empty`,
  `signed-out`) is passed back as the reason.
- `{ ok: true, notes: ctx.notes.clear() }`: on success the draft is emptied, and the empty draft
  is returned so the text box clears.
- `IPC.chatStop`, `IPC.chatRetry`, `IPC.chatNew`: Stop, Retry and New conversation, passed
  straight to `ChatSession`.

## `src/main/actions.ts`: the action icons' commands

The action icons above the bubble come from a registry in `src/shared/actions.ts`. Each action
is either a `popover` (opens UI inside the panel, handled entirely by the page) or a `command`
(runs in the main process). This file has the main-process side of the commands.

### `ActionHandlers` and `createActionHandlers()`

<!-- code: apps/desktop/src/main/actions.ts#ActionHandlers,createActionHandlers -->

[`src/main/actions.ts`, lines 6–33](../../apps/desktop/src/main/actions.ts#L6-L33)

```ts
export type ActionHandlers = Record<CommandActionId, () => Promise<ActionResult>>

/** Main-process handlers for the `command` actions in the registry (src/shared/actions.ts). */
export function createActionHandlers(deps: {
  controller: BubbleController
  screenshots: ScreenshotService
  quit: () => void
}): ActionHandlers {
  return {
    async screenshot() {
      try {
        await deps.controller.whileHidden(() => deps.screenshots.capture())
        return { ok: true, message: 'Screenshot saved' }
      } catch (error) {
        console.error('Screenshot failed', error)
        return { ok: false, message: "Couldn't take a screenshot" }
      }
    },
    async bounce() {
      deps.controller.startBounce()
      return { ok: true }
    },
    async close() {
      deps.quit()
      return { ok: true }
    },
  }
}
```

<!-- /code -->

`createActionHandlers()` returns one async function per command action. `start()` in
`index.ts` creates them, and `registerIpc()` runs one when the page sends
`IPC.invokeAction`. The `{ ok, message }` each returns is shown by the panel as a toast.

- `Record<CommandActionId, () => Promise<ActionResult>>`: `Record<K, V>` is a TypeScript type for
  an object with a `V` under every key in `K`. `CommandActionId` is the list of command actions
  (`'screenshot' | 'bounce' | 'close'`), so if a new command is added to the registry, this file
  won't compile until it has a handler.
- `deps.controller.whileHidden(() => deps.screenshots.capture())`: hides both windows, waits for
  Windows to repaint the area under them, takes the screenshot, then brings the panel back. This
  way the app isn't in its own screenshot.
- `catch (error)`: any failure (including `whileHidden()` refusing because the panel isn't open)
  becomes a friendly message; the details go to the log.
- `async bounce()`: starts the bubble bouncing around the screen. It's `async` only so that it
  fits the type: every handler returns a promise.
- `deps.quit()`: `app.quit()`, which goes through the `before-quit` handler in `index.ts`, so the
  draft is saved first.

## `src/main/uninstall.ts`: uninstalling

Settings → **Uninstall Desktop Assist** removes the app from the PC without a trip to Windows
Settings. The installer (electron-builder's NSIS installer, see `electron-builder.cjs`) puts an
uninstaller next to the app's `.exe`; this file finds it, starts it, and quits so it can delete
the app's files. Everything that touches Windows is passed in, so `tests/uninstall.test.ts`
checks it with fakes. `start()` in `index.ts` wires it up (see
[IPC, the tray and display changes](#ipc-the-tray-and-display-changes)), and the settings menu
calls it through `IPC.appUninstall`.

### `UninstallDeps` and `uninstallerPath()`

<!-- code: apps/desktop/src/main/uninstall.ts#UninstallDeps,uninstallerPath -->

[`src/main/uninstall.ts`, lines 4–23](../../apps/desktop/src/main/uninstall.ts#L4-L23)

```ts
export interface UninstallDeps {
  /** Only an installed copy has an uninstaller; `npm run dev` doesn't. */
  isPackaged: boolean
  /** The running .exe, which the uninstaller sits next to. */
  exePath: string
  /** The installer's product name: the uninstaller is "Uninstall <productName>.exe". */
  productName: string
  exists(path: string): boolean
  /** Turns "Start with Windows" off, so no startup entry is left pointing at a deleted .exe. */
  stopStartingWithWindows(): void
  /** Starts the uninstaller on its own, so it carries on once this app has quit. */
  runDetached(path: string): void
  quit(): void
  onError?(error: unknown): void
}

/** Where electron-builder's installer puts the uninstaller: next to the app's .exe. */
export function uninstallerPath(exePath: string, productName: string): string {
  return join(dirname(exePath), `Uninstall ${productName}.exe`)
}
```

<!-- /code -->

- `isPackaged`: a dev run has no uninstaller, so there's nothing to do.
- `exePath`: the running `Desktop Assist.exe`, whose folder holds the uninstaller.
- `stopStartingWithWindows()`: as the comment says, so Windows isn't left with a startup entry
  for an `.exe` that no longer exists.
- `runDetached(path)`: starts the uninstaller as a separate process that keeps running after this
  one quits.
- `uninstallerPath()`: `join(dirname(exePath), ...)`, the `.exe`'s folder plus
  `Uninstall Desktop Assist.exe`, the name the installer gives it.

### `uninstall()`

<!-- code: apps/desktop/src/main/uninstall.ts#uninstall -->

[`src/main/uninstall.ts`, lines 25–44](../../apps/desktop/src/main/uninstall.ts#L25-L44)

```ts
/**
 * Removes Desktop Assist from this PC: starts its uninstaller (which shows its own progress and
 * takes the app, its Start menu shortcut and its uninstall entry away), then quits so the files
 * can be deleted. The data folder (%APPDATA%\Desktop Assist: preferences, the text box, logs) and
 * the screenshots in Pictures are kept, as with any uninstall from Windows Settings.
 */
export function uninstall(deps: UninstallDeps): UninstallResult {
  if (!deps.isPackaged) return { ok: false, reason: 'not-installed' }
  const uninstaller = uninstallerPath(deps.exePath, deps.productName)
  if (!deps.exists(uninstaller)) return { ok: false, reason: 'missing' }
  try {
    deps.stopStartingWithWindows()
    deps.runDetached(uninstaller)
  } catch (error) {
    deps.onError?.(error)
    return { ok: false, reason: 'failed' }
  }
  deps.quit()
  return { ok: true }
}
```

<!-- /code -->

What Settings → Uninstall runs. As the comment says, the uninstaller does the removing, with its
own progress window, and the data folder and the screenshots are kept, as they would be after
uninstalling from Windows Settings.

- `if (!deps.isPackaged) return { ok: false, reason: 'not-installed' }`: the menu item is greyed
  out in a dev run anyway; this is a second guard.
- `if (!deps.exists(uninstaller))`: no uninstaller next to the `.exe` (a copy that wasn't
  installed with the installer, say). The panel suggests Windows Settings → Apps instead.
- `deps.stopStartingWithWindows()`, `deps.runDetached(uninstaller)`: in that order, inside a
  `try`, so a failure to start the uninstaller is logged and reported (`failed`) and the app keeps
  running.
- `deps.quit()`: the app quits (through `before-quit`, which saves the draft), so the uninstaller
  can delete its files. The uninstaller is already running by then.

## `src/main/tenant.ts`: the tenant config

A _tenant_ is one company's branding and settings, from `tenants/<id>/tenant.json`. This file
defines the shape of that file as zod schemas, plus two small helpers. `start()` in `index.ts`
checks the bundled config with `TenantSchema.parse()`, and `tests/tenants.test.ts` checks every
tenant folder the same way, so a mistake is caught by the tests before it reaches a build.

Besides the branding, a tenant chooses where questions go (`chatApp`): to the Claude Desktop app,
or to the chat built into the panel. Only the built-in chat needs the sign-in settings (`signIn`)
and the Claude access settings (`claudeAccess`). A tenant with the Apps list (as its start page,
or behind the Apps icon) also needs its app portal's settings (`portal`).

None of the values here are secret. The client ID and the Claude IDs identify the app; on their
own they don't grant access to anything.

### `SignInSchema`

<!-- code: apps/desktop/src/main/tenant.ts#SignInSchema -->

[`src/main/tenant.ts`, lines 5–14](../../apps/desktop/src/main/tenant.ts#L5-L14)

```ts
/**
 * How users sign in: the company's OpenID Connect app (JumpCloud for Morse Micro). The client ID
 * isn't secret; it identifies the app to JumpCloud. Left empty until IT creates the app.
 */
export const SignInSchema = z.object({
  issuer: z.url(),
  clientId: z.string(),
  /** The browser comes back to http://127.0.0.1:<port>/callback after sign-in. */
  redirectPort: z.number().int().min(1024).max(65535),
})
```

<!-- /code -->

How the built-in chat signs users in with JumpCloud (see [JumpCloud sign-in](3-sign-in.md)).

- `issuer: z.url()`: the identity provider's address. The OIDC library reads the provider's
  endpoints from it.
- `clientId: z.string()`: allowed to be empty, so a tenant can ship before IT has created the
  JumpCloud app; [`missingSettings()`](#missingsettings) reports it instead.
- `redirectPort`: the port of the local web server the browser returns to after sign-in. It must
  match the redirect address registered in JumpCloud. Ports below 1024 are reserved for system
  services, hence the minimum.

### `ClaudeAccessSchema`

<!-- code: apps/desktop/src/main/tenant.ts#ClaudeAccessSchema -->

[`src/main/tenant.ts`, lines 16–27](../../apps/desktop/src/main/tenant.ts#L16-L27)

```ts
/**
 * How a signed-in user reaches Claude: Anthropic Workload Identity Federation swaps the user's
 * JumpCloud ID token for a short-lived Claude API token, acting as a service account. None of
 * these IDs are secret. Left empty until set up in the Claude Console.
 */
export const ClaudeAccessSchema = z.object({
  organizationId: z.string(),
  federationRuleId: z.string(),
  serviceAccountId: z.string(),
  /** Only needed when the federation rule covers more than one workspace. */
  workspaceId: z.string().optional(),
})
```

<!-- /code -->

How a signed-in user reaches Claude in the built-in chat. There's no API key: Anthropic's
_Workload Identity Federation_ accepts the user's JumpCloud ID token and returns a short-lived
Claude token for the company's service account, if the federation rule set up in the Claude
Console allows it (see [Talking to Claude](4-claude.md) and `docs/JUMPCLOUD_SETUP.md`). These are
the IDs that exchange needs. `organizationId` must be the Claude Console organization's ID: the
claude.ai organization has a different one, and using it makes Anthropic refuse every sign-in.

### `PortalSchema` and `PortalConfig`

<!-- code: apps/desktop/src/main/tenant.ts#PortalSchema,PortalConfig -->

[`src/main/tenant.ts`, lines 29–45](../../apps/desktop/src/main/tenant.ts#L29-L45)

```ts
/**
 * The company's app portal, for the Apps list: JumpCloud's User Portal. `appsServer` is
 * JumpCloud's "MCP Server for Users", which lists the apps a signed-in user can see in the portal
 * and gives each one's sign-in link; each user connects to it once, in the browser (no secret in
 * the app). An admin turns it on in the JumpCloud Admin Portal (Settings → JumpCloud AI).
 */
export const PortalSchema = z.object({
  /** Shown to users: "Sign in with JumpCloud", "Open the JumpCloud portal". */
  name: z.string().min(1),
  /** The User Portal itself, opened by "Open the … portal". */
  url: z.url({ protocol: /^https$/ }),
  appsServer: z.url({ protocol: /^https?$/ }),
  /** The browser comes back to http://127.0.0.1:<port>/callback after connecting. */
  redirectPort: z.number().int().min(1024).max(65535),
})

export type PortalConfig = z.infer<typeof PortalSchema>
```

<!-- /code -->

The company's app portal, for the Apps list (see [Your apps](10-apps.md)). For Morse Micro it's
JumpCloud's User Portal, and the list comes from JumpCloud's "MCP Server for Users", which an
admin has to turn on (the comment says where).

- `name`: shown to users, in "Sign in with JumpCloud" and "Open the JumpCloud portal".
- `url: z.url({ protocol: /^https$/ })`: the User Portal itself. Only `https` addresses are
  accepted.
- `appsServer`: the MCP server's address (`https://usermcp.jumpcloud.com/v1`). `http` is allowed
  too, for a test server in a dev run.
- `redirectPort`: the port of the local web server the browser returns to after connecting, like
  `SignInSchema`'s. It's a different port (47622, against the sign-in's 47621), so the two can
  never get in each other's way.
- `PortalConfig`: the type derived from the schema.

### `SignInConfig` and `ClaudeAccessConfig`

<!-- code: apps/desktop/src/main/tenant.ts#SignInConfig,ClaudeAccessConfig -->

[`src/main/tenant.ts`, lines 47–48](../../apps/desktop/src/main/tenant.ts#L47-L48)

```ts
export type SignInConfig = z.infer<typeof SignInSchema>

export type ClaudeAccessConfig = z.infer<typeof ClaudeAccessSchema>
```

<!-- /code -->

The TypeScript types of the two settings blocks. `z.infer<typeof SignInSchema>` derives the type
from the schema, so the compile-time type and the run-time check can't drift apart. `oidc.ts`
and `AnthropicBackend.ts` use these types.

### `CHAT_APPS`

<!-- code: apps/desktop/src/main/tenant.ts#CHAT_APPS -->

[`src/main/tenant.ts`, lines 50–58](../../apps/desktop/src/main/tenant.ts#L50-L58)

```ts
/**
 * Where conversations with Claude happen.
 * - `claude-desktop`: Desktop Assist hands the question to the Claude Desktop app, so it uses the
 *   person's own Claude (Team/Enterprise) account and counts against their own usage limit. No
 *   sign-in in Desktop Assist.
 * - `built-in`: the chat runs in the panel, through the Claude API, after a JumpCloud sign-in
 *   (`signIn` and `claudeAccess`). Usage is billed to the company's Claude Console account.
 */
export const CHAT_APPS = ['built-in', 'claude-desktop'] as const satisfies ChatApp[]
```

<!-- /code -->

The two places a question can go, as the comment explains. With `claude-desktop` the app has no
sign-in and sends nothing to Anthropic itself: it opens the question in the Claude Desktop app
(see [Claude Desktop](9-claude-desktop.md)). With `built-in` the panel is a chat of its own,
billed to the company.

- `as const`: makes the list's type the two exact strings, read-only, rather than `string[]`.
  That's what `z.enum()` needs to produce the `'built-in' | 'claude-desktop'` type.
- `satisfies ChatApp[]`: checks every entry is a `ChatApp` (the type in `src/shared/types.ts`
  that the pages see) without changing the list's own type. A misspelt entry is a compile error.

### `START_PAGES`

<!-- code: apps/desktop/src/main/tenant.ts#START_PAGES -->

[`src/main/tenant.ts`, lines 60–64](../../apps/desktop/src/main/tenant.ts#L60-L64)

```ts
/**
 * What the panel opens on: the text box for asking Claude (`ask`), or the Apps list (`apps`). The
 * other one is behind its icon (`ask` or `apps` in `actions`).
 */
export const START_PAGES = ['ask', 'apps'] as const satisfies StartPage[]
```

<!-- /code -->

What the panel opens on, as the comment says. Written the same way as `CHAT_APPS`: `as const` for
`z.enum()`, and `satisfies StartPage[]` to check it against the `StartPage` type the pages use.
Morse Micro opens on the Apps list, with the text box behind the Ask Claude icon.

### `TenantSchema` and `Tenant`

<!-- code: apps/desktop/src/main/tenant.ts#TenantSchema,Tenant -->

[`src/main/tenant.ts`, lines 66–102](../../apps/desktop/src/main/tenant.ts#L66-L102)

```ts
export const TenantSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    companyName: z.string().min(1),
    appName: z.string().min(1),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #RRGGBB colour'),
    actions: z
      .array(z.enum(ACTION_IDS))
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, 'actions must not repeat'),
    chatApp: z.enum(CHAT_APPS).default('built-in'),
    startPage: z.enum(START_PAGES).default('ask'),
    /** Extra instructions for Claude, added to the built-in chat's system prompt. */
    systemPrompt: z.string().max(8000).optional(),
    /** Needed for the Apps action. */
    portal: PortalSchema.optional(),
    /** Needed for the built-in chat only. */
    signIn: SignInSchema.optional(),
    claudeAccess: ClaudeAccessSchema.optional(),
  })
  .refine(
    (tenant) => tenant.chatApp !== 'built-in' || Boolean(tenant.signIn && tenant.claudeAccess),
    {
      message: 'the built-in chat needs signIn and claudeAccess',
    },
  )
  .refine((tenant) => !tenant.actions.includes('apps') || tenant.portal !== undefined, {
    message: 'the apps action needs portal',
  })
  .refine((tenant) => tenant.startPage !== 'apps' || tenant.portal !== undefined, {
    message: 'starting on the apps list needs portal',
  })
  .refine((tenant) => tenant.startPage !== 'apps' || tenant.actions.includes('ask'), {
    message: 'starting on the apps list needs the ask action, to reach the text box',
  })

export type Tenant = z.infer<typeof TenantSchema>
```

<!-- /code -->

The whole `tenant.json`.

- `id: z.string().regex(/^[a-z0-9-]+$/)`: lowercase letters, digits and hyphens only. It must
  also match the tenant's folder name; the tenants test checks that.
- `accentColor`: a `#RRGGBB` colour. The second argument of `regex()` is the error message.
- `z.array(z.enum(ACTION_IDS)).min(1)`: which icons appear above the bubble, in order. Each must
  be a known action, and there must be at least one.
- `.refine((ids) => new Set(ids).size === ids.length, ...)`: a `Set` drops duplicates, so if it's
  smaller than the list, an action is listed twice.
- `chatApp: z.enum(CHAT_APPS).default('built-in')`: where questions go. A `tenant.json` without
  it gets the built-in chat. Because of `.default()`, `chatApp` is always there in the `Tenant`
  type, so the code never has to handle it missing.
- `systemPrompt`: optional extra instructions for Claude, added after the built-in ones by
  `buildSystemPrompt()`. Only the built-in chat uses it; Claude Desktop has its own (claude.ai's
  organization instructions).
- `startPage: z.enum(START_PAGES).default('ask')`: what the panel opens on; the text box unless
  the tenant says otherwise.
- `portal: PortalSchema.optional()`: only needed for the Apps list.
- `signIn: SignInSchema.optional()`, `claudeAccess: ClaudeAccessSchema.optional()`: a Claude
  Desktop tenant can leave both out.
- `.refine((tenant) => tenant.chatApp !== 'built-in' || ...)`: a check on the whole object, so it
  can compare fields: the built-in chat must have both `signIn` and `claudeAccess`. `||` reads
  "either it isn't the built-in chat, or both are there". `Boolean(...)` turns the `&&` of the two
  objects into `true` or `false`. If the check fails, parsing throws with `message`.
- `.refine((tenant) => !tenant.actions.includes('apps') || tenant.portal !== undefined, ...)`: a
  second check of the same kind: a tenant that shows the Apps icon must say which portal it's for.
- `.refine((tenant) => tenant.startPage !== 'apps' || tenant.portal !== undefined, ...)`: so must a
  tenant that starts on the Apps list.
- `.refine((tenant) => tenant.startPage !== 'apps' || tenant.actions.includes('ask'), ...)`: and it
  must show the Ask Claude icon, or there would be no way to reach the text box.

### `brandingOf()`

<!-- code: apps/desktop/src/main/tenant.ts#brandingOf -->

[`src/main/tenant.ts`, lines 104–109](../../apps/desktop/src/main/tenant.ts#L104-L109)

```ts
export function brandingOf(tenant: Tenant): Branding {
  const { companyName, appName, accentColor, actions, chatApp } = tenant
  const portalName = tenant.portal?.name ?? null
  const { startPage } = tenant
  return { companyName, appName, accentColor, actions, chatApp, portalName, startPage }
}
```

<!-- /code -->

The part of the tenant the pages need: names, the accent colour, the action list, `chatApp`, which
tells the panel whether to show the built-in chat or hand questions to Claude Desktop, and the
portal's name for the Apps list (`null` without a portal; `?.` reads `name` only if there's a
`portal`), and the start page. It goes into the state snapshot from `getState`. The object is
rebuilt field by field rather than passed as is, so the sign-in, Claude and portal settings never go
to the pages.

### `missingSettings()`

<!-- code: apps/desktop/src/main/tenant.ts#missingSettings -->

[`src/main/tenant.ts`, lines 111–122](../../apps/desktop/src/main/tenant.ts#L111-L122)

```ts
/** The tenant.json settings still to be filled in before anyone can sign in, by name. */
export function missingSettings(signIn: SignInConfig, access: ClaudeAccessConfig): string[] {
  const required: Record<string, string> = {
    'signIn.clientId': signIn.clientId,
    'claudeAccess.organizationId': access.organizationId,
    'claudeAccess.federationRuleId': access.federationRuleId,
    'claudeAccess.serviceAccountId': access.serviceAccountId,
  }
  return Object.entries(required)
    .filter(([, value]) => !value.trim())
    .map(([name]) => name)
}
```

<!-- /code -->

Lists the required IDs that are still blank, by their name in `tenant.json` (for example
`signIn.clientId`). `startBuiltInChat()` passes the list to `AuthManager`; if it isn't empty, the
status is `unconfigured` and the chat box shows the list instead of a sign-in button.

- `required`: only the IDs a tenant can leave blank. `issuer` and `redirectPort` aren't here
  because the schema already requires them, and `workspaceId` is optional.
- `!value.trim()`: a value of only spaces counts as blank.
- `.filter(([, value]) => ...)`, `.map(([name]) => name)`: `Object.entries` gives `[name, value]`
  pairs; the filter keeps the blank ones and the map keeps just their names.

### `DevOverrideSchema`

<!-- code: apps/desktop/src/main/tenant.ts#DevOverrideSchema -->

[`src/main/tenant.ts`, lines 124–135](../../apps/desktop/src/main/tenant.ts#L124-L135)

```ts
/**
 * Dev runs only: a JSON file (path in DESKTOP_ASSIST_DEV_CONFIG) can override `chatApp`,
 * `startPage`, `portal`, `signIn` and `claudeAccess`, so the app can be pointed at a test identity provider without editing
 * tenant.json. Installed builds never read it.
 */
export const DevOverrideSchema = z.object({
  chatApp: z.enum(CHAT_APPS).optional(),
  startPage: z.enum(START_PAGES).optional(),
  portal: PortalSchema.partial().optional(),
  signIn: SignInSchema.partial().optional(),
  claudeAccess: ClaudeAccessSchema.partial().optional(),
})
```

<!-- /code -->

The shape of the dev-only override file read by [`withDevOverrides()`](#withdevoverrides).
`.partial()` makes every field of a schema optional, so the file only needs the settings it
changes.

- `chatApp: z.enum(CHAT_APPS).optional()`: lets a dev run try the other kind of chat, for example
  the built-in chat against a test identity provider while `tenant.json` says `claude-desktop`.
- `startPage: z.enum(START_PAGES).optional()`: lets a dev run try the other start page.
- `portal: PortalSchema.partial().optional()`: lets a dev run point the Apps list at a test
  server (`appsServer`), without editing `tenant.json`.

## `src/main/settings.ts`: the user's preferences

`SettingsService` keeps the user's preferences in `preferences.json` in the userData folder: the
reply effort (Fast, Balanced, Thorough) for the built-in chat, whether questions are sent in
Claude Desktop automatically, where the bubble was dragged to, and whether "Start with Windows"
has been set up. It also reports the settings the Settings menu shows. Created in
`start()`; the Settings menu reaches it through the `settings...` IPC channels.

### `DEFAULT_EFFORT`, `PreferencesSchema` and `Preferences`

<!-- code: apps/desktop/src/main/settings.ts#DEFAULT_EFFORT,PreferencesSchema,Preferences -->

[`src/main/settings.ts`, lines 7–23](../../apps/desktop/src/main/settings.ts#L7-L23)

```ts
/** Fast answers by default; Balanced and Thorough think longer. */
export const DEFAULT_EFFORT: Effort = 'low'

const PreferencesSchema = z.object({
  autoStartInitialized: z.boolean().optional(),
  effort: z.enum(['low', 'medium', 'high']).optional(),
  /** Claude Desktop: send the question in Claude, not just fill it in. On unless turned off. */
  autoSend: z.boolean().optional(),
  /** Where the bubble was dragged to: a corner of a particular display. */
  bubbleAnchor: z
    .object({
      displayId: z.number(),
      corner: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']),
    })
    .optional(),
})

type Preferences = z.infer<typeof PreferencesSchema>
```

<!-- /code -->

- `DEFAULT_EFFORT`: the effort until the user picks one. `low` is shown as Fast.
- `PreferencesSchema`: what the file may contain. Every field is optional, so a missing field
  just means "not set yet", and an older file still loads after a new preference is added.
- `autoSend`: "Send in Claude automatically", for Claude Desktop. As the comment says, it's on
  unless the user has turned it off: a missing value counts as on (see `get()`), so it's on for
  everyone who installed before the setting existed too.
- `bubbleAnchor`: a display ID and one of the four corners (`BubbleAnchor` in
  `BubbleController.ts`).
- `type Preferences = z.infer<typeof PreferencesSchema>`: the type derived from the schema.

### `SettingsService`

<!-- code: apps/desktop/src/main/settings.ts#SettingsService.prefs,saving,constructor -->

[`src/main/settings.ts`, lines 26–32](../../apps/desktop/src/main/settings.ts#L26-L32)

```ts
private prefs: Preferences = {}

private saving: Promise<unknown> = Promise.resolve()

constructor(
  private readonly preferencesPath: string,
  private readonly screenshotsDir: string,
) {}
```

<!-- /code -->

- `private prefs: Preferences = {}`: the preferences in memory. Reads come from here; every
  change is also written to the file.
- `private saving: Promise<unknown> = Promise.resolve()`: the most recent write to the file, so
  the next one can wait for it (see [`save()`](#settingsservicesave)). It starts as an
  already-finished promise, so the first write doesn't wait for anything.
- `private readonly preferencesPath: string`: a TypeScript shorthand. A parameter marked
  `private` (or `public`, `readonly`) in a constructor is also stored as a field of the same
  name, which is why the constructor body is empty.
- `screenshotsDir`: not a preference; it's included in the settings so the menu can show where
  screenshots go.

### `SettingsService.init()`

<!-- code: apps/desktop/src/main/settings.ts#SettingsService.init -->

[`src/main/settings.ts`, lines 34–42](../../apps/desktop/src/main/settings.ts#L34-L42)

```ts
/** Loads preferences. The first time an installed build runs, turns on "Start with Windows". */
async init(): Promise<void> {
  const result = await readJsonFile(this.preferencesPath, PreferencesSchema)
  this.prefs = result.status === 'ok' ? result.value : {}
  if (app.isPackaged && !this.prefs.autoStartInitialized) {
    this.setAutoStart(true)
    await this.save({ autoStartInitialized: true })
  }
}
```

<!-- /code -->

Loads the file once at startup (called from `start()`).

- `readJsonFile(this.preferencesPath, PreferencesSchema)`: reads and checks the file (see
  `storage/jsonFile.ts` in [The draft, screenshots and safe files](6-drafts-and-screenshots.md)).
  If it's missing or damaged, the result isn't `ok` and the defaults (`{}`) are used; the damaged
  file is replaced at the next save. A file that exists but can't be read at all (a permissions
  error) throws, and startup ends with the error box from [`fail()`](#fail).
- `if (app.isPackaged && !this.prefs.autoStartInitialized)`: the first time an installed build
  runs, "Start with Windows" is switched on and `autoStartInitialized` is saved. Because of that
  flag it happens only once: if the user turns it off later, it stays off.

### `SettingsService.get()`

<!-- code: apps/desktop/src/main/settings.ts#SettingsService.get -->

[`src/main/settings.ts`, lines 44–55](../../apps/desktop/src/main/settings.ts#L44-L55)

```ts
get(): Settings {
  const available = app.isPackaged
  return {
    // Read from Windows each time: the user can also change it in Settings > Apps > Startup.
    autoStart: available && app.getLoginItemSettings().openAtLogin,
    autoStartAvailable: available,
    screenshotsDir: this.screenshotsDir,
    effort: this.prefs.effort ?? DEFAULT_EFFORT,
    autoSend: this.prefs.autoSend ?? true,
    canUninstall: available,
  }
}
```

<!-- /code -->

The current settings, as the Settings menu shows them (`Settings` in `src/shared/types.ts`).

- `const available = app.isPackaged`: starting with Windows only makes sense for an installed
  build. A dev run would register the development copy of Electron.
- `app.getLoginItemSettings().openAtLogin`: whether Windows will start the app at sign-in. It's
  read from Windows every time rather than remembered, because the user can also change it in
  Windows' Settings > Apps > Startup.
- `this.prefs.effort ?? DEFAULT_EFFORT`: `??` uses the right-hand value when the left is `null`
  or `undefined`.
- `this.prefs.autoSend ?? true`: "Send in Claude automatically" is on until the user turns it off.
- `canUninstall: available`: only an installed build has an uninstaller.

### `SettingsService.setAutoStart()`

<!-- code: apps/desktop/src/main/settings.ts#SettingsService.setAutoStart -->

[`src/main/settings.ts`, lines 57–60](../../apps/desktop/src/main/settings.ts#L57-L60)

```ts
setAutoStart(enabled: boolean): Settings {
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: enabled })
  return this.get()
}
```

<!-- /code -->

Turns "Start with Windows" on or off. `app.setLoginItemSettings()` adds or removes the app's
entry in the user's startup list (a "Run" entry in the user's part of the Windows registry).
Nothing is saved in `preferences.json`, since Windows itself is the record. Returns the new
settings, so the menu shows what actually happened; in a dev run that's still "off".

### `SettingsService.setEffort()` and `SettingsService.setAutoSend()`

<!-- code: apps/desktop/src/main/settings.ts#SettingsService.setEffort,setAutoSend -->

[`src/main/settings.ts`, lines 62–70](../../apps/desktop/src/main/settings.ts#L62-L70)

```ts
async setEffort(effort: Effort): Promise<Settings> {
  await this.save({ effort })
  return this.get()
}

async setAutoSend(autoSend: boolean): Promise<Settings> {
  await this.save({ autoSend })
  return this.get()
}
```

<!-- /code -->

Save the reply effort and "Send in Claude automatically", and return the settings as they now
are. Both take effect from the next question: `ChatSession` reads the effort through
`getEffort()` each time it sends, and `ClaudeDesktop` reads the other through its `autoSend()`
dependency each time it hands a question over.

### `SettingsService.bubbleAnchor` and `SettingsService.setBubbleAnchor()`

<!-- code: apps/desktop/src/main/settings.ts#SettingsService.bubbleAnchor,setBubbleAnchor -->

[`src/main/settings.ts`, lines 72–78](../../apps/desktop/src/main/settings.ts#L72-L78)

```ts
get bubbleAnchor(): BubbleAnchor | null {
  return this.prefs.bubbleAnchor ?? null
}

async setBubbleAnchor(anchor: BubbleAnchor): Promise<void> {
  await this.save({ bubbleAnchor: anchor })
}
```

<!-- /code -->

Where the bubble rests. `get bubbleAnchor()` is a _getter_: it's read like a property
(`settings.bubbleAnchor`, in `start()`), but runs this code. It returns `null` if the bubble has
never been moved, and `BubbleController.start()` then uses the bottom-right corner of the main
display. `setBubbleAnchor()` is called by `onAnchorChange` in `start()` each time the bubble
settles in a new corner.

### `SettingsService.save()`

<!-- code: apps/desktop/src/main/settings.ts#SettingsService.save -->

[`src/main/settings.ts`, lines 80–87](../../apps/desktop/src/main/settings.ts#L80-L87)

```ts
private async save(changes: Preferences): Promise<void> {
  this.prefs = { ...this.prefs, ...changes }
  // One write at a time, in order, so an older save can't finish last and overwrite a newer one.
  const snapshot = this.prefs
  const write = this.saving.then(() => writeJsonFile(this.preferencesPath, snapshot))
  this.saving = write.catch(() => {})
  await write
}
```

<!-- /code -->

Merges the changes into the preferences in memory, then writes the whole object to the file.
Writes are queued: each one starts only after the previous one has finished.

- `{ ...this.prefs, ...changes }`: later properties win, so only the changed fields are replaced.
- `const snapshot = this.prefs`: the preferences as they are now, including this change. A queued
  write may start a little later, but it writes exactly this.
- `this.saving.then(() => writeJsonFile(this.preferencesPath, snapshot))`: waits for the previous
  write, then writes this one. Without the queue, two saves close together could finish in the
  wrong order and leave the older preferences on disk.
- `writeJsonFile(...)`: writes to a temporary file and then renames it over the old one, so a
  crash mid-write can't leave a half-written file.
- `this.saving = write.catch(() => {})`: the next save waits for this one, but a failed write
  mustn't stop all later saves, so the queue's copy ignores the error.
- `await write`: the caller still gets this write's own result, so a failure is reported to
  whoever asked for the save.

## `src/main/tray.ts`: the tray icon

The icon in the Windows notification area (by the clock). Clicking it opens the panel, and its
right-click menu has Open and Quit. It matters because the app has no taskbar button or window
frame: this is the one place that always shows the app is running and offers a way to quit. The
icon is the tenant's logo, the same image as the bubble, or a plain circle in the accent colour
if the tenant has no `logo.png`.

### `logos`, `logoPath`, `TRAY_SIZE` and `SCALE_FACTORS`

<!-- code: apps/desktop/src/main/tray.ts#logos,logoPath,TRAY_SIZE,SCALE_FACTORS -->

[`src/main/tray.ts`, lines 4–15](../../apps/desktop/src/main/tray.ts#L4-L15)

```ts
// The tenant's logo, the same image as the bubble. Only a PNG can be used: Windows can't draw a
// tray icon from SVG. `?asset` makes the build copy the file and gives its path at runtime.
const logos = import.meta.glob<string>('@tenant/logo.png', {
  query: '?asset',
  import: 'default',
  eager: true,
})

const logoPath = Object.values(logos)[0]

/** The tray icon is 16px at 100% display scaling; Windows picks the size for each scaling. */
const TRAY_SIZE = 16

const SCALE_FACTORS = [1, 1.25, 1.5, 2]
```

<!-- /code -->

- `import.meta.glob<string>('@tenant/logo.png', {`: a Vite build feature. At build time it finds
  every file matching the pattern and puts them in an object, keyed by path. Unlike a plain
  `import`, it doesn't break the build when nothing matches: a tenant with only a `logo.svg` just
  gets an empty object.
- `query: '?asset'`: an electron-vite feature for the main process. The build copies the file into
  its output and the import gives the file's path at run time, rather than its contents.
- `import: 'default', eager: true`: take each match's default export (the path) straight away,
  rather than a function that loads it later.
- `Object.values(logos)[0]`: the logo's path, or `undefined` if the tenant has no `logo.png`.
- `TRAY_SIZE = 16`: tray icons are 16×16 at 100% display scaling. `SCALE_FACTORS` are the common
  Windows scalings (100%, 125%, 150%, 200%) that get an image of their own.

### `createTray()`

<!-- code: apps/desktop/src/main/tray.ts#createTray -->

[`src/main/tray.ts`, lines 17–34](../../apps/desktop/src/main/tray.ts#L17-L34)

```ts
export function createTray(options: {
  appName: string
  accentColor: string
  onOpen: () => void
  onQuit: () => void
}): Tray {
  const tray = new Tray(trayImage(options.accentColor))
  tray.setToolTip(options.appName)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Open ${options.appName}`, click: options.onOpen },
      { type: 'separator' },
      { label: 'Quit', click: options.onQuit },
    ]),
  )
  tray.on('click', options.onOpen)
  return tray
}
```

<!-- /code -->

Called once from `start()`, which keeps the returned `Tray` in the module-level `tray` variable.

- `new Tray(trayImage(options.accentColor))`: adds the icon, using the image from
  [`trayImage()`](#trayimage).
- `tray.setToolTip(options.appName)`: the text shown when the mouse rests on the icon.
- `Menu.buildFromTemplate([...])`: builds the right-click menu from a list of items: a label and a
  `click` function, or a separator.
- `tray.on('click', options.onOpen)`: a left-click opens the panel too.

### `trayImage()`

<!-- code: apps/desktop/src/main/tray.ts#trayImage -->

[`src/main/tray.ts`, lines 36–61](../../apps/desktop/src/main/tray.ts#L36-L61)

```ts
/**
 * The logo, resized smoothly for each display scaling (letting Windows shrink the 512px image
 * itself looks jagged). A tenant without logo.png gets a plain circle in its accent colour.
 */
function trayImage(accentColor: string): NativeImage {
  const logo = logoPath ? nativeImage.createFromPath(logoPath) : null
  if (!logo || logo.isEmpty()) {
    const size = TRAY_SIZE * 2
    return nativeImage.createFromBitmap(circleBitmap(size, accentColor), {
      width: size,
      height: size,
      scaleFactor: 2,
    })
  }
  const image = nativeImage.createEmpty()
  for (const scaleFactor of SCALE_FACTORS) {
    const size = Math.round(TRAY_SIZE * scaleFactor)
    image.addRepresentation({
      scaleFactor,
      width: size,
      height: size,
      buffer: logo.resize({ width: size, height: size, quality: 'best' }).toPNG(),
    })
  }
  return image
}
```

<!-- /code -->

Builds the icon image. A _NativeImage_ is Electron's image object, and one NativeImage can hold
several versions of the same picture (_representations_), one per display scaling.

- `nativeImage.createFromPath(logoPath)`: loads the PNG. If the file can't be read or decoded,
  the image is empty (`isEmpty()`), and the fallback is used as if there were no logo.
- `nativeImage.createFromBitmap(circleBitmap(size, accentColor), {`: the fallback, made from raw
  pixels drawn by [`circleBitmap()`](#circlebitmap) at 32×32. `scaleFactor: 2` says that bitmap
  is meant for 200% scaling, so the image counts as 16×16 and is scaled down on a 100% display.
- `nativeImage.createEmpty()`, `image.addRepresentation({`: starts with an empty image and adds
  the logo at 16, 20, 24 and 32 pixels, one per scaling. The icon on each display then uses the
  version made for its scaling.
- `logo.resize({ width: size, height: size, quality: 'best' }).toPNG()`: the logo file is 512×512.
  Shrinking it here with the best-quality filter looks smooth, while leaving Windows to shrink it
  that far looks jagged (as the comment says).

## `src/main/trayIcon.ts`: drawing the fallback tray icon

Draws a tray icon in code: a filled circle in the tenant's accent colour. `trayImage()` uses it
only for a tenant that has no `logo.png`. It has no Electron imports, so `tests/trayIcon.test.ts`
can check the pixels directly.

### `circleBitmap()`

<!-- code: apps/desktop/src/main/trayIcon.ts#circleBitmap -->

[`src/main/trayIcon.ts`, lines 1–22](../../apps/desktop/src/main/trayIcon.ts#L1-L22)

```ts
/**
 * A filled, anti-aliased circle as raw premultiplied BGRA pixels: the format
 * nativeImage.createFromBitmap expects on Windows. The tray icon for a tenant without logo.png.
 */
export function circleBitmap(size: number, hexColor: string): Buffer {
  const [r, g, b] = parseHexColor(hexColor)
  const pixels = Buffer.alloc(size * size * 4)
  const centre = size / 2
  const radius = size / 2 - 0.5
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x + 0.5 - centre, y + 0.5 - centre)
      const alpha = Math.min(1, Math.max(0, radius - distance + 0.5))
      const i = (y * size + x) * 4
      pixels[i] = Math.round(b * alpha)
      pixels[i + 1] = Math.round(g * alpha)
      pixels[i + 2] = Math.round(r * alpha)
      pixels[i + 3] = Math.round(255 * alpha)
    }
  }
  return pixels
}
```

<!-- /code -->

Returns the raw pixels of a `size`×`size` image: a circle filling the square, with a smooth edge.

- `Buffer.alloc(size * size * 4)`: four bytes per pixel, all zero to begin with (fully
  transparent). Pixels go row by row, so pixel (x, y) starts at byte `(y * size + x) * 4`.
- `Math.hypot(x + 0.5 - centre, y + 0.5 - centre)`: the distance from the middle of this pixel to
  the centre of the circle.
- `Math.min(1, Math.max(0, radius - distance + 0.5))`: how much of the pixel the circle covers,
  roughly. 1 when the pixel's middle is at least half a pixel inside the edge, 0 when it's at
  least half a pixel outside, and in between on the edge. This smooth edge is called
  _anti-aliasing_; without it the circle would look jagged.
- `radius = size / 2 - 0.5`: leaves half a pixel of room so the soft edge fits inside the square.
- `pixels[i] = Math.round(b * alpha)`: the bytes go blue, green, red, alpha (_BGRA_), the order
  Windows uses. Each colour is multiplied by the coverage (_premultiplied_ alpha), which is the
  form `nativeImage.createFromBitmap` expects.

### `parseHexColor()`

<!-- code: apps/desktop/src/main/trayIcon.ts#parseHexColor -->

[`src/main/trayIcon.ts`, lines 24–28](../../apps/desktop/src/main/trayIcon.ts#L24-L28)

```ts
export function parseHexColor(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) throw new Error(`Not a #RRGGBB colour: ${hex}`)
  return [parseInt(match[1]!, 16), parseInt(match[2]!, 16), parseInt(match[3]!, 16)]
}
```

<!-- /code -->

Turns `#RRGGBB` into three numbers from 0 to 255.

- `/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i`: exactly a `#` and three pairs of hex digits;
  the `i` flag allows upper or lower case. The short form `#fff` is rejected.
- `parseInt(match[1]!, 16)`: reads one pair as a base-16 number. The `!` tells TypeScript the
  group is definitely there (the regex matched), because this project's settings make it treat
  any array element as possibly missing.

## `src/main/env.d.ts`: types for Vite's build features

A `.d.ts` file holds only type information and produces no code. This one lets TypeScript
understand the build-time features `tray.ts` uses, which plain TypeScript doesn't know about.

<!-- code: apps/desktop/src/main/env.d.ts -->

[`src/main/env.d.ts`, lines 1–3](../../apps/desktop/src/main/env.d.ts#L1-L3)

```ts
// Vite's additions to TypeScript for the main process, e.g. import.meta.glob and `?asset` imports.
/// <reference types="vite/client" />
/// <reference types="electron-vite/node" />
```

<!-- /code -->

- `/// <reference types="vite/client" />`: a _triple-slash directive_, which pulls in another
  package's type declarations. Vite's declarations add `import.meta.glob` and Vite's other
  `import.meta` extras.
- `/// <reference types="electron-vite/node" />`: electron-vite's declarations describe its
  special imports for the main process; for example, a `?asset` import is a file path (a
  `string`).
