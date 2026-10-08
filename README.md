# Desktop Assist

A Windows desktop assistant: a small logo bubble that sits in the bottom-right corner of the
screen and opens a panel when clicked. Built for Morse Micro first. Branding lives in
[`tenants/`](tenants/README.md), so another business can use it later.

- [docs/PLAN.md](docs/PLAN.md): the plan, architecture, milestones and decisions.
- [docs/CODE_GUIDE.md](docs/CODE_GUIDE.md): how the code fits together, with the code of every
  function shown and explained.
- [docs/JUMPCLOUD_SETUP.md](docs/JUMPCLOUD_SETUP.md): for IT, setting up JumpCloud sign-in and
  Claude access.

**Status:** Milestones 0 (Foundation), 1 (Chat with Claude), 2.1 (bubble fixes) and 3 (JumpCloud
sign-in) are complete. Sign-in needs a one-off setup by IT before it works for real (see
[JUMPCLOUD_SETUP.md](docs/JUMPCLOUD_SETUP.md)). Next is Milestone 4: Ship.

## Features

- **Bubble**: always on top, hidden from the taskbar and Alt+Tab. Click it to open or close the
  panel; Esc or clicking elsewhere also closes it.
- **Drag it anywhere**, even onto another monitor. Let go and it snaps to the nearest corner of
  that screen, and the panel flips to open toward the middle. It remembers the spot next time.
- **Chat with Claude** (Claude Opus 5.5) in the card beside the bubble, which grows
  as the conversation does. Replies stream in with formatting and highlighted code; Stop, Retry and Copy are
  built in. Enter sends, Shift+Enter adds a line. An unsent message is saved automatically.
- **Sign in with JumpCloud**, once: the button opens JumpCloud in your browser, and if you're
  already signed in there it finishes by itself. You stay signed in across restarts (the sign-in
  is stored encrypted for your Windows account only) until JumpCloud ends it. There's no API key:
  your JumpCloud sign-in is swapped for short-lived Claude access each time it's needed.
- **Action icons** above the bubble:
  - **Screenshot** saves the screen the bubble is on to `Pictures\Desktop Assist`.
  - **Settings**: Start with Windows, Response style (Fast / Balanced / Thorough), Open
    screenshots folder, New conversation, and who you're signed in as with **Log out**.
  - **Bounce** sends the bubble bouncing around the screen; click it to send it gliding home.
  - **Close** quits the app.
- **Attach latest screenshot** adds the newest screenshot to your next message.
- A tray icon (the same logo) with Open and Quit.

Claude usage is billed to the company's Claude Console account, through the service account IT
sets up.

## Getting started

**Run it from the code** (for development):

1. Install [Node.js](https://nodejs.org) 24.
2. Open a terminal in the `Desktop-Assist` folder and run `npm install` (first time only).
3. Run `npm run dev`. The bubble appears in the bottom-right corner of your screen.
4. Click the bubble, then **Sign in with JumpCloud**, and start chatting. (Until IT has filled
   in `tenants/morse-micro/tenant.json`, the chat box says sign-in isn't set up yet and lists
   what's missing.)
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
```

The first `npm run dev` downloads the Electron binary. Dev runs keep their data (including the
sign-in) in `%APPDATA%\Desktop Assist (Dev)`, separate from an installed copy. "Start with
Windows" only works in the installed app.

For testing without real accounts, dev runs (never installed builds) read three environment
variables:

- `ANTHROPIC_BASE_URL`: point the app at a local mock of the Claude API.
- `DESKTOP_ASSIST_DEV_CONFIG`: a JSON file whose `signIn` and `claudeAccess` settings replace
  tenant.json's, for example to use a local test sign-in server.
- `DESKTOP_ASSIST_DEV_USER_DATA`: a separate data folder, so tests never touch your own dev
  sign-in or notes.

To build for a different tenant: `$env:TENANT = '<folder name>'; npm run dev`.

**Changing the logo:** replace `tenants/morse-micro/logo.png` (currently the Morse Micro "Mμ"
mark, cut to a circle) and restart. The same image is also the tray icon and the installed app's
icon. See [tenants/README.md](tenants/README.md) for tips.

## Layout

```
apps/desktop/
  src/main/       Electron main process: windows, bubble state machine, JumpCloud sign-in
                  (auth/), Claude chat (claude/), draft, screenshots, IPC
  src/preload/    the typed `window.assist` bridge
  src/renderer/   React views: the bubble, and the panel (actions, settings, chat, sign-in)
  src/shared/     code both sides use: IPC contract, action registry, layout constants, types
  tests/          unit tests
tenants/          per-business branding, enabled actions and sign-in settings
```

All runtime libraries are bundled by electron-vite, so they live in `devDependencies` and the
installer ships no `node_modules`.
