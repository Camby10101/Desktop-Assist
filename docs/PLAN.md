# Desktop Assist: Plan & Tech Stack

Status: **Milestones 0 (Foundation), 1 (Chat with Claude) and 2.1 (bubble fixes) complete**. Next up: M2 (JumpCloud sign-in).
Last updated 2026-10-08.

A Windows desktop assistant that runs in the background, shows a small circular company logo
in the bottom-right corner of the screen, and opens a panel when clicked. It's built for Morse
Micro first, with branding kept in config so another business can use it later. Claude chat
(M1) and JumpCloud sign-in (M2) build on top of the foundation laid in M0.

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

|                          | claude.ai (the chat app, Enterprise/Team seats)                                                                                                             | Claude API (Claude Console / Platform)      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| SSO via JumpCloud        | Yes, for the claude.ai website and desktop app                                                                                                              | Yes, but through _our_ app's login (see §5) |
| Usable from a custom app | **No.** There is no public API to drive a user's claude.ai account, and Anthropic does not allow third-party apps to use claude.ai logins without approval. | **Yes.** This is what it's for.             |
| Billing                  | Per-seat subscription                                                                                                                                       | Per token, usually separate from seats      |

**So Desktop Assist will use the Claude API.** The user's "own Claude" means their JumpCloud
identity is checked on every request. Their claude.ai chat history and projects are **not**
available to the app.

## 3. Tech stack

| Layer           | Choice                                                         | Notes                                                                               |
| --------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Language        | **TypeScript 6**                                               | TS 7 (the native compiler) isn't supported by typescript-eslint yet                 |
| Desktop shell   | **Electron 44**                                                | Transparent, frameless, always-on-top windows; tray; login items; `desktopCapturer` |
| Build / dev     | **electron-vite 5** + **Vite 7**                               | Hot-reload dev loop. electron-vite 5 doesn't support Vite 8 yet                     |
| Packaging       | **electron-builder**                                           | Unsigned NSIS installer in M0. MSI, signing and auto-update come in M4              |
| UI              | **React 19** + **Tailwind CSS 4** + **lucide-react** icons     | Follows Windows light/dark mode                                                     |
| Validation      | **zod 4**                                                      | Every IPC payload, saved file and tenant config is checked at runtime               |
| Tests           | **Vitest**                                                     | Pure logic (layout, bounce physics, autosave, screenshot files, tenant config)      |
| Quality         | ESLint 10 + typescript-eslint + Prettier                       |                                                                                     |
| Repo            | npm workspaces (`apps/*`)                                      | `apps/gateway` and `packages/shared` are added when the backend arrives             |
| _M1:_ Claude    | `@anthropic-ai/sdk`, streaming Messages API, `claude-opus-5-5` | Effort set explicitly; server-side refusal fallbacks; prompt caching                |
| _M1:_ rendering | react-markdown + remark-gfm + Shiki                            |                                                                                     |
| _M2:_ sign-in   | openid-client (JumpCloud OIDC, PKCE) + Electron `safeStorage`  |                                                                                     |
| _M3:_ gateway   | Hono + jose, in a container                                    | Recommended backend (§4)                                                            |

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

### Later: Claude backend (M3)

**Option A: Gateway (recommended).** The desktop sends a JumpCloud token to a small Morse-hosted
Hono service. The service verifies the token and calls Claude using Workload Identity Federation
(no static key). No Anthropic credential is ever on a laptop. It enables per-user usage, quotas,
an audit log and multi-tenant support. It's a policy proxy for the Messages API, and the tool loop
stays on the desktop.
**Option B: Direct.** The desktop exchanges the JumpCloud ID token for a Claude API token via
WIF. No infrastructure, but every user shares one service-account identity. Needs a spike first.
The desktop talks to a `ChatBackend` interface, so it can switch between the two.

## 5. Sign-in design (M2): "log in once, stay logged in"

1. OIDC **Authorization Code + PKCE** as a JumpCloud _public client_ ("Public (None PKCE)"). It
   uses the **system browser** with a loopback or custom-scheme redirect (RFC 8252). The PC is
   already signed in to JumpCloud, so this is near-instant.
2. Refresh token (`offline_access`) encrypted with `safeStorage` (Windows DPAPI). Access tokens
   stay in memory only. Refresh silently at launch and before expiry. JumpCloud refresh tokens
   last up to 90 days.
3. If refresh fails, the panel shows _Sign in with JumpCloud_. **Log out** is added to Settings at
   this milestone. It revokes the token and deletes local tokens.

## 6. Repo layout

```
Desktop-Assist/
├─ package.json                 npm workspaces root (scripts delegate to apps/desktop)
├─ apps/desktop/
│  ├─ electron.vite.config.ts   TENANT=<id> picks tenants/<id> at build time
│  ├─ electron-builder.yml
│  ├─ src/main/                 index (lifecycle), bubble/ (windows, layout, bounce, controller),
│  │                            actions, notes/, screenshots/, settings, tray, ipc
│  ├─ src/preload/              typed contextBridge API (window.assist)
│  ├─ src/renderer/             React views: BubbleView, PanelView (+ components)
│  ├─ src/shared/               IPC contract, action registry, UI geometry constants, types
│  └─ tests/                    Vitest unit tests
├─ tenants/morse-micro/         tenant.json (names, colours, enabled actions) + logo.png
└─ docs/PLAN.md
```

## 7. Milestone 0 spec

| Feature            | Behaviour                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Bubble & shell** | As in §1. Re-anchors when the resolution, taskbar or monitors change. Tray icon with Open and Quit. Single instance.                                                                                                                                                                                                                                         |
| **Action icons**   | Built from the action registry, stacking upward from the bubble: **Screenshot, Settings, Bounce, Close**. Order and visibility come from `tenant.json`.                                                                                                                                                                                                      |
| **Settings**       | A menu next to the gear. **Start with Windows** is a toggle, turned on by default the first time an installed build runs. It's disabled in dev builds. **Open screenshots folder** opens Explorer. **Clear text box** asks you to click again to confirm, then clears the text and chips (the image files are kept). The app version is shown at the bottom. |
| **Close**          | Quits immediately with no confirmation. It's the icon furthest from the bubble so it's hard to hit by accident. Pending text is saved first. Auto-start brings the app back at next login.                                                                                                                                                                   |
| **Text box**       | A multi-line box. **Autosaves** about 0.5 s after you stop typing, and also when it closes and when the app quits. It's restored after a restart and shows a "Saved" indicator. Saved to `%APPDATA%\Desktop Assist\notes.json` with atomic writes. A corrupt file is backed up and replaced with an empty one. No Claude connection yet.                     |
| **Screenshot**     | An action icon. It hides Desktop Assist's own windows, captures **the screen the bubble is on** at full resolution, saves `Pictures\Desktop Assist\Screenshot YYYY-MM-DD HHMMSS.png`, reopens the panel and shows a "Screenshot saved" toast. Files are never deleted automatically.                                                                         |
| **Attach latest**  | A 📎 button in the text box. It adds the most recent screenshot as a **thumbnail chip** (no duplicates). Click the chip to open it full size, × to remove it. Chips are saved with the text. A chip whose file was deleted shows as missing.                                                                                                                 |
| **Bounce**         | An action icon. The panel collapses and the bubble moves at a constant speed, bouncing off the edges of the work area. **Clicking the bubble stops it and it glides back to the corner.**                                                                                                                                                                    |

**Extension points built in M0 (so later features are small additions):**

1. **Action registry.** Each icon is one entry (`id, label, icon, kind: popover | command`) plus a
   main-process handler.
2. **The bubble's position is state, not a constant.** Pure layout and physics functions handle
   it, and a mode-aware click (`collapsed → expand`, `bouncing → stop + glide home`).
3. **Attachments are part of the saved text box.** In M1 the text box becomes the chat input and
   the chips are sent to Claude as image blocks.

## 7b. Milestone 1 spec: Chat with Claude

| Feature           | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API key**       | Uses the user's own Claude API key until JumpCloud sign-in (M2/M3) replaces it. **Every time the app starts it tests the saved key** (a free call that fetches the model's details). If there's no key, or Anthropic rejects it, the chat box asks for one before anything else. A new key is checked with Anthropic first and saved only if it works, encrypted with Windows DPAPI (`%APPDATA%\Desktop Assist\claude-api-key.bin`). It never reaches the UI. If Anthropic can't be reached at startup, the key is kept, chat stays available, and a banner offers Retry. A key revoked mid-conversation brings the key form back with an explanation. Settings → Change API key also offers Forget saved key. |
| **Chat**          | The text box becomes the chat input. Enter sends; Shift+Enter adds a line. Replies stream in as Markdown with highlighted code; links open in the browser. "Thinking…" shows until text arrives. Stop cancels a reply and keeps what arrived. Each reply has Copy. The card grows upward to 520px, then scrolls.                                                                                                                                                                                                                                                                                                                                                                                               |
| **Screenshots**   | Attached screenshots are sent with the next message, scaled to at most 1568px and JPEG-encoded, and shown as thumbnails on the sent message.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Errors**        | Plain-English messages for offline, busy, rate limits, no credit, a declined request, and a reply cut off at the length limit. Temporary errors get Retry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Settings**      | Response style: Fast (default) / Balanced / Thorough (the API's `effort`). New conversation replaces Clear text box.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Request shape** | `claude-opus-5-5`, streaming, adaptive thinking (always on), effort as chosen, server-side refusal fallback (`fallbacks: "default"`), prompt caching, a fixed system prompt plus the tenant's `systemPrompt`. History is append-only, with every reply's content (including thinking) sent back unchanged. A tool-use loop is in place, with no tools registered yet.                                                                                                                                                                                                                                                                                                                                          |
| **History**       | Kept for the current session; New conversation or quitting clears it. The unsent draft still survives restarts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

| **Drag & snap** | Drag the bubble anywhere, including onto another monitor. On release it glides to the nearest corner of the display it was dropped on. A short press is still a click. The panel mirrors itself so it always opens toward the middle of the screen: in a left corner the chat opens to the right, and in a top corner the icons drop below the bubble and the chat grows downward. The corner and display are remembered across restarts. If that display is unplugged, the bubble moves to the same corner of the main display. Bounce starts from, stays on, and returns to the bubble's current display and corner. |

Tested with unit tests (128) and end-to-end runs of the real app: against a local mock of the
Claude API (38 checks), so no real key was needed, and dragging to each corner and onto a second
monitor at different scaling (21 checks).

## 7c. Milestone 2.1: Bubble fixes

| Change                                       | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Clicks no longer fall through the bubble** | Clicking the bubble could do nothing, because the click went to the window behind it (found after taking a screenshot and opening the screenshots folder, but it could happen at any time: about 1 hover in 6). The bubble window is no longer click-through at all. The panel keeps click-through for its empty areas, ignores the stale "mouse left" message that caused the problem, and resets click-through from the real pointer position each time it opens. |
| **Bubble borders**                           | A 2px white border is always around the bubble. While the panel is open, a 2px purple border (`#9333ea`, `--color-bubble-active` in `styles.css`) sits outside the white one.                                                                                                                                                                                                                                                                                       |

Checked with real mouse input (hovering 6/6, the screenshot → folder → bubble sequence), plus the
unit tests, the drag test and screen captures of the borders.

## 8. Milestones

| #          | Milestone            | Done when                                                                                                                                            |
| ---------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0** ✅   | **Foundation**       | Everything in §7 works in `npm run dev` and in the unsigned installer. Unit tests and lint pass.                                                     |
| **1** ✅   | **Chat with Claude** | See §7b.                                                                                                                                             |
| **2.1** ✅ | **Bubble fixes**     | See §7c.                                                                                                                                             |
| 2          | JumpCloud sign-in    | PKCE login, encrypted refresh token, silent refresh, signed-out state, Log out in Settings                                                           |
| 3          | Backend              | Gateway (A) or direct WIF (B) wired to the JumpCloud identity, replacing personal API keys                                                           |
| 4          | Ship                 | Code signing, MSI, auto-update, CI (GitHub Actions), pilot deployment through JumpCloud                                                              |
| later      |                      | Claude-requested screenshots (as a tool), hiding during full-screen apps, saved history, company integrations, tenant config from the gateway, macOS |

## 9. What we need from admins (blocks M2–M4 only)

- **JumpCloud admin:** a Custom OIDC app. Client authentication **Public (None PKCE)**; grant types
  Authorization Code + Refresh Token; a loopback or custom-scheme redirect URI; scopes
  `openid email profile offline_access` plus a groups claim; assigned to a user group. For the
  gateway option, access token format **JWT**.
- **Claude / Anthropic Console admin:** a workspace for Desktop Assist, plus a service account and
  federation rule (for the gateway's cloud identity, or for the JumpCloud issuer under option B).
- **Code-signing certificate** (e.g. Azure Trusted Signing). Unsigned installers trigger SmartScreen.

## 10. Decisions

**Made**

- Attach latest → thumbnail chip
- Screenshots → `Pictures\Desktop Assist`, kept forever
- Capture → the screen the bubble is on
- Settings (M0) → Start with Windows, Open screenshots folder, Clear text box
- Bounce → glides back to the corner when stopped
- Close → quits immediately
- M1 credentials → the user's own API key, tested at every start and asked for in the chat box
  when missing or rejected
- Default response style → Fast (`low` effort)
- Chat history → current session only (for now)

**Open (needed before M3)**

1. Gateway (A) vs direct (B). Can Morse host a small container service, and where?
2. Does Morse have a Claude Console org/workspace for shared API usage?
3. Should chat history be saved across restarts later?

## 11. Notes

- Keep the repo **outside OneDrive**. `node_modules` plus OneDrive sync locks break Electron builds.
- The bubble logo is `tenants/morse-micro/logo.png`: the Morse Micro "Mμ" mark cut to a circle.
  Replacing the file is all it takes to change it. The tray icon is still a plain accent-coloured
  circle, and the installer still uses the default Electron icon (both to be branded in M4).
