# The bubble: windows, layout, clones and the state machine

[← Code Guide](CODE_GUIDE.md)

The bubble is the always-on-top character that stands on the Windows taskbar near one of the two
bottom corners of the screen; clicking it opens the panel (the chat card and the action icons).
It started out as a round logo in a corner, and the code still calls it the bubble: the window,
the modes and the IPC channels all kept the name. The character and the panel each live in their
own transparent, frameless _overlay window_, created in `windows.ts`. `BubbleController` decides
what the character is doing, and how big she is, and moves, sizes, shows and hides the two windows
to match, using the pure maths in `layout.ts` (where things go) and `wander.ts` (what the
character does on its own, and how it falls). Two more overlay windows come and go: `clones.ts`
opens and closes one for her clones (the Clones action), and `vision.ts` one for the light and the
logo of her `vision` habit. The bubble's page draws the figure and animates it
(`Character.tsx`, with pixel art drawn by code in `src/renderer/src/character/`; see
[The UI components](8-renderer-components.md)).

The controller is always in exactly one _mode_ (the `Mode` type in `src/shared/types.ts`). Every
change is broadcast to both pages, which draw themselves to match:

- `collapsed`: only the character shows, standing on the taskbar. The app starts here. Strolling
  and fidgeting on its own (see below) all happen in this mode.
- `expanded`: the panel is open beside the character.
- `dragging`: the character dangles from the mouse pointer.
- `returning`: the character falls onto the taskbar after a drag.
- `capturing`: both windows are hidden while a screenshot is taken.

What moves the controller from one mode to another:

- `collapsed` → `expanded`: a click on the character (`clickBubble()`), or the tray icon,
  launching the app a second time, or finishing sign-in in the browser (all `expand()`).
- `expanded` → `collapsed`: a click on the character, Esc in the panel (`collapse()`), handing a
  question to Claude Desktop, opening an app from the Apps list, the IT service desk or an IT
  request's form on the portal, the Clones action (also `collapse()`), or clicking
  somewhere else so the panel loses focus (`panelBlurred()`, except in the panel's first 400 ms).
- `collapsed` or `expanded` → `dragging` → `returning`: pressing and moving the character
  (`startDrag()`), then letting go (`endDrag()`), after which it falls (`fall()`).
- `returning` → `collapsed`: the fall finishes (`settle()`). If something asked to open the panel
  on the way, it carries straight on to `expanded`. A fall that ends far from the character's
  corner is followed by a walk back.
- `expanded` → `capturing` → `expanded`: the screenshot action (`whileHidden()`).

Beside the mode, the controller keeps the character's _pose_ (the `Pose` type in
`src/shared/character.ts`): what the figure is doing, for the bubble's page to animate. The mode
is what the app is doing; the pose is only how the figure looks. While the character is moved
about (`dragging`, `returning`) the pose is `dragged`, dangling; otherwise it's
`idle`, unless the character is doing something on its own. Every pose change is broadcast too
(`IPC.poseChanged`).

**Where it stands.** The character's place is kept as an _anchor_ (a display and one of its two
bottom corners) and an _inset_: how far along the taskbar from that corner it stands, in DIPs.
An inset of 0 is right in the corner, and insets grow toward the middle of the screen, so from the
bottom-right corner a bigger inset is further left, and from the bottom-left corner further right.
Measuring from the corner, rather than keeping an `x`, means the same numbers work in either
corner and on any display, and a resized screen only has to shorten the inset if it no longer
fits. Near its corner is the _zone_, the first 240 DIPs along the taskbar at her usual size (more
when she's bigger; see `zone()`), where the character strolls about.

**Her size.** The character comes in nine sizes, from half her usual size to six times it
(`CHARACTER_SIZES` in `src/shared/geometry.ts`). A size is a _scale_: a multiple of her usual size,
so 1 is the size she was drawn at, and 2 is twice as tall and twice as wide. The user picks one in
the size menu (the Size action), and the controller keeps two numbers: the size chosen, which
is saved in `preferences.json`, and the size she is, which is the size chosen or, if that wouldn't
fit her display, the biggest that does (`largestSize()` in `geometry.ts`: her panel, with every
action icon, must still fit on the screen, so the size menu can always be reached to make her
smaller again). Everything about her grows with her: her box and its padding, so her window, and
the panel's offsets from its corner (`bubbleMetrics()` and `panelLayout()` in `geometry.ts`). The
16 DIPs between her and the side of the screen stay the same. Her zone is wider when she's bigger,
and she walks faster. Every change of size, or of the biggest she can be, is broadcast to both
pages (`IPC.sizeChanged`).

**Her clones.** The Clones action puts ten copies of her on the taskbar of her display for thirty
seconds (`CLONES` in `src/shared/character.ts`), each wandering up and down on its own. They're
only pictures: they live in a window of their own along the bottom of the screen, which never takes
the mouse or the focus, and they come and go without changing the mode. All `BubbleController` does
for them is say where she stands (`standing`); `clones.ts` opens and closes their window, and the
page in it moves them (`ClonesView`, see [The pages](7-renderer-pages.md)).

**Left alone.** While `collapsed`, the character has a life of its own. Every 8 to 20 seconds it
walks somewhere else in its zone (the pose `walk-left` or `walk-right`, while the controller moves
its window along the taskbar a frame at a time). Once nobody has done anything with it for 30
seconds, more often than not it does one of its ten fidgets instead (a hop, a wave, a stretch, a
sip of tea, a vision, reading its spellbook, a little spell, levitating over a magic circle, a sit
on the taskbar, or a glance about), never the same one twice in a row. In the vision, a light
shines down from the top of the screen and the company's logo comes down it to hover over her head
while she looks up at it; the light and the logo are drawn in a window of their own above her
(`vision.ts`, below). None of this changes the mode, and every change of mode counts as the user doing something: it stops whatever the
character was doing on its own, right where it is, and starts the 30 seconds again (see
`setMode()`).

---

## `src/main/bubble/BubbleController.ts`: the state machine

This file holds the `BubbleController` class and the small interfaces it is built from. The
controller owns the mode, the character's pose, its position, its _anchor_ (which display, and
which bottom corner of it, the character lives near) and its inset along the taskbar from that
corner. Each public method is a request such as "the bubble was clicked" or "a drag started", and
the controller decides what that means in the current mode. What the character does on its own
is driven by the controller's own timer.

Who calls it:

- `src/main/index.ts` creates the one controller in `start()` and wires Electron events to it: the
  panel window's `blur` event to `panelBlurred()`, screen changes to `displayChanged()`, the tray
  icon, a second launch, a finished sign-in and a click on a notification to `expand()`, and
  quitting to `dispose()`. When the pose becomes `vision`, it reads `standing` to open the
  vision's window over her (see `vision.ts` below).
- `src/main/ipc.ts` forwards the pages' requests: the bubble's click and drag (`clickBubble()`,
  `startDrag()`, `endDrag()`), the panel's Esc (`collapse()`) and the size menu's Smaller and
  Bigger (`setScale()`). It also calls `collapse()` after handing a question to Claude Desktop
  (from the text box, or about a Jira issue), opening an app from the Apps list, and opening an IT
  request's form or the user's requests on the service desk portal.
- `src/main/actions.ts` calls `whileHidden()` for the screenshot icon, `collapse()` once the IT
  service desk has opened in the browser, and, for the Clones icon, `collapse()` and then
  `standing`, which it hands to `Clones.start()`.

The controller never imports Electron. It drives windows through the `Surface` interface and asks
about screens through the `Displays` interface. `index.ts` passes real ones: the adapters from
`windows.ts`, and `electronDisplays`, a thin wrapper around Electron's `screen` module.
`tests/bubbleController.test.ts` passes a `FakeSurface` that just records its bounds and whether
it's visible, a pretend pair of monitors, and Vitest's fake timers. That way a whole drag and
fall, or a minute of the character wandering about, can be checked in milliseconds without opening
a window.

### `Surface`, `PanelSurface`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#Surface,PanelSurface -->

[`src/main/bubble/BubbleController.ts`, lines 25–34](../../apps/desktop/src/main/bubble/BubbleController.ts#L25-L34)

```ts
/** The parts of a window the controller drives. Electron windows are adapted in windows.ts. */
export interface Surface {
  setBounds(bounds: Rect): void
  show(): void
  hide(): void
}

export interface PanelSurface extends Surface {
  focus(): void
}
```

<!-- /code -->

What the controller needs from a window, and nothing more.

- `setBounds(bounds: Rect)`: moves and sizes the window in one call. `Rect` (from
  `src/shared/geometry.ts`) is `x`, `y`, `width` and `height`, in DIPs (see `DisplayArea` below).
- `show(): void`: what "show" does differs per window. In `windows.ts`, the bubble appears without
  taking focus, and the panel resets its click-through first.
- `interface PanelSurface extends Surface`: a `PanelSurface` has everything a `Surface` has, plus
  `focus()`, so you can type as soon as the panel opens.

### `DisplayArea`, `Displays`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#DisplayArea,Displays -->

[`src/main/bubble/BubbleController.ts`, lines 36–51](../../apps/desktop/src/main/bubble/BubbleController.ts#L36-L51)

```ts
/** One display: its id, its whole screen, and its work area (the screen minus the taskbar). */
export interface DisplayArea {
  id: number
  bounds: Rect
  workArea: Rect
}

/** What the controller needs to know about the screens. Electron's `screen` is adapted in index.ts. */
export interface Displays {
  primary(): DisplayArea
  byId(id: number): DisplayArea | undefined
  /** The display containing `point`, or the closest one. */
  nearest(point: Point): DisplayArea
  /** Where the mouse pointer is. */
  cursor(): Point
}
```

<!-- /code -->

The controller's view of the monitors. Each display has an id (a number Electron assigns), its
`bounds` (the whole screen) and a _work area_: the part of the screen that windows may use, which
is the screen minus the taskbar. The character's window stays inside the work area, with its
bottom edge on the work area's, so the character stands on top of the taskbar rather than in front
of it. Nothing in the controller reads the bounds at the moment.

All coordinates are DIPs (device-independent pixels). Windows scales the desktop up on high-DPI
screens: at 150 % scaling, a 1920×1080 monitor is 1280×720 DIPs. Electron's window and screen
functions all use DIPs, so the bubble is the same visual size on every monitor and none of this
code needs to know the scale factor. With several monitors, all displays share one coordinate
space: the main display's top-left is (0, 0), and a monitor to its left or above it has negative
coordinates. That is why a work area has its own `x` and `y`, and why the layout code always
measures from them.

- `primary()`: the main display. It's the fallback when the character's display has gone.
- `byId(id: number): DisplayArea | undefined`: `undefined` when no connected display has that id,
  for example after a monitor was unplugged.
- `nearest(point: Point)`: the display containing a point, or the closest one if the point is in
  a gap between monitors. Used to decide which display the character was dropped on.
- `cursor()`: where the mouse pointer is, in the same DIP coordinates. Dragging reads it every
  frame.

In `index.ts`, `electronDisplays` implements these four with Electron's `screen` module
(`getPrimaryDisplay()`, `getAllDisplays()` to find one by its id, `getDisplayNearestPoint()` and
`getCursorScreenPoint()`).

### `BubbleAnchor`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleAnchor -->

[`src/main/bubble/BubbleController.ts`, lines 53–57](../../apps/desktop/src/main/bubble/BubbleController.ts#L53-L57)

```ts
/** Where the character lives: near a bottom corner of a particular display. */
export interface BubbleAnchor {
  displayId: number
  corner: Corner
}
```

<!-- /code -->

Which display, and which bottom corner of it, the character lives near. `Corner` (from
`geometry.ts`) is one of `'top-left'`, `'top-right'`, `'bottom-left'` or `'bottom-right'`, but the
controller only ever uses the two bottom ones: a top corner saved by an older version, when the
bubble could rest in any corner, becomes the bottom one below it (see the constructor). Storing a
display and a corner, rather than a pixel position, means the character still lands in the right
place if that display's resolution or taskbar has changed since. Whenever the anchor changes,
`index.ts` saves it to `preferences.json` (`SettingsService.setBubbleAnchor()`), and it passes the
saved one back in at the next start. How far along the taskbar the character stood (its inset) is
not saved, so after a restart it starts right in its corner.

### `BubbleControllerDeps`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleControllerDeps -->

[`src/main/bubble/BubbleController.ts`, lines 59–79](../../apps/desktop/src/main/bubble/BubbleController.ts#L59-L79)

```ts
export interface BubbleControllerDeps {
  bubble: Surface
  panel: PanelSurface
  displays: Displays
  actionCount: number
  /** Where the bubble was last time, if saved. */
  initialAnchor?: BubbleAnchor | null
  /** Her size last time (see CHARACTER_SIZES), if saved. */
  initialScale?: number | null
  onModeChange(mode: Mode): void
  /** The character settled near the other bottom corner or on another display. */
  onAnchorChange(anchor: BubbleAnchor): void
  /** What the character is doing changed (the bubble's page animates it). */
  onPoseChange?(pose: Pose): void
  /** Her size changed, or the biggest she can be on her screen did. */
  onSizeChange?(size: CharacterSize): void
  now?: () => number
  random?: () => number
  /** Things worth a line in the log, such as a click on the bubble that didn't open it. */
  onDiagnostic?: (message: string) => void
}
```

<!-- /code -->

Everything the constructor needs, passed as one object (its _dependencies_).

- `actionCount: number`: how many action icons the tenant has. The panel window's size depends on
  it (`panelWindowSize()` in `geometry.ts`), and so does its position next to the bubble.
- `initialAnchor?: BubbleAnchor | null`: the `?` means the field may be left out; `null` means
  "nothing saved yet". The constructor treats both the same.
- `initialScale?: number | null`: as the comment says, her size last time, if saved
  (`SettingsService.characterScale` in `index.ts`). Left out or `null`, she starts at her usual
  size.
- `onModeChange(mode: Mode): void`: `index.ts` broadcasts the new mode to both pages
  (`IPC.modeChanged`). That's how the panel knows to animate open or closed, and the character's
  shadow knows to take the accent colour while the panel is open.
- `onAnchorChange(anchor: BubbleAnchor): void`: `index.ts` broadcasts the new corner
  (`IPC.cornerChanged`) so the panel can lay itself out to open toward the middle of the screen
  (and the character turns to face that way), and saves the anchor.
- `onPoseChange?(pose: Pose): void`: as the comment says, what the character is doing changed.
  `index.ts` broadcasts the new pose to both pages (`IPC.poseChanged`), and the bubble's page
  animates the character to match (`Character.tsx`). It also opens the vision's light and logo
  when the pose becomes `vision`, and closes them when it changes again (`Vision`, below). The `?`
  makes it optional, so it's called with `?.`, like `onDiagnostic`.
- `onSizeChange?(size: CharacterSize): void`: as the comment says, her size changed, or the
  biggest she can be on her screen did (`CharacterSize` from `geometry.ts` holds both). `index.ts`
  broadcasts it to both pages (`IPC.sizeChanged`): the bubble's page draws her at the new size, and
  the panel moves its pieces out to match and updates the size menu. Optional too.
- `now?: () => number`: a clock, and `random?: () => number` a random-number source. The app
  leaves them out and gets the real ones; tests pass their own so timings, and when and where the
  character wanders, are predictable.
- `onDiagnostic?: (message: string) => void`: a line for the problem log when the character does
  something a user could take for a fault: a click that didn't open the panel, or a blur that
  didn't close it. `index.ts` passes the log. Such reports ("I clicked the bubble and nothing
  happened") are otherwise impossible to look into on someone else's PC.

### Constants

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#FRAME_MS,DEFAULT_CORNER,PANEL_FADE_MS,BLUR_CLICK_GRACE_MS,PRESS_SLACK_MS,OPEN_BLUR_GRACE_MS,HIDE_SETTLE_MS -->

[`src/main/bubble/BubbleController.ts`, lines 81–101](../../apps/desktop/src/main/bubble/BubbleController.ts#L81-L101)

```ts
const FRAME_MS = 16

const DEFAULT_CORNER: Corner = 'bottom-right'

/** Matches the panel's fade-out in the renderer, so the window hides once it's invisible. */
export const PANEL_FADE_MS = 150

/**
 * Clicking the bubble while the panel is open blurs the panel as the button goes down (the bubble
 * takes the focus), so the panel has already closed when the click arrives. When the click says
 * when it was pressed, a panel that closed after that press (give or take this much) closed
 * because of it, and stays closed. Without that time, a click this soon after a blur-collapse is
 * taken to be the same gesture.
 */
export const BLUR_CLICK_GRACE_MS = 300

export const PRESS_SLACK_MS = 50

/**
 * A blur this soon after the panel opened doesn't close it. Another app can take the focus back
 * just as the panel opens (Claude Desktop, say, right after a question was handed to it); closing
 * then would make the click look like it did nothing. The panel stays open, unfocused, instead.
 */
export const OPEN_BLUR_GRACE_MS = 400

/** Lets Windows repaint the area under our windows before a screenshot. */
export const HIDE_SETTLE_MS = 150
```

<!-- /code -->

- `FRAME_MS = 16`: how often the animation timer fires. 1000 / 16 is about 62 times a second,
  which this guide calls the 60 fps ticker (see `runTicker()`).
- `DEFAULT_CORNER`: the corner used when nothing was saved.
- `PANEL_FADE_MS = 150`: when the panel closes, its page fades its contents out. The window is
  hidden only after this delay, otherwise the fade would be cut off (see `collapse()`). It matches
  the page's fade exactly: the renderer's transitions are also 150 ms (`duration-150`).
- `BLUR_CLICK_GRACE_MS = 300`, `PRESS_SLACK_MS = 50`: see `clickBubble()`. The comment above them
  covers both.
- `OPEN_BLUR_GRACE_MS = 400`: see `panelBlurred()`. As its comment says, another app can take the
  focus back just as the panel opens.
- `HIDE_SETTLE_MS = 150`: after the windows are hidden, Windows needs a moment to redraw what was
  behind them. A screenshot taken sooner could still show them.
- `export const`: the last five are exported so the tests can wait exactly the right time.

### `BubbleController`

The class, with the comment that describes it:

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.class -->

[`src/main/bubble/BubbleController.ts`, lines 103–119](../../apps/desktop/src/main/bubble/BubbleController.ts#L103-L119)

```ts
/**
 * The bubble's state machine. The bubble is a character standing on the taskbar near one of the
 * bottom corners. This owns the mode, the character's position, its pose and its anchor (the
 * display and bottom corner it lives near), and moves/shows/hides the two windows to match:
 *
 *   collapsed ⇄ expanded                     click, Esc, blur
 *   collapsed/expanded → dragging → returning → collapsed     drag, release (falls to the taskbar)
 *   expanded → capturing → expanded          screenshot
 *
 * While collapsed and left alone, it wanders: now and then it walks somewhere else near its corner
 * and, once it's been alone a while, sometimes fidgets instead. Dropped far from its corner, it
 * walks back. Anything the user does stops it where it is.
 *
 * It also owns her size (`scale`, one of CHARACTER_SIZES): the size the user chose, kept to the
 * biggest that fits her display, with both windows sized and placed to match.
 */
export class BubbleController {
  // …
}
```

<!-- /code -->

The comment sums up the state machine in three lines, then what the character does on its own,
then her size; the lists at the top of this page are the long version. These are the class's
fields:

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.mode,pose,position,anchor,inset,chosenScale,scale,ticker,hideTimer,idleTimer,walking,lastFidget,lastInteraction,lastBlurCollapse,expandedAt,expandAfterReturn,now,random -->

[`src/main/bubble/BubbleController.ts`, lines 120–142](../../apps/desktop/src/main/bubble/BubbleController.ts#L120-L142)

```ts
private mode: Mode = 'collapsed'

private pose: Pose = 'idle'

private position: Point = { x: 0, y: 0 }

private anchor: BubbleAnchor

/** How far along the taskbar from its corner it stands (see restPosition). */
private inset = 0

/** The size the user chose (saved), and the size she is: that, or less if it doesn't fit. */
private chosenScale: number

private scale: number

private ticker: ReturnType<typeof setInterval> | null = null

private hideTimer: ReturnType<typeof setTimeout> | null = null

/** The next thing it does on its own, or the end of a fidget. */
private idleTimer: ReturnType<typeof setTimeout> | null = null

private walking = false

/** The fidget she did last, so the next one is different. */
private lastFidget: Fidget | undefined

/** When the user last did something with it (a mode change); fidgets wait for a quiet spell. */
private lastInteraction: number

private lastBlurCollapse = Number.NEGATIVE_INFINITY

private expandedAt = Number.NEGATIVE_INFINITY

private expandAfterReturn = false

private readonly now: () => number

private readonly random: () => number
```

<!-- /code -->

- `private mode: Mode = 'collapsed'`: `private` means only this class's own methods can read or
  change the field (TypeScript checks this when compiling). Everything starts at rest.
- `private pose: Pose = 'idle'`: what the character is doing, for the bubble's page to animate.
  Only `setPose()` changes it.
- `private position: Point = { x: 0, y: 0 }`: the top-left corner of the bubble's _box_ (80×80
  at her usual size; not of its window; see `layout.ts`), in DIPs. A placeholder until `start()`
  sets it.
- `private anchor: BubbleAnchor`: no starting value here; the constructor sets it. With the
  project's `strict` settings, TypeScript refuses to compile if the constructor could finish
  without assigning it.
- `private inset = 0`: as its comment says, how far along the taskbar from its corner the
  character stands, in DIPs (see `restPosition()` in `layout.ts`). It changes as the character
  walks and when it's dropped somewhere new (`endDrag()`). It starts at 0, right in the corner.
- `private chosenScale: number`, `private scale: number`: as the comment says, the size the user
  chose, which is saved, and the size she is: the size chosen, or less if that doesn't fit her
  display. Both are multiples of her usual size, one of `CHARACTER_SIZES`. Usually they're the
  same; they differ only on a screen too small for the size chosen, and then `scale` goes back up
  to `chosenScale` once there's room (see `fitScale()`). Everything that places a window uses
  `scale`. The constructor sets both.
- `ReturnType<typeof setInterval>`: "whatever type `setInterval` returns". It saves caring whether
  that's Node's `Timeout` object or a browser's number. `ticker` is the running animation timer,
  if any.
- `private hideTimer`: the pending "hide the panel window after the fade" timer from `collapse()`.
- `private idleTimer`: as its comment says, the timer for the next thing the character does on its
  own, or for the end of a fidget. Only one is ever pending.
- `private walking = false`: whether a walk is under way. A walk runs on `ticker`, like the other
  animations; this flag tells `stopWalking()` that the ticker is a walk's.
- `private lastFidget: Fidget | undefined`: as its comment says, the fidget the character did last,
  so `nextActivity()` picks a different one next time. `undefined` until the first fidget.
- `private lastInteraction: number`: as its comment says, when the user last did something with
  the character, which the controller takes to be the last change of mode. Fidgets wait until
  this is 30 seconds old. The constructor sets it.
- `private lastBlurCollapse = Number.NEGATIVE_INFINITY`: when the panel last closed because it lost
  focus. Starting at minus infinity means "never", so the first click can't fall inside the grace
  period.
- `private expandedAt = Number.NEGATIVE_INFINITY`: when the panel last opened, for the grace
  period in `panelBlurred()`.
- `private expandAfterReturn = false`: set when something asks to open the panel while the
  character is still falling; `settle()` opens it once she lands.
- `private readonly now: () => number`: `readonly` means it's set once, in the constructor, and
  never reassigned. The same goes for `random`.

### `BubbleController.constructor()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.constructor -->

[`src/main/bubble/BubbleController.ts`, lines 144–159](../../apps/desktop/src/main/bubble/BubbleController.ts#L144-L159)

```ts
constructor(private readonly deps: BubbleControllerDeps) {
  // Wall-clock time, so it compares with the time a click was pressed in the bubble's page.
  this.now = deps.now ?? (() => Date.now())
  this.random = deps.random ?? Math.random
  this.lastInteraction = this.now()
  // Set now, not in start(): the pages ask for the corner as soon as they load, which can be
  // before start() runs. A top corner saved by an older version means the bottom one below it.
  const saved = deps.initialAnchor
  const corner = bottomOf(saved?.corner ?? DEFAULT_CORNER)
  this.anchor =
    saved && deps.displays.byId(saved.displayId)
      ? { displayId: saved.displayId, corner }
      : { displayId: deps.displays.primary().id, corner }
  this.chosenScale = snapSize(deps.initialScale ?? DEFAULT_SIZE)
  this.scale = Math.min(this.chosenScale, this.largestScale())
}
```

<!-- /code -->

Stores the dependencies, picks the clock and random source, and decides the anchor and her size.
Nothing appears on screen until `start()`.

- `constructor(private readonly deps: BubbleControllerDeps)`: TypeScript shorthand. Marking a
  constructor parameter `private readonly` declares a field called `deps` and stores the argument
  in it.
- `deps.now ?? (() => Date.now())`: `??` uses the right-hand side only when the left is `null` or
  `undefined`. As the comment says, the clock is the wall-clock time (milliseconds since 1970),
  because `clickBubble()` compares it with the time the bubble's page saw the mouse button go
  down, and the page's `Date.now()` is the same clock. (`performance.now()`, which never jumps
  when the PC's clock is adjusted, counts from a different starting point in every process, so
  the two couldn't be compared.)
- `this.lastInteraction = this.now()`: starting up counts as the last thing the user did, so the
  first fidget waits its 30 seconds like any other.
- `// Set now, not in start()`: `index.ts` registers the IPC handlers (including `getState()`,
  which reads `corner`) before it waits for the pages to load, and only calls `start()` after both
  have drawn. A page can ask for the corner in between. Choosing the anchor here means that answer
  is already right, so the panel lays itself out for the correct corner from the start.
- `saved?.corner ?? DEFAULT_CORNER`: `?.` gives `undefined` instead of an error when `saved` is
  `null`, and `??` then falls back to bottom-right.
- `bottomOf(...)`: as the comment says, a top corner saved by an older version means the bottom
  corner on the same side (`bottomOf()`, at the end of the file). Bottom corners pass through
  unchanged.
- `saved && deps.displays.byId(saved.displayId)`: the saved display is used only if it's still
  connected. Otherwise the character goes to the main display, keeping the corner.
- `{ displayId: saved.displayId, corner }`: a new object, so the controller's anchor isn't the
  same object the settings hold, and with the corrected corner.
- `this.anchor =`: sets the field directly rather than through `setAnchor()`, so `onAnchorChange`
  doesn't fire, and a fallback anchor or a corrected corner isn't saved. The pages get the corner
  from `getState()`.
- `this.chosenScale = snapSize(deps.initialScale ?? DEFAULT_SIZE)`: the size saved last time, or
  her usual size (`DEFAULT_SIZE`, 1) if there isn't one. `snapSize()` (from `geometry.ts`) turns
  any number into the nearest of `CHARACTER_SIZES`, so a saved number that isn't one of them (from
  an older version, say, or edited by hand) still gives a size she comes in.
- `this.scale = Math.min(this.chosenScale, this.largestScale())`: the size she starts at: the size
  chosen, or the biggest that fits her display if that's smaller. It comes after the anchor because
  `largestScale()` looks at her display, which the anchor says. Like the anchor, it's set directly,
  for the pages to read from `getState()` (`size`, below), with no `onSizeChange`.

### `BubbleController.currentMode`, `currentPose`, `bubblePosition`, `corner`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.currentMode,currentPose,bubblePosition,corner -->

[`src/main/bubble/BubbleController.ts`, lines 161–175](../../apps/desktop/src/main/bubble/BubbleController.ts#L161-L175)

```ts
get currentMode(): Mode {
  return this.mode
}

get currentPose(): Pose {
  return this.pose
}

get bubblePosition(): Point {
  return { ...this.position }
}

get corner(): Corner {
  return this.anchor.corner
}
```

<!-- /code -->

`get` defines a read-only property: other code writes `controller.currentMode` (no brackets) but
can't assign to it. `index.ts` reads `currentMode`, `currentPose` and `corner` in its
`getState()`, which is how a page that has just loaded learns the current state. The tests read
`currentPose` to check what the character is doing.

- `return { ...this.position }`: returns a copy, so a caller can't move the character by editing
  the object it got back. Nothing outside the class reads `bubblePosition` at the moment.

### `BubbleController.size`, `standing`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.size,standing -->

[`src/main/bubble/BubbleController.ts`, lines 177–192](../../apps/desktop/src/main/bubble/BubbleController.ts#L177-L192)

```ts
/** How big she is, and the biggest she can be on her display. */
get size(): CharacterSize {
  return { scale: this.scale, max: this.largestScale() }
}

/**
 * Where she stands, for her clones and her vision: her display's work area, her window, and her
 * size.
 */
get standing(): { workArea: Rect; bounds: Rect; scale: number } {
  return {
    workArea: this.display().workArea,
    bounds: bubbleWindowBounds(this.position, this.scale),
    scale: this.scale,
  }
}
```

<!-- /code -->

Two more read-only properties, both about her size.

- `size`: as its comment says, how big she is, and the biggest she can be on her display, as a
  `CharacterSize` (`{ scale, max }`, from `geometry.ts`). `index.ts` reads it in `getState()`, so
  a page that has just loaded knows her size, and `setScale()` returns it. The panel's size menu
  uses `max` to know when Bigger can't go any further.
- `max: this.largestScale()`: worked out afresh each time, from her display as it is now.
- `standing`: as its comment says, where she stands, for her clones: her display's work area, her
  window's rectangle and her size. The Clones handler in `actions.ts` reads it and hands it to
  `Clones.start()`, which opens the clones' window along the bottom of that work area, with them
  setting off from where her window is, at her size. `index.ts` reads it too, when she starts her
  vision, for `Vision.start()`, which opens the window of light above her. (The comment only
  mentions the clones.)
- `bubbleWindowBounds(this.position, this.scale)`: her window as it is placed now (see
  `layout.ts`), a new object each time.

### `BubbleController.setScale()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.setScale -->

[`src/main/bubble/BubbleController.ts`, lines 194–203](../../apps/desktop/src/main/bubble/BubbleController.ts#L194-L203)

```ts
/**
 * Makes her `scale` times her usual size (snapped to one of CHARACTER_SIZES), or as big as fits
 * her display if that's smaller. She grows or shrinks where she stands: her feet stay on the
 * taskbar and her side nearest her corner stays put. Both windows are resized to match.
 */
setScale(scale: number): CharacterSize {
  this.chosenScale = snapSize(scale)
  this.fitScale()
  return this.size
}
```

<!-- /code -->

Changes her size. `ipc.ts` calls it when the size menu's Smaller or Bigger is pressed
(`IPC.characterSetSize`), then saves the size chosen (`SettingsService.setCharacterScale()`) and
sends the result back to the page.

- `this.chosenScale = snapSize(scale)`: the size asked for, snapped to one of `CHARACTER_SIZES`
  (`ipc.ts` already refuses any other number, so this is a second line of defence). It's what's
  remembered even when it doesn't fit: on a bigger screen later, she grows to it.
- `this.fitScale()`: makes her that size, or the biggest that fits her display, and, as the
  comment says, resizes both windows where she stands and tells the pages (see `fitScale()`).
- `return this.size`: her size now, and the biggest she can be, so the caller can tell whether she
  got the size asked for.

### `BubbleController.start()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.start -->

[`src/main/bubble/BubbleController.ts`, lines 205–211](../../apps/desktop/src/main/bubble/BubbleController.ts#L205-L211)

```ts
/** Stands the character in its saved corner (or bottom-right of the main display) and shows it. */
start(): void {
  this.position = this.rest()
  this.placeWindows()
  this.deps.bubble.show()
  this.scheduleActivity(true)
}
```

<!-- /code -->

Called once by `index.ts`, after both pages have drawn for the first time (their windows'
`ready-to-show` event), so the character doesn't appear before its page has anything to show. The
anchor was already chosen in the constructor; this just puts the windows there.

- `this.position = this.rest()`: on the taskbar in the anchor's corner (the inset is still 0; see
  `rest()`).
- `this.placeWindows()`: positions both windows, although only the bubble is shown, and sizes them
  for her size (`index.ts` creates them at her usual size). The panel is then already in the right
  place when it first opens.
- `this.deps.bubble.show()`: for the real window this is `showInactive()` (see `bubbleSurface()`),
  so the character appears without stealing focus from whatever you're doing.
- `this.scheduleActivity(true)`: starts the wait for the first thing the character does on its
  own. `true` picks the shorter first wait, 5 to 12 seconds (`WANDER.firstDelay`).

### `BubbleController.clickBubble()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.clickBubble -->

[`src/main/bubble/BubbleController.ts`, lines 213–234](../../apps/desktop/src/main/bubble/BubbleController.ts#L213-L234)

```ts
/** A click on the bubble. `pressedAt` is when its mouse button went down (wall-clock ms). */
clickBubble(pressedAt?: number): void {
  switch (this.mode) {
    case 'collapsed': {
      const closedByThisPress =
        pressedAt === undefined
          ? this.now() - this.lastBlurCollapse < BLUR_CLICK_GRACE_MS
          : this.lastBlurCollapse >= pressedAt - PRESS_SLACK_MS
      if (closedByThisPress) return // the press closed the panel: that was the click's job
      this.expand()
      return
    }
    case 'expanded':
      this.collapse()
      return
    case 'dragging':
    case 'returning':
    case 'capturing':
      this.deps.onDiagnostic?.(`Bubble click ignored while ${this.mode}`)
      return
  }
}
```

<!-- /code -->

What a click on the bubble means depends on the mode. The bubble page sends `IPC.bubbleClick` with
the time the mouse button went down (`pressedAt`), and leaves the decision to the main process,
which knows the mode and when the panel last closed.

- `clickBubble(pressedAt?: number)`: `?` makes the press time optional; the tests, and anything
  older, can leave it out.
- `case 'collapsed': {`: the braces give this `case` a block of its own, so `closedByThisPress`
  can be declared inside it.
- `closedByThisPress`: with the panel open, pressing on the bubble takes the keyboard focus from
  the panel (the bubble window can take the focus, see `windows.ts` below), and the blur closes the
  panel as the button goes down. By the time the click arrives the mode is already `collapsed`,
  and without this check the click would open the panel straight back up: it would seem to ignore
  you.
- `this.lastBlurCollapse >= pressedAt - PRESS_SLACK_MS`: with a press time, the question is
  simple: did the panel close at or after this press? Then this press closed it, and the click
  has done its job. The 50 ms of slack covers the two processes noticing things in a slightly
  different order. However long the button is held, the answer is right (a slow click is still
  one click), and a click soon after closing the panel some other way (clicking another app)
  opens it at once.
- `this.now() - this.lastBlurCollapse < BLUR_CLICK_GRACE_MS`: without a press time, the older rule:
  a click within 300 ms of a blur-close counts as part of the same gesture.
- `if (closedByThisPress) return`: as the comment says, closing the panel was the click's job.
  Otherwise `this.expand()` opens it.
- `case 'collapsed'` also covers a character that's walking or fidgeting on its own: those happen
  in `collapsed`, so a click on a walking character opens the panel (and `expand()` stops the walk
  first).
- `case 'capturing':`: the dragging, returning and capturing modes ignore clicks. Listing them
  explicitly makes it clear none was forgotten. (A drag ends with a click event in the page too,
  but `BubbleView` swallows that one before it's sent.) Each ignored click is logged with the mode
  it arrived in (`Bubble click ignored while returning`, say).

### `BubbleController.expand()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.expand -->

[`src/main/bubble/BubbleController.ts`, lines 236–257](../../apps/desktop/src/main/bubble/BubbleController.ts#L236-L257)

```ts
/** Opens the panel where the character stands. While she's falling, once she lands. */
expand(): void {
  switch (this.mode) {
    case 'expanded':
      this.deps.panel.focus()
      return
    case 'returning':
      this.expandAfterReturn = true
      return
    case 'dragging':
    case 'capturing':
      return
    case 'collapsed':
      this.cancelHide()
      // Stops any walk first, which puts the panel where the character now stands.
      this.setMode('expanded')
      this.expandedAt = this.now()
      this.deps.panel.show()
      this.deps.panel.focus()
      return
  }
}
```

<!-- /code -->

Opens the panel. Unlike `clickBubble()` it never closes it, so it's what "open" requests from
outside use: the tray icon, launching the app again while it's running, finishing a sign-in in
the browser, and clicking one of the app's Windows notifications (all in `index.ts`).

- `this.deps.panel.focus()`: already open, so just give it the keyboard again.
- `this.expandAfterReturn = true`: as the comment says, while she's falling, the panel opens once
  she lands. It opens beside the character, so it can't open while she's still in the air. The
  request is remembered, and `settle()` opens the panel once the character is standing again.
- `case 'dragging':`: ignored while you're holding the character, and while capturing (the panel
  reopens by itself when the screenshot is done).
- `this.cancelHide()`: if the panel is still fading out from a moment ago, its pending "hide"
  timer is cancelled. Otherwise the window would vanish 150 ms after reopening.
- `// Stops any walk first`: as the comment says, `setMode('expanded')` stops a walk (or a fidget,
  or the wait for one) before the panel is shown, and `stopWalking()` moves the hidden panel to
  open from where the character stopped. So clicking a walking character opens the panel right
  beside it, not where the walk began.
- `this.setMode('expanded')`: the pages hear the new mode (through `onModeChange`) and animate
  open; the window is then shown and focused so you can type at once.
- `this.expandedAt = this.now()`: when it opened, for `panelBlurred()`.

### `BubbleController.collapse()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.collapse -->

[`src/main/bubble/BubbleController.ts`, lines 259–267](../../apps/desktop/src/main/bubble/BubbleController.ts#L259-L267)

```ts
collapse(): void {
  if (this.mode !== 'expanded') return
  this.setMode('collapsed')
  this.cancelHide()
  this.hideTimer = setTimeout(() => {
    this.hideTimer = null
    this.deps.panel.hide()
  }, PANEL_FADE_MS)
}
```

<!-- /code -->

Closes the panel in two steps: the mode changes now, so the page starts its fade-out, and the
window itself is hidden `PANEL_FADE_MS` later. Hiding the window at once would cut the animation
off. Called by `clickBubble()`, `panelBlurred()` and, for Esc in the panel or after a question
has been handed to Claude Desktop, by `ipc.ts`.

- `if (this.mode !== 'expanded') return`: closing only makes sense when open. It also makes a
  repeated request harmless.
- `this.setMode('collapsed')`: also starts the wait for the next thing the character does on its
  own (see `setMode()`).
- `this.cancelHide()`: never leaves two hide timers running.
- `this.hideTimer = null`: inside the timer, marks that nothing is pending any more.

### `BubbleController.panelBlurred()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.panelBlurred -->

[`src/main/bubble/BubbleController.ts`, lines 269–277](../../apps/desktop/src/main/bubble/BubbleController.ts#L269-L277)

```ts
panelBlurred(): void {
  if (this.mode !== 'expanded') return
  if (this.now() - this.expandedAt < OPEN_BLUR_GRACE_MS) {
    this.deps.onDiagnostic?.('The panel lost the focus as it opened; kept it open')
    return
  }
  this.lastBlurCollapse = this.now()
  this.collapse()
}
```

<!-- /code -->

`index.ts` calls this on the panel window's `blur` event, which Electron fires when the window
loses keyboard focus, for example because you clicked another app or the desktop. The panel
behaves like a popup and closes.

- `if (this.mode !== 'expanded') return`: blurs in any other mode are ignored, such as the one
  caused when `whileHidden()` hides the panel for a screenshot.
- `if (this.now() - this.expandedAt < OPEN_BLUR_GRACE_MS)`: a blur within 400 ms of opening
  doesn't close the panel. Windows can give the focus straight back to the app that had it, for
  example Claude Desktop just after a question was handed to it, and closing then would make the
  click on the bubble look like it did nothing. The panel stays open without the focus (clicking
  in it gives the focus back), and the case is logged. A real click away, later, still closes it.
- `this.lastBlurCollapse = this.now()`: noted for the grace period in `clickBubble()`.

### `BubbleController.startDrag()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.startDrag -->

[`src/main/bubble/BubbleController.ts`, lines 279–291](../../apps/desktop/src/main/bubble/BubbleController.ts#L279-L291)

```ts
/** The mouse pressed on the character and moved: it dangles from the pointer until released. */
startDrag(): void {
  if (this.mode !== 'collapsed' && this.mode !== 'expanded') return
  this.cancelHide()
  this.deps.panel.hide()
  this.setMode('dragging')
  const cursor = this.deps.displays.cursor()
  const grab = { x: cursor.x - this.position.x, y: cursor.y - this.position.y }
  this.runTicker(() => {
    const now = this.deps.displays.cursor()
    this.moveBubble({ x: now.x - grab.x, y: now.y - grab.y })
  })
}
```

<!-- /code -->

The bubble page decides a press has become a drag once the pointer moves more than 5 pixels
(`DRAG_THRESHOLD` in `BubbleView.tsx`), and sends `IPC.bubbleDragStart`. From then on the main
process moves the window and the page just waits for the release.

- `if (this.mode !== 'collapsed' && this.mode !== 'expanded') return`: a drag can only start from
  standing (walking counts, being `collapsed`), not mid-fall or during a screenshot.
- `this.deps.panel.hide()`: the panel can't follow the character, so it's hidden at once, without
  the fade. `cancelHide()` drops any fade timer that was still pending.
- `this.setMode('dragging')`: comes before the grab is measured. Changing the mode stops a walk
  (and its ticker) where it is, so the offset is measured from where the character really
  stopped. It also sets the pose to `dragged`, and the page shows the character dangling.
- `const grab`: the offset from the character's top-left to the pointer. Keeping that offset fixed
  means the spot you grabbed stays under the pointer, instead of the character jumping so its
  corner is there.
- `this.runTicker(() => {`: every frame, read where the pointer is now and move the character to
  match. The callback ignores the frame time, since following the pointer only needs its current
  position.

Reading the real pointer position in the main process keeps the drag smooth, even across monitors
with different scaling. The page's own coordinates would keep shifting as its window moves under
it.

### `BubbleController.endDrag()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.endDrag -->

[`src/main/bubble/BubbleController.ts`, lines 293–312](../../apps/desktop/src/main/bubble/BubbleController.ts#L293-L312)

```ts
/**
 * Released: the character falls onto the taskbar of the display it was dropped on, and from then
 * on lives near that display's nearer bottom corner. Dropped far from it, it walks back.
 */
endDrag(): void {
  if (this.mode !== 'dragging') return
  this.stopTicker()
  const half = bubbleMetrics(this.scale).size / 2
  const centre = {
    x: Math.round(this.position.x + half),
    y: Math.round(this.position.y + half),
  }
  const display = this.deps.displays.nearest(centre)
  const corner = nearestCorner(display.workArea, this.position, this.scale)
  this.setAnchor({ displayId: display.id, corner })
  // Another display may not have room for her at this size.
  this.fitScale()
  this.inset = insetAt(display.workArea, corner, this.position.x, this.scale)
  this.fall()
}
```

<!-- /code -->

On release, `BubbleView` sends `IPC.bubbleDragEnd`. As the comment says, the character falls onto
the taskbar of whichever display it was dropped on, straight down from where it was let go, and
from then on lives near that display's nearer bottom corner. Dropped far from that corner, it
walks back once it has landed.

- `if (this.mode !== 'dragging') return`: a release that doesn't end a drag (say, a drag that was
  refused because the character was still falling) does nothing.
- `const half = bubbleMetrics(this.scale).size / 2`: half the width of her box at her size
  (`bubbleMetrics()` in `geometry.ts`), 40 DIPs at her usual size.
- `const centre`: the display is picked by the character's centre, not its top-left, so a
  character straddling two monitors goes to the one its centre is on. It's rounded because
  Electron's display lookup works in whole DIPs.
- `nearestCorner(display.workArea, this.position, this.scale)`: the bottom corner on the side of
  that display the character is on, left half or right half (`layout.ts`). How high it was dropped
  doesn't matter.
- `this.setAnchor({ displayId: display.id, corner })`: saves and broadcasts the new anchor, but
  only if it actually changed. Dropping the character anywhere in the same half of the same
  display keeps it.
- `this.fitScale()`: as the comment says, another display may not have room for her at this size
  (a smaller laptop screen beside a big monitor, say), so her size is fitted to the display she's
  now on, or grows back to the size chosen if that one has room. It comes after `setAnchor()`, so
  it looks at the new display. While dragging, it only changes `scale` and tells the pages; the
  fall that follows moves her window at the new size.
- `this.inset = insetAt(display.workArea, corner, this.position.x, this.scale)`: where it will
  land, as an inset from that corner: the same `x` it was let go at, kept on the work area
  (`layout.ts`). So it falls straight down.
- `this.fall()`: the fall onto the taskbar. The mode goes to `returning`, then `collapsed`, and a
  character that landed beyond its zone then walks back (see `fall()`).

### `BubbleController.whileHidden()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.whileHidden -->

[`src/main/bubble/BubbleController.ts`, lines 314–330](../../apps/desktop/src/main/bubble/BubbleController.ts#L314-L330)

```ts
/** Hides both windows, runs `task` (a screenshot), then reopens the panel. */
async whileHidden<T>(task: () => Promise<T>): Promise<T> {
  if (this.mode !== 'expanded') throw new Error(`Can't hide the windows while ${this.mode}`)
  this.setMode('capturing')
  this.deps.panel.hide()
  this.deps.bubble.hide()
  try {
    await new Promise((resolve) => setTimeout(resolve, HIDE_SETTLE_MS))
    return await task()
  } finally {
    this.deps.bubble.show()
    this.setMode('expanded')
    this.expandedAt = this.now()
    this.deps.panel.show()
    this.deps.panel.focus()
  }
}
```

<!-- /code -->

Used by the screenshot action in `actions.ts`, which passes a task that calls
`ScreenshotService.capture()`. The overlay windows mustn't appear in your screenshot, so they're
hidden first and brought back afterwards.

- `async whileHidden<T>(task: () => Promise<T>): Promise<T>`: `<T>` makes it _generic_: it returns
  whatever `task` returns, with the same type.
- `throw new Error(`: only allowed from `expanded`, since the camera icon is in the panel.
  `actions.ts` catches the error and shows "Couldn't take a screenshot".
- `this.setMode('capturing')`: comes before hiding the windows. Hiding the focused panel makes it
  lose focus, and `panelBlurred()` ignores that blur only because the mode is no longer
  `expanded`.
- `await new Promise((resolve) => setTimeout(resolve, HIDE_SETTLE_MS))`: a pause written as a
  promise that resolves after 150 ms.
- `return await task()`: the `await` matters. Without it, the `finally` block would run as soon as
  the task started, bringing the windows back before the screenshot was taken.
- `finally {`: runs whether the task succeeded or threw, so a failed capture never leaves the app
  invisible. The panel comes back open and focused, as it was before, and `expandedAt` is set as
  if it had just opened.

### `BubbleController.displayChanged()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.displayChanged -->

[`src/main/bubble/BubbleController.ts`, lines 332–349](../../apps/desktop/src/main/bubble/BubbleController.ts#L332-L349)

```ts
/**
 * The resolution, taskbar or monitors changed. If the character's display was unplugged, it
 * moves to the same corner of the main display. Her size is kept to what fits (and back to the
 * size chosen once there's room again). Moving characters re-read the display every frame; one
 * standing (or strolling) is put back on the taskbar, as far from its corner as fits.
 */
displayChanged(): void {
  if (!this.deps.displays.byId(this.anchor.displayId)) {
    this.setAnchor({ displayId: this.deps.displays.primary().id, corner: this.anchor.corner })
  }
  this.fitScale()
  if (this.mode === 'returning' || this.mode === 'dragging') return
  this.stopIdling()
  this.inset = Math.min(this.inset, maxInset(this.display().workArea, this.scale))
  this.position = this.rest()
  this.placeWindows()
  if (this.mode === 'collapsed') this.scheduleActivity(false)
}
```

<!-- /code -->

`index.ts` calls this on Electron's `screen` events `display-added`, `display-removed` and
`display-metrics-changed`. The last covers resolution, scaling and rotation changes, and the
taskbar moving or resizing (which changes the work area).

- `if (!this.deps.displays.byId(this.anchor.displayId))`: the character's display is gone, for
  example unplugged or a laptop undocked. The anchor moves to the same corner of the main display,
  through `setAnchor()`, so the change is saved and broadcast. The inset is kept, so it stands as
  far along the main display's taskbar as it did on the old one, if that fits.
- `this.fitScale()`: as the comment says, her size is kept to what fits the display as it is now:
  on a screen that got smaller (a lower resolution, or another display), she shrinks; once there's
  room again, she grows back to the size chosen. It runs in every mode, before the line below, so
  a falling or dragged character is resized too (the next frame moves her window at the new size).
- `this.mode === 'returning' || this.mode === 'dragging'`: moving characters adapt by themselves.
  The fall re-reads the display every frame, and a drag follows the pointer. Moving the windows
  here would make the character jump.
- `this.stopIdling()`: as the comment says, a strolling character is put back on the taskbar too;
  a walk or a fidget stops, standing idle.
  Its walk stops where it is, standing idle, and the last line below starts the wait for its next
  activity afresh.
- `this.inset = Math.min(this.inset, maxInset(this.display().workArea, this.scale))`: on a
  narrower screen, as far from its corner as still fits at her size. `restPosition()` would keep it
  on screen anyway, but storing the shorter inset means later walks start from where it really
  stands.
- `this.position = this.rest()`: in every other mode, both windows go back onto the taskbar of the
  (possibly resized) work area. That includes `expanded`, so an open panel moves with the
  character, and `capturing`, where the windows are hidden but will come back in the right place.
- `if (this.mode === 'collapsed') this.scheduleActivity(false)`: a standing character starts its
  wait for the next thing to do over again.

### `BubbleController.dispose()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.dispose -->

[`src/main/bubble/BubbleController.ts`, lines 351–355](../../apps/desktop/src/main/bubble/BubbleController.ts#L351-L355)

```ts
dispose(): void {
  this.stopTicker()
  this.cancelHide()
  this.cancelActivity()
}
```

<!-- /code -->

Stops every timer: the animation ticker, the panel's hide timer and the timer for what the
character does next on its own. `index.ts` calls it while quitting (in `before-quit`), so no timer
fires against a window that is being destroyed. The tests call it after each test.

### `BubbleController.display()`, `rest()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.display,rest -->

[`src/main/bubble/BubbleController.ts`, lines 357–365](../../apps/desktop/src/main/bubble/BubbleController.ts#L357-L365)

```ts
/** The anchor's display, or the main display if it's gone. */
private display(): DisplayArea {
  return this.deps.displays.byId(this.anchor.displayId) ?? this.deps.displays.primary()
}

/** Where the character stands now: on the taskbar, `inset` from its corner. */
private rest(): Point {
  return restPosition(this.display().workArea, this.anchor.corner, this.inset, this.scale)
}
```

<!-- /code -->

- `?? this.deps.displays.primary()`: if the anchor's display has gone and `displayChanged()`
  hasn't run yet, use the main display rather than fail.
- `restPosition(this.display().workArea, this.anchor.corner, this.inset, this.scale)`: as its
  comment says, where the character stands now: on the display's taskbar, `inset` along from its
  corner, at her size (`layout.ts`). It's worked out fresh on every call, from the display's
  current work area, the current inset and her current size, so it's never stale. A walk changes
  `inset` and calls `rest()` every frame.

### `BubbleController.largestScale()`, `fitScale()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.largestScale,fitScale -->

[`src/main/bubble/BubbleController.ts`, lines 367–388](../../apps/desktop/src/main/bubble/BubbleController.ts#L367-L388)

```ts
/** The biggest she can be on her display (see largestSize). */
private largestScale(): number {
  return largestSize(this.display().workArea, this.deps.actionCount)
}

/**
 * Makes her the size chosen, or the biggest that fits her display, and tells the pages if that
 * (or the biggest) changed. Standing or strolling, she's put back on the taskbar at her new size
 * and both windows are sized to match; moving, the next frame does that.
 */
private fitScale(): void {
  const before = this.size
  this.scale = Math.min(this.chosenScale, this.largestScale())
  const after = this.size
  if (after.scale === before.scale && after.max === before.max) return
  if (this.mode === 'collapsed' || this.mode === 'expanded') {
    this.inset = Math.min(this.inset, maxInset(this.display().workArea, this.scale))
    this.position = this.rest()
    this.placeWindows()
  }
  this.deps.onSizeChange?.(after)
}
```

<!-- /code -->

How her size is kept to what fits. `fitScale()` is the one place `scale` changes after the
constructor: `setScale()` calls it with a new size chosen, and `endDrag()` and `displayChanged()`
call it when her display may have changed.

- `largestScale()`: as its comment says, the biggest she can be on her display, from
  `largestSize()` in `geometry.ts`. That checks every size in `CHARACTER_SIZES` and keeps the
  biggest at which she fits across the work area with 16 DIPs either side and her panel window,
  with its chat card and every action icon (`this.deps.actionCount` of them), fits the work area
  too. So however big she gets, the size menu can still be reached.
- `const before = this.size`: her size and the biggest she can be, before the change. `size` makes
  a new object each time, so this is a copy, not something that changes along with the fields.
- `this.scale = Math.min(this.chosenScale, this.largestScale())`: as the comment says, the size
  chosen, or the biggest that fits her display.
- `if (after.scale === before.scale && after.max === before.max) return`: nothing changed, so
  nothing is moved and the pages aren't told. Both are compared because the size menu shows `max`
  too: on a smaller screen it can change while her size stays the same.
- `if (this.mode === 'collapsed' || this.mode === 'expanded')`: standing (or strolling), she's put
  back on the taskbar at her new size, and both windows are resized and placed to match. Her inset
  is kept, if it still fits, so the side of her nearest her corner stays where it was and she grows
  or shrinks from there, her feet on the taskbar; with the panel open, it stays open beside her. In
  the other modes, as the comment says, the next frame does that (a fall or a drag), or nothing
  needs moving yet (while capturing, `displayChanged()` places the hidden windows itself).
- `this.deps.onSizeChange?.(after)`: tells `index.ts`, which broadcasts the new size to both
  pages.

### `BubbleController.fall()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.fall -->

[`src/main/bubble/BubbleController.ts`, lines 390–406](../../apps/desktop/src/main/bubble/BubbleController.ts#L390-L406)

```ts
/** After a drop: falls onto the taskbar, then walks back toward its corner if it's far off. */
private fall(): void {
  const from = { ...this.position }
  const duration = fallDuration(from, this.rest())
  const startedAt = this.now()
  this.setMode('returning')
  this.runTicker(() => {
    const to = this.rest()
    const t = (this.now() - startedAt) / duration
    if (t < 1) {
      this.moveBubble(fallPosition(from, to, t))
      return
    }
    this.settle()
    if (this.mode === 'collapsed' && this.inset > this.zone()) this.walkTo(this.zone())
  })
}
```

<!-- /code -->

Drops the character from where it was let go onto the taskbar, like a dropped thing: slowly at
first, then faster (the maths is in `wander.ts`). Only `endDrag()` calls it, after setting the
anchor and the inset, so `rest()` is where it lands: straight below where it was let go.

- `fallDuration(from, this.rest())`: as long as gravity takes to fall that far, and at least
  150 ms (`wander.ts`). The duration is fixed when the fall starts.
- `this.setMode('returning')`: the pose stays `dragged`, so the character dangles on the way down.
- `const to = this.rest()`: inside the frame callback, so it's re-read every frame. If the display
  (or her size) changes mid-fall, the character still lands on the taskbar.
- `const t = (this.now() - startedAt) / duration`: progress from 0 to 1, based on real elapsed
  time, so a late frame doesn't slow the fall down.
- `this.moveBubble(fallPosition(from, to, t))`: only the bubble window moves during the fall.
- `this.settle()`: when `t` reaches 1: standing on the taskbar, `collapsed`, and opening the panel
  if that was asked for on the way down.
- `if (this.mode === 'collapsed' && this.inset > this.zone()) this.walkTo(this.zone())`: dropped
  further from its corner than its zone reaches, it walks back to the zone's edge.
  `this.mode === 'collapsed'` is checked because `settle()` may have opened the panel instead
  (`expandAfterReturn`); then it stays where it landed. Dropped inside the zone, it stays where it
  landed too, and `settle()`'s change to `collapsed` has already started the wait for its next
  activity.

### `BubbleController.settle()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.settle -->

[`src/main/bubble/BubbleController.ts`, lines 408–418](../../apps/desktop/src/main/bubble/BubbleController.ts#L408-L418)

```ts
/** The end of a fall: standing, collapsed, and opening if that was asked for. */
private settle(): void {
  this.stopTicker()
  this.position = this.rest()
  this.placeWindows()
  this.setMode('collapsed')
  if (this.expandAfterReturn) {
    this.expandAfterReturn = false
    this.expand()
  }
}
```

<!-- /code -->

As its comment says, the end of a fall. `fall()` calls it when the character lands.

- `this.stopTicker()`: the animation is over.
- `this.position = this.rest()`: the character is put exactly where it stands (the last frame was
  probably just short). `placeWindows()` moves the hidden panel next to it, ready to open.
- `this.setMode('collapsed')`: the pose goes back to `idle`, and the wait for the character's next
  activity starts (see `setMode()`).
- `if (this.expandAfterReturn)`: something asked to open the panel during the fall (see
  `expand()`). The flag is cleared, then `expand()` runs from `collapsed` as normal.

### `BubbleController.zone()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.zone -->

[`src/main/bubble/BubbleController.ts`, lines 420–424](../../apps/desktop/src/main/bubble/BubbleController.ts#L420-L424)

```ts
/** How far from its corner it wanders on its display: further when she's bigger. */
private zone(): number {
  const zone = WANDER.zone * Math.max(1, this.scale)
  return Math.min(zone, maxInset(this.display().workArea, this.scale))
}
```

<!-- /code -->

The zone: how far from its corner the character wanders. As the comment says, it's further when
she's bigger: 240 DIPs (`WANDER.zone` in `wander.ts`) at her usual size, times her size above that
(480 at twice her size), or less on a work area too narrow for that (`maxInset()` in `layout.ts`,
at her size). `fall()` uses it to decide whether to walk back after a drop, and `doActivity()` to
choose where to walk.

- `Math.max(1, this.scale)`: only the bigger sizes widen it. Smaller than usual, she keeps the
  full 240 DIPs.

### `BubbleController.scheduleActivity()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.scheduleActivity -->

[`src/main/bubble/BubbleController.ts`, lines 426–431](../../apps/desktop/src/main/bubble/BubbleController.ts#L426-L431)

```ts
/** Waits a while, then does something on its own (see doActivity). Collapsed only. */
private scheduleActivity(first: boolean): void {
  this.cancelActivity()
  if (this.mode !== 'collapsed') return
  this.idleTimer = setTimeout(() => this.doActivity(), activityDelay(this.random, first))
}
```

<!-- /code -->

Starts the wait before the character does something on its own. It's called by `start()`, by
`setMode()` whenever the mode goes back to `collapsed`, at the end of every walk and fidget, and by
`displayChanged()`.

- `this.cancelActivity()`: never two waits at once; an earlier one (or the end of a fidget) is
  dropped.
- `if (this.mode !== 'collapsed') return`: as the comment says, collapsed only. While the panel is
  open, or the character is being moved about, it does nothing on its own.
- `activityDelay(this.random, first)`: a random wait, 5 to 12 seconds the first time after
  `start()` and 8 to 20 seconds after that (`wander.ts`).
- `setTimeout(() => this.doActivity(), ...)`: the timer is kept in `idleTimer`, so anything that
  stops the character's own activity can cancel it.

### `BubbleController.doActivity()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.doActivity -->

[`src/main/bubble/BubbleController.ts`, lines 433–449](../../apps/desktop/src/main/bubble/BubbleController.ts#L433-L449)

```ts
private doActivity(): void {
  this.idleTimer = null
  if (this.mode !== 'collapsed') return
  const idleMs = this.now() - this.lastInteraction
  const activity = nextActivity(idleMs, this.inset, this.zone(), this.random, this.lastFidget)
  if (activity.kind === 'walk') {
    this.walkTo(activity.to)
    return
  }
  this.lastFidget = activity.pose
  this.setPose(activity.pose)
  this.idleTimer = setTimeout(() => {
    this.idleTimer = null
    this.setPose('idle')
    this.scheduleActivity(false)
  }, FIDGET_MS[activity.pose])
}
```

<!-- /code -->

The wait is over: the character does one thing on its own, a walk or a fidget, and when that's
done, waits for the next.

- `this.idleTimer = null`: the timer has fired, so nothing is pending.
- `if (this.mode !== 'collapsed') return`: a safety check. Leaving `collapsed` cancels the timer
  anyway.
- `const idleMs = this.now() - this.lastInteraction`: how long since the user last did something
  (the last change of mode). `nextActivity()` in `wander.ts` only offers a fidget once this is 30
  seconds or more; before that it always walks. A fidget is livelier than a stroll, so it's kept
  for a quiet spell: just after someone has used the character, it only strolls.
- `nextActivity(idleMs, this.inset, this.zone(), this.random, this.lastFidget)`: what to do next,
  from where it stands and how far it may wander, and never the fidget it did last.
- `this.walkTo(activity.to)`: a walk, to the inset `nextActivity()` chose. The walk waits for the
  next activity itself when it arrives.
- `this.lastFidget = activity.pose`: a fidget, remembered so the next one is different.
- `this.setPose(activity.pose)`: the page plays the fidget's animation once, and the character
  doesn't move.
- `this.idleTimer = setTimeout(() => {`: the fidget's end goes in `idleTimer` too, so anything
  that stops the character's own activity also stops this. When it fires, the pose goes back to
  `idle` and the next wait starts.
- `FIDGET_MS[activity.pose]`: how long the fidget lasts, from 1.2 s for the hop to 6 s for sitting
  down (`src/shared/character.ts`). The page's frames for each fidget add up to the same numbers
  (see `character/sprite.ts`; a test checks it), so the pose changes back just as the last frame
  ends.

### `BubbleController.walkTo()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.walkTo -->

[`src/main/bubble/BubbleController.ts`, lines 451–472](../../apps/desktop/src/main/bubble/BubbleController.ts#L451-L472)

```ts
/** Walks along the taskbar to `target` (an inset), then waits for the next thing to do. */
private walkTo(target: number): void {
  this.cancelActivity()
  const to = Math.min(Math.max(target, 0), maxInset(this.display().workArea, this.scale))
  if (Math.abs(to - this.inset) < 1) {
    this.scheduleActivity(false)
    return
  }
  // Insets grow toward the middle: from the right-hand corner, that's walking left.
  const inward = to > this.inset
  const left = isLeftCorner(this.anchor.corner) ? !inward : inward
  this.walking = true
  this.setPose(left ? 'walk-left' : 'walk-right')
  this.runTicker((dtMs) => {
    // Her steps are as long as she is big, so she walks faster the bigger she is.
    this.inset = walkStep(this.inset, to, dtMs, WANDER.walkSpeed * this.scale)
    this.moveBubble(this.rest())
    if (this.inset !== to) return
    this.stopWalking()
    this.scheduleActivity(false)
  })
}
```

<!-- /code -->

A walk: the character strolls along the taskbar to another inset at walking speed (80 DIPs a
second at her usual size, times her size), with its window moved a frame at a time. `doActivity()` calls it for a stroll, and
`fall()` to walk back after a drop far from the corner. The mode stays `collapsed` throughout, so
the rest of the controller treats a walking character like a standing one: a click opens the
panel, a press and move picks it up.

- `this.cancelActivity()`: drops any pending wait; the walk starts the next one when it ends.
- `Math.min(Math.max(target, 0), maxInset(this.display().workArea, this.scale))`: keeps the
  target on the taskbar, at her size.
- `if (Math.abs(to - this.inset) < 1)`: already there, give or take a DIP: no walk, just wait for
  the next thing to do.
- `const inward = to > this.inset`: whether it's walking toward the middle of the screen. As the
  comment says, from the right-hand corner that's walking left; from the left-hand corner it's
  walking right. `left` turns that into a direction on the screen, so the figure faces the way it
  goes (`walk-left` or `walk-right`).
- `this.walking = true`: marks the ticker as a walk's, for `stopWalking()`.
- `this.runTicker((dtMs) => {`: the same 60 fps ticker as the other animations. Each frame,
  `walkStep()` (`wander.ts`) moves the inset closer to `to` by the real time since the last frame,
  and `this.moveBubble(this.rest())` puts the window there. Only the bubble window moves; the panel
  is hidden while collapsed.
- `WANDER.walkSpeed * this.scale`: as the comment says, her steps are as long as she is big, so
  she walks faster the bigger she is: 160 DIPs a second at twice her size, 40 at half. The page
  plays the same walk at every size, so each stride covers more ground the bigger she's drawn.
- `if (this.inset !== to) return`: `walkStep()` never goes past `to`, and returns exactly `to` on
  the last step, so comparing with `!==` is safe.
- `this.stopWalking()`, then `this.scheduleActivity(false)`: arrived: standing idle, the panel
  moved next to it, and waiting for the next thing to do.

### `BubbleController.stopWalking()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.stopWalking -->

[`src/main/bubble/BubbleController.ts`, lines 474–482](../../apps/desktop/src/main/bubble/BubbleController.ts#L474-L482)

```ts
/** Stops a walk where it is, standing idle, with the panel moved to open from there. */
private stopWalking(): void {
  if (!this.walking) return
  this.walking = false
  this.stopTicker()
  this.position = this.rest()
  this.placeWindows()
  this.setPose('idle')
}
```

<!-- /code -->

Ends a walk cleanly, wherever the character has got to. This is how a walk is interrupted:
`setMode()` calls it (through `stopIdling()`) whenever the mode leaves `collapsed`, and so does
`displayChanged()`. The end of a walk uses it too.

- `if (!this.walking) return`: does nothing unless a walk is under way. `walking` says the ticker
  belongs to a walk, so this never stops some other animation.
- `this.stopTicker()`: no more steps.
- `this.position = this.rest()`, `this.placeWindows()`: the character stands at the inset it has
  reached, and the hidden panel is moved to open from there. A walk moves only the bubble window
  (`moveBubble()`), so the panel was still where the walk began; without this it would open beside
  the spot the character had walked away from.
- `this.setPose('idle')`: standing again. A mode change then sets whatever pose it needs, such as
  `dragged`.

### `BubbleController.stopIdling()`, `cancelActivity()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.stopIdling,cancelActivity -->

[`src/main/bubble/BubbleController.ts`, lines 484–494](../../apps/desktop/src/main/bubble/BubbleController.ts#L484-L494)

```ts
/** Stops whatever it was doing on its own: the next activity, a fidget, a walk. */
private stopIdling(): void {
  this.cancelActivity()
  this.stopWalking()
  if (isFidget(this.pose)) this.setPose('idle')
}

private cancelActivity(): void {
  if (this.idleTimer) clearTimeout(this.idleTimer)
  this.idleTimer = null
}
```

<!-- /code -->

- `stopIdling`: as its comment says, stops whatever the character was doing on its own. Cancelling
  the timer drops both the wait for the next activity and the end of a fidget, so a fidget's pose
  is put back to `idle` here (`isFidget()` from `src/shared/character.ts`); a walk is stopped by
  `stopWalking()`, which does the same. `setMode()` calls it whenever the mode leaves `collapsed`
  (and then sets the pose for the new mode), and so does `displayChanged()`.
- `cancelActivity`: like `cancelHide()`, safe to call when nothing is pending.

### `BubbleController.runTicker()`, `stopTicker()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.runTicker,stopTicker -->

[`src/main/bubble/BubbleController.ts`, lines 496–509](../../apps/desktop/src/main/bubble/BubbleController.ts#L496-L509)

```ts
private runTicker(onFrame: (dtMs: number) => void): void {
  this.stopTicker()
  let last = this.now()
  this.ticker = setInterval(() => {
    const now = this.now()
    onFrame(now - last)
    last = now
  }, FRAME_MS)
}

private stopTicker(): void {
  if (this.ticker) clearInterval(this.ticker)
  this.ticker = null
}
```

<!-- /code -->

The 60 fps ticker. It drives every animation (drag, fall and walk), but only one runs at a time.

- `this.stopTicker()`: starting a new animation always replaces the old one, so two can never move
  the window at once. The callers already stop the one before (`endDrag()` stops the drag's before
  the fall, a fall's ends in `settle()`, and a change of mode stops a walk), so this is a safety
  net.
- `this.ticker = setInterval(`: calls the frame function about every 16 ms (`FRAME_MS`).
- `onFrame(now - last)`: Node's timers aren't exact, and can run late when the main process is
  busy, so each frame is told how many milliseconds really passed. The walk uses this to move the
  right distance; the fall works out its progress from when it started instead.
- `if (this.ticker) clearInterval(this.ticker)`: safe to call when nothing is running.

### `BubbleController.moveBubble()`, `placeWindows()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.moveBubble,placeWindows -->

[`src/main/bubble/BubbleController.ts`, lines 511–521](../../apps/desktop/src/main/bubble/BubbleController.ts#L511-L521)

```ts
private moveBubble(position: Point): void {
  this.position = position
  this.deps.bubble.setBounds(bubbleWindowBounds(position, this.scale))
}

private placeWindows(): void {
  this.deps.bubble.setBounds(bubbleWindowBounds(this.position, this.scale))
  this.deps.panel.setBounds(
    panelWindowBounds(this.position, this.deps.actionCount, this.anchor.corner, this.scale),
  )
}
```

<!-- /code -->

- `moveBubble`: changes the position and moves only the bubble window. Animations call it every
  frame; the panel is hidden during them, so moving it too would be wasted work. A walk is the one
  that happens while `collapsed`, so `stopWalking()` calls `placeWindows()` when it ends. The
  rectangle includes the window's size, so if her size changed mid-fall, the next frame resizes
  the window too.
- `placeWindows`: positions and sizes both windows for the current position, anchor and size. The
  panel's place depends on the corner, because it always opens toward the middle of the screen.
- `bubbleWindowBounds(this.position, this.scale)`: turns the character's position (the top-left of
  her box) into her window's rectangle, her padding bigger on every side: an 80×80 box and 8 DIPs
  at her usual size, both times her size otherwise (`layout.ts`).
- `panelWindowBounds(this.position, this.deps.actionCount, this.anchor.corner, this.scale)`: the
  panel's rectangle, which is bigger when she is, since its pieces sit further out (`layout.ts`).

### `BubbleController.setAnchor()`, `cancelHide()`, `setMode()`, `setPose()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.setAnchor,cancelHide,setMode,setPose -->

[`src/main/bubble/BubbleController.ts`, lines 523–553](../../apps/desktop/src/main/bubble/BubbleController.ts#L523-L553)

```ts
private setAnchor(anchor: BubbleAnchor): void {
  if (anchor.displayId === this.anchor.displayId && anchor.corner === this.anchor.corner) return
  this.anchor = anchor
  this.deps.onAnchorChange({ ...anchor })
}

private cancelHide(): void {
  if (this.hideTimer) clearTimeout(this.hideTimer)
  this.hideTimer = null
}

/**
 * Every change of mode is something the user did (or the end of it), so it restarts the quiet
 * spell, stops anything the character was doing on its own, and sets its pose: dangling while
 * it's moved about, standing otherwise. Back to collapsed, it waits to do something again.
 */
private setMode(mode: Mode): void {
  if (mode === this.mode) return
  if (this.mode === 'collapsed') this.stopIdling()
  this.mode = mode
  this.lastInteraction = this.now()
  this.deps.onModeChange(mode)
  this.setPose(mode === 'dragging' || mode === 'returning' ? 'dragged' : 'idle')
  if (mode === 'collapsed') this.scheduleActivity(false)
}

private setPose(pose: Pose): void {
  if (pose === this.pose) return
  this.pose = pose
  this.deps.onPoseChange?.(pose)
}
```

<!-- /code -->

Small helpers, though `setMode()` does more than it used to.

- `if (anchor.displayId === this.anchor.displayId`: dropping the character back near its own
  corner changes nothing, so nothing is saved or broadcast.
- `this.deps.onAnchorChange({ ...anchor })`: passes a copy, so the receiver can't change the
  controller's own anchor.
- `cancelHide`: cancels the panel hide that `collapse()` scheduled, if there is one.
- `if (mode === this.mode) return`: `onModeChange` (a broadcast to both pages) fires only for real
  changes.
- `if (this.mode === 'collapsed') this.stopIdling()`: leaving `collapsed`, for whatever reason,
  stops a walk, a fidget or the wait for one, right where the character is, before the new mode
  takes over. As the comment says, every change of mode is something the user did (a click, a
  drag, a screenshot, the panel closing) or the end of it (landing after a drop).
- `this.lastInteraction = this.now()`: for the same reason, every change of mode restarts the
  quiet spell, so fidgets wait another 30 seconds.
- `this.setPose(...)`: as the comment says, dangling (`dragged`) while it's moved about (dragged,
  or falling after a drop), standing (`idle`) otherwise.
- `if (mode === 'collapsed') this.scheduleActivity(false)`: back to `collapsed`, it starts waiting
  to do something again.
- `setPose`: like `setMode()`, changes the pose and broadcasts it only if it really changed.
  `this.deps.onPoseChange?.(pose)`: `?.` because the callback is optional.

### `bottomOf()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#bottomOf -->

[`src/main/bubble/BubbleController.ts`, lines 556–560](../../apps/desktop/src/main/bubble/BubbleController.ts#L556-L560)

```ts
/** The bottom corner on the same side: the character always stands at the bottom. */
function bottomOf(corner: Corner): Corner {
  if (!isTopCorner(corner)) return corner
  return isLeftCorner(corner) ? 'bottom-left' : 'bottom-right'
}
```

<!-- /code -->

As its comment says, the bottom corner on the same side as `corner`. A plain function after the
class rather than a method, because it needs nothing from the controller. The constructor uses it
on the saved corner: `top-left` becomes `bottom-left`, `top-right` becomes `bottom-right`, and a
bottom corner is returned as it is.

---

## `src/main/bubble/layout.ts`: where the windows go

Pure maths, no Electron. Given a work area and a corner, it works out where the character stands,
how far along the taskbar a position is, which corner a dropped character belongs to, the exact
rectangles of the two windows, and the strip her clones walk in. `BubbleController` and `Clones`
are its only users in the app; `tests/layout.test.ts` checks each function on its own.

Key ideas:

- A position always means the top-left corner of the bubble's _box_ (80×80 DIPs at her usual
  size, `UI.bubbleSize`), not of its window. The bubble window is bigger, `BUBBLE_BOX` = 96×96 at
  her usual size, with 8 DIPs (`UI.bubblePad`) more on every side. The box dates from the round
  logo, which filled it (at 56 DIPs); the character is drawn across the whole window, with its feet
  on the window's bottom edge, but positions and the panel's layout are still measured from the
  box. Only `bubbleWindowBounds()`, `restPosition()` (which puts the window's bottom edge on the
  taskbar) and `cloneStrip()` deal with the difference.
- Every function takes her size, `scale` (a multiple of her usual size, one of `CHARACTER_SIZES`),
  last, and leaves it at 1 (`DEFAULT_SIZE`) when it's left out. As the comment at the top of the
  file says, the box and its padding grow with her (`bubbleMetrics()` in `geometry.ts` gives both
  at a size), but the margin to the screen's side doesn't.
- Along the taskbar, where the character stands is an _inset_: how far it is from its corner,
  growing toward the middle of the screen (see the top of this page). `restPosition()` turns an
  inset into a position, and `insetAt()` turns a position back into an inset.
- Everything is measured from the work area's own `x` and `y`, never from (0, 0), so the same code
  works on a second monitor or with the taskbar at the top or left.
- All sizes come from `UI` in `src/shared/geometry.ts`, which the pages use too, so the window
  sizes and the page layout can't drift apart.

### `maxInset()`

<!-- code: apps/desktop/src/main/bubble/layout.ts#maxInset -->

[`src/main/bubble/layout.ts`, lines 13–20](../../apps/desktop/src/main/bubble/layout.ts#L13-L20)

```ts
// Positions are the top-left corner of the bubble's box (where the character is drawn, inside
// its window's padding), not of its window. `scale` is her size (see CHARACTER_SIZES): the box
// and its padding grow with her, the margin to the screen's side doesn't.

/** How far from its corner the character can stand on this work area and still be wholly on it. */
export function maxInset(workArea: Rect, scale: number = DEFAULT_SIZE): number {
  return Math.max(0, workArea.width - 2 * UI.edgeMargin - bubbleMetrics(scale).size)
}
```

<!-- /code -->

The first lines are the comment at the top of the file, which applies to all of it: positions are
the top-left corner of her box, and `scale` is her size.

The largest inset on a work area: as the comment says, as far from its corner as the character can
stand and still be wholly on it. That's from 16 DIPs (`UI.edgeMargin`) in from one side to 16 DIPs
in from the other, less the box's own width: 1920 − 32 − 80 = 1808 on a 1920-wide screen at her
usual size, and 1920 − 32 − 160 = 1728 at twice it. At that inset the character stands in the
opposite bottom corner, so it could walk the whole width of the taskbar, though it keeps to its
zone.

- `scale: number = DEFAULT_SIZE`: her size, 1 if left out. The other functions take it the same
  way.
- `bubbleMetrics(scale).size`: the width of her box at that size (`geometry.ts`).
- `Math.max(0, ...)`: on a work area too narrow to hold the character at all, 0 rather than a
  negative number.

### `restPosition()`

<!-- code: apps/desktop/src/main/bubble/layout.ts#restPosition -->

[`src/main/bubble/layout.ts`, lines 22–41](../../apps/desktop/src/main/bubble/layout.ts#L22-L41)

```ts
/**
 * Where the character stands: on the taskbar (its window's bottom edge on the work area's), in the
 * bottom corner on `corner`'s side, `inset` along toward the middle of the screen. Only the side
 * of `corner` matters: the character always stands at the bottom.
 */
export function restPosition(
  workArea: Rect,
  corner: Corner = 'bottom-right',
  inset = 0,
  scale: number = DEFAULT_SIZE,
): Point {
  const { size, pad } = bubbleMetrics(scale)
  const along = Math.min(Math.max(inset, 0), maxInset(workArea, scale))
  return {
    x: isLeftCorner(corner)
      ? workArea.x + UI.edgeMargin + along
      : workArea.x + workArea.width - UI.edgeMargin - size - along,
    y: workArea.y + workArea.height - pad - size,
  }
}
```

<!-- /code -->

Where the character stands, as a position (the box's top-left). As the comment says, its window's
bottom edge sits on the work area's bottom edge, which is the top of the taskbar when the taskbar
is along the bottom of the screen (with the taskbar at the top or a side, the character stands on
the bottom edge of the screen instead). Its feet are drawn on the window's bottom edge
(`Character.tsx`), so it looks as if it's standing on the taskbar. That holds at every size: a
bigger character grows up and away from her corner, her feet staying where they were.

- `const { size, pad } = bubbleMetrics(scale)`: her box's width and its padding at her size (80
  and 8 DIPs at her usual size; `geometry.ts`). The braces _destructure_ the two fields into
  variables of the same names.
- `const along = Math.min(Math.max(inset, 0), maxInset(workArea, scale))`: keeps the inset between
  0 and `maxInset()`, so whatever it's given, the character is never off the work area.
- `workArea.x + UI.edgeMargin + along`: from a left corner, 16 DIPs in from the left edge, then
  further right by the inset. `isLeftCorner(corner)` (from `geometry.ts`) is true for `top-left`
  and `bottom-left`. The margin is the same at every size.
- `workArea.x + workArea.width - UI.edgeMargin - size - along`: from a right corner, the box's own
  width is subtracted too, because the position is its left edge; the inset then moves it left,
  toward the middle.
- `y: workArea.y + workArea.height - pad - size`: the same height from either corner. The box's
  bottom is `pad` (8 DIPs at her usual size) above the work area's bottom, so the window's bottom
  edge is exactly on it. As the comment says, only the side of `corner` is used, so a top corner
  gives the bottom one below it.
- `corner: Corner = 'bottom-right'`, `inset = 0`: default values, used if the caller leaves the
  arguments out: right in the bottom-right corner.

### `insetAt()`

<!-- code: apps/desktop/src/main/bubble/layout.ts#insetAt -->

[`src/main/bubble/layout.ts`, lines 43–54](../../apps/desktop/src/main/bubble/layout.ts#L43-L54)

```ts
/** The inset (see restPosition) of a character standing at `x`, kept on the work area. */
export function insetAt(
  workArea: Rect,
  corner: Corner,
  x: number,
  scale: number = DEFAULT_SIZE,
): number {
  const inset = isLeftCorner(corner)
    ? x - (workArea.x + UI.edgeMargin)
    : workArea.x + workArea.width - UI.edgeMargin - bubbleMetrics(scale).size - x
  return Math.min(Math.max(inset, 0), maxInset(workArea, scale))
}
```

<!-- /code -->

The opposite of `restPosition()`: given an `x`, how far along from `corner` that is. `endDrag()`
uses it so a dropped character lands straight below where it was let go.

- The two sides of `isLeftCorner(corner) ? ... : ...` are `restPosition()`'s `x` worked backwards
  for the inset, with her box's width at her size (`bubbleMetrics(scale).size`).
- `Math.min(Math.max(inset, 0), maxInset(workArea, scale))`: kept on the work area, so a character
  dropped partly past the edge of the screen lands in the corner (or at the far end) instead.

### `nearestCorner()`

<!-- code: apps/desktop/src/main/bubble/layout.ts#nearestCorner -->

[`src/main/bubble/layout.ts`, lines 56–60](../../apps/desktop/src/main/bubble/layout.ts#L56-L60)

```ts
/** The bottom corner nearest the character: whichever half of the work area its centre is in. */
export function nearestCorner(workArea: Rect, bubble: Point, scale: number = DEFAULT_SIZE): Corner {
  const centreX = bubble.x + bubbleMetrics(scale).size / 2
  return centreX < workArea.x + workArea.width / 2 ? 'bottom-left' : 'bottom-right'
}
```

<!-- /code -->

Used by `endDrag()`. It splits the work area into a left half and a right half, and returns the
bottom corner on the side the character's centre is in. How high up it was dropped doesn't
matter, because it always lives at the bottom.

- `bubble.x + bubbleMetrics(scale).size / 2`: the centre, not the top-left, so a character across
  the middle line goes to the side most of it is on. Half her box's width at her size: 40 DIPs at
  her usual size.
- `workArea.x + workArea.width / 2`: the middle of this work area, measured from its own `x` (a
  monitor to the left of the main one has negative coordinates).

### `bubbleWindowBounds()`

<!-- code: apps/desktop/src/main/bubble/layout.ts#bubbleWindowBounds -->

[`src/main/bubble/layout.ts`, lines 62–70](../../apps/desktop/src/main/bubble/layout.ts#L62-L70)

```ts
export function bubbleWindowBounds(bubble: Point, scale: number = DEFAULT_SIZE): Rect {
  const { pad, box } = bubbleMetrics(scale)
  return {
    x: Math.round(bubble.x) - pad,
    y: Math.round(bubble.y) - pad,
    width: box,
    height: box,
  }
}
```

<!-- /code -->

The bubble window's rectangle: the padding up and to the left of the box, and the box plus its
padding square. At her usual size that's 8 DIPs and 96×96; at twice it, 16 DIPs and 192×192.

- `const { pad, box } = bubbleMetrics(scale)`: the padding, and the window's width (`box`: her box
  plus the padding on both sides), at her size (`geometry.ts`). Every size in `CHARACTER_SIZES`
  makes both whole numbers.
- `Math.round(bubble.x)`: the fall and the walk produce fractional positions, but a window can
  only be placed on whole pixels.

### `panelWindowBounds()`

<!-- code: apps/desktop/src/main/bubble/layout.ts#panelWindowBounds -->

[`src/main/bubble/layout.ts`, lines 72–89](../../apps/desktop/src/main/bubble/layout.ts#L72-L89)

```ts
/**
 * The panel window shares the bubble window's corner that points into the screen's `corner`, so
 * it extends toward the middle of the screen (left and up from bottom-right, and so on).
 */
export function panelWindowBounds(
  bubble: Point,
  actionCount: number,
  corner: Corner = 'bottom-right',
  scale: number = DEFAULT_SIZE,
): Rect {
  const box = bubbleWindowBounds(bubble, scale)
  const size = panelWindowSize(actionCount, scale)
  return {
    x: isLeftCorner(corner) ? box.x : box.x + box.width - size.width,
    y: isTopCorner(corner) ? box.y : box.y + box.height - size.height,
    ...size,
  }
}
```

<!-- /code -->

The panel window's rectangle. Its size comes from `panelWindowSize()` in `geometry.ts` (big enough
for the chat card at full height, a toast, and the action icons, all further out the bigger she
is), and it's placed so it shares one
corner with the bubble window: the corner that points into the screen's corner. With the bubble
bottom-right, the two windows' bottom-right corners coincide and the panel extends left and up,
toward the middle of the screen. The panel goes wherever the bubble window is, so it opens beside
the character at whatever inset it stands. The `top` corners only matter to this function's maths
now: the character always stands at the bottom, but the panel's layout still works from any
corner.

- `bubbleWindowBounds(bubble, scale)`, `panelWindowSize(actionCount, scale)`: both at her size.
- `isLeftCorner(corner) ? box.x : box.x + box.width - size.width`: in a left corner the left edges
  line up; in a right corner the right edges do. The `y` line does the same for top and bottom.
- `...size`: copies `width` and `height` into the result.

The two windows overlap. The panel's page lays out its content from the shared corner, with the
same offsets for her size (`panelLayout(scale)` in `geometry.ts`), and leaves the bubble's square
empty. Empty parts of the panel are click-through, so the bubble still gets its clicks.

### `cloneStrip()`

<!-- code: apps/desktop/src/main/bubble/layout.ts#cloneStrip -->

[`src/main/bubble/layout.ts`, lines 91–103](../../apps/desktop/src/main/bubble/layout.ts#L91-L103)

```ts
/**
 * Where her clones walk: a strip as tall as her window along the bottom of the work area, its
 * bottom edge on the taskbar, so they stand where she does.
 */
export function cloneStrip(workArea: Rect, scale: number = DEFAULT_SIZE): Rect {
  const { box } = bubbleMetrics(scale)
  return {
    x: workArea.x,
    y: workArea.y + workArea.height - box,
    width: workArea.width,
    height: box,
  }
}
```

<!-- /code -->

The rectangle of the clones' window (see `clones.ts` below). As the comment says, it's a strip as
tall as her window along the bottom of the work area, its bottom edge on the taskbar, so the
clones stand where she does: their page draws each one in a box her window's size, with its feet
on the strip's bottom edge, as hers are on her window's.

- `const { box } = bubbleMetrics(scale)`: her window's width and height at her size, 96 DIPs at
  her usual size.
- `x: workArea.x`, `width: workArea.width`: the whole width of the work area, so the clones can
  walk from one end of the taskbar to the other. Unlike her, they don't keep 16 DIPs from the
  sides.
- `y: workArea.y + workArea.height - box`: the strip's top, a window's height above the bottom of
  the work area.

---

## `src/main/bubble/wander.ts`: strolling, fidgeting and falling

Pure maths and decisions for what the character does on its own while nobody is using it, and for
how it falls after a drop. Nothing here keeps anything between calls or touches a window: `BubbleController` calls these from its timers (`scheduleActivity()`, `doActivity()`,
`walkTo()` and `fall()`), and `tests/wander.test.ts` checks each one directly. As the comment at the
top of the file says, positions along the taskbar are insets (see `restPosition()` above).

### `WANDER`

<!-- code: apps/desktop/src/main/bubble/wander.ts#WANDER -->

[`src/main/bubble/wander.ts`, lines 4–23](../../apps/desktop/src/main/bubble/wander.ts#L4-L23)

```ts
// What the character does on its own while nobody is using it, and how it falls when dropped.
// Positions along the taskbar are "insets": how far the character stands from its corner (0 is
// right in the corner, growing toward the middle of the screen).

export const WANDER = {
  /** How far from its corner the character wanders (DIP). */
  zone: 240,
  /** Walking speed (DIP per second). */
  walkSpeed: 80,
  /** Shorter walks aren't worth it. */
  minWalk: 40,
  /** The first thing it does after settling comes this long after (ms, from-to)... */
  firstDelay: [5000, 12000],
  /** ...and then one thing every so often. */
  delay: [8000, 20000],
  /** Fidgets only once it's been left alone this long (ms). */
  fidgetAfter: 30_000,
  /** Falling after a drop (DIP per second squared). */
  gravity: 2500,
} as const
```

<!-- /code -->

Every number that sets how the character behaves on its own, in one place so they're easy to
tune. `as const` makes them read-only, and keeps each pair a fixed pair of numbers.

- `zone: 240`: as the comment says, how far from its corner the character wanders: the first 240
  DIPs of taskbar from its corner, at her usual size. `BubbleController.zone()` makes it wider
  when she's bigger, and smaller on a screen too narrow for that.
- `walkSpeed: 80`: DIPs per second, an unhurried stroll, at her usual size (`walkTo()` multiplies
  it by her size). Crossing the whole zone takes 3 seconds, at any size of 1 or more, since the
  zone grows with her too.
- `minWalk: 40`: as the comment says, shorter walks aren't worth it. Every walk covers at least
  this much, unless the zone is too small for that (see `walkTarget()`).
- `firstDelay: [5000, 12000]`, `delay: [8000, 20000]`: as the comments say, the first thing it
  does comes 5 to 12 seconds after it settles, and then one thing every 8 to 20 seconds, picked at
  random within those ranges each time. Only `start()` uses the first range; every later wait,
  including after the panel closes or the character lands, uses the second.
- `fidgetAfter: 30_000`: fidgets only once it's been left alone for 30 seconds. The `_` is only a
  separator, to make the number easier to read.
- `gravity: 2500`: how fast a dropped character speeds up as it falls, in DIPs per second per
  second. A drop of 800 DIPs (most of a 1080-pixel screen) takes 0.8 seconds.

### `Activity`

<!-- code: apps/desktop/src/main/bubble/wander.ts#Activity -->

[`src/main/bubble/wander.ts`, line 25](../../apps/desktop/src/main/bubble/wander.ts#L25)

```ts
export type Activity = { kind: 'walk'; to: number } | { kind: 'fidget'; pose: Fidget }
```

<!-- /code -->

What `nextActivity()` decides: a walk to an inset (`to`), or a fidget (`pose`). A
tagged union, like several types in `src/shared/types.ts`: checking `kind` tells TypeScript which
of the two other fields there is. `Fidget` is from `src/shared/character.ts`.

### `activityDelay()`

<!-- code: apps/desktop/src/main/bubble/wander.ts#activityDelay -->

[`src/main/bubble/wander.ts`, lines 27–31](../../apps/desktop/src/main/bubble/wander.ts#L27-L31)

```ts
/** How long until the next thing the character does on its own (ms). */
export function activityDelay(random: () => number, first: boolean): number {
  const [from, to] = first ? WANDER.firstDelay : WANDER.delay
  return from + random() * (to - from)
}
```

<!-- /code -->

How long the character waits before doing something on its own, in milliseconds.

- `const [from, to] = first ? WANDER.firstDelay : WANDER.delay`: picks the range and
  _destructures_ the pair into two variables.
- `from + random() * (to - from)`: anywhere in the range, with every point equally likely.
  `random()` gives a number from 0 to 1; with the tests' 0.5 it's the middle, 8.5 seconds the first
  time and 14 seconds after that.

### `nextActivity()`

<!-- code: apps/desktop/src/main/bubble/wander.ts#nextActivity -->

[`src/main/bubble/wander.ts`, lines 33–51](../../apps/desktop/src/main/bubble/wander.ts#L33-L51)

```ts
/**
 * What to do next, after being left alone for `idleMs`, standing `inset` from her corner with
 * room to wander up to `zone` (WANDER.zone, or less on a narrow screen). Until she's been alone a
 * while she only strolls about; after that, more often than not she does one of her fidgets
 * instead, any but the one she did last (`last`), so she doesn't repeat herself.
 */
export function nextActivity(
  idleMs: number,
  inset: number,
  zone: number,
  random: () => number,
  last?: Fidget,
): Activity {
  if (idleMs >= WANDER.fidgetAfter && random() < 0.6) {
    const choices = FIDGETS.filter((fidget) => fidget !== last)
    return { kind: 'fidget', pose: choices[Math.floor(random() * choices.length)]! }
  }
  return { kind: 'walk', to: walkTarget(inset, zone, random()) }
}
```

<!-- /code -->

Chooses the next thing to do. As the comment says, until the character has been left alone a
while it only strolls about. After that, six times in ten it does one of its fidgets, any but the
one it did last, and otherwise it still strolls. The fidgets are the livelier things it does, so
they wait for a quiet spell rather than starting up while someone has just been using it.

- `idleMs >= WANDER.fidgetAfter && random() < 0.6`: `idleMs` is the time since the last change of
  mode (`BubbleController.lastInteraction`). Once that's long enough, one roll decides between a
  fidget (below 0.6) and a walk. `&&` stops at a false left side, so until then there's no roll.
- `last?: Fidget`: the fidget it did last (`BubbleController.lastFidget`), or `undefined` if it
  hasn't done one yet. The `?` makes the parameter optional.
- `FIDGETS.filter((fidget) => fidget !== last)`: every fidget but that one, so it never does the
  same one twice in a row. With no `last`, all ten are choices.
- `choices[Math.floor(random() * choices.length)]!`: a second roll picks one, each equally likely.
  `random() * choices.length` is somewhere from 0 to just under the number of choices, and
  `Math.floor()` rounds it down to a whole number, an index into the list. The `!` tells
  TypeScript there's an item there, which it can't work out from an index.
- `walkTarget(inset, zone, random())`: a fresh `random()` picks where to walk, so the choices
  don't depend on each other.

### `walkTarget()`

<!-- code: apps/desktop/src/main/bubble/wander.ts#walkTarget -->

[`src/main/bubble/wander.ts`, lines 53–65](../../apps/desktop/src/main/bubble/wander.ts#L53-L65)

```ts
/**
 * Somewhere else in the zone to walk to, at least WANDER.minWalk away when the zone allows: `roll`
 * (0–1) picks the spot among those that are far enough.
 */
export function walkTarget(inset: number, zone: number, roll: number): number {
  const from = Math.min(Math.max(inset, 0), zone)
  // The stretches of the zone far enough away: before the character, and after it.
  const before = Math.max(0, from - WANDER.minWalk)
  const after = Math.max(0, zone - (from + WANDER.minWalk))
  if (before + after === 0) return zone - from > from ? zone : 0 // a tiny zone: the far end
  const along = roll * (before + after)
  return along < before ? along : from + WANDER.minWalk + (along - before)
}
```

<!-- /code -->

Where to walk: anywhere in the zone at least 40 DIPs (`minWalk`) from where the character stands,
toward its corner or away from it, with `roll` choosing the spot.

- `const from = Math.min(Math.max(inset, 0), zone)`: where it stands, pulled into the zone first. A
  character standing beyond the zone (dropped further out) counts as standing at its far edge, so
  the target is always back inside the zone.
- `before`, `after`: as the comment says, the stretches of the zone that are far enough away: from
  the corner to 40 short of the character, and from 40 past it to the end of the zone. Either can
  be empty, for example when it stands in the corner.
- `if (before + after === 0)`: as the comment says, a zone too small to have anywhere 40 DIPs away
  (on a very narrow screen): it walks to whichever end of the zone is further.
- `const along = roll * (before + after)`: `roll` picks a point along the two stretches laid end to
  end, so every allowed spot is equally likely.
- `along < before ? along : from + WANDER.minWalk + (along - before)`: inside the first stretch,
  that point is the inset itself; past it, the rest is measured on from the start of the second
  stretch. For example, standing 140 from the corner with a roll of 0.5, the stretches are 0 to 100
  and 180 to 240 (160 DIPs in all), and the point halfway along them is 80.

### `walkStep()`

<!-- code: apps/desktop/src/main/bubble/wander.ts#walkStep -->

[`src/main/bubble/wander.ts`, lines 67–79](../../apps/desktop/src/main/bubble/wander.ts#L67-L79)

```ts
/**
 * One frame of walking: `dtMs` closer to `to` at `speed` (DIP per second; WANDER.walkSpeed at her
 * usual size), never past it.
 */
export function walkStep(
  from: number,
  to: number,
  dtMs: number,
  speed: number = WANDER.walkSpeed,
): number {
  const step = (speed * Math.min(Math.max(dtMs, 0), 100)) / 1000
  return to > from ? Math.min(to, from + step) : Math.max(to, from - step)
}
```

<!-- /code -->

One frame of a walk: the new inset, `dtMs` milliseconds of walking closer to `to`.

- `speed: number = WANDER.walkSpeed`: as the comment says, DIPs per second, which is
  `WANDER.walkSpeed` at her usual size. `walkTo()` passes `WANDER.walkSpeed * scale`, so she walks
  faster the bigger she is; left out, it's the usual speed.
- `Math.min(Math.max(dtMs, 0), 100)`: the elapsed time is kept between 0 and 100 ms, so after a
  stall the character carries on from where it was instead of jumping.
- `(speed * ...) / 1000`: speed in DIPs per second times seconds is the distance.
- `Math.min(to, from + step)` and `Math.max(to, from - step)`: never past the target in either
  direction. The last step lands exactly on it, which is how `walkTo()` knows it has arrived.

### `fallDuration()`

<!-- code: apps/desktop/src/main/bubble/wander.ts#fallDuration -->

[`src/main/bubble/wander.ts`, lines 81–89](../../apps/desktop/src/main/bubble/wander.ts#L81-L89)

```ts
/**
 * How long the fall from `from` to `to` takes (ms): as long as gravity takes to drop that far, or
 * a short hop when it was dropped below where it stands (over the taskbar).
 */
export function fallDuration(from: Point, to: Point): number {
  const drop = to.y - from.y
  if (drop <= 0) return 200
  return Math.max(150, Math.sqrt((2 * drop) / WANDER.gravity) * 1000)
}
```

<!-- /code -->

How long the fall after a drop takes, in milliseconds.

- `Math.sqrt((2 * drop) / WANDER.gravity) * 1000`: something dropped from rest falls `½ × g × t²`
  in time `t`, so falling a distance `drop` takes `√(2 × drop / g)` seconds, turned into
  milliseconds here.
- `Math.max(150, ...)`: a short drop still takes 150 ms, so the landing can be seen.
- `if (drop <= 0) return 200`: as the comment says, dropped below where it stands (over the
  taskbar itself), it hops up onto it in 200 ms instead.

### `fallPosition()`

<!-- code: apps/desktop/src/main/bubble/wander.ts#fallPosition -->

[`src/main/bubble/wander.ts`, lines 91–97](../../apps/desktop/src/main/bubble/wander.ts#L91-L97)

```ts
/** Position at progress `t` (0–1) of the fall: speeding up as it falls, like a dropped thing. */
export function fallPosition(from: Point, to: Point, t: number): Point {
  const progress = Math.min(Math.max(t, 0), 1)
  const falling = to.y > from.y
  const eased = falling ? progress ** 2 : 1 - (1 - progress) ** 2
  return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * eased }
}
```

<!-- /code -->

Where the character is at progress `t` of its fall (0 at the start, 1 on the taskbar).

- `Math.min(Math.max(t, 0), 1)`: clamps `t`, so it can never go past where it stands.
- `progress ** 2`: falling, the distance covered grows with the square of the time, which is how a
  dropped thing really falls: a quarter of the way down at half the time, and faster and faster
  after that. It's an _ease-in_: slow to start, then faster and faster.
- `1 - (1 - progress) ** 2`: going up onto the taskbar instead, it slows as it rises, like a hop.
- `from.x + (to.x - from.x) * progress`: sideways at an even pace. Usually `to.x` is the same as
  `from.x` and it falls straight down; they differ only when it was dropped partly past the edge of
  the screen, or the display changed mid-fall.

---

## `src/main/bubble/clones.ts`: her clones

The Clones action: ten of her walk about the taskbar for thirty seconds. This file is the main
process's half of it, and it's small: it opens one window for all the clones, along the bottom of
her display, and closes it again when their time is up. The clones themselves, where each one walks
and when it stops, are worked out by the page in that window (`ClonesView.tsx`, with the maths in
`lib/clones.ts`; see [The pages](7-renderer-pages.md)), so nothing has to go back and forth while
they wander.

Who uses it:

- `src/main/index.ts` creates the one `Clones` in `start()`. It passes the tenant's accent colour,
  and `open`, which makes the window with `createOverlayWindow('clones', …)` (`windows.ts`), shows
  it once its page has drawn, and puts the bubble back in front of it. It calls `stop()` when the
  app quits.
- `src/main/actions.ts` calls `start()` for the Clones icon, with `BubbleController.standing`,
  after closing the panel so the clones can be seen.

Like `BubbleController`, it never imports Electron: windows are made by the `open` function it's
given. `tests/clones.test.ts` passes one that just records what it was asked for, and uses
Vitest's fake timers to check the window closes after exactly thirty seconds.

### `CloneWindow`, `ClonesDeps`

<!-- code: apps/desktop/src/main/bubble/clones.ts#CloneWindow,ClonesDeps -->

[`src/main/bubble/clones.ts`, lines 5–20](../../apps/desktop/src/main/bubble/clones.ts#L5-L20)

```ts
/** A window of clones, as Clones uses it. index.ts makes them (see createOverlayWindow). */
export interface CloneWindow {
  close(): void
}

export interface ClonesDeps {
  /**
   * Opens a window of clones over `bounds`, its page told (in its query string) where she stands
   * in it (`from`, DIPs from its left edge), her size, the accent colour and when they end.
   */
  open(bounds: Rect, query: Record<string, string>): CloneWindow
  /** The tenant's accent colour, for the clones' robes and hats. */
  accentColor: string
  /** Wall-clock time (ms), shared with the page, which fades the clones out at the end. */
  now?: () => number
}
```

<!-- /code -->

What `Clones` needs, passed to its constructor.

- `CloneWindow`: as its comment says, a window of clones as `Clones` uses it, which is only to
  close it. `index.ts` makes the real ones.
- `open(bounds: Rect, query: Record<string, string>): CloneWindow`: as the comment says, opens a
  window of clones over `bounds`, with what its page needs to know in its query string: where she
  stands in it (`from`, in DIPs from the window's left edge), her size, the accent colour, and when
  they end. `Record<string, string>` is an object whose keys and values are all strings, as a query
  string's are.
- `accentColor: string`: the tenant's accent colour (`accentColor` in `tenant.json`). Her robe and
  hat are drawn in it, so the clones' are too. The clones' window doesn't get the app state like
  the other two pages, so it's passed in the query string.
- `now?: () => number`: as the comment says, the wall-clock time in milliseconds, shared with the
  page: `ends` is a `Date.now()` time, and the page compares it with its own `Date.now()` to fade
  the clones out just before the window closes. Tests pass a fixed clock.

### `Clones`

<!-- code: apps/desktop/src/main/bubble/clones.ts#Clones.class -->

[`src/main/bubble/clones.ts`, lines 22–29](../../apps/desktop/src/main/bubble/clones.ts#L22-L29)

```ts
/**
 * Her clones (the Clones action): CLONES.count of her, for CLONES.durationMs, walking about the
 * taskbar of her display at her size and stopping now and then (the page in the window decides
 * where; see ClonesView). They're all in one window along the bottom of the screen, which never
 * takes the mouse or the focus: they have no panel, and clicks go to whatever is under them. The
 * window closes once their time is up; asking again before then starts a new lot.
 */
export class Clones {
  // …
}
```

<!-- /code -->

As the comment says: `CLONES.count` of her (10), for `CLONES.durationMs` (30 seconds; both in
`src/shared/character.ts`), walking about the taskbar of her display at her size and stopping now
and then. They're all in one window along the bottom of the screen, which never takes the mouse or
the focus, so they have no panel and clicks go to whatever is under them. Asking for clones again
while some are still out starts a new lot. Its fields and constructor:

<!-- code: apps/desktop/src/main/bubble/clones.ts#Clones.current,constructor,running -->

[`src/main/bubble/clones.ts`, lines 30–36](../../apps/desktop/src/main/bubble/clones.ts#L30-L36)

```ts
private current: { window: CloneWindow; timer: ReturnType<typeof setTimeout> } | null = null

constructor(private readonly deps: ClonesDeps) {}

get running(): boolean {
  return this.current !== null
}
```

<!-- /code -->

- `private current: { window: CloneWindow; timer: ReturnType<typeof setTimeout> } | null = null`:
  the clones out now, if any: their window, and the timer that closes it. `null` when there are
  none.
- `constructor(private readonly deps: ClonesDeps) {}`: the same shorthand as in
  `BubbleController`: it stores the argument in a field called `deps`, and there's nothing else to
  do.
- `get running(): boolean`: whether there are clones out now. Only the tests read it.

### `Clones.start()`

<!-- code: apps/desktop/src/main/bubble/clones.ts#Clones.start -->

[`src/main/bubble/clones.ts`, lines 38–50](../../apps/desktop/src/main/bubble/clones.ts#L38-L50)

```ts
/** Clones of her where she stands (`standing` from BubbleController), for their time. */
start(standing: { workArea: Rect; bounds: Rect; scale: number }): void {
  this.stop()
  const strip = cloneStrip(standing.workArea, standing.scale)
  const window = this.deps.open(strip, {
    from: String(Math.round(standing.bounds.x - strip.x)),
    scale: String(standing.scale),
    accent: this.deps.accentColor,
    ends: String((this.deps.now ?? Date.now)() + CLONES.durationMs),
  })
  const timer = setTimeout(() => this.stop(), CLONES.durationMs)
  this.current = { window, timer }
}
```

<!-- /code -->

As its comment says, clones of her where she stands, for their time.

- `standing: { workArea: Rect; bounds: Rect; scale: number }`: `BubbleController.standing`: her
  display's work area, her window's rectangle and her size.
- `this.stop()`: any clones still out go first, so starting again replaces the old lot rather than
  adding a second window, and the new lot gets the full thirty seconds.
- `cloneStrip(standing.workArea, standing.scale)`: the window's rectangle (`layout.ts`): the whole
  width of the work area, as tall as her window, with its bottom edge on the taskbar, so the clones
  stand where she does.
- `from: String(Math.round(standing.bounds.x - strip.x))`: where she stands, as the distance from
  the strip's left edge to her window's, so the clones set off from her. The window and the strip
  start at the same `x` as the work area, so this works on any display. `String()` because a query
  string is text.
- `scale: String(standing.scale)`: her size, so the clones are drawn as big as she is.
- `accent: this.deps.accentColor`: the colour of their robes and hats.
- `ends: String((this.deps.now ?? Date.now)() + CLONES.durationMs)`: when their time is up, on the
  wall clock. `(this.deps.now ?? Date.now)()` picks the clock first, then calls it.
- `setTimeout(() => this.stop(), CLONES.durationMs)`: closes the window when their time is up.
- `this.current = { window, timer }`: kept so `stop()` can close the window and cancel the timer.

### `Clones.stop()`

<!-- code: apps/desktop/src/main/bubble/clones.ts#Clones.stop -->

[`src/main/bubble/clones.ts`, lines 52–58](../../apps/desktop/src/main/bubble/clones.ts#L52-L58)

```ts
/** Closes the clones' window now, if there is one. */
stop(): void {
  if (!this.current) return
  clearTimeout(this.current.timer)
  this.current.window.close()
  this.current = null
}
```

<!-- /code -->

As its comment says, closes the clones' window now, if there is one. The timer calls it when their
time is up, `start()` calls it before a new lot, and `index.ts` calls it when the app quits.

- `if (!this.current) return`: safe to call when there are no clones.
- `clearTimeout(this.current.timer)`: when it's stopped early, the old timer mustn't fire later and
  close a newer lot's window.
- `this.current.window.close()`: in `index.ts`, this destroys the window, if it hasn't been
  destroyed already.

---

## `src/main/bubble/vision.ts`: the light and the logo of her vision

One of her habits, `vision`, reaches beyond her own window: a light shines down from the top of the
screen, the company's logo comes down it to hover over her head, she looks up at it, and then it
rises away again. Her own animation (looking up, her arms opening) is played in the bubble's window
like any other habit; the light and the logo need a taller window, a column above her. This file
opens and closes that window. It's built like `clones.ts` above: the page in the window
(`VisionView.tsx`; see [The pages](7-renderer-pages.md)) does the drawing, in time with her, from
the timetable in `VISION` (`src/shared/character.ts`).

Who uses it:

- `src/main/index.ts` creates the one `Vision` in `start()`, with an `open` that makes the window
  (the same `openOverlay` as the clones', with `createOverlayWindow('vision', …)`). Its
  `onPoseChange` calls `start()` with `BubbleController.standing` when her pose becomes `vision`,
  and `stop()` on any other pose. It also calls `stop()` when the app quits.

The controller knows nothing about it: it only sets the pose, as for any habit, and `index.ts`
connects the two. `tests/vision.test.ts` checks `visionBounds()` and `Vision` with a fake `open`
and fake timers.

### `VisionWindow`, `VisionDeps`

<!-- code: apps/desktop/src/main/bubble/vision.ts#VisionWindow,VisionDeps -->

[`src/main/bubble/vision.ts`, lines 4–17](../../apps/desktop/src/main/bubble/vision.ts#L4-L17)

```ts
/** The vision's window, as Vision uses it. index.ts makes it (see createOverlayWindow). */
export interface VisionWindow {
  close(): void
}

export interface VisionDeps {
  /**
   * Opens the vision's window over `bounds`, its page told (in its query string) her size, where
   * her middle is across it (DIPs from its left edge) and when the vision started.
   */
  open(bounds: Rect, query: Record<string, string>): VisionWindow
  /** Wall-clock time (ms), shared with the page, which keeps in time with her from it. */
  now?: () => number
}
```

<!-- /code -->

What `Vision` needs, as for `Clones`.

- `VisionWindow`: as its comment says, the vision's window as `Vision` uses it: only to close it.
- `open(bounds: Rect, query: Record<string, string>): VisionWindow`: as the comment says, opens
  the window over `bounds`, with its page told her size, where her middle is across the window (in
  DIPs from its left edge), and when the vision started.
- `now?: () => number`: as the comment says, the wall-clock time in milliseconds, shared with the
  page, which keeps in time with her from the moment the vision started, even if the page took a
  moment to load. Tests pass a fixed clock.

### `visionBounds()`

<!-- code: apps/desktop/src/main/bubble/vision.ts#visionBounds -->

[`src/main/bubble/vision.ts`, lines 19–32](../../apps/desktop/src/main/bubble/vision.ts#L19-L32)

```ts
/**
 * Where the vision is drawn: a column above her, from the top of her display's work area down to
 * her feet, two and a half times as wide as her window and centred on her (kept on the work
 * area), so the light can fall from the top of the screen and the logo come down over her head.
 */
export function visionBounds(workArea: Rect, bounds: Rect): Rect {
  const width = Math.min(Math.round(bounds.width * 2.5), workArea.width)
  const centre = bounds.x + bounds.width / 2
  const x = Math.min(
    Math.max(Math.round(centre - width / 2), workArea.x),
    workArea.x + workArea.width - width,
  )
  return { x, y: workArea.y, width, height: bounds.y + bounds.height - workArea.y }
}
```

<!-- /code -->

Where the vision's window goes, given her display's work area and her window's rectangle. As the
comment says, it's a column above her: from the top of the work area down to her feet, two and a
half times as wide as her window, centred on her, so the light can fall from the top of the screen
and the logo come down over her head. At her usual size it's 240 DIPs wide (96 × 2.5); at twice
her size, 480.

- `Math.min(Math.round(bounds.width * 2.5), workArea.width)`: the width, never wider than the work
  area.
- `const centre = bounds.x + bounds.width / 2`: her middle, across the screen.
- `Math.min(Math.max(Math.round(centre - width / 2), workArea.x), workArea.x + workArea.width - width)`:
  the column's left edge, half its width to the left of her middle, but kept on the work area. In a
  corner she's then off-centre in the column, which is why the page is told where her middle is.
- `y: workArea.y`, `height: bounds.y + bounds.height - workArea.y`: from the top of the work area
  to the bottom of her window, where her feet are.

### `Vision`

<!-- code: apps/desktop/src/main/bubble/vision.ts#Vision.class -->

[`src/main/bubble/vision.ts`, lines 34–40](../../apps/desktop/src/main/bubble/vision.ts#L34-L40)

```ts
/**
 * Her `vision` habit's light and logo (see VISION): a window that never takes the mouse or the
 * focus, behind her own, for as long as she's having it. index.ts starts it when her pose becomes
 * `vision` and stops it when the pose changes (the habit ends, or someone clicks her); it also
 * closes itself once the habit's time is up, in case nothing does.
 */
export class Vision {
  // …
}
```

<!-- /code -->

As the comment says: the light and the logo of her `vision` habit, in a window that never takes
the mouse or the focus, behind her own window, for as long as she's having it. `index.ts` starts
it when her pose becomes `vision` and stops it when the pose changes, whether the habit has ended
or someone has clicked or picked her up. It also closes itself once the habit's time is up, in
case nothing else does. Its fields and constructor are the same as `Clones`':

<!-- code: apps/desktop/src/main/bubble/vision.ts#Vision.current,constructor,running -->

[`src/main/bubble/vision.ts`, lines 41–47](../../apps/desktop/src/main/bubble/vision.ts#L41-L47)

```ts
private current: { window: VisionWindow; timer: ReturnType<typeof setTimeout> } | null = null

constructor(private readonly deps: VisionDeps) {}

get running(): boolean {
  return this.current !== null
}
```

<!-- /code -->

- `private current`: the window while it's open, and the timer that closes it; `null` otherwise.
- `constructor(private readonly deps: VisionDeps) {}`: stores the argument in a field called
  `deps`.
- `get running(): boolean`: whether the window is open now. Only the tests read it.

### `Vision.start()`

<!-- code: apps/desktop/src/main/bubble/vision.ts#Vision.start -->

[`src/main/bubble/vision.ts`, lines 49–60](../../apps/desktop/src/main/bubble/vision.ts#L49-L60)

```ts
/** The light and the logo over where she stands (`standing` from BubbleController). */
start(standing: { workArea: Rect; bounds: Rect; scale: number }): void {
  this.stop()
  const area = visionBounds(standing.workArea, standing.bounds)
  const window = this.deps.open(area, {
    scale: String(standing.scale),
    centre: String(Math.round(standing.bounds.x + standing.bounds.width / 2 - area.x)),
    starts: String((this.deps.now ?? Date.now)()),
  })
  const timer = setTimeout(() => this.stop(), FIDGET_MS.vision)
  this.current = { window, timer }
}
```

<!-- /code -->

As its comment says, the light and the logo over where she stands.

- `standing`: `BubbleController.standing`: her display's work area, her window's rectangle and her
  size.
- `this.stop()`: a window still open from before is closed first, so there's only ever one.
- `visionBounds(standing.workArea, standing.bounds)`: the column above her (see above).
- `scale: String(standing.scale)`: her size, so the light and the logo are drawn to match her.
- `centre: String(Math.round(standing.bounds.x + standing.bounds.width / 2 - area.x))`: her middle,
  measured from the window's left edge, where the light falls and the logo hovers.
- `starts: String((this.deps.now ?? Date.now)())`: when the vision started, on the wall clock. The
  page measures its place in `VISION`'s timetable from this, so the logo arrives as she looks up.
- `setTimeout(() => this.stop(), FIDGET_MS.vision)`: closes the window after the habit's 5.2
  seconds, in case the pose change that should close it never comes.

### `Vision.stop()`

<!-- code: apps/desktop/src/main/bubble/vision.ts#Vision.stop -->

[`src/main/bubble/vision.ts`, lines 62–68](../../apps/desktop/src/main/bubble/vision.ts#L62-L68)

```ts
/** Closes the window now, if it's open. */
stop(): void {
  if (!this.current) return
  clearTimeout(this.current.timer)
  this.current.window.close()
  this.current = null
}
```

<!-- /code -->

As its comment says, closes the window now, if it's open. `index.ts` calls it on every pose
change but the one to `vision`, so it's usually called with nothing open, which is fine.

- `clearTimeout(this.current.timer)`: an early stop cancels the timer, so it can't close a later
  vision's window.
- `this.current.window.close()`: in `index.ts`, this destroys the window, if it hasn't been
  destroyed already.

---

## `src/main/bubble/windows.ts`: creating the Electron windows

The only file in this folder that uses Electron. It creates the overlay windows, locks them down,
and adapts the bubble's and the panel's to the controller's `Surface` interface. `index.ts` calls
`createOverlayWindow()` twice at startup, once for the bubble and once for the panel, and wraps the
results with `bubbleSurface()` and `panelSurface()` before handing them to `BubbleController`. It
calls it again for each lot of clones, for a window that lasts their thirty seconds, and for each
of her visions, for a window that lasts the habit's 5.2 seconds (see `clones.ts` and `vision.ts`
above).

Key ideas:

- **Four kinds of window, one page.** Every overlay window loads the same renderer page;
  `?view=bubble`, `?view=panel`, `?view=clones` or `?view=vision` in its address tells `main.tsx`
  which UI to draw.
  The bubble has its own tiny window so it never resizes when the panel opens, and only a window
  her size (96×96 at her usual size) moves during a drag, a fall or a walk.
- **Always on top, and kept there.** Both windows stay in front of other apps' windows. They use
  `ON_TOP_LEVEL` rather than Electron's default level, which lost it when the app started behind a
  full-screen app, and `keepOnTop()` puts them back if anything else takes it away.
- **Click-through.** The panel window is a large rectangle (sized for the chat card at its
  tallest), but most of it is transparent. `setIgnoreMouseEvents(true, { forward: true })` makes
  Windows pass clicks on it to whatever is underneath, while still telling the page where the
  pointer is. While the pointer is over a piece of real UI (an element marked `data-hit`), the
  page's `useClickThrough` hook asks the main process to take mouse input again
  (`IPC.setInteractive`, handled in `ipc.ts`). The bubble window is never click-through: it's barely larger than the
  bubble, and relying on Windows' mouse forwarding there made clicks occasionally fall through the
  bubble to the window behind it. The clones' and the vision's windows are the opposite: they
  only show something, so they ignore the mouse altogether, all the time, and can't take the focus
  (`passive()`).

### `View`, `passive()`

<!-- code: apps/desktop/src/main/bubble/windows.ts#View,passive -->

[`src/main/bubble/windows.ts`, lines 7–10](../../apps/desktop/src/main/bubble/windows.ts#L7-L10)

```ts
export type View = 'bubble' | 'panel' | 'clones' | 'vision'

/** Windows that only show something: they never take the mouse or the focus. */
const passive = (view: View) => view === 'clones' || view === 'vision'
```

<!-- /code -->

- `View`: a _union type_: a `View` can only be the string `'bubble'`, `'panel'`, `'clones'` or
  `'vision'`, and TypeScript rejects anything else.
- `passive`: as its comment says, the windows that only show something, the clones' and the
  vision's, which never take the mouse or the focus. `createOverlayWindow()` asks it twice, so
  the two rules can't drift apart.

### `ON_TOP_LEVEL`, `ON_TOP_CHECK_MS`

<!-- code: apps/desktop/src/main/bubble/windows.ts#ON_TOP_LEVEL,ON_TOP_CHECK_MS -->

[`src/main/bubble/windows.ts`, lines 12–23](../../apps/desktop/src/main/bubble/windows.ts#L12-L23)

```ts
/**
 * How the overlay windows stay on top. Electron's default level for always-on-top, "floating",
 * tucks a window just behind the taskbar on Windows. While a full-screen app is in front, Windows
 * takes the taskbar out of the always-on-top group, and a window tucked behind it then loses its
 * own always-on-top too: started that way (say, at sign-in, with a full-screen browser already
 * open), the bubble sat behind everything. From this level up, Electron simply keeps the window
 * on top, taskbar or not.
 */
export const ON_TOP_LEVEL = 'pop-up-menu'

/** How often the overlay windows check they're still on top (see keepOnTop). */
export const ON_TOP_CHECK_MS = 5000
```

<!-- /code -->

How the overlay windows stay in front of everything else. Electron's `setAlwaysOnTop(true, level)`
takes a _level_; the names come from macOS, where they are real window layers. On Windows there is
just "always on top" (the `WS_EX_TOPMOST` style), but Electron treats the lower levels specially:
up to `'status'` it tucks the window in just behind the taskbar.

That caused a bug. With `alwaysOnTop: true` in the window's options, Electron uses its default
level, `'floating'`, one of those. While a full-screen app is in front, Windows takes the taskbar
out of the always-on-top group (so the app can cover it), and Windows' rule is that a window placed
behind one that isn't always on top stops being always on top itself. So if Desktop Assist started
while, say, a full-screen browser was open (as it can at sign-in, when Windows starts it a little
after other apps), both its windows lost always-on-top and the bubble sat behind the user's
windows until something reshuffled them. `'pop-up-menu'` is the lowest level Electron simply keeps
on top, taskbar or not. This was found by starting the app behind a full-screen window and reading
the windows' style: before, neither was on top; now both are.

- `ON_TOP_CHECK_MS`: how often `keepOnTop()` looks.

### `createOverlayWindow()`

<!-- code: apps/desktop/src/main/bubble/windows.ts#createOverlayWindow -->

[`src/main/bubble/windows.ts`, lines 25–90](../../apps/desktop/src/main/bubble/windows.ts#L25-L90)

```ts
/**
 * Creates an overlay window: the bubble, the panel, a window of clones, or the light and logo of
 * her `vision` habit. All are frameless, transparent, always on top and hidden from the taskbar
 * and Alt+Tab. `query` adds to the page's query string (`view` says which page it is).
 *
 * The clones' and the vision's windows never take the mouse or the focus: clicks go straight
 * through them, so they never get in the way.
 *
 * The panel window is mostly see-through, so it's click-through: clicks on its empty areas go to
 * whatever is underneath, and the renderer turns mouse input back on while the pointer is over
 * real UI (see useClickThrough). The bubble window is never click-through: it's barely larger
 * than the bubble, and relying on Windows' mouse forwarding there made clicks occasionally fall
 * through the bubble to the window behind it.
 */
export function createOverlayWindow(
  view: View,
  size: Size,
  query: Record<string, string> = {},
): BrowserWindow {
  const win = new BrowserWindow({
    ...size,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    thickFrame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // Always on top, but at ON_TOP_LEVEL (set below); `alwaysOnTop: true` here would use
    // Electron's default level, which loses it while a full-screen app is in front.
    type: 'toolbar',
    // Both can take the focus. A bubble that couldn't had its mouse presses dropped by Windows /
    // Chromium after clicking elsewhere (only the release arrived, so clicks did nothing).
    // Clicking the bubble now takes the focus from an open panel; BubbleController.clickBubble
    // knows that press closed it. The clones' and the vision's windows never need it.
    focusable: !passive(view),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: view === 'panel',
    },
  })
  win.setAlwaysOnTop(true, ON_TOP_LEVEL)
  lockDown(win, view)
  if (view === 'panel') {
    win.setIgnoreMouseEvents(true, { forward: true })
    addEditContextMenu(win)
  }
  if (passive(view)) win.setIgnoreMouseEvents(true)

  const search = { ...query, view }
  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServer) {
    void win.loadURL(`${devServer}?${new URLSearchParams(search)}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { query: search })
  }
  return win
}
```

<!-- /code -->

Creates one overlay window. `new BrowserWindow({...})` makes a native window with a Chromium page
inside; the options say what kind of window. As the comment says, `query` adds to the page's query
string, and the clones' and the vision's windows never take the mouse or the focus.

- `...size`: the window's `width` and `height`: `BUBBLE_BOX` square for the bubble,
  `panelWindowSize(actionCount)` for the panel, both at her usual size. The controller sizes them
  for her size when it first places them, and again whenever her size changes. For the clones and
  the vision, `index.ts` passes the size of the area asked for (the strip the clones walk in, from
  `cloneStrip()`, or the column over her, from `visionBounds()`), and sets the window's bounds
  straight after.
- `query: Record<string, string> = {}`: more for the page's query string, beside `view`. Only the
  clones' and the vision's windows have any (for the clones, where she stands, her size, the accent
  colour and when they end; for the vision, her size, where her middle is and when it started; see
  `Clones.start()` and `Vision.start()`): their pages don't ask for the app state as the other two
  do.
- `show: false`: created hidden. The controller decides when the bubble and the panel appear, and
  `index.ts` shows the clones' and the vision's windows once their pages have drawn.
- No `alwaysOnTop: true`: the comment explains that would use Electron's default level, which
  loses it while a full-screen app is in front. `win.setAlwaysOnTop(true, ON_TOP_LEVEL)` straight
  after creating the window makes it always on top at a level that keeps it there.
- `transparent: true`: together with `frame: false` (no title bar or border) and a fully
  transparent `backgroundColor` (in `'#00000000'` the last two hex digits are the alpha), only what
  the page draws is visible.
- `thickFrame: false`: Windows-only. The standard resizable frame would bring the system shadow
  and the minimise and maximise animations. With `hasShadow: false`, Windows adds no shadow; the
  page draws its own.
- `type: 'toolbar'`: on Windows, a toolbar window is left out of Alt+Tab. `skipTaskbar: true` keeps
  it off the taskbar too.
- `focusable: !passive(view)`: the bubble and the panel can take the keyboard focus; as the
  comment says, the clones never need it, and nor does the vision, so their windows can't, and
  never take the focus from the app you're working in. The panel must, since you type in it. The bubble used to be unable to
  (`focusable: false`), so that clicking it wouldn't take the
  focus from the panel or from the app you were working in. But, as the comment says, in some
  states (after clicking somewhere else) Windows and Chromium dropped the mouse _press_ on that
  never-focusable window and delivered only the release. The page then saw no `pointerdown` and
  no `click`, so clicks on the bubble did nothing at all, neither opening nor closing the panel.
  This was found by attaching to the running app on a PC where it happened. With a focusable
  bubble every press arrives; the cost is that pressing the bubble now blurs an open panel, which
  `BubbleController.clickBubble()` allows for with the press time.
- `preload: join(__dirname, '../preload/index.js')`: the preload script, which gives the page
  `window.assist`. `__dirname` is the folder of the built main-process file (`out/main`), so this
  points at the built preload in `out/preload`.
- `sandbox: true`: with `contextIsolation: true` and `nodeIntegration: false`, the page runs like
  an ordinary web page: no Node.js, no access to the preload's internals, only what the preload
  hands it. Even hostile code in the page couldn't reach files.
- `backgroundThrottling: false`: Chromium normally slows timers and animation frames in windows it
  thinks are hidden or in the background. These windows are hidden often and must respond at once
  when shown.
- `spellcheck: view === 'panel'`: spell checking only where there's a text box.
- `win.setIgnoreMouseEvents(true, { forward: true })`: the panel starts click-through. The
  `forward` option (Windows and macOS only) keeps sending mouse moves to the page, which is what
  lets `useClickThrough` notice the pointer arriving over real UI.
- `if (passive(view)) win.setIgnoreMouseEvents(true)`: the clones' and the vision's windows are
  click-through for good: clicks go straight through them to whatever is underneath, so they never
  get in the way (a click on her, through the vision's light, still reaches her own window in front
  of it). Without `forward`, their pages aren't told about the mouse at all, which they have no use
  for.
- `const search = { ...query, view }`: the page's query string as an object: whatever the caller
  added, then `view` last, so nothing the caller adds can change which page it is.
- `process.env['ELECTRON_RENDERER_URL']`: set by `electron-vite` during `npm run dev` to the
  address of its dev server, which serves the page with live reloading. `!app.isPackaged` makes
  sure an installed app always loads the page bundled with it.
- `new URLSearchParams(search)`: the browser's class for query strings. Put inside a template
  string, it becomes text like `from=1808&scale=1&accent=%239333EA&…&view=clones`, with each value
  encoded (the `#` of the accent colour becomes `%23`), so the page reads back exactly what was put
  in.
- `{ query: search }`: `loadFile()` adds the same to the built page's address (`?view=bubble`,
  `?view=panel`, or the clones' or the vision's values ending in `view=clones` or `view=vision`).
- `void win.loadURL(`: loading returns a promise that isn't awaited; `void` marks that as
  deliberate.

### `keepOnTop()`

<!-- code: apps/desktop/src/main/bubble/windows.ts#keepOnTop -->

[`src/main/bubble/windows.ts`, lines 92–103](../../apps/desktop/src/main/bubble/windows.ts#L92-L103)

```ts
/**
 * Puts the window back on top if something took that away. Windows can still demote an
 * always-on-top window (another app reordering windows, Explorer restarting), and nothing tells
 * the app when it happens, so the windows check every few seconds; it costs one look at the
 * window's style, and only a window that lost it is moved. Returns a function that stops it.
 */
export function keepOnTop(win: BrowserWindow): () => void {
  const timer = setInterval(() => {
    if (!win.isDestroyed() && !win.isAlwaysOnTop()) win.setAlwaysOnTop(true, ON_TOP_LEVEL)
  }, ON_TOP_CHECK_MS)
  return () => clearInterval(timer)
}
```

<!-- /code -->

A safety net. Windows can still take always-on-top away from a window, for example when another
app reorders windows or Explorer restarts, and nothing tells the app when it happens. So each
window looks every five seconds and puts itself back if needed. `index.ts` starts this for both
windows and stops it when quitting.

- `win.isAlwaysOnTop()`: reads the window's actual style, so it notices when Windows took it away.
  Most of the time it's still on top and nothing else happens: the window isn't moved, so it never
  jumps in front of another app's always-on-top window every few seconds.
- `!win.isDestroyed()`: never touch a window that has been closed.
- `return () => clearInterval(timer)`: the caller gets the way to stop it.

### `bringToFront()`

<!-- code: apps/desktop/src/main/bubble/windows.ts#bringToFront -->

[`src/main/bubble/windows.ts`, lines 105–117](../../apps/desktop/src/main/bubble/windows.ts#L105-L117)

```ts
/**
 * Puts an overlay window back on top, in front of every other window. With `reshow` it's also
 * hidden and shown again, which makes Windows place (and draw) it afresh.
 */
export function bringToFront(win: BrowserWindow, reshow: boolean): void {
  if (win.isDestroyed()) return
  win.setAlwaysOnTop(true, ON_TOP_LEVEL)
  win.moveTop()
  if (reshow && win.isVisible()) {
    win.hide()
    win.showInactive()
  }
}
```

<!-- /code -->

Puts an overlay window back in front of everything. The front check (`frontCheck.ts`, below)
calls it for the bubble when Windows says something else is at the bubble's centre.

- `win.setAlwaysOnTop(true, ON_TOP_LEVEL)`, `win.moveTop()`: makes it always on top again, and
  moves it to the top of the always-on-top windows, in front of any other app's.
- `if (reshow && win.isVisible())`: when it was behind another window or hidden by Windows, it's
  also hidden and shown again, which makes Windows place it and draw it afresh. Only a window
  that's showing: a hidden one is hidden on purpose.

### `bubbleSurface()`, `panelSurface()`

<!-- code: apps/desktop/src/main/bubble/windows.ts#bubbleSurface,panelSurface -->

[`src/main/bubble/windows.ts`, lines 119–142](../../apps/desktop/src/main/bubble/windows.ts#L119-L142)

```ts
export function bubbleSurface(win: BrowserWindow): Surface {
  return {
    setBounds: (bounds) => win.setBounds(bounds),
    show: () => {
      // Also puts it at the top of the always-on-top windows, in front of any shown meanwhile.
      win.setAlwaysOnTop(true, ON_TOP_LEVEL)
      win.showInactive()
    },
    hide: () => win.hide(),
  }
}

export function panelSurface(win: BrowserWindow): PanelSurface {
  return {
    setBounds: (bounds) => win.setBounds(bounds),
    show: () => {
      resetClickThrough(win)
      win.setAlwaysOnTop(true, ON_TOP_LEVEL)
      win.show()
    },
    hide: () => win.hide(),
    focus: () => win.focus(),
  }
}
```

<!-- /code -->

Adapters: each wraps a real `BrowserWindow` in the small object the controller expects, and
forwards each call to the matching Electron method.

- `win.setAlwaysOnTop(true, ON_TOP_LEVEL)`: each time a window is shown it's made always on top
  again, which also puts it in front of any other always-on-top windows that appeared meanwhile.
- `win.showInactive()`: shows the bubble without activating it, so it never steals focus.
- `resetClickThrough(win)`: the panel's click-through is reset each time, just before it's shown.
- `win.show()`: unlike `showInactive()`, this shows and activates the panel.
- `focus: () => win.focus()`: gives the panel keyboard focus, so you can type straight away.
- `hide: () => win.hide()`: hides the window; its page keeps running.

### `resetClickThrough()`

<!-- code: apps/desktop/src/main/bubble/windows.ts#resetClickThrough -->

[`src/main/bubble/windows.ts`, lines 144–156](../../apps/desktop/src/main/bubble/windows.ts#L144-L156)

```ts
/**
 * Starts the panel's click-through afresh each time it's shown. While hidden, the page can't
 * follow the pointer, so its idea of whether the pointer is over real UI is out of date (and
 * Windows may have dropped the mouse forwarding). Switching forwarding off and on re-installs it,
 * and the page is told exactly where the pointer is now, so it can decide straight away.
 */
function resetClickThrough(win: BrowserWindow): void {
  win.setIgnoreMouseEvents(false)
  win.setIgnoreMouseEvents(true, { forward: true })
  const cursor = screen.getCursorScreenPoint()
  const bounds = win.getBounds()
  win.webContents.send(IPC.clickThroughReset, { x: cursor.x - bounds.x, y: cursor.y - bounds.y })
}
```

<!-- /code -->

Starts the panel's click-through afresh each time it's shown. While the panel is hidden, its page
can't follow the pointer, so its idea of whether the pointer is over real UI is out of date, and
Windows may have dropped the mouse forwarding. This fixes clicks going astray after the panel has
been hidden, for example for a screenshot.

- `win.setIgnoreMouseEvents(false)`: switching off and then on again installs the forwarding
  again, and leaves the window click-through.
- `screen.getCursorScreenPoint()`: with `win.getBounds()`, both in DIPs, so subtracting gives the
  pointer's position inside the window. That's what the page calls `clientX` and `clientY`, since
  a frameless page fills its window exactly.
- `win.webContents.send(IPC.clickThroughReset,`: tells the page. `useClickThrough` checks what's
  under that point on the next animation frame and takes mouse input straight away if it's over
  real UI.

### `lockDown()`

<!-- code: apps/desktop/src/main/bubble/windows.ts#lockDown -->

[`src/main/bubble/windows.ts`, lines 158–167](../../apps/desktop/src/main/bubble/windows.ts#L158-L167)

```ts
function lockDown(win: BrowserWindow, view: View): void {
  const contents = win.webContents
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event) => event.preventDefault())
  contents.on('render-process-gone', () => {
    // A crashed panel can't report the pointer, so let clicks through until it has reloaded.
    if (view === 'panel') win.setIgnoreMouseEvents(true, { forward: true })
    contents.reload()
  })
}
```

<!-- /code -->

Basic safety and crash recovery for every overlay page.

- `setWindowOpenHandler(() => ({ action: 'deny' }))`: the page may never open a new Electron window
  (`window.open`, or a link with `target="_blank"`). Links open in your browser through
  `IPC.openExternal` instead.
- `contents.on('will-navigate', (event) => event.preventDefault())`: the page can never be
  replaced by another page, for example by following a link or by a file dropped onto the window.
- `render-process-gone`: Electron fires this when the page's process crashes or is killed. The page
  is reloaded.
- `if (view === 'panel') win.setIgnoreMouseEvents(true, { forward: true })`: a crashed panel can't
  report where the pointer is, and might be left taking the mouse over its whole invisible
  rectangle. Making it click-through until the page has reloaded avoids a dead patch of screen.
  The reloaded `useClickThrough` then starts from "not interactive" again.

### `addEditContextMenu()`

<!-- code: apps/desktop/src/main/bubble/windows.ts#addEditContextMenu -->

[`src/main/bubble/windows.ts`, lines 169–190](../../apps/desktop/src/main/bubble/windows.ts#L169-L190)

```ts
/** Right-click menu for the text box: spelling suggestions plus the usual edit commands. */
function addEditContextMenu(win: BrowserWindow): void {
  win.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return
    const suggestions: MenuItemConstructorOptions[] = params.dictionarySuggestions
      .slice(0, 5)
      .map((word) => ({ label: word, click: () => win.webContents.replaceMisspelling(word) }))
    const template: MenuItemConstructorOptions[] = [
      ...suggestions,
      ...(suggestions.length > 0 ? [{ type: 'separator' as const }] : []),
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { type: 'separator' },
      { role: 'selectAll' },
    ]
    Menu.buildFromTemplate(template).popup({ window: win })
  })
}
```

<!-- /code -->

The right-click menu for the panel's text box. Electron shows no context menu by default, so
without this you couldn't cut, paste or fix spelling with the mouse.

- `if (!params.isEditable) return`: only in editable fields, not on the rest of the panel.
- `params.dictionarySuggestions`: Chromium's spelling suggestions for the word under the pointer
  (none if it's spelt correctly). At most five are shown; choosing one calls
  `replaceMisspelling(word)`.
- `{ type: 'separator' as const }`: a separator line, added only when there are suggestions.
  `as const` tells TypeScript the type is exactly `'separator'`, not just any string, which the
  menu item type requires.
- `{ role: 'undo' }`: a `role` gives Electron's built-in item, with its standard label, shortcut
  and behaviour. The same goes for redo, cut, copy, paste and select all.
- `Menu.buildFromTemplate(template).popup({ window: win })`: builds the menu and shows it at the
  pointer.

## `src/main/bubble/frontCheck.ts`: keeping the bubble in front

Started by Windows at sign-in, after other apps were already open, the bubble could sit behind
them, although its window was always on top, until the user minimised everything and restored it.
It couldn't be reproduced by starting the app behind other windows by hand (the bubble was in
front every time), so instead of guessing at the cause, Desktop Assist now checks: a few times in
its first ten minutes it asks Windows which window is at the bubble's centre, and if it isn't the
bubble, brings the bubble back to the front and writes what it found in the log. That fixes it
whatever the cause, and the log says what happened.

Windows has no Electron API for "which window is here", so the check is a small PowerShell
script, run hidden like the one that sends questions in Claude Desktop (`sendInClaude.ts`). It
only reads; moving the window is done in Electron (`bringToFront()` in `windows.ts`).

### `FRONT_CHECKS_MS`

<!-- code: apps/desktop/src/main/bubble/frontCheck.ts#FRONT_CHECKS_MS -->

[`src/main/bubble/frontCheck.ts`, lines 4–11](../../apps/desktop/src/main/bubble/frontCheck.ts#L4-L11)

```ts
// Making sure the bubble can be seen after Desktop Assist starts. Started by Windows at sign-in,
// after other apps, the bubble could sit behind them although its window was always on top, until
// the user minimised everything and restored it. So for its first ten minutes the app asks Windows
// what's at the bubble's centre, and if it isn't the bubble, brings the bubble back to the front
// and says so in the log.

/** When the bubble is checked, counted from when it first appears. */
export const FRONT_CHECKS_MS = [5_000, 20_000, 60_000, 180_000, 600_000]
```

<!-- /code -->

When the bubble is checked: 5 and 20 seconds, then 1, 3 and 10 minutes after it first appears.
Early, for when it starts behind apps already open; later, for apps that were still starting.
Each check runs PowerShell for about a second, so there are only a few.

### `FrontCheck`

<!-- code: apps/desktop/src/main/bubble/frontCheck.ts#FrontCheck -->

[`src/main/bubble/frontCheck.ts`, lines 13–25](../../apps/desktop/src/main/bubble/frontCheck.ts#L13-L25)

```ts
/** What Windows says about the bubble's window. */
export interface FrontCheck {
  /** Shown (IsWindowVisible). */
  visible: boolean
  /** Always on top (the WS_EX_TOPMOST style). */
  topmost: boolean
  /** Hidden by Windows' compositor (DWMWA_CLOAKED), which can happen while the desktop starts. */
  cloaked: boolean
  /** The window at the bubble's centre is the bubble's own (or another of this app's). */
  inFront: boolean
  /** The app whose window is there instead, if it isn't. */
  coveredBy: string | null
}
```

<!-- /code -->

What Windows says about the bubble's window.

- `topmost`: the window's `WS_EX_TOPMOST` style, Windows' own "always on top".
- `cloaked`: Windows' compositor can hide ("cloak") a window that's still shown, for example one on
  another virtual desktop, or one shown while the desktop is still starting. A cloaked window is
  invisible, just like one that's behind everything.
- `inFront`: the real test. A window can be shown, always on top and not cloaked, and still not
  be what's on screen at that spot.

### `frontCheckScript()`

<!-- code: apps/desktop/src/main/bubble/frontCheck.ts#frontCheckScript -->

[`src/main/bubble/frontCheck.ts`, lines 27–78](../../apps/desktop/src/main/bubble/frontCheck.ts#L27-L78)

```ts
/**
 * The PowerShell that asks Windows. It finds the window at the centre of the bubble's window
 * (WindowFromPoint, then its top-level window) and compares it with the bubble's. Prints one line
 * of JSON. It only reads: it never moves or changes a window.
 */
export function frontCheckScript(hwnd: string, appPid: number): string {
  if (!/^\d+$/.test(hwnd)) throw new Error('Unexpected window handle')
  return `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class DaFront {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h, int index);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint processId);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attribute, out int value, int size);
}
"@
# Real pixels for both the window's place and the point looked at, whatever each screen's scaling.
try { [void][DaFront]::SetProcessDpiAwarenessContext([IntPtr]-4) } catch {}
$bubble = [IntPtr][long]'${hwnd}'
$rect = New-Object DaFront+RECT
[void][DaFront]::GetWindowRect($bubble, [ref]$rect)
$centre = New-Object DaFront+POINT
$centre.X = [int](($rect.Left + $rect.Right) / 2)
$centre.Y = [int](($rect.Top + $rect.Bottom) / 2)
$there = [DaFront]::GetAncestor([DaFront]::WindowFromPoint($centre), 2)
$owner = [uint32]0
[void][DaFront]::GetWindowThreadProcessId($there, [ref]$owner)
$inFront = ($there -eq $bubble) -or ($owner -eq ${appPid})
$coveredBy = $null
if (-not $inFront) {
  try { $coveredBy = (Get-Process -Id $owner).ProcessName } catch { $coveredBy = "process $owner" }
}
$cloaked = 0
[void][DaFront]::DwmGetWindowAttribute($bubble, 14, [ref]$cloaked, 4)
[pscustomobject]@{
  visible = [DaFront]::IsWindowVisible($bubble)
  topmost = (([DaFront]::GetWindowLongPtr($bubble, -20).ToInt64() -band 8) -ne 0)
  cloaked = ($cloaked -ne 0)
  inFront = [bool]$inFront
  coveredBy = $coveredBy
} | ConvertTo-Json -Compress
`
}
```

<!-- /code -->

The PowerShell. `Add-Type` compiles a few lines of C# that call Windows' own functions
(`DllImport`), since PowerShell can't call them directly.

- `if (!/^\d+$/.test(hwnd))`: the window handle goes into the script as text, so only digits are
  accepted: nothing that could change what the script does.
- `SetProcessDpiAwarenessContext([IntPtr]-4)`: "per-monitor aware". Without it, Windows would give
  PowerShell positions scaled to its idea of one screen's scaling, which can be wrong on another
  monitor. With it, the window's place and the point looked at are both in real pixels.
- `GetWindowRect` and the centre: the middle of the bubble's window, which is the middle of the
  bubble.
- `WindowFromPoint($centre)` then `GetAncestor(..., 2)`: the window Windows would give a click at
  that point, then its top-level window (2 is `GA_ROOT`). That's what the user sees there.
- `$inFront = ($there -eq $bubble) -or ($owner -eq ${appPid})`: the bubble, or another of this
  app's windows (the panel, when it's open over that spot).
- `(Get-Process -Id $owner).ProcessName`: the name of the app in front instead, for the log.
- `DwmGetWindowAttribute($bubble, 14, ...)`: 14 is `DWMWA_CLOAKED`.
- `ConvertTo-Json -Compress`: one line of JSON for `parseFrontCheck()`.

### `parseFrontCheck()`

<!-- code: apps/desktop/src/main/bubble/frontCheck.ts#parseFrontCheck -->

[`src/main/bubble/frontCheck.ts`, lines 80–96](../../apps/desktop/src/main/bubble/frontCheck.ts#L80-L96)

```ts
/** The check's answer: the JSON on the last line it printed. Null if there isn't any. */
export function parseFrontCheck(output: string): FrontCheck | null {
  const last = output.trim().split(/\r?\n/).at(-1)?.trim() ?? ''
  try {
    const value = JSON.parse(last) as Record<string, unknown>
    if (typeof value['inFront'] !== 'boolean') return null
    return {
      visible: value['visible'] === true,
      topmost: value['topmost'] === true,
      cloaked: value['cloaked'] === true,
      inFront: value['inFront'],
      coveredBy: typeof value['coveredBy'] === 'string' ? value['coveredBy'] : null,
    }
  } catch {
    return null
  }
}
```

<!-- /code -->

The check's answer, from the last line PowerShell printed (anything before it, such as a warning,
is ignored). Null if that isn't the JSON expected.

### `runFrontCheck()`

<!-- code: apps/desktop/src/main/bubble/frontCheck.ts#runFrontCheck -->

[`src/main/bubble/frontCheck.ts`, lines 98–128](../../apps/desktop/src/main/bubble/frontCheck.ts#L98-L128)

```ts
/** Runs the check in Windows PowerShell, hidden. */
export function runFrontCheck(hwnd: string, appPid: number): Promise<FrontCheck> {
  const powershell = join(
    process.env['SystemRoot'] ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  )
  const encoded = Buffer.from(frontCheckScript(hwnd, appPid), 'utf16le').toString('base64')
  return new Promise((resolve, reject) => {
    const child = spawn(
      powershell,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: 30_000 },
    )
    let output = ''
    let errors = ''
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (errors += chunk.toString()))
    child.on('error', reject)
    child.on('close', (code) => {
      const check = parseFrontCheck(output)
      if (check) resolve(check)
      else
        reject(
          new Error(`The bubble check failed (exit ${code}): ${errors.trim() || output.trim()}`),
        )
    })
  })
}
```

<!-- /code -->

Runs the script in Windows PowerShell, the same way `sendInClaude()` does: hidden
(`windowsHide`), with the script passed as base64 (`-EncodedCommand`) so nothing in it is read as
separate arguments, and stopped after 30 seconds if it hangs.

### `needsHelp()`, `describe()`

<!-- code: apps/desktop/src/main/bubble/frontCheck.ts#needsHelp,describe -->

[`src/main/bubble/frontCheck.ts`, lines 130–143](../../apps/desktop/src/main/bubble/frontCheck.ts#L130-L143)

```ts
/** Whether the check found anything wrong with a shown bubble. */
export function needsHelp(check: FrontCheck): boolean {
  return check.visible && (!check.inFront || !check.topmost || check.cloaked)
}

/** In words, for the log: "behind Chrome, not always on top". */
export function describe(check: FrontCheck): string {
  const parts = [
    check.inFront ? 'in front' : `behind ${check.coveredBy ?? 'another window'}`,
    !check.topmost && 'not always on top',
    check.cloaked && 'hidden by Windows',
  ].filter(Boolean)
  return parts.join(', ')
}
```

<!-- /code -->

- `needsHelp`: a shown bubble that's behind something, not always on top, or cloaked. A hidden
  bubble (`visible` false) is hidden on purpose, during a screenshot for instance.
- `describe`: the check in words for the log, e.g. "behind chrome, not always on top".

### `FrontWatchDeps`, `watchBubbleFront()`

<!-- code: apps/desktop/src/main/bubble/frontCheck.ts#FrontWatchDeps,watchBubbleFront -->

[`src/main/bubble/frontCheck.ts`, lines 145–191](../../apps/desktop/src/main/bubble/frontCheck.ts#L145-L191)

```ts
export interface FrontWatchDeps {
  /** Whether the bubble is resting in its corner (checks wait while it's open, dragged, …). */
  isResting(): boolean
  check(): Promise<FrontCheck>
  /** Puts the bubble back on top and in front. `reshow` also hides and shows it again. */
  bringToFront(reshow: boolean): void
  log(message: string, error?: unknown): void
  /** Tests replace the clock. */
  setTimeout?(run: () => void, ms: number): unknown
}

/**
 * Checks the bubble at FRONT_CHECKS_MS after it first appears and, whenever it's not in front,
 * brings it back and checks again. Logs only when something was wrong. Returns a function that
 * stops any checks still to come.
 */
export function watchBubbleFront(deps: FrontWatchDeps): () => void {
  const later = deps.setTimeout ?? ((run: () => void, ms: number) => setTimeout(run, ms).unref())
  let stopped = false
  const checkNow = async (when: string): Promise<void> => {
    if (stopped) return
    // Open, or being dragged: the user can see it. Look again in a minute.
    if (!deps.isResting()) {
      later(() => void checkNow(when), 60_000)
      return
    }
    try {
      const before = await deps.check()
      if (!needsHelp(before)) return
      deps.bringToFront(before.cloaked || !before.inFront)
      await new Promise<void>((resolve) => later(resolve, 1000))
      const after = await deps.check()
      deps.log(
        `Bubble check ${when} after starting: ${describe(before)}. ` +
          (needsHelp(after) ? `Still ${describe(after)}.` : 'Brought back to the front.'),
      )
    } catch (error) {
      deps.log(`Bubble check ${when} after starting failed:`, error)
    }
  }
  for (const ms of FRONT_CHECKS_MS) {
    later(() => void checkNow(ms < 60_000 ? `${ms / 1000} s` : `${ms / 60_000} min`), ms)
  }
  return () => {
    stopped = true
  }
}
```

<!-- /code -->

Runs the checks. `index.ts` starts it once the bubble first shows.

- `later(...)`: `setTimeout`, with `.unref()` so a pending check never keeps the app running; tests
  pass their own clock.
- `if (!deps.isResting())`: while the panel is open or the bubble is moving, the check waits a
  minute and tries again.
- `if (!needsHelp(before)) return`: the usual case. Nothing is logged when all is well.
- `deps.bringToFront(before.cloaked || !before.inFront)`: back on top and in front; hidden and
  shown again too if it was behind something or cloaked (just putting it back on top is enough
  when that was all that was wrong).
- `await new Promise(... later(resolve, 1000))`, then `deps.check()` again: a second later, did it
  work? The log line says what was wrong and whether the bubble is now in front ("Brought back to
  the front") or still not.
- `` ms < 60_000 ? `${ms / 1000} s` : `${ms / 60_000} min` ``: the check's name for the log ("5 s",
  "3 min").
- The returned function: stops any checks still to come (on quitting).

Checked for real by starting the app and then covering the whole screen with another
always-on-top window: the 5 s check found the bubble "behind electron" (the covering window's app),
brought it back, and the screen at the bubble's centre then showed the bubble, not the cover.
