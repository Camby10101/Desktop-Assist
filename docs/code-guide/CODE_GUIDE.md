# Desktop Assist: Code Guide

A walk through the whole project: what every file is for, and the actual code of every function
and method with an explanation of what it does and why. Covers Milestones 0 (Foundation), 1
(Chat with Claude), 2.1 (bubble fixes) and 3 (JumpCloud sign-in), and features 3.1 (questions go
to Claude Desktop) and 3.2 (the Apps list, Uninstall in Settings, and fixes), and Milestone 4 so
far (app logos fixed, favourite apps, the IT service desk icon, light or dark mode, and a fix
for clicks on the bubble).

This page is the overview. The code itself is in the [code walkthrough](#6-code-walkthrough),
one page per area of the app.

Contents:

1. [Background: how an Electron app is put together](#1-background-how-an-electron-app-is-put-together)
2. [How the pieces work together](#2-how-the-pieces-work-together)
3. [Repository root](#3-repository-root)
4. [Tenants (branding)](#4-tenants-branding)
5. [Desktop app configuration](#5-desktop-app-configuration)
6. [Code walkthrough](#6-code-walkthrough)
7. [Tests (`tests`)](#7-tests-tests)

---

## 1. Background: how an Electron app is put together

An Electron app is a Chromium browser and Node.js bundled together. It runs as several
processes, and the code is split the same way:

- **Main process** (`apps/desktop/src/main`): Node.js, one per app. Creates the windows, reads
  and writes files, owns the tray icon and screen capture, and talks to JumpCloud and Claude (or
  hands questions to the Claude Desktop app).
- **Renderer** (`apps/desktop/src/renderer`): Chromium, one per window. Draws the UI with
  HTML, CSS and React. It **cannot** touch files, the network or the operating system.
- **Preload** (`apps/desktop/src/preload`): runs inside each renderer before the page loads,
  and hands the page a small, safe set of functions (`window.assist`).
- **Shared** (`apps/desktop/src/shared`): bundled into all three. Types and constants every
  side must agree on.

The renderer and the main process talk over **IPC** (inter-process communication): the
renderer sends a named message (a _channel_), and the main process handles it and optionally
replies. The main process can also push messages to the renderer, for example each chunk of a
streaming Claude reply. Every channel is listed in `src/shared/ipc.ts`.

**Why two windows?** The bubble and the panel are separate, transparent, always-on-top windows.
Both load the same web page; the URL's `?view=bubble` or `?view=panel` decides which UI it
shows. Keeping the bubble in its own tiny window means it never resizes (no flicker when the
panel opens), and only a 72×72 window moves around during Bounce.

**Click-through.** The panel window is a large rectangle, but most of it is transparent. So
that you can still click whatever is underneath those empty areas, the panel window starts out
_ignoring the mouse_. Windows still forwards pointer movement to the page, and while the pointer
is over a real piece of UI (anything marked `data-hit`), the page asks the main process to switch
mouse input back on. Each time the panel is shown, this is reset from the pointer's actual
position. The bubble window is **not** click-through: it's barely bigger than the bubble, and
depending on Windows' mouse forwarding there made clicks occasionally fall through the bubble
to the window behind it.

**Two ways to chat.** Each tenant chooses where questions go (`chatApp` in `tenant.json`). With
**Claude Desktop** (Morse Micro, since 3.1), the panel is just a text box: asking opens a new chat
in the Claude Desktop app with the question typed in, in the person's own Claude account, so it
counts against their own usage limit, and (unless the user turns it off) presses Enter there to send
it. Desktop Assist then has no sign-in and doesn't call Claude itself. With the **built-in chat**,
the conversation happens in the panel, as described next.

**The built-in chat: where Claude is called, and how you're signed in.** Only the main process
talks to JumpCloud and to Claude. You sign in with JumpCloud in your browser; the app keeps the
resulting _refresh token_ (a long-lived "stay signed in" pass) encrypted on disk. To call Claude
it swaps a JumpCloud _ID token_ (a short-lived, signed statement of who you are) for a
short-lived Claude token, using Anthropic's Workload Identity Federation. There is no API key.
The pages only ever learn whether you're signed in and your name, never a token.

**The Apps list.** If the tenant has an app portal, the card can show the apps in the user's
JumpCloud User Portal, either as soon as the panel opens (Morse Micro, with the text box behind an
Ask Claude icon) or behind an Apps icon. They come from JumpCloud's "MCP Server for Users", which
each person connects to once in the browser (OAuth, with no secret in the app). Again, only the main
process talks to JumpCloud, and the pages never see a token.

---

## 2. How the pieces work together

**Starting up** (`src/main/index.ts` → `start()`)

1. Validate `tenant.json`, create the bubble and panel windows (both hidden), load the saved
   draft from disk, and load preferences.
2. Create the `BubbleController` (the bubble's state machine) and the `ScreenshotService`. Then,
   depending on the tenant's `chatApp`, either a `ClaudeDesktop` (which hands questions to
   Claude Desktop) or the built-in chat (`startBuiltInChat()`: the Claude backend, the
   `ChatSession` and the `AuthManager`). With a `portal`, also `PortalApps` (the Apps list), which
   starts loading the list in the background. Then the IPC handlers and tray.
3. With the built-in chat, **renew the saved sign-in** (`auth.init()`): if there isn't one, or
   JumpCloud refuses it, the chat box shows **Sign in with JumpCloud** instead of the chat. If
   JumpCloud can't be reached, the sign-in is kept and a banner offers Retry.
4. Once both pages have painted, `controller.start()` shows the bubble in its saved corner (bottom-right of the main display the first time).

**Asking in Claude Desktop** (when the tenant's `chatApp` is `claude-desktop`)

1. Enter or **Ask in Claude** → `Panel.askInClaudeDesktop()` → IPC `assist:claude-desktop-ask`
   with the text → `ClaudeDesktop.ask()`.
2. `ask()` checks there's a question, that it's at most 12,000 characters (Claude Desktop cuts
   longer ones short), and that Claude Desktop is installed (something opens `claude://` links).
3. Any attached screenshots are copied to the clipboard as one image
   (`ScreenshotService.forClipboard()` stacks several).
4. The link `claude://claude.ai/new?q=…` opens a new chat in Claude Desktop with the question
   typed in but not sent. `ask()` returns, and the panel closes and the draft is cleared.
5. In the background (`ClaudeDesktop.finish()`), with **Send in Claude automatically** on and a
   question typed, `sendInClaude()` runs a hidden PowerShell helper. Using Windows UI Automation,
   it waits until the focused text box belongs to Claude Desktop and holds exactly the question,
   then presses Ctrl+V (if there's a screenshot) and Enter, checking again before each key.
   Claude answers.
6. If it can't send (or the setting is off, or there's only a screenshot), nothing is pressed
   anywhere else, and a Windows notification says what's left: press Ctrl+V to add the
   screenshot, or press Enter in Claude. If Claude's box already had other text in it (an unsent
   draft), nothing is pressed either, and the notification asks the user to check the question.
   Clicking a notification opens the panel.

**Your apps** (when the tenant has a `portal`; see [Your apps](10-apps.md))

1. At startup, `PortalApps` connects to JumpCloud's MCP server with the saved sign-in, calls its
   `list_applications` tool, fetches the logos and broadcasts the list (`assist:apps-state`).
2. The panel shows the list when it opens (with `"startPage": "apps"`, as for Morse Micro) or when
   the Apps icon is clicked, and asks for it then (`window.assist.apps.get()` → IPC
   `assist:apps-get` → `PortalApps.get()`), getting the list already loaded. The **Ask Claude**
   icon swaps the list for the text box and back; a dot on it means an unsent question is waiting
   there. Closing the panel (or Esc) goes back to the start page; taking a screenshot leaves the
   card on the page it was showing.
3. With no saved sign-in, the list offers **Sign in with JumpCloud**: the browser opens
   JumpCloud's sign-in page and comes back to `127.0.0.1:47622/callback`, and the MCP SDK
   registers the app, swaps the code for tokens (PKCE, no secret) and saves them encrypted
   (`jumpcloud-apps.bin`). The panel reopens on the list.
4. Clicking an app → `PortalApps.open()` calls `launch_application` for its sign-in link and
   opens it in the browser; the panel closes.
5. The star on a tile → `settings.setFavoriteApp()` saves the app's ID (`favoriteApps` in
   `preferences.json`), and the list shows starred apps first (`orderApps()`).

**IT service desk** (when the tenant has a `serviceDesk`)

Headset icon → `Panel.runAction('servicedesk')` → IPC `assist:invoke-action` → the `servicedesk`
handler in `src/main/actions.ts` opens the service desk's address from `tenant.json` in the
browser, then closes the panel.

**Uninstall**

Settings → **Uninstall Desktop Assist** (click twice) → IPC `assist:app-uninstall` →
`uninstall()` in `src/main/uninstall.ts` turns off Start with Windows, starts the installer's
"Uninstall Desktop Assist.exe" and quits. The data folder and screenshots are kept.

The rest of this section, up to **Typing in the text box**, is the built-in chat.

**Signing in**

1. **Sign in with JumpCloud** (`SignInPanel`) → `window.assist.auth.signIn()` → IPC
   `assist:auth-sign-in` → `AuthManager.signIn()`. The status becomes `signing-in` and the panel
   says to finish in the browser.
2. `listenForRedirect()` starts a tiny web server on `127.0.0.1:47621`, only on this PC.
   `createOidc().begin()` builds the JumpCloud sign-in address, with a fresh PKCE code, `state`
   and `nonce`, and the app opens it in your default browser.
3. You sign in at JumpCloud (or you already are), and JumpCloud sends the browser back to
   `http://127.0.0.1:47621/callback?code=…`. The little server answers "You can close this tab"
   and shuts down.
4. `finish()` swaps the code (plus the PKCE secret that only this app knows) for tokens, and
   checks the ID token. The refresh token and your name are saved encrypted
   (`SecretStore`, Windows DPAPI). The status becomes `signed-in` and the chat box reopens.

**Getting Claude access** (happens inside the Anthropic SDK, the first time you send a message
and then roughly hourly)

1. The SDK needs a Claude token, so it asks `AnthropicBackend`'s identity-token function, which
   calls `AuthManager.freshIdToken()`.
2. That returns the unused ID token from signing in or starting up, or, if it has been used,
   refreshes with JumpCloud for a new one (saving JumpCloud's replacement refresh token).
3. The SDK posts the ID token to Anthropic's `/v1/oauth/token`. Anthropic checks it against the
   federation rule set up in the Claude Console and returns a short-lived Claude token, which the
   SDK uses for chat requests until shortly before it expires.

**Sending a message**

1. Enter in the text box → `Panel.send()` → IPC `assist:chat-send` with the text.
2. The main process collects the draft's attached screenshots, shrinks each one for Claude
   (`ScreenshotService.forClaude()`), and calls `ChatSession.send()`, then clears the draft.
3. `ChatSession` appends your message to the conversation history and starts a reply:
   `AnthropicBackend.reply()` streams it from the Claude API.
4. As text arrives, `ChatSession` updates the reply and broadcasts it (`assist:chat-message`,
   batched to at most one update every 50 ms). The page re-renders it as Markdown.
5. When the reply finishes, the whole reply (including Claude's hidden thinking blocks) is
   appended to the history unchanged, ready to be sent back with the next message.

**Stop, errors and Retry**

- **Stop** aborts the request. Text that already arrived stays on screen and is added to the
  history as a plain-text reply (the history is only ever added to, never edited; see
  `ChatSession`).
- **A temporary error** (offline, overloaded) before any text arrived shows the reason and a
  **Retry** button, which sends the same conversation again.
- **The sign-in has expired** (JumpCloud refuses the refresh): `AuthManager` signs out, and the
  chat box shows Sign in with JumpCloud with an explanation. The conversation is kept, and the
  failed message offers Retry once you're signed back in.
- **Anthropic refuses the swap** (the federation rule doesn't accept you): the message explains
  that IT needs to set you up.

**Typing in the text box**

`Composer` textarea → `Panel.changeDraft()` → `window.assist.notes.setText()` →
`NotesStore.setText()`. The store keeps the draft in memory and writes `notes.json` about half a
second after you stop typing, so an unsent message survives a restart.

**Taking a screenshot**

Camera icon → `Panel.runAction('screenshot')` → IPC `assist:invoke-action` → the `screenshot`
handler in `src/main/actions.ts` → `BubbleController.whileHidden()` hides both windows, waits for
Windows to repaint, then `ScreenshotService.capture()` saves the PNG. The windows come back and
the page shows a "Screenshot saved" toast. **Attach latest screenshot** then adds it to the
draft as a chip, and it's sent with your next message (with Claude Desktop, put on the
clipboard and pasted into Claude).

**Bounce**

Bounce icon → `BubbleController.startBounce()` hides the panel and runs a 60 fps timer that
calls `bounce.step()` and moves the bubble window within its display. Clicking the bubble calls `glideHome()`,
which animates it back to the corner with `bounce.glidePosition()`.

**Light or dark mode**

Sun or moon icon → `Panel.runAction('theme')` → `window.assist.settings.setTheme()` → IPC
`assist:settings-set-theme` → `SettingsService.setTheme()` sets Electron's
`nativeTheme.themeSource`, which every page sees as `prefers-color-scheme`, so both windows switch
at once, and saves the choice. Desktop Assist is dark until the user switches, whatever Windows
uses; `SettingsService.init()` applies the saved mode before any window shows.

**Clicking the bubble**

`BubbleView` notes when the mouse button goes down, and on the click calls
`window.assist.bubbleClick(pressedAt)` → IPC `assist:bubble-click` →
`BubbleController.clickBubble(pressedAt)`. Collapsed, it opens the panel; open, it closes it.
Both windows can take the keyboard focus (a bubble that couldn't sometimes lost its mouse presses
on Windows), so pressing the bubble while the panel is open closes the panel as the button goes
down; the press time tells the controller that this click's job is done, and it doesn't reopen.

**Dragging the bubble**

1. `BubbleView` sees the mouse pressed on the bubble and moved more than 5 pixels → `window.assist.bubbleDragStart()` → `BubbleController.startDrag()`.
2. The controller notes where the bubble was grabbed and, 60 times a second, moves the bubble window to follow the mouse pointer (it reads the real pointer from the main process, which keeps it smooth across monitors with different scaling).
3. On release → `bubbleDragEnd()` → `endDrag()`: the display under the bubble is found, then the nearest of its four corners (`nearestCorner()`), and the bubble glides there.
4. The new anchor (display + corner) is saved to `preferences.json` and broadcast to the panel, which re-lays itself out to open toward the middle of the screen: in a left corner the chat opens to the right, in a top corner the icons drop below the bubble and the chat grows downward.

---

## 3. Repository root

- `package.json`: The npm _workspaces_ root. `apps/*` are the packages (only `apps/desktop` for now; a gateway service can be added beside it later). Its scripts (`dev`, `test`, `lint`, `typecheck`, `dist`) forward to the desktop app; `format` runs Prettier and `docs` refreshes the code walkthrough.
- `package-lock.json`: Exact versions of every installed package, so every machine installs the same thing. Generated by npm; don't edit by hand.
- `.gitignore`: Keeps `node_modules/`, build output (`out/`, `dist/`) and logs out of git.
- `.gitattributes`: Keeps line endings as LF in git and on disk, matching Prettier.
- `.prettierrc.json`: Code formatting rules (no semicolons, single quotes, 100-character lines). Run `npm run format` to apply. Code inside the docs' Markdown is left alone, because it's copied from the source.
- `.prettierignore`: Files Prettier must not touch (build output, the lock file).
- `README.md`: What the app does and how to run, test and build it.
- `docs/PLAN.md`: The plan: tech stack, architecture, milestones, decisions and open questions.
- `docs/code-guide/`: The Code Guide: this overview (`CODE_GUIDE.md`) and the code walkthrough pages (see section 6).
- `docs/CODE_GUIDE.pdf`: The whole Code Guide as one PDF, built from these pages by `npm run docs:pdf`.
- `scripts/code-guide.mjs`: Copies the real code into the walkthrough pages (`npm run docs`), and checks they're up to date (`npm run docs:check`, also run by `npm test`).
- `scripts/code-guide-pdf.mjs`: Builds `docs/CODE_GUIDE.pdf` from the pages (`npm run docs:pdf`).
- `docs/CLAUDE_DESKTOP_SETUP.md`: For IT: what each PC needs so questions open in Claude Desktop (Claude Desktop installed and signed in to the company account), and how to check it works.
- `docs/APPS_SETUP.md`: For IT: turning on JumpCloud's MCP Server for Users for the Apps list, and what each person does to connect.
- `docs/JUMPCLOUD_SETUP.md`: For IT, for the built-in chat only: how to create the JumpCloud app and the Claude Console federation, and which IDs to put in `tenant.json`.

---

## 4. Tenants (branding)

A _tenant_ is one business's branding. The build includes exactly one, chosen by the `TENANT`
environment variable (default `morse-micro`). This is what makes the app easy to re-brand later.

- `tenants/README.md`: How tenants work, and how to change the logo.
- `tenants/morse-micro/tenant.json`: `id` (must match the folder name), `companyName`, `appName` (also the name of the screenshots folder), `accentColor` (the highlight colour), `actions` (which icons appear above the bubble, from the bubble upward: for Morse Micro Ask Claude, the IT service desk, screenshot, light or dark mode, settings, bounce and close), `chatApp` (where questions go: `claude-desktop`, as for Morse Micro, or `built-in`, the default), `startPage` (what the panel opens on: `ask`, the text box, by default, or `apps`, the Apps list, as for Morse Micro, whose `actions` then include `ask` to reach the text box), `portal` for the Apps list (the portal's name, its address, JumpCloud's apps server and the sign-in port), `serviceDesk` for the IT service desk icon (its `https` address), and for the built-in chat only: optionally `systemPrompt` (extra instructions for Claude), `signIn` (JumpCloud's address, the app's JumpCloud client ID and the sign-in port) and `claudeAccess` (the Claude Console organization, federation rule, service account and optional workspace IDs). The built-in chat needs `signIn` and `claudeAccess`; Claude Desktop needs neither; the Apps list needs `portal`; the service desk icon (`servicedesk` in `actions`) needs `serviceDesk`. None of these are secret. See `docs/CLAUDE_DESKTOP_SETUP.md`, `docs/APPS_SETUP.md` and `docs/JUMPCLOUD_SETUP.md`.
- `tenants/morse-micro/logo.png`: The logo: the Morse Micro "Mμ" mark cut to a circle (512×512, transparent corners). It's the bubble, the tray icon and the `.exe` icon. A tenant can use `logo.svg` for the bubble instead (if both exist, the PNG wins), but then the tray falls back to a plain circle in the accent colour and the `.exe` gets Electron's default icon.

---

## 5. Desktop app configuration

All in `apps/desktop/`.

- `package.json`: The desktop app's own package. `productName` ("Desktop Assist") becomes the app's name and its `%APPDATA%` folder. `main` points Electron at the built main process. Scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `dist` (build the installer). Every library is a `devDependency` because the build bundles them; the installer ships no `node_modules`. `electron` is pinned to an exact version because the installer builder requires it.
- `electron.vite.config.ts`: Build config for electron-vite, which compiles the three parts (main, preload, renderer). Defines the import shortcuts `@shared` → `src/shared` and `@tenant` → `tenants/<TENANT>`, turns on React and Tailwind for the renderer, and minifies the renderer.
- `electron-builder.cjs`: Installer config: app ID, product name, include only the built `out/` folder, use the tenant's `logo.png` as the `.exe` icon, and build a per-user one-click NSIS installer (`Desktop Assist-Setup-<version>.exe`) into `dist/`. It's JavaScript rather than YAML so the icon can follow `TENANT`. `extraMetadata.name` makes the install folder `desktop-assist` (otherwise it would be named after the npm workspace).
- `tsconfig.json`: Points TypeScript at the two configs below.
- `tsconfig.node.json`: TypeScript settings for code that runs in Node: main, preload, shared, tests and config files. Strict mode on.
- `tsconfig.web.json`: TypeScript settings for the renderer (browser code with React/JSX).
- `vitest.config.ts`: Test runner config: the same `@shared`/`@tenant` shortcuts, run `tests/**/*.test.ts` in Node.
- `eslint.config.mjs`: Lint rules: recommended JavaScript and TypeScript rules everywhere, React Hooks rules for the renderer, and Prettier compatibility.

---

## 6. Code walkthrough

Each page goes through its files in order. For every function, method, class and type it shows
the real code, with a link to the exact lines on GitHub, then explains what it does and why,
with notes on the lines that need them. Read them in order the first time; after that, jump to
the area you're working on.

1. [Shared code and the preload bridge](1-shared-and-preload.md):
   `src/shared` (sizes and layout constants, the action list, data types, the IPC contract, chip labels, the Claude Desktop download link, the Apps list's order) and `src/preload` (the `window.assist` bridge between the pages and the main process).
2. [Main process: startup, IPC and app plumbing](2-main-startup.md):
   `index.ts` (startup and shutdown, and choosing the built-in chat or Claude Desktop), `ipc.ts` (handling requests from the pages), `actions.ts`, `uninstall.ts`, `tenant.ts`, `settings.ts`, the tray icon.
3. [JumpCloud sign-in](3-sign-in.md):
   `auth/` (`AuthManager`, OpenID Connect with JumpCloud, the loopback listener) and `storage/SecretStore.ts`.
4. [Talking to Claude](4-claude.md):
   `claude/` (the model settings, `AnthropicBackend`, error handling, `ChatSession`).
5. [The bubble](5-bubble.md):
   `bubble/` (`BubbleController`, the layout maths, bounce physics, creating the windows).
6. [The draft, screenshots and safe files](6-drafts-and-screenshots.md):
   `notes/NotesStore.ts`, `screenshots/` (including stacking several screenshots into one image for the clipboard), `storage/jsonFile.ts`.
7. [The pages: entry points, styles, hooks and views](7-renderer-pages.md):
   `src/renderer`: `index.html`, `main.tsx`, `styles.css`, `lib/`, `hooks/`, `BubbleView`, `PanelView`.
8. [The UI components](8-renderer-components.md):
   `src/renderer/src/components`: the chat box, messages, Markdown, sign-in panel, settings menu, action icons, screenshot chips.
9. [Claude Desktop: handing questions over](9-claude-desktop.md):
   `claudeDesktop.ts` (feature 3.1: opening a question in the Claude Desktop app with a link, the screenshots on the clipboard, the notifications, checking it's installed), `sendInClaude.ts` (sending the question there: a hidden PowerShell helper that uses Windows UI Automation to find Claude's text box, then presses Ctrl+V and Enter) and what's tested.
10. [Your apps: the JumpCloud apps list](10-apps.md):
    `apps/` (`portalData.ts` reading JumpCloud's answers, `PortalApps.ts` with the list, the OAuth connection and opening apps, `mcp.ts` on the MCP SDK) and `AppsList.tsx`, the list in the panel.

**Keeping it current.** The code on these pages is not typed by hand: each block is a marker
like `<!-- code: apps/desktop/src/main/ipc.ts#registerIpc -->` that `npm run docs` fills from the
source. After changing code, run `npm run docs`; `npm test` fails if a page shows code that no
longer matches. When you add a new function, add a marker and a short explanation for it on the
right page. The explanations are written by hand, so check they still hold when behaviour
changes. Then `npm run docs:pdf` rebuilds `docs/CODE_GUIDE.pdf`, the whole guide as one PDF.

---

## 7. Tests (`tests`)

Run with `npm test`. Each file tests code that doesn't need a real window or a real API.

- `layout.test.ts`: Home positions in all four corners (including displays not at the origin), nearest-corner snapping, window sizes, and that the panel window opens into the screen and fits on it in every corner.
- `bounce.test.ts`: Launch direction (away from each corner) and speed, bouncing off every edge, never leaving the screen, and the glide.
- `bubbleController.test.ts`: The bubble state machine with fake windows, a fake clock and two fake displays: open/close, blur (including staying open when another app takes the focus back just as it opens), clicking the bubble (staying closed when the press on the bubble is what closed the panel, even for a slow click, and reopening straight away after clicking somewhere else, however quick), logging a click ignored while capturing, the saved corner, dragging (follows the mouse, snaps to the nearest corner, onto another display, panel re-placed), bouncing on the current display, screenshots, and display changes (including unplugging the bubble's display).
- `notesStore.test.ts`: Saving the draft, reloading, overtaken writes, damaged files, attachments.
- `screenshotFiles.test.ts`: Screenshot names, never overwriting, finding the newest, the inside-the-folder check.
- `screenshotStack.test.ts`: Stacking screenshots into one image for the clipboard: the width they're scaled to (the narrowest, capped), the order and the grey band between them (checked pixel by pixel), a single image left as it is, and refusing different widths, padded rows or an empty list.
- `format.test.ts`: Chip labels.
- `tenants.test.ts`: Every tenant folder has a valid `tenant.json` and a logo; `chatApp` defaults to the built-in chat, which needs `signIn` and `claudeAccess`, while Claude Desktop needs neither (and an unknown `chatApp` is refused); the Apps icon needs `portal`, whose address must be `https`; starting on the Apps list needs `portal` and the `ask` action; the service desk icon needs an `https` `serviceDesk` address; the list of missing sign-in settings.
- `trayIcon.test.ts`: The tray circle.
- `chatSession.test.ts`: The conversation with a scripted fake backend: streaming, images before text, replaying replies unchanged (thinking included), busy/empty/signed-out, Stop with and without text, Retry, an expired sign-in, refusals and length limits, the tool loop, and New conversation ignoring a late reply.
- `authManager.test.ts`: The sign-in with a fake JumpCloud (whose refresh tokens work once, like the real one): not set up, nothing saved, renewing at startup and saving the replacement token, offline and Retry, a refused sign-in, browser sign-in, Cancel, no refresh token, a port in use, handing out a different ID token each time, never refreshing twice at once, skipping an almost-expired ID token, Log out (revoking), and logging out during a renewal.
- `claudeDesktop.test.ts`: Handing questions to Claude Desktop, with fakes that record the order of events: the link (the documented `q`, spaces as `%20`, any text round-trips, no `q` without text), the two notifications' wording, copying screenshots before opening Claude and notifying only when there were some, a screenshot-only question, an empty question, the 12,000-character limit, Claude Desktop not installed, a missing screenshot, and a link or clipboard that fails (logged, no notification). With "Send in Claude" on: sending (pasting first when there's a screenshot) with nothing more said, `ask()` returning while sending carries on, the right notification when Claude never showed the question or the screenshot was pasted but not sent, a helper that couldn't run (logged, then the notification), never sending a screenshot on its own, and sending nothing (with a "check your question" notification) when Claude's box already had other text.
- `portalApps.test.ts`: The Apps list: reading JumpCloud's answers (sorted by name, hidden apps skipped, a bare list or structured content, no list versus an empty one, `https` links only, the launch tool's ID argument, the sign-in link in a launch answer), telling images by their first bytes, fetching logos (`https` images only, judged by their bytes rather than their label, so uploaded logos labelled `application/octet-stream` work and mislabelled HTML doesn't, and not too big), starred apps first (`orderApps`), keeping fetched logos across a refresh, and `PortalApps` against a fake portal: asking to sign in without opening the browser, signing in through the browser and saving the connection, remembering the list until Refresh, opening an app through its launch link, refusing a sign-in that comes back with the wrong `state`, and Cancel; plus `SavedAuth` as a public client that keeps only what it was given.
- `uninstall.test.ts`: Finding the uninstaller next to the app, turning off Start with Windows before starting it and then quitting, doing nothing in a dev run or without an uninstaller, and staying open when it couldn't start.
- `sendInClaude.test.ts`: The PowerShell helper's script, without running it: the question key (whitespace evened out, 60 characters), evening out Unicode spaces and fingerprinting the whole question (any extra text changes the hash), a question full of PowerShell code carried only as base64, no key pressed before Claude's box has been found to hold exactly the question, Ctrl+V only with a screenshot, the process name (another for tests, but nothing that could break out of its quotes), and reading the outcome from the last line printed.
- `loopback.test.ts`: The browser-return listener: catches `/callback` and stops, 404 for anything else, shows JumpCloud's error safely escaped, Cancel, timeout, and a port in use.
- `secretStore.test.ts`: Encrypted save and load, unreadable files, refusing to save without encryption, clear.
- `claudeHelpers.test.ts`: Error classification (including sign-in errors wrapped by the SDK and failed swaps), what can be retried, the system prompt, and image scaling.
- `codeGuide.test.ts`: The code shown in the walkthrough pages matches the source (runs `npm run docs:check`).
- `diagnostics.test.ts`: The ID token summary (the claims a federation rule checks, never the token), describing errors for the log, writing the log file and starting a new one when it gets large.
