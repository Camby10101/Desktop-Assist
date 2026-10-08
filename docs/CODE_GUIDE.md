# Desktop Assist: Code Guide

A walk through every file in the project: what it's for, and what each function, method or
constant does. Covers Milestone 0 (Foundation) and Milestone 1 (Chat with Claude). Update this
guide when the code changes.

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

| Part             | Runs in                                     | Can do                                                                                    | Here                        |
| ---------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------- |
| **Main process** | Node.js, one per app                        | Create windows, read and write files, the tray, screen capture, talk to the Claude API    | `apps/desktop/src/main`     |
| **Renderer**     | Chromium, one per window                    | Draw the UI with HTML/CSS/React. **Cannot** touch files, the network to Claude, or the OS | `apps/desktop/src/renderer` |
| **Preload**      | Inside each renderer, before the page loads | Hand the page a small, safe set of functions (`window.assist`)                            | `apps/desktop/src/preload`  |
| **Shared**       | Bundled into all three                      | Types and constants both sides must agree on                                              | `apps/desktop/src/shared`   |

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

**Where Claude is called.** Only the main process talks to Claude, using Anthropic's official
TypeScript SDK (`@anthropic-ai/sdk`). The API key lives in the main process, encrypted on disk;
the page only ever learns whether the key works.

---

## 2. How the pieces work together

**Starting up** (`src/main/index.ts` → `start()`)

1. Validate `tenant.json`, create the bubble and panel windows (both hidden), load the saved
   draft from disk, and load preferences.
2. Create the `BubbleController` (the bubble's state machine), the `ScreenshotService`, the
   Claude backend, the `ApiKeyManager` and the `ChatSession`, then the IPC handlers and tray.
3. **Test the saved API key** (`apiKeys.checkSaved()`): if there's no key, or Anthropic rejects
   it, the chat box shows the key form first.
4. Once both pages have painted, `controller.start()` shows the bubble in its saved corner (bottom-right of the main display the first time).

**Entering an API key**

`ApiKeyForm` → `window.assist.apiKey.submit(key)` → IPC `assist:api-key-submit` →
`ApiKeyManager.submit()` asks Anthropic whether the key works (`AnthropicBackend.verifyKey()`,
which fetches the model's details: free, and fails for a bad key). Only a working key is saved
(`ApiKeyStore.save()`, encrypted with Windows DPAPI). The new status (`valid`) is broadcast and
the chat appears.

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
- **A key error** (revoked key, no credit) tells the `ApiKeyManager`, which switches back to the
  key form with an explanation.

**Typing in the text box**

`Composer` textarea → `Panel.changeDraft()` → `window.assist.notes.setText()` →
`NotesStore.setText()`. The store keeps the draft in memory and writes `notes.json` about half a
second after you stop typing, so an unsent message survives a restart.

**Taking a screenshot**

Camera icon → `Panel.runAction('screenshot')` → IPC `assist:invoke-action` → the `screenshot`
handler in `src/main/actions.ts` → `BubbleController.whileHidden()` hides both windows, waits for
Windows to repaint, then `ScreenshotService.capture()` saves the PNG. The windows come back and
the page shows a "Screenshot saved" toast. **Attach latest screenshot** then adds it to the
draft as a chip, and it's sent with your next message.

**Bounce**

Bounce icon → `BubbleController.startBounce()` hides the panel and runs a 60 fps timer that
calls `bounce.step()` and moves the bubble window within its display. Clicking the bubble calls `glideHome()`,
which animates it back to the corner with `bounce.glidePosition()`.

**Dragging the bubble**

1. `BubbleView` sees the mouse pressed on the bubble and moved more than 5 pixels → `window.assist.bubbleDragStart()` → `BubbleController.startDrag()`.
2. The controller notes where the bubble was grabbed and, 60 times a second, moves the bubble window to follow the mouse pointer (it reads the real pointer from the main process, which keeps it smooth across monitors with different scaling).
3. On release → `bubbleDragEnd()` → `endDrag()`: the display under the bubble is found, then the nearest of its four corners (`nearestCorner()`), and the bubble glides there.
4. The new anchor (display + corner) is saved to `preferences.json` and broadcast to the panel, which re-lays itself out to open toward the middle of the screen: in a left corner the chat opens to the right, in a top corner the icons drop below the bubble and the chat grows downward.

---

## 3. Repository root

| File                 | Purpose                                                                                                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`       | The npm _workspaces_ root. `apps/*` are the packages (only `apps/desktop` for now; a gateway service can be added beside it later). Its scripts (`dev`, `test`, `lint`, `typecheck`, `dist`, `format`) forward to the desktop app. |
| `package-lock.json`  | Exact versions of every installed package, so every machine installs the same thing. Generated by npm; don't edit by hand.                                                                                                         |
| `.gitignore`         | Keeps `node_modules/`, build output (`out/`, `dist/`) and logs out of git.                                                                                                                                                         |
| `.gitattributes`     | Keeps line endings as LF in git and on disk, matching Prettier.                                                                                                                                                                    |
| `.prettierrc.json`   | Code formatting rules (no semicolons, single quotes, 100-character lines). Run `npm run format` to apply.                                                                                                                          |
| `.prettierignore`    | Files Prettier must not touch (build output, the lock file).                                                                                                                                                                       |
| `README.md`          | What the app does and how to run, test and build it.                                                                                                                                                                               |
| `docs/PLAN.md`       | The plan: tech stack, architecture, milestones, decisions and open questions.                                                                                                                                                      |
| `docs/CODE_GUIDE.md` | This file.                                                                                                                                                                                                                         |

---

## 4. Tenants (branding)

A _tenant_ is one business's branding. The build includes exactly one, chosen by the `TENANT`
environment variable (default `morse-micro`). This is what makes the app easy to re-brand later.

| File                              | Purpose                                                                                                                                                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tenants/README.md`               | How tenants work, and how to change the logo.                                                                                                                                                                                                                                        |
| `tenants/morse-micro/tenant.json` | `id` (must match the folder name), `companyName`, `appName` (also the name of the screenshots folder), `accentColor` (the highlight colour), `actions` (which icons appear above the bubble, from the bubble upward), and optionally `systemPrompt` (extra instructions for Claude). |
| `tenants/morse-micro/logo.png`    | The bubble image: the Morse Micro "Mμ" mark cut to a circle (512×512, transparent corners). A tenant can use `logo.svg` instead; if both exist, the PNG wins.                                                                                                                        |

---

## 5. Desktop app configuration

All in `apps/desktop/`.

| File                      | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json`            | The desktop app's own package. `productName` ("Desktop Assist") becomes the app's name and its `%APPDATA%` folder. `main` points Electron at the built main process. Scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `dist` (build the installer). Every library is a `devDependency` because the build bundles them; the installer ships no `node_modules`. `electron` is pinned to an exact version because the installer builder requires it. |
| `electron.vite.config.ts` | Build config for electron-vite, which compiles the three parts (main, preload, renderer). Defines the import shortcuts `@shared` → `src/shared` and `@tenant` → `tenants/<TENANT>`, turns on React and Tailwind for the renderer, and minifies the renderer.                                                                                                                                                                                           |
| `electron-builder.yml`    | Installer config: app ID, product name, include only the built `out/` folder, and build a per-user one-click NSIS installer (`Desktop Assist-Setup-<version>.exe`) into `dist/`.                                                                                                                                                                                                                                                                       |
| `tsconfig.json`           | Points TypeScript at the two configs below.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `tsconfig.node.json`      | TypeScript settings for code that runs in Node: main, preload, shared, tests and config files. Strict mode on.                                                                                                                                                                                                                                                                                                                                         |
| `tsconfig.web.json`       | TypeScript settings for the renderer (browser code with React/JSX).                                                                                                                                                                                                                                                                                                                                                                                    |
| `vitest.config.ts`        | Test runner config: the same `@shared`/`@tenant` shortcuts, run `tests/**/*.test.ts` in Node.                                                                                                                                                                                                                                                                                                                                                          |
| `eslint.config.mjs`       | Lint rules: recommended JavaScript and TypeScript rules everywhere, React Hooks rules for the renderer, and Prettier compatibility.                                                                                                                                                                                                                                                                                                                    |

---

## 6. Shared code (`src/shared`)

Imported by both the main process and the renderer, so both sides agree on shapes and numbers.

### `geometry.ts`: sizes and positions

| Name                              | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Point`, `Size`, `Rect`           | Basic shapes: `{x, y}`, `{width, height}`, and both together. All in DIPs (device-independent pixels, i.e. before Windows display scaling).                                                                                                                                                                                                                                                                                                         |
| `Corner`                          | Which screen corner the bubble rests in: `top-left`, `top-right`, `bottom-left` or `bottom-right`.                                                                                                                                                                                                                                                                                                                                                  |
| `isLeftCorner()`, `isTopCorner()` | Which side of the screen a corner is on, for flipping the layout.                                                                                                                                                                                                                                                                                                                                                                                   |
| `UI`                              | Every UI measurement in one place: bubble size (56), padding around it (8), gap to the panel (12), chat card width (400) and max height (520), room for a toast beyond the card (40), action icon size (40) and spacing (8), shadow room (16), settings menu width (248), and the margin from the screen edge (16). The main process sizes windows from these and the renderer positions elements with the same numbers, so they can't drift apart. |
| `BUBBLE_BOX`                      | Size of the bubble window: the bubble plus padding on each side (72).                                                                                                                                                                                                                                                                                                                                                                               |
| `PANEL_LAYOUT`                    | Where the action stack (`actionsX/Y`), chat card (`chatX/Y`) and settings menu (`settingsX`) sit inside the panel window, measured from the window corner the bubble is in: `X` across, `Y` away from the screen edge. Because they're measured from the bubble's corner, the same numbers work in all four corners.                                                                                                                                |
| `actionStackHeight(n)`            | Height of a stack of `n` action icons including the gaps between them.                                                                                                                                                                                                                                                                                                                                                                              |
| `actionOffset(index)`             | Distance from the bubble's edge of the panel window to action icon number `index`. Used to line the settings menu up with the gear.                                                                                                                                                                                                                                                                                                                 |
| `panelWindowSize(n)`              | How big the panel window must be to fit the chat card at full height (plus a toast) and `n` action icons.                                                                                                                                                                                                                                                                                                                                           |

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

| Name                 | What it is                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Mode`               | What the bubble is doing: `collapsed`, `expanded`, `dragging` (following the mouse), `bouncing`, `returning` (gliding into its corner), or `capturing` (windows hidden for a screenshot).               |
| `Attachment`         | A screenshot attached to the draft or a sent message: an ID, the file path, the file name and when it was added.                                                                                        |
| `Notes`              | The unsent draft: text, attachments and last-changed time.                                                                                                                                              |
| `Effort`             | How hard Claude thinks: `low`, `medium` or `high` (shown as Fast, Balanced, Thorough).                                                                                                                  |
| `Settings`           | What the settings menu shows: Start with Windows (and whether it's available), the screenshots folder, and the response style (`effort`).                                                               |
| `Branding`           | The parts of the tenant config the pages need.                                                                                                                                                          |
| `ApiKeyStatus`       | Whether the API key works: `missing`, `checking`, `valid`, `invalid` (rejected, with a message) or `unreachable` (couldn't be checked, e.g. offline; the key is kept).                                  |
| `ApiKeySubmitResult` | What entering a key returns: success, or a message saying why not.                                                                                                                                      |
| `ChatMessage`        | One message as the chat shows it: who sent it, the text, any screenshots, its status (`streaming`, `done`, `stopped`, `error`), an optional notice (e.g. why it stopped) and whether it can be retried. |
| `SendResult`         | What sending returns: the cleared draft, or why it wasn't sent (`busy`, `empty`, `no-key`, `missing-screenshot`).                                                                                       |
| `AppState`           | Everything a page needs when it first loads, including the bubble's corner, the key status and the chat so far.                                                                                         |
| `ActionResult`       | What running an action returns: success or failure, plus an optional toast message.                                                                                                                     |
| `AttachResult`       | What "attach latest" returns: the updated draft, or why it didn't attach.                                                                                                                               |

### `ipc.ts`: the IPC contract

| Name        | What it is                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IPC`       | Every channel name, e.g. `assist:chat-send`. One list means the preload and the main process can't disagree about a name.                                                                                                                                                                                                                                                                                             |
| `AssistApi` | The exact set of functions the pages get as `window.assist`: the bubble (click, drag start/end) and actions, opening links and copying text, the draft (`notes`), screenshots, settings, the API key (`submit`, `recheck`, `forget`), the chat (`send`, `stop`, `retry`, `newConversation`), and listeners for mode changes, corner changes, click-through resets, key status changes, chat messages and chat resets. |

### `format.ts`

| Name                             | What it does                                                                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `screenshotLabel(fileName, now)` | Turns `Screenshot 2026-10-02 140311.png` into the chip label `Screenshot 14:03` (today) or `Screenshot 2 Oct 14:03` (another day). Any other file name is shown as-is. |

---

## 7. Main process (`src/main`)

### `index.ts`: startup and shutdown

| Part                          | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top-level code                | In dev runs, moves app data to `%APPDATA%\Desktop Assist (Dev)` so a dev copy never shares notes, the API key or the single-instance lock with an installed copy. Takes the **single-instance lock**: if the app is already running, the new copy quits and the running one opens its panel.                                                                                                                                                                                                          |
| `start()`                     | Runs once Electron is ready. Validates the tenant; creates both windows; loads the draft and preferences; creates the `BubbleController` (starting in the saved corner), `ScreenshotService`, `AnthropicBackend`, `ApiKeyManager` (with an `ApiKeyStore` that encrypts using Electron's `safeStorage`) and `ChatSession`; **checks the saved key**; registers IPC; adds the tray; keeps the bubble in place on display changes; sets up shutdown; then shows the bubble once both pages have painted. |
| `electronDisplays`            | Electron's `screen` in the shape the bubble controller uses: the main display, a display by id, the display nearest a point, and the mouse position.                                                                                                                                                                                                                                                                                                                                                  |
| `ANTHROPIC_BASE_URL`          | In dev runs only, this environment variable can point the app at a local test server instead of Anthropic. Installed builds always use `https://api.anthropic.com`.                                                                                                                                                                                                                                                                                                                                   |
| `broadcast(channel, payload)` | (inside `start`) Sends a message to both pages, e.g. a mode change or a chat update.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `before-quit` handler         | On quit: stops animations and any reply in progress, removes the tray icon, and waits (up to 2 seconds) for the draft to finish saving.                                                                                                                                                                                                                                                                                                                                                               |
| `session-end` handler         | When Windows logs off or shuts down: saves the draft synchronously.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `fail(error)`                 | If startup fails, shows an error box and exits.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### `claude/model.ts`: how Claude is called

| Name                        | What it is                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CLAUDE_MODEL`              | `claude-opus-5-5`, the model every request uses.                                                                                                                                                                                                             |
| `FALLBACK_BETA`             | The beta header for **server-side refusal fallback** (`fallbacks: "default"`): if Claude's safety classifiers decline a request, Anthropic re-runs it on a fallback model instead of refusing.                                                               |
| `MAX_TOKENS`                | 64,000. The most a reply may be. Replies stream, so a high ceiling costs nothing unless used.                                                                                                                                                                |
| `API_BASE_URL`              | Anthropic's API address.                                                                                                                                                                                                                                     |
| `MAX_TOOL_ROUNDS`           | A safety limit for the tool-use loop.                                                                                                                                                                                                                        |
| `buildSystemPrompt(tenant)` | The instructions Claude gets for the whole conversation: who it is, that it lives in a small panel (so be concise), and that screenshots may be attached, plus the tenant's own `systemPrompt`. It's fixed per conversation so the prompt cache stays valid. |

### `claude/AnthropicBackend.ts`: talking to the Claude API

| Name                              | What it does                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ReplyRequest`                    | Everything one request needs: the key, system prompt, conversation, tools, effort, a cancel signal, and a callback for each piece of streamed text.                                                                                                                                                                                                                                     |
| `ChatBackend`                     | The interface the rest of the app uses. Milestone 3 can add a JumpCloud-backed version behind the same interface.                                                                                                                                                                                                                                                                       |
| `AnthropicBackend.verifyKey(key)` | Checks a key by fetching the model's details (free). Throws the SDK's error if the key is bad, has no access, or Anthropic can't be reached.                                                                                                                                                                                                                                            |
| `AnthropicBackend.reply(request)` | Streams one reply with `client.beta.messages.stream`: model, max tokens, fallbacks, effort, system prompt, **prompt caching** (`cache_control`, so resending a long conversation is cheaper and faster), the conversation, and tools if any. Passes each text chunk to `onText` and resolves with the complete message. Thinking is always on for this model; effort controls how much. |
| `client(key)` _(private)_         | Creates the SDK client once per key. Passes `authToken: null` so a stray `ANTHROPIC_AUTH_TOKEN` environment variable can't be sent too.                                                                                                                                                                                                                                                 |

### `claude/errors.ts`: what went wrong

| Name                   | What it does                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ErrorKind`            | The kinds of failure the app distinguishes: aborted (Stop), auth, permission, billing, not-found, rate-limit, overloaded, network, bad-request, server, unknown. |
| `classifyError(error)` | Maps the SDK's typed error classes (`AuthenticationError`, `RateLimitError`, `APIConnectionError`…) to an `ErrorKind`, most specific first.                      |
| `isKeyProblem(kind)`   | Could a different key fix it? (auth, permission, billing, not-found)                                                                                             |
| `isRetryable(kind)`    | Is it worth trying again? (rate limit, overloaded, network, server, unknown)                                                                                     |
| `errorMessage(kind)`   | The plain-English message shown for each kind.                                                                                                                   |

### `claude/ApiKeyStore.ts`: keeping the key safe

| Name        | What it does                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `Encryptor` | What's needed to encrypt the key. In the app it's Electron's `safeStorage` (Windows DPAPI, tied to your Windows account); tests use a fake. |
| `load()`    | Reads and decrypts the key file. Returns `null` if there's no key or it can't be decrypted (e.g. the file came from another user).          |
| `save(key)` | Encrypts and writes the key (atomically). Refuses if encryption isn't available, rather than storing it in plain text.                      |
| `clear()`   | Deletes the key file.                                                                                                                       |

### `claude/ApiKeyManager.ts`: is the key working?

| Name                     | What it does                                                                                                                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`                 | The current `ApiKeyStatus`, broadcast to the page on every change.                                                                                                                                                                     |
| `key`                    | The key to use for requests: only when it's `valid`, or `unreachable` (not yet checkable, so it's given the benefit of the doubt).                                                                                                     |
| `checkSaved()`           | **Runs at every start.** Loads the saved key and tests it: no key → `missing`; rejected → `invalid` with "Your saved API key no longer works…"; offline → `unreachable` (key kept, chat still usable, Retry offered); works → `valid`. |
| `submit(raw)`            | For the key form: trims the input, rejects obviously wrong input, tests the key with Anthropic and **saves it only if it works**. If Anthropic can't be reached, nothing is saved.                                                     |
| `rejected(kind)`         | A chat request failed because of the key: switch to `invalid`, so the chat box asks for a new key.                                                                                                                                     |
| `confirmed()`            | A chat reply worked, so a key that couldn't be checked earlier is fine after all.                                                                                                                                                      |
| `forget()`               | Deletes the saved key (Settings → Change API key → Forget saved key).                                                                                                                                                                  |
| `generation` _(private)_ | A counter bumped by every check or change, so a slow, older check can't overwrite a newer result (e.g. you enter a new key while the startup check is still running).                                                                  |

### `claude/ChatSession.ts`: one conversation

| Name                                    | What it does                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OutgoingImage`                         | A screenshot ready to send (JPEG, base64).                                                                                                                                                                                                                                                                                                                                                                                          |
| `ChatTool`                              | A tool Claude may call: its definition and a `run` function. None are registered yet; the loop is ready for them.                                                                                                                                                                                                                                                                                                                   |
| `ChatSessionDeps`                       | What the session needs: the backend, the current key and effort, the system prompt, tools, and callbacks for message updates, resets, key problems and successful replies.                                                                                                                                                                                                                                                          |
| `history` _(private)_                   | Exactly what is sent to the API. **Append-only:** turns are added, never edited or removed. Claude's thinking is tied to the exact conversation it happened in, and editing earlier turns would make the API reject it.                                                                                                                                                                                                             |
| `messages` _(private)_                  | What the chat shows.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `busy`                                  | Is a reply in progress?                                                                                                                                                                                                                                                                                                                                                                                                             |
| `list()`                                | Copies of the messages, for a page that has just loaded.                                                                                                                                                                                                                                                                                                                                                                            |
| `send(text, images, attachments)`       | Adds your message (screenshots first, then text) and starts a reply. Returns immediately with `sent`, or `busy` / `empty` / `no-key`.                                                                                                                                                                                                                                                                                               |
| `retry()`                               | Asks again after a failed reply, if nothing from it was kept and a key is available.                                                                                                                                                                                                                                                                                                                                                |
| `stop()`                                | Cancels the reply in progress.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `newConversation()`                     | Cancels any reply and empties the history and messages. A reply still finishing is ignored (via `generation`).                                                                                                                                                                                                                                                                                                                      |
| `idle()`                                | Resolves when the current reply finishes (used by tests).                                                                                                                                                                                                                                                                                                                                                                           |
| `runTurn()` _(private)_                 | One reply. Streams text into the chat message; appends the complete reply (every content block, thinking included) to the history; runs tools and loops if Claude asked for any; then marks it done, with a notice for a refusal or a reply cut off at the length limit. On Stop or an error, keeps any text that arrived as a plain-text reply, tells the key manager about key problems, and marks temporary errors as retryable. |
| `scheduleEmit()` / `emit()` _(private)_ | Streamed text arrives in many small pieces; these batch updates to the page to at most one every 50 ms.                                                                                                                                                                                                                                                                                                                             |
| `runTools()`                            | Runs each tool Claude asked for and builds the results to send back (an unknown tool or a failure is reported to Claude as an error).                                                                                                                                                                                                                                                                                               |

### `tenant.ts`

| Name                 | What it does                                                                                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TenantSchema`       | Rules `tenant.json` must follow (lowercase id, `#RRGGBB` colour, known and non-repeated actions, optional `systemPrompt` up to 8,000 characters). A bad file stops the app at startup, and `npm test` checks it too. |
| `Tenant`             | The type of a valid tenant config.                                                                                                                                                                                   |
| `brandingOf(tenant)` | Picks out the fields the pages need.                                                                                                                                                                                 |

### `bubble/BubbleController.ts`: the bubble's state machine

It owns the current `Mode`, the bubble's position and its anchor (which display and corner it rests in), and shows, hides and moves the two windows
to match. It talks to windows through the small `Surface` interface rather than to Electron
directly, which is what lets the tests drive it with fake windows.

| Name                                                                      | What it does                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Surface`, `PanelSurface`                                                 | What the controller needs from a window: set bounds, show, hide (and focus, for the panel).                                                                                                                                                                                                       |
| `DisplayArea`, `Displays`                                                 | What the controller knows about screens: each display's id and work area, the main display, the display nearest a point, and the mouse position.                                                                                                                                                  |
| `BubbleAnchor`                                                            | Where the bubble rests: a display id and a corner. Saved in `preferences.json`.                                                                                                                                                                                                                   |
| `BubbleControllerDeps`                                                    | What it's built with: the two surfaces, the displays, the number of actions, the saved anchor, callbacks for mode and anchor changes, and (for tests) a clock and random-number source.                                                                                                           |
| `PANEL_FADE_MS` (140)                                                     | How long the panel's fade-out takes before the window is actually hidden.                                                                                                                                                                                                                         |
| `BLUR_CLICK_GRACE_MS` (300)                                               | See `clickBubble()`.                                                                                                                                                                                                                                                                              |
| `HIDE_SETTLE_MS` (150)                                                    | How long to wait after hiding the windows before taking a screenshot, so they aren't in it.                                                                                                                                                                                                       |
| `currentMode`, `bubblePosition`, `corner`                                 | The current mode, where the bubble is, and which corner it rests in.                                                                                                                                                                                                                              |
| `start()`                                                                 | Puts the bubble in its saved corner (bottom-right of the main display the first time, or if the saved display isn't connected), sizes both windows, shows the bubble.                                                                                                                             |
| `clickBubble()`                                                           | Decides what a bubble click means: **collapsed** → open the panel, **expanded** → close it, **bouncing** → glide home, **dragging/returning/capturing** → ignore. A click arriving within 300 ms of the panel closing because it lost focus is treated as the same gesture and doesn't reopen it. |
| `expand()`                                                                | Opens and focuses the panel. If the bubble is bouncing, glides home first and then opens.                                                                                                                                                                                                         |
| `collapse()`                                                              | Switches to collapsed, then hides the panel window once the fade-out has finished.                                                                                                                                                                                                                |
| `panelBlurred()`                                                          | Called when the panel loses focus (you clicked somewhere else): collapses and remembers when.                                                                                                                                                                                                     |
| `startDrag()`                                                             | The bubble was pressed and moved: closes the panel, remembers where the bubble was grabbed, and moves it with the mouse every frame. Only from collapsed or expanded.                                                                                                                             |
| `endDrag()`                                                               | Released: finds the display under the bubble and the nearest of its corners, saves that as the new anchor (`onAnchorChange`), and glides there.                                                                                                                                                   |
| `startBounce()`                                                           | Hides the panel, sets off away from the bubble's corner at a random angle, and runs a 60 fps timer that moves the bubble around its display with `step()`.                                                                                                                                        |
| `whileHidden(task)`                                                       | Hides both windows, waits for the screen to repaint, runs `task` (the screenshot), then always brings the windows back and reopens the panel, even if the task failed.                                                                                                                            |
| `displayChanged()`                                                        | Resolution, taskbar or monitors changed: moves the bubble and panel to their corner of the (possibly resized) display. If the bubble's display was unplugged, it moves to the same corner of the main display. A bounce or drag in progress carries on.                                           |
| `dispose()`                                                               | Stops all timers (on quit).                                                                                                                                                                                                                                                                       |
| `glideHome()` _(private)_                                                 | Animates the bubble into its anchor corner, then switches to collapsed (and opens the panel if that was requested).                                                                                                                                                                               |
| `display()`, `home()` _(private)_                                         | The anchor's display (or the main display if it's gone), and the bubble's resting position in it.                                                                                                                                                                                                 |
| `setAnchor()` _(private)_                                                 | Changes the anchor and reports it, if it actually changed.                                                                                                                                                                                                                                        |
| `runTicker()` / `stopTicker()` _(private)_                                | Start and stop the 60 fps animation timer.                                                                                                                                                                                                                                                        |
| `moveBubble()`, `placeWindows()`, `cancelHide()`, `setMode()` _(private)_ | Move just the bubble; position both windows; cancel a pending hide; change and report the mode.                                                                                                                                                                                                   |

### `bubble/layout.ts`: where windows go

Pure maths, no Electron.

| Name                                   | What it does                                                                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TravelBox`                            | The range of positions the bubble can be in.                                                                                                          |
| `homePosition(workArea, corner)`       | The bubble's resting place in a corner of the work area (the screen minus the taskbar), 16px in from the edges.                                       |
| `nearestCorner(workArea, bubble)`      | The corner nearest the bubble: whichever quarter of the work area its centre is in.                                                                   |
| `travelBox(workArea)`                  | Every position where the bubble is fully on screen. Bounce stays inside this.                                                                         |
| `bubbleWindowBounds(bubble)`           | The bubble window's rectangle for a given bubble position.                                                                                            |
| `panelWindowBounds(bubble, n, corner)` | The panel window's rectangle. It shares the bubble window's corner that points into the screen corner, so it extends toward the middle of the screen. |

### `bubble/bounce.ts`: bounce physics

Pure maths, no Electron.

| Name                           | What it does                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `Motion`                       | Position and velocity (pixels per second).                                                                                        |
| `BOUNCE_SPEED` (280)           | How fast the bubble moves.                                                                                                        |
| `launch(from, random, corner)` | Starting motion: away from the bubble's corner, into the screen, at a random angle between 25° and 65°.                           |
| `step(motion, dtMs, box)`      | Moves the bubble forward and bounces it off any edge it crosses. Gaps over 100 ms count as one short step, so it never teleports. |
| `reflect()` _(private)_        | One axis of a bounce.                                                                                                             |
| `glideDuration(from, to)`      | How long the glide home takes: 0.3–0.9 s depending on distance.                                                                   |
| `glidePosition(from, to, t)`   | Where the bubble is at progress `t` along the glide, easing out as it settles.                                                    |

### `bubble/windows.ts`: creating the Electron windows

| Name                                      | What it does                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `View`                                    | `'bubble'` or `'panel'`.                                                                                                                                                                                                                                                                                                             |
| `createOverlayWindow(view, size)`         | Creates one overlay window: frameless, transparent, always on top, no taskbar or Alt+Tab entry. The panel window starts click-through; the bubble window never is, and can't take focus. Security options are on (sandboxed page, no Node access). Loads the page from the Vite dev server in dev, or from the built file otherwise. |
| `bubbleSurface(win)`, `panelSurface(win)` | Adapt a real window to the controller's `Surface` interface. Showing the panel resets its click-through first.                                                                                                                                                                                                                       |
| `resetClickThrough(win)` _(private)_      | Makes the panel click-through again (switching mouse forwarding off and on, which re-installs it), then tells the page exactly where the pointer is so it can switch input back on straight away if the pointer is already over real UI. Fixes clicks going astray after the panel has been hidden, e.g. for a screenshot.           |
| `lockDown(win, view)` _(private)_         | Stops the page opening new windows or navigating away. If a page crashes, reloads it (making the panel click-through meanwhile).                                                                                                                                                                                                     |
| `addEditContextMenu(win)` _(private)_     | The right-click menu in text fields: spelling suggestions, undo, redo, cut, copy, paste, select all.                                                                                                                                                                                                                                 |

### `actions.ts`: what the command icons do

| Name                         | What it does                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ActionHandlers`             | One function per command action.                                                                           |
| `createActionHandlers(deps)` | **screenshot** captures while the windows are hidden; **bounce** starts bouncing; **close** quits the app. |

### `ipc.ts`: handling requests from the pages

| Name                                      | What it does                                                                                                                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IpcContext`                              | Everything the handlers need.                                                                                                                                                           |
| `registerIpc(ctx)`                        | Connects every channel in `IPC` to the right code. Each incoming value is checked with a zod schema before use, and requests from anything other than our own two windows are rejected. |
| `trusted()`, `handle()`, `on()` _(inner)_ | Sender check; request/reply channels; fire-and-forget channels.                                                                                                                         |
| `WebUrl`                                  | Only `http`/`https` links may be opened from the chat.                                                                                                                                  |
| `chat-send` handler                       | Collects the draft's screenshots (each must be inside the screenshots folder), prepares them for Claude, sends, and clears the draft.                                                   |
| `api-key-submit` handler                  | The only place the key enters the main process. It goes straight to `ApiKeyManager.submit()` and is never sent back to a page.                                                          |

The `setInteractive` handler is where click-through happens: it calls `setIgnoreMouseEvents` on
the window that sent the message.

### `notes/NotesStore.ts`: saving the draft

| Name                                           | What it does                                                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `MAX_NOTE_LENGTH`                              | Text longer than 200,000 characters is cut off (a safety limit).                                                     |
| `emptyNotes()`                                 | A blank draft.                                                                                                       |
| `load()`                                       | Reads `notes.json`. A missing file means an empty draft; a damaged file is set aside as `notes.json.corrupt-<time>`. |
| `get()`                                        | A copy of the current draft.                                                                                         |
| `setText(text)`                                | Updates the text and schedules a save.                                                                               |
| `addAttachment(path)` / `removeAttachment(id)` | Attach a screenshot (once only) or remove one.                                                                       |
| `clear()`                                      | Empties the draft (after it's sent).                                                                                 |
| `flush()` / `flushSync()`                      | Save now (on quit), or save immediately and block (on Windows shutdown).                                             |
| `update()`, `write()` _(private)_              | Apply a change and restart the save timer; write a snapshot, dropping it if a newer write already finished.          |

### `storage/jsonFile.ts`: safe files

| Name                             | What it does                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readJsonFile(path, schema)`     | Reads a JSON file and checks it against a schema: `ok`, `missing` or `invalid`.                                                                               |
| `writeJsonFile(path, value)`     | Saves JSON safely via `writeFileAtomic`.                                                                                                                      |
| `writeFileAtomic(path, data)`    | Writes a temporary file, then renames it over the real one, so a crash mid-save can never leave a half-written file. Used for JSON and for the encrypted key. |
| `writeJsonFileSync(path, value)` | The same, blocking (for shutdown).                                                                                                                            |
| `isErrno(err, code)`             | Checks an error's code, e.g. `ENOENT` (file not found).                                                                                                       |

### `screenshots/ScreenshotService.ts`: capturing and serving screenshots

| Name                          | What it does                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capture()`                   | Captures the display the bubble is on at full resolution and saves it in `Pictures\Desktop Assist`.                                                 |
| `latest()`                    | The newest screenshot (for "Attach latest").                                                                                                        |
| `thumbnail(path)`             | A small preview for chips and sent messages (cached, up to 50).                                                                                     |
| `forClaude(path)`             | The screenshot prepared for Claude: scaled so its longest side is at most 1,568 pixels and re-encoded as JPEG, which keeps requests small and fast. |
| `open(path)` / `openFolder()` | Open a screenshot in your image viewer, or the folder in Explorer.                                                                                  |
| `owns(path)` _(private)_      | Security check: pages may only ask about files inside the screenshots folder.                                                                       |

### `screenshots/files.ts` and `screenshots/imageSize.ts`

| Name                                     | What it does                                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `screenshotFileName(date, copy)`         | `Screenshot 2026-10-02 140311.png`, or `… (2).png` for a second capture in the same second.     |
| `isScreenshotFileName(name)`             | Is this one of our screenshot names?                                                            |
| `saveScreenshot(dir, png, date)`         | Saves without ever overwriting an existing file.                                                |
| `findLatestScreenshot(dir)`              | The most recently written screenshot.                                                           |
| `isInsideDir(dir, file)`                 | Is `file` really inside `dir`? Blocks `..\..\` tricks.                                          |
| `MAX_IMAGE_EDGE`, `fitWithin(size, max)` | Scale a size down (never up) to fit within 1,568 pixels on its longest side, keeping its shape. |

### `settings.ts`: preferences

| Name                                | What it does                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `DEFAULT_EFFORT`                    | `low` (Fast).                                                                                 |
| `init()`                            | Loads `preferences.json`. The first time an installed copy runs, turns on Start with Windows. |
| `get()`                             | The current settings (Start with Windows is read live from Windows).                          |
| `setAutoStart(enabled)`             | Turns Start with Windows on or off (installed builds only).                                   |
| `setEffort(effort)`                 | Saves the response style.                                                                     |
| `bubbleAnchor`, `setBubbleAnchor()` | Where the bubble was last dragged to (display and corner), so it comes back there next time.  |

### `tray.ts` and `trayIcon.ts`: the tray icon

| Name                         | What it does                                                       |
| ---------------------------- | ------------------------------------------------------------------ |
| `createTray(options)`        | Adds the tray icon with a tooltip and a menu (Open, Quit).         |
| `circleBitmap(size, colour)` | Draws a smooth circle in the accent colour, used as the tray icon. |
| `parseHexColor(hex)`         | `#1B6AC9` → red, green and blue numbers.                           |

---

## 8. Preload (`src/preload`)

### `index.ts`

| Name                                             | What it does                                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `subscribe(channel, callback)`                   | Listens for a message from the main process and returns a function that stops listening.                    |
| `api`                                            | The `AssistApi` implementation. Each function sends the matching IPC message.                               |
| `contextBridge.exposeInMainWorld('assist', api)` | Makes `api` available to the page as `window.assist`, the **only** way the page can reach the main process. |

---

## 9. Renderer (`src/renderer`)

The UI, written in React and styled with Tailwind CSS.

### Entry files

| File                                                | Purpose                                                                                                                                                                                                               |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`                                        | The page both windows load. Its Content-Security-Policy only allows the app's own scripts and styles and inline images.                                                                                               |
| `src/main.tsx`                                      | Reads `?view=` from the URL and renders either `BubbleView` or `PanelView`.                                                                                                                                           |
| `src/styles.css`                                    | Tailwind, the accent colour and font, transparent page background, slim scrollbars, and the styles for Claude's Markdown replies and code highlighting (light and dark).                                              |
| `src/env.d.ts`                                      | Tells TypeScript that `window.assist` exists.                                                                                                                                                                         |
| `src/lib/cn.ts` → `cn(...)`                         | Joins CSS class names, skipping empty ones.                                                                                                                                                                           |
| `src/lib/anchor.ts` → `anchored()`, `originClass()` | Positions an element from the bubble's corner of the panel window (`right`/`bottom` in the bottom-right corner, `left`/`top` in the top-left…), and the matching animation origin, so the whole panel mirrors itself. |

### Hooks (`src/hooks`)

| Name                     | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useAssistState()`       | Fetches the app state when the page loads and keeps the mode, bubble corner, API key status and chat up to date as the main process changes them (`upsert` replaces a message by id, or adds it). Subscribes before fetching, so no update is missed.                                                                                                                                                                                                                                                                   |
| `useAccentColor(colour)` | Applies the tenant's accent colour.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `useClickThrough()`      | The panel page's half of click-through (see section 1): on each pointer move, switch mouse input on over `data-hit` elements and off elsewhere. While a mouse button is held (selecting text) it leaves input on, so the window can't miss the release. On a reset from the main process it decides afresh from the given pointer position. It deliberately ignores "pointer left the window": Windows sends a stale one when input is switched on, and reacting to it left the window click-through under the pointer. |
| `useToast()`             | One short message at a time, for 2.6 seconds.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `useThumbnail(path)`     | Loads a screenshot preview: `undefined` while loading, `null` if missing.                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### Views (`src/views`)

| Name                                                         | What it does                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BubbleView`                                                 | The round logo button. Finds the tenant's logo (`logo.png` if present, otherwise `logo.svg`). A press that moves more than 5 pixels becomes a drag (`bubbleDragStart` / `bubbleDragEnd`, using pointer capture so the release is never missed); otherwise it's a click. The click event that follows a drag is swallowed.                                                                                                     |
| `PanelView`                                                  | Waits for the app state, then renders `Panel`.                                                                                                                                                                                                                                                                                                                                                                                |
| `Panel`                                                      | Everything around the bubble. Holds the draft, its attachments, settings, whether the settings menu or the "change key" form is open, and toasts. **Decides what the chat card shows:** the key form when the key is missing or rejected (or you chose Change API key); "Checking your Claude API key…" while it's being tested; an offline banner with Retry when it couldn't be checked; otherwise the chat. Its functions: |
| ↳ `runAction(id)`                                            | Settings toggles the menu; anything else goes to the main process.                                                                                                                                                                                                                                                                                                                                                            |
| ↳ `changeDraft(text)`                                        | Updates the box and saves the draft.                                                                                                                                                                                                                                                                                                                                                                                          |
| ↳ `send()`                                                   | Sends the draft and clears it, or explains why it couldn't be sent.                                                                                                                                                                                                                                                                                                                                                           |
| ↳ `attachLatest()`, `removeAttachment()`, `openAttachment()` | Draft screenshot chips.                                                                                                                                                                                                                                                                                                                                                                                                       |
| ↳ `copy(text)`                                               | Copies a reply to the clipboard.                                                                                                                                                                                                                                                                                                                                                                                              |
| ↳ `submitKey(key)`, `forgetKey()`                            | The key form's Save and Forget.                                                                                                                                                                                                                                                                                                                                                                                               |
| ↳ `newConversation()`, `setEffort()`                         | Settings menu actions.                                                                                                                                                                                                                                                                                                                                                                                                        |
| ↳ `closeSettingsOnOutsideClick(e)`, Esc handler              | Close the menu, or the panel.                                                                                                                                                                                                                                                                                                                                                                                                 |

### Components (`src/components`)

| Name                   | What it does                                                                                                                                                                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ActionStack`          | The icon buttons beside the bubble: stacked above it in a bottom corner, below it in a top corner, popping out one after another when the panel opens.                                                                                                                                                         |
| `ChatBox`              | The card beside the bubble, on the side facing the middle of the screen. Anchored at the bubble's edge, so it grows away from it (upward in a bottom corner, downward in a top corner). Shows a toast just outside itself, then either the key form or the conversation, an optional banner, and the composer. |
| ↳ `Composer`           | The text box: draft screenshot chips, the auto-growing text area (Enter sends, Shift+Enter adds a line), "Attach latest screenshot", and Send (or Stop while Claude is replying). Focuses itself when the panel opens.                                                                                         |
| ↳ `Banner`             | A one-line status above the text box, with an optional spinner and action.                                                                                                                                                                                                                                     |
| `MessageList`          | The conversation. Follows new text as it streams in, unless you've scrolled up.                                                                                                                                                                                                                                |
| ↳ `UserMessage`        | Your message: screenshot thumbnails and a blue bubble.                                                                                                                                                                                                                                                         |
| ↳ `SentScreenshot`     | A sent screenshot's thumbnail (click to open).                                                                                                                                                                                                                                                                 |
| ↳ `AssistantMessage`   | Claude's reply as Markdown, "Thinking…" before text arrives, any notice (stopped, error, refusal, length limit), Retry for a failed reply, and Copy on hover.                                                                                                                                                  |
| ↳ `Thinking`           | The animated "Thinking…" indicator.                                                                                                                                                                                                                                                                            |
| `Markdown`             | Renders Claude's reply (GitHub-flavoured Markdown with highlighted code). Raw HTML is never rendered, and links open in your browser.                                                                                                                                                                          |
| `ApiKeyForm`           | "Connect to Claude": a password field, Save key (checks the key first), the error if it fails, a link to the Claude Console, and Cancel / Forget saved key when changing a working key.                                                                                                                        |
| `SettingsMenu`         | Lines up with the gear, on the side facing the middle of the screen. Start with Windows, Response style (Fast / Balanced / Thorough), Change API key, Open screenshots folder, New conversation (needs a second click), and the app version.                                                                   |
| ↳ `MenuItem`, `Switch` | A menu row; the on/off toggle graphic.                                                                                                                                                                                                                                                                         |
| `AttachmentChip`       | A screenshot attached to the draft: thumbnail, label, click to open, × to remove.                                                                                                                                                                                                                              |

---

## 10. Tests (`tests`)

Run with `npm test`. Each file tests code that doesn't need a real window or a real API.

| File                       | What it checks                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `layout.test.ts`           | Home positions in all four corners (including displays not at the origin), nearest-corner snapping, window sizes, and that the panel window opens into the screen and fits on it in every corner.                                                                                                                                    |
| `bounce.test.ts`           | Launch direction (away from each corner) and speed, bouncing off every edge, never leaving the screen, and the glide.                                                                                                                                                                                                                |
| `bubbleController.test.ts` | The bubble state machine with fake windows, a fake clock and two fake displays: open/close, blur, the saved corner, dragging (follows the mouse, snaps to the nearest corner, onto another display, panel re-placed), bouncing on the current display, screenshots, and display changes (including unplugging the bubble's display). |
| `notesStore.test.ts`       | Saving the draft, reloading, overtaken writes, damaged files, attachments.                                                                                                                                                                                                                                                           |
| `screenshotFiles.test.ts`  | Screenshot names, never overwriting, finding the newest, the inside-the-folder check.                                                                                                                                                                                                                                                |
| `format.test.ts`           | Chip labels.                                                                                                                                                                                                                                                                                                                         |
| `tenants.test.ts`          | Every tenant folder has a valid `tenant.json` and a logo.                                                                                                                                                                                                                                                                            |
| `trayIcon.test.ts`         | The tray circle.                                                                                                                                                                                                                                                                                                                     |
| `chatSession.test.ts`      | The conversation with a scripted fake backend: streaming, images before text, replaying replies unchanged (thinking included), busy/empty/no-key, Stop with and without text, Retry, key errors, refusals and length limits, the tool loop, and New conversation ignoring a late reply.                                              |
| `apiKeyManager.test.ts`    | The key lifecycle: missing, valid, rejected, offline, saving only working keys, a slow startup check not undoing a new key, revoked mid-session, Forget.                                                                                                                                                                             |
| `apiKeyStore.test.ts`      | Encrypted save and load, unreadable files, refusing to save without encryption, clear.                                                                                                                                                                                                                                               |
| `claudeHelpers.test.ts`    | Error classification, the system prompt, and image scaling.                                                                                                                                                                                                                                                                          |
