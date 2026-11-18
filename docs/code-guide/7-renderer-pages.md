# The pages: entry points, styles, hooks and views

[← Code Guide](CODE_GUIDE.md)

This part covers the renderer's own files: the HTML page every overlay window loads, the startup
script, the stylesheet, two small helpers and the clones' wandering, the hooks (most of them
connecting React to the main process), and the six views (the bubble, her clones, her vision, her
spells' effects, the screen saver and the panel). The building blocks the views use are covered in
[the components part](8-renderer-components.md). If React is new to you: a React _component_ is a
function that returns a description of what to show, written in JSX (HTML-like tags inside
TypeScript, in `.tsx` files), and whenever the data it uses changes, React calls it again and
updates only the parts of the page that changed.

## `src/renderer/index.html`: the page every window loads

The bubble window, the panel window, and the clones', the vision's, the spells' and the screen
saver's windows all load this one page. It's almost
empty: a `<div>` for React to fill and a script tag that starts the app. The interesting part is
the security policy.

<!-- code: apps/desktop/src/renderer/index.html -->

[`src/renderer/index.html`, lines 1–15](../../apps/desktop/src/renderer/index.html#L1-L15)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"
    />
    <title>Desktop Wizard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

<!-- /code -->

- `http-equiv="Content-Security-Policy"`: a Content-Security-Policy (CSP) is a set of rules the
  browser enforces about what the page may load and run. Even if something managed to slip markup
  into the page (say, a crafted reply from Claude), the browser would refuse to run scripts from
  anywhere but the app itself. It's a second lock behind the sandbox and context isolation set in
  `createOverlayWindow` (src/main/bubble/windows.ts).
- `default-src 'self'`: anything without its own rule below may only come from the app's own
  origin: the built files, or the Vite dev server during `npm run dev`.
- `script-src 'self'`: scripts only from the app's own files. Inline `<script>` blocks and `eval`
  are blocked.
- `style-src 'self' 'unsafe-inline'`: the app's stylesheets plus inline styles. During
  `npm run dev`, Vite injects the CSS as `<style>` tags, which needs `'unsafe-inline'`.
- `img-src 'self' data:`: images from the app itself or `data:` URLs, which is how screenshot
  thumbnails and the Apps list's logos arrive (see `useThumbnail` below).
- `connect-src 'self'`: the page can't `fetch` anything from the internet. Only the main process
  talks to Claude and JumpCloud.
- `object-src 'none'; base-uri 'none'; form-action 'none'`: no plugins (`<object>`, `<embed>`), no
  `<base>` tag that could redirect relative links, and no form submissions anywhere.
- `<div id="root"></div>`: the empty element React takes over (see `main.tsx`).
- `<script type="module" src="./src/main.tsx"></script>`: the entry point. Vite compiles
  `main.tsx` and everything it imports into plain JavaScript and, in the build, rewrites this tag to
  point at the bundled file.

## `src/renderer/src/main.tsx`: choosing bubble, clones, vision, spell, screen saver or panel

The first code that runs in each window. It works out which window it's in and renders the
matching view. `BubbleView`, `ClonesView`, `VisionView`, `SpellView`, `ScreenSaverView` and `PanelView` are React components: functions whose
names start with a capital letter and return JSX. In JSX, `<BubbleView />` means "render the
`BubbleView` component here".

<!-- code: apps/desktop/src/renderer/src/main.tsx -->

[`src/renderer/src/main.tsx`, lines 1–36](../../apps/desktop/src/renderer/src/main.tsx#L1-L36)

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { BubbleView } from './views/BubbleView'
import { ClonesView } from './views/ClonesView'
import { FamiliarView } from './views/FamiliarView'
import { TrickView } from './views/TrickView'
import { PanelView } from './views/PanelView'
import { ScreenSaverView } from './views/ScreenSaverView'
import { SpellView } from './views/SpellView'
import { VisionView } from './views/VisionView'

// Every overlay window loads this page; the query string says which one this is.
const view = new URLSearchParams(window.location.search).get('view')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {view === 'bubble' ? (
      <BubbleView />
    ) : view === 'clones' ? (
      <ClonesView />
    ) : view === 'vision' ? (
      <VisionView />
    ) : view === 'spell' ? (
      <SpellView />
    ) : view === 'screensaver' ? (
      <ScreenSaverView />
    ) : view === 'familiar' ? (
      <FamiliarView />
    ) : view === 'trick' ? (
      <TrickView />
    ) : (
      <PanelView />
    )}
  </StrictMode>,
)
```

<!-- /code -->

- `import './styles.css'`: importing a CSS file from code is a Vite feature; it adds the stylesheet
  (after Tailwind has processed it) to the page.
- `// Every overlay window loads this page`: as the comment says, the query string says which one
  this is.
- `new URLSearchParams(window.location.search).get('view')`: reads the `view` (`bubble`, `panel`,
  `clones`, `vision`, `spell` or `screensaver`) that `createOverlayWindow`
  (src/main/bubble/windows.ts) adds to the query string when it loads the page. Anything other than
  `bubble`, `clones`, `vision`, `spell` or `screensaver` gets the panel.
- `document.getElementById('root')!`: the `!` tells TypeScript "this is not null"; the div is in
  `index.html`.
- `createRoot(`: hands that div to React, which from now on owns everything inside it. `render`
  draws the first screen.
- `<StrictMode>`: a development-only checker. In `npm run dev` it calls each component twice and
  runs each effect, cleans it up, then runs it again, to expose code that doesn't clean up after
  itself. That's why every hook below has a careful cleanup. It does nothing in the installed app.
- `{view === 'bubble' ? (`: curly braces switch from JSX back to ordinary TypeScript, here a
  choice between the six views. Each `? :` after the first only runs when the test before it
  fails, so it reads "the bubble, otherwise the clones, otherwise the vision, otherwise a spell's
  effects, otherwise the screen saver, otherwise the panel". The round brackets only let each view sit on a line of its own.

## `src/renderer/src/env.d.ts`: telling TypeScript about `window.assist`

The preload script puts an `assist` object on `window`, but TypeScript only knows the browser's
own `Window` type. This file adds the field, so `window.assist.getState()` and the rest are
type-checked in every renderer file. It contains types only and produces no JavaScript.

<!-- code: apps/desktop/src/renderer/src/env.d.ts -->

[`src/renderer/src/env.d.ts`, lines 1–10](../../apps/desktop/src/renderer/src/env.d.ts#L1-L10)

```ts
import type { AssistApi } from '@shared/ipc'

declare global {
  interface Window {
    /** Exposed by the preload script (src/preload/index.ts). */
    assist: AssistApi
  }
}

export {}
```

<!-- /code -->

- `declare global`: adds to the global types instead of declaring something new in this file.
  `interface Window` merges with the browser's own `Window` interface.
- `assist: AssistApi`: the type is defined in src/shared/ipc.ts. The object itself is created by
  src/preload/index.ts, which calls `contextBridge.exposeInMainWorld('assist', api)`.
- `export {}`: makes sure the file counts as a module, which `declare global` requires. The
  `import type` line already does that, so this is a safety net.

## `src/renderer/src/styles.css`: Tailwind setup and the few hand-written styles

**Tailwind in brief.** Tailwind CSS provides small, single-purpose class names: `flex`,
`rounded-full`, `px-3` (horizontal padding), `bg-white`, `text-xs`. Components style themselves by
listing these in `className` instead of writing a separate stylesheet. A prefix applies a class only
in some situation: `hover:` while the pointer is over it, `dark:` when the page is in dark mode
(Desktop Wizard's own setting, dark by default), `motion-reduce:` when Windows animations are turned
off, and `group-data-open:` when a parent marked `group` has a `data-open` attribute (used by the
panel). At build time Tailwind scans the source for the class names actually used and generates CSS
for just those. This file sets Tailwind up and holds the styles that classes can't express.

<!-- code: apps/desktop/src/renderer/src/styles.css -->

[`src/renderer/src/styles.css`, lines 1–231](../../apps/desktop/src/renderer/src/styles.css#L1-L231)

```css
@import 'tailwindcss';

@theme {
  /* Overridden at runtime with the tenant's colour (see useAccentColor). Every highlight uses it. */
  --color-accent: #9333ea;
  /* A lighter accent, for accent-coloured text on dark backgrounds. */
  --color-accent-soft: color-mix(in srgb, var(--color-accent) 60%, white);
  --font-sans: 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif;
}

@layer base {
  html,
  body,
  #root {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: transparent;
  }

  body {
    font-family: var(--font-sans);
    user-select: none;
    -webkit-font-smoothing: antialiased;
  }

  textarea {
    user-select: text;
  }

  /* Selected text uses the accent instead of the system blue. */
  ::selection {
    background-color: color-mix(in srgb, var(--color-accent) 25%, transparent);
  }

  /* Keyboard focus too; Chromium's default outline follows the Windows accent colour. */
  :focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  /* Slim scrollbars suit the small panel. */
  * {
    scrollbar-width: thin;
    scrollbar-color: rgb(0 0 0 / 0.2) transparent;
  }
  @media (prefers-color-scheme: dark) {
    * {
      scrollbar-color: rgb(255 255 255 / 0.2) transparent;
    }
  }
}

/* Claude's replies (rendered by components/Markdown.tsx). Sized for a narrow chat panel. */
@layer components {
  .markdown {
    user-select: text;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }
  .markdown > :first-child {
    margin-top: 0;
  }
  .markdown > :last-child {
    margin-bottom: 0;
  }
  .markdown :where(p, ul, ol, pre, table, blockquote) {
    margin: 0.5em 0;
  }
  .markdown :where(h1, h2, h3, h4) {
    margin: 0.8em 0 0.3em;
    font-weight: 600;
    line-height: 1.3;
  }
  .markdown h1 {
    font-size: 1.15em;
  }
  .markdown h2 {
    font-size: 1.08em;
  }
  .markdown :where(h3, h4) {
    font-size: 1em;
  }
  .markdown ul {
    list-style: disc;
    padding-left: 1.25em;
  }
  .markdown ol {
    list-style: decimal;
    padding-left: 1.4em;
  }
  .markdown li + li {
    margin-top: 0.15em;
  }
  .markdown a {
    color: var(--color-accent);
    text-decoration: underline;
    cursor: pointer;
  }
  .markdown blockquote {
    border-left: 3px solid var(--color-zinc-300);
    padding-left: 0.75em;
    color: var(--color-zinc-500);
  }
  .markdown :not(pre) > code {
    border-radius: 4px;
    background: var(--color-zinc-100);
    padding: 0.1em 0.3em;
    font-size: 0.9em;
  }
  .markdown pre {
    overflow-x: auto;
    border-radius: 8px;
    background: var(--color-zinc-100);
    padding: 0.6em 0.75em;
    font-size: 0.85em;
    line-height: 1.45;
  }
  .markdown code {
    font-family: 'Cascadia Code', Consolas, monospace;
  }
  .markdown table {
    display: block;
    overflow-x: auto;
    border-collapse: collapse;
    font-size: 0.9em;
  }
  .markdown :where(th, td) {
    border: 1px solid var(--color-zinc-200);
    padding: 0.25em 0.5em;
    text-align: left;
  }
  .markdown hr {
    margin: 0.8em 0;
    border-color: var(--color-zinc-200);
  }

  @media (prefers-color-scheme: dark) {
    .markdown a {
      color: var(--color-accent-soft);
    }
    .markdown blockquote {
      border-color: var(--color-zinc-600);
      color: var(--color-zinc-400);
    }
    .markdown :not(pre) > code,
    .markdown pre {
      background: var(--color-zinc-800);
    }
    .markdown :where(th, td),
    .markdown hr {
      border-color: var(--color-zinc-700);
    }
  }

  /* Code highlighting (highlight.js classes), light then dark. Purple in place of the usual
     blues, with names in orange so every kind of token still stands apart. */
  .hljs-comment,
  .hljs-quote {
    color: #6e7781;
    font-style: italic;
  }
  .hljs-keyword,
  .hljs-selector-tag,
  .hljs-built_in,
  .hljs-literal {
    color: #cf222e;
  }
  .hljs-string,
  .hljs-regexp,
  .hljs-addition {
    color: #6b21a8;
  }
  .hljs-number,
  .hljs-attr,
  .hljs-attribute,
  .hljs-variable {
    color: #9333ea;
  }
  .hljs-title,
  .hljs-section,
  .hljs-function {
    color: #953800;
  }
  .hljs-type,
  .hljs-name,
  .hljs-tag {
    color: #116329;
  }
  .hljs-deletion {
    color: #82071e;
  }

  @media (prefers-color-scheme: dark) {
    .hljs-comment,
    .hljs-quote {
      color: #8b949e;
    }
    .hljs-keyword,
    .hljs-selector-tag,
    .hljs-built_in,
    .hljs-literal {
      color: #ff7b72;
    }
    .hljs-string,
    .hljs-regexp,
    .hljs-addition {
      color: #e9d5ff;
    }
    .hljs-number,
    .hljs-attr,
    .hljs-attribute,
    .hljs-variable {
      color: #c084fc;
    }
    .hljs-title,
    .hljs-section,
    .hljs-function {
      color: #ffa657;
    }
    .hljs-type,
    .hljs-name,
    .hljs-tag {
      color: #7ee787;
    }
    .hljs-deletion {
      color: #ffa198;
    }
  }
}
```

<!-- /code -->

- `@import 'tailwindcss'`: brings in Tailwind: its reset of browser default styles ("Preflight",
  which among other things removes list bullets, margins and heading sizes), its default theme
  (colours such as `zinc`, spacing, fonts) and the generated utility classes.
- `@theme`: adds to Tailwind's theme. Each `--color-*` variable becomes a colour every utility can
  use, so `--color-accent` gives `bg-accent`, `text-accent`, `ring-accent` and so on. Those classes
  read the CSS variable when the page is drawn, not at build time.
- `--color-accent: #9333ea`: the default purple. `useAccentColor` (below) overwrites this variable
  with the tenant's colour once the app state arrives, which recolours every accent use at once.
- `--color-accent-soft: color-mix(in srgb, var(--color-accent) 60%, white)`: 60% accent mixed with
  white, for accent-coloured text on dark backgrounds (`dark:text-accent-soft`). Because it refers
  to `--color-accent`, it follows the tenant's colour too.
- `--font-sans`: the Windows 11 system font, falling back to older Segoe UI and then any system
  font.
- `@layer base`: page-wide defaults. Tailwind orders its CSS in layers (theme, base, components,
  utilities) and a later layer wins, so a utility class on an element always beats these rules.
- `background: transparent`: every overlay window is transparent (`transparent: true` in
  `createOverlayWindow`), so the page must not paint a background, or the see-through areas would
  be white. `overflow: hidden` stops the page itself ever showing scrollbars.
- `user-select: none`: the UI shouldn't highlight like a web page when you click or drag around.
  `textarea` and `.markdown` turn selection back on, so the text box and Claude's replies can still
  be selected and copied.
- `::selection`: selected text gets a 25% tint of the accent instead of the Windows blue.
- `:focus-visible`: the outline drawn around whatever has keyboard focus, in the accent colour.
  `:focus-visible` only matches focus that came from the keyboard, so mouse clicks don't draw it.
- `scrollbar-width: thin`: slim scrollbars (the conversation scrolls), with a lighter thumb in dark
  mode.
- `@layer components`: the styles for Claude's replies, which `Markdown` wraps in
  `<div className="markdown">` (see [the components part](8-renderer-components.md)). The Markdown
  library produces plain `<p>`, `<ul>`, `<pre>` and similar elements that can't carry Tailwind
  classes, so they're styled here by element.
- `overflow-wrap: anywhere`: long words and URLs break instead of overflowing the 400-pixel card.
- `.markdown > :first-child`: with the matching `:last-child` rule, removes the gap above the first
  block and below the last, so a reply has no extra space at its top and bottom.
- `.markdown :where(p, ul, ol, pre, table, blockquote)`: `:where()` groups selectors without adding
  specificity, so these rules stay easy to override.
- `list-style: disc`: puts back the bullets (and, for `ol`, the numbers) that Preflight removes.
- `.markdown :not(pre) > code`: inline code gets a small grey pill. Code blocks (`.markdown pre`)
  get a grey box that scrolls sideways instead of wrapping.
- `.markdown table`: `display: block` with `overflow-x: auto` lets a wide table scroll inside the
  card.
- `@media (prefers-color-scheme: dark)`: the dark-mode colours for the same elements. This media
  query follows Desktop Wizard's own light/dark setting: the main process sets Electron's
  `nativeTheme.themeSource`, which decides what the pages see (see `SettingsService.setTheme()` in
  [Main process: startup, IPC and app plumbing](2-main-startup.md)).
- `.hljs-comment`: the start of the code-highlighting colours. `rehype-highlight` (used by
  `Markdown`) wraps each token of a code block in a `<span>` with a highlight.js class such as
  `hljs-keyword` or `hljs-string`; these rules colour them. The palette is GitHub's, light then
  dark, with purple in place of the usual blues.

## `src/renderer/src/lib/cn.ts`: joining class names

### `cn`

<!-- code: apps/desktop/src/renderer/src/lib/cn.ts#cn -->

[`src/renderer/src/lib/cn.ts`, lines 1–4](../../apps/desktop/src/renderer/src/lib/cn.ts#L1-L4)

```ts
/** Joins class names, skipping falsy ones. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
```

<!-- /code -->

Builds a `className` string from several pieces, some of them conditional:
`cn('rounded-full', open && 'ring-accent')` gives `'rounded-full ring-accent'` when `open` is true
and `'rounded-full'` otherwise. Many React projects use the `clsx` library for this; four lines do
the job here.

- `...classes: Array<string | false | null | undefined>`: a rest parameter collects any number of
  arguments into an array. `false` is allowed so that `condition && 'class'` can be passed
  directly.
- `classes.filter(Boolean)`: keeps only truthy values, dropping `false`, `null`, `undefined` and
  empty strings.

## `src/renderer/src/lib/anchor.ts`: positioning from the bubble's corner

The panel window is placed so that one of its corners sits on the bubble's corner of the screen
(`panelWindowBounds` in src/main/bubble/layout.ts), and everything inside it is positioned from that
corner. These helpers turn "this far from the bubble's corner" into CSS for whichever corner the
bubble is in. That's what makes the whole panel mirror itself when the bubble is dragged to another
corner.

### `anchored`

<!-- code: apps/desktop/src/renderer/src/lib/anchor.ts#anchored -->

[`src/renderer/src/lib/anchor.ts`, lines 4–14](../../apps/desktop/src/renderer/src/lib/anchor.ts#L4-L14)

```ts
/**
 * Positions an element inside the panel window measured from the bubble's corner: `x` across
 * and `y` away from the screen edge. In the bottom-right corner that's `right`/`bottom`; in the
 * top-left it's `left`/`top`, and so on, so the panel mirrors itself to open into the screen.
 */
export function anchored(corner: Corner, x: number, y: number): CSSProperties {
  return {
    [isLeftCorner(corner) ? 'left' : 'right']: x,
    [isTopCorner(corner) ? 'top' : 'bottom']: y,
  }
}
```

<!-- /code -->

Returns a `style` object that places an element `x` pixels across and `y` pixels away from the
screen edge, measured from the bubble's corner. `ChatBox`, `ActionStack`, `SettingsMenu` and
`SpellsMenu` call it with the offsets from `panelLayout()` (src/shared/geometry.ts) for her size, the
same numbers the main process uses to size the window.

- `CSSProperties`: React's type for the `style` prop. Plain numbers in it mean pixels.
- `[isLeftCorner(corner) ? 'left' : 'right']: x`: a computed property name, where the key is
  chosen at runtime. In a left corner the element is placed `x` pixels from the left edge,
  otherwise from the right.
- `[isTopCorner(corner) ? 'top' : 'bottom']: y`: the same, vertically. In a bottom corner, `y` is
  measured up from the bottom.

### `originClass`

<!-- code: apps/desktop/src/renderer/src/lib/anchor.ts#originClass -->

[`src/renderer/src/lib/anchor.ts`, lines 16–24](../../apps/desktop/src/renderer/src/lib/anchor.ts#L16-L24)

```ts
/** Tailwind transform-origin class for animations that should grow out of the bubble's corner. */
export function originClass(corner: Corner): string {
  return {
    'top-left': 'origin-top-left',
    'top-right': 'origin-top-right',
    'bottom-left': 'origin-bottom-left',
    'bottom-right': 'origin-bottom-right',
  }[corner]
}
```

<!-- /code -->

The Tailwind `origin-*` class that sets `transform-origin` to the bubble's corner. `ChatBox` opens
by scaling from 95% to 100% size; with the origin at the bubble's corner, it appears to grow out of
the bubble.

- `'top-left': 'origin-top-left'`: a lookup table instead of building the name as
  `'origin-' + corner`. Tailwind finds classes by scanning the source text, so every class name
  must appear in full somewhere or its CSS is never generated.
- `}[corner]`: picks the entry for this corner. TypeScript checks the table has all four corners.

## `src/renderer/src/lib/clones.ts`: how her clones wander

Her Clones spell fills a window along the taskbar with copies of her (see `ClonesView` below, and `Clones` in [The bubble](5-bubble.md)). This file decides where
each clone goes: plain functions that take a clone and the time and return the clone a moment
later, without touching the page. Keeping them apart from the page means `tests/clones.test.ts`
can walk a clone across the window with made-up times and random numbers, in milliseconds. It's
much like what `wander.ts` does for her in the main process, but for ten of her at once, each on
its own timetable, and without a corner to stay near.

### `Clone`, `Room` and `CLONE_WALK`

<!-- code: apps/desktop/src/renderer/src/lib/clones.ts#Clone,Room,CLONE_WALK -->

[`src/renderer/src/lib/clones.ts`, lines 4–44](../../apps/desktop/src/renderer/src/lib/clones.ts#L4-L44)

```ts
// How her clones wander (see ClonesView): each stands a moment, walks somewhere else along the
// taskbar, stands again, and so on, every one on its own timetable. Positions are DIPs from the
// left edge of the clones' window to the left edge of a clone's box.

export interface Clone {
  x: number
  /** Where it's walking to (when `walking`). */
  target: number
  /** Its walking speed (DIP per second). */
  speed: number
  facing: Facing
  walking: boolean
  /** Waving (her wave habit) while it stands, for once. */
  waving: boolean
  /** When it sets off again (when standing): ms, on the same clock as `now` below. */
  waitUntil: number
}

/** The room they have: the window's width, a clone's box, and her size. */
export interface Room {
  width: number
  box: number
  scale: number
}

export const CLONE_WALK = {
  /** Walking speed at her usual size (DIP per second), varied a little for each clone... */
  speed: 80,
  /** ...by up to this much either way. */
  speedSpread: 0.25,
  /** A stop lasts this long (ms, from-to). */
  pause: [300, 2000],
  /** Shorter walks aren't worth it (DIP at her usual size). */
  minWalk: 60,
  /** How often a clone waves when it stops (instead of just standing), 0 to 1. */
  waveChance: 0.2,
  /** The first set off one after another, this far apart (ms)... */
  stagger: 120,
  /** ...each up to this much later still (ms), so they don't leave in a line. */
  scatter: 900,
} as const
```

<!-- /code -->

As the comment at the top says, each clone stands a moment, walks somewhere else along the
taskbar, stands again, and so on; now and then, when it stops, it waves, as she does. Positions are DIPs from the left edge of the clones' window to
the left edge of a clone's box.

- `Clone`: one clone. `x` is where it is now and `target` where it's walking to. `speed` is its own
  walking speed, in DIPs a second, so they don't all walk in step. `facing` (`'left'` or
  `'right'`, the `Facing` type from `character/sprite.ts`) is the way it walks, and the way it
  keeps facing when it stops. `walking` says whether it's on the move. `waving`, as its comment
  says, is whether it's waving (her `wave` habit) while it stands, for once. While it isn't walking,
  `waitUntil`
  is when it sets off again, in milliseconds on the same clock as the `now` passed to the functions
  below (`ClonesView` uses the page's `performance.now()`).
- `Room`: as its comment says, the room they have: the window's `width`, a clone's `box` (her
  window's width at her size, from `bubbleMetrics()` in `src/shared/geometry.ts`) and her size
  (`scale`, one of `CHARACTER_SIZES`). A clone's `x` can go from 0 to `width - box`, so it stays
  wholly in the window.
- `CLONE_WALK`: the numbers, as their comments say:
  - `speed: 80`: walking speed at her usual size, the same as her own (`WANDER.walkSpeed`). It's
    multiplied by `scale`, so bigger clones take longer strides, as she does.
  - `speedSpread: 0.25`: each walk's speed is varied by up to 25% either way.
  - `pause: [300, 2000]`: a stop lasts between 0.3 and 2 seconds.
  - `minWalk: 60`: shorter walks aren't worth it (DIPs at her usual size, also multiplied by
    `scale`).
  - `waveChance: 0.2`: as its comment says, how often a clone waves when it stops, instead of just
    standing: one stop in five.
  - `stagger: 120` and `scatter: 900`: the first walks start one after another, 120 ms apart, each
    up to 900 ms later still, so the clones don't all leave in a line.
- `as const`: keeps the numbers exact and read-only, and makes `pause` a pair of two numbers rather
  than any array.

### `spawnClones()`

<!-- code: apps/desktop/src/renderer/src/lib/clones.ts#spawnClones -->

[`src/renderer/src/lib/clones.ts`, lines 46–67](../../apps/desktop/src/renderer/src/lib/clones.ts#L46-L67)

```ts
/**
 * `count` clones, all standing where she stands (`from`), each about to set off a moment after
 * the last, facing either way.
 */
export function spawnClones(
  count: number,
  from: number,
  now: number,
  room: Room,
  random: () => number,
): Clone[] {
  const x = Math.min(Math.max(from, 0), Math.max(0, room.width - room.box))
  return Array.from({ length: count }, (_, i) => ({
    x,
    target: x,
    speed: CLONE_WALK.speed * room.scale,
    facing: random() < 0.5 ? 'left' : 'right',
    walking: false,
    waving: false,
    waitUntil: now + 150 + i * CLONE_WALK.stagger + random() * CLONE_WALK.scatter,
  }))
}
```

<!-- /code -->

As the comment says, `count` clones, all standing where she stands, each about to set off a moment
after the last, facing either way.

- `from`: where she stands, as an `x` in the window (the main process passes it in the page's query
  string). `Math.min(Math.max(from, 0), Math.max(0, room.width - room.box))` keeps it in the window,
  so a clone can't start half off it.
- `random: () => number`: a source of random numbers between 0 and 1. The page passes
  `Math.random`; the tests pass a fixed list, so what happens is the same every run.
- `Array.from({ length: count }, (_, i) => ...)`: makes a list of `count` clones; `i` is each one's
  place in the list, and `_` stands for the empty slot `Array.from` also passes.
- `speed: CLONE_WALK.speed * room.scale`: her own walking speed at her size, until each clone picks
  one of its own for its first walk.
- `facing: random() < 0.5 ? 'left' : 'right'`: half face one way, half the other (by chance).
- `waving: false`: none waves to begin with.
- `waitUntil: now + 150 + i * CLONE_WALK.stagger + random() * CLONE_WALK.scatter`: the first can
  set off 150 ms after they appear, and each one after that 120 ms later, plus a random wait of up
  to 900 ms.

### `stepClone()`

<!-- code: apps/desktop/src/renderer/src/lib/clones.ts#stepClone -->

[`src/renderer/src/lib/clones.ts`, lines 69–114](../../apps/desktop/src/renderer/src/lib/clones.ts#L69-L114)

```ts
/**
 * A clone a frame later (`dtMs` on, at `now`): walking on toward its target and stopping there
 * for a while (now and then waving, as she does), or, its stop over, setting off somewhere else at
 * a speed of its own.
 */
export function stepClone(
  clone: Clone,
  now: number,
  dtMs: number,
  room: Room,
  random: () => number,
): Clone {
  if (clone.walking) {
    const step = (clone.speed * Math.min(Math.max(dtMs, 0), 100)) / 1000
    const x =
      clone.target > clone.x
        ? Math.min(clone.target, clone.x + step)
        : Math.max(clone.target, clone.x - step)
    if (x !== clone.target) return { ...clone, x }
    // Arrived: now and then it waves (for as long as her wave takes), otherwise it just stands.
    const waving = random() < CLONE_WALK.waveChance
    const [shortest, longest] = CLONE_WALK.pause
    return {
      ...clone,
      x,
      walking: false,
      waving,
      waitUntil: now + (waving ? FIDGET_MS.wave : shortest + random() * (longest - shortest)),
    }
  }
  if (now < clone.waitUntil) return clone
  const target = walkTarget(clone.x, room, random())
  // Nowhere far enough to go: it stands a little longer (and stops waving, if it was).
  if (target === clone.x) {
    return { ...clone, waving: false, waitUntil: now + CLONE_WALK.pause[0] }
  }
  const spread = 1 + (random() * 2 - 1) * CLONE_WALK.speedSpread
  return {
    ...clone,
    target,
    walking: true,
    waving: false,
    facing: target > clone.x ? 'right' : 'left',
    speed: CLONE_WALK.speed * room.scale * spread,
  }
}
```

<!-- /code -->

As the comment says, a clone a frame later: `dtMs` milliseconds on, at the time `now`: walking on,
stopping (now and then waving, as she does), or setting off again. It never
changes the clone it's given; it returns a new one (or the same one, when nothing changed).

- `if (clone.walking) {`: a walking clone moves `step` DIPs toward its target. `dtMs` is kept
  between 0 and 100, so a long gap (the PC was asleep, say) moves it only as far as a tenth of a
  second would, rather than in one big jump. `Math.min(clone.target, ...)` and
  `Math.max(clone.target, ...)` stop it exactly at the target instead of walking past it.
- `if (x !== clone.target) return { ...clone, x }`: still on its way, so only `x` changes.
- Once there, it stops (`walking: false`). As the comment says, now and then it waves: a roll below
  `CLONE_WALK.waveChance` (one in five) sets `waving`, and then it stands for exactly as long as
  her wave takes (`FIDGET_MS.wave`, 2 seconds, from `src/shared/character.ts`), so the animation
  plays through once. Otherwise it just stands, for somewhere between 300 and 2000 ms
  (`shortest + random() * (longest - shortest)`; the line before takes `CLONE_WALK.pause` apart
  into `shortest` and `longest`).
- `if (now < clone.waitUntil) return clone`: standing, and its stop isn't over yet. Returning the
  very same object tells the page nothing changed.
- `walkTarget(clone.x, room, random())`: its stop over, it picks somewhere else to go (below). If
  there's nowhere far enough away (a window hardly wider than a clone), as the comment says, it
  stands another 300 ms and tries again, and stops waving if it was, so a clone that waved there
  doesn't stay frozen on the wave's last frame.
- `const spread = 1 + (random() * 2 - 1) * CLONE_WALK.speedSpread`: `random() * 2 - 1` is a number
  from -1 to 1, so `spread` is between 0.75 and 1.25: each walk is a little faster or slower than
  her usual pace.
- `waving: false`: setting off, it stops waving.
- `facing: target > clone.x ? 'right' : 'left'`: it turns to face the way it's going.

### `walkTarget()` and `clonePose()`

<!-- code: apps/desktop/src/renderer/src/lib/clones.ts#walkTarget,clonePose -->

[`src/renderer/src/lib/clones.ts`, lines 116–135](../../apps/desktop/src/renderer/src/lib/clones.ts#L116-L135)

```ts
/**
 * Somewhere else along the window to walk to, at least CLONE_WALK.minWalk away (at her size)
 * when there's room: `roll` (0–1) picks among the places far enough away, either side.
 */
export function walkTarget(x: number, room: Room, roll: number): number {
  const far = Math.max(0, room.width - room.box)
  const minWalk = Math.min(CLONE_WALK.minWalk * room.scale, far / 2)
  const before = Math.max(0, x - minWalk)
  const after = Math.max(0, far - (x + minWalk))
  if (before + after === 0) return x
  const along = roll * (before + after)
  return along < before ? along : x + minWalk + (along - before)
}

/** What a clone looks like doing what it's doing: walking its way, waving, or standing. */
export function clonePose(clone: Clone): Pose {
  if (clone.waving) return 'wave'
  if (!clone.walking) return 'idle'
  return clone.facing === 'right' ? 'walk-right' : 'walk-left'
}
```

<!-- /code -->

- `walkTarget(x, room, roll)`: as the comment says, somewhere else along the window to walk to, at
  least `CLONE_WALK.minWalk` away (at her size) when there's room. It's worked out the same way as
  `walkTarget()` in `wander.ts`:
  - `far`: the furthest `x` a clone can stand at, its right-hand edge on the window's.
  - `minWalk`: 60 DIPs times her size, but never more than half of `far`, so a narrow window still
    leaves somewhere to go.
  - `before` and `after`: the lengths of the two stretches far enough away: from the window's left
    edge up to `minWalk` short of the clone, and from `minWalk` past it to `far`. If both are 0
    there's nowhere to go, and it returns `x`.
  - `roll` (between 0 and 1) picks a point along the two stretches laid end to end: in the first,
    it's that place on the left; past it, the same distance into the second stretch, on the right.
    So every place far enough away, on either side, is as likely as any other.
- `clonePose(clone)`: as the comment says, what a clone looks like doing what it's doing: `wave`
  while it's waving, `idle` when it's otherwise standing, and `walk-right` or `walk-left` by the way
  it faces while it walks. These are the same
  poses the main process gives her (`Pose` in `src/shared/character.ts`), so `Character` draws the
  clones with the same frames.

## `src/renderer/src/hooks/useAssistState.ts`: the app state, kept live

**Hooks in brief.** Functions whose names start with `use` are _hooks_. A component calls them at
the top of its body, in the same order on every render.

- **State:** `useState(initial)` gives a value that survives between renders, and a setter.
  Calling the setter stores a new value and makes React render the component again.
- **Effects:** `useEffect(fn, deps)` runs `fn` after React has updated the page. It's the place for
  work outside React, such as subscribing to IPC events or adding a `window` listener. If `fn`
  returns a function, React calls it to clean up before running the effect again and when the
  component goes away. `deps` lists the values the effect uses: it re-runs when one of them
  changes, and `[]` means "only when the component first appears".
- **Custom hooks:** an ordinary function that calls other hooks, so several components can share
  the same stateful logic. Each component that calls it gets its own separate copy of the state.

This file's hooks are used by the views: `useAssistState` by the bubble and the panel, and
`useAccentColor` by those two, the clones and the screen saver (the vision's and the spells' pages
use neither). Each window is a separate page, so each keeps its own
copy of the state.

### `useAssistState`

<!-- code: apps/desktop/src/renderer/src/hooks/useAssistState.ts#useAssistState -->

[`src/renderer/src/hooks/useAssistState.ts`, lines 4–43](../../apps/desktop/src/renderer/src/hooks/useAssistState.ts#L4-L43)

```ts
/**
 * The app state, kept live for the parts the main process changes on its own: the mode, the
 * character's corner, pose and size, the sign-in status and the chat. (Notes and settings only change through this
 * window's own requests, so the panel tracks their results itself.)
 *
 * Subscriptions start before the state is fetched. Events that arrive before the reply are
 * already reflected in it; events after it are applied on top.
 */
export function useAssistState(): AppState | null {
  const [state, setState] = useState<AppState | null>(null)

  useEffect(() => {
    let alive = true
    const update = (change: (s: AppState) => AppState) =>
      setState((current) => (current ? change(current) : current))
    const unsubscribe = [
      window.assist.onModeChanged((mode) => update((s) => ({ ...s, mode }))),
      window.assist.onPoseChanged((pose) => update((s) => ({ ...s, pose }))),
      window.assist.onCornerChanged((corner) => update((s) => ({ ...s, corner }))),
      window.assist.onSizeChanged((size) => update((s) => ({ ...s, size }))),
      window.assist.onRobeColorChanged((robeColor) =>
        update((s) => ({ ...s, settings: { ...s.settings, robeColor } })),
      ),
      window.assist.onAuthStatus((auth) => update((s) => ({ ...s, auth }))),
      window.assist.onChatMessage((message) =>
        update((s) => ({ ...s, chat: upsert(s.chat, message) })),
      ),
      window.assist.onChatReset(() => update((s) => ({ ...s, chat: [] }))),
    ]
    void window.assist.getState().then((initial) => {
      if (alive) setState(initial)
    })
    return () => {
      alive = false
      for (const off of unsubscribe) off()
    }
  }, [])

  return state
}
```

<!-- /code -->

Fetches the whole app state (`AppState` in src/shared/types.ts: mode, corner, pose, her size, draft,
settings, branding, version, sign-in status and chat) when the page loads, then applies the
changes the main process broadcasts. It returns `null` until the first reply arrives.

The order matters. The listeners are attached before `getState` is called, and the main process
builds the reply in one go. Messages from the main process reach a window in the order they were
sent, so a change broadcast before the reply was built is already included in the reply, and any
later one arrives after it. Nothing is missed and nothing is applied twice.

- `useState<AppState | null>(null)`: the `<AppState | null>` tells TypeScript what the state can
  hold.
- `let alive = true`: set to `false` by the cleanup, so a reply that arrives after the component
  has gone is ignored. (In development, `StrictMode` unmounts and remounts once, so this really
  happens.)
- `setState((current) => (current ? change(current) : current))`: passing a function to the setter
  means "compute the new state from the latest one". The effect runs only once, so the `state`
  variable it could see would be the `null` from the first render forever. A change that arrives
  before the first state is dropped (`current` is still `null`), which is safe for the reason
  above.
- `({ ...s, mode })`: a copy of the state with one field replaced. React notices a change by
  getting a new object, so state is always replaced, never edited in place.
- `window.assist.onModeChanged(`: each `on...` function listens for one main-process broadcast
  (sent to both windows by `broadcast` in src/main/index.ts) and returns a function that stops
  listening (`subscribe` in src/preload/index.ts).
- `window.assist.onPoseChanged((pose) => update((s) => ({ ...s, pose })))`: the character's pose,
  which changes often (every walk and fidget). Only the bubble's page uses it, to animate the
  character, but both windows get the broadcast and keep it, like everything else here.
- `window.assist.onSizeChanged((size) => update((s) => ({ ...s, size })))`: her size
  (`CharacterSize` in src/shared/geometry.ts: her `scale`, and `max`, the biggest she can be on her
  screen). As the main process's comment puts it, it's sent when her size changes, or the biggest
  she can be on her screen does: from Size in the settings menu, or when she's dropped on another
  display or the screen changes, and she has to be smaller there or has room to be bigger again.
  The bubble's page sizes her by it, and the panel lays itself out round her by it and shows it
  under Size in the settings menu.
- `upsert(s.chat, message)`: a streaming reply arrives many times with the same id and growing
  text (from `ChatSession`, at most every 50 ms), so it replaces the old copy rather than being
  added again.
- `window.assist.onChatReset(() => update((s) => ({ ...s, chat: [] })))`: New conversation, or
  Log out, cleared the chat.
- `void window.assist.getState().then(`: asks for the full state, which `getState` in
  src/main/index.ts assembles. `void` marks a promise the code deliberately doesn't wait for.
- `return () => {`: the cleanup: ignore a late reply and unsubscribe everything.

The draft (`notes`) and `settings` aren't kept live here: only this window's own requests change
them, so `Panel` tracks their results itself.

### `upsert`

<!-- code: apps/desktop/src/renderer/src/hooks/useAssistState.ts#upsert -->

[`src/renderer/src/hooks/useAssistState.ts`, lines 45–51](../../apps/desktop/src/renderer/src/hooks/useAssistState.ts#L45-L51)

```ts
function upsert(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const index = messages.findIndex((m) => m.id === message.id)
  if (index === -1) return [...messages, message]
  const next = messages.slice()
  next[index] = message
  return next
}
```

<!-- /code -->

Replaces the message with the same `id`, or adds it at the end if it's new. `messages.slice()`
copies the array first, so the old array React is holding is left unchanged.

### `useAccentColor`

<!-- code: apps/desktop/src/renderer/src/hooks/useAssistState.ts#useAccentColor -->

[`src/renderer/src/hooks/useAssistState.ts`, lines 65–70](../../apps/desktop/src/renderer/src/hooks/useAssistState.ts#L65-L70)

```ts
/** Applies the tenant's accent colour to the `accent` Tailwind colour. */
export function useAccentColor(color: string | undefined): void {
  useEffect(() => {
    if (color) document.documentElement.style.setProperty('--color-accent', color)
  }, [color])
}
```

<!-- /code -->

Applies the tenant's accent colour (`accentColor` in tenant.json) to the page by overwriting the
`--color-accent` variable from `styles.css`.

- `document.documentElement.style.setProperty('--color-accent', color)`: sets the variable as an
  inline style on `<html>`, the element Tailwind declares its theme variables on, and an inline
  style beats the stylesheet. `--color-accent-soft` is declared on the same element and recomputes
  from the new value.
- `if (color)`: while the state is loading, `color` is `undefined` and the default purple stays.
- `[color]`: the effect re-runs only if the colour changes.

## `src/renderer/src/hooks/useClickThrough.ts`: the panel's half of click-through

The panel window is a large rectangle that's mostly transparent. So that clicks on its empty areas
reach whatever is underneath, the main process makes the window ignore the mouse, while still
passing pointer movements to the page. This hook watches those movements and asks the main process
to switch mouse input on only while the pointer is over real UI, which is any element marked
`data-hit` (the chat card, each action icon, the settings menu and the spells menu). See
[Code Guide section 1](CODE_GUIDE.md#1-background-how-an-electron-app-is-put-together) for the
background. Only `PanelView` uses it; the bubble window and the screen saver's always take the
mouse, and the clones', the vision's and the spells' windows never do.

### `useClickThrough`

<!-- code: apps/desktop/src/renderer/src/hooks/useClickThrough.ts#useClickThrough -->

[`src/renderer/src/hooks/useClickThrough.ts`, lines 3–61](../../apps/desktop/src/renderer/src/hooks/useClickThrough.ts#L3-L61)

```ts
/**
 * Makes the panel window's see-through areas pass clicks to whatever is underneath. The main
 * process keeps the window ignoring the mouse (while still forwarding pointer moves to it), and
 * this hook switches mouse input on only while the pointer is over an element marked `data-hit`.
 *
 * There's deliberately no "pointer left the window" handling: switching mouse input on makes
 * Windows send a stale leave message, and reacting to it left the window click-through while the
 * pointer sat on real UI. A window with input on gets a real move as soon as the pointer is over
 * an empty area again, which switches it back off.
 */
export function useClickThrough(): void {
  useEffect(() => {
    // null = unknown (after a reset): the next decision is always sent.
    let interactive: boolean | null = false
    let pointer: { x: number; y: number } | null = null

    const set = (next: boolean) => {
      if (next === interactive) return
      interactive = next
      window.assist.setInteractive(next)
    }
    const hitAt = (x: number, y: number) =>
      document.elementFromPoint(x, y)?.closest('[data-hit]') != null

    const onMove = (event: MouseEvent) => {
      pointer = { x: event.clientX, y: event.clientY }
      // While a button is held (selecting text, say) keep mouse input on, so the window doesn't
      // lose the release when the pointer briefly runs outside it.
      if (event.buttons !== 0) return
      set(hitAt(pointer.x, pointer.y))
    }
    // Content can change under a still pointer (a menu closes, the chat grows).
    const recheck = () =>
      requestAnimationFrame(() => {
        if (pointer) set(hitAt(pointer.x, pointer.y))
      })

    // The panel was just shown: the main process has made it click-through and says where the
    // pointer is. Decide once the page has rendered its open state.
    const offReset = window.assist.onClickThroughReset((point) => {
      interactive = null
      pointer = point
      requestAnimationFrame(() => {
        if (pointer) set(hitAt(pointer.x, pointer.y))
      })
    })

    // After a reload the main process may still have input switched on; resync.
    window.assist.setInteractive(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', recheck)
    return () => {
      offReset()
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', recheck)
      set(false)
    }
  }, [])
}
```

<!-- /code -->

- `let interactive: boolean | null = false`: what the page last told the main process. This and
  `pointer` are plain variables inside the effect, not React state: they change on every mouse
  move and must not cause re-renders. They live as long as the effect does.
- `if (next === interactive) return`: sends a message only when the answer changes, not on every
  mouse move.
- `window.assist.setInteractive(next)`: the main process's handler (src/main/ipc.ts) calls
  `setIgnoreMouseEvents(!interactive, { forward: true })` on this window. `forward: true` keeps
  mouse moves coming to the page even while clicks pass through, which is what lets this hook keep
  watching.
- `document.elementFromPoint(x, y)?.closest('[data-hit]') != null`: finds the topmost element
  under the pointer, then checks it and its ancestors for `data-hit`. `elementFromPoint` skips
  elements with `pointer-events: none`, so while the panel is closed (`Panel` adds
  `pointer-events-none`) nothing counts as a hit.
- `if (event.buttons !== 0) return`: while a mouse button is held (selecting text, say), input
  stays on, so the release isn't lost if the pointer briefly runs outside the UI.
- `const recheck = () =>`: runs after each mouse button release. The click may have changed what's
  under a pointer that hasn't moved (a menu closed, the chat grew), so the answer is worked out
  again.
- `requestAnimationFrame(`: runs the callback just before the browser draws the next frame, by
  which time React has applied the change the click caused.
- `window.assist.onClickThroughReset((point) => {`: each time the panel is shown,
  `resetClickThrough` (src/main/bubble/windows.ts) makes the window ignore the mouse again and
  sends where the pointer is inside the window. The new mode is broadcast just before the window is
  shown (`BubbleController.expand`), so waiting a frame lets the page draw its open state first.
- `interactive = null`: the main process has just switched input off, so what the page last sent
  may no longer be true. `null` equals neither `true` nor `false`, so the next `set` always sends.
- `window.assist.setInteractive(false)`: after a reload (the page crashed and `lockDown` in
  src/main/bubble/windows.ts reloaded it, or a development reload) the main process may still have
  input switched on for the old page.
- `set(false)`: in the cleanup, leaves the window click-through when the hook goes away.

The doc comment explains the one thing deliberately missing: a "pointer left the window" handler.

## `src/renderer/src/hooks/useToast.ts`: short messages

A toast is a small message that appears briefly and goes away by itself, such as "Copied" or
"Screenshot saved". `Panel` owns the toast; `ChatBox` draws it just outside the chat card.

### `ToastMessage`, `TOAST_MS`

<!-- code: apps/desktop/src/renderer/src/hooks/useToast.ts#ToastMessage,TOAST_MS -->

[`src/renderer/src/hooks/useToast.ts`, lines 3–9](../../apps/desktop/src/renderer/src/hooks/useToast.ts#L3-L9)

```ts
export interface ToastMessage {
  id: number
  text: string
  tone: 'info' | 'error'
}

const TOAST_MS = 2600
```

<!-- /code -->

One toast, and how long it stays (2.6 seconds). `tone` picks its colours in `ChatBox`: a dark pill
for `info`, red for `error`.

### `useToast`

<!-- code: apps/desktop/src/renderer/src/hooks/useToast.ts#useToast -->

[`src/renderer/src/hooks/useToast.ts`, lines 11–29](../../apps/desktop/src/renderer/src/hooks/useToast.ts#L11-L29)

```ts
/** One short-lived message at a time; a new one replaces the old. */
export function useToast(): [
  ToastMessage | null,
  (text: string, tone?: ToastMessage['tone']) => void,
] {
  const [toast, setToast] = useState<ToastMessage | null>(null)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const show = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    setToast({ id: Date.now(), text, tone })
  }, [])

  return [toast, show]
}
```

<!-- /code -->

Returns the current toast (or `null`) and a function to show a new one, as a pair, the same shape
`useState` returns. A new toast replaces the old one.

- `ToastMessage['tone']`: "the type of `ToastMessage`'s `tone` field", so `'info' | 'error'`.
- `if (!toast) return`: nothing to time when no toast is showing.
- `return () => clearTimeout(timer)`: when a new toast replaces the old one, React runs this
  cleanup before starting the new timer. The old timer can't clear the new toast early, and the new
  one gets its full 2.6 seconds.
- `useCallback(`: returns the same function on every render, since its dependency list `[]` never
  changes. Without it, `show` would be a new function each time, which matters when it's passed to
  other components or listed in an effect's dependencies.
- `id: Date.now()`: every call creates a new object, even for the same text, so the effect restarts
  the timer. `ChatBox` uses the `id` as the toast's React `key`, so a repeated message is drawn as a
  fresh element.

## `src/renderer/src/hooks/useThumbnail.ts`: loading a screenshot preview

### `useThumbnail`

<!-- code: apps/desktop/src/renderer/src/hooks/useThumbnail.ts#useThumbnail -->

[`src/renderer/src/hooks/useThumbnail.ts`, lines 3–18](../../apps/desktop/src/renderer/src/hooks/useThumbnail.ts#L3-L18)

```ts
/** A screenshot preview: undefined while loading, null if the file is missing. */
export function useThumbnail(path: string): string | null | undefined {
  const [result, setResult] = useState<{ path: string; url: string | null } | null>(null)

  useEffect(() => {
    let alive = true
    void window.assist.screenshots.thumbnail(path).then((url) => {
      if (alive) setResult({ path, url })
    })
    return () => {
      alive = false
    }
  }, [path])

  return result?.path === path ? result.url : undefined
}
```

<!-- /code -->

Asks the main process for a small preview of a screenshot. It returns three kinds of value:
`undefined` while loading, `null` if the file is missing, or the image as a `data:` URL.
`AttachmentChip` uses the difference to show "File missing" only when the file really is gone; the
sent-screenshot thumbnails in `MessageList` use it too (see
[the components part](8-renderer-components.md)).

- `window.assist.screenshots.thumbnail(path)`: `ScreenshotService.thumbnail` in the main process
  returns a cached, shrunken copy of the image, or `null` if the file is gone or isn't inside the
  screenshots folder. `data:` images are allowed by the `img-src` rule in `index.html`.
- `useState<{ path: string; url: string | null } | null>(null)`: the result remembers which path it
  belongs to.
- `[path]`: fetch again whenever the path changes.
- `if (alive) setResult({ path, url })`: ignore a reply for a path that's no longer wanted (the
  component moved on to another screenshot, or went away).
- `return result?.path === path ? result.url : undefined`: while a new path loads, the previous
  picture isn't shown for it. Comparing paths here means the effect doesn't have to clear the old
  result itself.

## `src/renderer/src/hooks/useFitInWindow.ts`: keeping a side menu in the window

### `useFitInWindow`

<!-- code: apps/desktop/src/renderer/src/hooks/useFitInWindow.ts#useFitInWindow -->

[`src/renderer/src/hooks/useFitInWindow.ts`, lines 4–26](../../apps/desktop/src/renderer/src/hooks/useFitInWindow.ts#L4-L26)

```ts
/**
 * Keeps a menu that opens beside the action stack (Settings, Size) inside the panel window. It
 * lines up with its icon, `offset` from the bubble's edge of the window, unless that would push its
 * far edge out of the window (a long menu by an icon high up the stack), when it moves back toward
 * the bubble just enough to fit. One taller than the whole window scrolls (`maxHeight`). `menu` is
 * the menu's element, whose height is measured as it renders and changes (an item appearing, say).
 */
export function useFitInWindow(
  menu: RefObject<HTMLElement | null>,
  offset: number,
): { offset: number; maxHeight: number } {
  const [height, setHeight] = useState(0)
  useEffect(() => {
    const element = menu.current
    if (!element) return
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight))
    observer.observe(element)
    return () => observer.disconnect()
  }, [menu])
  // The window's height, less the room kept along its far edge for drop shadows.
  const room = window.innerHeight - UI.shadowPad
  return { offset: Math.max(0, Math.min(offset, room - height)), maxHeight: room }
}
```

<!-- /code -->

As the comment says, keeps a menu that opens beside the action stack (the settings menu and the
spells menu) inside the panel window. Each menu lines up with its icon: its near edge is `offset`
from the bubble's edge of the window (the window's bottom, in a bottom corner), where the icon is.
But the icons stack away from the bubble, and a long menu beside an icon high up the stack (the
settings menu, beside the gear) could run past the top of the window and be cut off. This hook
moves a menu back toward the bubble just far enough to fit, and lets one taller than the whole
window scroll. `SettingsMenu` and `SpellsMenu` use it (see
[the components part](8-renderer-components.md)).

- `menu: RefObject<HTMLElement | null>`: as the comment says, the menu's element, from a `useRef`
  in the menu, whose height is measured as it renders and whenever it changes (an item appearing,
  say).
- `offset: number`: where the menu would like to be: level with its icon (`actionOffset()` in
  `src/shared/geometry.ts`).
- `new ResizeObserver(() => setHeight(element.offsetHeight))`: the browser calls this when the
  menu's size changes (and once when it starts watching), and keeping its height in state draws
  the menu again in its new place. The cleanup stops watching. `[menu]`: the ref object never
  changes, so this runs once.
- `const room = window.innerHeight - UI.shadowPad`: as the comment says, the window's height, less
  the room kept along its far edge for drop shadows (`UI.shadowPad`, the same margin the panel
  window is sized with).
- `Math.max(0, Math.min(offset, room - height))`: the offset the menu gets: where it would like to
  be, unless its far edge (`offset + height`) would pass `room`, in which case just low enough to
  fit, but never past the bubble's edge of the window (0).
- `maxHeight: room`: a menu taller than the whole window is held to that height, and scrolls (the
  menus also set `overflowY: 'auto'`).

## `src/renderer/src/views/BubbleView.tsx`: the character's page

The page shown in the small bubble window: one button filling the window, with the character
drawn inside it (`Character`, see [The UI components](8-renderer-components.md)). A click asks the
main process what to do; pressing and moving drags the character. What the character is doing
(its pose) comes from the main process too, but for her first moment: as the app starts, the page
shows her forming out of white motes. The page used to show the tenant's logo in a round
button; the logo is now only the tray icon and the `.exe` icon.

### `ACTION_LABEL`, `DRAG_THRESHOLD`

<!-- code: apps/desktop/src/renderer/src/views/BubbleView.tsx#ACTION_LABEL,DRAG_THRESHOLD -->

[`src/renderer/src/views/BubbleView.tsx`, lines 8–17](../../apps/desktop/src/renderer/src/views/BubbleView.tsx#L8-L17)

```tsx
const ACTION_LABEL: Record<Mode, string> = {
  collapsed: 'Open',
  expanded: 'Close',
  dragging: 'Moving',
  returning: 'Returning',
  capturing: 'Taking screenshot',
}

/** Moving the pointer further than this while pressed turns a click into a drag. */
const DRAG_THRESHOLD = 5
```

<!-- /code -->

- `Record<Mode, string>`: a label for every `Mode` (src/shared/types.ts). TypeScript reports an
  error if a mode is ever added without one. The label becomes the button's accessible name for
  screen readers, such as "Open Desktop Wizard".
- `DRAG_THRESHOLD = 5`: a press that moves no more than 5 pixels is still a click, so a slightly
  shaky click doesn't start a drag.
- `ARRIVAL_WAIT_MS = 4000`: as its comment says, how long she waits for word that her window is
  showing before she's just there (see `arrival`, below).

### `<BubbleView>`

<!-- code: apps/desktop/src/renderer/src/views/BubbleView.tsx#BubbleView -->

[`src/renderer/src/views/BubbleView.tsx`, lines 22–189](../../apps/desktop/src/renderer/src/views/BubbleView.tsx#L22-L189)

```tsx
/**
 * The always-on-top character (the "bubble"), filling its small window. A click goes to the main
 * process, which decides what it means. Press and move to drag it: the main process makes it
 * follow the mouse, and on release it falls onto the taskbar. What it's doing (its pose) comes
 * from the main process too; Character animates it.
 */
export function BubbleView() {
  // No useClickThrough here: the bubble window always takes the mouse (see bubble/windows.ts).
  const state = useAssistState()
  useAccentColor(state?.branding.accentColor)
  useRobeColor(state?.settings.robeColor)
  const mode = state?.mode ?? 'collapsed'
  const appName = state?.branding.appName ?? 'Desktop Wizard'
  // Her window, as big as she is (with room above her hat); she faces the middle of the screen,
  // away from her corner.
  const { box, headroom } = bubbleMetrics(state?.size.scale ?? DEFAULT_SIZE)
  const corner = state?.corner ?? 'bottom-right'

  // As the app starts, she forms out of white motes (her `appear` pose) before doing as she's told.
  // Her window is shown a little after this page is ready (once the panel's is too), so she waits
  // for word that it's showing, and until then isn't drawn at all, so she never flashes up whole
  // first. Without the word (the page reloaded, say), she's just there after a few seconds.
  const [arrival, setArrival] = useState<'waiting' | 'arriving' | 'here'>('waiting')
  useEffect(() => {
    let timer = setTimeout(() => setArrival('here'), ARRIVAL_WAIT_MS)
    const stop = window.assist.onArrive(() => {
      clearTimeout(timer)
      setArrival('arriving')
      timer = setTimeout(() => setArrival('here'), SPELL_POSE_MS.appear)
    })
    return () => {
      stop()
      clearTimeout(timer)
    }
  }, [])

  // Whether the main mouse button is down, as the latest pointer event anywhere in the window
  // says. While she's carried, a button found up means the release went missing (a busy PC can
  // lose it): she's let go at once. And every so often the main process is told it's still down;
  // without that word it lets her go itself (DRAG_CHECK), so she never stays stuck to the pointer.
  const held = useRef(false)
  const carried = useRef(false)
  useEffect(() => {
    carried.current = mode === 'dragging'
    if (!carried.current) return
    const timer = setInterval(() => {
      if (held.current) window.assist.bubbleDragHold()
      else window.assist.bubbleDragEnd()
    }, DRAG_CHECK.everyMs)
    return () => clearInterval(timer)
  }, [mode])
  useEffect(() => {
    const track = (event: globalThis.PointerEvent) => {
      held.current = event.type !== 'pointercancel' && (event.buttons & 1) === 1
      if (!held.current && carried.current) window.assist.bubbleDragEnd()
    }
    const kinds = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const
    for (const kind of kinds) window.addEventListener(kind, track, true)
    return () => {
      for (const kind of kinds) window.removeEventListener(kind, track, true)
    }
  }, [])

  // Behind a window (peeking round it): the part of her it covers is hidden, kept up to date
  // every frame as her window moves.
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    let frame = 0
    let occluder: { x: number; y: number; width: number; height: number } | null = null
    const clip = () => {
      const element = button.current
      if (!element) return
      if (!occluder) {
        element.style.clipPath = ''
        return
      }
      const { width, height } = element.getBoundingClientRect()
      const x = occluder.x - window.screenX
      const y = occluder.y - window.screenY
      const hole = `M${x} ${y} H${x + occluder.width} V${y + occluder.height} H${x} Z`
      element.style.clipPath = `path(evenodd, "M0 0 H${width} V${height} H0 Z ${hole}")`
      frame = requestAnimationFrame(clip)
    }
    const stop = window.assist.onOcclude((rect) => {
      occluder = rect
      cancelAnimationFrame(frame)
      clip()
    })
    return () => {
      stop()
      cancelAnimationFrame(frame)
    }
  }, [])

  // Which way she looks while she watches the pointer (the main process says, as it moves).
  const [gaze, setGaze] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => window.assist.onGaze(setGaze), [])

  const press = useRef<{ x: number; y: number; dragging: boolean } | null>(null)
  // When the button last went down: the main process uses it to tell whether this press is what
  // closed the panel (see BubbleController.clickBubble).
  const pressedAt = useRef<number | undefined>(undefined)
  // A drag ends with a click event on the bubble; this stops it counting as a click.
  const swallowClick = useRef(false)

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    swallowClick.current = false
    pressedAt.current = Date.now()
    event.currentTarget.setPointerCapture(event.pointerId)
    press.current = { x: event.screenX, y: event.screenY, dragging: false }
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = press.current
    if (!current || current.dragging) return
    // Screen coordinates, because the window itself moves once the drag starts.
    if (Math.hypot(event.screenX - current.x, event.screenY - current.y) > DRAG_THRESHOLD) {
      current.dragging = true
      window.assist.bubbleDragStart()
    }
  }

  function endPress() {
    const current = press.current
    press.current = null
    if (current?.dragging) {
      swallowClick.current = true
      window.assist.bubbleDragEnd()
    }
  }

  return (
    <button
      ref={button}
      data-hit
      type="button"
      aria-label={`${ACTION_LABEL[mode]} ${appName}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPress}
      onLostPointerCapture={endPress}
      onClick={(event) => {
        if (swallowClick.current) swallowClick.current = false
        // The second click of a double-click pets her, and only that: the first one opened or
        // closed the panel.
        else if (event.detail >= 2) window.assist.bubblePet()
        // A click from the keyboard has no press: it's "now".
        else window.assist.bubbleClick(pressedAt.current ?? Date.now())
        pressedAt.current = undefined
      }}
      style={{ width: box, height: box + headroom }}
      // No focus outline: clicking her focuses the button, and Chromium can count that as
      // keyboard focus and draw the accent-coloured ring round her window.
      className="block cursor-grab outline-none focus-visible:outline-none active:cursor-grabbing"
    >
      {arrival !== 'waiting' && (
        <Character
          pose={arrival === 'arriving' ? 'appear' : (state?.pose ?? 'idle')}
          facing={isLeftCorner(corner) ? 'right' : 'left'}
          box={box}
          expanded={mode === 'expanded'}
          gaze={gaze}
        />
      )}
    </button>
  )
}
```

<!-- /code -->

The bubble itself. It decides nothing on its own: clicks and drags are sent to `BubbleController`
in the main process, which owns the character's mode, pose and position. In JSX, attributes are
_props_, the inputs a component receives. On built-in elements like `<button>` they become HTML
attributes and event handlers (`onClick`, `onPointerDown`); on our own components they arrive as
the function's argument (see `Panel` below).

- `const state = useAssistState()`: the bubble needs only the mode (for its label and the
  character's shadow), the pose, the corner (which way the character faces), her size and the
  branding. Until the state arrives, it falls back to `'collapsed'`, `'idle'`, `'bottom-right'`,
  her usual size and `'Desktop Wizard'`.
- `useAccentColor(state?.branding.accentColor)`: `?.` because `state` is `null` at first.
- `const { box, headroom } = bubbleMetrics(state?.size.scale ?? DEFAULT_SIZE)`: as the comment
  says, her window, as big as she is, with room above her hat. `bubbleMetrics()`
  (src/shared/geometry.ts) gives the bubble's measurements at a size; `box` is its window's width,
  96 DIPs at her usual size (`DEFAULT_SIZE`, 1), twice that at size 2, and so on, and `headroom`
  the room above for her hat when she rises off the taskbar (8 DIPs at her usual size), so the
  window is `box + headroom` tall. The main process sizes the window with the same function, so
  the page and the window agree.
- `const corner = state?.corner ?? 'bottom-right'`: the bottom corner she lives near, used below to
  face her away from it.
- `const [arrival, setArrival] = useState<'waiting' | 'arriving' | 'here'>('waiting')`: as the
  comment says, as the app starts she forms out of white motes (her `appear` pose) before doing as
  she's told. Her window is only shown once both pages are ready (`await windowsReady` in
  `src/main/index.ts`), a little after this one is, so timing her arrival from when this page
  loads would lose some of it. So she's `waiting` (not drawn at all, so she never flashes up whole
  first), then `arriving` for `SPELL_POSE_MS.appear` (0.9 seconds) once the main process says her
  window is showing, then `here`.
- `useEffect(() => { ... }, [])`: an effect with an empty list of dependencies runs once, after
  the first render.
  - `let timer = setTimeout(() => setArrival('here'), ARRIVAL_WAIT_MS)`: in case the word never
    comes (the page reloaded after a crash, with her window already showing), she's simply there
    after four seconds.
  - `window.assist.onArrive(...)`: the word, sent once, just after the main process shows her
    window (`IPC.bubbleArrive`). It cancels that timer, starts her arrival, and sets a timer to
    end it when her `appear` pose is done.
  - The cleanup stops listening and clears whichever timer is set, if the page goes first (and in
    `npm run dev`, where `StrictMode` runs the effect twice).
- `const press = useRef<{ x: number; y: number; dragging: boolean } | null>(null)`: `useRef` gives
  a box (`.current`) that keeps its contents between renders, but unlike state, changing it doesn't
  re-render. It suits values that only event handlers need: here, where the press started and
  whether it has become a drag.
- `const pressedAt = useRef<number | undefined>(undefined)`: when the mouse button last went down
  on the bubble. As the comment says, the main process uses it to tell whether this press is what
  closed the panel (see `BubbleController.clickBubble` in [The bubble](5-bubble.md)).
- `const swallowClick = useRef(false)`: releasing after a drag still fires a `click` on the
  button. This flag makes that one click be ignored.
- `if (event.button !== 0) return`: only the main (left) mouse button.
- `pressedAt.current = Date.now()`: the press time, on the wall clock the main process uses too.
- `event.currentTarget.setPointerCapture(event.pointerId)`: sends all further events from this
  pointer to the button, even when the pointer is outside it, until it's released. The window is
  small (96 by 104 DIPs at her usual size) and gets moved during a drag, so without this the
  release could be lost.
- `if (!current || current.dragging) return`: only needed until the drag starts. From then on the
  main process moves the window with the mouse itself (`BubbleController.startDrag`), so the page
  just waits for the release.
- `Math.hypot(event.screenX - current.x, event.screenY - current.y) > DRAG_THRESHOLD`: the distance
  moved since the press, in screen coordinates, because the window itself moves once the drag
  starts.
- `window.assist.bubbleDragStart()`: tells the main process to start following the mouse.
- `function endPress() {`: runs on release. If the press had become a drag, it arms
  `swallowClick` and calls `bubbleDragEnd()`, and `BubbleController.endDrag` drops the character
  onto the taskbar. If it was a plain click, it does nothing and the `click` event that follows
  handles it.
- `onLostPointerCapture={endPress}`: capture can also end without a release (the system can take
  it away), so this ends the press too. After a normal release both events fire; the second call
  finds `press.current` already `null` and does nothing.
- `onClick={() => {`: a real click calls `bubbleClick()`, and `BubbleController.clickBubble`
  decides what it means: open or close the panel, or nothing while she's falling or a screenshot
  is being taken.
- `window.assist.bubbleClick(pressedAt.current ?? Date.now())`: the click goes with its press
  time. As the comment says, a click from the keyboard (Enter or Space on the focused button) has
  no press, so it's "now". `pressedAt.current = undefined` then forgets it, so it can't be
  reused by a later keyboard click.
- There's no `title`, so nothing pops up when the pointer rests on the bubble. The `aria-label`
  still names it for screen readers.
- `data-hit`: the marker `useClickThrough` looks for. The bubble window doesn't use click-through,
  so here it has no effect.
- `ACTION_LABEL[mode]`: the `aria-label` reads, for example, "Close Desktop Wizard" while the panel
  is open.
- `style={{ width: box, height: box + headroom }}`: the whole window, `box` wide and
  `box + headroom` tall (see above). The character is drawn across the whole window, headroom and
  all, so the button covers all of it and a press anywhere on the window reaches it.
- `block`: lays the button out as a box of its own rather than inline like a word of text, so
  nothing adds space around it in the small window.
- `cursor-grab`, `active:cursor-grabbing`: an open hand over the character, and a closed one while
  the button is held, a hint that it can be picked up.
- `outline-none focus-visible:outline-none`: no focus outline round her. As the comment above
  the class says, clicking her focuses the button, and Chromium can count that as keyboard focus
  (`:focus-visible`), so the accent-coloured outline `styles.css` gives keyboard focus appeared
  round her window every time she was clicked. `focus-visible:outline-none` is a utility, in
  Tailwind's `utilities` layer, so it wins over that rule, which is in the `base` layer. The
  bubble is a single control in a window of its own, so it needs no ring to show where focus is.
- `arrival !== 'waiting' && (<Character ... />)`: no figure at all while she's waiting for her
  window to show.
- `<Character`: the figure, in the `pose` the main process chose (standing until the state
  arrives). `arrival === 'arriving' ? 'appear' : ...` puts that off for her first 0.9 seconds,
  while she appears.
  - `facing={isLeftCorner(corner) ? 'right' : 'left'}`: as the comment above says, she faces the
    middle of the screen, away from her corner: right from the bottom-left corner, left from the
    bottom-right one (until the state arrives, left, from the default corner). Walking, she faces
    the way she walks instead (`framesOf()` in `character/sprite.ts` sees to that).
  - `box={box}`: how big to draw her: the window's width. `Character` works out her height from
    it, headroom and all, so she fills the window.
  - `expanded` turns her shadow the accent colour while the panel is open, as the logo's accent
    ring used to.
  - All the drawing and animation is in `Character` and the code it draws her with
    (`src/renderer/src/character/`); this page only passes the pose, the way she faces and her size
    on.

## `src/renderer/src/views/ClonesView.tsx`: her clones

The page shown in the clones' window, which the main process opens for her Clones spell (see
`Clones` in [The bubble](5-bubble.md)). The window is a strip as wide as her screen and as tall as her window, its bottom edge on the taskbar, and it never takes the
mouse or the focus: clicks go straight through it, and the clones have no panel. Like the vision's
page, and unlike the bubble's and the panel's, it never asks the main process for the app state: everything it needs comes in its query
string, and once the window closes it's gone.

### `<ClonesView>`

<!-- code: apps/desktop/src/renderer/src/views/ClonesView.tsx#ClonesView -->

[`src/renderer/src/views/ClonesView.tsx`, lines 8–101](../../apps/desktop/src/renderer/src/views/ClonesView.tsx#L8-L101)

```tsx
/**
 * Her clones (the Clones spell), in a see-through window along the taskbar that never takes the
 * mouse: CLONES.count of her, at her size, setting off from where she stands and wandering up and
 * down (see lib/clones.ts), each stopping now and then. They fade in, and fade out just before
 * the main process closes the window. Everything they need comes in the query string: where she
 * stands (`from`), her size (`scale`), the accent colour, and when they end (`ends`, Date.now()).
 */
export function ClonesView() {
  const [params] = useState(() => new URLSearchParams(window.location.search))
  const scale = snapSize(Number(params.get('scale')) || DEFAULT_SIZE)
  const { box } = bubbleMetrics(scale)
  useAccentColor(params.get('accent') ?? undefined)
  useRobeColor(params.get('robe'))

  // With Windows' reduced-motion setting they stand still, spread along the taskbar.
  const [still] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [clones, setClones] = useState<Clone[]>(() => {
    const room = { width: window.innerWidth, box, scale }
    const spawned = spawnClones(
      CLONES.count,
      Number(params.get('from')) || 0,
      performance.now(),
      room,
      Math.random,
    )
    if (!still) return spawned
    const far = Math.max(0, room.width - box)
    return spawned.map((clone, i) => ({ ...clone, x: (far * (i + 0.5)) / spawned.length }))
  })
  const [visible, setVisible] = useState(false)
  const boxes = useRef<(HTMLDivElement | null)[]>([])

  // Each frame, move them (straight in the page, not through React) and redraw only when one of
  // them starts or stops walking.
  useEffect(() => {
    if (still) return
    let current = clones
    let last = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const room: Room = { width: window.innerWidth, box, scale }
      const next = current.map((clone) => stepClone(clone, now, now - last, room, Math.random))
      last = now
      next.forEach((clone, i) => {
        const element = boxes.current[i]
        if (element) element.style.transform = `translateX(${Math.round(clone.x)}px)`
      })
      if (
        next.some(
          (clone, i) =>
            clonePose(clone) !== clonePose(current[i]!) || clone.facing !== current[i]!.facing,
        )
      ) {
        setClones(next)
      }
      current = next
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
    // Started once: the loop keeps its own copy of where they are.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // In, and out again just before their time is up.
  useEffect(() => {
    const show = requestAnimationFrame(() => setVisible(true))
    const ends = Number(params.get('ends')) || Date.now() + CLONES.durationMs
    const hide = setTimeout(() => setVisible(false), ends - CLONES.fadeMs - Date.now())
    return () => {
      cancelAnimationFrame(show)
      clearTimeout(hide)
    }
  }, [params])

  return (
    <div
      aria-hidden
      className="relative h-full w-full overflow-hidden"
      style={{ opacity: visible ? 1 : 0, transition: `opacity ${CLONES.fadeMs}ms ease-out` }}
    >
      {clones.map((clone, i) => (
        <div
          key={i}
          ref={(element) => {
            boxes.current[i] = element
          }}
          className="absolute bottom-0 left-0"
          style={{ transform: `translateX(${Math.round(clone.x)}px)` }}
        >
          <Character pose={clonePose(clone)} facing={clone.facing} box={box} />
        </div>
      ))}
    </div>
  )
}
```

<!-- /code -->

As the comment says, `CLONES.count` (10) of her, at her size, set off from where she stands and
wander up and down (with `lib/clones.ts`), each stopping now and then. They fade in, and fade out
just before the main process closes the window, `CLONES.durationMs` (30 seconds) after it opened
it. `CLONES` is in `src/shared/character.ts`, so the main process and the page use the same
numbers. With Windows' reduced-motion setting (`still`, asked once with `matchMedia`, as
`Character` does), they don't walk: they stand evenly spread along the taskbar (`far` is as far
right as a clone can stand, and clone `i` stands `(i + 0.5) / 10` of the way along), and the
loop that moves them never starts.

Reading the query string:

- `const [params] = useState(() => new URLSearchParams(window.location.search))`: reads the query
  string once, when the page starts. The function form of `useState` runs only the first time, and
  only the value is kept (there's no setter, since it never changes).
- `const scale = snapSize(Number(params.get('scale')) || DEFAULT_SIZE)`: her size, as the main
  process sent it (her usual size if it's missing), snapped to one of `CHARACTER_SIZES`
  (src/shared/geometry.ts), so the page draws only sizes she really comes in.
- `const { box } = bubbleMetrics(scale)`: a clone's box: the width of her window at that size (96
  DIPs at her usual size), the same as `BubbleView` uses. `Character` adds the headroom above it,
  and the strip is as tall as her window, so a clone's hat has the same room as hers.
- `useAccentColor(params.get('accent') ?? undefined)`: the tenant's accent colour, for the clones'
  robes and hats, from the query string rather than the app state. `params.get()` gives `null`
  when there's none, and `?? undefined` turns that into what `useAccentColor` expects.

State:

- `useState<Clone[]>(() => spawnClones(...))`: the clones, made once: `CLONES.count` of them,
  standing at `from` (where she stands, in DIPs from the window's left edge; `|| 0` uses 0 if it's
  missing or not a number), at the page's clock (`performance.now()`), in a room as wide as the
  window (`window.innerWidth`), with `Math.random` for the random numbers.
- `const [visible, setVisible] = useState(false)`: whether they're showing, for the fades.
- `const boxes = useRef<(HTMLDivElement | null)[]>([])`: each clone's element, so the frame loop
  can move it directly.

Effects:

- The first effect is the frame loop. As its comment says, each frame it moves the clones straight
  in the page, not through React, and only asks React to draw again when one of them starts or
  stops walking (or waving, or turns round).
  - `let current = clones`: the loop keeps its own copy of where they are, so it doesn't depend on
    React's state, which only catches up at those moments.
  - `requestAnimationFrame(function tick(now) {`: the browser calls `tick` just before it next
    paints, about 60 times a second, passing the time on the same clock as `performance.now()`.
    `tick` asks for the next frame at its end, so it keeps going until the cleanup cancels it.
  - `const room: Room = { width: window.innerWidth, box, scale }`: read every frame, in case the
    window's width changed.
  - `current.map((clone) => stepClone(clone, now, now - last, room, Math.random))`: every clone a
    frame later (`now - last` is how long the frame took).
  - ``element.style.transform = `translateX(${Math.round(clone.x)}px)` ``: moves each clone's box
    to its new place across the window, in whole pixels so the pixel art stays sharp. Changing the
    element's style directly skips React, which would otherwise draw all ten `Character`s again
    sixty times a second.
  - `if (next.some(...)) { setClones(next) }`: when any clone's pose (`clonePose()`: standing,
    waving or walking) or way of facing changed, the new list goes into React's state, and React draws those
    clones with their new pose. `current[i]!` tells TypeScript the clone at the same place in the
    old list is there.
  - `return () => cancelAnimationFrame(frame)`: the cleanup stops the loop.
  - `// eslint-disable-next-line react-hooks/exhaustive-deps`: the lint rule would want `clones`,
    `box` and `scale` in the list. As the comment says, the loop is started once on purpose and
    keeps its own copy of where they are; `box` and `scale` never change.
- The second effect fades them, as its comment says: in, and out again just before their time is
  up.
  - `requestAnimationFrame(() => setVisible(true))`: on the next frame, after the page has been
    drawn once with them see-through, so the change of opacity is animated (the fade in).
  - `const ends = Number(params.get('ends')) || Date.now() + CLONES.durationMs`: when their time is
    up, on the wall clock (`Date.now()`), which the main process and the page share. If it's
    missing, thirty seconds from now.
  - `setTimeout(() => setVisible(false), ends - CLONES.fadeMs - Date.now())`: starts the fade out
    `CLONES.fadeMs` (400 ms) before the end, so it has finished as the main process closes the
    window.
  - The cleanup cancels both, if the page goes first.

The JSX it returns:

- `aria-hidden`: the clones are only for show, so screen readers skip them.
- `className="relative h-full w-full overflow-hidden"`: fills the window, as the box the clones are
  placed in, cutting off anything that would stick out.
- `style={{ opacity: visible ? 1 : 0, transition: ... }}`: the fades: a CSS transition of the
  opacity over `CLONES.fadeMs`, easing out.
- `{clones.map((clone, i) => (`: one box per clone. `key={i}` keeps each clone's element the same
  from one render to the next (the list never changes length or order).
- `ref={(element) => { boxes.current[i] = element }}`: React calls this with the element once it's
  on the page (and with `null` when it goes), which is how the frame loop finds it. The braces make
  the function return nothing; React would take a returned function as a cleanup.
- `className="absolute bottom-0 left-0"`: each clone's box stands on the window's bottom edge, on
  the taskbar, like her. `style={{ transform: ... }}` places it across the window, where it was at
  the last render; the frame loop moves it on from there.
- `<Character pose={clonePose(clone)} facing={clone.facing} box={box} />`: each clone is drawn with
  the same component as her, in its own pose, the way it faces, and at her size. There's no
  `expanded`, so its shadow is never tinted.

## `src/renderer/src/views/VisionView.tsx`: her vision

The page shown in the vision's window, which the main process opens while she has her `vision`
habit (see `Vision` in [The bubble](5-bubble.md)). The window is a column over her, from the top of
the screen down to her feet, behind her own window, and it never takes the mouse or the focus. In
it a soft light falls from the top of the screen onto her, and the company's logo comes down the
light, hovers over her head, and rises away again; meanwhile her own window plays her looking up at
it (`vision()` in `character/sprite.ts`). Both follow the same timetable, `VISION` in
`src/shared/character.ts`. Like the clones' page, it never asks the main process for anything:
what it needs comes in its query string.

### `logos`, `LOGO`

<!-- code: apps/desktop/src/renderer/src/views/VisionView.tsx#logos,LOGO -->

[`src/renderer/src/views/VisionView.tsx`, lines 5–12](../../apps/desktop/src/renderer/src/views/VisionView.tsx#L5-L12)

```tsx
// The tenant's logo, bundled with the page (a PNG, or an SVG if that's all the tenant has).
const logos = import.meta.glob<string>('@tenant/logo.{png,svg}', {
  query: '?url',
  import: 'default',
  eager: true,
})

const LOGO =
  Object.entries(logos).find(([path]) => path.endsWith('.png'))?.[1] ?? Object.values(logos)[0]
```

<!-- /code -->

As the comment says, the tenant's logo, bundled with the page: `logo.png`, or `logo.svg` if that's
all the tenant has (`logo.png` is also the tray icon; see `tenants/README.md`).

- `import.meta.glob<string>('@tenant/logo.{png,svg}', {...})`: a Vite feature. When the page is
  built, Vite finds the files matching the pattern (`@tenant` is the tenant's folder, as in the
  main process) and bundles them; the result is an object from each file's path to what was
  imported from it. `{png,svg}` matches either name.
- `query: '?url'`, `import: 'default'`: import each file as its address in the built app (a string
  the page can put in an `<img>`), rather than its contents.
- `eager: true`: the files are bundled into the page itself, so the object holds the addresses
  straight away, rather than functions that load them later.
- `LOGO`: the PNG's address if there is one, otherwise the first (the SVG), or `undefined` if the
  tenant has neither, in which case the vision has only its light (see `{LOGO && ...}` below).

### `smooth`, `through`

<!-- code: apps/desktop/src/renderer/src/views/VisionView.tsx#smooth,through -->

[`src/renderer/src/views/VisionView.tsx`, lines 14–18](../../apps/desktop/src/renderer/src/views/VisionView.tsx#L14-L18)

```tsx
/** Slow in, slow out (0 to 1). */
const smooth = (t: number) => t * t * (3 - 2 * t)

/** How far through `[from, to]` (ms) `now` is, 0 to 1. */
const through = (now: number, [from, to]: readonly [number, number]) =>
  Math.min(Math.max((now - from) / (to - from), 0), 1)
```

<!-- /code -->

Two small helpers for the animation, both working in fractions from 0 to 1.

- `smooth`: as its comment says, slow in, slow out: `t * t * (3 - 2 * t)` goes from 0 to 1 like
  `t`, but starts and finishes gently (it's often called _smoothstep_).
- `through`: as its comment says, how far through one of `VISION`'s `[from, to]` stretches `now`
  is: 0 before it, 1 after it, and in between in proportion.

### `<VisionView>`

<!-- code: apps/desktop/src/renderer/src/views/VisionView.tsx#VisionView -->

[`src/renderer/src/views/VisionView.tsx`, lines 20–109](../../apps/desktop/src/renderer/src/views/VisionView.tsx#L20-L109)

```tsx
/**
 * Her `vision` habit, above her: a column of soft light falls from the top of the screen to her,
 * and the company's logo comes down it to hover over her head, glowing, then rises away and the
 * light fades (VISION's timetable). The window is a column over her that never takes the mouse;
 * her own window, in front of it, plays her looking up. Everything comes in the query string: her
 * size (`scale`), where her middle is across the window (`centre`) and when the vision started
 * (`starts`, Date.now()), so the page keeps in time with her even if it took a moment to load.
 */
export function VisionView() {
  const [params] = useState(() => new URLSearchParams(window.location.search))
  const scale = snapSize(Number(params.get('scale')) || DEFAULT_SIZE)
  const centre = Number(params.get('centre')) || window.innerWidth / 2
  const starts = Number(params.get('starts')) || Date.now()
  const [now, setNow] = useState(() => Date.now() - starts)
  // With Windows' reduced-motion setting the logo just hovers in its light, as she holds still.
  const [still] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    if (still) return
    let frame = requestAnimationFrame(function tick() {
      setNow(Date.now() - starts)
      if (Date.now() - starts < FIDGET_MS.vision) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [starts, still])

  const { box } = bubbleMetrics(scale)
  const height = window.innerHeight
  const light = still
    ? 1
    : smooth(through(now, VISION.lightIn)) * (1 - smooth(through(now, VISION.lightOut)))
  // The logo: about half her width, hovering just above her hat (4 sprite pixels below the top of
  // her box, `box` up from her feet; her window's headroom is above that), bobbing gently while
  // it's there.
  const size = Math.round(44 * scale)
  const hover = height - box + 4 * scale - 10 * scale - size
  const down = still ? 1 : smooth(through(now, VISION.descend))
  const up = still ? 0 : smooth(through(now, VISION.ascend))
  const bob = Math.sin((now / 900) * Math.PI * 2) * 3 * scale
  const top =
    -size - 20 + (hover + size + 20) * down - (hover + size + 20) * up + bob * down * (1 - up)

  return (
    <div aria-hidden className="relative h-full w-full overflow-hidden">
      {/* The light: narrow at the top of the screen, widening as it falls on her. */}
      <div
        className="absolute top-0"
        style={{
          left: centre,
          width: box * 1.8,
          height: height - 2 * scale,
          transform: 'translateX(-50%)',
          opacity: light,
          clipPath: 'polygon(38% 0, 62% 0, 100% 100%, 0 100%)',
          background:
            'linear-gradient(to bottom, rgb(255 248 220 / 0), rgb(255 248 220 / 0.55) 35%, rgb(255 244 210 / 0.35) 85%, rgb(255 244 210 / 0.1))',
          filter: `blur(${Math.max(2, 3 * scale)}px)`,
        }}
      />
      {/* Where the light lands: a soft glow on the ground under her. */}
      <div
        className="absolute rounded-[50%]"
        style={{
          left: centre,
          bottom: 0,
          width: box * 1.4,
          height: 10 * scale,
          transform: 'translate(-50%, 40%)',
          opacity: light * 0.8,
          background: 'radial-gradient(rgb(255 248 220 / 0.8), rgb(255 248 220 / 0))',
        }}
      />
      {LOGO && (
        <img
          src={LOGO}
          alt=""
          className="absolute"
          style={{
            left: centre,
            top,
            width: size,
            height: size,
            transform: 'translateX(-50%)',
            filter: `drop-shadow(0 0 ${4 * scale}px rgb(255 244 200 / 0.95)) drop-shadow(0 0 ${10 * scale}px rgb(255 240 190 / 0.6))`,
          }}
        />
      )}
    </div>
  )
}
```

<!-- /code -->

As the comment says: the light falls from the top of the screen to her, and the logo comes down it
to hover over her head, glowing, then rises away and the light fades, in `VISION`'s time. Her size,
where her middle is across the window and when the vision started all come in the query string, so
the page keeps in time with her even if it took a moment to load. With Windows' reduced-motion
setting (`still`), nothing moves: the light is on and the logo hovers over her head for as long as
the window is open (`light` 1, `down` 1, `up` 0, and no frames are asked for), as she holds still
herself.

Reading the query string (once, kept in state as in `ClonesView`):

- `scale`: her size, snapped to one of `CHARACTER_SIZES` (her usual size if it's missing).
- `centre`: where her middle is, in DIPs from the window's left edge (`Vision.start()` works it
  out). It's usually the middle of the window, but not when she stands near a corner and the window
  was kept on the screen. Missing, the middle.
- `starts`: when the vision started, on the wall clock (`Date.now()`) the main process and the page
  share. Missing, now.
- `const [now, setNow] = useState(() => Date.now() - starts)`: how far into the vision it is, in
  ms. That's the `now` the timetable is read with.

The effect:

- `requestAnimationFrame(function tick() {`: each frame, `now` is updated, so the page redraws with
  the light and the logo where they should be at that moment.
- `if (Date.now() - starts < FIDGET_MS.vision) frame = requestAnimationFrame(tick)`: it keeps going
  until the habit's 8.6 seconds are up, when the main process closes the window anyway.
- The cleanup cancels the next frame.

Working out the frame:

- `const { box } = bubbleMetrics(scale)`: her window's width, 96 DIPs at her usual size. The
  vision's window ends where hers does, at her feet, so the top of her box and its padding is `box`
  above its bottom. Her window is taller than that by its headroom, but the vision doesn't need it.
- `light`: how bright the light is: fading in over `VISION.lightIn` and out over
  `VISION.lightOut`, eased both ways.
- `size = Math.round(44 * scale)`: the logo's width and height, as the comment says about half her
  width.
- `hover`: where the logo's top is while it hovers. `height - box` is the top of her box, `box` up
  from her feet (her window's headroom is above that, as the comment says), and her hat reaches 4
  sprite pixels below it (4 DIPs at her usual size). The logo's bottom edge hovers 10 sprite pixels
  above her hat, so its top is `size` higher still.
- `down`, `up`: how far it has come down (over `VISION.descend`) and gone back up (over
  `VISION.ascend`), eased.
- `bob`: a gentle bob, up and down by 3 DIPs (times her size), once every 0.9 seconds.
- `top`: the logo's top. It starts out of sight above the window (`-size - 20`), comes down by the
  whole distance to `hover` as `down` goes from 0 to 1, and goes back up by the same as `up` does.
  It bobs only while it's there (`down * (1 - up)` is 0 before it arrives and after it has gone).

The JSX:

- `aria-hidden`: only for show, so screen readers skip it. The outer box fills the window and cuts
  off anything that would stick out (the logo, before it comes down).
- The light: a box down the middle of the window at her `centre` (`translateX(-50%)` centres it
  there), 1.8 times as wide as her window and nearly the whole height, with `light` as its opacity.
  `clipPath: 'polygon(38% 0, 62% 0, 100% 100%, 0 100%)'` cuts it to a narrow beam at the top
  widening to its full width at the bottom, where it falls on her. The background is a warm white
  that's clear at the very top, brightest about a third of the way down and fainter near her, and
  the blur softens its edges.
- Where the light lands: a soft oval glow on the ground, centred under her, 1.4 times as wide as
  her window, pushed partly below the window's bottom edge (`translate(-50%, 40%)`), and a little
  fainter than the light.
- `{LOGO && (`: the logo, only if the tenant has one: an `<img>` of `size` DIPs, centred on her,
  at `top`. `alt=""` marks it as decoration. Two `drop-shadow` filters give it a warm glow, sized
  with her.

## `src/renderer/src/views/SpellView.tsx`: her spells' effects

The page shown in the spells' window, which the main process opens for every spell drawn over the
screen: starfall, fireworks, the thunderstorm, the blizzard, the vortex, the butterflies, the
phoenix and the explosion (see `SpellEffects` in [The bubble](5-bubble.md)). The window covers her
display's work area, behind her own window, and never takes the mouse or the focus. Like the
clones' and the vision's pages, it never asks the main process for anything: what it needs comes
in its query string. Unlike them, it draws on a `<canvas>` rather than with elements: the effects
are pixel art like her, drawn a pixel at a time (`lib/pixels.ts`) by the spell's drawing function,
which `SPELL_ART` in `lib/spellArt.ts` picks (starfall's and the explosion's are in that file, the
rest in `lib/spells/`), from where things are at each moment (all in
[The UI components](8-renderer-components.md)).

### `PIXEL`

<!-- code: apps/desktop/src/renderer/src/views/SpellView.tsx#PIXEL -->

[`src/renderer/src/views/SpellView.tsx`, lines 6–11](../../apps/desktop/src/renderer/src/views/SpellView.tsx#L6-L11)

```tsx
/**
 * How many DIPs one pixel of the effects is, per her size: twice one of her sprite's pixels. Never
 * less than 2 DIPs, though, so at her smallest the explosion isn't drawn a DIP at a time over a
 * whole screen (four times the pixels, every frame).
 */
const PIXEL = 2
```

<!-- /code -->

As the comment says, how many DIPs one pixel of the effects is, per her size: 2, twice one of her
sprite's pixels (which are one DIP each at her usual size: her 96-pixel grid fills her 96-DIP
window). It's multiplied by her size below, so the effects' pixels grow with her, as hers do.

### `<SpellView>`

<!-- code: apps/desktop/src/renderer/src/views/SpellView.tsx#SpellView -->

[`src/renderer/src/views/SpellView.tsx`, lines 13–65](../../apps/desktop/src/renderer/src/views/SpellView.tsx#L13-L65)

```tsx
/**
 * A spell's effects (see SpellEffects in the main process): its window covers her display's work
 * area, never takes the mouse, and closes itself when the spell is over. The query string says
 * which spell, her size, where she stands and how far down her feet are (DIPs), when it was cast
 * (wall-clock ms, so it keeps in time with her) and her accent colour. It draws on a small canvas,
 * a pixel at a time (lib/spellArt.ts), stretched over the window without smoothing, so the effects
 * are pixel art like her, their pixels twice the size of hers.
 */
export function SpellView() {
  const [params] = useState(() => new URLSearchParams(window.location.search))
  const asked = params.get('spell') ?? ''
  const spell: SpellEffect = Object.hasOwn(SPELL_EFFECT_MS, asked)
    ? (asked as SpellEffect)
    : 'starfall'
  const scale = snapSize(Number(params.get('scale')) || DEFAULT_SIZE)
  const accent = /^#[0-9a-f]{6}$/i.test(params.get('accent') ?? '')
    ? params.get('accent')!
    : '#9333ea'
  const canvas = useRef<HTMLCanvasElement>(null)
  // With Windows' reduced-motion setting, nothing moves: the effects just show, still.
  const [still] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const pixel = Math.max(2, PIXEL * scale)
    const w = Math.ceil(window.innerWidth / pixel)
    const h = Math.ceil(window.innerHeight / pixel)
    element.width = w
    element.height = h
    const g = element.getContext('2d')!
    const x = (Number(params.get('x')) || window.innerWidth / 2) / pixel
    const feet = (Number(params.get('feet')) || window.innerHeight) / pixel
    const starts = Number(params.get('starts')) || Date.now()
    const draw = SPELL_ART[spell]
    let frame = requestAnimationFrame(function tick() {
      const t = Date.now() - starts
      g.clearRect(0, 0, w, h)
      draw(g, { t, w, h, x, feet, height: (92 * scale) / pixel, accent, still })
      if (t < SPELL_EFFECT_MS[spell]) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [params, spell, scale, accent, still])

  return (
    <canvas
      ref={canvas}
      aria-hidden
      className="block h-full w-full"
      style={{ imageRendering: 'pixelated' }}
    />
  )
}
```

<!-- /code -->

As the comment says: a spell's effects, in a window over her display's work area that never takes
the mouse and closes itself when the spell is over. Everything comes in the query string. It draws
on a small canvas, a pixel at a time, which the page stretches over the whole window without
smoothing, so the effects are crisp pixel art, their pixels twice the size of hers.

Reading the query string (once, kept in state as in `ClonesView`):

- `asked`, `spell`: the spell asked for (`''` if there's none), if it's one of the spells drawn
  over the screen, and `starfall` for anything else. `Object.hasOwn(SPELL_EFFECT_MS, asked)` checks
  that `SPELL_EFFECT_MS` (`src/shared/spells.ts`) has a property of that name of its own, one for
  each of the eight (unlike `in`, it doesn't count the names every object inherits, such as
  `toString`); after that check, `as SpellEffect` tells TypeScript it's one of them, which it can't
  work out from the check alone.
- `scale`: her size, snapped to one of `CHARACTER_SIZES` (her usual size if it's missing).
- `accent`: the tenant's accent colour, for the magic circles and the vortex, if it's a `#` and
  six hex digits; otherwise a purple (`#9333ea`), so nothing odd in the address reaches the
  drawing.
- `const canvas = useRef<HTMLCanvasElement>(null)`: the `<canvas>` element, once React has made it.
- `still`: as the comment says, with Windows' reduced-motion setting nothing moves: the effects just
  show, still. It's read once, as the page loads.

The effect, which sets up the canvas and draws every frame:

- `const pixel = Math.max(2, PIXEL * scale)`: one of the effects' pixels, in DIPs: 2 at her
  usual size, 4 at twice it. As `PIXEL`'s comment says, never less than 2: at half her size it
  would be 1, and the explosion would be drawn over four times as many pixels every frame.
- `const w = Math.ceil(window.innerWidth / pixel)`, `h`: how many of those pixels fit across and
  down the window (rounded up, so the edges are covered). `element.width` and `element.height` make
  the canvas exactly that many pixels; the CSS classes (`h-full w-full`) stretch it over the whole
  window.
- `const g = element.getContext('2d')!`: the canvas's 2D drawing context, the object everything is
  drawn with. The `!` is because a canvas always has one.
- `x`, `feet`: where she stands across the window and how far down her feet are, from the query
  string, turned from DIPs into the canvas's pixels. Missing, the middle and the bottom.
- `starts`: when the spell was cast, on the wall clock the main process and the page share.
  Missing, now.
- `const draw = SPELL_ART[spell]`: this spell's drawing function, looked up by its name in
  `SPELL_ART` (`lib/spellArt.ts`). Each takes the drawing context and a `Scene`
  (`lib/spellMotion.ts`).
- `requestAnimationFrame(function tick() {`: every frame, `t` is how long it is since the spell was
  cast, the canvas is cleared, and the frame for that moment is drawn from scratch. Nothing is kept
  from one frame to the next, so a slow frame never puts the effects out of step with her chant.
- `draw(g, { t, w, h, x, feet, height: (92 * scale) / pixel, accent, still })`: the `Scene`.
  `height` is how tall she is in the canvas's pixels: her 92 sprite pixels from hat to boots, a DIP
  each at her usual size, times her size, divided by the size of one of the effects' pixels. The
  pillar uses it to start its circles above her hat, and the butterflies and the phoenix to come
  out of her middle.
- `if (t < SPELL_EFFECT_MS[spell]) frame = requestAnimationFrame(tick)`: it keeps going until the
  spell is over, when the main process closes the window anyway.
- `return () => cancelAnimationFrame(frame)`: the cleanup cancels the next frame. With reduced
  motion the frames still come; it's what they draw that holds still (the drawing functions check
  `still`).

The JSX:

- `<canvas ref={canvas} aria-hidden ... />`: only for show, so screen readers skip it. `block`
  stops it sitting on a line of text, which would leave a gap under it.
- `style={{ imageRendering: 'pixelated' }}`: stretched without smoothing, so each of the canvas's
  pixels becomes a crisp square, `pixel` DIPs across, rather than a blur.

## `src/renderer/src/views/ScreenSaverView.tsx`: the screen saver

The page in each of the screen saver's windows, which the main process opens over the whole of
every display, the taskbar too, when the screen saver icon is clicked (see `ScreenSaver` in
[The bubble](5-bubble.md)). The screen fades to white, then a scene fades in out of the white: on
her display, a pixel sunset over rolling hills, with her standing on the nearest, her back to us,
watching it; on the others, shooting stars falling without end. Any movement of the mouse, a click,
a scroll or a key tells the main process the user's back, and then every screen fades back to the
desktop together and she forms again on the taskbar.

Like `SpellView`, it asks the main process for nothing (what it needs comes in its query string)
and draws pixel art on a `<canvas>`, a pixel at a time through a `Painter`. Unlike it, it isn't
click-through: it listens to the mouse and the keyboard, because they're what end it. The scenes
themselves are drawn by `lib/screensaver/` (`scene.ts`, `sunset.ts`, `stars.ts` and `her.ts`; see
[The UI components](8-renderer-components.md)), and her figure is her own sprite seen from behind
(`gazeFrames()` in `character/sprite.ts`).

### `SCENE_HEIGHT` and `DRAW_EVERY_MS`

<!-- code: apps/desktop/src/renderer/src/views/ScreenSaverView.tsx#SCENE_HEIGHT,DRAW_EVERY_MS -->

[`src/renderer/src/views/ScreenSaverView.tsx`, lines 22–25](../../apps/desktop/src/renderer/src/views/ScreenSaverView.tsx#L22-L25)

```tsx
/** About how many pixels high the scenes are, whatever the screen: chunky pixel art. */
const SCENE_HEIGHT = 360

/** The scenes move slowly: they're drawn this often (ms), not every frame. */
const DRAW_EVERY_MS = 50
```

<!-- /code -->

- `SCENE_HEIGHT = 360`: as its comment says, about how many pixels high the scenes are, whatever
  the screen, so they're chunky pixel art: each of their pixels is 3 DIPs on a 1080-DIP-high screen,
  2 on a smaller one. Her sprite is drawn one of its pixels to one of the scene's, so she's about a
  quarter of the screen's height, small on the hill under a big sky.
- `DRAW_EVERY_MS = 50`: as its comment says, the scenes move slowly, so they're drawn 20 times a
  second rather than every frame (60 or more), which keeps a big screen's worth of pixels from
  keeping the PC busy for nothing.

### `<ScreenSaverView>`

<!-- code: apps/desktop/src/renderer/src/views/ScreenSaverView.tsx#ScreenSaverView -->

[`src/renderer/src/views/ScreenSaverView.tsx`, lines 27–145](../../apps/desktop/src/renderer/src/views/ScreenSaverView.tsx#L27-L145)

```tsx
/**
 * One of the screen saver's windows (see ScreenSaver in the main process), over the whole of a
 * display, the taskbar too. The query string says which scene (her sunset, or the starfall), when
 * it started (wall-clock ms, so every screen keeps in time) and her accent colour. The screen fades
 * to white, then the scene fades in out of the white: drawn on a small canvas, a pixel at a time,
 * stretched over the window without smoothing. Moving the mouse, clicking, scrolling or pressing a
 * key tells the main process the user's back; then the whole thing fades away (onScreensaverEnd),
 * back to the desktop, and the window closes. The fades are drawn frame by frame with the scene. The pointer's hidden over it.
 */
export function ScreenSaverView() {
  const [params] = useState(() => new URLSearchParams(window.location.search))
  const scene: SaverScene = params.get('scene') === 'sunset' ? 'sunset' : 'stars'
  const [starts] = useState(() => Number(params.get('starts')) || Date.now())
  const accent = /^#[0-9a-f]{6}$/i.test(params.get('accent') ?? '')
    ? params.get('accent')!
    : '#9333ea'
  useAccentColor(accent)
  // Her robe's colour, if one's chosen in Settings (before her colours are read, below).
  useRobeColor(params.get('robe'))
  // With Windows' reduced-motion setting, the scene stays still (the fades still happen).
  const [still] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  /** When the main process said it's ending (wall-clock ms), or null: it fades away from then. */
  const endedAt = useRef<number | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const veil = useRef<HTMLDivElement>(null)

  // The user's back: the mouse moving (more than a nudge), a click, a scroll, a key, or another
  // window taking the focus. Said once.
  useEffect(() => {
    let woken = false
    let from: { x: number; y: number } | null = null
    const opened = Date.now()
    const wake = () => {
      if (woken) return
      woken = true
      window.assist.screensaver.wake()
    }
    // Where the pointer is in the window (which never moves): how far it's gone from where it was.
    const onMove = (event: MouseEvent) => {
      from ??= { x: event.clientX, y: event.clientY }
      if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > SCREEN_SAVER.wakeMove) {
        wake()
      }
    }
    const onBlur = () => {
      if (Date.now() - opened > SCREEN_SAVER.blurGraceMs) wake()
    }
    const wakers = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    window.addEventListener('mousemove', onMove)
    window.addEventListener('blur', onBlur)
    for (const name of wakers) window.addEventListener(name, wake)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('blur', onBlur)
      for (const name of wakers) window.removeEventListener(name, wake)
    }
  }, [])

  useEffect(
    () =>
      window.assist.onScreensaverEnd(() => {
        endedAt.current ??= Date.now()
      }),
    [],
  )

  useEffect(() => {
    const whole = root.current
    const element = canvas.current
    const cover = veil.current
    if (!whole || !element || !cover) return
    const pixel = Math.max(2, Math.round(window.innerHeight / SCENE_HEIGHT))
    const w = Math.ceil(window.innerWidth / pixel)
    const h = Math.ceil(window.innerHeight / pixel)
    element.width = w
    element.height = h
    element.style.width = `${w * pixel}px`
    element.style.height = `${h * pixel}px`
    const g = element.getContext('2d')!
    const draw = scene === 'sunset' ? sunsetPainter(g, w, h) : starfallPainter(g, w, h)
    let drawnAt = Number.NEGATIVE_INFINITY
    let frame = requestAnimationFrame(function tick() {
      const now = Date.now()
      const t = now - starts
      // White over the desktop, then the scene out of the white.
      const { whiteMs, sceneMs } = SCREEN_SAVER
      const clearing = Math.min(1, Math.max(0, (t - whiteMs) / sceneMs))
      cover.style.opacity = String(
        t < whiteMs ? t / whiteMs : 1 - clearing * clearing * (3 - 2 * clearing),
      )
      element.style.visibility = t < whiteMs ? 'hidden' : 'visible'
      // Ending: all of it fades away, back to the desktop.
      if (endedAt.current !== null) {
        const gone = Math.min(1, (now - endedAt.current) / SCREEN_SAVER.fadeOutMs)
        whole.style.opacity = String(1 - gone * gone)
      }
      const due = still ? drawnAt < 0 : now - drawnAt >= DRAW_EVERY_MS
      if (t >= whiteMs && due) {
        drawnAt = now
        draw(still ? 0 : t - whiteMs)
      }
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [scene, starts, still])

  return (
    <div ref={root} className="fixed inset-0 overflow-hidden" style={{ cursor: 'none' }}>
      <canvas
        ref={canvas}
        aria-hidden
        className="absolute top-0 left-0"
        style={{ imageRendering: 'pixelated', visibility: 'hidden' }}
      />
      <div ref={veil} className="absolute inset-0 bg-white" style={{ opacity: 0 }} />
    </div>
  )
}
```

<!-- /code -->

As the comment says: the screen fades to white, then the scene fades in out of the white, drawn on
a small canvas and stretched over the window without smoothing. Input tells the main process the
user's back; then it all fades away (`onScreensaverEnd`), and the window closes. The pointer is
hidden over it.

Reading the query string (once, kept in state as in `SpellView`):

- `scene`: `'sunset'` only if the query says exactly that; anything else gets the stars.
- `starts`: when the screen saver started, on the wall clock the main process and every window
  share, so every screen whitens and clears together even if one page loaded a moment later.
  Missing, now.
- `accent`, `useAccentColor(accent)`: the tenant's accent colour, if it's a `#` and six hex digits
  (otherwise a purple), set on the page as the other pages do. Her robe and hat are mixed from it
  in `character.css`, which `herColours()` (below) reads her colours from; that's why the file
  imports `character.css`.
- `still`: as the comment says, with Windows' reduced-motion setting the scene stays still; the
  fades still happen, as they're what show it starting and ending.
- `ending`: set when the main process says it's ending, which fades the whole page out.
- `canvas`, `veil`: the `<canvas>` and the white `<div>` over it, once React has made them.

The first effect, as its comment says, listens for the user being back, and says so once:

- `woken`: so `window.assist.screensaver.wake()` is sent only once, however busy the mouse.
- `onMove`: the mouse moving wakes it only once it has gone more than `SCREEN_SAVER.wakeMove` (6
  DIPs) from where it was first seen. `from ??= ...` keeps the first position (`??=` assigns only
  when it's still `null`). Measuring from there, rather than waking on any `mousemove`, means the
  event Windows sends as the window appears under a still pointer doesn't end it at once, and nor
  does a nudge of the desk. `screenX` and `screenY` are where the pointer is on the screen, and
  `Math.hypot()` the distance between the two points.
- `onBlur`: the window losing the focus (another window coming forward over it) wakes it too, but
  not in its first `blurGraceMs` (a second), while Windows settles which window has the focus.
- `wakers`: a click (`pointerdown`), a key, the mouse wheel or a touch wake it straight away.
  `as const` keeps the names exact, so `addEventListener` knows each one's event type.
- The cleanup removes every listener.

The second effect: `window.assist.onScreensaverEnd(() => setEnding(true))`, the main process saying
it's ending (it says so to every window at once, whichever page woke it). It returns the stop
function, which React uses as the cleanup.

The third effect sets up the canvas and draws:

- `const pixel = Math.max(2, Math.round(window.innerHeight / SCENE_HEIGHT))`: how many DIPs one of
  the scene's pixels is, a whole number, and at least 2.
- `w`, `h`: how many of those pixels it takes to cover the window, rounded up. The canvas is made
  exactly that many pixels, and its CSS size is `w * pixel` by `h * pixel` DIPs, a whole number of
  DIPs per pixel, so every pixel is the same size; the last row and column may run a little past
  the window, which `overflow-hidden` crops.
- `const draw = scene === 'sunset' ? sunsetPainter(g, w, h) : starfallPainter(g, w, h)`: the
  scene's drawing function (below), made once, which paints what never changes up front.
- `requestAnimationFrame(function tick() {`: every frame, `t` is how long it is since the screen
  saver started.
  - `clearing`: how far the scene has come out of the white, from 0 at `whiteMs` to 1 at
    `whiteMs + sceneMs`, kept between 0 and 1.
  - The veil's opacity: for the first `whiteMs` it rises from 0 to 1 over the desktop (the window is
    see-through, so the desktop shows until then), whitening the screen; after that it falls from 1
    to 0, uncovering the scene. `clearing * clearing * (3 - 2 * clearing)` is a _smoothstep_, which
    starts and ends gently, so the scene seems to come out of the white rather than cut in.
  - `element.style.visibility`: the canvas is hidden until the screen is white, so the white fades
    in over the desktop, not over the scene.
  - `due`: whether to draw this frame: every `DRAW_EVERY_MS`, or, with reduced motion, only the
    first time.
  - `draw(still ? 0 : t - whiteMs)`: the scene at its own time, from when it begins to show (or its
    first moment, held still).
- The cleanup cancels the next frame.

The JSX:

- The outer `<div>` covers the window (`fixed inset-0`), with no pointer (`cursor: 'none'`).
  `opacity: ending ? 0 : 1`, with a CSS `transition` of `fadeOutMs`, fades everything away, scene
  and veil together, back to the see-through window and the desktop behind it, in the 0.8 seconds
  before the main process closes the window. `ease-in` starts slowly and finishes quickly.
- `<canvas ... style={{ imageRendering: 'pixelated', visibility: 'hidden' }} />`: stretched
  without smoothing, so each pixel is a crisp square; hidden until the effect shows it. `aria-hidden`
  because it's only for show.
- `<div ref={veil} className="absolute inset-0 bg-white" style={{ opacity: 0 }} />`: the white
  that the screen fades to and the scene comes out of, over the canvas.

### `layer()`, `herColours()` and `frameAt()`

<!-- code: apps/desktop/src/renderer/src/views/ScreenSaverView.tsx#layer,herColours,frameAt -->

[`src/renderer/src/views/ScreenSaverView.tsx`, lines 147–190](../../apps/desktop/src/renderer/src/views/ScreenSaverView.tsx#L147-L190)

```tsx
/** A canvas the size of the scene's, painted once by `paint` (for what never changes). */
function layer(w: number, h: number, paint: (p: Painter) => void): HTMLCanvasElement {
  const element = document.createElement('canvas')
  element.width = w
  element.height = h
  paint(canvasPainter(element.getContext('2d')!))
  return element
}

/**
 * Her colours in the sunset, by palette letter: as the page's styles colour her (her robe and hat
 * from the accent colour), dimmed toward the dusk with the sun behind her.
 */
function herColours(g: CanvasRenderingContext2D): Record<string, string> {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('class', 'character')
  svg.style.position = 'absolute'
  svg.style.visibility = 'hidden'
  document.body.append(svg)
  const colours: Record<string, string> = {}
  for (const [letter, className] of Object.entries(PALETTE)) {
    const path = document.createElementNS(ns, 'path')
    path.setAttribute('class', className)
    svg.append(path)
    // The canvas says any CSS colour back as #rrggbb (or rgba() when see-through).
    g.fillStyle = '#000000'
    g.fillStyle = getComputedStyle(path).fill
    colours[letter] = backlit(String(g.fillStyle))
  }
  svg.remove()
  return colours
}

/** Her frame at `t`, round and round. */
function frameAt(frames: readonly Frame[], t: number): Frame {
  const total = frames.reduce((sum, f) => sum + f.ms, 0)
  let left = t % total
  for (const frame of frames) {
    if (left < frame.ms) return frame
    left -= frame.ms
  }
  return frames[0]!
}
```

<!-- /code -->

- `layer(w, h, paint)`: as its comment says, a canvas the size of the scene's, painted once by
  `paint`, for what never changes (the sky, the hills). It's never put on the page: each frame
  copies it onto the scene's canvas in one step (`drawImage`), far quicker than painting the sky
  again pixel by pixel. `canvasPainter()` (from `lib/spellArt.ts`) makes a `Painter` of it.
- `herColours(g)`: as its comment says, her colours in the sunset, by palette letter, as the
  page's styles colour her (her robe and hat from the accent colour), dimmed toward the dusk with
  the sun behind her. Her colours live in `character.css` as one class per letter, not in code, so
  this asks the browser:
  - It makes a hidden `<svg>` with the `character` class, and in it a `<path>` for each class in
    `PALETTE` (`character/sprite.ts`), then reads each path's computed `fill`.
  - `g.fillStyle = '#000000'`, then `g.fillStyle = getComputedStyle(path).fill`: as the comment
    says, the canvas reads any CSS colour and says it back as `#rrggbb` (or `rgba()` when it's
    see-through, as her shadow is), which `backlit()` can read. Setting black first means a colour
    the canvas can't read comes out black rather than as the previous one.
  - `backlit()` (`lib/screensaver/her.ts`) dims it toward the dusk. Then the `<svg>` is removed.
- `frameAt(frames, t)`: as its comment says, her frame at `t`, round and round: `t % total` is how
  far into the current round, and the loop finds the frame showing then.

### `sunsetPainter()` and `starfallPainter()`

<!-- code: apps/desktop/src/renderer/src/views/ScreenSaverView.tsx#sunsetPainter,starfallPainter -->

[`src/renderer/src/views/ScreenSaverView.tsx`, lines 192–225](../../apps/desktop/src/renderer/src/views/ScreenSaverView.tsx#L192-L225)

```tsx
/** Draws the sunset at `t`: the sky and hills painted once, the rest each time. */
function sunsetPainter(g: CanvasRenderingContext2D, w: number, h: number): (t: number) => void {
  const p = canvasPainter(g)
  const sky = layer(w, h, (q) => paintSunsetSky(q, w, h))
  const hills = layer(w, h, (q) => paintSunsetHills(q, w, h))
  const colours = herColours(g)
  const frames = gazeFrames()
  const spot = herSpot(w, h)
  return (t) => {
    const frame: SaverFrame = { t, w, h }
    g.globalAlpha = 1
    g.drawImage(sky, 0, 0)
    paintEveningStars(p, frame)
    paintSun(p, frame)
    paintClouds(p, frame)
    g.globalAlpha = 1
    g.drawImage(hills, 0, 0)
    paintLife(p, frame)
    // Her feet on the crest: her frame's bottom row (her shadow's) on the row under her soles.
    const rows = frameAt(frames, t).rows
    paintHer(p, rows, spot.x - GRID / 2, spot.feet - (GRID + HEADROOM) + 2, colours, 1)
  }
}

/** Draws the starfall at `t`: the sky and hills painted once, the stars each time. */
function starfallPainter(g: CanvasRenderingContext2D, w: number, h: number): (t: number) => void {
  const p = canvasPainter(g)
  const night = layer(w, h, (q) => paintNight(q, w, h))
  return (t) => {
    g.globalAlpha = 1
    g.drawImage(night, 0, 0)
    paintStarfall(p, { t, w, h })
  }
}
```

<!-- /code -->

Each makes, once, the function that draws its scene at `t`, painting what never changes first.

- `sunsetPainter(g, w, h)`: as its comment says, the sky and hills painted once, the rest each time.
  Her colours, her frames (`gazeFrames()`) and where she stands (`herSpot()`) are worked out once
  too. Each frame it draws, back to front:
  - the sky (`drawImage(sky, 0, 0)`), then the evening stars twinkling in it, the sun and the
    clouds;
  - the hills (`drawImage(hills, 0, 0)`), which cover the bottom of the sun, setting behind the
    farthest of them;
  - the birds and fireflies (`paintLife()`);
  - and her: `paintHer()` with her frame at `t`, centred on her spot (`spot.x - GRID / 2`), and,
    as the comment says, placed so that her frame's bottom row, her shadow's, is on the row under
    her soles (`spot.feet - (GRID + HEADROOM) + 2`: a frame is `GRID + HEADROOM` rows tall). `1`
    says the sun is to her right.
  - `g.globalAlpha = 1` before each `drawImage()`: `canvasPainter()` leaves the opacity of the last
    rectangle it painted, and `drawImage()` would use it.
- `starfallPainter(g, w, h)`: as its comment says, the night sky and the hills painted once, and
  the stars (twinkling and falling, `paintStarfall()`) over them each time.

## `src/renderer/src/views/PanelView.tsx`: everything around the bubble

The page shown in the panel window: the chat card, the action icons, the settings menu and the
spells menu. All the panel's shared state and handlers live in `Panel`; the components it renders
(`ChatBox`, `ActionStack`, `SettingsMenu`, `SpellsMenu`, `SignInPanel`, `Banner`, `AppsList`,
`JiraPage`, `ServiceDeskPage`, `IssueView`) get their data and callbacks from it as props. Those
are covered in [the components part](8-renderer-components.md), except `AppsList`, which is in
[Your apps](10-apps.md), and the Jira and service desk pages, which are in
[The Jira and service desk pages](12-atlassian-pages.md).

The panel works in one of two ways, set by the tenant's `chatApp` (`branding.chatApp`). With the
built-in chat it's a chat with Claude, behind a JumpCloud sign-in. With Claude Desktop it's just
the text box: asking opens the question in the Claude Desktop app (and, with "Send in Claude
automatically" on, sends it there), and there's no sign-in and no conversation in the panel
(`state.auth` is `null` and `state.chat` stays empty). Either way, if the tenant has a portal,
the card can also show the Apps list instead of the text box. Which of the two the panel opens on
is the tenant's `startPage` (`branding.startPage`); the other is behind its icon in the stack:
**Ask Claude** for the text box, **Your apps** for the list. Morse Micro opens on the Apps list.
With an Atlassian site, the bell icon swaps in the Jira page, and with the service desk's request
types, the service desk icon swaps in the service desk page; a Jira issue opens over either (see
[Jira and the service desk](11-atlassian.md)).

### `ASK_ERRORS`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#ASK_ERRORS -->

[`src/renderer/src/views/PanelView.tsx`, lines 33–39](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L33-L39)

```tsx
/** What to say when a question couldn't be handed to Claude Desktop. */
const ASK_ERRORS: Record<Exclude<Extract<AskResult, { ok: false }>['reason'], 'empty'>, string> = {
  'too-long': "That's too long to open in Claude. Shorten it, or paste it into Claude yourself.",
  'not-installed': "Claude Desktop isn't installed on this PC. Ask IT to install it.",
  'missing-screenshot': 'An attached screenshot is missing. Remove it and try again.',
  failed: "Couldn't open Claude Desktop. Try again.",
}
```

<!-- /code -->

The toast for each way handing a question to Claude Desktop can fail (`AskResult` in
`src/shared/types.ts`).

- `Extract<AskResult, { ok: false }>['reason']`: `Extract` picks the failure shape out of
  `AskResult`, and `['reason']` takes the type of its `reason` field: the five reasons.
- `Exclude<..., 'empty'>`: leaves out `empty`, which needs no message (Ask is disabled while the
  box is empty anyway).
- `Record<..., string>`: an object with a message for every remaining reason. If a reason is ever
  added to `AskResult`, this won't compile until it has a message.
- `'not-installed'`: the panel already shows a banner when it opens on a PC without Claude
  Desktop; this toast is for asking anyway.

### `UNINSTALL_ERRORS`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#UNINSTALL_ERRORS -->

[`src/renderer/src/views/PanelView.tsx`, lines 41–46](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L41-L46)

```tsx
/** What to say when Settings → Uninstall couldn't start the uninstaller. */
const UNINSTALL_ERRORS: Record<Extract<UninstallResult, { ok: false }>['reason'], string> = {
  'not-installed': 'Only the installed app can be uninstalled from here.',
  missing: 'The uninstaller is missing. Uninstall from Windows Settings → Apps.',
  failed: "Couldn't start the uninstaller. Uninstall from Windows Settings → Apps.",
}
```

<!-- /code -->

The toast for each way Settings → Uninstall can fail (`UninstallResult`), built the same way as
`ASK_ERRORS`. The two that can happen in an installed copy point to Windows Settings, where the
app can always be uninstalled.

### `View` and `EMPTY_FEED`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#View,EMPTY_FEED -->

[`src/renderer/src/views/PanelView.tsx`, lines 48–56](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L48-L56)

```tsx
/**
 * What the card shows: the text box (`ask`), or a page in its place while that page's icon is on.
 */
type View = StartPage | 'jira' | 'servicedesk'

const EMPTY_FEED: JiraFeed = {
  notifications: { status: 'loading', items: [] },
  requests: { status: 'loading', items: [] },
}
```

<!-- /code -->

- `View`: as the comment says, what the card shows: one of the two start pages (`StartPage`: the
  text box or the Apps list), or the Jira page or the service desk page while its icon is on.
- `EMPTY_FEED`: the notifications and requests before the main process has said anything: two
  empty lists, both still loading.

### `<PanelView>`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#PanelView -->

[`src/renderer/src/views/PanelView.tsx`, lines 58–64](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L58-L64)

```tsx
/** Everything that appears around the bubble when it's clicked. */
export function PanelView() {
  useClickThrough()
  const state = useAssistState()
  useAccentColor(state?.branding.accentColor)
  return state ? <Panel state={state} /> : null
}
```

<!-- /code -->

Sets up click-through and the live state, then renders `Panel` once the state has arrived.

- `useClickThrough()`: the panel window is the click-through one (see above).
- `return state ? <Panel state={state} /> : null`: returning `null` renders nothing. `Panel` is
  only created once the state exists because its `useState` calls take their starting values from
  it, and hooks can't be called conditionally. Splitting into two components is the usual way to
  wait for data before those hooks run.
- `state={state}`: passes the state to `Panel` as a prop. Each time `useAssistState` produces a new
  state, `PanelView` re-renders and `Panel` gets the new one.

### `<Panel>`

`Panel` is long, so it's shown whole first, with notes on its state, effects and the JSX it
returns. The sections after it take its values and functions one at a time.

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel -->

[`src/renderer/src/views/PanelView.tsx`, lines 66–596](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L66-L596)

```tsx
function Panel({ state }: { state: AppState }) {
  const open = state.mode === 'expanded'
  const { branding, auth } = state
  // Questions go to the Claude Desktop app instead of the chat in the panel (no sign-in here).
  const inClaudeDesktop = branding.chatApp === 'claude-desktop'

  // The draft is edited here and mirrored to the main process, which saves it.
  const [draft, setDraft] = useState(state.notes.text)
  const [attachments, setAttachments] = useState(state.notes.attachments)
  const [settings, setSettings] = useState(state.settings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [spellsOpen, setSpellsOpen] = useState(false)
  const [asking, setAsking] = useState(false)
  // The card shows the tenant's start page (the text box or the Apps list) when the panel opens,
  // and another page while its icon is on (Ask Claude, Your apps, Jira, the service desk).
  const { startPage, atlassianSite, requestTypes } = branding
  const [view, setView] = useState<View>(startPage)
  const [apps, setApps] = useState<AppsState>({ status: 'loading' })
  const [openingApp, setOpeningApp] = useState<string | null>(null)
  const [atlassian, setAtlassian] = useState<AtlassianState>({ status: 'loading' })
  const [feed, setFeed] = useState<JiraFeed>(EMPTY_FEED)
  /** The Jira issue shown in the card (over whichever page it was opened from), or null. */
  const [issueKey, setIssueKey] = useState<string | null>(null)
  const [serviceDeskTab, setServiceDeskTab] = useState<ServiceDeskTab>('new')
  /** The Jira projects' keys, to only offer real issue keys from the text box. */
  const [projectKeys, setProjectKeys] = useState<string[] | null>(null)
  const [update, setUpdate] = useState<UpdateState>({ status: 'idle' })
  /** Claude Desktop isn't installed, so questions can't be opened in it (checked on opening). */
  const [claudeMissing, setClaudeMissing] = useState(false)
  const [toast, showToast] = useToast()

  useEffect(
    () =>
      window.assist.onModeChanged((mode) => {
        if (mode !== 'expanded') {
          setSettingsOpen(false)
          setSpellsOpen(false)
        }
        // The panel always reopens on the start page (but taking a screenshot isn't closing it).
        if (mode === 'collapsed') {
          setView(startPage)
          setIssueKey(null)
        }
      }),
    [startPage],
  )
  // What's new on the Jira page or the service desk's goes as it's opened, and the rest once the
  // page closes (another page, or the panel closing): it's all been seen.
  const shown = state.mode === 'collapsed' ? null : view
  const lastShown = useRef(shown)
  useEffect(() => {
    const before = lastShown.current
    lastShown.current = shown
    if (before === shown || !atlassianSite) return
    if (before === 'jira') void window.assist.atlassian.markNotificationsRead()
    if (before === 'servicedesk') void window.assist.atlassian.markRequestsRead()
  }, [shown, atlassianSite])
  useEffect(() => window.assist.onAppsState(setApps), [])
  useEffect(() => {
    if (!atlassianSite) return
    const unsubscribe = [
      window.assist.onAtlassianState(setAtlassian),
      window.assist.onJiraFeed(setFeed),
    ]
    void window.assist.atlassian.get().then(setAtlassian)
    void window.assist.atlassian.feed().then(setFeed)
    return () => unsubscribe.forEach((stop) => stop())
  }, [atlassianSite])
  useEffect(() => {
    if (!branding.updates) return
    const unsubscribe = window.assist.onUpdateState(setUpdate)
    void window.assist.updates.get().then(setUpdate)
    return unsubscribe
  }, [branding.updates])
  const atlassianConnected = atlassian.status === 'connected'
  useEffect(() => {
    if (!atlassianConnected) return
    let alive = true
    void window.assist.atlassian.projectKeys().then((keys) => alive && setProjectKeys(keys))
    return () => {
      alive = false
    }
  }, [atlassianConnected])
  // The Apps list is loaded (or remembered) by the main process; ask for it whenever it shows.
  useEffect(() => {
    if (!open || view !== 'apps' || !branding.portalName) return
    let alive = true
    void window.assist.apps.get().then((current) => {
      if (alive) setApps(current)
    })
    return () => {
      alive = false
    }
  }, [open, view, branding.portalName])
  useEffect(() => {
    if (!open || !inClaudeDesktop) return
    let alive = true
    void window.assist.claudeDesktop.isInstalled().then((installed) => {
      if (alive) setClaudeMissing(!installed)
    })
    return () => {
      alive = false
    }
  }, [open, inClaudeDesktop])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (settingsOpen) setSettingsOpen(false)
      else if (spellsOpen) setSpellsOpen(false)
      else if (issueKey) setIssueKey(null)
      else if (view !== startPage) setView(startPage)
      else window.assist.collapse()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [settingsOpen, spellsOpen, issueKey, view, startPage])

  // Not signed in: the chat box shows the sign-in instead of the chat. While a saved sign-in is
  // being renewed, or JumpCloud can't be reached, the chat stays (sending tries JumpCloud again).
  // With Claude Desktop there's no sign-in here at all.
  const signedIn = auth === null || auth.state === 'signed-in' || auth.state === 'offline'
  // `busy` is the built-in chat's reply streaming (the text box then offers Stop). Handing a
  // question to Claude Desktop only takes a moment, so it just holds the button back.
  const busy = state.chat.some((message) => message.status === 'streaming')
  const canSend = signedIn && !busy && !asking && (draft.trim() !== '' || attachments.length > 0)

  async function runAction(id: ActionId) {
    // Any icon but the spells menu's own closes the spells menu (the settings menu's, below).
    if (id !== 'spells') setSpellsOpen(false)
    // With request types, the service desk icon opens a page for them instead of the portal.
    if (id === 'apps' || id === 'ask' || id === 'jira' || (id === 'servicedesk' && requestTypes)) {
      // Swaps the card to that page, or back again: the text box and the Apps list swap with
      // each other, other pages go back to the start page.
      setSettingsOpen(false)
      setIssueKey(null)
      if (id === 'servicedesk') setServiceDeskTab('new')
      const back: View = id === 'apps' ? 'ask' : id === 'ask' ? 'apps' : startPage
      setView(view === id && !issueKey ? back : id)
      return
    }
    if (id === 'spells') {
      setSettingsOpen(false)
      setSpellsOpen(!spellsOpen)
      return
    }
    if (id === 'settings') {
      setSettingsOpen(!settingsOpen)
      // Refresh: "Start with Windows" can also be changed in Windows Settings.
      if (!settingsOpen) setSettings(await window.assist.settings.get())
      return
    }
    setSettingsOpen(false)
    const result = await window.assist.invokeAction(id)
    if (result.message) showToast(result.message, result.ok ? 'info' : 'error')
  }

  function changeDraft(next: string) {
    setDraft(next)
    window.assist.notes.setText(next)
  }

  async function send() {
    if (!canSend) return
    if (inClaudeDesktop) return askInClaudeDesktop()
    const result = await window.assist.chat.send(draft)
    if (result.ok) {
      setDraft(result.notes.text)
      setAttachments(result.notes.attachments)
    } else if (result.reason === 'missing-screenshot') {
      showToast('An attached screenshot is missing. Remove it and try again.', 'error')
    } else if (result.reason === 'signed-out') {
      showToast('Sign in with JumpCloud first.', 'error')
    }
  }

  async function askInClaudeDesktop() {
    setAsking(true)
    const result = await window.assist.claudeDesktop.ask(draft).finally(() => setAsking(false))
    if (result.ok) setClaudeMissing(false)
    else if (result.reason === 'not-installed') setClaudeMissing(true)
    if (result.ok) {
      // The panel has closed and Claude Desktop has opened with the question filled in.
      setDraft(result.notes.text)
      setAttachments(result.notes.attachments)
    } else if (result.reason !== 'empty') {
      showToast(ASK_ERRORS[result.reason], 'error')
    }
  }

  async function toggleFavorite(app: PortalApp, favorite: boolean) {
    setSettings(await window.assist.settings.setFavoriteApp(app.id, favorite))
  }

  async function openApp(app: PortalApp) {
    // The tile spins until the browser is opening (JumpCloud can take a few seconds to give the
    // sign-in link); on success the main process closes the panel.
    setOpeningApp(app.id)
    try {
      if (!(await window.assist.apps.open(app.id))) {
        showToast(`Couldn't open ${app.name}. Try it from the portal.`, 'error')
      }
    } finally {
      setOpeningApp((current) => (current === app.id ? null : current))
    }
  }

  /** Opens a Jira issue in the card if connected to Atlassian, otherwise in the browser. */
  function openIssue(key: string) {
    setSettingsOpen(false)
    if (atlassianConnected) setIssueKey(key)
    else if (atlassianSite) void window.assist.openExternal(browseUrl(atlassianSite, key))
  }

  /** Starts an IT request from what's in the text box. */
  function report() {
    setSettingsOpen(false)
    setIssueKey(null)
    setServiceDeskTab('new')
    setView('servicedesk')
  }

  async function disconnectAtlassian() {
    setSettingsOpen(false)
    setIssueKey(null)
    await window.assist.atlassian.signOut()
    showToast('Disconnected from Atlassian')
  }

  async function attachLatest() {
    const result = await window.assist.notes.attachLatestScreenshot()
    if (result.ok) setAttachments(result.notes.attachments)
    else if (result.reason === 'no-screenshots') {
      showToast('No screenshots yet. Take one with the camera button.', 'error')
    } else showToast('No more screenshots to attach', 'error')
  }

  async function removeAttachment(attachment: Attachment) {
    const notes = await window.assist.notes.removeAttachment(attachment.id)
    setAttachments(notes.attachments)
  }

  async function openAttachment(attachment: Attachment) {
    const opened = await window.assist.screenshots.open(attachment.path)
    if (!opened) showToast("That screenshot can't be found", 'error')
  }

  async function copy(text: string) {
    await window.assist.copyText(text)
    showToast('Copied')
  }

  async function signOut() {
    setSettingsOpen(false)
    await window.assist.auth.signOut()
    showToast('Logged out')
  }

  async function clearText() {
    const notes = await window.assist.notes.clear()
    setDraft(notes.text)
    setAttachments(notes.attachments)
    setSettingsOpen(false)
    showToast('Text box cleared')
  }

  async function uninstall() {
    setSettingsOpen(false)
    const result = await window.assist.uninstall()
    // On success the uninstaller has started and the app is quitting.
    if (!result.ok) showToast(UNINSTALL_ERRORS[result.reason], 'error')
  }

  async function newConversation() {
    await window.assist.chat.newConversation()
    setSettingsOpen(false)
    showToast('Started a new conversation')
  }

  async function setEffort(effort: Effort) {
    setSettings(await window.assist.settings.setEffort(effort))
  }

  async function toggleAutoSend() {
    setSettings(await window.assist.settings.setAutoSend(!settings.autoSend))
  }

  // Clicking anywhere else in the panel closes the settings menu, or the spells menu.
  function closeMenusOnOutsideClick(event: PointerEvent) {
    if (!(event.target instanceof Element)) return
    if (settingsOpen && !event.target.closest('[data-settings-menu], [data-action="settings"]')) {
      setSettingsOpen(false)
    }
    if (spellsOpen && !event.target.closest('[data-spells-menu], [data-action="spells"]')) {
      setSpellsOpen(false)
    }
  }

  async function toggleTheme() {
    setSettings(await window.assist.settings.setTheme(settings.theme === 'dark' ? 'light' : 'dark'))
  }

  const signInPrompt =
    auth?.state === 'unconfigured' ||
    auth?.state === 'signed-out' ||
    auth?.state === 'signing-in' ? (
      <SignInPanel
        open={open}
        status={auth}
        appName={branding.appName}
        onSignIn={() => void window.assist.auth.signIn()}
        onCancel={() => void window.assist.auth.cancel()}
      />
    ) : null

  const banner =
    inClaudeDesktop && claudeMissing ? (
      <Banner
        action={
          <button
            type="button"
            onClick={() => void window.assist.openExternal(CLAUDE_DOWNLOAD_PAGE)}
            className="shrink-0 rounded-md px-1.5 py-0.5 font-medium text-accent hover:bg-zinc-100 dark:text-accent-soft dark:hover:bg-zinc-800"
          >
            Download
          </button>
        }
      >
        Claude Desktop isn't installed on this PC, and {branding.appName} opens your questions in
        it. Ask IT to install it, or download it.
      </Banner>
    ) : auth?.state === 'checking' ? (
      <Banner spinner>Checking your JumpCloud sign-in…</Banner>
    ) : auth?.state === 'offline' ? (
      <Banner
        action={
          <button
            type="button"
            onClick={() => void window.assist.auth.retry()}
            className="rounded-md px-1.5 py-0.5 font-medium text-accent hover:bg-zinc-100 dark:text-accent-soft dark:hover:bg-zinc-800"
          >
            Retry
          </button>
        }
      >
        {auth.message}
      </Banner>
    ) : null

  // Everything sits further out the bigger she is (see panelLayout).
  const scale = state.size.scale
  const layout = panelLayout(scale)
  const settingsIndex = branding.actions.indexOf('settings')
  const spellsIndex = branding.actions.indexOf('spells')
  // Only keys of real projects, once the projects are known.
  const issueKeys = atlassianSite
    ? findIssueKeys(draft).filter(
        (key) =>
          !atlassianConnected ||
          !projectKeys ||
          projectKeys.includes(key.slice(0, key.lastIndexOf('-'))),
      )
    : []
  const unreadNotifications = feed.notifications.items.filter((n) => n.unread).length
  const requestNews = feed.requests.items.filter((r) => r.news).length

  const pageContent =
    view === 'apps' && branding.portalName ? (
      <AppsList
        open={open}
        state={apps}
        appName={branding.appName}
        portalName={branding.portalName}
        favorites={settings.favoriteApps}
        onToggleFavorite={(app, favorite) => void toggleFavorite(app, favorite)}
        onOpenApp={(app) => void openApp(app)}
        openingId={openingApp}
        onOpenPortal={() => void window.assist.apps.openPortal()}
        onSignIn={() => void window.assist.apps.signIn()}
        onCancelSignIn={() => void window.assist.apps.cancelSignIn()}
        onRetry={() => void window.assist.apps.get(true).then(setApps)}
      />
    ) : view === 'jira' && atlassianSite ? (
      <JiraPage
        open={open}
        state={atlassian}
        feed={feed}
        appName={branding.appName}
        site={atlassianSite}
        onOpenIssue={openIssue}
      />
    ) : view === 'servicedesk' && requestTypes ? (
      <ServiceDeskPage
        open={open}
        initialTab={serviceDeskTab}
        requestTypes={requestTypes}
        atlassian={atlassianSite ? atlassian : null}
        feed={feed}
        appName={branding.appName}
        draft={draft}
        attachments={attachments}
        onAttachLatest={() => void attachLatest()}
        onOpenAttachment={(attachment) => void openAttachment(attachment)}
        onRemoveAttachment={(attachment) => void removeAttachment(attachment)}
        onOpenIssue={openIssue}
        showToast={showToast}
      />
    ) : null
  // An issue opens over the page it was opened from, which stays (hidden) so Back finds it as it
  // was: the same tab, search or half-filled form.
  const page =
    issueKey || pageContent ? (
      <>
        {issueKey && (
          <IssueView
            key={issueKey}
            issueKey={issueKey}
            inClaudeDesktop={inClaudeDesktop}
            onBack={() => setIssueKey(null)}
            onAskedInChat={() => {
              setIssueKey(null)
              setView('ask')
            }}
            showToast={showToast}
          />
        )}
        <div hidden={issueKey !== null} className="contents">
          {pageContent}
        </div>
      </>
    ) : null

  return (
    <div
      className={cn('group relative h-full w-full', !open && 'pointer-events-none')}
      data-open={open ? '' : undefined}
      onPointerDown={closeMenusOnOutsideClick}
    >
      <ChatBox
        corner={state.corner}
        layout={layout}
        scale={scale}
        open={open}
        toast={toast}
        inClaudeDesktop={inClaudeDesktop}
        autoSend={settings.autoSend}
        page={page}
        signInPrompt={signInPrompt}
        banner={banner}
        messages={state.chat}
        busy={busy}
        canSend={canSend}
        draft={draft}
        attachments={attachments}
        onDraftChange={changeDraft}
        onSend={() => void send()}
        onStop={() => void window.assist.chat.stop()}
        onRetry={() => void window.assist.chat.retry()}
        onCopy={(text) => void copy(text)}
        onAttachLatest={() => void attachLatest()}
        onOpenAttachment={(attachment) => void openAttachment(attachment)}
        onRemoveAttachment={(attachment) => void removeAttachment(attachment)}
        issueKeys={issueKeys}
        onOpenIssue={openIssue}
        onReport={requestTypes ? report : null}
      />
      <ActionStack
        corner={state.corner}
        layout={layout}
        actions={branding.actions}
        open={open}
        activeId={
          settingsOpen ? 'settings' : spellsOpen ? 'spells' : view !== startPage ? view : null
        }
        pages={requestTypes ? ['servicedesk'] : []}
        dotted={[
          ...(view !== 'ask' && (draft.trim() !== '' || attachments.length > 0)
            ? (['ask'] as const)
            : []),
          ...(view !== 'jira' && unreadNotifications > 0 ? (['jira'] as const) : []),
          ...(view !== 'servicedesk' && requestNews > 0 ? (['servicedesk'] as const) : []),
        ]}
        onAction={(id) => void runAction(id)}
      />
      {open && settingsOpen && settingsIndex >= 0 && (
        <SettingsMenu
          corner={state.corner}
          layout={layout}
          offset={actionOffset(settingsIndex, scale)}
          settings={settings}
          size={state.size}
          branding={branding}
          version={state.version}
          user={auth?.state === 'signed-in' || auth?.state === 'offline' ? auth.user : null}
          atlassianUser={atlassian.status === 'connected' ? atlassian.user : null}
          onDisconnectAtlassian={() => void disconnectAtlassian()}
          update={update}
          onCheckForUpdates={() => void window.assist.updates.check().then(setUpdate)}
          onToggleTheme={() => void toggleTheme()}
          onSetSize={(next) => void window.assist.character.setSize(next)}
          onSetHabits={async (habits) =>
            setSettings(await window.assist.settings.setHabits(habits))
          }
          onSetRobeColor={async (color) =>
            setSettings(await window.assist.settings.setRobeColor(color))
          }
          onToggleAutoStart={async () =>
            setSettings(await window.assist.settings.setAutoStart(!settings.autoStart))
          }
          onSetEffort={(effort) => void setEffort(effort)}
          onToggleAutoSend={() => void toggleAutoSend()}
          onSignOut={() => void signOut()}
          onOpenScreenshotsFolder={() => void window.assist.screenshots.openFolder()}
          onNewConversation={() => void newConversation()}
          onClearText={() => void clearText()}
          onUninstall={() => void uninstall()}
        />
      )}
      {open && spellsOpen && spellsIndex >= 0 && (
        <SpellsMenu
          corner={state.corner}
          layout={layout}
          offset={actionOffset(spellsIndex, scale)}
          onCast={(spell) => {
            setSpellsOpen(false)
            void window.assist.character.castSpell(spell)
          }}
        />
      )}
    </div>
  )
}
```

<!-- /code -->

Props and state:

- `function Panel({ state }: { state: AppState })`: a component receives its props as one object.
  This takes `state` out of it, and `{ state: AppState }` is the type of the props.
- `const open = state.mode === 'expanded'`: the panel is open only in `expanded`. In every other
  mode (collapsed, dragging, returning or capturing) it's closed or hidden.
- `const inClaudeDesktop = branding.chatApp === 'claude-desktop'`: whether questions go to Claude
  Desktop. Much of what follows checks it.
- `const [draft, setDraft] = useState(state.notes.text)`: the text box's contents. Like
  `attachments` and `settings`, it starts from the app state but is then owned here: the panel
  updates it as you type and from the main process's replies.
- `const [settingsOpen, setSettingsOpen] = useState(false)`: whether the settings menu is showing.
- `const [spellsOpen, setSpellsOpen] = useState(false)`: whether the spells menu is showing. At
  most one of the two menus is open at a time.
- `const [asking, setAsking] = useState(false)`: true while a question is being handed to Claude
  Desktop, so it can't be sent twice. (Only for that moment: sending it in Claude carries on in
  the main process after the panel has closed.)
- `const { startPage, atlassianSite, requestTypes } = branding`: the tenant's start page, its
  Atlassian site (`null` without one) and its service desk's request types (`null` without them).
- `const [view, setView] = useState<View>(startPage)`: what the card shows: the text box (`ask`),
  the Apps list (`apps`), the Jira page or the service desk page. It starts on the tenant's start
  page, as the comment says, and another page shows while its icon is on. `<View>` gives the state
  its type, since TypeScript would otherwise take it to be just the starting value's type.
- `const [apps, setApps] = useState<AppsState>({ status: 'loading' })`: the Apps list as the main
  process last reported it. It isn't part of the app state the page loads at the start; it's asked
  for whenever the list shows (the effect below).
- `const [openingApp, setOpeningApp] = useState<string | null>(null)`: the ID of the app being
  opened, so its tile can show a spinner, or `null`.
- `atlassian`, `feed`: the Atlassian connection and the notifications and requests, as the main
  process last reported them.
- `issueKey`: as the comment says, the Jira issue shown in the card over the page it was opened
  from, or `null`.
- `serviceDeskTab`: which tab the service desk page opens on.
- `projectKeys`: as the comment says, the keys of the Jira projects the user can see, or `null`
  until they're known.
- `const [claudeMissing, setClaudeMissing] = useState(false)`: whether Claude Desktop was found
  to be missing, which shows a banner with a Download button.
- `const [update, setUpdate] = useState<UpdateState>({ status: 'idle' })`: how Check for updates
  is going, for the settings menu's row.
- `const [toast, showToast] = useToast()`: the current toast and the function to show one.

Effects:

- `window.assist.onModeChanged((mode) => {`: closes the settings menu and the spells menu whenever
  the panel closes, so neither is still open the next time. The arrow returns what
  `onModeChanged` returns, the unsubscribe function, which React uses as the cleanup.
- `if (mode === 'collapsed') {`: once the panel has really closed, the next opening is on the start
  page again (`setView(startPage)`), with no issue open (`setIssueKey(null)`). Only `collapsed`
  counts: taking a screenshot hides the panel too (`capturing`), and the user expects to come back
  to the same page afterwards.
- `shown`, `lastShown` and the effect after them: as the comment says, what's new on the Jira page
  or the service desk page goes as it's opened (a notification or a request, one at a time, see
  [The Jira and service desk pages](12-atlassian-pages.md)), and the rest once the page closes,
  because by then it's all been seen. `shown` is the page on screen: `view` while the panel is
  open (in any mode but `collapsed`, so taking a screenshot doesn't count as closing), `null` once
  it has closed. `lastShown` is a ref holding the one before, kept from render to render without
  causing one. When `shown` changes from `'jira'` to anything else (another page, or the panel
  closing), every notification is marked seen (`atlassian.markNotificationsRead()`, without an id);
  from `'servicedesk'`, every request's news (`atlassian.markRequestsRead()`, without a key). It
  does nothing without an Atlassian site.
- `useEffect(() => window.assist.onAppsState(setApps), [])`: keeps the Apps list up to date as
  the main process reports changes (connecting, loading, ready). `setApps` itself is the callback.
- `if (!atlassianSite) return`: with an Atlassian site, the connection and the feed are kept up to
  date from their two broadcasts (`onAtlassianState`, `onJiraFeed`), and asked for once at the
  start (`atlassian.get()`, `atlassian.feed()`), so the bell's dot can show before the Jira page
  is ever opened. The cleanup stops both subscriptions: `unsubscribe` is the list of the two stop
  functions, and `forEach` calls each.
- `if (!branding.updates) return`: when the tenant offers Check for updates, its progress is kept
  up to date from `onUpdateState`, and asked for once at the start (`updates.get()`), so the menu
  shows how the last check went. `onUpdateState` returns its own stop function, which is returned
  as the cleanup.
- `const atlassianConnected = atlassian.status === 'connected'`: used by several things below.
- `if (!atlassianConnected) return`: once connected, the Jira project keys are asked for
  (`atlassian.projectKeys()`), with the same `alive` guard as below. The effect runs again if the
  user disconnects and connects again.
- `if (!open || view !== 'apps' || !branding.portalName) return`: whenever the panel is open on the
  Apps list, it asks the main process for the list (`window.assist.apps.get()`). The main process
  already started loading it at startup and keeps it, so this is usually instant; the first time,
  it may still be on its way, and arrives through `onAppsState` too. `alive` guards against a late
  answer, as below.
- `if (!open || !inClaudeDesktop) return`: with Claude Desktop, each time the panel opens it asks
  whether Claude Desktop is installed (`window.assist.claudeDesktop.isInstalled()`), so a missing
  app is pointed out before anything is typed. Asking every time, rather than once, picks up
  Claude Desktop being installed while Desktop Wizard is running.
- `let alive = true`, `if (alive) setClaudeMissing(!installed)`: the same guard as in
  `useAssistState`. If the panel closes before the answer arrives, the cleanup sets `alive` to
  `false` and the late answer is ignored.
- `}, [open, inClaudeDesktop])`: the effect runs again when the panel opens or closes.
- `if (event.key !== 'Escape') return`: Esc closes the settings menu if it's open, otherwise the
  spells menu if that's open, otherwise closes an open issue (back to the page under it), otherwise
  goes back to the start page if another page is showing, otherwise asks the main process to close
  the panel (`BubbleController.collapse`). Keys reach the panel because the main process focuses
  it when it opens.
- `}, [settingsOpen, spellsOpen, issueKey, view, startPage])`: the listener reads these, and a
  function only sees the values from the render it was created in. Listing them here makes React
  remove the old listener and add a fresh one whenever one changes.

The JSX it returns:

- `className={cn('group relative h-full w-full', !open && 'pointer-events-none')}`: the root fills
  the window. `relative` makes it the reference box for the children's `absolute` positions (from
  `anchored`). `group` lets children style themselves from this element's attributes.
- `pointer-events-none`: while closed, nothing in the panel can be clicked, and `useClickThrough`
  finds no `data-hit` element, so the window stays click-through. This covers the moment the panel
  is fading out before the main process hides the window.
- `data-open={open ? '' : undefined}`: the attribute is present while open and left out while
  closed (React omits attributes set to `undefined`). Children use `group-data-open:` classes, such
  as `group-data-open:opacity-100`, so the open and close animations are plain CSS transitions.
- `onPointerDown={closeMenusOnOutsideClick}`: see below.
- `<ChatBox`: the card. It gets what to draw (corner, toast, sign-in prompt, banner, messages, draft
  and attachments) and a callback for each thing you can do there.
- `layout={layout}`: where things sit in the window for her size (`panelLayout()`, below).
  `ChatBox`, `ActionStack`, `SettingsMenu` and `SpellsMenu` all get it, so the card, the icons and
  the menus move out together when she's bigger.
- `scale={scale}`: her size too, so the card's speech-bubble tail can reach her mouth however big
  she is (`SpeechTail` in [the components part](8-renderer-components.md)).
- `inClaudeDesktop={inClaudeDesktop}`: the card shows an "Ask in Claude" button instead of the
  round Send arrow, and a note about what happens to attached screenshots.
- `autoSend={settings.autoSend}`: whether "Send in Claude automatically" is on, which changes that
  note and the button's tooltip. It comes from the panel's own `settings`, so flipping the switch
  in the menu shows at once.
- `onSend={() => void send()}`: the handlers are `async`, so they return promises. Each is wrapped
  in an arrow with `void`, which marks the promise as deliberately not awaited and makes the
  callback return nothing.
- `page={page}`: the page the card shows in place of everything else (the Apps list, the Jira
  page, the service desk page, or an issue), built further down (`pageContent` and `page`), or
  `null` for the text box.
- `issueKeys={issueKeys}`, `onOpenIssue={openIssue}`: the Jira issue keys typed in the text box,
  which get an **Open** button each, and what that button does.
- `onReport={requestTypes ? report : null}`: **Report to IT** under the text box, only when the
  tenant lists request types.
- `activeId={settingsOpen ? 'settings' : spellsOpen ? 'spells' : view !== startPage ? view : null}`:
  the gear stays highlighted while its menu is open, and the wand while the spells menu is;
  otherwise the icon of the page showing, when it isn't the start page (Ask Claude while the text
  box is on, for a panel that starts on the Apps list; the bell while the Jira page is on). The
  start page itself has no icon to highlight.
- `pages={requestTypes ? ['servicedesk'] : []}`: the service desk icon opens a page when there are
  request types, so `ActionStack` marks it as expandable like the popover icons.
- `dotted={[...]}`: small dots on icons with something behind them: Ask Claude while there's an
  unsent question or screenshot, so it isn't forgotten while another page is showing; the bell while
  there are unread notifications; and the service desk while one of the user's requests has news. No
  icon gets a dot while its own page is showing. `...(condition ? (['ask'] as const) : [])` adds an
  entry only when its condition holds; `as const` keeps it the exact id `'ask'` rather than any
  string.
- `{open && settingsOpen && settingsIndex >= 0 && (`: JSX's way of saying "only if": when any part
  is false, nothing is rendered. Removing the menu also resets its own state (its "click again to
  confirm" on New conversation or Clear text box).
- `offset={actionOffset(settingsIndex, scale)}`: how far the gear is from the bubble's edge of the
  window at her size, so the menu lines up with it.
- `size={state.size}`: her size and the biggest she can be, from the app state, so Size in the menu
  shows what she really is.
- `user={auth?.state === 'signed-in' || auth?.state === 'offline' ? auth.user : null}`: who's
  signed in, for the menu's "Signed in as" and Log out. `auth?.state` is `undefined` when `auth`
  is `null` (Claude Desktop), so then there's no user. After the check, TypeScript knows `auth`
  is one of the two states that have a `user`.
- `atlassianUser={atlassian.status === 'connected' ? atlassian.user : null}`,
  `onDisconnectAtlassian`: who's connected to Atlassian, for the menu's "Connected to Atlassian as"
  and **Disconnect Atlassian** (`disconnectAtlassian`, below).
- `update={update}`, `onCheckForUpdates={() => void window.assist.updates.check().then(setUpdate)}`:
  the Check for updates row and its click. The answer (`checking`) shows at once; the rest of the
  progress arrives through `onUpdateState`.
- `onToggleTheme={() => void toggleTheme()}`: the menu's Light mode switch (`toggleTheme`, below).
- `onSetSize={(next) => void window.assist.character.setSize(next)}`: Smaller or Bigger under Size
  asks the main process to resize her, which saves it. The panel doesn't use the answer: the new
  size comes back through `onSizeChanged` in `useAssistState`, and with it the new `layout`.
- `onSetHabits={async (habits) => setSettings(await window.assist.settings.setHabits(habits))}`:
  the Stand still and No idle animations switches. The main process saves the change and she does
  as it says at once; the settings it returns go into `settings`, so the switch shows what took
  effect.
- `onToggleAutoStart={async () =>`: flips Start with Windows and shows the settings the main
  process returns.
- `onToggleAutoSend={() => void toggleAutoSend()}`: the menu's "Send in Claude automatically"
  switch, offered with Claude Desktop instead of Response style.
- `onClearText={() => void clearText()}`: the menu's Clear text box, offered instead of New
  conversation with Claude Desktop.
- `onUninstall={() => void uninstall()}`: the menu's Uninstall.
- `{open && spellsOpen && spellsIndex >= 0 && (`: the spells menu, drawn the same way as the
  settings menu: only while the panel is open, its icon has toggled it on, and the tenant shows the
  wand. `offset={actionOffset(spellsIndex, scale)}` lines it up with the wand.
- `onCast={(spell) => {`: picking a spell closes the menu (`setSpellsOpen(false)`) and asks the
  main process to cast it (`window.assist.character.castSpell(spell)`), which closes the panel too,
  so the spell can be seen. Nothing comes back: she shows what happens.

#### `signedIn`, `busy`, `canSend`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.signedIn,busy,canSend -->

[`src/renderer/src/views/PanelView.tsx`, lines 183–190](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L183-L190)

```tsx
// Not signed in: the chat box shows the sign-in instead of the chat. While a saved sign-in is
// being renewed, or JumpCloud can't be reached, the chat stays (sending tries JumpCloud again).
// With Claude Desktop there's no sign-in here at all.
const signedIn = auth === null || auth.state === 'signed-in' || auth.state === 'offline'

// `busy` is the built-in chat's reply streaming (the text box then offers Stop). Handing a
// question to Claude Desktop only takes a moment, so it just holds the button back.
const busy = state.chat.some((message) => message.status === 'streaming')

const canSend = signedIn && !busy && !asking && (draft.trim() !== '' || attachments.length > 0)
```

<!-- /code -->

Values worked out on every render from the current state.

- `auth === null`: with Claude Desktop there's no sign-in in the panel (Claude Desktop has its
  own), so the panel always counts as signed in. Checking `null` first also lets TypeScript allow
  `auth.state` in the rest of the line.
- `auth.state === 'signed-in' || auth.state === 'offline'`: `offline` counts as signed in: the
  sign-in is kept while JumpCloud can't be reached, and sending a message tries JumpCloud again.
- `state.chat.some((message) => message.status === 'streaming')`: the built-in chat's Claude is
  still replying. As the comment says, that's all `busy` means: while it's true the text box
  offers Stop instead of Send. With Claude Desktop the chat is always empty, so `busy` is never
  true there.
- `!asking`: a question is being handed to Claude Desktop. That only takes a moment, so it just
  holds the button back rather than counting as `busy` (which would show a Stop button with
  nothing to stop).
- `draft.trim() !== '' || attachments.length > 0`: there must be some text or at least one
  screenshot. `ChatBox` disables Send, and Enter does nothing, unless `canSend` is true.

#### `runAction`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.runAction -->

[`src/renderer/src/views/PanelView.tsx`, lines 192–220](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L192-L220)

```tsx
async function runAction(id: ActionId) {
  // Any icon but the spells menu's own closes the spells menu (the settings menu's, below).
  if (id !== 'spells') setSpellsOpen(false)
  // With request types, the service desk icon opens a page for them instead of the portal.
  if (id === 'apps' || id === 'ask' || id === 'jira' || (id === 'servicedesk' && requestTypes)) {
    // Swaps the card to that page, or back again: the text box and the Apps list swap with
    // each other, other pages go back to the start page.
    setSettingsOpen(false)
    setIssueKey(null)
    if (id === 'servicedesk') setServiceDeskTab('new')
    const back: View = id === 'apps' ? 'ask' : id === 'ask' ? 'apps' : startPage
    setView(view === id && !issueKey ? back : id)
    return
  }
  if (id === 'spells') {
    setSettingsOpen(false)
    setSpellsOpen(!spellsOpen)
    return
  }
  if (id === 'settings') {
    setSettingsOpen(!settingsOpen)
    // Refresh: "Start with Windows" can also be changed in Windows Settings.
    if (!settingsOpen) setSettings(await window.assist.settings.get())
    return
  }
  setSettingsOpen(false)
  const result = await window.assist.invokeAction(id)
  if (result.message) showToast(result.message, result.ok ? 'info' : 'error')
}
```

<!-- /code -->

Runs when an action icon is clicked (`ActionStack`'s `onAction`).

- `if (id !== 'spells') setSpellsOpen(false)`: as the comment says, any icon but the spells menu's
  own closes the spells menu. The settings menu is closed further down, by each branch that needs
  to.
- `if (id === 'apps' || id === 'ask' || id === 'jira' || (id === 'servicedesk' && requestTypes))`:
  the icons that swap the card to a page. Your apps, Ask Claude and Jira are "popover" actions
  (src/shared/actions.ts); the service desk is a command, but, as the comment says, with request
  types it opens its page instead of the portal. They close the settings menu and any open issue,
  and the service desk page always opens on New request. A tenant shows only one of Ask Claude
  and Your apps: the icon of the page it doesn't start on.
- `const back: View = id === 'apps' ? 'ask' : id === 'ask' ? 'apps' : startPage`: where clicking
  the icon of the page that's showing goes back to. As the comment says, the text box and the
  Apps list swap with each other, and the other pages go back to the start page.
- `setView(view === id && !issueKey ? back : id)`: clicking the icon of a page that isn't showing
  shows it; clicking it again goes back. With an issue open over its page, the click shows the
  page itself instead. The Apps list is fetched by the effect above as soon as it shows.
- `if (id === 'spells') {`: Spells is a "popover" action: it closes the settings menu and opens the
  spells menu, or closes it if it's open. Like Settings, it never reaches the main process itself;
  the spells in the menu do (see `SpellsMenu` in [the components part](8-renderer-components.md)).
- `if (id === 'settings') {`: Settings is a "popover" action too: it opens UI inside the panel and
  never reaches the main process.
- `setSettingsOpen(!settingsOpen)`: setting state doesn't change the variable in this run of the
  function. `settingsOpen` still holds the value from before the toggle, so the next line's
  `if (!settingsOpen)` means "the menu is being opened now".
- `setSettings(await window.assist.settings.get())`: refreshes the settings as the menu opens,
  because Start with Windows can also be changed in Windows Settings.
- `window.assist.invokeAction(id)`: after the `apps`, `ask`, `jira`, `spells` and `settings`
  branches return, TypeScript knows `id` is `servicedesk` (without request types), `screenshot`,
  `screensaver` or `close`, which is exactly the `CommandActionId` type `invokeAction` accepts. The
  main process runs the matching handler from src/main/actions.ts.
- `if (result.message) showToast(result.message, result.ok ? 'info' : 'error')`: for example
  "Screenshot saved", or "Couldn't take a screenshot" in red. Close, the screen saver and the
  service desk return no message when they work (the service desk closes the panel as the browser
  opens, the screen saver as the screens whiten, and Close as she vanishes, before the app quits).
- There's no change of page after a screenshot: the panel comes back showing whatever it showed
  before (the Apps list, say). The view isn't reset either, because taking a screenshot moves the
  mode through `capturing`, not `collapsed` (see the mode effect above).

#### `changeDraft`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.changeDraft -->

[`src/renderer/src/views/PanelView.tsx`, lines 222–225](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L222-L225)

```tsx
function changeDraft(next: string) {
  setDraft(next)
  window.assist.notes.setText(next)
}
```

<!-- /code -->

Runs on every keystroke in the text box. It updates the box, then sends the text to the main
process (`notes.setText`, which doesn't wait for a reply). There, `NotesStore.setText` keeps it and
writes notes.json about half a second after typing stops, so an unsent message survives a restart.

#### `send`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.send -->

[`src/renderer/src/views/PanelView.tsx`, lines 227–239](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L227-L239)

```tsx
async function send() {
  if (!canSend) return
  if (inClaudeDesktop) return askInClaudeDesktop()
  const result = await window.assist.chat.send(draft)
  if (result.ok) {
    setDraft(result.notes.text)
    setAttachments(result.notes.attachments)
  } else if (result.reason === 'missing-screenshot') {
    showToast('An attached screenshot is missing. Remove it and try again.', 'error')
  } else if (result.reason === 'signed-out') {
    showToast('Sign in with JumpCloud first.', 'error')
  }
}
```

<!-- /code -->

Sends the draft to Claude: to the built-in chat, or to Claude Desktop.

- `if (!canSend) return`: a second guard; `ChatBox` checks too.
- `if (inClaudeDesktop) return askInClaudeDesktop()`: with Claude Desktop, the rest of this
  function doesn't apply; see [`askInClaudeDesktop`](#askinclaudedesktop) below.
- `window.assist.chat.send(draft)`: only the text is sent. The main process takes the attachments
  from its own copy of the draft, prepares the screenshots and starts the reply (the `chatSend`
  handler in src/main/ipc.ts). Claude's reply doesn't come back here: it streams in through
  `onChatMessage` in `useAssistState`.
- `setDraft(result.notes.text)`: the main process cleared the draft after sending; the box adopts
  the cleared version, as do the attachments.
- `result.reason === 'missing-screenshot'`: an attached file was deleted after it was attached.
- `result.reason === 'signed-out'`: the sign-in ran out just before sending.

The other two reasons, `busy` and `empty`, are ignored: `canSend` already rules them out.

#### `askInClaudeDesktop`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.askInClaudeDesktop -->

[`src/renderer/src/views/PanelView.tsx`, lines 241–253](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L241-L253)

```tsx
async function askInClaudeDesktop() {
  setAsking(true)
  const result = await window.assist.claudeDesktop.ask(draft).finally(() => setAsking(false))
  if (result.ok) setClaudeMissing(false)
  else if (result.reason === 'not-installed') setClaudeMissing(true)
  if (result.ok) {
    // The panel has closed and Claude Desktop has opened with the question filled in.
    setDraft(result.notes.text)
    setAttachments(result.notes.attachments)
  } else if (result.reason !== 'empty') {
    showToast(ASK_ERRORS[result.reason], 'error')
  }
}
```

<!-- /code -->

Hands the draft to Claude Desktop (see [Claude Desktop](9-claude-desktop.md)). When it works, the
main process has opened Claude Desktop with the question filled in, copied any screenshots for
pasting, closed the panel and emptied the draft. Sending the question in Claude (with "Send in
Claude automatically" on) carries on in the main process; the panel isn't told how it went.

- `setAsking(true)`: makes `canSend` false, so Enter and the Ask button do nothing until the
  answer comes back.
- `window.assist.claudeDesktop.ask(draft)`: as with `chat.send()`, only the text is passed; the
  main process takes the screenshots from its own copy of the draft.
- `.finally(() => setAsking(false))`: runs whether the request succeeded or failed, so `asking`
  can't get stuck on.
- `if (result.ok) setClaudeMissing(false)`, `else if (result.reason === 'not-installed')`: a
  question that got through hides the Download banner, and `not-installed` shows it. Other
  failures (too long, say) say nothing about whether Claude Desktop is installed, so they leave
  the banner as it was.
- `setDraft(result.notes.text)`: the draft comes back empty, and the box and the chips adopt it,
  ready for the next question.
- `else if (result.reason !== 'empty')`: any other failure shows its message from
  [`ASK_ERRORS`](#ask_errors) as a red toast. Once `empty` is ruled out, TypeScript knows
  `result.reason` is one of `ASK_ERRORS`'s keys.

#### `toggleFavorite`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.toggleFavorite -->

[`src/renderer/src/views/PanelView.tsx`, lines 255–257](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L255-L257)

```tsx
async function toggleFavorite(app: PortalApp, favorite: boolean) {
  setSettings(await window.assist.settings.setFavoriteApp(app.id, favorite))
}
```

<!-- /code -->

A star click in the Apps list. The main process saves the change with the other preferences and
returns the settings; adopting them updates `settings.favoriteApps`, and the list re-orders itself
with the starred apps first.

#### `openApp`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.openApp -->

[`src/renderer/src/views/PanelView.tsx`, lines 259–270](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L259-L270)

```tsx
async function openApp(app: PortalApp) {
  // The tile spins until the browser is opening (JumpCloud can take a few seconds to give the
  // sign-in link); on success the main process closes the panel.
  setOpeningApp(app.id)
  try {
    if (!(await window.assist.apps.open(app.id))) {
      showToast(`Couldn't open ${app.name}. Try it from the portal.`, 'error')
    }
  } finally {
    setOpeningApp((current) => (current === app.id ? null : current))
  }
}
```

<!-- /code -->

A click on an app in the Apps list. Only the app's ID goes to the main process, which asks
JumpCloud for the app's sign-in link and opens it in the browser (see [Your apps](10-apps.md)).
As the comment says, if it works the main process closes the panel; if there was no link, the
panel stays open with a toast, and the portal itself is one click away at the bottom of the list.

- `setOpeningApp(app.id)`: JumpCloud can take a few seconds to give the link, so the app's tile
  shows a spinner meanwhile, and the user can see the click worked.
- `finally {`: runs whether opening worked, failed or threw, so the spinner never stays on.
- `setOpeningApp((current) => (current === app.id ? null : current))`: passing a function gives
  the latest value. The spinner is cleared only if it's still this app's: if the user clicked a
  second app meanwhile, its spinner stays.

#### `openIssue`, `report`, `disconnectAtlassian`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.openIssue,report,disconnectAtlassian -->

[`src/renderer/src/views/PanelView.tsx`, lines 272–292](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L272-L292)

```tsx
/** Opens a Jira issue in the card if connected to Atlassian, otherwise in the browser. */
function openIssue(key: string) {
  setSettingsOpen(false)
  if (atlassianConnected) setIssueKey(key)
  else if (atlassianSite) void window.assist.openExternal(browseUrl(atlassianSite, key))
}

/** Starts an IT request from what's in the text box. */
function report() {
  setSettingsOpen(false)
  setIssueKey(null)
  setServiceDeskTab('new')
  setView('servicedesk')
}

async function disconnectAtlassian() {
  setSettingsOpen(false)
  setIssueKey(null)
  await window.assist.atlassian.signOut()
  showToast('Disconnected from Atlassian')
}
```

<!-- /code -->

- `openIssue(key)`: as its comment says, opens a Jira issue in the card if connected to Atlassian
  (`setIssueKey(key)`, and `page` below shows an `IssueView` for it), otherwise in the browser.
  `browseUrl()` (from `src/shared/jira.ts`) makes the issue's address on the company's site. The
  pages, the notifications and the text box's Open buttons all come here.
- `report()`: **Report to IT** under the text box: as its comment says, starts an IT request from
  what's in the text box, by showing the service desk page on New request. The form there picks
  the text up itself.
- `disconnectAtlassian()`: **Disconnect Atlassian** in the settings menu. The main process forgets
  the connection, and the new `sign-in` state arrives through `onAtlassianState`, so the Jira page
  shows its Connect button again.

#### `attachLatest`, `removeAttachment`, `openAttachment`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.attachLatest,removeAttachment,openAttachment -->

[`src/renderer/src/views/PanelView.tsx`, lines 294–310](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L294-L310)

```tsx
async function attachLatest() {
  const result = await window.assist.notes.attachLatestScreenshot()
  if (result.ok) setAttachments(result.notes.attachments)
  else if (result.reason === 'no-screenshots') {
    showToast('No screenshots yet. Take one with the camera button.', 'error')
  } else showToast('No more screenshots to attach', 'error')
}

async function removeAttachment(attachment: Attachment) {
  const notes = await window.assist.notes.removeAttachment(attachment.id)
  setAttachments(notes.attachments)
}

async function openAttachment(attachment: Attachment) {
  const opened = await window.assist.screenshots.open(attachment.path)
  if (!opened) showToast("That screenshot can't be found", 'error')
}
```

<!-- /code -->

The screenshot chips on the draft. Each asks the main process, which owns the draft, and shows the
result.

- `window.assist.notes.attachLatestScreenshot()`: the main process adds the newest screenshot
  that isn't attached yet, so each click goes one further back.
- `'no-screenshots'`: there are none at all, so the toast says how to take one.
- `else showToast('No more screenshots to attach', 'error')`: the only other failure, `no-more`:
  every screenshot is already attached. Both are shown in red, as errors.
- `window.assist.notes.removeAttachment(attachment.id)`: returns the updated draft, whose
  attachment list the panel adopts.
- `window.assist.screenshots.open(attachment.path)`: opens the file in the default image viewer;
  `false` means the file is gone.

#### `copy`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.copy -->

[`src/renderer/src/views/PanelView.tsx`, lines 312–315](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L312-L315)

```tsx
async function copy(text: string) {
  await window.assist.copyText(text)
  showToast('Copied')
}
```

<!-- /code -->

The Copy button on Claude's replies. The main process writes the text to the clipboard
(`clipboard.writeText` in src/main/ipc.ts).

#### `signOut`, `clearText`, `uninstall`, `newConversation`, `setEffort`, `toggleAutoSend`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.signOut,clearText,uninstall,newConversation,setEffort,toggleAutoSend -->

[`src/renderer/src/views/PanelView.tsx`, lines 317–350](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L317-L350)

```tsx
async function signOut() {
  setSettingsOpen(false)
  await window.assist.auth.signOut()
  showToast('Logged out')
}

async function clearText() {
  const notes = await window.assist.notes.clear()
  setDraft(notes.text)
  setAttachments(notes.attachments)
  setSettingsOpen(false)
  showToast('Text box cleared')
}

async function uninstall() {
  setSettingsOpen(false)
  const result = await window.assist.uninstall()
  // On success the uninstaller has started and the app is quitting.
  if (!result.ok) showToast(UNINSTALL_ERRORS[result.reason], 'error')
}

async function newConversation() {
  await window.assist.chat.newConversation()
  setSettingsOpen(false)
  showToast('Started a new conversation')
}

async function setEffort(effort: Effort) {
  setSettings(await window.assist.settings.setEffort(effort))
}

async function toggleAutoSend() {
  setSettings(await window.assist.settings.setAutoSend(!settings.autoSend))
}
```

<!-- /code -->

Settings menu actions.

- `await window.assist.auth.signOut()`: `AuthManager.signOut` forgets the saved sign-in. Because
  this is a log-out, the main process also starts a new conversation (`onSignedOut` in
  src/main/index.ts). The new `signed-out` status and the chat reset arrive through
  `useAssistState`, and the chat card switches to the sign-in.
- `const notes = await window.assist.notes.clear()`: Clear text box, which the menu offers with
  Claude Desktop instead of New conversation (there's no conversation in the panel to clear).
  The main process empties the draft and its screenshots and returns it; the box and the chips
  adopt it.
- `const result = await window.assist.uninstall()`: starts the uninstaller (see
  `src/main/uninstall.ts` in [Main process: startup, IPC and app plumbing](2-main-startup.md)).
  If it worked, the app is already quitting; otherwise the toast from `UNINSTALL_ERRORS` says
  what to do instead.
- `await window.assist.chat.newConversation()`: `ChatSession` forgets the conversation and
  broadcasts a reset, which empties the chat in `useAssistState`.
- `setSettings(await window.assist.settings.setEffort(effort))`: saves the response style (Fast,
  Balanced or Thorough) and shows the settings the main process returns.
- `setSettings(await window.assist.settings.setAutoSend(!settings.autoSend))`: flips "Send in
  Claude automatically" (Claude Desktop only) and shows the settings the main process returns.
  The menu stays open, as for the other switch.

#### `closeMenusOnOutsideClick`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.closeMenusOnOutsideClick -->

[`src/renderer/src/views/PanelView.tsx`, lines 352–361](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L352-L361)

```tsx
// Clicking anywhere else in the panel closes the settings menu, or the spells menu.
function closeMenusOnOutsideClick(event: PointerEvent) {
  if (!(event.target instanceof Element)) return
  if (settingsOpen && !event.target.closest('[data-settings-menu], [data-action="settings"]')) {
    setSettingsOpen(false)
  }
  if (spellsOpen && !event.target.closest('[data-spells-menu], [data-action="spells"]')) {
    setSpellsOpen(false)
  }
}
```

<!-- /code -->

As the comment says, closes the settings menu, or the spells menu, when you press anywhere else in
the panel. The page only receives the press where the window takes the mouse, so "elsewhere" means
the chat card, another icon or the other menu. Clicking outside the panel altogether takes focus
away from the window, the main process closes the panel (`BubbleController.panelBlurred`), and the
mode effect above closes the menus.

- `event: PointerEvent`: React's own event type, imported from `react`, not the browser's.
- `!(event.target instanceof Element)`: `target` is typed as a general `EventTarget`; this check
  lets TypeScript allow `closest`.
- `closest('[data-settings-menu], [data-action="settings"]')`: with the settings menu open, presses
  inside the menu or on the gear don't count. Without the gear exception, pressing the gear would
  close the menu on the way down and its click would open it again straight away.
- `closest('[data-spells-menu], [data-action="spells"]')`: the same for the spells menu and the
  wand.

#### `toggleTheme`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.toggleTheme -->

[`src/renderer/src/views/PanelView.tsx`, lines 363–365](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L363-L365)

```tsx
async function toggleTheme() {
  setSettings(await window.assist.settings.setTheme(settings.theme === 'dark' ? 'light' : 'dark'))
}
```

<!-- /code -->

The settings menu's Light mode switch. It asks the main process for the other mode
(`settings.setTheme()`), which switches every window at once (see `SettingsService.setTheme()` in
[Main process: startup, IPC and app plumbing](2-main-startup.md)), and keeps the settings it
returns, so the switch shows the new mode. The menu stays open, as for the other switches.

#### `signInPrompt`, `banner`: sign-in or chat

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.signInPrompt,banner -->

[`src/renderer/src/views/PanelView.tsx`, lines 367–412](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L367-L412)

```tsx
const signInPrompt =
  auth?.state === 'unconfigured' ||
  auth?.state === 'signed-out' ||
  auth?.state === 'signing-in' ? (
    <SignInPanel
      open={open}
      status={auth}
      appName={branding.appName}
      onSignIn={() => void window.assist.auth.signIn()}
      onCancel={() => void window.assist.auth.cancel()}
    />
  ) : null

const banner =
  inClaudeDesktop && claudeMissing ? (
    <Banner
      action={
        <button
          type="button"
          onClick={() => void window.assist.openExternal(CLAUDE_DOWNLOAD_PAGE)}
          className="shrink-0 rounded-md px-1.5 py-0.5 font-medium text-accent hover:bg-zinc-100 dark:text-accent-soft dark:hover:bg-zinc-800"
        >
          Download
        </button>
      }
    >
      Claude Desktop isn't installed on this PC, and {branding.appName} opens your questions in
      it. Ask IT to install it, or download it.
    </Banner>
  ) : auth?.state === 'checking' ? (
    <Banner spinner>Checking your JumpCloud sign-in…</Banner>
  ) : auth?.state === 'offline' ? (
    <Banner
      action={
        <button
          type="button"
          onClick={() => void window.assist.auth.retry()}
          className="rounded-md px-1.5 py-0.5 font-medium text-accent hover:bg-zinc-100 dark:text-accent-soft dark:hover:bg-zinc-800"
        >
          Retry
        </button>
      }
    >
      {auth.message}
    </Banner>
  ) : null
```

<!-- /code -->

This is how the panel decides what the chat card shows. `signInPrompt` is a `SignInPanel` element
or `null`, and `banner` is a `Banner` element or `null`. `ChatBox` shows `signInPrompt` in place of
the conversation when it isn't `null`; otherwise it shows the messages, then the banner, then the
text box. The sign-in status comes from `AuthManager` in the main process, through `onAuthStatus`
in `useAssistState`.

With Claude Desktop, `auth` is `null`: there's never a sign-in prompt, and the only banner is the
one saying Claude Desktop isn't installed. With the built-in chat, it depends on `auth.state`:

| `auth.state`   | The chat card shows                                  |
| -------------- | ---------------------------------------------------- |
| `unconfigured` | Sign-in: "Sign-in isn't set up yet"                  |
| `signed-out`   | Sign-in: "Sign in with JumpCloud"                    |
| `signing-in`   | Sign-in: "Finish signing in in your browser", Cancel |
| `checking`     | The chat, "Checking…" banner; sending is off         |
| `offline`      | The chat, the reason and Retry; sending works        |
| `signed-in`    | The chat                                             |

- `auth?.state === 'unconfigured' || auth?.state === 'signed-out' || ...`: `?.` gives `undefined`
  when `auth` is `null`, so every comparison is false and there's no sign-in prompt. Inside the
  `? (` branch, TypeScript has narrowed `auth` to those three states, which is exactly the type
  `SignInPanel`'s `status` prop accepts.
- `onSignIn={() => void window.assist.auth.signIn()}`: `AuthManager.signIn` opens JumpCloud in the
  browser and returns at once. Progress arrives as status changes (`signing-in`, then
  `signed-in`), and the main process reopens the panel when it's done.
- `onCancel={() => void window.assist.auth.cancel()}`: stops waiting for the browser.
- `inClaudeDesktop && claudeMissing ? (`: the first banner checked. Claude Desktop isn't
  installed (found when the panel opened, or when asking), so the banner says so and offers a
  **Download** button. It goes away the next time the panel opens and finds Claude Desktop, or
  when a question is handed over successfully.
- `window.assist.openExternal(CLAUDE_DOWNLOAD_PAGE)`: opens Anthropic's download page in the
  browser (see `src/shared/claudeDesktop.ts` in
  [Shared code and the preload bridge](1-shared-and-preload.md)). `shrink-0` stops the long
  message squeezing the button.
- `{branding.appName}`: the tenant's app name, so the message reads "…and Desktop Wizard opens
  your questions in it."
- `<Banner spinner>`: shown while a saved sign-in is being renewed, at startup or after Retry. The
  chat is visible, but `signedIn` is false, so nothing can be sent yet.
- `onClick={() => void window.assist.auth.retry()}`: `AuthManager.retry` tries again to renew the
  saved sign-in.
- `{auth.message}`: the offline reason, written by `AuthManager`.

#### `scale`, `layout`, `settingsIndex`, `spellsIndex`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.scale,layout,settingsIndex,spellsIndex -->

[`src/renderer/src/views/PanelView.tsx`, lines 414–418](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L414-L418)

```tsx
// Everything sits further out the bigger she is (see panelLayout).
const scale = state.size.scale

const layout = panelLayout(scale)

const settingsIndex = branding.actions.indexOf('settings')

const spellsIndex = branding.actions.indexOf('spells')
```

<!-- /code -->

- `scale`, `layout`: as the comment says, everything sits further out the bigger she is.
  `state.size.scale` is her size (1 usually), kept live by `useAssistState`, and `panelLayout()`
  (src/shared/geometry.ts) turns it into where each piece sits, measured from the bubble's corner
  of the window: the chat card beside her and the action stack above her, both past her box and
  its padding, which grow with her. At her usual size the card starts 100 px across and the stack
  100 px up; at twice her size, 188 px. The main process sizes the panel window from the same
  function, so everything fits.
- `settingsIndex`, `spellsIndex`: where the gear and the wand are in the tenant's list of icons
  (`actions` in tenant.json), counting from the bubble. Each is `-1` if the tenant doesn't show
  that icon, and then its menu is never drawn.

#### `issueKeys`, `unreadNotifications`, `requestNews`, `pageContent`, `page`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.issueKeys,unreadNotifications,requestNews,pageContent,page -->

[`src/renderer/src/views/PanelView.tsx`, lines 419–495](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L419-L495)

```tsx
// Only keys of real projects, once the projects are known.
const issueKeys = atlassianSite
  ? findIssueKeys(draft).filter(
      (key) =>
        !atlassianConnected ||
        !projectKeys ||
        projectKeys.includes(key.slice(0, key.lastIndexOf('-'))),
    )
  : []

const unreadNotifications = feed.notifications.items.filter((n) => n.unread).length

const requestNews = feed.requests.items.filter((r) => r.news).length

const pageContent =
  view === 'apps' && branding.portalName ? (
    <AppsList
      open={open}
      state={apps}
      appName={branding.appName}
      portalName={branding.portalName}
      favorites={settings.favoriteApps}
      onToggleFavorite={(app, favorite) => void toggleFavorite(app, favorite)}
      onOpenApp={(app) => void openApp(app)}
      openingId={openingApp}
      onOpenPortal={() => void window.assist.apps.openPortal()}
      onSignIn={() => void window.assist.apps.signIn()}
      onCancelSignIn={() => void window.assist.apps.cancelSignIn()}
      onRetry={() => void window.assist.apps.get(true).then(setApps)}
    />
  ) : view === 'jira' && atlassianSite ? (
    <JiraPage
      open={open}
      state={atlassian}
      feed={feed}
      appName={branding.appName}
      site={atlassianSite}
      onOpenIssue={openIssue}
    />
  ) : view === 'servicedesk' && requestTypes ? (
    <ServiceDeskPage
      open={open}
      initialTab={serviceDeskTab}
      requestTypes={requestTypes}
      atlassian={atlassianSite ? atlassian : null}
      feed={feed}
      appName={branding.appName}
      draft={draft}
      attachments={attachments}
      onAttachLatest={() => void attachLatest()}
      onOpenAttachment={(attachment) => void openAttachment(attachment)}
      onRemoveAttachment={(attachment) => void removeAttachment(attachment)}
      onOpenIssue={openIssue}
      showToast={showToast}
    />
  ) : null

// An issue opens over the page it was opened from, which stays (hidden) so Back finds it as it
// was: the same tab, search or half-filled form.
const page =
  issueKey || pageContent ? (
    <>
      {issueKey && (
        <IssueView
          key={issueKey}
          issueKey={issueKey}
          inClaudeDesktop={inClaudeDesktop}
          onBack={() => setIssueKey(null)}
          onAskedInChat={() => {
            setIssueKey(null)
            setView('ask')
          }}
          showToast={showToast}
        />
      )}
      <div hidden={issueKey !== null} className="contents">
        {pageContent}
      </div>
    </>
  ) : null
```

<!-- /code -->

What the card shows besides the text box, worked out on every render.

- `issueKeys`: the issue keys in the text box (`findIssueKeys()`, at most three), for its Open
  buttons. As the comment says, once connected and the project keys are known, only keys of real
  projects count: `key.slice(0, key.lastIndexOf('-'))` is the project part (`ISD` of `ISD-12`).
  Until then, every key that looks right is offered. Without an Atlassian site, none.
- `unreadNotifications`, `requestNews`: how many notifications have a dot, and how many requests
  have news, for the dots on the bell and the service desk icon.
- `pageContent`: the page for `view`: an `AppsList` (see [Your apps](10-apps.md)), a `JiraPage` or
  a `ServiceDeskPage` (see [The Jira and service desk pages](12-atlassian-pages.md)); `null` for
  the text box. Each is only shown when the tenant has what it needs (`portalName`,
  `atlassianSite`, `requestTypes`), which also gives TypeScript definite values for their props.
- `openingId={openingApp}`: which tile of the Apps list shows the "opening" spinner.
- `favorites={settings.favoriteApps}`, `onToggleFavorite={...}`: the starred apps, from the
  panel's own copy of the settings, and what a star click does (`toggleFavorite`, above).
- `onRetry={() => void window.assist.apps.get(true).then(setApps)}`: the list's Retry and Refresh
  load it again (`true` means "even if already loaded").
- `atlassian={atlassianSite ? atlassian : null}`: the service desk page gets the Atlassian
  connection only when there's a site; without one it shows just the form.
- `draft={draft}`, `attachments={attachments}`: the service desk form starts from the text box,
  and shares its screenshots, with the same attach, open and remove handlers.
- `page`: `pageContent`, with an issue over it when one is open. As the comment says, the page the
  issue was opened from stays, hidden, so Back finds it as it was: the same tab, search or
  half-filled form. `<div hidden={issueKey !== null} className="contents">` hides it without
  removing it; `contents` makes the wrapper itself take no space, so the page lays out as if it
  weren't there.
- `<IssueView key={issueKey} ... />`: `key` makes React create a new `IssueView` for each issue,
  rather than reusing one with the old issue's state. `onAskedInChat` closes the issue and shows
  the text box, where the built-in chat's answer arrives.
- `<>` and `</>`: a _fragment_, which groups the two without adding an element of its own.
