# Desktop Wizard: Code Guide

A walk through the whole project: what every file is for, and the actual code of every function
and method with an explanation of what it does and why. Covers Milestones 0 (Foundation), 1
(Chat with Claude), 2.1 (bubble fixes) and 3 (JumpCloud sign-in), and features 3.1 (questions go
to Claude Desktop) and 3.2 (the Apps list, Uninstall in Settings, and fixes), and Milestone 4
(app logos fixed, favourite apps, the IT service desk icon, light or dark mode, and a fix for
clicks on the bubble), and Milestone 5 so far (a spinner while an app opens, Jira and the IT
service desk in the panel, and Check for updates, from version 1.0.0, the first release), and,
from version 2.0.0, the bubble as an animated character standing on the taskbar, who comes in
several sizes, casts spells from a Spells menu, and forms out of white motes as the app starts and
dissolves into them when it's closed. Version 2.0.0 had four spells (ten clones of herself, a
teleport, a starfall and an explosion); 2.1.0 adds six more (butterflies, fireworks, a blizzard, a
thunderstorm, a phoenix and a vortex). 2.2.0 adds a screen saver (every screen fades to white, then
she watches a pixel sunset from a hill, her back to us, while stars fall on the other screens),
two settings, Stand still and No idle animations, and Jira notifications that stay new until
they're opened or the page closes.

Desktop Wizard was called Desktop Assist up to version 1.0.0. A copy updated from then keeps its
settings and sign-ins: `src/main/formerName.ts` moves its data across on its first start. A few
names that copies of 1.0.0 depend on keep the old name: the app ID
(`com.morsemicro.desktopassist`), the install folder (`desktop-assist`), the text update signatures
sign (`desktop-assist-update …`), the release key's place and the `DESKTOP_ASSIST_*` environment
variables, and the npm package names (`@desktop-assist/…`). The GitHub repository kept the old name
until 2.1.1, when it was renamed `Camby10101/Desktop-Wizard`, where releases are now published;
copies that still ask for the old name follow it there (`ownDownloads()` in
`src/main/updates.ts`).

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
shows. Keeping the bubble in its own tiny window means it never resizes when the panel opens (no
flicker), and only a small window (96×104 at the character's usual size) moves around during a drag
or a walk. (The bubble is now a small animated character standing on the taskbar, but the code
still calls it the bubble.) Four more kinds of window come and go: `?view=clones`, for thirty
seconds when her Clones spell is cast, `?view=vision`, for the few seconds of one of the
character's habits, `?view=spell`, for the eight of her spells drawn over the screen (all but
Clones and Teleport), and `?view=screensaver`, one over the whole of each display while the screen
saver is on.

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
it. Desktop Wizard then has no sign-in and doesn't call Claude itself. With the **built-in chat**,
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

**Jira and the service desk.** If the tenant has an Atlassian site, a bell icon opens a Jira page:
who else assigned the user an issue or mentioned them lately, and a search of Jira and Confluence;
an issue opens in the card, where Claude can be asked about it. With the service desk's request
types, the service desk icon opens a page for raising an IT request (finished on the help centre
portal) and following the user's own requests. It all goes through Atlassian's Remote MCP server,
which each person connects to once in the browser, the same way as the Apps list (the shared code
is in `src/main/mcp/`).

---

## 2. How the pieces work together

**Starting up** (`src/main/index.ts` → `start()`)

1. Validate `tenant.json`, create the bubble and panel windows (both hidden), load the saved
   draft from disk, and load preferences.
2. Create the `BubbleController` (the bubble's state machine, with the character at the size
   saved last time), `Vision`, `SpellEffects` and `Clones` (the windows for her vision and her
   spells), the `castSpell` function behind the Spells menu, and the `ScreenshotService`. Then,
   depending on the tenant's `chatApp`, either a `ClaudeDesktop` (which hands questions to
   Claude Desktop) or the built-in chat (`startBuiltInChat()`: the Claude backend, the
   `ChatSession` and the `AuthManager`). With a `portal`, also `PortalApps` (the Apps list), which
   starts loading the list in the background. With `atlassian`, also `Atlassian` (Jira), which
   uses a saved connection if there is one and starts checking notifications; with the service
   desk's request types, also `ServiceDesk`; with `updates`, also an `Updater` for Check for
   updates. Then the IPC handlers and tray.
3. With the built-in chat, **renew the saved sign-in** (`auth.init()`): if there isn't one, or
   JumpCloud refuses it, the chat box shows **Sign in with JumpCloud** instead of the chat. If
   JumpCloud can't be reached, the sign-in is kept and a banner offers Retry.
4. Once both pages have painted, `controller.start()` stands the character on the taskbar in its saved corner (bottom-right of the main display the first time), shows it, and starts the wait for the first thing it does on its own. The bubble's page shows her forming out of white motes as it starts (her `appear` pose, `BubbleView`).

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
   opens it in the browser; the panel closes. Meanwhile a spinner turns over the app's logo; if
   JumpCloud takes more than 15 seconds, the link from the list is used instead.
5. The star on a tile → `settings.setFavoriteApp()` saves the app's ID (`favoriteApps` in
   `preferences.json`), and the list shows starred apps first (`orderApps()`).

**Jira** (when the tenant has `atlassian`; see [Jira and the service desk](11-atlassian.md))

1. The bell icon swaps the card to the Jira page. Without a saved connection it offers **Connect
   to Atlassian**: `Atlassian.signIn()` opens Atlassian's sign-in in the browser (through
   JumpCloud at Morse Micro), which comes back to `127.0.0.1:47623/callback`; the connection is
   saved encrypted (`atlassian.bin`) and the panel reopens.
2. Once connected, and then every 5 minutes, `Atlassian` searches Jira for issues recently
   assigned to the user or mentioning them, reads each one's history and comments to see who did
   it, checks the user's service desk requests, and broadcasts the result (`assist:jira-feed`).
   What the user has seen is remembered in `atlassian.json`; new notifications put a dot on the
   bell, and IT replying to a request gives a Windows notification once. A notification stays new
   until it's opened (`markNotificationsRead(id)`), and the rest count as seen once the Jira page
   closes, for another page or with the panel (`PanelView`); the same goes for requests' news and
   the service desk page.
3. Clicking an issue (from Notifications, Search, My requests, or **Open** beside an issue key
   typed in the text box) → `Atlassian.issue()` → `IssueView` over the page, with its comments.
   **Move**, **Comment** and **Log time** each make one tool call and show the issue as it is now.
   **Ask Claude** builds a question with the issue in it (`issuePrompt()`) and hands it to Claude
   Desktop, as if typed in the text box.

**IT service desk** (when the tenant has a `serviceDesk`)

Without request types: headset icon → `Panel.runAction('servicedesk')` → IPC
`assist:invoke-action` → the `servicedesk` handler in `src/main/actions.ts` opens the service
desk's address from `tenant.json` in the browser, then closes the panel.

With request types (`serviceDesk.requests`, as for Morse Micro), the icon, or **Report to IT** under
the text box, opens the service desk page instead. **New request** starts from the text box (its
first line as the summary), shows the PC's details and IT's how-to articles, and **Continue on the
portal** → IPC `assist:service-desk-raise` → `ServiceDesk.raise()` copies the text box's
screenshots to the clipboard, opens the portal's create-request form already filled in (the
summary and description go in the address), and closes the panel; the user pastes the screenshot
and sends it there. **My requests** lists the user's requests, marked when IT has replied or changed
them.

**Uninstall**

Settings → **Uninstall Desktop Wizard** (click twice) → IPC `assist:app-uninstall` →
`uninstall()` in `src/main/uninstall.ts` turns off Start with Windows, starts the installer's
"Uninstall Desktop Wizard.exe" and quits. The data folder and screenshots are kept.

**Check for updates** (when the tenant has `updates`)

1. Settings → **Check for updates** → `window.assist.updates.check()` → IPC
   `assist:updates-check` → `Updater.checkAndInstall()` in `src/main/updates.ts`, which the call
   doesn't wait for; the menu row follows along through `assist:update-state`.
2. `Updater` asks GitHub's API for the tenant's repository's latest release
   (`Camby10101/Desktop-Wizard` for Morse Micro). With no release, or none newer than this copy
   (`app.getVersion()`), the row says it's up to date.
3. Otherwise it downloads the installer attached to the release (from the repository's own
   releases only) into `%TEMP%\Desktop Wizard update`, showing the percentage, and checks its size
   and SHA-256 against GitHub's, and its signature (the release's `.sig`) against the release
   key's public half in `tenant.json`; a file that doesn't match, or isn't signed, is deleted and
   never run.
4. It starts the installer on its own with `--updated /S --force-run` (an update, silently, and
   start the app again after), shows a Windows notification ("Updating to …") and quits. The
   installer waits for the app to close, replaces it and starts the new version; the user's data
   is kept. A development run stops after downloading.
5. Updated from Desktop Assist (1.0.0, before the app was renamed), the new version's first start
   renames `%APPDATA%\Desktop Assist` to `%APPDATA%\Desktop Wizard` (`adoptFormerData()` in
   `src/main/formerName.ts`), and `SettingsService.init()` moves "Start with Windows" from the old
   `.exe` to the new one (`adoptFormerLoginItem()`).

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
the page shows a "Screenshot saved" toast. **Attach screenshot** then adds it to the
draft as a chip, and it's sent with your next message (with Claude Desktop, put on the
clipboard and pasted into Claude).

**Size**

1. Settings (the gear) → **Size**, near the top of the settings menu (`SizeControl`), with Smaller
   and Bigger buttons. Each goes one step through `CHARACTER_SIZES` in `src/shared/geometry.ts`
   (from half her usual size to six times it), and no bigger than fits her screen (`nextSize()` in
   `lib/sizes.ts`).
2. A button → `window.assist.character.setSize()` → IPC `assist:character-set-size` →
   `BubbleController.setScale()`, then `SettingsService.setCharacterScale()` saves it
   (`characterScale` in `preferences.json`).
3. The controller keeps her to the biggest size at which her panel, with all its icons, still fits
   her display (`largestSize()`). She grows or shrinks where she stands, her feet on the taskbar,
   and both windows are resized to match (`bubbleMetrics()` and `panelLayout()` give everything's
   size and place at a size).
4. The new size is broadcast (`assist:size-changed`): the bubble's page draws her at it, and the
   panel moves the chat card and the icons out to suit. A smaller screen (or dropping her on one)
   shrinks her the same way, and she grows back to the size chosen once there's room again.

**Spells**

1. The wand icon → `Panel.runAction('spells')` opens the spells menu (`SpellsMenu`) beside it, with
   her ten spells (`SPELLS` in `src/shared/spells.ts`). Picking one closes the menu →
   `window.assist.character.castSpell()` → IPC `assist:character-cast-spell` → `castSpell` in
   `src/main/index.ts`, which closes the panel, so the spell can be seen, and casts it:
   - **Clones**: `Clones.start()` with where she stands (`BubbleController.standing`), while she
     does her little `spell` fidget (`BubbleController.act()`). `Clones`
     (`src/main/bubble/clones.ts`) opens one see-through window along the bottom of her display
     (`cloneStrip()`), which never takes the mouse or the focus, with where she stands, her size,
     the accent colour and when they end in its address (`?view=clones&…`). That window's page,
     `ClonesView`, draws ten of her at her size and moves them itself, each wandering up and down
     the taskbar and stopping now and then, sometimes to wave (`lib/clones.ts`). They fade in, and
     out just before `Clones` closes the window thirty seconds later. Casting it again before then
     starts a new lot.
   - **Teleport**: `BubbleController.teleport()`: she dissolves into white motes (`vanish`), her
     window moves somewhere else along the taskbar near her corner (`wander.walkTarget()`), and she
     forms out of the motes there (`appear`).
   - **The other eight** (Butterflies, Starfall, Fireworks, Blizzard, Thunderstorm, Phoenix, Vortex
     and Explosion): `SpellEffects.start(spell)` (`src/main/bubble/spellEffects.ts`) opens a
     see-through window over her display's work area (`?view=spell&…`), and she plays the pose that
     goes with the spell (`CAST_POSE` in `src/shared/spells.ts`, through
     `BubbleController.act()`): her little `spell` fidget, a twirl, levitating, a butterfly coming
     to her finger, or her chant. Its page, `SpellView`, draws the spell as pixel art on a canvas,
     with the drawing function `SPELL_ART` picks: starfall's and the explosion's in
     `lib/spellArt.ts` (from `lib/spellMotion.ts`), the rest a file each in `lib/spells/`, all a
     pixel at a time through `lib/pixels.ts`. So shooting stars streak down the screen for ten
     seconds, rockets burst over it, snow blows and frost creeps in, a storm rolls over with
     lightning, a bird of fire loops across, a portal swirls and implodes, or a swarm of butterflies
     flutters away.
   - **Explosion**, in particular: she chants for fifteen seconds while a pillar of magic circles
     rises above her, one after another, with a column of light and sparks; then the explosion goes
     off in the middle of the screen (a flash, a fireball, a shock wave and sparks). If someone
     clicks her or picks her up before the chant is done, it stops, and `onPoseChange` in
     `index.ts` calls the explosion off too (`SpellEffects.chanting`).
2. Anything the user does (a click, a drag) stops a spell's pose as it stops a fidget, and each
   effects window closes itself when its spell is over (`SPELL_EFFECT_MS`).

**Screen saver**

1. The sunset icon → `Panel.runAction('screensaver')` → IPC `assist:invoke-action` → the
   `screensaver` handler in `src/main/actions.ts` closes the panel and calls
   `ScreenSaver.start()` (`src/main/screenSaver.ts`).
2. `ScreenSaver` opens a window over the whole of every display (`?view=screensaver&…`), in front
   of the taskbar too (the `'screen-saver'` always-on-top level, set in `index.ts`), the one on her
   display taking the keyboard focus. Each page is told its scene (the sunset on her display, the
   stars on the others), when it started and the accent colour. Meanwhile
   `BubbleController.sleep()` has her dissolve into white motes and hides her window, and nothing
   can open the panel or pick her up.
3. Each page, `ScreenSaverView`, fades its screen to white over 1.5 seconds, then the scene in out
   of the white over 3.5 (`SCREEN_SAVER` in `src/shared/screenSaver.ts`), drawn as pixel art on a
   canvas by `lib/screensaver/`. On her screen: a banded evening sky with the sun setting behind
   rolling hills, clouds drifting, birds and fireflies, and her on the crest of the nearest hill,
   her back to us (her sprite's `back` pose, `gazeFrames()`), backlit, swaying in the breeze, her
   long shadow falling toward us. On the others: a night sky with stars falling without end.
4. Moving the mouse more than a few pixels, a click, a scroll, a key, or the window losing the
   focus → `window.assist.screensaver.wake()` → IPC `assist:screensaver-wake` →
   `ScreenSaver.wakeFrom()`, which listens only to its own pages. It tells every page to fade away
   (`assist:screensaver-end`), closes the windows 0.8 seconds later, and `BubbleController.wake()`
   shows her window again: she forms out of white motes where she stood and gets on with her day.
   Plugging in or unplugging a screen ends it the same way; quitting closes it at once.

**Closing**

The Close icon → `Panel.runAction('close')` → IPC `assist:invoke-action` → the `close` handler in
`src/main/actions.ts`, or the tray's **Quit** → `BubbleController.farewell()`: the panel closes,
and she dissolves into white motes where she stands (her `vanish` pose: each pixel turns white,
goes, and a share of them rise as motes and fade to silver; `FADE` in `character/rig.ts`). Clicks
and drags are ignored meanwhile. When she's gone, 0.9 seconds later, the app quits, through the
`before-quit` handler, which saves the draft.

**Light or dark mode**

Settings (the gear) → **Light mode**, at the top of the settings menu →
`Panel.toggleTheme()` → `window.assist.settings.setTheme()` → IPC
`assist:settings-set-theme` → `SettingsService.setTheme()` sets Electron's
`nativeTheme.themeSource`, which every page sees as `prefers-color-scheme`, so both windows switch
at once, and saves the choice. Desktop Wizard is dark until the user switches, whatever Windows
uses; `SettingsService.init()` applies the saved mode before any window shows.

**Stand still and No idle animations**

Settings → **Stand still** or **No idle animations**, under Size (both off to start with) →
`window.assist.settings.setHabits()` with the one that was flipped → IPC
`assist:settings-set-habits` → `SettingsService.setHabits()` saves it (`standStill` and `noIdles`
in `preferences.json`), then `BubbleController.setHabits()` applies it at once. With Stand still
on she never walks on her own, not even back to her corner after being dropped far from it
(`wander.nextActivity()` gives a rest instead of a walk); with No idle animations on she never
fidgets, and only strolls; with both, she just stands, breathing and blinking, and no timer runs at
all. Spells still work either way.

**Clicking the bubble**

`BubbleView` notes when the mouse button goes down, and on the click calls
`window.assist.bubbleClick(pressedAt)` → IPC `assist:bubble-click` →
`BubbleController.clickBubble(pressedAt)`. Collapsed, it opens the panel; open, it closes it. A
character that's walking stops where it is, and the panel opens beside it there.
Both windows can take the keyboard focus (a bubble that couldn't sometimes lost its mouse presses
on Windows), so pressing the bubble while the panel is open closes the panel as the button goes
down; the press time tells the controller that this click's job is done, and it doesn't reopen.

**The character on its own** (see [The bubble](5-bubble.md))

1. While the panel is closed, `BubbleController.scheduleActivity()` waits 8 to 20 seconds (5 to 12 the first time), then `doActivity()` asks `wander.nextActivity()` what to do.
2. Usually it's a walk: `walkTo()` moves the bubble window along the taskbar a frame at a time, to somewhere else within 240 DIPs of its corner (`wander.walkTarget()`; further, and faster, when she's bigger), with the pose `walk-left` or `walk-right`. Once nobody has done anything with the character for 30 seconds, it's more often than not a fidget instead (a hop, a wave, a stretch, a sip of tea, a vision (rarely), a curtsy, gazing into a crystal ball, reading her spellbook, a little spell, levitating over a magic circle, a sit on the taskbar, a twirl, a butterfly landing on her finger, a doze, a glance about, juggling three glowing orbs, blowing magic bubbles, a will-o'-wisp going round her, a sneeze that bursts into sparkles or a little dance, never the same one twice in a row), which lasts as long as `FIDGET_MS` in `src/shared/character.ts` says.
3. Each change of pose is broadcast (`assist:pose-changed`), and `Character` in the bubble's page plays the matching frames of pixel art, facing the middle of the screen (drawn by the rig in `character/rig.ts`, animated by `character/sprite.ts`).
4. For the vision, `index.ts` also opens a window above her, from the top of the screen down to her feet (`Vision` in `src/main/bubble/vision.ts`, `?view=vision`), where `VisionView` draws a light falling on her and the company's logo coming down it to hover over her head and rising away, while she looks up at it. Both follow the timetable in `VISION` (`src/shared/character.ts`). Any other pose closes that window, and it closes itself when the habit's time is up.
5. Any change of mode (a click, a drag, a screenshot, the panel closing) stops whatever the character was doing on its own, where it is, and starts the 30 seconds again.
6. The settings **Stand still** and **No idle animations** take the walks or the fidgets (or both) out of this (see above).

**Dragging the bubble**

1. `BubbleView` sees the mouse pressed on the character and moved more than 5 pixels → `window.assist.bubbleDragStart()` → `BubbleController.startDrag()`. The change of mode stops anything the character was doing on its own, and its pose becomes `dragged`, so it dangles.
2. The controller notes where the character was grabbed and, 60 times a second, moves the bubble window to follow the mouse pointer (it reads the real pointer from the main process, which keeps it smooth across monitors with different scaling).
3. On release → `bubbleDragEnd()` → `endDrag()`: the display under the character is found, then the bottom corner on the side of it the character is on (`nearestCorner()`), and how far along the taskbar from that corner it was let go (`insetAt()`). If that display is too small for her size, she shrinks to fit (`fitScale()`). It falls straight down onto the taskbar, speeding up as it goes (`fall()`, with `wander.fallPosition()`). If it lands further from the corner than its zone (240 DIPs at her usual size), it then walks back, unless Stand still is on.
4. The new anchor (display + corner) is saved to `preferences.json` and broadcast to the panel, which re-lays itself out to open toward the middle of the screen: near the bottom-left corner the chat opens to the right of the character instead of the left. The panel opens from wherever the character stands. The character, told too, turns to face the middle of the screen.

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
- `scripts/release-signing.mjs`: Makes the release key (`npm run release:key`, once) and signs each release's installer with it (the last step of `npm run dist`), so Check for updates will install it. The key itself lives outside the repository.
- `docs/CLAUDE_DESKTOP_SETUP.md`: For IT: what each PC needs so questions open in Claude Desktop (Claude Desktop installed and signed in to the company account), and how to check it works.
- `docs/APPS_SETUP.md`: For IT: turning on JumpCloud's MCP Server for Users for the Apps list, and what each person does to connect.
- `docs/ATLASSIAN_SETUP.md`: For IT: Jira and the service desk: what each person does to connect to Atlassian, what an Atlassian admin may need to allow, the `tenant.json` settings, and troubleshooting.
- `docs/RELEASING.md`: Releasing a new version: the release key, raising the version number, building and signing the installer, and publishing it as a GitHub release that Check for updates picks up; keeping releases safe, and what's locked down in the `.exe`.
- `docs/JUMPCLOUD_SETUP.md`: For IT, for the built-in chat only: how to create the JumpCloud app and the Claude Console federation, and which IDs to put in `tenant.json`.

---

## 4. Tenants (branding)

A _tenant_ is one business's branding. The build includes exactly one, chosen by the `TENANT`
environment variable (default `morse-micro`). This is what makes the app easy to re-brand later.

- `tenants/README.md`: How tenants work, and how to change the logo.
- `tenants/morse-micro/tenant.json`: `id` (must match the folder name), `companyName`, `appName` (also the name of the screenshots folder), `accentColor` (the highlight colour), `actions` (which icons appear above the bubble, from the bubble upward: for Morse Micro Ask Claude, Jira, the IT service desk, screenshot, settings (with light or dark mode, her size, Stand still and No idle animations), spells, the screen saver and close), `chatApp` (where questions go: `claude-desktop`, as for Morse Micro, or `built-in`, the default), `startPage` (what the panel opens on: `ask`, the text box, by default, or `apps`, the Apps list, as for Morse Micro, whose `actions` then include `ask` to reach the text box), `portal` for the Apps list (the portal's name, its address, JumpCloud's apps server and the sign-in port), `serviceDesk` for the IT service desk icon (its `https` address, and optionally `requests`: the IT portal's number, its Jira project's key and the request types, to raise requests from the panel), `atlassian` for Jira (the site, the sign-in port, the Confluence spaces with IT's how-to articles, and optionally the MCP server, which defaults to Atlassian's), `updates` for Check for updates in Settings (the GitHub repository releases come from, `Camby10101/Desktop-Wizard` for Morse Micro, and optionally GitHub's addresses), and for the built-in chat only: optionally `systemPrompt` (extra instructions for Claude), `signIn` (JumpCloud's address, the app's JumpCloud client ID and the sign-in port) and `claudeAccess` (the Claude Console organization, federation rule, service account and optional workspace IDs). The built-in chat needs `signIn` and `claudeAccess`; Claude Desktop needs neither; the Apps list needs `portal`; the service desk icon (`servicedesk` in `actions`) needs `serviceDesk`; the Jira icon (`jira`) needs `atlassian`. None of these are secret. See `docs/CLAUDE_DESKTOP_SETUP.md`, `docs/APPS_SETUP.md`, `docs/ATLASSIAN_SETUP.md` and `docs/JUMPCLOUD_SETUP.md`.
- `tenants/morse-micro/logo.png`: The logo: the Morse Micro "Mμ" mark cut to a circle (512×512, transparent corners). It's the tray icon (and would be the `.exe` icon without `icon.png`); the bubble on screen is now the animated character, not the logo, though the logo comes down to her in her vision habit (`VisionView`, which uses `logo.svg` when there's no `logo.png`). A tenant with only a `logo.svg` gets a plain circle in the accent colour in the tray and Electron's default icon for the `.exe`.

---

## 5. Desktop app configuration

All in `apps/desktop/`.

- `package.json`: The desktop app's own package. `productName` ("Desktop Wizard") becomes the app's name and its `%APPDATA%` folder (a copy updated from Desktop Assist has its old folder renamed to it; see `src/main/formerName.ts`). Its `name`, `@desktop-assist/desktop`, keeps the old name, as nothing outside the build sees it. `main` points Electron at the built main process. Scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `dist` (build the installer and sign it with the release key). Every library is a `devDependency` because the build bundles them; the installer ships no `node_modules`. `electron` is pinned to an exact version because the installer builder requires it.
- `electron.vite.config.ts`: Build config for electron-vite, which compiles the three parts (main, preload, renderer). Defines the import shortcuts `@shared` → `src/shared` and `@tenant` → `tenants/<TENANT>`, turns on React and Tailwind for the renderer, and minifies the renderer.
- `tenants/morse-micro/icon.png`: The app's icon: the logo wearing the character's hat, a little tilted, drawn from her own pixel art (512×512, transparent around it). electron-builder makes it the `.exe` icon, which Windows also shows for the Start menu shortcut, the installer and the uninstaller.
- `electron-builder.cjs`: Installer config: app ID, product name, include only the built `out/` folder, use the tenant's `icon.png` (or, without one, its `logo.png`) as the `.exe` icon, and build a per-user one-click NSIS installer (`Desktop Wizard-Setup-<version>.exe`) into `dist/`. It's JavaScript rather than YAML so the icon can follow `TENANT`. The app ID, `com.morsemicro.desktopassist`, is still the one from when the app was called Desktop Assist: Windows knows an install by it, so each new version installs over the old one, and it must not change. `extraMetadata.name` makes the install folder `desktop-assist` (otherwise it would be named after the npm workspace), which also stays as it was. `electronFuses` sets Electron's built-in switches in the `.exe`: it can't be run as plain Node or with `NODE_OPTIONS` or Node's debugger, it loads only `app.asar` and checks it against a checksum in the `.exe`, and cookies are encrypted on disk.
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
   `src/shared` (sizes and layout constants, the character's sizes and where things sit at each, the character's poses, the timetable of her vision and the numbers for her clones, her spells, their timings and the pose she casts each with, the screen saver's timings, the action list, data types (Stand still and No idle animations among the settings), the IPC contract, chip labels and "how long ago", the Claude Desktop download link, the Apps list's order, Jira issue keys) and `src/preload` (the `window.assist` bridge between the pages and the main process).
2. [Main process: startup, IPC and app plumbing](2-main-startup.md):
   `index.ts` (startup and shutdown, choosing the built-in chat or Claude Desktop, casting her spells, and the screen saver's windows), `formerName.ts` (carrying the data folder and "Start with Windows" over from the app's old name, Desktop Assist), `ipc.ts` (handling requests from the pages), `actions.ts`, `uninstall.ts`, `updates.ts` (Check for updates: the latest GitHub release, downloaded, checked against its signature and installed) with `scripts/release-signing.mjs` (signing releases), `debugging.ts` (no debugging in an installed copy), `tenant.ts`, `settings.ts`, the tray icon.
3. [JumpCloud sign-in](3-sign-in.md):
   `auth/` (`AuthManager`, OpenID Connect with JumpCloud, the loopback listener) and `storage/SecretStore.ts`.
4. [Talking to Claude](4-claude.md):
   `claude/` (the model settings, `AnthropicBackend`, error handling, `ChatSession`).
5. [The bubble](5-bubble.md):
   `bubble/` (`BubbleController`, with the character's size, Stand still and No idle animations,
   her spells' poses, the teleport, going away for the screen saver and saying goodbye as the app
   closes, the layout maths, `wander.ts` with what the character does on its own and how it falls,
   `clones.ts` with her clones' window, `vision.ts` with the window of her vision's light and logo,
   `spellEffects.ts` with the window of her spells' effects, creating the windows, and the check
   that keeps the bubble in front after starting), and `screenSaver.ts` (the screen saver's windows,
   one over every display).
6. [The draft, screenshots and safe files](6-drafts-and-screenshots.md):
   `notes/NotesStore.ts`, `screenshots/` (including stacking several screenshots into one image for the clipboard), `storage/jsonFile.ts`.
7. [The pages: entry points, styles, hooks and views](7-renderer-pages.md):
   `src/renderer`: `index.html`, `main.tsx`, `styles.css`, `lib/` (including how her clones wander), `hooks/`, `BubbleView` (the character's page, where she forms out of white motes as the app starts), `ClonesView` (her clones' page), `VisionView` (the light and the logo of her vision), `SpellView` (her spells' effects, drawn on a canvas), `ScreenSaverView` (the screen saver: the fade to white, her sunset or the starfall, and waking on any input), `PanelView` (including marking what's new on the Jira and service desk pages as seen when they close).
8. [The UI components](8-renderer-components.md):
   `src/renderer/src/components`: the chat box (a speech bubble with its tail pointing at her mouth, with its Open buttons for issue keys and Report to IT), messages, Markdown, sign-in panel, settings menu (with Light mode, her size: `SizeControl.tsx` and `lib/sizes.ts`, and the Stand still and No idle animations switches, each a `ToggleRow`), spells menu, action icons, screenshot chips, and the character, an original elf mage in pixel art drawn by code: `character/raster.ts` (a tiny rasteriser: shapes drawn straight onto the pixel grid, cel-shaded, with a broad shadow across the side away from the light, and outlined), `character/rig.ts` (her skeleton and the shapes on it, drawing one pose as a frame, with the shadows things cast on what is below them, dissolving her into white motes, and her seen from behind), `character/pictures.ts` (the parts drawn by hand: her whole self seen diagonally, and her face side on), `character/sprite.ts` (her animations: key poses and the in-betweens eased between them, about 25 frames a second, and her watching the sunset from behind for the screen saver), `Character.tsx` (playing a pose's frames at a given size, facing a given way, for the bubble and the clones) and `character.css` (the colours); then her spells' effects in pixel art: `lib/spellMotion.ts` (where the shooting stars, the magic circles and the blast are, moment by moment), `lib/pixels.ts` (drawing a pixel at a time on a `Painter`, so the effects can be drawn and tested away from a page), `lib/spellArt.ts` (drawing starfall and the explosion, and which spell draws what) and `lib/spells/` (the six newer spells, a file each: fireworks, the thunderstorm, the blizzard, the vortex, the butterflies and the phoenix); and last the screen saver's scenes in `lib/screensaver/`: `scene.ts` (dithered banded skies and rolling hills), `sunset.ts` (her sunset: the sky, the striped sun, clouds, hills, her spot and long shadow, birds and fireflies), `stars.ts` (the night sky and its endless shooting stars, for her other screens) and `her.ts` (her, backlit, with a rim of light).
9. [Claude Desktop: handing questions over](9-claude-desktop.md):
   `claudeDesktop.ts` (feature 3.1: opening a question in the Claude Desktop app with a link, the screenshots on the clipboard, the notifications, checking it's installed), `sendInClaude.ts` (sending the question there: a hidden PowerShell helper that uses Windows UI Automation to find Claude's text box, then presses Ctrl+V and Enter) and what's tested.
10. [Your apps: the JumpCloud apps list](10-apps.md):
    `apps/` (`portalData.ts` reading JumpCloud's answers, `PortalApps.ts` with the list and opening apps, `logos.ts` fetching the logos), `mcp/` (shared with Jira: `McpAccount.ts` with the OAuth connection and tool calls, `connector.ts` on the MCP SDK, `toolResult.ts` reading a tool's answer) and `AppsList.tsx`, the list in the panel.
11. [Jira and the service desk](11-atlassian.md):
    `atlassian/` (`jiraData.ts` reading Atlassian's answers and writing the queries, `Atlassian.ts` with the connection, the notifications and requests checked in the background and marked seen one at a time or all at once, search, and working on an issue) and `serviceDesk.ts` (raising an IT request on the help centre portal).
12. [The Jira and service desk pages](12-atlassian-pages.md):
    `PageParts.tsx` (pieces the pages share), `JiraPage.tsx` (Notifications, each marked seen as it's opened, and Search), `IssueView.tsx` (one issue: Ask Claude, Move, Comment, Log time) and `ServiceDeskPage.tsx` (New request and My requests).

**Keeping it current.** The code on these pages is not typed by hand: each block is a marker
like `<!-- code: apps/desktop/src/main/ipc.ts#registerIpc -->` that `npm run docs` fills from the
source. After changing code, run `npm run docs`; `npm test` fails if a page shows code that no
longer matches. When you add a new function, add a marker and a short explanation for it on the
right page. The explanations are written by hand, so check they still hold when behaviour
changes. Then `npm run docs:pdf` rebuilds `docs/CODE_GUIDE.pdf`, the whole guide as one PDF.

---

## 7. Tests (`tests`)

Run with `npm test`. Each file tests code that doesn't need a real window or a real API.

- `layout.test.ts`: Where the character stands: on the taskbar (its window's bottom edge on the work area's) in either bottom corner, a top corner meaning the bottom one below it, further along toward the middle by its inset but never off the work area, and on displays not at the origin; turning a position back into an inset (`insetAt`, `maxInset`); the bottom corner for each half of the screen, measured from the character's centre; window sizes (with room above for her hat, at her usual size and at twice it, and rounding the fractional positions of a fall or a walk); that the panel window shares the bubble window's corner (a top corner being the top of her padding, below that room) and fits on screen wherever the character stands in its half of the screen; her sizes (from half her usual size to six times it, each a whole number of DIPs, any number snapped to the nearest, her window and box growing up from her feet while keeping 16 DIPs from the side, the chat card and the actions moving out beside and above her, and the biggest size that lets her panel fit the screen, never less than the smallest); and the clones' strip along the bottom of the work area, as tall as her window. The expected positions are worked out from `UI.bubbleSize`, so the tests follow a change of size.
- `wander.test.ts`: What the character does on its own: the waits (shorter after settling, longer after that), only strolling until it's been left alone 30 seconds and then, more often than not, one of its fidgets (picked by a second roll: the first, the hop, for a roll of 0, the last, the dance, for a roll near 1, and the vision about a fifth as often as any other), never the same one twice in a row, where it walks to (somewhere else in its zone at least 40 DIPs away, toward its corner or away from it, back into the zone from beyond it, and the far end of a zone too small to choose from), walking at walking speed without passing the target, and the fall (as long as gravity takes, a short hop when dropped over the taskbar, speeding up and landing exactly where it stands); and, as Settings allow, resting instead of walking when she's to stand still (still fidgeting once left alone), only ever walking without her idle animations, and doing nothing with neither.
- `frontCheck.test.ts`: Reading the front check's answer, only digits taken as a window handle, what counts as needing help and how it's described, and the checks' timing: at 5 s, 20 s, 1, 3 and 10 minutes, silent while the bubble is in front, bringing it back (hidden and shown again only when it was behind something) and logging it, saying when it's still not in front, waiting while the bubble is open, logging a check that failed, and stopping.
- `bubbleController.test.ts`: The bubble state machine with fake windows, a fake clock and two fake displays: starting on the taskbar, the saved corner and display (a top corner saved by an older version taken as the bottom one); on its own (standing, then strolling along the taskbar and standing again, walking both ways, fidgeting only after 30 seconds alone, never the same fidget twice in a row (with `random()` fixed at 0.5: a sit at 39 seconds, over by 46, then a levitate, within the first 64), and for as long as the fidget lasts, stopping where it is when clicked with the panel opening from there, nothing while the panel is open, and dangling instead of fidgeting when dragged); open/close, blur (including staying open when another app takes the focus back just as it opens), clicking the bubble (staying closed when the press on the bubble is what closed the panel, even for a slow click, and reopening straight away after clicking somewhere else, however quick), logging a click ignored while capturing; dragging (dangling from the mouse, falling straight down onto the taskbar, walking back toward the nearer corner when dropped far away, living near a corner of the other display, the panel re-placed, opening while it walks back, dropping it near its own corner keeping the corner); screenshots; display changes (including unplugging the character's display, stopping a walk to stand it back on a moved taskbar, and shrinking her to fit a smaller screen and growing her back once there's room); and her size (starting at her usual size, or at the size saved last time snapped to one of her sizes, growing where she stands with her feet on the taskbar, her corner side kept, both windows resized and the panel left open, no smaller than half, saying nothing when it doesn't change, kept to the biggest that fits a small screen, walking faster the bigger she is, and where she stands, for her clones); casting spells (a spell's pose for its time, then standing idle and wandering again, stopped by a click with what was to follow never coming, only while the panel is closed, and the teleport: vanishing, moving along the taskbar at least 40 DIPs while staying on it, with the panel moved to open from there, appearing, then standing); closing (vanishing, then quitting, with clicks and drags ignored meanwhile and nothing more done on her own); as Settings say (standing still: never walking, but still doing her idle animations once left alone; without idle animations, only strolling about; with both, nothing on her own at all; turned on mid-walk, stopping where she is, and turned off again, getting on with her day; and staying where she was dropped, however far from her corner); and the screen saver (sleeping: the panel closing, her vanishing, her window hiding and nothing done meanwhile; waking: her window showing, her forming out of white motes, then getting on with her day; staying gone when the screens change while she sleeps; and, woken before she's gone, coming straight back).
- `clones.test.ts`: Her clones. `Clones` in the main process, with a fake window and fake timers: one window along the taskbar (the whole width of the work area, as tall as her window), told where she stands, her size, the accent colour and when they end; closing it once their time is up; starting a new lot when asked again, closing the old one and giving the new one a full thirty seconds; and ten of her for thirty seconds. How they wander, in the page: all starting where she stands and setting off one after another, kept inside the window, walking somewhere at least a little way off and then stopping a while (and waiting that out), now and then waving when it stops, for as long as her wave takes, and stopping waving when it walks on, walking at about her speed for her size, each clone a little differently, and picking places either side far enough away (or staying put in a window too narrow to walk in).
- `spellEffects.test.ts`: Her spells' effects. `SpellEffects`, with a fake window and fake timers: one window over her display's work area, told the spell, her size, where she stands and how far down her feet are, when it was cast and the accent colour; closing once the spell is over; one spell at a time (a new one closes the old one); and knowing when the explosion is still at its chant, so stopping then calls it off, and when it's past it, so the bang goes ahead.
- `screenSaver.test.ts`: The screen saver. `ScreenSaver`, with a fake window, two fake displays and fake timers: a window over the whole of every display, taskbar and all, the sunset on hers (which takes the focus) and the stars elsewhere; starting once, however often it's asked; woken by one of its pages, every scene fading away, then the windows closing and her coming back; paying no attention to word from anything but its own pages; starting again once it's over; and closing at once when the app quits, without bringing her back.
- `screenSaverScenes.test.ts`: The screen saver's scenes, without a page, drawn on a `Painter` that records what it's asked to draw: dithering a quarter, a half and three quarters of the pixels evenly; the whole sky and the whole night painted, and the hills down to the bottom; her standing on the crest of the nearest hill, left of the sun, with the sun setting behind the hills; the sun moving only very slightly, and its stripes sliding down; the clouds drifting slowly right across the sky, round and round, all of them above the horizon; plenty drawn in every part of the sunset at any moment; and stars falling on the other screens without end, bigger than the spell's. And her, watching the sunset: her back to us (no face, nothing on her front, her hair over her back, her ears through it), swaying very slightly, round and round, and dimmed toward the dusk with a rim of warm light along her edges.
- `spellMotion.test.ts`: Her spells' pixel art, without a page: the seeded random numbers the same every time, and the noise between 0 and 1; shooting stars falling down to the left all through starfall, each within its life, and none after it; the pillar's magic circles above her hat and on the screen, each above the last and coming after it, all before 70% of the chant, and moved in from the edge when she's in a corner so most of each is on the screen; and the explosion bursting out fast, then growing slowly as it cools, with its shock wave racing out beyond it.
- `moreSpells.test.ts`: The six newer spells, without a page, drawn on a `Painter` that counts what it's asked to draw: each draws plenty on the screen half way through, moving or still (reduced motion), and nothing at all at its end. The fireworks: twenty rockets, the first from beside her, each bursting over the top half of the screen in time to be seen, the finale after its start. The thunderstorm: the clouds rolling in and away, and each bolt from the clouds to the ground while they're in, its branches heading down, one striking beside her. The blizzard building up and melting away, its frost never past a fifth of the screen, and the wind blowing one way. The vortex opening, holding, shrinking as it collapses and gone at the implosion. The butterflies coming out of her one after another, from her middle, climbing and flapping. The phoenix starting at her, leaving off the side away from her, flying only while it should, and heading back the way it came at the top of its loop.
- `sizes.test.ts`: Her size in Settings: saying it as people do ("½×", "¾×", "1.5×", "6×"), and stepping a size at a time, no bigger than fits the screen, stopping at either end.
- `vision.test.ts`: Her vision's window. `visionBounds()`: a column from the top of the screen down to her feet, centred on her, kept on the work area when she stands in a corner, and growing with her. `Vision`, with a fake window and fake timers: one window over her, told her size, where her middle is and when the vision started; closing when stopped (the habit ends, or someone clicks her); and closing itself once the habit is over. And `VISION`'s timetable: inside the habit's time, with the logo coming down before it rises.
- `sprite.test.ts`: The character's pixel art. The animations: every pose (her spells' three included) has frames, each a full 96 × 96 grid of palette colours, with the 8 rows of headroom above it, shown for some time; she stands on the bottom rows (her feet leave them only at the top of the hop, with her shadow still on the ground, while she's carried (with no shadow under her then), and while she levitates, with the magic circle's teal ring on the ground under her and gone once she lands); every fidget lasts exactly its `FIDGET_MS` and plays once, while idle, walking and dangling go round; vanishing and appearing last exactly their `SPELL_POSE_MS` and play once, while the chant goes round; vanishing dissolves her into white motes, from all of her to nothing, and appearing forms her out of them, ending exactly as she stands; facing left is the mirror image of facing right (but the dozer's z's still read the right way round), and a walk faces the way it goes; idle has at least three different frames (breathing and a blink) and the walk twelve; in a hop and while she levitates, her hat rises into the headroom but never out of the top of the frame; easing between poses comes in many small steps (a frame about every 40 ms, so every fidget but the glance has at least one frame per 160 ms of its length, and idle has 32 frames); and frames are drawn once, then kept. The rig: three different views (front, diagonal, side); a teacup, a spellbook and sparkles drawn only when asked for, and the newer habits' things too (a crystal ball between her hands, a butterfly on her raised hand part way through its visit but not before it arrives, z's above her head, a robe flared wider at the hem), and the newest habits' things only when asked (three orbs between her hands while she juggles, but none before or after; bubbles and the wand ring blown from in front of her mouth, seen diagonally; the will-o'-wisp, which beside her shows only on empty pixels, in front of her chest is drawn over her, and right behind her is hidden; and a sneeze's sparkles only while they fly); her hat as the highest thing in the picture and her long ears reaching out well past her face; her clothes patterned from every side (gold and a gem on the hat, gold embroidery on the robe, light cuffs and laces and gold buckles on the boots); from the front, her hair behind her, clear of her face and the middle of her robe, her fringe and locks reaching as far out on one side as the other, and none of it beside her sleeves below her locks; side on, her long hair down her back as one mass with a single outline, a full head of hair thick behind her shoulders and reaching the small of her back, as from the front, its ends in clumps of different lengths; her shading from every side (a broad band of shade across the side of her skirt away from the light, no lit hair under her hat and no lit skin under her hair); her face side on, with her cheek clear of hair, a tuft of hair under her ear, over the back of her jaw, and her eye wide open, its iris four pixels tall and at the front of her eye (so she looks the way she faces), with her chin no lower than five rows below the tip of her nose; her hat's crown at least two pixels wide below its tip and widening steadily down from it, with no notch, from the front and side on; a trail of sparkles on the ground behind her as she walks (in most of the walk's frames, none standing still), only ever on empty ground or her shadow; her hair rippling side on, the ends of her hair swaying back and forth through a ripple while her hat and the top of her head stay still, and a different shape in most of the walk's frames; looking up from every side, her irises right under her lids, as she does for most of the vision (but not in its first or last frame); her face (eyes, glint, blush and mouth); and sitting with her hips down near the taskbar. The rasteriser: filling a shape, shading the side away from the light (and a broad band across that side, for materials with a form shadow), lighting the edge toward it and outlining it; lines, polygons and stamps (mirrored too) in the right place; and limbs swinging forward with positive angles. And `framePaths` drawing exactly the frame, one path per colour.
- `notesStore.test.ts`: Saving the draft, reloading, overtaken writes, damaged files, attachments.
- `screenshotFiles.test.ts`: Screenshot names, never overwriting, finding the newest, the inside-the-folder check.
- `screenshotStack.test.ts`: Stacking screenshots into one image for the clipboard: the width they're scaled to (the narrowest, capped), the order and the grey band between them (checked pixel by pixel), a single image left as it is, and refusing different widths, padded rows or an empty list.
- `format.test.ts`: Chip labels, and "how long ago" (`timeAgo`).
- `tenants.test.ts`: Every tenant folder has a valid `tenant.json` and a logo, and an `icon.png`, if it has one, Windows can use (a square PNG at least 256 pixels across); `chatApp` defaults to the built-in chat, which needs `signIn` and `claudeAccess`, while Claude Desktop needs neither (and an unknown `chatApp` is refused); the Apps icon needs `portal`, whose address must be `https`; starting on the Apps list needs `portal` and the `ask` action; the service desk icon needs an `https` `serviceDesk` address; request types (at least one, with numeric IDs) reach the panel; the Jira icon needs `atlassian`, which gets Atlassian's MCP server by default; a dev override can change one Atlassian setting without resetting the others; updates come from a GitHub repository, from GitHub itself by default, need the release key's public half, and offer Check for updates in Settings; the list of missing sign-in settings.
- `trayIcon.test.ts`: The tray circle.
- `chatSession.test.ts`: The conversation with a scripted fake backend: streaming, images before text, replaying replies unchanged (thinking included), busy/empty/signed-out, Stop with and without text, Retry, an expired sign-in, refusals and length limits, the tool loop, and New conversation ignoring a late reply.
- `authManager.test.ts`: The sign-in with a fake JumpCloud (whose refresh tokens work once, like the real one): not set up, nothing saved, renewing at startup and saving the replacement token, offline and Retry, a refused sign-in, browser sign-in, Cancel, no refresh token, a port in use, handing out a different ID token each time, never refreshing twice at once, skipping an almost-expired ID token, Log out (revoking), and logging out during a renewal.
- `claudeDesktop.test.ts`: Handing questions to Claude Desktop, with fakes that record the order of events: the link (the documented `q`, spaces as `%20`, any text round-trips, no `q` without text), the two notifications' wording, copying screenshots before opening Claude and notifying only when there were some, a screenshot-only question, an empty question, the 12,000-character limit, Claude Desktop not installed, a missing screenshot, and a link or clipboard that fails (logged, no notification). With "Send in Claude" on: sending (pasting first when there's a screenshot) with nothing more said, `ask()` returning while sending carries on, the right notification when Claude never showed the question or the screenshot was pasted but not sent, a helper that couldn't run (logged, then the notification), never sending a screenshot on its own, and sending nothing (with a "check your question" notification) when Claude's box already had other text.
- `portalApps.test.ts`: The Apps list: reading JumpCloud's answers (sorted by name, hidden apps skipped, a bare list or structured content, no list versus an empty one, `https` links only, the launch tool's ID argument, the sign-in link in a launch answer), telling images by their first bytes, fetching logos (`https` images only, judged by their bytes rather than their label, so uploaded logos labelled `application/octet-stream` work and mislabelled HTML doesn't, and not too big), starred apps first (`orderApps`), keeping fetched logos across a refresh, and `PortalApps` against a fake portal: asking to sign in without opening the browser, signing in through the browser and saving the connection, remembering the list until Refresh, opening an app through its launch link, asking for the launch tool only once, using the list's own link when JumpCloud is slow, refusing a sign-in that comes back with the wrong `state`, and Cancel; plus `SavedAuth` as a public client that keeps only what it was given.
- `atlassian.test.ts`: Jira, with made-up answers and a fake Atlassian: issue keys in text, search words that can't break a query, mentions and text in Jira's document format, who assigned an issue (not the user themselves), the comments that mention the user, a request's latest reply from a person (not the user or an automatic one), Confluence results only on the company's site, the user and the site's cloud ID, and the prompt to Claude kept under the limit; then `Atlassian`: asking to connect without opening the browser, connecting and showing who assigned or mentioned the user, remembering what's been seen and not re-reading unchanged issues, marking a notification seen when it's opened (remembering it) and the rest when the page closes, telling the user once when IT replies until they look, opening an issue with its comments, moves and portal page, moving, commenting and logging time, searching Jira and Confluence (and finding an issue by its key), asking Claude with the issue's details, and going back to Connect when the connection ends (and forgetting it on Disconnect).
- `serviceDesk.test.ts`: Raising IT requests: the portal's filled-in form address for a request type, the PC details under the description with the link kept short enough, Windows 11 called by its name, opening the form with the screenshot copied to paste, leaving the PC details out when asked, and refusing an empty request, an unknown request type and a missing screenshot.
- `updates.test.ts`: Check for updates, with a fake GitHub: reading versions (with or without a `v`) and comparing them part by part; finding the installer, GitHub's SHA-256 and the signature in a release, ignoring drafts, pre-releases, odd tags and files not downloaded from the repository, following a renamed repository to its release files (but nowhere else), and taking a release without a digest; checking a signature (not another file, version or key) and agreeing with `scripts/release-signing.mjs`; saving the installer in an emptied folder by its own name only, only an `.exe`, and deleting what was saved if the download fails part way; and the `Updater`: up to date when the latest release is this version or there are none, downloading a newer one with progress, checking it, running the installer silently as an update and quitting, stopping at downloading in a development run, never running a download that isn't the release's file (wrong SHA-256 or too short) or isn't signed with the release key (no signature, another key, an older installer passed off as newer, a garbled signature), saying why it couldn't check (GitHub busy, offline), and doing one check at a time.
- `debugging.test.ts`: The switches an installed copy refuses to start with (Chromium's remote debugging, Node's inspector), and letting everything else through.
- `uninstall.test.ts`: Finding the uninstaller next to the app, turning off Start with Windows before starting it and then quitting, doing nothing in a dev run or without an uninstaller, and staying open when it couldn't start.
- `formerName.test.ts`: Carrying things over from the app's old name, Desktop Assist, with a fake disk and a fake startup list. The data folder: renamed from the old name to the new one the first time, both left alone once the new one is there, the new name on a PC that never had the old one, and the old folder kept in use when it can't be moved. "Start with Windows": moved from the old `.exe` to the new one, and nothing changed when Windows already starts the new one, or neither.
- `sendInClaude.test.ts`: The PowerShell helper's script, without running it: the question key (whitespace evened out, 60 characters), evening out Unicode spaces and fingerprinting the whole question (any extra text changes the hash), a question full of PowerShell code carried only as base64, no key pressed before Claude's box has been found to hold exactly the question, Ctrl+V only with a screenshot, the process name (another for tests, but nothing that could break out of its quotes), and reading the outcome from the last line printed.
- `loopback.test.ts`: The browser-return listener: catches `/callback` and stops, 404 for anything else, shows JumpCloud's error safely escaped, Cancel, timeout, and a port in use.
- `secretStore.test.ts`: Encrypted save and load, unreadable files, refusing to save without encryption, clear.
- `claudeHelpers.test.ts`: Error classification (including sign-in errors wrapped by the SDK and failed swaps), what can be retried, the system prompt, and image scaling.
- `codeGuide.test.ts`: The code shown in the walkthrough pages matches the source (runs `npm run docs:check`).
- `diagnostics.test.ts`: The ID token summary (the claims a federation rule checks, never the token), describing errors for the log, writing the log file and starting a new one when it gets large.
