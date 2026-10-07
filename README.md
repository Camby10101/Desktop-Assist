# Desktop Assist

A Windows desktop assistant: a small logo bubble that sits in the bottom-right corner of the
screen and opens a panel when clicked. Built for Morse Micro first. Branding lives in
[`tenants/`](tenants/README.md), so another business can use it later.

- [docs/PLAN.md](docs/PLAN.md): the plan, architecture, milestones and decisions.
- [docs/CODE_GUIDE.md](docs/CODE_GUIDE.md): what every file and function does.

**Status:** Milestone 0 (Foundation) is complete. Next is Milestone 1: chatting with Claude in
the text box.

## Milestone 0 features

- **Bubble**: always on top, hidden from the taskbar and Alt+Tab. Click it to open or close the
  panel; Esc or clicking elsewhere also closes it.
- **Text box**: opens to the left of the bubble and grows upward. Saves automatically to
  `%APPDATA%\Desktop Assist\notes.json`.
- **Action icons** above the bubble:
  - **Screenshot** saves the screen the bubble is on to `Pictures\Desktop Assist`.
  - **Settings** has Start with Windows, Open screenshots folder and Clear text box.
  - **Bounce** sends the bubble bouncing around the screen; click it to send it gliding home.
  - **Close** quits the app.
- **Attach latest screenshot** (in the text box) adds the newest screenshot as a thumbnail chip.
- A tray icon with Open and Quit.

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

The first `npm run dev` downloads the Electron binary. Dev runs keep their data in
`%APPDATA%\Desktop Assist (Dev)`, separate from an installed copy. "Start with Windows" only
works in the installed app.

To build for a different tenant: `$env:TENANT = '<folder name>'; npm run dev`.

**Changing the logo:** save the image as `tenants/morse-micro/logo.png` (it takes priority over
the placeholder `logo.svg`) and restart. See [tenants/README.md](tenants/README.md) for tips.

## Layout

```
apps/desktop/
  src/main/       Electron main process: windows, bubble state machine, notes, screenshots, IPC
  src/preload/    the typed `window.assist` bridge
  src/renderer/   React views: the bubble, and the panel (actions, settings, text box)
  src/shared/     code both sides use: IPC contract, action registry, layout constants, types
  tests/          unit tests
tenants/          per-business branding and enabled actions
```

All runtime libraries are bundled by electron-vite, so they live in `devDependencies` and the
installer ships no `node_modules`.
