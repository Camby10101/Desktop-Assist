# Desktop Assist: Plan & Tech Stack

Status: **Milestones 0 (Foundation), 1 (Chat with Claude), 2.1 (bubble fixes), 3 (JumpCloud
sign-in), feature 3.1 (questions open in Claude Desktop) and 3.2 (Apps list, Uninstall, fixes)
complete**. Milestone 4 is in progress (§7g): app logos fixed, favourites and the service desk
icon so far. Last updated 2026-10-09.

A Windows desktop assistant that runs in the background, shows a small circular company logo
in the bottom-right corner of the screen, and opens a panel when clicked. It's built for Morse
Micro first, with branding kept in config so another business can use it later. Claude chat
(M1) and JumpCloud sign-in (M3) build on top of the foundation laid in M0. Since 3.1, Morse
Micro's questions open in the Claude Desktop app instead, so they use each person's own Claude
account and usage limit (§7e); the built-in chat stays available as a tenant setting.

---

## 1. What the user sees (Milestone 0)

```
                                       ┌─────┐
                                       │  ⏻  │  Close (quit)
                                       ├─────┤
                                       │  ↯  │  Bounce
            ┌──────────────────────┐   ├─────┤
            │ Start with Windows ✓ │ ← │  ⚙  │  Settings
            │ Open screenshots…    │   ├─────┤
            │ Clear text box       │   │  📷 │  Screenshot
            └──────────────────────┘   └─────┘
  ┌────────────────────────────────┐
  │ ┌──────┐                       │
  │ │ ▓▓▓▓ │ Screenshot 14:03   ×  │  ← attached screenshot chips
  │ └──────┘                       │
  │ ▲ text grows upward…           │
  │                                │
  │ [📎 Attach latest]     Saved ✓ │   ┌───────┐
  └────────────────────────────────┘   │  (M)  │  ← logo bubble, always on top
                                       └───────┘
══════════════════════════════════════════════════  Windows taskbar
```

- **Collapsed**: a 56px circular logo, always on top, 16px in from the bottom-right corner of the
  primary display's work area (above the taskbar). It has no taskbar button and doesn't appear in
  Alt+Tab. The tray icon has Open and Quit.
- **Click the bubble** to expand. (Shown here in its default bottom-right corner; since M1 it can
  be dragged to any corner, and everything mirrors to open toward the middle of the screen.)
  The text box opens to its **left**, aligned to its bottom edge,
  and **grows upward** as you type. Action icons stack **above** the bubble.
- **Collapse** by clicking the bubble again, pressing Esc, or clicking anywhere else.
- Only one copy runs at a time. Launching it again just opens the panel.

## 2. Important: which "Claude" this connects to (from M1)

There are two separate Claude products, and a custom app can only use one of them:

**claude.ai (the chat app, Enterprise/Team seats)**

- SSO via JumpCloud: Yes, for the claude.ai website and desktop app
- Usable from a custom app: **No.** There is no public API to drive a user's claude.ai account, and Anthropic does not allow third-party apps to use claude.ai logins without approval.
- Billing: Per-seat subscription

**Claude API (Claude Console / Platform)**

- SSO via JumpCloud: Yes, through _our_ app's sign-in (see §5)
- Usable from a custom app: **Yes.** This is what it's for.
- Billing: Per token, usually separate from seats

**M1–M3: the built-in chat uses the Claude API.** The user's "own Claude" means their JumpCloud
identity is checked every time the app gets Claude access (see §5). Their claude.ai chat history
and projects are **not** available to the app, and all usage is billed to one Console account.

**3.1: questions open in Claude Desktop.** Morse Micro gives each person a usage limit in
claude.ai (through their group), and wanted Desktop Assist to use that limit. Only Anthropic's
own apps draw on it, so Desktop Assist now hands each question to the **Claude Desktop** app
with its documented `claude://` link (§7e). The conversation then happens in the person's own
claude.ai account, with their history, projects and organization instructions, and counts
against their own limit. The tenant setting `chatApp` picks `claude-desktop` or `built-in`.

## 3. Tech stack

- **Language:** **TypeScript 6**. TS 7 (the native compiler) isn't supported by typescript-eslint yet
- **Desktop shell:** **Electron 44**. Transparent, frameless, always-on-top windows; tray; login items; `desktopCapturer`
- **Build / dev:** **electron-vite 5** + **Vite 7**. Hot-reload dev loop. electron-vite 5 doesn't support Vite 8 yet
- **Packaging:** **electron-builder**. Unsigned NSIS installer for now. MSI, signing and auto-update come in M4
- **UI:** **React 19** + **Tailwind CSS 4** + **lucide-react** icons. Follows Windows light/dark mode
- **Validation:** **zod 4**. Every IPC payload, saved file and tenant config is checked at runtime
- **Tests:** **Vitest**. Pure logic (layout, bounce physics, autosave, screenshot files, tenant config)
- **Quality:** ESLint 10 + typescript-eslint + Prettier
- **Repo:** npm workspaces (`apps/*`). `apps/gateway` and `packages/shared` are added when the backend arrives
- **_M1:_ Claude:** `@anthropic-ai/sdk`, streaming Messages API, `claude-opus-5-5`. Effort set explicitly; server-side refusal fallbacks; prompt caching
- **_M1:_ rendering:** react-markdown + remark-gfm + Shiki
- **_M3:_ sign-in:** openid-client 6 (JumpCloud OIDC, PKCE) + Electron `safeStorage`. Refresh token encrypted with Windows DPAPI
- **_M3:_ Claude access:** Anthropic SDK `oidcFederationProvider` (Workload Identity Federation). Swaps the JumpCloud ID token for a short-lived Claude token; no API key
- **_3.2:_ Apps list:** JumpCloud's MCP Server for Users through the official MCP SDK (`@modelcontextprotocol/sdk`: Streamable HTTP client, OAuth with PKCE and dynamic client registration)
- **_3.1:_ Claude Desktop:** its documented `claude://claude.ai/new?q=` link (`shell.openExternal`), Electron 44's async clipboard (`clipboard.write` with a `ClipboardItem`; `writeImage` is gone) for screenshots, and a Windows notification
- **_Later:_ gateway:** Hono + jose, in a container. Optional, for per-user audit and quotas (§4)

Considered and rejected: **Tauri**, which has no official Anthropic SDK, needs a Rust toolchain,
and has rougher transparent-window behaviour on WebView2. **.NET WinUI** is Windows-only.

## 4. Architecture

### Desktop app (M0)

```
┌─────────────────────────── Main process (Node) ───────────────────────────┐
│ BubbleController: mode state machine                                       │
│   collapsed ⇄ expanded, bouncing → returning → collapsed, capturing         │
│ Bubble window (72×72, never resizes, moves while bouncing)                  │
│ Panel window  (fixed size, shown/hidden; transparent areas click-through)   │
│ NotesStore (autosave) · ScreenshotService · Settings · Tray · IPC (zod)     │
└──────────────▲───────────────────────────────────────────▲────────────────┘
               │ typed contextBridge API                   │
     ┌─────────┴─────────┐                      ┌──────────┴───────────┐
     │ Renderer: bubble  │                      │ Renderer: panel      │
     │ (logo, click)     │                      │ (actions, settings,  │
     └───────────────────┘                      │  text box, chips)    │
                                                └──────────────────────┘
```

- **Two windows, one renderer bundle** (`?view=bubble` / `?view=panel`). The bubble window is
  tiny, can't take focus and never resizes. That means no flicker on open/close and nothing large
  moving during Bounce. The panel window has a fixed size and its empty areas pass clicks through
  to whatever is underneath (`setIgnoreMouseEvents` with forwarding, toggled whenever the pointer
  is over real UI, and reset each time the panel is shown). The bubble window is never
  click-through: relying on mouse forwarding there let clicks occasionally fall through it.
- The **main process owns all state** (mode, notes, settings). Renderers display it and send
  intents. Neither renderer can reach Node or the filesystem directly.
- **Hardening:** `contextIsolation`, `sandbox`, no `nodeIntegration`, strict CSP, navigation and
  `window.open` blocked. Every file path from a renderer is checked to be inside the screenshots
  folder before it's opened.

### Claude access (M3): direct, no server

Two designs were considered:

- **Option A: Gateway.** The desktop sends a JumpCloud token to a small Morse-hosted service,
  which checks it and calls Claude. Allows per-user usage, quotas and an audit log, but needs
  hosting.
- **Option B: Direct (built in M3).** The desktop swaps the user's JumpCloud ID token for a
  short-lived Claude API token using Anthropic's **Workload Identity Federation** (WIF), then
  calls Claude itself. No server to run and no API key anywhere. Anthropic checks the ID token
  against a federation rule (issuer, audience, an email condition) on every swap. The trade-off:
  at Anthropic, all usage shows as one service account, so per-user reporting would need the
  gateway.

```
 Desktop Assist ── 1. sign in (browser, PKCE) ──────────▶ JumpCloud
                ◀─ refresh token (saved, DPAPI) + ID token
                ── 2. POST /v1/oauth/token (ID token) ──▶ Anthropic: the federation
                ◀─ Claude access token (short-lived)        rule checks the ID token
                ── 3. /v1/messages, Bearer token ───────▶ Claude
```

The desktop talks to a `ChatBackend` interface, so a gateway can still be added later.

### Claude Desktop (3.1): no Claude access in the app at all

```
 Desktop Assist ── claude://claude.ai/new?q=<question> ──▶ Claude Desktop, signed in to the
                ── screenshots → clipboard (one image)       person's own claude.ai account:
                ── notification: "press Ctrl+V"               their usage, their limit
```

`start()` builds one of two things from the tenant's `chatApp`: the built-in chat (sign-in,
backend, chat session) or a `ClaudeDesktop`. Only the IPC handlers for the one in use are
registered. With Claude Desktop, `AppState.auth` is null and the panel shows only the text box.

## 5. Sign-in design (M3): "log in once, stay logged in"

1. OIDC **Authorization Code + PKCE** as a JumpCloud _public client_ ("Public (None PKCE)"), so
   there's no client secret in the app. It uses the **system browser** and a **loopback redirect**
   (RFC 8252): the app listens on `http://127.0.0.1:47621/callback` only while a sign-in is in
   progress. The PC is usually already signed in to JumpCloud in the browser, so this is
   near-instant. State and nonce are checked, and openid-client validates the ID token.
2. The **refresh token** (`offline_access`) is saved encrypted with `safeStorage` (Windows DPAPI)
   in `%APPDATA%\Desktop Assist\jumpcloud-session.bin`. Nothing else is saved. At every start the
   app renews it silently. JumpCloud may hand back a new refresh token each time; the newest is
   saved.
3. **Claude access.** Anthropic accepts each ID token only once (its `jti` is single-use), so
   every swap uses a new one: the unused ID token from signing in or starting up first, then one
   from a refresh. Refreshes run one at a time, so a refresh token is never used twice. The
   Anthropic SDK keeps the Claude token, gets a new one shortly before it expires, and retries once
   if Anthropic rejects it. No token ever reaches the UI.
4. If JumpCloud refuses the saved sign-in (expired, revoked, user removed), the panel shows
   _Sign in with JumpCloud_ with an explanation. The conversation is kept, so Retry works after
   signing back in. If JumpCloud can't be reached, the sign-in is kept and a banner offers Retry.
   **Log out** in Settings revokes the refresh token with JumpCloud, deletes the saved file and
   clears the chat.

## 6. Repo layout

```
Desktop-Assist/
├─ package.json                 npm workspaces root (scripts delegate to apps/desktop)
├─ apps/desktop/
│  ├─ electron.vite.config.ts   TENANT=<id> picks tenants/<id> at build time
│  ├─ electron-builder.yml
│  ├─ src/main/                 index (lifecycle), bubble/ (windows, layout, bounce, controller),
│  │                            claudeDesktop + sendInClaude (3.1), apps/ (3.2), auth/
│  │                            (JumpCloud sign-in), claude/ (chat), storage/, actions, notes/,
│  │                            screenshots/, settings, tray, uninstall, ipc
│  ├─ src/preload/              typed contextBridge API (window.assist)
│  ├─ src/renderer/             React views: BubbleView, PanelView (+ components)
│  ├─ src/shared/               IPC contract, action registry, UI geometry constants, types
│  └─ tests/                    Vitest unit tests
├─ tenants/morse-micro/         tenant.json (names, colours, actions, chatApp, portal, sign-in
│                                IDs) + logo.png
└─ docs/                        PLAN.md, CLAUDE_DESKTOP_SETUP.md, APPS_SETUP.md and
                                 JUMPCLOUD_SETUP.md (for IT),
                                 code-guide/ (CODE_GUIDE.md and the walkthrough pages),
                                 CODE_GUIDE.pdf
```

## 7. Milestone 0 spec

- **Bubble & shell**: As in §1. Re-anchors when the resolution, taskbar or monitors change. Tray icon with Open and Quit. Single instance.
- **Action icons**: Built from the action registry, stacking upward from the bubble: **Screenshot, Settings, Bounce, Close**. Order and visibility come from `tenant.json`.
- **Settings**: A menu next to the gear. **Start with Windows** is a toggle, turned on by default the first time an installed build runs. It's disabled in dev builds. **Open screenshots folder** opens Explorer. **Clear text box** asks you to click again to confirm, then clears the text and chips (the image files are kept). The app version is shown at the bottom.
- **Close**: Quits immediately with no confirmation. It's the icon furthest from the bubble so it's hard to hit by accident. Pending text is saved first. Auto-start brings the app back at next login.
- **Text box**: A multi-line box. **Autosaves** about 0.5 s after you stop typing, and also when it closes and when the app quits. It's restored after a restart and shows a "Saved" indicator. Saved to `%APPDATA%\Desktop Assist\notes.json` with atomic writes. A corrupt file is backed up and replaced with an empty one. No Claude connection yet.
- **Screenshot**: An action icon. It hides Desktop Assist's own windows, captures **the screen the bubble is on** at full resolution, saves `Pictures\Desktop Assist\Screenshot YYYY-MM-DD HHMMSS.png`, reopens the panel and shows a "Screenshot saved" toast. Files are never deleted automatically.
- **Attach latest**: A 📎 button in the text box. It adds the most recent screenshot as a **thumbnail chip** (no duplicates). Click the chip to open it full size, × to remove it. Chips are saved with the text. A chip whose file was deleted shows as missing.
- **Bounce**: An action icon. The panel collapses and the bubble moves at a constant speed, bouncing off the edges of the work area. **Clicking the bubble stops it and it glides back to the corner.**

**Extension points built in M0 (so later features are small additions):**

1. **Action registry.** Each icon is one entry (`id, label, icon, kind: popover | command`) plus a
   main-process handler.
2. **The bubble's position is state, not a constant.** Pure layout and physics functions handle
   it, and a mode-aware click (`collapsed → expand`, `bouncing → stop + glide home`).
3. **Attachments are part of the saved text box.** In M1 the text box becomes the chat input and
   the chips are sent to Claude as image blocks.

## 7b. Milestone 1 spec: Chat with Claude

- **API key**: _Replaced by JumpCloud sign-in in M3, which also deletes the saved key file._ Used the user's own Claude API key. **Every time the app starts it tests the saved key** (a free call that fetches the model's details). If there's no key, or Anthropic rejects it, the chat box asks for one before anything else. A new key is checked with Anthropic first and saved only if it works, encrypted with Windows DPAPI (`%APPDATA%\Desktop Assist\claude-api-key.bin`). It never reaches the UI. If Anthropic can't be reached at startup, the key is kept, chat stays available, and a banner offers Retry. A key revoked mid-conversation brings the key form back with an explanation. Settings → Change API key also offers Forget saved key.
- **Chat**: The text box becomes the chat input. Enter sends; Shift+Enter adds a line. Replies stream in as Markdown with highlighted code; links open in the browser. "Thinking…" shows until text arrives. Stop cancels a reply and keeps what arrived. Each reply has Copy. The card grows upward to 520px, then scrolls.
- **Screenshots**: Attached screenshots are sent with the next message, scaled to at most 1568px and JPEG-encoded, and shown as thumbnails on the sent message.
- **Errors**: Plain-English messages for offline, busy, rate limits, no credit, a declined request, and a reply cut off at the length limit. Temporary errors get Retry.
- **Settings**: Response style: Fast (default) / Balanced / Thorough (the API's `effort`). New conversation replaces Clear text box.
- **Request shape**: `claude-opus-5-5`, streaming, adaptive thinking (always on), effort as chosen, server-side refusal fallback (`fallbacks: "default"`), prompt caching, a fixed system prompt plus the tenant's `systemPrompt`. History is append-only, with every reply's content (including thinking) sent back unchanged. A tool-use loop is in place, with no tools registered yet.
- **History**: Kept for the current session; New conversation or quitting clears it. The unsent draft still survives restarts.
- **Drag & snap**: Drag the bubble anywhere, including onto another monitor. On release it glides to the nearest corner of the display it was dropped on. A short press is still a click. The panel mirrors itself so it always opens toward the middle of the screen: in a left corner the chat opens to the right, and in a top corner the icons drop below the bubble and the chat grows downward. The corner and display are remembered across restarts. If that display is unplugged, the bubble moves to the same corner of the main display. Bounce starts from, stays on, and returns to the bubble's current display and corner.

Tested with unit tests (128) and end-to-end runs of the real app: against a local mock of the
Claude API (38 checks), so no real key was needed, and dragging to each corner and onto a second
monitor at different scaling (21 checks).

## 7c. Milestone 2.1: Bubble fixes

- **Clicks no longer fall through the bubble**: Clicking the bubble could do nothing, because the click went to the window behind it (found after taking a screenshot and opening the screenshots folder, but it could happen at any time: about 1 hover in 6). The bubble window is no longer click-through at all. The panel keeps click-through for its empty areas, ignores the stale "mouse left" message that caused the problem, and resets click-through from the real pointer position each time it opens.
- **Bubble borders and purple accent**: A 2px white border is always around the bubble. While the panel is open, a 2px purple border sits outside the white one. The tenant accent colour is now purple (`#9333EA`), so every former blue highlight matches: your messages, Send, links, switches, the response-style selector, the key form, the active gear, the tray icon, text selection, and the code highlighting (purple in place of blue).

Checked with real mouse input (hovering 6/6, the screenshot → folder → bubble sequence), plus the
unit tests, the drag test and screen captures of the borders.

## 7d. Milestone 3 spec: JumpCloud sign-in

The API key is gone. Users sign in with JumpCloud, and Claude is reached through Workload Identity
Federation (§4, §5).

- **Sign in**: While nobody is signed in, the chat box shows **Sign in with JumpCloud**. It opens JumpCloud in the default browser. When the browser comes back, the chat box reopens, ready to chat. While waiting it says "Finish signing in in your browser", with **Cancel**. Sign-in gives up after 5 minutes.
- **Stay signed in**: The sign-in is saved encrypted and renewed silently at every start ("Checking your JumpCloud sign-in…"). There's nothing to do until JumpCloud ends it.
- **Offline**: If JumpCloud can't be reached at start, the sign-in is kept, the chat stays usable (sending tries again) and a banner offers **Retry**.
- **Expired / revoked**: The chat box shows the sign-in again with "Your JumpCloud sign-in has expired". The conversation is kept; after signing back in, **Retry** resends the message that failed.
- **Refused**: If JumpCloud refuses (e.g. the user isn't assigned to the app), its reason is shown. If Anthropic's federation rule refuses the user: "Your JumpCloud account isn't set up to use Claude yet. Contact IT."
- **Settings**: "Signed in as _name_" and **Log out**, which revokes the sign-in with JumpCloud, deletes it from this PC and clears the chat. Change API key is gone.
- **Not set up**: Until IT fills in `tenant.json`, the chat box says sign-in isn't set up and lists the missing settings. Nothing is contacted.
- **Config**: `tenant.json` gains `signIn` (issuer, client ID, redirect port) and `claudeAccess` (organization, federation rule, service account and optional workspace IDs). None of them are secret. Dev runs can override them from a file named by `DESKTOP_ASSIST_DEV_CONFIG`.
- **Focus ring**: Keyboard focus is now purple everywhere, instead of following the Windows accent colour.
- **Icons**: The tray icon and the `.exe` icon (also used for the Start menu shortcut and the installer) are the bubble's logo.
- **Diagnostics**: Errors show Anthropic's request reference, and the full details go to `%APPDATA%\Desktop Assist\logs\desktop-assist.log` (and the terminal in dev runs). When Anthropic refuses the sign-in swap, the log also records a summary of the ID token that was sent (issuer, audience, email, lifetime, signing key; never the token), to compare with the federation rule.

Tested with unit tests (159, including the sign-in manager, the loopback listener and the fallback rule) and an
end-to-end run of the real app (47 checks) against a local mock JumpCloud and a mock Anthropic
token exchange. The mock JumpCloud does PKCE, rotating refresh tokens, and RS256 ID tokens with a
single-use `jti`. The mock exchange checks signatures, audience and replays. The run covers first
sign-in, chat, token renewal after a rejection, restart, starting offline and Retry, IT revoking
the sign-in, Log out, a refused sign-in and Cancel.

Working end to end with the real services: signed in with JumpCloud, and the installed app
answers through Claude (tested with the mouse and keyboard on the installed build). Getting there
needed two setup fixes, now in `JUMPCLOUD_SETUP.md`:

- `tenant.json` had the claude.ai organization ID; it must be the Console's (Settings →
  Organization). With the wrong one, Anthropic can't find the rule and records nothing.
- The federation rule had no Expected audience. Anthropic then only accepts tokens whose audience
  is `https://api.anthropic.com`, which a JumpCloud ID token never has; it's now set to the
  JumpCloud client ID (deny reason `jwt_audience_mismatch`).

The installer now installs to `AppData\Local\Programs\desktop-assist` instead of
`@desktop-assistdesktop` (an upgrade stays in the folder of the version it replaces).

Fixed while writing the code walkthrough: replies are sent back the way the API requires after a
server-side fallback; the panel knew the saved corner only after start-up finished, so it could lay
itself out for the wrong corner; the pages could ask for their state before the main process was
ready to answer; a failure during start-up didn't show the error box; Cancel pressed in the first
moment of a sign-in still opened the browser; sign-in timeouts weren't reported as "Couldn't reach
JumpCloud"; two preference saves at once could finish in the wrong order. Also fixed: sending a
message while scrolled up now returns to the bottom, clicking a sent screenshot whose file was
deleted says so, and `mailto:` links in replies open the email app.

The Code Guide is also available as one PDF, `docs/CODE_GUIDE.pdf` (`npm run docs:pdf`).

## 7e. Feature 3.1 spec: questions open in Claude Desktop

Each person's questions should come out of their own usage limit, which Morse sets per group in
claude.ai. The API can't do that (§2), so Desktop Assist hands the question to Claude Desktop.

- **Ask**: Enter (or the **Ask in Claude** button) opens a new Claude Desktop chat with the question filled in, using `claude://claude.ai/new?q=…`. The panel closes and the text box is cleared. It works with the app closed (Windows starts it). Claude Desktop shows its own caution notice above a question that arrives by link; that can't be turned off from Desktop Assist.
- **Sent for you**: The link only fills the question in (Anthropic documents no way to send it), so with **Send in Claude automatically** on (the default) Desktop Assist then presses the keys: Ctrl+V for a screenshot, then Enter. A hidden Windows PowerShell helper uses Windows UI Automation and presses a key only while the focused text box belongs to Claude Desktop **and** already shows the question, so nothing lands in another app or another Claude box (this same window can hold a Claude Code session). It waits up to 20 s for that, gives a pasted screenshot 2.5 s, and presses Enter again (up to 3 times) only while the question is still in the box. If it can't (Claude didn't come forward, the focus moved, PowerShell is blocked), a notification says what's left: "Press Enter in Claude to send it", or to paste the screenshot first; the reason goes to the log. A screenshot with no question is never sent for the user: there'd be no question to find in Claude's box. With the setting off, the person presses Enter in Claude themselves.
- **Screenshots**: A link can't carry images, so the attached screenshots are copied to the clipboard as one image: several are scaled to the narrowest one's width (at most 2560px) and stacked top to bottom with a grey band between (the clipboard holds one). They're pasted for the user when the question is sent for them; otherwise a Windows notification says "Screenshot copied. In Claude, press Ctrl+V to add it to your message, then send." The panel says which under the attached screenshots before sending.
- **Not installed**: Each time the panel opens, Desktop Assist checks that something on the PC opens `claude://` links. If not, a line above the text box says "Claude Desktop isn't installed on this PC, and Desktop Assist opens your questions in it. Ask IT to install it, or download it." with a **Download** button (`https://claude.com/download`). Asking anyway says the same and opens nothing.
- **Limits and errors**: Questions over 12,000 characters are refused with an explanation (Claude Desktop cuts a link's question off at about 14,000). A deleted screenshot, or Windows failing to open the link, says so and keeps the draft; the reason goes to the log.
- **No sign-in**: Desktop Assist doesn't sign in or contact Anthropic. At start it deletes the JumpCloud sign-in the built-in chat saved. Settings has Start with Windows, **Send in Claude automatically** (on by default), Open screenshots folder and **Clear text box** (click twice); Response style, New conversation and Log out belong to the built-in chat.
- **Config**: `tenant.json` gains `chatApp`: `claude-desktop` (Morse Micro) or `built-in` (the default, M1–M3). `signIn` and `claudeAccess` are only needed for `built-in`. Dev runs can switch it with `DESKTOP_ASSIST_DEV_CONFIG`.
- **For IT**: [CLAUDE_DESKTOP_SETUP.md](CLAUDE_DESKTOP_SETUP.md): install Claude Desktop, have people sign in to the Morse Micro organization (`forceLoginOrgUUID` recommended), limits stay in claude.ai, and company context goes in claude.ai's Organization instructions.

Options considered (from Anthropic's documentation, October 2026):

- **Use the claude.ai limit from the app directly**: not possible. Anthropic doesn't let other apps sign in to claude.ai or use its limits without its approval, and offers no way to.
- **A Console workspace per person** with its own spend limit (WIF can map each person to their workspace): a real per-person limit, but a separate one from claude.ai's, and 100 workspaces at most by default.
- **A nightly job** lowering each person's claude.ai limit by what they spent through the API: needs a server with two admin keys, turns group limits into per-person ones, and lags a day.
- **Claude Desktop** (chosen): uses the real limit with no server. The `claude://` link and Claude Desktop's Windows support are documented; sending the question (and pasting screenshots) for the user is Desktop Assist pressing the keys, guarded as above. Quick Entry's screenshot tools are Mac-only.

Tested with unit tests (194, including the link encoding, the hand-over order and its errors,
sending in Claude and what's said when it can't, the PowerShell helper's script, and stacking
screenshots) and an end-to-end run of the real app (39 checks) with opening links,
notifications and the clipboard recorded: the link for a question, the panel closing, two
screenshots of different sizes arriving on the clipboard as one stacked image, the Send in
Claude switch and the hints it changes, the not-installed warning and its Download button, the
long-question, deleted-screenshot and failed-link errors, Clear text box, and one pass through
the real Windows clipboard. The built-in chat's end-to-end runs (47 and 9 checks) still pass with
`chatApp` set to `built-in`.

Also tried for real (with permission) on this PC's Claude Desktop, signed in to Morse Micro:
with the setting off, a test question opened a new chat with the question filled in, the
"Screenshot copied" notification arrived, and Ctrl+V in Claude added the screenshot. With it on,
a test question and screenshot were pasted and sent by themselves and Claude answered, about 10
seconds after clicking Ask, with no notification needed.

## 7f. Feature 3.2 spec: Apps list, Uninstall, and fixes

**Apps list**

- **Opens on the apps**: For Morse Micro the panel opens on the Apps list (`startPage: "apps"` in `tenant.json`), and the text box for asking Claude is behind a new **Ask Claude** icon (a speech bubble, nearest the bubble). Clicking it swaps the card to the text box; clicking it again, or Esc, swaps back; Esc on the apps closes the panel. The panel always reopens on the apps. After taking a screenshot it shows the text box, so **Attach latest screenshot** is right there. While an unsent question or screenshot waits behind the icon, a dot on it says so. The list loads in the background when Desktop Assist starts, so it's there as soon as the panel opens (this never opens the browser). Tenants that start on the text box (`startPage: "ask"`, the default) can show the list behind an **Apps** icon (a grid, "Your apps") instead.
- **The list**: The same apps the user sees in their JumpCloud User Portal, by name, with their logos (or the first letter on the accent colour), in a grid; a search box appears above 8 apps. **Refresh** reloads it; **Open the JumpCloud portal** opens the User Portal. Clicking an app opens its sign-in link in the default browser and closes the panel.
- **Where it comes from**: JumpCloud's **MCP Server for Users** (`usermcp.jumpcloud.com`), documented by JumpCloud for apps on the user's own PC: `list_applications` gives the apps the user can access, `launch_application` each one's sign-in link. Each user connects once: **Sign in with JumpCloud** opens the browser (OAuth with PKCE, Desktop Assist registers itself as a public client, loopback redirect `http://127.0.0.1:47622/callback`, a refresh token). There's no secret in the app. The connection is saved with Windows DPAPI (`jumpcloud-apps.bin`) and renewed by itself. The browser is only opened by that button, never just by looking at the list. JumpCloud documents the tools but not their exact fields, so the reader is tolerant: it looks for the usual names, skips apps hidden from the portal, takes only `https` links, and logs the field names if it can't find a list.
- **Errors**: Not turned on by IT ("The apps list isn't turned on for your company yet"), offline, a cancelled or refused sign-in (with JumpCloud's reason), an unreadable answer; each with Retry or the sign-in button. Logos are fetched in the main process (https, images only, at most 300 KB) and handed to the page as `data:` URLs, so the page's content policy stays strict.
- **Config**: `tenant.json` gains `portal` (`name`, `url`, `appsServer`, `redirectPort`), required for the `apps` action or `startPage: "apps"`, and `startPage` (`ask` or `apps`; starting on the apps needs the `ask` action). Morse Micro: JumpCloud, US region, opening on the apps. IT turns on the MCP Server for users once: [APPS_SETUP.md](APPS_SETUP.md).

Options considered: the User Portal's own API is internal and wants the user's password; JumpCloud's admin API needs an admin key or service-account secret (not on PCs); an IT-exported list filtered by the user's groups would go stale and miss direct assignments. The MCP Server for Users is the one documented, user-scoped way.

**Uninstall**: Settings → **Uninstall Desktop Assist** (click twice). It turns "Start with Windows" off, starts the installer's own uninstaller (`Uninstall Desktop Assist.exe`, next to the app) and quits. Like uninstalling from Windows Settings, it keeps `%APPDATA%\Desktop Assist` (preferences, the text box, logs) and the screenshots. Only in the installed app; in `npm run dev` it's greyed out.

**Fixes**

- **Clicking the bubble sometimes did nothing** after handing a question to Claude Desktop and clicking into Claude. It couldn't be reproduced on demand (about six runs with real mouse input, including the installed build under a click logger, all opened normally), but once it was caught stuck: the bubble took the hover but clicks didn't open the panel. The likeliest cause is another app taking the focus back as the panel opens, which closed it again at once. Now a blur within 0.4 s of opening doesn't close the panel, and a click on the bubble that doesn't open it is written to the log with the reason, so a next occurrence can be pinned down.
- **The notification covered the bubble**: Windows shows notifications in the bottom-right corner, over the bubble there, for about 5 s, so clicks hit the notification. Clicking a Desktop Assist notification now opens the panel.
- **Auto-send could send an old draft too**: Claude adds a linked question to whatever is already in its new-chat box, and the send step only checked that the box contained the question. It now presses keys only when the box holds exactly the question (compared through a SHA-256 of the whitespace-evened text, so the whole question never goes on a command line). Otherwise it presses nothing, and a notification says Claude's box already had text in it, to check it.

Tested with unit tests (219, including reading JumpCloud's answers, connecting, opening an app, a forged sign-in being refused, Uninstall, the open-blur rule and the exact-match rule) and an end-to-end run of the real app (25 checks) against a local stand-in for JumpCloud's MCP server doing a real OAuth sign-in (client registration, PKCE, code for tokens): the Apps icon and list, nothing opened just by looking, signing in through the browser, the apps by name with hidden ones left out, the saved connection encrypted, opening an app through `launch_application`, the list remembered and refreshed, Esc, the portal link, Uninstall greyed out in dev, and the saved connection used after a restart. The send step was checked against a stand-in text box: exactly the question gets the paste and Enter; an old draft plus the question, or other text, gets nothing. The 3.1 (39 checks) and built-in chat (47 and 9) runs still pass.

Tried for real: with the MCP Server for users turned on, the user connected Desktop Assist to Morse Micro's JumpCloud and the list of their portal apps worked. The start page and Ask Claude icon were then added at their request (end-to-end: 33 checks for 3.2, with the 3.1 (39) and built-in chat (47, 9) runs still passing; 221 unit tests). Still to try: one more auto-send in Claude Desktop with the exact-match rule.

## 7g. Milestone 4 (in progress)

Milestone 4 collects improvements as they're asked for; shipping work (signing, auto-update,
deployment) can join it later. Done so far:

- **App logos**: Some apps showed a letter instead of their logo. Watching the installed app's requests showed why: JumpCloud serves the logos a company uploads itself (`assets.jumpcloud.com/images/applications/…`) labelled `application/octet-stream`, while its catalogue logos (`static.jumpcloud.com`) are labelled `image/png`, and only image labels were accepted. The files are ordinary PNGs and JPEGs, so Desktop Assist now recognises the image from its first bytes (PNG, JPEG, GIF, WebP, ICO, BMP, SVG) and still refuses anything that isn't one, whatever its label says. Checked against Morse Micro's real logos. Logos are also kept between refreshes.
- **Favourites**: A small star on each app logo's top-right corner, faint until hovered. Clicking it stars the app (filled, gold) and moves it to the top of the list; clicking again takes the star away. Starred apps keep their name order among themselves. Saved in the preferences (`favoriteApps`), so they survive restarts.
- **Service desk**: A new icon (a headset, "IT service desk") opens the company's service desk in the default browser and closes the panel. For Morse Micro: `https://morsemicro.atlassian.net/servicedesk/customer/portals` (`serviceDesk.url` in `tenant.json`, with the `servicedesk` action).

Tested with unit tests (226, including recognising images from their bytes, the octet-stream logos, a page of HTML labelled as an image, the favourites order and the logo cache) and end-to-end (44 checks for the Apps list, now including starring an app, the order surviving a restart, unstarring, and the service desk link; the 3.1 (39) and built-in chat (47, 9) runs still pass).

## 8. Milestones

- **0** ✅ **Foundation**: Everything in §7 works in `npm run dev` and in the unsigned installer. Unit tests and lint pass.
- **1** ✅ **Chat with Claude**: See §7b.
- **2.1** ✅ **Bubble fixes**: See §7c.
- **3** ✅ **JumpCloud sign-in**: See §7d. Combines the earlier plan's M2 (sign-in) and M3 (backend), using the direct option (B).
- **3.1** ✅ **Each person's own Claude**: Questions open in Claude Desktop, against each person's own usage limit. See §7e.
- **3.2** ✅ **Apps list, Uninstall, fixes**: The user's JumpCloud portal apps in the panel; Uninstall in Settings; the bubble, notification and auto-send fixes. See §7f.
- 4 (in progress): App logos, favourites, the service desk icon (§7g). Still to choose from: code signing, auto-update, deployment through JumpCloud, CI (GitHub Actions), version numbers, a keyboard shortcut, region screenshots, reporting a problem to IT
- later : Hiding during full-screen apps, company integrations (as claude.ai organization skills or plugins, now that questions go to Claude Desktop), macOS. For the built-in chat: Claude-requested screenshots (as a tool), saved history, a gateway for per-user audit

## 9. What we need from admins

Step-by-step instructions are in [CLAUDE_DESKTOP_SETUP.md](CLAUDE_DESKTOP_SETUP.md) (3.1),
[APPS_SETUP.md](APPS_SETUP.md) (3.2) and [JUMPCLOUD_SETUP.md](JUMPCLOUD_SETUP.md) (built-in chat).

- **JumpCloud admin, Apps list (3.2):** turn on **MCP Server for users** (Settings → JumpCloud AI).

- **Claude Desktop (3.1):** installed on each PC (MSIX, deployable machine-wide), and people
  signed in to the Morse Micro claude.ai organization. Recommended: the `forceLoginOrgUUID`
  policy, so it can't be signed in to a personal account. Usage limits stay in claude.ai.
- **JumpCloud admin (built-in chat only):** a Custom OIDC app. Client authentication
  **Public (None PKCE)**; grant types Authorization Code + Refresh Token; redirect URI
  `http://127.0.0.1:47621/callback`; scopes `openid email profile offline_access`; assigned to the
  user groups who should have Desktop Assist. It gives the **client ID**.
- **Claude Console admin (built-in chat only):** a workspace for Desktop Assist, a
  service account with access to it, the JumpCloud issuer, and a federation rule for it. They
  give the **organization, federation rule and service account IDs**.
- **Code-signing certificate (M4)** (e.g. Azure Trusted Signing). Unsigned installers trigger
  SmartScreen.

## 10. Decisions

**Made**

- Attach latest → thumbnail chip
- Screenshots → `Pictures\Desktop Assist`, kept forever
- Capture → the screen the bubble is on
- Settings (M0) → Start with Windows, Open screenshots folder, Clear text box
- Bounce → glides back to the corner when stopped
- Close → quits immediately
- M1 credentials → the user's own API key (replaced in M3)
- M3 credentials → JumpCloud sign-in, with Claude reached through Workload Identity Federation
  directly from the app (option B, no server)
- Expired sign-in → keep the conversation; Log out → clear it
- Default response style → Fast (`low` effort)
- Chat history → current session only (for now)
- 3.1 usage limits → questions open in Claude Desktop, using each person's own claude.ai account
  and limit (§7e). The built-in chat stays as a tenant option (`chatApp`)
- 3.1 screenshots → copied to the clipboard; several stacked into one image
- 3.1 sending → Desktop Assist sends the question (and pastes screenshots) in Claude for the user,
  on by default, guarded by checking Claude's focused text box holds exactly the question (3.2)
- 3.2 apps → the user's JumpCloud User Portal apps, from JumpCloud's MCP Server for Users, each
  user connecting once in the browser; no secret in the app
- 3.2 uninstall → from Settings, through the installer's own uninstaller; user data kept

**Open**

1. Keep or archive the Console workspace, service account and federation rule now that Morse
   Micro uses Claude Desktop? (Archiving the rule stops the Console credit being spent through
   it; keeping it allows switching back.)
2. Built-in chat only: should chat history be saved across restarts later?

## 11. Notes

- Keep the repo **outside OneDrive**. `node_modules` plus OneDrive sync locks break Electron builds.
- The logo is `tenants/morse-micro/logo.png`: the Morse Micro "Mμ" mark cut to a circle. It's
  the bubble, the tray icon, and the icon of the `.exe`, its Start menu shortcut and the
  installer. Replacing the file is all it takes to change them.
