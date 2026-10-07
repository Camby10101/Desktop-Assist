# Desktop Assist

A Windows desktop assistant: a small logo bubble that sits in the bottom-right corner of the
screen and opens a panel when clicked. Built for Morse Micro first. Branding lives in
[`tenants/`](tenants/README.md), so another business can use it later.

- [docs/PLAN.md](docs/PLAN.md): the plan, architecture, milestones and decisions.
- [docs/CODE_GUIDE.md](docs/CODE_GUIDE.md): what every file and function does.

**Status:** Milestones 0 (Foundation) and 1 (Chat with Claude) are complete. Next is
Milestone 2: JumpCloud sign-in.

## Features

- **Bubble**: always on top, hidden from the taskbar and Alt+Tab. Click it to open or close the
  panel; Esc or clicking elsewhere also closes it.
- **Chat with Claude** (Claude Opus 5.5) in the card to the left of the bubble, which grows
  upward. Replies stream in with formatting and highlighted code; Stop, Retry and Copy are
  built in. Enter sends, Shift+Enter adds a line. An unsent message is saved automatically.
- **Your Claude API key**: on first run, or if the saved key stops working, the chat box asks
  for one. Every start re-tests the saved key. Keys are checked with Anthropic before being
  saved, and stored encrypted for your Windows account only. (JumpCloud sign-in replaces this
  in a later milestone.)
- **Action icons** above the bubble:
  - **Screenshot** saves the screen the bubble is on to `Pictures\Desktop Assist`.
  - **Settings**: Start with Windows, Response style (Fast / Balanced / Thorough), Change API
    key, Open screenshots folder, New conversation.
  - **Bounce** sends the bubble bouncing around the screen; click it to send it gliding home.
  - **Close** quits the app.
- **Attach latest screenshot** adds the newest screenshot to your next message.
- A tray icon with Open and Quit.

To get an API key, sign in to the [Claude Console](https://platform.claude.com/settings/keys)
and create one. Usage is billed to that Console account.

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
```

The first `npm run dev` downloads the Electron binary. Dev runs keep their data (including the
API key) in `%APPDATA%\Desktop Assist (Dev)`, separate from an installed copy. "Start with
Windows" only works in the installed app.

For testing without a real key, dev runs honour `ANTHROPIC_BASE_URL`, so the app can be pointed
at a local mock of the Claude API. Installed builds ignore it and always use Anthropic.

To build for a different tenant: `$env:TENANT = '<folder name>'; npm run dev`.

**Changing the logo:** save the image as `tenants/morse-micro/logo.png` (it takes priority over
the placeholder `logo.svg`) and restart. See [tenants/README.md](tenants/README.md) for tips.

## Layout

```
apps/desktop/
  src/main/       Electron main process: windows, bubble state machine, Claude chat and API key
                  (claude/), draft, screenshots, IPC
  src/preload/    the typed `window.assist` bridge
  src/renderer/   React views: the bubble, and the panel (actions, settings, chat, key form)
  src/shared/     code both sides use: IPC contract, action registry, layout constants, types
  tests/          unit tests
tenants/          per-business branding and enabled actions
```

All runtime libraries are bundled by electron-vite, so they live in `devDependencies` and the
installer ships no `node_modules`.
