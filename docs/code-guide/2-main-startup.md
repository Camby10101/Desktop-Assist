# Main process: startup, IPC and app plumbing

[← Code Guide](../CODE_GUIDE.md)

The _main process_ is the Node.js side of an Electron app: the single process that owns the
windows, the files, the tray icon and the network. This page covers how it starts and how the
pages talk to it. `index.ts` creates every service and wires them together, `ipc.ts` answers the
pages' requests, and the smaller files hold the tenant config, the user's preferences, the
commands behind the action icons and the tray icon. The services themselves (sign-in, Claude, the
bubble, the draft and screenshots) each have their own page.

## `src/main/index.ts`: startup and shutdown

The main process's entry point. electron-vite builds it into `out/main/index.js`, and the
`main` field of `apps/desktop/package.json` tells Electron to run that file. It works in three
stages:

1. **As soon as the file loads**, module-level code picks the data folder and makes sure only one
   copy of the app is running.
2. **Once Electron is ready**, `start()` creates the windows and every service, connects them with
   callbacks, registers the IPC handlers and the tray icon, and finally shows the bubble.
3. **When the app quits**, a `before-quit` handler saves the draft before letting it close.

The key idea is that the services don't know about each other or about Electron's globals. Each
one is handed what it needs (callbacks, small adapter objects) when it's created, which is why the
tests can drive them with fakes. `index.ts` is the only file that knows about all of them.

### Module-level code

<!-- code: apps/desktop/src/main/index.ts#SHUTDOWN_TIMEOUT_MS,controller,tray -->

[`src/main/index.ts`, lines 33–47](../../apps/desktop/src/main/index.ts#L33-L47)

```ts
const SHUTDOWN_TIMEOUT_MS = 2000

let controller: BubbleController | null = null

let tray: Tray | null = null
```

<!-- /code -->

This runs the moment Electron loads the file, before the app is ready. The block shows only the
three declarations. Two `if` statements sit between them (they can't be shown on their own), so
they're quoted in the bullets below, in the order they run.

- `SHUTDOWN_TIMEOUT_MS = 2000`: the longest quitting will wait for the draft to be saved (see
  [Quitting](#quitting) below).
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
The link above each piece opens the full source.

#### The tenant config

<!-- code: apps/desktop/src/main/index.ts#start.tenant -->

[`src/main/index.ts`, line 59](../../apps/desktop/src/main/index.ts#L59)

```ts
const tenant = TenantSchema.parse(tenantConfig)
```

<!-- /code -->

- `TenantSchema.parse(tenantConfig)`: `tenantConfig` is the bundled `tenant.json` (the `@tenant`
  import shortcut points at `tenants/<TENANT>/`). TypeScript only checks it at build time, so it's
  checked again here against the schema in `tenant.ts`. A bad config throws and the app doesn't
  start.
- `const { signIn, claudeAccess } = await withDevOverrides(tenant)` (the next line): the
  JumpCloud and Claude access settings, possibly replaced in dev runs by
  [`withDevOverrides()`](#withdevoverrides). The rest of `start()` uses these two rather than
  `tenant.signIn` and `tenant.claudeAccess`.
- `Menu.setApplicationMenu(null)`: removes Electron's default menu (File, Edit, View and so on)
  and the keyboard shortcuts that come with it, such as reload and developer tools.
- `app.setAppUserModelId('com.morsemicro.desktopassist')`: the _AppUserModelID_ is how Windows
  identifies an app, for example to label its notifications. It matches `appId` in
  `electron-builder.yml`, the ID the installer registers.

#### Folders, the draft and preferences

<!-- code: apps/desktop/src/main/index.ts#start.userData,screenshotsDir,actionCount,notes,settings -->

[`src/main/index.ts`, lines 64–73](../../apps/desktop/src/main/index.ts#L64-L73)

```ts
const userData = app.getPath('userData')

const screenshotsDir = join(app.getPath('pictures'), tenant.appName)

const actionCount = tenant.actions.length

const notes = new NotesStore(join(userData, 'notes.json'), {
  onError: (error) => console.error('Saving the text box failed', error),
})

const settings = new SettingsService(join(userData, 'preferences.json'), screenshotsDir)
```

<!-- /code -->

- `app.getPath('pictures')`: the user's Pictures folder. Screenshots go in a subfolder named
  after the app (`appName` in `tenant.json`).
- `new NotesStore(join(userData, 'notes.json'), ...)`: the unsent draft in the text box. It's
  followed by `await notes.load()`, which reads the saved draft before anything can ask for it.
  `onError` only logs: a failed save shouldn't interrupt the user (see
  [The draft, screenshots and safe files](6-drafts-and-screenshots.md)).
- `new SettingsService(join(userData, 'preferences.json'), screenshotsDir)`: the user's
  preferences, followed by `await settings.init()`, which loads them and, on an installed build's
  first run, turns on "Start with Windows" (see [`SettingsService.init()`](#settingsserviceinit)).

#### The two windows

<!-- code: apps/desktop/src/main/index.ts#start.bubbleWindow,panelWindow,windows,windowsReady,broadcast -->

[`src/main/index.ts`, lines 76–85](../../apps/desktop/src/main/index.ts#L76-L85)

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

[`src/main/index.ts`, lines 87–98](../../apps/desktop/src/main/index.ts#L87-L98)

```ts
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
- `onAnchorChange`: when the bubble settles in a new corner, the panel is told (it lays itself out
  to open away from that corner) and the new anchor is saved. `void` in front of a promise means
  "start this and don't wait for it"; it also tells the linter the missing `await` is deliberate.
- `controller = bubble` (the next line): makes the controller reachable from the module-level
  `second-instance` handler.
- `panelWindow.on('blur', () => bubble.panelBlurred())`: `blur` fires when the panel loses
  keyboard focus, for example when the user clicks another app. The controller then closes the
  panel.

#### Screenshots and Claude

<!-- code: apps/desktop/src/main/index.ts#start.screenshots,devBaseUrl,backend,chat -->

[`src/main/index.ts`, lines 102–122](../../apps/desktop/src/main/index.ts#L102-L122)

```ts
const screenshots = new ScreenshotService(screenshotsDir, () =>
  screen.getDisplayMatching(bubbleWindow.getBounds()),
)

// Dev runs may point at a local test server; an installed app always talks to Anthropic.
const devBaseUrl = !app.isPackaged ? process.env['ANTHROPIC_BASE_URL'] : undefined

const backend = new AnthropicBackend({
  baseURL: devBaseUrl || API_BASE_URL,
  access: claudeAccess,
  identityToken: () => auth.freshIdToken(),
})

const chat = new ChatSession({
  backend,
  canChat: () => auth.canChat,
  getEffort: () => settings.get().effort,
  system: buildSystemPrompt(tenant),
  onMessage: (message) => broadcast(IPC.chatMessage, message),
  onReset: () => broadcast(IPC.chatReset),
  // The details (status codes, request IDs) go to the terminal in dev runs.
  onError: (error) => console.error('Claude request failed:', error),
})
```

<!-- /code -->

- `screen.getDisplayMatching(bubbleWindow.getBounds())`: the screenshot service is given a
  function rather than a fixed display, so each capture takes the display the bubble is on at
  that moment.
- `devBaseUrl`: lets a dev run send Claude requests to a local mock server named in
  `ANTHROPIC_BASE_URL`. An installed build ignores the variable, so it can't be redirected.
- `identityToken: () => auth.freshIdToken()`: how `AnthropicBackend` gets a JumpCloud ID token to
  swap for Claude access (see [Talking to Claude](4-claude.md)). `auth` is only declared further
  down; that's fine because this arrow function only runs later, when the first message is sent,
  by which time `auth` exists. Calling it any earlier would throw.
- `canChat: () => auth.canChat`, `getEffort: () => settings.get().effort`: functions rather than
  values, so `ChatSession` reads the current sign-in and the current Fast/Balanced/Thorough choice
  each time it sends.
- `system: buildSystemPrompt(tenant)`: the system prompt (Claude's standing instructions), built
  once from the app name, company name and any extra `systemPrompt` in `tenant.json`.
- `onMessage`, `onReset`: each new or changed chat message, and "New conversation", are broadcast
  to the pages.

#### Sign-in

<!-- code: apps/desktop/src/main/index.ts#start.missing,localIssuer,authState,auth -->

[`src/main/index.ts`, lines 124–148](../../apps/desktop/src/main/index.ts#L124-L148)

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
  onError: (error) => console.error('JumpCloud sign-in failed:', error),
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

Two statements follow:

- `void auth.init()`: loads the saved sign-in and renews it with JumpCloud. It isn't awaited, so
  the windows appear while that happens; the result reaches the pages through `onStatus`. An
  `await` here would also let a page's request in before `registerIpc()` has run.
- `void rm(join(userData, 'claude-api-key.bin'), { force: true }).catch(() => {})`: an earlier
  version saved a Claude API key in this file. Nothing uses it now, so it's deleted. `force: true`
  means "no error if it isn't there", and `.catch(() => {})` ignores any other failure.

#### IPC, the tray and display changes

<!-- code: apps/desktop/src/main/index.ts#start.onDisplayChange -->

[`src/main/index.ts`, line 182](../../apps/desktop/src/main/index.ts#L182)

```ts
const onDisplayChange = () => bubble.displayChanged()
```

<!-- /code -->

Everything else in this part of `start()` is plain statements:

- `registerIpc({`: connects the pages' requests to the services (see
  [`registerIpc()`](#registeripc)). It's given both windows (only they may call in) and every
  service.
- `actions: createActionHandlers({ controller: bubble, screenshots, quit: () => app.quit() })`:
  the commands behind the Screenshot, Bounce and Close icons (`actions.ts`).
- `getState: () => ({`: builds the snapshot a page asks for when it first loads: the bubble's mode
  and corner, the draft, the settings, the branding, the app version (`app.getVersion()`, from
  `package.json`), the sign-in status and the chat so far. After that the page keeps up through
  the broadcasts above.
- `tray = createTray({`: adds the icon in the notification area. `onOpen` opens the panel and
  `onQuit` quits (see [`createTray()`](#createtray)).
- `screen.on('display-added', onDisplayChange)`: the same handler also runs for
  `display-removed` and `display-metrics-changed` (a resolution, scaling or taskbar change).
  `BubbleController.displayChanged()` moves the bubble back into its corner, or onto the main
  display if its own display was unplugged.

#### Quitting

<!-- code: apps/desktop/src/main/index.ts#start.shuttingDown -->

[`src/main/index.ts`, lines 187–188](../../apps/desktop/src/main/index.ts#L187-L188)

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
- `bubble.dispose()`, `chat.stop()`: stops the bubble's animation timers and aborts a reply that
  is still streaming.
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

### `safeStorageEncryptor`

<!-- code: apps/desktop/src/main/index.ts#safeStorageEncryptor -->

[`src/main/index.ts`, lines 206–211](../../apps/desktop/src/main/index.ts#L206-L211)

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
  before then, because the `SecretStore` is created inside `start()`.

### `withDevOverrides()`

<!-- code: apps/desktop/src/main/index.ts#withDevOverrides -->

[`src/main/index.ts`, lines 213–225](../../apps/desktop/src/main/index.ts#L213-L225)

```ts
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
```

<!-- /code -->

Returns the sign-in and Claude access settings to use. In an installed build, or when
`DESKTOP_ASSIST_DEV_CONFIG` isn't set, that's simply the ones from `tenant.json`. In a dev run,
the JSON file named by that variable can replace some of them, for example to point the app at a
test identity provider, without editing `tenant.json`.

- `Promise<Pick<Tenant, 'signIn' | 'claudeAccess'>>`: `Pick` is a TypeScript helper that keeps
  just the named properties of a type. That's why `return tenant` is allowed: the whole tenant has
  those two properties.
- `DevOverrideSchema.parse(JSON.parse(await readFile(path, 'utf8')))`: the file is checked
  against [`DevOverrideSchema`](#devoverrideschema), in which every field is optional.
- `SignInSchema.parse({ ...tenant.signIn, ...override.signIn })`: `...` copies an object's
  properties, and later ones win, so the override's fields replace the tenant's. The merged result
  is checked again, so an override can't produce an invalid sign-in config.

### `isLoopback()`

<!-- code: apps/desktop/src/main/index.ts#isLoopback -->

[`src/main/index.ts`, lines 227–229](../../apps/desktop/src/main/index.ts#L227-L229)

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

[`src/main/index.ts`, lines 231–245](../../apps/desktop/src/main/index.ts#L231-L245)

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

[`src/main/index.ts`, lines 247–251](../../apps/desktop/src/main/index.ts#L247-L251)

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

### `IpcContext`

<!-- code: apps/desktop/src/main/ipc.ts#IpcContext -->

[`src/main/ipc.ts`, lines 22–33](../../apps/desktop/src/main/ipc.ts#L22-L33)

```ts
export interface IpcContext {
  /** Only these windows' renderers may call in. */
  windows: BrowserWindow[]
  controller: BubbleController
  notes: NotesStore
  screenshots: ScreenshotService
  settings: SettingsService
  auth: AuthManager
  chat: ChatSession
  actions: ActionHandlers
  getState(): AppState
}
```

<!-- /code -->

Everything the handlers need, passed in by `start()` in `index.ts`. The main process's services
are created there, so this file only needs their types, not how to build them.

- `windows: BrowserWindow[]`: the bubble and panel windows; requests from any other page are
  refused.
- `getState(): AppState`: builds the full snapshot a page asks for when it first loads (defined
  in `start()`).

### `NoArgs`, `FilePath` and `WebUrl`

<!-- code: apps/desktop/src/main/ipc.ts#NoArgs,FilePath,WebUrl -->

[`src/main/ipc.ts`, lines 35–47](../../apps/desktop/src/main/ipc.ts#L35-L47)

```ts
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
```

<!-- /code -->

Schemas used by several channels.

- `z.undefined()`: for channels that take no argument. `ipcRenderer.invoke(channel)` with no
  argument arrives as `undefined`; anything else is rejected.
- `FilePath`: only checks for a sensible string. The real check, that the file is inside the
  screenshots folder, is done by `ScreenshotService` (`owns()`).
- `.refine(...)`: adds a custom check to a schema. Here the string must parse as a URL and use
  `http:` or `https:`, so a link in a Claude reply can't open a local file (`file:`), run script
  (`javascript:`) or launch another program through its own URL scheme. `new URL()` throws for
  text that isn't a URL, hence the `try`/`catch`.

### `registerIpc()`

<!-- code: apps/desktop/src/main/ipc.ts#registerIpc -->

[`src/main/ipc.ts`, lines 49–137](../../apps/desktop/src/main/ipc.ts#L49-L137)

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

  // Sign-in happens in the browser and can take minutes, so these return straight away;
  // progress is broadcast on IPC.authStatus. No tokens ever reach the renderer.
  handle(IPC.authSignIn, NoArgs, () => void ctx.auth.signIn())
  handle(IPC.authCancel, NoArgs, () => ctx.auth.cancelSignIn())
  handle(IPC.authSignOut, NoArgs, () => ctx.auth.signOut())
  handle(IPC.authRetry, NoArgs, () => void ctx.auth.retry())

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
```

<!-- /code -->

Registers a handler for every channel, once, at startup. The first part sets up a sender check
and two helpers; the rest is one line (or a few) per channel, grouped by area.

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
- `shell.openExternal(url)`: opens a link from a Claude reply in the default browser, after
  `WebUrl` has checked it.
- `z.string().max(1_000_000)`: the text of a chat message whose Copy button was pressed, capped
  at a million characters (`_` is just a digit separator). `clipboard.writeText` puts it on the Windows clipboard.

**The draft**

- `on(IPC.notesSetText, ...)`: sent on every keystroke, so it's one-way. The length cap matches
  what `NotesStore` keeps (`MAX_NOTE_LENGTH`).
- `IPC.notesAttachLatest`: finds the newest screenshot in the folder and attaches it to the draft.
  It answers `no-screenshots` if there are none and `already-attached` if `addAttachment()`
  returns `null` because that file is already attached.
- `z.string().min(1).max(64)`: an attachment ID (a UUID, 36 characters).

**Screenshots and settings**

- `IPC.screenshotThumbnail`, `IPC.screenshotOpen`, `IPC.screenshotsOpenFolder`: a small preview
  for a chip, opening a screenshot in the default image viewer, and opening the folder. The two
  that take a path refuse one outside the screenshots folder.
- `IPC.settingsGet`, `IPC.settingsSetAutoStart`, `IPC.settingsSetEffort`: the Settings menu.
  Each returns the full, current settings, so the menu always shows what actually took effect.

**Sign-in**

- `() => void ctx.auth.signIn()`: signing in happens in the browser and can take minutes. `void`
  discards the promise, so the page's call returns at once; progress arrives as `IPC.authStatus`
  broadcasts. Retry works the same way.
- `ctx.auth.cancelSignIn()`: stops waiting for the browser (it closes the local listener).
- No handler returns a token: the pages only ever see the status and the user's name.

**Chat**

- `handle(IPC.chatSend, ...)`: sends the text plus the screenshots attached to the draft.
- `if (ctx.chat.busy) return { ok: false, reason: 'busy' }`: checked first so the screenshots
  aren't processed for nothing while a reply is still streaming.
- `ctx.screenshots.forClaude(attachment.path)`: shrinks each attached screenshot and encodes it as
  JPEG for Claude. If any file has gone missing, nothing is sent and the panel shows a toast.
- `ctx.chat.send(text, images, draft.attachments)`: starts the reply and returns straight away
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

## `src/main/tenant.ts`: the tenant config

A _tenant_ is one company's branding and settings, from `tenants/<id>/tenant.json`. This file
defines the shape of that file as zod schemas, plus two small helpers. `start()` in `index.ts`
checks the bundled config with `TenantSchema.parse()`, and `tests/tenants.test.ts` checks every
tenant folder the same way, so a mistake is caught by the tests before it reaches a build.

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

How the app signs users in with JumpCloud (see [JumpCloud sign-in](3-sign-in.md)).

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

How a signed-in user reaches Claude. There's no API key: Anthropic's _Workload Identity
Federation_ accepts the user's JumpCloud ID token and returns a short-lived Claude token for the
company's service account, if the federation rule set up in the Claude Console allows it (see
[Talking to Claude](4-claude.md) and `docs/JUMPCLOUD_SETUP.md`). These are the IDs that exchange
needs.

### `SignInConfig` and `ClaudeAccessConfig`

<!-- code: apps/desktop/src/main/tenant.ts#SignInConfig,ClaudeAccessConfig -->

[`src/main/tenant.ts`, lines 29–30](../../apps/desktop/src/main/tenant.ts#L29-L30)

```ts
export type SignInConfig = z.infer<typeof SignInSchema>

export type ClaudeAccessConfig = z.infer<typeof ClaudeAccessSchema>
```

<!-- /code -->

The TypeScript types of the two settings blocks. `z.infer<typeof SignInSchema>` derives the type
from the schema, so the compile-time type and the run-time check can't drift apart. `oidc.ts`
and `AnthropicBackend.ts` use these types.

### `TenantSchema` and `Tenant`

<!-- code: apps/desktop/src/main/tenant.ts#TenantSchema,Tenant -->

[`src/main/tenant.ts`, lines 32–47](../../apps/desktop/src/main/tenant.ts#L32-L47)

```ts
export const TenantSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  companyName: z.string().min(1),
  appName: z.string().min(1),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #RRGGBB colour'),
  actions: z
    .array(z.enum(ACTION_IDS))
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, 'actions must not repeat'),
  /** Extra instructions for Claude, added to the built-in system prompt. */
  systemPrompt: z.string().max(8000).optional(),
  signIn: SignInSchema,
  claudeAccess: ClaudeAccessSchema,
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
- `systemPrompt`: optional extra instructions for Claude, added after the built-in ones by
  `buildSystemPrompt()`.

### `brandingOf()`

<!-- code: apps/desktop/src/main/tenant.ts#brandingOf -->

[`src/main/tenant.ts`, lines 49–52](../../apps/desktop/src/main/tenant.ts#L49-L52)

```ts
export function brandingOf(tenant: Tenant): Branding {
  const { companyName, appName, accentColor, actions } = tenant
  return { companyName, appName, accentColor, actions }
}
```

<!-- /code -->

The part of the tenant the pages need: names, the accent colour and the action list. It goes
into the state snapshot from `getState`. The object is rebuilt field by field rather than passed
as is, so the sign-in and Claude settings never go to the pages.

### `missingSettings()`

<!-- code: apps/desktop/src/main/tenant.ts#missingSettings -->

[`src/main/tenant.ts`, lines 54–65](../../apps/desktop/src/main/tenant.ts#L54-L65)

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
`signIn.clientId`). `start()` passes the list to `AuthManager`; if it isn't empty, the status is
`unconfigured` and the chat box shows the list instead of a sign-in button.

- `required`: only the IDs a tenant can leave blank. `issuer` and `redirectPort` aren't here
  because the schema already requires them, and `workspaceId` is optional.
- `!value.trim()`: a value of only spaces counts as blank.
- `.filter(([, value]) => ...)`, `.map(([name]) => name)`: `Object.entries` gives `[name, value]`
  pairs; the filter keeps the blank ones and the map keeps just their names.

### `DevOverrideSchema`

<!-- code: apps/desktop/src/main/tenant.ts#DevOverrideSchema -->

[`src/main/tenant.ts`, lines 67–75](../../apps/desktop/src/main/tenant.ts#L67-L75)

```ts
/**
 * Dev runs only: a JSON file (path in DESKTOP_ASSIST_DEV_CONFIG) can override `signIn` and
 * `claudeAccess`, so the app can be pointed at a test identity provider without editing
 * tenant.json. Installed builds never read it.
 */
export const DevOverrideSchema = z.object({
  signIn: SignInSchema.partial().optional(),
  claudeAccess: ClaudeAccessSchema.partial().optional(),
})
```

<!-- /code -->

The shape of the dev-only override file read by [`withDevOverrides()`](#withdevoverrides).
`.partial()` makes every field of a schema optional, so the file only needs the settings it
changes.

## `src/main/settings.ts`: the user's preferences

`SettingsService` keeps the user's preferences in `preferences.json` in the userData folder: the
reply effort (Fast, Balanced, Thorough), where the bubble was dragged to, and whether "Start with
Windows" has been set up. It also reports the settings the Settings menu shows. Created in
`start()`; the Settings menu reaches it through the `settings...` IPC channels.

### `DEFAULT_EFFORT`, `PreferencesSchema` and `Preferences`

<!-- code: apps/desktop/src/main/settings.ts#DEFAULT_EFFORT,PreferencesSchema,Preferences -->

[`src/main/settings.ts`, lines 7–21](../../apps/desktop/src/main/settings.ts#L7-L21)

```ts
/** Fast answers by default; Balanced and Thorough think longer. */
export const DEFAULT_EFFORT: Effort = 'low'

const PreferencesSchema = z.object({
  autoStartInitialized: z.boolean().optional(),
  effort: z.enum(['low', 'medium', 'high']).optional(),
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
- `bubbleAnchor`: a display ID and one of the four corners (`BubbleAnchor` in
  `BubbleController.ts`).
- `type Preferences = z.infer<typeof PreferencesSchema>`: the type derived from the schema.

### `SettingsService`

<!-- code: apps/desktop/src/main/settings.ts#SettingsService.prefs,saving,constructor -->

[`src/main/settings.ts`, lines 24–30](../../apps/desktop/src/main/settings.ts#L24-L30)

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

[`src/main/settings.ts`, lines 32–40](../../apps/desktop/src/main/settings.ts#L32-L40)

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

[`src/main/settings.ts`, lines 42–51](../../apps/desktop/src/main/settings.ts#L42-L51)

```ts
get(): Settings {
  const available = app.isPackaged
  return {
    // Read from Windows each time: the user can also change it in Settings > Apps > Startup.
    autoStart: available && app.getLoginItemSettings().openAtLogin,
    autoStartAvailable: available,
    screenshotsDir: this.screenshotsDir,
    effort: this.prefs.effort ?? DEFAULT_EFFORT,
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

### `SettingsService.setAutoStart()`

<!-- code: apps/desktop/src/main/settings.ts#SettingsService.setAutoStart -->

[`src/main/settings.ts`, lines 53–56](../../apps/desktop/src/main/settings.ts#L53-L56)

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

### `SettingsService.setEffort()`

<!-- code: apps/desktop/src/main/settings.ts#SettingsService.setEffort -->

[`src/main/settings.ts`, lines 58–61](../../apps/desktop/src/main/settings.ts#L58-L61)

```ts
async setEffort(effort: Effort): Promise<Settings> {
  await this.save({ effort })
  return this.get()
}
```

<!-- /code -->

Saves the reply effort. `ChatSession` reads it through `getEffort()` each time it sends, so the
change applies to the next message.

### `SettingsService.bubbleAnchor` and `SettingsService.setBubbleAnchor()`

<!-- code: apps/desktop/src/main/settings.ts#SettingsService.bubbleAnchor,setBubbleAnchor -->

[`src/main/settings.ts`, lines 63–69](../../apps/desktop/src/main/settings.ts#L63-L69)

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

[`src/main/settings.ts`, lines 71–78](../../apps/desktop/src/main/settings.ts#L71-L78)

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
