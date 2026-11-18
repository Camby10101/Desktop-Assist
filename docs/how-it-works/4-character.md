## 16. bubble/BubbleController.ts — her state machine

**File:** `src/main/bubble/BubbleController.ts` · **Job:** everything about where she is and what
she's doing: open or closed, carried, falling, walking, her habits and performances, her size.
**Used by:** `index.ts` (which makes it), `ipc.ts` (clicks and drags), `actions.ts`, the screen saver.

The code still calls her "the bubble": she was a round logo before she was a character. At any
moment she is in one of five **modes**, and most methods begin by checking which:

```figure
modes
```

The controller never touches an Electron window. It's given **surfaces** and **displays**, plain
interfaces that `index.ts` fills with the real thing and the tests with fakes:

```ts
export interface Surface {
  setBounds(bounds: Rect): void
  show(): void
  hide(): void
}

export interface Displays {
  primary(): DisplayArea
  byId(id: number): DisplayArea | undefined
  nearest(point: Point): DisplayArea
  cursor(): Point // where the mouse pointer is, in DIPs
}
```

### Opening and closing

#### `clickBubble(pressedAt?)`

What a click means depends on the mode. Collapsed, it opens the panel; expanded, it closes it;
carried, it means the mouse button came up without the drag hearing of it, so she's let go:

```ts
clickBubble(pressedAt?: number): void {
  if (this.leaving || this.asleep) return
  switch (this.mode) {
    case 'collapsed': {
      const closedByThisPress = … // this press already closed the panel (see below)
      if (closedByThisPress) return
      this.expand()
      return
    }
    case 'expanded':
      this.collapse()
      return
    case 'dragging':
      this.deps.onDiagnostic?.('Bubble clicked while carried: letting go')
      this.endDrag()
      return
    case 'returning':
    case 'capturing':
      return // falling, or hidden for a screenshot: a click means nothing yet
  }
}
```

> **Good to know**
> Clicking her while the panel is open moves the focus from the panel to her window, and the panel
> closes itself as soon as it loses the focus (`panelBlurred()`). So by the time the click arrives,
> the panel is already closed, and a naive click handler would reopen it. That's why her page sends
> `pressedAt`, the moment the button went down: if the panel closed after that moment, this press
> already did the click's job.

`expand()` and `collapse()` do the opening and closing; `collapse()` hides the panel window 150 ms
later, after the page's fade-out. A double-click sends `bubblePet` for its second click, so it opens
or closes the panel once and pets her once (`pet()` plays her `pet` reaction: hearts and a wiggle).

### Being carried and thrown

#### `startDrag()`, `dragHeld()`, `endDrag()`

When her page sees the pointer pressed on her and moved more than 5 pixels, it calls `startDrag()`.
The controller notes where on her she was grabbed and starts its ticker: 60 times a second her window
moves to follow the real pointer, read in the main process, which keeps it smooth across screens with
different scaling. It also keeps the last 20 pointer positions, to work out how fast she was moving
when let go.

```ts
this.runTicker(() => {
  // No word for a while that the button's still down: let her go rather than leave her stuck.
  if (this.now() - this.lastHeld > DRAG_CHECK.staleMs) {
    this.deps.onDiagnostic?.('Drag ended: no word that the mouse button is still down')
    this.endDrag()
    return
  }
  const now = this.deps.displays.cursor()
  this.pointerTrail.push({ t: this.now(), ...now })
  if (this.pointerTrail.length > 20) this.pointerTrail.shift()
  this.moveBubble({ x: now.x - grab.x, y: now.y - grab.y })
})
```

> **Why it's built this way**
> On a busy PC the mouse button's release can go missing, and she stayed stuck to the pointer. Now
> her page tells the main process every 250 ms that the button is still down (`dragHeld()`), and lets
> her go itself if it sees the button up. If the word stops for two seconds (`DRAG_CHECK`), the
> controller lets her go anyway. Two independent checks, so one lost message can't strand her.

`endDrag()` works out her speed at release (`releaseVelocity`, section 17). Faster than 350 DIPs a
second, she's **thrown** (`fling()`); otherwise she **falls** straight down (`fall()`) onto the
taskbar of the screen she was dropped on. Either way she now belongs to that screen's nearer bottom
corner (`nearestCorner`), her inset from it is remembered (`insetAt`), she shrinks if that screen
is too small for her size (`fitScale`), and the new place is saved for next time.

#### `fling(velocity)` and `land(impact)`

A throw runs the ticker with `flightStep()` (section 17) until she reaches the taskbar. `land()` then
checks how hard she hit: at 1,300 DIPs a second or more (`isHardLanding`) she plays `splat`, on her
bottom with her hat over her eyes and stars round her head, for 3.2 seconds, then gets up. Landed far
from her corner, she walks back.

### Her own time

#### `scheduleActivity(first)` and `doActivity()`

While the panel is closed and nothing's happening, she waits 5 to 12 seconds (the first time) or 8
to 20 seconds, then asks `nextActivity()` (section 17) what to do:

```ts
private doActivity(): void {
  this.idleTimer = null
  if (this.mode !== 'collapsed') return
  const activity = nextActivity(
    this.now() - this.lastInteraction, // how long she's been left alone
    this.inset, this.zone(), this.random, this.lastFidget, this.pastimes,
    { when: new Date(this.now()), performances: this.deps.performer?.available(this.pastimes.walk) ?? [] },
  )
  if (activity.kind === 'rest') return this.scheduleActivity(false)
  if (activity.kind === 'perform') {
    this.lastFidget = activity.name
    return this.prepare(activity.name)
  }
  if (activity.kind === 'walk') return this.walkTo(activity.to)
  this.lastFidget = activity.pose
  this.setPose(activity.pose) // a habit: play it for its time, then stand and wait again
  this.idleTimer = setTimeout(() => {
    this.setPose('idle')
    this.scheduleActivity(false)
  }, FIDGET_MS[activity.pose])
}
```

Anything the user does (a click, a drag, a screenshot) calls `stopIdling()`, which stops whatever she
was doing where she is, and starts the "left alone" clock again. The settings **Stand still** and
**No idle animations** become `pastimes` (`walk` and `fidget`), which `nextActivity` respects.

#### `prepare(name)` and `perform(performance)`

A performance (section 19) first has to be got ready, which can take a moment (finding the taskbar's
buttons, taking a screenshot). `prepare()` asks for it and, when it arrives, checks nothing changed
meanwhile: if she was clicked or picked up while it was being prepared, the performance is ended
unplayed. Then `perform()` plays it, one ticker frame at a time:

```ts
private perform(performance: Performance): void {
  this.cancelActivity()
  this.performance = performance
  const startedAt = this.now()
  this.runTicker(() => {
    const step = performance.at(this.now() - startedAt)
    if (!step) return this.endPerformance(true) // it's over
    if (step.pose !== this.pose) this.setPose(step.pose)
    this.moveBubble({ x: step.x, y: step.y })
  })
}
```

A performance only says, for each moment, where her box is and what pose she's in. The controller
neither knows nor cares whether that's juggling icons or waving through a portal.

### Reacting

- **`react(pose)`** plays a reaction once, with the panel open or closed (but not while she's
  carried, falling or asleep). Petting uses it, and the Jira checks use it for `scroll` when there's
  news.
- **`watchPointer()`** runs every 50 ms while she stands about, keeps the last 1.2 seconds of pointer
  positions, and asks `pointerReaction()` (section 17) whether they zipped past her or wiggled near
  her. She answers 60% of the time, then not again for 45 seconds.
- **`watchIdle()`** runs every second and asks Windows how long since anyone used the mouse or
  keyboard (`powerMonitor.getSystemIdleTime()`). After five minutes (`SNOOZE.afterMs`) she plays
  `settle`, sits down, and holds `snooze`, z's floating up; any input brings `rouse`, and she gets on
  with her day. It never starts while the screen saver is on or the panel is open.

### Coming and going

- **`sleep()`** and **`wake()`**: the screen saver. She dissolves into white motes (`vanish`), her
  window hides, and nothing can open the panel or pick her up; on waking she forms again (`appear`).
- **`teleport()`**: her spell. She vanishes, her window moves elsewhere near her corner, she appears.
- **`farewell(done)`**: closing the app. She vanishes where she stands, then `done()` quits.
- **`whileHidden(task)`**: a screenshot. Mode `capturing`: both windows hide, Windows is given a
  moment to repaint, `task()` runs, and the panel comes back.

## 17. bubble/wander.ts — what she does next, and how she moves

**File:** `src/main/bubble/wander.ts` · **Job:** the decisions and the physics, as plain functions
of plain numbers. **Used by:** `BubbleController`, and the window tricks for falls.

Nothing here has a timer, a window or a clock; each function is handed what it needs and returns an
answer. That makes it the easiest file to test, and the one to change when you want her to behave
differently.

| Setting (in `WANDER`) | Value            | What it means                                                 |
| --------------------- | ---------------- | ------------------------------------------------------------- |
| `zone`                | 180 DIPs         | how far from her corner she wanders (more when she's bigger)  |
| `walkSpeed`           | 80 DIPs a second | her stroll                                                    |
| `minWalk`             | 40 DIPs          | shorter walks aren't worth it                                 |
| `firstDelay`, `delay` | 5–12 s, 8–20 s   | the wait before the first thing she does, then between things |
| `fidgetAfter`         | 30 s             | only strolls until she's been left alone this long            |
| `gravity`             | 2,500 DIPs/s²    | falling after a drop                                          |

#### `nextActivity(idleMs, inset, zone, random, last, allowed, choices)`

Until she's been alone 30 seconds she only strolls. After that, 60% of the time she does a habit or a
performance instead, chosen by **weight**: every option is given a stretch as long as its weight, the
stretches are laid end to end, and a random point along them picks one. An ordinary habit weighs 1,
the vision 0.2, confetti 5 (on Friday evenings only), and the taskbar tricks and watching the pointer
0.1 each, a tenth as likely as a habit. Whatever she did last is left out, so she never does the
same thing twice running.

```ts
// A point along all the weights laid end to end; the one whose stretch it falls in.
let roll = random() * options.reduce((total, option) => total + option.weight, 0)
for (const option of options) {
  roll -= option.weight
  if (roll < 0) return option.activity
}
return options.at(-1)!.activity
```

```figure
weights
```

> **Try it yourself**
> In `tests/wander.test.ts`, the helper `rolls(…)` feeds `nextActivity` the dice you choose. Change
> `PERFORMANCE_WEIGHT.carry` to 5 and run `npx vitest run tests/moments.test.ts`: the test that
> counts 20,000 draws and expects a trick about a tenth as often as a habit fails, and tells you by
> how much.

#### `walkTarget(inset, zone, roll)`

Somewhere else in her zone, at least `minWalk` away: the stretches before and after her that are far
enough are laid end to end, and `roll` picks a point along them, so every allowed spot is equally
likely.

#### `releaseVelocity(samples, now)` and `flightStep(flight, dtMs, room)`

How fast the pointer was going over the last 100 ms before letting go (capped at 4,200 DIPs a
second), and then one frame of flight: gravity pulls her down, the sides and top of the screen turn
her back with 35% of her speed (a dull thud more than a bounce), and the taskbar stops her.

```ts
export const FLING = { sampleMs: 100, minSpeed: 350, maxSpeed: 4200, gravity: 3000, bounce: 0.35, splatSpeed: 1300 }

export function flightStep(flight: Flight, dtMs: number, room) {
  const dt = Math.min(Math.max(dtMs, 0), 50) / 1000 // a slow frame never jumps her through a wall
  let { x, y, vx, vy } = flight
  vy += FLING.gravity * dt
  x += vx * dt
  y += vy * dt
  if (x < room.minX) { x = room.minX; vx = Math.abs(vx) * FLING.bounce }
  else if (x > room.maxX) { x = room.maxX; vx = -Math.abs(vx) * FLING.bounce }
  if (y < room.minY) { y = room.minY; vy = Math.abs(vy) * FLING.bounce }
  if (y >= room.floor) return { flight: { x, y: room.floor, vx: 0, vy: 0 }, landed: true, impact: Math.max(0, vy) }
  return { flight: { x, y, vx, vy }, landed: false, impact: 0 }
}
```

> **Good to know**
> `Math.abs` on the bounce matters. Without it, a fast throw could carry her a little past the wall
> in one frame, flip her speed, then flip it back the next frame while she's still past it, and she'd
> stick to the edge of the screen, shaking. Always pointing the speed away from the wall can't do
> that.

#### `pointerReaction(seen, her, scale)`

Looks at the last second or so of pointer positions. A segment that passes within 110 DIPs of her
middle faster than 2,000 DIPs a second startles her; four or more changes of direction within 160
DIPs of her, in 1.2 seconds, make her pounce toward it (`pounce-left` or `pounce-right`).

## 18. bubble/ — her windows, and keeping them in front

**Files:** `layout.ts`, `windows.ts`, `frontCheck.ts`, `clones.ts`, `vision.ts`, `spellEffects.ts`,
and `../screenSaver.ts` · **Job:** where her windows go, how they're made, and the windows that come
and go for a moment.

#### `restPosition(workArea, corner, inset, scale)` (in `layout.ts`)

Where she stands: her feet on the taskbar, `inset` DIPs along from her corner, never off the work
area. Its opposite, `insetAt()`, turns a position back into an inset; `nearestCorner()` picks the
bottom corner on her side of the screen.

```ts
const { size, pad } = bubbleMetrics(scale)
const along = Math.min(Math.max(inset, 0), maxInset(workArea, scale))
return {
  x: isLeftCorner(corner)
    ? workArea.x + UI.edgeMargin + along
    : workArea.x + workArea.width - UI.edgeMargin - size - along,
  y: workArea.y + workArea.height - pad - size, // her feet on the work area's bottom edge
}
```

#### `createOverlayWindow(view, size, query)` (in `windows.ts`)

Every window is made here: frameless, transparent, hidden from the taskbar and Alt+Tab, and its page
locked down. The passive ones (clones, vision, spell, familiar, trick) can't take the focus, and
ignore the mouse entirely.

```ts
const win = new BrowserWindow({
  ...size, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
  hasShadow: false, resizable: false, skipTaskbar: true, type: 'toolbar',
  focusable: !passive(view),
  webPreferences: {
    preload: join(__dirname, '../preload/index.js'),
    sandbox: true, contextIsolation: true, nodeIntegration: false,
    backgroundThrottling: false, // keep animating while not focused
  },
})
```

> **Why it's built this way**
> The windows sit at the always-on-top level `'pop-up-menu'`, not Electron's default `'floating'`.
> At the default level Windows tucks a window just behind the taskbar, and while a full-screen app is
> open it takes the taskbar out of the always-on-top group, taking her with it: started at sign-in
> with a full-screen browser open, she sat behind everything. One level up, she stays on top.

#### `frontCheck.ts`

Even so, Windows sometimes started her behind other apps' windows at sign-in. For her first ten
minutes (checks at 5 and 20 seconds, then 1, 3 and 10 minutes) a small PowerShell asks Windows which
window is at the centre of hers. If it's another app's, she's brought back to the front, and the log
says which app it was.

#### Windows for a moment: clones, vision, spells

`Clones`, `Vision` and `SpellEffects` work the same way: each opens one passive window through
`openOverlay` (section 14), puts everything its page needs to draw in the window's address (where
she stands, her size, the accent colour, the moment it began), and closes it when its time is up. The
page then draws and moves everything itself. Casting a spell again replaces the window; clicking her
stops her vision, and the explosion is called off if she stops chanting.

#### `screenSaver.ts`

`ScreenSaver.start()` opens a window over the whole of every screen, at the `'screen-saver'` level so
it covers the taskbar too, with the sunset on her screen and falling stars on the others. Each page
fades to white, then into its scene. Moving the mouse, a click, a key, or the window losing the
focus calls `wakeFrom(senderId)`; it listens only to its own windows, tells every page to fade away,
closes them 0.8 seconds later, and calls `BubbleController.wake()`.

## 19. performances/ and shell/ — her bigger acts

**Folders:** `src/main/performances/`, `src/main/shell/`, plus `familiar.ts` and `shared/tricks.ts`
· **Job:** the things she does that move her about and draw outside her own window. **Used by:**
`BubbleController`, through the `Performer` interface.

```ts
export interface Performer {
  /** The performances that can be done now; `canMove` is false when she's to stand still. */
  available(canMove: boolean): readonly PerformanceName[]
  prepare(name: PerformanceName, standing: { workArea: Rect; bounds: Rect; scale: number; box: Point }): Promise<Performance | null>
}
```

`Performances` (in `performances.ts`) is the app's `Performer`. It does one performance itself,
**watch** (for ten seconds her eyes follow the pointer: `gazeAt()` works out which of nine ways to
look, and her page is told whenever it changes), and `index.ts` plugs in the rest by name, each
saying whether it moves her. With Stand still on, only the ones that keep her in place are offered.

| Performance | Weight | What she does                                                                   | Made by            |
| ----------- | ------ | ------------------------------------------------------------------------------- | ------------------ |
| `watch`     | 0.1    | her eyes follow the pointer for ten seconds                                     | `performances.ts`  |
| six tricks  | 0.1    | carry, juggle, swap, perch, knock, tap: with copies of the taskbar's icons      | `taskbarTricks.ts` |
| `peek`      | 1      | slips behind the edge of a window near her, and peeks out                       | `windowTricks.ts`  |
| `portal`    | 1      | opens a portal on top of a window and waves through it; it goes with the window | `windowTricks.ts`  |
| `familiar`  | 1      | her black cat appears beside her, and she sits down with it a while             | `familiarVisit.ts` |

### shell/probe.ts — looking at Windows' own shell

The tricks need to know where the taskbar's buttons are and where the windows are. Windows'
**UI Automation**, the accessibility interface screen readers use, can tell any program that.
`ShellProbe` starts one hidden PowerShell running `PROBE_SCRIPT`, keeps it running while it's useful,
and asks it questions a line at a time; each answer comes back as one line of JSON:

```ts
private ask(request: string): Promise<unknown> {
  const child = this.start() // the PowerShell, started if it isn't running
  const id = String(this.nextId++)
  this.keepAlive() // stopped after two minutes with nothing asked
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      this.pending.delete(id)
      reject(new Error(`The shell didn't answer "${request}"`))
    }, this.deps.timeoutMs ?? 8000)
    this.pending.set(id, { resolve, reject, timer })
    child.stdin.write(`${id} ${request}\n`) // e.g. "7 taskbar"
  })
}
```

The questions are `taskbar` (every taskbar button: name and rectangle), `windows` (every top-level
window: handle, owner, class, state and rectangle) and `window <handle>` (one window now). The first
question takes about two seconds while PowerShell loads UI Automation; later ones take 15 to 50 ms.

> **Security**
> The probe only reads. The script never clicks, moves or changes anything, and the main process
> sends it nothing but those three questions (a window handle must be a whole number). The script
> goes to PowerShell as `-EncodedCommand`, not through a file another program could swap, and every
> answer is checked with zod before it's used.

### taskbarTricks.ts and shared/tricks.ts — tricks with the icons

`TaskbarTricks.prepare(name, standing)` gets a trick ready:

1. asks the probe for the taskbar's buttons, and keeps the apps' ones on her screen with
   `appButtons()`: squarish buttons nearly as tall as the taskbar, minus Start, Search, Task View,
   Widgets and the little icons by the clock (`NOT_APPS`);
2. picks buttons that suit the trick (one to carry, three neighbours to juggle, two to swap), near
   her when it can;
3. takes a screenshot of her screen with Electron's `desktopCapturer`, and cuts out each button's
   icon and a strip of plain taskbar next to it (to cover the real icon while its copy is "out");
4. makes a `TrickPlan` (where she stands, which buttons, which way the middle of the screen is), and
   opens a `trick` window over the bottom of her screen; once its page asks, it's sent the plan and
   the icons;
5. returns a `Performance` whose `at(t)` is `trickFrame(plan, t).her`.

```figure
trick
```

A trick is a list of **beats** (`beatsOf(plan)` in `shared/tricks.ts`), each with a length and a
function from "how far through this beat" (0 to 1) to a whole frame: where she is and her pose,
where each flying icon is, which buttons are covered, and any sparkles. `trickFrame` finds the beat
`t` falls in:

```ts
export function trickFrame(plan: TrickPlan, t: number): TrickFrame {
  let left = Math.max(0, t)
  for (const beat of beatsFor(plan)) {
    if (left < beat.ms) return { ...beat.at(left / beat.ms), done: false }
    left -= beat.ms
  }
  return { her: { x: plan.from, y: plan.ground, pose: 'idle' }, icons: [], covered: [], sparkles: [], done: true }
}
```

The swap, for example, is: walk between the two icons; wave her wand while they arc past each other
(the left one higher, so they don't collide); look guilty with a bead of sweat; wave again to swap
them back; walk home. Far from her icons (over 360 DIPs) she goes by magic instead of walking.

> **Why it's built this way**
> The main process moves her and the trick's page draws the icons, in two different processes. Rather
> than send sixty messages a second between them, both are given the same plan and the same start
> time and work out the same frame for themselves. They can't drift apart, and if a frame is late it
> just catches up.

> **Security**
> The screenshot is held in memory only for as long as it takes to cut out the icons; nothing is
> saved, and the icons go only to the trick's own window (the main process answers its request by
> checking the asking page's id). Nothing on the taskbar is clicked or moved: the "tricks" are copies
> drawn on top.

### windowTricks.ts — peeking, and the portal

`usableWindows()` keeps the windows worth using: other apps' (not hers, not the desktop or a
taskbar), with a title, in their normal state (not minimised, maximised or filling the screen), at
least 200 × 150 DIPs, and on her screen.

**Peek.** `peekEdge()` looks for a window that comes down over the taskbar height she stands at, with
room for her beside one of its edges, near her. `peekSteps()` makes the timetable: walk (or teleport)
to just outside the edge, slip behind it, peek out and wave, come out, and go home. While she's
behind it, her page is told the window's rectangle (`onOcclude`) and hides the part of her it covers
with a CSS `clip-path`, an outline of her window with the window-shaped hole cut out:

```ts
const hole = `M${x} ${y} H${x + occluder.width} V${y + occluder.height} H${x} Z`
element.style.clipPath = `path(evenodd, "M0 0 H${width} V${height} H0 Z ${hole}")`
frame = requestAnimationFrame(clip) // again next frame: her window moves as she peeks
```

**Portal.** `portalSpot()` picks a window whose top edge is high enough above the taskbar and wide
enough, nearest her. She vanishes from the taskbar, and her window moves to stand on that top edge,
where her `portal` pose plays: a swirling teal ring opens; she rises into it as if from its far side,
seen from the knees up, and waves for about five seconds; she sinks away; it closes (`PORTAL` in
`shared/character.ts`, 7.2 seconds in all). Then she appears back home. Every 100 ms the probe is
asked where the window is now (`window <handle>`), so if you drag it, the portal goes along with it.
If it's minimised, maximised or closed, she drops out onto the taskbar, with a splat if it was high.
Click her while she's in it and she goes straight back: she sinks away, the portal closes (her
`portal-back` pose), and she appears back home. The click opens nothing: the performance's
`clicked(t)` answers `true`, and `BubbleController.clickBubble()` leaves it at that (a performance
without `clicked`, or answering `false`, is ended by a click as usual).

The portal is drawn by `portalFrame()` in `sprite.ts`: her ordinary frame, then every pixel outside
the ring cleared (so whatever of her is outside it is cut away), the swirl filled in behind her, and
the glowing rim drawn over her edges.

### familiar.ts and lib/familiar.ts — her black cat

`Familiar.start(standing, ms)` opens a `familiar` window: a strip along her taskbar, told her size,
where she stands and when the cat leaves. Summoned while it's already visiting, it just stays longer.
As she moves or changes pose, `see()` tells the cat's page where she is and what she's doing, at most
every 40 ms. The page (`FamiliarView`) works out what the cat does, frame by frame, with
`stepCat()`:

```ts
if (her) {
  // Joining in with her: beside her, curled up, hopping, or sitting to watch.
  if (RESTFUL.includes(her.pose)) return walkTo(beside, 'loaf') // she sits, dozes, snoozes
  if (LIVELY.includes(her.pose)) return … 'hop' // she dances, cheers, is petted
  // Following her when she goes off (or is carried off).
  if (MOVING.includes(her.pose) && behind) return walkTo(beside, 'sit')
  // Any other habit or trick of hers: it sits and watches.
  …
}
// On its own: wandering near her, sitting, washing, now and then a nap.
```

A **visit** (the `familiar` performance) starts the cat for 16 seconds, and `familiarVisit()` has her
stand while it arrives, then sit with it. The Summon familiar spell starts it for a minute.
