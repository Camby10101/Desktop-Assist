# Shared code and the preload bridge

[← Code Guide](CODE_GUIDE.md)

The app runs as two kinds of process: the **main process** (Node.js, which owns the windows,
files, sign-in and Claude) and a **renderer** for each window (Chromium, which draws the React
UI). They talk over **IPC** (inter-process communication): one side sends a message on a named
_channel_ and the other side listens on it. `src/shared` holds the TypeScript both sides must
agree on (window sizes, action names, data shapes and the list of channels), imported as
`@shared/...` and bundled into each part. `src/preload/index.ts` is the small script that turns
that list of channels into `window.assist`, the only way a page can reach the main process.

## `src/shared/geometry.ts`: sizes and positions

Every size and offset the bubble and the panel use, plus a few helpers built on them. The main
process uses these numbers to size and place the two windows (`src/main/index.ts` and
`src/main/bubble/layout.ts`). The renderer uses the same numbers to place elements inside those
windows (`ActionStack.tsx`, `ChatBox.tsx`, `SettingsMenu.tsx`). Because both read one file, a
window can never be the wrong size for what is drawn in it.

All values are **DIPs** (device-independent pixels): pixels before Windows display scaling. On a
display scaled to 150%, one DIP is 1.5 real pixels. Electron's window and screen functions and
the page's CSS pixels both work in DIPs, so one number means the same thing on both sides.

The key idea is that the panel's layout is measured from the corner the bubble sits in, not from
the top-left of the window. That way one set of numbers works in all four screen corners.

### `Point`, `Size` and `Rect`

<!-- code: apps/desktop/src/shared/geometry.ts#Point,Size,Rect -->

[`src/shared/geometry.ts`, lines 1–14](../../apps/desktop/src/shared/geometry.ts#L1-L14)

```ts
// Geometry shared by the main process (which sizes and moves windows) and the renderer (which
// positions elements inside them). All values are DIPs (device-independent pixels).

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Rect extends Point, Size {}
```

<!-- /code -->

Plain shapes for positions and sizes, used all over the main process and the renderer.

- `export interface Rect extends Point, Size {}`: an interface can extend several others. `Rect`
  adds nothing of its own; it is `x`, `y`, `width` and `height` together, the same shape
  Electron uses for window bounds, so a `Rect` can be passed straight to `win.setBounds()` (see
  `src/main/bubble/windows.ts`).

### `Corner`, `isLeftCorner()` and `isTopCorner()`

<!-- code: apps/desktop/src/shared/geometry.ts#Corner,isLeftCorner,isTopCorner -->

[`src/shared/geometry.ts`, lines 16–20](../../apps/desktop/src/shared/geometry.ts#L16-L20)

```ts
/** The screen corner the bubble rests in. The panel always opens toward the screen's middle. */
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export const isLeftCorner = (corner: Corner): boolean => corner.endsWith('left')

export const isTopCorner = (corner: Corner): boolean => corner.startsWith('top')
```

<!-- /code -->

`Corner` is a _union of string literals_: a value of this type can only be one of those four
strings, and TypeScript rejects anything else at compile time. The bubble rests in one corner of
a display's work area (the screen minus the taskbar), and everything else opens toward the middle
of the screen from there. The two helpers answer "which side is the bubble on?", which is all
the layout code needs in order to mirror itself.

- `corner.endsWith('left')`: every name is "vertical-horizontal", so the horizontal side is the
  end of the string and the vertical side is the start.
- Callers: `homePosition()` and `panelWindowBounds()` in `src/main/bubble/layout.ts`, `launch()`
  in `src/main/bubble/bounce.ts` (a bounce sets off away from the corner), and `anchored()` in
  `src/renderer/src/lib/anchor.ts`, which turns an offset into CSS `left`/`right` and
  `top`/`bottom`.

### `UI`

<!-- code: apps/desktop/src/shared/geometry.ts#UI -->

[`src/shared/geometry.ts`, lines 22–40](../../apps/desktop/src/shared/geometry.ts#L22-L40)

```ts
export const UI = {
  /** Gap between the bubble and the edges of the work area. */
  edgeMargin: 16,
  bubbleSize: 56,
  /** Transparent margin around the bubble inside its window (room for the shadow and ring). */
  bubblePad: 8,
  /** Space between the bubble and the chat card / action stack. */
  gap: 12,
  /** The chat card. It starts as just the text box and grows away from the bubble to this height. */
  panelWidth: 400,
  panelMaxHeight: 520,
  /** Room beyond the chat card for a toast message, even when the card is at full height. */
  toastRoom: 40,
  actionSize: 40,
  actionGap: 8,
  /** Room for drop shadows along the panel window's far edges. */
  shadowPad: 16,
  settingsMenuWidth: 248,
} as const
```

<!-- /code -->

Every fixed measurement of the UI in one object, in DIPs.

- `as const`: makes the object read-only and keeps each value's exact type (`56` rather than
  `number`). Nothing can change these numbers at runtime by accident.
- `edgeMargin: 16`: how far the resting bubble sits from the work area's edges
  (`homePosition()` in `src/main/bubble/layout.ts`).
- `bubblePad: 8`: the bubble's window is a little bigger than the bubble itself, so the drop
  shadow and the ring around the bubble aren't clipped by the window edge.
- `panelWidth: 400` and `panelMaxHeight: 520`: the chat card's width and its tallest height.
  `ChatBox.tsx` sets them as the card's CSS `width` and `maxHeight`; the card starts as just the
  text box and grows as the conversation fills it.
- `toastRoom: 40`: toasts ("Screenshot saved") appear just outside the card, on the side away
  from the screen edge. The window keeps this much room for them even when the card is full height.
- `actionSize: 40` and `actionGap: 8`: the round action icons and the space between them
  (`ActionStack.tsx`).
- `shadowPad: 16`: transparent room along the panel window's far edges so shadows there aren't
  cut off.

### `BUBBLE_BOX`

<!-- code: apps/desktop/src/shared/geometry.ts#BUBBLE_BOX -->

[`src/shared/geometry.ts`, lines 42–43](../../apps/desktop/src/shared/geometry.ts#L42-L43)

```ts
/** The bubble window is the bubble plus its padding on every side. */
export const BUBBLE_BOX = UI.bubbleSize + UI.bubblePad * 2
```

<!-- /code -->

The bubble window's width and height: 56 + 8 + 8 = 72. `start()` in `src/main/index.ts` creates
the bubble window at this size, and `bubbleWindowBounds()` in `src/main/bubble/layout.ts` places
it. The bubble window only ever moves; it never changes size.

### `PANEL_LAYOUT`

<!-- code: apps/desktop/src/shared/geometry.ts#PANEL_LAYOUT -->

[`src/shared/geometry.ts`, lines 45–56](../../apps/desktop/src/shared/geometry.ts#L45-L56)

```ts
/**
 * Where things sit inside the panel window. The panel window shares one corner with the bubble
 * window (the corner of the screen the bubble is in), and these offsets are measured from that
 * corner: `X` across, `Y` away from the screen edge. So the same numbers work in every corner.
 */
export const PANEL_LAYOUT = {
  actionsX: UI.bubblePad + (UI.bubbleSize - UI.actionSize) / 2,
  actionsY: UI.bubblePad + UI.bubbleSize + UI.gap,
  chatX: UI.bubblePad + UI.bubbleSize + UI.gap,
  chatY: UI.bubblePad,
  settingsX: UI.bubblePad + (UI.bubbleSize + UI.actionSize) / 2 + UI.actionGap,
} as const
```

<!-- /code -->

Where the three parts of the panel (the action icons, the chat card and the settings menu) sit
inside the panel window. The panel window and the bubble window share one corner: in the
bottom-right of the screen, their bottom-right corners are in the same place
(`panelWindowBounds()` in `src/main/bubble/layout.ts`). Every offset here is measured from that
shared corner: `X` across, `Y` away from the screen edge (upward in a bottom corner, downward in a
top corner). In the renderer, `anchored()` (`src/renderer/src/lib/anchor.ts`) turns an `(X, Y)`
pair into CSS `right`/`bottom`, `left`/`top` and so on, so the same numbers mirror into every
corner.

Here is the bottom-right case with four icons (not to scale; the other corners are mirror
images):

```text
+-----------------------------------------------------+
|  +------------------------------+                   |
|  |                              |                   |
|  |  chat card                   |        [ icon 4 ] |
|  |  (grows upward,              |        [ icon 3 ] |
|  |   at most 520 tall)          |        [ icon 2 ] |
|  |                              |        [ icon 1 ] |
|  |  [ text box ]                |                   |
|  +------------------------------+        ( bubble ) |
+-----------------------------------------------------+
```

- `actionsX: UI.bubblePad + (UI.bubbleSize - UI.actionSize) / 2`: 8 + 8 = 16, which centres the
  40-DIP icons on the 56-DIP bubble.
- `actionsY: UI.bubblePad + UI.bubbleSize + UI.gap`: 76. The first icon starts one gap beyond the
  bubble.
- `chatX: UI.bubblePad + UI.bubbleSize + UI.gap`: also 76. The chat card starts one gap to the
  side of the bubble, toward the middle of the screen.
- `chatY: UI.bubblePad`: 8, so the card's near edge is level with the bubble's near edge.
- `settingsX`: 8 + 48 + 8 = 64. The first two terms reach the far side of the icon column; one
  more `actionGap` puts the menu just beside the gear icon. Its other coordinate depends on where
  the gear is in the stack, so it comes from `actionOffset()` instead.

### `actionStackHeight()` and `actionOffset()`

<!-- code: apps/desktop/src/shared/geometry.ts#actionStackHeight,actionOffset -->

[`src/shared/geometry.ts`, lines 58–65](../../apps/desktop/src/shared/geometry.ts#L58-L65)

```ts
export function actionStackHeight(actionCount: number): number {
  return actionCount > 0 ? actionCount * UI.actionSize + (actionCount - 1) * UI.actionGap : 0
}

/** Distance from the bubble's edge of the panel window to the near side of the action at `index`. */
export function actionOffset(index: number): number {
  return PANEL_LAYOUT.actionsY + index * (UI.actionSize + UI.actionGap)
}
```

<!-- /code -->

Two small sums over the icon stack.

- `actionCount > 0 ?`: `n` icons have `n - 1` gaps between them. With no icons the formula
  would give -8, so zero is handled separately. Only `panelWindowSize()` below uses this.
- `PANEL_LAYOUT.actionsY + index * (UI.actionSize + UI.actionGap)`: icon `index` (0 is nearest
  the bubble) starts this far from the bubble's edge of the window. `PanelView.tsx` passes
  `actionOffset(settingsIndex)` to `SettingsMenu` as its `offset`, so the menu lines up with the
  gear wherever the tenant put the gear in its list.

### `panelWindowSize()`

<!-- code: apps/desktop/src/shared/geometry.ts#panelWindowSize -->

[`src/shared/geometry.ts`, lines 67–74](../../apps/desktop/src/shared/geometry.ts#L67-L74)

```ts
export function panelWindowSize(actionCount: number): Size {
  const width = PANEL_LAYOUT.chatX + UI.panelWidth + UI.shadowPad
  const contentHeight = Math.max(
    PANEL_LAYOUT.chatY + UI.panelMaxHeight + UI.toastRoom,
    PANEL_LAYOUT.actionsY + actionStackHeight(actionCount),
  )
  return { width, height: contentHeight + UI.shadowPad }
}
```

<!-- /code -->

How big the panel window must be to hold everything at its largest. The window is created at
this size (`start()` in `src/main/index.ts`) and never resizes when the chat card grows, so there
is no flicker. The unused parts are transparent and let clicks through to whatever is underneath
(the _click-through_ handled by `useClickThrough()` in the renderer).

- `PANEL_LAYOUT.chatX + UI.panelWidth + UI.shadowPad`: 76 + 400 + 16 = 492 wide.
- `Math.max(`: the height is whichever reaches further from the screen edge: the chat card at
  full height plus room for a toast (8 + 520 + 40 = 568), or the icon stack. With the usual four
  icons the stack ends at 76 + 184 = 260, so the card decides and the window is 584 tall. The
  stack only matters with 11 or more icons.

## `src/shared/actions.ts`: the action registry

The icons that can appear in the stack beside the bubble (the _actions_), each with a tooltip
label and a _kind_. A tenant's `tenant.json` has an `actions` list that picks which ones appear
and in what order, nearest the bubble first. There are two kinds:

- `command` actions run in the main process: the IT service desk, screenshot, bounce and close
  (handlers in `createActionHandlers()`, `src/main/actions.ts`).
- `popover` actions open some UI inside the panel and never leave the renderer: Settings (the
  settings menu), and Ask Claude and Your apps, which switch the card between the text box and
  the Apps list. `PanelView.runAction()` handles them.

The ids are written once, as a real array, and the types are derived from it. So adding an
action is one edit here, and then the compiler points at the rest: `ICONS` in `ActionStack.tsx`
is a `Record<ActionId, ...>` (it must have an icon for every action), and `ActionHandlers` in
`src/main/actions.ts` is a `Record<CommandActionId, ...>` (every command needs a handler).

### `ACTION_IDS` and `ActionId`

<!-- code: apps/desktop/src/shared/actions.ts#ACTION_IDS,ActionId -->

[`src/shared/actions.ts`, lines 1–17](../../apps/desktop/src/shared/actions.ts#L1-L17)

```ts
// The action registry: every icon that can appear in the stack above the bubble. A tenant's
// `actions` list chooses which of these show and in what order (from the bubble upward).
//
// - `command` actions run in the main process (see src/main/actions.ts).
// - `popover` actions open UI inside the panel and never reach the main process.

export const ACTION_IDS = [
  'ask',
  'apps',
  'servicedesk',
  'screenshot',
  'settings',
  'bounce',
  'close',
] as const

export type ActionId = (typeof ACTION_IDS)[number]
```

<!-- /code -->

The list of every action that exists, and the type of one of its entries.

- `as const`: without it the array's type would be `string[]`. With it, the type is a read-only
  list of these seven exact strings, which is what lets the next line work.
- `(typeof ACTION_IDS)[number]`: "the type of whatever you get by indexing the array with a number",
  which is the union of the seven, `'ask' | 'apps' | 'servicedesk' | ... | 'close'`. The type
  follows the list automatically.
- The array also exists at runtime, which a type doesn't: `TenantSchema` in `src/main/tenant.ts`
  uses `z.enum(ACTION_IDS)` to reject a `tenant.json` that lists an unknown action. **zod** is a
  validation library: you describe a shape (a _schema_) and zod checks, while the app runs, that
  untrusted data really has that shape. TypeScript types are erased when the code is compiled, so
  they can't check anything at runtime.

### `ACTIONS`

<!-- code: apps/desktop/src/shared/actions.ts#ACTIONS -->

[`src/shared/actions.ts`, lines 19–27](../../apps/desktop/src/shared/actions.ts#L19-L27)

```ts
export const ACTIONS = {
  ask: { label: 'Ask Claude', kind: 'popover' },
  apps: { label: 'Your apps', kind: 'popover' },
  servicedesk: { label: 'IT service desk', kind: 'command' },
  screenshot: { label: 'Take screenshot', kind: 'command' },
  settings: { label: 'Settings', kind: 'popover' },
  bounce: { label: 'Bounce', kind: 'command' },
  close: { label: 'Close Desktop Assist', kind: 'command' },
} as const satisfies Record<ActionId, { label: string; kind: 'command' | 'popover' }>
```

<!-- /code -->

The label and kind of each action. `ActionStack.tsx` uses `label` as each icon's tooltip and
screen-reader name, and gives `popover` actions an `aria-expanded` attribute so screen readers
announce whether the menu is open.

- `satisfies Record<ActionId, { label: string; kind: 'command' | 'popover' }>`: checks that there
  is exactly one entry per action id, each with a label and a valid kind. A missing, extra or
  misspelt action is a compile error. Unlike a normal type annotation, `satisfies` only checks: it
  doesn't change the object's own type.
- `as const`: keeps each `kind` as its exact string (`'command'`), not just `string`.
  `CommandActionId` below depends on that; a plain `: Record<...>` annotation would have widened
  every `kind` to `'command' | 'popover'` and lost which is which.

### `CommandActionId`

<!-- code: apps/desktop/src/shared/actions.ts#CommandActionId -->

[`src/shared/actions.ts`, lines 29–31](../../apps/desktop/src/shared/actions.ts#L29-L31)

```ts
export type CommandActionId = {
  [K in ActionId]: (typeof ACTIONS)[K]['kind'] extends 'command' ? K : never
}[ActionId]
```

<!-- /code -->

The type of just the command actions: `'servicedesk' | 'screenshot' | 'bounce' | 'close'`. It's
worked out from
`ACTIONS`, so it can't drift out of step with it.

- `[K in ActionId]:`: a _mapped type_. It builds an object type with one property per action id.
  Each property's type is the id itself if that action's kind is `'command'`, or `never` (the
  "impossible" type) if not, giving (in part)
  `{ ask: never; servicedesk: 'servicedesk'; settings: never; close: 'close' }`.
- `}[ActionId]`: looking up every key at once gives the union of the property types. `never`
  disappears from a union, leaving the four command ids.
- `AssistApi.invokeAction()` in `src/shared/ipc.ts` only accepts these, so a page can't even try
  to send `settings`, `ask` or `apps` to the main process. In `PanelView.runAction()`, the early
  returns for those narrow the id to exactly this type, which is why it can then be passed on.

### `COMMAND_ACTION_IDS`

<!-- code: apps/desktop/src/shared/actions.ts#COMMAND_ACTION_IDS -->

[`src/shared/actions.ts`, lines 33–35](../../apps/desktop/src/shared/actions.ts#L33-L35)

```ts
export const COMMAND_ACTION_IDS = ACTION_IDS.filter(
  (id): id is CommandActionId => ACTIONS[id].kind === 'command',
)
```

<!-- /code -->

The same set as a real array, for checks at runtime. `registerIpc()` in `src/main/ipc.ts` uses
`z.enum(COMMAND_ACTION_IDS)` to check the id that arrives with `assist:invoke-action` before
looking up its handler. The main process treats the pages as untrusted, so a compile-time type
isn't enough.

- `(id): id is CommandActionId =>`: a _type guard_. It tells TypeScript that when this function
  returns true, `id` is a `CommandActionId`, so the filtered array is typed `CommandActionId[]`
  rather than `ActionId[]`.

## `src/shared/types.ts`: data shapes

The shapes of the data that travels between the main process and the pages: the bubble's mode,
the draft, settings, branding, sign-in status, chat messages and the answers to requests. The
file holds only types, so nothing in it exists at runtime; every file imports it with
`import type`.

Two ideas run through it:

- **Plain data only.** Everything is strings, numbers, booleans, arrays and plain objects.
  Values sent over IPC are copied (Electron serialises them with the browser's _structured clone_
  algorithm, which drops functions and class methods), and some are also saved as JSON files.
  That is why timestamps are ISO strings such as `"2026-10-02T14:03:11.000Z"` rather than `Date`
  objects.
- **Tagged unions.** Several types are "one of these shapes", told apart by a tag field (`state`
  or `ok`). Checking the tag tells TypeScript which other fields exist: after
  `if (result.ok)`, it knows `result.notes` is there; otherwise it knows `result.reason` is.

### `Mode`

<!-- code: apps/desktop/src/shared/types.ts#Mode -->

[`src/shared/types.ts`, lines 4–10](../../apps/desktop/src/shared/types.ts#L4-L10)

```ts
/**
 * What the bubble is doing. The main process owns this; renderers only display it.
 * - `dragging`: following the mouse while the user drags it.
 * - `returning`: gliding into its corner after a bounce or a drag.
 * - `capturing`: windows are hidden while a screenshot is taken.
 */
export type Mode = 'collapsed' | 'expanded' | 'dragging' | 'bouncing' | 'returning' | 'capturing'
```

<!-- /code -->

What the bubble is doing right now. Only `BubbleController` (`src/main/bubble/BubbleController.ts`)
changes it, through its private `setMode()`, and each change is broadcast to both windows on
`assist:mode-changed`. `collapsed` is just the bubble; `expanded` means the panel is open;
`bouncing` is the Bounce animation. The panel shows its contents only while the mode is
`expanded`, and `BubbleView` styles the bubble differently while `dragging` and `expanded`.

### `Attachment` and `Notes`

<!-- code: apps/desktop/src/shared/types.ts#Attachment,Notes -->

[`src/shared/types.ts`, lines 12–27](../../apps/desktop/src/shared/types.ts#L12-L27)

```ts
export interface Attachment {
  id: string
  /** Absolute path of the screenshot file. */
  path: string
  fileName: string
  /** ISO timestamp. */
  addedAt: string
}

/** The unsent draft in the text box. */
export interface Notes {
  text: string
  attachments: Attachment[]
  /** ISO timestamp of the last change, or null if nothing has been typed yet. */
  updatedAt: string | null
}
```

<!-- /code -->

A screenshot attached to the draft (or to a message already sent), and the draft itself. The
code calls the draft "notes" throughout (`NotesStore`, `window.assist.notes`). `NotesStore`
(`src/main/notes/NotesStore.ts`) owns it and saves it to `notes.json`, so an unsent message
survives a restart.

- `id: string`: a random UUID made by `NotesStore.addAttachment()`. The page uses it to remove
  one attachment (`notes.removeAttachment(id)`).
- `path: string`: where the PNG is on disk. The main process never trusts a path that comes back
  from a page: `ScreenshotService` checks it is inside the screenshots folder before reading it.
- `fileName: string`: just the file's name, which `screenshotLabel()` (below) turns into the
  chip's label.
- `updatedAt: string | null`: set by `NotesStore` on every change; `null` for a draft nobody has
  typed in yet.

### `Effort` and `Settings`

<!-- code: apps/desktop/src/shared/types.ts#Effort,Settings -->

[`src/shared/types.ts`, lines 29–44](../../apps/desktop/src/shared/types.ts#L29-L44)

```ts
/** How hard Claude thinks before answering (the API's `effort`), shown as Fast/Balanced/Thorough. */
export type Effort = 'low' | 'medium' | 'high'

export interface Settings {
  autoStart: boolean
  /** Starting with Windows only works for an installed build, not `npm run dev`. */
  autoStartAvailable: boolean
  screenshotsDir: string
  effort: Effort
  /** With Claude Desktop: send the question there too, not just fill it in. */
  autoSend: boolean
  /** Uninstalling from Settings only works for an installed build, not `npm run dev`. */
  canUninstall: boolean
  /** IDs of the apps the user starred in the Apps list. */
  favoriteApps: string[]
}
```

<!-- /code -->

`Effort` is the response style. It is sent to the Claude API as `output_config.effort`
(`src/main/claude/AnthropicBackend.ts`) and shown in the settings menu as Fast, Balanced and
Thorough. `Settings` is what the settings menu shows; `SettingsService.get()` in
`src/main/settings.ts` builds a fresh one each time.

- `autoStart: boolean`: whether the app starts with Windows. It is read from Windows each time,
  because the user can also change it in Windows Settings.
- `autoStartAvailable: boolean`: `app.isPackaged`, true only in the installed app. Under
  `npm run dev` the switch is greyed out with "Only in the installed app".
- `screenshotsDir: string`: the folder screenshots are saved in, opened by "Open screenshots
  folder".
- `effort: Effort`: the response style, used by the built-in chat only.
- `autoSend: boolean`: used with Claude Desktop only: whether Desktop Assist also sends the
  question there (presses Ctrl+V and Enter in Claude), or only fills it in. On unless the user
  turns "Send in Claude automatically" off in the settings menu.
- `canUninstall: boolean`: like `autoStartAvailable`, true only in the installed app, which is the
  only copy with an uninstaller. Under `npm run dev` the menu's Uninstall item is greyed out.
- `favoriteApps: string[]`: the IDs of the apps the user starred in the Apps list, which it shows
  first. They're kept with the other preferences, so they survive a restart.

### `ChatApp`

<!-- code: apps/desktop/src/shared/types.ts#ChatApp -->

[`src/shared/types.ts`, lines 46–50](../../apps/desktop/src/shared/types.ts#L46-L50)

```ts
/**
 * Where conversations happen: in the panel through the Claude API (`built-in`), or handed over to
 * the Claude Desktop app (`claude-desktop`), which uses each person's own Claude account.
 */
export type ChatApp = 'built-in' | 'claude-desktop'
```

<!-- /code -->

Where questions are answered, set per tenant (`chatApp` in `tenant.json`, checked against
`CHAT_APPS` in `src/main/tenant.ts`). The two are quite different apps:

- `built-in`: the panel is a chat of its own. The user signs in with JumpCloud, and the main
  process calls the Claude API, billed to the company's Claude Console account.
- `claude-desktop`: the panel is only a text box. Asking opens the question in the Claude Desktop
  app (and, unless the user turns it off, sends it there), where the person is signed in with
  their own Claude account, so it counts against their own usage limit. Desktop Assist has no
  sign-in of its own then (see [Claude Desktop](9-claude-desktop.md)).

### `Branding` and `StartPage`

<!-- code: apps/desktop/src/shared/types.ts#Branding,StartPage -->

[`src/shared/types.ts`, lines 52–65](../../apps/desktop/src/shared/types.ts#L52-L65)

```ts
export interface Branding {
  companyName: string
  appName: string
  accentColor: string
  actions: ActionId[]
  chatApp: ChatApp
  /** The identity provider's name for the Apps list ("JumpCloud"), or null without one. */
  portalName: string | null
  /** What the card shows when the panel opens: the text box, or the Apps list. */
  startPage: StartPage
}

/** The two things the card beside the bubble can show. */
export type StartPage = 'ask' | 'apps'
```

<!-- /code -->

The parts of the tenant's `tenant.json` that the pages need. `brandingOf()` in `src/main/tenant.ts`
copies just these fields, deliberately leaving out the sign-in settings, the Claude access settings,
the portal's addresses and the system prompt. `accentColor` becomes the page's accent colour
(`useAccentColor()` sets the CSS variable `--color-accent`), and `actions` decides which icons
`ActionStack` shows, in order. `chatApp` tells the panel which kind of chat it is: it changes the
send button, the settings menu, and whether there's a sign-in at all. `portalName` is the name of
the company's app portal ("JumpCloud"), for the Apps list's buttons ("Sign in with JumpCloud"); it's
`null` when the tenant has no portal, and then the Apps list never shows.

`startPage` is what the card shows when the panel opens: the text box (`ask`) or the Apps list
(`apps`). `StartPage` is the type of those two, and also of the panel's `view` (which of the two
is showing right now).

### `SignedInUser` and `AuthStatus`

<!-- code: apps/desktop/src/shared/types.ts#SignedInUser,AuthStatus -->

[`src/shared/types.ts`, lines 67–86](../../apps/desktop/src/shared/types.ts#L67-L86)

```ts
export interface SignedInUser {
  name?: string
  email?: string
}

/**
 * Whether the user is signed in with JumpCloud.
 * - `unconfigured`: the JumpCloud or Claude access settings in tenant.json aren't filled in yet.
 * - `checking`: renewing a saved sign-in at startup.
 * - `signing-in`: waiting for the user to finish in their browser.
 * - `offline`: a saved sign-in couldn't be renewed because JumpCloud couldn't be reached. It's
 *   kept, and Retry tries again.
 */
export type AuthStatus =
  | { state: 'unconfigured'; missing: string[] }
  | { state: 'checking' }
  | { state: 'signed-out'; message?: string }
  | { state: 'signing-in' }
  | { state: 'signed-in'; user: SignedInUser }
  | { state: 'offline'; user: SignedInUser; message: string }
```

<!-- /code -->

Who is signed in, and where sign-in stands, for the built-in chat. The user signs in with
**JumpCloud**, the company's single sign-on service. Only `AuthManager`
(`src/main/auth/AuthManager.ts`) sets the status, and every change is broadcast on
`assist:auth-status`. The pages only ever learn the state and the user's name and email; no
token ever reaches them. With Claude Desktop there is no `AuthManager` and no status at all
(`AppState.auth` is `null`, below).

- `name?: string` and `email?: string`: taken from the `name` and `email` claims in JumpCloud's
  ID token (its signed statement of who signed in). Both are optional because JumpCloud may
  leave them out.
- `{ state: 'unconfigured'; missing: string[] }`: `missing` lists the `tenant.json` settings
  still to fill in, by name (from `missingSettings()` in `src/main/tenant.ts`).
- `{ state: 'signed-out'; message?: string }`: the optional message says why, for example that
  the sign-in expired.
- `{ state: 'offline'; user: SignedInUser; message: string }`: the saved sign-in is kept and the
  chat stays usable. `PanelView` treats both `signed-in` and `offline` as signed in, and shows
  the sign-in panel for `unconfigured`, `signed-out` and `signing-in`.

### `ChatMessage` and `SendResult`

<!-- code: apps/desktop/src/shared/types.ts#ChatMessage,SendResult -->

[`src/shared/types.ts`, lines 88–104](../../apps/desktop/src/shared/types.ts#L88-L104)

```ts
/** One message as the chat shows it. */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Screenshots sent with a user message. */
  attachments: Attachment[]
  status: 'streaming' | 'done' | 'stopped' | 'error'
  /** Shown under the message, e.g. why it stopped. */
  notice?: string
  /** A failed reply that can be requested again. */
  retryable?: boolean
}

export type SendResult =
  | { ok: true; notes: Notes }
  | { ok: false; reason: 'busy' | 'empty' | 'signed-out' | 'missing-screenshot' }
```

<!-- /code -->

`ChatMessage` is one message as the chat shows it. `ChatSession` (`src/main/claude/ChatSession.ts`)
keeps the list and broadcasts every new or changed message on `assist:chat-message`; the page
replaces the message with the same `id` (`upsert()` in `useAssistState.ts`). This is only the
display copy: the history sent to Claude, including Claude's hidden thinking, is kept separately
inside `ChatSession`.

- `status: 'streaming' | 'done' | 'stopped' | 'error'`: `streaming` while text is still
  arriving; `stopped` means the user pressed Stop.
- `retryable?: boolean`: set on a failed reply that can be asked for again (a temporary error
  before any text arrived). `ChatSession.retry()` only acts if the last message has it.

`SendResult` is the answer to `window.assist.chat.send()`. On success, `notes` is the now-empty
draft, which the panel shows. The reply itself arrives later, through `onChatMessage`.

- `reason: 'busy' | 'empty' | 'signed-out' | 'missing-screenshot'`: `busy` means a reply is
  still streaming, and `empty` means there was no text and no screenshot. The first three come
  from `ChatSession.send()`; `missing-screenshot` (an attached file has gone) comes from the
  `chat-send` handler in `src/main/ipc.ts`.

### `AskResult`

<!-- code: apps/desktop/src/shared/types.ts#AskResult -->

[`src/shared/types.ts`, lines 106–112](../../apps/desktop/src/shared/types.ts#L106-L112)

```ts
/**
 * Handing the draft to Claude Desktop. `screenshots` is how many were copied to the clipboard
 * (as one image) for the user to paste.
 */
export type AskResult =
  | { ok: true; notes: Notes; screenshots: number }
  | { ok: false; reason: 'empty' | 'too-long' | 'not-installed' | 'missing-screenshot' | 'failed' }
```

<!-- /code -->

The answer to `window.assist.claudeDesktop.ask()`, which hands the draft to Claude Desktop instead
of the built-in chat. On success, `notes` is the now-empty draft, as with `SendResult`, and
Claude Desktop has opened with the question filled in. The failures come from
`ClaudeDesktop.ask()` in `src/main/claudeDesktop.ts` (see [Claude Desktop](9-claude-desktop.md)).

- `screenshots: number`: how many attached screenshots were put on the clipboard, combined into
  one image, to be pasted into Claude (by Desktop Assist with "Send in Claude automatically" on,
  otherwise by the user with Ctrl+V).
- The result doesn't say whether the question was sent in Claude: that happens afterwards, in
  the background, and if it doesn't work a Windows notification tells the user what's left.
- `'empty'`, `'missing-screenshot'`: the same as for `SendResult`. There's no `busy` or
  `signed-out`: nothing streams here, and there's no sign-in.
- `'too-long'`: more text than Claude Desktop accepts in a link (12,000 characters here).
- `'not-installed'`: nothing on the PC opens `claude://` links, so Claude Desktop isn't
  installed.
- `'failed'`: copying the screenshots or opening the link went wrong; the details are in the log.

### `AppState`

<!-- code: apps/desktop/src/shared/types.ts#AppState -->

[`src/shared/types.ts`, lines 114–125](../../apps/desktop/src/shared/types.ts#L114-L125)

```ts
export interface AppState {
  mode: Mode
  /** The screen corner the bubble rests in; the panel lays itself out to open away from it. */
  corner: Corner
  notes: Notes
  settings: Settings
  branding: Branding
  version: string
  /** Null when chats happen in Claude Desktop, which has its own sign-in. */
  auth: AuthStatus | null
  chat: ChatMessage[]
}
```

<!-- /code -->

Everything a page needs when it first loads, returned by `window.assist.getState()`. It is put
together by the `getState` function that `start()` in `src/main/index.ts` passes to
`registerIpc()`. After that first load, `useAssistState()` in the renderer keeps `mode`, `corner`,
`auth` and `chat` up to date from the `on...` events. `notes` and `settings` only change through
the page's own requests, so the panel takes their new values from the replies.

- `version: string`: `app.getVersion()`, shown in the settings menu.
- `auth: AuthStatus | null`: the sign-in status of the built-in chat, or `null` with Claude
  Desktop, which has its own sign-in. The pages check for `null` before reading `auth.state`.
- `chat: ChatMessage[]`: the built-in chat's messages. With Claude Desktop it's always empty.

The Apps list isn't in `AppState`: the panel asks for it whenever the list shows
(`window.assist.apps.get()`), and then keeps up through `onAppsState`.

### `PortalApp` and `AppsState`

<!-- code: apps/desktop/src/shared/types.ts#PortalApp,AppsState -->

[`src/shared/types.ts`, lines 127–146](../../apps/desktop/src/shared/types.ts#L127-L146)

```ts
/** One app from the user's JumpCloud User Portal, as the Apps list shows it. */
export interface PortalApp {
  id: string
  name: string
  /** The logo as a data: URL (the pages can't load images from the web), or null. */
  logo: string | null
}

/**
 * The Apps list.
 * - `sign-in`: the user hasn't connected Desktop Assist to their portal yet (or the connection
 *   ended); a button starts it, in the browser.
 * - `signing-in`: waiting for the user to finish in their browser.
 */
export type AppsState =
  | { status: 'loading' }
  | { status: 'sign-in'; message?: string }
  | { status: 'signing-in' }
  | { status: 'ready'; apps: PortalApp[] }
  | { status: 'error'; message: string }
```

<!-- /code -->

The Apps list (see [Your apps](10-apps.md)). `PortalApp` is one app as the list shows it, and
`AppsState` is what the list as a whole is doing. `PortalApps` in `src/main/apps/PortalApps.ts`
sets the state and broadcasts every change on `assist:apps-state`.

- `id: string`: JumpCloud's ID for the app. The page sends it back to open the app
  (`apps.open(id)`); the sign-in link itself never reaches the page.
- `logo: string | null`: as the comment says, a `data:` URL. The page's Content-Security-Policy
  only allows images from the app and `data:` URLs, so the main process fetches each logo and
  hands it over already encoded.
- `{ status: 'sign-in'; message?: string }`: the user hasn't connected Desktop Assist to their
  portal yet, or the connection ended. `message` says why when there's a reason to (a sign-in that
  failed, say).
- `{ status: 'ready'; apps: PortalApp[] }`: the list, sorted by name.
- `{ status: 'error'; message: string }`: a plain-English reason, such as the portal's apps
  server not being turned on for the company. The list offers Retry.

### `UninstallResult`

<!-- code: apps/desktop/src/shared/types.ts#UninstallResult -->

[`src/shared/types.ts`, lines 148–150](../../apps/desktop/src/shared/types.ts#L148-L150)

```ts
/** Settings → Uninstall. On success the app is already quitting. */
export type UninstallResult =
  { ok: true } | { ok: false; reason: 'not-installed' | 'missing' | 'failed' }
```

<!-- /code -->

The answer to `window.assist.uninstall()` (Settings → Uninstall; see `src/main/uninstall.ts` in
[Main process: startup, IPC and app plumbing](2-main-startup.md)). On success the app is already
quitting, so the page has nothing more to do.

- `'not-installed'`: a dev run (`npm run dev`), which has no uninstaller.
- `'missing'`: the uninstaller isn't next to the app's `.exe`.
- `'failed'`: it couldn't be started; the details are in the log.

### `ActionResult` and `AttachResult`

<!-- code: apps/desktop/src/shared/types.ts#ActionResult,AttachResult -->

[`src/shared/types.ts`, lines 152–155](../../apps/desktop/src/shared/types.ts#L152-L155)

```ts
export type ActionResult = { ok: true; message?: string } | { ok: false; message: string }

export type AttachResult =
  { ok: true; notes: Notes } | { ok: false; reason: 'no-screenshots' | 'already-attached' }
```

<!-- /code -->

The answers to two more requests.

- `{ ok: true; message?: string } | { ok: false; message: string }`: what a command action
  returns (`src/main/actions.ts`). `PanelView.runAction()` shows `message` as a toast, styled as
  an error when `ok` is false. A failure must carry a message; a success may (the screenshot
  action says "Screenshot saved", Bounce says nothing).
- `reason: 'no-screenshots' | 'already-attached'`: why "Attach latest screenshot" did nothing:
  the folder has no screenshots, or the newest one is already in the draft
  (`NotesStore.addAttachment()` refuses duplicates).

## `src/shared/ipc.ts`: the IPC contract

The agreement between the pages and the main process: the name of every IPC channel (`IPC`) and
the exact set of functions a page gets as `window.assist` (`AssistApi`). Three places depend on
it. `src/preload/index.ts` implements `AssistApi` by sending on these channels;
`registerIpc()` in `src/main/ipc.ts` listens on them; and `src/renderer/src/env.d.ts` tells
TypeScript that `window.assist` is an `AssistApi`.

Messages come in three styles:

- **Request and reply**: the page calls `ipcRenderer.invoke()`, the main process answers from an
  `ipcMain.handle()` handler, and the page gets a promise of that answer. If the handler throws
  (for example because the input failed its zod check), the promise rejects.
- **Fire and forget**: `ipcRenderer.send()` to an `ipcMain.on()` listener, with no answer. Used for
  frequent or one-way signals such as each keystroke in the text box. In `AssistApi`, the methods
  that return `void` are these; the ones that return a `Promise` are requests.
- **Pushed by the main process**: `webContents.send()` to a window, which the page receives
  through one of the `on...` listeners. These are the last seven channels.

### `IPC`

<!-- code: apps/desktop/src/shared/ipc.ts#IPC -->

[`src/shared/ipc.ts`, lines 19–66](../../apps/desktop/src/shared/ipc.ts#L19-L66)

```ts
/** IPC channel names. The preload maps them onto `window.assist`; src/main/ipc.ts handles them. */
export const IPC = {
  getState: 'assist:get-state',
  bubbleClick: 'assist:bubble-click',
  bubbleDragStart: 'assist:bubble-drag-start',
  bubbleDragEnd: 'assist:bubble-drag-end',
  collapse: 'assist:collapse',
  setInteractive: 'assist:set-interactive',
  invokeAction: 'assist:invoke-action',
  openExternal: 'assist:open-external',
  copyText: 'assist:copy-text',
  notesSetText: 'assist:notes-set-text',
  notesAttachLatest: 'assist:notes-attach-latest',
  notesRemoveAttachment: 'assist:notes-remove-attachment',
  notesClear: 'assist:notes-clear',
  screenshotThumbnail: 'assist:screenshot-thumbnail',
  screenshotOpen: 'assist:screenshot-open',
  screenshotsOpenFolder: 'assist:screenshots-open-folder',
  settingsGet: 'assist:settings-get',
  settingsSetAutoStart: 'assist:settings-set-auto-start',
  settingsSetEffort: 'assist:settings-set-effort',
  settingsSetAutoSend: 'assist:settings-set-auto-send',
  settingsSetFavoriteApp: 'assist:settings-set-favorite-app',
  authSignIn: 'assist:auth-sign-in',
  authCancel: 'assist:auth-cancel',
  authSignOut: 'assist:auth-sign-out',
  authRetry: 'assist:auth-retry',
  chatSend: 'assist:chat-send',
  chatStop: 'assist:chat-stop',
  chatRetry: 'assist:chat-retry',
  chatNew: 'assist:chat-new',
  claudeDesktopAsk: 'assist:claude-desktop-ask',
  claudeDesktopInstalled: 'assist:claude-desktop-installed',
  appUninstall: 'assist:app-uninstall',
  appsGet: 'assist:apps-get',
  appsSignIn: 'assist:apps-sign-in',
  appsCancelSignIn: 'assist:apps-cancel-sign-in',
  appsOpen: 'assist:apps-open',
  appsOpenPortal: 'assist:apps-open-portal',
  // main → renderer
  modeChanged: 'assist:mode-changed',
  cornerChanged: 'assist:corner-changed',
  clickThroughReset: 'assist:click-through-reset',
  authStatus: 'assist:auth-status',
  chatMessage: 'assist:chat-message',
  chatReset: 'assist:chat-reset',
  appsState: 'assist:apps-state',
} as const
```

<!-- /code -->

Every channel name in one object, so the preload and the main process can't disagree about a
name: a typo is a compile error instead of a message nobody hears.

- `'assist:get-state'`: every name starts with `assist:`, so it can't clash with a channel that
  Electron or a library might use.
- `notesClear`: empties the draft, for "Clear text box" in the settings menu.
- `settingsSetAutoSend`: the settings menu's "Send in Claude automatically" switch.
- `settingsSetFavoriteApp`: a star on a tile in the Apps list.
- `appUninstall`: Settings → Uninstall.
- `appsGet` to `appsOpenPortal`: the Apps list. Like the two chats' channels, they're only
  answered when the tenant has a portal.
- `authSignIn` to `chatNew`, and `claudeDesktopAsk` and `claudeDesktopInstalled`: the first group
  belongs to the built-in chat and the second to Claude Desktop. The main process only answers
  the group the tenant uses (`registerIpc()` in `src/main/ipc.ts`).
- `// main → renderer`: the channels from here on go the other way. `broadcast()` in `start()`
  (`src/main/index.ts`) sends them to both windows, except `clickThroughReset`, which
  `resetClickThrough()` in `src/main/bubble/windows.ts` sends only to the panel.

### `AssistApi`

<!-- code: apps/desktop/src/shared/ipc.ts#AssistApi -->

[`src/shared/ipc.ts`, lines 68–152](../../apps/desktop/src/shared/ipc.ts#L68-L152)

```ts
/** The API the preload exposes to renderers as `window.assist`. */
export interface AssistApi {
  getState(): Promise<AppState>
  bubbleClick(): void
  /** The bubble was pressed and moved: the main process makes it follow the mouse. */
  bubbleDragStart(): void
  /** Released: the bubble snaps to the nearest corner of the display it's on. */
  bubbleDragEnd(): void
  collapse(): void
  /** Tell the main process whether the pointer is over real UI (true) or a see-through area. */
  setInteractive(interactive: boolean): void
  invokeAction(id: CommandActionId): Promise<ActionResult>
  /** Opens a web (http/https) or email (mailto) link in the default app. */
  openExternal(url: string): Promise<void>
  copyText(text: string): Promise<void>
  notes: {
    setText(text: string): void
    attachLatestScreenshot(): Promise<AttachResult>
    removeAttachment(id: string): Promise<Notes>
    /** Empties the text box and removes the attached screenshots (the files are kept). */
    clear(): Promise<Notes>
  }
  screenshots: {
    /** A small data-URL preview, or null if the file is missing. */
    thumbnail(path: string): Promise<string | null>
    open(path: string): Promise<boolean>
    openFolder(): Promise<void>
  }
  settings: {
    get(): Promise<Settings>
    setAutoStart(enabled: boolean): Promise<Settings>
    setEffort(effort: Effort): Promise<Settings>
    setAutoSend(autoSend: boolean): Promise<Settings>
    /** Stars an app in the Apps list (it moves to the top), or takes its star away. */
    setFavoriteApp(id: string, favorite: boolean): Promise<Settings>
  }
  auth: {
    /** Opens JumpCloud in the browser; progress arrives through `onAuthStatus`. */
    signIn(): Promise<void>
    /** Stops waiting for a sign-in started in the browser. */
    cancel(): Promise<void>
    signOut(): Promise<void>
    /** Tries again to renew a saved sign-in that couldn't reach JumpCloud. */
    retry(): Promise<void>
  }
  claudeDesktop: {
    /**
     * Opens a new chat in Claude Desktop with the draft text filled in, and copies the attached
     * screenshots for the user to paste. Clears the draft and collapses the panel if it worked.
     */
    ask(text: string): Promise<AskResult>
    /** Whether Claude Desktop is installed on this PC (anything handles claude:// links). */
    isInstalled(): Promise<boolean>
  }
  /** The built-in chat (only when the tenant's `chatApp` is `built-in`). */
  chat: {
    /** Sends the draft text plus the draft's attached screenshots. */
    send(text: string): Promise<SendResult>
    stop(): Promise<void>
    retry(): Promise<void>
    newConversation(): Promise<void>
  }
  /** The user's JumpCloud portal apps (only when the tenant has a `portal`). */
  apps: {
    /** The list as it stands; loads it first if needed, or again with `refresh`. */
    get(refresh?: boolean): Promise<AppsState>
    /** Connects Desktop Assist to the portal, in the browser; progress via onAppsState. */
    signIn(): Promise<void>
    cancelSignIn(): Promise<void>
    /** Opens the app in the default browser (signed in through the portal). */
    open(id: string): Promise<boolean>
    openPortal(): Promise<void>
  }
  /** Starts Desktop Assist's uninstaller and quits (installed copies only). */
  uninstall(): Promise<UninstallResult>
  onModeChanged(callback: (mode: Mode) => void): () => void
  onCornerChanged(callback: (corner: Corner) => void): () => void
  /** The panel was just shown with click-through reset; `pointer` is where the mouse is now. */
  onClickThroughReset(callback: (pointer: Point) => void): () => void
  onAuthStatus(callback: (status: AuthStatus) => void): () => void
  /** A message was added or changed (streamed text arrives this way). */
  onChatMessage(callback: (message: ChatMessage) => void): () => void
  onChatReset(callback: () => void): () => void
  onAppsState(callback: (state: AppsState) => void): () => void
}
```

<!-- /code -->

The API a page sees as `window.assist`. Each method maps onto one channel in `IPC`. Related calls
are grouped into nested objects (`notes`, `screenshots`, `settings`, `auth`, `claudeDesktop`,
`chat`, `apps`), which is only for readability. Every page gets all of them, but `auth` and
`chat` only work with the built-in chat, `claudeDesktop` only with Claude Desktop, and `apps`
only when the tenant has a portal; the panel checks `branding` to know which to call.

- `getState(): Promise<AppState>`: called once when a page loads (`useAssistState()`).
- `bubbleClick(): void`: this and the next three are fire-and-forget calls into
  `BubbleController` (`clickBubble()`, `startDrag()`, `endDrag()`, `collapse()`).
- `setInteractive(interactive: boolean): void`: the heart of click-through. `useClickThrough()`
  sends `true` when the pointer moves onto an element marked `data-hit` and `false` when it
  leaves; the main process then turns mouse input on or off for that window with
  `setIgnoreMouseEvents()`.
- `invokeAction(id: CommandActionId): Promise<ActionResult>`: runs a command action; only command
  ids are allowed (see `CommandActionId`).
- `openExternal(url: string): Promise<void>`: opens a link from one of Claude's replies. The main
  process only accepts web (`http:`, `https:`) and email (`mailto:`) addresses (`ExternalUrl` in
  `src/main/ipc.ts`).
- `setText(text: string): void`: sent on every keystroke, so it doesn't wait for an answer.
  `NotesStore` saves the draft to disk about half a second after typing stops.
- `clear(): Promise<Notes>`: empties the text and removes the attachments from the draft, and
  returns the empty draft. The screenshot files themselves stay in the folder.
- `thumbnail(path: string): Promise<string | null>`: returns the preview as a _data URL_, the
  image encoded into a `data:image/...` string. The page can't load files from disk itself; its
  Content-Security-Policy (`index.html`) only allows images from the app or from data URLs.
- `setEffort(effort: Effort)`, `setAutoSend(autoSend: boolean)`: save the response style (built-in
  chat) or "Send in Claude automatically" (Claude Desktop), and return the settings as they now
  are, like the other `settings` calls. `setFavoriteApp(id, favorite)` does the same for a star
  in the Apps list.
- `signIn(): Promise<void>`: resolves straight away, because signing in happens in the browser
  and can take minutes. Progress arrives through `onAuthStatus`.
- `ask(text: string): Promise<AskResult>`: like `chat.send()`, only the text is passed; the main
  process takes the screenshots from its own copy of the draft. It resolves once Claude Desktop
  has been asked to open; sending the question there carries on in the main process afterwards,
  and there's no reply to wait for, because the conversation carries on in Claude Desktop.
- `isInstalled(): Promise<boolean>`: whether anything on the PC opens `claude://` links. The
  panel asks each time it opens, to warn before anything is typed.
- `send(text: string): Promise<SendResult>`: sends the draft. The promise only says whether it
  was accepted; Claude's reply streams in through `onChatMessage`.
- `get(refresh?: boolean): Promise<AppsState>`: the Apps list. The first call loads it (which can
  take a few seconds), later ones return the list already loaded unless `refresh` is true.
- `apps.signIn(): Promise<void>`: like `auth.signIn()`, resolves straight away; connecting happens
  in the browser and progress arrives through `onAppsState`.
- `open(id: string): Promise<boolean>`: asks the main process to open the app in the browser.
  `false` means it had no link for it.
- `uninstall(): Promise<UninstallResult>`: starts the uninstaller; the app quits if it worked.
- `onModeChanged(callback: (mode: Mode) => void): () => void`: each `on...` method starts
  listening and returns a function that stops. That suits React's `useEffect`, whose cleanup
  step can simply call it (see `useAssistState()`).
- `onClickThroughReset(callback: (pointer: Point) => void): () => void`: `pointer` is the mouse
  position relative to the panel window, so the page can decide at once whether the pointer is
  over real UI.

## `src/shared/format.ts`: screenshot labels

One small text helper. `AttachmentChip.tsx` uses it for the label on each screenshot chip in the
text box. It has no Electron or React code in it, and `tests/format.test.ts` tests it directly.
The file is short, so here it is whole.

### `screenshotLabel()`

<!-- code: apps/desktop/src/shared/format.ts -->

[`src/shared/format.ts`, lines 1–16](../../apps/desktop/src/shared/format.ts#L1-L16)

```ts
const SCREENSHOT_NAME =
  /^Screenshot (\d{4})-(\d{2})-(\d{2}) (\d{2})(\d{2})(\d{2})(?: \(\d+\))?\.png$/
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Short chip label for a screenshot file: "Screenshot 14:03" if it was taken today, otherwise
 * "Screenshot 2 Oct 14:03". Unrecognised names are shown as-is.
 */
export function screenshotLabel(fileName: string, now: Date = new Date()): string {
  const match = SCREENSHOT_NAME.exec(fileName)
  if (!match) return fileName
  const [, year, month, day, hour, minute] = match.map(Number) as number[]
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  const today = year === now.getFullYear() && month === now.getMonth() + 1 && day === now.getDate()
  return today ? `Screenshot ${time}` : `Screenshot ${day} ${MONTHS[(month ?? 1) - 1]} ${time}`
}
```

<!-- /code -->

Turns a screenshot's file name into a short label: just the time for today's screenshots, the
date and time for older ones.

- `SCREENSHOT_NAME =`: matches the names that `screenshotFileName()` in
  `src/main/screenshots/files.ts` creates, such as `Screenshot 2026-10-02 140311.png`. The
  parentheses capture year, month, day, hour, minute and second. `(?: \(\d+\))?` allows an
  optional ` (2)` for a second capture in the same second, without capturing the number.
- `now: Date = new Date()`: a default parameter. The tests pass a fixed date so the result
  doesn't depend on the day they run.
- `if (!match) return fileName`: any other name is shown as it is.
- `const [, year, month, day, hour, minute] = match.map(Number)`: turns the captured text into
  numbers. The leading comma skips `match[0]`, the whole name; the seconds are captured but not
  used.
- `month === now.getMonth() + 1`: JavaScript months count from 0, file names from 1. Both the
  file name and `now` use the local clock, so "today" is the user's today.
- `(month ?? 1) - 1`: the regex guarantees `month` is there, but this project turns on
  TypeScript's `noUncheckedIndexedAccess` setting, which treats every array element as possibly
  missing. The `?? 1` fallback satisfies the compiler.

## `src/shared/claudeDesktop.ts`: where to get Claude Desktop

One constant for the Claude Desktop hand-over. The rest of that feature is in the main process
(`src/main/claudeDesktop.ts`, see [Claude Desktop](9-claude-desktop.md)), but a page can't import
main-process files, so the one value the panel needs lives here.

### `CLAUDE_DOWNLOAD_PAGE`

<!-- code: apps/desktop/src/shared/claudeDesktop.ts -->

[`src/shared/claudeDesktop.ts`, lines 1–4](../../apps/desktop/src/shared/claudeDesktop.ts#L1-L4)

```ts
// Claude Desktop, which questions are handed to when the tenant's `chatApp` is `claude-desktop`.

/** Where people get Claude Desktop when it isn't installed (IT may install it for them instead). */
export const CLAUDE_DOWNLOAD_PAGE = 'https://claude.com/download'
```

<!-- /code -->

Anthropic's download page for Claude Desktop. When the panel finds that Claude Desktop isn't
installed, it shows a banner with a **Download** button that opens this page in the browser
(`window.assist.openExternal()`, which allows `https:` links). On company PCs IT may install
Claude Desktop instead, which is why the banner suggests asking IT first.

## `src/shared/apps.ts`: the order of the Apps list

One small function about the Apps list that doesn't need the main process. It's in `src/shared`
so `tests/portalApps.test.ts` can test it without a page.

### `orderApps()`

<!-- code: apps/desktop/src/shared/apps.ts#orderApps -->

[`src/shared/apps.ts`, lines 3–13](../../apps/desktop/src/shared/apps.ts#L3-L13)

```ts
/**
 * The apps in the order the Apps list shows them: the starred ones first, then the rest, each
 * keeping the order they came in (by name).
 */
export function orderApps(apps: PortalApp[], favorites: string[]): PortalApp[] {
  const starred = new Set(favorites)
  return [
    ...apps.filter((app) => starred.has(app.id)),
    ...apps.filter((app) => !starred.has(app.id)),
  ]
}
```

<!-- /code -->

The order `AppsList` shows the apps in: the starred ones first, then the rest. The main process
already sorts the list by name, and both groups keep that order, so the starred apps are
alphabetical among themselves too.

- `new Set(favorites)`: a `Set` answers "is this ID starred?" (`has`) without searching the whole
  list each time.
- `[...apps.filter(...), ...apps.filter(...)]`: the starred apps, then the others, joined into one
  new list. The list it was given isn't changed.

## `src/preload/index.ts`: the bridge to the page

A _preload script_ runs inside each window (bubble and panel) just before the page's own code. This
one builds `window.assist` and is the only route from a page to the main process. To see why it
exists, look at how the windows are created (`webPreferences` in `src/main/bubble/windows.ts`):

- `contextIsolation: true`: the preload runs in its own JavaScript "world", with its own globals,
  separate from the page's. The page can't see or tamper with the preload's variables, including
  its `ipcRenderer`.
- `nodeIntegration: false`: the page has no Node.js at all: no `require`, no file access.
- `sandbox: true`: even the preload gets only a small part of Electron and Node, and can't load
  other files at runtime. So electron-vite bundles `@shared/ipc` into the built
  `out/preload/index.js`, which contains its own copy of `IPC`.

**contextBridge** is Electron's way across the wall between the two worlds: it copies a chosen
object into the page's world. The page therefore gets a fixed list of functions, each sending
one specific channel with only the arguments it names. It never gets `ipcRenderer` itself, which
would let it send anything on any channel.

### `subscribe()`

<!-- code: apps/desktop/src/preload/index.ts#subscribe -->

[`src/preload/index.ts`, lines 4–10](../../apps/desktop/src/preload/index.ts#L4-L10)

```ts
function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}
```

<!-- /code -->

Starts listening on a channel the main process pushes to, and returns a function that stops
listening. Every `on...` method in `api` uses it.

- `const listener = (_event: IpcRendererEvent, payload: T) => callback(payload)`: Electron calls
  a listener with an event object first. That object's `sender` is the `ipcRenderer` itself, so
  passing it on would hand the page the very thing the isolation hides. The wrapper passes only
  the payload.
- `ipcRenderer.removeListener(channel, listener)`: removing a listener needs the exact function
  that was added. The returned closure keeps hold of `listener`, so the page never has to hand
  its callback back to unsubscribe.

### `api`

<!-- code: apps/desktop/src/preload/index.ts#api -->

[`src/preload/index.ts`, lines 12–72](../../apps/desktop/src/preload/index.ts#L12-L72)

```ts
const api: AssistApi = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  bubbleClick: () => ipcRenderer.send(IPC.bubbleClick),
  bubbleDragStart: () => ipcRenderer.send(IPC.bubbleDragStart),
  bubbleDragEnd: () => ipcRenderer.send(IPC.bubbleDragEnd),
  collapse: () => ipcRenderer.send(IPC.collapse),
  setInteractive: (interactive) => ipcRenderer.send(IPC.setInteractive, interactive),
  invokeAction: (id) => ipcRenderer.invoke(IPC.invokeAction, id),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  copyText: (text) => ipcRenderer.invoke(IPC.copyText, text),
  notes: {
    setText: (text) => ipcRenderer.send(IPC.notesSetText, text),
    attachLatestScreenshot: () => ipcRenderer.invoke(IPC.notesAttachLatest),
    removeAttachment: (id) => ipcRenderer.invoke(IPC.notesRemoveAttachment, id),
    clear: () => ipcRenderer.invoke(IPC.notesClear),
  },
  screenshots: {
    thumbnail: (path) => ipcRenderer.invoke(IPC.screenshotThumbnail, path),
    open: (path) => ipcRenderer.invoke(IPC.screenshotOpen, path),
    openFolder: () => ipcRenderer.invoke(IPC.screenshotsOpenFolder),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    setAutoStart: (enabled) => ipcRenderer.invoke(IPC.settingsSetAutoStart, enabled),
    setEffort: (effort) => ipcRenderer.invoke(IPC.settingsSetEffort, effort),
    setAutoSend: (autoSend) => ipcRenderer.invoke(IPC.settingsSetAutoSend, autoSend),
    setFavoriteApp: (id, favorite) =>
      ipcRenderer.invoke(IPC.settingsSetFavoriteApp, { id, favorite }),
  },
  auth: {
    signIn: () => ipcRenderer.invoke(IPC.authSignIn),
    cancel: () => ipcRenderer.invoke(IPC.authCancel),
    signOut: () => ipcRenderer.invoke(IPC.authSignOut),
    retry: () => ipcRenderer.invoke(IPC.authRetry),
  },
  claudeDesktop: {
    ask: (text) => ipcRenderer.invoke(IPC.claudeDesktopAsk, text),
    isInstalled: () => ipcRenderer.invoke(IPC.claudeDesktopInstalled),
  },
  chat: {
    send: (text) => ipcRenderer.invoke(IPC.chatSend, text),
    stop: () => ipcRenderer.invoke(IPC.chatStop),
    retry: () => ipcRenderer.invoke(IPC.chatRetry),
    newConversation: () => ipcRenderer.invoke(IPC.chatNew),
  },
  apps: {
    get: (refresh) => ipcRenderer.invoke(IPC.appsGet, refresh ?? false),
    signIn: () => ipcRenderer.invoke(IPC.appsSignIn),
    cancelSignIn: () => ipcRenderer.invoke(IPC.appsCancelSignIn),
    open: (id) => ipcRenderer.invoke(IPC.appsOpen, id),
    openPortal: () => ipcRenderer.invoke(IPC.appsOpenPortal),
  },
  uninstall: () => ipcRenderer.invoke(IPC.appUninstall),
  onModeChanged: (callback) => subscribe(IPC.modeChanged, callback),
  onCornerChanged: (callback) => subscribe(IPC.cornerChanged, callback),
  onClickThroughReset: (callback) => subscribe(IPC.clickThroughReset, callback),
  onAuthStatus: (callback) => subscribe(IPC.authStatus, callback),
  onChatMessage: (callback) => subscribe(IPC.chatMessage, callback),
  onChatReset: (callback) => subscribe(IPC.chatReset, () => callback()),
  onAppsState: (callback) => subscribe(IPC.appsState, callback),
}
```

<!-- /code -->

The implementation of `AssistApi`: one line per method, each sending its channel from `IPC`.

- `const api: AssistApi`: the type annotation makes TypeScript check that every method exists
  with the right parameters, and lets it infer parameter types (for example, `interactive` is a
  `boolean`). It can't check the answers: `ipcRenderer.invoke()` returns `Promise<any>`, so the
  main process's handlers must return what `AssistApi` promises by agreement.
- `ipcRenderer.invoke(IPC.getState)`: request and reply. Nothing extra is passed, which matters
  because the main process checks that no-argument channels really receive no argument
  (`NoArgs` in `src/main/ipc.ts`).
- `ipcRenderer.send(IPC.bubbleClick)`: fire and forget, as for the other `void` methods.
- `subscribe(IPC.chatReset, () => callback())`: the reset carries no data, so the page's callback
  is called with no arguments, matching its `() => void` type.
- `ipcRenderer.invoke(IPC.appsGet, refresh ?? false)`: `refresh` is optional for the page, but
  the main process's check for this channel wants a real `true` or `false`, so a missing one is
  sent as `false`.
- `ipcRenderer.invoke(IPC.settingsSetFavoriteApp, { id, favorite })`: a request carries one
  argument, checked by one schema in the main process, so the two values go as one object.

### `contextBridge.exposeInMainWorld()`

The last line of the file, `contextBridge.exposeInMainWorld('assist', api)`, publishes `api` to
the page as `window.assist` ("main world" is Electron's name for the page's own world). From then
on the renderer calls `window.assist.chat.send(...)` and so on, and `src/renderer/src/env.d.ts`
declares `window.assist` as an `AssistApi` so those calls are type-checked too.
