# The bubble: windows, layout, bounce and the state machine

[← Code Guide](CODE_GUIDE.md)

The bubble is the always-on-top logo in a corner of the screen; clicking it opens the panel (the
chat card and the action icons). Each lives in its own transparent, frameless _overlay window_,
created in `windows.ts`. `BubbleController` decides what the bubble is doing and moves, shows and
hides the two windows to match, using the pure maths in `layout.ts` (where things go) and
`bounce.ts` (how they move).

The controller is always in exactly one _mode_ (the `Mode` type in `src/shared/types.ts`). Every
change is broadcast to both pages, which draw themselves to match:

- `collapsed`: only the bubble shows, resting in its corner. The app starts here.
- `expanded`: the panel is open beside the bubble.
- `dragging`: the bubble follows the mouse pointer.
- `bouncing`: the bubble flies around its display (the Bounce action).
- `returning`: the bubble glides back into its corner after a drag or a bounce.
- `capturing`: both windows are hidden while a screenshot is taken.

What moves the controller from one mode to another:

- `collapsed` → `expanded`: a click on the bubble (`clickBubble()`), or the tray icon, launching
  the app a second time, or finishing sign-in in the browser (all `expand()`).
- `expanded` → `collapsed`: a click on the bubble, Esc in the panel (`collapse()`), handing a
  question to Claude Desktop or opening an app from the Apps list (also `collapse()`), or clicking
  somewhere else so the panel loses focus (`panelBlurred()`, except in the panel's first 400 ms).
- `collapsed` or `expanded` → `dragging` → `returning`: pressing and moving the bubble
  (`startDrag()`), then letting go (`endDrag()`).
- `collapsed` or `expanded` → `bouncing` → `returning`: the Bounce action (`startBounce()`),
  then a click on the bubble or anything that calls `expand()`.
- `returning` → `collapsed`: the glide finishes (inside `glideHome()`). If something asked to open
  the panel during the glide, it carries straight on to `expanded`.
- `expanded` → `capturing` → `expanded`: the screenshot action (`whileHidden()`).

---

## `src/main/bubble/BubbleController.ts`: the state machine

This file holds the `BubbleController` class and the small interfaces it is built from. The
controller owns three pieces of state: the mode, the bubble's position, and its _anchor_ (which
display, and which corner of it, the bubble rests in). Each public method is a request such as
"the bubble was clicked" or "a drag started", and the controller decides what that means in the
current mode.

Who calls it:

- `src/main/index.ts` creates the one controller in `start()` and wires Electron events to it: the
  panel window's `blur` event to `panelBlurred()`, screen changes to `displayChanged()`, the tray
  icon, a second launch, a finished sign-in and a click on a notification to `expand()`, and
  quitting to `dispose()`.
- `src/main/ipc.ts` forwards the pages' requests: the bubble's click and drag (`clickBubble()`,
  `startDrag()`, `endDrag()`) and the panel's Esc (`collapse()`). It also calls `collapse()`
  after handing a question to Claude Desktop or opening an app from the Apps list.
- `src/main/actions.ts` calls `startBounce()` for the Bounce icon and `whileHidden()` for the
  screenshot icon.

The controller never imports Electron. It drives windows through the `Surface` interface and asks
about screens through the `Displays` interface. `index.ts` passes real ones: the adapters from
`windows.ts`, and `electronDisplays`, a thin wrapper around Electron's `screen` module.
`tests/bubbleController.test.ts` passes a `FakeSurface` that just records its bounds and whether
it's visible, a pretend pair of monitors, and Vitest's fake timers. That way a whole drag or
bounce can be checked in milliseconds without opening a window.

### `Surface`, `PanelSurface`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#Surface,PanelSurface -->

[`src/main/bubble/BubbleController.ts`, lines 12–21](../../apps/desktop/src/main/bubble/BubbleController.ts#L12-L21)

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

[`src/main/bubble/BubbleController.ts`, lines 23–37](../../apps/desktop/src/main/bubble/BubbleController.ts#L23-L37)

```ts
/** One display: its id and work area (the screen minus the taskbar). */
export interface DisplayArea {
  id: number
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

The controller's view of the monitors. Each display has an id (a number Electron assigns) and a
_work area_: the part of the screen that windows may use, which is the screen minus the taskbar.
The bubble rests inside the work area, so it never sits on top of the taskbar.

All coordinates are DIPs (device-independent pixels). Windows scales the desktop up on high-DPI
screens: at 150 % scaling, a 1920×1080 monitor is 1280×720 DIPs. Electron's window and screen
functions all use DIPs, so the bubble is the same visual size on every monitor and none of this
code needs to know the scale factor. With several monitors, all displays share one coordinate
space: the main display's top-left is (0, 0), and a monitor to its left or above it has negative
coordinates. That is why a work area has its own `x` and `y`, and why the layout code always
measures from them.

- `primary()`: the main display. It's the fallback when the bubble's display has gone.
- `byId(id: number): DisplayArea | undefined`: `undefined` when no connected display has that id,
  for example after a monitor was unplugged.
- `nearest(point: Point)`: the display containing a point, or the closest one if the point is in
  a gap between monitors. Used to decide which display the bubble was dropped on.
- `cursor()`: where the mouse pointer is, in the same DIP coordinates. Dragging reads it every
  frame.

In `index.ts`, `electronDisplays` implements these four with Electron's `screen` module
(`getPrimaryDisplay()`, `getAllDisplays()`, `getDisplayNearestPoint()` and
`getCursorScreenPoint()`).

### `BubbleAnchor`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleAnchor -->

[`src/main/bubble/BubbleController.ts`, lines 39–43](../../apps/desktop/src/main/bubble/BubbleController.ts#L39-L43)

```ts
/** Where the bubble rests: a corner of a particular display. */
export interface BubbleAnchor {
  displayId: number
  corner: Corner
}
```

<!-- /code -->

Where the bubble rests between moves. `Corner` (from `geometry.ts`) is one of `'top-left'`,
`'top-right'`, `'bottom-left'` or `'bottom-right'`. Storing a display and a corner, rather than a
pixel position, means the bubble still lands in the right place if that display's resolution or
taskbar has changed since. Whenever the anchor changes, `index.ts` saves it to `preferences.json`
(`SettingsService.setBubbleAnchor()`), and it passes the saved one back in at the next start.

### `BubbleControllerDeps`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleControllerDeps -->

[`src/main/bubble/BubbleController.ts`, lines 45–59](../../apps/desktop/src/main/bubble/BubbleController.ts#L45-L59)

```ts
export interface BubbleControllerDeps {
  bubble: Surface
  panel: PanelSurface
  displays: Displays
  actionCount: number
  /** Where the bubble was last time, if saved. */
  initialAnchor?: BubbleAnchor | null
  onModeChange(mode: Mode): void
  /** The bubble settled in a new corner or on a new display. */
  onAnchorChange(anchor: BubbleAnchor): void
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
- `onModeChange(mode: Mode): void`: `index.ts` broadcasts the new mode to both pages
  (`IPC.modeChanged`). That's how the panel knows to animate open or closed, and the bubble knows
  to show its ring.
- `onAnchorChange(anchor: BubbleAnchor): void`: `index.ts` broadcasts the new corner
  (`IPC.cornerChanged`) so the panel can lay itself out to open toward the middle of the screen,
  and saves the anchor.
- `now?: () => number`: a clock, and `random?: () => number` a random-number source. The app
  leaves them out and gets the real ones; tests pass their own so timings and bounce angles are
  predictable.
- `onDiagnostic?: (message: string) => void`: a line for the problem log when the bubble does
  something a user could take for a fault: a click that didn't open the panel, or a blur that
  didn't close it. `index.ts` passes the log. Such reports ("I clicked the bubble and nothing
  happened") are otherwise impossible to look into on someone else's PC.

### Constants

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#FRAME_MS,DEFAULT_CORNER,PANEL_FADE_MS,BLUR_CLICK_GRACE_MS,OPEN_BLUR_GRACE_MS,HIDE_SETTLE_MS -->

[`src/main/bubble/BubbleController.ts`, lines 61–77](../../apps/desktop/src/main/bubble/BubbleController.ts#L61-L77)

```ts
const FRAME_MS = 16

const DEFAULT_CORNER: Corner = 'bottom-right'

/** Matches the panel's fade-out in the renderer, so the window hides once it's invisible. */
export const PANEL_FADE_MS = 150

/**
 * Clicking the bubble while the panel is open can blur the panel just before the click lands.
 * A click this soon after a blur-collapse belongs to the same gesture and must not reopen it.
 */
export const BLUR_CLICK_GRACE_MS = 300

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
- `BLUR_CLICK_GRACE_MS = 300`: see `clickBubble()`.
- `OPEN_BLUR_GRACE_MS = 400`: see `panelBlurred()`. As its comment says, another app can take the
  focus back just as the panel opens.
- `HIDE_SETTLE_MS = 150`: after the windows are hidden, Windows needs a moment to redraw what was
  behind them. A screenshot taken sooner could still show them.
- `export const`: the last four are exported so the tests can wait exactly the right time.

### `BubbleController`

The class, with the comment that describes it:

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.class -->

[`src/main/bubble/BubbleController.ts`, lines 79–88](../../apps/desktop/src/main/bubble/BubbleController.ts#L79-L88)

```ts
/**
 * The bubble's state machine. Owns the mode, the bubble's position and its anchor (the display
 * and corner it rests in), and moves/shows/hides the two windows to match:
 *
 *   collapsed ⇄ expanded                     click, Esc, blur
 *   collapsed/expanded → dragging → returning → collapsed     drag, release (snaps to a corner)
 *   * → bouncing → returning → collapsed     Bounce action, then a click
 *   expanded → capturing → expanded          screenshot
 */
export class BubbleController {
  // …
}
```

<!-- /code -->

The comment sums up the state machine in four lines; the lists at the top of this page are the
long version. These are the class's fields:

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.mode,position,anchor,motion,ticker,hideTimer,lastBlurCollapse,expandedAt,expandAfterReturn,now,random -->

[`src/main/bubble/BubbleController.ts`, lines 89–99](../../apps/desktop/src/main/bubble/BubbleController.ts#L89-L99)

```ts
private mode: Mode = 'collapsed'

private position: Point = { x: 0, y: 0 }

private anchor: BubbleAnchor

private motion: Motion | null = null

private ticker: ReturnType<typeof setInterval> | null = null

private hideTimer: ReturnType<typeof setTimeout> | null = null

private lastBlurCollapse = Number.NEGATIVE_INFINITY

private expandedAt = Number.NEGATIVE_INFINITY

private expandAfterReturn = false

private readonly now: () => number

private readonly random: () => number
```

<!-- /code -->

- `private mode: Mode = 'collapsed'`: `private` means only this class's own methods can read or
  change the field (TypeScript checks this when compiling). Everything starts at rest.
- `private position: Point = { x: 0, y: 0 }`: the top-left corner of the bubble _circle_ (not of
  its window), in DIPs. A placeholder until `start()` sets it.
- `private anchor: BubbleAnchor`: no starting value here; the constructor sets it. With the
  project's `strict` settings, TypeScript refuses to compile if the constructor could finish
  without assigning it.
- `private motion: Motion | null = null`: the bounce's current position and velocity (see
  `bounce.ts`), or `null` when not bouncing. `| null` makes TypeScript insist on a check before
  it's used.
- `ReturnType<typeof setInterval>`: "whatever type `setInterval` returns". It saves caring whether
  that's Node's `Timeout` object or a browser's number. `ticker` is the running animation timer,
  if any.
- `private hideTimer`: the pending "hide the panel window after the fade" timer from `collapse()`.
- `private lastBlurCollapse = Number.NEGATIVE_INFINITY`: when the panel last closed because it lost
  focus. Starting at minus infinity means "never", so the first click can't fall inside the grace
  period.
- `private expandedAt = Number.NEGATIVE_INFINITY`: when the panel last opened, for the grace
  period in `panelBlurred()`.
- `private expandAfterReturn = false`: set when something asks to open the panel while the bubble
  is still on its way home; `glideHome()` opens it on arrival.
- `private readonly now: () => number`: `readonly` means it's set once, in the constructor, and
  never reassigned. The same goes for `random`.

### `BubbleController.constructor()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.constructor -->

[`src/main/bubble/BubbleController.ts`, lines 101–111](../../apps/desktop/src/main/bubble/BubbleController.ts#L101-L111)

```ts
constructor(private readonly deps: BubbleControllerDeps) {
  this.now = deps.now ?? (() => performance.now())
  this.random = deps.random ?? Math.random
  // Set now, not in start(): the pages ask for the corner as soon as they load, which can be
  // before start() runs.
  const saved = deps.initialAnchor
  this.anchor =
    saved && deps.displays.byId(saved.displayId)
      ? { ...saved }
      : { displayId: deps.displays.primary().id, corner: saved?.corner ?? DEFAULT_CORNER }
}
```

<!-- /code -->

Stores the dependencies, picks the clock and random source, and decides the anchor. Nothing
appears on screen until `start()`.

- `constructor(private readonly deps: BubbleControllerDeps)`: TypeScript shorthand. Marking a
  constructor parameter `private readonly` declares a field called `deps` and stores the argument
  in it.
- `deps.now ?? (() => performance.now())`: `??` uses the right-hand side only when the left is
  `null` or `undefined`. `performance.now()` is a millisecond clock that only moves forward; unlike
  `Date.now()`, it doesn't jump when the PC's clock is adjusted, which would make an animation
  skip.
- `// Set now, not in start()`: `index.ts` registers the IPC handlers (including `getState()`,
  which reads `corner`) before it waits for the pages to load, and only calls `start()` after both
  have drawn. A page can ask for the corner in between. Choosing the anchor here means that answer
  is already right, so the panel lays itself out for the correct corner from the start.
- `saved && deps.displays.byId(saved.displayId)`: the saved anchor is used only if its display is
  still connected. Otherwise the bubble goes to the main display, keeping the saved corner if there
  was one.
- `saved?.corner ?? DEFAULT_CORNER`: `?.` gives `undefined` instead of an error when `saved` is
  `null`, and `??` then falls back to bottom-right.
- `{ ...saved }`: a copy, so the controller's anchor isn't the same object the settings hold.
- `this.anchor =`: sets the field directly rather than through `setAnchor()`, so `onAnchorChange`
  doesn't fire and a fallback anchor isn't saved. The pages get the corner from `getState()`.

### `BubbleController.currentMode`, `bubblePosition`, `corner`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.currentMode,bubblePosition,corner -->

[`src/main/bubble/BubbleController.ts`, lines 113–123](../../apps/desktop/src/main/bubble/BubbleController.ts#L113-L123)

```ts
get currentMode(): Mode {
  return this.mode
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
can't assign to it. `index.ts` reads `currentMode` and `corner` in its `getState()`, which is how
a page that has just loaded learns the current state.

- `return { ...this.position }`: returns a copy, so a caller can't move the bubble by editing the
  object it got back. Nothing outside the class reads `bubblePosition` at the moment.

### `BubbleController.start()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.start -->

[`src/main/bubble/BubbleController.ts`, lines 125–130](../../apps/desktop/src/main/bubble/BubbleController.ts#L125-L130)

```ts
/** Puts the bubble in its saved corner (or bottom-right of the main display) and shows it. */
start(): void {
  this.position = this.home()
  this.placeWindows()
  this.deps.bubble.show()
}
```

<!-- /code -->

Called once by `index.ts`, after both pages have drawn for the first time (their windows'
`ready-to-show` event), so the bubble doesn't appear before its page has anything to show. The
anchor was already chosen in the constructor; this just puts the windows there.

- `this.position = this.home()`: the resting position in the anchor's corner (see `home()`).
- `this.placeWindows()`: positions both windows, although only the bubble is shown. The panel is
  then already in the right place when it first opens.
- `this.deps.bubble.show()`: for the real window this is `showInactive()` (see `bubbleSurface()`),
  so the bubble appears without stealing focus from whatever you're doing.

### `BubbleController.clickBubble()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.clickBubble -->

[`src/main/bubble/BubbleController.ts`, lines 132–150](../../apps/desktop/src/main/bubble/BubbleController.ts#L132-L150)

```ts
clickBubble(): void {
  switch (this.mode) {
    case 'collapsed':
      if (this.now() - this.lastBlurCollapse >= BLUR_CLICK_GRACE_MS) this.expand()
      else this.deps.onDiagnostic?.('Bubble click ignored: the panel had just closed')
      return
    case 'expanded':
      this.collapse()
      return
    case 'bouncing':
      this.glideHome()
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

What a click on the bubble means depends on the mode. The bubble page just sends `IPC.bubbleClick`
and leaves the decision to the main process, which knows the mode and the blur timing.

- `if (this.now() - this.lastBlurCollapse >= BLUR_CLICK_GRACE_MS) this.expand()`: with the panel
  open, pressing on the bubble can take focus away from the panel just before the click itself
  arrives. The blur closes the panel, and without this check the click would open it straight
  back up, so the panel would seem to ignore you. A click within 300 ms of a blur-close counts as
  part of the same gesture. (`windows.ts` also makes the bubble window unable to take focus, which
  normally prevents that blur; this check covers the times it still happens.)
- `else this.deps.onDiagnostic?.('Bubble click ignored: the panel had just closed')`: the click
  inside that grace period is logged, so a report of the bubble "not opening" can be checked
  against the log.
- `case 'bouncing':`: clicking a bouncing bubble catches it and sends it home, without opening the
  panel.
- `case 'capturing':`: the dragging, returning and capturing modes ignore clicks. Listing them
  explicitly makes it clear none was forgotten. (A drag ends with a click event in the page too,
  but `BubbleView` swallows that one before it's sent.) Each ignored click is logged with the mode
  it arrived in (`Bubble click ignored while returning`, say).

### `BubbleController.expand()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.expand -->

[`src/main/bubble/BubbleController.ts`, lines 152–176](../../apps/desktop/src/main/bubble/BubbleController.ts#L152-L176)

```ts
/** Opens the panel. While bouncing, glides home first and then opens. */
expand(): void {
  switch (this.mode) {
    case 'expanded':
      this.deps.panel.focus()
      return
    case 'bouncing':
      this.expandAfterReturn = true
      this.glideHome()
      return
    case 'returning':
      this.expandAfterReturn = true
      return
    case 'dragging':
    case 'capturing':
      return
    case 'collapsed':
      this.cancelHide()
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
- `this.expandAfterReturn = true`: the panel opens beside the bubble's corner, so it can't open
  while the bubble is away from it. The request is remembered, and `glideHome()` opens the panel
  once the bubble has arrived. A bouncing bubble is sent home first; a returning one is already on
  its way.
- `case 'dragging':`: ignored while you're holding the bubble, and while capturing (the panel
  reopens by itself when the screenshot is done).
- `this.cancelHide()`: if the panel is still fading out from a moment ago, its pending "hide"
  timer is cancelled. Otherwise the window would vanish 150 ms after reopening.
- `this.setMode('expanded')`: the pages hear the new mode (through `onModeChange`) and animate
  open; the window is then shown and focused so you can type at once.
- `this.expandedAt = this.now()`: when it opened, for `panelBlurred()`.

### `BubbleController.collapse()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.collapse -->

[`src/main/bubble/BubbleController.ts`, lines 178–186](../../apps/desktop/src/main/bubble/BubbleController.ts#L178-L186)

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
- `this.cancelHide()`: never leaves two hide timers running.
- `this.hideTimer = null`: inside the timer, marks that nothing is pending any more.

### `BubbleController.panelBlurred()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.panelBlurred -->

[`src/main/bubble/BubbleController.ts`, lines 188–196](../../apps/desktop/src/main/bubble/BubbleController.ts#L188-L196)

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

[`src/main/bubble/BubbleController.ts`, lines 198–210](../../apps/desktop/src/main/bubble/BubbleController.ts#L198-L210)

```ts
/** The mouse pressed on the bubble and moved: the bubble follows the pointer until released. */
startDrag(): void {
  if (this.mode !== 'collapsed' && this.mode !== 'expanded') return
  this.cancelHide()
  this.deps.panel.hide()
  const cursor = this.deps.displays.cursor()
  const grab = { x: cursor.x - this.position.x, y: cursor.y - this.position.y }
  this.setMode('dragging')
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
  rest, not mid-bounce, mid-glide or during a screenshot.
- `this.deps.panel.hide()`: the panel can't follow the bubble, so it's hidden at once, without the
  fade. `cancelHide()` drops any fade timer that was still pending.
- `const grab`: the offset from the bubble's top-left to the pointer. Keeping that offset fixed
  means the spot you grabbed stays under the pointer, instead of the bubble jumping so its corner
  is there.
- `this.runTicker(() => {`: every frame, read where the pointer is now and move the bubble to
  match. The callback ignores the frame time, since following the pointer only needs its current
  position.

Reading the real pointer position in the main process keeps the drag smooth, even across monitors
with different scaling. The page's own coordinates would keep shifting as its window moves under
it.

### `BubbleController.endDrag()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.endDrag -->

[`src/main/bubble/BubbleController.ts`, lines 212–226](../../apps/desktop/src/main/bubble/BubbleController.ts#L212-L226)

```ts
/** Released: snap to the nearest corner of the display the bubble was dropped on. */
endDrag(): void {
  if (this.mode !== 'dragging') return
  this.stopTicker()
  const centre = {
    x: Math.round(this.position.x + UI.bubbleSize / 2),
    y: Math.round(this.position.y + UI.bubbleSize / 2),
  }
  const display = this.deps.displays.nearest(centre)
  this.setAnchor({
    displayId: display.id,
    corner: nearestCorner(display.workArea, this.position),
  })
  this.glideHome()
}
```

<!-- /code -->

On release, `BubbleView` sends `IPC.bubbleDragEnd`. The bubble snaps to the nearest corner of
whichever display it was dropped on.

- `if (this.mode !== 'dragging') return`: a release that doesn't end a drag (say, a drag that was
  refused because the bubble was bouncing) does nothing.
- `const centre`: the display is picked by the bubble's centre, not its top-left, so a bubble
  straddling two monitors goes to the one its centre is on. It's rounded because Electron's display
  lookup works in whole DIPs.
- `nearestCorner(display.workArea, this.position)`: the corner of the quarter of that display the
  bubble is in (`layout.ts`).
- `this.setAnchor({`: saves and broadcasts the new anchor, but only if it actually changed.
- `this.glideHome()`: the bubble glides into its new corner; the mode goes to `returning`, then
  `collapsed`.

### `BubbleController.startBounce()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.startBounce -->

[`src/main/bubble/BubbleController.ts`, lines 228–239](../../apps/desktop/src/main/bubble/BubbleController.ts#L228-L239)

```ts
startBounce(): void {
  if (this.mode !== 'collapsed' && this.mode !== 'expanded') return
  this.cancelHide()
  this.deps.panel.hide()
  this.motion = launch(this.position, this.random, this.anchor.corner)
  this.setMode('bouncing')
  this.runTicker((dtMs) => {
    if (!this.motion) return
    this.motion = step(this.motion, dtMs, travelBox(this.display().workArea))
    this.moveBubble({ x: this.motion.x, y: this.motion.y })
  })
}
```

<!-- /code -->

The Bounce action: the bubble flies around its display, bouncing off the edges, until clicked.
`actions.ts` calls this for the Bounce icon.

- `if (this.mode !== 'collapsed' && this.mode !== 'expanded') return`: the same rule as for
  dragging. In practice it's `expanded`, because the Bounce icon is in the panel.
- `launch(this.position, this.random, this.anchor.corner)`: the starting position and velocity,
  heading away from the bubble's corner into the screen (`bounce.ts`).
- `if (!this.motion) return`: mostly for TypeScript. `motion` is typed `Motion | null`, and inside
  the callback TypeScript can't assume it's still set.
- `travelBox(this.display().workArea)`: worked out again every frame from the anchor's display. If
  the resolution or taskbar changes mid-bounce, the bubble stays within the new area
  (`displayChanged()` deliberately leaves a bounce alone).
- `step(this.motion, dtMs,`: moves the bubble by the real time since the last frame.
- `this.moveBubble(`: moves only the bubble window. The panel is hidden, and is put back next to
  the bubble when it settles.

### `BubbleController.whileHidden()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.whileHidden -->

[`src/main/bubble/BubbleController.ts`, lines 241–257](../../apps/desktop/src/main/bubble/BubbleController.ts#L241-L257)

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

[`src/main/bubble/BubbleController.ts`, lines 259–270](../../apps/desktop/src/main/bubble/BubbleController.ts#L259-L270)

```ts
/**
 * The resolution, taskbar or monitors changed. If the bubble's display was unplugged, it moves
 * to the same corner of the main display. Moving bubbles re-read the display every frame.
 */
displayChanged(): void {
  if (!this.deps.displays.byId(this.anchor.displayId)) {
    this.setAnchor({ displayId: this.deps.displays.primary().id, corner: this.anchor.corner })
  }
  if (this.mode === 'bouncing' || this.mode === 'returning' || this.mode === 'dragging') return
  this.position = this.home()
  this.placeWindows()
}
```

<!-- /code -->

`index.ts` calls this on Electron's `screen` events `display-added`, `display-removed` and
`display-metrics-changed`. The last covers resolution, scaling and rotation changes, and the
taskbar moving or resizing (which changes the work area).

- `if (!this.deps.displays.byId(this.anchor.displayId))`: the bubble's display is gone, for example
  unplugged or a laptop undocked. The anchor moves to the same corner of the main display, through
  `setAnchor()`, so the change is saved and broadcast.
- `this.mode === 'bouncing' || this.mode === 'returning'`: moving bubbles adapt by themselves. The
  bounce and the glide re-read the display every frame, and a drag follows the pointer. Snapping
  the windows here would make the bubble jump.
- `this.position = this.home()`: in every other mode, both windows go back to the corner of the
  (possibly resized) work area. That includes `expanded`, so an open panel moves with the bubble,
  and `capturing`, where the windows are hidden but will come back in the right place.

If a bouncing bubble's display is unplugged, the next frame's `step()` pulls it into the main
display's travel box, so it reappears there.

### `BubbleController.dispose()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.dispose -->

[`src/main/bubble/BubbleController.ts`, lines 272–275](../../apps/desktop/src/main/bubble/BubbleController.ts#L272-L275)

```ts
dispose(): void {
  this.stopTicker()
  this.cancelHide()
}
```

<!-- /code -->

Stops both timers. `index.ts` calls it while quitting (in `before-quit`), so no timer fires
against a window that is being destroyed. The tests call it after each test.

### `BubbleController.display()`, `home()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.display,home -->

[`src/main/bubble/BubbleController.ts`, lines 277–284](../../apps/desktop/src/main/bubble/BubbleController.ts#L277-L284)

```ts
/** The anchor's display, or the main display if it's gone. */
private display(): DisplayArea {
  return this.deps.displays.byId(this.anchor.displayId) ?? this.deps.displays.primary()
}

private home(): Point {
  return homePosition(this.display().workArea, this.anchor.corner)
}
```

<!-- /code -->

- `?? this.deps.displays.primary()`: if the anchor's display has gone and `displayChanged()`
  hasn't run yet, use the main display rather than fail.
- `homePosition(this.display().workArea, this.anchor.corner)`: the resting position for the
  current anchor (`layout.ts`). It's worked out fresh on every call, from the display's current
  work area, so it's never stale.

### `BubbleController.glideHome()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.glideHome -->

[`src/main/bubble/BubbleController.ts`, lines 286–310](../../apps/desktop/src/main/bubble/BubbleController.ts#L286-L310)

```ts
/** Glides the bubble into its anchor corner, then switches to collapsed. */
private glideHome(): void {
  this.motion = null
  const from = { ...this.position }
  const duration = glideDuration(from, this.home())
  const startedAt = this.now()
  this.setMode('returning')
  this.runTicker(() => {
    // Re-read home every frame in case the display changes mid-glide.
    const home = this.home()
    const t = (this.now() - startedAt) / duration
    if (t < 1) {
      this.moveBubble(glidePosition(from, home, t))
      return
    }
    this.stopTicker()
    this.position = home
    this.placeWindows()
    this.setMode('collapsed')
    if (this.expandAfterReturn) {
      this.expandAfterReturn = false
      this.expand()
    }
  })
}
```

<!-- /code -->

Animates the bubble from wherever it is into its anchor corner, then switches to `collapsed`.
Used after a drag (`endDrag()`) and to end a bounce (`clickBubble()`, `expand()`).

- `this.motion = null`: any bounce is over.
- `glideDuration(from, this.home())`: longer trips take longer, between 0.3 and 0.9 s
  (`bounce.ts`). The duration is fixed when the glide starts.
- `const home = this.home()`: inside the frame callback, so it's re-read every frame. If the
  display changes mid-glide, the bubble still ends up in the right place.
- `const t = (this.now() - startedAt) / duration`: progress from 0 to 1, based on real elapsed
  time, so a late frame doesn't slow the glide down.
- `this.moveBubble(glidePosition(from, home, t))`: only the bubble window moves during the glide.
- `this.position = home`: when `t` reaches 1, the timer stops and the bubble is put exactly on its
  home (the last frame was probably just short). `placeWindows()` moves the hidden panel next to
  the bubble's corner, ready to open.
- `if (this.expandAfterReturn)`: something asked to open the panel during the trip (see
  `expand()`). The flag is cleared, then `expand()` runs from `collapsed` as normal.

### `BubbleController.runTicker()`, `stopTicker()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.runTicker,stopTicker -->

[`src/main/bubble/BubbleController.ts`, lines 312–325](../../apps/desktop/src/main/bubble/BubbleController.ts#L312-L325)

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

The 60 fps ticker. It drives all three animations (drag, bounce and glide), but only one runs at a
time.

- `this.stopTicker()`: starting a new animation always replaces the old one. That's how a click on
  a bouncing bubble switches from the bounce to the glide.
- `this.ticker = setInterval(`: calls the frame function about every 16 ms (`FRAME_MS`).
- `onFrame(now - last)`: Node's timers aren't exact, and can run late when the main process is
  busy, so each frame is told how many milliseconds really passed. The bounce uses this to move
  the right distance.
- `if (this.ticker) clearInterval(this.ticker)`: safe to call when nothing is running.

### `BubbleController.moveBubble()`, `placeWindows()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.moveBubble,placeWindows -->

[`src/main/bubble/BubbleController.ts`, lines 327–337](../../apps/desktop/src/main/bubble/BubbleController.ts#L327-L337)

```ts
private moveBubble(position: Point): void {
  this.position = position
  this.deps.bubble.setBounds(bubbleWindowBounds(position))
}

private placeWindows(): void {
  this.deps.bubble.setBounds(bubbleWindowBounds(this.position))
  this.deps.panel.setBounds(
    panelWindowBounds(this.position, this.deps.actionCount, this.anchor.corner),
  )
}
```

<!-- /code -->

- `moveBubble`: changes the position and moves only the bubble window. Animations call it every
  frame; the panel is hidden during them, so moving it too would be wasted work.
- `placeWindows`: positions both windows for the current position and anchor. The panel's place
  depends on the corner, because it always opens toward the middle of the screen.
- `bubbleWindowBounds(this.position)`: turns the bubble's position (the circle's top-left) into
  its window's rectangle, which includes the transparent padding around the circle (`layout.ts`).
- `panelWindowBounds(this.position, this.deps.actionCount, this.anchor.corner)`: the panel's
  rectangle (`layout.ts`).

### `BubbleController.setAnchor()`, `cancelHide()`, `setMode()`

<!-- code: apps/desktop/src/main/bubble/BubbleController.ts#BubbleController.setAnchor,cancelHide,setMode -->

[`src/main/bubble/BubbleController.ts`, lines 339–354](../../apps/desktop/src/main/bubble/BubbleController.ts#L339-L354)

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

private setMode(mode: Mode): void {
  if (mode === this.mode) return
  this.mode = mode
  this.deps.onModeChange(mode)
}
```

<!-- /code -->

Small helpers.

- `if (anchor.displayId === this.anchor.displayId`: dropping the bubble back in its own corner
  changes nothing, so nothing is saved or broadcast.
- `this.deps.onAnchorChange({ ...anchor })`: passes a copy, so the receiver can't change the
  controller's own anchor.
- `cancelHide`: cancels the panel hide that `collapse()` scheduled, if there is one.
- `if (mode === this.mode) return`: `onModeChange` (a broadcast to both pages) fires only for real
  changes.

---

## `src/main/bubble/layout.ts`: where the windows go

Pure maths, no Electron. Given a work area and a corner, it works out where the bubble rests,
which corner a dropped bubble belongs to, where it may bounce, and the exact rectangles of the two
windows. `BubbleController` is its only user in the app; `tests/layout.test.ts` checks each
function on its own.

Key ideas:

- A position always means the top-left corner of the bubble _circle_ (56×56 DIPs,
  `UI.bubbleSize`), not of its window. The bubble window is bigger, `BUBBLE_BOX` = 72×72, because
  it has 8 DIPs of transparent padding (`UI.bubblePad`) on every side for the shadow and the ring.
  Only `bubbleWindowBounds()` deals with the difference.
- Everything is measured from the work area's own `x` and `y`, never from (0, 0), so the same code
  works on a second monitor or with the taskbar at the top or left.
- All sizes come from `UI` in `src/shared/geometry.ts`, which the pages use too, so the window
  sizes and the page layout can't drift apart.

### `TravelBox`

<!-- code: apps/desktop/src/main/bubble/layout.ts#TravelBox -->

[`src/main/bubble/layout.ts`, lines 12–19](../../apps/desktop/src/main/bubble/layout.ts#L12-L19)

```ts
// Positions are the top-left corner of the bubble circle itself, not of its window.

export interface TravelBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}
```

<!-- /code -->

The range of positions a bouncing bubble may be in: lowest and highest `x`, lowest and highest
`y`. Made by `travelBox()` below and used by `step()` in `bounce.ts`, which compares a position
with each limit directly. The comment above it applies to the whole file.

### `homePosition()`

<!-- code: apps/desktop/src/main/bubble/layout.ts#homePosition -->

[`src/main/bubble/layout.ts`, lines 21–31](../../apps/desktop/src/main/bubble/layout.ts#L21-L31)

```ts
/** The bubble's resting place in `corner` of the work area (the screen minus the taskbar). */
export function homePosition(workArea: Rect, corner: Corner = 'bottom-right'): Point {
  return {
    x: isLeftCorner(corner)
      ? workArea.x + UI.edgeMargin
      : workArea.x + workArea.width - UI.edgeMargin - UI.bubbleSize,
    y: isTopCorner(corner)
      ? workArea.y + UI.edgeMargin
      : workArea.y + workArea.height - UI.edgeMargin - UI.bubbleSize,
  }
}
```

<!-- /code -->

The bubble's resting position in a corner: `UI.edgeMargin` (16 DIPs) in from both edges of the
work area.

- `isLeftCorner(corner)`: from `geometry.ts`; true for `top-left` and `bottom-left`.
  `isTopCorner()` works the same way for the top.
- `workArea.x + workArea.width - UI.edgeMargin - UI.bubbleSize`: on the right, the bubble's own
  width is subtracted too, because the position is its left edge.
- `corner: Corner = 'bottom-right'`: a default value, used if the caller leaves the argument out.

### `nearestCorner()`

<!-- code: apps/desktop/src/main/bubble/layout.ts#nearestCorner -->

[`src/main/bubble/layout.ts`, lines 33–40](../../apps/desktop/src/main/bubble/layout.ts#L33-L40)

```ts
/** The corner nearest the bubble: whichever quarter of the work area its centre is in. */
export function nearestCorner(workArea: Rect, bubble: Point): Corner {
  const centreX = bubble.x + UI.bubbleSize / 2
  const centreY = bubble.y + UI.bubbleSize / 2
  const top = centreY < workArea.y + workArea.height / 2
  const left = centreX < workArea.x + workArea.width / 2
  return `${top ? 'top' : 'bottom'}-${left ? 'left' : 'right'}`
}
```

<!-- /code -->

Used by `endDrag()`. It splits the work area into four quarters and returns the corner of the
quarter the bubble's centre is in.

- `bubble.x + UI.bubbleSize / 2`: the centre, not the top-left, so a bubble across the middle line
  goes to the side most of it is on.
- `` `${top ? 'top' : 'bottom'}-${left ? 'left' : 'right'}` ``: builds the corner's name.
  TypeScript works out that this can only produce the four `Corner` values, so it needs no cast.

### `travelBox()`

<!-- code: apps/desktop/src/main/bubble/layout.ts#travelBox -->

[`src/main/bubble/layout.ts`, lines 42–50](../../apps/desktop/src/main/bubble/layout.ts#L42-L50)

```ts
/** Every position where the bubble is fully inside the work area. */
export function travelBox(workArea: Rect): TravelBox {
  return {
    minX: workArea.x,
    minY: workArea.y,
    maxX: workArea.x + workArea.width - UI.bubbleSize,
    maxY: workArea.y + workArea.height - UI.bubbleSize,
  }
}
```

<!-- /code -->

Every position where the whole circle is inside the work area. Unlike the resting position there's
no 16 DIP margin, so a bouncing bubble touches the edges, but it never goes under the taskbar or
off the screen.

- `workArea.x + workArea.width - UI.bubbleSize`: the highest `x` is a bubble's width short of the
  right edge, because the position is the circle's left edge. If the work area were narrower than
  the bubble, the maximum would be less than the minimum; `reflect()` in `bounce.ts` handles that.

### `bubbleWindowBounds()`

<!-- code: apps/desktop/src/main/bubble/layout.ts#bubbleWindowBounds -->

[`src/main/bubble/layout.ts`, lines 52–59](../../apps/desktop/src/main/bubble/layout.ts#L52-L59)

```ts
export function bubbleWindowBounds(bubble: Point): Rect {
  return {
    x: Math.round(bubble.x) - UI.bubblePad,
    y: Math.round(bubble.y) - UI.bubblePad,
    width: BUBBLE_BOX,
    height: BUBBLE_BOX,
  }
}
```

<!-- /code -->

The bubble window's rectangle: 8 DIPs up and to the left of the circle, 72×72.

- `Math.round(bubble.x)`: the bounce and the glide produce fractional positions, but a window can
  only be placed on whole pixels.

### `panelWindowBounds()`

<!-- code: apps/desktop/src/main/bubble/layout.ts#panelWindowBounds -->

[`src/main/bubble/layout.ts`, lines 61–77](../../apps/desktop/src/main/bubble/layout.ts#L61-L77)

```ts
/**
 * The panel window shares the bubble window's corner that points into the screen's `corner`, so
 * it extends toward the middle of the screen (left and up from bottom-right, and so on).
 */
export function panelWindowBounds(
  bubble: Point,
  actionCount: number,
  corner: Corner = 'bottom-right',
): Rect {
  const box = bubbleWindowBounds(bubble)
  const size = panelWindowSize(actionCount)
  return {
    x: isLeftCorner(corner) ? box.x : box.x + box.width - size.width,
    y: isTopCorner(corner) ? box.y : box.y + box.height - size.height,
    ...size,
  }
}
```

<!-- /code -->

The panel window's rectangle. Its size comes from `panelWindowSize()` in `geometry.ts` (big enough
for the chat card at full height, a toast, and the action icons), and it's placed so it shares one
corner with the bubble window: the corner that points into the screen's corner. With the bubble
bottom-right, the two windows' bottom-right corners coincide and the panel extends left and up,
toward the middle of the screen.

- `isLeftCorner(corner) ? box.x : box.x + box.width - size.width`: in a left corner the left edges
  line up; in a right corner the right edges do. The `y` line does the same for top and bottom.
- `...size`: copies `width` and `height` into the result.

The two windows overlap. The panel's page lays out its content from the shared corner
(`PANEL_LAYOUT` in `geometry.ts`) and leaves the bubble's square empty. Empty parts of the panel
are click-through, so the bubble still gets its clicks.

---

## `src/main/bubble/bounce.ts`: bounce physics

Pure maths for the two animations: the bounce (the bubble moves at a constant speed and reflects
off the edges of the work area, like an old DVD screensaver) and the glide home (a smooth
slow-down into the corner). Each function takes a state and returns a new one; none keeps
anything between calls or touches a window. `BubbleController` calls them from its frame timer
(`startBounce()` and `glideHome()`), and `tests/bounce.test.ts` tests them directly.

### `Motion`

<!-- code: apps/desktop/src/main/bubble/bounce.ts#Motion -->

[`src/main/bubble/bounce.ts`, lines 4–10](../../apps/desktop/src/main/bubble/bounce.ts#L4-L10)

```ts
/** Position (DIP) and velocity (DIP per second) of the bouncing bubble. */
export interface Motion {
  x: number
  y: number
  vx: number
  vy: number
}
```

<!-- /code -->

A position plus a velocity: how many DIPs per second the bubble moves in each direction. A
positive `vx` means moving right; a positive `vy` means moving down, because screen coordinates
grow downward.

### `BOUNCE_SPEED`, `MAX_STEP_MS`

<!-- code: apps/desktop/src/main/bubble/bounce.ts#BOUNCE_SPEED,MAX_STEP_MS -->

[`src/main/bubble/bounce.ts`, lines 12–14](../../apps/desktop/src/main/bubble/bounce.ts#L12-L14)

```ts
export const BOUNCE_SPEED = 280

/** Longer gaps (e.g. the machine was asleep) are treated as one short step. */
const MAX_STEP_MS = 100
```

<!-- /code -->

- `BOUNCE_SPEED = 280`: DIPs per second, about 4.5 DIPs per frame.
- `MAX_STEP_MS = 100`: if the timer stalls (the PC slept, or the main process was busy), the next
  frame reports a long gap. Moving the full distance would make the bubble teleport; capping the
  step means it just carries on from where it was.

### `launch()`

<!-- code: apps/desktop/src/main/bubble/bounce.ts#launch -->

[`src/main/bubble/bounce.ts`, lines 16–32](../../apps/desktop/src/main/bubble/bounce.ts#L16-L32)

```ts
/** Sets off away from the bubble's corner, into the screen, at a random 25°–65° angle. */
export function launch(
  from: Point,
  random: () => number = Math.random,
  corner: Corner = 'bottom-right',
  speed = BOUNCE_SPEED,
): Motion {
  const angle = ((25 + random() * 40) * Math.PI) / 180
  const dx = isLeftCorner(corner) ? 1 : -1
  const dy = isTopCorner(corner) ? 1 : -1
  return {
    x: from.x,
    y: from.y,
    vx: dx * speed * Math.cos(angle),
    vy: dy * speed * Math.sin(angle),
  }
}
```

<!-- /code -->

Sets the bubble off: away from the corner it rests in, into the screen, at a random angle between
25° and 65° from horizontal. The range keeps it from running flat along an edge or straight up.

- `((25 + random() * 40) * Math.PI) / 180`: `random()` gives a number from 0 to 1, so the angle is
  25° to 65°. It's converted to radians, which `Math.cos` and `Math.sin` expect.
- `const dx = isLeftCorner(corner) ? 1 : -1`: from a left corner go right (+1); from a right corner
  go left (-1). `dy` does the same vertically: from a bottom corner, -1 means up.
- `vx: dx * speed * Math.cos(angle)`: splits the speed into its horizontal and vertical parts, so
  the overall speed is always `speed`, whatever the angle.
- `random: () => number = Math.random`: a default, like `speed = BOUNCE_SPEED`. The controller
  passes its own `random` so the tests can fix the angle.

### `step()`

<!-- code: apps/desktop/src/main/bubble/bounce.ts#step -->

[`src/main/bubble/bounce.ts`, lines 34–40](../../apps/desktop/src/main/bubble/bounce.ts#L34-L40)

```ts
/** Advances the motion by `dtMs`, reflecting off the edges of `box`. */
export function step(motion: Motion, dtMs: number, box: TravelBox): Motion {
  const dt = Math.min(Math.max(dtMs, 0), MAX_STEP_MS) / 1000
  const [x, vx] = reflect(motion.x + motion.vx * dt, motion.vx, box.minX, box.maxX)
  const [y, vy] = reflect(motion.y + motion.vy * dt, motion.vy, box.minY, box.maxY)
  return { x, y, vx, vy }
}
```

<!-- /code -->

Advances one frame: moves by velocity × time on each axis, then bounces off any edge it crossed.
`startBounce()` calls it every frame with the real milliseconds since the last one and the
current travel box.

- `Math.min(Math.max(dtMs, 0), MAX_STEP_MS) / 1000`: clamps the elapsed time to 0–100 ms (it
  should never be negative, but that costs nothing to rule out), then converts it to seconds to
  match the velocity.
- `const [x, vx] = reflect(`: `reflect()` returns a pair, and this _destructures_ it into two
  variables. The two axes are handled separately, which is how a bounce off a wall works: hitting a
  side wall flips only `vx`.
- `return { x, y, vx, vy }`: a new `Motion`; the old one is left unchanged.

### `reflect()`

<!-- code: apps/desktop/src/main/bubble/bounce.ts#reflect -->

[`src/main/bubble/bounce.ts`, lines 42–47](../../apps/desktop/src/main/bubble/bounce.ts#L42-L47)

```ts
function reflect(position: number, velocity: number, min: number, max: number): [number, number] {
  if (max <= min) return [min, velocity]
  if (position < min) return [Math.min(min + (min - position), max), Math.abs(velocity)]
  if (position > max) return [Math.max(max - (position - max), min), -Math.abs(velocity)]
  return [position, velocity]
}
```

<!-- /code -->

One axis of a bounce. It isn't exported: only `step()` uses it.

- `if (max <= min) return [min, velocity]`: the work area is too small for the bubble to move in
  this direction, so it's pinned at the edge rather than jittering back and forth.
- `if (position < min)`: the bubble went past the low edge by `min - position`. It's mirrored back
  inside by the same amount, as if it had bounced exactly at the edge.
- `Math.min(min + (min - position), max)`: the cap stops a huge overshoot from bouncing the bubble
  out past the far edge. So whatever happens, the result is inside the box.
- `Math.abs(velocity)`: forces the velocity to point inward rather than just flipping it. If the
  bubble is outside the box because the work area shrank mid-bounce, it may already be heading
  back in; flipping would send it out again.

### `glideDuration()`

<!-- code: apps/desktop/src/main/bubble/bounce.ts#glideDuration -->

[`src/main/bubble/bounce.ts`, lines 49–53](../../apps/desktop/src/main/bubble/bounce.ts#L49-L53)

```ts
/** Glide length scales with distance, kept between 0.3 s and 0.9 s. */
export function glideDuration(from: Point, to: Point): number {
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  return Math.min(900, Math.max(300, distance / 1.5))
}
```

<!-- /code -->

How long the glide home takes, in milliseconds: the straight-line distance (`Math.hypot`) divided
by 1.5, so roughly 1.5 DIPs per millisecond, but never less than 300 ms or more than 900 ms. A
short hop still looks deliberate, and a long trip across the screen doesn't drag on.

### `glidePosition()`

<!-- code: apps/desktop/src/main/bubble/bounce.ts#glidePosition -->

[`src/main/bubble/bounce.ts`, lines 55–60](../../apps/desktop/src/main/bubble/bounce.ts#L55-L60)

```ts
/** Position at progress `t` (0–1) along the glide home, easing out as it settles. */
export function glidePosition(from: Point, to: Point, t: number): Point {
  const progress = Math.min(Math.max(t, 0), 1)
  const eased = 1 - (1 - progress) ** 3
  return { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased }
}
```

<!-- /code -->

Where the bubble is at progress `t` along the glide (0 at the start, 1 at home).

- `Math.min(Math.max(t, 0), 1)`: clamps `t`, so the bubble can never overshoot home.
- `1 - (1 - progress) ** 3`: a cubic _ease-out_ curve (`**` means "to the power of"). It climbs
  quickly at first and flattens out toward 1, so the bubble moves fast at the start and slows as it
  settles into the corner.
- `from.x + (to.x - from.x) * eased`: moves that fraction of the way from the start to home, on
  each axis.

---

## `src/main/bubble/windows.ts`: creating the Electron windows

The only file in this folder that uses Electron. It creates the two overlay windows, locks them
down, and adapts them to the controller's `Surface` interface. `index.ts` calls
`createOverlayWindow()` twice at startup, once per view, and wraps the results with
`bubbleSurface()` and `panelSurface()` before handing them to `BubbleController`.

Key ideas:

- **Two windows, one page.** Both windows load the same renderer page; `?view=bubble` or
  `?view=panel` in its address tells `main.tsx` which UI to draw. The bubble has its own tiny
  window so it never resizes when the panel opens, and only a 72×72 window moves during a drag or
  a bounce.
- **Click-through.** The panel window is a large rectangle (sized for the chat card at its
  tallest), but most of it is transparent. `setIgnoreMouseEvents(true, { forward: true })` makes
  Windows pass clicks on it to whatever is underneath, while still telling the page where the
  pointer is. While the pointer is over a piece of real UI (an element marked `data-hit`), the
  page's `useClickThrough` hook asks the main process to take mouse input again
  (`IPC.setInteractive`, handled in `ipc.ts`). The bubble window is never click-through: it's barely larger than the
  bubble, and relying on Windows' mouse forwarding there made clicks occasionally fall through the
  bubble to the window behind it.

### `View`

<!-- code: apps/desktop/src/main/bubble/windows.ts#View -->

[`src/main/bubble/windows.ts`, line 7](../../apps/desktop/src/main/bubble/windows.ts#L7)

```ts
export type View = 'bubble' | 'panel'
```

<!-- /code -->

A _union type_: a `View` can only be the string `'bubble'` or `'panel'`, and TypeScript rejects
anything else.

### `createOverlayWindow()`

<!-- code: apps/desktop/src/main/bubble/windows.ts#createOverlayWindow -->

[`src/main/bubble/windows.ts`, lines 9–59](../../apps/desktop/src/main/bubble/windows.ts#L9-L59)

```ts
/**
 * Creates one of the two overlay windows. Both are frameless, transparent, always on top and
 * hidden from the taskbar and Alt+Tab.
 *
 * The panel window is mostly see-through, so it's click-through: clicks on its empty areas go to
 * whatever is underneath, and the renderer turns mouse input back on while the pointer is over
 * real UI (see useClickThrough). The bubble window is never click-through: it's barely larger
 * than the bubble, and relying on Windows' mouse forwarding there made clicks occasionally fall
 * through the bubble to the window behind it.
 */
export function createOverlayWindow(view: View, size: Size): BrowserWindow {
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
    alwaysOnTop: true,
    type: 'toolbar',
    // The bubble never takes keyboard focus, so clicking it doesn't blur the panel.
    focusable: view === 'panel',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: view === 'panel',
    },
  })
  lockDown(win, view)
  if (view === 'panel') {
    win.setIgnoreMouseEvents(true, { forward: true })
    addEditContextMenu(win)
  }

  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServer) {
    void win.loadURL(`${devServer}?view=${view}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { query: { view } })
  }
  return win
}
```

<!-- /code -->

Creates one overlay window. `new BrowserWindow({...})` makes a native window with a Chromium page
inside; the options say what kind of window.

- `...size`: the window's `width` and `height`: `BUBBLE_BOX` square for the bubble,
  `panelWindowSize(actionCount)` for the panel. Neither window changes size later, only position.
- `show: false`: created hidden. The controller decides when each one appears.
- `transparent: true`: together with `frame: false` (no title bar or border) and a fully
  transparent `backgroundColor` (in `'#00000000'` the last two hex digits are the alpha), only what
  the page draws is visible.
- `thickFrame: false`: Windows-only. The standard resizable frame would bring the system shadow
  and the minimise and maximise animations. With `hasShadow: false`, Windows adds no shadow; the
  page draws its own.
- `type: 'toolbar'`: on Windows, a toolbar window is left out of Alt+Tab. `skipTaskbar: true` keeps
  it off the taskbar too.
- `focusable: view === 'panel'`: the bubble window can never take keyboard focus, so clicking it
  doesn't take focus from the panel (which would close it, see `panelBlurred()`) or from the app
  you're working in. The panel must be focusable, since you type in it.
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
- `process.env['ELECTRON_RENDERER_URL']`: set by `electron-vite` during `npm run dev` to the
  address of its dev server, which serves the page with live reloading. `!app.isPackaged` makes
  sure an installed app always loads the page bundled with it.
- `{ query: { view } }`: `loadFile()` adds `?view=bubble` or `?view=panel` to the built page's
  address.
- `void win.loadURL(`: loading returns a promise that isn't awaited; `void` marks that as
  deliberate.

### `bubbleSurface()`, `panelSurface()`

<!-- code: apps/desktop/src/main/bubble/windows.ts#bubbleSurface,panelSurface -->

[`src/main/bubble/windows.ts`, lines 61–79](../../apps/desktop/src/main/bubble/windows.ts#L61-L79)

```ts
export function bubbleSurface(win: BrowserWindow): Surface {
  return {
    setBounds: (bounds) => win.setBounds(bounds),
    show: () => win.showInactive(),
    hide: () => win.hide(),
  }
}

export function panelSurface(win: BrowserWindow): PanelSurface {
  return {
    setBounds: (bounds) => win.setBounds(bounds),
    show: () => {
      resetClickThrough(win)
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

- `show: () => win.showInactive()`: shows the bubble without activating it, so it never steals
  focus.
- `resetClickThrough(win)`: the panel's click-through is reset each time, just before it's shown.
- `win.show()`: unlike `showInactive()`, this shows and activates the panel.
- `focus: () => win.focus()`: gives the panel keyboard focus, so you can type straight away.
- `hide: () => win.hide()`: hides the window; its page keeps running.

### `resetClickThrough()`

<!-- code: apps/desktop/src/main/bubble/windows.ts#resetClickThrough -->

[`src/main/bubble/windows.ts`, lines 81–93](../../apps/desktop/src/main/bubble/windows.ts#L81-L93)

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

[`src/main/bubble/windows.ts`, lines 95–104](../../apps/desktop/src/main/bubble/windows.ts#L95-L104)

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

Basic safety and crash recovery for both pages.

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

[`src/main/bubble/windows.ts`, lines 106–127](../../apps/desktop/src/main/bubble/windows.ts#L106-L127)

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
