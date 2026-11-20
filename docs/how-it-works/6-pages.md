## 23. preload/index.ts — the bridge

**File:** `src/preload/index.ts` · **Job:** give each page `window.assist`, and nothing else.
**Used by:** every page.

The preload runs inside each page before the page's own code, with just enough of Electron to send
IPC messages. It builds one object of plain functions, typed by `AssistApi`, and puts it on the page's
`window`:

```ts
function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener) // the "stop listening" function
  }
}

const api: AssistApi = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  bubbleClick: (pressedAt) => ipcRenderer.send(IPC.bubbleClick, pressedAt),
  bubblePet: () => ipcRenderer.send(IPC.bubblePet),
  settings: { get: () => ipcRenderer.invoke(IPC.settingsGet), … },
  onPoseChanged: (callback) => subscribe(IPC.poseChanged, callback),
  // … every other request and announcement
}

contextBridge.exposeInMainWorld('assist', api)
```

> **Security**
> `contextBridge` copies the object into the page's world, so the page gets the functions but can't
> reach `ipcRenderer` behind them or send on a channel of its own choosing. The page can only do
> what these functions do, and the main process still checks every one (section 15).

## 24. The pages: views, hooks and components

**Folder:** `src/renderer/src/` · **Job:** draw everything you see, and turn clicks and typing into
requests. **Used by:** the windows (each loads `index.html?view=…`).

`main.tsx` reads `view` from the page's address and shows the matching view:

| View              | Page              | What it draws                                                                                |
| ----------------- | ----------------- | -------------------------------------------------------------------------------------------- |
| `bubble`          | `BubbleView`      | her: a button the size of her window, with `Character` in it                                 |
| `panel` (default) | `PanelView`       | the icons (`ActionStack`) and the card: text box, Apps, Jira, service desk, settings, spells |
| `clones`          | `ClonesView`      | ten of her, wandering the taskbar (`lib/clones.ts`)                                          |
| `vision`          | `VisionView`      | a light falling on her, and the company's logo coming down it                                |
| `spell`           | `SpellView`       | a spell, as pixel art on a canvas (`lib/spells/`, `lib/spellArt.ts`)                         |
| `screensaver`     | `ScreenSaverView` | the fade to white, then the sunset or the falling stars (`lib/screensaver/`)                 |
| `familiar`        | `FamiliarView`    | her black cat (`character/cat.ts`, moved by `lib/familiar.ts`)                               |
| `trick`           | `TrickView`       | the taskbar's icons out of their buttons, and covers over the buttons                        |
| `battle`          | `BattleView`      | the monsters of her battle, her bolts and their bursts (`shared/battle.ts`)                  |

The passive pages are told everything in their address (where she is, her size, when it began) and
then draw on their own, usually on a `<canvas>`, a frame at a time with `requestAnimationFrame`.
`TrickView` is the exception: a trick's icons are too big for an address, so it asks for them once
(`trickReady`) and the main process sends them back to that page alone.

### Hooks

- **`useAssistState()`** keeps the app state live: it subscribes to every announcement first, then
  fetches the state, so a change that arrives meanwhile isn't lost.
- **`useClickThrough()`** makes the panel's see-through areas let clicks through (below).
- `useFitInWindow()` keeps a menu inside the window; `useThumbnail()` loads a screenshot's preview;
  `useToast()` shows a message for a moment.

#### `useClickThrough()`

The panel window is a big rectangle, mostly see-through, and clicks on its empty parts should reach
whatever is underneath. So the main process keeps the window **ignoring the mouse** (while still
passing on pointer movement), and this hook switches the mouse back on only while the pointer is over
something real, any element marked `data-hit`:

```ts
const hitAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest('[data-hit]') != null
const onMove = (event: MouseEvent) => {
  pointer = { x: event.clientX, y: event.clientY }
  // While a button is held (selecting text, say) keep mouse input on.
  if (event.buttons !== 0) return
  set(hitAt(pointer.x, pointer.y)) // tells the main process only when it changes
}
```

> **Good to know**
> There's deliberately no "pointer left the window" handling. Switching mouse input on makes Windows
> send a stale "left" message, and reacting to it left the window click-through while the pointer sat
> on a button. A window with input on gets a real move as soon as the pointer is over an empty area,
> which switches it back off.

### BubbleView

Her page is one `<button>` filling her window. It turns the pointer into the requests you've met:
press and move more than 5 pixels for `bubbleDragStart()`; release for `bubbleDragEnd()`; a click
for `bubbleClick(pressedAt)`; the second click of a double-click for `bubblePet()`. It also tracks
whether the main button is down, for the drag watchdog (section 16); listens for her gaze while she
watches the pointer; clips her while she peeks round a window; keeps the glow round her while the
pointer's over her; and waits for word that her window is
showing before she forms out of white motes, so she never flashes up whole first.

> **Good to know**
> The glow used to be CSS's `:hover`, and it could stick: a page hears about the pointer only when the
> pointer moves over its window, so when her window moved out from under a still pointer (she walked
> off, fell after a drag, hid for the screen saver), nothing told the page the pointer had gone. Now
> the page keeps the glow itself, and while it's on, asks the main process every 250 ms whether the
> pointer really is over her window (`bubblePointerInside()`, which checks Windows' own pointer
> position against her window).

### Components

| Component                                               | What it is                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `ActionStack`                                           | the icons above her, from `tenant.json`'s `actions`; a dot on one with something new             |
| `ChatBox`                                               | the speech-bubble text box, its tail pointing at her mouth; Open beside issue keys; Report to IT |
| `MessageList`, `Markdown`                               | the built-in chat's messages, Claude's replies rendered as Markdown                              |
| `AppsList`                                              | the Apps list: logos, stars, a spinner while one opens                                           |
| `JiraPage`, `IssueView`, `ServiceDeskPage`, `PageParts` | Jira's notifications and search, one issue, and the service desk                                 |
| `SettingsMenu`, `SizeControl`, `RobeColorControl`       | the gear's menu: light mode, size, robe colour, the switches, updates, uninstall                 |
| `SpellsMenu`                                            | the wand's menu of eleven spells                                                                 |
| `SignInPanel`, `AttachmentChip`                         | Sign in with JumpCloud (built-in chat); a screenshot attached to the question                    |
| `Character`                                             | her, drawn from her frames (below)                                                               |

## 25. character/ — her pixel art

**Folder:** `src/renderer/src/character/` · **Job:** draw her, every frame of every pose, from code.
**Used by:** `Character` (her, her clones), `ScreenSaverView` (her from behind), `FamiliarView` (the cat).

There are no image files of her. Every frame is drawn by code on a 96 × 96 grid (plus 8 rows of
headroom), one letter per pixel, and each letter is a colour. It works in three layers:

| File        | Job                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `raster.ts` | A tiny pixel-art drawing kit: shapes onto a grid, then shaded and outlined the way pixel artists do by hand (`Layer`, `Canvas.ink`). |
| `rig.ts`    | Her skeleton and everything that hangs on it. `draw(pose)` turns one `Pose` into one frame.                                          |
| `props/`    | The things drawn round her (toys, spells' effects, visitors, sparkles): a painter each, run by `draw()` in order (`PROPS`).          |
| `moves/`    | Her animations: each pose's move, its frames made by blending `Pose`s over time, a file for each kind, all listed in `MOVES`.        |
| `sprite.ts` | Puts them together: `framesOf(pose, facing)`, `shownFrames()` for her page, `framePaths()`; and `palette.ts`, her colours.           |

#### `Pose` and `draw(pose)` (in `rig.ts`)

A `Pose` says which way she's seen from (front, diagonal or side), where her hips are, how she leans,
the angles of her arms and legs, her face, and how far through any effect she is (a flame in her hand,
confetti, hearts, a scroll). Angles are radians from hanging straight down:

```ts
export interface Pose {
  view: 'front' | 'diagonal' | 'side'
  x?: number // her hips' offset (pixels; negative y is up)
  y?: number
  lean?: number // her body tipped toward the way she faces (radians)
  tilt?: number // her head
  arms?: [Arm, Arm] // each { shoulder, elbow }
  legs?: [Leg, Leg] // each { hip, knee }
  face?: Face // 'neutral' | 'blink' | 'happy' | 'surprised' | 'yawn' | …
  // … and effects: flame, frost, confetti, hearts, scroll, zzz, …
}
```

`draw()` places the bones from those angles, draws each body part into a `Layer` of materials (hair,
skin, robe, hat, boots …), and `ink()`s them on in order, back to front. Each material has a **ramp**
of palette letters (outline, shade, base, light), and `ink()` shades the side away from the light
(which comes from the upper left) and outlines each shape in a darker shade of its own colour.

> **Good to know**
> Her legs are drawn first and her robe over them, so anything of a leg outside the robe shows.
> Crouching, her knees go out to the sides, and sitting, they're raised above her hips: both showed
> her stockings beside her robe, as she sat down and after a hard landing. So each leg is clipped
> to below the robe's hem before it's inked (`drawLeg()` is handed the hem's line): under a long
> robe, nothing of her legs ever shows above it.

#### Her toys

Five of her habits summon a toy into her hand in a sparkle and send it away in a twinkle: a yo-yo
(`yoyo`), a spinning top (`spinTop`), a deck of cards (`deck`), a paper plane (`plane`) and a bouncy
ball (`ball`), each a `Pose` field from 0 to 1 through the habit. Each is drawn by a painter in
`props/toys.ts`, beside its picture and its timetable (`YOYO`, `SPIN_TOP`, `DECK`, `PLANE`, `BALL`:
when it appears, what it does, when it goes), which the habit's move in `moves/toys.ts` reads too, so her hand moves with the toy: a flick as each yo-yo drop
starts, a push as the ball leaves her hand. Most are held out to her side, against the background
rather than her purple robe, where small toys are easy to miss. The paper plane flies a loop round
her, and on the far side it's drawn only where nothing of her is (`set(…, '.')`), so it passes
behind her.

The `spirit` habit works the same way with a visitor instead of a toy: a little spirit (a round
mint body, dark dot eyes, pale leaf wings beating in two frames) appears beside her, flies to her
and lands on her palm (hearts), loops round her head (behind her on the far side), hovers while
they wave to each other, and fades (`props/visitors.ts`, its timetable `SPIRIT`). In her battle,
`charge` is a glow in her hand: a glint, a ball, and a sparkle as each bolt leaves it.

Every painter is handed a `Scene` once she's drawn: where her hands, head and hips are, and how to
put pixels down (`set`, `canvas.stamp`). `PROPS` in `props/index.ts` lists them in the order they're
drawn, each over the ones before.

#### Animations (in `moves/`)

A pose's animation is a list of keys, each a `Pose` and how long it shows. Two helpers make most of
them: `hold(pose, ms)`, one key, and `tween(a, b, ms)`, which blends from `a` to `b` in 40 ms frames
with a smooth start and stop. The hop, for example:

```ts
return [
  ...hold(FRONT, 60),
  ...tween(FRONT, low, 140), // crouch
  ...tween(low, launch, 80), // spring up, arms high
  ...tween(launch, rise, 90),
  ...tween(rise, apex, 120),
  ...tween(apex, float, 100), // a moment at the top, hair and robe lifting
  ...tween(float, fall, 80),
  ...tween(fall, touch, 70),
  ...tween(touch, land, 130), // knees bend as she lands
  ...tween(land, recover, 110),
  ...tween(recover, FRONT, 140),
  ...hold(FRONT, 80),
]
```

Each file in `moves/` has the moves of one kind (`everyday.ts`, `charms.ts`, `magic.ts`, `toys.ts`,
`visitors.ts`, `reactions.ts`, `performances.ts` …, the helpers in `kit.ts`) and lists them at its
bottom: each pose's `Move`, `once(hop)` for one that plays once, `repeating(idle)` for one that goes
round. `MOVES` (`moves/index.ts`) gathers them, and TypeScript won't build it without a move for every
pose. `framesOf(pose, facing)` draws a pose's frames the first time they're asked for and keeps
them. She's always drawn facing right; facing left is the same frames mirrored,
and a pose whose name ends in `-left` or `-right` faces that way whatever she's facing.

#### `framePaths(rows)` and `Character`

A frame is about 10,000 pixels (96 × 104), far too many elements to draw one by one. `framePaths()` turns each
run of same-coloured pixels along a row into a rectangle, carried on down the rows below for as long
as they have the same run, and all of one colour into one SVG `path`: a frame becomes a few dozen
elements. `Character` shows them, a frame at a time, each for its own time; with Windows'
reduced-motion setting on, just the first frame. It draws every pose's frames in the background, one
pose every 50 ms after start-up, so starting a pose never stutters, and it keeps only their paths
(`shownFrames()`), not the frames' letters: all her poses come to over 4,000 frames.

```ts
rows.forEach((row, y) => {
  const runs = new Map<string, number>() // this row's runs: colour|start|end → the row it began on
  // … each run of one colour along the row, carried on from the row above if it had the same run
  for (const [run, top] of open) if (!runs.has(run)) close(run, top, y) // ended: one rectangle
  open = runs
})
```

> **Why it's built this way**
> Each letter maps to a CSS class (`PALETTE`), and `character.css` gives each class its colour. So
> her robe and hat are just CSS: they're mixed from one variable, `--color-robe` (the company's
> colour, or the one picked in Settings), the hat a darker mix than the robe. Changing her robe's
> colour redraws nothing; the browser simply repaints.

> **Try it yourself**
> In `moves/everyday.ts`, change one number in the hop (say `tween(apex, float, 100)` to `600`) and run
> `npm run dev`. Wait for a hop: she now hangs in the air at the top. Then run `npx vitest run
tests/sprite.test.ts`, which checks every habit's frames last exactly as long as `FIDGET_MS` says,
> and see it catch the change.

#### No hat

Settings → **No hat** takes her hat off in everything she does. `setHat(false)` in `sprite.ts` tells
the rig (`wearHat()`) and forgets every frame drawn so far, so they're drawn again without it. From
the front and side the rig simply leaves the hat out; her hair already covers the top of her head.
Three-quarter on, she's a hand-drawn picture with the hat in it, so there's a second picture,
`DIAGONAL_HATLESS`, with the top of her head drawn instead: her silver hair rounding over her crown,
lit from the upper left, and her fringe without the brim's shadow across it. `Character` calls
`setHat()` before asking for any frame. Her page learns of the setting from `assist:hat-changed`,
her clones' and the screen saver's from `hat=off` in their address.

#### `cat.ts`

Her familiar, drawn the same way on a 32-pixel grid: a black cat with gold eyes, in six poses (sit,
walk, loaf, groom, hop, and the puff of smoke it arrives and leaves in).
