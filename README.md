# Desktop Wizard

A Windows desktop assistant: a small character that stands on the taskbar near the bottom-right
corner of the screen and opens a panel when clicked. Built for Morse Micro first. Branding lives in
[`tenants/`](tenants/README.md), so another business can use it later.

- [docs/PLAN.md](docs/PLAN.md): the plan, architecture, milestones and decisions.
- [docs/code-guide/CODE_GUIDE.md](docs/code-guide/CODE_GUIDE.md): how the code fits together, with the code of every
  function shown and explained.
- [docs/CLAUDE_DESKTOP_SETUP.md](docs/CLAUDE_DESKTOP_SETUP.md): for IT, what each PC needs so
  questions open in Claude Desktop.
- [docs/APPS_SETUP.md](docs/APPS_SETUP.md): for IT, turning on the Apps list (JumpCloud's MCP
  Server for users).
- [docs/ATLASSIAN_SETUP.md](docs/ATLASSIAN_SETUP.md): for IT, Jira (notifications, search,
  issues) and the service desk page (new requests, My requests).
- [docs/RELEASING.md](docs/RELEASING.md): publishing a new version (built, signed with the release
  key and attached to a GitHub release), which copies then update to from Settings; keeping
  releases safe.
- [docs/JUMPCLOUD_SETUP.md](docs/JUMPCLOUD_SETUP.md): for IT, setting up JumpCloud sign-in and
  Claude access for the built-in chat (not used by Morse Micro since 3.1).

**Status:** Milestones 0 (Foundation), 1 (Chat with Claude), 2.1 (bubble fixes), 3 (JumpCloud
sign-in) and 4 (logos, favourites, service desk, light/dark mode, bubble-click fix), and features
3.1 (questions open in Claude Desktop) and 3.2 (Apps list, Uninstall) are complete, as are
Milestone 5 (the app-opening spinner; Jira and the service desk) and its fixes 5.1 and 5.2 (the
bubble kept in front, and Check for updates). Version **1.0.0** was the first release (see
[PLAN.md](docs/PLAN.md) §7h and [RELEASING.md](docs/RELEASING.md)); this is version **2.2.0**, with
the animated character, her spells, the screen saver, and Stand still and No idle animations in
Settings (PLAN.md §7i).

**Formerly Desktop Assist.** The app was called Desktop Assist up to version 1.0.0. Updating from
then (from Settings, or with the new installer) installs over it and keeps everything: on its first
start the new version moves the settings, the text box and the sign-ins across to its new data
folder, and keeps "Start with Windows" on if it was. Screenshots taken before stay in
`Pictures\Desktop Assist`. A few names keep the old name on purpose, because copies of 1.0.0
depend on them: the app ID (`com.morsemicro.desktopassist`), by which Windows knows the install,
so a new version replaces the old one rather than going beside it; the install folder
(`desktop-assist`); and the text an update's signature signs (`desktop-assist-update …`), which
1.0.0 checks updates against. The release key's place (`~/.desktop-assist`), the
`DESKTOP_ASSIST_*` environment variables and the npm package names (`@desktop-assist/…`) keep it
too, since nobody using the app sees them. The GitHub repository has been renamed
`Camby10101/Desktop-Wizard`, and releases are published there; copies that still look for the old
name are sent on to it.

## Features

- **The character** (the "bubble"): a small figure standing on the taskbar, always on top, hidden
  from the taskbar and Alt+Tab. She stands breathing and blinking, and strolls left and right near
  her corner now and then. Click her to open or close the panel (she stops where she is); Esc or
  clicking elsewhere also closes it. She's anime-style pixel art, an original design drawn in code:
  an elf mage with long pointed ears, long silver-white hair, amber eyes, a wide-brimmed
  hat with a gold moon and stars, a long robe in the company's accent colour with silver trim and
  gold embroidery, and laced boots, seen from the front, diagonally or side on. Once she's been
  left alone a while she does things of her own now and then: hops, waves, stretches and yawns,
  sips her tea, has a vision (a light shines down from the top of the screen and the company's
  logo comes down it to hover over her head while she gazes up at it), curtsies, gazes into a
  crystal ball, reads her spellbook, casts a little spell of sparkles, levitates over a glowing
  magic circle, sits on the taskbar, twirls, has a little magic butterfly land on her finger, dozes
  off and wakes with a start, glances about, juggles three glowing orbs, blows magic bubbles
  through a wand ring, watches a will-o'-wisp go round her and waves it goodbye, sneezes a burst of
  sparkles, or dances a little jig. When the app starts she forms out of white motes, and when it's
  closed (Close, or Quit in the tray) she dissolves into them before it quits. If her wandering or
  her habits are a distraction, **Stand still** and **No idle animations** in Settings turn them
  off.
- **Drag it anywhere**, even onto another monitor: it dangles from the pointer. Let go and it drops
  onto that screen's taskbar, and from then on lives near the nearer bottom corner, walking back
  if it was dropped far away (and shrinking if she's too big for that screen). The panel opens
  toward the middle of the screen. It remembers the corner next time. **Throw her**: let go while
  the pointer's moving and she flies on, tumbling, bouncing off the sides and top of the screen
  (you can catch her in mid-air). Land her hard, from a throw or dropped from high up, and she
  thumps down on her bottom with her hat over her eyes and stars going round her head, then gets
  back up.
- **Ask Claude**: type a question in the box beside the bubble (a speech bubble pointing at her
  mouth) and press Enter (or **Ask in Claude**). The Claude Desktop app opens a new chat and the question is sent there, with any
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
  Click one to open it in your browser, signed in through JumpCloud (a spinner shows on it while
  it opens). Star an app (the star on its
  logo) to keep it at the top. The first time, **Sign in with JumpCloud** connects Desktop Wizard
  to your portal in your browser.
- **Action icons** above the bubble:
  - **Ask Claude** swaps the apps for the text box (above); click it again or press Esc to go
    back. A dot on it means an unsent question is waiting.
  - **Jira** (a bell): **Notifications** shows when someone else assigned you an issue or
    mentioned you lately (a dot on the bell means something new; a notification stays new until
    you open it, and the rest count as seen when you leave the page), and **Search** finds Jira
    issues and Confluence pages. Click an issue to see it, ask Claude to summarise it, draft a reply or
    suggest next steps, move it to another status, comment, or log time. The first time,
    **Connect to Atlassian** connects Desktop Wizard to your Atlassian account in your browser.
  - **IT service desk**: **New request** fills in a request from what's in the text box (pick the
    kind of request, attach a screenshot, include your PC's details; helpful IT articles show
    while you type) and opens it on the service desk portal for you to send. **My requests** shows
    your IT requests and tells you (with a Windows notification) when IT replies or changes one.
  - **Screenshot** saves the screen the bubble is on to `Pictures\Desktop Wizard`.
  - **Settings**: **Light mode** (switches Desktop Wizard's colours; it starts dark), **Size**
    (makes the character smaller or bigger, from half her usual size to six times it, or as big as
    fits your screen; it's remembered), **Robe colour** (her robe and hat, the hat a darker shade
    of it, in the company's colour, one of the swatches, or any hue from the slider; her trim and
    patterns stay as they are), **Stand still** (she stays where she is instead of
    wandering about), **No idle animations** (she stops doing her habits on her own; both are off
    to start with), Start with Windows, Send in Claude automatically, Open screenshots folder,
    Clear text box, **Check for updates** (downloads a newer release from GitHub, checks it's
    signed with the release key, and installs it; Desktop Wizard closes and starts again on the
    new version) and **Uninstall Desktop Wizard**. (With the
    built-in chat: Response style (Fast / Balanced / Thorough), New conversation, and who you're
    signed in as with **Log out**.)
  - **Spells** (a wand) opens a menu of her ten spells; the panel closes and she casts the one you
    pick. They're only pictures: clicks go straight through them, and clicking her stops a spell.
    - **Clones**: ten of her walk about the taskbar for thirty seconds, now and then waving.
    - **Teleport**: she vanishes into white motes and pops up elsewhere along the taskbar.
    - **Butterflies**: a swarm of little magic butterflies bursts out of her and flutters away.
    - **Starfall**: shooting stars streak across the screen for ten seconds.
    - **Fireworks**: rockets burst high over the screen, ending in a finale.
    - **Blizzard**: snow blows across the screen, frost creeps in and a drift piles up.
    - **Thunderstorm**: clouds roll in, rain pours and lightning strikes, once right beside her.
    - **Phoenix**: a bird of fire flies out of her, loops the loop and flies away.
    - **Vortex**: a portal swirls open mid-screen, pulls everything in and implodes.
    - **Explosion**: she chants for fifteen seconds under a rising pillar of magic circles, then it
      goes off in the middle of the screen.
  - **Screen saver** (a sunset): every screen fades to white as she vanishes, then a pixel-art
    scene fades in. On her screen, the sun sets over rolling hills, with clouds drifting, birds
    gliding by and fireflies over the grass, and she stands on the nearest hill, her back to you,
    watching it; on any other screens, shooting stars fall through the night sky. Move the mouse,
    click or press a key and it fades away, and she forms again on the taskbar.
  - **Close**: she dissolves into white motes, and the app quits.
- **Attach screenshot** adds the newest screenshot to your next question; click it again to add
  the one before, and so on (it says when there are no more). **Report to IT** turns
  what you've typed (and the screenshot) into a new IT request.
- **Issue keys**: type a Jira key like `ISD-1234` and an **Open ISD-1234** button appears.
- A tray icon (the same logo) with Open and Quit.

## Getting started

**Run it from the code** (for development):

1. Install [Node.js](https://nodejs.org) 24.
2. Open a terminal in the `Desktop-Assist` folder and run `npm install` (first time only).
3. Run `npm run dev`. The character appears on the taskbar in the bottom-right corner of your
   screen.
4. Click the character, type a question and press Enter: Claude Desktop opens and sends it. (Claude
   Desktop must be installed and signed in; with the built-in chat, click **Sign in with
   JumpCloud** first.)
5. To stop it, use the power icon above the character, Quit from the tray icon, or Ctrl+C in the
   terminal.

**Install it like a normal app:**

1. Run `npm run dist`. This builds `apps/desktop/dist/Desktop Wizard-Setup-2.2.0.exe` (named
   after the version in `apps/desktop/package.json`; up to 1.0.0 it was
   `Desktop Assist-Setup-<version>.exe`). Its last step signs the installer for Check for updates;
   on a PC without the release key it stops there with a message, and the installer is still built
   (see [RELEASING.md](docs/RELEASING.md)).
2. Run that installer. It installs for your user only and starts the app straight away.
3. The installed app starts with Windows (turn this off in Settings). Find it again in the
   Start menu as **Desktop Wizard**.

Windows may warn about an unrecognised app because the installer isn't code-signed yet
(**More info → Run anyway**). Code signing is a candidate for Milestone 6.

## Development

Requires Node 22.12 or later (Node 24 recommended). Keep the repo **outside OneDrive**:
OneDrive's sync locks break Electron builds.

```powershell
npm install
npm run dev         # run with hot reload
npm test            # unit tests (Vitest)
npm run lint
npm run typecheck
npm run dist        # installer (and its .sig for updates) → apps/desktop/dist/
npm run docs        # refresh the code shown in docs/code-guide after changing code
npm run docs:pdf    # rebuild docs/CODE_GUIDE.pdf from those pages
```

The first `npm run dev` downloads the Electron binary. Dev runs keep their data (including the
sign-in) in `%APPDATA%\Desktop Wizard (Dev)`, separate from an installed copy (an old
`Desktop Assist (Dev)` folder is renamed to it on the first run). "Start with Windows" only works
in the installed app.

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
mark, cut to a circle) and restart. It's the tray icon and the installed app's icon (the bubble on
screen is the character). See [tenants/README.md](tenants/README.md) for tips.

## Layout

```
apps/desktop/
  src/main/       Electron main process: windows, bubble state machine, handing questions to
                  Claude Desktop (claudeDesktop.ts, sendInClaude.ts), the Apps list (apps/),
                  the built-in chat (claude/) and its JumpCloud sign-in (auth/), draft,
                  screenshots, uninstall, IPC
  src/preload/    the typed `window.assist` bridge
  src/renderer/   React views: the bubble, her clones, vision and spells' effects, the screen
                  saver, and the panel (actions, settings, spells, chat, sign-in)
  src/shared/     code both sides use: IPC contract, action registry, spells, layout constants,
                  types
  tests/          unit tests
tenants/          per-business branding, enabled actions, where chats happen, sign-in settings
```

All runtime libraries are bundled by electron-vite, so they live in `devDependencies` and the
installer ships no `node_modules`.
