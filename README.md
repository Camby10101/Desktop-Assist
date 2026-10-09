# Desktop Assist

A Windows desktop assistant: a small logo bubble that sits in the bottom-right corner of the
screen and opens a panel when clicked. Built for Morse Micro first. Branding lives in
[`tenants/`](tenants/README.md), so another business can use it later.

- [docs/PLAN.md](docs/PLAN.md): the plan, architecture, milestones and decisions.
- [docs/code-guide/CODE_GUIDE.md](docs/code-guide/CODE_GUIDE.md): how the code fits together, with the code of every
  function shown and explained.
- [docs/CLAUDE_DESKTOP_SETUP.md](docs/CLAUDE_DESKTOP_SETUP.md): for IT, what each PC needs so
  questions open in Claude Desktop.
- [docs/APPS_SETUP.md](docs/APPS_SETUP.md): for IT, turning on the Apps list (JumpCloud's MCP
  Server for users).
- [docs/JUMPCLOUD_SETUP.md](docs/JUMPCLOUD_SETUP.md): for IT, setting up JumpCloud sign-in and
  Claude access for the built-in chat (not used by Morse Micro since 3.1).

**Status:** Milestones 0 (Foundation), 1 (Chat with Claude), 2.1 (bubble fixes) and 3 (JumpCloud
sign-in), feature 3.1 (questions open in Claude Desktop) and feature 3.2 (Apps list, Uninstall)
are complete. Next is Milestone 4: Ship.

## Features

- **Bubble**: always on top, hidden from the taskbar and Alt+Tab. Click it to open or close the
  panel; Esc or clicking elsewhere also closes it.
- **Drag it anywhere**, even onto another monitor. Let go and it snaps to the nearest corner of
  that screen, and the panel flips to open toward the middle. It remembers the spot next time.
- **Ask Claude**: type a question in the box beside the bubble and press Enter (or **Ask in
  Claude**). The Claude Desktop app opens a new chat and the question is sent there, with any
  attached screenshots pasted in, and Claude answers. It's your own Claude account, so it counts
  against your own usage limit. (Turn off **Send in Claude automatically** in Settings to only
  fill the question in and send it yourself.) Shift+Enter adds a line; an unsent question is
  saved automatically. If Claude Desktop isn't installed, the panel says so, with a Download
  button.
- **Or the built-in chat** (a tenant setting, `"chatApp": "built-in"`; Morse Micro used it until
  3.1): chat with Claude (Claude Opus 5.5) in the card beside the bubble, after signing in once
  with JumpCloud. Replies stream in with formatting and highlighted code, with Stop, Retry and
  Copy. Usage is billed to the company's Claude Console account, through a service account IT
  sets up; there's no API key.
- **Your apps**: the panel opens on the apps in your JumpCloud User Portal, with their logos.
  Click one to open it in your browser, signed in through JumpCloud. The first time, **Sign in
  with JumpCloud** connects Desktop Assist to your portal in your browser.
- **Action icons** above the bubble:
  - **Ask Claude** swaps the apps for the text box (above); click it again or press Esc to go
    back. A dot on it means an unsent question is waiting.
  - **Screenshot** saves the screen the bubble is on to `Pictures\Desktop Assist`.
  - **Settings**: Start with Windows, Send in Claude automatically, Open screenshots folder,
    Clear text box and **Uninstall Desktop Assist**. (With the
    built-in chat: Response style (Fast / Balanced / Thorough), New conversation, and who you're
    signed in as with **Log out**.)
  - **Bounce** sends the bubble bouncing around the screen; click it to send it gliding home.
  - **Close** quits the app.
- **Attach latest screenshot** adds the newest screenshot to your next question.
- A tray icon (the same logo) with Open and Quit.

## Getting started

**Run it from the code** (for development):

1. Install [Node.js](https://nodejs.org) 24.
2. Open a terminal in the `Desktop-Assist` folder and run `npm install` (first time only).
3. Run `npm run dev`. The bubble appears in the bottom-right corner of your screen.
4. Click the bubble, type a question and press Enter: Claude Desktop opens and sends it. (Claude
   Desktop must be installed and signed in; with the built-in chat, click **Sign in with
   JumpCloud** first.)
5. To stop it, use the power icon above the bubble, Quit from the tray icon, or Ctrl+C in the
   terminal.

**Install it like a normal app:**

1. Run `npm run dist`. This builds `apps/desktop/dist/Desktop Assist-Setup-0.1.0.exe`.
2. Run that installer. It installs for your user only and starts the app straight away.
3. The installed app starts with Windows (turn this off in Settings). Find it again in the
   Start menu as **Desktop Assist**.

Windows may warn about an unrecognised app because the installer isn't code-signed yet
(**More info → Run anyway**). Signing is planned for Milestone 4.

## Development

Requires Node 22.12 or later (Node 24 recommended). Keep the repo **outside OneDrive**:
OneDrive's sync locks break Electron builds.

```powershell
npm install
npm run dev         # run with hot reload
npm test            # unit tests (Vitest)
npm run lint
npm run typecheck
npm run dist        # unsigned installer → apps/desktop/dist/
npm run docs        # refresh the code shown in docs/code-guide after changing code
npm run docs:pdf    # rebuild docs/CODE_GUIDE.pdf from those pages
```

The first `npm run dev` downloads the Electron binary. Dev runs keep their data (including the
sign-in) in `%APPDATA%\Desktop Assist (Dev)`, separate from an installed copy. "Start with
Windows" only works in the installed app.

For testing without real accounts, dev runs (never installed builds) read three environment
variables:

- `ANTHROPIC_BASE_URL`: point the app at a local mock of the Claude API.
- `DESKTOP_ASSIST_DEV_CONFIG`: a JSON file whose `chatApp`, `portal`, `signIn` and `claudeAccess`
  settings replace tenant.json's, for example to try the built-in chat against a local test sign-in
  server.
- `DESKTOP_ASSIST_DEV_USER_DATA`: a separate data folder, so tests never touch your own dev
  sign-in or notes.

To build for a different tenant: `$env:TENANT = '<folder name>'; npm run dev`.

**Changing the logo:** replace `tenants/morse-micro/logo.png` (currently the Morse Micro "Mμ"
mark, cut to a circle) and restart. The same image is also the tray icon and the installed app's
icon. See [tenants/README.md](tenants/README.md) for tips.

## Layout

```
apps/desktop/
  src/main/       Electron main process: windows, bubble state machine, handing questions to
                  Claude Desktop (claudeDesktop.ts, sendInClaude.ts), the Apps list (apps/),
                  the built-in chat (claude/) and its JumpCloud sign-in (auth/), draft,
                  screenshots, uninstall, IPC
  src/preload/    the typed `window.assist` bridge
  src/renderer/   React views: the bubble, and the panel (actions, settings, chat, sign-in)
  src/shared/     code both sides use: IPC contract, action registry, layout constants, types
  tests/          unit tests
tenants/          per-business branding, enabled actions, where chats happen, sign-in settings
```

All runtime libraries are bundled by electron-vite, so they live in `devDependencies` and the
installer ships no `node_modules`.
