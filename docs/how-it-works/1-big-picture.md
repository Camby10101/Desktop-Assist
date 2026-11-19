# How to use this guide

The guide is in eight parts. Read **Part 1** first for the big picture. **Part 2** explains ideas the
code relies on; skip any you already know. **Part 3** is the tour: every area of `apps/desktop/src`,
from the bottom layer up, with its main classes and functions. **Part 4** follows real moments
through the code, which is where it all clicks together. **Parts 5–8** cover security, the tests,
building and releasing, and how to make changes yourself.

Names in `this style` are things you'll find in the code: files, functions, settings. Each module
section starts with the file, its job, and what uses it. The snippets are the real code, sometimes
shortened (`…` marks a gap). The Code Guide (`docs/CODE_GUIDE.pdf`) shows every function in full.
Coloured boxes mark asides:

> **Why it's built this way**
> explains a design choice, so you know the reasoning as well as the code.

> **Try it yourself**
> a small experiment to run yourself. Changing things and watching what happens is the fastest way
> to learn a codebase.

> **Good to know**
> a detail that's easy to trip over.

> **Security**
> how a piece of code keeps the app or its users safe.

# Part 1 — The big picture

Before looking at any single file, it helps to know what the app does, which tools it is built
from, and how a click on the character turns into an open panel. This part gives you that map.

## 1. What the app does

Desktop Wizard (called Desktop Assist up to version 1.0.0) is a desktop assistant for Windows. It
appears as a small pixel-art elf mage, an original character, standing on the taskbar in a corner
of the screen. Click her and a panel of icons opens beside her. For Morse Micro it offers:

- **Ask Claude**: a text box, shaped like a speech bubble, whose question is handed to the Claude
  Desktop app with any screenshots attached, and sent there in the user's own Claude account;
- **Your apps**: the apps in the user's JumpCloud portal, one click to open each (the page the
  panel opens on);
- **Jira**: who assigned the user an issue or mentioned them lately, and a search of Jira and
  Confluence, with a dot on the bell for anything new;
- **IT service desk**: raising an IT request (finished on the help-centre portal) and following the
  user's own requests;
- **Take screenshot**, **Settings** (light or dark, her size from ½× to 6×, her robe's colour,
  Stand still, No idle animations, Start with Windows, Check for updates, Uninstall), **Spells**
  (eleven, from ten clones of herself to summoning her familiar), **Screen saver** and **Close**.

Left alone, she has a life of her own:

- she strolls near her corner and does **habits**: 37 of them, ten magic, five where she summons a
  toy and plays with it (a yo-yo, a spinning top, cards, a paper plane, a bouncy ball), two only at certain times
  (yawning late at night, confetti on Friday evenings);
- now and then she **performs**: peeks round a window, waves through a portal on top of one, gets a visit from her black
  cat, and, rarely, plays **tricks with the taskbar's icons** (all pretend: nothing really moves);
- she **reacts**: to the pointer zipping past or being wiggled near her, to a double-click (hearts),
  to a new Jira notification (a scroll), and to nobody being at the PC for five minutes (she sits
  down and snoozes);
- she can be **dragged** anywhere, even to another monitor, and **thrown**; land her hard and she
  goes splat, then gets up.

Finally, it **updates itself** from signed releases on GitHub, and everything company-specific (name,
logo, colour, which icons appear, the Jira site) comes from one file per company, a **tenant**.

## 2. The building blocks

The app is written in TypeScript. Rather than writing everything from scratch, it leans on a handful
of well-known tools, each doing one job:

| Tool                         | What it is                                                                                   | Where you'll see it                         |
| ---------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Electron 44                  | A Chromium browser and Node.js in one program: the way to build a desktop app from web code. | everything                                  |
| TypeScript 6                 | JavaScript with types, checked before the code runs.                                         | all of `src/`                               |
| React 19                     | Builds the pages out of components that redraw when their data changes.                      | `src/renderer/`                             |
| Tailwind CSS 4               | Styling written as small class names (`flex`, `rounded-xl`) right in the markup.             | the components, `styles.css`                |
| electron-vite (Vite 7)       | Compiles the three parts of the app (main, preload, pages) and serves them while developing. | `electron.vite.config.ts`                   |
| zod 4                        | Checks that data has the shape it should: every IPC argument, `tenant.json`, saved files.    | `ipc.ts`, `tenant.ts`, `settings.ts`        |
| MCP SDK                      | Talks to JumpCloud's and Atlassian's MCP servers, which the Apps list and Jira come from.    | `src/main/mcp/`                             |
| openid-client, Anthropic SDK | Sign-in with JumpCloud and calls to Claude, for tenants with the built-in chat.              | `src/main/auth/`, `src/main/claude/`        |
| react-markdown, highlight.js | Shows Claude's replies (built-in chat) and builds the Code Guide PDF.                        | `Markdown.tsx`, `scripts/`                  |
| lucide-react                 | The icons above her.                                                                         | `ActionStack.tsx`                           |
| PowerShell + UI Automation   | Windows' accessibility interface: reads the taskbar and windows, types into Claude Desktop.  | `shell/probe.ts`, `sendInClaude.ts`         |
| Node's `crypto`              | SHA-256 hashes and Ed25519 signatures, so only real releases install as updates.             | `updates.ts`, `scripts/release-signing.mjs` |
| Vitest 5                     | Runs the automated tests.                                                                    | `tests/`                                    |
| electron-builder             | Packs the app into a one-click Windows installer (NSIS).                                     | `electron-builder.cjs`                      |

## 3. A map of the project

```
Desktop-Assist/
├── apps/desktop/                  the app
│   ├── src/main/                  main process (Node): windows, files, network, Windows itself
│   │   ├── index.ts               start-up: makes every part and wires them together
│   │   ├── ipc.ts                 every request from the pages, checked
│   │   ├── actions.ts             the icons' commands (screenshot, screen saver, close …)
│   │   ├── bubble/                the character: BubbleController, wander, layout, windows …
│   │   ├── performances/          her longer acts: watching, tricks, peeking, portals, the cat
│   │   ├── shell/probe.ts         reads the taskbar and windows (UI Automation, read-only)
│   │   ├── familiar.ts            the cat's window
│   │   ├── screenSaver.ts         the screen saver's windows
│   │   ├── claudeDesktop.ts       questions handed to Claude Desktop (+ sendInClaude.ts)
│   │   ├── claude/, auth/         the built-in chat and its JumpCloud sign-in (other tenants)
│   │   ├── mcp/, apps/            the Apps list (JumpCloud's MCP server)
│   │   ├── atlassian/             Jira (Atlassian's MCP server), serviceDesk.ts beside it
│   │   ├── settings.ts            preferences.json
│   │   ├── notes/, screenshots/   the unsent question, screenshots
│   │   ├── storage/               safe file writes, the encrypted secret store
│   │   ├── updates.ts             Check for updates
│   │   └── tenant.ts, tray.ts …   the tenant file, the tray icon, uninstall, the log
│   ├── src/preload/index.ts       the bridge: window.assist
│   ├── src/renderer/src/          the pages (React)
│   │   ├── views/                 one page per kind of window
│   │   ├── components/            the panel's pieces
│   │   ├── character/             her pixel art (rig.ts, sprite.ts) and the cat (cat.ts)
│   │   ├── lib/                   drawing and motion: spells, screen saver, clones, the cat
│   │   └── hooks/                 small reusable bits of page logic
│   ├── src/shared/                types and constants all three parts agree on
│   ├── tests/                     39 test files (Vitest)
│   └── electron-builder.cjs …     installer, build, TypeScript, lint and test settings
├── tenants/morse-micro/           tenant.json, logo.png, icon.png
├── scripts/                       Code Guide, PDFs, release signing, publishing the installer
├── docs/                          this guide, the Code Guide, set-up and releasing guides
└── installer/                     the newest installer and its signature
```

## 4. How the pieces fit together

An Electron app runs as several programs at once (**processes**), and the code is split the same
way. The **main process** is Node.js: it creates the windows, reads and writes files, talks to the
network and to Windows. Each window runs a **renderer**: a Chromium page that draws with HTML, CSS
and React, and on its own can touch nothing outside the page. The **preload** script runs in each
page before it loads and hands it a small, fixed set of functions, `window.assist`. **Shared** code
is compiled into all three, so they agree on names and types.

```figure
layers
```

There are eight kinds of window, all frameless, see-through and always on top. They all load the
same page, and its address (`index.html?view=…`) says which one it is:

| View          | What it is                                                                                   | Takes the mouse?  |
| ------------- | -------------------------------------------------------------------------------------------- | ----------------- |
| `bubble`      | Her: a small window (96 × 104 DIPs at her usual size) that moves as she walks or is carried. | always            |
| `panel`       | The icons and the card beside her: large, mostly see-through.                                | only over real UI |
| `clones`      | Ten copies of her along the taskbar, for her Clones spell.                                   | never             |
| `vision`      | The light and the company logo of her vision habit.                                          | never             |
| `spell`       | The other spells' effects, drawn over her screen.                                            | never             |
| `screensaver` | One over each whole screen while the screen saver is on.                                     | yes, to wake it   |
| `familiar`    | A strip along the taskbar where her black cat walks.                                         | never             |
| `trick`       | The taskbar's icons, copied, while she plays a trick with them.                              | never             |

> **Why it's built this way**
> Keeping her in her own tiny window means only a small window moves when she walks, and the panel
> never resizes or flickers as she does. The passive windows (clones, vision, spells, cat, tricks)
> never take the mouse or the focus, so they can cover the screen without ever getting in the way.

## 5. The life of a click

Every interaction is the same kind of round trip. Here is what happens when you click her to open
the panel:

```figure
click
```

1. You press and release on her. Her page, `BubbleView`, notes when the button went down, and its
   `onClick` calls `window.assist.bubbleClick(pressedAt)`.
2. The **preload** turns that into an IPC message on the channel `assist:bubble-click`.
3. In the main process, **`ipc.ts`** checks the message came from one of the app's own windows and
   that its argument is a number, then calls `BubbleController.clickBubble()`.
4. **`BubbleController`** sees she's collapsed, so it calls `expand()`: anything she was doing on her
   own stops, the mode becomes `expanded`, and the panel window is shown beside her and focused.
5. The new mode is **broadcast** to both pages (`assist:mode-changed`), and the main process tells
   the panel where the pointer is, so it can decide whether to take the mouse.
6. **`PanelView`** re-renders open, the card fades in, and her page tints her shadow. Click her again,
   press Esc, or click anywhere else, and the same trip runs the other way (`collapse()`).
