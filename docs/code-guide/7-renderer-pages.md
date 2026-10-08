# The pages: entry points, styles, hooks and views

[← Code Guide](../CODE_GUIDE.md)

This part covers the renderer's own files: the HTML page both windows load, the startup script,
the stylesheet, two small helpers, the hooks that connect React to the main process, and the two
views (the bubble and the panel). The building blocks the views use are covered in
[the components part](8-renderer-components.md). If React is new to you: a React _component_ is a
function that returns a description of what to show, written in JSX (HTML-like tags inside
TypeScript, in `.tsx` files), and whenever the data it uses changes, React calls it again and
updates only the parts of the page that changed.

## `src/renderer/index.html`: the page both windows load

The bubble window and the panel window both load this one page. It's almost empty: a `<div>` for
React to fill and a script tag that starts the app. The interesting part is the security policy.

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
    <title>Desktop Assist</title>
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
- `img-src 'self' data:`: images from the app (the tenant's logo) or `data:` URLs, which is how
  screenshot thumbnails arrive (see `useThumbnail` below).
- `connect-src 'self'`: the page can't `fetch` anything from the internet. Only the main process
  talks to Claude and JumpCloud.
- `object-src 'none'; base-uri 'none'; form-action 'none'`: no plugins (`<object>`, `<embed>`), no
  `<base>` tag that could redirect relative links, and no form submissions anywhere.
- `<div id="root"></div>`: the empty element React takes over (see `main.tsx`).
- `<script type="module" src="./src/main.tsx"></script>`: the entry point. Vite compiles
  `main.tsx` and everything it imports into plain JavaScript and, in the build, rewrites this tag to
  point at the bundled file.

## `src/renderer/src/main.tsx`: choosing bubble or panel

The first code that runs in each window. It works out which window it's in and renders the
matching view. `BubbleView` and `PanelView` are React components: functions whose names start with
a capital letter and return JSX. In JSX, `<BubbleView />` means "render the `BubbleView` component
here".

<!-- code: apps/desktop/src/renderer/src/main.tsx -->

[`src/renderer/src/main.tsx`, lines 1–12](../../apps/desktop/src/renderer/src/main.tsx#L1-L12)

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { BubbleView } from './views/BubbleView'
import { PanelView } from './views/PanelView'

// Both overlay windows load this page; the query string says which one this is.
const view = new URLSearchParams(window.location.search).get('view')

createRoot(document.getElementById('root')!).render(
  <StrictMode>{view === 'bubble' ? <BubbleView /> : <PanelView />}</StrictMode>,
)
```

<!-- /code -->

- `import './styles.css'`: importing a CSS file from code is a Vite feature; it adds the stylesheet
  (after Tailwind has processed it) to the page.
- `new URLSearchParams(window.location.search).get('view')`: reads the `?view=bubble` or
  `?view=panel` that `createOverlayWindow` (src/main/bubble/windows.ts) adds when it loads the page.
  Anything other than `bubble` gets the panel.
- `document.getElementById('root')!`: the `!` tells TypeScript "this is not null"; the div is in
  `index.html`.
- `createRoot(`: hands that div to React, which from now on owns everything inside it. `render`
  draws the first screen.
- `<StrictMode>`: a development-only checker. In `npm run dev` it calls each component twice and
  runs each effect, cleans it up, then runs it again, to expose code that doesn't clean up after
  itself. That's why every hook below has a careful cleanup. It does nothing in the installed app.
- `{view === 'bubble' ? <BubbleView /> : <PanelView />}`: curly braces switch from JSX back to
  ordinary TypeScript, here a choice between the two views.

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
listing these in `className` instead of writing a separate stylesheet. A prefix applies a class
only in some situation: `hover:` while the pointer is over it, `dark:` when Windows is in dark
mode, `motion-reduce:` when Windows animations are turned off, and `group-data-open:` when a parent
marked `group` has a `data-open` attribute (used by the panel). At build time Tailwind scans the
source for the class names actually used and generates CSS for just those. This file sets Tailwind
up and holds the styles that classes can't express.

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
- `background: transparent`: both windows are transparent (`transparent: true` in
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
  query follows the Windows light/dark setting.
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
screen edge, measured from the bubble's corner. `ChatBox`, `ActionStack` and `SettingsMenu` call it
with the offsets in `PANEL_LAYOUT` (src/shared/geometry.ts), the same numbers the main process uses
to size the window.

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

This file's hooks are used by both views. Each window is a separate page, so each keeps its own
copy of the state.

### `useAssistState`

<!-- code: apps/desktop/src/renderer/src/hooks/useAssistState.ts#useAssistState -->

[`src/renderer/src/hooks/useAssistState.ts`, lines 4–38](../../apps/desktop/src/renderer/src/hooks/useAssistState.ts#L4-L38)

```ts
/**
 * The app state, kept live for the parts the main process changes on its own: the mode, the
 * bubble's corner, the sign-in status and the chat. (Notes and settings only change through this
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
      window.assist.onCornerChanged((corner) => update((s) => ({ ...s, corner }))),
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

Fetches the whole app state (`AppState` in src/shared/types.ts: mode, corner, draft, settings,
branding, version, sign-in status and chat) when the page loads, then applies the changes the main
process broadcasts. It returns `null` until the first reply arrives.

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

[`src/renderer/src/hooks/useAssistState.ts`, lines 40–46](../../apps/desktop/src/renderer/src/hooks/useAssistState.ts#L40-L46)

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

[`src/renderer/src/hooks/useAssistState.ts`, lines 48–53](../../apps/desktop/src/renderer/src/hooks/useAssistState.ts#L48-L53)

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
`data-hit` (the chat card, each action icon and the settings menu). See
[Code Guide section 1](../CODE_GUIDE.md#1-background-how-an-electron-app-is-put-together) for the
background. Only `PanelView` uses it; the bubble window always takes the mouse.

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

## `src/renderer/src/views/BubbleView.tsx`: the logo bubble

The page shown in the small bubble window: one round button with the tenant's logo. A click asks
the main process what to do; pressing and moving drags the bubble.

### `logos`, `logoUrl`

<!-- code: apps/desktop/src/renderer/src/views/BubbleView.tsx#logos,logoUrl -->

[`src/renderer/src/views/BubbleView.tsx`, lines 7–14](../../apps/desktop/src/renderer/src/views/BubbleView.tsx#L7-L14)

```tsx
// The tenant's logo: logo.png, or logo.svg (if a tenant has both, the PNG wins).
const logos = import.meta.glob<string>('@tenant/logo.{png,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

const logoUrl =
  Object.entries(logos).find(([path]) => path.endsWith('.png'))?.[1] ?? Object.values(logos)[0]
```

<!-- /code -->

Finds the tenant's logo at build time.

- `import.meta.glob<string>('@tenant/logo.{png,svg}', {`: a Vite feature that imports every file
  matching a pattern. `@tenant` is the build's tenant folder (set up in electron.vite.config.ts), so
  this matches `logo.png` and/or `logo.svg`. The result is an object from file path to import.
- `eager: true`: import the files straight away, rather than as functions that load them later.
- `query: '?url'`: import each file as its URL (Vite copies the image into the build).
- `import: 'default'`: take each module's default export, which is that URL.
- `Object.entries(logos).find(([path]) => path.endsWith('.png'))?.[1]`: the PNG's URL if there is
  one.
- `?? Object.values(logos)[0]`: otherwise the only other match, the SVG. Every tenant must have a
  logo; tests/tenants.test.ts checks.

### `ACTION_LABEL`, `DRAG_THRESHOLD`

<!-- code: apps/desktop/src/renderer/src/views/BubbleView.tsx#ACTION_LABEL,DRAG_THRESHOLD -->

[`src/renderer/src/views/BubbleView.tsx`, lines 16–26](../../apps/desktop/src/renderer/src/views/BubbleView.tsx#L16-L26)

```tsx
const ACTION_LABEL: Record<Mode, string> = {
  collapsed: 'Open',
  expanded: 'Close',
  dragging: 'Moving',
  bouncing: 'Stop bouncing',
  returning: 'Returning',
  capturing: 'Taking screenshot',
}

/** Moving the pointer further than this while pressed turns a click into a drag. */
const DRAG_THRESHOLD = 5
```

<!-- /code -->

- `Record<Mode, string>`: a label for every `Mode` (src/shared/types.ts). TypeScript reports an
  error if a mode is ever added without one. The label becomes the button's accessible name for
  screen readers, such as "Open Desktop Assist".
- `DRAG_THRESHOLD = 5`: a press that moves no more than 5 pixels is still a click, so a slightly
  shaky click doesn't start a drag.

### `<BubbleView>`

<!-- code: apps/desktop/src/renderer/src/views/BubbleView.tsx#BubbleView -->

[`src/renderer/src/views/BubbleView.tsx`, lines 28–104](../../apps/desktop/src/renderer/src/views/BubbleView.tsx#L28-L104)

```tsx
/**
 * The always-on-top logo bubble. A click goes to the main process, which decides what it means.
 * Press and move to drag it: the main process makes it follow the mouse, and on release snaps it
 * to the nearest corner of whichever display it's on.
 */
export function BubbleView() {
  // No useClickThrough here: the bubble window always takes the mouse (see bubble/windows.ts).
  const state = useAssistState()
  useAccentColor(state?.branding.accentColor)
  const mode = state?.mode ?? 'collapsed'
  const appName = state?.branding.appName ?? 'Desktop Assist'

  const press = useRef<{ x: number; y: number; dragging: boolean } | null>(null)
  // A drag ends with a click event on the bubble; this stops it counting as a click.
  const swallowClick = useRef(false)

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    swallowClick.current = false
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
    <div className="flex h-full w-full items-center justify-center">
      <button
        data-hit
        type="button"
        aria-label={`${ACTION_LABEL[mode]} ${appName}`}
        title={mode === 'collapsed' ? 'Click to open, drag to move' : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPress}
        onLostPointerCapture={endPress}
        onClick={() => {
          if (swallowClick.current) swallowClick.current = false
          else window.assist.bubbleClick()
        }}
        style={{ width: UI.bubbleSize, height: UI.bubbleSize }}
        className={cn(
          'overflow-hidden rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.35)] outline-none',
          'transition-[transform,box-shadow] duration-150 ease-out motion-reduce:transition-none',
          mode === 'dragging' ? 'scale-105' : 'hover:scale-105 active:scale-95',
          // Always a 2px white border; while the panel is open, a purple one outside it.
          'ring-2',
          mode === 'expanded' ? 'ring-accent ring-offset-2 ring-offset-white' : 'ring-white',
        )}
      >
        <img
          src={logoUrl}
          alt=""
          draggable={false}
          className="pointer-events-none size-full object-contain"
        />
      </button>
    </div>
  )
}
```

<!-- /code -->

The bubble itself. It decides nothing on its own: clicks and drags are sent to `BubbleController`
in the main process, which owns the bubble's mode and position. In JSX, attributes are _props_, the
inputs a component receives. On built-in elements like `<button>` they become HTML attributes and
event handlers (`onClick`, `onPointerDown`); on our own components they arrive as the function's
argument (see `Panel` below).

- `const state = useAssistState()`: the bubble needs only the mode (for its look and label) and the
  branding. Until the state arrives, it falls back to `'collapsed'` and `'Desktop Assist'`.
- `useAccentColor(state?.branding.accentColor)`: `?.` because `state` is `null` at first.
- `const press = useRef<{ x: number; y: number; dragging: boolean } | null>(null)`: `useRef` gives
  a box (`.current`) that keeps its contents between renders, but unlike state, changing it doesn't
  re-render. It suits values that only event handlers need: here, where the press started and
  whether it has become a drag.
- `const swallowClick = useRef(false)`: releasing after a drag still fires a `click` on the
  button. This flag makes that one click be ignored.
- `if (event.button !== 0) return`: only the main (left) mouse button.
- `event.currentTarget.setPointerCapture(event.pointerId)`: sends all further events from this
  pointer to the button, even when the pointer is outside it, until it's released. The window is
  only 72 pixels square and gets moved during a drag, so without this the release could be lost.
- `if (!current || current.dragging) return`: only needed until the drag starts. From then on the
  main process moves the window with the mouse itself (`BubbleController.startDrag`), so the page
  just waits for the release.
- `Math.hypot(event.screenX - current.x, event.screenY - current.y) > DRAG_THRESHOLD`: the distance
  moved since the press, in screen coordinates, because the window itself moves once the drag
  starts.
- `window.assist.bubbleDragStart()`: tells the main process to start following the mouse.
- `function endPress() {`: runs on release. If the press had become a drag, it arms
  `swallowClick` and calls `bubbleDragEnd()`, and `BubbleController.endDrag` snaps the bubble to
  the nearest corner. If it was a plain click, it does nothing and the `click` event that follows
  handles it.
- `onLostPointerCapture={endPress}`: capture can also end without a release (the system can take
  it away), so this ends the press too. After a normal release both events fire; the second call
  finds `press.current` already `null` and does nothing.
- `onClick={() => {`: a real click calls `bubbleClick()`, and `BubbleController.clickBubble`
  decides what it means: open, close, or glide home from a bounce.
- `data-hit`: the marker `useClickThrough` looks for. The bubble window doesn't use click-through,
  so here it has no effect.
- `ACTION_LABEL[mode]`: the `aria-label` reads, for example, "Close Desktop Assist" while the panel
  is open.
- `style={{ width: UI.bubbleSize, height: UI.bubbleSize }}`: 56 pixels, the same number the main
  process uses to size the window (`BUBBLE_BOX`, 56 plus 8 on each side).
- `<div className="flex h-full w-full items-center justify-center">`: centres the button in the
  window. The 8-pixel margin around it leaves room for the shadow and ring.
- `shadow-[0_2px_6px_rgba(0,0,0,0.35)]`: square brackets give a Tailwind class a custom value (the
  underscores stand for spaces).
- `motion-reduce:transition-none`: no animation if animations are turned off in Windows.
- `mode === 'dragging' ? 'scale-105' : 'hover:scale-105 active:scale-95'`: slightly larger while
  dragged or hovered, slightly smaller while pressed.
- `ring-accent ring-offset-2 ring-offset-white`: while the panel is open, a 2-pixel white gap and
  then an accent-coloured ring. Otherwise the ring itself is white. Tailwind rings are drawn with
  `box-shadow`, which is why `box-shadow` is in the transition list.
- `draggable={false}`: stops the browser's own drag-the-image behaviour, which would take over the
  pointer.
- `pointer-events-none size-full object-contain`: the image ignores the mouse, so every event goes
  to the button; it fills the button without distortion.

## `src/renderer/src/views/PanelView.tsx`: everything around the bubble

The page shown in the panel window: the chat card, the action icons and the settings menu. All the
panel's shared state and handlers live in `Panel`; the components it renders (`ChatBox`,
`ActionStack`, `SettingsMenu`, `SignInPanel`, `Banner`) get their data and callbacks from it as
props. Those are covered in [the components part](8-renderer-components.md).

### `<PanelView>`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#PanelView -->

[`src/renderer/src/views/PanelView.tsx`, lines 14–20](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L14-L20)

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

[`src/renderer/src/views/PanelView.tsx`, lines 22–217](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L22-L217)

```tsx
function Panel({ state }: { state: AppState }) {
  const open = state.mode === 'expanded'
  const { branding, auth } = state

  // The draft is edited here and mirrored to the main process, which saves it.
  const [draft, setDraft] = useState(state.notes.text)
  const [attachments, setAttachments] = useState(state.notes.attachments)
  const [settings, setSettings] = useState(state.settings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, showToast] = useToast()

  useEffect(
    () =>
      window.assist.onModeChanged((mode) => {
        if (mode !== 'expanded') setSettingsOpen(false)
      }),
    [],
  )
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (settingsOpen) setSettingsOpen(false)
      else window.assist.collapse()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [settingsOpen])

  // Not signed in: the chat box shows the sign-in instead of the chat. While a saved sign-in is
  // being renewed, or JumpCloud can't be reached, the chat stays (sending tries JumpCloud again).
  const signedIn = auth.state === 'signed-in' || auth.state === 'offline'
  const busy = state.chat.some((message) => message.status === 'streaming')
  const canSend = signedIn && !busy && (draft.trim() !== '' || attachments.length > 0)

  async function runAction(id: ActionId) {
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

  async function attachLatest() {
    const result = await window.assist.notes.attachLatestScreenshot()
    if (result.ok) setAttachments(result.notes.attachments)
    else if (result.reason === 'no-screenshots') {
      showToast('No screenshots yet. Take one with the camera button.')
    } else showToast('That screenshot is already attached')
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

  async function newConversation() {
    await window.assist.chat.newConversation()
    setSettingsOpen(false)
    showToast('Started a new conversation')
  }

  async function setEffort(effort: Effort) {
    setSettings(await window.assist.settings.setEffort(effort))
  }

  // Clicking anywhere else in the panel closes the settings menu.
  function closeSettingsOnOutsideClick(event: PointerEvent) {
    if (!settingsOpen || !(event.target instanceof Element)) return
    if (!event.target.closest('[data-settings-menu], [data-action="settings"]')) {
      setSettingsOpen(false)
    }
  }

  const signInPrompt =
    auth.state === 'unconfigured' || auth.state === 'signed-out' || auth.state === 'signing-in' ? (
      <SignInPanel
        open={open}
        status={auth}
        appName={branding.appName}
        onSignIn={() => void window.assist.auth.signIn()}
        onCancel={() => void window.assist.auth.cancel()}
      />
    ) : null

  const banner =
    auth.state === 'checking' ? (
      <Banner spinner>Checking your JumpCloud sign-in…</Banner>
    ) : auth.state === 'offline' ? (
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

  const settingsIndex = branding.actions.indexOf('settings')

  return (
    <div
      className={cn('group relative h-full w-full', !open && 'pointer-events-none')}
      data-open={open ? '' : undefined}
      onPointerDown={closeSettingsOnOutsideClick}
    >
      <ChatBox
        corner={state.corner}
        open={open}
        toast={toast}
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
      />
      <ActionStack
        corner={state.corner}
        actions={branding.actions}
        open={open}
        activeId={settingsOpen ? 'settings' : null}
        onAction={(id) => void runAction(id)}
      />
      {open && settingsOpen && settingsIndex >= 0 && (
        <SettingsMenu
          corner={state.corner}
          offset={actionOffset(settingsIndex)}
          settings={settings}
          branding={branding}
          version={state.version}
          user={signedIn ? auth.user : null}
          onToggleAutoStart={async () =>
            setSettings(await window.assist.settings.setAutoStart(!settings.autoStart))
          }
          onSetEffort={(effort) => void setEffort(effort)}
          onSignOut={() => void signOut()}
          onOpenScreenshotsFolder={() => void window.assist.screenshots.openFolder()}
          onNewConversation={() => void newConversation()}
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
  mode (collapsed, dragging, bouncing and so on) it's closed or hidden.
- `const [draft, setDraft] = useState(state.notes.text)`: the text box's contents. Like
  `attachments` and `settings`, it starts from the app state but is then owned here: the panel
  updates it as you type and from the main process's replies.
- `const [settingsOpen, setSettingsOpen] = useState(false)`: whether the settings menu is showing.
- `const [toast, showToast] = useToast()`: the current toast and the function to show one.

Effects:

- `window.assist.onModeChanged((mode) => {`: closes the settings menu whenever the panel closes,
  so it isn't still open the next time. The arrow returns what `onModeChanged` returns, the
  unsubscribe function, which React uses as the cleanup.
- `if (event.key !== 'Escape') return`: Esc closes the settings menu if it's open, otherwise asks
  the main process to close the panel (`BubbleController.collapse`). Keys reach the panel because
  the main process focuses it when it opens.
- `}, [settingsOpen])`: the listener reads `settingsOpen`, and a function only sees the values from
  the render it was created in. Listing it here makes React remove the old listener and add a fresh
  one whenever the menu opens or closes.

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
- `onPointerDown={closeSettingsOnOutsideClick}`: see below.
- `<ChatBox`: the card. It gets what to draw (corner, toast, sign-in prompt, banner, messages, draft
  and attachments) and a callback for each thing you can do there.
- `onSend={() => void send()}`: the handlers are `async`, so they return promises. Each is wrapped
  in an arrow with `void`, which marks the promise as deliberately not awaited and makes the
  callback return nothing.
- `activeId={settingsOpen ? 'settings' : null}`: the gear stays highlighted while its menu is open.
- `{open && settingsOpen && settingsIndex >= 0 && (`: JSX's way of saying "only if": when any part
  is false, nothing is rendered. Removing the menu also resets its own state (its "click again to
  confirm" on New conversation).
- `offset={actionOffset(settingsIndex)}`: how far the gear is from the bubble, so the menu lines up
  with it.
- `user={signedIn ? auth.user : null}`: TypeScript allows `auth.user` here because it remembers
  that `signedIn` being true means `auth` is a state that has a user.
- `onToggleAutoStart={async () =>`: flips Start with Windows and shows the settings the main
  process returns.

#### `signedIn`, `busy`, `canSend`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.signedIn,busy,canSend -->

[`src/renderer/src/views/PanelView.tsx`, lines 50–54](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L50-L54)

```tsx
// Not signed in: the chat box shows the sign-in instead of the chat. While a saved sign-in is
// being renewed, or JumpCloud can't be reached, the chat stays (sending tries JumpCloud again).
const signedIn = auth.state === 'signed-in' || auth.state === 'offline'

const busy = state.chat.some((message) => message.status === 'streaming')

const canSend = signedIn && !busy && (draft.trim() !== '' || attachments.length > 0)
```

<!-- /code -->

Values worked out on every render from the current state.

- `auth.state === 'signed-in' || auth.state === 'offline'`: `offline` counts as signed in: the
  sign-in is kept while JumpCloud can't be reached, and sending a message tries JumpCloud again.
- `state.chat.some((message) => message.status === 'streaming')`: Claude is still replying.
- `draft.trim() !== '' || attachments.length > 0`: there must be some text or at least one
  screenshot. `ChatBox` disables Send, and Enter does nothing, unless `canSend` is true.

#### `runAction`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.runAction -->

[`src/renderer/src/views/PanelView.tsx`, lines 56–66](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L56-L66)

```tsx
async function runAction(id: ActionId) {
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

- `if (id === 'settings') {`: Settings is a "popover" action (src/shared/actions.ts): it opens UI
  inside the panel and never reaches the main process.
- `setSettingsOpen(!settingsOpen)`: setting state doesn't change the variable in this run of the
  function. `settingsOpen` still holds the value from before the toggle, so the next line's
  `if (!settingsOpen)` means "the menu is being opened now".
- `setSettings(await window.assist.settings.get())`: refreshes the settings as the menu opens,
  because Start with Windows can also be changed in Windows Settings.
- `window.assist.invokeAction(id)`: after the `settings` branch returns, TypeScript knows `id` is
  `screenshot`, `bounce` or `close`, which is exactly the `CommandActionId` type `invokeAction`
  accepts. The main process runs the matching handler from src/main/actions.ts.
- `if (result.message) showToast(result.message, result.ok ? 'info' : 'error')`: for example
  "Screenshot saved", or "Couldn't take a screenshot" in red. Bounce and close return no message.

#### `changeDraft`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.changeDraft -->

[`src/renderer/src/views/PanelView.tsx`, lines 68–71](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L68-L71)

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

[`src/renderer/src/views/PanelView.tsx`, lines 73–84](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L73-L84)

```tsx
async function send() {
  if (!canSend) return
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

Sends the draft to Claude.

- `if (!canSend) return`: a second guard; `ChatBox` checks too.
- `window.assist.chat.send(draft)`: only the text is sent. The main process takes the attachments
  from its own copy of the draft, prepares the screenshots and starts the reply (the `chatSend`
  handler in src/main/ipc.ts). Claude's reply doesn't come back here: it streams in through
  `onChatMessage` in `useAssistState`.
- `setDraft(result.notes.text)`: the main process cleared the draft after sending; the box adopts
  the cleared version, as do the attachments.
- `result.reason === 'missing-screenshot'`: an attached file was deleted after it was attached.
- `result.reason === 'signed-out'`: the sign-in ran out just before sending.

The other two reasons, `busy` and `empty`, are ignored: `canSend` already rules them out.

#### `attachLatest`, `removeAttachment`, `openAttachment`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.attachLatest,removeAttachment,openAttachment -->

[`src/renderer/src/views/PanelView.tsx`, lines 86–102](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L86-L102)

```tsx
async function attachLatest() {
  const result = await window.assist.notes.attachLatestScreenshot()
  if (result.ok) setAttachments(result.notes.attachments)
  else if (result.reason === 'no-screenshots') {
    showToast('No screenshots yet. Take one with the camera button.')
  } else showToast('That screenshot is already attached')
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

- `window.assist.notes.attachLatestScreenshot()`: the main process finds the newest file in the
  screenshots folder and adds it to the draft.
- `else showToast('That screenshot is already attached')`: the only other failure,
  `already-attached`.
- `window.assist.notes.removeAttachment(attachment.id)`: returns the updated draft, whose
  attachment list the panel adopts.
- `window.assist.screenshots.open(attachment.path)`: opens the file in the default image viewer;
  `false` means the file is gone.

#### `copy`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.copy -->

[`src/renderer/src/views/PanelView.tsx`, lines 104–107](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L104-L107)

```tsx
async function copy(text: string) {
  await window.assist.copyText(text)
  showToast('Copied')
}
```

<!-- /code -->

The Copy button on Claude's replies. The main process writes the text to the clipboard
(`clipboard.writeText` in src/main/ipc.ts).

#### `signOut`, `newConversation`, `setEffort`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.signOut,newConversation,setEffort -->

[`src/renderer/src/views/PanelView.tsx`, lines 109–123](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L109-L123)

```tsx
async function signOut() {
  setSettingsOpen(false)
  await window.assist.auth.signOut()
  showToast('Logged out')
}

async function newConversation() {
  await window.assist.chat.newConversation()
  setSettingsOpen(false)
  showToast('Started a new conversation')
}

async function setEffort(effort: Effort) {
  setSettings(await window.assist.settings.setEffort(effort))
}
```

<!-- /code -->

Settings menu actions.

- `await window.assist.auth.signOut()`: `AuthManager.signOut` forgets the saved sign-in. Because
  this is a log-out, the main process also starts a new conversation (`onSignedOut` in
  src/main/index.ts). The new `signed-out` status and the chat reset arrive through
  `useAssistState`, and the chat card switches to the sign-in.
- `await window.assist.chat.newConversation()`: `ChatSession` forgets the conversation and
  broadcasts a reset, which empties the chat in `useAssistState`.
- `setSettings(await window.assist.settings.setEffort(effort))`: saves the response style (Fast,
  Balanced or Thorough) and shows the settings the main process returns.

#### `closeSettingsOnOutsideClick`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.closeSettingsOnOutsideClick -->

[`src/renderer/src/views/PanelView.tsx`, lines 125–131](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L125-L131)

```tsx
// Clicking anywhere else in the panel closes the settings menu.
function closeSettingsOnOutsideClick(event: PointerEvent) {
  if (!settingsOpen || !(event.target instanceof Element)) return
  if (!event.target.closest('[data-settings-menu], [data-action="settings"]')) {
    setSettingsOpen(false)
  }
}
```

<!-- /code -->

Closes the settings menu when you press anywhere else in the panel. The page only receives the
press where the window takes the mouse, so "elsewhere" means the chat card or another icon.
Clicking outside the panel altogether takes focus away from the window, the main process closes
the panel (`BubbleController.panelBlurred`), and the mode effect above closes the menu.

- `event: PointerEvent`: React's own event type, imported from `react`, not the browser's.
- `!(event.target instanceof Element)`: `target` is typed as a general `EventTarget`; this check
  lets TypeScript allow `closest`.
- `closest('[data-settings-menu], [data-action="settings"]')`: presses inside the menu or on the
  gear don't count. Without the gear exception, pressing the gear would close the menu on the way
  down and its click would open it again straight away.

#### `signInPrompt`, `banner`: sign-in or chat

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.signInPrompt,banner -->

[`src/renderer/src/views/PanelView.tsx`, lines 133–161](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L133-L161)

```tsx
const signInPrompt =
  auth.state === 'unconfigured' || auth.state === 'signed-out' || auth.state === 'signing-in' ? (
    <SignInPanel
      open={open}
      status={auth}
      appName={branding.appName}
      onSignIn={() => void window.assist.auth.signIn()}
      onCancel={() => void window.assist.auth.cancel()}
    />
  ) : null

const banner =
  auth.state === 'checking' ? (
    <Banner spinner>Checking your JumpCloud sign-in…</Banner>
  ) : auth.state === 'offline' ? (
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

| `auth.state`   | The chat card shows                                  |
| -------------- | ---------------------------------------------------- |
| `unconfigured` | Sign-in: "Sign-in isn't set up yet"                  |
| `signed-out`   | Sign-in: "Sign in with JumpCloud"                    |
| `signing-in`   | Sign-in: "Finish signing in in your browser", Cancel |
| `checking`     | The chat, "Checking…" banner; sending is off         |
| `offline`      | The chat, the reason and Retry; sending works        |
| `signed-in`    | The chat                                             |

- `auth.state === 'unconfigured' || auth.state === 'signed-out' || auth.state === 'signing-in'`:
  inside the `? (` branch, TypeScript has narrowed `auth` to those three states, which is exactly
  the type `SignInPanel`'s `status` prop accepts.
- `onSignIn={() => void window.assist.auth.signIn()}`: `AuthManager.signIn` opens JumpCloud in the
  browser and returns at once. Progress arrives as status changes (`signing-in`, then
  `signed-in`), and the main process reopens the panel when it's done.
- `onCancel={() => void window.assist.auth.cancel()}`: stops waiting for the browser.
- `<Banner spinner>`: shown while a saved sign-in is being renewed, at startup or after Retry. The
  chat is visible, but `signedIn` is false, so nothing can be sent yet.
- `onClick={() => void window.assist.auth.retry()}`: `AuthManager.retry` tries again to renew the
  saved sign-in.
- `{auth.message}`: the offline reason, written by `AuthManager`.

#### `settingsIndex`

<!-- code: apps/desktop/src/renderer/src/views/PanelView.tsx#Panel.settingsIndex -->

[`src/renderer/src/views/PanelView.tsx`, line 163](../../apps/desktop/src/renderer/src/views/PanelView.tsx#L163)

```tsx
const settingsIndex = branding.actions.indexOf('settings')
```

<!-- /code -->

Where the gear is in the tenant's list of icons (`actions` in tenant.json), counting from the
bubble. It's `-1` if the tenant doesn't show Settings, and then the menu is never drawn.
