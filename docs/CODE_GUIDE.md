# Desktop Assist: Code Guide

A walk through every file in the project: what it's for, and what each function, method or
constant does. Written for Milestone 0 (Foundation). Update this guide when the code changes.

Contents:

1. [Background: how an Electron app is put together](#1-background-how-an-electron-app-is-put-together)
2. [How the pieces work together](#2-how-the-pieces-work-together)
3. [Repository root](#3-repository-root)
4. [Tenants (branding)](#4-tenants-branding)
5. [Desktop app configuration](#5-desktop-app-configuration)
6. [Shared code (`src/shared`)](#6-shared-code-srcshared)
7. [Main process (`src/main`)](#7-main-process-srcmain)
8. [Preload (`src/preload`)](#8-preload-srcpreload)
9. [Renderer (`src/renderer`)](#9-renderer-srcrenderer)
10. [Tests (`tests`)](#10-tests-tests)

---

## 1. Background: how an Electron app is put together

An Electron app is a Chromium browser and Node.js bundled together. It runs as several
processes, and the code is split the same way:

| Part             | Runs in                                     | Can do                                                                      | Here                        |
| ---------------- | ------------------------------------------- | --------------------------------------------------------------------------- | --------------------------- |
| **Main process** | Node.js, one per app                        | Create windows, read and write files, the tray, screen capture, OS settings | `apps/desktop/src/main`     |
| **Renderer**     | Chromium, one per window                    | Draw the UI with HTML/CSS/React. **Cannot** touch files or the OS           | `apps/desktop/src/renderer` |
| **Preload**      | Inside each renderer, before the page loads | Hand the page a small, safe set of functions (`window.assist`)              | `apps/desktop/src/preload`  |
| **Shared**       | Bundled into all three                      | Types and constants both sides must agree on                                | `apps/desktop/src/shared`   |

The renderer and the main process talk over **IPC** (inter-process communication): the
renderer sends a named message (a _channel_), and the main process handles it and optionally
replies. Every channel is listed in `src/shared/ipc.ts`.

**Why two windows?** The bubble and the panel are separate, transparent, always-on-top windows.
Both load the same web page; the URL's `?view=bubble` or `?view=panel` decides which UI it
shows. Keeping the bubble in its own tiny window means it never resizes (no flicker when the
panel opens), and only a 72×72 window moves around during Bounce.

**Click-through.** The panel window is a large rectangle, but most of it is transparent. So
that you can still click whatever is underneath those empty areas, every overlay window starts
out _ignoring the mouse_. Windows still forwards pointer movement to the page, and while the
pointer is over a real piece of UI (anything marked `data-hit`), the page asks the main process
to switch mouse input back on.

---

## 2. How the pieces work together

**Starting up** (`src/main/index.ts` → `start()`)

1. Validate `tenant.json`, create the bubble and panel windows (both hidden), load the saved
   text box from disk, and set up "Start with Windows" for installed builds.
2. Create the `BubbleController` (the state machine), the `ScreenshotService`, the IPC
   handlers and the tray icon.
3. Once both pages have painted, `controller.start()` puts the bubble in the corner and shows it.

**Clicking the bubble**

`BubbleView` button → `window.assist.bubbleClick()` → IPC `assist:bubble-click` →
`BubbleController.clickBubble()`, which decides what the click means from the current mode:
open the panel, close it, or stop bouncing. The new mode is broadcast to both pages
(`assist:mode-changed`), and the panel fades in or out to match.

**Typing in the text box**

`NotesBox` textarea → `Panel.changeText()` → `window.assist.notes.setText()` →
`NotesStore.setText()`. The store keeps the text in memory and writes `notes.json` about half a
second after you stop typing. When the write finishes, it sends `assist:notes-saved` and the
page shows "Saved ✓".

**Taking a screenshot**

Camera icon → `Panel.runAction('screenshot')` → IPC `assist:invoke-action` → the `screenshot`
handler in `src/main/actions.ts` → `BubbleController.whileHidden()` hides both windows, waits for
Windows to repaint, then `ScreenshotService.capture()` saves the PNG. The windows come back and
the page shows a "Screenshot saved" toast.

**Attach latest screenshot**

Paperclip button → IPC `assist:notes-attach-latest` → `ScreenshotService.latest()` finds the
newest screenshot file → `NotesStore.addAttachment()` → the page shows a chip. The chip asks for
a small preview through `assist:screenshot-thumbnail`.

**Bounce**

Bounce icon → `BubbleController.startBounce()` hides the panel and runs a 60 fps timer that
calls `bounce.step()` and moves the bubble window. Clicking the bubble calls `returnHome()`,
which animates it back to the corner with `bounce.glidePosition()`.

---

## 3. Repository root

| File                 | Purpose                                                                                                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`       | The npm _workspaces_ root. `apps/*` are the packages (only `apps/desktop` for now; a gateway service can be added beside it later). Its scripts (`dev`, `test`, `lint`, `typecheck`, `dist`, `format`) forward to the desktop app. |
| `package-lock.json`  | Exact versions of every installed package, so every machine installs the same thing. Generated by npm; don't edit by hand.                                                                                                         |
| `.gitignore`         | Keeps `node_modules/`, build output (`out/`, `dist/`) and logs out of git.                                                                                                                                                         |
| `.prettierrc.json`   | Code formatting rules (no semicolons, single quotes, 100-character lines). Run `npm run format` to apply.                                                                                                                          |
| `.prettierignore`    | Files Prettier must not touch (build output, the lock file).                                                                                                                                                                       |
| `README.md`          | What the app does and how to run, test and build it.                                                                                                                                                                               |
| `docs/PLAN.md`       | The plan: tech stack, architecture, milestones, decisions and open questions.                                                                                                                                                      |
| `docs/CODE_GUIDE.md` | This file.                                                                                                                                                                                                                         |

---

## 4. Tenants (branding)

A _tenant_ is one business's branding. The build includes exactly one, chosen by the `TENANT`
environment variable (default `morse-micro`). This is what makes the app easy to re-brand later.

| File                              | Purpose                                                                                                                                                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenants/README.md`               | How tenants work, and how to change the logo.                                                                                                                                                                                     |
| `tenants/morse-micro/tenant.json` | `id` (must match the folder name), `companyName`, `appName` (also the name of the screenshots folder), `accentColor` (the highlight colour), and `actions`: which icons appear above the bubble, in order from the bubble upward. |
| `tenants/morse-micro/logo.svg`    | The bubble image. Currently a **placeholder** "M". A `logo.png` placed beside it takes priority.                                                                                                                                  |

---

## 5. Desktop app configuration

All in `apps/desktop/`.

| File                      | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`            | The desktop app's own package. `productName` ("Desktop Assist") becomes the app's name and its `%APPDATA%` folder. `main` points Electron at the built main process. Scripts: `dev` (run with hot reload), `build`, `typecheck`, `lint`, `test`, `dist` (build the installer). Every library is a `devDependency` because the build bundles them; the installer ships no `node_modules`. `electron` is pinned to an exact version because the installer builder requires it. |
| `electron.vite.config.ts` | Build config for electron-vite, which compiles the three parts (main, preload, renderer). Defines the import shortcuts `@shared` → `src/shared` and `@tenant` → `tenants/<TENANT>`, and turns on React and Tailwind for the renderer.                                                                                                                                                                                                                                        |
| `electron-builder.yml`    | Installer config: app ID, product name, include only the built `out/` folder, and build a per-user one-click NSIS installer (`Desktop Assist-Setup-<version>.exe`) into `dist/`.                                                                                                                                                                                                                                                                                             |
| `tsconfig.json`           | Points TypeScript at the two configs below.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `tsconfig.node.json`      | TypeScript settings for code that runs in Node: main, preload, shared, tests and config files. Strict mode on.                                                                                                                                                                                                                                                                                                                                                               |
| `tsconfig.web.json`       | TypeScript settings for the renderer (browser code with React/JSX).                                                                                                                                                                                                                                                                                                                                                                                                          |
| `vitest.config.ts`        | Test runner config: the same `@shared`/`@tenant` shortcuts, run `tests/**/*.test.ts` in Node.                                                                                                                                                                                                                                                                                                                                                                                |
| `eslint.config.mjs`       | Lint rules: recommended JavaScript and TypeScript rules everywhere, React Hooks rules for the renderer, and Prettier compatibility.                                                                                                                                                                                                                                                                                                                                          |

---

## 6. Shared code (`src/shared`)

Imported by both the main process and the renderer, so both sides agree on shapes and numbers.

### `geometry.ts`: sizes and positions

| Name                    | What it is                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Point`, `Size`, `Rect` | Basic shapes: `{x, y}`, `{width, height}`, and both together. All in DIPs (device-independent pixels, i.e. before Windows display scaling).                                                                                                                                                                                                                                                              |
| `UI`                    | Every UI measurement in one place: bubble size (56), padding around it (8), gap to the panel (12), panel width (360) and max height (440), action icon size (40) and spacing (8), shadow room (16), settings menu width (248), and the margin from the screen edge (16). The main process sizes windows from these and the renderer positions elements with the same numbers, so they can't drift apart. |
| `BUBBLE_BOX`            | Size of the bubble window: the bubble plus padding on each side (72).                                                                                                                                                                                                                                                                                                                                    |
| `PANEL_LAYOUT`          | Where the action stack, text box and settings menu sit inside the panel window, measured from its bottom-right corner (which lines up with the bubble).                                                                                                                                                                                                                                                  |
| `actionStackHeight(n)`  | Height of a stack of `n` action icons including the gaps between them.                                                                                                                                                                                                                                                                                                                                   |
| `actionBottom(index)`   | Distance from the panel window's bottom edge to the bottom of action icon number `index`. Used to line the settings menu up with the gear.                                                                                                                                                                                                                                                               |
| `panelWindowSize(n)`    | How big the panel window must be to fit the text box at full height and `n` action icons.                                                                                                                                                                                                                                                                                                                |

### `actions.ts`: the action registry

| Name                 | What it is                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `ACTION_IDS`         | Every action that exists: `screenshot`, `settings`, `bounce`, `close`.                                                                   |
| `ActionId`           | The type of one of those IDs.                                                                                                            |
| `ACTIONS`            | Each action's tooltip label and _kind_: `command` (handled by the main process) or `popover` (opens UI inside the panel; only Settings). |
| `CommandActionId`    | The type of just the command actions (`screenshot`, `bounce`, `close`).                                                                  |
| `COMMAND_ACTION_IDS` | The list of command actions, used to validate IPC requests.                                                                              |

To add a new icon: add it here, add a handler in `src/main/actions.ts` (if it's a command), give it
an icon in `ActionStack.tsx`, and list it in `tenant.json`.

### `types.ts`: data shapes

| Name           | What it is                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `Mode`         | What the bubble is doing: `collapsed`, `expanded`, `bouncing`, `returning` (gliding home), or `capturing` (windows hidden for a screenshot). |
| `Attachment`   | A screenshot attached to the text box: an ID, the file path, the file name and when it was added.                                            |
| `Notes`        | The text box's saved contents: text, attachments and last-changed time.                                                                      |
| `Settings`     | What the settings menu shows: whether Start with Windows is on, whether it's available (installed builds only), and the screenshots folder.  |
| `Branding`     | The parts of the tenant config the pages need.                                                                                               |
| `AppState`     | Everything a page needs when it first loads.                                                                                                 |
| `ActionResult` | What running an action returns: success or failure, plus an optional message to show as a toast.                                             |
| `AttachResult` | What "attach latest" returns: the updated notes, or why it didn't attach (`no-screenshots` or `already-attached`).                           |

### `ipc.ts`: the IPC contract

| Name        | What it is                                                                                                                                                                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IPC`       | Every channel name, e.g. `assist:bubble-click`. One list means the preload and the main process can't disagree about a name.                                                                                                                                      |
| `AssistApi` | The exact set of functions the pages get as `window.assist`: get the state, click the bubble, collapse, switch mouse input on or off, run an action, edit notes, work with screenshots, read and change settings, and listen for mode changes and "saved" events. |

### `format.ts`

| Name                             | What it does                                                                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `screenshotLabel(fileName, now)` | Turns `Screenshot 2026-10-02 140311.png` into the chip label `Screenshot 14:03` (today) or `Screenshot 2 Oct 14:03` (another day). Any other file name is shown as-is. |

---

## 7. Main process (`src/main`)

### `index.ts`: startup and shutdown

| Part                          | What it does                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Top-level code                | In dev runs, moves app data to `%APPDATA%\Desktop Assist (Dev)` so a dev copy never shares notes or the single-instance lock with an installed copy. Takes the **single-instance lock**: if the app is already running, the new copy quits, and the running one opens its panel (`second-instance` event).                                                                                                   |
| `start()`                     | Runs once Electron is ready. Validates the tenant, creates both windows, starts listening for "page ready", loads notes, initialises settings, creates the `BubbleController` (and connects panel blur to `panelBlurred()`), the `ScreenshotService`, the IPC handlers and the tray. Moves the bubble home on display changes. Sets up shutdown (below), then shows the bubble once both pages have painted. |
| `broadcast(channel, payload)` | (inside `start`) Sends a message to both pages, e.g. a mode change.                                                                                                                                                                                                                                                                                                                                          |
| `before-quit` handler         | On quit: stops animations, removes the tray icon, and waits (up to 2 seconds) for the text box to finish saving before letting the app exit.                                                                                                                                                                                                                                                                 |
| `session-end` handler         | When Windows logs off or shuts down: saves the text box synchronously, since there's no time for async work.                                                                                                                                                                                                                                                                                                 |
| `fail(error)`                 | If startup fails, shows an error box and exits.                                                                                                                                                                                                                                                                                                                                                              |

### `tenant.ts`

| Name                 | What it does                                                                                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TenantSchema`       | Rules `tenant.json` must follow (lowercase id, `#RRGGBB` colour, known and non-repeated actions). A bad file stops the app at startup with a clear message, and `npm test` checks it too. |
| `Tenant`             | The type of a valid tenant config.                                                                                                                                                        |
| `brandingOf(tenant)` | Picks out the fields the pages need.                                                                                                                                                      |

### `bubble/BubbleController.ts`: the state machine

The heart of the app. It owns the current `Mode` and the bubble's position, and shows, hides and
moves the two windows to match. It talks to windows through the small `Surface` interface rather
than to Electron directly, which is what lets the tests drive it with fake windows.

| Name                                              | What it does                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Surface`, `PanelSurface`                         | What the controller needs from a window: set bounds, show, hide (and focus, for the panel).                                                                                                                                                                                                  |
| `BubbleControllerDeps`                            | What it's built with: the two surfaces, a function returning the screen's work area, the number of actions, a callback for mode changes, and (for tests) a clock and random-number source.                                                                                                   |
| `PANEL_FADE_MS` (140)                             | How long the panel's fade-out takes before the window is actually hidden.                                                                                                                                                                                                                    |
| `BLUR_CLICK_GRACE_MS` (300)                       | See `clickBubble()`.                                                                                                                                                                                                                                                                         |
| `HIDE_SETTLE_MS` (150)                            | How long to wait after hiding the windows before taking a screenshot, so they aren't in it.                                                                                                                                                                                                  |
| `currentMode`                                     | The current mode.                                                                                                                                                                                                                                                                            |
| `bubblePosition`                                  | Where the bubble is (top-left of the circle).                                                                                                                                                                                                                                                |
| `start()`                                         | Puts the bubble in its home corner, sizes both windows, shows the bubble.                                                                                                                                                                                                                    |
| `clickBubble()`                                   | Decides what a bubble click means: **collapsed** → open the panel, **expanded** → close it, **bouncing** → glide home, **returning/capturing** → ignore. If the panel _just_ closed because it lost focus, a click arriving within 300 ms is part of the same gesture and doesn't reopen it. |
| `expand()`                                        | Opens and focuses the panel. If the bubble is bouncing, glides home first and then opens (used by the tray's "Open" and by launching the app a second time).                                                                                                                                 |
| `collapse()`                                      | Switches to collapsed, then hides the panel window once the fade-out has finished.                                                                                                                                                                                                           |
| `panelBlurred()`                                  | Called when the panel loses focus (you clicked somewhere else): collapses and remembers when.                                                                                                                                                                                                |
| `startBounce()`                                   | Hides the panel, picks a random direction and runs a 60 fps timer that moves the bubble with `step()`.                                                                                                                                                                                       |
| `whileHidden(task)`                               | Hides both windows, waits for the screen to repaint, runs `task` (the screenshot), then always brings the windows back and reopens the panel, even if the task failed.                                                                                                                       |
| `displayChanged()`                                | Resolution, taskbar or monitors changed: moves the bubble and panel to the new home corner. A bounce in progress carries on, since it re-reads the screen area every frame.                                                                                                                  |
| `dispose()`                                       | Stops all timers (on quit).                                                                                                                                                                                                                                                                  |
| `returnHome()` _(private)_                        | Animates the bubble back to its corner with `glidePosition()`, then switches to collapsed, and opens the panel if that was requested.                                                                                                                                                        |
| `runTicker(onFrame)` / `stopTicker()` _(private)_ | Start and stop the 60 fps animation timer, passing each frame the time since the last one.                                                                                                                                                                                                   |
| `moveBubble(position)` _(private)_                | Moves only the bubble window (used every frame while animating).                                                                                                                                                                                                                             |
| `placeWindows()` _(private)_                      | Positions both windows around the current bubble position.                                                                                                                                                                                                                                   |
| `cancelHide()` _(private)_                        | Cancels a pending "hide the panel after the fade" timer (e.g. you reopened it quickly).                                                                                                                                                                                                      |
| `setMode(mode)` _(private)_                       | Changes mode and reports it (which broadcasts it to the pages).                                                                                                                                                                                                                              |

### `bubble/layout.ts`: where windows go

Pure maths, no Electron.

| Name                           | What it does                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `TravelBox`                    | The range of positions the bubble can be in.                                                                      |
| `homePosition(workArea)`       | The bubble's resting place: bottom-right of the work area (the screen minus the taskbar), 16px in from the edges. |
| `travelBox(workArea)`          | Every position where the bubble is fully on screen. Bounce stays inside this.                                     |
| `bubbleWindowBounds(bubble)`   | The bubble window's rectangle for a given bubble position (adds the padding and rounds to whole pixels).          |
| `panelWindowBounds(bubble, n)` | The panel window's rectangle: its bottom-right corner is the same as the bubble window's.                         |

### `bubble/bounce.ts`: bounce physics

Pure maths, no Electron.

| Name                         | What it does                                                                                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Motion`                     | Position (x, y) and velocity (vx, vy, in pixels per second).                                                                                                                      |
| `BOUNCE_SPEED` (280)         | How fast the bubble moves.                                                                                                                                                        |
| `launch(from, random)`       | Starting motion: heads up and to the left (away from the corner) at a random angle between 25° and 65°.                                                                           |
| `step(motion, dtMs, box)`    | Moves the bubble forward by `dtMs` milliseconds and bounces it off any edge it crosses. Gaps over 100 ms (e.g. the PC was asleep) count as one short step, so it never teleports. |
| `reflect()` _(private)_      | One axis of a bounce: if the position went past an edge, mirror it back inside and reverse the velocity.                                                                          |
| `glideDuration(from, to)`    | How long the glide home should take: longer for further distances, but always between 0.3 s and 0.9 s.                                                                            |
| `glidePosition(from, to, t)` | Where the bubble is at progress `t` (0 to 1) along the glide. Uses an "ease-out" curve, so it slows as it settles into the corner.                                                |

### `bubble/windows.ts`: creating the Electron windows

| Name                                      | What it does                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `View`                                    | `'bubble'` or `'panel'`.                                                                                                                                                                                                                                                                                                                                                      |
| `createOverlayWindow(view, size)`         | Creates one overlay window: frameless, transparent, always on top, no taskbar or Alt+Tab entry, starting click-through. The bubble window can't take focus, so clicking it doesn't steal focus from the panel. Security options are on (sandboxed page, no Node access). Loads the page from the Vite dev server in dev, or from the built file otherwise, with `?view=` set. |
| `bubbleSurface(win)`, `panelSurface(win)` | Adapt a real window to the controller's `Surface` interface. The bubble is shown _without_ activating it, and the panel is shown _and_ focused.                                                                                                                                                                                                                               |
| `lockDown(win)` _(private)_               | Stops the page opening new windows or navigating away. If a page crashes, makes the window click-through (so a dead page can't block your clicks) and reloads it.                                                                                                                                                                                                             |
| `addEditContextMenu(win)` _(private)_     | The right-click menu in the text box: spelling suggestions, then undo, redo, cut, copy, paste and select all.                                                                                                                                                                                                                                                                 |

### `actions.ts`: what the command icons do

| Name                         | What it does                                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ActionHandlers`             | One function per command action.                                                                                                                                             |
| `createActionHandlers(deps)` | Builds them: **screenshot** captures while the windows are hidden and returns "Screenshot saved" (or an error message); **bounce** starts bouncing; **close** quits the app. |

### `ipc.ts`: handling requests from the pages

| Name                                     | What it does                                                                                                                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IpcContext`                             | Everything the handlers need: the windows, controller, notes, screenshots, settings, action handlers and a way to get the current state.                                                                          |
| `registerIpc(ctx)`                       | Connects every channel in `IPC` to the right code. Each incoming value is checked with a zod schema (right type, sensible length) before use. Requests from anything other than our own two windows are rejected. |
| `trusted(sender)` _(inner)_              | Is this message from one of our windows?                                                                                                                                                                          |
| `handle(channel, schema, run)` _(inner)_ | Registers a request/reply channel (for example, "attach the latest screenshot" returns the updated notes).                                                                                                        |
| `on(channel, schema, run)` _(inner)_     | Registers a fire-and-forget channel (for example, the bubble was clicked).                                                                                                                                        |

The `setInteractive` handler is where click-through happens: it calls `setIgnoreMouseEvents` on
the window that sent the message.

### `notes/NotesStore.ts`: saving the text box

| Name                                | What it does                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAX_NOTE_LENGTH`                   | Text longer than 200,000 characters is cut off (a safety limit).                                                                                                                |
| `NotesFileSchema` _(private)_       | The expected shape of `notes.json`, with a `version` number for future format changes.                                                                                          |
| `emptyNotes()`                      | A blank text box.                                                                                                                                                               |
| `NotesStoreOptions`                 | How long to wait before saving (default 500 ms), plus callbacks for "saved" and "error".                                                                                        |
| `load()`                            | Reads `notes.json`. A missing file means an empty text box. A damaged file is renamed to `notes.json.corrupt-<time>` (so nothing is lost) and the app starts with an empty box. |
| `get()`                             | A copy of the current notes (a copy, so callers can't change the stored ones by accident).                                                                                      |
| `setText(text)`                     | Updates the text and schedules a save.                                                                                                                                          |
| `addAttachment(path)`               | Attaches a screenshot, or returns `null` if that file is already attached.                                                                                                      |
| `removeAttachment(id)`              | Removes one attachment (the image file itself is kept).                                                                                                                         |
| `clear()`                           | Empties the text and attachments.                                                                                                                                               |
| `flush()`                           | Saves now instead of waiting, and resolves once everything is on disk. Used when quitting.                                                                                      |
| `flushSync()`                       | Saves immediately and blocks until done. Only for Windows shutdown or log-off.                                                                                                  |
| `update(patch)` _(private)_         | Applies a change, stamps the time and restarts the save timer. This is the "debounce": saving waits until you pause typing.                                                     |
| `write(snapshot, seq)` _(private)_  | Writes one snapshot. Each write has a sequence number, and an older write that finishes after a newer one is thrown away, so the file always ends up with the latest text.      |
| `toFile()` _(private)_              | The notes plus the file format version.                                                                                                                                         |
| `setAsideCorruptFile()` _(private)_ | Renames a damaged `notes.json` out of the way.                                                                                                                                  |
| `clearTimer()`, `now()` _(private)_ | Small helpers.                                                                                                                                                                  |
| `samePath(a, b)` _(private)_        | Compares file paths ignoring upper/lower case (Windows paths aren't case-sensitive).                                                                                            |

### `storage/jsonFile.ts`: safe JSON files

| Name                                       | What it does                                                                                                                                                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ReadResult`                               | What reading returns: `ok` with the value, `missing`, or `invalid`.                                                                                                                                                                                |
| `readJsonFile(path, schema)`               | Reads a JSON file and checks it against a schema.                                                                                                                                                                                                  |
| `writeJsonFile(path, value, shouldCommit)` | Saves safely: writes a temporary file first, then renames it over the real one, so a crash mid-save can never leave a half-written file. `shouldCommit` lets the caller cancel at the last moment (used by `NotesStore` to drop overtaken writes). |
| `writeJsonFileSync(path, value)`           | The same, but blocking (for shutdown).                                                                                                                                                                                                             |
| `renameWithRetry()` _(private)_            | Retries the rename a few times if Windows reports the file as briefly locked (antivirus and the search indexer do this).                                                                                                                           |
| `isErrno(err, code)`                       | Checks whether an error has a particular code, e.g. `ENOENT` (file not found).                                                                                                                                                                     |

### `screenshots/ScreenshotService.ts`: capturing and serving screenshots

| Name                     | What it does                                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capture()`              | Finds the display the bubble is on, captures it at full resolution with Electron's `desktopCapturer`, and saves it as a PNG in `Pictures\Desktop Assist`. Returns the file path. |
| `latest()`               | The newest screenshot in the folder (for "Attach latest").                                                                                                                       |
| `thumbnail(path)`        | A small preview image (as a data URL) for a chip, or `null` if the file is gone. Previews are cached (up to 50), and the cache notices if the file has changed.                  |
| `open(path)`             | Opens a screenshot in your default image viewer. Returns `false` if it no longer exists.                                                                                         |
| `openFolder()`           | Opens the screenshots folder in Explorer (creating it if needed).                                                                                                                |
| `owns(path)` _(private)_ | Security check: pages may only ask about files inside the screenshots folder.                                                                                                    |

### `screenshots/files.ts`: screenshot file handling

No Electron, so it's unit-tested.

| Name                             | What it does                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `screenshotFileName(date, copy)` | `Screenshot 2026-10-02 140311.png` (no characters Windows forbids), or `… (2).png` for a second capture within the same second. |
| `isScreenshotFileName(name)`     | Is this one of our screenshot names? (Other files in the folder are ignored.)                                                   |
| `saveScreenshot(dir, png, date)` | Saves the image without ever overwriting an existing file.                                                                      |
| `findLatestScreenshot(dir)`      | The most recently written screenshot, or `null` if there are none.                                                              |
| `isInsideDir(dir, file)`         | Is `file` really inside `dir`? Blocks tricks like `..\..\somewhere-else`.                                                       |

### `settings.ts`: the Settings menu's options

| Name                     | What it does                                                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SettingsService.init()` | The first time an _installed_ copy runs, turns on Start with Windows and records that it did (in `preferences.json`), so it never overrides your choice later. Does nothing in dev runs. |
| `get()`                  | The current settings. Start with Windows is read live from Windows, so changes made in Windows Settings → Apps → Startup show up too.                                                    |
| `setAutoStart(enabled)`  | Turns Start with Windows on or off (installed builds only).                                                                                                                              |

### `tray.ts` and `trayIcon.ts`: the tray icon

| Name                         | What it does                                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createTray(options)`        | Adds the tray icon with a tooltip and a menu (Open, Quit). Clicking the icon opens the panel.                                                             |
| `circleBitmap(size, colour)` | Draws a smooth filled circle in the accent colour, pixel by pixel, in the raw format Electron expects. Used as the tray icon until a tenant provides one. |
| `parseHexColor(hex)`         | Turns `#1B6AC9` into red, green and blue numbers.                                                                                                         |

---

## 8. Preload (`src/preload`)

### `index.ts`

| Name                                             | What it does                                                                                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subscribe(channel, callback)`                   | Listens for a message from the main process and returns a function that stops listening.                                                                       |
| `api`                                            | The `AssistApi` implementation. Each function sends the matching IPC message.                                                                                  |
| `contextBridge.exposeInMainWorld('assist', api)` | Makes `api` available to the page as `window.assist`. This is the **only** way the page can reach the main process; it can't load Node modules or touch files. |

---

## 9. Renderer (`src/renderer`)

The UI, written in React and styled with Tailwind CSS.

### Entry files

| File                        | Purpose                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`                | The page both windows load. Its Content-Security-Policy only allows the app's own scripts and styles and inline images, so nothing from the internet can run. |
| `src/main.tsx`              | Reads `?view=` from the URL and renders either `BubbleView` or `PanelView`.                                                                                   |
| `src/styles.css`            | Loads Tailwind, defines the `accent` colour and font, and makes the page background transparent.                                                              |
| `src/env.d.ts`              | Tells TypeScript that `window.assist` exists and what it looks like.                                                                                          |
| `src/lib/cn.ts` → `cn(...)` | Joins CSS class names, skipping empty ones.                                                                                                                   |

### Hooks (`src/hooks`)

React _hooks_ are reusable pieces of component logic.

| Name                     | What it does                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useAssistState()`       | Fetches the app state when the page loads and keeps `mode` up to date as it changes. Returns `null` until loaded.                                                                                                                                                                                                                                                 |
| `useAccentColor(colour)` | Applies the tenant's accent colour to the page.                                                                                                                                                                                                                                                                                                                   |
| `useClickThrough()`      | The page half of click-through: on every pointer move, checks whether the pointer is over a `data-hit` element and tells the main process (only when that changes). Re-checks after clicks, since a menu closing can change what's under a still pointer. On load, it resets the window to click-through in case a previous copy of the page left it interactive. |
| `useToast()`             | Shows one short message for 2.6 seconds; a new message replaces the old.                                                                                                                                                                                                                                                                                          |
| `useThumbnail(path)`     | Loads a screenshot preview: `undefined` while loading, `null` if the file is missing.                                                                                                                                                                                                                                                                             |

### Views (`src/views`)

| Name                                          | What it does                                                                                                                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BubbleView`                                  | The round logo button. Finds the tenant's logo (`logo.png` if present, otherwise `logo.svg`), draws an accent ring while the panel is open, and sends clicks to the main process. |
| `PanelView`                                   | Waits for the app state, then renders `Panel`.                                                                                                                                    |
| `Panel`                                       | Everything around the bubble. Holds the text, attachments, save status, settings and whether the menu is open, and fades in or out with the mode. Its functions:                  |
| ↳ `runAction(id)`                             | Settings toggles the menu (refreshing the settings first); anything else is sent to the main process, and any message comes back as a toast.                                      |
| ↳ `changeText(text)`                          | Updates the box, shows "Saving…" and sends the text to be saved.                                                                                                                  |
| ↳ `attachLatest()`                            | Asks for the newest screenshot to be attached, or shows why it couldn't be.                                                                                                       |
| ↳ `removeAttachment(a)` / `openAttachment(a)` | The chip's × and click actions.                                                                                                                                                   |
| ↳ `clearTextBox()`                            | Clears everything after the menu's double-click confirmation.                                                                                                                     |
| ↳ `closeSettingsOnOutsideClick(e)`            | Closes the menu when you click elsewhere in the panel.                                                                                                                            |
| ↳ Esc key handler                             | Esc closes the menu if it's open, otherwise the panel.                                                                                                                            |

### Components (`src/components`)

| Name              | What it does                                                                                                                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ActionStack`     | The icon buttons above the bubble, in the tenant's order, popping out one after another when the panel opens. The Close icon turns red on hover, and the active one (Settings while its menu is open) is filled with the accent colour. |
| `SettingsMenu`    | The menu beside the gear: the Start with Windows switch (greyed out with an explanation in dev runs), Open screenshots folder, Clear text box (needs a second click within 3 seconds), and the app version.                             |
| ↳ `MenuItem`      | One menu row with an icon.                                                                                                                                                                                                              |
| ↳ `Switch`        | The on/off toggle graphic.                                                                                                                                                                                                              |
| `NotesBox`        | The text box: attachment chips along the top, the auto-growing text area, and a footer with "Attach latest screenshot" and the save status. Also shows toasts just above itself. Focuses the text area whenever the panel opens.        |
| ↳ `SaveIndicator` | "Saving…" or "✓ Saved".                                                                                                                                                                                                                 |
| `AttachmentChip`  | One attached screenshot: a thumbnail, a label like `Screenshot 14:03` (or "File missing"), click to open, × to remove.                                                                                                                  |

---

## 10. Tests (`tests`)

Run with `npm test`. Each file tests code that doesn't need a real window.

| File                       | What it checks                                                                                                                                                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout.test.ts`           | Home position (including a taskbar on the top or left), window sizes, and that the panel window lines up with the bubble and fits on screen.                                                                                                                |
| `bounce.test.ts`           | Launch direction and speed, bouncing off every edge, never leaving the screen over 5,000 random steps, long pauses not teleporting, and the glide timing and curve.                                                                                         |
| `bubbleController.test.ts` | The state machine with fake windows and a fake clock: open and close, fading, the blur-and-click gesture, bouncing and gliding home, opening from the tray mid-bounce, screenshot hide and restore (including when the capture fails), and display changes. |
| `notesStore.test.ts`       | Saving after a pause, reloading, immediate flush, overtaken writes, damaged files set aside, duplicate attachments, clear, and the length limit.                                                                                                            |
| `screenshotFiles.test.ts`  | File names, never overwriting, finding the newest screenshot while ignoring other files, and the inside-the-folder security check.                                                                                                                          |
| `format.test.ts`           | Chip labels for today, other days and unknown names.                                                                                                                                                                                                        |
| `tenants.test.ts`          | Every tenant folder has a valid `tenant.json` and a logo, and bad configs are rejected.                                                                                                                                                                     |
| `trayIcon.test.ts`         | The tray circle's colour, transparency and smooth edges.                                                                                                                                                                                                    |
