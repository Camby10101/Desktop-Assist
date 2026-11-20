# Shared code and the preload bridge

[← Code Guide](CODE_GUIDE.md)

The app runs as two kinds of process: the **main process** (Node.js, which owns the windows,
files, sign-in and Claude) and a **renderer** for each window (Chromium, which draws the React
UI). They talk over **IPC** (inter-process communication): one side sends a message on a named
_channel_ and the other side listens on it. `src/shared` holds the TypeScript both sides must
agree on (window sizes, the character's poses and spells, the screen saver's timings, action names,
data shapes and the list of channels), imported as
`@shared/...` and bundled into each part. `src/preload/index.ts` is the small script that turns
that list of channels into `window.assist`, the only way a page can reach the main process.

## `src/shared/geometry.ts`: sizes and positions

Every size and offset the bubble and the panel use, plus a few helpers built on them. The main
process uses these numbers to size and place the two windows (`src/main/index.ts` and
`src/main/bubble/layout.ts`). The renderer uses the same numbers to place elements inside those
windows (`ActionStack.tsx`, `ChatBox.tsx`, `SettingsMenu.tsx`, `SpellsMenu.tsx`). Because both
read one file, a window can never be the wrong size for what is drawn in it.

The character comes in several sizes, which the user picks under Size in the settings menu (the
gear icon). A size is a _scale_: a multiple of her usual size, such as 2 for twice as big. The fixed
numbers in `UI` are her usual size (a scale of 1), and the helpers further down
(`bubbleMetrics()`, `panelLayout()` and the rest) take a scale and work out the sizes and offsets
for it. The bubble's box, its padding and the headroom above it grow with her; the action icons,
the chat card and the gaps between things stay the same size.

All values are **DIPs** (device-independent pixels): pixels before Windows display scaling. On a
display scaled to 150%, one DIP is 1.5 real pixels. Electron's window and screen functions and
the page's CSS pixels both work in DIPs, so one number means the same thing on both sides.

The key idea is that the panel's layout is measured from the corner the bubble sits in, not from
the top-left of the window. That way one set of numbers works in all four screen corners. (The
bubble is now a character that only ever stands near one of the two bottom corners, but the
layout still works from any of the four.)

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

[`src/shared/geometry.ts`, lines 23–30](../../apps/desktop/src/shared/geometry.ts#L23-L30)

```ts
/**
 * A screen corner. The character lives near a bottom one; the panel lays itself out from the
 * bubble's corner (any of the four) to open toward the screen's middle.
 */
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export const isLeftCorner = (corner: Corner): boolean => corner.endsWith('left')

export const isTopCorner = (corner: Corner): boolean => corner.startsWith('top')
```

<!-- /code -->

`Corner` is a _union of string literals_: a value of this type can only be one of those four
strings, and TypeScript rejects anything else at compile time. As the comment says, the
character lives near one of the two bottom corners, standing on the taskbar, so in practice the
corner is always `bottom-left` or `bottom-right` (the logo bubble it replaced could rest in any
of the four); the panel's layout still handles all four. Everything else opens toward the middle of the screen from the corner. The two helpers
answer "which side is the bubble on?", which is all the layout code needs in order to mirror
itself.

- `corner.endsWith('left')`: every name is "vertical-horizontal", so the horizontal side is the
  end of the string and the vertical side is the start.
- Callers: `restPosition()`, `insetAt()` and `panelWindowBounds()` in
  `src/main/bubble/layout.ts`; `bottomOf()` and `walkTo()` in `BubbleController.ts` (turning a
  saved top corner into the bottom one, and choosing which way the character faces as it walks);
  `anchored()` in `src/renderer/src/lib/anchor.ts`, which turns an offset into CSS `left`/`right`
  and `top`/`bottom`; `ActionStack` and `ChatBox` in `src/renderer/src/components` (which way the
  icons stack and where a toast goes); and `BubbleView` (which way the character faces while she
  stands).

### `UI`

<!-- code: apps/desktop/src/shared/geometry.ts#UI -->

[`src/shared/geometry.ts`, lines 32–59](../../apps/desktop/src/shared/geometry.ts#L32-L59)

```ts
export const UI = {
  /** Gap between the character and the side of the work area when it's right in its corner. */
  edgeMargin: 16,
  /** The bubble's box, which its position is measured from (its top-left corner). */
  bubbleSize: 80,
  /**
   * The bubble's window is this much bigger than the box on every side. The character is drawn
   * across the whole window, its feet on the window's bottom edge.
   */
  bubblePad: 8,
  /**
   * And this much taller again, above that: room for her hat when she rises off the taskbar (a
   * hop, levitating, being carried), which would otherwise go out of the top of her window.
   */
  bubbleHeadroom: 8,
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

Every fixed measurement of the UI in one object, in DIPs. The character's measurements
(`bubbleSize`, `bubblePad` and `bubbleHeadroom`) are for her usual size; `bubbleMetrics()` below
scales them.

- `as const`: makes the object read-only and keeps each value's exact type (`80` rather than
  `number`). Nothing can change these numbers at runtime by accident.
- `edgeMargin: 16`: as the comment says, how far the character stands from the side of the work
  area when it's right in its corner (`restPosition()` in `src/main/bubble/layout.ts`).
- `bubbleSize: 80`: the bubble's box, which positions are measured from. It started as the size of
  the round logo (56); at 80, the box and its padding make a window 96 DIPs wide, the width of the
  character's pixel grid, so at her usual size each of her pixels is one DIP.
- `bubblePad: 8`: the bubble's window is this much bigger than the box on every side. As the
  comment says, the character is drawn across the whole window, and `restPosition()` uses
  `bubblePad` to put the window's bottom edge, where the character's feet are, on the taskbar.
- `bubbleHeadroom: 8`: as the comment says, the window is this much taller again, above the
  padding over her box: room for her hat when she rises off the taskbar (at the top of a hop,
  levitating, or carried by the mouse). Without it, the tip of her hat went out of the top of the
  window and was cut off. Her feet stay on the window's bottom edge, so the extra room is all at
  the top: at her usual size the window is 96 wide and 104 tall. The rig draws 8 rows more above
  her grid to match (`HEADROOM` in `character/rig.ts`).
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

[`src/shared/geometry.ts`, lines 61–65](../../apps/desktop/src/shared/geometry.ts#L61-L65)

```ts
/**
 * The bubble window is the bubble plus its padding on every side (and its headroom above, see
 * bubbleMetrics).
 */
export const BUBBLE_BOX = UI.bubbleSize + UI.bubblePad * 2
```

<!-- /code -->

The bubble window's width at her usual size: 80 + 8 + 8 = 96. As the comment says, the window is
also taller than that by her headroom, so it's 96 + 8 = 104 tall; `bubbleMetrics()` below gives
both numbers for her scale (it multiplies this one by the scale as `box`, and adds `headroom`).
`start()` in `src/main/index.ts` creates the bubble window from them, and `bubbleWindowBounds()` in
`src/main/bubble/layout.ts` places it and sizes it for her scale. So the window moves as she
walks, and changes size only when she does. At her usual size, `BubbleView`'s button and the
`Character` drawing are 96 DIPs wide and 104 tall too, filling the window: the character's grid of
pixels, 96 wide (`SPRITE_SIZE` in `character/sprite.ts`) and 104 tall with the 8 rows of headroom
above it (`SPRITE_HEADROOM`), one pixel a DIP.

### `CHARACTER_SIZES` and `DEFAULT_SIZE`

<!-- code: apps/desktop/src/shared/geometry.ts#CHARACTER_SIZES,DEFAULT_SIZE -->

[`src/shared/geometry.ts`, lines 67–72](../../apps/desktop/src/shared/geometry.ts#L67-L72)

```ts
/**
 * The sizes she comes in, as multiples of her usual size (1): from half as big to six times as
 * big. Each keeps every measurement below a whole number of DIPs.
 */
export const CHARACTER_SIZES = [0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6] as const

export const DEFAULT_SIZE = 1
```

<!-- /code -->

The sizes she comes in, and the one she starts at.

- `CHARACTER_SIZES`: as the comment says, multiples of her usual size, from half as big (0.5) to six
  times as big (6). `as const` keeps the exact numbers, and makes the list read-only. Each one keeps
  the bubble's measurements whole numbers of DIPs (at 0.75 the box is 60, its padding 6 and its
  window 72), so the window never lands between two pixels. Size in the settings menu
  (`SizeControl.tsx`) steps through this list, `registerIpc()` in `src/main/ipc.ts` refuses any other number, and
  `snapSize()` below rounds anything else to one of these.
- `DEFAULT_SIZE = 1`: her usual size, used until the user picks another. It is also the default
  for every `scale` parameter below, so code that doesn't care about her size (or a test) can
  leave it out.

### `CharacterSize`

<!-- code: apps/desktop/src/shared/geometry.ts#CharacterSize -->

[`src/shared/geometry.ts`, lines 74–78](../../apps/desktop/src/shared/geometry.ts#L74-L78)

```ts
/** How big she is, and the biggest she can be on her screen (see largestSize). */
export interface CharacterSize {
  scale: number
  max: number
}
```

<!-- /code -->

How big she is now (`scale`), and the biggest she can be on the display she's on (`max`, from
`largestSize()` below). `BubbleController.size` builds it in the main process; it travels to the
pages in `AppState.size` and on `assist:size-changed`, and `window.assist.character.setSize()`
answers with it. The size
menu needs both numbers: `scale` to show, and `max` to know when to grey out Bigger.

### `snapSize()`

<!-- code: apps/desktop/src/shared/geometry.ts#snapSize -->

[`src/shared/geometry.ts`, lines 80–86](../../apps/desktop/src/shared/geometry.ts#L80-L86)

```ts
/** The nearest of CHARACTER_SIZES to `scale` (a saved size from an older version, say). */
export function snapSize(scale: number): number {
  if (!Number.isFinite(scale)) return DEFAULT_SIZE
  return CHARACTER_SIZES.reduce((best, size) =>
    Math.abs(size - scale) < Math.abs(best - scale) ? size : best,
  )
}
```

<!-- /code -->

As the comment says, the one of `CHARACTER_SIZES` nearest to any number, such as a size saved by
an older version with a different list.

- `if (!Number.isFinite(scale)) return DEFAULT_SIZE`: `NaN` (from text that isn't a number, say)
  or infinity means her usual size.
- `CHARACTER_SIZES.reduce(...)`: goes through the list keeping whichever size is closest so far.
  With no starting value, `reduce()` starts from the first size (0.5). On a tie the smaller size,
  which came first, is kept, because only a strictly closer size replaces it.
- Callers: `BubbleController` (the saved size it starts with, and every size it's asked for), and
  `ClonesView`, which reads her size from its window's address.

### `bubbleMetrics()`

<!-- code: apps/desktop/src/shared/geometry.ts#bubbleMetrics -->

[`src/shared/geometry.ts`, lines 88–105](../../apps/desktop/src/shared/geometry.ts#L88-L105)

```ts
/**
 * The bubble at a size: its box, the padding round it, its window's width (box plus padding,
 * `box`) and the room above that for her hat (`headroom`, so the window is `box` + `headroom`
 * tall).
 */
export function bubbleMetrics(scale: number = DEFAULT_SIZE): {
  size: number
  pad: number
  box: number
  headroom: number
} {
  return {
    size: UI.bubbleSize * scale,
    pad: UI.bubblePad * scale,
    box: BUBBLE_BOX * scale,
    headroom: UI.bubbleHeadroom * scale,
  }
}
```

<!-- /code -->

As the comment says, the bubble's four measurements at a size: `size`, the box (80 × scale);
`pad`, the padding round it (8 × scale); `box`, the whole window's width (96 × scale); and
`headroom`, the room above for her hat (8 × scale), so the window is `box + headroom` tall (104 ×
scale). Everything that places or draws her at her size starts here: the layout functions in
`src/main/bubble/layout.ts`, `start()` in `src/main/index.ts` (the window's first size),
`BubbleController`, `BubbleView` (the size of its button and drawing) and `ClonesView` (the size
of each clone). Note the names: `box` here is the window's width, while elsewhere in the guide
"the box" is the 80-DIP square that positions are measured from (here, `size`).

- `scale: number = DEFAULT_SIZE`: a _default parameter_. Called with no argument, `scale` is 1.
- `headroom: UI.bubbleHeadroom * scale`: like the others, it grows with her, so at twice her size
  there are 16 DIPs above her padding, and her hat has room in the same proportion at every size.

### `PanelLayout` and `panelLayout()`

<!-- code: apps/desktop/src/shared/geometry.ts#PanelLayout,panelLayout -->

[`src/shared/geometry.ts`, lines 107–130](../../apps/desktop/src/shared/geometry.ts#L107-L130)

```ts
/**
 * Where things sit inside the panel window, for her size. The panel window shares one corner with
 * the bubble window (the corner of the screen the bubble is in), and these offsets are measured
 * from that corner: `X` across, `Y` away from the screen edge. So the same numbers work in every
 * corner. The bigger she is, the further out the chat card and the action stack sit.
 */
export interface PanelLayout {
  actionsX: number
  actionsY: number
  chatX: number
  chatY: number
  settingsX: number
}

export function panelLayout(scale: number = DEFAULT_SIZE): PanelLayout {
  const { size, pad } = bubbleMetrics(scale)
  return {
    actionsX: pad + (size - UI.actionSize) / 2,
    actionsY: pad + size + UI.gap,
    chatX: pad + size + UI.gap,
    chatY: pad,
    settingsX: pad + (size + UI.actionSize) / 2 + UI.actionGap,
  }
}
```

<!-- /code -->

Where the parts of the panel (the action icons, the chat card, and the settings and spells menus) sit
inside the panel window, for her size. The panel window and the bubble window share one corner:
in the bottom-right of the screen, their bottom-right corners are in the same place
(`panelWindowBounds()` in `src/main/bubble/layout.ts`). Every offset here is measured from that
shared corner: `X` across, `Y` away from the screen edge (upward in a bottom corner, downward in a
top corner). In the renderer, `anchored()` (`src/renderer/src/lib/anchor.ts`) turns an `(X, Y)`
pair into CSS `right`/`bottom`, `left`/`top` and so on, so the same numbers mirror into every
corner. As the comment says, the bigger she is, the further out the chat card and the action stack
sit: they are placed beside and above her box, which grows with her.

`PanelView` works out `panelLayout(scale)` for her current size and passes it to `ChatBox`,
`ActionStack`, `SettingsMenu` and `SpellsMenu` as their `layout`; `panelWindowSize()` below uses it
for the window's size.

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

The numbers below are at her usual size (a scale of 1), where `size` is 80 and `pad` is 8:

- `const { size, pad } = bubbleMetrics(scale)`: the box and its padding at this size. A
  _destructuring_ assignment takes those two fields out of the object into variables of the same
  names.
- `actionsX: pad + (size - UI.actionSize) / 2`: 8 + 20 = 28, which centres the 40-DIP icons on the
  80-DIP box.
- `actionsY: pad + size + UI.gap`: 100. The first icon starts one gap beyond the box.
- `chatX: pad + size + UI.gap`: also 100. The chat card starts one gap to the side of the box,
  toward the middle of the screen.
- `chatY: pad`: 8, so the card's near edge is level with the box's near edge.
- `settingsX: pad + (size + UI.actionSize) / 2 + UI.actionGap`: 8 + 60 + 8 = 76. The first two
  terms reach the far side of the icon column; one more `actionGap` puts the menu just beside its
  icon. The settings menu and the spells menu both use it. Their other coordinate depends on where
  their icon is in the stack, so it comes from `actionOffset()` instead.

At twice her size (`size` 160, `pad` 16), the icons start 16 + 60 = 76 across (still centred on
her box) and 16 + 160 + 12 = 188 up, and the chat card starts 188 across.

### `actionStackHeight()` and `actionOffset()`

<!-- code: apps/desktop/src/shared/geometry.ts#actionStackHeight,actionOffset -->

[`src/shared/geometry.ts`, lines 132–139](../../apps/desktop/src/shared/geometry.ts#L132-L139)

```ts
export function actionStackHeight(actionCount: number): number {
  return actionCount > 0 ? actionCount * UI.actionSize + (actionCount - 1) * UI.actionGap : 0
}

/** Distance from the bubble's edge of the panel window to the near side of the action at `index`. */
export function actionOffset(index: number, scale: number = DEFAULT_SIZE): number {
  return panelLayout(scale).actionsY + index * (UI.actionSize + UI.actionGap)
}
```

<!-- /code -->

Two small sums over the icon stack.

- `actionCount > 0 ?`: `n` icons have `n - 1` gaps between them. With no icons the formula
  would give -8, so zero is handled separately. Only `panelWindowSize()` below uses this.
- `panelLayout(scale).actionsY + index * (UI.actionSize + UI.actionGap)`: icon `index` (0 is
  nearest the bubble) starts this far from the bubble's edge of the window, at her size `scale`
  (her usual size if left out). `PanelView.tsx` passes `actionOffset(settingsIndex, scale)` to
  `SettingsMenu` as its `offset`, and `actionOffset(spellsIndex, scale)` to `SpellsMenu`, so each menu
  lines up with its icon wherever the tenant put it in its list.

### `panelWindowSize()`

<!-- code: apps/desktop/src/shared/geometry.ts#panelWindowSize -->

[`src/shared/geometry.ts`, lines 141–149](../../apps/desktop/src/shared/geometry.ts#L141-L149)

```ts
export function panelWindowSize(actionCount: number, scale: number = DEFAULT_SIZE): Size {
  const layout = panelLayout(scale)
  const width = layout.chatX + UI.panelWidth + UI.shadowPad
  const contentHeight = Math.max(
    layout.chatY + UI.panelMaxHeight + UI.toastRoom,
    layout.actionsY + actionStackHeight(actionCount),
  )
  return { width, height: contentHeight + UI.shadowPad }
}
```

<!-- /code -->

How big the panel window must be to hold everything at its largest, for her size `scale`. The
window is created at her usual size (`start()` in `src/main/index.ts`), and
`panelWindowBounds()` in `src/main/bubble/layout.ts` sizes it for her scale whenever it places
it. It never resizes when the chat card grows, so there is no flicker; it changes size only when
she does. The unused parts are transparent and let clicks through to whatever is underneath (the
_click-through_ handled by `useClickThrough()` in the renderer).

The numbers below are at her usual size:

- `const layout = panelLayout(scale)`: the offsets for her size (see above).
- `layout.chatX + UI.panelWidth + UI.shadowPad`: 100 + 400 + 16 = 516 wide.
- `Math.max(`: the height is whichever reaches further from the screen edge: the chat card at
  full height plus room for a toast (8 + 520 + 40 = 568), or the icon stack. With Morse Micro's
  seven icons the stack is 7 × 40 + 6 × 8 = 328 long and ends at 100 + 328 = 428, so the card
  decides and the window is 584 tall. At her usual size the stack only matters with 10 or more
  icons. The bigger she is, the sooner it does: at twice her size, nine icons would end at
  188 + 424 = 612, beyond the card's 16 + 520 + 40 = 576. Morse Micro's seven end at
  188 + 328 = 516, so the card still decides, and the window is 592 tall (and 188 + 400 + 16 = 604
  wide).

### `largestSize()`

<!-- code: apps/desktop/src/shared/geometry.ts#largestSize -->

[`src/shared/geometry.ts`, lines 151–166](../../apps/desktop/src/shared/geometry.ts#L151-L166)

```ts
/**
 * The biggest of CHARACTER_SIZES she can be on a work area: standing in it with room at the
 * sides, and with the panel (its chat card and every action, above her) fitting on the screen,
 * so Settings can always be reached to make her smaller again.
 */
export function largestSize(workArea: Size, actionCount: number): number {
  const fitting = CHARACTER_SIZES.filter((scale) => {
    const panel = panelWindowSize(actionCount, scale)
    return (
      panel.width <= workArea.width &&
      panel.height <= workArea.height &&
      UI.bubbleSize * scale + 2 * UI.edgeMargin <= workArea.width
    )
  })
  return fitting.at(-1) ?? CHARACTER_SIZES[0]
}
```

<!-- /code -->

The biggest she may be on a display, so she can never be made too big to use. As the comment says,
a size fits a work area when both of these hold:

- `panel.width <= workArea.width && panel.height <= workArea.height`: the panel window at that size
  (`panelWindowSize()`, with all the tenant's icons) fits on the screen. Size is in the settings
  menu, in the panel, so this is what keeps it reachable to make her smaller again.
- `UI.bubbleSize * scale + 2 * UI.edgeMargin <= workArea.width`: her box, with the 16-DIP margin
  on both sides, fits across the work area.

How it does it:

- `CHARACTER_SIZES.filter(...)`: every size that fits. The sizes are smallest first, so
  `fitting.at(-1)` (the last item) is the biggest that fits.
- `?? CHARACTER_SIZES[0]`: if none fits, the smallest (0.5) anyway, so there's always an answer.
- `workArea: Size`: only the width and height matter, so any `Rect` (which has them) can be passed.

`BubbleController` calls it (through its private `largestScale()`) with the work area of the
display she's on, to keep her size to what fits there, and it's the `max` in `CharacterSize`.

## `src/shared/character.ts`: the character's poses

The bubble is drawn as a small character standing on the taskbar, and this file names what she
can be doing: her _pose_. As the comment at the top of the file says, the main process decides the
pose (`BubbleController` in `src/main/bubble/BubbleController.ts`) and the bubble's page animates
it (`Character.tsx` in `src/renderer/src/components`), so both import the names from here. The
pose travels to the page on `assist:pose-changed` and in `AppState.pose`. Besides the things she
does on her own, she has three poses for her spells, whose lengths come from the spells' timings
in `spells.ts` (below), the file's only import. At the end of the file, `VISION` holds the
timetable of one of her habits, and `CLONES` the numbers for her clones, which both sides need too.

### `FIDGETS`, `Fidget`, `Pose`, `FIDGET_MS` and `isFidget`

<!-- code: apps/desktop/src/shared/character.ts#FIDGETS,Fidget,Pose,FIDGET_MS,isFidget -->

[`src/shared/character.ts`, lines 6–302](../../apps/desktop/src/shared/character.ts#L6-L302)

```ts
/**
 * Things she does now and then, once she's been left alone for a while (each plays once):
 * - `hop`: a little jump.
 * - `wave`: waves at you.
 * - `stretch`: stretches her arms up and side to side, yawning.
 * - `sip`: a sip of tea.
 * - `vision`: a light shines down from above and brings the company's logo down to her; she looks
 *   up at it in wonder for a moment, then it rises away again (see VISION).
 * - `curtsy`: holds her robe out at the sides and dips in a little curtsy, smiling.
 * - `orb`: gazes into a crystal ball, which swirls and sparkles, then smiles at what she sees.
 * - `flame`: a flame kindles in her palm, flickers and grows; she blows it out in a curl of smoke.
 * - `frost`: a snowflake grows over her cupped hands, glinting, then bursts into glitter.
 * - `bloom`: she points at the ground; sparkles drip down and a flower sprouts, blooms and
 *   scatters into sparkles.
 * - `sigil`: she traces a star in the air in gold light; it flares, glows and fades away.
 * - `rainbow`: her hands sweep apart overhead, painting a rainbow over her, which shimmers and
 *   fades.
 * - `read`: reads her spellbook (and smiles at something in it).
 * - `spell`: a little spell, sparkles circling her hand.
 * - `levitate`: floats up over a glowing magic circle, hovers with her eyes shut, and settles.
 * - `sit`: sits on the taskbar, her robe spread round her, swaying, then gets up.
 * - `twirl`: spins round three times, her robe flaring out, and lands smiling.
 * - `butterfly`: holds up a finger; a little magic butterfly flutters down to it, rests, and flies
 *   off.
 * - `doze`: nods off where she stands (floating z's), wakes with a start and looks about.
 * - `look`: glances one way and the other.
 * - `juggle`: juggles three little glowing orbs, then catches them and smiles.
 * - `bubbles`: blows magic bubbles through a little wand ring; they drift up, wobble and pop.
 * - `wisp`: a will-o'-wisp goes round her twice, behind her and in front, her eyes following it,
 *   then flies off; she waves it goodbye.
 * - `sneeze`: "ah... ah... choo!", and the sneeze bursts into sparkles; a sheepish smile.
 * - `hat`: her hat floats up off her head and spins, showering sparkles, then settles back.
 * - `star`: a falling star drops into her cupped hands, glows there, and she tosses it back up.
 * - `rain`: a little cloud gathers over her and rains on her; she shoos it and it bursts into
 *   sparkles.
 * - `potion`: a flask in her hand bubbles and changes colour; the cork pops and coloured smoke
 *   puffs out.
 * - `tome`: her spellbook floats open in front of her, its pages turning by themselves and glowing
 *   letters rising out of it, then closes and vanishes.
 * - `yoyo`: a glowing yo-yo appears in her hand in a sparkle; she spins it down and up on its
 *   silver string, swings it round in a loop, and it vanishes in a twinkle.
 * - `top`: a little spinning top appears on her palm, spins there, wobbling, and she flicks it up
 *   and catches it.
 * - `cards`: a deck of cards appears in her hand; she springs them in an arc to her other hand and
 *   back, then they vanish.
 * - `plane`: a paper plane appears in her hand; she throws it, it flies a loop round her (behind
 *   her and back in front), and she catches it.
 * - `ball`: a bouncy ball appears in her hand; she bounces it on the taskbar, tosses it up high and
 *   catches it.
 * - `spirit`: a little spirit with leaf wings appears beside her in a swirl of sparkles; it flies to
 *   her, lands on her palm (hearts), loops round her head, they wave to each other, and it fades.
 * - `dance`: a little jig, stepping side to side, an arm up and a hand on her hip, then the other.
 * - `yawn`: a big yawn behind her hand, then a sleepy sway (late at night only: see TIMED).
 * - `confetti`: a cheer and a burst of confetti (Friday evenings only, and often then: see TIMED).
 */
export const FIDGETS = [
  'hop',
  'wave',
  'stretch',
  'sip',
  'vision',
  'curtsy',
  'orb',
  'flame',
  'frost',
  'bloom',
  'sigil',
  'rainbow',
  'read',
  'spell',
  'levitate',
  'sit',
  'twirl',
  'butterfly',
  'doze',
  'look',
  'juggle',
  'bubbles',
  'wisp',
  'sneeze',
  'hat',
  'star',
  'rain',
  'potion',
  'tome',
  'yoyo',
  'top',
  'cards',
  'plane',
  'ball',
  'spirit',
  'yawn',
  'confetti',
  'dance',
] as const

export type Fidget = (typeof FIDGETS)[number]

/**
 * - `idle`: standing, breathing, blinking now and then.
 * - `walk-left`, `walk-right`: walking along the taskbar (the window moves with her).
 * - `dragged`: dangling while she's dragged, or falling after a drop.
 * - `flung`: thrown, flying through the air, tumbling head over heels, arms and legs flailing.
 * - `splat`: a hard landing: down on her bottom in a puff of dust, her hat knocked down over her
 *   eyes and stars going round her head; she pushes it back up, shakes her head and gets up, with
 *   a sheepish smile (for LANDING.splatMs).
 * - one of the FIDGETS, the SPELL_POSES, the REACTIONS or the HELD_POSES.
 */
export type Pose =
  | 'idle'
  | 'walk-left'
  | 'walk-right'
  | 'dragged'
  | 'flung'
  | 'splat'
  | Fidget
  | SpellPose
  | Reaction
  | HeldPose

/** How long each fidget plays (ms): the main process goes back to idle after it. */
export const FIDGET_MS: Record<Fidget, number> = {
  hop: 1200,
  wave: 2000,
  stretch: 2400,
  sip: 3200,
  vision: 8600,
  curtsy: 2200,
  orb: 4400,
  flame: 3600,
  frost: 4000,
  bloom: 4400,
  sigil: 3600,
  rainbow: 4000,
  read: 4000,
  spell: 2400,
  levitate: 3600,
  sit: 6000,
  twirl: 2200,
  butterfly: 4800,
  doze: 5600,
  look: 2400,
  juggle: 4400,
  bubbles: 4400,
  wisp: 4800,
  sneeze: 3000,
  hat: 3600,
  star: 4400,
  rain: 4400,
  potion: 4000,
  tome: 4800,
  yoyo: 3600,
  top: 3600,
  cards: 4000,
  plane: 4400,
  ball: 4000,
  spirit: 6400,
  yawn: 3600,
  confetti: 3200,
  dance: 3200,
}

export const isFidget = (pose: Pose): pose is Fidget =>
  (FIDGETS as readonly string[]).includes(pose)
```

<!-- /code -->

- `FIDGETS`: the thirty things she does now and then once she's been left alone a while, each
  described in the comment above it. Ten are magic tricks added in 2.3.0: `flame` (a flame in her
  palm, blown out), `frost` (a snowflake over her hands), `bloom` (a flower she grows),
  `sigil` (a star traced in light), `rainbow`, `hat` (her hat floating off and spinning), `star` (a
  falling star caught and tossed back), `rain` (a little rain cloud), `potion` and `tome` (her
  spellbook floating open). They sit in two groups, five before `sit` and five before `dance`, so
  `sit` stays in the middle of the list (the controller's tests pick from the middle). Before them
  came `juggle` (three glowing orbs), `bubbles` (blown through a little wand ring), `wisp` (a
  will-o'-wisp that goes round her, behind her and in front), `sneeze` (a sneeze that bursts into
  sparkles) and `dance` (a little jig). One,
  `vision`, needs more than her own window: the light and the company's logo are drawn in a window
  of their own above her (see `VISION` below). The others, the butterfly, the dozer's z's, the
  orbs, the bubbles, the wisp and the sneeze's sparkles included, are drawn in her own window, so
  they stay close to her. `as const` makes it a fixed list of those exact strings, rather than any
  list of strings, which is what lets the next line make a type from it. It's a real list, not only
  a type, because code goes through it: `nextActivity()` in `src/main/bubble/wander.ts` picks one
  at random, and `Character` draws each one's frames ahead of time.
- `Fidget`: `(typeof FIDGETS)[number]` means "the type of any item of `FIDGETS`", so it's
  `'hop' | 'wave' | ... | 'dance'`, and adding a fidget to the list adds it to the type too. It's
  the narrower type for code that only deals with fidgets (`FIDGET_MS` here, and `Activity` and
  `nextActivity()` in `wander.ts`).
- `Pose`: the four poses that aren't fidgets, with what each looks like in the comment above it,
  or any `Fidget`, or any `SpellPose` (see the next section). The mode (`Mode` in `types.ts`) says
  what the app is doing; the pose only says how the figure looks. `idle`, the fidgets and the
  spells' poses happen while she stands; `walk-left` and `walk-right` while the main process moves
  her window along the taskbar; `dragged` whenever she's being moved about (dragged, or falling
  after a drop).
- `FIDGET_MS`: as the comment says, how long each fidget plays, from 1.2 seconds for the hop to
  8.6 for the vision; the newest five take 4.4 seconds (the juggling and the bubbles), 4.8 (the
  wisp), 3 (the sneeze) and 3.2 (the dance). Both sides use it. The main process waits this long
  before setting the pose back to `idle`, and the frames of each fidget's animation
  (`character/sprite.ts` in the renderer) add up to exactly the same time, which a test checks, so
  the pose changes back just as the last frame ends. `Record<Fidget, number>` makes TypeScript
  insist on a length for each fidget.
- `isFidget`: whether a pose is one of the fidgets, that is, whether `FIDGETS` includes it.
  `FIDGETS as readonly string[]` lets `includes()` take any pose (on the list's own type it would
  only take a `Fidget`, which is the very thing being checked). The return type, `pose is Fidget`,
  is a _type guard_: where it returns true, TypeScript treats `pose` as a `Fidget`, so
  `FIDGET_MS[pose]` type-checks without a cast.

### `SPELL_POSES`, `SpellPose`, `SPELL_POSE_MS` and `isSpellPose`

<!-- code: apps/desktop/src/shared/character.ts#SPELL_POSES,SpellPose,SPELL_POSE_MS,isSpellPose -->

[`src/shared/character.ts`, lines 103–123](../../apps/desktop/src/shared/character.ts#L103-L123)

```ts
/**
 * Poses of her own for her spells (src/shared/spells.ts), only when one is cast (for most, she
 * plays one of her habits instead: see CAST_POSE):
 * - `chant`: arms raised, eyes shut, a magic circle under her and her hair and robe lifting, as she
 *   chants (round and round, for as long as the explosion's chant lasts).
 * - `vanish`: she dissolves into white motes that drift up and fade (teleporting; and when the app
 *   is closed), and `appear`: the motes come down and she forms out of them (teleporting; and
 *   when the app starts).
 */
export const SPELL_POSES = ['chant', 'vanish', 'appear'] as const

export type SpellPose = (typeof SPELL_POSES)[number]

/** How long each of her spells' poses lasts (ms). */
export const SPELL_POSE_MS: Record<SpellPose, number> = {
  chant: EXPLOSION.chantMs,
  vanish: TELEPORT.vanishMs,
  appear: TELEPORT.appearMs,
}

export const isSpellPose = (pose: Pose): pose is SpellPose =>
  (SPELL_POSES as readonly string[]).includes(pose)
```

<!-- /code -->

What she does when one of her spells is cast. Unlike the fidgets, she never does these on her own:
the main process plays them on purpose (`BubbleController.act()` and `teleport()`), or, for
`vanish`, as the app closes (`farewell()`).

- `SPELL_POSES`: as the comment says, `chant` (arms raised, eyes shut, a magic circle under her and
  her hair and robe lifting, for as long as the explosion's chant lasts), `vanish` (she dissolves
  into white motes that drift up and fade) and `appear` (the motes come down and she forms out of
  them). Vanishing and appearing are her teleport, and also how she leaves when the app is closed
  and arrives when it starts. Most spells use none of these: as she casts the others, she does one
  of her fidgets instead (her little `spell` for the clones, and for the rest see `CAST_POSE` in
  `spells.ts`). `as const`, as for `FIDGETS`, makes it a list of those exact strings, so
  `SpellPose` can be made from it.
- `SPELL_POSE_MS`: as the comment says, how long each lasts: the chant as long as the explosion's
  (`EXPLOSION.chantMs`, 15 seconds), and vanishing and appearing as long as the teleport's two
  halves (`TELEPORT.vanishMs` and `appearMs`, 0.9 seconds each). The numbers live in `spells.ts`
  with the rest of the spells' timings, so changing one there changes her pose to match. As with
  `FIDGET_MS`, her animations (`character/sprite.ts`) take exactly this long, which a test checks
  for vanishing and appearing; the chant goes round and round until the main process stops it.
- `isSpellPose`: whether a pose is one of these, built just like `isFidget`. `BubbleController`
  uses it to stand her back up (`idle`) when something interrupts a spell, as it does a fidget.

### `VISION`

<!-- code: apps/desktop/src/shared/character.ts#VISION -->

[`src/shared/character.ts`, lines 304–315](../../apps/desktop/src/shared/character.ts#L304-L315)

```ts
/**
 * The `vision` habit's timetable (ms from its start), shared by her animation (sprite.ts) and the
 * window that draws the light and the logo above her (VisionView), so she looks up as it comes:
 * the light fades in, the logo comes down and hovers over her head for five seconds, rises away,
 * and the light fades out.
 */
export const VISION = {
  lightIn: [0, 600],
  descend: [300, 1800],
  ascend: [6800, 8000],
  lightOut: [7900, 8600],
} as const
```

<!-- /code -->

The timetable of her `vision` habit, in milliseconds from its start. As the comment says, two
things share it: her animation (`vision()` in `character/sprite.ts`, played in her own window) and
the window above her that draws the light and the logo (`VisionView.tsx`). Keeping the times in one
place is what makes her look up as the logo comes down, though the two are drawn by different
pages. Each entry is a `[from, to]` pair:

- `lightIn: [0, 600]`: the light fades in over the first 0.6 seconds.
- `descend: [300, 1800]`: the logo comes down the light, from 0.3 to 1.8 seconds, and hovers over
  her head for five seconds.
- `ascend: [6800, 8000]`: it rises away again, from 6.8 to 8 seconds.
- `lightOut: [7900, 8600]`: the light fades out, ending at 8.6 seconds, which is the habit's whole
  length (`FIDGET_MS.vision`). A test checks the logo comes down before it rises, and that the
  light is gone within the habit's time.
- `as const`: keeps each pair a fixed pair of numbers, so `VisionView` can take one apart as
  `[from, to]`.

### `CLONES`

<!-- code: apps/desktop/src/shared/character.ts#CLONES -->

[`src/shared/character.ts`, lines 330–334](../../apps/desktop/src/shared/character.ts#L330-L334)

```ts
/**
 * Her clones (the Clones spell): how many, how long they last (ms), and how long they take to
 * fade in and out at either end.
 */
export const CLONES = { count: 10, durationMs: 30_000, fadeMs: 400 } as const
```

<!-- /code -->

The numbers behind her Clones spell, which fills the taskbar with copies of her for a while. As
the comment says:

- `count: 10`: how many clones there are.
- `durationMs: 30_000`: how long they last, 30 seconds. (`_` is just a separator that makes long
  numbers easier to read.) The main process closes their window after this long (`Clones` in
  `src/main/bubble/clones.ts`).
- `fadeMs: 400`: how long they take to fade in at the start and out at the end. The clones' page
  (`ClonesView.tsx`) starts fading them out this long before their time is up, so they've gone by
  the time the window closes.

Both sides import it, which is why it's here: the main process for how long to keep the window,
and the page for how many clones to draw and when to fade them.

## `src/shared/spells.ts`: her spells

Her ten spells, which the user casts from the Spells menu (the wand icon in the stack): what each
is called, the numbers each one runs to, and what she does as she casts it. As the comment at the
top of the file says, both sides need them: the main process casts the spells (moving her, and
opening the windows their effects are drawn in), and the pages draw the menu, her animations and
the effects. `character.ts` (above) takes the lengths of her spells' poses from here too.

The file starts by importing two types from `character.ts`, `Fidget` and `SpellPose`, for
`CAST_POSE` (below). It's `import type`, which is only for the compiler and is left out of the
built code, so although `character.ts` imports from this file too, neither needs the other loaded
first when the app runs.

### `SPELLS`, `Spell` and `SPELL_LABELS`

<!-- code: apps/desktop/src/shared/spells.ts#SPELLS,Spell,SPELL_LABELS -->

[`src/shared/spells.ts`, lines 3–36](../../apps/desktop/src/shared/spells.ts#L3-L36)

```ts
// Her spells, cast from the Spells menu beside the stack of icons above her: what each is called,
// and their timings. Shared by the main process (which casts them, moving her and opening the
// windows their effects are drawn in) and the pages (the menu, her animations, the effects).

/** In the menu's order: her own tricks first, then the sky, then the biggest. */
export const SPELLS = [
  'clones',
  'teleport',
  'familiar',
  'butterflies',
  'starfall',
  'fireworks',
  'blizzard',
  'thunderstorm',
  'phoenix',
  'vortex',
  'explosion',
] as const

export type Spell = (typeof SPELLS)[number]

/** What the Spells menu calls each. */
export const SPELL_LABELS: Record<Spell, string> = {
  clones: 'Clones',
  teleport: 'Teleport',
  familiar: 'Summon familiar',
  butterflies: 'Butterflies',
  starfall: 'Starfall',
  fireworks: 'Fireworks',
  blizzard: 'Blizzard',
  thunderstorm: 'Thunderstorm',
  phoenix: 'Phoenix',
  vortex: 'Vortex',
  explosion: 'Explosion',
}
```

<!-- /code -->

- `SPELLS`: the ten spells, in the order the menu lists them: as its comment says, her own tricks
  first, then the sky, then the biggest. As with `ACTION_IDS` below, it's a real list made
  `as const`, and `Spell` is the type of any item of it. It exists at runtime because code goes
  through it: the menu draws a row for each, and `registerIpc()` in `src/main/ipc.ts` checks the
  spell a page asks for with `z.enum(SPELLS)`. The spells:
  - `clones`: ten of her, wandering the taskbar for thirty seconds (see `CLONES` above).
  - `teleport`: she vanishes, and appears again a little way along the taskbar.
  - `butterflies`: a swarm of little magic butterflies bursts out of her and flutters away.
  - `starfall`: shooting stars across her screen.
  - `fireworks`: rockets bursting high over the screen, then a finale.
  - `blizzard`: snow blowing across the screen, frost in the corners and a drift along the bottom.
  - `thunderstorm`: clouds, rain, and lightning striking down, once beside her.
  - `phoenix`: a bird of fire flies out of her, round a loop and away.
  - `vortex`: a portal swirls open in the middle of the screen, pulls everything in, and implodes.
  - `explosion`: a long chant under a rising pillar of magic circles, then a big bang in the
    middle of the screen.
- `SPELL_LABELS`: as the comment says, what the menu calls each: just its name. `Record<Spell,
string>` makes TypeScript insist on one for every spell.

### `STARFALL`, `EXPLOSION` and `TELEPORT`

<!-- code: apps/desktop/src/shared/spells.ts#STARFALL,EXPLOSION,TELEPORT -->

[`src/shared/spells.ts`, lines 38–52](../../apps/desktop/src/shared/spells.ts#L38-L52)

```ts
/** Starfall: shooting stars across her screen for this long (ms), this many starting a second. */
export const STARFALL = { durationMs: 10_000, perSecond: 7 }

/**
 * Explosion: she chants for `chantMs` while a pillar of magic circles (`circles` of them) rises
 * above her, one after another; then the explosion goes off in the middle of the screen, over
 * `boomMs`.
 */
export const EXPLOSION = { chantMs: 15_000, circles: 7, boomMs: 3_600 }

/**
 * Teleport: she vanishes into white motes over `vanishMs`, moves, and forms out of them again over
 * `appearMs`. (The same as when the app starts, and when it's closed.)
 */
export const TELEPORT = { vanishMs: 900, appearMs: 900 }
```

<!-- /code -->

The numbers each spell runs to, in milliseconds where they're times. `STARFALL` and `EXPLOSION`
are read by the main process (how long to keep the effects' window open) and by the effects' page
(`lib/spellMotion.ts` and `lib/spellArt.ts`, see [The UI components](8-renderer-components.md));
`EXPLOSION` and `TELEPORT` also set how long her poses last (`SPELL_POSE_MS` in `character.ts`).

- `STARFALL`: as the comment says, shooting stars across her screen for `durationMs` (10 seconds),
  `perSecond` (7) of them starting each second.
- `EXPLOSION`: as the comment says, she chants for `chantMs` (15 seconds) while a pillar of
  `circles` (7) magic circles rises above her, one after another; then the explosion goes off in
  the middle of the screen, over `boomMs` (3.6 seconds).
- `TELEPORT`: as the comment says, she vanishes into white motes over `vanishMs` and forms out of
  them again over `appearMs`, 0.9 seconds each. The same two are how she leaves when the app is
  closed and arrives when it starts.

### `FIREWORKS`, `THUNDERSTORM`, `BLIZZARD`, `VORTEX`, `BUTTERFLIES` and `PHOENIX`

<!-- code: apps/desktop/src/shared/spells.ts#FIREWORKS,THUNDERSTORM,BLIZZARD,VORTEX,BUTTERFLIES,PHOENIX -->

[`src/shared/spells.ts`, lines 54–76](../../apps/desktop/src/shared/spells.ts#L54-L76)

```ts
/**
 * Fireworks: `rockets` launched from along the taskbar, one about every `gapMs`, the last `finale`
 * of them together from `finaleAt` (ms), each bursting high over the screen.
 */
export const FIREWORKS = { durationMs: 9_000, rockets: 20, gapMs: 480, finale: 7, finaleAt: 6_200 }

/** Thunderstorm: clouds roll in over the top of the screen, rain, and `strikes` bolts of lightning. */
export const THUNDERSTORM = { durationMs: 9_000, strikes: 7 }

/** Blizzard: `flakes` snowflakes blowing across the screen, frost creeping in, snow piling up. */
export const BLIZZARD = { durationMs: 9_000, flakes: 340 }

/**
 * Vortex: a portal opens in the middle of the screen over `openMs`, swirls, pulling everything in,
 * collapses from `collapseAt` (ms) to `implodeAt`, and goes off in a flash.
 */
export const VORTEX = { durationMs: 8_000, openMs: 1_000, collapseAt: 6_300, implodeAt: 6_900 }

/** Butterflies: `count` magic butterflies burst out of her and flutter away across the screen. */
export const BUTTERFLIES = { durationMs: 8_000, count: 36 }

/** Phoenix: a bird of fire flies out of her, round the screen and away, over `flightMs`. */
export const PHOENIX = { durationMs: 7_500, flightMs: 6_000 }
```

<!-- /code -->

The numbers for the six newer spells, all drawn over the screen like starfall. Each has a
`durationMs`, how long its window stays open, read by the main process (`SPELL_EFFECT_MS`, next)
and by the spell's drawing in `lib/spells/` (see [The UI components](8-renderer-components.md)),
which fades everything out by then. The rest only the drawing reads.

- `FIREWORKS`: as the comment says, `rockets` (20) launched from along the taskbar, one about every
  `gapMs` (0.48 seconds), the last `finale` (7) of them together from `finaleAt` (6.2 seconds),
  each bursting high over the screen; 9 seconds in all.
- `THUNDERSTORM`: as the comment says, clouds roll in over the top of the screen, rain, and
  `strikes` (7) bolts of lightning; 9 seconds.
- `BLIZZARD`: as the comment says, `flakes` (340) snowflakes blowing across the screen, frost
  creeping in and snow piling up; 9 seconds.
- `VORTEX`: as the comment says, a portal opens in the middle of the screen over `openMs` (a
  second), swirls, pulling everything in, collapses from `collapseAt` (6.3 seconds) to `implodeAt`
  (6.9), and goes off in a flash; 8 seconds.
- `BUTTERFLIES`: as the comment says, `count` (36) magic butterflies burst out of her and flutter
  away across the screen; 8 seconds.
- `PHOENIX`: as the comment says, a bird of fire flies out of her, round the screen and away, over
  `flightMs` (6 seconds); 7.5 seconds in all, leaving time for its embers to fade once it's gone.

### `SPELL_EFFECT_MS` and `SpellEffect`

<!-- code: apps/desktop/src/shared/spells.ts#SPELL_EFFECT_MS,SpellEffect -->

[`src/shared/spells.ts`, lines 78–89](../../apps/desktop/src/shared/spells.ts#L78-L89)

```ts
/** The spells drawn in a window of their own over the screen, and how long it stays open (ms). */
export const SPELL_EFFECT_MS = {
  starfall: STARFALL.durationMs,
  explosion: EXPLOSION.chantMs + EXPLOSION.boomMs,
  fireworks: FIREWORKS.durationMs,
  thunderstorm: THUNDERSTORM.durationMs,
  blizzard: BLIZZARD.durationMs,
  vortex: VORTEX.durationMs,
  butterflies: BUTTERFLIES.durationMs,
  phoenix: PHOENIX.durationMs,
} as const

export type SpellEffect = keyof typeof SPELL_EFFECT_MS
```

<!-- /code -->

As the comment says, the spells drawn in a window of their own over the screen, and how long that
window stays open: eight of the ten. Starfall stays 10 seconds, and the explosion for its chant and
its bang together (18.6 seconds), since its pillar of circles rises while she chants; the six newer
spells each for their `durationMs` (7.5 to 9 seconds). The other two need no such window: the
clones have a strip of their own along the taskbar (`Clones`), and teleporting happens in her own
window.

- `as const`: keeps the keys exactly these eight names, and the object read-only.
- `SpellEffect`: `keyof typeof SPELL_EFFECT_MS`, the names of its keys, so
  `'starfall' | 'explosion' | 'fireworks' | ...`. `SpellEffects` in the main process
  (`bubble/spellEffects.ts`), `SpellView` and `SPELL_ART` (which says which spell draws what) only
  take these eight, so asking for the effects of a spell that has none is a compile error.

### `CAST_POSE`

<!-- code: apps/desktop/src/shared/spells.ts#CAST_POSE -->

[`src/shared/spells.ts`, lines 91–104](../../apps/desktop/src/shared/spells.ts#L91-L104)

```ts
/**
 * What she does as she casts each of those: one of her habits (casting a spell, twirling,
 * levitating, a butterfly coming to her finger), or her chant for the explosion.
 */
export const CAST_POSE: Record<SpellEffect, Fidget | SpellPose> = {
  starfall: 'spell',
  explosion: 'chant',
  fireworks: 'spell',
  thunderstorm: 'spell',
  blizzard: 'twirl',
  vortex: 'levitate',
  butterflies: 'butterfly',
  phoenix: 'spell',
}
```

<!-- /code -->

As its comment says, what she does as she casts each of the spells drawn over the screen: one of
her habits, or her chant for the explosion. `castSpell` in `src/main/index.ts` opens the spell's
window and plays this pose (`BubbleController.act()`), so she acts it out while the effects
appear.

- `spell`: her little spell, for starfall, fireworks, the thunderstorm and the phoenix.
- `twirl`: a twirl, for the blizzard.
- `levitate`: rising over a magic circle, for the vortex.
- `butterfly`: a butterfly coming to her finger, for the butterflies.
- `chant`: her chant, for the explosion. It lasts as long as the chant (`SPELL_POSE_MS`), and if
  it's cut short, so is the explosion (`onPoseChange` in `index.ts`).
- `Record<SpellEffect, Fidget | SpellPose>`: TypeScript insists on a pose for each of the eight,
  and each must be one of her fidgets or her spells' poses, the two kinds of pose
  `BubbleController.act()` takes. These are the two types imported from `character.ts`.

## `src/shared/screenSaver.ts`: the screen saver's timings

The screen saver, from its icon in the stack (the `screensaver` action, below): as the comment at
the top of the file says, every screen fades to white, then a scene fades in out of the white, her
sunset on her screen and falling stars on the others, until the mouse moves, a click or a key ends
it. Both sides need its numbers: the main process (`ScreenSaver` in `src/main/screenSaver.ts`, see
[The bubble](5-bubble.md)) for how long to wait before closing its windows, and their page
(`ScreenSaverView.tsx`, see [The pages](7-renderer-pages.md)) for its fades and for what counts as
the user being back.

### `SCREEN_SAVER` and `SaverScene`

<!-- code: apps/desktop/src/shared/screenSaver.ts#SCREEN_SAVER,SaverScene -->

[`src/shared/screenSaver.ts`, lines 1–21](../../apps/desktop/src/shared/screenSaver.ts#L1-L21)

```ts
// The screen saver, from the icon beside her: every screen fades to white, then a scene fades in
// out of the white. On her screen, a pixel sunset over rolling hills, with her standing on the
// nearest, her back to us, watching it; on the others, stars falling through the night sky.
// Moving the mouse, clicking or pressing a key ends it: the scenes fade away and she's back.
// Shared by the main process (which opens and closes its windows) and their page.

export const SCREEN_SAVER = {
  /** Every screen fades to white over this long (ms)... */
  whiteMs: 1_500,
  /** ...then its scene fades in out of the white over this long. */
  sceneMs: 3_500,
  /** Woken, the scenes fade away over this long, back to the desktop, and she forms again. */
  fadeOutMs: 800,
  /** The mouse moving less than this far (DIPs) doesn't wake it: a nudge of the desk. */
  wakeMove: 6,
  /** Its window losing the focus wakes it too, but not this soon after it opens (ms). */
  blurGraceMs: 1_000,
} as const

/** Which scene a screen shows: hers, the sunset, or the others', the starfall. */
export type SaverScene = 'sunset' | 'stars'
```

<!-- /code -->

- `whiteMs: 1_500`: as its comment says, every screen fades to white over 1.5 seconds. Her own
  `vanish` takes 0.9 (`SPELL_POSE_MS`), so she has gone into the white before it's complete.
- `sceneMs: 3_500`: then the scene fades in out of the white over 3.5 seconds, slowly, like dusk.
- `fadeOutMs: 800`: woken, the scenes fade away over 0.8 seconds, back to the desktop, and then she
  forms again. The main process closes the windows after exactly this long, and the page's CSS
  fade lasts the same.
- `wakeMove: 6`: as its comment says, the mouse moving less than 6 DIPs doesn't wake it: a nudge
  of the desk, or a mouse that jitters, would otherwise end it at once.
- `blurGraceMs: 1_000`: its window losing the focus wakes it too (another app coming forward, say),
  but not in its first second, while Windows may still be settling which window has the focus.
- `as const`: read-only, each number exactly as written.
- `SaverScene`: as its comment says, which scene a screen shows: `'sunset'` on hers, `'stars'` on
  the others. `ScreenSaver.start()` puts it in each window's query string, and the page reads it
  back.

## `src/shared/actions.ts`: the action registry

The icons that can appear in the stack beside the bubble (the _actions_), each with a tooltip
label and a _kind_. A tenant's `tenant.json` has an `actions` list that picks which ones appear
and in what order, nearest the bubble first. There are two kinds:

- `command` actions run in the main process: the IT service desk, screenshot, the screen saver and
  close (handlers in `createActionHandlers()`, `src/main/actions.ts`). The service desk is the one exception: when
  the tenant lists request types, `PanelView.runAction()` opens the service desk page instead (see
  [Jira and the service desk](11-atlassian.md)).
- `popover` actions open some UI inside the panel, a page or a menu: Settings (the settings menu,
  which also holds Light mode, her size, Stand still and No idle animations); Spells (the spells
  menu); Ask Claude and Your apps, which switch the card between the text box and the Apps list;
  and Jira, which swaps in the Jira page. `PanelView.runAction()` handles them, and opening one
  never reaches the main process. As the comment at the top of the file says, whatever the menu
  or page does next is up to it: the Light mode switch, the size buttons, the Stand still and No
  idle animations switches and the spells each make a request of their own
  (`window.assist.settings.setTheme()`, `window.assist.character.setSize()`,
  `window.assist.settings.setHabits()` and `window.assist.character.castSpell()`).

The ids are written once, as a real array, and the types are derived from it. So adding an
action is one edit here, and then the compiler points at the rest: `ICONS` in `ActionStack.tsx`
is a `Record<ActionId, ...>` (it must have an icon for every action), and `ActionHandlers` in
`src/main/actions.ts` is a `Record<CommandActionId, ...>` (every command needs a handler).

### `ACTION_IDS` and `ActionId`

<!-- code: apps/desktop/src/shared/actions.ts#ACTION_IDS,ActionId -->

[`src/shared/actions.ts`, lines 1–20](../../apps/desktop/src/shared/actions.ts#L1-L20)

```ts
// The action registry: every icon that can appear in the stack above the bubble. A tenant's
// `actions` list chooses which of these show and in what order (from the bubble upward).
//
// - `command` actions run in the main process (see src/main/actions.ts).
// - `popover` actions open UI inside the panel (a page or a menu); whatever that does next is up
//   to it.

export const ACTION_IDS = [
  'ask',
  'apps',
  'jira',
  'servicedesk',
  'screenshot',
  'settings',
  'spells',
  'screensaver',
  'close',
] as const

export type ActionId = (typeof ACTION_IDS)[number]
```

<!-- /code -->

The list of every action that exists, and the type of one of its entries.

- `as const`: without it the array's type would be `string[]`. With it, the type is a read-only
  list of these nine exact strings, which is what lets the next line work.
- `(typeof ACTION_IDS)[number]`: "the type of whatever you get by indexing the array with a number",
  which is the union of the nine, `'ask' | 'apps' | 'jira' | ... | 'close'`. The type follows the
  list automatically.
- The array also exists at runtime, which a type doesn't: `TenantSchema` in `src/main/tenant.ts`
  uses `z.enum(ACTION_IDS)` to reject a `tenant.json` that lists an unknown action. **zod** is a
  validation library: you describe a shape (a _schema_) and zod checks, while the app runs, that
  untrusted data really has that shape. TypeScript types are erased when the code is compiled, so
  they can't check anything at runtime.

### `ACTIONS`

<!-- code: apps/desktop/src/shared/actions.ts#ACTIONS -->

[`src/shared/actions.ts`, lines 22–36](../../apps/desktop/src/shared/actions.ts#L22-L36)

```ts
export const ACTIONS = {
  ask: { label: 'Ask Claude', kind: 'popover' },
  apps: { label: 'Your apps', kind: 'popover' },
  jira: { label: 'Jira: notifications and search', kind: 'popover' },
  // A page in the panel when the tenant lists request types (see PanelView); otherwise a link.
  servicedesk: { label: 'IT service desk', kind: 'command' },
  screenshot: { label: 'Take screenshot', kind: 'command' },
  // Light or dark mode and her size are in here too.
  settings: { label: 'Settings', kind: 'popover' },
  // A menu of her spells (src/shared/spells.ts); casting one goes to the main process.
  spells: { label: 'Spells', kind: 'popover' },
  // Every screen fades to white, then to a sunset she watches (src/shared/screenSaver.ts).
  screensaver: { label: 'Screen saver', kind: 'command' },
  close: { label: 'Close Desktop Wizard', kind: 'command' },
} as const satisfies Record<ActionId, { label: string; kind: 'command' | 'popover' }>
```

<!-- /code -->

The label and kind of each action. `ActionStack.tsx` uses `label` as each icon's tooltip and
screen-reader name, and gives `popover` actions (and the service desk, when it opens a page) an
`aria-expanded` attribute so screen readers announce whether the menu or page is open.

- `jira: { label: 'Jira: notifications and search', kind: 'popover' }`: the Jira icon, a bell.
- The comment above `servicedesk`: it stays a `command`, because without request types it just
  opens the portal in the browser; with them, the panel opens its page instead.
- `settings: { label: 'Settings', kind: 'popover' }`: the gear, which opens the settings menu. As
  the comment above it says, light or dark mode and her size are in there too (`SettingsMenu.tsx`
  and `SizeControl.tsx`), and so, since 2.2.0, are Stand still and No idle animations, which the
  comment doesn't mention.
- `spells: { label: 'Spells', kind: 'popover' }`: the wand, which opens the spells menu
  (`SpellsMenu.tsx`). As its comment says, it lists her spells (`spells.ts`, above), and casting
  one goes to the main process, which can move her and open windows over the screen. Opening the
  menu doesn't.
- `screensaver: { label: 'Screen saver', kind: 'command' }`: a sunset, which starts the screen
  saver in the main process. As its comment says, every screen fades to white, then to a sunset
  she watches (`screenSaver.ts`, above). It's a `command`, with nothing to open in the panel, which
  closes as it starts.
- `satisfies Record<ActionId, { label: string; kind: 'command' | 'popover' }>`: checks
  that there is exactly one entry per action id, each with a label and a valid kind. A missing,
  extra or misspelt action is a compile error. Unlike a normal type annotation, `satisfies` only
  checks: it doesn't change the object's own type.
- `as const`: keeps each `kind` as its exact string (`'command'`), not just `string`.
  `CommandActionId` below depends on that; a plain `: Record<...>` annotation would have widened
  every `kind` to `'command' | 'popover'` and lost which is which.

### `CommandActionId`

<!-- code: apps/desktop/src/shared/actions.ts#CommandActionId -->

[`src/shared/actions.ts`, lines 38–40](../../apps/desktop/src/shared/actions.ts#L38-L40)

```ts
export type CommandActionId = {
  [K in ActionId]: (typeof ACTIONS)[K]['kind'] extends 'command' ? K : never
}[ActionId]
```

<!-- /code -->

The type of just the command actions: `'servicedesk' | 'screenshot' | 'screensaver' | 'close'`.
It's worked out from `ACTIONS`, so it can't drift out of step with it.

- `[K in ActionId]:`: a _mapped type_. It builds an object type with one property per action id.
  Each property's type is the id itself if that action's kind is `'command'`, or `never` (the
  "impossible" type) if not, giving (in part)
  `{ ask: never; servicedesk: 'servicedesk'; settings: never; close: 'close' }`.
- `}[ActionId]`: looking up every key at once gives the union of the property types. `never`
  disappears from a union, leaving the four command ids.
- `AssistApi.invokeAction()` in `src/shared/ipc.ts` only accepts these, so a page can't even try to
  send `settings`, `spells`, `ask`, `apps` or `jira` to the main process. In `PanelView.runAction()`, the
  early returns for those narrow the id to exactly this type, which is why it can then be passed on.

### `COMMAND_ACTION_IDS`

<!-- code: apps/desktop/src/shared/actions.ts#COMMAND_ACTION_IDS -->

[`src/shared/actions.ts`, lines 42–44](../../apps/desktop/src/shared/actions.ts#L42-L44)

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

The shapes of the data that travels between the main process and the pages: the bubble's mode
(the character's pose is in `character.ts`), the draft, settings, branding, sign-in status, chat messages, the Apps list, Jira and the service
desk, checking for updates, and the answers to requests. The
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

[`src/shared/types.ts`, lines 5–11](../../apps/desktop/src/shared/types.ts#L5-L11)

```ts
/**
 * What the bubble (the character) is doing. The main process owns this; renderers only display it.
 * - `dragging`: following the mouse while the user drags it.
 * - `returning`: falling onto the taskbar after a drag.
 * - `capturing`: windows are hidden while a screenshot is taken.
 */
export type Mode = 'collapsed' | 'expanded' | 'dragging' | 'returning' | 'capturing'
```

<!-- /code -->

What the bubble (the character) is doing right now. Only `BubbleController`
(`src/main/bubble/BubbleController.ts`) changes it, through its private `setMode()`, and each
change is broadcast to both windows on `assist:mode-changed`. `collapsed` is just the character,
standing on the taskbar (walking and fidgeting on its own don't change the mode); `expanded` means
the panel is open. As the comment says, `returning` is the fall onto the taskbar after a drag. Her
spells (the Spells menu) don't have a mode of their own: casting one closes the panel, so the mode
is `collapsed` while she casts it and while its clones or effects are about. The panel shows its contents only
while the mode is `expanded`, and `BubbleView` turns the character's shadow the accent colour then.
How the figure moves is the separate `Pose` (`src/shared/character.ts`).

### `Attachment` and `Notes`

<!-- code: apps/desktop/src/shared/types.ts#Attachment,Notes -->

[`src/shared/types.ts`, lines 13–28](../../apps/desktop/src/shared/types.ts#L13-L28)

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

### `Effort`, `Settings`, `Habits` and `Theme`

<!-- code: apps/desktop/src/shared/types.ts#Effort,Settings,Habits,Theme -->

[`src/shared/types.ts`, lines 30–63](../../apps/desktop/src/shared/types.ts#L30-L63)

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
  /** Light or dark mode for Desktop Wizard (dark until the user switches). */
  theme: Theme
  /** She stays where she stands instead of wandering about (off until the user turns it on). */
  standStill: boolean
  /** She doesn't do her idle animations, her habits, on her own (off until turned on). */
  noIdles: boolean
  /** Her hat's off, in everything she does (off until turned on: she wears it). */
  noHat: boolean
  /** Her robe's colour (`#rrggbb`; her hat is a darker shade of it), or null for the company's. */
  robeColor: string | null
}

/**
 * How she is, from Settings: whether she wanders, whether she does her idle animations, and
 * whether she wears her hat.
 */
export type Habits = Pick<Settings, 'standStill' | 'noIdles' | 'noHat'>

export type Theme = 'dark' | 'light'
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
- `autoSend: boolean`: used with Claude Desktop only: whether Desktop Wizard also sends the
  question there (presses Ctrl+V and Enter in Claude), or only fills it in. On unless the user
  turns "Send in Claude automatically" off in the settings menu.
- `canUninstall: boolean`: like `autoStartAvailable`, true only in the installed app, which is the
  only copy with an uninstaller. Under `npm run dev` the menu's Uninstall item is greyed out.
- `favoriteApps: string[]`: the IDs of the apps the user starred in the Apps list, which it shows
  first. They're kept with the other preferences, so they survive a restart.
- `theme: Theme`: light or dark mode for every Desktop Wizard window, whatever Windows itself
  uses. Dark until the user switches, with Light mode in the settings menu.
- `standStill: boolean`: as its comment says, she stays where she stands instead of wandering
  about: Stand still in the settings menu, off until the user turns it on. She still falls where
  she's dropped, and doesn't walk back to her corner afterwards.
- `noIdles: boolean`: as its comment says, she doesn't do her idle animations (her habits: the hop,
  the tea, the vision and the rest) on her own: No idle animations in the settings menu, off until
  turned on. Spells she's asked to cast still play.
- `Habits`: as its comment says, what she does on her own, from the settings: just those two
  fields. `Pick<Settings, 'standStill' | 'noIdles'>` takes them, with their types, from `Settings`,
  so the two can't disagree. `SettingsService.setHabits()` and `window.assist.settings.setHabits()`
  take a `Partial<Habits>` (either or both), and `BubbleController` takes the whole of it.

### `ChatApp`

<!-- code: apps/desktop/src/shared/types.ts#ChatApp -->

[`src/shared/types.ts`, lines 65–69](../../apps/desktop/src/shared/types.ts#L65-L69)

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
  their own Claude account, so it counts against their own usage limit. Desktop Wizard has no
  sign-in of its own then (see [Claude Desktop](9-claude-desktop.md)).

### `Branding`, `RequestType` and `StartPage`

<!-- code: apps/desktop/src/shared/types.ts#Branding,RequestType,StartPage -->

[`src/shared/types.ts`, lines 71–99](../../apps/desktop/src/shared/types.ts#L71-L99)

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
  /** The company's Atlassian site (Jira links, the Jira page), or null without one. */
  atlassianSite: string | null
  /**
   * Raising IT requests from the panel: the request types offered, the first one for "Report a
   * problem". Null when the service desk icon just opens the portal.
   */
  requestTypes: RequestType[] | null
  /** Settings offers Check for updates (the tenant names where releases come from). */
  updates: boolean
}

/** A kind of request on the IT help centre portal ("Other IT Issue", "Request new software"). */
export interface RequestType {
  id: string
  name: string
}

/** The two things the card beside the bubble can show. */
export type StartPage = 'ask' | 'apps'
```

<!-- /code -->

The parts of the tenant's `tenant.json` that the pages need. `brandingOf()` in `src/main/tenant.ts`
copies just these fields, deliberately leaving out the sign-in settings, the Claude access settings,
the portal's addresses, Atlassian's MCP server and the system prompt. `accentColor` becomes the
page's accent colour (`useAccentColor()` sets the CSS variable `--color-accent`), and `actions`
decides which icons `ActionStack` shows, in order. `chatApp` tells the panel which kind of chat it
is: it changes the send button, the settings menu, and whether there's a sign-in at all.
`portalName` is the name of the company's app portal ("JumpCloud"), for the Apps list's buttons
("Sign in with JumpCloud"); it's `null` when the tenant has no portal, and then the Apps list never
shows. `atlassianSite` is the company's Atlassian site (`https://morsemicro.atlassian.net`), for
Jira links and the Jira page, or `null` without one. `requestTypes` lists the request types the
service desk page offers, as its comment says; `null` means the service desk icon just opens the
portal. `RequestType` is one of them: its ID, as in the portal's addresses, and its name.
`updates` says whether Settings offers Check for updates, as its comment says; which repository the
releases come from stays in the main process.

`startPage` is what the card shows when the panel opens: the text box (`ask`) or the Apps list
(`apps`). `StartPage` is the type of those two. The panel's `view` (what's showing right now) can
also be the Jira page or the service desk page (`View` in `PanelView.tsx`).

### `SignedInUser` and `AuthStatus`

<!-- code: apps/desktop/src/shared/types.ts#SignedInUser,AuthStatus -->

[`src/shared/types.ts`, lines 101–120](../../apps/desktop/src/shared/types.ts#L101-L120)

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

[`src/shared/types.ts`, lines 122–138](../../apps/desktop/src/shared/types.ts#L122-L138)

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

[`src/shared/types.ts`, lines 140–146](../../apps/desktop/src/shared/types.ts#L140-L146)

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
  one image, to be pasted into Claude (by Desktop Wizard with "Send in Claude automatically" on,
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

[`src/shared/types.ts`, lines 148–163](../../apps/desktop/src/shared/types.ts#L148-L163)

```ts
export interface AppState {
  mode: Mode
  /** The bottom corner the character lives near; the panel lays itself out to open away from it. */
  corner: Corner
  /** What the character is doing, for the bubble's page to animate. */
  pose: Pose
  /** How big she is, and the biggest she can be on her screen. */
  size: CharacterSize
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
`pose`, `size`, `auth` and `chat` up to date from the `on...` events. `notes` and `settings` only
change through the page's own requests, so the panel takes their new values from the replies.

- `corner: Corner`: as the comment says, the bottom corner the character lives near. The panel
  lays itself out from it, and the character faces away from it, toward the middle of the screen.
- `pose: Pose`: as the comment says, what the character is doing, so the bubble's page can animate
  it from the moment it loads.
- `size: CharacterSize`: as the comment says, how big she is and the biggest she can be on her
  screen (see `geometry.ts`). The bubble's page draws her at that size, the panel lays itself out
  for it (`panelLayout()`), and Size in the settings menu shows it. `BubbleController.size` supplies it.
- `version: string`: `app.getVersion()`, shown in the settings menu.
- `auth: AuthStatus | null`: the sign-in status of the built-in chat, or `null` with Claude
  Desktop, which has its own sign-in. The pages check for `null` before reading `auth.state`.
- `chat: ChatMessage[]`: the built-in chat's messages. With Claude Desktop it's always empty.

The Apps list isn't in `AppState`: the panel asks for it whenever the list shows
(`window.assist.apps.get()`), and then keeps up through `onAppsState`. Nor is Atlassian: the panel
asks with `atlassian.get()` and `atlassian.feed()`, and keeps up through `onAtlassianState` and
`onJiraFeed`.

### `PortalApp` and `AppsState`

<!-- code: apps/desktop/src/shared/types.ts#PortalApp,AppsState -->

[`src/shared/types.ts`, lines 165–184](../../apps/desktop/src/shared/types.ts#L165-L184)

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
 * - `sign-in`: the user hasn't connected Desktop Wizard to their portal yet (or the connection
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
- `{ status: 'sign-in'; message?: string }`: the user hasn't connected Desktop Wizard to their
  portal yet, or the connection ended. `message` says why when there's a reason to (a sign-in that
  failed, say).
- `{ status: 'ready'; apps: PortalApp[] }`: the list, sorted by name.
- `{ status: 'error'; message: string }`: a plain-English reason, such as the portal's apps
  server not being turned on for the company. The list offers Retry.

### `UninstallResult`

<!-- code: apps/desktop/src/shared/types.ts#UninstallResult -->

[`src/shared/types.ts`, lines 186–188](../../apps/desktop/src/shared/types.ts#L186-L188)

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

### `AtlassianState`

<!-- code: apps/desktop/src/shared/types.ts#AtlassianState -->

[`src/shared/types.ts`, lines 190–200](../../apps/desktop/src/shared/types.ts#L190-L200)

```ts
/**
 * The connection to Atlassian (Jira and Confluence), made once in the browser.
 * - `sign-in`: not connected yet (or the connection ended); a button starts it.
 * - `signing-in`: waiting for the user to finish in their browser.
 */
export type AtlassianState =
  | { status: 'loading' }
  | { status: 'sign-in'; message?: string }
  | { status: 'signing-in' }
  | { status: 'connected'; user: { name: string; email?: string } }
  | { status: 'error'; message: string }
```

<!-- /code -->

The connection to Atlassian, as the comment says, which `Atlassian` in
`src/main/atlassian/Atlassian.ts` sets and broadcasts on `assist:atlassian-state` (see
[Jira and the service desk](11-atlassian.md)). Like `AppsState`, it's told apart by `status`.

- `{ status: 'sign-in'; message?: string }`: not connected; `message` says why when the
  connection has ended or the last try failed.
- `{ status: 'connected'; user: { name: string; email?: string } }`: connected, with who as, for
  the settings menu. The account ID and tokens stay in the main process.
- `{ status: 'error'; message: string }`: a saved connection couldn't be tried (Atlassian couldn't
  be reached, say). The pages offer Retry.

### `StatusCategory`, `IssueStatus`, `JiraNotification` and `ServiceRequest`

<!-- code: apps/desktop/src/shared/types.ts#StatusCategory,IssueStatus,JiraNotification,ServiceRequest -->

[`src/shared/types.ts`, lines 202–236](../../apps/desktop/src/shared/types.ts#L202-L236)

```ts
/** How far along an issue is, by its status's category in Jira (which sets its colour). */
export type StatusCategory = 'new' | 'indeterminate' | 'done'

export interface IssueStatus {
  name: string
  category: StatusCategory
}

/** Someone else assigned the user an issue, or mentioned them, in the last two weeks. */
export interface JiraNotification {
  id: string
  kind: 'assigned' | 'mentioned'
  key: string
  summary: string
  /** Who did it (their name in Atlassian). */
  by: string
  /** ISO time. */
  at: string
  /** The start of the comment they were mentioned in. */
  excerpt?: string
  unread: boolean
}

/** One of the user's own requests to the IT service desk. */
export interface ServiceRequest {
  key: string
  summary: string
  status: IssueStatus
  /** ISO time of the last change. */
  updated: string
  /** The request on the help centre portal. */
  url: string
  /** What's new since the user last looked ("Grace Hopper replied", "Now Resolved"), or null. */
  news: string | null
}
```

<!-- /code -->

- `StatusCategory`, `IssueStatus`: an issue's status, with the category Jira puts it in (to do,
  in progress or done), which decides its colour.
- `JiraNotification`: one line in the Notifications tab, as the comment says. `kind` says which
  of the two it is; `by` is who did it; `at` is when, as an ISO time; `excerpt` is the start of the
  comment, for a mention; and `unread` puts a dot on it.
- `ServiceRequest`: one line in My requests. `news` is what's changed since the user last looked,
  in words, or `null`.

### `FeedList` and `JiraFeed`

<!-- code: apps/desktop/src/shared/types.ts#FeedList,JiraFeed -->

[`src/shared/types.ts`, lines 238–249](../../apps/desktop/src/shared/types.ts#L238-L249)

```ts
/** A list the main process keeps up to date in the background. */
export interface FeedList<T> {
  status: 'loading' | 'ready' | 'error'
  items: T[]
  message?: string
}

/** The Notifications tab and My requests. */
export interface JiraFeed {
  notifications: FeedList<JiraNotification>
  requests: FeedList<ServiceRequest>
}
```

<!-- /code -->

- `FeedList<T>`: a list the main process keeps up to date in the background, with its own status.
  `<T>` is the kind of item, so the same shape serves both lists. An `error` can still have
  `items`: the ones from the last check that worked, with `message` saying why it couldn't be
  updated.
- `JiraFeed`: the two lists, broadcast together on `assist:jira-feed`.

### `IssueSummary`, `ConfluencePage` and `SearchResult`

<!-- code: apps/desktop/src/shared/types.ts#IssueSummary,ConfluencePage,SearchResult -->

[`src/shared/types.ts`, lines 251–271](../../apps/desktop/src/shared/types.ts#L251-L271)

```ts
/** An issue in a list of search results. */
export interface IssueSummary {
  key: string
  summary: string
  status: IssueStatus
  type: string | null
  url: string
}

/** A Confluence page in search results or suggestions. */
export interface ConfluencePage {
  id: string
  title: string
  /** A line or two from the page, as plain text. */
  excerpt: string
  space: string | null
  url: string
}

export type SearchResult =
  { ok: true; issues: IssueSummary[]; pages: ConfluencePage[] } | { ok: false; message: string }
```

<!-- /code -->

What the Search tab shows: Jira issues (`IssueSummary`, with the issue's address in Jira as
`url`) and Confluence pages (`ConfluencePage`, with a plain-text `excerpt` and the space's name).
`SearchResult` is both lists, or a message when the search failed.

### `IssueComment`, `IssueTransition`, `IssueDetail` and `IssueResult`

<!-- code: apps/desktop/src/shared/types.ts#IssueComment,IssueTransition,IssueDetail,IssueResult -->

[`src/shared/types.ts`, lines 273–304](../../apps/desktop/src/shared/types.ts#L273-L304)

```ts
export interface IssueComment {
  id: string
  author: string
  /** ISO time. */
  created: string
  /** Markdown. */
  body: string
}

/** A status the issue can be moved to ("Start progress", "Done"). */
export interface IssueTransition {
  id: string
  name: string
}

/** An issue as the issue view shows it. */
export interface IssueDetail extends IssueSummary {
  assignee: string | null
  reporter: string | null
  created: string
  updated: string
  /** Markdown, shortened if it's long. */
  description: string
  /** The latest comments, oldest first. */
  comments: IssueComment[]
  /** The request on the help centre portal, for service desk requests; null otherwise. */
  portalUrl: string | null
  transitions: IssueTransition[]
}

/** Opening an issue, or changing it (which answers with the issue as it is now). */
export type IssueResult = { ok: true; issue: IssueDetail } | { ok: false; message: string }
```

<!-- /code -->

What the issue view shows.

- `IssueComment`: a comment, its `body` as Markdown.
- `IssueTransition`: as the comment says, a status the issue can move to, with the ID Jira needs
  to make the move.
- `IssueDetail extends IssueSummary`: everything an `IssueSummary` has, plus the rest. `extends`
  means it doesn't have to list the summary's fields again.
- `portalUrl`: as the comment says, only for service desk requests, which then get a link to the
  portal.
- `IssueResult`: as its comment says, the answer to opening an issue and to changing one, which
  is the issue as it is now.

### `IssuePrompt` and `AskAboutIssueResult`

<!-- code: apps/desktop/src/shared/types.ts#IssuePrompt,AskAboutIssueResult -->

[`src/shared/types.ts`, lines 306–310](../../apps/desktop/src/shared/types.ts#L306-L310)

```ts
/** What to ask Claude about an issue. */
export type IssuePrompt = 'summarise' | 'reply' | 'next-steps'

/** Asking Claude about an issue: `inChat` when it went to the chat in the panel. */
export type AskAboutIssueResult = { ok: true; inChat: boolean } | { ok: false; message: string }
```

<!-- /code -->

- `IssuePrompt`: the three **Ask Claude** buttons on an issue.
- `AskAboutIssueResult`: the answer. `inChat` is `true` when the question went to the built-in
  chat, so the panel shows it; with Claude Desktop the panel has closed instead.

### `NewRequest` and `RaiseResult`

<!-- code: apps/desktop/src/shared/types.ts#NewRequest,RaiseResult -->

[`src/shared/types.ts`, lines 312–326](../../apps/desktop/src/shared/types.ts#L312-L326)

```ts
/**
 * A request filled in on the panel, to finish on the help centre portal: its type and summary, and
 * whether the PC's details go in its description. (There's no box for more: some request types
 * have no description, and what was typed there was lost. The rest is written on the portal.)
 */
export interface NewRequest {
  requestTypeId: string
  summary: string
  includePcDetails: boolean
}

/** Opening the portal's form, filled in, with the text box's screenshots on the clipboard. */
export type RaiseResult =
  | { ok: true; screenshots: number }
  | { ok: false; reason: 'empty' | 'missing-screenshot' | 'failed' }
```

<!-- /code -->

The service desk page's form, and the answer to sending it (see `ServiceDesk.raise()`).

- `NewRequest`: the form's fields. The screenshots aren't in it: the main process takes them from
  its own copy of the draft.
- `{ ok: true; screenshots: number }`: the portal's form is opening in the browser, and this many
  screenshots are on the clipboard.
- `reason: 'empty' | 'missing-screenshot' | 'failed'`: nothing was written, an attached screenshot
  has gone from the folder, or the request type wasn't one of the tenant's or the browser couldn't
  be opened.

### `UpdateState`

<!-- code: apps/desktop/src/shared/types.ts#UpdateState -->

[`src/shared/types.ts`, lines 328–340](../../apps/desktop/src/shared/types.ts#L328-L340)

```ts
/**
 * Settings → Check for updates.
 * - `downloaded`: a development run stops there: it has no installed copy to replace.
 * - `installing`: the installer is running; the app is about to close and start again.
 */
export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'up-to-date'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'downloaded'; version: string; path: string }
  | { status: 'installing'; version: string }
  | { status: 'error'; message: string }
```

<!-- /code -->

How Settings → Check for updates is going, which `Updater` in `src/main/updates.ts` sets and
broadcasts on `assist:update-state` (see
[Main process: startup, IPC and app plumbing](2-main-startup.md)). The settings menu's row shows
it.

- `idle`: nothing checked yet.
- `checking`, then `up-to-date` with this copy's version, or `downloading` a newer `version` with
  how far it's got (`percent`, 0 to 99).
- `downloaded`: as the comment says, a development run stops there, with the `path` the installer
  was saved to.
- `installing`: as the comment says, the installer is running and the app is about to close and
  start again.
- `error`: what went wrong, in plain English.

### `ActionResult` and `AttachResult`

<!-- code: apps/desktop/src/shared/types.ts#ActionResult,AttachResult -->

[`src/shared/types.ts`, lines 342–349](../../apps/desktop/src/shared/types.ts#L342-L349)

```ts
export type ActionResult = { ok: true; message?: string } | { ok: false; message: string }

/**
 * Attaching a screenshot: the newest one not attached yet. `no-more` when every screenshot is
 * already attached.
 */
export type AttachResult =
  { ok: true; notes: Notes } | { ok: false; reason: 'no-screenshots' | 'no-more' }
```

<!-- /code -->

The answers to two more requests.

- `{ ok: true; message?: string } | { ok: false; message: string }`: what a command action
  returns (`src/main/actions.ts`). `PanelView.runAction()` shows `message` as a toast, styled as
  an error when `ok` is false. A failure must carry a message; a success may (the screenshot
  action says "Screenshot saved", Close says nothing).
- `reason: 'no-screenshots' | 'no-more'`: why **Attach screenshot** did nothing: the folder has
  no screenshots, or every one of them is already in the draft (each click attaches the newest
  one that isn't, going one further back each time).

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
  through one of the `on...` listeners. These are the last fourteen channels.

### `IPC`

<!-- code: apps/desktop/src/shared/ipc.ts#IPC -->

[`src/shared/ipc.ts`, lines 33–124](../../apps/desktop/src/shared/ipc.ts#L33-L124)

```ts
/** IPC channel names. The preload maps them onto `window.assist`; src/main/ipc.ts handles them. */
export const IPC = {
  getState: 'assist:get-state',
  bubbleClick: 'assist:bubble-click',
  bubbleDragStart: 'assist:bubble-drag-start',
  bubbleDragEnd: 'assist:bubble-drag-end',
  bubbleDragHold: 'assist:bubble-drag-hold',
  bubblePet: 'assist:bubble-pet',
  bubblePointerInside: 'assist:bubble-pointer-inside',
  trickReady: 'assist:trick-ready',
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
  settingsSetTheme: 'assist:settings-set-theme',
  settingsSetHabits: 'assist:settings-set-habits',
  settingsSetRobeColor: 'assist:settings-set-robe-color',
  characterSetSize: 'assist:character-set-size',
  characterCastSpell: 'assist:character-cast-spell',
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
  atlassianGet: 'assist:atlassian-get',
  atlassianSignIn: 'assist:atlassian-sign-in',
  atlassianCancelSignIn: 'assist:atlassian-cancel-sign-in',
  atlassianSignOut: 'assist:atlassian-sign-out',
  atlassianRetry: 'assist:atlassian-retry',
  atlassianFeed: 'assist:atlassian-feed',
  atlassianMarkNotificationsRead: 'assist:atlassian-mark-notifications-read',
  atlassianMarkRequestsRead: 'assist:atlassian-mark-requests-read',
  atlassianSearch: 'assist:atlassian-search',
  atlassianIssue: 'assist:atlassian-issue',
  atlassianTransition: 'assist:atlassian-transition',
  atlassianComment: 'assist:atlassian-comment',
  atlassianLogWork: 'assist:atlassian-log-work',
  atlassianArticles: 'assist:atlassian-articles',
  atlassianProjectKeys: 'assist:atlassian-project-keys',
  atlassianAsk: 'assist:atlassian-ask',
  serviceDeskPcDetails: 'assist:service-desk-pc-details',
  serviceDeskRaise: 'assist:service-desk-raise',
  serviceDeskOpenMyRequests: 'assist:service-desk-open-my-requests',
  updatesGet: 'assist:updates-get',
  updatesCheck: 'assist:updates-check',
  screensaverWake: 'assist:screensaver-wake',
  // main → renderer
  modeChanged: 'assist:mode-changed',
  poseChanged: 'assist:pose-changed',
  bubbleArrive: 'assist:bubble-arrive',
  screensaverEnd: 'assist:screensaver-end',
  robeColorChanged: 'assist:robe-color-changed',
  hatChanged: 'assist:hat-changed',
  gaze: 'assist:gaze',
  familiarSees: 'assist:familiar-sees',
  occlude: 'assist:occlude',
  trickPlan: 'assist:trick-plan',
  cornerChanged: 'assist:corner-changed',
  sizeChanged: 'assist:size-changed',
  clickThroughReset: 'assist:click-through-reset',
  authStatus: 'assist:auth-status',
  chatMessage: 'assist:chat-message',
  chatReset: 'assist:chat-reset',
  appsState: 'assist:apps-state',
  atlassianState: 'assist:atlassian-state',
  jiraFeed: 'assist:jira-feed',
  updateState: 'assist:update-state',
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
- `settingsSetTheme`: the settings menu's "Light mode" switch.
- `settingsSetHabits`: the menu's "Stand still" and "No idle animations" switches. The main process
  saves the change and she does as it says straight away.
- `characterSetSize`: the Smaller and Bigger buttons under Size in the settings menu. The main
  process resizes the character and saves the size.
- `characterCastSpell`: a spell picked in the Spells menu. The main process closes the panel and
  she casts it.
- `appUninstall`: Settings → Uninstall.
- `appsGet` to `appsOpenPortal`: the Apps list. Like the two chats' channels, they're only
  answered when the tenant has a portal.
- `atlassianGet` to `atlassianAsk`: Jira and Confluence (see
  [Jira and the service desk](11-atlassian.md)), answered only when the tenant has `atlassian`.
  `serviceDeskPcDetails` to `serviceDeskOpenMyRequests`: the service desk page, answered only when
  the tenant lists request types.
- `updatesGet`, `updatesCheck`: Check for updates in Settings, answered only when the tenant has
  `updates`.
- `screensaverWake`: from the screen saver's pages, the user's back (the mouse moved, a click or a
  key). It's the only channel the main process hears from pages other than the bubble's and the
  panel's, and only from the screen saver's own windows (`ScreenSaver.wakeFrom()`).
- `authSignIn` to `chatNew`, and `claudeDesktopAsk` and `claudeDesktopInstalled`: the first group
  belongs to the built-in chat and the second to Claude Desktop. The main process only answers
  the group the tenant uses (`registerIpc()` in `src/main/ipc.ts`).
- `// main → renderer`: the channels from here on go the other way. `poseChanged` carries the
  character's pose (see `character.ts`) every time it changes, `sizeChanged` her size (a
  `CharacterSize`) when it or the biggest she can be changes, `atlassianState` and `jiraFeed`
  carry the Atlassian connection and the notifications and requests, and `updateState` how Check
  for updates is going. `broadcast()` in `start()`
  (`src/main/index.ts`) sends them to both windows, except three: `clickThroughReset`, which
  `resetClickThrough()` in `src/main/bubble/windows.ts` sends only to the panel; `bubbleArrive`,
  which `start()` sends only to the bubble; and `screensaverEnd`, which goes to each of the screen
  saver's windows to say it's time for its scene to fade away (`end()` in the screen saver's
  `open`, in `start()`).

### `AssistApi`

<!-- code: apps/desktop/src/shared/ipc.ts#AssistApi -->

[`src/shared/ipc.ts`, lines 126–325](../../apps/desktop/src/shared/ipc.ts#L126-L325)

```ts
/** The API the preload exposes to renderers as `window.assist`. */
export interface AssistApi {
  getState(): Promise<AppState>
  /** A click on the bubble; `pressedAt` is when the button went down (Date.now()). */
  bubbleClick(pressedAt?: number): void
  /** The bubble was pressed and moved: the main process makes it follow the mouse. */
  bubbleDragStart(): void
  /** Released: the character falls onto the taskbar of the display it's on. */
  bubbleDragEnd(): void
  /**
   * While she's carried: the mouse button is still down (every DRAG_CHECK.everyMs). Without word
   * for DRAG_CHECK.staleMs, the main process lets her go.
   */
  bubbleDragHold(): void
  /** Double-clicked: petted (the click before it opened or closed the panel as usual). */
  bubblePet(): void
  /** A trick's page is ready for its plan and icons (they come back through onTrickPlan). */
  trickReady(): void
  collapse(): void
  /** Tell the main process whether the pointer is over real UI (true) or a see-through area. */
  setInteractive(interactive: boolean): void
  invokeAction(id: CommandActionId): Promise<ActionResult>
  /** Opens a web (http/https) or email (mailto) link in the default app. */
  openExternal(url: string): Promise<void>
  copyText(text: string): Promise<void>
  notes: {
    setText(text: string): void
    /** Attaches the newest screenshot that isn't attached yet (each click goes one further back). */
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
    /** Light or dark mode for all of Desktop Wizard; saved. */
    setTheme(theme: Theme): Promise<Settings>
    /** Whether she stands still, and whether she does her idle animations; saved. */
    setHabits(habits: Partial<Habits>): Promise<Settings>
    /** Her robe's colour (`#rrggbb`), or null for the company's; saved, and she changes at once. */
    setRobeColor(color: string | null): Promise<Settings>
  }
  character: {
    /** Makes her `scale` times her usual size (one of CHARACTER_SIZES); saved. */
    setSize(scale: number): Promise<CharacterSize>
    /** Casts one of her spells: the panel closes so it can be seen. */
    castSpell(spell: Spell): Promise<void>
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
    /** Connects Desktop Wizard to the portal, in the browser; progress via onAppsState. */
    signIn(): Promise<void>
    cancelSignIn(): Promise<void>
    /** Opens the app in the default browser (signed in through the portal). */
    open(id: string): Promise<boolean>
    openPortal(): Promise<void>
  }
  /** Jira and Confluence (only when the tenant has `atlassian`). */
  atlassian: {
    get(): Promise<AtlassianState>
    /** Connects to Atlassian in the browser; progress via onAtlassianState. */
    signIn(): Promise<void>
    cancelSignIn(): Promise<void>
    /** Forgets the connection. */
    signOut(): Promise<void>
    /** Tries the saved connection again after an error. */
    retry(): Promise<void>
    /** Notifications and the user's IT requests; checked again first with `refresh`. */
    feed(refresh?: boolean): Promise<JiraFeed>
    /** Marks one notification (by its id), or all of them, as seen. */
    markNotificationsRead(id?: string): Promise<JiraFeed>
    /** Marks what's new on one request (or all of them) as seen. */
    markRequestsRead(key?: string): Promise<JiraFeed>
    search(query: string): Promise<SearchResult>
    issue(key: string): Promise<IssueResult>
    transition(key: string, transitionId: string): Promise<IssueResult>
    comment(key: string, body: string): Promise<IssueResult>
    /** Jira's format: "30m", "1h 30m", "2d". */
    logWork(key: string, timeSpent: string): Promise<IssueResult>
    /** How-to pages about what the user is typing in a new request. */
    articles(text: string): Promise<ConfluencePage[]>
    /** The Jira projects' keys, or null if they can't be listed (e.g. not connected). */
    projectKeys(): Promise<string[] | null>
    /**
     * Asks Claude about the issue, with its details: in Claude Desktop (the panel closes), or the
     * chat in the panel.
     */
    ask(key: string, prompt: IssuePrompt): Promise<AskAboutIssueResult>
  }
  /** Raising IT requests (only when the tenant's service desk lists request types). */
  serviceDesk: {
    /** What "Include PC details" adds. */
    pcDetails(): Promise<string>
    /**
     * Opens the portal's form for the request, filled in, with the text box's screenshots on the
     * clipboard to paste. Closes the panel if it worked.
     */
    raise(request: NewRequest): Promise<RaiseResult>
    openMyRequests(): Promise<void>
  }
  /** Settings → Check for updates (only when the tenant has `updates`). */
  updates: {
    get(): Promise<UpdateState>
    /**
     * Checks GitHub for a newer release and, if there is one, downloads and installs it (the app
     * then closes and starts again). Returns straight away; progress via onUpdateState.
     */
    check(): Promise<UpdateState>
  }
  /** Starts Desktop Wizard's uninstaller and quits (installed copies only). */
  uninstall(): Promise<UninstallResult>
  /**
   * Whether the mouse pointer is over her window now (it's showing, and the pointer's inside it):
   * her page checks its glow with it, as the page isn't always told when the pointer leaves.
   */
  bubblePointerInside(): Promise<boolean>
  screensaver: {
    /** The user's back (the mouse moved, a click, a key): the screen saver's pages. */
    wake(): void
  }
  /** The screen saver is ending: time for its scene to fade away (its pages). */
  onScreensaverEnd(callback: () => void): () => void
  /** Her robe's colour was changed in Settings (null: the company's again). */
  onRobeColorChanged(callback: (color: string | null) => void): () => void
  /** Settings → No hat was flipped (true: her hat's off): her windows. */
  onHatChanged(callback: (noHat: boolean) => void): () => void
  /** Which way she's to look at the pointer while she watches it (null: done watching). */
  onGaze(callback: (gaze: { x: number; y: number } | null) => void): () => void
  /**
   * Where she is (the middle of her, DIPs across the cat's window), what she's doing, and when the
   * cat goes: her familiar's page.
   */
  onFamiliarSees(callback: (seen: { x: number; pose: Pose; ends: number }) => void): () => void
  /** A trick's plan and its icons (JSON): the trick's page. */
  onTrickPlan(callback: (trick: string) => void): () => void
  /**
   * A window in front of her (its rect on the screen, DIPs) while she's behind it, peeking round
   * it: the part of her behind it is hidden. Null: nothing in front of her.
   */
  onOcclude(
    callback: (rect: { x: number; y: number; width: number; height: number } | null) => void,
  ): () => void
  onModeChanged(callback: (mode: Mode) => void): () => void
  /** The character's pose changed (walking, fidgeting, dangling...). */
  onPoseChanged(callback: (pose: Pose) => void): () => void
  /** Her window has just been shown as the app starts: time for her to appear (the bubble's page). */
  onArrive(callback: () => void): () => void
  onCornerChanged(callback: (corner: Corner) => void): () => void
  /** Her size changed, or the biggest she can be on her screen did. */
  onSizeChanged(callback: (size: CharacterSize) => void): () => void
  /** The panel was just shown with click-through reset; `pointer` is where the mouse is now. */
  onClickThroughReset(callback: (pointer: Point) => void): () => void
  onAuthStatus(callback: (status: AuthStatus) => void): () => void
  /** A message was added or changed (streamed text arrives this way). */
  onChatMessage(callback: (message: ChatMessage) => void): () => void
  onChatReset(callback: () => void): () => void
  onAppsState(callback: (state: AppsState) => void): () => void
  onAtlassianState(callback: (state: AtlassianState) => void): () => void
  onJiraFeed(callback: (feed: JiraFeed) => void): () => void
  onUpdateState(callback: (state: UpdateState) => void): () => void
}
```

<!-- /code -->

The API a page sees as `window.assist`. Each method maps onto one channel in `IPC`. Related calls
are grouped into nested objects (`notes`, `screenshots`, `settings`, `character`, `auth`,
`claudeDesktop`, `chat`, `apps`, `atlassian`, `serviceDesk`, `updates`, `screensaver`), which is
only for readability. Every page
gets all of them, but `auth` and `chat` only work with the built-in chat, `claudeDesktop` only with
Claude Desktop, `apps` only when the tenant has a portal, `atlassian` only when it has an Atlassian
site, `serviceDesk` only when it lists request types, and `updates` only when it has `updates`; the
panel checks `branding` to know which to call.

- `getState(): Promise<AppState>`: called once when a page loads (`useAssistState()`).
- `bubbleClick(pressedAt?: number): void`: this and the next three are fire-and-forget calls into
  `BubbleController` (`clickBubble()`, `startDrag()`, `endDrag()`, `collapse()`). `pressedAt` is
  when the mouse button went down, which tells the main process whether the press itself closed
  the panel.
- `bubbleDragEnd(): void`: as its comment says, on release the character falls onto the taskbar of
  the display it's on (`BubbleController.endDrag()`).
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
  in the Apps list, and `setTheme(theme)` for light or dark mode.
- `setHabits(habits: Partial<Habits>): Promise<Settings>`: as its comment says, whether she stands
  still and whether she does her idle animations, saved; either or both at once. She does as it
  says at once, not only after a restart.
- `character.setSize(scale: number): Promise<CharacterSize>`: as its comment says, makes the
  character `scale` times her usual size, which must be one of `CHARACTER_SIZES` (the main process
  refuses any other number), and saves it. The answer is her size as it now is, which may be
  smaller than asked for if that's too big for her screen. The same size also arrives through
  `onSizeChanged`, which is what Size in the settings menu actually shows (it ignores the
  answer).
- `character.castSpell(spell: Spell): Promise<void>`: as its comment says, casts one of her spells
  (`Spell` in `spells.ts`, above), and the panel closes so it can be seen. There's no answer: what
  she does next arrives as her pose changes, like anything else she does.
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
- `atlassian.signIn()`, `retry()`: like `apps.signIn()`, resolve straight away; progress arrives
  through `onAtlassianState`.
- `feed(refresh?: boolean): Promise<JiraFeed>`: the notifications and requests, checked again
  first with `refresh` (or if the last check is over a minute old). The answer also arrives
  through `onJiraFeed`, like every other change.
- `markNotificationsRead(id?: string): Promise<JiraFeed>`: as its comment says, marks one
  notification (by its id) as seen, which the Jira page does when one is opened, or all of them
  without an id, which the panel does when the Jira page closes. `markRequestsRead(key?)` does the
  same for the user's IT requests.
- `transition()`, `comment()`, `logWork()`: each answers with the issue as it is after the change
  (`IssueResult`).
- `projectKeys()`: the keys of the Jira projects the user can see, so the text box only offers to
  open real issue keys; `null` when they aren't known.
- `ask(key, prompt)`: as its comment says, asks Claude about an issue with its details, in Claude
  Desktop or the built-in chat.
- `serviceDesk.raise(request: NewRequest)`: as the comment says, opens the portal's form, filled
  in. Like `claudeDesktop.ask()`, the screenshots come from the main process's copy of the draft.
- `updates.check(): Promise<UpdateState>`: as the comment says, checks for a newer release and
  installs it, but returns straight away, already `checking`; progress arrives through
  `onUpdateState`. If there's an update, the app closes and starts again as the new version.
- `uninstall(): Promise<UninstallResult>`: starts the uninstaller; the app quits if it worked.
- `screensaver.wake(): void`: as its comment says, the user's back (the mouse moved, a click, a
  key), from the screen saver's pages. Fire and forget: the page needn't wait, as the main process
  answers by telling every page to fade away.
- `onScreensaverEnd(callback: () => void): () => void`: as its comment says, the screen saver is
  ending, so its scene should fade away; only its pages listen.
- `onModeChanged(callback: (mode: Mode) => void): () => void`: each `on...` method starts
  listening and returns a function that stops. That suits React's `useEffect`, whose cleanup
  step can simply call it (see `useAssistState()`).
- `onPoseChanged(callback: (pose: Pose) => void): () => void`: as its comment says, the character's
  pose changed. The bubble's page uses it to animate the character.
- `onArrive(callback: () => void): () => void`: as its comment says, her window has just been shown
  as the app starts, so the bubble's page can start her forming out of white motes then (on the
  `bubbleArrive` channel, sent once).
- `onSizeChanged(callback: (size: CharacterSize) => void): () => void`: as its comment says, her
  size changed, or the biggest she can be on her screen did (after she was dragged to another
  display, say). The bubble's page redraws her at the new size, and the panel lays itself out for
  it.
- `onClickThroughReset(callback: (pointer: Point) => void): () => void`: `pointer` is the mouse
  position relative to the panel window, so the page can decide at once whether the pointer is
  over real UI.

## `src/shared/format.ts`: screenshot labels and times

Two small text helpers. `AttachmentChip.tsx` uses `screenshotLabel()` for the label on each
screenshot chip in the text box, and the Jira and service desk pages use `timeAgo()` to say when
something happened. The file has no Electron or React code in it, and `tests/format.test.ts`
tests it directly. It's short, so here it is whole.

### `screenshotLabel()` and `timeAgo()`

<!-- code: apps/desktop/src/shared/format.ts -->

[`src/shared/format.ts`, lines 1–29](../../apps/desktop/src/shared/format.ts#L1-L29)

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

/** How long ago something happened, briefly: "just now", "5m ago", "3h ago", "2d ago", "12 Sep". */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000)
  if (Number.isNaN(minutes)) return ''
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`
  if (minutes < 7 * 24 * 60) return `${Math.floor(minutes / (24 * 60))}d ago`
  const date = `${then.getDate()} ${MONTHS[then.getMonth()]}`
  return then.getFullYear() === now.getFullYear() ? date : `${date} ${then.getFullYear()}`
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

`timeAgo()`, as its comment says, turns an ISO time into a short "how long ago":

- `Math.floor((now.getTime() - then.getTime()) / 60_000)`: the whole minutes since then.
  `Math.floor` rounds down, so 90 minutes is "1h ago".
- `if (Number.isNaN(minutes)) return ''`: a time that can't be read gives "not a number", and then
  nothing is shown.
- "just now" under a minute, then minutes, hours, and days for up to a week.
- After a week, the date (`12 Sep`), with the year only if it isn't this year (`12 Sep 2025`).

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

## `src/shared/jira.ts`: issue keys

Jira issue keys, which, as the comment at the top says, both the main process and the panel need:
the panel to offer an **Open** button for keys typed in the text box, and the main process to
check keys and build links. The file is short, so here it is whole.

### `ISSUE_KEY`, `findIssueKeys()`, `isIssueKey` and `browseUrl()`

<!-- code: apps/desktop/src/shared/jira.ts -->

[`src/shared/jira.ts`, lines 1–17](../../apps/desktop/src/shared/jira.ts#L1-L17)

```ts
// Jira issue keys, used by the main process and the panel alike.

/** Jira issue keys in text: a project key, a dash and a number ("ISD-1234"). */
const ISSUE_KEY = /\b[A-Z][A-Z0-9_]{1,9}-\d{1,7}\b/g

/** The issue keys in the text, first to last, each once. */
export function findIssueKeys(value: string, limit = 3): string[] {
  return [...new Set(value.match(ISSUE_KEY) ?? [])].slice(0, limit)
}

export const isIssueKey = (value: string): boolean =>
  /^[A-Z][A-Z0-9_]{1,9}-\d{1,7}$/.test(value.trim())

/** The issue's page in Jira. */
export function browseUrl(site: string, key: string): string {
  return `${new URL(site).origin}/browse/${encodeURIComponent(key)}`
}
```

<!-- /code -->

- `ISSUE_KEY`: a key is a project key (a capital letter, then 1 to 9 more capitals, digits or
  `_`), a dash and a number, such as `ISD-1234`. `\b` at each end means a whole word, so
  `myISD-12` or `ISD-123x` don't count. `g` finds every match, not just the first.
- `findIssueKeys(value, limit)`: the keys in the text, each once and at most three.
  `new Set(...)` drops repeats while keeping the first-to-last order, and `[...]` turns it back
  into a list. `?? []` covers `match()` finding nothing (it returns `null` then).
- `isIssueKey(value)`: whether the whole text is one key. `^` and `$` pin the pattern to the
  start and end. The main process checks the same pattern (`IssueKey` in `src/main/ipc.ts`).
- `browseUrl(site, key)`: the issue's page in Jira, such as
  `https://morsemicro.atlassian.net/browse/ISD-1234`. `encodeURIComponent` keeps the key from
  changing the address, whatever it holds.

## `src/preload/index.ts`: the bridge to the page

A _preload script_ runs inside each window (the bubble, the panel, and the clones', the vision's,
the spells' and the screen saver's windows) just before the page's own code. This
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

[`src/preload/index.ts`, lines 12–127](../../apps/desktop/src/preload/index.ts#L12-L127)

```ts
const api: AssistApi = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  bubbleClick: (pressedAt) => ipcRenderer.send(IPC.bubbleClick, pressedAt),
  bubbleDragStart: () => ipcRenderer.send(IPC.bubbleDragStart),
  bubbleDragEnd: () => ipcRenderer.send(IPC.bubbleDragEnd),
  bubbleDragHold: () => ipcRenderer.send(IPC.bubbleDragHold),
  bubblePet: () => ipcRenderer.send(IPC.bubblePet),
  bubblePointerInside: () => ipcRenderer.invoke(IPC.bubblePointerInside),
  trickReady: () => ipcRenderer.send(IPC.trickReady),
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
    setTheme: (theme) => ipcRenderer.invoke(IPC.settingsSetTheme, theme),
    setHabits: (habits) => ipcRenderer.invoke(IPC.settingsSetHabits, habits),
    setRobeColor: (color) => ipcRenderer.invoke(IPC.settingsSetRobeColor, color),
    setFavoriteApp: (id, favorite) =>
      ipcRenderer.invoke(IPC.settingsSetFavoriteApp, { id, favorite }),
  },
  character: {
    setSize: (scale) => ipcRenderer.invoke(IPC.characterSetSize, scale),
    castSpell: (spell) => ipcRenderer.invoke(IPC.characterCastSpell, spell),
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
  atlassian: {
    get: () => ipcRenderer.invoke(IPC.atlassianGet),
    signIn: () => ipcRenderer.invoke(IPC.atlassianSignIn),
    cancelSignIn: () => ipcRenderer.invoke(IPC.atlassianCancelSignIn),
    signOut: () => ipcRenderer.invoke(IPC.atlassianSignOut),
    retry: () => ipcRenderer.invoke(IPC.atlassianRetry),
    feed: (refresh) => ipcRenderer.invoke(IPC.atlassianFeed, refresh ?? false),
    markNotificationsRead: (id) => ipcRenderer.invoke(IPC.atlassianMarkNotificationsRead, id),
    markRequestsRead: (key) => ipcRenderer.invoke(IPC.atlassianMarkRequestsRead, key),
    search: (query) => ipcRenderer.invoke(IPC.atlassianSearch, query),
    issue: (key) => ipcRenderer.invoke(IPC.atlassianIssue, key),
    transition: (key, transitionId) =>
      ipcRenderer.invoke(IPC.atlassianTransition, { key, transitionId }),
    comment: (key, body) => ipcRenderer.invoke(IPC.atlassianComment, { key, body }),
    logWork: (key, timeSpent) => ipcRenderer.invoke(IPC.atlassianLogWork, { key, timeSpent }),
    articles: (text) => ipcRenderer.invoke(IPC.atlassianArticles, text),
    projectKeys: () => ipcRenderer.invoke(IPC.atlassianProjectKeys),
    ask: (key, prompt) => ipcRenderer.invoke(IPC.atlassianAsk, { key, prompt }),
  },
  serviceDesk: {
    pcDetails: () => ipcRenderer.invoke(IPC.serviceDeskPcDetails),
    raise: (request) => ipcRenderer.invoke(IPC.serviceDeskRaise, request),
    openMyRequests: () => ipcRenderer.invoke(IPC.serviceDeskOpenMyRequests),
  },
  updates: {
    get: () => ipcRenderer.invoke(IPC.updatesGet),
    check: () => ipcRenderer.invoke(IPC.updatesCheck),
  },
  uninstall: () => ipcRenderer.invoke(IPC.appUninstall),
  screensaver: {
    wake: () => ipcRenderer.send(IPC.screensaverWake),
  },
  onScreensaverEnd: (callback) => subscribe(IPC.screensaverEnd, () => callback()),
  onRobeColorChanged: (callback) => subscribe(IPC.robeColorChanged, callback),
  onHatChanged: (callback) => subscribe(IPC.hatChanged, callback),
  onGaze: (callback) => subscribe(IPC.gaze, callback),
  onFamiliarSees: (callback) => subscribe(IPC.familiarSees, callback),
  onOcclude: (callback) => subscribe(IPC.occlude, callback),
  onTrickPlan: (callback) => subscribe(IPC.trickPlan, callback),
  onModeChanged: (callback) => subscribe(IPC.modeChanged, callback),
  onPoseChanged: (callback) => subscribe(IPC.poseChanged, callback),
  onArrive: (callback) => subscribe(IPC.bubbleArrive, callback),
  onCornerChanged: (callback) => subscribe(IPC.cornerChanged, callback),
  onSizeChanged: (callback) => subscribe(IPC.sizeChanged, callback),
  onClickThroughReset: (callback) => subscribe(IPC.clickThroughReset, callback),
  onAuthStatus: (callback) => subscribe(IPC.authStatus, callback),
  onChatMessage: (callback) => subscribe(IPC.chatMessage, callback),
  onChatReset: (callback) => subscribe(IPC.chatReset, () => callback()),
  onAppsState: (callback) => subscribe(IPC.appsState, callback),
  onAtlassianState: (callback) => subscribe(IPC.atlassianState, callback),
  onJiraFeed: (callback) => subscribe(IPC.jiraFeed, callback),
  onUpdateState: (callback) => subscribe(IPC.updateState, callback),
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
- `ipcRenderer.send(IPC.bubbleClick, pressedAt)`: fire and forget, as for the other `void`
  methods, with the press time.
- `onPoseChanged: (callback) => subscribe(IPC.poseChanged, callback)`: the character's pose, passed
  on as it arrives, like the mode, the corner and her size (`onSizeChanged`).
- `onArrive: (callback) => subscribe(IPC.bubbleArrive, callback)`: the word that her window is
  showing as the app starts, passed on the same way.
- `setSize: (scale) => ipcRenderer.invoke(IPC.characterSetSize, scale)`: the request from Size in
  the settings menu, with the size as a plain number. The main process checks it's one of
  `CHARACTER_SIZES`.
- `castSpell: (spell) => ipcRenderer.invoke(IPC.characterCastSpell, spell)`: the Spells menu's
  request, with the spell's name. The main process checks it's one of `SPELLS`.
- `subscribe(IPC.chatReset, () => callback())`: the reset carries no data, so the page's callback
  is called with no arguments, matching its `() => void` type. `onScreensaverEnd` is passed on the
  same way.
- `wake: () => ipcRenderer.send(IPC.screensaverWake)`: fire and forget, with nothing more to say
  than that the user's back.
- `ipcRenderer.invoke(IPC.appsGet, refresh ?? false)`: `refresh` is optional for the page, but
  the main process's check for this channel wants a real `true` or `false`, so a missing one is
  sent as `false`.
- `ipcRenderer.invoke(IPC.settingsSetFavoriteApp, { id, favorite })`: a request carries one
  argument, checked by one schema in the main process, so the two values go as one object. The
  Atlassian calls that take two values (`transition`, `comment`, `logWork` and `ask`) do the same,
  and `atlassian.feed()` sends a missing `refresh` as `false`, like `apps.get()`.
  `markNotificationsRead(id)` and `markRequestsRead(key)` send theirs as they are: a missing one
  goes as `undefined`, which the main process's schemas accept as "all of them".

### `contextBridge.exposeInMainWorld()`

The last line of the file, `contextBridge.exposeInMainWorld('assist', api)`, publishes `api` to
the page as `window.assist` ("main world" is Electron's name for the page's own world). From then
on the renderer calls `window.assist.chat.send(...)` and so on, and `src/renderer/src/env.d.ts`
declares `window.assist` as an `AssistApi` so those calls are type-checked too.
