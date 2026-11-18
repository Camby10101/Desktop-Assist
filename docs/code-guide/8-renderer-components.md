# The UI components

[← Code Guide](CODE_GUIDE.md)

These nine files draw almost everything that appears around the bubble when you click it. `Panel`
in `PanelView.tsx` (see [The pages](7-renderer-pages.md)) renders four of them directly: the
`ActionStack` of round icons in a column beside the bubble, the `ChatBox` card next to the bubble on
the side facing the middle of the screen, the `SettingsMenu`, which opens beside the gear icon (with
`SizeControl`, her size, as one of its rows), and the `SpellsMenu`, which opens beside the wand icon.
Everything else lives inside the chat card: `SignInPanel` replaces the chat while nobody is signed
in, `MessageList` shows the conversation (using `Markdown` for Claude's replies), and an
`AttachmentChip` above the text box stands for each attached screenshot. When questions go to Claude
Desktop (the tenant's `chatApp`), there's no sign-in and no conversation in the panel, so the card
is just the text box, with an "Ask in Claude" button. The card can show the Apps list instead,
either from the start or behind an icon, depending on the tenant; that component, `AppsList`, is
covered in [Your apps](10-apps.md). It can also show the Jira page, the service desk page or a
Jira issue, which are in [The Jira and service desk pages](12-atlassian-pages.md).

One more component belongs to the bubble's page instead: `Character`, with its stylesheet
`character.css`, the pixel-art character that stands in for the bubble. Her frames are drawn by
code in `src/renderer/src/character/`: a tiny pixel rasteriser (`raster.ts`), the rig that poses
and draws her (`rig.ts`), the parts of her drawn by hand (`pictures.ts`) and her animations
(`sprite.ts`). `BubbleView` renders `Character`, and so does `ClonesView`, once for each of her
clones; all of these are covered near the end of this page. Last come the pixel art of her spells'
effects, which `SpellView` draws, in nine files: where things are, moment by moment
(`lib/spellMotion.ts`), the helpers that draw a pixel at a time (`lib/pixels.ts`), starfall, the
explosion and which spell draws what (`lib/spellArt.ts`), and the six newer spells, a file each in
`lib/spells/` (`fireworks.ts`, `thunderstorm.ts`, `blizzard.ts`, `vortex.ts`, `butterflies.ts`
and `phoenix.ts`). The very last are the screen saver's scenes, which `ScreenSaverView` draws with
the same helpers, in four files in `lib/screensaver/`: what they share (`scene.ts`), her sunset
(`sunset.ts`), the starfall on her other screens (`stars.ts`) and her in the sunset, from behind
(`her.ts`).

## `src/renderer/src/components/ChatBox.tsx`: the chat card

The card beside the bubble, with the text box at its bottom, drawn as a speech bubble: a tail on
its side nearest her points at her mouth, as if she were saying it. `Panel` renders one `ChatBox`
and passes it everything it shows: the bubble's `corner`, the `layout` for her size, her size
itself (`scale`, for the tail), whether the panel is `open`, the current
`toast`, the conversation (`messages`), the `draft` and its `attachments`, whether Claude is
replying (`busy`), whether Send is allowed (`canSend`), whether questions go to Claude Desktop
(`inClaudeDesktop`) and, if so, whether they're sent there automatically (`autoSend`). `Panel` also
builds the optional pieces that go inside it: a page to show instead (`page`), the sign-in
(`signInPrompt`) and a status line (`banner`). The `on…` props are what the buttons and the text box
call; `issueKeys`, `onOpenIssue` and `onReport` are for Jira and the service desk. The file has
four components: `ChatBox` (the card), `SpeechTail` (its tail) and `Composer` (the text box), both
private to this file, and `Banner` (exported, used by `Panel`).

### `ChatBox`

<!-- code: apps/desktop/src/renderer/src/components/ChatBox.tsx#ChatBox -->

[`src/renderer/src/components/ChatBox.tsx`, lines 27–142](../../apps/desktop/src/renderer/src/components/ChatBox.tsx#L27-L142)

```tsx
/**
 * The card beside the bubble, on the side facing the middle of the screen: a speech bubble, its
 * tail pointing at her mouth (see SpeechTail). It's anchored at the bubble's edge (bottom in a
 * bottom corner, top in a top corner), so it starts as just the text box and grows away from that
 * edge as the conversation gets longer, then scrolls. When nobody is
 * signed in, `signInPrompt` is shown instead of the chat. With `inClaudeDesktop`, it's only the
 * text box, and sending opens the question in Claude Desktop. While a page's icon is on (Apps,
 * Jira, the service desk), the page shows instead.
 */
export function ChatBox(props: {
  corner: Corner
  /** Where things sit for her size: the card goes beside her. */
  layout: PanelLayout
  /** Her size (see CHARACTER_SIZES), for the tail to reach her mouth. */
  scale: number
  open: boolean
  toast: ToastMessage | null
  /** Sending hands the question to Claude Desktop instead of the chat in the panel. */
  inClaudeDesktop: boolean
  /** With Claude Desktop: the question (and screenshot) is sent there for the user. */
  autoSend: boolean
  /** Replaces the text box with a page while its icon is on (the Apps list, Jira), or null. */
  page: ReactNode
  /** Replaces the chat (the JumpCloud sign-in), or null to show the chat. */
  signInPrompt: ReactNode
  /** A line above the text box, e.g. "Checking your sign-in…". */
  banner: ReactNode
  messages: ChatMessage[]
  busy: boolean
  canSend: boolean
  draft: string
  attachments: Attachment[]
  onDraftChange: (text: string) => void
  onSend: () => void
  onStop: () => void
  onRetry: () => void
  onCopy: (text: string) => void
  onAttachLatest: () => void
  onOpenAttachment: (attachment: Attachment) => void
  onRemoveAttachment: (attachment: Attachment) => void
  /** Jira issue keys in the text, each offered as a chip that opens the issue. */
  issueKeys: string[]
  onOpenIssue: (key: string) => void
  /** Turns the text (and screenshots) into an IT request; null without a service desk form. */
  onReport: (() => void) | null
}) {
  // The card's height, for the tail to stay on it however short it is.
  const card = useRef<HTMLDivElement>(null)
  const [cardHeight, setCardHeight] = useState(0)
  useEffect(() => {
    const element = card.current
    if (!element) return
    const observer = new ResizeObserver(() => setCardHeight(element.offsetHeight))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={card}
      data-hit
      className={cn(
        'absolute flex flex-col rounded-2xl border shadow-xl',
        'border-black/10 bg-white text-zinc-900 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100',
        originClass(props.corner),
        'scale-95 opacity-0 transition duration-150 ease-out',
        'group-data-open:scale-100 group-data-open:opacity-100',
        'motion-reduce:transition-none',
      )}
      style={{
        ...anchored(props.corner, props.layout.chatX, props.layout.chatY),
        width: UI.panelWidth,
        maxHeight: UI.panelMaxHeight,
      }}
    >
      <SpeechTail
        corner={props.corner}
        layout={props.layout}
        scale={props.scale}
        cardHeight={cardHeight}
      />
      {props.toast && (
        <div
          key={props.toast.id}
          role="status"
          className={cn(
            'absolute rounded-full px-3 py-1.5 text-xs font-medium shadow-lg',
            // Just outside the card, on the side away from the screen edge.
            isTopCorner(props.corner) ? 'top-full mt-2' : 'bottom-full mb-2',
            isLeftCorner(props.corner) ? 'left-0' : 'right-0',
            props.toast.tone === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900',
          )}
        >
          {props.toast.text}
        </div>
      )}

      {props.page ?? props.signInPrompt ?? (
        <>
          {props.messages.length > 0 && (
            <MessageList
              messages={props.messages}
              onRetry={props.onRetry}
              onCopy={props.onCopy}
              onOpenScreenshot={props.onOpenAttachment}
            />
          )}
          {props.banner}
          <Composer {...props} />
        </>
      )}
    </div>
  )
}
```

<!-- /code -->

`ChatBox` draws the card and places it in the panel window. Inside it shows a toast (if there is
one), then either the sign-in or the chat: the conversation, the banner and the text box. It
needs a few ideas that the rest of this page relies on.

**Components, props and JSX.** A React component is a function that returns a description of
the UI. React calls `ChatBox(props)` again whenever its inputs change. The HTML-like `<div …>` it
returns is JSX: the build turns each tag into a function call that creates a lightweight
description, and React then updates the real page (the DOM) to match. Lowercase tags (`div`,
`button`) are HTML elements; capitalised ones (`MessageList`, `Composer`) are other components.
The attributes written on a component's tag become its _props_, the single object it receives;
the type after `props:` lists every prop it accepts. Inside JSX, curly braces `{…}` switch back to
ordinary TypeScript. `className` is JSX's name for HTML's `class`.

**Callbacks.** The `on…` props are functions. The card never talks to the main process itself:
when you press Send it calls `props.onSend()`, and `Panel` does the work (see `send()` in
[The pages](7-renderer-pages.md)). That keeps every decision in one place.

**Tailwind classes and `cn()`.** These components have almost no CSS of their own. Each element
lists small _utility classes_ that each do one thing: `absolute` is `position: absolute`,
`rounded-2xl` rounds the corners, `px-3` sets the left and right padding, `text-xs` is small text.
Tailwind generates CSS for just the classes the code uses. A prefix makes a class conditional:
`hover:` applies while the pointer is over the element, `dark:` while the app is in dark mode,
`disabled:` while a button is disabled. `bg-accent` and `text-accent` use the tenant's colour,
which `styles.css` defines and `useAccentColor` sets at runtime (see
[The pages](7-renderer-pages.md)). `cn()` (from `lib/cn.ts`) joins class strings and drops
`false`, `null` and `undefined`, which is what lets you write `condition && 'some-class'` inside
it.

**`data-hit`.** The panel window is a large transparent rectangle that normally lets clicks fall
through to whatever is underneath. `useClickThrough` (see [The pages](7-renderer-pages.md))
switches mouse input on only while the pointer is over an element that is, or is inside, one
marked `data-hit`. So every piece of real UI must carry it. Here it's the whole card, which covers
everything inside it; in `SettingsMenu` and `SpellsMenu` it's the menu, and in `ActionStack` each
icon.

**How the layout mirrors for each corner.** The layout works from any corner of the screen,
though the character only ever lives near the two bottom ones, and the panel always opens toward
the middle. The panel window shares its outer corner with the
bubble's window (`panelWindowBounds` in [The bubble](5-bubble.md)), so the components measure
their positions from that corner. `panelLayout(scale)` in `src/shared/geometry.ts` gives each
piece's distance from it for her size, `X` across and `Y` away from the screen edge (see
[Shared code and the preload bridge](1-shared-and-preload.md)). `Panel` works it out once and
passes it to each component as its `layout` prop; the bigger she is, the further out everything
sits, since her box and the padding round it grow with her. `anchored(corner, x, y)` from
`lib/anchor.ts` turns those two numbers into CSS: `right` and `bottom` in the bottom-right corner,
`left` and `top` in the top-left, and so on. So the same numbers work in all four corners, and a
component only has to check the corner where something must change direction (the toast here,
the order of the icons in `ActionStack`). In the bottom-right corner it looks roughly like this;
the other corners are mirror images:

```text
                                       [close]
                                       [spells]      <- SpellsMenu opens leftward, over the card
  +-----------------------------+      [settings]    <- SettingsMenu opens leftward, over the card
  | MessageList                 |      [screenshot]
  | Banner (only sometimes)     |
  | Composer                    |     ( bubble )
  +-----------------------------+
```

The parts of `ChatBox` itself:

- `layout: PanelLayout`: as the comment says, where things sit for her size; the card goes beside
  her. `PanelLayout` is the type of what `panelLayout()` returns.
- `scale: number`: as the comment says, her size, so the tail reaches her mouth however big she
  is.
- `inClaudeDesktop: boolean`: `ChatBox` only passes it on to `Composer`, which changes the send
  button. The rest of the card needs no change: with Claude Desktop, `Panel` never passes a
  sign-in prompt or any messages, so the card is just the text box (and sometimes a banner).
- `autoSend: boolean`: the "Send in Claude automatically" setting, also only for `Composer`'s
  wording.
- `page: ReactNode`: as the comment says, a page that replaces the text box while its icon is on
  (the Apps list, the Jira page, the service desk page, or an issue over one of them), built by
  `Panel` like `signInPrompt`; otherwise `null`.
- `const card = useRef<HTMLDivElement>(null)`, `cardHeight`: as the comment says, the card's
  height, so the tail stays on the card however short it is. The card grows and shrinks with what's
  in it, so it's measured rather than worked out. `ref={card}` on the card's `<div>` puts the
  element in `card.current` once it's on the page.
- `new ResizeObserver(() => setCardHeight(element.offsetHeight))`: the browser calls this whenever
  the card's size changes (and once when it starts watching), and `offsetHeight` is its height in
  pixels, borders included. Keeping it in state redraws the tail to match. The effect runs once
  (`[]`), and its cleanup stops the watching (`disconnect()`).
- `originClass(props.corner)`: sets the CSS `transform-origin` to the bubble's corner (for
  example `origin-bottom-right`), so the zoom-in animation grows out of the bubble.
- `'scale-95 opacity-0 transition duration-150 ease-out'`: the card is always rendered, even
  while the panel is closed. It's just invisible and slightly shrunk.
- `'group-data-open:scale-100 group-data-open:opacity-100'`: `Panel`'s outer `<div>` has the
  class `group`, and a `data-open` attribute while the panel is open. `group-data-open:` means
  "when an ancestor marked `group` has `data-open`". So opening animates the card in over 150 ms,
  and closing animates it out; the main process waits 150 ms (`PANEL_FADE_MS` in
  `BubbleController.ts`) before hiding the window, so the fade-out can be seen.
- `'motion-reduce:transition-none'`: when Windows is set to show fewer animations (the system's
  reduced-motion setting), the card appears and disappears instantly.
- `...anchored(props.corner, props.layout.chatX, props.layout.chatY)`: `style` takes an object of
  CSS properties, and plain numbers mean pixels. At her usual size `chatX` is 100 (the 8 px padding
  around the bubble, the 80 px bubble and a 12 px gap), so the card starts just past the bubble.
  `chatY` is 8, so the card's near edge is level with the bubble's. At twice her size they're 188
  (16 + 160 + 12) and 16.
- `maxHeight: UI.panelMaxHeight`: nothing sets a height. The card is pinned at the bubble's edge
  and grows away from it as content is added, up to 520 px. After that the message list scrolls.
- `<SpeechTail ... />`: the tail, drawn first inside the card but placed outside it, on the side
  towards her (see below). It's given the corner, the layout, her size and the card's height.
- `{props.toast && (`: the part after `&&` is rendered only when the left side is truthy, so
  with no toast nothing is drawn. Toasts come from `useToast` in `Panel` and vanish after 2.6
  seconds.
- `key={props.toast.id}`: a `key` tells React which element is which. Each toast has a new id,
  so React puts in a fresh element for each new message instead of editing the old one's text.
- `role="status"`: screen readers read the toast out without moving the keyboard focus.
- `isTopCorner(props.corner) ? 'top-full mt-2' : 'bottom-full mb-2'`: the toast sits just
  outside the card, on the side facing the middle of the screen: above the card in a bottom
  corner, below it in a top corner. The panel window has 40 px spare beyond the card's full
  height (`UI.toastRoom`), so the toast always fits.
- `isLeftCorner(props.corner) ? 'left-0' : 'right-0'`: lines the toast up with the card's edge
  nearest the bubble.
- `{props.page ?? props.signInPrompt ?? (`: `??` uses the left side unless it's `null` or
  `undefined`, so the first of the three that isn't `null` is shown: a page if one is on,
  otherwise the sign-in if nobody is signed in, otherwise the chat. Never more than one. The toast
  above stays outside this choice, so it shows over the pages too.
- `<>`: a _fragment_. It groups several elements without adding an extra `<div>` to the page.
- `props.messages.length > 0 &&`: before the first message there's no list, so the card is just
  the text box.
- `{props.banner}`: whatever `Banner` `Panel` built (or `null`), between the conversation and the
  text box.
- `<Composer {...props} />`: `{...props}` passes every one of `ChatBox`'s props on to `Composer`
  unchanged.

### `MOUTH_ROW`, `TAIL_REACH`, `TAIL_SHARE`, `CARD_RADIUS` and `SpeechTail`

<!-- code: apps/desktop/src/renderer/src/components/ChatBox.tsx#MOUTH_ROW,TAIL_REACH,TAIL_SHARE,CARD_RADIUS,SpeechTail -->

[`src/renderer/src/components/ChatBox.tsx`, lines 144–229](../../apps/desktop/src/renderer/src/components/ChatBox.tsx#L144-L229)

```tsx
/** Her mouth, in sprite pixels down from the top of her window (rig.ts draws it there). */
const MOUTH_ROW = 33.5

/** How far from her middle the tail would reach (sprite pixels): just short of her face and hair. */
const TAIL_REACH = 11

/** How much of the way from the card to her mouth it goes, so it's short, aimed at her mouth. */
const TAIL_SHARE = 0.55

/** The card's corner radius (`rounded-2xl`), which the tail's base keeps clear of. */
const CARD_RADIUS = 16

/**
 * The speech bubble's tail: from the card's side nearest her, pointing at her mouth, at her
 * height and size, so it points at her mouth however big she is (her mouth is at MOUTH_ROW of her
 * 96-pixel grid, scaled with her). Its sides curve out of the card's edge in rounded joins and
 * narrow to a sharp point at her mouth, like a drawn speech bubble's. Its base slides along the card's edge to stay level with her
 * mouth, but never into the card's rounded corners, so on a card shorter than her mouth is high
 * (just the text box, at a big size) it slants up to her instead. It's drawn in the card's own
 * colours and border, overlapping the card's edge by a pixel so the two read as one shape, and it
 * ignores the mouse, so it never gets between the pointer and her.
 */
function SpeechTail(props: {
  corner: Corner
  layout: PanelLayout
  scale: number
  cardHeight: number
}) {
  const { scale, layout } = props
  const { box } = bubbleMetrics(scale)
  // Where her mouth is: how far out from the card's edge (stopping just short of her face) and how
  // high above the card's near edge (its bottom, in a bottom corner).
  const reach = Math.max(8, layout.chatX - (box / 2 + TAIL_REACH * scale))
  const mouth = (SPRITE_SIZE - MOUTH_ROW) * scale - layout.chatY
  // Half the base's width, and how far along the card's edge, beyond it, each side curves in
  // from, so the tail grows out of the card in a rounded join; both grow with her.
  const half = 9 + 2 * scale
  const curve = half * 0.7
  const lowest = CARD_RADIUS + half + curve
  const highest = Math.max(lowest, props.cardHeight - CARD_RADIUS - half - curve)
  const base = Math.min(Math.max(mouth, lowest), highest)
  // The tip: TAIL_SHARE of the way from the middle of the base towards her mouth, so the tail is
  // short, but points at her mouth wherever on the card it starts.
  const out = reach * TAIL_SHARE
  const up = base + (mouth - base) * TAIL_SHARE
  const width = out + 2
  const height = Math.max(up, base + half + curve) + 2
  // A point `x` out from the card's edge and `u` up from its near edge, in the drawing's terms.
  const at = (x: number, u: number) => `${x.toFixed(1)} ${(height - u).toFixed(1)}`
  // Each side's direction from its end of the base to the tip, and how far that is.
  const toTip = (from: number) => {
    const length = Math.hypot(out, up - from)
    return { x: out / length, u: (up - from) / length, pull: length * 0.45 }
  }
  const upper = toTip(base + half)
  const lower = toTip(base - half)
  const sides = [
    `M${at(0, base + half + curve)}`,
    // Out of the card's edge, leaving it along the edge, to the tip, arriving straight at it.
    `C${at(0, base + half)} ${at(out - upper.x * upper.pull, up - upper.u * upper.pull)} ${at(out, up)}`,
    // From the tip back to the card's edge, the same way round: the two sides meet in a point.
    `C${at(out - lower.x * lower.pull, up - lower.u * lower.pull)} ${at(0, base - half)} ${at(0, base - half - curve)}`,
  ].join(' ')
  const left = isLeftCorner(props.corner)
  const top = isTopCorner(props.corner)
  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="pointer-events-none absolute overflow-visible"
      style={{
        // On the side towards her, over the card's border by a pixel.
        [left ? 'right' : 'left']: 'calc(100% - 1px)',
        [top ? 'top' : 'bottom']: 0,
        // Drawn going right from a bottom edge; mirrored for the other sides.
        transform: `scale(${left ? -1 : 1}, ${top ? -1 : 1})`,
      }}
    >
      {/* Filled up to a pixel inside the card, over its border, so the join doesn't show. */}
      <path
        d={`${sides} L${at(-1, base - half - curve)} L${at(-1, base + half + curve)} Z`}
        className="fill-white dark:fill-zinc-900"
      />
      <path d={sides} fill="none" className="stroke-black/10 dark:stroke-white/10" />
    </svg>
  )
}
```

<!-- /code -->

The speech bubble's tail.

- `MOUTH_ROW = 33.5`: as its comment says, her mouth, in sprite pixels down from the top of her
  window, which is where the rig draws it (`rig.ts`). Her window is `SPRITE_SIZE` (96) sprite
  pixels tall, one DIP each at her usual size, so the mouth's height above her feet grows with her.
- `TAIL_REACH = 11`: as its comment says, how far from her middle the tail would reach, in sprite
  pixels: just short of her face and hair. That's the point it aims at; it doesn't go all the way.
- `TAIL_SHARE = 0.55`: as its comment says, how much of the way from the card to her mouth the
  tail goes, a little over half, so it's short but still aimed at her mouth.
- `CARD_RADIUS = 16`: as its comment says, the card's corner radius (`rounded-2xl` is 16 px). The
  tail's base keeps clear of the rounded corners, where it would leave a gap.

As the comment on `SpeechTail` says, the tail grows out of the card's side nearest her and points
at her mouth, at her height and size, so it points at her mouth however big she is. Its sides curve
out of the card's edge in rounded joins, the way a speech bubble's tail is drawn by hand, and
narrow to a sharp point at her mouth. Its base slides along the card's edge to stay level with her mouth, but never past the card's rounded
corners: on a card shorter than her mouth is high (just the text box, when she's big), it slants
up to her instead. It's drawn in the card's own colours and border, a pixel over the card's edge so
the two read as one shape, and it ignores the mouse.

The measurements, all in DIPs, as for the bottom-right corner (the others are mirror images):

- `const { box } = bubbleMetrics(scale)`: her window's width at her size, 96 at her usual size.
- `reach` and `mouth`: as the comment says, where her mouth is, measured from the card.
  - `reach = Math.max(8, layout.chatX - (box / 2 + TAIL_REACH * scale))`: how far out from the
    card's edge, stopping just short of her face. The card's edge is `chatX` from the corner the
    panel shares with her window, and her middle is half her window from it; the point stops
    `TAIL_REACH` (times her size) short of her middle. At her usual size that's 100 − (48 + 11) =
    41; at twice it, 188 − (96 + 22) = 70. It's never less than 8.
  - `mouth = (SPRITE_SIZE - MOUTH_ROW) * scale - layout.chatY`: how high above the card's near
    edge (its bottom, in a bottom corner). Her mouth is 96 − 33.5 = 62.5 sprite pixels above her
    feet, which are on her window's bottom edge, and the card's bottom is `chatY` above that edge.
    At her usual size, 62.5 − 8 = 54.5.
- `half = 9 + 2 * scale`: half the width of the tail's base, 11 at her usual size (a base of 22),
  a little wider when she's bigger.
- `curve = half * 0.7`: how far along the card's edge, beyond each end of the base, each side
  starts curving away from it, so the tail grows out of the card in a rounded join instead of
  meeting it at a corner.
- `lowest`, `highest`: how near to the card's bottom and top edges the middle of the base may go
  while the whole base, joins included, stays clear of the rounded corners. On a card too short
  for both, `highest` is no lower than `lowest`.
- `base = Math.min(Math.max(mouth, lowest), highest)`: the middle of the base: level with her
  mouth when that fits on the card, otherwise as near as it can be.
- `out = reach * TAIL_SHARE`, `up = base + (mouth - base) * TAIL_SHARE`: as the comment says, the
  tip, `TAIL_SHARE` (0.55) of the way from the middle of the base towards her mouth. Because it's
  on the line from the base to her mouth, the tail points at her mouth wherever on the card it
  starts, though it stops a little over halfway. At her usual size it sticks out 41 × 0.55, about
  22.6 DIPs (38.5 at twice her size). With the base level with her mouth, `up` is just `mouth` and
  the tail runs straight across; with the base held lower (a short card), it slants up towards her
  mouth.
- `width = out + 2`, `height = Math.max(up, base + half + curve) + 2`: the size of the drawing,
  tall enough for the tip and the base with its joins, with 2 DIPs to spare for the outline.
- `at(x, u)`: a point `x` out from the card's edge and `u` up from its near edge, written as SVG
  wants it: SVG measures `y` down from the top, so `u` becomes `height - u`. `toFixed(1)` keeps the
  path short.
- `toTip(from)`: for a side starting at height `from` on the card's edge, a step of 1 in the
  direction of the tip (`x`, `u`), and `pull`, 45% of the way there: how far back from the tip the
  side's last control point is, which sets how gently it curves.
- `upper`, `lower`: the two sides, from the base's upper and lower ends.
- `sides`: the outline that sticks out of the card, as an SVG path:
  - `M`: starts on the card's edge, `curve` above the base's upper end.
  - `C`: a curve (a _cubic Bézier_, steered by two control points) to the tip. Its first control
    point is the base's upper end on the card's edge, so it leaves the card along the edge (the
    rounded join); its second is `pull` back from the tip, straight towards the base's upper end,
    so it arrives at the tip on that side's straight line.
  - `C`: the lower side, the same curve the other way, from the tip back to the card's edge
    `curve` below the base's lower end. The two sides arrive at the tip from different directions,
    so they meet in a sharp point there.

The JSX:

- `aria-hidden`: it's decoration, so screen readers skip it.
- `className="pointer-events-none absolute overflow-visible"`: it ignores the mouse (so, as the
  comment says, it never gets between the pointer and her), it's placed against the card, and the
  outline can spill over its edges.
- `[left ? 'right' : 'left']: 'calc(100% - 1px)'`: on the side of the card towards her: in a
  right-hand corner its left edge is the card's right edge, less a pixel, so it covers the card's
  border there and the two join up. `[top ? 'top' : 'bottom']: 0`: level with the card's near
  edge.
- `transform: scale(...)`: the path is worked out pointing right from a bottom edge, so in a
  left-hand corner it's flipped across, and in a top corner upside down.
- The first `<path>`: as its comment says, the tail filled with the card's colour: `sides`, then
  two lines a pixel inside the card (`at(-1, ...)`), back to where it started (`Z` closes it). Being
  a pixel over the card's border, it hides the border where the tail joins, so the card and the
  tail read as one shape.
- The second `<path>`: `sides` alone, unfilled (`fill="none"`), in the card's border colour: the
  outline along the curved sides to the point, but not along the card's edge, which the
  card's own border already has.

### `Composer`

<!-- code: apps/desktop/src/renderer/src/components/ChatBox.tsx#Composer -->

[`src/renderer/src/components/ChatBox.tsx`, lines 231–372](../../apps/desktop/src/renderer/src/components/ChatBox.tsx#L231-L372)

```tsx
/** The text box: attached screenshots, the text, and the attach / send / stop buttons. */
function Composer(props: Parameters<typeof ChatBox>[0]) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  const placedCaret = useRef(false)

  // Focus the text box whenever the panel opens; the first time, put the caret at the end.
  useEffect(() => {
    const el = textarea.current
    if (!props.open || !el) return
    el.focus()
    if (!placedCaret.current) {
      placedCaret.current = true
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [props.open])

  // Enter sends; Shift+Enter starts a new line.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (props.canSend) props.onSend()
    }
  }

  return (
    <div
      className={cn(
        'shrink-0',
        props.messages.length > 0 && 'border-t border-black/5 dark:border-white/10',
      )}
    >
      {props.attachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-3 pt-3">
          {props.attachments.map((attachment) => (
            <AttachmentChip
              key={attachment.id}
              attachment={attachment}
              onOpen={() => props.onOpenAttachment(attachment)}
              onRemove={() => props.onRemoveAttachment(attachment)}
            />
          ))}
        </div>
      )}
      {props.inClaudeDesktop && props.attachments.length > 0 && (
        <p className="px-3.5 pt-2 text-[11px] text-zinc-500">
          {props.attachments.length === 1 ? 'The screenshot' : 'The screenshots'}
          {props.autoSend && props.draft.trim()
            ? ' will be pasted into Claude for you.'
            : ' will be copied for you to paste into Claude with Ctrl+V.'}
        </p>
      )}

      {props.issueKeys.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
          {props.issueKeys.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => props.onOpenIssue(key)}
              title={`Open ${key}`}
              className="inline-flex items-center gap-1 rounded-full border border-black/10 px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <Ticket size={12} className="text-accent dark:text-accent-soft" aria-hidden />
              Open {key}
            </button>
          ))}
        </div>
      )}

      <textarea
        ref={textarea}
        value={props.draft}
        onChange={(event) => props.onDraftChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask anything…"
        aria-label="Message Claude"
        spellCheck
        className={cn(
          'block max-h-40 min-h-11 w-full resize-none overflow-y-auto bg-transparent field-sizing-content',
          'px-3.5 pt-3 pb-1 text-sm leading-relaxed outline-none placeholder:text-zinc-400',
        )}
      />

      <div className="flex items-center gap-1 px-2 pb-2">
        <button
          type="button"
          onClick={props.onAttachLatest}
          title="Attach the latest screenshot (click again for the one before)"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
        >
          <Paperclip size={14} aria-hidden />
          Attach screenshot
        </button>
        {props.onReport && (
          <button
            type="button"
            onClick={props.onReport}
            title="Report a problem to IT, with this text and screenshot"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            <LifeBuoy size={14} aria-hidden />
            Report to IT
          </button>
        )}
        <span className="flex-1" />
        {props.busy ? (
          <button
            type="button"
            onClick={props.onStop}
            aria-label="Stop"
            title="Stop"
            className="grid size-8 place-items-center rounded-full bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
          >
            <Square size={12} fill="currentColor" aria-hidden />
          </button>
        ) : props.inClaudeDesktop ? (
          <button
            type="button"
            onClick={props.onSend}
            disabled={!props.canSend}
            title={props.autoSend ? 'Send in Claude (Enter)' : 'Open in Claude (Enter)'}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-accent pr-2.5 pl-3 text-xs font-medium text-white disabled:opacity-40"
          >
            Ask in Claude
            <ArrowUpRight size={14} aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={props.onSend}
            disabled={!props.canSend}
            aria-label="Send"
            title="Send (Enter)"
            className="grid size-8 place-items-center rounded-full bg-accent text-white disabled:opacity-40"
          >
            <ArrowUp size={16} aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}
```

<!-- /code -->

The text box at the bottom of the card: the attached screenshots, the text itself, and the
buttons under it. It's a separate component so it can have its own refs and effect; only
`ChatBox` uses it.

**Refs.** React runs a component's function again on every render, so its ordinary local
variables start afresh each time. `useRef(initial)` gives a small box, `.current`, that keeps its
value between renders. Changing it doesn't redraw anything. `Composer` has two: `textarea` is
attached to the `<textarea>` element with `ref={textarea}`, so React puts the real DOM element in
`textarea.current` (needed to call `.focus()`); `placedCaret` is just a remembered flag.

**Effects.** `useEffect(fn, [deps])` runs `fn` after React has updated the page, and again only
when a value in the dependency list `[deps]` has changed. It also runs once when the component
first appears. Effects are for work outside drawing the UI, such as moving the keyboard focus.

- `function Composer(props: Parameters<typeof ChatBox>[0])`: `Parameters<typeof ChatBox>` is
  TypeScript for "the types of `ChatBox`'s arguments", and `[0]` is its props object. So
  `Composer` takes exactly the same props without repeating the long list.
- `}, [props.open])`: the effect runs when the panel opens or closes; the early `return` skips
  the close. On open it focuses the text box so you can type straight away. Because it also runs
  when `Composer` first appears, the box is focused after you sign in with the panel open.
- `el.setSelectionRange(el.value.length, el.value.length)`: only the first time, puts the caret
  at the end, since the draft may have been restored from the last session. After that the caret
  stays wherever you left it.
- `!event.nativeEvent.isComposing`: while typing with an input method (for example for Japanese
  or Chinese), Enter confirms the chosen characters. This check stops that Enter from sending.
- `event.preventDefault()`: stops Enter adding a new line. Enter never adds a line, even when the
  message can't be sent yet (for example while Claude is replying); Shift+Enter skips this whole
  `if` and adds one.
- `{props.attachments.map((attachment) => (`: `.map` turns each attachment into an
  `AttachmentChip`. The arrow functions passed as `onOpen` and `onRemove` remember which
  attachment the chip is for.
- `key={attachment.id}`: every item in a list needs a `key` that stays the same between renders,
  so React can tell the items apart when one is removed.
- `overflow-x-auto`: with many attachments, the row of chips scrolls sideways.
- `{props.inClaudeDesktop && props.attachments.length > 0 && (`: with Claude Desktop, a small
  note under the chips says what will happen to the screenshots. A link to Claude Desktop can
  carry text but not images, so they go on the clipboard to be pasted (see
  [Claude Desktop](9-claude-desktop.md)). It says "The screenshot" or "The screenshots" to match
  how many there are.
- `props.autoSend && props.draft.trim() ? ... : ...`: with "Send in Claude automatically" on and a
  question typed, Desktop Wizard pastes them itself ("will be pasted into Claude for you").
  Otherwise the user pastes them with Ctrl+V. A screenshot without a question is never pasted
  for the user, so the second wording also covers that.
- `{props.issueKeys.length > 0 && (`: a button for each Jira issue key in the text, which `Panel`
  finds, such as **Open ISD-1234** with a ticket icon (`Ticket`). Clicking one opens the issue in
  the card (`Panel.openIssue`), or in the browser when not connected to Atlassian. `flex-wrap`
  lets several wrap onto more lines.
- `value={props.draft}`: a _controlled_ text box. What it shows always comes from the `draft`
  prop, not from the element's own memory.
- `onChange={(event) => props.onDraftChange(event.target.value)}`: React's `onChange` fires on
  every keystroke. It calls `Panel`'s `changeDraft`, which updates `draft` and sends the text to
  the main process to be saved (`NotesStore.setText`; see
  [The draft, screenshots and safe files](6-drafts-and-screenshots.md)).
- `field-sizing-content`: CSS `field-sizing: content` makes the text box grow with its text, from
  `min-h-11` (44 px) to `max-h-40` (160 px), after which it scrolls.
- `spellCheck`: turns on Chromium's spell checker. Right-clicking a misspelt word shows
  suggestions in the menu built by `addEditContextMenu` in `src/main/bubble/windows.ts`.
- `<Paperclip size={14} aria-hidden />`: the icons come from lucide-react, where every icon is a
  small React component that draws an SVG. `size` sets its width and height in pixels.
  `aria-hidden` hides it from screen readers, since the button's text or `aria-label` already
  says what it does.
- `onClick={props.onAttachLatest}`: **Attach screenshot**. `Panel.attachLatest` adds the newest
  screenshot to the draft, or shows a toast saying why it couldn't; the tooltip says it's the
  latest one.
- `{props.onReport && (`: **Report to IT**, with a lifebuoy icon (`LifeBuoy`), only when the
  tenant lists request types (`Panel` passes `null` otherwise). It opens the service desk page on
  New request, which starts from the text box and its screenshots (`Panel.report`).
- `<span className="flex-1" />`: an empty element that takes up the spare room, pushing the send
  button to the right-hand end of the row.
- `props.busy ? (`: while Claude is replying, Send is replaced by Stop. `Panel` sets `busy` when
  any message is still `streaming`, which only happens in the built-in chat.
- `fill="currentColor"`: lucide icons are outlines; this fills the square with the text colour so
  it reads as a solid "stop" symbol.
- `) : props.inClaudeDesktop ? (`: a second condition, chained on the first. Not busy and handing
  questions to Claude Desktop: the button is a pill that says **Ask in Claude**, with an arrow
  pointing up and out (`ArrowUpRight`), since the question opens in another app. Otherwise it's
  the round Send arrow (`ArrowUp`). Enter does the same as either button.
- `title={props.autoSend ? 'Send in Claude (Enter)' : 'Open in Claude (Enter)'}`: the tooltip
  says whether the question will be sent in Claude or only opened there. The Ask button has no
  `aria-label`, because its visible text already names it; the round Send button has only an
  icon, so it needs one.
- `disabled={!props.canSend}`: `Panel` allows sending only when you're signed in (always, with
  Claude Desktop), Claude isn't replying, no question is already being handed to Claude Desktop,
  and there's text or a screenshot. `disabled:opacity-40` fades the button out.

### `Banner`

<!-- code: apps/desktop/src/renderer/src/components/ChatBox.tsx#Banner -->

[`src/renderer/src/components/ChatBox.tsx`, lines 374–383](../../apps/desktop/src/renderer/src/components/ChatBox.tsx#L374-L383)

```tsx
/** A one-line status above the text box, with an optional action. */
export function Banner(props: { spinner?: boolean; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-black/5 px-3.5 py-2 text-xs text-zinc-500 dark:border-white/10">
      {props.spinner && <LoaderCircle size={12} className="animate-spin" aria-hidden />}
      <span className="flex-1">{props.children}</span>
      {props.action}
    </div>
  )
}
```

<!-- /code -->

A one-line status strip between the conversation and the text box. `Panel` uses it in three
cases: "Checking your JumpCloud sign-in…" with a spinner while a saved sign-in is renewed at
startup, the "couldn't reach JumpCloud" message with a Retry button (see
[JumpCloud sign-in](3-sign-in.md)), and, with Claude Desktop, "Claude Desktop isn't installed on
this PC…" with a Download button.

- `spinner?: boolean`: the `?` makes the prop optional. Writing `<Banner spinner>` with no value
  means `spinner={true}`.
- `children: ReactNode`: `children` is a special prop holding whatever is written between
  `<Banner>` and `</Banner>`. `ReactNode` is the type for anything React can display: text,
  elements, or `null`.
- `action?: ReactNode`: an optional element at the right-hand end, such as `Panel`'s Retry or
  Download button.
- `animate-spin`: Tailwind's spinning animation, applied to lucide's `LoaderCircle` icon.
- `flex-1`: the text takes all the spare width, which pushes the action to the right.

## `src/renderer/src/components/MessageList.tsx`: the conversation

The scrolling list of messages at the top of the chat card. `ChatBox` renders it once there's at
least one message. Its props are `messages` (the chat from the app state, kept up to date by
`useAssistState`; see [The pages](7-renderer-pages.md)), and `onRetry` and `onCopy` from `Panel`.
Your messages and Claude's are drawn by different components.

### `MessageList`

<!-- code: apps/desktop/src/renderer/src/components/MessageList.tsx#STICK_THRESHOLD,MessageList -->

[`src/renderer/src/components/MessageList.tsx`, lines 8–66](../../apps/desktop/src/renderer/src/components/MessageList.tsx#L8-L66)

```tsx
/** Within this many pixels of the bottom counts as "at the bottom". */
const STICK_THRESHOLD = 40

/**
 * The conversation. It follows new text as it streams in, unless you've scrolled up to read
 * something earlier. Sending a message always brings it back to the bottom.
 */
export function MessageList(props: {
  messages: ChatMessage[]
  onRetry: () => void
  onCopy: (text: string) => void
  onOpenScreenshot: (attachment: Attachment) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const lastSentId = useRef<string | undefined>(undefined)

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    // A message you've just sent: follow it and the reply, even if you'd scrolled up.
    const sentId = props.messages.findLast((m) => m.role === 'user')?.id
    if (sentId !== lastSentId.current) {
      lastSentId.current = sentId
      stickToBottom.current = true
    }
    if (stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [props.messages])

  return (
    <div
      ref={scroller}
      onScroll={(event) => {
        const el = event.currentTarget
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD
      }}
      className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 pt-3.5 pb-1"
      aria-live="polite"
    >
      {props.messages.map((message, index) =>
        message.role === 'user' ? (
          <UserMessage
            key={message.id}
            message={message}
            onOpenScreenshot={props.onOpenScreenshot}
          />
        ) : (
          <AssistantMessage
            key={message.id}
            message={message}
            canRetry={index === props.messages.length - 1}
            onRetry={props.onRetry}
            onCopy={props.onCopy}
          />
        ),
      )}
    </div>
  )
}
```

<!-- /code -->

Draws each message, and keeps the view scrolled to the bottom as a reply streams in. If you
scroll up to read something earlier it stops following; scrolling back to the bottom, or sending a
message, turns following on again.

- `const stickToBottom = useRef(true)`: whether to follow new text. It's a ref rather than state
  because changing it doesn't need anything redrawn.
- `const lastSentId = useRef<string | undefined>(undefined)`: the id of the newest message you
  sent, as of the last update, so the effect can tell when you've just sent another.
- `useLayoutEffect(() => {`: like `useEffect`, but it runs after React has changed the page and
  before the browser paints it. Scrolling there means you never see a frame with the new text
  hidden below the visible area.
- `}, [props.messages])`: runs whenever the list changes. `useAssistState` makes a new array for
  every update, including each batch of streamed text (at most one every 50 ms), so this runs as
  the reply grows.
- `const sentId = props.messages.findLast((m) => m.role === 'user')?.id`: the newest message
  you sent. When it differs from last time you've just sent one, so following is switched back on:
  your message and Claude's reply come into view even if you'd scrolled up to read something.
- `el.scrollTop = el.scrollHeight`: scrolls to the bottom. The browser clamps the value to the
  furthest it can actually scroll.
- `onScroll={(event) => {`: on every scroll, works out how far the view is from the bottom
  (`scrollHeight - scrollTop - clientHeight`) and follows only if that's under `STICK_THRESHOLD`
  (40 px). The effect's own scrolling lands at 0, so following stays on.
- `min-h-0 flex-1 overflow-y-auto`: the list takes whatever height the card has left after the
  text box, and scrolls. `min-h-0` matters because an item in a flex column normally refuses to
  shrink below its content's height, which would push the text box out of the card.
- `aria-live="polite"`: screen readers announce new text in the list when they're not busy.
- `message.role === 'user' ? (`: chooses the component by who sent the message.
- `key={message.id}`: each message's id from `ChatSession` is its list key.
- `canRetry={index === props.messages.length - 1}`: only the last message may offer Retry, since
  `ChatSession.retry()` asks again for the latest reply (see [Talking to Claude](4-claude.md)).

### `UserMessage`

<!-- code: apps/desktop/src/renderer/src/components/MessageList.tsx#UserMessage -->

[`src/renderer/src/components/MessageList.tsx`, lines 68–95](../../apps/desktop/src/renderer/src/components/MessageList.tsx#L68-L95)

```tsx
function UserMessage({
  message,
  onOpenScreenshot,
}: {
  message: ChatMessage
  onOpenScreenshot: (attachment: Attachment) => void
}) {
  return (
    <div className="ml-auto flex max-w-[85%] flex-col items-end gap-1.5">
      {message.attachments.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {message.attachments.map((attachment) => (
            <SentScreenshot
              key={attachment.id}
              attachment={attachment}
              onOpen={() => onOpenScreenshot(attachment)}
            />
          ))}
        </div>
      )}
      {message.text && (
        <div className="rounded-2xl rounded-br-md bg-accent px-3 py-2 text-sm whitespace-pre-wrap text-white select-text">
          {message.text}
        </div>
      )}
    </div>
  )
}
```

<!-- /code -->

Your own message, on the right: any screenshots, then the text in an accent-coloured bubble.

- `function UserMessage({`: the braces in the parameter list pull `message` and
  `onOpenScreenshot` straight out of the props object (_destructuring_).
- `ml-auto`: with `items-end`, pushes the message to the right. `max-w-[85%]` is Tailwind's
  syntax for a one-off value; it keeps the message from spanning the whole card.
- `{message.text && (`: a message can be screenshots only, with no text.
- `whitespace-pre-wrap`: keeps the line breaks you typed with Shift+Enter. Your text is shown
  exactly as typed, not as Markdown.
- `select-text`: `styles.css` turns text selection off for the whole page (so the UI doesn't feel
  like a web page); this turns it back on so you can select and copy your own message.
- `rounded-br-md`: a smaller bottom-right corner, the usual chat-bubble "tail".

### `SentScreenshot`

<!-- code: apps/desktop/src/renderer/src/components/MessageList.tsx#SentScreenshot -->

[`src/renderer/src/components/MessageList.tsx`, lines 97–110](../../apps/desktop/src/renderer/src/components/MessageList.tsx#L97-L110)

```tsx
/** A sent screenshot's thumbnail. Opening it goes through the panel, which says if it's gone. */
function SentScreenshot({ attachment, onOpen }: { attachment: Attachment; onOpen: () => void }) {
  const thumbnail = useThumbnail(attachment.path)
  return (
    <button
      type="button"
      title={attachment.fileName}
      onClick={onOpen}
      className="h-12 w-20 overflow-hidden rounded-lg border border-black/10 bg-zinc-200 dark:border-white/10 dark:bg-zinc-700"
    >
      {thumbnail && <img src={thumbnail} alt="" className="size-full object-cover" />}
    </button>
  )
}
```

<!-- /code -->

A small thumbnail of a screenshot sent with a message. Clicking it opens the file in your image
viewer.

- `useThumbnail(attachment.path)`: a hook (see [The pages](7-renderer-pages.md)) that asks the
  main process for a small preview. It returns `undefined` while loading, `null` if the file is
  gone, or a `data:` URL to use as the image. Until there's an image the button is an empty grey
  box.
- `onClick={onOpen}`: opening goes through the panel. `ChatBox` passes the same handler the draft
  chips use, `Panel.openAttachment` (see [The pages](7-renderer-pages.md)), which asks the main
  process to open the file and shows "That screenshot can't be found" if it has been deleted.
- `alt=""`: the image is decorative; the button's `title` tooltip shows the file name.
- `object-cover`: fills the 80 × 48 px box, cropping the screenshot rather than squashing it.

### `AssistantMessage`

<!-- code: apps/desktop/src/renderer/src/components/MessageList.tsx#AssistantMessage -->

[`src/renderer/src/components/MessageList.tsx`, lines 112–160](../../apps/desktop/src/renderer/src/components/MessageList.tsx#L112-L160)

```tsx
function AssistantMessage(props: {
  message: ChatMessage
  canRetry: boolean
  onRetry: () => void
  onCopy: (text: string) => void
}) {
  const { message } = props
  const waiting = message.status === 'streaming' && !message.text

  return (
    <div className="group/message max-w-full text-sm text-zinc-800 dark:text-zinc-100">
      {waiting ? <Thinking /> : message.text && <Markdown text={message.text} />}

      {(message.notice || message.status === 'done') && (
        <div className="mt-1 flex items-center gap-2 text-xs">
          {message.notice && (
            <span
              className={cn(
                message.status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-zinc-500',
              )}
            >
              {message.notice}
            </span>
          )}
          {message.retryable && props.canRetry && (
            <button
              type="button"
              onClick={props.onRetry}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-accent hover:bg-zinc-100 dark:text-accent-soft dark:hover:bg-zinc-800"
            >
              <RotateCcw size={12} aria-hidden /> Retry
            </button>
          )}
          {message.text && message.status !== 'streaming' && (
            <button
              type="button"
              aria-label="Copy reply"
              title="Copy reply"
              onClick={() => props.onCopy(message.text)}
              className="rounded-md p-1 text-zinc-400 opacity-0 group-hover/message:opacity-100 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <Copy size={12} aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

<!-- /code -->

Claude's reply: full width, with no bubble, rendered as Markdown. Below it is a small row with any
notice, a Retry button for a failed reply, and Copy.

- `const { message } = props`: destructuring again, so the code can say `message` rather than
  `props.message`.
- `const waiting = message.status === 'streaming' && !message.text`: the reply has started but
  no text has arrived yet (Claude may think for a while first).
- `{waiting ? <Thinking /> : message.text && <Markdown text={message.text} />}`: the `? :` picks
  one of the two. As each chunk of text arrives the whole reply is rendered as Markdown again.
- `(message.notice || message.status === 'done') &&`: the footer row appears once the reply has
  finished (`done`), or when there's a notice. `ChatSession` gives every stopped or failed reply a
  notice ("Stopped.", or the error message), so in practice the row shows for every finished
  reply and never while text is streaming.
- `message.status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-zinc-500'`: errors in
  red; other notices (stopped, refused, cut off at the length limit) in grey.
- `message.retryable && props.canRetry`: Retry only for a failed reply that `ChatSession` marked
  retryable (a temporary error, with no text kept from it), and only on the last message. It calls
  `window.assist.chat.retry()` through `Panel`.
- `message.text && message.status !== 'streaming'`: Copy appears once there's a finished text to
  copy.
- `group/message`: a _named group_. `group-hover/message:opacity-100` shows the Copy button
  (normally `opacity-0`) only while the pointer is over this message. The name keeps it separate
  from `Panel`'s `group`, which wraps the whole panel. `focus-visible:opacity-100` shows it when
  you reach it with Tab.
- `onClick={() => props.onCopy(message.text)}`: copies the reply's Markdown source, not the
  formatted text. `Panel.copy` puts it on the clipboard (through the main process) and shows a
  "Copied" toast.

### `Thinking`

<!-- code: apps/desktop/src/renderer/src/components/MessageList.tsx#Thinking -->

[`src/renderer/src/components/MessageList.tsx`, lines 162–177](../../apps/desktop/src/renderer/src/components/MessageList.tsx#L162-L177)

```tsx
function Thinking() {
  return (
    <div className="flex items-center gap-1.5 py-1 text-xs text-zinc-500" role="status">
      <span className="flex gap-0.5" aria-hidden>
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 animate-bounce rounded-full bg-zinc-400"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      Thinking…
    </div>
  )
}
```

<!-- /code -->

Three bouncing dots and the word "Thinking…", shown until the first text of a reply arrives.

- `[0, 150, 300].map((delay) => (`: three dots, each starting its `animate-bounce` 150 ms after
  the one before, so they ripple.
- `animationDelay`: set as an inline style because Tailwind only generates classes it finds
  written out in full in the source, so it can't build one from a variable.
- `role="status"`: screen readers announce "Thinking…"; the dots are `aria-hidden`, so they're
  skipped.

## `src/renderer/src/components/Markdown.tsx`: rendering Claude's replies

Turns a reply's Markdown into formatted text: headings, lists, tables, links and highlighted code.
Only `AssistantMessage` uses it, with one prop, `text`. The look (spacing, code backgrounds, the
highlight colours) comes from the `.markdown` and `.hljs-…` rules in `styles.css`.

### `components`

<!-- code: apps/desktop/src/renderer/src/components/Markdown.tsx#components -->

[`src/renderer/src/components/Markdown.tsx`, lines 5–18](../../apps/desktop/src/renderer/src/components/Markdown.tsx#L5-L18)

```tsx
// Links open in the default browser instead of inside the panel.
const components: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault()
        if (href) void window.assist.openExternal(href)
      }}
    >
      {children}
    </a>
  ),
}
```

<!-- /code -->

Tells react-markdown how to draw particular HTML elements. Only links are changed.

- `const components: Components = {`: declared outside the component, so the object is made once
  rather than on every render.
- `a: ({ href, children }) => (`: react-markdown calls this for every link instead of making a
  plain `<a>`, passing the props it would have used. `children` is the link text.
- `event.preventDefault()`: stops the click navigating the panel's own page to the link. The main
  process would refuse that navigation anyway (`lockDown` in `src/main/bubble/windows.ts`).
- `if (href) void window.assist.openExternal(href)`: asks the main process to open the link in
  your default browser, or an email link (`mailto:`) in your email app. Anything else, such as
  `file:` or `javascript:`, is refused (`ExternalUrl` in `src/main/ipc.ts`).

### `Markdown`

<!-- code: apps/desktop/src/renderer/src/components/Markdown.tsx#Markdown -->

[`src/renderer/src/components/Markdown.tsx`, lines 20–36](../../apps/desktop/src/renderer/src/components/Markdown.tsx#L20-L36)

```tsx
/**
 * Renders Claude's reply: GitHub-flavoured Markdown (tables, task lists) with highlighted code.
 * Raw HTML in the text is never rendered, so a reply can't inject markup.
 */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false }]]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
```

<!-- /code -->

react-markdown parses the text and builds React elements from it directly, so no HTML string is
ever inserted into the page. Raw HTML written in a reply is shown as plain text rather than
rendered (react-markdown does this unless a plugin such as `rehype-raw` is added, and none is), and
its default link check blanks out unsafe addresses such as `javascript:`. So a reply can't inject
markup or scripts into the panel.

- `className="markdown"`: hooks into the `.markdown` styles in `styles.css`, sized for the narrow
  panel. They also turn text selection back on, so replies can be selected and copied.
- `remarkPlugins={[remarkGfm]}`: _remark_ plugins work on the Markdown before it becomes HTML.
  remark-gfm adds GitHub's extensions: tables, task lists (`- [ ]`), `~~strikethrough~~`,
  footnotes, and bare web addresses turned into links.
- `rehypePlugins={[[rehypeHighlight, { detect: false }]]}`: _rehype_ plugins work on the HTML
  tree afterwards. rehype-highlight colours code blocks with highlight.js (through the lowlight
  library), adding the `hljs-…` classes that `styles.css` colours. The inner array is the plugin
  followed by its options. `detect: false` means only a code block that names its language (a
  fence like ` ```ts `) is highlighted; unlabelled blocks stay plain rather than being guessed at.
  It knows highlight.js's common languages; a block in any other language is left plain.
- `{text}`: the Markdown goes in as the component's children.

## `src/renderer/src/components/SignInPanel.tsx`: the sign-in prompts

Shown in the chat card instead of the conversation while nobody is signed in. `Panel` builds it
and passes it to `ChatBox` as `signInPrompt` when the sign-in status (`AuthStatus`, kept by
`AuthManager`; see [JumpCloud sign-in](3-sign-in.md)) is `unconfigured`, `signed-out` or
`signing-in`. Its props are `open`, that `status`, the app's name, and `onSignIn` and `onCancel`,
which `Panel` wires to `window.assist.auth.signIn()` and `window.assist.auth.cancel()`.

### `SignInPanel`

<!-- code: apps/desktop/src/renderer/src/components/SignInPanel.tsx#SignInPanel -->

[`src/renderer/src/components/SignInPanel.tsx`, lines 5–88](../../apps/desktop/src/renderer/src/components/SignInPanel.tsx#L5-L88)

```tsx
/**
 * Shown in place of the chat while nobody is signed in. Signing in happens in the browser, on
 * JumpCloud's own page; if the user is already signed in to JumpCloud there, it finishes by itself
 * and the chat appears.
 */
export function SignInPanel(props: {
  open: boolean
  status: Extract<AuthStatus, { state: 'unconfigured' | 'signed-out' | 'signing-in' }>
  appName: string
  onSignIn: () => void
  onCancel: () => void
}) {
  const { status } = props
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (props.open) button.current?.focus()
  }, [props.open, status.state])

  if (status.state === 'unconfigured') {
    return (
      <Card icon={<Settings2 size={16} aria-hidden />} title="Sign-in isn't set up yet">
        <p className="text-xs text-zinc-500">
          {props.appName} still needs to be connected to JumpCloud and Claude. Your IT team can do
          this by following docs/JUMPCLOUD_SETUP.md. Missing settings:
        </p>
        <ul className="list-inside list-disc text-[11px] text-zinc-500">
          {status.missing.map((name) => (
            <li key={name}>
              <code>{name}</code>
            </li>
          ))}
        </ul>
      </Card>
    )
  }

  if (status.state === 'signing-in') {
    return (
      <Card
        icon={<LoaderCircle size={16} className="animate-spin" aria-hidden />}
        title="Finish signing in in your browser"
      >
        <p className="text-xs text-zinc-500">
          JumpCloud opened in your browser. Once you're signed in there, come back here.
        </p>
        <div className="flex justify-end">
          <button
            ref={button}
            type="button"
            onClick={props.onCancel}
            className="rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      </Card>
    )
  }

  return (
    <Card icon={<LogIn size={16} aria-hidden />} title="Sign in to start chatting">
      {status.message ? (
        <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">
          {status.message}
        </p>
      ) : (
        <p className="text-xs text-zinc-500">Use your work JumpCloud account.</p>
      )}
      <button
        ref={button}
        type="button"
        onClick={props.onSignIn}
        className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90"
      >
        Sign in with JumpCloud
      </button>
      <p className="text-[11px] leading-relaxed text-zinc-500">
        This opens JumpCloud in your browser. If you're already signed in there, it finishes on its
        own, and you'll stay signed in here.
      </p>
    </Card>
  )
}
```

<!-- /code -->

Three versions, one for each state: "Sign-in isn't set up yet", "Finish signing in in your
browser" with Cancel, and "Sign in to start chatting" with the Sign in button.

- `status: Extract<AuthStatus, { state: 'unconfigured' | 'signed-out' | 'signing-in' }>`:
  `AuthStatus` is a _union_ of six shapes, one per `state`. `Extract` keeps just the three that
  match, so TypeScript won't let anyone pass a signed-in status here.
- `const button = useRef<HTMLButtonElement>(null)`: the same ref is attached (`ref={button}`) to
  whichever button is showing, Sign in or Cancel.
- `if (props.open) button.current?.focus()`: moves the keyboard focus to that button, so Enter or
  Space presses it. With no text box on screen, nothing else would have focus. In the
  `unconfigured` version there's no button; `?.` skips the call when `button.current` is `null`.
- `}, [props.open, status.state]`: focuses again when the panel opens and when the state changes,
  because a different button appears.
- `if (status.state === 'unconfigured') {`: checking `state` _narrows_ the type. Inside this
  branch TypeScript knows `status` has `missing`; after the two early `return`s it knows only
  `signed-out` is left, which has the optional `message`.
- `status.missing.map((name) => (`: lists the tenant.json settings that are still empty (from
  `missingSettings()` in `src/main/tenant.ts`), each name also serving as its `key`.
- `if (status.state === 'signing-in') {`: while `AuthManager.signIn()` waits for the browser to
  come back from JumpCloud.
- `onClick={props.onCancel}`: `AuthManager.cancelSignIn()` stops waiting, and the status goes back
  to `signed-out` with no message.
- `{status.message ? (`: after a sign-in expires or fails, `AuthManager` sets a message saying
  why. It's shown in amber with `role="alert"`, which screen readers read out at once. Otherwise
  there's a short hint.
- `onClick={props.onSignIn}`: starts the browser sign-in (`AuthManager.signIn()`).

### `Card`

<!-- code: apps/desktop/src/renderer/src/components/SignInPanel.tsx#Card -->

[`src/renderer/src/components/SignInPanel.tsx`, lines 90–102](../../apps/desktop/src/renderer/src/components/SignInPanel.tsx#L90-L102)

```tsx
function Card(props: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/10 text-accent dark:text-accent-soft">
          {props.icon}
        </span>
        <p className="text-sm font-semibold">{props.title}</p>
      </div>
      {props.children}
    </div>
  )
}
```

<!-- /code -->

The layout the three versions share: a round icon badge and a bold title, then whatever content is
passed as `children`.

- `bg-accent/10`: the `/10` makes the accent colour 10% opaque, a pale tint behind the icon.
- `dark:text-accent-soft`: a lighter accent (`--color-accent-soft` in `styles.css`) that's easier
  to read on a dark background.

## `src/renderer/src/components/SettingsMenu.tsx`: the settings menu

The small menu that opens beside the gear icon. `Panel` renders it only while the panel is open, the
gear has toggled it on, and the tenant's list of actions includes `settings`. Its props are the
`corner`, `layout` and `offset` for positioning; the current `settings`, her `size`, `branding` (app
and company name, and which kind of chat), `version`, signed-in `user`, the `atlassianUser`
connected to Atlassian and how Check for updates is going (`update`) to display; and one callback
per menu item, `onToggleTheme`, `onSetSize`, `onSetHabits`, `onUninstall`, `onDisconnectAtlassian`
and `onCheckForUpdates` included. `Panel` closes it on
Esc, on a click anywhere else in the panel, and when the panel closes.

### `CONFIRM_MS`, `EFFORTS`

<!-- code: apps/desktop/src/renderer/src/components/SettingsMenu.tsx#CONFIRM_MS,EFFORTS -->

[`src/renderer/src/components/SettingsMenu.tsx`, lines 21–27](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L21-L27)

```tsx
const CONFIRM_MS = 3000

const EFFORTS: { value: Effort; label: string; hint: string }[] = [
  { value: 'low', label: 'Fast', hint: 'Quick answers' },
  { value: 'medium', label: 'Balanced', hint: 'Thinks a little longer' },
  { value: 'high', label: 'Thorough', hint: 'Thinks hardest; slower' },
]
```

<!-- /code -->

- `const CONFIRM_MS = 3000`: how long "New conversation" (or "Clear text box") waits for its
  second click.
- `EFFORTS: { value: Effort; label: string; hint: string }[]`: the three response styles. Each
  maps an `Effort` value (what's sent to the Claude API) to the label on its button and a tooltip.
  Typing `value` as `Effort` means TypeScript rejects a misspelt value. The API side is
  `AnthropicBackend.reply` in [Talking to Claude](4-claude.md).

### `SettingsMenu`

<!-- code: apps/desktop/src/renderer/src/components/SettingsMenu.tsx#SettingsMenu -->

[`src/renderer/src/components/SettingsMenu.tsx`, lines 29–272](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L29-L272)

```tsx
/** The menu that opens beside the gear icon, on the side facing the middle of the screen. */
export function SettingsMenu(props: {
  corner: Corner
  /** Where things sit for her size: the menu goes beside the stack. */
  layout: PanelLayout
  /** Distance from the bubble's edge of the window to the gear, so the menu lines up with it. */
  offset: number
  settings: Settings
  /** Her size, and the biggest she can be. */
  size: CharacterSize
  branding: Branding
  version: string
  /** Who's signed in, or null when nobody is. */
  user: SignedInUser | null
  /** Who's connected to Atlassian, or null when nobody is. */
  atlassianUser: { name: string; email?: string } | null
  onDisconnectAtlassian: () => void
  /** Check for updates, as it stands. */
  update: UpdateState
  onCheckForUpdates: () => void
  onToggleTheme: () => void
  onSetSize: (scale: number) => void
  onSetHabits: (habits: Partial<Habits>) => void
  onSetRobeColor: (color: string | null) => void
  onToggleAutoStart: () => void
  onSetEffort: (effort: Effort) => void
  onToggleAutoSend: () => void
  onSignOut: () => void
  onOpenScreenshotsFolder: () => void
  onNewConversation: () => void
  onClearText: () => void
  onUninstall: () => void
}) {
  // "New conversation" (or "Clear text box") needs a second click within a few seconds.
  const [confirmingNew, setConfirmingNew] = useState(false)
  useEffect(() => {
    if (!confirmingNew) return
    const timer = setTimeout(() => setConfirmingNew(false), CONFIRM_MS)
    return () => clearTimeout(timer)
  }, [confirmingNew])
  // So does "Uninstall".
  const [confirmingUninstall, setConfirmingUninstall] = useState(false)
  useEffect(() => {
    if (!confirmingUninstall) return
    const timer = setTimeout(() => setConfirmingUninstall(false), CONFIRM_MS)
    return () => clearTimeout(timer)
  }, [confirmingUninstall])

  const { settings, branding } = props
  // Beside the gear, but never past the top of the window: it's a long menu.
  const menu = useRef<HTMLDivElement>(null)
  const fit = useFitInWindow(menu, props.offset)
  // With Claude Desktop, the chat and its settings live there; only the text box is here.
  const builtInChat = branding.chatApp === 'built-in'

  return (
    <div
      ref={menu}
      data-hit
      data-settings-menu
      role="menu"
      aria-label="Settings"
      className={cn(
        'absolute rounded-xl border p-1.5 shadow-xl',
        'border-black/10 bg-white text-zinc-800 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100',
      )}
      style={{
        ...anchored(props.corner, props.layout.settingsX, fit.offset),
        width: UI.settingsMenuWidth,
        maxHeight: fit.maxHeight,
        overflowY: 'auto',
      }}
    >
      <ToggleRow
        label="Light mode"
        hint={settings.theme === 'light' ? 'Light windows' : 'Dark windows'}
        on={settings.theme === 'light'}
        onToggle={props.onToggleTheme}
      />

      <SizeControl size={props.size} onSetSize={props.onSetSize} />

      <RobeColorControl
        color={settings.robeColor}
        companyColor={branding.accentColor}
        onSetColor={props.onSetRobeColor}
      />

      <ToggleRow
        label="Stand still"
        hint={settings.standStill ? 'She stays where she is' : 'She wanders about'}
        on={settings.standStill}
        onToggle={() => props.onSetHabits({ standStill: !settings.standStill })}
      />
      <ToggleRow
        label="No idle animations"
        hint={settings.noIdles ? 'She just stands' : 'She keeps herself busy'}
        on={settings.noIdles}
        onToggle={() => props.onSetHabits({ noIdles: !settings.noIdles })}
      />

      <div className="my-1 border-t border-black/10 dark:border-white/10" />

      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={settings.autoStart}
        disabled={!settings.autoStartAvailable}
        onClick={props.onToggleAutoStart}
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm',
          settings.autoStartAvailable
            ? 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
            : 'cursor-default opacity-60',
        )}
      >
        <span>
          Start with Windows
          {!settings.autoStartAvailable && (
            <span className="block text-[11px] text-zinc-500">Only in the installed app</span>
          )}
        </span>
        <Switch on={settings.autoStart} />
      </button>

      {!builtInChat && (
        <ToggleRow
          label="Send in Claude automatically"
          hint={settings.autoSend ? 'Questions are sent for you' : 'You press Enter in Claude'}
          on={settings.autoSend}
          onToggle={props.onToggleAutoSend}
        />
      )}

      {builtInChat && (
        <div className="px-2.5 pt-1.5 pb-2">
          <p className="mb-1.5 text-sm">Response style</p>
          <div
            role="radiogroup"
            aria-label="Response style"
            className="flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800"
          >
            {EFFORTS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={settings.effort === option.value}
                title={option.hint}
                onClick={() => props.onSetEffort(option.value)}
                className={cn(
                  'flex-1 rounded-md py-1 text-xs font-medium',
                  settings.effort === option.value
                    ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-600 dark:text-white'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <MenuItem icon={FolderOpen} onClick={props.onOpenScreenshotsFolder}>
        Open screenshots folder
      </MenuItem>

      <MenuItem
        icon={builtInChat ? MessageSquarePlus : Eraser}
        danger={confirmingNew}
        onClick={() => {
          if (!confirmingNew) return setConfirmingNew(true)
          setConfirmingNew(false)
          if (builtInChat) props.onNewConversation()
          else props.onClearText()
        }}
      >
        {builtInChat
          ? confirmingNew
            ? 'Click again to clear the chat'
            : 'New conversation'
          : confirmingNew
            ? 'Click again to clear the text'
            : 'Clear text box'}
      </MenuItem>

      {props.user && (
        <div className="mt-1 border-t border-black/10 pt-1 dark:border-white/10">
          <p className="truncate px-2.5 pt-1 text-[11px] text-zinc-500" title={props.user.email}>
            Signed in as {props.user.name ?? props.user.email ?? 'you'}
          </p>
          <MenuItem icon={LogOut} onClick={props.onSignOut}>
            Log out
          </MenuItem>
        </div>
      )}

      {branding.updates && (
        <UpdateItem
          state={props.update}
          version={props.version}
          onCheck={props.onCheckForUpdates}
        />
      )}

      {props.atlassianUser && (
        <div className="mt-1 border-t border-black/10 pt-1 dark:border-white/10">
          <p
            className="truncate px-2.5 pt-1 text-[11px] text-zinc-500"
            title={props.atlassianUser.email}
          >
            Connected to Atlassian as {props.atlassianUser.name}
          </p>
          <MenuItem icon={Unplug} onClick={props.onDisconnectAtlassian}>
            Disconnect Atlassian
          </MenuItem>
        </div>
      )}

      <div className="mt-1 border-t border-black/10 pt-1 dark:border-white/10">
        <MenuItem
          icon={Trash2}
          danger={confirmingUninstall}
          disabled={!settings.canUninstall}
          onClick={() => {
            if (!confirmingUninstall) return setConfirmingUninstall(true)
            setConfirmingUninstall(false)
            props.onUninstall()
          }}
        >
          {confirmingUninstall ? 'Click again to uninstall' : `Uninstall ${branding.appName}`}
          {!settings.canUninstall && (
            <span className="block text-[11px] text-zinc-500">Only in the installed app</span>
          )}
        </MenuItem>
      </div>

      <div className="mt-1 border-t border-black/10 px-2.5 pt-1.5 pb-0.5 text-[11px] text-zinc-500 dark:border-white/10">
        {branding.appName} {props.version} · {branding.companyName}
      </div>
    </div>
  )
}
```

<!-- /code -->

Draws the menu's rows. Every menu starts with Light mode, her Size, Stand still and No idle
animations, then a line. Then, with the built-in chat: Start with Windows, Response style, Open screenshots folder, New conversation, who's signed in with Log out, and the version. With Claude
Desktop the chat and its settings live in Claude Desktop, so there's no Response style and no
sign-in; instead there's a "Send in Claude automatically" switch, and New conversation becomes
Clear text box. When the tenant offers it, either kind has Check for updates, and when connected
to Atlassian, it says who as, with Disconnect Atlassian. Both kinds end with Uninstall, then the
version. It keeps two pieces of its own
state.

**State.** `useState(initial)` returns the current value and a function that changes it. Calling
that function makes React run the component again with the new value, which redraws it. Use a ref
for values that don't affect what's shown, and state for values that do. Here `confirmingNew`
switches the "New conversation" (or "Clear text box") row into its "Click again" form, and
`confirmingUninstall` does the same for Uninstall.

- `layout: PanelLayout`: as the comment says, where things sit for her size; the menu goes beside
  the stack.
- `offset: number`: `Panel` passes `actionOffset()` of the gear's place in the icon stack, at her
  size.
- `size: CharacterSize`: as its comment says, her size, and the biggest she can be, for the Size
  row.
- `...anchored(props.corner, props.layout.settingsX, fit.offset)`: `settingsX` (76 px at her
  usual size, 124 px at twice it) puts the menu 8 px past the action icons, on the side facing the
  middle of the screen. The offset makes its near edge level with the gear's: in a bottom corner
  its bottom lines up with the gear's bottom, so it opens upward; in a top corner it opens
  downward. It's `fit.offset` rather than `props.offset`, so a menu that would run past the far
  edge of the window is moved back just enough to fit (see below). It overlaps the chat card and
  is drawn on top because `Panel` renders it after `ChatBox`.
- `maxHeight: fit.maxHeight`, `overflowY: 'auto'`: never taller than the window has room for; if
  it ever were, it would scroll.
- `data-settings-menu`: lets `Panel`'s `closeMenusOnOutsideClick` recognise a click inside the
  menu, so it doesn't close it.
- `role="menu"`: this and `role="menuitemcheckbox"`, `role="radiogroup"` and the rest tell screen
  readers what each control is (and `aria-checked` whether it's on), since they're all styled
  buttons rather than real checkboxes and radio buttons.
- `const [confirmingNew, setConfirmingNew] = useState(false)`: the square brackets unpack the two
  things `useState` returns: the value and its setter.
- `return () => clearTimeout(timer)`: when `confirmingNew` turns on, the effect starts a 3-second
  timer that turns it off again. The function an effect returns is its _cleanup_: React calls it
  before running the effect again and when the component disappears. So the timer is cancelled
  after a confirming second click, or when the menu closes.
- `// So does "Uninstall".`: the same pair of state and timer for the Uninstall row, kept separate
  so arming one row never arms the other.
- `const { settings, branding } = props`: shorthand for two props used often below.
- `const menu = useRef<HTMLDivElement>(null)`, `const fit = useFitInWindow(menu, props.offset)`: as
  the comment says, the menu sits beside the gear, but never past the top of the window: it's a
  long menu. `ref={menu}` on the menu's `<div>` lets
  `useFitInWindow` (see [The pages](7-renderer-pages.md)) measure it; `fit.offset` is where it can
  go and `fit.maxHeight` how tall it can be.
- `const builtInChat = branding.chatApp === 'built-in'`: which rows to show. The rest of the menu
  checks this one value.
- `<ToggleRow label="Light mode" ... />`: the first row, Light mode, a switch (`ToggleRow`,
  below), on while the windows are light. Clicking it calls `onToggleTheme`, which asks the main
  process for the other mode (`Panel.toggleTheme`); every window switches at once, and the menu
  stays open. The grey line under it (`hint`) says which the windows are now: "Light windows" or
  "Dark windows".
- `<SizeControl size={props.size} onSetSize={props.onSetSize} />`: the second row, her size, with
  its Smaller and Bigger buttons (see `SizeControl` below).
- `<ToggleRow label="Stand still" ... />`: off until the user turns it on. On, she stays where she
  stands instead of wandering about ("She stays where she is"); off, "She wanders about". Clicking
  it calls `onSetHabits({ standStill: !settings.standStill })`, sending only this setting, flipped;
  the main process saves it and she does as it says at once (`BubbleController.setHabits()`).
- `<ToggleRow label="No idle animations" ... />`: the same for her idle animations, her habits:
  on, "She just stands"; off, "She keeps herself busy". With both on, she does nothing on her own
  but breathe and blink.
- `<div className="my-1 border-t ..." />`: a line under the four, which are about her and how
  things look, setting them apart from the rest of the menu.
- `disabled={!settings.autoStartAvailable}`: Start with Windows only works in the installed app,
  not in `npm run dev`; there the row is greyed out with a note. `onToggleAutoStart` asks the
  main process to flip it, and `Panel` keeps the settings it returns (see `settings.ts` in
  [Main process: startup, IPC and app plumbing](2-main-startup.md)).
- `<Switch on={settings.autoStart} />`: the on/off graphic at the end of the row.
- `{!builtInChat && (`: with Claude Desktop, the "Send in Claude automatically" row, another
  `ToggleRow`. Clicking it calls `onToggleAutoSend`, which flips the setting in the main process.
  The grey line says what the switch means in practice: "Questions are sent for you" or "You press
  Enter in Claude". (Start with Windows, just above, is the one switch that isn't a `ToggleRow`:
  it can be greyed out, with a note in place of its line.)
- `{builtInChat && (`: Response style only with the built-in chat. With Claude Desktop the chat,
  and how Claude answers, are Claude Desktop's business, so the setting would do nothing.
- `aria-checked={settings.effort === option.value}`: the response styles work like radio buttons.
  The current one is white with a shadow; the others are plain text on the grey track.
- `onClick={() => props.onSetEffort(option.value)}`: `Panel.setEffort` saves the choice in the
  main process. `ChatSession` reads it at the start of each request, so it applies from the next
  message.
- `icon={builtInChat ? MessageSquarePlus : Eraser}`: one row that does either job, with a
  speech bubble for New conversation or an eraser for Clear text box. Both clear something and
  need the same second click, so they share the row and its confirm state.
- `if (!confirmingNew) return setConfirmingNew(true)`: the first click only arms the row (the
  `return` just ends the function early). A second click within 3 seconds turns it off and calls
  `onNewConversation`, which clears the chat (`ChatSession.newConversation()`), or with Claude
  Desktop `onClearText`, which empties the text box and its screenshots.
- `danger={confirmingNew}`: the row turns red while it's armed.
- `{builtInChat ? confirmingNew ? ... : ... : ...}`: the label, from two questions in turn:
  which kind of chat, then whether the row is armed. So it reads "New conversation" or "Click
  again to clear the chat", or "Clear text box" or "Click again to clear the text".
- `{props.user && (`: only when someone is signed in; `Panel` passes `null` otherwise, which is
  always the case with Claude Desktop.
- `props.user.name ?? props.user.email ?? 'you'`: the first of the name or the email that
  JumpCloud provided. `truncate` cuts a long one short with "…", and `title={props.user.email}`
  shows the email as a tooltip.
- `{branding.updates && (`: Check for updates (`UpdateItem`, below), only when the tenant names
  where releases come from.
- `{props.atlassianUser && (`: when connected to Atlassian, who as ("Connected to Atlassian as
  Casey Jones", with the email as a tooltip), and **Disconnect Atlassian** with a plug icon
  (`Unplug`), which calls `onDisconnectAtlassian`. It needs no second click: nothing is lost, and
  connecting again is a moment in the browser.
- `icon={Trash2}`, `danger={confirmingUninstall}`: Uninstall, in a section of its own below a
  line, needs the same second click within 3 seconds, and turns red while armed. The second click
  calls `onUninstall`; `Panel.uninstall` starts the uninstaller and the app quits.
- `disabled={!settings.canUninstall}`: only the installed app has an uninstaller. In `npm run dev`
  the row is greyed out, with "Only in the installed app" under its label (the same note as Start
  with Windows).
- `` `Uninstall ${branding.appName}` ``: the label names the app, "Uninstall Desktop Wizard".
- `{branding.appName} {props.version} · {branding.companyName}`: the footer, for example
  "Desktop Wizard 1.0.0 · Morse Micro".

### `UpdateItem`

<!-- code: apps/desktop/src/renderer/src/components/SettingsMenu.tsx#UpdateItem -->

[`src/renderer/src/components/SettingsMenu.tsx`, lines 274–312](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L274-L312)

```tsx
/** Check for updates, showing how it's going: checking, downloading, installing, or the answer. */
function UpdateItem(props: { state: UpdateState; version: string; onCheck: () => void }) {
  const { state } = props
  const busy = ['checking', 'downloading', 'installing'].includes(state.status)
  const [label, note] =
    state.status === 'checking'
      ? ['Checking for updates…', `Version ${props.version}`]
      : state.status === 'downloading'
        ? [`Downloading ${state.version}… ${state.percent}%`, 'It installs itself when done']
        : state.status === 'installing'
          ? [`Installing ${state.version}…`, 'Desktop Wizard will close and start again']
          : state.status === 'downloaded'
            ? [`Downloaded ${state.version}`, 'Not installed: this is a development run']
            : state.status === 'up-to-date'
              ? ['Check for updates', `Up to date: version ${state.version}`]
              : state.status === 'error'
                ? ['Check for updates', state.message]
                : ['Check for updates', `Version ${props.version}`]
  return (
    <MenuItem
      icon={busy ? LoaderCircle : Download}
      spin={busy}
      disabled={busy}
      onClick={props.onCheck}
    >
      <span className="min-w-0">
        {label}
        <span
          className={cn(
            'block text-[11px]',
            state.status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-zinc-500',
          )}
        >
          {note}
        </span>
      </span>
    </MenuItem>
  )
}
```

<!-- /code -->

The **Check for updates** row, which, as the comment says, also shows how a check is going. The
whole job happens in the main process (`Updater` in `src/main/updates.ts`; see
[Main process: startup, IPC and app plumbing](2-main-startup.md)); this only draws its state.

- `const busy = ['checking', 'downloading', 'installing'].includes(state.status)`: something is
  under way. The icon turns into a spinning circle (`LoaderCircle`, `spin`), and the row can't be
  clicked again (`disabled`).
- `const [label, note] = ...`: the row's two lines, chosen by the state with a chain of `? :`,
  and unpacked from a pair. For example "Checking for updates…", "Downloading 1.0.1… 42%" with "It
  installs itself when done", "Installing 1.0.1…" with "Desktop Wizard will close and start
  again", or, when nothing is under way, "Check for updates" with the version this copy is, that
  it's up to date, or what went wrong.
- `'Not installed: this is a development run'`: in `npm run dev` a check stops once the installer
  is downloaded (`downloaded`).
- `state.status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-zinc-500'`: a failure's
  reason is red; every other note is grey.
- `onClick={props.onCheck}`: the click goes to `Panel`, which asks the main process to start.
  Unlike Uninstall, it needs no second click: nothing changes unless there's a newer release.

### `MenuItem`

<!-- code: apps/desktop/src/renderer/src/components/SettingsMenu.tsx#MenuItem -->

[`src/renderer/src/components/SettingsMenu.tsx`, lines 314–343](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L314-L343)

```tsx
function MenuItem(props: {
  icon: LucideIcon
  danger?: boolean
  disabled?: boolean
  /** Spins the icon (something's under way). */
  spin?: boolean
  onClick: () => void
  children: ReactNode
}) {
  const Icon = props.icon
  return (
    <button
      type="button"
      role="menuitem"
      disabled={props.disabled}
      onClick={props.onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm',
        props.danger
          ? 'bg-red-600 text-white'
          : props.disabled
            ? 'cursor-default opacity-60'
            : 'hover:bg-zinc-100 dark:hover:bg-zinc-800',
      )}
    >
      <Icon size={16} className={cn('shrink-0', props.spin && 'animate-spin')} aria-hidden />
      {props.children}
    </button>
  )
}
```

<!-- /code -->

One row of the menu: an icon and a label, as a button.

- `icon: LucideIcon`: the prop is the icon component itself (`FolderOpen`), not a drawn icon
  (`<FolderOpen />`), so `MenuItem` decides the size.
- `const Icon = props.icon`: JSX treats a lowercase tag as an HTML element, so the component has
  to be in a capitalised variable before it can be written as `<Icon size={16} aria-hidden />`.
- `disabled?: boolean`: a greyed-out row that can't be clicked (`disabled={props.disabled}` on the
  button), used for Uninstall in a dev run, and for Check for updates while it's busy.
- `spin?: boolean`: as its comment says, turns the icon (`animate-spin`) while something's under
  way. `shrink-0` keeps the icon its full size when the label is long.
- `props.danger ? 'bg-red-600 text-white'`: the red version, used for the armed "New
  conversation", "Clear text box" or Uninstall. Otherwise a disabled row is faded
  (`opacity-60`) with no hover, and an enabled one gets the grey hover.

### `ToggleRow`

<!-- code: apps/desktop/src/renderer/src/components/SettingsMenu.tsx#ToggleRow -->

[`src/renderer/src/components/SettingsMenu.tsx`, lines 345–362](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L345-L362)

```tsx
/** A setting that's on or off: its name, a line saying what it does now, and its switch. */
function ToggleRow(props: { label: string; hint: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={props.on}
      onClick={props.onToggle}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
    >
      <span>
        {props.label}
        <span className="block text-[11px] text-zinc-500">{props.hint}</span>
      </span>
      <Switch on={props.on} />
    </button>
  )
}
```

<!-- /code -->

As its comment says, a setting that's on or off: its name, a line saying what it does now, and its
switch. Light mode, Stand still, No idle animations and Send in Claude automatically are each one.
Light mode and Send in Claude automatically used to be written out in full; with the two new
switches there would have been four copies of the same lines, which would only drift apart.

- `label`, `hint`: the setting's name, and the grey line under it, which says what the setting
  means as it stands ("She wanders about"), so the user needn't work out what "off" means.
- `on`, `onToggle`: whether it's on, and what a click does. The row only shows the setting; the
  menu's caller changes it.
- `role="menuitemcheckbox"`, `aria-checked={props.on}`: screen readers announce it as an item that's
  ticked or not, since the `Switch` itself is only a picture.
- The rest is the same as every other row: the whole row is one button, its text on the left and
  the switch on the right (`justify-between`), with the grey hover.

### `Switch`

<!-- code: apps/desktop/src/renderer/src/components/SettingsMenu.tsx#Switch -->

[`src/renderer/src/components/SettingsMenu.tsx`, lines 364–381](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L364-L381)

```tsx
function Switch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors',
        on ? 'bg-accent' : 'bg-zinc-300 dark:bg-zinc-600',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform',
          on ? 'translate-x-4.5' : 'translate-x-0.5',
        )}
      />
    </span>
  )
}
```

<!-- /code -->

A pill-shaped track with a white knob. It's purely a picture: the `menuitemcheckbox` button around
it tells screen readers whether it's on, so the switch itself is `aria-hidden`.

- `on ? 'bg-accent' : 'bg-zinc-300 dark:bg-zinc-600'`: the track is the accent colour when on.
- `on ? 'translate-x-4.5' : 'translate-x-0.5'`: the 16 px knob sits 2 px from the left of the
  36 px track when off and slides to 18 px when on; `transition-transform` animates the slide.

## `src/renderer/src/components/SizeControl.tsx` and `lib/sizes.ts`: her size, in Settings

The row near the top of the settings menu, with buttons to make her smaller or bigger. It used to
be a menu of its own, beside a size icon; now it's one row of Settings, under Light mode.
`SettingsMenu` renders it with her `size` (`CharacterSize` in `src/shared/geometry.ts`: her
`scale`, and `max`, the biggest she can be on her screen) and `onSetSize`, which asks the main
process for another size. The two small functions behind it, the label and the next size, are in
`src/renderer/src/lib/sizes.ts`, a file of their own with no React in it, so `sizes.test.ts` can
test them without a page.

### `sizeLabel()` and `nextSize()`

<!-- code: apps/desktop/src/renderer/src/lib/sizes.ts#sizeLabel,nextSize -->

[`src/renderer/src/lib/sizes.ts`, lines 3–13](../../apps/desktop/src/renderer/src/lib/sizes.ts#L3-L13)

```ts
/** Her size as people say it: "½×", "1.5×", "6×". */
export function sizeLabel(scale: number): string {
  return `${scale === 0.5 ? '½' : scale === 0.75 ? '¾' : scale}×`
}

/** The next size down, or up, of CHARACTER_SIZES, no bigger than `max`; null at either end. */
export function nextSize(scale: number, way: 1 | -1, max: number): number | null {
  const sizes = CHARACTER_SIZES.filter((size) => size <= max)
  const next = way === 1 ? sizes.find((size) => size > scale) : sizes.findLast((s) => s < scale)
  return next ?? null
}
```

<!-- /code -->

- `sizeLabel(scale)`: as the comment says, her size as people say it: the two fractions as `½` and
  `¾`, any other size as the number itself (`1`, `1.5`, `6`), then `×`.
- `nextSize(scale, way, max)`: as the comment says, the next size down (`way` is `-1`) or up (`1`)
  in `CHARACTER_SIZES`, leaving out any bigger than `max`, or `null` at either end.
  `CHARACTER_SIZES` runs from smallest to biggest, so `find()` gives the first size bigger than
  hers and `findLast()` the last one smaller. Both give `undefined` when there's none, and
  `?? null` turns that into `null`.

### `SizeControl`

<!-- code: apps/desktop/src/renderer/src/components/SizeControl.tsx#SizeControl -->

[`src/renderer/src/components/SizeControl.tsx`, lines 6–46](../../apps/desktop/src/renderer/src/components/SizeControl.tsx#L6-L46)

```tsx
/**
 * Her size, in the Settings menu: buttons to make her smaller and bigger, a step of
 * CHARACTER_SIZES at a time, from half her usual size up to six times it (or as big as fits her
 * screen, when that's less). The main process resizes her and remembers it; the new size comes
 * back in the app state, so this shows whatever she really is.
 */
export function SizeControl(props: { size: CharacterSize; onSetSize: (scale: number) => void }) {
  const { scale, max } = props.size
  const smaller = nextSize(scale, -1, max)
  const bigger = nextSize(scale, 1, max)
  const limited = max < CHARACTER_SIZES.at(-1)!
  return (
    <div role="group" aria-label="Size" className="flex items-center gap-3 px-2.5 py-1.5">
      <span className="min-w-0 flex-1 text-sm">
        Size
        <span className="block text-[11px] text-zinc-500">
          {limited && bigger === null
            ? 'As big as fits this screen'
            : `${sizeLabel(CHARACTER_SIZES[0])} to ${sizeLabel(limited ? max : CHARACTER_SIZES.at(-1)!)}`}
        </span>
      </span>
      <SizeButton
        label="Smaller"
        disabled={smaller === null}
        onClick={() => smaller !== null && props.onSetSize(smaller)}
      >
        <Minus size={14} aria-hidden />
      </SizeButton>
      <span aria-live="polite" className="min-w-9 text-center text-sm font-medium tabular-nums">
        {sizeLabel(scale)}
      </span>
      <SizeButton
        label="Bigger"
        disabled={bigger === null}
        onClick={() => bigger !== null && props.onSetSize(bigger)}
      >
        <Plus size={14} aria-hidden />
      </SizeButton>
    </div>
  )
}
```

<!-- /code -->

As the comment says, a step of `CHARACTER_SIZES` at a time, from half her usual size up to six
times it, or as big as fits her screen when that's less. It never resizes her itself: clicking a
button calls `onSetSize`, the main process resizes her and saves the size, and the new size comes
back in the app state (`onSizeChanged` in `useAssistState`), so the row always shows what she
really is. It's laid out like the menu's other rows: the setting's name, with a grey line under
it, on the left, and the control on the right.

- `const { scale, max } = props.size`: her size now, and the biggest she can be on this screen.
- `const smaller = nextSize(scale, -1, max)`, `const bigger = nextSize(scale, 1, max)`: the sizes
  the two buttons go to, or `null` where there's no further to go.
- `const limited = max < CHARACTER_SIZES.at(-1)!`: whether her screen keeps her from the biggest
  size, six times. `at(-1)` is the list's last entry; the `!` tells TypeScript it's there.
- `role="group"`, `aria-label="Size"`: screen readers present the buttons together, under that
  name.
- `className="flex items-center gap-3 px-2.5 py-1.5"`: one row, its parts side by side and lined up
  on their middles, with the same padding at the sides as the menu's other rows.
- `<span className="min-w-0 flex-1 text-sm">`: "Size", taking up whatever room the buttons leave
  (`flex-1`), so they sit at the right-hand end.
- The grey line under it: at the biggest that fits a screen too small for six times her size, "As
  big as fits this screen"; otherwise the range she can be on this screen, "½× to 6×" (or to `max`
  when that's less).
- `disabled={smaller === null}`: Smaller (a minus) is greyed out at half her usual size, the
  smallest.
- `onClick={() => smaller !== null && props.onSetSize(smaller)}`: checks again that there is a
  smaller size, which also tells TypeScript `smaller` is a number here.
- `<span aria-live="polite" ...>{sizeLabel(scale)}</span>`: her size between the two buttons, such
  as `1×`. `aria-live="polite"` makes screen readers read it out when it changes, once they've
  finished what they're saying. `tabular-nums` gives every digit the same width, and `min-w-9`
  keeps the space between the buttons the same, so they don't move as the label changes.
- `disabled={bigger === null}`: Bigger (a plus) is greyed out at six times her size, or at the
  biggest that fits her screen.

### `SizeButton`

<!-- code: apps/desktop/src/renderer/src/components/SizeControl.tsx#SizeButton -->

[`src/renderer/src/components/SizeControl.tsx`, lines 48–72](../../apps/desktop/src/renderer/src/components/SizeControl.tsx#L48-L72)

```tsx
function SizeButton(props: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-full border outline-none',
        'focus-visible:ring-2 focus-visible:ring-accent',
        props.disabled
          ? 'cursor-default border-black/5 text-zinc-300 dark:border-white/5 dark:text-zinc-600'
          : 'border-black/10 hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-zinc-800',
      )}
    >
      {props.children}
    </button>
  )
}
```

<!-- /code -->

One of the two round buttons, private to this file.

- `title={props.label}`, `aria-label={props.label}`: "Smaller" or "Bigger", as a tooltip and for
  screen readers, since the button shows only an icon (a minus or a plus).
- `disabled={props.disabled}`: a disabled button can't be clicked or focused.
- `'grid size-7 shrink-0 place-items-center rounded-full border outline-none'`: a 28 px circle with
  the icon in its middle, small enough for a row of the menu; `shrink-0` keeps it round however
  little room the row has. With `'focus-visible:ring-2 focus-visible:ring-accent'`, it gets the
  same accent ring as the action icons when it has the keyboard focus.
- `props.disabled ? ... : ...`: a disabled button has a fainter border and icon and a plain arrow
  pointer; otherwise it turns grey on hover.

## `src/renderer/src/components/SpellsMenu.tsx`: the spells menu

The small menu that opens beside the wand icon (Spells), listing her ten spells by name. `Panel`
renders it only while the panel is open, the wand has toggled it on, and the tenant's list of
actions includes `spells`. Its props are the `corner`, `layout` and
`offset` for positioning, as for `SettingsMenu`, and `onCast`, through which `Panel` closes the
menu and asks the main process to cast the spell (`window.assist.character.castSpell()`). The
spells, and what the menu says about each, are in `src/shared/spells.ts` (see
[Shared code and the preload bridge](1-shared-and-preload.md)); what casting one does is
`castSpell` in `src/main/index.ts` (see
[Main process: startup, IPC and app plumbing](2-main-startup.md)). `Panel` also closes the menu on
Esc, on a click anywhere else in the panel, when another icon is clicked, and when the panel
closes.

### `MENU_WIDTH` and `ICONS`

<!-- code: apps/desktop/src/renderer/src/components/SpellsMenu.tsx#MENU_WIDTH,ICONS -->

[`src/renderer/src/components/SpellsMenu.tsx`, lines 21–34](../../apps/desktop/src/renderer/src/components/SpellsMenu.tsx#L21-L34)

```tsx
const MENU_WIDTH = 176

const ICONS: Record<Spell, LucideIcon> = {
  clones: UsersRound,
  teleport: Orbit,
  butterflies: Flower,
  starfall: Sparkles,
  fireworks: Rocket,
  blizzard: Snowflake,
  thunderstorm: CloudLightning,
  phoenix: Bird,
  vortex: Tornado,
  explosion: Flame,
}
```

<!-- /code -->

- `MENU_WIDTH = 176`: the menu's width in pixels, room for an icon and the longest name.
- `ICONS: Record<Spell, LucideIcon>`: the lucide icon beside each spell's name, in the menu's
  order: two people (`UsersRound`) for Clones, a ring round a dot (`Orbit`) for Teleport, a flower
  (`Flower`) for Butterflies, sparkles for Starfall, a rocket for Fireworks, a snowflake for
  Blizzard, a cloud with a bolt of lightning (`CloudLightning`) for Thunderstorm, a bird for
  Phoenix, a tornado for Vortex and a flame for Explosion. `Record<Spell, ...>` makes TypeScript
  insist on one for every spell in `SPELLS`.

### `SpellsMenu`

<!-- code: apps/desktop/src/renderer/src/components/SpellsMenu.tsx#SpellsMenu -->

[`src/renderer/src/components/SpellsMenu.tsx`, lines 36–88](../../apps/desktop/src/renderer/src/components/SpellsMenu.tsx#L36-L88)

```tsx
/**
 * The menu that opens beside the wand icon: her spells (src/shared/spells.ts), by name. Picking
 * one casts it; the main process closes the panel so it can be seen.
 */
export function SpellsMenu(props: {
  corner: Corner
  layout: PanelLayout
  /** Distance from the bubble's edge of the window to the wand icon, so the menu lines up. */
  offset: number
  onCast: (spell: Spell) => void
}) {
  // Beside the wand icon, but never past the top of the window.
  const menu = useRef<HTMLDivElement>(null)
  const fit = useFitInWindow(menu, props.offset)
  return (
    <div
      ref={menu}
      data-hit
      data-spells-menu
      role="menu"
      aria-label="Spells"
      className={cn(
        'absolute rounded-xl border p-1.5 shadow-xl',
        'border-black/10 bg-white text-zinc-800 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100',
      )}
      style={{
        ...anchored(props.corner, props.layout.settingsX, fit.offset),
        width: MENU_WIDTH,
        maxHeight: fit.maxHeight,
        overflowY: 'auto',
      }}
    >
      <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
        Spells
      </p>
      {SPELLS.map((spell) => {
        const Icon = ICONS[spell]
        return (
          <button
            key={spell}
            type="button"
            role="menuitem"
            onClick={() => props.onCast(spell)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <Icon size={16} className="shrink-0 text-accent" aria-hidden />
            {SPELL_LABELS[spell]}
          </button>
        )
      })}
    </div>
  )
}
```

<!-- /code -->

As the comment says, the menu beside the wand icon: her spells, by name. Picking one casts it, and
the main process closes the panel so it can be seen. It's built
like the settings menu: the same look, placed the same way and kept inside the window the same way.

- `offset: number`: as the comment says, the distance from the bubble's edge of the window to the
  wand icon (`actionOffset()` of its place in the stack, at her size), so the menu lines up with
  it.
- `const menu = useRef<HTMLDivElement>(null)`, `const fit = useFitInWindow(menu, props.offset)`: as
  the comment says, beside the wand icon, but never past the top of the window, as for the settings
  menu (`ref={menu}` on its `<div>`; see `useFitInWindow` in [The pages](7-renderer-pages.md)).
- `data-hit`: so the menu takes the mouse (see `data-hit` under `ChatBox`).
- `data-spells-menu`: lets `Panel`'s `closeMenusOnOutsideClick` recognise a click inside the menu,
  so it doesn't close it.
- `role="menu"`, `aria-label="Spells"`: screen readers present it as a menu called Spells, and each
  spell's button as one of its items (`role="menuitem"`).
- `...anchored(props.corner, props.layout.settingsX, fit.offset)`, `maxHeight`, `overflowY`: placed
  just as the settings menu is, 8 px past the action icons on the side facing the middle of the
  screen, but level with the wand icon (moved back if it wouldn't fit), and kept within the
  window's height. Its look (rounded corners, a border, a shadow, white or near-black) is the
  settings menu's too.
- `<p className="... uppercase">Spells</p>`: a small grey heading at the top, in capitals.
- `{SPELLS.map((spell) => {`: one row per spell, in `SPELLS`' order: Clones, Teleport,
  Butterflies, Starfall, Fireworks, Blizzard, Thunderstorm, Phoenix, Vortex and Explosion.
  `key={spell}` lets React tell the rows apart.
- `onClick={() => props.onCast(spell)}`: casts it. The menu does nothing else itself: `Panel`
  closes it and asks the main process to cast the spell, which closes the panel first.
- `<Icon size={16} className="shrink-0 text-accent" aria-hidden />`: the spell's icon, in the
  accent colour; `aria-hidden`, because the name beside it says the same.
- `{SPELL_LABELS[spell]}`: its name, beside the icon.

## `src/renderer/src/components/ActionStack.tsx`: the action icons

The column of round icon buttons that pops out of the bubble when the panel opens (for Morse
Micro: Ask Claude, Jira, IT service desk, screenshot, settings, spells, screen saver and close), in
the order the
tenant's `tenant.json` lists them, nearest the bubble first. `Panel` always renders it; while
closed it's simply invisible. Its props are the `corner`, the `layout` for her size, the tenant's
`actions`, `open`, `activeId` (`settings` while the settings menu is open, `spells` while the
spells menu is, otherwise the icon of the page showing when it isn't the start page, or `null`),
`pages` (command icons that open a page in the panel instead: the service desk, when the tenant
lists request types), `dotted` (icons that get a small dot) and `onAction`, which is
`Panel.runAction`.

### `ICONS`

<!-- code: apps/desktop/src/renderer/src/components/ActionStack.tsx#ICONS -->

[`src/renderer/src/components/ActionStack.tsx`, lines 19–30](../../apps/desktop/src/renderer/src/components/ActionStack.tsx#L19-L30)

```tsx
const ICONS: Record<ActionId, LucideIcon> = {
  ask: MessageCircle,
  apps: LayoutGrid,
  jira: Bell,
  servicedesk: Headset,
  screenshot: Camera,
  settings: Settings,
  spells: WandSparkles,
  screensaver: Sunset,
  familiar: Cat,
  close: Power,
}
```

<!-- /code -->

Which lucide icon each action shows. Ask Claude is `MessageCircle`, a speech bubble; Apps is
`LayoutGrid`, a grid of four squares, the usual sign for "apps"; Jira is `Bell`, for its
notifications; and the IT service desk is `Headset`, as for a help desk. Spells is
`WandSparkles`, a magic wand with sparkles, the screen saver `Sunset`, a sun setting on the
horizon, for the scene it shows, and Close is `Power`, a power button.

- `Record<ActionId, LucideIcon>`: an object with exactly one entry for every action id. If a new
  id is added to `ACTION_IDS` in `src/shared/actions.ts` without an icon here, TypeScript reports
  an error.

### `ActionStack`

<!-- code: apps/desktop/src/renderer/src/components/ActionStack.tsx#ActionStack -->

[`src/renderer/src/components/ActionStack.tsx`, lines 32–107](../../apps/desktop/src/renderer/src/components/ActionStack.tsx#L32-L107)

```tsx
/**
 * The icons that pop out of the bubble, nearest-first in the tenant's order: stacked above it in
 * a bottom corner, below it in a top corner.
 */
export function ActionStack(props: {
  corner: Corner
  /** Where things sit for her size: the stack goes above her. */
  layout: PanelLayout
  actions: ActionId[]
  open: boolean
  activeId: ActionId | null
  /** Icons with a small dot, e.g. Ask Claude while an unsent question is waiting behind it. */
  dotted?: ActionId[]
  /** Command icons that open a page in the panel instead (the service desk, with a form). */
  pages?: ActionId[]
  onAction: (id: ActionId) => void
}) {
  const top = isTopCorner(props.corner)
  return (
    <div
      className={cn('absolute flex', top ? 'flex-col' : 'flex-col-reverse')}
      style={{
        ...anchored(props.corner, props.layout.actionsX, props.layout.actionsY),
        gap: UI.actionGap,
      }}
    >
      {props.actions.map((id, index) => {
        const Icon = ICONS[id]
        const label = ACTIONS[id].label
        const active = id === props.activeId
        return (
          <button
            key={id}
            data-hit
            data-action={id}
            type="button"
            title={label}
            aria-label={label}
            aria-expanded={
              ACTIONS[id].kind === 'popover' || props.pages?.includes(id) ? active : undefined
            }
            onClick={() => props.onAction(id)}
            style={{
              width: UI.actionSize,
              height: UI.actionSize,
              // Pop out one after another, nearest the bubble first.
              transitionDelay: props.open ? `${index * 30}ms` : '0ms',
            }}
            className={cn(
              'relative grid place-items-center rounded-full border shadow-md outline-none',
              'transition duration-150 ease-out motion-reduce:transition-none',
              'focus-visible:ring-2 focus-visible:ring-accent',
              // Hidden icons sit tucked toward the bubble, then slide out.
              top ? '-translate-y-3' : 'translate-y-3',
              'scale-75 opacity-0',
              'group-data-open:translate-y-0 group-data-open:scale-100 group-data-open:opacity-100',
              active
                ? 'border-transparent bg-accent text-white'
                : id === 'close'
                  ? 'border-black/10 bg-white text-zinc-700 hover:border-transparent hover:bg-red-600 hover:text-white dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200'
                  : 'border-black/10 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700',
            )}
          >
            <Icon size={18} strokeWidth={2} aria-hidden />
            {props.dotted?.includes(id) && !active && (
              <span
                aria-hidden
                className="absolute top-1 right-1 size-2.5 rounded-full border-2 border-white bg-accent dark:border-zinc-800"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
```

<!-- /code -->

Lays the icons out in a column beside the bubble and animates them in and out.

- `top ? 'flex-col' : 'flex-col-reverse'`: the first action must be nearest the bubble. In a top
  corner the bubble is above the stack, so it's a normal top-to-bottom column. In a bottom corner
  the bubble is below, so the column is reversed and the first action sits at the bottom.
- `layout: PanelLayout`: as the comment says, where things sit for her size; the stack goes above
  her.
- `...anchored(props.corner, props.layout.actionsX, props.layout.actionsY)`: `actionsX` centres the
  40 px icons on her box: 28 px at her usual size, on the 80 px bubble. `actionsY` starts the stack
  12 px past her box: 100 px at her usual size. The icons themselves stay the same size whatever
  her size; only where they start moves (at twice her size, 76 px across and 188 px up).
- `gap: UI.actionGap`: 8 px between icons. The main process sizes the panel window from the same
  numbers (`panelWindowSize` in `src/shared/geometry.ts`, for her size), so the stack always fits.
- `const Icon = ICONS[id]`: the action's icon component, in a capitalised variable so it can be
  written as a JSX tag (as in `MenuItem`).
- `const label = ACTIONS[id].label`: the tooltip and screen-reader name, from the action registry.
- `data-hit`: on each button, not on the column, so the gaps between icons stay click-through.
- `data-action={id}`: `Panel.closeMenusOnOutsideClick` looks for `[data-action="settings"]` and
  `[data-action="spells"]`, so clicking the gear or the wand toggles its menu instead of counting
  as a click outside it.
- `aria-expanded={ACTIONS[id].kind === 'popover' || props.pages?.includes(id) ? active : undefined}`:
  for a popover action (Settings, Spells, Ask Claude, Apps and Jira), or an icon that opens a
  page (the service desk, with request types), it tells screen readers whether what it opens is
  showing. `undefined` leaves the attribute off the others (Screenshot and Close), which open
  nothing.
- `onClick={() => props.onAction(id)}`: `Panel.runAction` toggles the menu for Settings and
  Spells, switches the card's page for Ask Claude, Apps, Jira and (with request types) the service
  desk, and asks the main process to run any other action, such as Screenshot (see
  `src/main/actions.ts` in [Main process: startup, IPC and app plumbing](2-main-startup.md)).
- ``transitionDelay: props.open ? `${index * 30}ms` : '0ms'``: each icon starts its animation 30
  ms after the one before, so they pop out one after another. Closing has no delay, so they all go
  together.
- `top ? '-translate-y-3' : 'translate-y-3'`: while closed, each icon sits 12 px toward the bubble,
  and `'scale-75 opacity-0'` shrinks it to 75% and hides it. The `group-data-open:` classes
  (explained under `ChatBox`) move it to its place at full size when the panel opens.
- `outline-none`: together with `'focus-visible:ring-2 focus-visible:ring-accent'`, swaps the
  usual square focus outline for an accent ring that follows the round button.
- `active`: the active action (the gear or the wand while its menu is open, or a page's icon while
  its page is showing) is filled with the accent colour.
- `'relative grid ...'`: `relative` makes each button the reference box for the dot below.
- `{props.dotted?.includes(id) && !active && (`: a small accent-coloured dot in the icon's corner
  (`absolute top-1 right-1`), with a ring in the button's own colour so it stands out. `Panel` puts
  one on Ask Claude while an unsent question or screenshot is waiting behind it, on the bell while
  there are unread notifications, and on the service desk while one of the user's requests has
  news. Not on the active icon, whose page is already showing.
  Otherwise `id === 'close'` turns red on hover, as a warning that it quits the app, and the rest
  get a grey hover.

## `src/renderer/src/components/AttachmentChip.tsx`: a screenshot in the draft

A screenshot attached to the draft, shown in the row above the text box. `Composer` renders one
per attachment. Its props are the `attachment`, `onOpen` (`Panel.openAttachment`, which shows a
toast if the file can't be found) and `onRemove` (`Panel.removeAttachment`).

### `AttachmentChip`

<!-- code: apps/desktop/src/renderer/src/components/AttachmentChip.tsx#AttachmentChip -->

[`src/renderer/src/components/AttachmentChip.tsx`, lines 6–43](../../apps/desktop/src/renderer/src/components/AttachmentChip.tsx#L6-L43)

```tsx
/** A screenshot attached to the text box: click to open it, × to remove it. */
export function AttachmentChip(props: {
  attachment: Attachment
  onOpen: () => void
  onRemove: () => void
}) {
  const thumbnail = useThumbnail(props.attachment.path)
  const missing = thumbnail === null
  const label = missing ? 'File missing' : screenshotLabel(props.attachment.fileName)

  return (
    <div className="relative flex shrink-0 items-center rounded-lg border border-black/10 bg-zinc-50 dark:border-white/10 dark:bg-zinc-800">
      <button
        type="button"
        title={props.attachment.fileName}
        onClick={props.onOpen}
        className="flex items-center gap-2 rounded-lg py-1 pr-8 pl-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-700"
      >
        <span className="grid h-10 w-14 place-items-center overflow-hidden rounded-md bg-zinc-200 text-zinc-500 dark:bg-zinc-700">
          {thumbnail ? (
            <img src={thumbnail} alt="" draggable={false} className="size-full object-cover" />
          ) : (
            missing && <ImageOff size={16} aria-hidden />
          )}
        </span>
        <span className="text-xs whitespace-nowrap">{label}</span>
      </button>
      <button
        type="button"
        aria-label={`Remove ${label}`}
        onClick={props.onRemove}
        className="absolute top-1/2 right-1 -translate-y-1/2 rounded-full p-1 text-zinc-500 hover:bg-black/10 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-white"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  )
}
```

<!-- /code -->

A thumbnail and a short label. Clicking the chip opens the screenshot; the × removes it from the
draft (the file itself stays in the screenshots folder).

- `const thumbnail = useThumbnail(props.attachment.path)`: the preview, as for `SentScreenshot`.
- `const missing = thumbnail === null`: `useThumbnail` returns `null` only when the main process
  can't make a preview (for example the file was deleted or moved out of the screenshots
  folder), and `undefined` while it's still loading. `===` keeps the two apart, so a chip that's
  still loading doesn't say "File missing".
- `screenshotLabel(props.attachment.fileName)`: from `src/shared/format.ts`, gives "Screenshot
  14:03" for one taken today and "Screenshot 2 Oct 14:03" for an older one.
- `draggable={false}`: stops the browser letting you drag the image out of the chip.
- `missing && <ImageOff size={16} aria-hidden />`: a "no image" icon for a missing file; while
  loading, the box is simply empty.
- `whitespace-nowrap`: keeps the label on one line.
- `pr-8`: the chip is two separate buttons, because HTML doesn't allow a button inside another
  button. The open button leaves 32 px of padding on its right for the remove button.
- `absolute top-1/2 right-1 -translate-y-1/2`: places the remove button over the right end of the
  chip, centred vertically (its top at half the height, then moved up by half its own height).
- ``aria-label={`Remove ${label}`}``: the button shows only an ×, so this gives it a name for
  screen readers, such as "Remove Screenshot 14:03".
- `onClick={props.onRemove}`: `Panel.removeAttachment` asks the main process to drop it from the
  saved draft and shows the updated list.

## `src/renderer/src/character/raster.ts`: drawing shapes as pixels

The character that stands in for the bubble is original pixel art, but nobody drew her frames by
hand: code draws them, in three files. This one is a tiny _rasteriser_ (it turns shapes into
pixels); `rig.ts` is her skeleton and the shapes that hang on it; `sprite.ts` is her animations.
An earlier version was a 36 × 36 sprite typed out pixel by pixel. Posing a rig instead (shapes
placed by joint angles, drawn straight onto the pixel grid with no smoothing, then shaded and
outlined) means an animation can have as many in-between frames as it needs, each drawn the same
careful way, so she moves smoothly. There are still no image files: every frame is rows of
letters, one letter a pixel, which `Character` turns into SVG.

The shading and outlining follow how pixel artists work by hand, particularly in anime-style pixel
art:

- Each material (hair, skin, the robe...) has a _ramp_ of three or four shades: an outline, a
  shadow, a base and sometimes a light. Nothing is blended or smoothed; every pixel is one of the
  palette's colours.
- The light comes from one direction (up and to the left), so each part is lit on that side and
  shaded on the other, in flat bands: _cel shading_, as in a cartoon.
- On most materials the shadow isn't just a rim but a broad band across the side away from the
  light, two-tone the way anime cel shading does it (the ramp's `form`), so each part looks round
  rather than flat. The shadows parts cast on what's just below them (her hat's brim on her hair,
  her fringe on her forehead) are added at the end of each frame (`castShadows()` in `rig.ts`).
- _Selective outlining_: each part is outlined in the darkest shade of its own colour rather than
  in black, so her silver hair has a dusky violet outline and her skin a rose one. The parts stay
  distinct without the heavy look of black lines.

As the comment at the top of the file says, each body part is drawn into a `Layer` of materials,
and `ink()` shades and outlines it and lays it over the frame so far.

### `Point` and `Ramp`

<!-- code: apps/desktop/src/renderer/src/character/raster.ts#Point,Ramp -->

[`src/renderer/src/character/raster.ts`, lines 1–25](../../apps/desktop/src/renderer/src/character/raster.ts#L1-L25)

```ts
// A tiny pixel-art rasteriser for the character: shapes drawn straight onto a grid of pixels (no
// smoothing), then cel-shaded and outlined the way pixel artists do it by hand. Each body part is
// drawn into a Layer of materials (hair, skin, robe...); `ink()` turns a layer into palette
// letters, shading the side away from the light and outlining it in a dark shade of its own
// material, and lays it over the frame so far. Coordinates are in pixels; a pixel's centre is at
// (x + 0.5, y + 0.5).

export interface Point {
  x: number
  y: number
}

/** A material's letters (see PALETTE in sprite.ts): outline, shadow, base, and optionally light. */
export interface Ramp {
  line: string
  shade: string
  base: string
  light?: string
  /**
   * The share of the shape, across each row, in its shadow on the side away from the light (0 to
   * 1): a broad band of shade, two-tone like anime cel shading, that gives it some volume. Left
   * out, only a rim of shade along that edge.
   */
  form?: number
}
```

<!-- /code -->

- `Point`: a position (or an offset) in pixels. Fractions are allowed: shapes are worked out
  exactly and only become whole pixels when they're filled. As the file's comment says, a pixel's
  centre is at `(x + 0.5, y + 0.5)`.
- `Ramp`: a material's shades, as letters of the palette (`PALETTE` in `sprite.ts`): `line` for its
  outline, `shade` for the side away from the light, `base` for the rest, and an optional `light`
  for the edge toward the light. `rig.ts` gives each material its ramp (`RAMPS`).
- `form?: number`: as its comment says, how much of the shape, across each row, is in shadow on the
  side away from the light, from 0 to 1. `0.3` shades the far 30% of every row of the shape: a
  broad band of shade, two-tone like anime cel shading, that gives it some volume. A ramp without
  it gets only the rim of shade along that edge (see `ink()`).

### `Layer`

<!-- code: apps/desktop/src/renderer/src/character/raster.ts#Layer.class -->

[`src/renderer/src/character/raster.ts`, lines 27–31](../../apps/desktop/src/renderer/src/character/raster.ts#L27-L31)

```ts
/**
 * A body part's pixels, each the name of its material (or undefined: not part of it): `size`
 * pixels square, and `top` rows more above that (y from -top), as the frame it goes on has.
 */
export class Layer {
  // …
}
```

<!-- /code -->

<!-- code: apps/desktop/src/renderer/src/character/raster.ts#Layer.cells,minX,minY,maxX,maxY,constructor,get,set -->

[`src/renderer/src/character/raster.ts`, lines 32–58](../../apps/desktop/src/renderer/src/character/raster.ts#L32-L58)

```ts
readonly cells: (string | undefined)[]

/** The box round every pixel set so far (empty while minX > maxX). */
minX = Infinity

minY = Infinity

maxX = -Infinity

maxY = -Infinity

constructor(
  readonly size: number,
  readonly top = 0,
) {
  this.cells = new Array<string | undefined>(size * (size + top))
}

get(x: number, y: number): string | undefined {
  if (x < 0 || y < -this.top || x >= this.size || y >= this.size) return undefined
  return this.cells[(y + this.top) * this.size + x]
}

set(x: number, y: number, material: string | undefined): void {
  if (x < 0 || y < -this.top || x >= this.size || y >= this.size) return
  this.cells[(y + this.top) * this.size + x] = material
  if (material === undefined) return
  this.minX = Math.min(this.minX, x)
  this.minY = Math.min(this.minY, y)
  this.maxX = Math.max(this.maxX, x)
  this.maxY = Math.max(this.maxY, y)
}
```

<!-- /code -->

A body part being drawn, before it's shaded: a grid the size of the frame, where each pixel holds
the name of a material (`'hair'`, `'skin'`), or `undefined` where the part isn't. As the comment
says, it's `size` pixels square, with `top` rows more above the square, as the frame has (for her
hat when she rises off the ground). Those rows have negative y, from `-top` up to -1, so the
square's own rows keep their numbers, 0 to `size - 1`, and nothing drawn in them has to change.
Keeping materials rather than colours lets one part mix several (an arm's layer has her hand, the
sleeve and its silver cuff) and still be shaded and outlined as one shape.

- `readonly cells: (string | undefined)[]`: the pixels, row after row in one list, the rows above
  the square first, so pixel `(x, y)` is at `(y + top) * size + x`.
- `minX`, `minY`, `maxX`, `maxY`: as the comment says, the box round every pixel set so far, so
  `ink()` only looks at that part of the grid rather than all of it (96 × 104 = 9,984 pixels). They
  start inside out (`Infinity` and `-Infinity`), so the first pixel set becomes the whole box.
- `constructor(readonly size: number, readonly top = 0)`: `readonly size` declares a field from the
  parameter (the same shorthand as `private readonly deps` in `BubbleController`). `top` does the
  same, and `= 0` means a layer made with just a size has no rows above the square.
  `new Array<string | undefined>(size * (size + top))` makes a list of that length (`size` wide,
  `size + top` tall) with nothing in it yet.
- `get(x, y)`: a pixel's material, or `undefined` off the grid, so code can look at a neighbour
  without checking for the edge first. Off the grid at the top now means above `-top`, not above 0.
- `set(x, y, material)`: sets a pixel, ignoring anything off the grid (a raised arm can reach past
  the top without harm), and grows the box to take it in. Setting `undefined` clears a pixel
  without growing the box.

### `Layer.fill()`

<!-- code: apps/desktop/src/renderer/src/character/raster.ts#Layer.fill -->

[`src/renderer/src/character/raster.ts`, lines 60–71](../../apps/desktop/src/renderer/src/character/raster.ts#L60-L71)

```ts
/** Fills every pixel whose centre passes `inside`, within the box from `min` to `max`. */
fill(min: Point, max: Point, material: string, inside: (x: number, y: number) => boolean): void {
  const x0 = Math.max(0, Math.floor(min.x))
  const y0 = Math.max(-this.top, Math.floor(min.y))
  const x1 = Math.min(this.size - 1, Math.ceil(max.x))
  const y1 = Math.min(this.size - 1, Math.ceil(max.y))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (inside(x + 0.5, y + 0.5)) this.set(x, y, material)
    }
  }
}
```

<!-- /code -->

Fills every pixel whose centre passes a test. Every shape below is drawn this way, so each one
only has to say whether a point is inside it.

- `min` and `max`: a box round the shape, so only pixels that could be inside are tested.
  `Math.floor()` and `Math.ceil()` widen it to whole pixels, and `Math.max(0, ...)` and
  `Math.min(this.size - 1, ...)` keep it on the grid.
- `Math.max(-this.top, Math.floor(min.y))`: at the top, the grid ends at `-top`, not 0, so a shape
  can be filled into the rows above the square (her hat's tip, when she jumps).
- `inside(x + 0.5, y + 0.5)`: the test is made at the pixel's centre, and a pixel is either in or
  out. There's no partly covered pixel, so no smoothing (anti-aliasing): edges stay as crisp steps,
  as pixel art should.

### `Layer.polygon()` and `ellipse()`

<!-- code: apps/desktop/src/renderer/src/character/raster.ts#Layer.polygon,ellipse -->

[`src/renderer/src/character/raster.ts`, lines 73–103](../../apps/desktop/src/renderer/src/character/raster.ts#L73-L103)

```ts
/** A filled polygon (even-odd rule). */
polygon(points: Point[], material: string): void {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  this.fill(
    { x: Math.min(...xs), y: Math.min(...ys) },
    { x: Math.max(...xs), y: Math.max(...ys) },
    material,
    (px, py) => {
      let inside = false
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i]!
        const b = points[j]!
        if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) {
          inside = !inside
        }
      }
      return inside
    },
  )
}

/** A filled ellipse. */
ellipse(centre: Point, rx: number, ry: number, material: string): void {
  this.fill(
    { x: centre.x - rx, y: centre.y - ry },
    { x: centre.x + rx, y: centre.y + ry },
    material,
    (px, py) => ((px - centre.x) / rx) ** 2 + ((py - centre.y) / ry) ** 2 <= 1,
  )
}
```

<!-- /code -->

- `polygon(points, material)`: a filled shape with straight sides, the points in order round it.
  The box is the points' lowest and highest `x` and `y`. The test is the _even-odd rule_ the
  comment mentions: imagine a line from the pixel's centre off to the right and count how many of
  the polygon's sides it crosses; an odd number means the centre is inside. The loop goes round the
  sides from `a` to `b` (`j` trails one behind `i`, starting at the last point, so the shape
  closes). `a.y > py !== b.y > py` checks the side reaches the centre's height, and the rest works
  out whether it crosses to the right of the centre. Most of her is polygons: her hair, robe, hat,
  ears, chin and boots.
- `ellipse(centre, rx, ry, material)`: a filled ellipse reaching `rx` across and `ry` up and down
  from its centre. `((px - centre.x) / rx) ** 2 + ((py - centre.y) / ry) ** 2 <= 1` is the equation
  of an ellipse (`**` is "to the power of"). Her head, hands, hat brim and shadow are ellipses.

### `Layer.capsule()` and `chain()`

<!-- code: apps/desktop/src/renderer/src/character/raster.ts#Layer.capsule,chain -->

[`src/renderer/src/character/raster.ts`, lines 105–131](../../apps/desktop/src/renderer/src/character/raster.ts#L105-L131)

```ts
/** A thick line from `a` to `b`, `ra` wide at `a` tapering (or swelling) to `rb` at `b`. */
capsule(a: Point, b: Point, ra: number, rb: number, material: string): void {
  const r = Math.max(ra, rb)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length2 = dx * dx + dy * dy || 1
  this.fill(
    { x: Math.min(a.x, b.x) - r, y: Math.min(a.y, b.y) - r },
    { x: Math.max(a.x, b.x) + r, y: Math.max(a.y, b.y) + r },
    material,
    (px, py) => {
      const t = Math.min(1, Math.max(0, ((px - a.x) * dx + (py - a.y) * dy) / length2))
      const cx = a.x + dx * t
      const cy = a.y + dy * t
      return Math.hypot(px - cx, py - cy) <= ra + (rb - ra) * t
    },
  )
}

/** A chain of thick lines through `points`, its width going from `ra` to `rb`. */
chain(points: Point[], ra: number, rb: number, material: string): void {
  for (let i = 0; i < points.length - 1; i++) {
    const t0 = i / (points.length - 1)
    const t1 = (i + 1) / (points.length - 1)
    this.capsule(points[i]!, points[i + 1]!, ra + (rb - ra) * t0, ra + (rb - ra) * t1, material)
  }
}
```

<!-- /code -->

- `capsule(a, b, ra, rb, material)`: as the comment says, a thick line from `a` to `b` with rounded
  ends, its radius `ra` at `a` and `rb` at `b`. Her upper arms, legs and neck are capsules. For
  each pixel it finds the nearest point on the line: `t` is how far along (0 at `a`, 1 at `b`),
  worked out by projecting the pixel onto the line (the dot product of its offset with the line,
  over the line's length squared, `length2`). `Math.min(1, Math.max(0, ...))` keeps it between the
  ends, which is what rounds them off, and `|| 1` stops a line of no length dividing by zero. The
  pixel is inside when it's within the radius at that point, `ra + (rb - ra) * t`, so a leg can
  taper toward the ankle and a lock of hair to a point.
- `chain(points, ra, rb, material)`: capsules joined end to end through a list of points, the
  radius going evenly from `ra` at the first point to `rb` at the last (`t0` and `t1` are how far
  along the chain each piece starts and ends). Her side locks are chains: curved, and tapering
  toward the tip.

### `Canvas`

<!-- code: apps/desktop/src/renderer/src/character/raster.ts#Canvas.class -->

[`src/renderer/src/character/raster.ts`, lines 134–139](../../apps/desktop/src/renderer/src/character/raster.ts#L134-L139)

```ts
/**
 * A frame being drawn: rows of palette letters, `.` where nothing is drawn yet. It's `size`
 * pixels square, with `top` rows more above the square (y from -top up to -1) for anything that
 * rises above it, such as her hat when she jumps.
 */
export class Canvas {
  // …
}
```

<!-- /code -->

<!-- code: apps/desktop/src/renderer/src/character/raster.ts#Canvas.cells,constructor,get,set -->

[`src/renderer/src/character/raster.ts`, lines 140–156](../../apps/desktop/src/renderer/src/character/raster.ts#L140-L156)

```ts
readonly cells: string[]

constructor(
  readonly size: number,
  readonly top = 0,
) {
  this.cells = new Array<string>(size * (size + top)).fill('.')
}

get(x: number, y: number): string {
  if (x < 0 || y < -this.top || x >= this.size || y >= this.size) return '.'
  return this.cells[(y + this.top) * this.size + x]!
}

set(x: number, y: number, letter: string): void {
  if (x < 0 || y < -this.top || x >= this.size || y >= this.size) return
  this.cells[(y + this.top) * this.size + x] = letter
}
```

<!-- /code -->

The frame itself, as palette letters. Where a `Layer` holds one part's materials, the `Canvas`
holds the finished colours of everything drawn so far, `.` where nothing has been drawn
(see-through). `rig.ts` makes one `Canvas` per frame and inks each part onto it in turn, back to
front. As the comment says, it's `size` pixels square with `top` rows more above the square, y
from `-top` up to -1, for anything that rises above it, such as her hat when she jumps; its layers
have the same rows.

- `constructor(readonly size: number, readonly top = 0)`: as in `Layer`, both become fields, and
  `top` is 0 unless it's given.
- `new Array<string>(size * (size + top)).fill('.')`: `size` wide and `size + top` tall, and every
  pixel starts see-through.
- `get(x, y)` gives `.` off the grid, and `set(x, y, letter)` ignores pixels off the grid, as in
  `Layer`: `(y + this.top)` counts the rows from the top of the frame, the ones above the square
  first.

### `Canvas.ink()`

<!-- code: apps/desktop/src/renderer/src/character/raster.ts#Canvas.ink -->

[`src/renderer/src/character/raster.ts`, lines 158–200](../../apps/desktop/src/renderer/src/character/raster.ts#L158-L200)

```ts
/**
 * Lays a layer over the frame: each pixel shaded by where it sits in its shape, then a one-pixel
 * outline round the shape in its material's darkest shade. `light` is where the light comes
 * from (a small offset, such as up and to the left): a pixel whose neighbour that way is outside
 * the shape is lit, and one whose neighbour the other way (twice as far) is outside is in shade.
 */
ink(layer: Layer, ramps: Record<string, Ramp>, light: Point, outline = true): void {
  const inside = (x: number, y: number) => layer.get(x, y) !== undefined
  for (let y = layer.minY; y <= layer.maxY; y++) {
    // Each run of the shape along this row: where it starts and ends, for its form shadow.
    let runStart = layer.minX
    let runEnd = layer.minX
    for (let x = layer.minX; x <= layer.maxX; x++) {
      const material = layer.get(x, y)
      if (material === undefined) continue
      if (!inside(x - 1, y)) {
        runStart = x
        runEnd = x
        while (inside(runEnd + 1, y)) runEnd++
      }
      const ramp = ramps[material]!
      let inForm = false
      if (ramp.form && light.x !== 0) {
        // How far the run goes on, away from the light (light from the left: to the right).
        const beyond = light.x < 0 ? runEnd - x : x - runStart
        inForm = beyond < ramp.form * (runEnd - runStart + 1)
      }
      const shaded =
        inForm || !inside(x - light.x * 2, y - light.y * 2) || !inside(x - light.x, y - light.y)
      const lit = !inside(x + light.x, y + light.y)
      this.set(x, y, shaded ? ramp.shade : lit && ramp.light ? ramp.light : ramp.base)
    }
  }
  if (!outline) return
  for (let y = layer.minY - 1; y <= layer.maxY + 1; y++) {
    for (let x = layer.minX - 1; x <= layer.maxX + 1; x++) {
      if (inside(x, y)) continue
      const next =
        layer.get(x - 1, y) ?? layer.get(x + 1, y) ?? layer.get(x, y - 1) ?? layer.get(x, y + 1)
      if (next !== undefined) this.set(x, y, ramps[next]!.line)
    }
  }
}
```

<!-- /code -->

The heart of the drawing. As the comment says, it lays a layer over the frame, each pixel shaded by
where it sits in its shape, then outlines the shape. `ramps` gives each material's letters, and
`light` is a one-pixel step toward the light, such as `{ x: -1, y: -1 }` for up and to the left.

- `inside(x, y)`: whether a pixel is part of this layer.
- The first pair of loops colours the layer's pixels, within its box, a row at a time. Each pixel's
  colour depends only on the layer's other pixels:
  - `runStart` and `runEnd`: as the comment says, where the run of the shape the pixel is in
    starts and ends. A _run_ is an unbroken stretch of the layer along the row; where the pixel to
    the left isn't part of the layer (`!inside(x - 1, y)`), a new run starts here, and its end is
    found once, by stepping right while the next pixel is still in the layer.
  - `inForm`: the form shadow, for a material with a `form` (and a light that comes from one side:
    with `light.x` 0, straight from above, neither side is further from it). `beyond` is how much
    of the run lies further from
    the light than this pixel: with the light from the left (`light.x < 0`), the pixels to its
    right (`runEnd - x`); otherwise those to its left. The pixel is in the form shadow when that's
    less than `form` times the run's length, so the far `form` share of every run is shaded.
    Following each row of the shape, the band curves with its edge.
  - `shaded`: the pixel is in the form shadow, or the pixel one step away from the light
    (`x - light.x, y - light.y`, which with the light up and to the left is down and to the right),
    or two steps away, is outside the shape. So the edges facing away from the light get a band of
    shadow at least two pixels deep.
  - `lit`: the pixel one step toward the light is outside the shape, so the edges facing the light
    get a one-pixel highlight, for materials that have a `light` shade.
  - `shaded ? ramp.shade : lit && ramp.light ? ramp.light : ramp.base`: shadow wins where both
    apply (on a part only a few pixels wide), and everything else is the base colour.
- That's cel shading: flat bands of colour following the shape's edges rather than smooth
  gradients. It needs no 3D model, only the silhouette. Because each part is inked on its own, each
  is shaded by its own shape: a sleeve in front of the robe gets its own shadow along its lower
  edge. A run counts every pixel of the layer, whatever its material, but each pixel uses its own
  material's `form`.
- `if (!outline) return`: her shadow on the taskbar is inked without an outline.
- The second pair of loops draws the outline: every pixel just outside the shape (the loops reach
  one pixel beyond the box on every side) that touches it directly to the left, right, above or
  below gets the `line` letter of the material it touches. `??` takes the first neighbour that's
  part of the layer. Only those four neighbours count, not the diagonals, so the outline is one
  pixel thick without heavy corners. It's the darkest shade of the part's own colour (selective
  outlining), and it's drawn over whatever was there, so a part in front is outlined against the
  parts behind it. That's what keeps an arm readable against a robe of the same colour.

### `Canvas.stamp()` and `rows()`

<!-- code: apps/desktop/src/renderer/src/character/raster.ts#Canvas.stamp,rows -->

[`src/renderer/src/character/raster.ts`, lines 202–219](../../apps/desktop/src/renderer/src/character/raster.ts#L202-L219)

```ts
/** Stamps a small hand-drawn picture (rows of letters, `.` see-through) at a place. */
stamp(rows: readonly string[], x: number, y: number, flip = false): void {
  rows.forEach((row, dy) => {
    const letters = flip ? [...row].reverse() : [...row]
    letters.forEach((letter, dx) => {
      if (letter !== '.') this.set(Math.round(x) + dx, Math.round(y) + dy, letter)
    })
  })
}

/** The frame's rows, top to bottom: the `top` rows above the square first. */
rows(): string[] {
  const rows: string[] = []
  for (let y = 0; y < this.size + this.top; y++) {
    rows.push(this.cells.slice(y * this.size, (y + 1) * this.size).join(''))
  }
  return rows
}
```

<!-- /code -->

- `stamp(rows, x, y, flip)`: as the comment says, stamps a small hand-drawn picture (rows of
  letters, `.` see-through) with its top-left at `(x, y)`, rounded to whole pixels. Some things are
  too small to draw well as shapes, so they're drawn by hand: her eyes, mouths, blush and fingers,
  the gem brooch, the sparkles of a spell, the butterfly and the dozer's z's (`EYES`, `MOUTHS`,
  `SPARKLE`, `TWINKLE`, `BUTTERFLY_OPEN` and the rest in `rig.ts`). `flip` mirrors the picture left
  to right (`[...row]` splits a row into its letters, and `reverse()` turns them round); the z's
  use it for frames that will be mirrored to face left (`flipText`).
- `rows()`: as its comment says, the finished frame, top to bottom, as `size + top` strings of
  `size` letters, one per row, which is what a `Frame` holds. The `top` rows above the square come
  first, so a row's place in the list is its y plus `top`. `slice()` takes each row's stretch of
  the list and `join('')` makes it a string.

### `rotate()`, `add` and `limb()`

<!-- code: apps/desktop/src/renderer/src/character/raster.ts#rotate,add,limb -->

[`src/renderer/src/character/raster.ts`, lines 222–237](../../apps/desktop/src/renderer/src/character/raster.ts#L222-L237)

```ts
/** `v` turned by `angle` (radians, clockwise on screen). */
export function rotate(v: Point, angle: number): Point {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c }
}

export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y })

/**
 * The end of a limb `length` long from `origin`, at `angle` from straight down: positive swings
 * it toward the way she faces (+x), negative behind her.
 */
export function limb(origin: Point, length: number, angle: number): Point {
  return { x: origin.x + Math.sin(angle) * length, y: origin.y + Math.cos(angle) * length }
}
```

<!-- /code -->

The bits of geometry the rig is built from. Angles are in radians: a full turn is `2π` (about
6.28), so a right angle is about 1.57.

- `rotate(v, angle)`: as the comment says, an offset turned by an angle, clockwise on screen
  (because a screen's `y` grows downward). It's the standard rotation formula, with the angle's
  cosine and sine. The rig uses it to place points on a part that leans or tilts.
- `add(a, b)`: two points added together, such as a joint and an offset from it.
- `limb(origin, length, angle)`: as the comment says, the far end of a limb `length` long from
  `origin` (a shoulder, elbow, hip or knee), at `angle` from hanging straight down. `Math.sin()`
  gives how far it reaches sideways and `Math.cos()` how far down: at 0 it hangs straight down, at
  about 1.57 it points straight ahead, and at about 3.14 straight up. Positive angles swing toward
  the way she faces (`+x`: the rig always draws her facing right), negative ones behind her.

## `src/renderer/src/character/rig.ts`: her skeleton and shapes

As the comment at the top says, the _rig_ is her skeleton and the shapes that hang on it, and
`draw()` turns one pose into one frame of pixel art. A pose (`Pose` below, not the same thing as
the `Pose` in `src/shared/character.ts`, which names a whole animation) is a handful of numbers:
which way she's seen from, where her hips are, how she leans, the angles of her arms and legs, her
face, what she's holding, and how the wind pushes her hair and robe. `sprite.ts` makes her
animations by giving `draw()` a pose for every frame.

As the comment also says, she's an original design: an elf mage with long pointed ears, long
silver-white hair down her back (with a fringe and locks beside her face), amber eyes, a
wide-brimmed crooked hat, and a long flared robe in the tenant's accent colour, with bell sleeves,
silver trim, a darker sash and a gem brooch, over dark stockings and boots. Her clothes are
patterned: a gold buckle, a gold crescent moon and stars and silver stitching on her hat; a border
of gold diamonds above the robe's hem, silver stars over its skirt, gold buttons, a gold buckle on
the sash and a gold line above each cuff; turned-down cuffs, laces and buckled straps on her boots.
How she's drawn follows common practice in anime-style pixel art:

- Big eyes with a thick upper lid and an iris that's darker at the top, with a white glint in the
  same corner of both eyes, as if from the same light. A small mouth, only a couple of pixels.
- Hair drawn as clumps rather than strands: a fringe with a jagged edge, locks hanging beside her
  face, long hair down her back ending in clumps of different lengths, with a couple of darker
  lines between them, and a band of shine across the crown.
- Every frame on the same baseline: her feet are on the grid's bottom rows (unless she's in the
  air), which are the window's bottom edge, so she doesn't jitter up and down as the frames change.
- Shading that gives her volume rather than leaving her flat: a broad two-tone shadow across the
  side of each part away from the light (`form` in `RAMPS`), folds in her skirt, and the shadows
  parts cast on what's just below them, such as her hat's brim on her hair, her fringe on her
  forehead and her hem on her boots (`castShadows()`).
- Patterns small enough to read at this size: a pixel or a few per motif (a three-by-three
  diamond, a four-pixel moon, single-pixel stars), set only on the part they belong to, in a
  colour that stands out from it (gold or silver on the deep robe and hat, pale leather on the
  boots), and repeated evenly so they read as a pattern rather than noise.

### `GRID`

<!-- code: apps/desktop/src/renderer/src/character/rig.ts#GRID,HEADROOM,RIPPLE -->

[`src/renderer/src/character/rig.ts`, lines 5–32](../../apps/desktop/src/renderer/src/character/rig.ts#L5-L32)

```ts
// The character's rig: her skeleton and the shapes that hang on it, drawn as pixel art for one
// pose. She's an original design: an elf mage with long pointed ears, long silver-white hair
// down her back, amber eyes, a wide-brimmed crooked hat (a gold buckle on its band, a gold moon and
// stars on its crown, silver stitching round its brim), and a long robe in the tenant's accent
// colour with bell sleeves, silver trim, gold embroidery (a border of diamonds above the hem, a
// line above each cuff), silver stars, gold buttons, a sash with a gold buckle and a gem brooch,
// over dark stockings and laced boots with turned-down cuffs and buckled straps.
//
// A pose says which way she's seen from (front, diagonal or side, always facing right; frames
// facing left are mirrored), where her hips are, how she leans, her arms' and legs' angles, her
// face, and how the wind or a fall pushes her hair and robe. `draw()` turns a pose into a frame.
// She's about 88 pixels tall with her hat on a 96-pixel grid, her feet on the bottom row, and
// there are HEADROOM rows more above the grid for her hat when she rises off the ground.

export const GRID = 96

/**
 * Rows above the grid (y from -HEADROOM to -1) for her hat when she's off the ground: a hop,
 * levitating, being carried. Her window has the same room above her (UI.bubbleHeadroom).
 */
export const HEADROOM = UI.bubbleHeadroom

/**
 * Her hair's ripple as she walks (see Pose.flow): its wave number (radians a pixel down her hair,
 * so a wave is about 30 pixels long, as long as her hair), how far it sways at the length of her
 * hair below her head (pixels; less above, more at the tips), and how close together the points
 * are that let it bend.
 */
const RIPPLE = { k: 0.2, size: 1.2, step: 2 }
```

<!-- /code -->

`GRID = 96`: her grid is 96 pixels square, as wide as the bubble's window at her usual size
(`BUBBLE_BOX`, 96 DIPs), so one pixel is one DIP; when she's bigger, the same frame is drawn
bigger, a pixel two DIPs across at twice her size, and so on. As the comment above it says, she's
about 88 pixels tall with her hat on, her feet on the bottom row. That leaves only a few rows of the
grid above the tip of her hat, which is why her hop is a small one; even so, at the top of it the
tip went out of the top of the grid and was cut off.

So, as the comment goes on to say, there are `HEADROOM` rows more above the grid: 8 rows, y from
-8 to -1, for her hat when she's off the ground (a hop,
levitating, being carried). It's taken from `UI` in `src/shared/geometry.ts` because, as its
comment says, her window has the same room above her, so a frame is 96 pixels wide and 104 tall
and still fills her window, one pixel a DIP. `draw()` makes its canvas and every layer with it
(`new Canvas(GRID, HEADROOM)`, `new Layer(GRID, HEADROOM)`). Because the extra rows have negative y,
the grid's own rows keep their numbers, so none of the coordinates below had to change.

`RIPPLE` sets the wave that runs down her hair as she walks (`flow` in the pose, below). As its
comment says, `k` is its wave number: 0.2 radians for each pixel down her hair, so one wave is about
31 pixels long (2π ÷ 0.2), as long as her hair, and her hair bends in one S rather than wiggling.
`size` is how far it sways, in pixels, at 20 pixels below the top of her head; it's scaled the same
way as the wind (`t`, in `blown()`), so the roots hardly move and the tips sway most, a little under
two pixels. `step` is the most distance between the points of a rippling shape (`supple()`, below):
2 pixels, close enough that its edges curve smoothly.

### `RAMPS` and `LIGHT`

<!-- code: apps/desktop/src/renderer/src/character/rig.ts#RAMPS,LIGHT -->

[`src/renderer/src/character/rig.ts`, lines 34–51](../../apps/desktop/src/renderer/src/character/rig.ts#L34-L51)

```ts
/** Each material's shades, as palette letters (see PALETTE in sprite.ts). */
const RAMPS: Record<string, Ramp> = {
  // A broad shadow across the side of each away from the light (`form`), less on her face.
  hair: { line: 'O', shade: 'D', base: 'h', light: 'l', form: 0.28 },
  skin: { line: 'K', shade: 'S', base: 's', light: 'z', form: 0.16 },
  robe: { line: 'q', shade: 'A', base: 'a', light: 'v', form: 0.3 },
  trim: { line: 'q', shade: 'F', base: 'f' },
  hat: { line: 'q', shade: 'N', base: 'n', light: 'g', form: 0.3 },
  stocking: { line: 'u', shade: 'Q', base: 'o', form: 0.35 },
  boot: { line: 'u', shade: 'B', base: 'b', light: 'y', form: 0.35 },
  cup: { line: 'u', shade: 'F', base: 'f', light: 'w' },
  orb: { line: 'O', shade: 'G', base: 'G', light: 'w' },
  book: { line: 'u', shade: 'N', base: 'n', light: 'g' },
  shadow: { line: 'x', shade: 'x', base: 'x' },
}

/** The light comes from up and to the left (of a figure facing right). */
const LIGHT: Point = { x: -1, y: -1 }
```

<!-- /code -->

- `RAMPS`: each material's ramp (`Ramp` in `raster.ts`): which letters of `PALETTE` (in
  `sprite.ts`) are its outline, shadow, base and light. Most have all four; the trim, stockings
  and shadow make do with fewer.
  - `form`: as the comment says, a broad shadow across the side of each away from the light: 28%
    of each row of her hair, 30% of her robe and hat, 35% of her stockings and boots, and only 16%
    of her skin, so her face stays mostly light. The trim, cup, orb, book and shadow have none.
  - `robe`, `trim` and `hat` share the robe's outline (`q`). The trim is the silver along the
    robe's edges; it's mostly set pixel by pixel on top of the robe, and only inked as a shape of
    its own at the cuff of each sleeve.
  - The stockings, boots, cup and book share one dark outline (`u`).
  - The teacup borrows the trim's silver, with a white light (`w`), and the spellbook's cover the
    hat's letters.
  - `orb`: the crystal ball, in the teal of her gem brooch (`G`) all over, shade and base alike,
    with a white light (`w`) on its upper left and the hair's dark outline (`O`).
  - `shadow`: her shadow on the taskbar, one see-through dark colour (`x`) throughout.
- `LIGHT`: as the comment says, the light comes from up and to the left of a figure facing right.
  It's the step `ink()` takes toward the light. Frames facing left are mirrored, so for them the
  light comes from the upper right, which is hard to notice.

### `View`, `Face`, `Arm`, `Leg`, `Pose`, `DOWN`, `STAND` and `LEG_LENGTH`

<!-- code: apps/desktop/src/renderer/src/character/rig.ts#View,Face,Arm,Leg,Pose,DOWN,STAND,LEG_LENGTH -->

[`src/renderer/src/character/rig.ts`, lines 53–175](../../apps/desktop/src/renderer/src/character/rig.ts#L53-L175)

```ts
export type View = 'front' | 'diagonal' | 'side'

export type Face =
  'neutral' | 'blink' | 'happy' | 'surprised' | 'yawn' | 'sip' | 'down' | 'awe' | 'up' | 'chant'

/** Angles in radians from hanging straight down. */
export interface Arm {
  shoulder: number
  elbow: number
}

export interface Leg {
  hip: number
  knee: number
}

export interface Pose {
  view: View
  /** Her hips' offset from where they are standing still (pixels; negative y is up). */
  x?: number
  y?: number
  /** Her body tipped toward the way she faces (radians), and her head tilted. */
  lean?: number
  tilt?: number
  /**
   * Her arms and legs: [near, far] seen diagonally or side on (positive angles swing forward), or
   * [right of the picture, left] from the front (positive angles swing outward).
   */
  arms?: [Arm, Arm]
  legs?: [Leg, Leg]
  face?: Face
  /** Where her eyes look from the front: -1 left, 1 right. */
  look?: number
  /** Her hair and robe pushed sideways (pixels at the tips; negative is behind her). */
  wind?: number
  /**
   * A ripple running down her hair from her head to its tips (as she walks), this far through
   * its cycle (radians, one cycle 2π). Left out, her hair doesn't ripple.
   */
  flow?: number
  /** Her hair lifted (pixels at the tips), as when she's falling or carried up. */
  lift?: number
  /** Something in her hands: a teacup, her spellbook or a crystal ball (held in both hands). */
  prop?: 'cup' | 'book' | 'orb'
  /** Sparkles round her near hand, 0 to 1 (a little spell). */
  sparkle?: number
  /** Sitting on the taskbar with her knees up under her robe. */
  sitting?: boolean
  /** Her shadow on the taskbar (true unless said otherwise; not while she's carried). */
  shadow?: boolean
  /** A magic circle on the ground under her, 0 (none) to 1 (full size), as she levitates. */
  rune?: number
  /** How far its runes have turned (whole turns), and how far its sparks have risen. */
  spin?: number
  /** Her robe's hem held or flung out, this many pixels wider each side (a curtsy, a twirl). */
  spread?: number
  /** A little butterfly's flight, 0 to 1: coming to her raised hand, resting on it, flying off. */
  butterfly?: number
  /** Z's floating up from her as she dozes, 0 to 1 (none at 0). */
  zzz?: number
  /** Letters (the z's) drawn back to front, for a frame that will be mirrored to face left. */
  flipText?: boolean
  /** Three little orbs juggled between her hands (from the front), this far through (0 to 1). */
  juggle?: number
  /** Magic bubbles blown through a little wand ring at her near hand (seen diagonally), 0 to 1. */
  bubbles?: number
  /** A will-o'-wisp going round her (from the front), 0 to 1: see wispAt. */
  wisp?: number
  /** A sneeze's burst of sparkles flying out from her nose, 0 to 1 (none at 0). */
  burst?: number
  /** Her sparkle trail as she walks: how far through her stride she is (0 to 1; none if left out). */
  trail?: number
  /**
   * Dissolving into white motes, from 0 (all of her) to FADE.end (nothing left, the last motes
   * gone): see FADE. Played backwards, she forms out of them.
   */
  fade?: number
  /**
   * From the front only: turned round, her back to us (watching the sunset in the screen saver).
   * Her long hair falls over her back from the crown of her head, her ears through it, and nothing
   * on her front shows: no face, collar, brooch, buttons or buckles, nor the hat's buckle and moon.
   */
  back?: boolean
  /** A flame in her near palm (seen diagonally), 0 to 1: kindled, flickering, blown out in smoke. */
  flame?: number
  /** A snowflake forming over her cupped hands (from the front), 0 to 1, then bursting into glitter. */
  frost?: number
  /** A flower growing up in front of her (seen diagonally), 0 to 1: blooming, then scattering. */
  bloom?: number
  /** A star traced in light in the air beside her (from the front), 0 to 1: flaring, then fading. */
  sigil?: number
  /** A rainbow over her (from the front), 0 to 1: painted from the top outward, then fading. */
  rainbow?: number
  /** Her hat lifted off her head (pixels up), and turned about its middle (radians; 0 faces us). */
  hatLift?: number
  hatTurn?: number
  /** Sparkles showering down from under her lifted hat, 0 to 1 (none at 0). */
  shower?: number
  /** A falling star (from the front), 0 to 1: falling into her hands, glowing, tossed back up. */
  star?: number
  /** A little rain cloud over her (from the front), 0 to 1: gathering, raining, bursting. */
  rain?: number
  /** A potion in her near hand (seen diagonally), 0 to 1: bubbling, uncorked in a puff of smoke. */
  potion?: number
  /** Her spellbook floating open in front of her (from the front), 0 to 1: see TOME. */
  tome?: number
  /** Stars going round above her head after a hard landing, this far round (whole turns). */
  dizzy?: number
  /** Dust puffing out along the ground either side of her after a hard landing, 0 to 1. */
  dust?: number
  /** Confetti bursting up from her hands and fluttering down round her, 0 to 1. */
  confetti?: number
  /** Hearts floating up from her (petted), 0 to 1. */
  hearts?: number
  /** A scroll held open in front of her in both hands (from the front). */
  scroll?: boolean
  /** A bead of sweat by her forehead (nervous). */
  sweat?: boolean
}

const DOWN: Arm = { shoulder: 0.08, elbow: 0 }

const STAND: Leg = { hip: 0, knee: 0 }

/** Thigh and shin, each (pixels); standing, her hips are this high above her ankles twice over. */
export const LEG_LENGTH = 16.5
```

<!-- /code -->

What a pose is made of.

- `View`: which way she's seen from. `front` faces you, `side` is side on (walking), and
  `diagonal` is in between, turned partly toward the way she faces: for the wave, the sip, reading
  and the spell, where her hands are busy in front of her. The twirl goes through all three as she
  spins.
- `Face`: her expression: `neutral`, `blink` (eyes shut), `happy` (smiling eyes and mouth),
  `surprised` (mouth open, while she's carried), `yawn`, `sip` (eyes closed contentedly, lips on
  the cup), `down` (looking down at her book), for her vision, `awe` (looking up, mouth open in
  wonder) and `up` (looking up, smiling), and, for her explosion spell, `chant` (eyes shut, her
  mouth a little open as she chants).
- `Arm` and `Leg`: as the comment says, angles in radians from hanging straight down. The shoulder
  (or hip) is the upper limb's angle, and the elbow (or knee) bends the lower limb from there. A
  knee bends the other way to an elbow: a positive `knee` swings the shin back
  (`(leg.hip - leg.knee) * sign` in `draw()`).
- `Pose`: everything but `view` is optional, so a pose only says what's different from standing
  still.
  - `x`, `y`: her hips moved from where they are standing still, in pixels; negative `y` is up (the
    hop), positive down (a crouch, or breathing out).
  - `lean` tips her whole body toward the way she faces, and `tilt` tips her head on top of that.
  - `arms` and `legs`: as the comment says, near then far when seen diagonally or side on, with
    positive angles swinging forward; from the front, the arm on the right of the picture then the
    left, with positive angles swinging outward, so the same numbers raise both arms evenly.
  - `look`: where her eyes look from the front, a pixel left or right.
  - `wind` pushes her hair and robe sideways (negative is behind her, as when she walks), and
    `lift` raises her hair (falling, or carried up).
  - `flow`: as the comment says, a ripple running down her hair from her head to its tips, as she
    walks: how far through its cycle it is, in radians (one cycle is 2π, a full turn). Left out,
    her hair doesn't ripple.
  - `prop`: as the comment says, something in her hands: a teacup or her spellbook in her near
    hand, or a crystal ball (`orb`) held in both.
  - `sparkle`: sparkles circling her near hand, for a little spell: how far round they've gone,
    from 0 to 1. Left out (or 0), there are none.
  - `sitting`: sitting on the taskbar with her knees up under her robe.
  - `shadow`: as its comment says, her shadow on the taskbar, drawn unless this is `false`, which
    it is only while she's carried.
  - `rune` and `spin`: the magic circle under her as she levitates (or chants): `rune` its size,
    from 0 (none) to 1, and `spin` how far its runes have turned, in whole turns, which also says
    how far its sparks have risen. The crystal ball's wisp of light turns with `spin` too.
  - `spread`: as its comment says, her robe's hem held or flung out, this many pixels wider each
    side, for a curtsy or a twirl (or lifting in the updraft as she chants).
  - `butterfly`: as its comment says, a little butterfly's flight, from 0 to 1: coming to her
    raised hand, resting on it, and flying off. Left out (or 0), there's none.
  - `zzz`: as its comment says, z's floating up from her as she dozes, from 0 to 1 (none at 0).
  - `flipText`: as its comment says, letters (the z's) drawn back to front, for a frame that will
    be mirrored to face left, so they read the right way round once it is (see `LEFT_MAKERS` in
    `sprite.ts`).
  - `juggle`: as its comment says, three little orbs juggled between her hands, from the front: how
    far through the juggling she is, from 0 to 1. At 0 or 1, or left out, there are none, and seen
    any other way than from the front there are none either, since they need both her hands.
  - `bubbles`: as its comment says, magic bubbles blown through a little wand ring at her near
    hand, seen diagonally: how far through the habit she is, from 0 to 1.
  - `wisp`: as its comment says, a will-o'-wisp going round her, from the front, from 0 to 1;
    `wispAt()` (below) turns that into where it is.
  - `burst`: as its comment says, a sneeze's burst of sparkles flying out from her nose, from 0 to
    1, none at 0 (or at 1, when they've gone). Unlike the other three, it's mixed between key
    poses (`mix()` in `sprite.ts`), so the sneeze can be written as a few key poses.
  - `trail`: as its comment says, her sparkle trail as she walks: how far through her stride she
    is, from 0 to 1. Left out (as in every pose but walking), there's no trail.
  - `fade`: as its comment says, dissolving into white motes, from 0 (all of her) to `FADE.end`
    (nothing left, the last motes gone); see `FADE` below. Played backwards, from `FADE.end` down to
    0, she forms out of them. Her `vanish` and `appear` poses (`sprite.ts`) are made of it.
  - `back`: as its comment says, from the front only, she's turned round, her back to us, as she
    watches the sunset in the screen saver (`gaze()` in `sprite.ts`). Her long hair falls over her
    back from the crown of her head, her ears showing through it, and nothing on her front shows:
    no face, collar, brooch, buttons or buckles, nor the hat's buckle and moon. The rig still draws
    her facing us, with the front left off and her hair over it, which is all a figure seen from
    behind needs at this size: her arms, legs, robe and hat are the same shapes either way.
- `DOWN` and `STAND`: the arms (hanging, very slightly away from her body) and legs (straight) of a
  pose that doesn't give them.
- `LEG_LENGTH`: as its comment says, her thigh and her shin are 16.5 pixels each, so standing
  straight her hips are 33 pixels above her ankles. It's exported because `crouch()` in `sprite.ts`
  works out bent legs from it.

### `EYES`, `MOUTHS`, `SPARKLE`, `TWINKLE` and the other small pictures

<!-- code: apps/desktop/src/renderer/src/character/rig.ts#EYES,MOUTHS,SPARKLE,TWINKLE,BUTTERFLY_OPEN,BUTTERFLY_SHUT,Z_BIG,Z_SMALL,ORBS,BUBBLE_SMALL,BUBBLE_BIG,WAND_RING,WISP -->

[`src/renderer/src/character/rig.ts`, lines 177–272](../../apps/desktop/src/renderer/src/character/rig.ts#L177-L272)

```ts
// Face pictures, facing right; `.` is see-through. Eyes have a thick upper lid, a dark-to-light
// iris and a glint top right, calm and a little heavy-lidded; mouths are tiny.
const EYES = {
  front: {
    open: [
      ['eeeee', '.eiiw', '.iIIi', '.IjjI', '..jj.'],
      ['eeeee', 'iiwe.', 'iIIi.', 'IjjI.', '.jj..'],
    ],
    blink: [
      ['.....', '.....', 'eeeee', '.eee.'],
      ['.....', '.....', 'eeeee', '.eee.'],
    ],
    happy: [
      ['.....', '.eee.', 'e...e', '.....'],
      ['.....', '.eee.', 'e...e', '.....'],
    ],
    down: [
      ['.....', '.....', 'eeeee', '.iIi.'],
      ['.....', '.....', 'eeeee', '.iIi.'],
    ],
    // Looking up: the iris right under the lid, the row below it bare.
    up: [
      ['eeeee', '.iiiw', '.IjjI', '..jj.', '.....'],
      ['eeeee', 'iiiw.', 'IjjI.', '.jj..', '.....'],
    ],
  },
  diagonal: {
    open: [
      ['eeeee', '.eiiw', '.iIIi', '.IjjI', '..jj.'],
      ['eeee', 'iiw.', 'iIi.', 'Ijj.', 'jj..'],
    ],
    blink: [
      ['.....', '.....', 'eeeee', '.eee.'],
      ['....', '....', 'eeee', 'eee.'],
    ],
    happy: [
      ['.....', '.eee.', 'e...e', '.....'],
      ['....', '.ee.', 'e..e', '....'],
    ],
    down: [
      ['.....', '.....', 'eeeee', '.iIi.'],
      ['....', '....', 'eeee', 'iIi.'],
    ],
    up: [
      ['eeeee', '.iiiw', '.IjjI', '..jj.', '.....'],
      ['eeee', 'iiw.', 'Ijj.', 'jj..', '....'],
    ],
  },
  side: {
    // A thin lid with its lashes flicking back, over a tall round iris, wide open. The iris sits at
    // the front of the eye, under the front of her lid, so she looks the way she faces; its glint
    // is at its top back, toward the light. Looking up, the iris right under the lid. Closed, a
    // line across the middle.
    open: [['ee...', '.eeee', '..wii', '..wIi', '..iII', '..Ijj']],
    blink: [['.....', '.....', '.....', 'eeee.', '.ee..']],
    happy: [['.....', '.....', '..ee.', '.e..e', '.....']],
    down: [['.....', '.....', '.....', '.eeee', '..iI.']],
    up: [['ee...', '.eeee', '..wIi', '..iII', '..Ijj', '.....']],
  },
} as const

const MOUTHS: Record<Face, readonly string[]> = {
  neutral: ['mm'],
  blink: ['mm'],
  down: ['mm'],
  happy: ['m..m', '.mm.'],
  surprised: ['mm', 'mm'],
  yawn: ['.mm.', 'mmmm', 'mmmm', '.mm.'],
  sip: ['m'],
  awe: ['mm', 'mm'],
  up: ['m..m', '.mm.'],
  chant: ['mm', 'mm'],
}

/** A four-pointed sparkle, and a smaller one. */
const SPARKLE = ['..j..', '..l..', 'jlwlj', '..l..', '..j..']

const TWINKLE = ['.l.', 'lwl', '.l.']

/** A little magic butterfly, wings open and shut: teal wings, a white spot on each, a gold body. */
const BUTTERFLY_OPEN = ['GG.GG', 'GwkwG', '.G.G.']

const BUTTERFLY_SHUT = ['.GkG.', '..k..']

/** A dozer's z's: a big one and a small one, each with a darker shadow to the lower right. */
const Z_BIG = ['ffff.', '..fFF', '.fF..', 'ffffF', '.FFFF']

const Z_SMALL = ['fff.', '.fF.', 'fffF', '.FFF']

/** Juggling orbs: a teal one, a gold one and a pink one, each with a glint. */
const ORBS = [
  ['.G.', 'GwG', '.G.'],
  ['.Y.', 'YwY', '.Y.'],
  ['.c.', 'cwc', '.c.'],
]

/** A soap bubble, small and grown: a teal ring (see-through inside) with a white glint. */
const BUBBLE_SMALL = ['.G.', 'G.G', '.G.']

const BUBBLE_BIG = ['.GG.', 'Gw.G', 'G..G', '.GG.']

/** The little silver wand ring she blows bubbles through. */
const WAND_RING = ['.f.', 'f.f', '.f.']

/** A will-o'-wisp: a round teal light with a white heart. */
const WISP = ['.GG.', 'GwwG', 'GwwG', '.GG.']
```

<!-- /code -->

Her eyes, mouths, sparkles and the other little things round her are too small to draw well as
shapes, so they're drawn by hand as tiny pictures and stamped on (`Canvas.stamp()`), written as
rows of letters with `.` see-through.
As the comment says, they face right; frames facing left are mirrored with everything else.

- `EYES`: for each view, each kind of eye, and for each of those the eye on the right of the
  picture, then the one on the left (side on, only one shows).
  - `open`: five pixels wide and five tall: a thick upper lid (`eeeee`, the lash colour) that comes
    down a pixel at the inner corner (`.eiiw`, `iiwe.`), which gives the calm, slightly
    heavy-lidded look the comment mentions; then the iris, dark (`i`) at the top, mid (`I`) and
    light (`j`) at the bottom (amber, in `character.css`), with a white glint (`w`) at the top
    right of both irises. That's a big anime eye in a few pixels: the heavy lid frames it, the
    gradient gives it depth, and the matching glints say both catch the same light.
  - `blink`: shut, a line curving down. `happy`: an upside-down U, the smiling closed eye of anime.
    `down`: the lid lowered over a sliver of iris, looking down.
  - `up`: as its comment says, looking up: the iris (with its glint) right under the lid, and the
    bottom row bare, so the eye seems to roll upward. Every view has one, side on included.
  - Seen diagonally, the far eye is a pixel narrower, because it's turned away.
  - Side on, as the comment says, a thin lid with its lashes flicking back at the outer corner
    (`ee...`, `.eeee`), over a tall round iris, wide open: dark with a white glint two pixels tall
    (`..wii`, `..wIi`), then mid and light (`..iII`, `..Ijj`). Its iris is four pixels tall, which
    makes her look awake and a little cuter: big eyes are most of what makes an anime face cute.
    The iris sits at the front of the eye, its front column right under the front end of her lid
    (the `.`s are all at the back): where the iris sits in the eye is what says which way someone
    is looking, and with skin under the front of the lid instead she seemed to be looking behind
    her. The glint is at the iris's top back, toward the light (`LIGHT`, up and to the left),
    which also keeps the white off the front, where it would read as the white of her eye and put
    the iris back in the middle. Looking up (`up`), the iris rides right under the lid with the
    bottom row bare. Closed (`blink`, `happy`, `down`),
    each starts with a blank row more, so its line falls across the middle of the taller eye, where
    it was before.
  - `as const` keeps the object's exact shape, so TypeScript knows every view has every kind of
    eye.
- `MOUTHS`: small on purpose: two pixels (`mm`) for most faces, a little U for `happy`, two by two
  for `surprised`, a rounded four by four for `yawn`, and one pixel for `sip`. `awe` and `chant`
  have the same small open mouth as `surprised`, and `up` the same smile as `happy`. `Record<Face, ...>` makes
  TypeScript insist on a mouth for every face.
- `SPARKLE` and `TWINKLE`: as the comment says, a four-pointed sparkle, five pixels across, white
  at its heart (`w`) and paler then golden toward its points (`l`, `j`), and a smaller one, three
  pixels across. A spell circles one of the first and two of the second round her hand.
- `BUTTERFLY_OPEN` and `BUTTERFLY_SHUT`: as the comment says, a little magic butterfly with its
  wings open (five pixels across: teal wings, `G`, a white spot on each, `w`, and a gold body, `k`)
  and shut (wings folded up over the body). Flapping is drawn by switching between the two.
- `Z_BIG` and `Z_SMALL`: as the comment says, a dozer's z's, five and four pixels across, in the
  trim's silver (`f`) with a darker shadow (`F`) to the lower right.
- `ORBS`: as the comment says, the three juggling orbs, each a little plus three pixels across: a
  teal one (`G`), a gold one (`Y`) and a pink one (`c`, the blush), each with a white glint (`w`)
  at its heart. Three colours make it easy to follow each one round.
- `BUBBLE_SMALL` and `BUBBLE_BIG`: as the comment says, a soap bubble, new and grown: a teal ring
  three, then four, pixels across, see-through inside (`.`), so whatever is behind it shows
  through. The big one has a white glint at its upper left.
- `WAND_RING`: the little silver ring (`f`) she blows bubbles through, three pixels across and
  empty in the middle.
- `WISP`: the will-o'-wisp, a round teal light four pixels across with a white heart of four
  pixels.

### `TRAIL`, `JUGGLE`, `BUBBLES` and `wispAt()`

<!-- code: apps/desktop/src/renderer/src/character/rig.ts#TRAIL,JUGGLE,BUBBLES,wispAt -->

[`src/renderer/src/character/rig.ts`, lines 395–453](../../apps/desktop/src/renderer/src/character/rig.ts#L395-L453)

```ts
/**
 * Her sparkle trail (Pose.trail): how many sparkles she leaves a stride; how far each drifts back
 * from her heel over a whole stride (pixels: she walks WANDER.walkSpeed, 80 DIPs a second, and a
 * stride takes 0.66 s, about 53 DIPs, which is 53 sprite pixels at any size, so a sparkle stays
 * where she left it on the taskbar while her window moves on); and how long one lasts (shares of
 * a stride).
 */
export const TRAIL = { perStride: 4, drift: 53, life: 0.45 }

/**
 * Juggling (Pose.juggle): how many times each orb goes round, hand to hand and back, while she
 * juggles; how far up its high arc goes above her hands, and its low pass back (pixels); and the
 * share of the way round spent on the high arc.
 */
export const JUGGLE = { rounds: 4, high: 28, low: 5, arc: 0.62 }

/**
 * Bubbles (Pose.bubbles): how many she blows, when the first comes and how far apart they come
 * (shares of the habit), how long each floats before it pops, and when she puts the wand away.
 */
export const BUBBLES = { count: 5, first: 0.1, gap: 0.12, life: 0.36, wandAway: 0.86 }

/**
 * Where the will-o'-wisp is (Pose.wisp, 0 to 1), from the middle of her chest: it appears at her
 * side, goes round her twice (a flat ellipse, bobbing; on the far half it's behind her), then
 * flies off up and away. Null before it comes and once it's gone.
 */
export function wispAt(t: number): { x: number; y: number; behind: boolean } | null {
  const [come, round, gone] = [0.06, 0.8, 0.96]
  if (t < come || t >= gone) return null
  if (t < round) {
    const angle = ((t - come) / (round - come)) * Math.PI * 4
    return {
      x: Math.cos(angle) * 20,
      y: Math.sin(angle) * 5 + Math.sin(angle * 3) * 1.5 - 4,
      behind: Math.sin(angle) < 0,
    }
  }
  const away = (t - round) / (gone - round)
  return { x: 20 + away * 14, y: -4 - away * away * 46, behind: false }
}
```

<!-- /code -->

The numbers behind three of the newest habits. They're exported because `sprite.ts` needs them
too: its animations time her hands and face to what the rig draws (a hand dipping as it throws, a
puff before each bubble, her eyes following the wisp).

- `TRAIL`: as its comment says, her sparkle trail's numbers: 4 sparkles a stride
  (`perStride`); how far one drifts back from her heel over a whole stride, 53 pixels (`drift`);
  and how long one lasts, 0.45 of a stride (`life`), so it's gone about 24 pixels behind her. The
  53 is how far she walks in a stride: 80 DIPs a second (`WANDER.walkSpeed` in
  `src/main/bubble/wander.ts`) for the 0.66 seconds of the walk's twelve frames. Her window moves
  that far along the taskbar while the frames play, so a sparkle drifting back by the same amount
  in her picture stays still on the taskbar, left where she dropped it. That holds at any size:
  when she's bigger her window moves that many times faster, and her pixels are that many times
  bigger.
- `JUGGLE`: as its comment says, the juggling's numbers. Each orb goes round 4 times (`rounds`),
  from her far hand to her near one and back, while she juggles. Its high arc rises 28 pixels
  above her hands (`high`), and its pass back underneath only 5 (`low`). 62% of the way round is
  the high arc (`arc`), the rest the quicker pass back. Juggling three like this, up in an arc one
  way and quickly back underneath, is called a _shower_.
- `BUBBLES`: as its comment says, the bubbles' numbers, as shares of the habit (0 to 1). She blows
  5 (`count`): the first at 10% (`first`) and the next every 12% (`gap`), so at 10, 22, 34, 46 and
  58%. Each floats for 36% of the habit (`life`) before it pops. At 86% (`wandAway`) she puts the
  wand away, and watches the last bubble, which pops at 94%, without it.
- `wispAt(t)`: as the comment says, where the will-o'-wisp is at `t` (the pose's `wisp`), in pixels
  from the middle of her chest, and whether it's behind her; `null` when it isn't there.
  - `[come, round, gone] = [0.06, 0.8, 0.96]`: it appears 6% of the way through, goes round her
    until 80%, and is gone at 96%. Before it comes, and once it's gone, it's `null`.
  - `angle`: from 0 to 4π (two whole turns) as `t` goes from `come` to `round`.
  - `x: Math.cos(angle) * 20`: up to 20 pixels either side of her middle. At an angle of 0 it's
    beside her, on the right of the picture, which is where it appears.
  - `y: Math.sin(angle) * 5 + Math.sin(angle * 3) * 1.5 - 4`: only 5 pixels up and down, so the
    path is a flat ellipse, the way a circle round her looks seen from a little above: the near half
    lower down, the far half higher up. The second wave, three times as fast and 1.5 pixels high,
    makes it bob as it goes, and `- 4` lifts the whole path 4 pixels.
  - `behind: Math.sin(angle) < 0`: on the upper half of the ellipse, the far side, it's behind her.
    `draw()` then only draws it where nothing of her is.
  - After `round`, it flies off: `away` goes from 0 to 1 as it moves 14 pixels further out and 46
    up, faster and faster (`away * away`), to the top of her window. It's in front of her all the
    way.

### `FADE`, `hash()` and `dissolveAt()`

<!-- code: apps/desktop/src/renderer/src/character/rig.ts#FADE,hash,dissolveAt -->

[`src/renderer/src/character/rig.ts`, lines 402–418](../../apps/desktop/src/renderer/src/character/rig.ts#L402-L418)

```ts
/**
 * Dissolving (Pose.fade): each of her pixels turns white `glow` before `fade` reaches its own point
 * between 0 and 1 (dissolveAt), then goes, and becomes a white mote that rises `rise` pixels as it
 * fades, over `life` more, so at `end` the last are gone; only `share` of them make a mote, so
 * it's a sprinkling, not a copy of her.
 */
export const FADE = { glow: 0.12, life: 0.45, rise: 12, share: 0.45, end: 1.45 }

/** A pixel's own random number, 0 to 1, the same every frame (`salt` for a second, different one). */
function hash(x: number, y: number, salt = 0): number {
  let h = Math.imul(x + 1013 * salt, 374761393) ^ Math.imul(y + 7919, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** When a pixel dissolves (0 to 1): in a random order, the top of her a little sooner. */
const dissolveAt = (x: number, y: number) => 0.8 * hash(x, y) + 0.2 * Math.max(0, y / GRID)
```

<!-- /code -->

The numbers and the randomness behind her dissolving into white motes (`Pose.fade`), as she
vanishes or appears. `draw()` uses them at its very end (below).

- `FADE`: as the comment says, each of her pixels turns white for the last `glow` (0.12) of `fade`
  before its own moment comes (`dissolveAt`), then goes, and becomes a white mote that rises and
  fades over `life` (0.45) more. The last pixel goes at about 1 and its mote is gone by 1 + 0.45,
  which is why `end` is 1.45: `fade` runs from 0, all of her, to `end`, nothing at all. Only
  `share` (0.45) of her pixels make a mote, so it's a sprinkling, not a copy of her. `rise` (26) is
  how fast a mote rises: `rise` pixels for every whole unit of `fade` since it left her, so about 12
  pixels by the time it's gone. `sprite.ts` imports `FADE` for `end`.
- `hash(x, y, salt)`: as the comment says, a pixel's own random number from 0 to 1, the same every
  frame, so each pixel goes at the same moment in every frame and the dissolve doesn't flicker. It
  mixes the two coordinates by multiplying them by large odd numbers (`Math.imul`, a 32-bit
  multiply) and folding the bits over (`^` and `>>>`); `>>> 0` makes the result a positive 32-bit
  whole number, and dividing by 2³² (4294967296) turns it into a fraction. `salt` gives a second,
  different number for the same pixel: `draw()` uses it to pick which pixels make a mote,
  separately from when they go.
- `dissolveAt(x, y)`: as the comment says, when a pixel dissolves, from 0 to 1, in a random order,
  the top of her a little sooner: mostly its own random moment (`0.8 * hash(x, y)`), plus a little
  for how far down her it is (`0.2 * y / GRID`). `Math.max(0, ...)` keeps the headroom rows above
  the grid (a negative `y`) from going before 0.

### `eyesFor()`

<!-- code: apps/desktop/src/renderer/src/character/rig.ts#eyesFor -->

[`src/renderer/src/character/rig.ts`, lines 455–462](../../apps/desktop/src/renderer/src/character/rig.ts#L455-L462)

```ts
/** Which eyes a face uses. */
function eyesFor(face: Face): 'open' | 'blink' | 'happy' | 'down' | 'up' {
  if (face === 'blink' || face === 'yawn' || face === 'chant') return 'blink'
  if (face === 'happy' || face === 'sip') return 'happy'
  if (face === 'down') return 'down'
  if (face === 'awe' || face === 'up') return 'up'
  return 'open'
}
```

<!-- /code -->

Which eyes go with a face. A yawn and a chant shut them like a blink, a sip closes them happily,
and `awe` and `up` both look up (their mouths are what differ).

### `draw()`

<!-- code: apps/desktop/src/renderer/src/character/rig.ts#draw -->

[`src/renderer/src/character/rig.ts`, lines 464–2056](../../apps/desktop/src/renderer/src/character/rig.ts#L464-L2056)

```ts
/** Draws one pose as rows of palette letters. */
export function draw(pose: Pose): string[] {
  const view = pose.view
  const frontView = view === 'front'
  /** Her back to us (from the front only): see Pose.back. */
  const fromBehind = frontView && pose.back === true
  const sitting = pose.sitting ?? false
  const hips: Point = { x: 48 + (pose.x ?? 0), y: (sitting ? 85 : 59) + (pose.y ?? 0) }
  const lean = pose.lean ?? 0
  const neck = add(hips, rotate({ x: 0, y: -21 }, lean))
  const head = add(neck, rotate({ x: 0, y: -11 }, lean + (pose.tilt ?? 0)))
  const headAngle = lean + (pose.tilt ?? 0)
  const wind = pose.wind ?? 0
  const flow = pose.flow
  const lift = pose.lift ?? 0
  const [nearArm, farArm] = pose.arms ?? [DOWN, DOWN]
  const [nearLeg, farLeg] = pose.legs ?? [STAND, STAND]
  const canvas = new Canvas(GRID, HEADROOM)
  const ink = (layer: Layer, outline = true) => canvas.ink(layer, RAMPS, LIGHT, outline)
  /**
   * Inks a layer of hair that lies over hair already drawn, its outline where it crosses that
   * hair a soft line in the hair's shade rather than a hard one, so they read as one head of hair.
   */
  const inkOverHair = (layer: Layer) => {
    const before = canvas.rows()
    ink(layer)
    for (let y = layer.minY - 1; y <= layer.maxY + 1; y++) {
      for (let x = layer.minX - 1; x <= layer.maxX + 1; x++) {
        const was = before[y + canvas.top]?.[x]
        const outline = layer.get(x, y) === undefined && canvas.get(x, y) === 'O'
        if (outline && was !== undefined && 'hlLD'.includes(was)) canvas.set(x, y, 'D')
      }
    }
  }
  // A point in a body part's own frame (its origin, turned with it).
  const at = (origin: Point, angle: number) => (p: Point) => add(origin, rotate(p, angle))
  const onHead = at(head, headAngle)
  const onBody = at(neck, lean)
  const onHips = at(hips, lean * 0.5)
  const shape = (points: number[][], frame: (p: Point) => Point) =>
    points.map(([x, y]) => frame({ x: x!, y: y! }))
  /**
   * Hair below the top of the head is blown by the wind, lifted by a fall and rippled as she walks
   * (`flow`): a wave running down it, so it sways more the further down it is, and bends.
   */
  const blown = (p: Point): Point => {
    const t = Math.max(0, (p.y + 2) / 20)
    const ripple = flow === undefined ? 0 : Math.sin(flow - p.y * RIPPLE.k) * RIPPLE.size * t
    return { x: p.x + wind * t + ripple, y: p.y - lift * t }
  }
  /**
   * A shape's points with more between them, one at least every RIPPLE.step pixels along each
   * edge, so a ripple bends its long edges into curves rather than just moving their ends.
   */
  const supple = (points: number[][]): number[][] =>
    points.flatMap(([x, y], i) => {
      const [nx, ny] = points[(i + 1) % points.length]!
      const pieces = Math.max(1, Math.ceil(Math.hypot(nx! - x!, ny! - y!) / RIPPLE.step))
      return Array.from({ length: pieces }, (_, j) => [
        x! + ((nx! - x!) * j) / pieces,
        y! + ((ny! - y!) * j) / pieces,
      ])
    })
  const set = (p: Point, letter: string, only?: string) => {
    const x = Math.floor(p.x)
    const y = Math.floor(p.y)
    if (!only || only.includes(canvas.get(x, y))) canvas.set(x, y, letter)
  }
  /** A small pattern (rows of letters, `.` see-through) centred on `p`, only over `only`. */
  const motif = (p: Point, rows: readonly string[], only: string) => {
    const x0 = Math.round(p.x) - Math.floor(rows[0]!.length / 2)
    const y0 = Math.round(p.y) - Math.floor(rows.length / 2)
    rows.forEach((row, dy) =>
      [...row].forEach((letter, dx) => {
        if (letter !== '.' && only.includes(canvas.get(x0 + dx, y0 + dy))) {
          canvas.set(x0 + dx, y0 + dy, letter)
        }
      }),
    )
  }

  // Arms: a bell sleeve with silver trim at its cuff, her hand peeking out.
  const shoulderAt = (side: 1 | -1): Point =>
    onBody(
      frontView
        ? { x: 6.5 * side, y: 2.5 }
        : view === 'diagonal'
          ? { x: side === 1 ? -4.5 : 4.5, y: 2.5 }
          : { x: 0.5, y: 2.5 },
    )
  const drawArm = (arm: Arm, side: 1 | -1) => {
    const layer = new Layer(GRID, HEADROOM)
    // From the front, positive angles swing each arm outward; otherwise forward.
    const sign = frontView ? side : 1
    const shoulder = shoulderAt(side)
    const upper = (arm.shoulder + lean) * sign
    const lower = (arm.shoulder + arm.elbow + lean) * sign
    const elbow = limb(shoulder, 11.5, upper)
    const wrist = limb(elbow, 10, lower)
    const cuff = limb(elbow, 8.8, lower)
    const hand = limb(wrist, 1, lower)
    // Across the forearm, for the sleeve's flat, widening opening.
    const across = { x: Math.cos(lower), y: -Math.sin(lower) }
    const edge = (p: Point, r: number, way: 1 | -1) => ({
      x: p.x + across.x * r * way,
      y: p.y + across.y * r * way,
    })
    const band = (from: Point, to: Point, r0: number, r1: number, material: string) =>
      layer.polygon(
        [edge(from, r0, 1), edge(to, r1, 1), edge(to, r1, -1), edge(from, r0, -1)],
        material,
      )
    layer.ellipse(hand, 1.9, 1.9, 'skin')
    layer.capsule(shoulder, elbow, 2.6, 2.9, 'robe')
    band(elbow, cuff, 2.9, 3.9, 'robe')
    band(cuff, wrist, 3.9, 4.2, 'trim')
    ink(layer)
    const above = limb(elbow, 7.9, lower)
    for (let r = -3.6; r <= 3.6; r += 0.5) set(edge(above, r, 1), 'Y', 'aAv')
    return hand
  }

  // Legs: dark stockings, then boots below the robe's hem.
  const hipAt = (side: 1 | -1): Point =>
    onHips(view === 'side' ? { x: 0, y: 0 } : { x: (frontView ? 3.2 : -2.6) * side, y: 0 })
  const drawLeg = (leg: Leg, side: 1 | -1) => {
    const layer = new Layer(GRID, HEADROOM)
    const sign = frontView ? side : 1
    const hip = hipAt(side)
    let knee: Point
    let ankle: Point
    if (sitting) {
      knee = { x: hip.x + side * (4 + leg.hip * 3), y: hip.y - 8 }
      ankle = { x: hip.x + side * (3.5 + leg.knee * 4), y: 92.5 }
    } else {
      knee = limb(hip, LEG_LENGTH, leg.hip * sign)
      ankle = limb(knee, LEG_LENGTH, (leg.hip - leg.knee) * sign)
    }
    const bootTop = add(ankle, { x: (knee.x - ankle.x) * 0.38, y: (knee.y - ankle.y) * 0.38 })
    layer.capsule(hip, knee, 3.2, 2.6, 'stocking')
    layer.capsule(knee, bootTop, 2.6, 2.4, 'stocking')
    layer.capsule(bootTop, ankle, 2.7, 2.5, 'boot')
    layer.polygon(
      (frontView
        ? [
            [-2.7, -0.5],
            [2.7, -0.5],
            [3.1, 3.2],
            [-3.1, 3.2],
          ]
        : [
            [-2.6, -0.5],
            [2.6, -0.5],
            [5.6, 1.6],
            [5.6, 3.2],
            [-2.6, 3.2],
          ]
      ).map(([x, y]) => ({ x: ankle.x + x!, y: ankle.y + y! })),
      'boot',
    )
    ink(layer)
    // Down the shaft (`along`) and across it (`across`, toward her front side on).
    const shaft = Math.hypot(ankle.x - bootTop.x, ankle.y - bootTop.y)
    const along = { x: (ankle.x - bootTop.x) / shaft, y: (ankle.y - bootTop.y) / shaft }
    const across = frontView ? { x: -along.y, y: along.x } : { x: 1, y: 0 }
    const onBoot = (d: number, r: number) => ({
      x: bootTop.x + along.x * d + across.x * r,
      y: bootTop.y + along.y * d + across.y * r,
    })
    for (let r = -2.6; r <= 2.6; r += 0.5) {
      set(onBoot(-1.6, r), 'y', 'bB')
      set(onBoot(-0.6, r), 'y', 'bB')
      set(onBoot(0.4, r), 'B', 'bBy')
    }
    // The laces down the front of the shaft (side on, its front edge): little crosses, a row of
    // plain leather between each.
    const lace = frontView ? 0 : 1.4
    for (let i = 0; 1.5 + i < shaft - 0.5; i++) {
      if (i % 3 === 0) {
        set(onBoot(1.5 + i, lace - 1), 'y', 'bB')
        set(onBoot(1.5 + i, lace + 1), 'y', 'bB')
      } else if (i % 3 === 1) {
        set(onBoot(1.5 + i, lace), 'y', 'bB')
      }
    }
    // A strap over her instep, buckled in gold on the outside.
    for (let r = -2.8; r <= 2.8; r += 0.5) set(onBoot(shaft + 0.6, r), 'B', 'by')
    set(onBoot(shaft + 0.6, frontView ? 1.8 * side : -1.2), 'Y', 'bBy')
  }

  if (view === 'diagonal') {
    // Hand-drawn: one flat picture of her (pictures.ts), then her expression on its face.
    const dy = Math.round(pose.y ?? 0)
    // The picture has her shadow in it: left out when she has none (thrown, in the air).
    const picture =
      pose.shadow === false ? DIAGONAL.rows.map((row) => row.replace(/x/g, '.')) : DIAGONAL.rows
    canvas.stamp(picture, DIAGONAL.x + Math.round(pose.x ?? 0), DIAGONAL.y + dy)
    const expression = pose.face ?? 'neutral'
    if (expression !== 'neutral') {
      const eyes = EYES.diagonal[eyesFor(expression)]
      const { near, far } = DIAGONAL_EYES
      canvas.stamp(['sssss', 'sssss', 'sssss', 'sssss', 'sssss'], near.x, near.y + dy)
      canvas.stamp(['ssss', 'ssss', 'ssss', 'ssss', 'ssss'], far.x, far.y + dy)
      canvas.stamp(eyes[0]!, near.x, near.y + dy)
      canvas.stamp(eyes[1]!, far.x, far.y + dy)
      const mouth = MOUTHS[expression]
      canvas.stamp(['ss'], DIAGONAL_MOUTH.x, DIAGONAL_MOUTH.y + dy)
      canvas.stamp(mouth, DIAGONAL_MOUTH.x + 1 - mouth[0]!.length / 2, DIAGONAL_MOUTH.y + dy)
    }
  } else {
    // Her shadow on the taskbar, smaller the higher she is; none while she's carried, when she's
    // nowhere near the taskbar.
    if (pose.shadow !== false) {
      const height = Math.max(0, -(pose.y ?? 0))
      const shadow = new Layer(GRID, HEADROOM)
      shadow.ellipse({ x: hips.x, y: 95.5 }, Math.max(6, 15 - height / 2), 1.6, 'shadow')
      ink(shadow, false)
    }

    // A magic circle on the ground under her: a teal ring, a dashed silver ring inside it turning,
    // bright runes going round, and sparks rising from it.
    const rune = pose.rune ?? 0
    if (rune > 0) {
      const turned = pose.spin ?? 0
      const spin = turned * Math.PI * 2
      const ring = (a: number, scale: number) => ({
        x: hips.x + Math.cos(a) * 15 * rune * scale,
        y: 92.8 + Math.sin(a) * 2.8 * rune * scale,
      })
      for (let a = 0; a < Math.PI * 2; a += 0.02) {
        set(ring(a, 1), 'G')
        if (Math.floor(((a + spin) * 6) / Math.PI) % 2 === 0) set(ring(a, 0.62), 'f')
      }
      for (let k = 0; k < 6; k++) set(ring(spin + (k * Math.PI) / 3, 1), 'w')
      for (let k = 0; k < 5; k++) {
        const rise = (turned * 1.5 + k / 5) % 1
        const from = ring((k * Math.PI * 2) / 5 + 0.6, 0.85)
        const spark = { x: from.x, y: from.y - rise * 24 * rune }
        set(spark, 'w')
        set({ x: spark.x, y: spark.y + 1 }, 'G')
      }
    }

    // Her long hair behind her, down to the small of her back, its ends in clumps of different
    // lengths. From the front it hangs down past her shoulders, no wider than them below her locks,
    // so none of it peeks out beside her sleeves. Side on it falls from the back of her head as one
    // mass, as long as it is from the front: its back edge straight from under her hat to its ends,
    // a little wider as it goes down.
    const back = new Layer(GRID, HEADROOM)
    const backHair =
      view === 'side'
        ? [
            [-6, -4],
            [-4.5, -9],
            [-1, -11.5],
            [3, -11.5],
            [6.5, -9],
            [7.5, -5],
            [6, -2],
            [-1, 2],
            // Down her back, behind her neck and robe...
            [-3, 9],
            [-5, 17],
            [-6.5, 24],
            // ...its ends, three clumps (as from the front)...
            [-6.8, 27.4],
            [-8.3, 25.4],
            [-9.9, 28.6],
            [-11.3, 25.8],
            [-12.9, 28],
            [-13.4, 25],
            // ...and back up, straight to the back of her head.
            [-8, -3],
          ]
        : [
            [-9.5, -2],
            [-8.5, -7.5],
            [-5, -10.8],
            [0, -11.8],
            [5, -10.8],
            [8.5, -7.5],
            [9.5, -2],
            [9, 8],
            [9, 18],
            [8.5, 27],
            [6, 24],
            [3, 26],
            [-3, 26],
            [-6, 24],
            [-8.5, 27],
            [-9, 18],
            [-9, 8],
          ]
    back.polygon(
      shape(supple(backHair), (p) => onHead(blown(p))),
      'hair',
    )
    ink(back)
    if (view === 'side') {
      // Strands: a darker line down between its clumps, from the gaps between their ends up into
      // the hair, so it reads as long hair rather than a flat shape.
      for (const [top, end] of [
        [
          [-8.6, 9],
          [-8.3, 25],
        ],
        [
          [-10, 6],
          [-11.3, 25.6],
        ],
      ] as const) {
        for (let t = 0; t <= 1; t += 0.05) {
          const p = { x: top[0] + (end[0] - top[0]) * t, y: top[1] + (end[1] - top[1]) * t }
          set(onHead(blown(p)), 'D', 'hl')
        }
      }
    }

    if (!frontView) drawArm(farArm, -1)
    // The far leg first, so the near one is in front of it.
    drawLeg(farLeg, -1)
    drawLeg(nearLeg, 1)

    // The robe's skirt: long and flared, swaying, silver trim along its hem.
    const robe = new Layer(GRID, HEADROOM)
    const swing = wind * 0.4
    const hem = sitting ? 11 : 22
    const flare = sitting ? 15 : (pose.spread ?? 0)
    const skirt = frontView
      ? [
          [-8.5, -2],
          [8.5, -2],
          [13 + flare + swing, hem],
          [-13 - flare + swing, hem],
        ]
      : [
          [-5, -2],
          [5.5, -2],
          [9.5 + flare + swing, hem],
          [-9 - flare + swing, hem],
        ]
    robe.polygon(shape(skirt, onHips), 'robe')
    // Its top: the bodice, narrower, up to her collar.
    const bodice = frontView
      ? [
          [-3.5, -1],
          [3.5, -1],
          [7.5, 1.5],
          [8.5, 5],
          [8, 12],
          [8.5, 21],
          [-8.5, 21],
          [-8, 12],
          [-8.5, 5],
          [-7.5, 1.5],
        ]
      : [
          [-3, -1],
          [2.5, -1],
          [5, 2],
          [6, 8],
          [5.5, 14],
          [6, 21],
          [-5.5, 21],
          [-5.5, 14],
          [-5, 6],
          [-4.5, 2],
        ]
    robe.polygon(shape(bodice, onBody), 'robe')
    ink(robe)
    // The trim along the hem.
    const hemLeft = skirt[3]!
    const hemRight = skirt[2]!
    for (let t = 0; t <= 1; t += 0.02) {
      const p = onHips({
        x: hemLeft[0]! + (hemRight[0]! - hemLeft[0]!) * t,
        y: hem - 1,
      })
      set(p, 'f', 'aAv')
    }
    if (view !== 'side' && !sitting && !fromBehind) {
      for (let t = -1; t < hem - 1; t += 0.5) {
        set(onHips({ x: (swing * t) / hem, y: t }), 'f', 'aAv')
      }
    }
    // The collar: a V of trim, the gem brooch at its point; a darker sash at her waist.
    const off = view === 'side' ? 3 : 0
    if (view !== 'side' && !fromBehind) {
      for (let t = 0; t <= 5; t += 0.5) {
        set(onBody({ x: -3 + t * 0.6 + off, y: t - 0.5 }), 'f', 'aAv')
        set(onBody({ x: 3 - t * 0.6 + off, y: t - 0.5 }), 'f', 'aAv')
      }
    }
    if (!fromBehind) {
      canvas.stamp(
        ['.G.', 'GGG', '.G.'],
        onBody({ x: off - 1, y: 4 }).x,
        onBody({ x: off, y: 4 }).y,
      )
    }
    for (let t = -9; t <= 9; t += 0.5) {
      set(onBody({ x: t, y: 18 }), 'A', 'av')
      set(onBody({ x: t, y: 19 }), 'q', 'av')
    }
    // Where the skirt's edges are at height y (in the hips' frame), from its corners.
    const skirtAt = (y: number) => {
      const t = (y + 2) / (hem + 2)
      return {
        left: skirt[0]![0]! + (skirt[3]![0]! - skirt[0]![0]!) * t,
        right: skirt[1]![0]! + (skirt[2]![0]! - skirt[1]![0]!) * t,
      }
    }
    const centre = (y: number) => (swing * y) / hem
    // Folds: creases falling from her hips and opening out toward the hem, each a line of the
    // robe's shade with its light beside it, on the side toward the light.
    if (!sitting) {
      for (const fold of frontView ? [-4.5, 4.5] : [-1.5]) {
        for (let y = 2; y < hem - 8; y += 0.5) {
          const x = fold * (1 + (y / hem) * 0.4) + centre(y)
          set(onHips({ x, y }), 'A', 'a')
          set(onHips({ x: x - 1, y }), 'v', 'a')
        }
      }
    }
    // The border: a gold line, and below it gold diamonds with gold dots between, just above the
    // silver trim of the hem; centred on the trim down her front, so it sways with it.
    const borderY = hem - 4.5
    const edges = skirtAt(borderY)
    for (let x = edges.left + 1; x <= edges.right - 1; x += 0.5) {
      set(onHips({ x, y: borderY - 3 }), 'k', 'aAv')
    }
    for (let k = -3; k <= 3; k++) {
      const x = centre(borderY) + (view === 'side' ? 6 * k : 6 * k + 3)
      if (x < edges.left + 2 || x > edges.right - 2) continue
      motif(onHips({ x, y: borderY }), ['.Y.', 'YaY', '.Y.'], 'aAv')
      const dot = x + 3
      if (dot < edges.right - 1.5 && Math.abs(dot - centre(borderY)) > 1) {
        motif(onHips({ x: dot, y: borderY }), ['k'], 'aAv')
      }
    }
    // Stars: a scattering of silver points over the skirt, in staggered rows.
    if (!sitting) {
      for (let row = 0; row < 3; row++) {
        const y = 2 + row * 4.5
        const span = skirtAt(y)
        for (let x = (row % 2) * 3 - 12; x <= 12; x += 6) {
          const nearTrim = frontView && Math.abs(x - centre(y)) < 1.5
          if (x > span.left + 2 && x < span.right - 2 && !nearTrim) {
            motif(onHips({ x, y }), ['f'], 'a')
          }
        }
      }
    }
    // Gold buttons down the bodice from the brooch (from the front), and the sash's gold buckle.
    if (frontView && !fromBehind) {
      for (const y of [7.5, 10.5, 13.5]) motif(onBody({ x: 0, y }), ['Y'], 'aAv')
    }
    if (!fromBehind) motif(onBody({ x: off, y: 18.5 }), ['YYY', 'YkY'], 'Aqav')

    // Her head: neck, face and chin.
    const face = new Layer(GRID, HEADROOM)
    face.capsule(
      onBody({ x: view === 'side' ? 0.5 : 0, y: -3.5 }),
      onBody({ x: 0, y: 0 }),
      2.1,
      2.1,
      'skin',
    )
    if (view === 'side') {
      // The back of her head; her face is drawn by hand on top of it, below. A pixel shorter than
      // from the front, as her face is side on.
      face.ellipse({ x: head.x, y: head.y - 0.5 }, 7, 8, 'skin')
    } else {
      const shift = 0
      face.ellipse(head, 7.5, 8.3, 'skin')
      face.polygon(
        shape(
          [
            [-7, 1],
            [7, 1],
            [5 + shift, 7],
            [shift, 9.8],
            [-5 + shift * 0.5, 7],
          ],
          onHead,
        ),
        'skin',
      )
    }
    ink(face)
    if (view === 'side') {
      canvas.stamp(
        SIDE_FACE.rows,
        Math.round(head.x) + SIDE_FACE.x,
        Math.round(head.y) + SIDE_FACE.y,
      )
    }

    // Her face: eyes, blush and mouth.
    const expression = pose.face ?? 'neutral'
    const eyes = EYES[view][eyesFor(expression)]
    const look = Math.round(pose.look ?? 0)
    const eyeY = head.y - 0.5
    const mouth = MOUTHS[expression]
    if (fromBehind) {
      // No face: the back of her head (her hair, below).
    } else if (frontView) {
      canvas.stamp(eyes[0]!, head.x + 1 + look, eyeY)
      canvas.stamp(eyes[1]!, head.x - 6 + look, eyeY)
      canvas.stamp(['cc'], head.x + 3 + look, head.y + 5)
      canvas.stamp(['cc'], head.x - 5 + look, head.y + 5)
      canvas.stamp(mouth, head.x - mouth[0]!.length / 2 + look * 0.5, head.y + 6)
      set(onHead({ x: 0.5 + look * 0.5, y: 5.2 }), 'S', 's')
    } else {
      // Higher than from the front, and taller: her iris level with the bridge of her nose and the
      // tip of her nose at the bottom of her eye, as anime profiles have it.
      canvas.stamp(eyes[0]!, head.x + 1.5, eyeY - 2)
      canvas.stamp(['cc'], head.x + 0.5, head.y + 3.5)
      // Her mouth: a short line in from the notch of her lips, between nose and chin.
      canvas.stamp(
        mouth.map((r) => r.slice(0, 2)),
        head.x + 4.5,
        head.y + 4.5,
      )
    }

    // Her fringe and the locks beside her face.
    const hair = new Layer(GRID, HEADROOM)
    const fringe =
      view === 'side'
        ? [
            [-3, -6.5],
            [-1, -10.5],
            [3, -11.5],
            // Its front curving out past her forehead (which is 8 out), so it stands off her face
            // rather than lying on it, its tip hanging a pixel in front of her brow...
            [7, -9.8],
            [9, -6.5],
            [9.5, -3.5],
            [9.2, -1.5],
            // ...then its jagged lower edge, clear of her eye.
            [7.6, -3.2],
            [6.5, -4],
            [5.5, -2.6],
            [4, -4],
            [2.5, -3.4],
            [1.5, -4.8],
            [-1, -4.8],
          ]
        : [
            [-9.2, -1.5],
            [-8.7, -7],
            [-5, -10.3],
            [0, -11.3],
            [5, -10.3],
            [8.7, -7],
            [9.2, -1.5],
            [7.5, -3.6],
            [6.5, -0.4],
            [4.5, -3.4],
            [3, 0],
            [1, -3.4],
            [-1, -0.2],
            [-3, -3.4],
            [-4.6, -0.6],
            [-6.5, -3.6],
            [-7.6, -1],
          ]
    const shiftHair = 0
    if (fromBehind) {
      // All of it, from the crown of her head down over her back: as wide as her shoulders, and a
      // little longer than it shows from the front, its ends in points of different lengths.
      const fall = [
        [-9.5, -2],
        [-8.5, -7.5],
        [-5, -10.8],
        [0, -11.8],
        [5, -10.8],
        [8.5, -7.5],
        [9.5, -2],
        [9.1, 8],
        [8.9, 18],
        [8.6, 27],
        [7.4, 29.6],
        [5.8, 27.6],
        [3.9, 31],
        [2, 28.8],
        [0, 32.2],
        [-2, 28.8],
        [-3.9, 31],
        [-5.8, 27.6],
        [-7.4, 29.6],
        [-8.6, 27],
        [-8.9, 18],
        [-9.1, 8],
      ]
      hair.polygon(
        shape(supple(fall), (p) => onHead(blown(p))),
        'hair',
      )
    } else {
      hair.polygon(
        shape(fringe, (p) => onHead(blown({ x: p.x + shiftHair, y: p.y }))),
        'hair',
      )
    }
    if (view === 'side') {
      // The back of her head: its back edge in line with her hair behind it, so they read as one,
      // and its front edge behind her ear, so her cheek shows.
      const crown = [
        [1.5, -11.6],
        [-3, -11],
        [-6.5, -8],
        [-8.1, -3],
        [-9.1, 2.5],
        [-10, 7],
        [-5.5, 7.4],
        [-3, 2],
        [-1.5, -2.5],
        [1, -5],
      ]
      hair.polygon(
        shape(supple(crown), (p) => onHead(blown(p))),
        'hair',
      )
    }
    const lock = (x: number, length: number) =>
      hair.chain(
        [
          { x, y: -3 },
          { x: x * 1.03, y: 3 },
          { x: x * 1.03, y: length * 0.6 },
          { x: x * 0.98, y: length },
        ].map((p) => onHead(blown(p))),
        1.9,
        0.6,
        'hair',
      )
    // Side on there's no lock: her hair behind her ear is the back hair. Nor from behind, where
    // it's all one fall of hair.
    if (view !== 'side' && !fromBehind) {
      lock(8.2 + shiftHair, 13)
      lock(-8.2 + shiftHair * 0.5, 13)
    }
    if (view === 'side') {
      inkOverHair(hair)
      // Under her ear, a tuft of hair over the back of her jaw: jagged along the bottom, curling
      // forward to a point. A shape of its own, so it's lit and shaded as a lock of its own.
      const tuft = new Layer(GRID, HEADROOM)
      tuft.polygon(
        shape(
          supple([
            [-2.8, -0.5],
            [-1.3, 2.6],
            [-0.3, 5],
            [0.7, 7.3],
            [-1.6, 6.5],
            [-2.9, 8.2],
            [-4.2, 6.8],
            [-5.8, 7.4],
            [-5.6, 4],
            [-4.4, 1],
          ]),
          (p) => onHead(blown(p)),
        ),
        'hair',
      )
      inkOverHair(tuft)
    } else {
      ink(hair)
    }
    if (fromBehind) {
      // Strands down her back, from under her hat to the gaps between the points of its ends,
      // curving out a little as it widens, so it reads as long hair rather than a flat shape: a
      // line of shade where it's lit, and of light where it's in shade (each pixel once).
      const done = new Set<number>()
      for (const [top, end] of [
        [-1, -1],
        [2.8, 2.9],
        [-4.6, -4.9],
        [6, 6.4],
        [-7.3, -7.5],
      ] as const) {
        for (let y = 1; y <= 28; y += 0.5) {
          const t = (y - 1) / 27
          const p = onHead(
            blown({ x: top + (end - top) * t + Math.sin(t * Math.PI) * 0.5 * Math.sign(top), y }),
          )
          const [x, row] = [Math.floor(p.x), Math.floor(p.y)]
          if (done.has(row * GRID + x)) continue
          done.add(row * GRID + x)
          const was = canvas.get(x, row)
          if (was === 'h' || was === 'l') canvas.set(x, row, 'D')
          else if (was === 'D') canvas.set(x, row, 'h')
        }
      }
      // Its sheen: a band of light across the back of her head, just under the brim of her hat.
      for (let dx = -6; dx <= 4; dx++) {
        set(onHead({ x: dx, y: 0.5 + Math.abs(dx + 1) * 0.15 }), 'L', 'hl')
        if (Math.abs(dx + 1) < 4)
          set(onHead({ x: dx, y: 1.5 + Math.abs(dx + 1) * 0.15 }), 'l', 'hD')
      }
    }
    // The shine on her hair: a band across the crown.
    for (let dx = -6; dx <= 6; dx++) {
      const curve = Math.abs(dx) * 0.18
      set(onHead({ x: dx + shiftHair, y: -7.5 + curve }), 'L', 'hl')
    }

    // Her long elf ears, through her hair: both from the front, one side on.
    const ears = new Layer(GRID, HEADROOM)
    const ear = (side: 1 | -1) =>
      ears.polygon(
        shape(
          [
            [6.6, -2.4],
            [13.5, -6.8],
            [12.2, -4.6],
            [7.2, 1.6],
          ],
          (p) => onHead({ x: p.x * side, y: p.y }),
        ),
        'skin',
      )
    if (frontView) {
      ear(1)
      ear(-1)
    } else {
      ears.polygon(
        shape(
          [
            [-0.5, -1.5],
            [-9.5, -7],
            [-8, -3.8],
            [-1, 2],
          ],
          onHead,
        ),
        'skin',
      )
    }
    ink(ears)

    // Her hat: a wide brim and a tall crooked crown with a silver band.
    const hat = new Layer(GRID, HEADROOM)
    // From behind the crown is mirrored too: its tip flops over to the other side of the picture.
    const tipLean = view === 'side' || fromBehind ? -1 : 1
    const hatCentre = view === 'side' ? 0.5 : 0
    // Lifted off her head and turning (her hat trick): narrowing to its edge and widening again,
    // its back to us, then its front (never quite to nothing); a point on it at `x`, `y`.
    const hatLift = pose.hatLift ?? 0
    const facing = Math.cos(pose.hatTurn ?? 0)
    const across = (facing < 0 ? -1 : 1) * Math.max(0.15, Math.abs(facing))
    const onHat = (x: number, y: number) => onHead({ x: hatCentre + x * across, y: y - hatLift })
    hat.ellipse(onHat(0, -9), (view === 'side' ? 12.5 : 14) * Math.abs(across), 2.7, 'hat')
    // The crown, rising to a tip that flops over to her right from the front; side on the whole
    // crown is mirrored (`tipLean`), so the tip flops back over its back edge, and its front edge
    // runs straight up to the bend.
    hat.polygon(
      shape(
        [
          [-6.5, -9.5],
          [-4.8, -14],
          [-2.5, -18],
          [0.5, -20.5],
          [4.5, -22],
          [3.2, -19.5],
          [3.4, -16],
          [5, -12.5],
          [6.5, -9.5],
        ],
        (p) => onHat(p.x * tipLean, p.y - lift * 0.15),
      ),
      'hat',
    )
    ink(hat)
    for (let dx = -6; dx <= 6; dx += 0.5) {
      set(onHat(dx, -11), 'f', 'ngN')
      set(onHat(dx, -12), 'F', 'ngN')
    }
    for (let dx = 7.5; dx <= 13; dx += 2) {
      set(onHat(dx, -8.6), 'F', 'ngN')
      set(onHat(-dx, -8.6), 'F', 'ngN')
    }
    // Its buckle, and the gold moon and stars on its front (none from behind, nor while its back
    // or its edge is to us as it turns).
    if (!fromBehind && across > 0.5) {
      const hatSide = view === 'side' ? 1 : 0
      motif(onHat(hatSide * 3, -11.5), ['YYY', 'YGY', 'YYY'], 'ngNfFq')
      const lifted = (x: number, y: number) => onHat(x * tipLean, y - lift * 0.15)
      motif(lifted(-1.5, -15.5), ['.YY', 'Y..', 'Y..', '.YY'], 'ngN')
      motif(lifted(2, -14.5), ['Y'], 'ngN')
      motif(lifted(1.2, -18), ['k'], 'ngN')
      motif(lifted(-3.8, -13), ['k'], 'ngN')
    }
  }

  // The near arm last, in front of her (from the front, both arms), and anything she's holding.
  let hand: Point
  // The far hand too, from the front (where she can use both, to juggle).
  let farHand: Point | null = null
  if (frontView) {
    farHand = drawArm(farArm, -1)
    hand = drawArm(nearArm, 1)
  } else {
    hand = drawArm(nearArm, 1)
  }
  let orbAt: Point | null = null
  if (pose.prop) {
    const prop = new Layer(GRID, HEADROOM)
    if (pose.prop === 'orb') {
      // A crystal ball in both hands: from the front, between them in front of her; otherwise on
      // her near hand.
      orbAt = frontView ? { x: hips.x, y: hand.y - 4.5 } : add(hand, { x: 0.5, y: -4.5 })
      prop.ellipse(orbAt, 4.2, 4.2, 'orb')
    } else if (pose.prop === 'cup') {
      prop.polygon(
        shape(
          [
            [-2.4, -3],
            [2.4, -3],
            [1.8, 1],
            [-1.8, 1],
          ],
          (p) => add(hand, p),
        ),
        'cup',
      )
      prop.capsule(add(hand, { x: 2.8, y: -2 }), add(hand, { x: 2.6, y: 0 }), 0.9, 0.9, 'cup')
    } else {
      // An open book: two pages, the cover showing round them.
      prop.polygon(
        shape(
          [
            [-6, -4],
            [5, -4.5],
            [5.5, 1.5],
            [-5.5, 2],
          ],
          (p) => add(hand, p),
        ),
        'book',
      )
    }
    ink(prop)
    if (pose.prop === 'book') {
      for (let dy = -3; dy <= 0; dy++) {
        for (let dx = -4; dx <= 4; dx++) if (dx !== 0) set(add(hand, { x: dx, y: dy }), 'f', 'ngN')
      }
      for (let dy = -3; dy <= 0; dy++) set(add(hand, { x: 0, y: dy }), 'F')
    } else {
      // A wisp of steam.
      set(add(hand, { x: -0.5, y: -5 }), 'w')
      set(add(hand, { x: 0.5, y: -6.5 }), 'w')
    }
    if (orbAt) {
      // Inside it, a wisp of light turning (`spin`) and a glint; her fingers under it.
      const turn = (pose.spin ?? 0) * Math.PI * 2
      for (const k of [0, Math.PI]) {
        set(
          { x: orbAt.x + Math.cos(turn + k) * 2, y: orbAt.y + Math.sin(turn + k) * 1.5 },
          'f',
          'G',
        )
      }
      set({ x: orbAt.x - 2, y: orbAt.y - 2 }, 'w', 'G')
      canvas.stamp(['ss.ss'], orbAt.x - 2, orbAt.y + 4)
    } else {
      canvas.stamp(['ss'], hand.x - 1, hand.y)
    }
  }

  // A little butterfly: it flutters down to just above her raised hand, rests there opening and
  // shutting its wings, then flies off up and away (out of the frame).
  const flight = pose.butterfly ?? 0
  if (flight > 0.06 && flight < 0.92) {
    const perch = add(hand, { x: 0, y: -3 })
    const between = (from: Point, to: Point, t: number) => ({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    })
    let at: Point
    let open: boolean
    if (flight < 0.3) {
      const t = (flight - 0.06) / 0.24
      const eased = t * t * (3 - 2 * t)
      at = between(add(hand, { x: 16, y: -24 }), perch, eased)
      at = { x: at.x + Math.sin(t * 9) * 2 * (1 - t), y: at.y }
      open = Math.floor(flight * 80) % 2 === 0
    } else if (flight < 0.72) {
      at = perch
      open = Math.floor((flight - 0.3) / 0.07) % 2 === 0
    } else {
      at = between(perch, add(hand, { x: 22, y: -36 }), ((flight - 0.72) / 0.2) ** 1.4)
      open = Math.floor(flight * 80) % 2 === 0
    }
    if (open) canvas.stamp(BUTTERFLY_OPEN, at.x - 2, at.y - 1)
    else canvas.stamp(BUTTERFLY_SHUT, at.x - 2, at.y)
  }

  // Dozing: z's float up from above her hat, one after another, growing as they rise.
  const zzz = pose.zzz ?? 0
  if (zzz > 0) {
    for (let k = 0; k < 3; k++) {
      const life = zzz * 1.6 - k * 0.3
      if (life <= 0 || life >= 1) continue
      const at = onHead({ x: 7 + life * 6 + k * 1.5, y: -13 - life * 12 })
      canvas.stamp(life > 0.45 ? Z_BIG : Z_SMALL, at.x, at.y, pose.flipText)
    }
  }

  // Juggling: three orbs, a third of the way round apart, each thrown up in a high arc from her far
  // hand to her near one and passed quickly back underneath (a "shower"), just above her hands.
  const juggle = pose.juggle ?? 0
  if (juggle > 0 && juggle < 1 && farHand) {
    const left = farHand
    ORBS.forEach((orb, k) => {
      const round = (juggle * JUGGLE.rounds + k / ORBS.length) % 1
      const high = round < JUGGLE.arc
      const t = high ? round / JUGGLE.arc : (round - JUGGLE.arc) / (1 - JUGGLE.arc)
      const [from, to] = high ? [left, hand] : [hand, left]
      const up = (high ? JUGGLE.high : JUGGLE.low) * 4 * t * (1 - t)
      const at = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - 3 - up }
      canvas.stamp(orb, at.x - 1, at.y - 1)
    })
  }

  // Bubbles: the wand ring held up at her near hand, and bubbles drifting up and forward from in
  // front of her mouth, wobbling and growing, each popping in a twinkle.
  const bubbles = pose.bubbles ?? 0
  if (bubbles > 0) {
    if (bubbles < BUBBLES.wandAway) {
      set(add(hand, { x: 0.5, y: -1.5 }), 'F')
      canvas.stamp(WAND_RING, hand.x, hand.y - 4)
    }
    const dy = Math.round(pose.y ?? 0)
    const from = { x: DIAGONAL_MOUTH.x + 6, y: DIAGONAL_MOUTH.y - 2 + dy }
    for (let k = 0; k < BUBBLES.count; k++) {
      const life = (bubbles - BUBBLES.first - k * BUBBLES.gap) / BUBBLES.life
      if (life <= 0 || life > 1.12) continue
      const at = {
        x: from.x + life * 15 + Math.sin(life * 9 + k * 2) * 1.5,
        y: from.y - life * 21,
      }
      if (life > 1) canvas.stamp(TWINKLE, at.x - 1, at.y - 1)
      else if (life < 0.3) canvas.stamp(BUBBLE_SMALL, at.x - 1, at.y - 1)
      else canvas.stamp(BUBBLE_BIG, at.x - 1.5, at.y - 1.5)
    }
  }

  // A will-o'-wisp going round her, with a fading tail: on the far side of her it's behind her,
  // drawn only where nothing of her is.
  const wisp = pose.wisp ?? 0
  if (wisp > 0) {
    const chest = onBody({ x: 0, y: 2 })
    const trail = [wispAt(wisp - 0.012), wispAt(wisp - 0.006)]
    trail.forEach((p, k) => {
      if (p)
        set({ x: chest.x + p.x, y: chest.y + p.y }, k === 0 ? 'f' : 'G', p.behind ? '.' : undefined)
    })
    const at = wispAt(wisp)
    if (at) {
      WISP.forEach((row, dy) =>
        [...row].forEach((letter, dx) => {
          if (letter === '.') return
          const p = { x: chest.x + at.x - 1.5 + dx, y: chest.y + at.y - 1.5 + dy }
          set(p, letter, at.behind ? '.' : undefined)
        }),
      )
    }
  }

  // A sneeze's sparkles: flying out from her nose in a wide fan above it, out past her face and
  // hair, big at first, then twinkles, then single glints, and gone.
  const burst = pose.burst ?? 0
  if (burst > 0 && burst < 1) {
    const nose = onHead({ x: 0.5, y: 5 })
    for (let k = 0; k < 7; k++) {
      const angle = -Math.PI * (-0.1 + k * 0.2)
      const reach = 6 + burst * 22
      const at = {
        x: nose.x + Math.cos(angle) * reach,
        y: nose.y + Math.sin(angle) * reach * 0.5 - burst * 4,
      }
      if (burst < 0.5 && k % 2 === 0) canvas.stamp(SPARKLE, at.x - 2, at.y - 2)
      else if (burst < 0.8) canvas.stamp(TWINKLE, at.x - 1, at.y - 1)
      else set(at, 'w')
    }
  }

  // Her sparkle trail: little sparkles on the ground behind her heel, left behind as she walks
  // and fading as they drift back: a twinkle, then a glint, then a fainter one, and gone; every
  // other one gold. Only on empty ground or her shadow, never over her.
  if (pose.trail !== undefined) {
    for (let k = 0; k < TRAIL.perStride; k++) {
      const age = (((pose.trail - k / TRAIL.perStride) % 1) + 1) % 1
      if (age >= TRAIL.life) continue
      const at = { x: hips.x - 5 - age * TRAIL.drift - (k % 2) * 2, y: 93 - (k % 2) - age * 4 }
      const gold = k % 2 === 1
      if (age < 0.1) motif(at, gold ? ['.Y.', 'YwY', '.Y.'] : TWINKLE, '.x')
      else set(at, age < 0.25 ? (gold ? 'Y' : 'w') : gold ? 'k' : 'f', '.x')
    }
  }

  // A little spell: sparkles round her raised hand.
  const sparkle = pose.sparkle ?? 0
  if (sparkle > 0) {
    const spin = sparkle * Math.PI * 2
    canvas.stamp(SPARKLE, hand.x - 2 + Math.cos(spin) * 6, hand.y - 2 - 4 + Math.sin(spin) * 4)
    canvas.stamp(
      TWINKLE,
      hand.x - 1 + Math.cos(spin + 2.1) * 7,
      hand.y - 1 - 5 + Math.sin(spin + 2.1) * 5,
    )
    canvas.stamp(
      TWINKLE,
      hand.x - 1 + Math.cos(spin + 4.2) * 5,
      hand.y - 1 - 3 + Math.sin(spin + 4.2) * 3,
    )
  }

  // A flame in her palm: a spark, growing and flickering (its tip leaning one way, then the
  // other), then blown out, leaning away from her as it shrinks, into a curl of smoke rising with a
  // few sparks.
  const flame = pose.flame ?? 0
  if (flame > 0 && flame < 1) {
    const palm = add(hand, { x: 0.5, y: -1 })
    const blown = stage(flame, ...FLAME.blow)
    if (flame >= FLAME.kindle && blown < 1) {
      const grown = stage(flame, FLAME.kindle, FLAME.full)
      const size =
        blown > 0 ? (blown < 0.5 ? 2 : 1) : grown < 0.25 ? 0 : grown < 0.6 ? 1 : grown < 1 ? 2 : 3
      const picture = FLAMES[size]!
      const flicker = blown === 0 && hash(Math.floor(flame * 60), 3) < 0.5
      const x = palm.x - (picture[0]!.length - 1) / 2 + (blown > 0 ? 1 + blown * 2 : 0)
      canvas.stamp(picture, x, palm.y - picture.length + 1, flicker)
    }
    const smoke = stage(flame, FLAME.blow[1], 0.95)
    if (smoke > 0 && smoke < 1) {
      for (let k = 0; k < 5; k++) {
        const life = smoke * 1.6 - k * 0.15
        if (life <= 0 || life >= 1) continue
        const at = { x: palm.x + 1 + Math.sin(life * 6 + k) * 2, y: palm.y - 2 - life * 18 }
        if (life < 0.4) canvas.stamp(['ff', 'ff'], at.x, at.y)
        else set(at, life < 0.75 ? 'f' : 'F')
      }
      for (let k = 0; k < 3; k++) {
        const life = smoke * 2 - k * 0.2
        if (life <= 0 || life >= 1) continue
        set(
          { x: palm.x + (k - 1) * (2 + life * 4), y: palm.y - 3 - life * 10 },
          life < 0.5 ? 'Y' : 'k',
        )
      }
    }
  }

  // A snowflake over her cupped hands: six arms growing out from its heart, branching, a glint
  // going round its tips; then it bursts into glitter that flies out and drifts down, twinkling.
  const frost = pose.frost ?? 0
  if (frost > 0 && frost < 1 && farHand) {
    const c = {
      x: (hand.x + farHand.x) / 2,
      y: Math.min(hand.y, farHand.y) - 9 + Math.sin(frost * 25) * 0.6,
    }
    const burst = stage(frost, ...FROST.burst)
    const grown = stage(frost, ...FROST.grow)
    if (burst === 0 && grown > 0) {
      const reach = 1 + grown * 5
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 2 + (k * Math.PI) / 3
        const out = { x: Math.cos(a), y: Math.sin(a) }
        for (let r = 1; r <= reach; r += 0.5) {
          set({ x: c.x + out.x * r, y: c.y + out.y * r }, r > reach - 1 ? 'G' : 'w')
        }
        if (reach < 3.5) continue
        for (const side of [-1, 1]) {
          const b = a + (side * Math.PI) / 3
          const from = { x: c.x + out.x * reach * 0.55, y: c.y + out.y * reach * 0.55 }
          for (let r = 0.5; r <= reach * 0.35; r += 0.5) {
            set({ x: from.x + Math.cos(b) * r, y: from.y + Math.sin(b) * r }, 'f')
          }
        }
      }
      set(c, 'w')
      if (grown >= 1) {
        const a = Math.PI / 2 + ((Math.floor(frost * 24) % 6) * Math.PI) / 3
        canvas.stamp(TWINKLE, c.x - 1 + Math.cos(a) * reach, c.y - 1 + Math.sin(a) * reach)
      }
    } else if (burst > 0 && burst < 1) {
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2 + 0.2
        const out = 3 + (1 - (1 - burst) ** 2) * 14
        const at = {
          x: c.x + Math.cos(a) * out,
          y: c.y + Math.sin(a) * out * 0.6 + burst * burst * 12,
        }
        if (burst < 0.3 && k % 3 === 0) canvas.stamp(TWINKLE, at.x - 1, at.y - 1)
        else set(at, (k + Math.floor(burst * 10)) % 3 === 0 ? 'w' : k % 2 ? 'G' : 'f')
      }
    }
  }

  // A flower: sparkles drip from her pointing finger to the ground in front of her, where a sprout
  // comes up, grows leaves and a bud, and opens into a pink flower that sways and twinkles; at the
  // end it glows and scatters into sparkles.
  const bloom = pose.bloom ?? 0
  if (bloom > 0 && bloom < 1) {
    const ground = { x: hips.x + BLOOM.ahead, y: 94 }
    const drip = stage(bloom, ...BLOOM.drip)
    if (drip > 0 && drip < 1) {
      const tip = add(hand, { x: 1, y: 1 })
      for (let k = 0; k < 3; k++) {
        const fall = (drip * 3 + k / 3) % 1
        const at = {
          x: tip.x + (ground.x - tip.x) * fall,
          y: tip.y + (ground.y - 2 - tip.y) * fall,
        }
        set(at, k === 1 ? 'Y' : 'w')
      }
    }
    const grown = stage(bloom, ...BLOOM.grow)
    const open = stage(bloom, ...BLOOM.open)
    const scatter = stage(bloom, ...BLOOM.scatter)
    if (grown > 0 && scatter === 0) {
      const tall = Math.round(1 + grown * 12)
      const sway = Math.sin(bloom * 16) * 0.8 * stage(bloom, 0.6, 0.66)
      for (let k = 0; k < tall; k++) set({ x: ground.x + (sway * k) / tall, y: ground.y - k }, 'E')
      // Leaves either side as it grows: a pair low down, then one higher up.
      for (const [height, side] of [
        [3, -1],
        [5, 1],
        [8, -1],
      ] as const) {
        if (tall < height + 2) continue
        set({ x: ground.x + side, y: ground.y - height }, 'E')
        set({ x: ground.x + side * 2, y: ground.y - height - 1 }, 'E')
        set({ x: ground.x + side * 3, y: ground.y - height - 1 }, 'P')
      }
      const top = { x: ground.x + sway, y: ground.y - tall }
      if (open > 0) {
        const flower = open < 0.5 ? FLOWER_HALF : FLOWER
        canvas.stamp(flower, top.x - (flower[0]!.length - 1) / 2, top.y - (flower.length - 1) / 2)
        if (open >= 1 && Math.floor(bloom * 30) % 4 === 0) {
          canvas.stamp(TWINKLE, top.x + 3, top.y - 6)
        }
      } else if (grown >= 1) {
        canvas.stamp(BUD, top.x - 1, top.y - 1)
      }
    } else if (scatter > 0 && scatter < 1) {
      const top = { x: ground.x, y: ground.y - 13 }
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2
        const at = {
          x: top.x + Math.cos(a) * scatter * 9,
          y: top.y + Math.sin(a) * scatter * 4 - scatter * 10,
        }
        if (scatter < 0.35 && k % 2 === 0) canvas.stamp(TWINKLE, at.x - 1, at.y - 1)
        else set(at, scatter < 0.6 ? (k % 2 ? 'c' : 'Y') : 'w')
      }
    }
  }

  // A star traced in the air beside her: a point of light draws its outline, five points round,
  // in gold; it flashes white as it closes, glows with a sparkle at its heart, and fades away a
  // pixel at a time, motes rising from its points.
  const sigil = pose.sigil ?? 0
  if (sigil > 0 && sigil < 1) {
    const c = { x: hips.x + 20, y: head.y - 7 }
    const corners = Array.from({ length: 10 }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const r = i % 2 === 0 ? SIGIL.outer : SIGIL.inner
      return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r }
    })
    const along = (s: number) => {
      const i = Math.floor(s) % 10
      const [from, to] = [corners[i]!, corners[(i + 1) % 10]!]
      return { x: from.x + (to.x - from.x) * (s % 1), y: from.y + (to.y - from.y) * (s % 1) }
    }
    const traced = stage(sigil, ...SIGIL.trace) * 10
    const flash = sigil >= SIGIL.trace[1] && sigil < SIGIL.trace[1] + 0.06
    const fading = stage(sigil, ...SIGIL.fade)
    if (fading < 1) {
      for (let s = 0; s < Math.min(10, traced); s += 0.08) {
        const p = along(s)
        if (fading > 0 && hash(Math.round(p.x), Math.round(p.y), 5) < fading) continue
        set(p, flash ? 'w' : 'Y')
      }
    }
    if (traced > 0 && traced < 10) {
      const tip = along(traced)
      canvas.stamp(TWINKLE, tip.x - 1, tip.y - 1)
    } else if (traced >= 10 && fading === 0) {
      const glint = Math.floor(sigil * 20) % 2 === 0 ? SPARKLE : TWINKLE
      canvas.stamp(glint, c.x - (glint.length - 1) / 2, c.y - (glint.length - 1) / 2)
    } else if (fading > 0 && fading < 1) {
      for (let k = 0; k < 5; k++) {
        const point = corners[k * 2]!
        set({ x: point.x, y: point.y - 1 - fading * 8 }, fading < 0.5 ? 'w' : 'f')
      }
    }
  }

  // A rainbow over her, behind her: painted from its top outward either side as her hands sweep
  // apart, five bands of colour; glints run along it; then it fades away a pixel at a time.
  const rainbow = pose.rainbow ?? 0
  if (rainbow > 0 && rainbow < 1) {
    const centre = { x: hips.x, y: hips.y - 4 }
    const reach = stage(rainbow, ...RAINBOW.paint) * RAINBOW.span
    const fading = stage(rainbow, ...RAINBOW.fade)
    RAINBOW_BANDS.forEach((letter, b) => {
      for (let a = -reach; a <= reach; a += 0.012) {
        const p = {
          x: centre.x + Math.sin(a) * (RAINBOW.rx - b),
          y: centre.y - Math.cos(a) * (RAINBOW.ry - b),
        }
        if (fading > 0 && hash(Math.round(p.x), Math.round(p.y), 7) < fading) continue
        set(p, letter, '.')
      }
    })
    if (reach >= RAINBOW.span && fading === 0) {
      for (let k = 0; k < 3; k++) {
        const a = ((((rainbow * 3 + k / 3) % 1) * 2 - 1) * RAINBOW.span) / 1.05
        const p = {
          x: centre.x + Math.sin(a) * (RAINBOW.rx - 2),
          y: centre.y - Math.cos(a) * (RAINBOW.ry - 2),
        }
        motif(p, TWINKLE, '.' + RAINBOW_BANDS.join(''))
      }
    }
  }

  // Her hat trick: sparkles showering down from under her lifted hat as it spins, over her.
  const shower = pose.shower ?? 0
  if (shower > 0 && shower < 1) {
    const brim = onHead({ x: 0, y: -9 - (pose.hatLift ?? 0) })
    for (let k = 0; k < 7; k++) {
      const round = shower * 3 + k / 7
      const life = round % 1
      const at = {
        x: brim.x + (hash(k, Math.floor(round), 9) - 0.5) * 22,
        y: brim.y + 2 + life * 26,
      }
      if (life < 0.25) canvas.stamp(k % 2 ? GOLD_TWINKLE : TWINKLE, at.x - 1, at.y - 1)
      else set(at, life < 0.6 ? (k % 2 ? 'Y' : 'w') : 'f')
    }
  }

  // A falling star: it streaks down from high to one side into her cupped hands, its tail behind
  // it; glows there, glinting; then she tosses it back up and away, leaving twinkles in the air.
  const star = pose.star ?? 0
  if (star > 0 && star < 1 && farHand) {
    const cupped = { x: (hand.x + farHand.x) / 2, y: Math.min(hand.y, farHand.y) - 3 }
    const [fallFrom, fallTo] = STAR_CATCH.fall
    const [tossFrom, tossTo] = STAR_CATCH.toss
    if (star >= fallFrom && star < fallTo) {
      const from = { x: hips.x + 34, y: -6 }
      const path = (t: number) => ({
        x: from.x + (cupped.x - from.x) * t,
        y: from.y + (cupped.y - from.y) * t * t,
      })
      const t = stage(star, fallFrom, fallTo)
      for (let k = 8; k >= 1; k--) {
        if (t - k * 0.03 < 0) continue
        set(path(t - k * 0.03), k < 3 ? 'w' : k < 6 ? 'j' : 'Y')
      }
      const at = path(t)
      canvas.stamp(STAR, at.x - 2, at.y - 2)
    } else if (star >= fallTo && star < tossFrom) {
      canvas.stamp(STAR, cupped.x - 2, cupped.y - 2)
      const glint = Math.floor(star * 30) % 3
      if (glint === 0) set({ x: cupped.x - 4, y: cupped.y - 3 }, 'w')
      if (glint === 1) set({ x: cupped.x + 4, y: cupped.y - 4 }, 'w')
      if (glint === 2) set({ x: cupped.x + 1, y: cupped.y - 6 }, 'j')
    } else if (star >= tossFrom && star < tossTo) {
      const t = stage(star, tossFrom, tossTo)
      const at = { x: cupped.x + t * 6, y: cupped.y - t * 62 }
      for (let k = 1; k <= 6; k++) set({ x: at.x - k * 0.5, y: at.y + k * 2 }, k < 3 ? 'w' : 'j')
      canvas.stamp(STAR, at.x - 2, at.y - 2)
    }
    const after = stage(star, tossFrom + 0.04, 0.98)
    if (after > 0 && after < 1) {
      for (let k = 0; k < 4; k++) {
        const life = after * 1.6 - k * 0.15
        if (life <= 0 || life >= 1) continue
        const at = { x: cupped.x + 1 + k * 1.5, y: cupped.y - 14 - k * 11 }
        if (life < 0.4) canvas.stamp(GOLD_TWINKLE, at.x - 1, at.y - 1)
        else set(at, life < 0.7 ? 'Y' : 'k')
      }
    }
  }

  // A little rain cloud: it gathers over her hat, light on top and grey beneath, and rains on her
  // (and round her, splashing on the ground); shooed, it shakes and bursts into sparkles.
  const rain = pose.rain ?? 0
  if (rain > 0 && rain < 1) {
    const gather = stage(rain, ...RAIN.gather)
    const burst = stage(rain, ...RAIN.burst)
    const shake = rain > 0.6 && rain < RAIN.burst[0] ? Math.round(Math.sin(rain * 200)) : 0
    const c = { x: head.x + 1 + shake, y: Math.max(-5, head.y - 28) }
    if (gather > 0 && burst === 0) {
      const humps = [
        { dx: -6, r: 4 },
        { dx: 0, r: 5.5 },
        { dx: 6, r: 4.5 },
      ]
      const cloud = new Set<string>()
      for (let y = Math.floor(c.y - 7); y <= c.y + 2; y++) {
        for (let x = Math.floor(c.x - 13); x <= c.x + 13; x++) {
          const inside = humps.some(({ dx, r }) => {
            const rx = r * 1.3 * gather
            const ry = r * gather
            return ((x + 0.5 - c.x - dx * gather) / rx) ** 2 + ((y + 0.5 - c.y) / ry) ** 2 <= 1
          })
          if (inside) cloud.add(`${x},${y}`)
        }
      }
      for (const key of cloud) {
        const [x, y] = key.split(',').map(Number) as [number, number]
        const edge = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) => !cloud.has(`${x + dx!},${y + dy!}`))
        set({ x, y }, edge ? 'O' : y >= c.y + 1 ? 'F' : y <= c.y - 2 ? 'l' : 'f')
      }
    }
    const pour = stage(rain, ...RAIN.pour)
    if (pour > 0 && pour < 1) {
      const top = c.y + 3
      for (let k = 0; k < 8; k++) {
        const x = c.x - 9 + k * 2.6
        const fall = (pour * 9 + hash(k, 1, 11)) % 1
        const y = top + fall * (93 - top)
        set({ x, y: y - 1 }, 'w')
        set({ x, y }, 'G')
        if (fall > 0.9) {
          set({ x: x - 1, y: 93 }, 'f', '.x')
          set({ x: x + 1, y: 93 }, 'f', '.x')
        }
      }
    }
    if (burst > 0 && burst < 1) {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2
        const at = { x: c.x + Math.cos(a) * burst * 14, y: c.y + Math.sin(a) * burst * 7 }
        if (burst < 0.4 && k % 2 === 0)
          canvas.stamp(k % 4 ? GOLD_TWINKLE : TWINKLE, at.x - 1, at.y - 1)
        else set(at, burst < 0.7 ? (k % 2 ? 'G' : 'w') : 'f')
      }
    }
  }

  // A potion in a little flask in her hand, bubbling and changing colour; the cork pops off and
  // flies away, and puffs of coloured smoke curl up out of it, fading.
  const potion = pose.potion ?? 0
  if (potion > 0 && potion < 1) {
    const corner = { x: Math.round(hand.x) - 2, y: Math.round(hand.y) - 7 }
    const corked = potion < POTION.pop
    if (potion > 0.04 && potion < 0.92) {
      const colour = POTION_COLOURS[Math.floor(potion * 12) % POTION_COLOURS.length]!
      FLASK.forEach((row, dy) =>
        [...row].forEach((letter, dx) => {
          if (letter === '.' || (letter === 'o' && !corked)) return
          const drawn = letter === 'X' ? colour : letter === 'o' ? 'i' : letter
          canvas.set(corner.x + dx, corner.y + dy, drawn)
        }),
      )
      const bubble = Math.floor(potion * 40) % 3
      set({ x: corner.x + 1 + (bubble % 2) * 2, y: corner.y + 5 - bubble }, 'w', colour)
      canvas.stamp(['ss'], hand.x - 1, hand.y)
    }
    const flying = stage(potion, POTION.pop, POTION.pop + 0.12)
    if (flying > 0 && flying < 1) {
      set({ x: corner.x + 2 + flying * 8, y: corner.y - flying * 14 + flying * flying * 10 }, 'i')
    }
    const puff = stage(potion, POTION.pop, POTION.puffed)
    if (puff > 0 && puff < 1) {
      for (let k = 0; k < 6; k++) {
        const life = puff * 1.8 - k * 0.15
        if (life <= 0 || life >= 1) continue
        const letter = ['c', 'a', 'G'][k % 3]!
        const at = {
          x: corner.x + 2 + Math.sin(life * 7 + k * 2) * (2 + life * 4),
          y: corner.y - 1 - life * 20,
        }
        if (life < 0.45) canvas.stamp([letter + letter, letter + letter], at.x, at.y)
        else set(at, life < 0.8 ? letter : 'w')
      }
    }
  }

  // Her spellbook, floating open in front of her, bobbing: it rises into place opening, its pages
  // turn by themselves, right to left, glowing letters rise out of it and fade; then it closes and
  // vanishes in a twinkle.
  const tome = pose.tome ?? 0
  if (tome > 0 && tome < 1) {
    const appear = stage(tome, ...TOME.appear)
    const close = stage(tome, ...TOME.close)
    const vanish = stage(tome, ...TOME.vanish)
    const c = {
      x: Math.round(hips.x),
      y: Math.round(hips.y - 16 + (1 - appear) * 6 + Math.sin(tome * 18)),
    }
    if (appear > 0 && vanish === 0) {
      const half = Math.round(1 + 6 * appear * (1 - close))
      // Its outline, dark against her robe, then its covers with a gold edge.
      for (let dx = -half - 2; dx <= half + 2; dx++) {
        for (let dy = -3; dy <= 5; dy++) set({ x: c.x + dx, y: c.y + dy }, 'u')
      }
      for (let dx = -half - 1; dx <= half + 1; dx++) set({ x: c.x + dx, y: c.y + 3 }, 'n')
      for (let dx = -half; dx <= half; dx++) set({ x: c.x + dx, y: c.y + 4 }, 'Y')
      for (let dy = -1; dy <= 2; dy++) {
        set({ x: c.x - half - 1, y: c.y + dy }, 'n')
        set({ x: c.x + half + 1, y: c.y + dy }, 'n')
      }
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          if (dy === -2 && Math.abs(dx) === half && half > 1) continue
          const text =
            (dy === -1 || dy === 1) &&
            Math.abs(dx) > 1 &&
            Math.abs(dx) < half &&
            (dx + dy) % 2 === 0
          set({ x: c.x + dx, y: c.y + dy }, dx === 0 || text ? 'F' : 'f')
        }
      }
      const turning = stage(tome, ...TOME.turn)
      if (turning > 0 && turning < 1 && close === 0) {
        const edge = Math.round(Math.cos(((turning * TOME.pages) % 1) * Math.PI) * half)
        const [from, to] = edge > 0 ? [1, edge] : [edge, -1]
        for (let dx = from; dx <= to; dx++) {
          for (let dy = -3; dy <= 1; dy++)
            set({ x: c.x + dx, y: c.y + dy }, dx === edge ? 'F' : 'w')
        }
      }
      if (appear < 1) canvas.stamp(TWINKLE, c.x + half + 1, c.y - 4)
    }
    const letters = stage(tome, ...TOME.letters)
    if (letters > 0 && letters < 1) {
      for (let k = 0; k < 6; k++) {
        const raw = letters * 3 - k / 6
        if (raw < 0 || raw >= 2.6) continue
        const life = raw % 1
        if (life > 0.9) continue
        const glyph = GLYPHS[k % GLYPHS.length]!.map((row) =>
          life < 0.6 ? row : row.replace(/Y/g, 'k'),
        )
        // Up and out to one side of her or the other, clear of her face.
        const side = k % 2 === 0 ? 1 : -1
        const at = {
          x: c.x + side * (5 + life * 16) + Math.sin(life * 6 + k) - 1,
          y: c.y - 3 - life * 20,
        }
        canvas.stamp(glyph, at.x, at.y)
      }
    }
    if (vanish > 0 && vanish < 1) {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2
        const at = { x: c.x + Math.cos(a) * vanish * 9, y: c.y + Math.sin(a) * vanish * 5 }
        if (vanish < 0.5) canvas.stamp(k % 2 ? GOLD_TWINKLE : TWINKLE, at.x - 1, at.y - 1)
        else set(at, 'w')
      }
    }
  }

  // Dust from a hard landing: puffs thrown out along the ground either side of her, rising a
  // little and thinning out, only on empty ground or her shadow.
  const dust = pose.dust ?? 0
  if (dust > 0 && dust < 1) {
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const life = dust * 1.3 - k * 0.12
        if (life <= 0 || life >= 1) continue
        const at = { x: hips.x + side * (22 + life * 14 + k * 3), y: 93 - life * 5 - k }
        if (life < 0.45) motif(at, ['ff', 'fF'], '.x')
        else set(at, life < 0.75 ? 'f' : 'F', '.x')
      }
    }
  }

  // Dizzy stars going round above her head (a hard landing): in front of her on the near half of
  // the circle, behind her on the far half.
  if (pose.dizzy !== undefined) {
    // Above her hat's tip, wherever it is (knocked down over her eyes, it's lower).
    const middle = onHead({ x: 0, y: -25 - (pose.hatLift ?? 0) })
    for (let k = 0; k < 3; k++) {
      const a = pose.dizzy * Math.PI * 2 + (k * Math.PI * 2) / 3
      const at = { x: middle.x + Math.cos(a) * 12, y: middle.y + Math.sin(a) * 3.5 }
      const behind = Math.sin(a) < 0
      const star = k === 1 ? GOLD_TWINKLE : STAR
      const half = (star.length - 1) / 2
      star.forEach((row, dy) =>
        [...row].forEach((letter, dx) => {
          if (letter === '.') return
          set({ x: at.x - half + dx, y: at.y - half + dy }, letter, behind ? '.' : undefined)
        }),
      )
    }
  }

  // A scroll held open in front of her, its rolled ends in her hands.
  if (pose.scroll && farHand) {
    const middle = { x: (hand.x + farHand.x) / 2, y: (hand.y + farHand.y) / 2 }
    canvas.stamp(SCROLL, middle.x - (SCROLL[0]!.length - 1) / 2, middle.y - SCROLL.length + 2)
  }

  // A bead of sweat beside her forehead, on the side away from her hat's tip.
  if (pose.sweat) {
    const at = onHead({ x: -10, y: -4 })
    canvas.stamp(SWEAT, at.x - 1, at.y - 1)
  }

  // Hearts floating up from her, swaying, one after another, big then small, and gone.
  const hearts = pose.hearts ?? 0
  if (hearts > 0 && hearts < 1) {
    for (let k = 0; k < 4; k++) {
      const life = hearts * 1.6 - k * 0.2
      if (life <= 0 || life >= 1) continue
      const side = k % 2 === 0 ? 1 : -1
      const at = onHead({
        x: side * (6 + life * 6) + Math.sin(life * 9 + k) * 1.5,
        y: -8 - life * 24,
      })
      const heart = life < 0.55 ? HEART : HEART_SMALL
      canvas.stamp(heart, at.x - (heart[0]!.length - 1) / 2, at.y - (heart.length - 1) / 2)
    }
  }

  // Confetti: a burst from her raised hands, the pieces flying up and out, then fluttering down
  // round her, side to side, each its own colour, until they're gone.
  const confetti = pose.confetti ?? 0
  if (confetti > 0.08 && confetti < 1) {
    const from = farHand
      ? { x: (hand.x + farHand.x) / 2, y: Math.min(hand.y, farHand.y) - 2 }
      : hand
    const t = (confetti - 0.08) / 0.92
    for (let k = 0; k < 34; k++) {
      const spread = (hash(k, 1, 13) - 0.5) * 2
      const rise = 18 + hash(k, 2, 13) * 22
      const up = Math.min(1, t / 0.25)
      const down = Math.max(0, t - 0.25)
      const at = {
        x:
          from.x +
          spread * 30 * Math.min(1, t / 0.3) +
          Math.sin(t * 14 + k) * 2 * Math.min(1, down * 4),
        y: from.y - rise * (1 - (1 - up) ** 2) + down * down * 140 + down * 20,
      }
      if (at.y > 94 || t > 0.97) continue
      const colour = CONFETTI[k % CONFETTI.length]!
      set(at, colour)
      // Every other piece a little strip, turning as it falls.
      if (k % 2 === 0) {
        const flat = Math.floor(t * 20 + k) % 2 === 0
        set({ x: at.x + (flat ? 1 : 0), y: at.y + (flat ? 0 : 1) }, colour)
      }
    }
  }

  castShadows(canvas)

  // Dissolving: her pixels go one by one (dissolveAt), each turning white just before (so a white
  // shimmer runs over her as she goes), and each that has a mote leaving it as a white speck that
  // rises, sways and fades to silver, drawn only where nothing of her is left. Played backwards
  // (fade going down), the motes come down into place and she forms out of them.
  const fade = pose.fade ?? 0
  if (fade > 0) {
    const her = canvas.rows()
    const each = (visit: (x: number, y: number, gone: number) => void) =>
      her.forEach((row, r) =>
        [...row].forEach((letter, x) => {
          const y = r - canvas.top
          if (letter !== '.') visit(x, y, fade - dissolveAt(x, y))
        }),
      )
    each((x, y, gone) => {
      if (gone >= 0) canvas.set(x, y, '.')
      else if (gone > -FADE.glow) canvas.set(x, y, 'w')
    })
    each((x, y, gone) => {
      if (gone < 0 || gone >= FADE.life || hash(x, y, 1) > FADE.share) return
      const mote = {
        x: x + 0.5 + Math.sin(x * 1.3 + y * 0.7) * gone * 10,
        y: y + 0.5 - (gone / FADE.life) * FADE.rise,
      }
      set(mote, gone < FADE.life * 0.5 ? 'w' : 'f', '.')
    })
  }
  return canvas.rows()
}
```

<!-- /code -->

Draws one pose as rows of palette letters. Seen diagonally, she's one hand-drawn picture
(`DIAGONAL` in `pictures.ts`), stamped where the pose puts her; any expression but the neutral one
is stamped onto its face (the eyes and mouth painted over with skin first, then the new ones at
`DIAGONAL_EYES` and `DIAGONAL_MOUTH`), and only her near arm, props and sparkles are drawn on top.
From the front and side on, each part is a `Layer`, inked onto the frame (`Canvas.ink()`) from the
back to the front, so later parts cover earlier ones; smaller details are set pixel by pixel on
top. Whichever way she's seen, `castShadows()` (below) then adds the shadows things cast on what's
just below them, and last, as she vanishes or appears, she's dissolved into white motes. In order:

**Setting up**

- `frontView`: whether she's seen from the front, which a lot of what follows depends on.
- `fromBehind`: as its comment says, her back to us (`Pose.back`), from the front only: a pose
  that asks for it seen any other way is simply drawn as usual. Most of the front view stays as it
  is; the places that check `fromBehind` leave out what's on her front and put her hair over it
  (noted below).
- `hips`: the root of the skeleton, in the middle of the grid across (`48`) and 59 pixels down when
  standing (her legs, two `LEG_LENGTH`s, reach down to 92), or 85 when sitting, moved by the pose's
  `x` and `y`.
- `neck` is 21 pixels above the hips and `head` (the middle of her head) 11 above the neck, each
  turned with `rotate()`: by `lean` for the neck, and by `lean` plus `tilt` for the head.
- `canvas = new Canvas(GRID, HEADROOM)`: the frame, her 96-pixel grid with `HEADROOM` rows above
  it for her hat when she rises off the ground. Every layer below is made the same way
  (`new Layer(GRID, HEADROOM)`), so its rows match the canvas's.
- `ink`: a short way to ink a layer with her ramps and light.
- `inkOverHair(layer)`: as its comment says, inks a layer of hair that lies over hair already
  drawn, with a soft line in the hair's shade, rather than a hard outline, where its edge crosses
  that hair, so the two read as one head of hair. Side on, the hair in front and the tuft under her
  ear are inked with it.
  - `before = canvas.rows()`: a copy of the frame as it was, before this layer.
  - `ink(layer)`: inks the layer as usual, outline and all.
  - The loops go over the layer's box and one pixel beyond on every side, where its outline is.
    `outline` is a pixel outside the layer that's now the hair's outline (`O`); if it was hair
    before (`'hlLD'`: base, light, shine or shade), it becomes the hair's shade (`D`) instead. Where
    the outline lies against anything else (her face, or nothing) it's kept.
  - `before[y + canvas.top]?.[x]`: `rows()` lists the headroom rows first, so the canvas's `y` is
    row `y + canvas.top`. `?.` gives `undefined` for a row off the frame, which counts as not hair.
- `at(origin, angle)`: returns a function that places a point given in a part's own frame: an
  offset from the part's origin, as if she stood straight, turned with the part. `onHead`, `onBody`
  and `onHips` are the three frames the shapes below are written in. The hips turn half as much as
  the body (`lean * 0.5`), so she bends at the waist.
- `shape(points, frame)`: turns a list of `[x, y]` pairs, the way the shapes below are written,
  into points placed in one of those frames.
- `flow = pose.flow`: the ripple's place in its cycle, or `undefined` when there's none.
- `blown(p)`: a hair point pushed sideways by `wind` and raised by `lift`, more the further down
  her hair it is (`t` is 0 near the top of her head and 1 twenty pixels lower), so the roots stay
  put and the ends swing. As the comment says, it's also rippled as she walks:
  - `ripple`: none without a `flow`. Otherwise `Math.sin(flow - p.y * RIPPLE.k)`, a wave down her
    hair, times `RIPPLE.size` and `t`, so it grows toward the tips. Points further down are further
    behind in the wave (`- p.y * RIPPLE.k`), so as `flow` goes up from frame to frame each crest
    moves down her hair: a wave running from her head to the ends of her hair, the way hair flows,
    rather than all of it swinging at once.
- `supple(points)`: as its comment says, a shape's points with more in between, so the ripple can
  bend its long edges. For each point it takes the next (`points[(i + 1) % points.length]`, the
  last joining back to the first), cuts the edge between them into `pieces`, enough that none is
  longer than `RIPPLE.step`, and puts a point at the start of each. The shape's outline is the same
  (the new points lie on its edges) until `blown()` moves each point by its own amount: her hair's
  straight back edge, one edge from its ends to her head, becomes a curve. The back hair, the back
  of her head (`crown`) and the tuft go through it; so they ripple together, and the crown's back
  edge stays in line with the back hair's.
- `set(p, letter, only)`: sets one pixel, but only where it's currently one of the letters in
  `only`, so a detail (the trim, the strands in her hair, the hat's band) is only drawn on the part
  it belongs to. With `only` set to `'.'`, it only draws where nothing is yet, which is how the
  will-o'-wisp goes behind her.
- `motif(p, rows, only)`: the same for a small pattern, written as rows of letters (`.`
  see-through): centred on `p`, rounded to whole pixels first so the pattern keeps its shape
  however the part is turned, and only over the letters in `only`. The clothes' patterns use it.

**Her shadow, the magic circle and her long hair**

- The shadow: a flat ellipse on the bottom row, reaching 15 pixels either side of her and narrower
  the higher she is (`15 - height / 2`, never under 6). `ink(shadow, false)` draws it without an
  outline. As the comment says, there's none while she's carried (the pose's `shadow` is `false`
  then), when she's nowhere near the taskbar.
- The magic circle, when `pose.rune` is above 0 (as she levitates): as the comment says, on the
  ground under her. `ring(a, scale)` is the point at angle `a` round an ellipse 15 pixels either
  side of her and 2.8 up and down, times `rune` (so it grows and shrinks) and `scale`. Stepping
  round in small steps (`0.02` radians), it sets a teal ring (`G`) and, inside it at `0.62` of
  the size, a silver ring (`f`) in dashes, twelve to a turn (`Math.floor(((a + spin) * 6) /
Math.PI) % 2`), which turn with `spin`. Six white runes (`w`) go round the outer ring, a sixth
  of a turn apart. Five sparks (a white pixel over a teal one) rise from points round the circle,
  each a fifth of the way behind the last, starting again at the bottom when they reach the top
  (`% 1`), 24 pixels up at full size. It's drawn before anything of her, so she stands (or
  floats) in front of it.
- The back hair: as the comment says, her long hair behind her, down to the small of her back, its
  ends in clumps of different lengths, as one polygon in the head's frame. It's inked first, so
  everything else is in front of it.
  - From the front, it hangs down past her shoulders, its lower edge jagged, clumps of hair ending
    at different lengths. Below her locks it's no wider than her shoulders: 9 pixels either side of
    the middle of her head from 8 pixels down, and 8.5 at the bottom (`[9, 8]`, `[9, 18]`,
    `[8.5, 27]`, and the same on the other side). So, as the comment says, none of it peeks out
    beside her sleeves; a pixel wider, its outline showed as a dark line beside her right shoulder
    (the left of the picture), below her lock. The rest of it hangs down her back, out of sight.
  - Side on, as the comment says, it falls from the back of her head as one mass, as long as it is
    from the front. The comments in the list mark its parts: over the top of her head, then down her
    back, behind her neck and robe (`[-3, 9]` to `[-6.5, 24]`); its ends, three clumps, as from the
    front, their tips 27.4, 28.6 and 28 pixels below the middle of her head with notches between
    them (`[-6.8, 27.4]` to `[-13.4, 25]`); and back up, one straight line to the back of her head
    (`[-8, -3]`). That straight back edge, from under her hat to the ends, makes all of it one shape
    with one outline, so no slivers of hair show between outlines. The back edge slants back
    further than her robe does, so, as the comment says, the hair showing behind her gets a little
    wider as it goes down (6 or 7 pixels behind her shoulders, 8 near its ends): a full head of
    hair rather than a narrowing tail.
- The strands, side on only, set on the back hair as soon as it's inked. As the comment says, a
  darker line down between its clumps, from the gaps between their ends up into the hair, so it
  reads as long hair rather than a flat shape:
  - There are two, each from a `top` to an `end` in the head's frame: one from 9 pixels below the
    middle of her head down to the gap between the first two clumps (`[-8.6, 9]` to `[-8.3, 25]`),
    and one from 6 down to the gap between the second and third (`[-10, 6]` to `[-11.3, 25.6]`).
    The ends sit just above the notches in the outline, so each line seems to run on from one.
  - The inner loop steps `t` from 0 to 1 in twentieths, setting a pixel of the hair's shade (`D`)
    at each point along the line, blown like the rest of her hair (`onHead(blown(p))`), so the
    strands sway and ripple with it. They go only over the hair's lighter pixels (`'hl'`), so they
    stay off the outline.
  - `as const` makes the list's type exact pairs of points, so `top[0]` and `end[1]` are known to
    be numbers.
  - Like the back hair, they're behind everything drawn after them: her arms, legs and robe.

**Arms and legs**

- `shoulderAt(side)`: where a shoulder is: 6.5 pixels either side of her middle from the front,
  closer together diagonally and side on.
- `drawArm(arm, side)`: as the comment says, a bell sleeve with silver trim at its cuff, her hand
  peeking out. The upper arm is 11.5 pixels long and the forearm 10, placed with `limb()` from the
  shoulder, adding `lean` so her arms lean with her. The upper sleeve is a capsule. The forearm is
  where the sleeve widens, so it's drawn differently:
  - `across`: the direction straight across the forearm, at right angles to it.
  - `edge(p, r, way)`: the point `r` pixels to one side of `p` (`way` is 1 or -1 for the side).
  - `band(from, to, r0, r1, material)`: a four-sided shape along the forearm, `r0` either side of
    `from`, widening to `r1` either side of `to`. Its ends are straight, not rounded like a
    capsule's, so the sleeve ends in a flat opening.
  - The sleeve widens from 2.9 at the elbow to 3.9 at `cuff`, and from there to the wrist is a band
    of silver trim, 3.9 to 4.2: the bell sleeve and its cuff. Her hand, a small ellipse just past
    the wrist, is drawn first, so only its tip shows below the sleeve.
  - `above`: a point just above the cuff (7.9 pixels down the forearm); a line of gold (`Y`)
    across the sleeve there, over the robe's pixels only, is embroidery edging the cuff.
  - It returns where the hand is, for a prop or a spell.
- `hipAt(side)` and `drawLeg(leg, side)`: as the comment says, dark stockings, then boots below the
  robe's hem. Thigh and shin are `LEG_LENGTH` each. Standing, they're placed with `limb()` like the
  arms. Sitting, her knees are up in front of her (8 pixels above her hips) and her feet on the
  taskbar (`y: 92.5`), each spread by its leg's angles. `bootTop` is 38% of the way from the ankle
  to the knee: the stocking runs from the hip to the knee (3.2 tapering to 2.6) and on to there,
  then the boot's shaft (a little wider) and its foot, a plain shape from the front and pointing
  forward otherwise. Her robe covers most of this; below its hem it's mostly boot.
  - The boot's patterns, placed with `onBoot(d, r)`: `d` pixels down the shaft from `bootTop`
    (`along`) and `r` across it (`across`: at right angles to the shin from the front, and toward
    her front side on). A turned-down cuff at the top: two rows of the boot's light (`y`) over a
    row of its shade (`B`). The laces, down the front of the shaft (side on, its front edge,
    `lace`): every three rows, a little cross (two pixels, then one between them below) and a row
    of plain leather, so they read as laces rather than a checkerboard. A strap across her instep
    in the boot's shade, with a gold buckle (`Y`) on the outside of the foot.
- Then the far arm, behind her body (from the front, both arms wait until the end), and the legs,
  the far one first so the near one is in front. The legs always come before the robe, which
  covers them.

**The robe**

- The skirt: as the comment says, long and flared, swaying: a trapezoid from just above her hips
  down to the hem, 22 pixels below them, 13 pixels either side at the hem from the front. `swing`
  moves the hem with the wind. Sitting, the hem is only 11 below her hips (which are near the
  taskbar), and `flare` adds 15 pixels on each side, so the robe spreads round her. Standing,
  `flare` is the pose's `spread` (0 if it has none): her robe held out at the sides in a curtsy, or
  flung out as she twirls.
- The bodice: as the comment says, the robe's top, narrower, a polygon in the body's frame from her
  collar down to her hips. Skirt and bodice are one layer, so they're shaded and outlined as one
  garment.
- The trim along the hem: `hemLeft` and `hemRight` are the skirt's bottom corners, and the loop
  steps between them (`t` from 0 to 1 in fiftieths), setting silver (`f`) on the row just inside
  the hem, over the robe's pixels only (`'aAv'`). Then, unless she's side on, sitting or seen from
  behind, a line of trim from her waist down the front to the hem, leaning with the swing.
- The collar: as the comment says, a V of trim, the gem brooch at its point, and a darker sash.
  `off` moves these 3 pixels toward the way she faces side on. Except side on,
  two lines of trim run from either side of her neck to meet 4.5 pixels down. The brooch is a
  small plus of teal (`G`) stamped at the V's point (side on too). From behind there's neither:
  they're on her front.
- The sash: two rows right across her waist, 18 and 19 pixels below her neck: the robe's shadow
  colour (`A`) over its outline colour (`q`), only on the robe's lighter pixels (`'av'`).
- `skirtAt(y)`: where the skirt's left and right edges are at height `y` in the hips' frame,
  worked out from its corners, so the patterns below stay inside it as it flares and sways.
- `centre(y)`: where the middle of the skirt is at height `y`, swaying with `swing` (more toward
  the hem); the trim down her front runs along it.
- The folds, as the comment says: creases falling from her hips and opening out toward the hem.
  From the front there are two, 4.5 pixels either side of the middle; side on, one, 1.5 pixels
  behind it. Each runs from 2 pixels below her hips to 8 above the hem, in half-pixel steps,
  spreading out as it goes down (`fold * (1 + (y / hem) * 0.4)`) and swaying with `centre(y)`. A
  fold is a line of the robe's shade (`A`) with a line of its light (`v`) beside it on the side
  toward the light (`x - 1`), both only over the robe's base colour (`'a'`). Not while sitting,
  when the skirt is spread out flat.
- The border, as the comment says: a gold line (`k`, the gold's shade) across the skirt 7.5 pixels
  above the hem, and below it gold diamonds (`.Y.`, `YaY`, `.Y.`: a diamond of gold round a pixel
  of robe) every 6 pixels, with a gold dot between each pair, just above the hem's silver trim.
  They're centred on `centre(y)`: from the front the diamonds sit 3 pixels either side of it, so
  the trim runs between them; side on (no trim) one is in the middle. Any that would reach the
  skirt's edge are left out.
- The stars: three staggered rows of single silver pixels (`f`) over the skirt, 6 pixels apart,
  each row shifted 3 from the last, only over the robe's base colour (`'a'`) so they stay off its
  outline and shading, and kept off the trim down her front. Not while sitting, when the skirt is
  spread out flat.
- From the front, three gold buttons down the bodice below the brooch; and on the sash, a gold
  buckle (`YYY` over `YkY`), at her front (`off` moves it toward the way she faces side on). From
  behind, neither: the sash goes on round her back plain.

**Head, face, hair and ears**

- The head: her neck (a capsule), then her head, an ellipse, with a chin below it from the front
  (a polygon). Inked as skin, it gets a shaded side and a rose outline. Side on, the ellipse is only
  the back of her head: her face is `SIDE_FACE` (in `pictures.ts`), a profile drawn by hand and
  stamped over it, placed by the middle of her head. As the comment says, that ellipse is a pixel
  shorter side on (8 pixels down from a point half a pixel higher, instead of 8.5), because her
  face is: its outline under her chin would otherwise show as a second line below it.
- The face is stamped on. From the front: two eyes, moved by `look`, blush (`cc`, pink) under each,
  the mouth in the middle, and just above it a single pixel of the skin's shade (`S`), all there is
  of her nose. Side on: one eye, higher than from the front and taller (its top at `eyeY - 2`, the
  extra row of the taller eye on top), as the comment says, so her iris is level with the bridge
  of her nose and the tip of her nose at the bottom of her eye, as anime profiles have it; blush on
  her cheek, just below her eye (`head.x + 0.5`, 3.5 pixels below the middle of her head); and, as
  the comment says, a short line of mouth in from the notch of her lips: the first two pixels of
  each row of the expression's mouth (`r.slice(0, 2)`), 4.5 pixels in front of the middle of her
  head and 4.5 below it, a row under the tip of her nose. From behind, as the comment says, there's
  no face: nothing is stamped, and her hair (next) covers the back of her head.
- The hair in front, as one layer. The fringe is a polygon whose lower edge zigzags
  (`[7.5, -3.6], [6.5, -0.4], [4.5, -3.4], ...`), so it falls over her forehead in clumps. Side on,
  as its comment says, its front curves out past her forehead (8 pixels in front of the middle of
  her head) to 9.5, so it stands off her face rather than lying on it, its tip hanging a pixel in
  front of her brow (`[7, -9.8], [9, -6.5], [9.5, -3.5], [9.2, -1.5]`): anime profiles draw the
  fringe in curved clumps that stand proud of the forehead. Then its jagged lower edge sits higher,
  clear of her eye, its tips over her eye stopping above her lashes (`[7.6, -3.2], [6.5, -4],
[5.5, -2.6], ...`), and a `crown` covers the back of
  her head too. As its comment says, the crown's back edge is in line with the back hair behind it
  (`[-8.1, -3], [-9.1, 2.5], [-10, 7]`, along the back hair's straight back edge), so they read
  as one, and its front edge runs behind her ear, so her cheek (from `SIDE_FACE`) shows. The
  side locks (`lock(x, length)`) are chains from her temples down past her chin, 13 pixels long,
  tapering from 1.9 to 0.6 so they end in points, two of them, 8.2 pixels either side of the middle
  of her head. They're only drawn from the front: as the comment says, side on there's no lock,
  since her hair behind her ear is the back hair, nor from behind, where it's all one fall of hair.
- From behind, as its comment says, the hair in front isn't a fringe but all of her hair, from the
  crown of her head down over her back: the `fall` polygon, as wide as her shoulders (9.5 pixels
  either side of the middle of her head at the top, 8.6 near the ends), and a little longer than it
  shows from the front (its points 27 to 32 pixels below the middle of her head), its ends in
  points of different lengths, the middle one longest. It goes through `supple()` and `blown()`
  like the back hair, so it sways in the wind. Drawn in the hair layer, after her body and robe,
  it covers her back from her neck to below her waist, as long hair does.
- Inking the hair in front: from the front, `ink(hair)`, as usual. Side on, `inkOverHair(hair)`,
  because the crown lies over the back hair: where its edge crosses the back hair the line is soft,
  in the hair's shade, so the back of her head and the hair down her back read as one.
- The strands and the sheen, from behind only. Inked, the fall of hair would be one flat shape, so,
  as the comment says, strands run down her back from under her hat to the gaps between the points
  of its ends, so it reads as long hair:
  - There are five, each from a `top` (across her head, just under the hat) to an `end` (a gap
    between two points), stepped down in half pixels from 1 to 28 pixels below the middle of her
    head. `Math.sin(t * Math.PI) * 0.5 * Math.sign(top)` bows each a little outward in the middle,
    as hair curves over the back of a head and shoulders. Each point is `blown()`, so the strands
    sway with the hair.
  - Each strand is a line of shade where the hair is lit (`h` or `l` becomes `D`) and of light where
    it's in shade (`D` becomes `h`), so it shows on both sides of her hair's broad shadow. `done`
    remembers every pixel already changed (`row * GRID + x` numbers each pixel once), so two strands
    crossing the same pixel don't turn it back.
  - The sheen, as its comment says: a band of light across the back of her head, just under the
    brim of her hat, a little curved (`Math.abs(dx + 1) * 0.15`): a row of the hair's shine (`L`)
    over its base and light, and a row of its light (`l`) under the middle of it. With the band of
    shine across the crown that follows (drawn either way), it gives the back of her head its
    roundness.
- The tuft, side on only: as the comment says, under her ear, a tuft of hair over the back of her
  jaw, jagged along the bottom and curling forward to a point. It's a polygon in a `tuft` layer of
  its own, in the head's frame and blown like the rest of her hair: from just behind her ear
  (`[-2.8, -0.5]`) down and forward to its point (`[0.7, 7.3]`, over the back of her jaw), back
  along its jagged bottom edge (`[-1.6, 6.5], [-2.9, 8.2], [-4.2, 6.8], [-5.8, 7.4]`) and up again.
  As the comment says, being a shape of its own, it's lit and shaded as a lock of its own, with its
  own light edge and band of shade, rather than as part of the crown. It's inked with
  `inkOverHair()` too, so over the crown and the back hair its edge is a soft line, while against
  her face it keeps its outline. It's drawn before the ears, so her ear lies over its top.
- The shine: as the comment says, a band across her crown: one curved row of the hair's shine
  (`L`), set only over hair pixels (`'hl'`) so it never spills onto the outline. A band like this
  is how anime art shows glossy hair.
- The ears: as the comment says, her long elf ears, through her hair. They're their own `ears`
  layer, drawn after the hair so they show in front of it. Each is a narrow four-sided shape from
  beside her head out and up to a point (`[13.5, -6.8]`: about 13 pixels out and 7 up from the
  middle of her head), and `p.x * side` mirrors it for the other side. Both show from the front;
  side on, one pointing back. They're inked as skin.

**The hat**

- As the comment says, a wide brim and a tall crooked crown with a silver band, in its own `hat`
  layer, drawn after her head and hair so it sits on top. The brim is a flat ellipse 14 pixels
  either side (12.5 side on), 9 pixels above the middle of her head. The crown is a polygon rising
  from the brim to a tip 22 pixels above the middle of her head, which flops over to one side
  (to her right from the front): that's what makes it crooked. As the crown's comment says, side
  on the whole crown is mirrored (`p.x * tipLean`, with `tipLean` -1 side on), so the tip flops
  back over the crown's back edge and its front edge runs straight up to the bend. As the comment
  says, from behind the crown is mirrored too: its tip flops to her right, which seen from behind
  is the other side of the picture. (Mirroring only
  the tip's points, as it once did, left the crown's outline crossing itself where the tip bends
  back: a notch in its front edge and a row only a pixel wide, which looked like a strand.)
  `hatCentre` shifts it a little side on, and `lift * 0.15` raises it a touch when she's carried
  or falling.
- The band: two rows across the crown just above the brim, silver (`f`) over its shade (`F`),
  only on the hat's own pixels (`'ngN'`).
- The stitching: silver dots (`F`) every 2 pixels along the middle of the brim, either side of the
  crown.
- The buckle: a square of gold with a teal gem in it (`YYY`, `YGY`, `YYY`) on the band, at the
  front (side on, 3 pixels toward the way she faces). As the comment says, this and the moon and
  stars below are on the hat's front, so from behind there are none.
- The moon and stars: a gold crescent moon (four pixels, curved like a C) and a few stars, one in
  gold and two in its shade, on the crown. `lifted(x, y)` places them with the crown: mirrored
  with `tipLean` side on, where the tip flops back, and raised with the hat by `lift`.

**The near arm, props and sparkles**

- As the comment says, the near arm is drawn last, in front of her (seen diagonally, on top of
  her picture); from the front, both arms are drawn here, in front of the robe. `hand` is where it
  ends. `farHand`, as its comment says, is where the far hand ends too, from the front, where she
  can use both hands, to juggle; seen any other way the far arm was drawn earlier, behind her, and
  `farHand` stays `null`.
- `if (pose.prop)`: a crystal ball, a teacup (a small cup narrowing toward its base, with a
  handle) or her spellbook, held open (a wide shape, 11 pixels across, in the hat's deep colours),
  placed on her hand and inked. As the comment says, the crystal ball is held in both hands: from
  the front, it's in the middle in front of her (across at her hips, 4.5 pixels above her near
  hand, which the pose brings in front of her waist with the other); otherwise on her near hand.
  `orbAt` keeps where it is, and it's a circle reaching 4.2 pixels either side, in the `orb`
  material. Then, for the book, its pages are filled in pale silver (`f`) either side of a
  middle line in the trim's shade (`F`), the spine, only over the cover's pixels for the pages, so
  the cover still shows round them. For the cup, two white pixels above it are a wisp of steam.
  Two skin pixels (`ss`) stamped over the prop are her fingers round it. For the crystal ball,
  as the comment says, a wisp of light turns inside it instead: two pixels of silver (`f`) on
  opposite sides of a small ellipse round its middle, turning a whole turn as `spin` goes from 0
  to 1, and a white glint (`w`) at its upper left, all only over its teal. Her fingers under it
  are two pairs of skin pixels with a gap between (`ss.ss`), at its bottom edge.
- The butterfly, when `pose.butterfly` is between 0.06 and 0.92: as the comment says, it flutters
  down to just above her raised hand (`perch`, 3 pixels above it), rests there opening and
  shutting its wings, then flies off up and away, out of the frame. `between(from, to, t)` is the
  point `t` of the way from one to the other.
  - Until 0.3, it comes down from 16 pixels to the side of her hand and 24 above, eased
    (`t * t * (3 - 2 * t)`, slow at either end), weaving a little from side to side (the `sin`)
    less and less as it arrives, flapping every frame or so.
  - From 0.3 to 0.72, it rests on the perch, opening and shutting its wings, each held for 0.07
    of the visit.
  - After that, it flies off toward 22 pixels to the side and 36 up, slowly at first then faster
    (`** 1.4`), flapping again.
  - `BUTTERFLY_OPEN` or `BUTTERFLY_SHUT` is stamped centred on where it is.
- The z's, when `pose.zzz` is above 0: as the comment says, they float up from above her hat, one
  after another, growing as they rise. There are three. `life` is how far along one is, from 0 as
  it appears to 1 as it goes: `zzz * 1.6 - k * 0.3`, so each runs 1.6 times as fast as `zzz` and
  starts a little after the one before. Placed in the head's frame (`onHead`), each starts 7 pixels
  toward the way she faces and 13 above the middle of her head, the later ones a little further
  over, and rises 12 pixels, drifting 6 further over. It starts as a `Z_SMALL` and becomes a
  `Z_BIG` once it's nearly halfway. `pose.flipText` stamps it back to front (`stamp()`'s `flip`)
  in frames that will be mirrored to face left, so it reads as a Z either way.
- The juggling, when `pose.juggle` is between 0 and 1 and there's a far hand (so only from the
  front): as the comment says, three orbs a third of the way round apart, each thrown up in a high
  arc from her far hand to her near one and passed quickly back underneath (a "shower"), just
  above her hands. `left` is the far hand, on the left of the picture.
  - `round`: how far round its loop each orb is, from 0 to 1. `juggle * JUGGLE.rounds` goes round
    4 times over the juggling, and `k / ORBS.length` puts each orb a third of the way round from
    the one before. `% 1` keeps just the part past the last whole round.
  - `high`: the first 62% of the loop (`JUGGLE.arc`) is the high arc, the rest the pass back. `t`
    is how far along that arc or pass it is, from 0 to 1.
  - `[from, to]`: the high arc goes from the far hand to the near one, the pass back the other way.
  - `up`: how far above the line between her hands it is. `4 * t * (1 - t)` is 0 at each hand and
    1 halfway, a parabola, the path anything thrown takes; it's times 28 pixels on the high arc and
    5 on the pass back.
  - `at`: the point `t` of the way from one hand to the other, 3 pixels above them and `up` higher.
    Each orb is stamped centred on it (`- 1`, its picture being three pixels across).
- The bubbles, when `pose.bubbles` is above 0: as the comment says, the wand ring held up at her
  near hand, and bubbles drifting up and forward from in front of her mouth, wobbling and growing,
  each popping in a twinkle. They're placed for the diagonal view, the one the habit uses.
  - Until `BUBBLES.wandAway`, the wand: one pixel of the trim's shade (`F`) just above her hand,
    its handle, and `WAND_RING` above that.
  - `from`: where the bubbles start: 6 pixels in front of her mouth in the diagonal picture
    (`DIAGONAL_MOUTH`) and 2 above it, moved with her by the pose's `y` (`dy`, rounded, as the
    picture is).
  - `life`: how far bubble `k` is through its float. It starts at `first + k * gap` and lasts
    `BUBBLES.life`. Before it starts (`life <= 0`), and once it has popped and twinkled
    (`life > 1.12`), it isn't drawn.
  - `at`: it drifts 15 pixels forward and 21 up over its life, wobbling a pixel and a half to and
    fro (`Math.sin(life * 9 + k * 2) * 1.5`; the `k * 2` keeps the bubbles' wobbles out of step).
  - It's a `BUBBLE_SMALL` for the first 30% of its life, then a `BUBBLE_BIG`, and just past the
    end of its life a `TWINKLE`: the pop.
- The will-o'-wisp, when `pose.wisp` is above 0: as the comment says, going round her with a
  fading tail; on the far side of her it's behind her, drawn only where nothing of her is.
  - `chest`: 2 pixels below her neck, in the body's frame: the middle of her chest, which
    `wispAt()` measures from.
  - `trail`: where it was a moment ago, twice (`wispAt(wisp - 0.012)` and `wispAt(wisp - 0.006)`),
    a pixel each: the older in the trim's silver (`f`), the newer in teal (`G`), a two-pixel tail
    fading behind it. A point from before it came (`null`) is skipped.
  - `p.behind ? '.' : undefined`: behind her, a pixel is only set where nothing is yet (`set()`'s
    `only`), so her body hides it; in front of her, it's drawn over her.
  - The wisp itself: each pixel of `WISP` that isn't see-through, centred on its place (`- 1.5`,
    the picture being four pixels across), set the same way, so behind her only the part beside her
    shows.
- Her sparkle trail, when there's a `pose.trail` (walking): as the comment says, little sparkles
  on the ground behind her heel, left behind as she walks and fading as they drift back.
  - For each of the stride's `TRAIL.perStride` sparkles, `age`: how long ago it was dropped, in
    strides. Sparkle `k` is dropped at `k / perStride` of the way through the stride; the two
    `% 1`s (the second after adding 1) keep the age between 0 and 1 even when the stride has gone
    round past it, so the trail joins up from the last frame back to the first. One older than
    `TRAIL.life` is gone.
  - `at`: on the ground just behind her heel (5 pixels behind her hips, at row 93, above her
    shadow), then `age * TRAIL.drift` further back (see `TRAIL`), and a little higher as it fades.
    Every other one is 2 pixels further back and a row higher, so they don't fall in a line.
  - Its look by age: at first a twinkle (`TWINKLE`, or a gold one for every other sparkle), then a
    single glint (white, `w`, or gold, `Y`), then a fainter one (silver, `f`, or dark gold, `k`).
  - Every pixel is set only over `'.x'`: empty ground or her shadow. So a sparkle never covers her
    boots or robe, wherever her feet are in the stride.
- The sneeze's sparkles, when `pose.burst` is between 0 and 1: as the comment says, flying out
  from her nose in a wide fan above it, out past her face and hair, big at first, then twinkles,
  then single glints, and gone.
  - `nose`: half a pixel right of the middle of her head and 5 pixels below it, in the head's frame
    (the habit is seen from the front, where that's her nose).
  - Seven sparkles, each at its own `angle`. `-Math.PI * (-0.1 + k * 0.2)` goes from a little below
    level on one side (`k = 0`), through straight up (`k = 3`), to a little below level on the
    other (`k = 6`), 36° apart: a fan above her nose.
  - `reach = 6 + burst * 22`: they start 6 pixels from her nose and fly out to 28.
  - `at`: the point `reach` out along its angle, but only half as far up and down
    (`reach * 0.5`), so the fan is wide rather than tall, and rising 4 pixels more as it goes
    (`- burst * 4`).
  - Until halfway, every other one is a big `SPARKLE` and the rest `TWINKLE`s; until 80% they're
    all `TWINKLE`s; after that each is a single white pixel (`w`), a last glint.
- The sparkles: as the comment says, a little spell, sparkles round her raised hand, when
  `pose.sparkle` is above 0. `spin` turns it into an angle, a whole turn from 0 to 1. The
  `SPARKLE` goes round an ellipse 6 pixels either side and 4 up and down, centred a little above
  her hand (`Math.cos(spin) * 6`, `Math.sin(spin) * 4`), and the two `TWINKLE`s go round on
  slightly different paths a third and two-thirds of a turn behind (`spin + 2.1`, `spin + 4.2`;
  a whole turn is about 6.28). The `- 2` and `- 1` centre each stamp on its point. As `sparkle`
  goes from 0 to 1 over the spell's frames, they circle her hand once.
- `castShadows(canvas)`: whichever way she's seen, the shadows things cast on what's below them
  (below).
- Dissolving, when `pose.fade` is above 0, as she vanishes or appears: as the comment says, her
  pixels go one by one (`dissolveAt`), each turning white just before, so a white shimmer runs over
  her as she goes, and each one that has a mote leaves it as a white speck that rises, sways and
  fades to silver, drawn only where nothing of her is left. It comes after everything else, her
  shadow included, so all of her goes. Played backwards (`fade` going down, in `appear()`), the
  motes come down into place and she forms out of them.
  - `const her = canvas.rows()`: a copy of the finished frame, so the two passes below see her as
    she was, not as the first pass leaves her.
  - `each(visit)`: calls `visit` for every pixel of hers that isn't see-through, with how long ago
    it went: `fade - dissolveAt(x, y)`, negative while it's still to go. `y = r - canvas.top` turns
    a row of `rows()` (headroom first) back into the canvas's `y`.
  - The first pass: a pixel whose moment has come (`gone >= 0`) is cleared (`.`), and one due
    within `FADE.glow` turns white (`w`) first.
  - The second pass, the motes: only pixels that have gone, less than `FADE.life` ago, and are
    among the `FADE.share` that their second random number (`hash(x, y, 1)`) picks, make one. Each
    rises as it fades, `FADE.rise` pixels over its `FADE.life` (`gone / FADE.life` of the way),
    and sways sideways, more the higher it gets
    (`Math.sin(x * 1.3 + y * 0.7) * gone * 10`, each mote its own way). It's white for the first
    half of its life and silver (`f`, the trim's colour) for the second, then gone.
    `set(mote, ..., '.')` draws it only on an empty pixel, so a mote never covers what's left of
    her.
- `return canvas.rows()`: the finished frame.

### `castShadows()`, `HAT`, `HAIR` and `ROBE`

<!-- code: apps/desktop/src/renderer/src/character/rig.ts#HAT,HAIR,ROBE,castShadows -->

[`src/renderer/src/character/rig.ts`, lines 2058–2090](../../apps/desktop/src/renderer/src/character/rig.ts#L2058-L2090)

```ts
/** Letters by part, for castShadows. */
const HAT = 'nNgqfFYkG'

const HAIR = 'ODhlL'

const ROBE = 'aAvfFYkG'

/**
 * The shadows things cast on what's just below them, which is most of what makes her look solid
 * rather than flat: her hat's brim darkens the hair under it, her fringe her forehead (and her
 * hair the tops of her ears), the sash and her sleeves the robe below them, and the robe's hem
 * her stockings and boots. Each is a pixel deep, in the shade of what it falls on. It reads the
 * frame as it was before any of them, so shadows don't pile up, and works on whatever is there,
 * so the hand-drawn diagonal picture gets them too.
 */
function castShadows(canvas: Canvas): void {
  const rows = canvas.rows()
  for (let row = 1; row < rows.length; row++) {
    // Rows from the top of the frame, its headroom first; y is the canvas's own.
    const y = row - canvas.top
    for (let x = 0; x < rows[row]!.length; x++) {
      const here = rows[row]![x]!
      const above = rows[row - 1]![x]!
      const twoAbove = row > 1 ? rows[row - 2]![x]! : '.'
      let shade: string | null = null
      if ('hlL'.includes(here) && HAT.includes(above)) shade = 'D'
      else if ('sz'.includes(here) && HAIR.includes(above)) shade = 'S'
      // A seam inside the robe (the sash, a sleeve's edge): an outline with robe above it too.
      else if ('av'.includes(here) && above === 'q' && ROBE.includes(twoAbove)) shade = 'A'
      else if (here === 'o' && above === 'q') shade = 'Q'
      else if ('by'.includes(here) && above === 'q') shade = 'B'
      if (shade) canvas.set(x, y, shade)
    }
  }
}
```

<!-- /code -->

As the comment says, the shadows things cast on what's just below them, which is most of what makes
her look solid rather than flat. `ink()` shades each part by its own shape only; it can't know
that her hat's brim hangs over her hair. This runs once the whole frame is drawn and looks at
each pixel and the ones just above it.

- `HAT`, `HAIR`, `ROBE`: as the comment above them says, letters by part: the palette letters each
  part is drawn in, outlines and patterns included. The hat's colours, its outline (`q`), silver,
  gold and the teal gem; the hair's outline, shade, base, light and shine; and the robe's colours
  with its silver trim, gold and the teal brooch.
- `const rows = canvas.rows()`: a copy of the frame as it was before any shadows. As the comment
  says, the checks read this copy while the shadows go onto the canvas, so each pixel is judged by
  the frame as it was drawn, never by a shadow just added, and shadows don't pile up.
- `row`: the loops walk the copy by its rows, counted from the top of the frame, the headroom rows
  first, starting at the second (`row = 1`), which is the first with a row above it.
- `const y = row - canvas.top`: as the comment says, the same row as the canvas's own `y`, which
  starts at `-top` above her grid. `canvas.set(x, y, shade)` needs that `y`, while the copy is read
  by `row`.
- `here`, `above`, `twoAbove`: the pixel, the one above it, and the one above that (`.`,
  see-through, on the second row, where there's no row two above).
- Each `if` is one kind of shadow, a pixel deep, in the shade of what it falls on:
  - her hair's base, light or shine (`'hlL'`) under any of the hat's letters: her hat's brim
    darkens the hair under it, in the hair's shade (`D`);
  - her skin's base or light (`'sz'`) under hair: her fringe on her forehead, and her hair on the
    tops of her ears, in the skin's shade (`S`);
  - the robe's base or light (`'av'`) under its outline (`q`) with more robe above that: as the
    comment says, a seam inside the robe (the sash, a sleeve's edge), so the robe just below it
    gets the robe's shade (`A`). Needing robe two pixels up keeps the robe's own top edge from
    counting;
  - her stockings (`o`) under the robe's outline: the robe's hem, in the stockings' shade (`Q`);
  - her boots' base or light (`'by'`) under it: the hem again, in the boots' shade (`B`).
- As the comment says, it works on whatever is there, so the hand-drawn diagonal picture gets these
  shadows too.

## `src/renderer/src/character/pictures.ts`: the parts drawn by hand

Some of her doesn't come out well built from shapes, so it's drawn by hand, pixel by pixel, as
rows of palette letters (`PALETTE` in `sprite.ts`; `.` is see-through), facing right like the rig.

### `Picture`, `DIAGONAL_EYES`, `DIAGONAL_MOUTH` and `SIDE_FACE`

<!-- code: apps/desktop/src/renderer/src/character/pictures.ts#Picture,DIAGONAL_EYES,DIAGONAL_MOUTH,SIDE_FACE -->

[`src/renderer/src/character/pictures.ts`, lines 1–151](../../apps/desktop/src/renderer/src/character/pictures.ts#L1-L151)

```ts
// Hand-drawn pictures of the character, as rows of palette letters (see PALETTE in sprite.ts;
// `.` is see-through), placed on the 96-pixel grid at (x, y).

/** A picture and where its top-left pixel goes on the grid. */
export interface Picture {
  x: number
  y: number
  rows: readonly string[]
}

/** Where the eyes are in DIAGONAL (grid pixels): near eye 5 × 5, far eye 4 × 5. */
export const DIAGONAL_EYES = { near: { x: 44, y: 27 }, far: { x: 51, y: 27 } }

/** Where the mouth is in DIAGONAL: two pixels wide, below the far eye. */
export const DIAGONAL_MOUTH = { x: 50, y: 33 }

/**
 * Her face side on, facing right, drawn by hand in the usual anime profile: a forehead under her
 * fringe, a small nose a pixel out, a little notch at her lips, a soft round chin, then
 * her jaw running back up to her ear, her neck in its shadow below it. It is placed relative to the
 * middle of her head (x and y here are offsets from it); her hair, ear and hat are drawn over it,
 * and her eyes, blush and mouth on it.
 */
export const SIDE_FACE: Picture = {
  x: -5,
  y: -3,
  rows: [
    '...ssssssssssK..',
    '...ssssssssssK..',
    '...ssssssssssK..',
    '...ssssssssssK..',
    '...ssssssssssK..',
    '...sssssssssssK.',
    '.KssssssssssssK.',
    'SKssssssssssSK..',
    'SSKssssssssssK..',
    'SSSKssssssssK...',
    'SSSSKKsssssSK...',
    'SSSSSSKKKKK.....',
  ],
}
```

<!-- /code -->

- `Picture`: a picture and where its top-left pixel goes.
- `DIAGONAL` (not shown here, as it's 92 rows of pixels; it's
  [in the file](../../apps/desktop/src/renderer/src/character/pictures.ts)): her whole body seen
  diagonally, standing, one flat drawing with no layers, so her hat, ears, hair, face, robe and
  boots each sit exactly in front of or behind the others. Turned to face right, her right side is
  toward us: her ear and the back of her head on the left, her near eye larger, her far cheek (with
  a small upturned nose) the right-hand edge of her face, her long hair down her back and her near
  leg in front. Her near arm isn't in it, because it moves; `draw()` adds
  it. It was made by drawing the rig's diagonal pose once, then retouching it by hand, and has
  since been retouched again to match the rig's newer shading: a broad shadow down the far side of
  her hat, hair, robe and boots (as `form` gives the rig's shapes) and a fold down her skirt (a
  line of the robe's light beside a line of its shade). `ink()` never touches it, since it's
  stamped as it is, but `castShadows()` still runs over it.
- `DIAGONAL_EYES` and `DIAGONAL_MOUTH`: where her eyes and mouth are in `DIAGONAL`, so `draw()`
  can paint over them with another expression.
- `SIDE_FACE`: her face side on, in the usual anime profile, as the comment says, read from the
  top: her forehead under her fringe (`K`, the outline, at the right-hand end of each row); a small
  nose a pixel out (the outline steps out one pixel for two rows, with a pixel of shade, `S`,
  beside the nostril below it); a little notch at her lips; a soft round chin, only five rows below
  the tip of her nose, so her face isn't long; then her jaw
  curving back up to her ear (the outline climbing back to the picture's left edge, steeply at
  the end, which makes her cheek and chin round), with her neck in
  its shadow below it (the block of `S` in the bottom-left corner). Its `x` and `y` are offsets
  from the middle of her head rather than grid positions, since her head moves: it starts 5 pixels
  behind the middle of her head and 3 above it, far enough back for the jaw to reach her ear. Her
  hair, ear and hat are drawn over it, and her eyes, blush and mouth on it. Its top rows start
  with three see-through pixels (`...`), leaving the back of her head, already drawn, as it is.
  The face itself is kept light (mostly the base skin, `s`), since a face in profile in anime art
  is mostly flat colour.

## `src/renderer/src/character/sprite.ts`: her animations

Her animations: for each pose the main process can ask for (`Pose` in `src/shared/character.ts`,
imported here as `Name` to keep it apart from the rig's `Pose`), a list of frames and how long each
shows. As the comment at the top says, each animation is drawn by the rig from a few _key poses_
and the _in-betweens_ eased between them, the way an animator draws the key drawings and then
fills in the frames between. The in-betweens come about every 40 ms (`FRAME_MS`), 25 a second,
which is what makes her movements smooth. Frames are drawn the first time a pose is needed, then
kept, and `Character` (below) plays them.

### `SPRITE_SIZE` and `PALETTE`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#SPRITE_SIZE,SPRITE_HEADROOM,PALETTE -->

[`src/renderer/src/character/sprite.ts`, lines 32–94](../../apps/desktop/src/renderer/src/character/sprite.ts#L32-L94)

```ts
// The character's animations: for each pose, a list of frames drawn by the rig (rig.ts) from key
// poses and the in-betweens eased between them. She's an original design: an elf mage with long
// pointed ears, long silver-white hair, amber eyes, a wide-brimmed crooked hat and a
// long robe in the tenant's accent colour. Frames are drawn the first time a pose is needed, then
// kept.

/**
 * The grid's size in pixels: 96 wide, and 96 tall below the headroom, filling the bubble's window,
 * one pixel a DIP at her usual size (more at a bigger size; see CHARACTER_SIZES).
 */
export const SPRITE_SIZE = GRID

/** Rows above the grid, for her hat when she rises: a frame is this much taller than it's wide. */
export const SPRITE_HEADROOM = HEADROOM

/** Each letter's colour, as a CSS class (character.css): robe and hat follow the accent colour. */
export const PALETTE: Record<string, string> = {
  // Hair, silver-white: outline, shadow, base, light, shine.
  O: 'px-hair-line',
  D: 'px-hair-shade',
  h: 'px-hair',
  l: 'px-hair-light',
  L: 'px-hair-shine',
  // Skin: outline, shadow, base, light, blush.
  K: 'px-skin-line',
  S: 'px-skin-shade',
  s: 'px-skin',
  z: 'px-skin-light',
  c: 'px-blush',
  // Eyes: lashes and lids, the iris dark to light (amber), a white glint; the mouth.
  e: 'px-lash',
  i: 'px-iris-dark',
  I: 'px-iris',
  j: 'px-iris-light',
  w: 'px-white',
  m: 'px-mouth',
  // The robe: outline, shadow, base, light (all mixed from the accent colour).
  q: 'px-robe-line',
  A: 'px-robe-shade',
  a: 'px-robe',
  v: 'px-robe-light',
  // The robe's silver trim, and the gem of its brooch.
  f: 'px-trim',
  F: 'px-trim-shade',
  G: 'px-gem',
  // Leaves and stems (her flower), and their shade.
  E: 'px-leaf',
  P: 'px-leaf-shade',
  // Gold embroidery and buckles, and its shade.
  Y: 'px-gold',
  k: 'px-gold-shade',
  // Her hat (and her spellbook's cover): a deep shade of the accent colour.
  n: 'px-hat',
  N: 'px-hat-shade',
  g: 'px-hat-light',
  // Stockings and boots, with one dark outline.
  u: 'px-clothes-line',
  o: 'px-stocking',
  Q: 'px-stocking-shade',
  b: 'px-boot',
  B: 'px-boot-shade',
  y: 'px-boot-light',
  x: 'px-shadow',
}
```

<!-- /code -->

- `SPRITE_SIZE = GRID`: as its comment says, her grid, 96 pixels wide and 96 tall below the
  headroom, one pixel a DIP, as wide as the bubble's window (`BUBBLE_BOX`). That's at her usual
  size: `Character` uses it for the `<svg>`'s `viewBox`, and draws the same grid bigger when she's
  bigger.
- `SPRITE_HEADROOM = HEADROOM` (from `rig.ts`): the rows above the grid for her hat when she
  rises, so a frame is that much taller than it's wide, 96 wide and 104 tall, as her window is.
  `Character` uses both, so the drawing fills the window.
- `PALETTE`: each letter's colour, as a CSS class in `character.css` rather than a colour itself.
  That's what lets her robe and hat follow the tenant's accent colour, which `useAccentColor()`
  sets at runtime, as the comment says.
  The comments group the letters by material, each a ramp of outline, shadow, base and light
  (`RAMPS` in `rig.ts` says which letters each material uses), plus the details: blush (`c`), the
  eyes' lashes and lids (`e`), three shades of amber iris (`i`, `I`, `j`), a white glint (`w`),
  the mouth (`m`), the silver trim (`f`, `F`), the brooch's gem (`G`), gold embroidery and
  buckles (`Y`, and `k` for its shade) and her shadow (`x`). Some letters do double duty: her
  spellbook's cover is in the hat's letters, the teacup in the trim's, the sparkles are made of
  the iris's gold, the hair's light and the glint's white, the magic circle of the gem's teal, the
  trim's silver and the glint's white, and the juggling orbs of the gem's teal, the gold and the
  blush's pink. Upper and
  lower case are different letters. A `.` (not in the palette) is see-through.

### `Frame` and `Key`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#Frame,Key -->

[`src/renderer/src/character/sprite.ts`, lines 96–109](../../apps/desktop/src/renderer/src/character/sprite.ts#L96-L109)

```ts
/**
 * A frame as rows of letters (SPRITE_SIZE wide, SPRITE_SIZE + SPRITE_HEADROOM tall, the headroom
 * rows first), and how long it shows.
 */
export interface Frame {
  rows: string[]
  ms: number
}

/** A key pose and how long it shows. */
interface Key {
  pose: Pose
  ms: number
}
```

<!-- /code -->

- `Frame`: as its comment says, a finished frame, `SPRITE_SIZE + SPRITE_HEADROOM` rows (104) of
  `SPRITE_SIZE` letters (96), the headroom rows first, and how long it shows (`ms`). Standing,
  nothing of her reaches into the headroom; it's there for her hat when she's off the ground.
- `Key`: the same with the rig's pose in place of the drawing. The animations below are written as
  lists of these, and `drawn()` turns them into frames.

### `smooth`, `lerp`, `mixArm`, `mixLeg`, `ARM_DOWN`, `LEG_STAND` and `mix()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#smooth,lerp,mixArm,mixLeg,ARM_DOWN,LEG_STAND,mix -->

[`src/renderer/src/character/sprite.ts`, lines 111–152](../../apps/desktop/src/renderer/src/character/sprite.ts#L111-L152)

```ts
// ------------------------------------------------------------------------------------- tweening

/** Slow in, slow out. */
const smooth = (t: number) => t * t * (3 - 2 * t)

const lerp = (a = 0, b = 0, t: number) => a + (b - a) * t

const mixArm = (a: Arm, b: Arm, t: number): Arm => ({
  shoulder: lerp(a.shoulder, b.shoulder, t),
  elbow: lerp(a.elbow, b.elbow, t),
})

const mixLeg = (a: Leg, b: Leg, t: number): Leg => ({
  hip: lerp(a.hip, b.hip, t),
  knee: lerp(a.knee, b.knee, t),
})

const ARM_DOWN: Arm = { shoulder: 0.08, elbow: 0.04 }

const LEG_STAND: Leg = { hip: 0, knee: 0 }

/** Part of the way from pose `a` to pose `b`: numbers in between, the rest from the nearer one. */
function mix(a: Pose, b: Pose, t: number): Pose {
  const [an = ARM_DOWN, af = ARM_DOWN] = a.arms ?? []
  const [bn = ARM_DOWN, bf = ARM_DOWN] = b.arms ?? []
  const [ln = LEG_STAND, lf = LEG_STAND] = a.legs ?? []
  const [mn = LEG_STAND, mf = LEG_STAND] = b.legs ?? []
  const near = t < 0.5 ? a : b
  return {
    ...near,
    view: a.view,
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    lean: lerp(a.lean, b.lean, t),
    tilt: lerp(a.tilt, b.tilt, t),
    look: lerp(a.look, b.look, t),
    wind: lerp(a.wind, b.wind, t),
    lift: lerp(a.lift, b.lift, t),
    rune: lerp(a.rune, b.rune, t),
    spin: lerp(a.spin, b.spin, t),
    spread: lerp(a.spread, b.spread, t),
    burst: lerp(a.burst, b.burst, t),
    arms: [mixArm(an, bn, t), mixArm(af, bf, t)],
    legs: [mixLeg(ln, mn, t), mixLeg(lf, mf, t)],
  }
}
```

<!-- /code -->

_Tweening_: working out the poses between two key poses.

- `smooth(t)`: as the comment says, slow in, slow out. Given how far through a move it is (`t`,
  from 0 to 1), it gives how far the pose should have got: `t * t * (3 - 2 * t)` (the _smoothstep_
  curve) starts and ends gently and is fastest in the middle. Animators call this easing in and
  out: real movements speed up and slow down rather than starting and stopping dead.
- `lerp(a, b, t)`: _linear interpolation_, the number `t` of the way from `a` to `b`. Both default
  to 0, so a value a pose leaves out counts as 0.
- `mixArm` and `mixLeg`: an arm or a leg part of the way between two, each angle mixed.
- `ARM_DOWN` and `LEG_STAND`: the arm and leg to mix with when a pose doesn't give them.
- `mix(a, b, t)`: as the comment says, part of the way from pose `a` to pose `b`. The numbers are
  mixed: where she is, how she leans and tilts, where she looks, the wind and lift, the magic
  circle (`rune`, `spin`, which also turns the crystal ball's wisp), how far her robe is spread
  (`spread`), how far a sneeze's sparkles have flown (`burst`, so `sneeze()` can be a few key
  poses), and her arms and legs. The rest (her face, a prop, sparkles, sitting, a butterfly, z's,
  and the juggling, bubbles and will-o'-wisp, whose animations give them in every frame) comes from
  whichever pose is nearer
  (`t < 0.5 ? a : b`), since a face can't be half way between two. The view always comes from `a`,
  so the view never changes in the middle of a move. `...near` copies the nearer pose's fields
  first, and the mixed ones replace them.
- `const [an = ARM_DOWN, af = ARM_DOWN] = a.arms ?? []`: destructuring with default values: the
  near and far arms, or `ARM_DOWN` for any that's missing.

### `FRAME_MS`, `tween()`, `hold` and `crouch()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#FRAME_MS,tween,hold,crouch -->

[`src/renderer/src/character/sprite.ts`, lines 154–180](../../apps/desktop/src/renderer/src/character/sprite.ts#L154-L180)

```ts
/** In-betweens come about this often (ms): 25 frames a second. */
const FRAME_MS = 40

/**
 * Frames easing from `a` to `b` (ending on `b`) over `ms`: one every FRAME_MS or so, their times
 * adding up to exactly `ms`.
 */
function tween(a: Pose, b: Pose, ms: number): Key[] {
  const steps = Math.max(1, Math.round(ms / FRAME_MS))
  return Array.from({ length: steps }, (_, i) => ({
    pose: mix(a, b, smooth((i + 1) / steps)),
    ms: Math.round(((i + 1) * ms) / steps) - Math.round((i * ms) / steps),
  }))
}

const hold = (pose: Pose, ms: number): Key[] => [{ pose, ms }]

/**
 * Legs bent so her feet stay on the ground with her hips `depth` pixels lower: the thigh and shin
 * at equal and opposite angles (outward from the front, forward side on).
 */
function crouch(depth: number): [Leg, Leg] {
  const legs = LEG_LENGTH * 2
  const angle = Math.acos(Math.min(1, (legs - depth) / legs))
  const leg = { hip: angle, knee: angle * 2 }
  return [leg, leg]
}
```

<!-- /code -->

- `FRAME_MS`: as its comment says, in-betweens come about this often, every 40 ms, 25 frames a
  second. That's smooth to the eye without drawing (and keeping) more frames than it needs.
- `tween(a, b, ms)`: as the comment says, frames easing from `a` to `b` over `ms`, one about every
  `FRAME_MS`, their times adding up to exactly `ms`. Giving the time a move takes, rather than a
  number of frames, keeps the animations below easy to read and to time.
  - `steps`: how many frames fit, `ms / FRAME_MS` rounded, and at least 1.
  - Each frame's `ms` is where it ends less where the frame before it ended, each rounded to a
    whole millisecond: `Math.round(((i + 1) * ms) / steps) - Math.round((i * ms) / steps)`.
    Rounding the running total, rather than each frame's own share, means the rounding never adds
    up: 110 ms in three steps is 37, 36 and 37, exactly 110. That matters, because a fidget's
    frames must add up to exactly its `FIDGET_MS`.
  - It ends exactly on `b` (`(i + 1) / steps` is 1 for the last frame) but doesn't repeat `a`,
    which is usually the frame before. `smooth()` bunches the frames up near both ends, so the
    move eases in and out. `Array.from({ length: steps }, (_, i) => ...)` makes a list of `steps`
    items from their positions (`_` is the unused first argument).
- `hold(pose, ms)`: one key pose, held for a time.
- `crouch(depth)`: as the comment says, legs bent so her feet stay on the ground with her hips
  `depth` pixels lower. `legs` is the thigh and shin together, two `LEG_LENGTH`s (33 pixels). With
  the thigh swung forward by an angle and the shin back by the same angle, her hips are
  `legs` × cos(angle) above her feet, and her feet stay under her hips.
  `Math.acos((legs - depth) / legs)` is the angle that makes that `legs - depth`, and
  `knee: angle * 2` bends the shin back past straight by the same amount. `Math.min(1, ...)` keeps
  `acos` from being given more than 1, which has no answer.

### `FRONT`, `DIAGONAL` and `idle()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#FRONT,DIAGONAL,idle -->

[`src/renderer/src/character/sprite.ts`, lines 182–204](../../apps/desktop/src/renderer/src/character/sprite.ts#L182-L204)

```ts
// ----------------------------------------------------------------------------------- the poses

const FRONT: Pose = { view: 'front' }

const DIAGONAL: Pose = { view: 'diagonal' }

/** Standing, breathing (a pixel lower on the out-breath), her hair stirring; a blink. */
function idle(): Key[] {
  return Array.from({ length: 32 }, (_, i) => {
    const phase = (i / 32) * Math.PI * 2
    const breath = (1 - Math.cos(phase)) / 2
    const arm = { shoulder: 0.07 + breath * 0.04, elbow: 0.05 }
    return {
      pose: {
        view: 'front',
        y: Math.round(breath),
        wind: Math.sin(phase + 1) * 0.8,
        arms: [arm, arm],
        face: i === 21 || i === 22 ? 'blink' : 'neutral',
      },
      ms: 75,
    }
  })
}
```

<!-- /code -->

- `FRONT` and `DIAGONAL`: standing still, from the front and diagonally: the poses most animations
  start and end on.
- `idle()`: as the comment says, standing and breathing: 32 frames of 75 ms, one breath every 2.4
  seconds. `phase` goes once round a circle over the 32 frames, and `breath` rises smoothly from 0
  to 1 and falls back (`(1 - cos) / 2`).
  - `y: Math.round(breath)`: a pixel lower on the out-breath. Only a pixel, and only whole pixels,
    so she breathes rather than bobs, and the drawing never shimmers between pixels.
  - `arm`: her arms ease out a hair with each breath.
  - `wind: Math.sin(phase + 1) * 0.8`: her hair stirs, by less than a pixel at the tips, a little
    out of step with her breathing. With 32 frames, the stirring is smooth.
  - `face: i === 21 || i === 22 ? 'blink' : 'neutral'`: a blink, two frames (150 ms), once a cycle.

### `walk()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#walk -->

[`src/renderer/src/character/sprite.ts`, lines 206–237](../../apps/desktop/src/renderer/src/character/sprite.ts#L206-L237)

```ts
/**
 * Walking, side on, facing right: twelve frames, two steps. Each leg swings forward with its knee
 * bent, plants and pushes back; the arms swing against the legs; her body rises as her legs pass;
 * her hair trails behind her, a ripple running down it once a stride, so it flows; and she leaves a
 * trail of little sparkles on the ground behind her.
 */
function walk(): Key[] {
  return Array.from({ length: 12 }, (_, i) => {
    const phase = (i / 12) * Math.PI * 2
    const swing = Math.sin(phase)
    const forward = Math.cos(phase)
    return {
      pose: {
        view: 'side',
        y: Math.round(-1.5 * forward ** 2),
        lean: 0.07,
        wind: -2 + Math.sin(phase - 0.8) * 0.4,
        flow: phase,
        trail: i / 12,
        legs: [
          { hip: 0.45 * swing, knee: 0.12 + 0.65 * Math.max(0, forward) ** 1.5 },
          { hip: -0.45 * swing, knee: 0.12 + 0.65 * Math.max(0, -forward) ** 1.5 },
        ],
        arms: [
          { shoulder: -0.4 * swing, elbow: 0.25 + 0.2 * Math.max(0, -swing) },
          { shoulder: 0.4 * swing, elbow: 0.25 + 0.2 * Math.max(0, swing) },
        ],
      },
      ms: 55,
    }
  })
}
```

<!-- /code -->

As the comment says, walking side on, facing right: twelve frames of 55 ms, two steps (one with
each leg) in 0.66 seconds. `phase` goes once round a circle. `swing` (its sine) says how far
forward the near leg is, from -1 (back) to 1 (forward), and `forward` (its cosine) is a quarter of
a cycle ahead: positive while that leg swings forward, negative while it pushes back.

- `legs`: each hip swings 0.45 radians (about 26°) each way, the far leg opposite the near one
  (`-0.45 * swing`). A knee bends while its leg swings forward (`Math.max(0, forward)`, raised to
  the power 1.5 so it bends most mid-swing) and is nearly straight (`0.12`) while the foot is
  planted and pushing back.
- `arms`: the arms swing the opposite way to the legs (`-0.4 * swing` for the near arm, against the
  near leg's `0.45 * swing`), as people's do, each elbow bending a little more as its arm swings
  forward.
- `y: Math.round(-1.5 * forward ** 2)`: as the comment says, her body rises as her legs pass: a
  pixel up while her legs are together under her (`swing` near 0, so `forward` near 1 or -1), and
  back down as they spread.
- `lean: 0.07`: leaning a little into the walk.
- `wind: -2 + ...`: her hair and robe trailing two pixels behind her, swaying a little with each
  step.
- `flow: phase`: as the comment says, a ripple running down her hair once a stride, so it flows
  rather than swinging stiffly. `phase` goes once round (0 to 2π) over the twelve frames, so the
  ripple joins up from the last frame back to the first, as the walk does.
- `trail: i / 12`: as the comment says, the sparkle trail she leaves on the ground behind her: how
  far through the stride this frame is (see `TRAIL` in the rig for how the sparkles stay put on
  the taskbar).
- At walking speed (80 DIPs a second, `WANDER.walkSpeed` in `src/main/bubble/wander.ts`), 0.66
  seconds covers about 53 DIPs, two steps, so her feet roughly keep pace with the window moving
  under them.

### `hop()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#hop -->

[`src/renderer/src/character/sprite.ts`, lines 239–297](../../apps/desktop/src/renderer/src/character/sprite.ts#L239-L297)

```ts
/** A hop: crouch, spring up with her arms flung up, float, fall, land with a bounce. */
function hop(): Key[] {
  const up: [Arm, Arm] = [
    { shoulder: 2.4, elbow: 0.2 },
    { shoulder: 2.4, elbow: 0.2 },
  ]
  const tuck: [Leg, Leg] = [
    { hip: 0.2, knee: 0.55 },
    { hip: 0.2, knee: 0.55 },
  ]
  const low: Pose = {
    view: 'front',
    y: 3,
    legs: crouch(3),
    arms: [
      { shoulder: -0.2, elbow: 0.3 },
      { shoulder: -0.2, elbow: 0.3 },
    ],
  }
  const launch: Pose = { view: 'front', y: -3, arms: up, face: 'happy', lift: -2 }
  const rise: Pose = { view: 'front', y: -5, arms: up, legs: tuck, face: 'happy', lift: -1 }
  const apex: Pose = { view: 'front', y: -6, arms: up, legs: tuck, face: 'happy', lift: 1 }
  const float: Pose = { ...apex, lift: 2 }
  const fall: Pose = { view: 'front', y: -4, arms: up, face: 'happy', lift: 3 }
  const touch: Pose = { view: 'front', y: -1, arms: up, face: 'happy', lift: 3 }
  const land: Pose = {
    view: 'front',
    y: 3,
    legs: crouch(3),
    arms: [
      { shoulder: 0.9, elbow: 0.2 },
      { shoulder: 0.9, elbow: 0.2 },
    ],
    face: 'happy',
  }
  const recover: Pose = {
    view: 'front',
    y: 1,
    legs: crouch(1),
    arms: [
      { shoulder: 0.4, elbow: 0.1 },
      { shoulder: 0.4, elbow: 0.1 },
    ],
  }
  return [
    ...hold(FRONT, 60),
    ...tween(FRONT, low, 140),
    ...tween(low, launch, 80),
    ...tween(launch, rise, 90),
    ...tween(rise, apex, 120),
    ...tween(apex, float, 100),
    ...tween(float, fall, 80),
    ...tween(fall, touch, 70),
    ...tween(touch, land, 130),
    ...tween(land, recover, 110),
    ...tween(recover, FRONT, 140),
    ...hold(FRONT, 80),
  ]
}
```

<!-- /code -->

As the comment says, a hop: crouch, spring up, float, fall, land with a bounce. The key poses are
named, and `tween()` eases from each to the next, about 30 frames altogether.

- `low`: the crouch before the jump, her hips 3 pixels down (`crouch(3)` keeps her feet on the
  ground) and her arms swung back (`shoulder: -0.2`), ready to fling them up.
- `launch`, `rise` and `apex`: 3, 5 and 6 pixels off the ground; `float` stays at the top while
  her hair settles; then `fall` and `touch`, 4 and 1 pixels up. Only 6 pixels, because her tall hat
  only just fits: at the top of the hop its tip rises a couple of rows above her grid, into the
  headroom above it (`HEADROOM` in `rig.ts`), which is there so it isn't cut off. The moves take
  longest at the top (120 and 100 ms) and least leaving and reaching the ground (80 and 70 ms),
  which is how a jump looks: quick off the ground, a hang at the top.
- `up`: her arms flung up (`shoulder: 2.4`, about 140° from hanging), and in the air her knees
  `tuck` up. She smiles (`happy`) from take-off to landing.
- `lift`: her hair is pressed down as she rises (`-2`) and lifts as she falls (up to `3`), lagging
  behind her as real hair does.
- `land` and `recover`: a crouch to take the landing, her arms out to the sides (`0.9`), then half
  up, then standing. The times add up to 1200 ms, `FIDGET_MS.hop` (a test checks every fidget's
  total).

### `wave()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#wave -->

[`src/renderer/src/character/sprite.ts`, lines 299–319](../../apps/desktop/src/renderer/src/character/sprite.ts#L299-L319)

```ts
/** A wave, seen diagonally: her hand up, waving to and fro, head tilted, smiling. */
function wave(): Key[] {
  const hand = (elbow: number): Pose => ({
    view: 'diagonal',
    tilt: 0.08,
    face: 'happy',
    arms: [{ shoulder: 3.2, elbow }, ARM_DOWN],
  })
  // The upper arm raised out in front, the forearm upright, swinging to and fro: four waves.
  const waving: Key[] = Array.from({ length: 24 }, (_, i) => ({
    pose: hand(0.1 + 0.3 * Math.sin((i / 6) * Math.PI * 2)),
    ms: 50,
  }))
  return [
    ...hold(DIAGONAL, 100),
    ...tween(DIAGONAL, hand(0.1), 180),
    ...waving,
    ...tween(hand(0.1), DIAGONAL, 180),
    ...hold(DIAGONAL, 340),
  ]
}
```

<!-- /code -->

As the comment says, a wave, seen diagonally, smiling, with her head tilted.

- `hand(elbow)`: her near arm raised, as the comment inside says, with the upper arm out in front
  (`shoulder: 2.05`, about 117° from hanging) and the forearm upright, bent by `elbow`; her other
  arm hangs down.
- `waving`: 24 frames of 50 ms. The forearm's angle follows a sine wave,
  `0.75 + 0.3 * Math.sin((i / 6) * Math.PI * 2)`, so it swings smoothly between 0.45 and 1.05,
  once every six frames: four waves to and fro.
- Around it, `tween()` raises the arm (180 ms) and lowers it again. 2000 ms altogether,
  `FIDGET_MS.wave`.

### `stretch()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#stretch -->

[`src/renderer/src/character/sprite.ts`, lines 321–344](../../apps/desktop/src/renderer/src/character/sprite.ts#L321-L344)

```ts
/** A stretch: arms up, a yawn, a lean one way and the other, arms down. */
function stretch(): Key[] {
  const up = (lean: number, face: Pose['face']): Pose => ({
    view: 'front',
    y: -1,
    lean,
    face,
    arms: [
      { shoulder: 2.85, elbow: 0.12 },
      { shoulder: 2.85, elbow: 0.12 },
    ],
  })
  return [
    ...tween(FRONT, up(0, 'blink'), 320),
    ...hold(up(0, 'yawn'), 400),
    ...tween(up(0, 'yawn'), up(0.14, 'blink'), 300),
    ...hold(up(0.14, 'blink'), 200),
    ...tween(up(0.14, 'blink'), up(-0.14, 'blink'), 300),
    ...hold(up(-0.14, 'blink'), 200),
    ...tween(up(-0.14, 'blink'), up(0, 'neutral'), 240),
    ...tween(up(0, 'neutral'), FRONT, 320),
    ...hold(FRONT, 120),
  ]
}
```

<!-- /code -->

As the comment says, a stretch, from the front.

- `up(lean, face)`: both arms raised high (`shoulder: 2.85`, nearly straight up), standing a pixel
  taller (`y: -1`), leaning by `lean`, with a face.
- Her arms go up as her eyes close, she yawns (held 0.4 s), leans one way (`0.14`) and the other,
  holding each a moment, then straightens and brings her arms down. 2400 ms, `FIDGET_MS.stretch`.

### `sip()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#sip -->

[`src/renderer/src/character/sprite.ts`, lines 346–378](../../apps/desktop/src/renderer/src/character/sprite.ts#L346-L378)

```ts
/** A sip of tea, seen diagonally: the cup up to her mouth, a sip, down, a contented smile. */
function sip(): Key[] {
  const low = (face: Pose['face'] = 'neutral'): Pose => ({
    view: 'diagonal',
    prop: 'cup',
    face,
    arms: [
      { shoulder: 0.35, elbow: 1.75 },
      { shoulder: 0.15, elbow: 0.3 },
    ],
  })
  const drinking = (tilt: number): Pose => ({
    view: 'diagonal',
    prop: 'cup',
    face: 'sip',
    tilt,
    arms: [
      { shoulder: 0.65, elbow: 2.65 },
      { shoulder: 0.15, elbow: 0.3 },
    ],
  })
  return [
    ...hold(low(), 300),
    ...tween(low(), drinking(-0.1), 280),
    ...tween(drinking(-0.1), drinking(-0.16), 800),
    ...tween(drinking(-0.16), low('happy'), 280),
    ...hold(low('happy'), 700),
    ...hold(low('blink'), 120),
    ...hold(low(), 300),
    ...tween(low(), { ...DIAGONAL, prop: undefined }, 240),
    ...hold(DIAGONAL, 180),
  ]
}
```

<!-- /code -->

As the comment says, a sip of tea, seen diagonally.

- `low(face)`: holding the teacup in front of her (`prop: 'cup'`), her forearm bent up
  (`elbow: 1.75`), her other hand resting.
- `drinking(tilt)`: the cup raised to her lips (`elbow: 2.65`), her eyes closed (`sip`) and her
  head tipped back a little (a negative `tilt` leans it away from the way she faces). She tips it
  back a little further as she drinks, from `-0.1` to `-0.16` over 0.8 s.
- Then the cup comes down, she smiles (held 0.7 s) and blinks, and the last tween lowers her arm.
  The cup goes with it: `prop: undefined` comes from the nearer pose, so it's gone from halfway
  through. 3200 ms, `FIDGET_MS.sip`.

### `read()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#read -->

[`src/renderer/src/character/sprite.ts`, lines 380–410](../../apps/desktop/src/renderer/src/character/sprite.ts#L380-L410)

```ts
/** Reading her spellbook, seen diagonally: head down, turning a page, a smile at something. */
function read(): Key[] {
  const reading = (turn: number, face: Pose['face'] = 'down'): Pose => ({
    view: 'diagonal',
    prop: 'book',
    face,
    tilt: 0.12,
    arms: [
      { shoulder: 0.35, elbow: 1.7 },
      { shoulder: 0.45, elbow: 1.5 + turn },
    ],
  })
  // Turning a page: her far hand sweeps across and back.
  const turning = [
    ...tween(reading(0), reading(0.35), 240),
    ...tween(reading(0.35), reading(0), 240),
  ]
  return [
    ...tween({ ...DIAGONAL, prop: 'book' }, reading(0), 240),
    ...hold(reading(0), 600),
    ...turning,
    ...hold(reading(0), 500),
    ...hold(reading(0, 'happy'), 600),
    ...hold(reading(0, 'blink'), 120),
    ...hold(reading(0), 300),
    ...turning,
    ...hold(reading(0), 200),
    ...tween(reading(0), { ...DIAGONAL, prop: undefined }, 240),
    ...hold(DIAGONAL, 240),
  ]
}
```

<!-- /code -->

As the comment says, reading her spellbook, seen diagonally.

- `reading(turn, face)`: the book open in her near hand (`prop: 'book'`, `elbow: 1.7`), her head
  bowed (`tilt: 0.12`), her eyes down (`face: 'down'`), and her other forearm raised to it, moved
  by `turn`.
- `turning`: as the comment inside says, turning a page: her far hand sweeps across (`turn` up to
  0.35) and back, 240 ms each way.
- The book comes up, she reads, turns a page, reads on, smiles at something (`happy`, 0.6 s),
  blinks, turns another page, and lowers the book; like the cup in `sip()`, it's gone from halfway
  through the last tween. 4000 ms, `FIDGET_MS.read`.

### `spell()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#spell -->

[`src/renderer/src/character/sprite.ts`, lines 412–435](../../apps/desktop/src/renderer/src/character/sprite.ts#L412-L435)

```ts
/** A little spell: her hand up, sparkles circling it, then gone with a smile. */
function spell(): Key[] {
  const casting = (sparkle: number, face: Pose['face'] = 'neutral'): Pose => ({
    view: 'diagonal',
    face,
    tilt: -0.05,
    sparkle,
    arms: [
      { shoulder: 1.6, elbow: 0.6 },
      { shoulder: 0.15, elbow: 0.2 },
    ],
  })
  const circling: Key[] = Array.from({ length: 24 }, (_, i) => ({
    pose: casting(0.05 + i / 24, i > 16 ? 'happy' : 'neutral'),
    ms: 55,
  }))
  return [
    ...tween(DIAGONAL, casting(0), 240),
    ...circling,
    ...hold(casting(0, 'happy'), 400),
    ...tween(casting(0, 'happy'), DIAGONAL, 240),
    ...hold(DIAGONAL, 200),
  ]
}
```

<!-- /code -->

As the comment says, a little spell, seen diagonally.

- `casting(sparkle, face)`: her near hand raised in front of her (`shoulder: 1.6`, about level,
  with the forearm bent up a little), her head tipped back a touch to watch it (`tilt: -0.05`),
  and `sparkle` for the rig.
- `circling`: 24 frames of 55 ms with `sparkle` going from 0.05 to just over 1, so the sparkles
  circle her hand once (see `draw()`). She smiles from frame 17.
- Then `casting(0, 'happy')`: the sparkles are gone and she smiles for 0.4 s before her hand comes
  down. 2400 ms, `FIDGET_MS.spell`.

### `vision()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#vision -->

[`src/renderer/src/character/sprite.ts`, lines 437–471](../../apps/desktop/src/renderer/src/character/sprite.ts#L437-L471)

```ts
/**
 * A vision, from the front, in time with the light and the logo above her (VISION): as the light
 * appears she looks up, wide-eyed, her hands lifting a little; as the logo arrives she smiles and
 * her arms open, and she gazes up at it while it hovers, blinking once; she watches it rise away,
 * then settles and blinks.
 */
function vision(): Key[] {
  const looking = (face: Pose['face'], out: number, i = 0): Pose => {
    // A breath every second or so, so she isn't frozen while she watches.
    const breath = Math.sin((i / 25) * Math.PI * 2) * 0.03
    const arm = { shoulder: 0.1 + out * 0.35 + breath, elbow: out * 0.5 }
    return { view: 'front', face, arms: [arm, arm] }
  }
  // Frames about every FRAME_MS, their times adding up to exactly `ms` (as tween's do).
  const watching = (face: Pose['face'], out: number, ms: number): Key[] => {
    const steps = Math.round(ms / FRAME_MS)
    return Array.from({ length: steps }, (_, i) => ({
      pose: looking(face, out, i),
      ms: Math.round(((i + 1) * ms) / steps) - Math.round((i * ms) / steps),
    }))
  }
  return [
    ...hold(FRONT, 400),
    ...tween(FRONT, looking('awe', 0.4), 320),
    ...watching('awe', 0.4, 1100),
    ...tween(looking('awe', 0.4), looking('up', 0.7), 400),
    ...watching('up', 0.7, 2000),
    ...hold({ ...looking('up', 0.7), face: 'blink' }, 120),
    ...watching('up', 0.7, 2480),
    ...tween(looking('up', 0.7), looking('up', 0.3), 1200),
    ...tween(looking('up', 0.3), FRONT, 400),
    ...hold({ ...FRONT, face: 'blink' }, 120),
    ...hold(FRONT, 60),
  ]
}
```

<!-- /code -->

As the comment says, a vision, from the front, in time with the light and the logo that another
window draws above her (`VISION` in `src/shared/character.ts`, and `VisionView` in
[The pages](7-renderer-pages.md)): as the light appears she looks up, wide-eyed, her hands lifting a
little; as the logo arrives she smiles and her arms open, and she gazes up at it while it hovers,
blinking once; she watches it rise away, then settles and blinks.

- `looking(face, out, i)`: a pose for each moment: from the front, her face, and both arms alike,
  lifted out by `out` (0 to 1: the shoulder from 0.1 up to 0.45, with the elbow bent up to 0.5; from
  the front, positive angles swing outward, so they open evenly). `i` is the frame number, for the
  breath: as the comment says, a breath every second or so (25 frames of 40 ms), a slight rise and
  fall of the shoulders, so she isn't frozen while she watches.
- `watching(face, out, ms)`: as its comment says, frames about every `FRAME_MS` (40 ms), their times
  adding up to exactly `ms`, as `tween()`'s do: each frame lasts the difference between two rounded
  running totals, so the rounding never adds up to more or less than `ms`. Each frame is
  `looking(face, out, i)`, so she breathes while she holds the pose.
- The keys, against `VISION`'s timetable: she stands for 0.4 s, then turns her face up in `awe`, her
  arms a little out (0.4), over 0.32 s, as the light fades in and the logo starts down; she watches
  it come down for 1.1 s; as it arrives (at 1.8 s) she smiles (`up`) and opens her arms wider (0.7)
  over 0.4 s, and gazes up at it while it hovers for 4.6 s, blinking once two seconds in (a single
  frame of `blink`, her arms where they are); as it rises away (from 6.8 s) she lowers her arms
  slowly (to 0.3) over 1.2 s, still looking up; then she comes back to standing over 0.4 s, blinks
  and stands. 8600 ms, `FIDGET_MS.vision`.

### `levitate()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#levitate -->

[`src/renderer/src/character/sprite.ts`, lines 473–523](../../apps/desktop/src/renderer/src/character/sprite.ts#L473-L523)

```ts
/**
 * Levitating: eyes shut, her arms drift out, a magic circle opens on the ground and she floats up
 * over it, her hair and robe lifting; she hovers, bobbing, smiling, the runes turning and sparks
 * rising; then she sinks, lands with a little bend of the knees, and the circle fades.
 */
function levitate(): Key[] {
  const floating = (
    y: number,
    rune: number,
    out: number,
    face: Pose['face'],
    spin: number,
    lift = 0,
    wind = 0,
  ): Pose => {
    const arm = { shoulder: 0.1 + out * 0.45, elbow: out * 0.35 }
    return { view: 'front', y, rune, spin, lift, wind, face, arms: [arm, arm] }
  }
  const gather = floating(0, 0.5, 0.5, 'blink', 0)
  const risen = floating(-7, 1, 1, 'blink', 0.15, 2.5)
  // Hovering: a pixel up and down, the robe fluttering, a smile in the middle; one turn of runes.
  const hovering: Key[] = Array.from({ length: 40 }, (_, i) => {
    const phase = (i / 40) * Math.PI * 2
    const face = i >= 14 && i < 30 ? 'happy' : 'blink'
    return {
      pose: floating(
        -7 - Math.round(Math.sin(phase)),
        1,
        1,
        face,
        0.15 + i / 40,
        2.5 + Math.sin(phase) * 0.5,
        Math.sin(phase * 2) * 1.2,
      ),
      ms: 40,
    }
  })
  const last = hovering.at(-1)!.pose
  const sunk = floating(0, 0.4, 0.5, 'blink', 1.3, 0.5)
  const land: Pose = { ...floating(2, 0, 0.3, 'neutral', 1.4), legs: crouch(2) }
  return [
    ...hold(FRONT, 120),
    ...tween(FRONT, gather, 320),
    ...tween(gather, risen, 600),
    ...hovering,
    ...tween(last, sunk, 480),
    ...tween(sunk, land, 160),
    ...tween(land, FRONT, 200),
    ...hold(FRONT, 120),
  ]
}
```

<!-- /code -->

As the comment says, she levitates, from the front.

- `floating(y, rune, out, face, spin, lift, wind)`: a pose for each moment: how high she is (`y`,
  negative is up), the magic circle's size and turn, how far her arms have drifted out (`out`, 0
  to 1: up to 0.55 at the shoulder and 0.35 at the elbow, both arms alike, so from the front they
  open evenly), her face, and how much her hair lifts and her robe flutters.
- `gather`: eyes shut, her arms a little out, the circle half open on the ground. `risen`: 7
  pixels up, arms out, the circle at full size, her hair lifted.
- `hovering`: 40 frames of 40 ms. She bobs a pixel up and down (`Math.round`, so she moves by
  whole pixels and stays crisp), her hair lifts a little more and less with the bob, her robe
  flutters (`wind`, twice as fast), and the runes turn once (`spin`). She smiles, eyes still shut,
  through the middle of it (frames 14 to 29).
- Then she sinks to the ground as the circle shrinks (`sunk`), lands with her knees bent
  (`crouch(2)`) as it vanishes, and straightens up. 3600 ms, `FIDGET_MS.levitate`.

### `sit()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#sit -->

[`src/renderer/src/character/sprite.ts`, lines 525–565](../../apps/desktop/src/renderer/src/character/sprite.ts#L525-L565)

```ts
/** Sitting on the taskbar, her robe spread round her, swaying gently, looking about, then up again. */
function sit(): Key[] {
  const hug: [Arm, Arm] = [
    { shoulder: 0.55, elbow: -1.15 },
    { shoulder: 0.55, elbow: -1.15 },
  ]
  const sitting = (i: number): Pose => {
    const phase = (i / 46) * Math.PI * 4
    return {
      view: 'front',
      sitting: true,
      x: Math.round(Math.sin(phase)),
      tilt: Math.sin(phase) * 0.06,
      wind: Math.sin(phase) * 1.2,
      arms: hug,
      legs: [
        { hip: 0.3 + 0.3 * Math.sin(phase), knee: 0.3 },
        { hip: 0.3 + 0.3 * Math.sin(phase), knee: 0.3 },
      ],
      look: i >= 16 && i < 22 ? -1 : i >= 30 && i < 36 ? 1 : 0,
      face: i === 12 || i === 40 ? 'blink' : i >= 24 && i < 28 ? 'happy' : 'neutral',
    }
  }
  const squat: Pose = {
    view: 'front',
    y: 5,
    legs: crouch(5),
    arms: [
      { shoulder: 0.3, elbow: 0.2 },
      { shoulder: 0.3, elbow: 0.2 },
    ],
  }
  return [
    ...tween(FRONT, squat, 240),
    ...hold(sitting(0), 120),
    ...Array.from({ length: 46 }, (_, i) => ({ pose: sitting(i), ms: 110 })),
    ...hold(squat, 160),
    ...tween(squat, FRONT, 240),
    ...hold(FRONT, 180),
  ]
}
```

<!-- /code -->

As the comment says, sitting on the taskbar with her robe spread round her, the longest fidget.

- `hug`: from the front, both upper arms out a little and the forearms folded back in
  (`elbow: -1.15`), round her knees.
- `sitting(i)`: frame `i` of 46, with `sitting: true` (the rig puts her hips low, her knees up and
  her robe spread). `phase` goes round twice over the 46 frames: she sways a pixel side to side
  (`x`), her head, hair and robe going with her, and her knees part and close a little (`legs`).
- `look`: she glances left (frames 16 to 21) and right (30 to 35), blinks at 12 and 40, and smiles
  from 24 to 27.
- `squat`: a crouch (`crouch(5)`) on the way down and on the way up again.
- Down, 46 frames of 110 ms sitting, then up. 6000 ms, `FIDGET_MS.sit`.

### `curtsy()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#curtsy -->

[`src/renderer/src/character/sprite.ts`, lines 567–592](../../apps/desktop/src/renderer/src/character/sprite.ts#L567-L592)

```ts
/** A curtsy, from the front: her robe held out at the sides, a dip with her head tilted, smiling. */
function curtsy(): Key[] {
  const holding = (depth: number, spread: number, face: Pose['face'], tilt = 0): Pose => ({
    view: 'front',
    y: depth,
    legs: crouch(depth),
    spread,
    face,
    tilt,
    // Hands out low at her sides, holding the robe's edges.
    arms: [
      { shoulder: 0.5, elbow: -0.3 },
      { shoulder: 0.5, elbow: -0.3 },
    ],
  })
  const dip = holding(4, 6, 'happy', 0.1)
  return [
    ...hold(FRONT, 160),
    ...tween(FRONT, holding(0, 4, 'neutral'), 280),
    ...tween(holding(0, 4, 'neutral'), dip, 420),
    ...tween(dip, dip, 500),
    ...tween(dip, holding(0, 4, 'happy'), 420),
    ...tween(holding(0, 4, 'happy'), FRONT, 300),
    ...hold(FRONT, 120),
  ]
}
```

<!-- /code -->

As the comment says, a curtsy, from the front: her robe held out at the sides, a dip with her head
tilted, smiling.

- `holding(depth, spread, face, tilt)`: a pose for each moment: her hips `depth` pixels lower with
  her knees bent to match (`crouch(depth)`), her robe's hem out `spread` pixels each side, her face
  and a tilt of her head. As the comment says, her hands are out low at her sides, holding the
  robe's edges: both arms a little out from her body (`shoulder: 0.5`), the forearms turned back in
  (`elbow: -0.3`).
- `dip`: the bottom of the curtsy: 4 pixels down, the robe out 6 each side, smiling, her head
  tipped (`tilt: 0.1`).
- The keys: she stands (0.16 s), takes hold of her robe and holds it out (0.28 s), dips (0.42 s),
  stays down (0.5 s; a tween from `dip` to itself, so every frame is the same), rises, still smiling
  (0.42 s), lets go (0.3 s) and stands. 2200 ms, `FIDGET_MS.curtsy`.

### `orb()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#orb -->

[`src/renderer/src/character/sprite.ts`, lines 594–627](../../apps/desktop/src/renderer/src/character/sprite.ts#L594-L627)

```ts
/**
 * Gazing into a crystal ball, from the front: she brings it up in both hands, looks down into it
 * as a wisp of light turns inside and sparkles circle it, then smiles at what she sees and puts it
 * away.
 */
function orb(): Key[] {
  const holding = (face: Pose['face'], spin = 0, sparkle = 0): Pose => ({
    view: 'front',
    prop: 'orb',
    face,
    spin,
    sparkle,
    // Both forearms turned in and up, so her hands meet in front of her waist.
    arms: [
      { shoulder: 0.25, elbow: -1.55 },
      { shoulder: 0.25, elbow: -1.55 },
    ],
  })
  const gazing: Key[] = Array.from({ length: 40 }, (_, i) => ({
    pose: holding('down', i / 20, i >= 8 ? (i - 8) / 32 : 0),
    ms: 50,
  }))
  return [
    ...hold(FRONT, 200),
    ...tween(FRONT, holding('neutral'), 400),
    ...tween(holding('neutral'), holding('down'), 200),
    ...gazing,
    ...tween(holding('down', 2), holding('happy', 2.4), 300),
    ...tween(holding('happy', 2.4), holding('happy', 3), 600),
    ...hold(holding('blink', 3), 120),
    ...tween(holding('happy', 3), FRONT, 400),
    ...hold(FRONT, 180),
  ]
}
```

<!-- /code -->

As the comment says, gazing into a crystal ball, from the front: she brings it up in both hands,
looks down into it as a wisp of light turns inside and sparkles circle it, then smiles at what she
sees and puts it away.

- `holding(face, spin, sparkle)`: a pose for each moment: the crystal ball (`prop: 'orb'`), her
  face, how far the wisp inside it has turned (`spin`, in whole turns) and the sparkles. As the
  comment says, both forearms are turned in and up (`elbow: -1.55`), so her hands meet in front of
  her waist, where the rig puts the ball.
- `gazing`: 40 frames of 50 ms (2 seconds), looking down into it (`down`), the wisp turning
  nearly twice (`i / 20`), and from the eighth frame the sparkles circling once (`(i - 8) / 32`).
- The keys: she stands (0.2 s), brings the ball up (0.4 s), looks down into it (0.2 s), gazes (2 s),
  smiles at what she sees as the wisp turns on (0.3 s and 0.6 s), blinks (0.12 s), and puts it away
  (0.4 s; the ball goes halfway through, when the nearer pose has no prop) and stands. 4400 ms,
  `FIDGET_MS.orb`.

### `twirl()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#twirl -->

[`src/renderer/src/character/sprite.ts`, lines 629–665](../../apps/desktop/src/renderer/src/character/sprite.ts#L629-L665)

```ts
/**
 * A twirl: she spins round three times on the spot, arms out, her robe flaring wider as she goes
 * and her hair swinging, then lands, smiling, as the robe settles. A turn is the views in order,
 * front, diagonal, side, then the side and diagonal mirrored (facing the other way): her back,
 * which she has no picture of, goes by in between too fast to miss.
 */
function twirl(): Frame[] {
  const out: [Arm, Arm] = [
    { shoulder: 0.9, elbow: 0.2 },
    { shoulder: 0.9, elbow: 0.2 },
  ]
  const front = (spread: number, wind = 0, face: Pose['face'] = 'happy') =>
    draw({ view: 'front', spread, wind, face, arms: out })
  const diagonal = draw({ view: 'diagonal', face: 'happy', arms: [out[0], ARM_DOWN] })
  const side = (spread: number) =>
    draw({ view: 'side', spread, wind: -2, face: 'happy', arms: out })
  const turn = (spread: number, ms: number): Frame[] => [
    { rows: diagonal, ms },
    { rows: side(spread), ms },
    { rows: mirror(side(spread)), ms },
    { rows: mirror(diagonal), ms },
    { rows: front(spread), ms },
  ]
  return [
    { rows: draw(FRONT), ms: 200 },
    { rows: front(2), ms: 120 },
    ...turn(4, 70),
    ...turn(6, 60),
    ...turn(5, 70),
    { rows: front(6, 1), ms: 160 },
    { rows: front(4, -1), ms: 120 },
    { rows: front(2, 0.5), ms: 120 },
    { rows: front(0), ms: 200 },
    { rows: draw({ view: 'front', face: 'blink' }), ms: 120 },
    { rows: draw(FRONT), ms: 160 },
  ]
}
```

<!-- /code -->

As the comment says, a twirl: she spins round three times on the spot, arms out, her robe flaring
wider as she goes and her hair swinging, then lands, smiling, as the robe settles. Like `look()`,
it returns frames rather than key poses: a spin can't be tweened, since the view changes every
frame, and it reuses a few drawings.

- `out`: both arms held out (`shoulder: 0.9`, the forearms a little further).
- `front(spread, wind, face)`: her from the front, arms out, with her robe spread and her hair
  swung by `wind`, smiling unless told otherwise.
- `diagonal`: drawn once: seen diagonally, smiling, her near arm out (the far arm is part of the
  hand-drawn picture).
- `side(spread)`: side on, arms out, robe spread, her hair trailing behind (`wind: -2`).
- `turn(spread, ms)`: one turn, five frames of `ms` each. As the comment says, a turn is the views
  in order: front (the last frame), diagonal, side, then the side and the diagonal mirrored, facing
  the other way. Her back, which she has no picture of, goes by between the side and its mirror
  image too fast to miss.
- The frames: she stands (0.2 s), her robe starts to swing out (0.12 s), then three turns, the robe
  out 4, then 6, then 5 pixels each side, the middle one the fastest (60 ms a frame, 70 for the
  others); then she lands from the front as her robe settles (6, 4, 2, 0) and her hair swings to
  and fro (`wind` 1, -1, 0.5), blinks and stands. 2200 ms, `FIDGET_MS.twirl`.

### `butterfly()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#butterfly -->

[`src/renderer/src/character/sprite.ts`, lines 667–691](../../apps/desktop/src/renderer/src/character/sprite.ts#L667-L691)

```ts
/**
 * A butterfly, from the front: she holds up a finger beside her; a little magic butterfly flutters
 * down to it and rests there, opening and shutting its wings, while she watches it, smiling; then
 * it flies off up and away, and she lowers her hand.
 */
function butterfly(): Key[] {
  const steps = Math.round(FIDGET_MS.butterfly / FRAME_MS)
  return Array.from({ length: steps }, (_, i) => {
    const t = i / steps
    // Her near hand up beside her head (raised over the first 8%, lowered over the last 10%).
    const up = Math.min(1, t / 0.08, (1 - t) / 0.1)
    const lift = up * up * (3 - 2 * up)
    const arm = { shoulder: 0.08 + 1.47 * lift, elbow: 0.95 * lift }
    return {
      pose: {
        view: 'front',
        butterfly: t,
        arms: [arm, ARM_DOWN],
        look: t > 0.04 && t < 0.92 ? 1 : 0,
        face: t > 0.32 && t < 0.72 ? 'happy' : 'neutral',
      },
      ms: FRAME_MS,
    }
  })
}
```

<!-- /code -->

As the comment says, a butterfly, from the front: she holds up a finger beside her; a little magic
butterfly flutters down to it and rests there, opening and shutting its wings, while she watches
it, smiling; then it flies off up and away, and she lowers her hand. The rig draws the butterfly
from how far through the habit she is (`butterfly` in the pose), so it's one continuous movement:
every frame is its own pose, rather than key poses with in-betweens.

- `steps = Math.round(FIDGET_MS.butterfly / FRAME_MS)`: 120 frames of 40 ms, exactly the habit's
  4800 ms. (This is why `sprite.ts` imports `FIDGET_MS` from `src/shared/character.ts`.)
- `t = i / steps`: how far through, from 0 to just under 1, given to the rig as `butterfly`.
- `up`, `lift`: as the comment says, her near hand raised over the first 8% and lowered over the
  last 10%, eased with smoothstep (`up * up * (3 - 2 * up)`).
- `arm`: her near arm lifting from hanging (0.08) to 1.55 at the shoulder, with the elbow bent
  0.95, so her hand is up beside her head; the other arm hangs (`ARM_DOWN`).
- `look: 1` from 4% to 92%: her eyes turned toward her raised hand while the butterfly is about.
- `face`: smiling from 32% to 72%, while it rests on her finger (the rig has it resting from 30% to
  72%).

### `doze()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#doze -->

[`src/renderer/src/character/sprite.ts`, lines 693–744](../../apps/desktop/src/renderer/src/character/sprite.ts#L693-L744)

```ts
/**
 * Dozing, from the front: her eyes close, her head droops and she sways a little while z's float
 * up from her; her head nods, and she wakes with a start, hair flying, looks one way and the other,
 * and blinks.
 */
function doze(flipText = false): Key[] {
  const steps = Math.round(FIDGET_MS.doze / FRAME_MS)
  return Array.from({ length: steps }, (_, i) => {
    const t = i / steps
    if (t < 0.6) {
      // Nodding off: eyes heavy, then shut; head drooping further, a deeper nod near the end.
      const droop = Math.min(1, t / 0.15)
      const nod = t > 0.48 && t < 0.56 ? 0.06 : 0
      return {
        pose: {
          view: 'front',
          face: t < 0.06 ? 'down' : 'blink',
          tilt: 0.12 * droop + nod,
          x: Math.round(Math.sin(t * 14) * 0.6),
          zzz: t > 0.1 ? (t - 0.1) / 0.5 : 0,
          flipText,
        },
        ms: FRAME_MS,
      }
    }
    if (t < 0.68) {
      // Awake with a start.
      return {
        pose: {
          view: 'front',
          face: 'surprised',
          y: -2,
          lift: 1.5,
          arms: [
            { shoulder: 0.45, elbow: 0.2 },
            { shoulder: 0.45, elbow: 0.2 },
          ],
        },
        ms: FRAME_MS,
      }
    }
    // Looking about, then a blink.
    return {
      pose: {
        view: 'front',
        look: t < 0.76 ? -1 : t < 0.84 ? 1 : 0,
        face: t > 0.9 && t < 0.93 ? 'blink' : 'neutral',
      },
      ms: FRAME_MS,
    }
  })
}
```

<!-- /code -->

As the comment says, dozing, from the front: her eyes close, her head droops and she sways a
little while z's float up from her; her head nods, and she wakes with a start, hair flying, looks
one way and the other, and blinks. Like `butterfly()`, every frame is its own pose: 140 frames of
40 ms, exactly `FIDGET_MS.doze` (5600 ms).

- `flipText = false`: whether to draw the z's back to front, passed on to the rig in each
  nodding-off pose. `MAKERS` leaves it off; `LEFT_MAKERS` (below) turns it on for the frames that
  will be mirrored to face left.

- Until 60% of the way through, as the comment says, nodding off:
  - `face`: her eyes heavy (`down`) for the first 6%, then shut (`blink`).
  - `tilt`: her head drooping, up to 0.12 over the first 15% (`droop`), with a deeper nod
    (`nod`, 0.06 more) from 48% to 56%.
  - `x`: swaying, a pixel to either side at the ends of each sway (`Math.round` of at most 0.6
    gives -1, 0 or 1).
  - `zzz`: the z's, from 0 at 10% to 1 at 60% (the rig floats them up from above her hat), and
    `flipText` with them.
- From 60% to 68%, as the comment says, awake with a start: mouth open (`surprised`), 2 pixels up,
  her hair lifted (`lift: 1.5`) and her arms a little out.
- Then, as the comment says, looking about: her eyes to one side (`look: -1`) until 76%, the other
  until 84%, then straight ahead, with a blink from 90% to 93%.

### `look()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#look -->

[`src/renderer/src/character/sprite.ts`, lines 746–768](../../apps/desktop/src/renderer/src/character/sprite.ts#L746-L768)

```ts
/**
 * A glance one way, then the other (the second a mirror image), her eyes leading her head, then a
 * blink.
 */
function look(): Frame[] {
  const front = draw(FRONT)
  const eyesRight = draw({ view: 'front', look: 1 })
  const eyesLeft = draw({ view: 'front', look: -1 })
  const glance = draw({ view: 'diagonal', tilt: 0.04 })
  return [
    { rows: front, ms: 260 },
    { rows: eyesRight, ms: 80 },
    { rows: glance, ms: 520 },
    { rows: eyesRight, ms: 80 },
    { rows: front, ms: 120 },
    { rows: eyesLeft, ms: 80 },
    { rows: mirror(glance), ms: 520 },
    { rows: eyesLeft, ms: 80 },
    { rows: front, ms: 120 },
    { rows: draw({ view: 'front', face: 'blink' }), ms: 120 },
    { rows: front, ms: 420 },
  ]
}
```

<!-- /code -->

As the comment says, a glance one way, then the other, her eyes leading her head. Unlike most of
the others it returns frames rather than key poses: it only needs a few drawings, so each is drawn once and
used again.

- `front` (standing), `eyesRight` and `eyesLeft` (standing, her eyes a pixel to one side), `glance`
  (turned diagonally toward the way she faces, her head tilted a touch) and `mirror(glance)`, the
  same glance the other way.
- Each glance starts with her eyes moving first (80 ms) and her head following, which is how
  people look round: front, eyes right, the glance (0.52 s), eyes right, front; the same to the
  left; then a blink, and front. Eleven frames, 2400 ms, `FIDGET_MS.look`.

### `between` and `juggle()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#between,juggle -->

[`src/renderer/src/character/sprite.ts`, lines 770–804](../../apps/desktop/src/renderer/src/character/sprite.ts#L770-L804)

```ts
/** Between 0 and 1: how far `t` is from `from` to `to`, eased in and out. */
const between = (t: number, from: number, to: number) =>
  smooth(Math.min(1, Math.max(0, (t - from) / (to - from))))

/**
 * Juggling, from the front: her hands come up in front of her and three little orbs fly between
 * them, up in a high arc from her far hand to her near one and quickly back underneath, each hand
 * dipping as it throws; then they're gone into her hands and she smiles.
 */
function juggle(): Key[] {
  const steps = Math.round(FIDGET_MS.juggle / FRAME_MS)
  const [start, end] = [0.1, 0.88]
  return Array.from({ length: steps }, (_, i) => {
    const t = i / steps
    const ready = between(t, 0, 0.08) * (1 - between(t, 0.92, 1))
    const playing = t >= start && t < end
    const progress = playing ? (t - start) / (end - start) : 0
    // A hand dips as an orb leaves it: three throws a round from each, the near hand's a little
    // after the far one's (when an orb comes to the end of its high arc).
    const dip = (at: number) =>
      playing
        ? Math.max(0, Math.cos((progress * JUGGLE.rounds - at) * 3 * Math.PI * 2)) ** 4 * 0.2
        : 0
    const arm = (d: number): Arm => ({ shoulder: 0.1 + 0.4 * ready - d, elbow: -1.45 * ready + d })
    return {
      pose: {
        view: 'front',
        juggle: progress,
        arms: [arm(dip(JUGGLE.arc)), arm(dip(0))],
        face: t >= end + 0.02 ? 'happy' : 'neutral',
      },
      ms: FRAME_MS,
    }
  })
}
```

<!-- /code -->

`between(t, from, to)`: as its comment says, how far `t` is from `from` to `to`, as a number from 0
to 1, eased in and out with `smooth()`. Before `from` it's 0 and past `to` it's 1
(`Math.min(1, Math.max(0, ...))`), so `between(t, 0, 0.08)` is a move over the first 8% of a habit,
and `1 - between(t, 0.92, 1)` the same move undone over the last 8%. The newest habits work out
each frame from `t` and ease their moves with it. (The rig has a `between()` of its own inside
`draw()`, for the butterfly, which gives a point part of the way between two.)

`juggle()`: as the comment says, juggling, from the front: her hands come up in front of her and
three little orbs fly between them, up in a high arc from her far hand to her near one and quickly
back underneath, each hand dipping as it throws; then they're gone into her hands and she smiles.
Like `butterfly()`, every frame is its own pose, worked out from how far through the habit it is:
110 frames of 40 ms, exactly `FIDGET_MS.juggle` (4400 ms).

- `[start, end] = [0.1, 0.88]`: the orbs fly from 10% of the way through to 88%.
- `ready`: her hands coming up over the first 8% and going down again over the last 8%, from 0
  to 1 and back.
- `progress`: how far through the juggling it is, from 0 at `start` to nearly 1 at `end`, and 0
  outside it. It's the rig's `juggle`, which draws no orbs at 0, so the orbs are only there while
  she juggles.
- `dip(at)`: as the comment says, a hand dips as an orb leaves it. Each of the three orbs leaves
  each hand once a round, so the cosine goes round three times a round (`* 3 * Math.PI * 2`),
  peaking at each throw. `Math.max(0, ...) ** 4` keeps only the top of each peak and sharpens it,
  so the dip is quick, and `* 0.2` makes it 0.2 radians at most. The far hand throws as an orb's
  round begins (`at` 0), and the near hand a little later, as an orb comes to the end of its high
  arc (`at` `JUGGLE.arc`): the same numbers the rig places the orbs by, so each dip comes just as
  an orb leaves that hand.
- `arm(d)`: an arm with its hand up in front of her: the upper arm out from 0.1 to 0.5 as her hands
  come up, and the forearm turned in and up (`elbow: -1.45 * ready`). A dip `d` lowers the upper
  arm and straightens the forearm by the same amount, so the hand drops a little.
- `arms: [arm(dip(JUGGLE.arc)), arm(dip(0))]`: the near hand (on the right of the picture) and the
  far one, each dipping at its own throws.
- `face`: smiling once the orbs are gone (from 90% of the way through).

### `bubbles()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#bubbles -->

[`src/renderer/src/character/sprite.ts`, lines 806–835](../../apps/desktop/src/renderer/src/character/sprite.ts#L806-L835)

```ts
/**
 * Bubbles, seen diagonally: she holds a little wand ring up in front of her mouth and blows
 * through it, puffing before each bubble; they drift up and away, wobbling, and pop. She puts the
 * wand away and watches the last ones go, smiling.
 */
function bubbles(): Key[] {
  const steps = Math.round(FIDGET_MS.bubbles / FRAME_MS)
  const blowing: Arm = { shoulder: 0.75, elbow: 2.45 }
  return Array.from({ length: steps }, (_, i) => {
    const t = i / steps
    const up = between(t, 0, 0.08) * (1 - between(t, BUBBLES.wandAway, BUBBLES.wandAway + 0.06))
    const arm: Arm = {
      shoulder: lerp(ARM_DOWN.shoulder, blowing.shoulder, up),
      elbow: lerp(ARM_DOWN.elbow, blowing.elbow, up),
    }
    // A puff just before each bubble comes.
    const puffing = Array.from(
      { length: BUBBLES.count },
      (_, k) => BUBBLES.first + k * BUBBLES.gap,
    ).some((at) => t > at - 0.045 && t <= at + 0.005)
    const face: Pose['face'] = puffing
      ? 'sip'
      : t > 0.9 && t < 0.93
        ? 'blink'
        : t > BUBBLES.wandAway - 0.1
          ? 'happy'
          : 'neutral'
    return { pose: { view: 'diagonal', bubbles: t, arms: [arm, ARM_DOWN], face }, ms: FRAME_MS }
  })
}
```

<!-- /code -->

As the comment says, bubbles, seen diagonally: she holds a little wand ring up in front of her mouth
and blows through it, puffing before each bubble; they drift up and away, wobbling, and pop. She
puts the wand away and watches the last ones go, smiling. Every frame is its own pose again: 110
frames of 40 ms, `FIDGET_MS.bubbles` (4400 ms). Each passes on how far through it is (`t`) as the
rig's `bubbles`, and the rig places the bubbles and the wand from that.

- `blowing`: her near arm raised (`shoulder: 0.75`) with the elbow bent right up (`elbow: 2.45`),
  so her hand, and the wand ring the rig draws at it, comes up in front of her mouth.
- `up`: how far the arm is raised: up over the first 8%, and down again just after she puts the
  wand away (from `BUBBLES.wandAway`, 86%, to 92%). `arm` is that share of the way from hanging
  (`ARM_DOWN`) to `blowing`.
- `puffing`: as the comment says, a puff just before each bubble comes. The bubbles come at
  `first + k * gap`, the same times the rig uses, and she puffs from 4.5% of the habit before each
  one until just after it comes. `.some()` is true if `t` is in any of those stretches.
- `face`: while puffing, the `sip` face (eyes closed, her mouth a single pixel, pursed); a blink at
  90%; smiling from 76% on, as she watches the last ones go; otherwise neutral. The nested `? :`
  reads from the top: the first that applies wins.

### `wisp()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#wisp -->

[`src/renderer/src/character/sprite.ts`, lines 837–864](../../apps/desktop/src/renderer/src/character/sprite.ts#L837-L864)

```ts
/**
 * A will-o'-wisp, from the front: a little light appears beside her (she's surprised), goes round
 * her twice, behind her and in front (see wispAt), her eyes following it and a smile as it passes
 * in front; then it flies off up and away, and she waves it goodbye.
 */
function wisp(): Key[] {
  const steps = Math.round(FIDGET_MS.wisp / FRAME_MS)
  return Array.from({ length: steps }, (_, i) => {
    const t = i / steps
    const at = wispAt(t)
    const bye = between(t, 0.8, 0.84) * (1 - between(t, 0.94, 0.98))
    const arm: Arm = {
      shoulder: 0.08 + 1.45 * bye,
      elbow: (0.75 + 0.35 * Math.sin(t * 70)) * bye,
    }
    const inFront = at !== null && !at.behind && Math.abs(at.x) < 12
    return {
      pose: {
        view: 'front',
        wisp: t,
        look: at === null ? 0 : at.x > 7 ? 1 : at.x < -7 ? -1 : 0,
        arms: [arm, ARM_DOWN],
        face: t > 0.06 && t < 0.14 ? 'surprised' : inFront || bye > 0 ? 'happy' : 'neutral',
      },
      ms: FRAME_MS,
    }
  })
}
```

<!-- /code -->

As the comment says, a will-o'-wisp, from the front: a little light appears beside her (she's
surprised), goes round her twice, behind her and in front, her eyes following it and a smile as it
passes in front; then it flies off up and away, and she waves it goodbye. Every frame is its own
pose: 120 frames of 40 ms, `FIDGET_MS.wisp` (4800 ms). The rig draws the wisp from `t` (the pose's
`wisp`), and her eyes and face here follow it, using the same `wispAt()` from `rig.ts`.

- `at = wispAt(t)`: where the wisp is now, or `null` when it isn't there.
- `bye`: the wave goodbye: her arm coming up from 80% of the way through, as the wisp flies off,
  and down again from 94% to 98%.
- `arm`: her near arm (on the right of the picture, the side it flies off to), raised with `bye`
  (the upper arm from hanging, 0.08, to 1.53), the forearm swinging to and fro round a bend of
  0.75 (`Math.sin(t * 70)`, twice while she waves): a wave. The other arm hangs.
- `inFront`: the wisp is in front of her and within 12 pixels of her middle, passing across her.
- `look`: her eyes follow it: to the right when it's more than 7 pixels right of her middle, to
  the left when it's more than 7 left, and straight ahead in between or when it isn't there.
- `face`: surprised as it appears (6% to 14%), smiling while it passes in front of her and while
  she waves it goodbye, otherwise neutral.

### `sneeze()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#sneeze -->

[`src/renderer/src/character/sprite.ts`, lines 866–894](../../apps/desktop/src/renderer/src/character/sprite.ts#L866-L894)

```ts
/**
 * A sneeze, from the front: her nose twitches, "ah..." (her head goes back), a breath, "ah..."
 * (further back, eyes shut), "choo!" (forward, hair flying, hands up), and the sneeze bursts into
 * sparkles that fly out and fade; she looks surprised, then smiles sheepishly and blinks.
 */
function sneeze(): Key[] {
  const twitch: Pose = { view: 'front', face: 'surprised' }
  const ah = (tilt: number, face: Pose['face']): Pose => ({ view: 'front', face, tilt, lift: -0.5 })
  const hands: [Arm, Arm] = [
    { shoulder: 0.3, elbow: -0.9 },
    { shoulder: 0.3, elbow: -0.9 },
  ]
  const choo: Pose = { view: 'front', face: 'blink', tilt: 0.1, lift: 1.5, arms: hands, burst: 0.1 }
  const after: Pose = { view: 'front', face: 'surprised', tilt: 0.03, burst: 0.55 }
  const sheepish: Pose = { view: 'front', face: 'happy', burst: 1 }
  return [
    ...hold(FRONT, 200),
    ...hold(twitch, 160),
    ...tween(twitch, ah(-0.06, 'down'), 360),
    ...tween(ah(-0.06, 'down'), ah(-0.03, 'down'), 160),
    ...tween(ah(-0.03, 'down'), ah(-0.1, 'blink'), 420),
    ...tween(ah(-0.1, 'blink'), choo, 80),
    ...tween(choo, after, 520),
    ...tween(after, sheepish, 480),
    ...hold({ view: 'front', face: 'happy' }, 360),
    ...hold({ view: 'front', face: 'blink' }, 120),
    ...hold(FRONT, 140),
  ]
}
```

<!-- /code -->

As the comment says, a sneeze, from the front: her nose twitches, "ah..." (her head goes back), a
breath, "ah..." (further back, eyes shut), "choo!" (forward, hair flying, hands up), and the sneeze
bursts into sparkles that fly out and fade; she looks surprised, then smiles sheepishly and blinks.
It's key poses with in-betweens, like the curtsy, and the sparkles come with them: `mix()` mixes
`burst` between key poses, so tweening from `choo` to `after` to `sheepish` flies them out from 0.1
to 1, and the rig draws them big, then as twinkles, then as glints.

- `twitch`: her nose twitching, shown as a surprised face for a moment.
- `ah(tilt, face)`: an in-breath: her head tipped back (a negative `tilt`), her hair a touch lower
  (`lift: -0.5`), and a face: eyes heavy (`down`) for the first "ah", shut (`blink`) for the second.
- `hands`: both forearms turned in and up (`elbow: -0.9`), so her hands come up toward her face.
- `choo`: the sneeze itself: eyes shut, her head forward (`tilt: 0.1`), her hair flying up
  (`lift: 1.5`), her hands up, and the sparkles just out (`burst: 0.1`).
- `after`: surprised, her head coming back up, the sparkles halfway out and turning into twinkles
  (`burst: 0.55`).
- `sheepish`: smiling, the sparkles gone (`burst: 1`, which the rig doesn't draw).
- The keys: she stands (0.2 s), her nose twitches (0.16 s), "ah..." (0.36 s), a breath, her head
  coming forward a little (0.16 s), "ah...", further back (0.42 s), "choo!" (0.08 s, so it's
  sudden), the sparkles fly out (0.52 s) and fade as she smiles (0.48 s), she smiles (0.36 s),
  blinks and stands. 3000 ms, `FIDGET_MS.sneeze`.

### `dance()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#dance -->

[`src/renderer/src/character/sprite.ts`, lines 896–926](../../apps/desktop/src/renderer/src/character/sprite.ts#L896-L926)

```ts
/**
 * A little jig, from the front: she steps to one side with that arm up and her other hand on her
 * hip, then hops, kicking her other foot out, her robe swinging and her hair flying the other way;
 * then the other side, seven beats in all, and back to standing.
 */
function dance(): Key[] {
  const up: Arm = { shoulder: 2.4, elbow: 0.6 }
  const hip: Arm = { shoulder: 0.55, elbow: -1.6 }
  const kick: Leg = { hip: 0.35, knee: 0.5 }
  const step = (side: 1 | -1, hopping: boolean): Pose => ({
    view: 'front',
    face: 'happy',
    x: 2 * side,
    y: hopping ? -2 : 0,
    wind: -1.2 * side,
    spread: 2,
    arms: side === 1 ? [up, hip] : [hip, up],
    legs: hopping ? (side === 1 ? [LEG_STAND, kick] : [kick, LEG_STAND]) : [LEG_STAND, LEG_STAND],
  })
  const beats: Key[] = []
  let last: Pose = FRONT
  for (let beat = 0; beat < 7; beat++) {
    const side = beat % 2 === 0 ? 1 : -1
    beats.push(
      ...tween(last, step(side, false), 190),
      ...tween(step(side, false), step(side, true), 190),
    )
    last = step(side, true)
  }
  return [...hold(FRONT, 160), ...beats, ...tween(last, FRONT, 260), ...hold(FRONT, 120)]
}
```

<!-- /code -->

As the comment says, a little jig, from the front: she steps to one side with that arm up and her
other hand on her hip, then hops, kicking her other foot out, her robe swinging and her hair flying
the other way; then the other side, seven beats in all, and back to standing. Key poses with
in-betweens again.

- `up`: an arm raised high (`shoulder: 2.4`), its forearm bent a little further (`elbow: 0.6`).
- `hip`: a hand on her hip: the upper arm a little out (`shoulder: 0.55`) and the forearm folded
  right back in (`elbow: -1.6`).
- `kick`: a leg kicked out to the side at the hip (`hip: 0.35`), bent at the knee (`knee: 0.5`).
- `step(side, hopping)`: one moment of a beat, to the right of the picture (`side` 1) or the left
  (-1). She smiles; she's 2 pixels over to that side (`x`), and 2 up while she hops (`y: -2`); her
  hair and robe are pushed the other way (`wind: -1.2 * side`), and her robe swings a little wide
  (`spread: 2`). The arm on that side is up and the other hand on her hip (from the front, `arms`
  are the right of the picture, then the left). Hopping, the other leg kicks out; stepping, both
  are straight.
- The loop: seven beats, starting to the right and changing sides each beat (`beat % 2`). Each is a
  step over to that side (0.19 s), then a hop there (0.19 s), each tweened from the pose before
  (`last`).
- She stands (0.16 s), dances seven beats (2.66 s), comes back to standing (0.26 s) and stands
  (0.12 s). 3200 ms, `FIDGET_MS.dance`.

### `chant()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#chant -->

[`src/renderer/src/character/sprite.ts`, lines 928–955](../../apps/desktop/src/renderer/src/character/sprite.ts#L928-L955)

```ts
/**
 * Chanting (her explosion spell), from the front: arms raised high, eyes shut and her lips moving,
 * a magic circle turning under her, sparkles circling her hand, her hair and robe lifting in the
 * updraft. Round and round, for as long as the chant lasts.
 */
function chant(): Key[] {
  return Array.from({ length: 32 }, (_, i) => {
    const phase = (i / 32) * Math.PI * 2
    const sway = Math.sin(phase) * 0.06
    return {
      pose: {
        view: 'front',
        face: Math.floor(i / 3) % 2 === 1 ? 'chant' : 'blink',
        arms: [
          { shoulder: 2.45 + sway, elbow: -0.1 },
          { shoulder: 2.45 - sway, elbow: -0.1 },
        ],
        rune: 1,
        spin: i / 32,
        sparkle: i / 32,
        lift: 1.5 + Math.sin(phase * 2) * 0.8,
        wind: Math.sin(phase) * 0.6,
        spread: 1.5 + Math.sin(phase * 2) * 0.8,
      },
      ms: FRAME_MS,
    }
  })
}
```

<!-- /code -->

As the comment says, her chant, for the explosion spell, from the front: arms raised high, eyes
shut and her lips moving, a magic circle turning under her, sparkles circling her hand, and her
hair and robe lifting in the updraft. Unlike the fidgets, it isn't key poses with in-betweens: it's
32 frames, each worked out on its own, making one round (1.28 seconds) that plays round and round
(`LOOPS`) for as long as the chant lasts, 15 seconds, until the main process changes her pose.

- `Array.from({ length: 32 }, (_, i) => {`: one frame for each `i` from 0 to 31, each `FRAME_MS`
  (40 ms) long.
- `phase`: how far round the loop the frame is, as an angle: a whole turn (2π) over the 32 frames,
  so the sines below come back to where they started, and the loop joins up.
- `sway`: her arms sway a little, one up as the other goes down (`2.45 + sway`, `2.45 - sway`).
- `face: Math.floor(i / 3) % 2 === 1 ? 'chant' : 'blink'`: her eyes stay shut, and her mouth opens
  and closes every three frames (`chant`, then `blink`): her lips moving as she chants.
- `arms`: both raised high over her head (`shoulder: 2.45`, about 140° from hanging down), almost
  straight (`elbow: -0.1`).
- `rune: 1`, `spin: i / 32`: the magic circle under her, at its full size, its runes turning once a
  round, as when she levitates.
- `sparkle: i / 32`: sparkles circling her raised hand once a round, as in her little spell.
- `lift`, `wind`, `spread`: the updraft of her magic: her hair raised and her hem lifting and
  settling twice a round (`phase * 2`), and her hair and robe swaying from side to side once.

### `over()`, `vanish()` and `appear()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#over,vanish,appear -->

[`src/renderer/src/character/sprite.ts`, lines 957–991](../../apps/desktop/src/renderer/src/character/sprite.ts#L957-L991)

```ts
/**
 * `ms` long, a frame about every FRAME_MS: `pose(t)` for each, `t` going from 0 to 1, their times
 * adding up to exactly `ms`.
 */
function over(ms: number, pose: (t: number) => Pose): Key[] {
  const steps = Math.max(2, Math.round(ms / FRAME_MS))
  return Array.from({ length: steps }, (_, i) => ({
    pose: pose(i / (steps - 1)),
    ms: Math.round(((i + 1) * ms) / steps) - Math.round((i * ms) / steps),
  }))
}

/**
 * Vanishing, from the front: a smile, then her eyes close and she dissolves into white motes that
 * drift up and fade (see FADE in the rig), the top of her first, until there's nothing left.
 */
function vanish(): Key[] {
  return over(SPELL_POSE_MS.vanish, (t) => ({
    view: 'front',
    face: t < 0.25 ? 'happy' : 'blink',
    fade: t * FADE.end,
  }))
}

/**
 * Appearing: vanishing backwards. White motes come down out of nowhere and she forms out of them,
 * her eyes shut, then open with a smile, standing as usual by the end.
 */
function appear(): Key[] {
  return over(SPELL_POSE_MS.appear, (t) => ({
    view: 'front',
    face: t < 0.75 ? 'blink' : t < 0.95 ? 'happy' : 'neutral',
    fade: (1 - t) * FADE.end,
  }))
}
```

<!-- /code -->

Vanishing and appearing, her teleport (and how she leaves when the app is closed, and arrives when
it starts). Each is one smooth change rather than key poses: `fade` going steadily up or down, which
the rig turns into her dissolving (see `FADE` in `rig.ts`).

- `over(ms, pose)`: as its comment says, `ms` long, a frame about every `FRAME_MS`: `pose(t)` for
  each, `t` going from 0 to 1, their times adding up to exactly `ms`.
  - `steps`: how many frames: one per `FRAME_MS`, rounded (23 for 900 ms), and never fewer than
    two, so there's a first and a last.
  - `pose(i / (steps - 1))`: the first frame is `t` = 0, and the last exactly 1.
  - `ms: Math.round(((i + 1) * ms) / steps) - Math.round((i * ms) / steps)`: each frame's share of
    `ms`, in whole milliseconds. Taking the difference of two running totals, rather than rounding
    each share on its own, means the roundings never add up: the frames last exactly `ms`, which a
    test checks for `vanish` and `appear` against `SPELL_POSE_MS`.
- `vanish()`: as its comment says, vanishing, from the front: a smile, then her eyes close and she
  dissolves into white motes that drift up and fade, the top of her first, until there's nothing
  left. It lasts `SPELL_POSE_MS.vanish` (0.9 seconds).
  - `face: t < 0.25 ? 'happy' : 'blink'`: smiling for the first quarter, then her eyes shut.
  - `fade: t * FADE.end`: from 0, all of her, to `FADE.end`, the last mote gone.
- `appear()`: as its comment says, vanishing backwards: white motes come down out of nowhere and
  she forms out of them, her eyes shut, then open with a smile, standing as usual by the end. It
  lasts `SPELL_POSE_MS.appear` (0.9 seconds).
  - `face: t < 0.75 ? 'blink' : t < 0.95 ? 'happy' : 'neutral'`: eyes shut for three quarters of
    it, then a smile, and her usual face for the last frame, so it ends just as standing begins.
  - `fade: (1 - t) * FADE.end`: from `FADE.end` down to 0. In the last frame `t` is exactly 1, so
    `fade` is 0 and she's whole: a test checks that frame is the same as her standing.

### `dragged()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#dragged -->

[`src/renderer/src/character/sprite.ts`, lines 993–1023](../../apps/desktop/src/renderer/src/character/sprite.ts#L993-L1023)

```ts
/**
 * Carried by her collar: off the ground, arms up, legs kicking, swaying, hair lifted, and no
 * shadow under her (she's in the air, wherever the pointer takes her).
 */
function dragged(): Key[] {
  return Array.from({ length: 12 }, (_, i) => {
    const phase = (i / 12) * Math.PI * 2
    const kick = Math.sin(phase * 2)
    return {
      pose: {
        view: 'front',
        face: 'surprised',
        shadow: false,
        x: Math.round(Math.sin(phase)),
        y: -4,
        tilt: Math.sin(phase) * 0.05,
        lift: 3,
        wind: Math.sin(phase) * 1.5,
        arms: [
          { shoulder: 2.4 + 0.25 * kick, elbow: 0.3 },
          { shoulder: 2.55 - 0.25 * kick, elbow: 0.3 },
        ],
        legs: [
          { hip: 0.12 + 0.12 * kick, knee: 0.25 + 0.35 * Math.max(0, kick) },
          { hip: 0.12 - 0.12 * kick, knee: 0.25 + 0.35 * Math.max(0, -kick) },
        ],
      },
      ms: 55,
    }
  })
}
```

<!-- /code -->

As the comment says, carried by her collar: the pose while she's dragged, or falling after a drop.
Twelve frames of 55 ms, round and round.

- `shadow: false`: as the comment says, no shadow under her: she's in the air, wherever the pointer
  takes her, nowhere near the taskbar. A test checks there's none.
- `y: -4`: off the ground, so her feet leave the bottom rows (a test checks).
- `face: 'surprised'` and `lift: 3`: her mouth open and her hair lifted.
- `kick` goes round twice as fast as the sway (`phase * 2`): her legs kick in turn, each knee
  bending as its leg kicks, and her raised arms wave with them.
- `x`, `tilt` and `wind`: swaying a pixel side to side, her head, hair and robe with her.

### `gaze()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#gaze -->

[`src/renderer/src/character/sprite.ts`, lines 1025–1048](../../apps/desktop/src/renderer/src/character/sprite.ts#L1025-L1048)

```ts
/**
 * Watching the sunset, her back to us (the screen saver): standing, breathing, swaying very
 * slightly from side to side in the evening breeze, her hair and robe stirring with it, round and
 * round every few seconds.
 */
function gaze(): Key[] {
  const count = 48
  return Array.from({ length: count }, (_, i) => {
    const phase = (i / count) * Math.PI * 2
    const breath = (1 - Math.cos(phase * 2)) / 2
    const arm = { shoulder: 0.07 + breath * 0.03, elbow: 0.05 }
    return {
      pose: {
        view: 'front',
        back: true,
        lean: Math.sin(phase) * 0.02,
        y: Math.round(breath),
        wind: 0.6 + Math.sin(phase + 0.8) * 1.2,
        arms: [arm, arm],
      },
      ms: 100,
    }
  })
}
```

<!-- /code -->

As the comment says, watching the sunset, her back to us, for the screen saver: standing,
breathing, swaying very slightly in the evening breeze, her hair and robe stirring with it, round
and round. It isn't one of the poses the main process names (she's in no window of her own while
the screen saver is on), so it has no entry in `MAKERS`; `gazeFrames()`, below, draws it for
`ScreenSaverView`.

- `count = 48` frames of `ms: 100` each: one round every 4.8 seconds, slow, like her idle. They're
  worked out one by one from `phase`, a full turn over the round, rather than eased between key
  poses, since it's a smooth sway with no poses to hold.
- `view: 'front', back: true`: from the front, turned round (`Pose.back` in `rig.ts`).
- `breath`: `(1 - Math.cos(phase * 2)) / 2` goes from 0 to 1 and back twice a round: two breaths.
  `y: Math.round(breath)` lowers her a pixel as she breathes out, and her arms lift a touch away
  from her sides (`shoulder: 0.07 + breath * 0.03`), elbows a little bent, the same on both sides.
- `lean: Math.sin(phase) * 0.02`: swaying very slightly from side to side, once a round.
- `wind: 0.6 + Math.sin(phase + 0.8) * 1.2`: the breeze in her hair and robe, always a little
  (0.6) and stirring either way of it, a little behind the sway (`+ 0.8`), as hair follows a
  movement.

### `drawn`, `MAKERS`, `LEFT_MAKERS` and `LOOPS`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#drawn,MAKERS,LEFT_MAKERS,LOOPS -->

[`src/renderer/src/character/sprite.ts`, lines 1711–1848](../../apps/desktop/src/renderer/src/character/sprite.ts#L1711-L1848)

```ts
// ------------------------------------------------------------------------------------- frames

const drawn = (keys: Key[]): Frame[] => keys.map(({ pose, ms }) => ({ rows: draw(pose), ms }))

/** How each pose's frames are made, facing right. */
const MAKERS: Record<Name, () => Frame[]> = {
  idle: () => drawn(idle()),
  'walk-right': () => drawn(walk()),
  'walk-left': () => drawn(walk()),
  hop: () => drawn(hop()),
  wave: () => drawn(wave()),
  stretch: () => drawn(stretch()),
  sip: () => drawn(sip()),
  read: () => drawn(read()),
  spell: () => drawn(spell()),
  levitate: () => drawn(levitate()),
  vision: () => drawn(vision()),
  curtsy: () => drawn(curtsy()),
  orb: () => drawn(orb()),
  twirl,
  butterfly: () => drawn(butterfly()),
  doze: () => drawn(doze()),
  sit: () => drawn(sit()),
  look,
  juggle: () => drawn(juggle()),
  bubbles: () => drawn(bubbles()),
  wisp: () => drawn(wisp()),
  sneeze: () => drawn(sneeze()),
  dance: () => drawn(dance()),
  flame: () => drawn(flame()),
  frost: () => drawn(frost()),
  bloom: () => drawn(bloom()),
  sigil: () => drawn(sigil()),
  rainbow: () => drawn(rainbow()),
  hat: () => drawn(hat()),
  star: () => drawn(star()),
  rain: () => drawn(rain()),
  potion: () => drawn(potion()),
  tome: () => drawn(tome()),
  chant: () => drawn(chant()),
  vanish: () => drawn(vanish()),
  appear: () => drawn(appear()),
  dragged: () => drawn(dragged()),
  flung,
  splat: () => drawn(splat()),
  yawn: () => drawn(yawn()),
  confetti: () => drawn(confetti()),
  pet: () => drawn(pet()),
  scroll: () => drawn(scroll()),
  startle: () => drawn(startle()),
  'pounce-left': () => drawn(pounce()),
  'pounce-right': () => drawn(pounce()),
  lift: () => drawn(lift()),
  lower: () => drawn(lower()),
  guilty: () => drawn(guilty()),
  toss: () => drawn(toss()),
  watch: () => drawn(watch()),
  'peek-left': () => drawn(peek()),
  'peek-right': () => drawn(peek()),
  ride: () => drawn(ride()),
}

/**
 * Poses with letters in them (the dozer's z's), drawn the other way round for facing left, so
 * they read right once the frame is mirrored.
 */
const LEFT_MAKERS: Partial<Record<Name, () => Frame[]>> = {
  doze: () => drawn(doze(true)),
}

/** Whether a pose's animation repeats (the fidgets play once, for FIDGET_MS). */
export const LOOPS: Record<Name, boolean> = {
  idle: true,
  'walk-left': true,
  'walk-right': true,
  dragged: true,
  // Tumbling through the air goes round until she lands; her hard landing plays once.
  flung: true,
  splat: false,
  // Answers play once; her performances' poses go round until they're done with.
  pet: false,
  scroll: false,
  startle: false,
  'pounce-left': false,
  'pounce-right': false,
  lift: false,
  lower: false,
  guilty: false,
  toss: false,
  watch: true,
  'peek-left': true,
  'peek-right': true,
  ride: true,
  hop: false,
  wave: false,
  stretch: false,
  sip: false,
  read: false,
  spell: false,
  levitate: false,
  vision: false,
  curtsy: false,
  orb: false,
  twirl: false,
  butterfly: false,
  doze: false,
  sit: false,
  look: false,
  juggle: false,
  bubbles: false,
  wisp: false,
  sneeze: false,
  dance: false,
  yawn: false,
  confetti: false,
  flame: false,
  frost: false,
  bloom: false,
  sigil: false,
  rainbow: false,
  hat: false,
  star: false,
  rain: false,
  potion: false,
  tome: false,
  // Her spells': the chant goes round for as long as it lasts; vanishing and appearing play once.
  chant: true,
  vanish: false,
  appear: false,
}
```

<!-- /code -->

- `drawn(keys)`: key poses into frames: the rig draws each pose (`draw()`), and each keeps its time.
- `MAKERS`: as the comment says, how each pose's frames are made, facing right. They're functions,
  not the frames themselves, so nothing is drawn until it's needed. `Record<Name, ...>` makes
  TypeScript insist on every pose. Both walks make the same right-facing frames; `framesOf()`
  mirrors them for `walk-left`. `look` and `twirl` make their frames themselves. Every fidget has
  its maker here, the ten magic ones (`flame`, `frost`, `bloom`, `sigil`, `rainbow`, `hat`,
  `star`, `rain`, `potion`, `tome`) included; like most, they make key poses, which `drawn()` turns
  into frames. The magic ones each make a frame every 40 ms with `through()`, from how far through
  the habit it is, and set one number on the pose (`flame`, `frost` and so on, or `hatLift`,
  `hatTurn` and `shower` for the hat trick) that the rig turns into the effect, timed by the rig's
  `FLAME`, `FROST`, `BLOOM`, `SIGIL`, `RAINBOW`, `STAR_CATCH`, `RAIN`, `POTION` and `TOME`. So do her spells' three poses
  (`chant`, `vanish` and `appear`).
- `LEFT_MAKERS`: as the comment says, poses with letters in them, drawn the other way round for
  facing left, so they read right once the frame is mirrored. Only the dozer's z's so far:
  `doze(true)`. `Partial<Record<...>>` lets it list only the poses that need it.
- `LOOPS`: as the comment says, which poses go round and round (idle, the walks and dangling) and
  which play once (all thirty fidgets, the magic ones included: their last frame stays until the
  main process changes the pose, which it does just as `FIDGET_MS` runs out). Of her spells'
  poses, as the comment says, the chant goes round for as long as it lasts, and vanishing and
  appearing play once (`SPELL_POSE_MS` times them; after vanishing, her last frame is empty).
  `Record<Name, boolean>` makes TypeScript insist on an answer for every pose, so a new habit can't
  be left out.

### `gazing` and `gazeFrames()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#gazing,gazeFrames -->

[`src/renderer/src/character/sprite.ts`, lines 1781–1787](../../apps/desktop/src/renderer/src/character/sprite.ts#L1781-L1787)

```ts
let gazing: Frame[] | null = null

/** Her frames watching the sunset, from behind (see gaze): round and round. Drawn once, then kept. */
export function gazeFrames(): Frame[] {
  gazing ??= drawn(gaze())
  return gazing
}
```

<!-- /code -->

In the source these sit between `LEFT_MAKERS` and `LOOPS`, above.

- `gazing`: her frames watching the sunset, once drawn; `null` until then.
- `gazeFrames()`: as its comment says, her frames watching the sunset, from behind (`gaze()`),
  round and round. `??=` draws them only the first time (when `gazing` is still `null`) and keeps
  them, as `made` does for the other poses. They're never mirrored: seen from behind, she isn't
  facing either way. `ScreenSaverView` plays them (`frameAt()`), painting each on its canvas
  with `paintHer()` rather than as SVG paths, so it can dim her colours and light her edges.

### `Facing`, `made` and `framesOf()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#Facing,made,framesOf -->

[`src/renderer/src/character/sprite.ts`, lines 1850–1874](../../apps/desktop/src/renderer/src/character/sprite.ts#L1850-L1874)

```ts
export type Facing = 'left' | 'right'

const made = new Map<string, Frame[]>()

/**
 * A pose's frames, facing `facing` (walking faces the way she walks, whatever `facing` says).
 * Drawn the first time they're asked for, then kept.
 */
export function framesOf(pose: Name, facing: Facing): Frame[] {
  // Poses with a way in their name (walking, pouncing, peeking) face that way, whatever `facing`
  // says.
  const way = pose.endsWith('-left') ? 'left' : pose.endsWith('-right') ? 'right' : facing
  const key = `${pose}:${way}`
  let frames = made.get(key)
  if (!frames) {
    const right = made.get(`${pose}:right`) ?? MAKERS[pose]()
    made.set(`${pose}:right`, right)
    frames =
      way === 'right'
        ? right
        : (LEFT_MAKERS[pose]?.() ?? right).map((f) => ({ rows: mirror(f.rows), ms: f.ms }))
    made.set(key, frames)
  }
  return frames
}
```

<!-- /code -->

- `Facing`: which way she faces. `Character` chooses it: toward the middle of the screen.
- `made`: the frames drawn so far, by pose and facing (such as `'idle:left'`), so each is drawn
  only once.
- `framesOf(pose, facing)`: as the comment says, a pose's frames. A walk faces the way she walks
  (`way`), whatever `facing` says. Frames not made yet are made from the right-facing ones (drawn
  now if they haven't been already), and facing left they're those mirrored, with the same times.
  The rig only ever draws her facing right, so every animation works both ways. A pose in
  `LEFT_MAKERS` is drawn again for facing left (with its letters back to front) before it's
  mirrored, instead of mirroring the right-facing frames: `LEFT_MAKERS[pose]?.() ?? right`.

### `animationLength()` and `mirror()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#animationLength,mirror -->

[`src/renderer/src/character/sprite.ts`, lines 1876–1883](../../apps/desktop/src/renderer/src/character/sprite.ts#L1876-L1883)

```ts
/** How long a pose's frames last altogether (a fidget's must match FIDGET_MS). */
export const animationLength = (pose: Name): number =>
  framesOf(pose, 'right').reduce((total, f) => total + f.ms, 0)

/** The frame mirrored left to right. */
export function mirror(rows: string[]): string[] {
  return rows.map((row) => [...row].reverse().join(''))
}
```

<!-- /code -->

- `animationLength(pose)`: as the comment says, how long a pose's frames last altogether.
  `reduce()` adds up each frame's `ms`, starting from 0. The tests use it to check every fidget
  matches `FIDGET_MS`.
- `mirror(rows)`: a whole frame mirrored left to right: each row's letters reversed (`[...row]`
  splits it into letters, and `join('')` puts them back together). Facing left, and the second
  glance in `look()`, are mirror images.

### `framePaths()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#framePaths -->

[`src/renderer/src/character/sprite.ts`, lines 1885–1909](../../apps/desktop/src/renderer/src/character/sprite.ts#L1885-L1909)

```ts
/**
 * A frame as one SVG path per colour: each run of same-coloured pixels along a row is one
 * rectangle, so a frame is a few dozen elements rather than thousands.
 */
export function framePaths(rows: string[]): { className: string; d: string }[] {
  const byColour = new Map<string, string[]>()
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const pixel = row[x]!
      let end = x + 1
      while (end < row.length && row[end] === pixel) end++
      if (pixel !== '.') {
        const runs = byColour.get(pixel) ?? []
        runs.push(`M${x} ${y}h${end - x}v1h-${end - x}z`)
        byColour.set(pixel, runs)
      }
      x = end
    }
  })
  return [...byColour].map(([pixel, runs]) => ({
    className: PALETTE[pixel] ?? 'px-hair-line',
    d: runs.join(''),
  }))
}
```

<!-- /code -->

Turns a frame into what the page draws: one SVG `<path>` per colour, rather than an element per
pixel (a frame has a few thousand).

- Each row is scanned for _runs_, stretches of the same letter. `while (end < row.length && row[end]
=== pixel) end++` finds where a run ends.
- A run becomes `M{x} {y}h{n}v1h-{n}z`: move to its top-left corner, a line `n` pixels across, one
  down, back, and close the shape. That's a rectangle `n` pixels wide and one tall, in grid units,
  which the `<svg>`'s `viewBox` makes one DIP each at her usual size.
- The runs are collected by letter in a `Map` (which keeps the order letters were first seen), and
  each letter's runs, joined, become one path with that letter's class.
- See-through runs (`.`) are skipped. A letter that isn't in the palette, which the tests rule out,
  would fall back to the darkest colour, the hair's outline (`px-hair-line`).

## `src/renderer/src/components/Character.tsx` and `character.css`: the character

The component that draws the character, used by the bubble's page and by the clones' page rather
than the panel's. It decides nothing itself: in the bubble, the main process chooses the pose
(`Pose` in `src/shared/character.ts`) and moves the window while she walks, `BubbleView` passes in
the pose, the way she faces (toward the middle of the screen) and how big to draw her, and this
plays the pose's frames from `character/sprite.ts`. `ClonesView` does the same for each clone, with
the pose and way of facing from `lib/clones.ts`.

### `paths`, `pathsOf()`, `ALL_POSES` and `Character`

<!-- code: apps/desktop/src/renderer/src/components/Character.tsx#paths,pathsOf,ALL_POSES,Character -->

[`src/renderer/src/components/Character.tsx`, lines 15–93](../../apps/desktop/src/renderer/src/components/Character.tsx#L15-L93)

```tsx
/** Each frame's SVG paths, worked out the first time it shows. */
const paths = new WeakMap<Frame, ReturnType<typeof framePaths>>()

function pathsOf(frame: Frame): ReturnType<typeof framePaths> {
  let found = paths.get(frame)
  if (!found) {
    found = framePaths(frame.rows)
    paths.set(frame, found)
  }
  return found
}

/** Every pose, for drawing ahead of time. */
const ALL_POSES: Pose[] = [
  'idle',
  'walk-left',
  'walk-right',
  'dragged',
  'flung',
  'splat',
  ...FIDGETS,
  ...SPELL_POSES,
  ...REACTIONS,
  ...HELD_POSES,
]

/**
 * The character: pixel art (character/sprite.ts) drawn `box` DIPs wide and a little taller, for
 * the room above her hat (SPRITE_HEADROOM), her feet on its bottom edge. In the bubble that fills
 * its window, which the main process keeps on the taskbar (one sprite pixel a DIP at her usual
 * size, more when she's bigger); her clones use it too. This plays the pose's frames, facing
 * `facing` (walking, she faces the way she walks). `expanded` tints her shadow while the panel is
 * open.
 */
export function Character(props: {
  pose: Pose
  facing: Facing
  box: number
  expanded?: boolean
  /** Watching the pointer (the `watch` pose): which way her eyes are on it. */
  gaze?: { x: number; y: number } | null
}) {
  const { facing } = props

  // Draws every pose's frames in the background, one pose at a time, so starting one never
  // stutters.
  useEffect(() => {
    const waiting = [...ALL_POSES]
    let timer = setTimeout(function next() {
      const pose = waiting.shift()
      if (!pose) return
      framesOf(pose, facing).forEach(pathsOf)
      timer = setTimeout(next, 50)
    }, 500)
    return () => clearTimeout(timer)
  }, [facing])

  return (
    <svg
      viewBox={`0 0 ${SPRITE_SIZE} ${SPRITE_SIZE + SPRITE_HEADROOM}`}
      width={props.box}
      height={(props.box * (SPRITE_SIZE + SPRITE_HEADROOM)) / SPRITE_SIZE}
      shapeRendering="crispEdges"
      className="character"
      data-pose={props.pose}
      data-expanded={props.expanded || undefined}
      aria-hidden
    >
      {/* A new pose (or way of facing) starts from its first frame. */}
      {props.pose === 'watch' && props.gaze ? (
        // Watching the pointer: a frame for where it is (not mirrored: it's which way on the screen).
        pathsOf(gazeFrame(props.gaze)).map(({ className, d }) => (
          <path key={className} className={className} d={d} />
        ))
      ) : (
        <Frames key={`${props.pose}:${facing}`} pose={props.pose} facing={facing} />
      )}
    </svg>
  )
}
```

<!-- /code -->

- `paths` and `pathsOf(frame)`: as the comment says, each frame's SVG paths (`framePaths()`),
  worked out the first time the frame shows and then kept, so showing it again is only swapping
  which paths are drawn. A `WeakMap` is keyed by the frame object itself, and doesn't keep a frame
  in memory on its own account (`sprite.ts` keeps the frames anyway).
  `ReturnType<typeof framePaths>` means "whatever `framePaths()` returns", so the type isn't
  written out twice.
- `ALL_POSES`: every pose, for drawing ahead of time: the four that aren't fidgets, then
  `...FIDGETS`, then her spells' poses, `...SPELL_POSES`.
- `Character({ pose, facing, box, expanded })`: the component itself. As the comment says, it draws
  her `box` DIPs wide and a little taller, for the room above her hat (`SPRITE_HEADROOM`), her feet
  on its bottom edge. In the bubble that fills its window, which the main process keeps on the
  taskbar; her clones use it too.
  - `facing`: which way she faces, `'left'` or `'right'` (`Facing` in `sprite.ts`). `BubbleView`
    faces her toward the middle of the screen: right from the left-hand corner, left from the
    right-hand one. As the comment says, walking, she faces the way she walks (`framesOf()` sees to
    that).
  - `box`: how big to draw her, across: 96 DIPs at her usual size, one sprite pixel a DIP, and
    more when she's bigger (192 at twice her size, two DIPs a pixel). Her height follows from it.
  - `expanded?`: as the comment says, tints her shadow while the panel is open. The `?` makes it
    optional: the clones leave it out.
  - The effect: as its comment says, it draws every pose's frames in the background, one pose at a
    time, so starting one never stutters. Drawing a pose means the rig drawing every frame and
    `framePaths()` turning each into paths, which, done on the spot, could make the pose's first
    frame late. It starts half a second after she first appears, then does one pose every 50 ms, so
    the page stays free to respond in between. `function next()` is named so it can schedule
    itself again, and `waiting.shift()` takes the next pose off the front of the list. The effect
    runs again when `facing` changes (she's moved to the other corner), and the cleanup cancels
    whatever was scheduled. Every clone runs it too, but frames and their paths are only ever made
    once (`framesOf()` and `pathsOf()` keep them), so after the first it costs next to nothing.
  - `<svg>`: with a `viewBox` of the whole frame, `SPRITE_SIZE` wide and
    `SPRITE_SIZE + SPRITE_HEADROOM` tall (96 by 104 pixels, the headroom rows at the top), so the
    browser scales the frame to fill it: each pixel is one DIP at her usual size, and `box / 96`
    DIPs otherwise.
  - `width={props.box}`, `height={(props.box * (SPRITE_SIZE + SPRITE_HEADROOM)) / SPRITE_SIZE}`:
    `box` wide, and as much taller as the frame is: `box × 104 / 96`, which is `box` plus the
    headroom (104 DIPs at her usual size, 208 at twice it), the same height as her window
    (`box + headroom` in `BubbleView`). The pixels stay square, and her feet stay on the bottom
    edge.
  - `shapeRendering="crispEdges"`: tells the browser not to smooth the rectangles' edges, so the
    pixels stay sharp, as pixel art should. At 125% display scaling a sprite pixel is 1.25 screen
    pixels, so some come out a screen pixel wider than others; crisp is still better than blurred.
  - `data-pose` (nothing reads it, but it shows the pose when inspecting the page in development)
    and `data-expanded` (which `character.css` uses to tint her shadow while the panel is open;
    `|| undefined` leaves the attribute off when it's false). `aria-hidden` because the button
    around it has the name screen readers need.
  - ``<Frames key={`${props.pose}:${facing}`} ... />``: as the comment says, a new pose (or way of
    facing) starts from its first frame. A different `key` makes React throw the old `Frames` away
    and make a new one, with its own state starting afresh, rather than carrying on from whatever
    frame the last pose was on.

### `Frames`

<!-- code: apps/desktop/src/renderer/src/components/Character.tsx#Frames -->

[`src/renderer/src/components/Character.tsx`, lines 95–114](../../apps/desktop/src/renderer/src/components/Character.tsx#L95-L114)

```tsx
/**
 * Plays a pose's frames, each for its time: round and round, or once for a fidget (stopping on
 * its last frame until the main process changes the pose). With Windows' reduced-motion setting,
 * just the first frame.
 */
function Frames({ pose, facing }: { pose: Pose; facing: Facing }) {
  const [index, setIndex] = useState(0)
  const [still] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const frames = framesOf(pose, facing)

  useEffect(() => {
    if (still || (!LOOPS[pose] && index === frames.length - 1)) return
    const timer = setTimeout(() => setIndex((i) => (i + 1) % frames.length), frames[index]!.ms)
    return () => clearTimeout(timer)
  }, [pose, index, frames, still])

  return pathsOf(frames[index]!).map(({ className, d }) => (
    <path key={className} className={className} d={d} />
  ))
}
```

<!-- /code -->

Plays a pose's frames, as the comment says.

- `index`: which frame shows. `still` is read once, when the component is made: whether Windows'
  reduced-motion setting is on (`matchMedia` asks the same question as the CSS
  `prefers-reduced-motion`). `useState(() => ...)` runs the question only the first time.
- `framesOf(pose, facing)`: the pose's frames, already drawn by the background work above, or
  drawn now if it hasn't got that far.
- The effect waits the current frame's time, then moves on to the next (`% frames.length` wraps
  round to the first). It runs again whenever `index` changes, so each frame schedules the next;
  the cleanup cancels the wait if the pose changes first (or the component goes).
- It stops when motion is reduced (the first frame stays) or at the last frame of a pose that
  doesn't loop (a fidget), where the main process takes over: it changes the pose just as the
  fidget ends.
- The return draws the frame: one `<path>` per colour, keyed by its class (a frame has one path per
  class), from `pathsOf()`.

### `character.css`

<!-- code: apps/desktop/src/renderer/src/components/character.css -->

[`src/renderer/src/components/character.css`, lines 1–153](../../apps/desktop/src/renderer/src/components/character.css#L1-L153)

```css
/*
 * The character's colours: one class per letter of character/sprite.ts's PALETTE. Each material
 * is a ramp of shades, cooler (bluer) in shadow and warmer in the light, and each part's outline
 * is a dark shade of its own colour. Her robe and hat are mixed from `--color-robe`, the colour
 * chosen in Settings (see useRobeColor), or without one the tenant's accent colour, so they match
 * the panel; the hat is always a darker shade of the robe.
 */

.character {
  display: block;
  overflow: visible;
}

/* Hair: silver-white, cool violet in the shadows, a warm shine. */
.px-hair-line {
  fill: #55507a;
}
.px-hair-shade {
  fill: #aba8cc;
}
.px-hair {
  fill: #dedcef;
}
.px-hair-light {
  fill: #f4f3fb;
}
.px-hair-shine {
  fill: #fffaf0;
}

/* Skin: pale, shadow toward rose. */
.px-skin-line {
  fill: #b9746c;
}
.px-skin-shade {
  fill: #efb9aa;
}
.px-skin {
  fill: #fde3d4;
}
.px-skin-light {
  fill: #fff2ea;
}
.px-blush {
  fill: #f6a5b0;
}

/* Eyes: a deep lash line, amber irises lighter toward the bottom, a white glint. */
.px-lash {
  fill: #2b1830;
}
.px-iris-dark {
  fill: #7a3f16;
}
.px-iris {
  fill: #d58a2c;
}
.px-iris-light {
  fill: #ffcf6b;
}
.px-white {
  fill: #fff;
}
.px-mouth {
  fill: #c2525e;
}

/* The robe, from the accent colour: deep indigo in the shadows, a little cream in the light. */
.px-robe-line {
  fill: color-mix(in oklab, var(--color-robe, var(--color-accent)) 45%, #140a24);
}
.px-robe-shade {
  fill: color-mix(in oklab, var(--color-robe, var(--color-accent)) 72%, #1e1b4b);
}
.px-robe {
  fill: var(--color-robe, var(--color-accent));
}
.px-robe-light {
  fill: color-mix(in oklab, var(--color-robe, var(--color-accent)) 70%, #fff4d6);
}

/* Silver trim, and a teal gem. */
.px-trim {
  fill: #e6e4f2;
}
.px-trim-shade {
  fill: #a6a2c4;
}
.px-gem {
  fill: #3fd0c0;
}
/* Leaves and stems (the flower she grows): fresh green, deeper in the shade. */
.px-leaf {
  fill: #6cc26a;
}
.px-leaf-shade {
  fill: #2f7d4f;
}

/* Gold embroidery on her robe and hat, and the buckles on her boots. */
.px-gold {
  fill: #f2c650;
}
.px-gold-shade {
  fill: #b3832c;
}

/* Her hat and her spellbook's cover: a deep shade of the accent colour. */
.px-hat {
  fill: color-mix(in oklab, var(--color-robe, var(--color-accent)) 55%, #1a1433);
}
.px-hat-shade {
  fill: color-mix(in oklab, var(--color-robe, var(--color-accent)) 38%, #120d26);
}
.px-hat-light {
  fill: color-mix(in oklab, var(--color-robe, var(--color-accent)) 80%, #1a1433);
}

/* Stockings and boots. */
.px-clothes-line {
  fill: #19162a;
}
.px-stocking {
  fill: #34304d;
}
.px-stocking-shade {
  fill: #24213a;
}
.px-boot {
  fill: #7a4a35;
}
.px-boot-shade {
  fill: #4a2a20;
}
.px-boot-light {
  fill: #a8704f;
}

/* Her shadow on the taskbar, in the accent colour while the panel is open. */
.px-shadow {
  fill: rgb(0 0 0 / 0.22);
}
.character[data-expanded] .px-shadow {
  fill: color-mix(in srgb, var(--color-accent) 70%, transparent);
}

/* A soft glow round her when the pointer is over her. */
.character {
  transition: filter 0.15s ease-out;
}
button:hover .character {
  filter: drop-shadow(0 0 2px rgb(255 255 255 / 0.9));
}
```

<!-- /code -->

The character's colours: a rule per palette class, as the comment says.

- Each material is a ramp of shades, and the shades aren't just the base colour made darker and
  lighter: as the comment says, they shift in hue, cooler (bluer) in shadow and warmer in the
  light. Her silver-white hair is lavender and violet in its shadows and a warm ivory in its shine;
  the skin's shadow leans toward rose. This _hue shifting_ is a staple of pixel art: shadows that
  are only darker look grey and dirty, while real shadows pick up the cool of the sky and lit parts
  the warmth of the light.
- Each outline (`-line`) is the darkest shade of its own material (a dusky violet for the hair, a
  rose for the skin), not black, for the selective outlining `ink()` does.
- The eyes: a near-black lash line with a touch of purple, amber irises from brown to gold
  (`.px-iris-dark`, `.px-iris`, `.px-iris-light`), and white for the glint.
- The robe is mixed from `var(--color-accent)`, the tenant's colour: `.px-robe` is the accent
  itself, its shadow 72% accent and 28% deep indigo (`#1e1b4b`), its outline darker still (45%
  accent with a near-black purple), and its light 70% accent with a little cream (`#fff4d6`). So
  another tenant's character wears their colour, with the same cool shadows and warm light as the
  rest of her. `color-mix(in oklab, ...)` mixes in _Oklab_, a colour space built so that equal
  steps look equally different to the eye. Mixing there keeps the shades clean, where mixing plain
  RGB values tends to pass through dull, greyish colours.
- The trim is silver, a pale lavender-white with a greyer shade, and the brooch's gem is teal.
- The gold of her embroidery and buckles is a warm yellow with a deeper ochre shade, which stands
  out on the deep robe and hat in any accent colour.
- The hat (and the spellbook's cover, which uses the same classes) is a deep shade of the accent
  colour, mixed with a near-black indigo: 55% accent for its base, 38% for its shadow and 80% for
  its light, so it reads as darker than the robe but the same family.
- The stockings are a dark slate violet, the boots brown in three shades, and they share one dark
  outline (`.px-clothes-line`).
- `.px-shadow`: black at 22%, so the taskbar shows through. While the panel is open
  (`data-expanded`), it's the accent colour at 70%, a hint that she's the one that's open.
- `button:hover .character`: when the pointer is over the bubble's button, a soft white glow round
  her (`drop-shadow` follows the shape of the drawing, not its box), fading in over 0.15 s.

## `src/renderer/src/lib/spellMotion.ts`: where things are in her spells' effects

As the comment at the top says, where things are in her spells' effects, moment by moment:
starfall's shooting stars, the explosion's magic circles, and how big its blast is.
`lib/spellArt.ts` (below) draws them, for `SpellView` (see [The pages](7-renderer-pages.md)). The
six newer spells in `lib/spells/` keep their own sums beside their drawing, but use its `Scene`
and its helpers.
Everything is in the effects' pixels, twice the size of hers, and every time is in milliseconds
since the spell was cast. Two ideas run through it:

- **Each frame from scratch.** Nothing moves a star on a little each frame: where it is comes from
  `t` alone. So any moment can be drawn, a slow frame never puts things out of step, and the page
  keeps nothing from one frame to the next.
- **Random, but the same every frame.** The stars, sparks and smoke are scattered at random, but
  from a _seeded_ generator, which gives the same numbers every time it starts from the same seed.
  Each frame starts it afresh, so each frame has the same stars in the same places, only further
  along.

Nothing here draws, so `tests/spellMotion.test.ts` can test it without a page.

### `Scene`

<!-- code: apps/desktop/src/renderer/src/lib/spellMotion.ts#Scene -->

[`src/renderer/src/lib/spellMotion.ts`, lines 3–25](../../apps/desktop/src/renderer/src/lib/spellMotion.ts#L3-L25)

```ts
// Where things are in her spells' effects, moment by moment (see lib/spellArt.ts, which draws
// them): starfall's shooting stars, the explosion's magic circles and how big its blast is. In the
// effects' pixels (twice the size of hers), times in ms since the spell was cast. Anything random
// comes from a seeded generator, so each frame has the same stars, sparks and smoke. Nothing here
// draws, so it can be tested away from a page.

/** What a frame is drawn from. */
export interface Scene {
  /** Since the spell was cast (ms). */
  t: number
  /** The canvas's size (pixels). */
  w: number
  h: number
  /** Where she stands across it, and how far down her feet are (pixels). */
  x: number
  feet: number
  /** How many canvas pixels she is tall (her 92 sprite pixels, hat to boots). */
  height: number
  /** Her accent colour (the robe, the magic circles). */
  accent: string
  /** Windows' reduced-motion setting: nothing moves; things just show. */
  still: boolean
}
```

<!-- /code -->

As its comment says, what a frame is drawn from. `SpellView` builds one every frame and hands it to
the spell's drawing function (`SPELL_ART` in `spellArt.ts`).

- `t`: as its comment says, the time since the spell was cast.
- `w`, `h`: the canvas's size, in its own pixels.
- `x`, `feet`: where she stands across the canvas, and how far down it her feet are.
- `height`: as its comment says, how many canvas pixels tall she is, from hat to boots. Her 92
  sprite pixels make 46 of the effects' pixels, whatever her size, since both grow with her.
- `accent`: her accent colour, the colour of her robe, which the magic circles are drawn in (and
  the vortex, in part).
- `still`: as its comment says, Windows' reduced-motion setting: nothing moves; things just show.

### `seeded()`, `clamp01`, `easeOut` and `between`

<!-- code: apps/desktop/src/renderer/src/lib/spellMotion.ts#seeded,clamp01,easeOut,between -->

[`src/renderer/src/lib/spellMotion.ts`, lines 27–44](../../apps/desktop/src/renderer/src/lib/spellMotion.ts#L27-L44)

```ts
/** A seeded random number generator (mulberry32): the same numbers, 0 to 1, every time. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** `v` kept between 0 and 1. */
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Fast at first, slowing to a stop. */
export const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3

/** 0 before `from`, 1 after `to`, in between in a straight line. */
export const between = (t: number, from: number, to: number) => clamp01((t - from) / (to - from))
```

<!-- /code -->

- `seeded(seed)`: as its comment says, a seeded random number generator: the function it returns
  gives numbers from 0 to 1, and the same ones, in the same order, every time it's made with the
  same seed. It's _mulberry32_, a well-known tiny generator. `a` is its state, a 32-bit whole
  number moved on by a fixed odd step (`0x6d2b79f5`) at each call; the lines after scramble it
  (`Math.imul` is a 32-bit multiply, and `^` and `>>>` mix the bits), and dividing by 2³²
  (4294967296) turns the result into a fraction. `>>> 0` keeps each value a positive 32-bit number.
  A test checks two generators with the same seed agree.
- `clamp01(v)`: as its comment says, `v` kept between 0 and 1.
- `easeOut(t)`: as its comment says, fast at first, slowing to a stop: `1 - (1 - t)³` rises steeply
  from 0 and flattens out as it reaches 1. It's for things that burst out and settle: a magic
  circle growing, the fireball, the shock wave.
- `between(t, from, to)`: as its comment says, 0 before `from`, 1 after `to`, and in a straight line
  in between: how far through a stretch of time `t` is. Most of the timings in `spellArt.ts` and
  `lib/spells/` are written with it.

### `lattice()` and `noise()`

<!-- code: apps/desktop/src/renderer/src/lib/spellMotion.ts#lattice,noise -->

[`src/renderer/src/lib/spellMotion.ts`, lines 46–64](../../apps/desktop/src/renderer/src/lib/spellMotion.ts#L46-L64)

```ts
/** A lattice point's random number, for noise. */
function lattice(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Smooth value noise, 0 to 1: turbulence for fire and smoke. */
export function noise(x: number, y: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const top = lattice(x0, y0) + (lattice(x0 + 1, y0) - lattice(x0, y0)) * sx
  const bottom = lattice(x0, y0 + 1) + (lattice(x0 + 1, y0 + 1) - lattice(x0, y0 + 1)) * sx
  return top + (bottom - top) * sy
}
```

<!-- /code -->

- `lattice(x, y)`: as its comment says, a random number for a point on a grid of whole numbers,
  the same every time, made the same way as the rig's `hash()`.
- `noise(x, y)`: as its comment says, smooth _value noise_, from 0 to 1: random numbers at the
  grid's points, blended smoothly in between, so it changes gradually as `x` and `y` change rather
  than jumping about as plain random numbers do. It's the turbulence that gives the fireball its
  ragged, churning edges, and the storm clouds, the snowdrift and the phoenix's tail their lumps
  and flicker.
  - `x0`, `y0`: the top-left corner of the grid square the point is in; `fx`, `fy` how far past it
    the point is.
  - `sx`, `sy`: those fractions eased (`f * f * (3 - 2 * f)`, the _smoothstep_ curve, as in
    `VisionView`), so the blend has no corners where it crosses a grid line.
  - `top`, `bottom`: blended across, between the square's two top corners and its two bottom ones;
    then `top + (bottom - top) * sy` blends down between those.

### `Star`, `STAR_COLOURS`, `STAR_DIRECTION` and `starsAt()`

<!-- code: apps/desktop/src/renderer/src/lib/spellMotion.ts#Star,STAR_COLOURS,STAR_DIRECTION,starsAt -->

[`src/renderer/src/lib/spellMotion.ts`, lines 66–113](../../apps/desktop/src/renderer/src/lib/spellMotion.ts#L66-L113)

```ts
/** A shooting star in the sky: where its head is, which way it's going, and how old it is. */
export interface Star {
  x: number
  y: number
  /** Its direction (a unit vector: down and to the left). */
  dx: number
  dy: number
  /** How long it's been falling, and how long it falls for (ms). */
  age: number
  life: number
  colour: string
}

/** The shooting stars' colours, and the way they all fall: down, and a little to the left. */
export const STAR_COLOURS = ['#fff7d6', '#fde68a', '#bae6fd', '#fbcfe8', '#ddd6fe']

export const STAR_DIRECTION = { dx: -0.5, dy: 0.866 }

/**
 * The shooting stars falling at `t`: STARFALL.perSecond start each second (each up to 0.3 s
 * late), from along the top of the screen and off its right-hand side, each falling down to the
 * left for a second or so, at its own speed.
 */
export function starsAt(t: number, w: number, h: number): Star[] {
  const random = seeded(7)
  const count = Math.floor((STARFALL.durationMs / 1000) * STARFALL.perSecond)
  const stars: Star[] = []
  for (let i = 0; i < count; i++) {
    // Every number is drawn whether or not the star is falling yet, so each keeps its own.
    const born = (i / STARFALL.perSecond) * 1000 + random() * 300
    const life = 900 + random() * 700
    const startX = random() * w * 1.4
    const startY = -random() * h * 0.25
    const speed = ((w + h) / 1400) * (0.7 + random() * 0.6)
    const colour = STAR_COLOURS[Math.floor(random() * STAR_COLOURS.length)]!
    const age = t - born
    // None starts too late to be gone by the end.
    if (age < 0 || age > life || born + 1600 > STARFALL.durationMs - 100) continue
    stars.push({
      x: startX + STAR_DIRECTION.dx * speed * age,
      y: startY + STAR_DIRECTION.dy * speed * age,
      ...STAR_DIRECTION,
      age,
      life,
      colour,
    })
  }
  return stars
}
```

<!-- /code -->

- `Star`: as its comment says, a shooting star in the sky: where its head is (`x`, `y`), which way
  it's going (`dx`, `dy`, a unit vector: a step of length 1), how long it's been falling (`age`) and
  how long it falls for (`life`), and its colour.
- `STAR_COLOURS`: as the comment says, the shooting stars' colours: pale cream, gold, blue, pink and
  violet.
- `STAR_DIRECTION`: the way they all fall. `dx: -0.5, dy: 0.866` is 60° below level, to the left
  (0.866 is √3/2, so the step is 1 long).
- `starsAt(t, w, h)`: as its comment says, the shooting stars falling at `t`. It goes through every
  star the spell will have, works each one out from scratch, and keeps those falling now.
  - `const random = seeded(7)`: the same seed every call, so every frame draws the same numbers for
    the same stars.
  - `count`: how many stars in all: 10 seconds at 7 a second, 70.
  - `// Every number is drawn whether or not the star is falling yet`: as the comment says, each
    star takes its numbers in turn, so each keeps its own whatever the time. Skipping the ones not
    yet falling would hand later stars different numbers from frame to frame.
  - `born`: when star `i` starts: `i / perSecond` seconds in, so 7 a second, and up to 0.3 seconds
    later at random, so they don't come like clockwork.
  - `life`: how long it falls, 0.9 to 1.6 seconds.
  - `startX`, `startY`: where it starts: anywhere from the left edge to 1.4 times the width across
    (off the right-hand side, so stars come in from there too), and up to a quarter of the height
    above the top.
  - `speed`: how fast, in pixels a millisecond: `(w + h) / 1400`, for the screen's size, so they
    cross a big screen as quickly as a small one, times 0.7 to 1.3 for each star's own speed.
  - `colour`: one of `STAR_COLOURS`, at random. The `!` tells TypeScript the index is in range.
  - `if (age < 0 || age > life || born + 1600 > STARFALL.durationMs - 100) continue`: a star is
    left out if it hasn't started, has finished, or, as the comment says, would start too late to be
    gone by the end (one can fall for up to 1.6 seconds, and the window closes at 10). So no star
    starts after 8.3 seconds, and the last have gone before the window closes; a test checks there
    are none after the spell.
  - `x: startX + STAR_DIRECTION.dx * speed * age`, `y`: where its head is now: as far along its
    direction as it has gone at its speed.

### `Circle` and `pillarCircles()`

<!-- code: apps/desktop/src/renderer/src/lib/spellMotion.ts#Circle,pillarCircles -->

[`src/renderer/src/lib/spellMotion.ts`, lines 115–152](../../apps/desktop/src/renderer/src/lib/spellMotion.ts#L115-L152)

```ts
/** One of the pillar's magic circles: where it is, how big, when it comes, and which way it turns. */
export interface Circle {
  cx: number
  cy: number
  rx: number
  ry: number
  born: number
  turn: 1 | -1
}

/**
 * The pillar's magic circles, EXPLOSION.circles of them, stacked up from just above her hat to
 * near the top of the screen: flat ellipses (seen from the side, like the one under her feet),
 * every other one a little bigger and turning the other way, coming one after another over the
 * first two thirds of the chant.
 */
export function pillarCircles(scene: Pick<Scene, 'w' | 'h' | 'x' | 'feet' | 'height'>): Circle[] {
  const n = EXPLOSION.circles
  const size = Math.min(scene.w * 0.2, Math.max(20, scene.height * 1.25))
  // The lowest clear of her hat (the biggest circles are 1.2 × size across, and 0.3 as deep).
  const bottom = scene.feet - scene.height - size * 0.36 - 3
  const top = Math.min(bottom - 6 * (n - 1), Math.max(10, scene.h * 0.08))
  const gap = (bottom - top) / (n - 1)
  // Above her, but with most of every circle on the screen (80% of the bigger ones, which are 1.2
  // times as wide), even with her right in a corner.
  const cx = Math.min(Math.max(scene.x, size * 0.96), scene.w - size * 0.96)
  return Array.from({ length: n }, (_, i) => {
    const rx = size * (i % 2 === 0 ? 1 : 1.2)
    return {
      cx,
      cy: bottom - i * gap,
      rx,
      ry: rx * 0.3,
      born: 500 + i * ((EXPLOSION.chantMs * 0.66) / n),
      turn: i % 2 === 0 ? 1 : -1,
    }
  })
}
```

<!-- /code -->

- `Circle`: as its comment says, one of the pillar's magic circles: its middle (`cx`, `cy`), its two
  radii (`rx` across and `ry` up and down, as it's flat), when it comes (`born`, ms into the chant)
  and which way it turns (`turn`).
- `pillarCircles(scene)`: as its comment says, the pillar's `EXPLOSION.circles` (7) magic circles,
  stacked from just above her hat to near the top of the screen: flat ellipses, as if seen from the
  side, like the one under her feet; every other one a little bigger and turning the other way; and
  coming one after another over the first two thirds of the chant. `Pick<Scene, ...>` asks only for
  the parts of a `Scene` it needs, which keeps it simple to test.
  - `size`: the smaller circles' radius across: 1.25 times her height (at least 20 pixels), but
    never more than a fifth of the screen's width.
  - `bottom`: as the comment says, the lowest circle's middle, clear of her hat: up from her feet by
    her height, to the top of her hat, then far enough again for the biggest circle's lower edge to
    clear it (0.36 of `size` below its middle: it's 1.2 times as wide, and 0.3 as deep), and 3
    pixels more.
  - `top`: the highest circle's middle: 8% of the way down the screen (at least 10 pixels), unless
    that would bunch them closer than 6 pixels apart; then 6 pixels a circle above the lowest.
  - `gap`: from one circle's middle to the next, spread evenly between the two.
  - `cx`: as the comment says, above her, but with most of every circle on the screen (80% of the
    bigger ones), even with her right in a corner: her `x`, kept at least 0.96 of `size` from either
    edge. A test checks that.
  - `rx = size * (i % 2 === 0 ? 1 : 1.2)`: every other circle 1.2 times as big.
  - `ry: rx * 0.3`: three tenths as deep as it is wide, a flat ellipse.
  - `born: 500 + i * ((EXPLOSION.chantMs * 0.66) / n)`: the first half a second into the chant, then
    one every 1.4 seconds or so, the last about 9 seconds in, before two thirds of the 15-second
    chant is over.
  - `turn: i % 2 === 0 ? 1 : -1`: every other circle turns the other way.

### `blastAt()`

<!-- code: apps/desktop/src/renderer/src/lib/spellMotion.ts#blastAt -->

[`src/renderer/src/lib/spellMotion.ts`, lines 154–160](../../apps/desktop/src/renderer/src/lib/spellMotion.ts#L154-L160)

```ts
/** The explosion's size at `b` ms after the bang: its fireball's radius, and its shock wave's. */
export function blastAt(b: number, w: number, h: number): { fire: number; shock: number } {
  const full = Math.min(w, h) * 0.36
  const fire = full * (easeOut(b / 650) + 0.25 * between(b, 650, EXPLOSION.boomMs))
  const shock = full * 2.6 * easeOut(b / 1000)
  return { fire, shock }
}
```

<!-- /code -->

As its comment says, the explosion's size `b` milliseconds after the bang: its fireball's radius,
and its shock wave's.

- `full`: 36% of the screen's shorter side, the fireball's size once it has burst.
- `fire`: it bursts out to `full` in the first 0.65 seconds, fast and then slowing (`easeOut`),
  then grows by a quarter as much again, slowly and steadily, until the bang is over: a fireball
  that billows on as it cools. A test checks it bursts out fast, then grows slowly.
- `shock`: the shock wave races out to 2.6 times `full` over the first second, slowing as it goes.

## `src/renderer/src/lib/pixels.ts`: drawing a pixel at a time

As the comment at the top says, drawing pixel art for her spells' effects, a pixel at a time.
Everything draws through a `Painter`, the one thing it needs from a canvas: filling a rectangle
with a colour. So the effects can be drawn, and tested, away from a page. On a page,
`lib/spellArt.ts` (next) makes a `Painter` of the canvas; `tests/moreSpells.test.ts` passes one
that only counts what's drawn. Every spell draws with the helpers here: starfall and the explosion
in `spellArt.ts`, and the other six in `lib/spells/` (after it).

### `Painter`

<!-- code: apps/desktop/src/renderer/src/lib/pixels.ts#Painter -->

[`src/renderer/src/lib/pixels.ts`, lines 1–9](../../apps/desktop/src/renderer/src/lib/pixels.ts#L1-L9)

```ts
// Drawing pixel art for her spells' effects, a pixel at a time. Everything draws through a
// Painter, the one thing it needs from a canvas (filling a rectangle with a colour), so the
// effects can be drawn, and tested, away from a page. On a page, spellArt.ts makes one of a
// canvas's 2D context.

/** What the spells draw with: fills a rectangle of pixels with `colour`, at `alpha` (0 to 1). */
export interface Painter {
  rect(x: number, y: number, width: number, height: number, colour: string, alpha: number): void
}
```

<!-- /code -->

As its comment says, what the spells draw with: one method, `rect`, which fills a rectangle of
pixels (`width` by `height`, its top-left corner at `x`, `y`) with `colour` at `alpha` opacity,
from 0 (clear) to 1 (solid). A 1 by 1 rectangle is one pixel. An `interface` only describes a
shape: anything with a `rect` method like this one is a `Painter`, whether it paints a canvas or
only counts the calls.

### `plot()`, `square()` and `twinkle()`

<!-- code: apps/desktop/src/renderer/src/lib/pixels.ts#plot,square,twinkle -->

[`src/renderer/src/lib/pixels.ts`, lines 11–30](../../apps/desktop/src/renderer/src/lib/pixels.ts#L11-L30)

```ts
/** Sets one pixel (rounded to the nearest), if `alpha` is above nothing. */
export function plot(p: Painter, x: number, y: number, colour: string, alpha = 1): void {
  if (alpha <= 0) return
  p.rect(Math.round(x), Math.round(y), 1, 1, colour, Math.min(1, alpha))
}

/** A square of `size` pixels, its top-left corner at `x`, `y`. */
export function square(p: Painter, x: number, y: number, size: number, colour: string, alpha = 1) {
  if (alpha <= 0) return
  p.rect(Math.round(x), Math.round(y), size, size, colour, Math.min(1, alpha))
}

/** A plus-shaped twinkle: a white pixel and its four neighbours in `colour`, a little fainter. */
export function twinkle(p: Painter, x: number, y: number, colour: string, alpha = 1): void {
  plot(p, x, y, '#ffffff', alpha)
  plot(p, x + 1, y, colour, alpha * 0.8)
  plot(p, x - 1, y, colour, alpha * 0.8)
  plot(p, x, y + 1, colour, alpha * 0.8)
  plot(p, x, y - 1, colour, alpha * 0.8)
}
```

<!-- /code -->

The smallest pieces everything is drawn with. Each takes the `Painter` to draw on first (`p`).

- `plot(p, x, y, colour, alpha)`: as its comment says, sets one pixel, in `colour` at `alpha`
  opacity (fully opaque if left out), on the nearest whole pixel (`Math.round`). Nothing is drawn
  for an `alpha` of 0 or less, so callers can fade things out without checking first, and above 1
  it's kept to 1 (`Math.min(1, alpha)`). A pixel off the canvas the canvas itself leaves out.
- `square(p, x, y, size, colour, alpha)`: as its comment says, a square `size` pixels across, its
  top-left corner at `x`, `y` (rounded), in one rectangle, with the same checks as `plot()`. The
  newer spells use it for anything chunkier than a pixel: a rocket's head, a spark, a butterfly's
  pixels at its size.
- `twinkle(p, x, y, colour, alpha)`: as its comment says, a plus-shaped twinkle: a white pixel in
  the middle, and its four neighbours (right, left, below and above) in `colour`, a little fainter
  (80%).

### `line()`, `ring()` and `disc()`

<!-- code: apps/desktop/src/renderer/src/lib/pixels.ts#line,ring,disc -->

[`src/renderer/src/lib/pixels.ts`, lines 32–108](../../apps/desktop/src/renderer/src/lib/pixels.ts#L32-L108)

```ts
/** A straight line of pixels (Bresenham's), at most 2000 long. */
export function line(
  p: Painter,
  from: { x: number; y: number },
  to: { x: number; y: number },
  colour: string,
  alpha = 1,
): void {
  let x = Math.round(from.x)
  let y = Math.round(from.y)
  const x1 = Math.round(to.x)
  const y1 = Math.round(to.y)
  const dx = Math.abs(x1 - x)
  const dy = -Math.abs(y1 - y)
  const sx = x < x1 ? 1 : -1
  const sy = y < y1 ? 1 : -1
  let error = dx + dy
  for (let i = 0; i < 2000; i++) {
    plot(p, x, y, colour, alpha)
    if (x === x1 && y === y1) return
    const e2 = 2 * error
    if (e2 >= dy) {
      error += dy
      x += sx
    }
    if (e2 <= dx) {
      error += dx
      y += sy
    }
  }
}

/** An ellipse's outline, a pixel at a time; `gap` leaves every other `gap` radians out (dashes). */
export function ring(
  p: Painter,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  colour: string,
  alpha = 1,
  turn = 0,
  gap = 0,
): void {
  if (rx < 0.5) return
  const steps = Math.max(8, Math.ceil(Math.PI * 2 * Math.max(rx, ry)))
  for (let k = 0; k < steps; k++) {
    const a = (k / steps) * Math.PI * 2
    if (gap && Math.floor((a + turn) / gap) % 2 === 1) continue
    plot(p, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, colour, alpha)
  }
}

/** A filled ellipse, a row of pixels at a time. */
export function disc(
  p: Painter,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  colour: string,
  alpha = 1,
): void {
  if (alpha <= 0 || rx < 0.5 || ry < 0.5) return
  for (let dy = -Math.floor(ry); dy <= Math.floor(ry); dy++) {
    const half = rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2))
    if (half < 0.5) continue
    p.rect(
      Math.round(cx - half),
      Math.round(cy + dy),
      Math.round(half * 2),
      1,
      colour,
      Math.min(1, alpha),
    )
  }
}
```

<!-- /code -->

Lines and ellipses, still a pixel at a time.

- `line(p, from, to, colour, alpha)`: as its comment says, a straight line of pixels, by
  _Bresenham's algorithm_, the classic way to draw a line on a grid. It steps a pixel at a time from
  one end toward the other, keeping a running `error`, how far the pixels have strayed from the true
  line, and steps across (`x += sx`), down (`y += sy`) or both, whichever keeps closest. So the line
  has no gaps and no doubled pixels. `sx` and `sy` are which way to step (1 or -1). It stops at the
  far end; as the comment says, it's at most 2000 pixels long: `i < 2000` is only a safety limit,
  so a bad number can never make it loop for ever.
- `ring(p, cx, cy, rx, ry, colour, alpha, turn, gap)`: as its comment says, an ellipse's outline, a
  pixel at a time: `rx` across and `ry` up and down from its middle.
  - `if (rx < 0.5) return`: too small to draw.
  - `steps`: how many points to plot round it: about one per pixel round the circle of its longer
    radius (2π × the radius), and at least 8, so it has no gaps.
  - `a`: each point's angle; `Math.cos(a) * rx` and `Math.sin(a) * ry` put it on the ellipse.
  - `gap`: as the comment says, leaves every other `gap` radians out, for a dashed ring, and `turn`
    turns the dashes round it. `Math.floor((a + turn) / gap) % 2 === 1` is true for every other
    stretch of `gap` radians.
- `disc(p, cx, cy, rx, ry, colour, alpha)`: as its comment says, a filled ellipse, a row of pixels
  at a time. The spells use it for soft glows: a faint disc of colour behind a burst, round the
  vortex, about the phoenix. (The magic circles' glow in `spellArt.ts` is filled the same way.)
  Nothing is drawn if it's clear, or less than half a pixel across or down.
  - `for (let dy = -Math.floor(ry); dy <= Math.floor(ry); dy++)`: a row for each pixel of its
    height, from top to bottom.
  - `half`: how far the ellipse reaches either side of its middle at that height, from the
    ellipse's equation (`1 - (dy / ry) ** 2` is how much of its width is left there, and the square
    root turns that into a share of `rx`). A row less than a pixel wide is skipped.
  - `p.rect(...)`: the row, one rectangle a pixel high, from `cx - half` to `cx + half`.

## `src/renderer/src/lib/spellArt.ts`: drawing her spells' effects

As the comment at the top says, the pixel art of her spells' effects, which `SpellView` draws each
frame: which spell draws what (`SPELL_ART`, at the end of the file), and, here, starfall's shooting
stars and the explosion's pillar of magic circles and its bang. The other six each have a file of
their own in `lib/spells/` (after this one). Everything is drawn a pixel at a time, with the
helpers in `lib/pixels.ts` (above), on a small canvas that the page stretches over its window
without smoothing, so it's crisp pixel art like her. Where things are, moment by moment, comes
from `lib/spellMotion.ts` (above).

**Drawing on a canvas.** `SpellView` hands each frame the canvas's 2D drawing context, the object
everything on a canvas is drawn through. Its `fillStyle` is the colour to paint with, its
`globalAlpha` how opaque (from 0, clear, to 1), and `fillRect(x, y, width, height)` paints a
rectangle. Each frame starts on a cleared canvas (`SpellView`), and whatever is drawn later in a
frame goes over what came before. Only `canvasPainter()` (next) and the explosion's fireball use
the context directly; everything else draws on the `Painter` made of it.

### `canvasPainter()`

<!-- code: apps/desktop/src/renderer/src/lib/spellArt.ts#canvasPainter -->

[`src/renderer/src/lib/spellArt.ts`, lines 22–37](../../apps/desktop/src/renderer/src/lib/spellArt.ts#L22-L37)

```ts
// The pixel art of her spells' effects (see SpellView): which spell draws what (SPELL_ART), and
// here starfall's shooting stars and the explosion's pillar of magic circles and its bang (the
// others each have a file of their own in lib/spells/). Everything is drawn a pixel at a time
// (lib/pixels.ts) on a small canvas that the page stretches over its window without smoothing, so
// it's crisp pixel art like her. Where things are, moment by moment, comes from lib/spellMotion.ts.

/** A Painter (lib/pixels.ts) that draws on a canvas's 2D context. */
export function canvasPainter(g: CanvasRenderingContext2D): Painter {
  return {
    rect(x, y, width, height, colour, alpha) {
      g.globalAlpha = alpha
      g.fillStyle = colour
      g.fillRect(x, y, width, height)
    },
  }
}
```

<!-- /code -->

As its comment says, a `Painter` (`lib/pixels.ts`) that draws on a canvas's 2D context. It returns
a plain object with the one method a `Painter` needs: `rect` sets the opacity (`g.globalAlpha`) and
the colour (`g.fillStyle`), then paints the rectangle (`g.fillRect`). It rounds and checks nothing
itself: `plot()` and the other helpers have done that already. Since every rectangle sets its own
opacity, nothing has to put `globalAlpha` back afterwards. `SPELL_ART` (at the end of the file)
makes one of the canvas for each spell that draws on a `Painter`.

### `drawStarfall()`

<!-- code: apps/desktop/src/renderer/src/lib/spellArt.ts#drawStarfall -->

[`src/renderer/src/lib/spellArt.ts`, lines 39–72](../../apps/desktop/src/renderer/src/lib/spellArt.ts#L39-L72)

```ts
// --------------------------------------------------------------------------------- starfall

/** Starfall: twinkling stars over the top of the screen, and shooting stars streaking down it. */
export function drawStarfall(g: Painter, scene: Scene): void {
  const { t, w, h, still } = scene
  const shown = still ? 1 : Math.min(1, t / 600, (STARFALL.durationMs - t) / 1000)
  // Twinkles, over the top two thirds of the screen, each brightening and dimming in its time.
  const random = seeded(3)
  for (let i = 0; i < 130; i++) {
    const x = random() * w
    const y = random() * h * 0.66
    const phase = random() * Math.PI * 2
    const glow = still ? 0.7 : 0.5 + 0.5 * Math.sin(t / 260 + phase)
    if (glow > 0.75) twinkle(g, x, y, '#fde68a', shown * glow)
    else plot(g, x, y, '#ffffff', shown * glow)
  }
  if (still) return
  for (const star of starsAt(t, w, h)) {
    const fading = Math.min(1, (star.life - star.age) / 300) * shown
    // Its tail: back along its path, fading to nothing, with a fainter glow beside it.
    for (let k = 1; k <= 30; k++) {
      const tx = star.x - star.dx * k * 1.3
      const ty = star.y - star.dy * k * 1.3
      const left = 1 - k / 31
      plot(g, tx, ty, k < 6 ? '#ffffff' : star.colour, fading * left)
      plot(g, tx + 1, ty, star.colour, fading * left * 0.35)
    }
    // Its head: a bright square with a twinkle round it.
    twinkle(g, star.x, star.y, star.colour, fading)
    plot(g, star.x + 1, star.y, '#ffffff', fading)
    plot(g, star.x, star.y + 1, '#ffffff', fading)
    plot(g, star.x + 1, star.y + 1, '#ffffff', fading)
  }
}
```

<!-- /code -->

As its comment says, starfall: twinkling stars over the top of the screen, and shooting stars
streaking down it. It draws on a `Painter` (`g`), which `SPELL_ART` makes of the canvas.

- `shown`: how much of it shows: fading in over the first 0.6 seconds and out over the last second
  (the smallest of the three), or all of it with reduced motion.
- The twinkles: as the comment says, 130 of them over the top two thirds of the screen, each
  brightening and dimming in its time. `seeded(3)` scatters them the same way every frame. `glow`
  swings between 0 and 1 (a sine wave, a full swing about every 1.6 seconds, each starting at its
  own `phase`); a bright one (`glow > 0.75`) is a gold twinkle round a white middle, and the rest a
  single white pixel, as faint as their glow. With reduced motion each holds still at 0.7.
- `if (still) return`: with reduced motion there are no shooting stars, only the still twinkles.
- `for (const star of starsAt(t, w, h))`: the shooting stars falling now (`spellMotion.ts`).
- `fading`: each fades out over its last 0.3 seconds, and with the whole spell.
- Its tail: as the comment says, back along its path, fading to nothing, with a fainter glow beside
  it: 30 pixels, 1.3 pixels apart, back the way it came (`- star.dx * k * 1.3`), each fainter than
  the last (`left`). The first five are white and the rest its colour, and each has a faint pixel of
  its colour beside it (`tx + 1`), so the tail is a little thicker.
- Its head: as the comment says, a bright square (two white pixels by two) with a twinkle round it
  in its colour.

### `magicCircle()`

<!-- code: apps/desktop/src/renderer/src/lib/spellArt.ts#magicCircle -->

[`src/renderer/src/lib/spellArt.ts`, lines 74–129](../../apps/desktop/src/renderer/src/lib/spellArt.ts#L74-L129)

```ts
// --------------------------------------------------------------------------------- explosion

/** One magic circle at `t`: rings, a turning ring of runes, a six-pointed star, a bright heart. */
function magicCircle(g: Painter, c: Circle, t: number, power: number, accent: string) {
  const age = t - c.born
  if (age < 0) return
  const grown = easeOut(age / 450)
  const flash = 1 - between(age, 450, 900)
  const rx = c.rx * grown
  const ry = c.ry * grown
  const spin = (c.turn * age * (0.0008 + power * 0.004)) % (Math.PI * 2)
  const bright = 0.75 + power * 0.25
  // A soft glow filling it, in her colour.
  for (let dy = -Math.floor(ry); dy <= Math.floor(ry); dy++) {
    const half = rx * Math.sqrt(Math.max(0, 1 - (dy / Math.max(1, ry)) ** 2))
    g.rect(
      Math.round(c.cx - half),
      Math.round(c.cy + dy),
      Math.round(half * 2),
      1,
      accent,
      0.1 + power * 0.12,
    )
  }
  // Its rings: the outer one in her colour (white as it forms), a dashed one inside it turning.
  ring(g, c.cx, c.cy, rx, ry, flash > 0.3 ? '#ffffff' : accent, bright)
  ring(g, c.cx, c.cy, rx * 0.93, ry * 0.93, accent, bright * 0.7)
  ring(g, c.cx, c.cy, rx * 0.8, ry * 0.8, '#fde68a', bright, spin, 0.18)
  ring(g, c.cx, c.cy, rx * 0.58, ry * 0.58, accent, bright * 0.85)
  // Its runes: little marks round it, turning.
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + spin
    const x = c.cx + Math.cos(a) * rx * 0.69
    const y = c.cy + Math.sin(a) * ry * 0.69
    plot(g, x, y, '#fff7d6', bright)
    if (k % 2 === 0) plot(g, x, y - 1, '#fde68a', bright * 0.8)
  }
  // A six-pointed star inside it (two triangles), turning the other way.
  const points = Array.from({ length: 6 }, (_, k) => {
    const a = (k / 6) * Math.PI * 2 - spin * 1.5
    return { x: c.cx + Math.cos(a) * rx * 0.55, y: c.cy + Math.sin(a) * ry * 0.55 }
  })
  for (let k = 0; k < 6; k++) line(g, points[k]!, points[(k + 2) % 6]!, '#fde68a', bright * 0.8)
  plot(g, c.cx, c.cy, '#ffffff', bright)
  // As it forms, a flash of light round it.
  if (flash > 0)
    ring(
      g,
      c.cx,
      c.cy,
      rx * (1 + (1 - flash) * 0.3),
      ry * (1 + (1 - flash) * 0.3),
      '#ffffff',
      flash * 0.8,
    )
}
```

<!-- /code -->

As its comment says, one magic circle at `t`: rings, a turning ring of runes, a six-pointed star
and a bright heart. `g` is the `Painter` that `drawPillar()` passes on, and `power` is how strong
the magic is now, from 0 to 1 (see `drawPillar()`), which makes it brighter and turn faster.

- `age`: how long since it came; before then it isn't drawn.
- `grown`: it grows from nothing to its full size over its first 0.45 seconds, fast and then
  slowing (`easeOut`); `rx` and `ry` are its size now.
- `flash`: 1 until it has grown, then fading to 0 over the next 0.45 seconds: a flash of white as it
  forms.
- `spin`: how far it has turned, in radians: faster as the magic grows (`0.0008 + power * 0.004`
  radians a millisecond), its own way round (`c.turn`), kept within one turn (`% (Math.PI * 2)`).
- `bright`: how bright its lines are: three quarters to full, with the magic.
- The glow: as the comment says, a soft glow filling it, in her colour, faint (10% to 22% opaque):
  a row of pixels for each pixel of its height (`g.rect`, a pixel high), as wide as the ellipse is
  at that height (`half`, from the ellipse's equation), as `disc()` in `pixels.ts` does.
- Its rings: as the comment says, the outer one in her colour (white while it flashes as it forms),
  a fainter one just inside it, a dashed gold ring that turns (`spin`, with dashes 0.18 radians
  long), and an inner ring in her colour.
- Its runes: as the comment says, little marks round it, turning: 16 cream pixels round it between
  the dashed ring and the inner one, every other one with a gold pixel above it.
- The star: as the comment says, a six-pointed star inside it (two triangles), turning the other
  way (`- spin * 1.5`): six points round it, each joined to the point two along
  (`points[(k + 2) % 6]`), which draws the two triangles. The `!`s tell TypeScript the points are
  there.
- `plot(g, c.cx, c.cy, '#ffffff', bright)`: its bright heart, one white pixel in the middle.
- `if (flash > 0)`: as the comment says, as it forms, a flash of light round it: a white ring that
  spreads out to 1.3 times its size as it fades.

### `drawPillar()`

<!-- code: apps/desktop/src/renderer/src/lib/spellArt.ts#drawPillar -->

[`src/renderer/src/lib/spellArt.ts`, lines 131–205](../../apps/desktop/src/renderer/src/lib/spellArt.ts#L131-L205)

```ts
/**
 * The chant's pillar, from the moment she starts chanting: a magic circle under her feet, then the
 * circles above her one after another, a column of light rising through them and growing
 * brighter, sparks streaming up it, and in the last moments everything brighter and faster, the
 * column white.
 */
function drawPillar(g: Painter, scene: Scene): void {
  const { feet, accent, still } = scene
  const t = still ? EXPLOSION.chantMs * 0.8 : scene.t
  const circles = pillarCircles(scene)
  const x = circles[0]!.cx
  const top = circles.at(-1)!.cy - circles.at(-1)!.ry - 8
  // How strong the magic is: growing through the chant, surging at the end.
  const power =
    between(t, 1500, EXPLOSION.chantMs - 1500) * 0.6 +
    between(t, EXPLOSION.chantMs - 1500, EXPLOSION.chantMs) * 0.4
  const surge = between(t, EXPLOSION.chantMs - 1500, EXPLOSION.chantMs)
  const flicker = still ? 1 : 0.85 + 0.15 * Math.sin(t / (60 - surge * 40))

  // The column of light: brightest in the middle, from her feet up past the top circle.
  const width = circles[0]!.rx * (0.5 + power * 0.3)
  const columnTop = top - (scene.feet - top) * 0.1
  for (let dx = -Math.ceil(width); dx <= Math.ceil(width); dx++) {
    const edge = 1 - Math.abs(dx) / width
    if (edge <= 0) continue
    g.rect(
      Math.round(x + dx),
      Math.round(columnTop),
      1,
      Math.round(feet - columnTop),
      surge > 0.7 || Math.abs(dx) < width * 0.25 ? '#ffffff' : '#fde68a',
      clamp01(edge * edge * (0.12 + power * 0.5) * flicker),
    )
  }

  // The circle under her feet, turning, there from the start.
  const ground = {
    cx: x,
    cy: feet - 1,
    rx: circles[0]!.rx * 0.9,
    ry: circles[0]!.rx * 0.2,
    born: 0,
    turn: 1 as const,
  }
  magicCircle(g, ground, t, power, accent)
  for (const circle of circles) magicCircle(g, circle, t, power, accent)

  // Sparks streaming up the column, more as the magic grows, each looping back to the bottom.
  const random = seeded(11)
  const height = feet - columnTop
  for (let k = 0; k < 110; k++) {
    const offset = (random() - 0.5) * width * 2.2
    const speed = 0.04 + random() * 0.08
    const phase = random() * height
    const colour = k % 3 === 0 ? accent : k % 3 === 1 ? '#fde68a' : '#ffffff'
    if (k > 20 + power * 90) continue
    const y = feet - ((t * speed + phase) % height)
    const sway = Math.sin(t / 300 + k) * 2
    const alpha = (0.4 + 0.6 * ((feet - y) / height)) * flicker
    if (k % 5 === 0) twinkle(g, x + offset + sway, y, colour, alpha)
    else plot(g, x + offset + sway, y, colour, alpha)
  }

  // At the very end, a white flash up the whole column.
  const flare = between(t, EXPLOSION.chantMs - 200, EXPLOSION.chantMs)
  if (flare > 0)
    g.rect(
      Math.round(x - width),
      0,
      Math.round(width * 2),
      Math.round(feet),
      '#ffffff',
      flare * 0.9,
    )
}
```

<!-- /code -->

As its comment says, the chant's pillar, from the moment she starts chanting: a magic circle under
her feet, then the circles above her one after another, a column of light rising through them and
growing brighter, sparks streaming up it, and in the last moments everything brighter and faster,
the column white. It draws on a `Painter` (`g`), which `drawExplosion()` makes of the canvas.

- `const t = still ? EXPLOSION.chantMs * 0.8 : scene.t`: with reduced motion, the pillar as it is
  four fifths of the way through the chant, every circle up, held there.
- `circles`, `x`, `top`: the circles (`pillarCircles()`), the middle of the pillar, and 8 pixels
  above the top circle.
- `power`: as the comment says, how strong the magic is: growing steadily to 0.6 from 1.5 seconds in
  until 1.5 seconds before the end, then surging to 1 in those last 1.5 seconds.
- `surge`: just that last surge, from 0 to 1.
- `flicker`: the light flickering a little (between 70% and full), faster in the surge (a sine wave
  whose swing shortens from about 0.38 seconds to 0.13). With reduced motion, none.
- The column: as the comment says, brightest in the middle, from her feet up past the top circle.
  It's a row of strips a pixel wide (`g.rect`), `width` either side of the middle (half to four
  fifths of the lowest circle's radius, widening with the magic), each fainter toward the edges
  (`edge * edge`), brighter with the magic, and flickering. The middle quarter is white and the
  rest gold; in the surge, all of it white. `columnTop` is a tenth of its height above `top`.
- The ground circle: as the comment says, the circle under her feet, turning, there from the start
  (`born: 0`), a little smaller than the lowest circle above her and flatter (`ry` a fifth of `rx`,
  not three tenths). Then each circle above her, each from its own time.
- The sparks: as the comment says, streaming up the column, more as the magic grows, each looping
  back to the bottom. Of 110, only the first `20 + power * 90` are drawn: 20 at first and all of
  them in the surge. Each has its own place across the column, speed and starting height (from
  `seeded(11)`, all drawn before the check, so each keeps its own), and climbs at its speed, back to
  the bottom when it reaches the top (`% height`). They sway a little, are brighter the higher they
  are, and come in her colour, gold and white; every fifth is a twinkle.
- `flare`: as the comment says, at the very end, a white flash up the whole column, from the top of
  the screen to her feet, over the chant's last 0.2 seconds, just before the bang.

### `FIRE`, `fireCanvas` and `drawBoom()`

<!-- code: apps/desktop/src/renderer/src/lib/spellArt.ts#FIRE,fireCanvas,drawBoom -->

[`src/renderer/src/lib/spellArt.ts`, lines 207–302](../../apps/desktop/src/renderer/src/lib/spellArt.ts#L207-L302)

```ts
/** The explosion's palette, hottest first: white, yellow, orange, red, deep red, then smoke. */
const FIRE: [number, [number, number, number]][] = [
  [1.05, [255, 252, 232]],
  [0.82, [253, 224, 71]],
  [0.6, [251, 146, 60]],
  [0.38, [239, 68, 68]],
  [0.18, [127, 29, 29]],
  [0.0, [64, 52, 64]],
]

let fireCanvas: HTMLCanvasElement | null = null

/**
 * The explosion, `b` ms after the bang, in the middle of the screen: a white flash across the
 * screen, a fireball that bursts out with ragged, churning edges, cools from white through
 * yellow, orange and red to smoke as it rises, a shock wave racing out round it, and sparks
 * thrown out and falling.
 */
function drawBoom(canvas: CanvasRenderingContext2D, scene: Scene, b: number): void {
  const g = canvasPainter(canvas)
  const { w, h, still } = scene
  const at = still ? 700 : b
  const cx = w / 2
  const cy = h * 0.45 - (at / 1000) * Math.min(w, h) * 0.05
  const { fire, shock } = blastAt(at, w, h)
  const gone = 1 - between(at, EXPLOSION.boomMs - 800, EXPLOSION.boomMs)

  // The flash.
  if (!still && b < 220) g.rect(0, 0, w, h, '#ffffff', 0.75 * (1 - b / 220))

  // The fireball, drawn a pixel at a time at half size (chunkier pixels) and stretched on.
  const size = Math.ceil(fire * 1.5) + 2
  if (size > 2) {
    fireCanvas ??= document.createElement('canvas')
    fireCanvas.width = size
    fireCanvas.height = size
    const fg = fireCanvas.getContext('2d')!
    const image = fg.createImageData(size, size)
    const cooling = between(at, 450, EXPLOSION.boomMs) * 1.25
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const dx = (i - size / 2) * 2
        const dy = (j - size / 2) * 2
        const d = Math.hypot(dx, dy * 1.1)
        const churn = noise(dx * 0.06 + at / 400, dy * 0.06 - at / 250)
        const n = d / Math.max(1, fire) + (churn - 0.5) * 0.5
        const heat = (1 - n) * 1.7 - cooling + (churn - 0.5) * 0.3
        if (n >= 1 || heat <= -0.05) continue
        const [, [r, gr, bl]] = FIRE.find(([limit]) => heat >= limit) ?? FIRE.at(-1)!
        const smoke = heat < 0.18
        const o = (j * size + i) * 4
        image.data[o] = r
        image.data[o + 1] = gr
        image.data[o + 2] = bl
        image.data[o + 3] = Math.round(255 * gone * (smoke ? clamp01(0.5 + heat * 3) : 1))
      }
    }
    fg.putImageData(image, 0, 0)
    canvas.globalAlpha = 1
    canvas.imageSmoothingEnabled = false
    canvas.drawImage(fireCanvas, Math.round(cx - size), Math.round(cy - size), size * 2, size * 2)
  }

  if (still) return
  // The shock wave: a ring racing out, fading.
  const wave = 1 - between(b, 0, 1000)
  if (wave > 0) {
    ring(g, cx, cy, shock, shock * 0.8, '#fff7d6', wave * 0.9)
    ring(g, cx, cy, shock * 0.97, shock * 0.8 * 0.97, '#fde68a', wave * 0.6)
  }
  // Sparks: thrown out in every direction, falling, with short tails, fading.
  const random = seeded(23)
  for (let k = 0; k < 90; k++) {
    const angle = random() * Math.PI * 2
    const speed = (0.08 + random() * 0.2) * (Math.min(w, h) / 300)
    const life = 900 + random() * 900
    if (b > life) continue
    const fade = 1 - b / life
    const sx = cx + Math.cos(angle) * speed * b
    const sy = cy + Math.sin(angle) * speed * b + 0.00006 * b * b * (Math.min(w, h) / 300)
    const colour = k % 3 === 0 ? '#ffffff' : k % 3 === 1 ? '#fde047' : '#fb923c'
    plot(g, sx, sy, colour, fade)
    plot(g, sx + 1, sy, colour, fade)
    plot(g, sx, sy + 1, colour, fade)
    plot(g, sx + 1, sy + 1, colour, fade)
    for (let k2 = 1; k2 <= 3; k2++) {
      plot(
        g,
        sx - Math.cos(angle) * k2 * 1.5,
        sy - Math.sin(angle) * k2 * 1.5,
        colour,
        fade * (0.6 - k2 * 0.15),
      )
    }
  }
}
```

<!-- /code -->

- `FIRE`: as its comment says, the explosion's palette, hottest first: white, yellow, orange, red,
  deep red, then smoke (a dark grey-purple). Each entry is the least heat for that colour, then the
  colour as red, green and blue from 0 to 255; a pixel takes the first entry its heat reaches.
- `fireCanvas`: a second, small canvas the fireball is drawn on, made the first time it's needed
  and kept for every frame after.
- `drawBoom(canvas, scene, b)`: as its comment says, the explosion, `b` milliseconds after the
  bang, in the middle of the screen: a white flash across the screen, a fireball that bursts out
  with ragged, churning edges and cools from white through yellow, orange and red to smoke as it
  rises, a shock wave racing out round it, and sparks thrown out and falling. Unlike the rest, it's
  given the canvas's context itself, not a `Painter`: the fireball is drawn on a canvas of its own
  and stretched onto this one, which only a canvas can do.
  - `const g = canvasPainter(canvas)`: everything else it draws on a `Painter` made of the canvas.
  - `at`: the moment to draw: with reduced motion, the fireball as it is 0.7 seconds in, held
    still.
  - `cx`, `cy`: its middle: halfway across the screen, a little above halfway down (45%), and rising
    as it goes (by 5% of the screen's shorter side a second).
  - `fire`, `shock`: how big the fireball and the shock wave are now (`blastAt()`).
  - `gone`: the fireball fading away over the bang's last 0.8 seconds.
  - The flash: the whole screen white (one `g.rect`), three quarters opaque, fading over the first
    0.22 seconds. Not with reduced motion.
  - The fireball: as the comment says, drawn a pixel at a time at half size (chunkier pixels), and
    stretched on. `size` is the small canvas's width and height: room for the fireball at half
    size, and some to spare.
  - `fg.createImageData(size, size)`: a block of raw pixels, four numbers each (red, green, blue and
    opacity, from 0 to 255), much quicker to fill pixel by pixel than painting each with
    `fillRect`.
  - `cooling`: how far it has cooled: not at all for the first 0.45 seconds, then more and more
    until the bang is over.
  - For each pixel, `dx` and `dy`: how far it is from the middle, in full-size pixels (two of the
    small canvas's); `d`, the distance, a little squashed up and down (`dy * 1.1`), so the ball is a
    touch wider than tall.
  - `churn`: the turbulence there, `noise()` at that spot, moving with time (`+ at / 400`,
    `- at / 250`), so the edges roil.
  - `n`: how far out the pixel is, as a share of the fireball's radius, pushed in or out by the
    churn, which makes the edge ragged. At 1 or more, it's outside the ball.
  - `heat`: hottest in the middle, falling off toward the edge, less as it cools, and churned a
    little too. Outside the ball, or too cold even for smoke, the pixel is left clear.
  - `FIRE.find(([limit]) => heat >= limit) ?? FIRE.at(-1)!`: its colour, the first in the palette
    its heat reaches (smoke if none).
  - `smoke`: below the deep red it's smoke, which fades as it cools (`clamp01(0.5 + heat * 3)`),
    where fire is fully opaque. Everything fades with `gone`.
  - `image.data[o]` to `image.data[o + 3]`: the pixel's red, green, blue and opacity; `o`, which is
    `(j * size + i) * 4`, is where its four numbers start.
  - `fg.putImageData(image, 0, 0)`: puts the pixels on the small canvas.
  - `canvas.globalAlpha = 1`: fully opaque, whatever the last rectangle left it at (the fireball's
    pixels carry their own opacity).
  - `canvas.imageSmoothingEnabled = false`, `canvas.drawImage(fireCanvas, ..., size * 2, size * 2)`:
    draws it on the effects' canvas at twice its size, centred on the middle, without smoothing, so
    each of its pixels is a crisp block 2 by 2: chunkier than the rest of the effects, as fire is in
    pixel art.
  - `if (still) return`: with reduced motion, no shock wave or sparks, only the still fireball.
  - The shock wave: as the comment says, a ring racing out, fading: a cream ring and a gold one just
    inside it, `shock` across and four fifths as tall, fading over the first second.
  - The sparks: as the comment says, thrown out in every direction, falling, with short tails,
    fading. 90 of them, each with its own angle, speed (for the screen's size) and life (0.9 to 1.8
    seconds), from `seeded(23)`. Each flies out along its angle and falls faster and faster
    (`0.00006 * b * b`, like gravity), fading over its life: a square of 2 by 2 in white, yellow or
    orange, with a three-pixel tail back along its path.

### `drawExplosion()`

<!-- code: apps/desktop/src/renderer/src/lib/spellArt.ts#drawExplosion -->

[`src/renderer/src/lib/spellArt.ts`, lines 304–308](../../apps/desktop/src/renderer/src/lib/spellArt.ts#L304-L308)

```ts
/** The explosion spell: the pillar while she chants, then the bang. */
export function drawExplosion(g: CanvasRenderingContext2D, scene: Scene): void {
  if (scene.t < EXPLOSION.chantMs) drawPillar(canvasPainter(g), scene)
  else drawBoom(g, scene, scene.t - EXPLOSION.chantMs)
}
```

<!-- /code -->

As its comment says, the explosion spell: the pillar while she chants, drawn on a `Painter` made of
the canvas (`canvasPainter(g)`), then the bang, given the canvas itself for its fireball, with `b`
counted from the end of the chant. `SpellView` calls it every frame for the whole 18.6 seconds,
through `SPELL_ART` (next).

### `SPELL_ART`

<!-- code: apps/desktop/src/renderer/src/lib/spellArt.ts#SPELL_ART -->

[`src/renderer/src/lib/spellArt.ts`, lines 310–323](../../apps/desktop/src/renderer/src/lib/spellArt.ts#L310-L323)

```ts
/**
 * Which spell draws what: on a canvas (the explosion's fireball needs one of its own to stretch),
 * or, for the rest, on a Painter made of it.
 */
export const SPELL_ART: Record<SpellEffect, (g: CanvasRenderingContext2D, scene: Scene) => void> = {
  starfall: (g, scene) => drawStarfall(canvasPainter(g), scene),
  explosion: drawExplosion,
  fireworks: (g, scene) => drawFireworks(canvasPainter(g), scene),
  thunderstorm: (g, scene) => drawThunderstorm(canvasPainter(g), scene),
  blizzard: (g, scene) => drawBlizzard(canvasPainter(g), scene),
  vortex: (g, scene) => drawVortex(canvasPainter(g), scene),
  butterflies: (g, scene) => drawButterflies(canvasPainter(g), scene),
  phoenix: (g, scene) => drawPhoenix(canvasPainter(g), scene),
}
```

<!-- /code -->

As its comment says, which spell draws what: a drawing function for each spell drawn over the
screen (each `SpellEffect`), which `SpellView` looks up by the spell's name and calls every frame
with the canvas's context and the `Scene`.

- `explosion: drawExplosion`: takes the canvas as it is, since its fireball needs one of its own to
  stretch (`drawBoom()`).
- The rest: each a small arrow function that makes a `Painter` of the canvas (`canvasPainter(g)`)
  and hands it on with the scene: `drawStarfall()` above, and the six newer spells' drawing
  functions, each from its own file in `lib/spells/` (below).
- `Record<SpellEffect, (g: CanvasRenderingContext2D, scene: Scene) => void>`: TypeScript insists on
  one for every spell in `SPELL_EFFECT_MS` (`src/shared/spells.ts`), so a spell drawn over the
  screen can't be added without its art, and each is a function taking the context and the scene.

The six files in `lib/spells/` that follow are all built alike, and like this one. Each draws on a
`Painter` with the helpers in `lib/pixels.ts`, each frame from scratch from `scene.t`, with
anything random from `seeded()` (`lib/spellMotion.ts`), so every frame has the same rockets,
flakes or embers, only further along. Each keeps the sums for where things are (which draw
nothing) beside its drawing, and exports the ones `tests/moreSpells.test.ts` checks. That test
also draws each spell on a `Painter` that only counts rectangles: half way through, still or
moving, it must draw plenty on the screen, and at its end, nothing at all. Their timings are in
`src/shared/spells.ts` (`FIREWORKS`, `THUNDERSTORM` and so on; see
[Shared code and the preload bridge](1-shared-and-preload.md)). With reduced motion
(`scene.still`), each shows one moment part way through, held still.

## `src/renderer/src/lib/spells/fireworks.ts`: fireworks

As the comment at the top says, fireworks: rockets climbing from along the taskbar, each bursting
high over the screen in one of four kinds (a round peony, a ring, a drooping golden willow,
crackling glitter), then a finale of several at once.

### `KINDS`, `COLOURS` and `SPARKS`

<!-- code: apps/desktop/src/renderer/src/lib/spells/fireworks.ts#KINDS,Kind,COLOURS,SPARKS -->

[`src/renderer/src/lib/spells/fireworks.ts`, lines 5–20](../../apps/desktop/src/renderer/src/lib/spells/fireworks.ts#L5-L20)

```ts
// Fireworks: rockets climbing from along the taskbar, each bursting high over the screen in one of
// four kinds (a round peony, a ring, a drooping golden willow, crackling glitter), then a finale
// of several at once.

/** The kinds of burst, and the colours they come in. */
const KINDS = ['peony', 'ring', 'willow', 'glitter'] as const

type Kind = (typeof KINDS)[number]

const COLOURS = ['#f87171', '#fbbf24', '#4ade80', '#60a5fa', '#f472b6', '#c084fc', '#ffffff']

/** How many sparks each kind throws, and how long they last (ms). */
const SPARKS: Record<Kind, { count: number; life: number }> = {
  peony: { count: 80, life: 1600 },
  ring: { count: 56, life: 1400 },
  willow: { count: 60, life: 2500 },
  glitter: { count: 70, life: 1900 },
}
```

<!-- /code -->

- `KINDS`: as its comment says, the kinds of burst: `peony` (a round ball of sparks, named after
  the flower), `ring` (sparks all flying out at the same speed, so they stay a circle), `willow`
  (heavy golden sparks with long tails that droop, like a weeping willow's branches) and `glitter`
  (sparks that crackle, flashing white and off). As with `SPELLS`, it's a list made `as const`,
  and `Kind` is the type of any item of it.
- `COLOURS`: as the comment says, the colours a rocket can burst in: red, amber, green, blue, pink,
  violet and white.
- `SPARKS`: as its comment says, how many sparks each kind throws, and how long they last: a peony
  80 for 1.6 seconds, a ring 56 for 1.4, a willow 60 for 2.5 (the longest, as they drift down) and
  glitter 70 for 1.9. `Record<Kind, ...>` insists on an entry for each kind.

### `Rocket` and `rockets()`

<!-- code: apps/desktop/src/renderer/src/lib/spells/fireworks.ts#Rocket,rockets -->

[`src/renderer/src/lib/spells/fireworks.ts`, lines 22–63](../../apps/desktop/src/renderer/src/lib/spells/fireworks.ts#L22-L63)

```ts
/** One rocket: when it launches, from where, where and when it bursts, and how. */
export interface Rocket {
  launch: number
  x: number
  burstX: number
  burstY: number
  /** How long it climbs (ms). */
  rise: number
  kind: Kind
  colour: string
  /** How fast its sparks fly out (pixels a ms). */
  speed: number
  seed: number
}

/**
 * The show: FIREWORKS.rockets, one about every FIREWORKS.gapMs (the first from beside her), then
 * the last FIREWORKS.finale of them close together from FIREWORKS.finaleAt. Each climbs from the
 * bottom of the screen to somewhere over its top half and bursts.
 */
export function rockets(w: number, h: number, from: number): Rocket[] {
  const random = seeded(31)
  const steady = FIREWORKS.rockets - FIREWORKS.finale
  return Array.from({ length: FIREWORKS.rockets }, (_, i) => {
    const launch =
      i < steady
        ? 150 + i * FIREWORKS.gapMs + random() * 200
        : FIREWORKS.finaleAt + (i - steady) * 110 + random() * 120
    const x = i === 0 ? from : w * (0.08 + random() * 0.84)
    return {
      launch,
      x,
      burstX: Math.min(w * 0.95, Math.max(w * 0.05, x + (random() - 0.5) * w * 0.1)),
      burstY: h * (0.1 + random() * 0.32),
      rise: 650 + random() * 400,
      kind: KINDS[Math.floor(random() * KINDS.length)]!,
      colour: COLOURS[Math.floor(random() * COLOURS.length)]!,
      speed: (0.07 + random() * 0.05) * (Math.min(w, h) / 300),
      seed: 100 + i,
    }
  })
}
```

<!-- /code -->

- `Rocket`: as its comment says, one rocket: when it launches (`launch`, ms into the spell), from
  where along the bottom (`x`), where it bursts (`burstX`, `burstY`), how long it climbs (`rise`),
  its `kind` and `colour`, how fast its sparks fly out (`speed`, pixels a millisecond) and the
  `seed` its sparks are scattered from.
- `rockets(w, h, from)`: as its comment says, the show: `FIREWORKS.rockets` (20), one about every
  `gapMs` (0.48 seconds), the first from beside her (`from`, her `x`), then the last `finale` (7)
  of them close together from `finaleAt` (6.2 seconds). Each climbs from the bottom of the screen
  to somewhere over its top half and bursts. It's worked out afresh every frame, the same each time
  (`seeded(31)`). A test checks the first launches from beside her, every burst is over the top
  half of the screen and on it, each bursts at least a second before the end, and the finale comes
  after `finaleAt`.
  - `steady`: how many come before the finale, 13.
  - `launch`: for the steady ones, 0.15 seconds in and then one every 0.48 seconds, each up to 0.2
    seconds late at random, the last about 6 seconds in; for the finale, from 6.2 seconds, one
    every 0.11 seconds (each up to 0.12 seconds late), all seven within a second.
  - `x`: where it launches: the first beside her (`i === 0 ? from`), so the show starts where she
    cast it; the rest anywhere from 8% to 92% of the way across.
  - `burstX`: a little to one side of where it launched (up to 5% of the width either way), kept
    at least 5% of the width from either edge.
  - `burstY`: from 10% to 42% of the way down the screen, so always over its top half.
  - `rise`: it climbs for 0.65 to 1.05 seconds.
  - `kind`, `colour`: one of each, at random. The `!`s tell TypeScript the index is in range.
  - `speed`: how fast its sparks fly out, 0.07 to 0.12 pixels a millisecond, scaled for the screen
    (`Math.min(w, h) / 300`), so a burst fills as much of a big screen as of a small one.
  - `seed: 100 + i`: each rocket's own seed for its sparks, so they're scattered the same way every
    frame.

### `spark()`

<!-- code: apps/desktop/src/renderer/src/lib/spells/fireworks.ts#spark -->

[`src/renderer/src/lib/spells/fireworks.ts`, lines 65–80](../../apps/desktop/src/renderer/src/lib/spells/fireworks.ts#L65-L80)

```ts
/** Where a spark is `age` ms after its burst: flying out, slowing, falling. */
function spark(
  rocket: Rocket,
  angle: number,
  speed: number,
  age: number,
  gravity: number,
): { x: number; y: number } {
  // It slows as it goes (air): out to speed × 450 at most, the willow's further and slower.
  const drag = rocket.kind === 'willow' ? 650 : 450
  const out = speed * drag * (1 - Math.exp(-age / drag))
  return {
    x: rocket.burstX + Math.cos(angle) * out,
    y: rocket.burstY + Math.sin(angle) * out + gravity * age * age,
  }
}
```

<!-- /code -->

As its comment says, where a spark is `age` milliseconds after its burst: flying out, slowing,
falling. It's given its rocket, which way it flies (`angle`), how fast (`speed`) and how strongly
it falls (`gravity`).

- `drag`, `out`: as the comment says, it slows as it goes, as a real spark does in the air. `out`
  is how far it has flown: `speed * drag * (1 - Math.exp(-age / drag))`. At first that grows at
  its full speed, but `Math.exp(-age / drag)` shrinks toward 0 as time goes on, so it slows, and
  never gets further than `speed × drag`. A willow's `drag` is 650 rather than 450, so its sparks
  go further and take longer to slow down, hanging in the air.
- `x`, `y`: out from the burst that far along its angle (`Math.cos(angle)` across,
  `Math.sin(angle)` down), and down by `gravity * age * age` as well: falling faster and faster, as
  things do.

### `drawFireworks()`

<!-- code: apps/desktop/src/renderer/src/lib/spells/fireworks.ts#drawFireworks -->

[`src/renderer/src/lib/spells/fireworks.ts`, lines 82–149](../../apps/desktop/src/renderer/src/lib/spells/fireworks.ts#L82-L149)

```ts
/** The fireworks spell at `scene.t`. */
export function drawFireworks(p: Painter, scene: Scene): void {
  const { w, h } = scene
  const t = scene.still ? FIREWORKS.durationMs * 0.45 : scene.t
  const shown = scene.still ? 1 : Math.min(1, (FIREWORKS.durationMs - t) / 600)
  const gravity = 0.00004 * (h / 520)
  for (const rocket of rockets(w, h, scene.x)) {
    const age = t - rocket.launch
    if (age < 0) continue
    // Climbing: a bright head, a wobble, and a trail of sparks behind it.
    if (age < rocket.rise) {
      const climb = easeOut(age / rocket.rise)
      const x = rocket.x + (rocket.burstX - rocket.x) * climb + Math.sin(age / 40) * 0.6
      const y = h + (rocket.burstY - h) * climb
      square(p, x, y, 2, '#fff7d6', shown)
      for (let k = 1; k <= 8; k++) {
        const back = Math.max(0, age - k * 28) / rocket.rise
        const by = h + (rocket.burstY - h) * easeOut(back)
        plot(
          p,
          x + Math.sin(k * 2.3 + age / 30),
          by,
          k < 3 ? '#fde68a' : '#fb923c',
          shown * (1 - k / 9),
        )
      }
      continue
    }
    // Bursting: a flash at the heart, then the sparks.
    const burst = age - rocket.rise
    const { count, life } = SPARKS[rocket.kind]
    if (burst > life) continue
    if (burst < 140) {
      const flash = 1 - burst / 140
      square(p, rocket.burstX - 3, rocket.burstY - 3, 6, '#ffffff', flash * shown)
      twinkle(p, rocket.burstX, rocket.burstY, rocket.colour, shown)
    }
    // A soft glow in its colour, spreading and fading.
    if (burst < 500) {
      const glow = burst / 500
      const size = 10 + glow * 30
      disc(p, rocket.burstX, rocket.burstY, size, size, rocket.colour, 0.14 * (1 - glow) * shown)
    }
    const random = seeded(rocket.seed)
    // The willow's sparks are heavier: they droop.
    const fall = rocket.kind === 'willow' ? gravity * 1.6 : gravity
    for (let k = 0; k < count; k++) {
      const angle = (k / count) * Math.PI * 2 + random() * 0.15
      const speed = rocket.kind === 'ring' ? rocket.speed : rocket.speed * (0.45 + random() * 0.55)
      const second = random() < 0.35
      const colour = rocket.kind === 'willow' ? '#fbbf24' : second ? '#ffffff' : rocket.colour
      const fade = (1 - burst / life) ** 0.6 * shown
      const at = spark(rocket, angle, speed, burst, fall)
      // Glitter crackles: sparks flashing white and off as they go.
      if (rocket.kind === 'glitter' && burst > life * 0.35) {
        if (Math.sin(burst / 25 + k * 1.7) > 0.2) plot(p, at.x, at.y, '#ffffff', fade)
        continue
      }
      square(p, at.x - 0.5, at.y - 0.5, 2, colour, fade)
      // A tail back along its path, long and golden for the willow.
      const tail = rocket.kind === 'willow' ? 7 : 3
      for (let j = 1; j <= tail; j++) {
        const back = spark(rocket, angle, speed, Math.max(0, burst - j * 45), fall)
        plot(p, back.x, back.y, colour, fade * (1 - j / (tail + 1)) * 0.7)
      }
    }
  }
}
```

<!-- /code -->

As its comment says, the fireworks spell at `scene.t`.

- `t`: the moment to draw: with reduced motion, 45% of the way through (about 4 seconds in), held
  still.
- `shown`: everything fades out over the last 0.6 seconds; with reduced motion, all of it shows.
- `gravity`: how strongly the sparks fall, for the screen's height (`h / 520`; 520 pixels is a
  1080-pixel screen's work area, in the effects' pixels at her usual size), so they droop as far
  down a tall screen as a short one.
- `for (const rocket of rockets(w, h, scene.x))`: every rocket in the show. `age` is how long since
  it launched; one that hasn't yet is skipped.
- Climbing: as the comment says, a bright head, a wobble, and a trail of sparks behind it. While
  `age < rocket.rise`:
  - `climb`: how far up it is, fast at first and slowing as it nears the top (`easeOut`), as a real
    rocket does.
  - `x`, `y`: from where it launched to where it bursts, that far along, with a little wobble from
    side to side (`Math.sin(age / 40) * 0.6`).
  - `square(p, x, y, 2, '#fff7d6', shown)`: its head, a cream square two pixels across.
  - The trail: 8 pixels below it, where it was 28, 56, 84 ms ago and so on (`back`), each jiggling
    a little sideways and fainter than the last; the two nearest gold, the rest orange.
  - `continue`: a climbing rocket has nothing else to draw.
- Bursting: as the comment says, a flash at the heart, then the sparks.
  - `burst`: how long since it burst. Once its sparks' `life` is over, nothing is left of it.
  - `if (burst < 140)`: for the first 0.14 seconds, a white square six pixels across at the burst,
    fading, and a twinkle in its colour.
  - The glow: as the comment says, a soft glow in its colour, spreading and fading: a faint `disc`
    growing from 10 pixels round to 40 over half a second, fading from 14% to nothing.
  - `const random = seeded(rocket.seed)`: its own sparks, the same every frame.
  - `fall`: as the comment says, the willow's sparks are heavier: they droop, falling 1.6 times as
    fast.
  - `angle`: the sparks spread evenly round the circle (`k / count` of a turn), each nudged a
    little at random so they don't look ruled.
  - `speed`: a ring's sparks all fly at the rocket's speed, so they stay a ring; the others' from
    45% of it to all of it, which fills the ball.
  - `second`, `colour`: about a third of the sparks are white instead of the rocket's colour; a
    willow's are all gold.
  - `fade`: dimming over the sparks' life, slowly at first (`** 0.6`), and with the spell.
  - `at`: where the spark is now (`spark()`).
  - Glitter: as the comment says, glitter crackles: past the first 35% of its life, each spark is
    only a white pixel, flashing on and off about every 0.16 seconds, each at its own moment
    (`Math.sin(burst / 25 + k * 1.7) > 0.2`).
  - `square(p, at.x - 0.5, at.y - 0.5, 2, colour, fade)`: the spark, two pixels by two, centred on
    where it is.
  - The tail: as the comment says, back along its path, long and golden for the willow: where the
    spark was 45, 90, 135 ms ago and so on (7 of those for a willow, 3 for the rest), each fainter.

## `src/renderer/src/lib/spells/thunderstorm.ts`: the thunderstorm

As the comment at the top says, a thunderstorm: dark clouds roll in over the top of the screen,
rain pours from them and splashes along the taskbar, and bolts of lightning crack down to it,
branching as they go, each with a flash over the whole screen (one strikes right beside her).

### `Point`, `Bolt`, `BOLT_MS`, `flickering` and `CLOUD`

<!-- code: apps/desktop/src/renderer/src/lib/spells/thunderstorm.ts#Point,Bolt,BOLT_MS,flickering,CLOUD -->

[`src/renderer/src/lib/spells/thunderstorm.ts`, lines 5–24](../../apps/desktop/src/renderer/src/lib/spells/thunderstorm.ts#L5-L24)

```ts
// Thunderstorm: dark clouds roll in over the top of the screen, rain pours from them and splashes
// along the taskbar, and bolts of lightning crack down to it, branching as they go, each with a
// flash over the whole screen (one strikes right beside her).

type Point = { x: number; y: number }

/** A bolt of lightning: when it strikes, its jagged path from the clouds down, and its branches. */
export interface Bolt {
  at: number
  path: Point[]
  branches: Point[][]
}

/** How long a bolt shows (ms): flickering on and off, three times. */
const BOLT_MS = 280

const flickering = (age: number) =>
  age < 70 || (age > 110 && age < 180) || (age > 220 && age < BOLT_MS)

/** How far down the clouds hang, at their fullest (a share of the screen's height). */
const CLOUD = 0.24
```

<!-- /code -->

- `Point`: a point on the canvas, `x` across and `y` down, for this file's own use.
- `Bolt`: as its comment says, a bolt of lightning: when it strikes (`at`, ms into the spell), its
  jagged `path` from the clouds down (a list of points) and its `branches` (a list of points each).
- `BOLT_MS = 280`: as its comment says, how long a bolt shows: 0.28 seconds.
- `flickering(age)`: whether a bolt `age` ms old is lit: for its first 0.07 seconds, again from
  0.11 to 0.18, and again from 0.22 to the end. So, as the comment says, it flickers on and off,
  three times, as real lightning does.
- `CLOUD = 0.24`: as its comment says, how far down the clouds hang at their fullest, as a share of
  the screen's height: about a quarter.

### `jagged()`

<!-- code: apps/desktop/src/renderer/src/lib/spells/thunderstorm.ts#jagged -->

[`src/renderer/src/lib/spells/thunderstorm.ts`, lines 26–37](../../apps/desktop/src/renderer/src/lib/spells/thunderstorm.ts#L26-L37)

```ts
/** A jagged line from `from` to `to`: its middle pushed sideways, and again in each half. */
function jagged(from: Point, to: Point, rough: number, random: () => number, depth = 5): Point[] {
  if (depth === 0) return [from, to]
  const middle = {
    x: (from.x + to.x) / 2 + (random() - 0.5) * rough,
    y: (from.y + to.y) / 2 + (random() - 0.5) * rough * 0.25,
  }
  return [
    ...jagged(from, middle, rough / 2, random, depth - 1),
    ...jagged(middle, to, rough / 2, random, depth - 1).slice(1),
  ]
}
```

<!-- /code -->

As its comment says, a jagged line from `from` to `to`: its middle pushed sideways, and again in
each half. This is _midpoint displacement_, a classic way to draw lightning, coastlines and
mountain ridges: take the middle of a line and push it aside by a random amount, then do the same
to each half with half as much (`rough / 2`), and so on, `depth` times (5 unless it's told
otherwise, which makes 32 short lines). The result is rough at every scale, as lightning is.
`random` is passed in, so the bolts all take their numbers from one seeded generator.

- `if (depth === 0) return [from, to]`: at the bottom, just the two ends.
- `middle`: halfway between them, pushed sideways by up to half of `rough` either way, and up or
  down by only a quarter as much, so the bolt zigzags from side to side on its way down.
- `[...jagged(from, middle, ...), ...jagged(middle, to, ...).slice(1)]`: the points of the first
  half, then those of the second. `.slice(1)` drops the second half's first point, which is the
  first half's last (the middle), so it isn't there twice. A function that calls itself like this
  is _recursive_; `depth - 1` each time makes sure it stops.

### `bolts()` and `cloudDepth()`

<!-- code: apps/desktop/src/renderer/src/lib/spells/thunderstorm.ts#bolts,cloudDepth -->

[`src/renderer/src/lib/spells/thunderstorm.ts`, lines 39–76](../../apps/desktop/src/renderer/src/lib/spells/thunderstorm.ts#L39-L76)

```ts
/**
 * The storm's bolts: THUNDERSTORM.strikes of them, about a second apart once the clouds are in,
 * each from the clouds' underside down to the bottom of the screen (the third right beside her),
 * with two or three branches forking off partway down.
 */
export function bolts(w: number, h: number, beside: number): Bolt[] {
  const random = seeded(47)
  const base = h * CLOUD * 0.75
  return Array.from({ length: THUNDERSTORM.strikes }, (_, i) => {
    const at = 1500 + i * 950 + random() * 300
    const top = { x: w * (0.1 + random() * 0.8), y: base }
    const bottom =
      i === 2
        ? { x: beside + (random() - 0.5) * 20, y: h - 1 }
        : { x: top.x + (random() - 0.5) * w * 0.15, y: h - 1 }
    if (i === 2) top.x = bottom.x + (random() - 0.5) * w * 0.08
    const path = jagged(top, bottom, (h - base) * 0.35, random)
    const branches = Array.from({ length: 2 + Math.floor(random() * 2) }, () => {
      const from = path[Math.floor(path.length * (0.2 + random() * 0.4))]!
      const to = {
        x: from.x + (random() - 0.5) * w * 0.12,
        y: from.y + (h - from.y) * (0.3 + random() * 0.3),
      }
      return jagged(from, to, (to.y - from.y) * 0.4, random, 4)
    })
    return { at, path, branches }
  })
}

/** How far down the clouds hang at `t` (pixels): rolling in, then away at the end. */
export function cloudDepth(t: number, h: number): number {
  return (
    h *
    CLOUD *
    easeOut(t / 1500) *
    (1 - between(t, THUNDERSTORM.durationMs - 1300, THUNDERSTORM.durationMs))
  )
}
```

<!-- /code -->

- `bolts(w, h, beside)`: as its comment says, the storm's bolts: `THUNDERSTORM.strikes` (7) of
  them, about a second apart once the clouds are in, each from the clouds' underside down to the
  bottom of the screen (the third right beside her), with two or three branches forking off partway
  down. `seeded(47)` makes them the same every frame. A test checks each bolt starts in the clouds,
  reaches the ground, strikes while the clouds are in, and has branches that head down, and that
  one hits within 15 pixels of her.
  - `base`: where they start: three quarters of the way down the clouds at their fullest, so they
    come out of the cloud bank.
  - `at`: the first 1.5 seconds in, once the clouds have rolled in, then one every 0.95 seconds,
    each up to 0.3 seconds late: the last about 7.5 seconds in, before the clouds roll away.
  - `top`: where it leaves the clouds: anywhere from 10% to 90% of the way across.
  - `bottom`: where it strikes, on the bottom row (`h - 1`): a little to one side of `top` (up to
    7.5% of the width either way). The third (`i === 2`) strikes within 10 pixels of her
    (`beside`, her `x`) instead, and its `top` moves to just above that spot, so it comes almost
    straight down beside her.
  - `path`: the jagged path between them, pushed aside by up to 35% of its height.
  - `branches`: two or three (`2 + Math.floor(random() * 2)`), each forking off from a point 20%
    to 60% of the way down the path, heading off to one side (up to 6% of the width) and down 30%
    to 60% of the rest of the way to the ground; jagged too, a level less (16 short lines).
- `cloudDepth(t, h)`: as its comment says, how far down the clouds hang at `t`, in pixels: rolling
  in over the first 1.5 seconds, fast and then slowing (`easeOut`), to a quarter of the screen
  (`CLOUD`), and away again over the last 1.3 seconds. A test checks there are none at the start
  or the end, and more than a fifth of the screen of them 3 seconds in.

### `drawThunderstorm()`

<!-- code: apps/desktop/src/renderer/src/lib/spells/thunderstorm.ts#drawThunderstorm -->

[`src/renderer/src/lib/spells/thunderstorm.ts`, lines 78–167](../../apps/desktop/src/renderer/src/lib/spells/thunderstorm.ts#L78-L167)

```ts
/** The thunderstorm spell at `scene.t`. */
export function drawThunderstorm(p: Painter, scene: Scene): void {
  const { w, h } = scene
  const t = scene.still ? THUNDERSTORM.durationMs * 0.45 : scene.t
  const depth = cloudDepth(t, h)
  const storm = depth / (h * CLOUD)
  const strikes = bolts(w, h, scene.x)
  const flashing = !scene.still && strikes.some((bolt) => t - bolt.at >= 0 && t - bolt.at < 60)

  // The flash: the whole screen lit for a moment.
  if (flashing) p.rect(0, 0, w, h, '#e0f2fe', 0.22)

  // Rain: slanting streaks falling from the clouds, more as the storm grows.
  const random = seeded(53)
  for (let k = 0; k < 380; k++) {
    const x0 = random() * w * 1.25
    const speed = 0.7 + random() * 0.5
    const phase = random() * h
    if (k >= 380 * storm) continue
    const y = depth * 0.6 + ((phase + t * speed) % (h - depth * 0.6))
    const x = x0 - (y - depth * 0.6) * 0.25
    for (let j = 0; j < 5; j++) {
      plot(p, x + j * 0.25, y - j, j < 2 ? '#bfdbfe' : '#93c5fd', 0.6 - j * 0.1)
    }
  }
  // Splashes along the bottom: little crowns of water, coming and going.
  for (let k = 0; k < 50; k++) {
    const x = random() * w
    const phase = random() * 320
    const age = (t + phase) % 320
    if (k >= 50 * storm || age > 160) continue
    const spread = age / 40
    plot(p, x - spread, h - 2 - spread * 0.6, '#bfdbfe', 0.6 * (1 - age / 160))
    plot(p, x + spread, h - 2 - spread * 0.6, '#bfdbfe', 0.6 * (1 - age / 160))
    plot(p, x, h - 1, '#93c5fd', 0.5 * (1 - age / 160))
  }

  // Lightning: each bolt flickering for a moment, a white core with a blue glow; its branches
  // thinner; a burst of sparks where it hits.
  for (const bolt of strikes) {
    const age = t - bolt.at
    if (scene.still || age < 0 || age > BOLT_MS || !flickering(age)) continue
    for (let k = 0; k < bolt.path.length - 1; k++) {
      const [a, b] = [bolt.path[k]!, bolt.path[k + 1]!]
      line(p, { x: a.x - 1, y: a.y }, { x: b.x - 1, y: b.y }, '#93c5fd', 0.55)
      line(p, { x: a.x + 1, y: a.y }, { x: b.x + 1, y: b.y }, '#93c5fd', 0.55)
      line(p, a, b, '#ffffff', 1)
    }
    for (const branch of bolt.branches) {
      for (let k = 0; k < branch.length - 1; k++)
        line(p, branch[k]!, branch[k + 1]!, '#e0f2fe', 0.85)
    }
    const hit = bolt.path.at(-1)!
    disc(p, hit.x, hit.y, 8, 3, '#e0f2fe', 0.5)
    for (let k = 0; k < 6; k++)
      twinkle(
        p,
        hit.x + Math.cos(k) * (4 + age / 25),
        hit.y - Math.abs(Math.sin(k)) * (2 + age / 30),
        '#bfdbfe',
        0.9,
      )
  }

  // The clouds: a dark bank over the top, its underside lumpy and rolling, lighter towards it (and
  // lit up during a flash).
  for (let x = 0; x < w; x += 2) {
    const lump = noise(x * 0.018 + t * 0.00025, 1.5) * 0.45 + noise(x * 0.06 - t * 0.0004, 4) * 0.2
    const bottom = depth * (0.6 + lump)
    if (bottom < 1) continue
    const alpha = 0.92 * Math.min(1, storm * 1.5)
    p.rect(x, 0, 2, Math.round(bottom * 0.55), flashing ? '#4b5563' : '#111827', alpha)
    p.rect(
      x,
      Math.round(bottom * 0.55),
      2,
      Math.round(bottom * 0.3),
      flashing ? '#6b7280' : '#1f2937',
      alpha,
    )
    p.rect(
      x,
      Math.round(bottom * 0.85),
      2,
      Math.max(1, Math.round(bottom * 0.15)),
      flashing ? '#9ca3af' : '#374151',
      alpha,
    )
  }
}
```

<!-- /code -->

As its comment says, the thunderstorm spell at `scene.t`. It's drawn from the back: the flash, the
rain, the lightning, then the clouds over the top of it all.

- `t`: with reduced motion, 45% of the way through, held still (and with no lightning; below).
- `depth`, `storm`: how far down the clouds are now, and that as a share of their fullest, 0 to 1:
  how much of the storm there is. The rain and the splashes grow with it.
- `strikes`: the bolts (`bolts()`), the third beside her.
- `flashing`: whether a bolt struck less than 0.06 seconds ago. Never with reduced motion.
- The flash: as the comment says, the whole screen lit for a moment: one `p.rect` over all of it,
  a pale blue at 22%.
- The rain: as the comment says, slanting streaks falling from the clouds, more as the storm grows.
  Of 380 drops, the first `380 * storm` are drawn (each takes its three numbers first, so each
  keeps its own).
  - `y`: each falls at its own speed from a little way into the clouds (60% of their depth) to the
    bottom, and starts again (`% (h - depth * 0.6)`).
  - `x`: it drifts left as it falls (`- (y - depth * 0.6) * 0.25`), which slants the rain. `x0`
    goes up to a quarter past the right-hand edge, so the slant doesn't leave that side dry.
  - Each streak is 5 pixels, going up and a little to the right from its head, so it leans the way
    it falls: the two lowest a paler blue, all of them fainter toward the top.
- The splashes: as the comment says, little crowns of water along the bottom, coming and going: up
  to 50 (fewer while the storm builds), each splashing for 0.16 seconds of every 0.32, at its own
  moment: two drops flying up and out either side, fading, and a pixel on the bottom row.
- The lightning: as the comment says, each bolt flickering for a moment, a white core with a blue
  glow; its branches thinner; a burst of sparks where it hits. A bolt is drawn only in its first
  `BOLT_MS`, and only while it's `flickering()`; with reduced motion, never.
  - For each short line of its path, a pale blue line a pixel to either side (55%), then a white
    one between them: a white core with its glow, three pixels wide.
  - Its branches: a single pale line each, so thinner than the bolt.
  - `hit`: its last point, where it strikes the ground: a flat, pale glow (`disc`, 8 pixels round
    and 3 up and down), and six twinkles thrown up and out from it.
- The clouds: as the comment says, a dark bank over the top, its underside lumpy and rolling,
  lighter toward it, and lit up during a flash. For every second column of pixels:
  - `lump`: two layers of `noise()` (`spellMotion.ts`), a broad one and a finer one, each drifting
    its own way with time (`+ t * 0.00025`, `- t * 0.0004`), so the underside rolls and churns.
  - `bottom`: how far down the cloud reaches in this column: 60% to 125% of `depth`, with the
    lumps. A column with nothing to draw is skipped.
  - `alpha`: nearly opaque (92%) once the storm is two thirds in, fading in and out with it.
  - Three `rect`s two pixels wide: the top 55% of the column darkest (a near-black blue-grey), the
    next 30% a shade lighter, and the bottom 15% lighter again, so the underside looks lit from
    below. During a flash, all three are lighter greys.

## `src/renderer/src/lib/spells/blizzard.ts`: the blizzard

As the comment at the top says, a blizzard: snow blowing across the screen in gusts (flakes of
three sizes, streaks of wind), frost creeping in from the corners of the screen, and snow piling up
along the taskbar, under a faint cold tint, all melting away at the end.

### `drift()`, `strength()` and `frostReach()`

<!-- code: apps/desktop/src/renderer/src/lib/spells/blizzard.ts#drift,strength,frostReach -->

[`src/renderer/src/lib/spells/blizzard.ts`, lines 5–22](../../apps/desktop/src/renderer/src/lib/spells/blizzard.ts#L5-L22)

```ts
// Blizzard: snow blowing across the screen in gusts (flakes of three sizes, streaks of wind),
// frost creeping in from the corners of the screen, and snow piling up along the taskbar, under a
// faint cold tint, all melting away at the end.

/** How far the wind has blown the snow sideways by `t` (pixels, to the left): steady, in gusts. */
export function drift(t: number): number {
  return 0.09 * t + 90 * Math.sin(t / 1400) + 40 * Math.sin(t / 530)
}

/** How much of the blizzard there is at `t`, 0 to 1: building up, then melting away at the end. */
export function strength(t: number): number {
  return easeOut(t / 1500) * (1 - between(t, BLIZZARD.durationMs - 1200, BLIZZARD.durationMs))
}

/** How far the frost has crept in from each corner at `t` (pixels), at most a fifth of the screen. */
export function frostReach(t: number, w: number, h: number): number {
  return Math.min(w, h) * 0.2 * easeOut((t - 400) / 4500) * strength(t)
}
```

<!-- /code -->

- `drift(t)`: as its comment says, how far the wind has blown the snow sideways by `t`, in pixels
  to the left: steadily (`0.09 * t`, 90 pixels a second), plus two slow swings (sine waves, one
  about every 8.8 seconds and one about every 3.3), which make it come in gusts, now strong, now
  dying away almost to nothing. A test checks it keeps blowing one way.
- `strength(t)`: as its comment says, how much of the blizzard there is at `t`, 0 to 1: building
  up over the first 1.5 seconds (fast, then slowing) and melting away over the last 1.2. Nearly
  everything drawn is scaled by it. A test checks it's 0 at the start and the end, and full in
  between.
- `frostReach(t, w, h)`: as its comment says, how far the frost has crept in from each corner, at
  most a fifth of the screen's shorter side: from 0.4 seconds in, growing over 4.5 seconds, fast at
  first, and melting with the rest. A test checks it never creeps further.

### `crystal()`

<!-- code: apps/desktop/src/renderer/src/lib/spells/blizzard.ts#crystal -->

[`src/renderer/src/lib/spells/blizzard.ts`, lines 24–49](../../apps/desktop/src/renderer/src/lib/spells/blizzard.ts#L24-L49)

```ts
/** A frost crystal: a branch from a corner, with twigs off it at 60°, each shorter than the last. */
function crystal(
  p: Painter,
  from: { x: number; y: number },
  angle: number,
  length: number,
  alpha: number,
): void {
  const to = { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length }
  line(p, from, to, '#e0f2fe', alpha * 0.7)
  plot(p, to.x, to.y, '#ffffff', alpha)
  for (let d = 5; d < length - 2; d += 5) {
    const at = { x: from.x + Math.cos(angle) * d, y: from.y + Math.sin(angle) * d }
    const twig = (length - d) * 0.35
    for (const side of [-1, 1]) {
      const a = angle + side * (Math.PI / 3)
      line(
        p,
        at,
        { x: at.x + Math.cos(a) * twig, y: at.y + Math.sin(a) * twig },
        '#e0f2fe',
        alpha * 0.5,
      )
    }
  }
}
```

<!-- /code -->

As its comment says, a frost crystal: a branch from a corner, with twigs off it at 60°, each
shorter than the last. Ice crystals grow in sixes, which is why frost forks at 60°
(`Math.PI / 3`).

- `to`: the branch's tip, `length` pixels from `from` at `angle`; a pale blue line to it, with a
  white pixel at the tip.
- The twigs: every 5 pixels along the branch (`d`), stopping short of the tip, one off each side
  (`side`, -1 and 1) at 60° to it, 35% as long as the branch still has to go
  (`(length - d) * 0.35`), so they get shorter toward the tip, like a feather of frost. They're
  fainter than the branch.

### `drawBlizzard()`

<!-- code: apps/desktop/src/renderer/src/lib/spells/blizzard.ts#drawBlizzard -->

[`src/renderer/src/lib/spells/blizzard.ts`, lines 51–131](../../apps/desktop/src/renderer/src/lib/spells/blizzard.ts#L51-L131)

```ts
/** The blizzard spell at `scene.t`. */
export function drawBlizzard(p: Painter, scene: Scene): void {
  const { w, h } = scene
  const t = scene.still ? BLIZZARD.durationMs * 0.45 : scene.t
  const now = strength(t)

  // The cold: a faint blue over everything.
  p.rect(0, 0, w, h, '#bae6fd', 0.06 * now)

  // Frost from each corner: a fan of crystals growing in, each its own length.
  const reach = frostReach(t, w, h)
  const corners = [
    { x: 0, y: 0, a: 0 },
    { x: w - 1, y: 0, a: Math.PI / 2 },
    { x: w - 1, y: h - 1, a: Math.PI },
    { x: 0, y: h - 1, a: (Math.PI * 3) / 2 },
  ]
  const random = seeded(61)
  for (const corner of corners) {
    for (let k = 0; k < 6; k++) {
      const angle = corner.a + ((k + 0.5) / 6) * (Math.PI / 2) + (random() - 0.5) * 0.2
      const length = reach * (0.55 + random() * 0.45)
      if (length > 3) crystal(p, corner, angle, length, 0.8 * now)
    }
  }

  // Streaks of wind racing across.
  for (let k = 0; k < 14; k++) {
    const y = random() * h * 0.9
    const speed = 0.5 + random() * 0.5
    const phase = random() * (w + 60)
    const x = w + 30 - ((phase + t * speed) % (w + 60))
    const length = 10 + random() * 14
    line(p, { x, y }, { x: x + length, y: y - 1 }, '#ffffff', 0.25 * now)
  }

  // The snow: flakes of three sizes, the bigger ones nearer, so faster, blown by the wind and
  // swaying, wrapping round the screen; more of them as it builds.
  const blown = drift(t)
  for (let k = 0; k < BLIZZARD.flakes; k++) {
    const size = random() < 0.7 ? 0 : random() < 0.66 ? 1 : 2
    const fall = 0.025 + random() * 0.03 + size * 0.02
    const x0 = random() * (w + 40)
    const phase = random() * (h + 20)
    const sway = random() * Math.PI * 2
    if (k >= BLIZZARD.flakes * now) continue
    const y = ((phase + t * fall) % (h + 20)) - 10
    const x =
      ((((x0 - blown * (0.6 + size * 0.3) + Math.sin(t / 600 + sway) * 5) % (w + 40)) + w + 40) %
        (w + 40)) -
      20
    const alpha = (0.65 + size * 0.15) * now
    plot(p, x, y, '#ffffff', alpha)
    if (size >= 1) {
      plot(p, x + 1, y, '#e0f2fe', alpha * 0.8)
      plot(p, x - 1, y, '#e0f2fe', alpha * 0.8)
      plot(p, x, y + 1, '#e0f2fe', alpha * 0.8)
      plot(p, x, y - 1, '#e0f2fe', alpha * 0.8)
    }
    if (size === 2) {
      for (const [dx, dy] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ] as const) {
        plot(p, x + dx * 2, y + dy * 2, '#ffffff', alpha * 0.7)
      }
    }
  }

  // Snow piling up along the bottom: a white drift with a lumpy top, edged in pale blue.
  const pile = Math.min(h * 0.04, 22) * between(t, 1200, 7000) * now
  if (pile >= 1) {
    for (let x = 0; x < w; x += 2) {
      const height = pile * (0.55 + 0.45 * noise(x * 0.03, 7.5))
      p.rect(x, Math.round(h - height), 2, Math.ceil(height), '#f8fafc', 0.92 * now)
      p.rect(x, Math.round(h - height), 2, 1, '#bae6fd', 0.8 * now)
    }
  }
}
```

<!-- /code -->

As its comment says, the blizzard spell at `scene.t`, drawn from the back.

- `t`: with reduced motion, 45% of the way through, held still. `now`: its `strength()` then.
- The cold: as the comment says, a faint blue over everything: one pale blue `rect` over the whole
  screen at 6%.
- The frost: as the comment says, from each corner, a fan of crystals growing in, each its own
  length. `corners` are the four corners, each with the angle its fan starts at: from the top-left,
  it spreads between pointing right (0) and pointing down (π/2), and each corner after it a
  quarter-turn further round, so every fan opens into the screen. Each has six crystals spread
  evenly across its quarter-turn (nudged a little at random), each 55% to all of `reach` long. One
  of 3 pixels or less isn't drawn.
- The wind: as the comment says, streaks racing across: 14 faint white lines, 10 to 24 pixels long,
  each at its own height, racing from the right-hand edge to the left at its own speed and starting
  again (`% (w + 60)`, with 30 pixels to spare at either side, so they come and go off the screen),
  a pixel higher at their right-hand end.
- The snow: as the comment says, flakes of three sizes, the bigger ones nearer, so faster, blown by
  the wind and swaying, wrapping round the screen; more of them as it builds. Of `BLIZZARD.flakes`
  (340), the first `340 * now` are drawn, each taking its numbers first.
  - `size`: 0 for 70% of them, 1 for about two thirds of the rest, and 2 for the others.
  - `fall`: how fast it falls, faster for the bigger ones. Nearer things seem to move faster, so
    this gives the snow depth (_parallax_).
  - `y`: falling at that speed from just above the top to just below the bottom, and round again.
  - `x`: where it started, blown left by the wind (`blown`, the bigger ones further, again for
    depth), swaying 5 pixels either way, and wrapped round (`% (w + 40)`), so a flake blown off the
    left-hand edge comes back on the right. It's `%`, `+ w + 40` and `%` again because in
    JavaScript `%` of a negative number stays negative.
  - The flake: a white pixel; size 1 adds its four neighbours in pale blue, a little plus; size 2
    also four white pixels two out on the diagonals, a little star.
- The drift: as the comment says, snow piling up along the bottom: a white drift with a lumpy top
  and a blue shadow along it.
  - `pile`: how high it has got: up to 4% of the screen's height (and no more than 22 pixels),
    growing from 1.2 seconds in to 7, and melting with the rest.
  - For every second column, `height` is 55% to all of that, `noise()` making the top lumpy (it
    doesn't move with time: a drift stays put), then a near-white `rect` up from the bottom, and
    the pale blue shadow a pixel deep along its top.

## `src/renderer/src/lib/spells/vortex.ts`: the vortex

As the comment at the top says, a vortex: a portal tears open in the middle of the screen: a black
heart ringed with light, four glowing arms spiralling round it, rings of bent light about it,
sparks of lightning crackling at its rim, and specks drawn in from all over the screen, spiralling
faster as they fall in. Then it collapses into itself and goes off in a flash and a shock wave.

### `portalRadius()`, `middle` and `armColour()`

<!-- code: apps/desktop/src/renderer/src/lib/spells/vortex.ts#portalRadius,middle,armColour -->

[`src/renderer/src/lib/spells/vortex.ts`, lines 5–25](../../apps/desktop/src/renderer/src/lib/spells/vortex.ts#L5-L25)

```ts
// Vortex: a portal tears open in the middle of the screen: a black heart ringed with light, four
// glowing arms spiralling round it, rings of bent light about it, sparks of lightning crackling at
// its rim, and specks drawn in from all over the screen, spiralling faster as they fall in. Then it
// collapses into itself and goes off in a flash and a shock wave.

/** How big the portal is at `t` (pixels): opening, steady (breathing a little), collapsing, gone. */
export function portalRadius(t: number, w: number, h: number): number {
  const full = Math.min(w, h) * 0.3
  if (t >= VORTEX.implodeAt) return 0
  const open = easeOut(t / VORTEX.openMs)
  const collapse = between(t, VORTEX.collapseAt, VORTEX.implodeAt) ** 2
  return full * open * (1 - collapse) * (1 + 0.04 * Math.sin(t / 180))
}

/** Where the portal opens: the middle of the screen, a little above it. */
const middle = (w: number, h: number) => ({ x: w / 2, y: h * 0.45 })

/** A colour along a spiral arm: white at its heart, then lilac, her colour, and blue at its ends. */
function armColour(share: number, accent: string): string {
  return share < 0.2 ? '#ffffff' : share < 0.45 ? '#e9d5ff' : share < 0.75 ? accent : '#60a5fa'
}
```

<!-- /code -->

- `portalRadius(t, w, h)`: as its comment says, how big the portal is at `t`, in pixels: opening,
  steady (breathing a little), collapsing, then gone. A test checks it opens from nothing, holds at
  about 30% of the screen, shrinks as it collapses, and is gone at the implosion.
  - `full`: 30% of the screen's shorter side.
  - `if (t >= VORTEX.implodeAt) return 0`: from the implosion (6.9 seconds in), it's gone.
  - `open`: opening over the first second (`openMs`), fast and then slowing.
  - `collapse`: 0 to 1 from `collapseAt` (6.3 seconds) to `implodeAt`, squared (`** 2`), so it
    starts slowly and speeds up: the portal falls in on itself faster and faster.
  - `(1 + 0.04 * Math.sin(t / 180))`: breathing, 4% bigger and smaller, about once a second.
- `middle(w, h)`: as its comment says, where the portal opens: halfway across the screen, and a
  little above halfway down (45%).
- `armColour(share, accent)`: as its comment says, a colour along a spiral arm, by how far out
  along it (`share`, 0 at the heart to 1 at its end): white for the first fifth, then lilac, then
  her colour, and blue for the last quarter.

### `drawVortex()`

<!-- code: apps/desktop/src/renderer/src/lib/spells/vortex.ts#drawVortex -->

[`src/renderer/src/lib/spells/vortex.ts`, lines 27–132](../../apps/desktop/src/renderer/src/lib/spells/vortex.ts#L27-L132)

```ts
/** The vortex spell at `scene.t`. */
export function drawVortex(p: Painter, scene: Scene): void {
  const { w, h, accent } = scene
  const t = scene.still ? VORTEX.durationMs * 0.45 : scene.t
  const c = middle(w, h)
  const r = portalRadius(t, w, h)
  const spin = t * 0.0022 + between(t, VORTEX.collapseAt, VORTEX.implodeAt) * 6

  if (r > 1) {
    // Specks drawn in from all over the screen, spiralling round faster as they fall in.
    const random = seeded(71)
    const far = Math.hypot(w, h) * 0.6
    for (let k = 0; k < 200; k++) {
      const start = r * 1.2 + random() * (far - r)
      const angle = random() * Math.PI * 2
      const period = 1800 + random() * 1800
      const phase = random() * period
      const colour = k % 3 === 0 ? '#ffffff' : k % 3 === 1 ? accent : '#93c5fd'
      const u = ((t + phase) % period) / period
      const fall = start * (1 - u) ** 1.6 + r * 0.25
      const a = angle + u * u * 9 + spin
      const x = c.x + Math.cos(a) * fall
      const y = c.y + Math.sin(a) * fall * 0.85
      if (k % 3 === 0) square(p, x - 0.5, y - 0.5, 2, colour, Math.min(1, u * 4) * 0.9)
      else plot(p, x, y, colour, Math.min(1, u * 4) * 0.9)
      const back = start * (1 - Math.max(0, u - 0.03)) ** 1.6 + r * 0.25
      const ab = angle + Math.max(0, u - 0.03) ** 2 * 9 + spin
      plot(p, c.x + Math.cos(ab) * back, c.y + Math.sin(ab) * back * 0.85, colour, u * 0.5)
    }

    // Rings of bent light round it, dashed and turning, one each way.
    ring(p, c.x, c.y, r * 1.08, r * 0.92, accent, 0.5, spin * 0.7, 0.22)
    ring(p, c.x, c.y, r * 1.3, r * 1.1, '#93c5fd', 0.35, -spin * 0.5, 0.3)

    // A glow of her colour about it.
    disc(p, c.x, c.y, r * 0.8, r * 0.68, accent, 0.12)
    disc(p, c.x, c.y, r * 0.5, r * 0.43, '#e9d5ff', 0.1)

    // Four arms of light spiralling in to the heart, each three pixels wide, with a fainter
    // fourth along one side.
    for (let arm = 0; arm < 4; arm++) {
      for (let k = 0; k <= 90; k++) {
        const share = k / 90
        const a = spin + (arm * Math.PI) / 2 + share * 2.6
        const d = r * (0.3 + share * 0.72)
        const x = c.x + Math.cos(a) * d
        const y = c.y + Math.sin(a) * d * 0.85
        const colour = armColour(share, accent)
        const alpha = 1 - share * 0.6
        const across = { x: Math.cos(a + 1.57), y: Math.sin(a + 1.57) * 0.85 }
        plot(p, x, y, colour, alpha)
        plot(p, x + across.x, y + across.y, colour, alpha * 0.75)
        plot(p, x - across.x, y - across.y, colour, alpha * 0.75)
        plot(p, x + across.x * 2, y + across.y * 2, colour, alpha * 0.35)
      }
    }

    // The black heart, ringed with light.
    disc(p, c.x, c.y, r * 0.3, r * 0.26, '#0b0618', 0.95)
    ring(p, c.x, c.y, r * 0.3, r * 0.26, '#e9d5ff', 0.95)
    ring(p, c.x, c.y, r * 0.33, r * 0.29, accent, 0.6)

    // Lightning crackling at its rim: a new spark every tenth of a second.
    const crackle = seeded(Math.floor(t / 100) + 7)
    for (let k = 0; k < 3; k++) {
      const a = crackle() * Math.PI * 2
      const from = { x: c.x + Math.cos(a) * r * 0.85, y: c.y + Math.sin(a) * r * 0.72 }
      let at = from
      for (let s = 0; s < 4; s++) {
        const next = {
          x: at.x + (crackle() - 0.5) * r * 0.25,
          y: at.y + (crackle() - 0.5) * r * 0.2,
        }
        line(p, at, next, '#e0f2fe', 0.85)
        at = next
      }
    }
  }

  // The implosion: a white flash over the screen, a shock wave racing out, sparks flung outward.
  const after = t - VORTEX.implodeAt
  if (after >= 0 && !scene.still) {
    if (after < 200) p.rect(0, 0, w, h, '#ffffff', 0.6 * (1 - after / 200))
    const wave = easeOut(after / 900)
    const fade = 1 - between(after, 0, VORTEX.durationMs - VORTEX.implodeAt)
    ring(p, c.x, c.y, wave * Math.max(w, h) * 0.6, wave * Math.max(w, h) * 0.5, '#e9d5ff', fade)
    ring(
      p,
      c.x,
      c.y,
      wave * Math.max(w, h) * 0.58,
      wave * Math.max(w, h) * 0.48,
      accent,
      fade * 0.6,
    )
    const random = seeded(73)
    for (let k = 0; k < 60; k++) {
      const a = random() * Math.PI * 2
      const speed = (0.1 + random() * 0.2) * (Math.min(w, h) / 300)
      const x = c.x + Math.cos(a) * speed * after
      const y = c.y + Math.sin(a) * speed * after * 0.85
      if (k % 4 === 0) twinkle(p, x, y, accent, fade)
      else plot(p, x, y, '#ffffff', fade)
    }
  }
}
```

<!-- /code -->

As its comment says, the vortex spell at `scene.t`.

- `t`: with reduced motion, 45% of the way through, held still. `c`: the portal's middle; `r`: its
  radius now.
- `spin`: how far it has turned, in radians: steadily (`t * 0.0022`, a turn about every 2.9
  seconds), and six radians more (nearly another turn) while it collapses, so it whirls faster as
  it falls in.
- `if (r > 1)`: the portal, drawn while it's there (everything but the implosion).
- The specks: as the comment says, drawn in from all over the screen, spiralling round faster as
  they fall in. 200 of them, from `seeded(71)`.
  - `start`: how far out each starts: from just outside the portal to `far`, 60% of the screen's
    diagonal, so from the corners too.
  - `angle`, `period`, `phase`: where round it starts, how long it takes to fall in (1.8 to 3.6
    seconds) and how far through that it was when the spell began. Each falls in and starts again,
    over and over.
  - `u`: how far through its fall it is now, 0 to 1.
  - `fall`: its distance from the middle: from `start` down to a quarter of the portal's radius,
    slowly at first and faster as it nears (`(1 - u) ** 1.6`).
  - `a`: its angle, turning faster and faster as it falls (`u * u * 9`, about a turn and a half by
    the end), and with the portal.
  - `y`: squashed to 85% up and down, as is everything in the vortex, so it looks tipped a little
    toward you.
  - Every third is a white square two pixels across, the rest single pixels in her colour or blue;
    each fades in over the first quarter of its fall. A fainter pixel where it was a moment before
    (3% of its fall earlier) gives it a short tail.
- The rings: as the comment says, rings of bent light round it, dashed and turning, one each way:
  one just outside its edge in her colour, and a fainter blue one further out, turning the other
  way (`-spin`). It's how light looks bent round a black hole (_gravitational lensing_).
- The glow: as the comment says, a glow of her colour about it: a faint disc of her colour, and a
  smaller lilac one inside it.
- The arms: as the comment says, four arms of light spiralling in to the heart. Each is 91 points,
  a quarter-turn round from the last arm (`arm * Math.PI / 2`), from the heart's edge (30% of the
  radius) out to just past the portal's edge (102%), curving round by 2.6 radians (about 150°) as
  it goes. Each point is coloured by `armColour()` and fainter toward the end
  (`1 - share * 0.6`). `across` is the direction square to the arm there (`a + 1.57`, a
  quarter-turn), and a pixel either side of the point, a little fainter, makes the arm the three
  pixels wide the comment says, with a fourth, fainter still, two out on one side.
- The heart: as the comment says, the black heart, ringed with light: a near-black disc (the
  darkest purple) 30% of the radius, a lilac ring round it, and a fainter ring of her colour just
  outside that.
- The rim lightning: as the comment says, lightning crackling at its rim, a new spark every tenth
  of a second. `seeded(Math.floor(t / 100) + 7)` takes a new seed every 0.1 seconds, so the same
  three sparks show for a tenth of a second, then three new ones. Each starts at a random point on
  the rim (85% of the radius) and zigzags four short steps at random, in pale blue.
- The implosion: as the comment says, a white flash over the screen, a shock wave racing out, and
  sparks flung outward. From `implodeAt`, and not with reduced motion:
  - `after`: how long since it went off.
  - The flash: the whole screen white at 60%, fading over 0.2 seconds.
  - `wave`: how far out the shock wave is: to 60% of the screen's longer side over 0.9 seconds,
    fast and then slowing. `fade`: fading over the 1.1 seconds left until the window closes.
  - The shock wave: a lilac ring, and a fainter one of her colour just inside it, flattened like
    the portal.
  - The sparks: 60 of them, from `seeded(73)`, flung straight out from the middle, each its own way
    at its own speed (for the screen's size); every fourth a twinkle in her colour, the rest white
    pixels.

## `src/renderer/src/lib/spells/butterflies.ts`: the butterflies

As the comment at the top says, butterflies: a burst of sparkles at her, and out of it a swarm of
little magic butterflies, each its own colour (some bigger, nearer), fluttering up and away across
the screen along wavy paths of their own, flapping, each with a glittering trail.

### `OPEN`, `SHUT` and `WINGS`

<!-- code: apps/desktop/src/renderer/src/lib/spells/butterflies.ts#OPEN,SHUT,WINGS -->

[`src/renderer/src/lib/spells/butterflies.ts`, lines 5–12](../../apps/desktop/src/renderer/src/lib/spells/butterflies.ts#L5-L12)

```ts
// Butterflies: a burst of sparkles at her, and out of it a swarm of little magic butterflies,
// each its own colour (some bigger, nearer), fluttering up and away across the screen along wavy
// paths of their own, flapping, each with a glittering trail.

/** Wings open and shut, as rows of pixels: W the wings, S a white spot on each, k the gold body. */
const OPEN = ['WW.WW', 'WSkSW', '.W.W.']

const SHUT = ['.WkW.', '..k..']

const WINGS = ['#2dd4bf', '#f472b6', '#fbbf24', '#60a5fa', '#fb923c', '#a3e635', '#e879f9']
```

<!-- /code -->

- `OPEN`, `SHUT`: as the comment says, a butterfly with its wings open and shut, written as rows of
  pixels like the small pictures in `rig.ts`: `W` the wings, `S` a white spot on each, `k` the gold
  body, and `.` nothing. It's the butterfly that lands on her finger in her `butterfly` habit
  (`BUTTERFLY_OPEN` and `BUTTERFLY_SHUT`), in any colour. Open, it's five pixels wide and three
  tall: two wings at the top, a spot either side of the body, and two smaller wings below. Shut,
  only the body and the wings folded up beside it show.
- `WINGS`: the colours its wings can be: teal, pink, amber, blue, orange, lime and orchid.

### `Flier`, `heart` and `flier()`

<!-- code: apps/desktop/src/renderer/src/lib/spells/butterflies.ts#Flier,heart,flier -->

[`src/renderer/src/lib/spells/butterflies.ts`, lines 14–60](../../apps/desktop/src/renderer/src/lib/spells/butterflies.ts#L14-L60)

```ts
/** Where a butterfly is: its middle, whether its wings are open, its colour and size. */
export interface Flier {
  x: number
  y: number
  open: boolean
  colour: string
  size: 2 | 3
}

/** Where she is, as the butterflies come out of her: her middle (pixels). */
const heart = (scene: Pick<Scene, 'x' | 'feet' | 'height'>) => ({
  x: scene.x,
  y: scene.feet - scene.height * 0.55,
})

/**
 * Butterfly `k` (of BUTTERFLIES.count) at `t`, or null before it comes out of her: each leaves her
 * a moment after the last, heading up and outward at its own speed, weaving side to side, bobbing
 * as it flaps, its wings opening and shutting at its own pace.
 */
export function flier(
  k: number,
  t: number,
  scene: Pick<Scene, 'x' | 'feet' | 'height'>,
): Flier | null {
  const random = seeded(200 + k)
  const born = k * 55 + random() * 500
  const heading = -Math.PI / 2 + (random() - 0.5) * 2.4
  const speed = 0.05 + random() * 0.06
  const weave = 8 + random() * 10
  const sway = random() * Math.PI * 2
  const flap = 100 + random() * 60
  const colour = WINGS[Math.floor(random() * WINGS.length)]!
  const size = random() < 0.3 ? 3 : 2
  const age = t - born
  if (age < 0) return null
  const from = heart(scene)
  const along = speed * age
  const across = Math.sin(age / 320 + sway) * weave
  return {
    x: from.x + Math.cos(heading) * along - Math.sin(heading) * across,
    y: from.y + Math.sin(heading) * along + Math.cos(heading) * across + Math.sin(age / 90) * 1.5,
    open: Math.floor(age / flap) % 2 === 0,
    colour,
    size,
  }
}
```

<!-- /code -->

- `Flier`: as its comment says, where a butterfly is: its middle (`x`, `y`), whether its wings are
  open, its colour and its size (each of its pixels drawn 2 or 3 pixels across).
- `heart(scene)`: as its comment says, where she is as the butterflies come out of her: her middle,
  55% of her height up from her feet.
- `flier(k, t, scene)`: as its comment says, butterfly `k` at `t`, or `null` before it comes out of
  her. Each leaves her a moment after the last, heading up and outward at its own speed, weaving
  from side to side, bobbing as it flaps, its wings opening and shutting at its own pace. Each has
  a seeded generator of its own (`seeded(200 + k)`), so any butterfly at any moment can be worked
  out on its own, which is how their trails are drawn (below). A test checks none is out at the
  start and all are 3 seconds in, the first starts near her middle and climbs, and it flaps.
  - `born`: when it comes out: 0.055 seconds after the one before (`k * 55`), plus up to half a
    second at random, so all 36 are out within 2.5 seconds.
  - `heading`: which way it goes: straight up (`-Math.PI / 2`, as `y` grows downward), give or take
    1.2 radians (about 70°) either way, so the swarm fans up and out.
  - `speed`: 0.05 to 0.11 pixels a millisecond.
  - `weave`, `sway`: how far it weaves from side to side (8 to 18 pixels), and where in its weave it
    starts.
  - `flap`: how long its wings stay open, and then shut: 0.1 to 0.16 seconds, each its own pace.
  - `colour`, `size`: one of `WINGS`, and size 3 (nearer) for three in ten of them, 2 for the rest.
  - `along`, `across`: how far it has flown along its heading, and how far off to one side it is
    now, weaving (a sine wave, a full swing about every 2 seconds).
  - `x`, `y`: from her middle, `along` its heading and `across` square to it (the `cos` and `sin`
    turn the two into across and down the screen), plus a little bob up and down (1.5 pixels, about
    every 0.57 seconds) as it flaps.
  - `open`: open and shut by turns, every `flap` milliseconds.

### `draw()` and `drawButterflies()`

<!-- code: apps/desktop/src/renderer/src/lib/spells/butterflies.ts#draw,drawButterflies -->

[`src/renderer/src/lib/spells/butterflies.ts`, lines 62–111](../../apps/desktop/src/renderer/src/lib/spells/butterflies.ts#L62-L111)

```ts
/** One butterfly, its wings as they are, `size` pixels a pixel. */
function draw(p: Painter, b: Flier, alpha: number): void {
  const rows = b.open ? OPEN : SHUT
  const left = b.x - (rows[0]!.length * b.size) / 2
  const top = b.y - (rows.length * b.size) / 2
  rows.forEach((row, j) =>
    [...row].forEach((letter, i) => {
      if (letter === '.') return
      const colour = letter === 'W' ? b.colour : letter === 'S' ? '#ffffff' : '#b3832c'
      square(p, left + i * b.size, top + j * b.size, b.size, colour, alpha)
    }),
  )
}

/** The butterflies spell at `scene.t`. */
export function drawButterflies(p: Painter, scene: Scene): void {
  const t = scene.still ? BUTTERFLIES.durationMs * 0.35 : scene.t
  const shown = scene.still
    ? 1
    : 1 - between(t, BUTTERFLIES.durationMs - 900, BUTTERFLIES.durationMs)
  const from = heart(scene)

  // The burst they come out of: a ring of sparkles, spreading and fading.
  if (t < 700 && !scene.still) {
    const spread = t / 700
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      twinkle(
        p,
        from.x + Math.cos(a) * spread * 22,
        from.y + Math.sin(a) * spread * 16,
        '#fde68a',
        1 - spread,
      )
    }
  }

  for (let k = 0; k < BUTTERFLIES.count; k++) {
    const b = flier(k, t, scene)
    if (!b) continue
    // Its trail: where it was a little while ago, glittering and fading.
    for (let j = 1; j <= 5; j++) {
      const before = flier(k, t - j * 70, scene)
      if (!before) break
      const glint = (k + j + Math.floor(t / 120)) % 4 === 0
      plot(p, before.x, before.y + 2, glint ? '#ffffff' : '#fde68a', shown * (1 - j / 6) * 0.8)
    }
    draw(p, b, shown)
  }
}
```

<!-- /code -->

- `draw(p, b, alpha)`: as its comment says, one butterfly, its wings as they are, `size` pixels a
  pixel: each letter of its picture a `square` of `size` pixels, in its wing colour, white or gold
  (`#b3832c`), the picture centred on where it is (`left`, `top`).
- `drawButterflies(p, scene)`: as its comment says, the butterflies spell at `scene.t`.
  - `t`: with reduced motion, 35% of the way through (2.8 seconds in, when they're all out), held
    still.
  - `shown`: everything fades out over the last 0.9 seconds.
  - The burst: as the comment says, the burst they come out of: a ring of sparkles, spreading and
    fading: 12 gold twinkles going out from her middle over 0.7 seconds, wider than it is tall (22
    pixels round and 16 up and down by the end). Not with reduced motion.
  - For each butterfly that's out (`flier()`), its trail: as the comment says, where it was a
    little while ago, glittering and fading: five pixels just below where it was 0.07, 0.14, 0.21,
    0.28 and 0.35 seconds before (`flier(k, t - j * 70, scene)`), each fainter. One in four is
    white rather than gold, and which moves on every 0.12 seconds, so the trail glitters. A trail
    stops where the butterfly hadn't yet come out (`break`).
  - `draw(p, b, shown)`: then the butterfly itself, over its trail.

## `src/renderer/src/lib/spells/phoenix.ts`: the phoenix

As the comment at the top says, a phoenix: a ring of fire at her, and out of it a bird of fire: it
climbs, swoops across the screen, turns a loop in the middle of it and flies off the far side, its
wings of flame beating, its tail streaming, a glow about it and a trail of embers drifting down
behind it, cooling from white to red as they fall.

### `Point`, `TAKE_OFF` and `phoenixPath()`

<!-- code: apps/desktop/src/renderer/src/lib/spells/phoenix.ts#Point,TAKE_OFF,phoenixPath -->

[`src/renderer/src/lib/spells/phoenix.ts`, lines 5–37](../../apps/desktop/src/renderer/src/lib/spells/phoenix.ts#L5-L37)

```ts
// Phoenix: a ring of fire at her, and out of it a bird of fire: it climbs, swoops across the
// screen, turns a loop in the middle of it and flies off the far side, its wings of flame beating,
// its tail streaming, a glow about it and a trail of embers drifting down behind it, cooling from
// white to red as they fall.

type Point = { x: number; y: number }

/** When the bird leaves her (ms). */
const TAKE_OFF = 300

/**
 * The bird's way across the screen, through these points: from her, up, across to the middle of
 * the screen (towards whichever side has more room), round a loop there, and away off the far side.
 */
export function phoenixPath(scene: Pick<Scene, 'w' | 'h' | 'x' | 'feet' | 'height'>): Point[] {
  const { w, h } = scene
  const start = { x: scene.x, y: scene.feet - scene.height * 0.6 }
  const dir = scene.x > w / 2 ? -1 : 1
  const loop = { x: w * 0.5, y: h * 0.34 }
  const r = Math.min(w, h) * 0.13
  return [
    start,
    { x: start.x + dir * w * 0.02, y: start.y - h * 0.22 },
    { x: loop.x - dir * r * 2.2, y: loop.y + r * 1.1 },
    { x: loop.x, y: loop.y + r },
    { x: loop.x + dir * r, y: loop.y },
    { x: loop.x, y: loop.y - r },
    { x: loop.x - dir * r, y: loop.y },
    { x: loop.x, y: loop.y + r * 0.95 },
    { x: loop.x + dir * w * 0.25, y: h * 0.18 },
    { x: dir > 0 ? w + 80 : -80, y: h * 0.05 },
  ]
}
```

<!-- /code -->

- `Point`: a point on the canvas, as in `thunderstorm.ts`.
- `TAKE_OFF = 300`: as its comment says, when the bird leaves her: 0.3 seconds in, as the ring of
  fire spreads.
- `phoenixPath(scene)`: as its comment says, the bird's way across the screen, through these
  points: from her, up, across to the middle of the screen (toward whichever side has more room),
  round a loop there, and away off the far side. `along()` (next) draws the curve through them. A
  test checks it starts at her and leaves off the side away from her.
  - `start`: just above her middle (60% of her height up from her feet).
  - `dir`: which way it goes: left (`-1`) if she's on the right-hand half of the screen, right
    (`1`) if not, so it flies toward the side with more room.
  - `loop`, `r`: the loop's middle, halfway across and about a third of the way down the screen,
    and its radius, 13% of the screen's shorter side.
  - The points, in order: her; up a little over a fifth of the screen, and a touch across; short of
    the loop and a little below it (`loop.x - dir * r * 2.2`); the bottom of the loop; its far
    side; its top; its near side; its bottom again, so it goes right round; on and up beyond it, a
    quarter of the screen further across; and away past the far edge (80 pixels beyond it), near
    the top of the screen.

### `along()` and `flightAt()`

<!-- code: apps/desktop/src/renderer/src/lib/spells/phoenix.ts#along,flightAt -->

[`src/renderer/src/lib/spells/phoenix.ts`, lines 39–66](../../apps/desktop/src/renderer/src/lib/spells/phoenix.ts#L39-L66)

```ts
/** The smooth curve through `points` (Catmull-Rom), `u` of the way along it (0 to 1). */
function along(points: Point[], u: number): Point {
  const s = clamp01(u) * (points.length - 1)
  const i = Math.min(points.length - 2, Math.floor(s))
  const f = s - i
  const p0 = points[i - 1] ?? points[i]!
  const p1 = points[i]!
  const p2 = points[i + 1]!
  const p3 = points[i + 2] ?? p2
  const at = (a: number, b: number, c: number, d: number) =>
    0.5 *
    (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f ** 3)
  return { x: at(p0.x, p1.x, p2.x, p3.x), y: at(p0.y, p1.y, p2.y, p3.y) }
}

/** Where the bird is at `t`, and which way it's heading (radians), or null before or after its flight. */
export function flightAt(
  t: number,
  scene: Pick<Scene, 'w' | 'h' | 'x' | 'feet' | 'height'>,
): (Point & { heading: number }) | null {
  const u = (t - TAKE_OFF) / PHOENIX.flightMs
  if (u < 0 || u > 1) return null
  const points = phoenixPath(scene)
  const here = along(points, u)
  const ahead = along(points, u + 0.004)
  const behind = along(points, u - 0.004)
  return { ...here, heading: Math.atan2(ahead.y - behind.y, ahead.x - behind.x) }
}
```

<!-- /code -->

- `along(points, u)`: as its comment says, the smooth curve through `points`, `u` of the way along
  it (0 to 1). It's a _Catmull-Rom spline_: a curve that goes through every point, bending
  smoothly at each, with its shape between two points set by the points either side of them. Each
  stretch between two points takes the same share of `u`, so the bird flies faster where the
  points are further apart.
  - `s`: where along the list `u` is, counted in points: 0 at the first, `points.length - 1` at the
    last. `i` is the point just before it (at most the last but one), and `f` how far it is from
    there to the next, 0 to 1.
  - `p0` to `p3`: the point before `i`, `i` itself, the next and the one after that. At the ends,
    where there's no point before or after, the end point stands in (`??`).
  - `at(a, b, c, d)`: the Catmull-Rom formula: a cubic in `f` (with powers up to 3) that's `b` at 0
    and `c` at 1, leaving `b` heading the way from `a` to `c`, and arriving at `c` heading the way
    from `b` to `d`, so the pieces join without a kink. It's worked out for `x` and `y` separately.
- `flightAt(t, scene)`: as its comment says, where the bird is at `t`, and which way it's heading
  (in radians), or `null` before or after its flight. The type `Point & { heading: number }` is a
  point with a heading as well (`&` joins two types). A test checks there's no bird before it
  takes off or once the spell is over, that it starts beside her, and that on its loop it heads
  back the way it came for a while (the top of the loop).
  - `u`: how far through its flight it is: `PHOENIX.flightMs` (6 seconds) from `TAKE_OFF`.
  - `heading`: from a point just behind it on the path to one just ahead (0.4% either way):
    `Math.atan2` gives the angle of the line between them.

### `fire` and `BIRD`

<!-- code: apps/desktop/src/renderer/src/lib/spells/phoenix.ts#fire,BIRD -->

[`src/renderer/src/lib/spells/phoenix.ts`, lines 68–81](../../apps/desktop/src/renderer/src/lib/spells/phoenix.ts#L68-L81)

```ts
/** Fire, by how hot (1 white, then yellow, orange, red, 0 deep red). */
const fire = (heat: number) =>
  heat > 0.8
    ? '#fff7d6'
    : heat > 0.6
      ? '#fde68a'
      : heat > 0.4
        ? '#fb923c'
        : heat > 0.2
          ? '#ef4444'
          : '#7f1d1d'

/** How big the bird is: each of its own units this many pixels, each drawn this many across. */
const BIRD = 2
```

<!-- /code -->

- `fire(heat)`: as its comment says, the colour of fire by how hot, from 1 down to 0: a near-white
  cream above 0.8, then yellow, orange, red, and a deep red at 0.2 and below. The bird's tail, its
  wings and its embers are coloured with it, so they cool from white to red.
- `BIRD = 2`: as its comment says, how big the bird is. It's drawn in units of its own (its body
  12 long, its wings up to 16 out), and each unit is 2 pixels on the canvas, drawn as a square 2
  pixels across, so the bird is chunky pixel art, as the explosion's fireball is. Changing it
  scales the whole bird.

### `bird()`

<!-- code: apps/desktop/src/renderer/src/lib/spells/phoenix.ts#bird -->

[`src/renderer/src/lib/spells/phoenix.ts`, lines 83–164](../../apps/desktop/src/renderer/src/lib/spells/phoenix.ts#L83-L164)

```ts
/** The bird at `at`, heading its way, wings beating with `t`. */
function bird(p: Painter, at: Point & { heading: number }, t: number, alpha: number): void {
  const f = { x: Math.cos(at.heading), y: Math.sin(at.heading) }
  // Across it, the way that's down on the screen, so it stays the right way up flying either way
  // (its crest and eye on top).
  const s = f.x >= 0 ? { x: -f.y, y: f.x } : { x: f.y, y: -f.x }
  // A point given along its body (forward) and across it, in its own units.
  const place = (forward: number, across: number) => ({
    x: at.x + (f.x * forward + s.x * across) * BIRD,
    y: at.y + (f.y * forward + s.y * across) * BIRD,
  })
  const dot = (forward: number, across: number, colour: string, a = alpha) => {
    const q = place(forward, across)
    square(p, q.x - BIRD / 2, q.y - BIRD / 2, BIRD, colour, a)
  }

  // Its glow.
  disc(p, at.x, at.y, 17 * BIRD, 13 * BIRD, '#fb923c', 0.12 * alpha)
  disc(p, at.x, at.y, 10 * BIRD, 8 * BIRD, '#fde68a', 0.12 * alpha)

  // Its tail: five streaks of flame streaming back, flickering, cooling to red at their ends.
  for (let i = 0; i < 5; i++) {
    const spread = (i - 2) * 0.17
    const length = 14 + 5 * noise(t / 90, i * 3.1)
    for (let j = 0; j < length; j++) {
      const share = j / length
      const wobble = Math.sin(t / 60 + j * 0.5 + i) * 1.4 * share
      dot(
        -6 - Math.cos(spread) * j,
        Math.sin(spread) * j * 1.6 + wobble,
        fire(1 - share),
        alpha * (1 - share * 0.6),
      )
    }
  }

  // Its wings, beating: each a triangle of flame from its body to a tip, hot at the root.
  const beat = Math.sin(t / 85)
  for (const side of [-1, 1]) {
    const span = 6 + 10 * (0.55 + 0.45 * beat)
    const root = [
      { forward: 3, across: 0 },
      { forward: -4, across: 0 },
    ]
    const tip = { forward: -8, across: side * span }
    const n = 16
    for (let a = 0; a <= n; a++) {
      for (let b = 0; b <= n - a; b++) {
        const u = a / n
        const v = b / n
        const forward =
          root[0]!.forward +
          (root[1]!.forward - root[0]!.forward) * u +
          (tip.forward - root[0]!.forward) * v
        const across = (tip.across - root[0]!.across) * v
        dot(forward, across, fire(1 - v * 0.9))
      }
    }
    // Feathers of flame off its trailing edge.
    for (let k = 1; k <= 3; k++)
      dot(-8 - k, side * span * (0.55 + k * 0.12), '#ef4444', alpha * 0.8)
  }

  // Its body, head, crest, beak and eye.
  for (let forward = -6; forward <= 6; forward += 0.7) {
    for (let across = -2.5; across <= 2.5; across += 0.7) {
      if ((forward / 6) ** 2 + (across / 2.5) ** 2 > 1) continue
      dot(forward, across, forward > 1 ? '#fff7d6' : Math.abs(across) > 1.6 ? '#fb923c' : '#fde68a')
    }
  }
  for (let forward = 5.5; forward <= 9.5; forward += 0.7) {
    for (let across = -2.2; across <= 2.2; across += 0.7) {
      if ((forward - 7.5) ** 2 + across ** 2 > 2.4 ** 2) continue
      dot(forward, across, '#fff7d6')
    }
  }
  for (let k = 0; k < 3; k++)
    dot(6.5 - k * 1.2, -3 - k * 0.8 - Math.abs(Math.sin(t / 70 + k)), fire(0.7 - k * 0.15))
  dot(10, 0, '#fbbf24')
  dot(11, 0, '#fbbf24')
  dot(8.5, -0.8, '#7c2d12')
}
```

<!-- /code -->

As its comment says, the bird at `at`, heading its way, its wings beating with `t`. Every part is
placed in the bird's own terms, along its body and across it, so the whole bird turns with its
heading.

- `f`, `s`: a step forward (along `heading`) and a step to its side (`f` turned a quarter-turn). As
  the comment says, `s` is always the side that's down on the screen: `{ x: -f.y, y: f.x }` flying
  right, `{ x: f.y, y: -f.x }` flying left. With only the first, a bird flying left (the usual way,
  from her bottom-right corner) would be upside down, its crest and eye underneath; this way it's
  mirrored instead, the right way up whichever way it flies.
- `place(forward, across)`: as the comment says, a point given along its body (forward) and across
  it, in its own units: that far along `f` and along `s`, times `BIRD`, from where it is.
- `dot(forward, across, colour, a)`: a square `BIRD` pixels across with its middle there (hence
  `- BIRD / 2`).
- The glow: as the comment says, its glow: two faint discs round it, a broad orange one and a
  smaller yellow one.
- The tail: as the comment says, five streaks of flame streaming back, flickering, cooling to red
  at their ends. Each starts 6 units behind its middle and fans out at its own angle (`spread`,
  -0.34 to 0.34 radians, about 20° either way, spread wider across with `* 1.6`). Its length
  flickers between 14 and 19 units with `noise()` over time, it wobbles more toward its end
  (`* share`), and it runs from white (`fire(1)`) at its root to deep red, a little fainter there.
- The wings: as the comment says, beating, each a triangle of flame from its body to a tip, hot at
  the root.
  - `beat`: a sine wave, a beat about every 0.53 seconds. `span`: how far out the tip is, from 7 to
    16 units, with the beat.
  - `root`, `tip`: the triangle's corners: two along its body (3 units ahead of its middle and 4
    behind), and the tip, out to that side and swept back (8 behind).
  - The two loops fill it: `u` and `v` step across it in 16ths, `u + v` never more than 1, and each
    pair is a point inside the triangle (`u` of the way from the front of the root toward the back,
    and `v` toward the tip). Its colour cools from white at the root toward red at the tip
    (`fire(1 - v * 0.9)`).
  - The feathers: as the comment says, feathers of flame off its trailing edge: three red dots
    behind the wing, each further out.
- Its body, head, crest, beak and eye, as the comment says:
  - The body: an ellipse 12 units long and 5 across (`(forward / 6) ** 2 + (across / 2.5) ** 2 > 1`
    leaves out the dots outside it), filled with dots 0.7 units apart, so they overlap with no
    gaps: cream at the front, yellow along the middle and orange along its sides.
  - The head: a cream circle of radius 2.4 units, 7.5 units ahead of its middle.
  - The crest: three dots of flame sweeping back from its head on one side, each flicking in and
    out (`Math.abs(Math.sin(t / 70 + k))`), cooler toward the back.
  - The beak: two amber dots at its front (10 and 11 units ahead); the eye, one dark brown dot on
    its head.

### `drawPhoenix()`

<!-- code: apps/desktop/src/renderer/src/lib/spells/phoenix.ts#drawPhoenix -->

[`src/renderer/src/lib/spells/phoenix.ts`, lines 166–208](../../apps/desktop/src/renderer/src/lib/spells/phoenix.ts#L166-L208)

```ts
/** The phoenix spell at `scene.t`. */
export function drawPhoenix(p: Painter, scene: Scene): void {
  const t = scene.still ? TAKE_OFF + PHOENIX.flightMs * 0.45 : scene.t
  const shown = scene.still ? 1 : 1 - between(t, PHOENIX.durationMs - 600, PHOENIX.durationMs)
  const start = { x: scene.x, y: scene.feet - scene.height * 0.6 }

  // The ring of fire it rises out of.
  if (t < 600 && !scene.still) {
    const spread = t / 600
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2
      twinkle(
        p,
        start.x + Math.cos(a) * spread * 24,
        start.y + Math.sin(a) * spread * 14,
        '#fb923c',
        1 - spread,
      )
    }
  }

  // Its embers: dropped all along its way, drifting down and sideways, cooling as they go.
  const random = seeded(83)
  for (let k = 0; k < 420; k++) {
    const born = TAKE_OFF + (k / 420) * PHOENIX.flightMs
    const jitter = { x: (random() - 0.5) * 14, y: (random() - 0.5) * 10 }
    const drift = { x: (random() - 0.5) * 0.025, y: 0.012 + random() * 0.025 }
    const life = 700 + random() * 1000
    const age = t - born
    if (age < 0 || age > life) continue
    const from = flightAt(born, scene)
    if (!from) continue
    const share = age / life
    const x = from.x + jitter.x + drift.x * age
    const y = from.y + jitter.y + drift.y * age
    if (k % 7 === 0 && share < 0.3) twinkle(p, x, y, '#fde68a', shown * (1 - share))
    else if (share < 0.4) square(p, x - 0.5, y - 0.5, 2, fire(1 - share), shown)
    else plot(p, x, y, fire(1 - share), shown * (1 - share * 0.6))
  }

  const at = flightAt(t, scene)
  if (at) bird(p, at, t, shown)
}
```

<!-- /code -->

As its comment says, the phoenix spell at `scene.t`.

- `t`: with reduced motion, the bird 45% of the way through its flight, held still.
- `shown`: fading out over the last 0.6 seconds.
- `start`: where it rises from, as in `phoenixPath()`.
- The ring of fire: as the comment says, the ring of fire it rises out of: 14 orange twinkles
  spreading out from her over 0.6 seconds, wider than tall, fading. Not with reduced motion.
- The embers: as the comment says, dropped all along its way, drifting down and sideways, cooling
  as they go. 420 of them, one dropped about every 14 ms of its flight (`born`), each from
  `seeded(83)`:
  - `jitter`: scattered a little round where the bird was (up to 7 pixels to either side, and 5 up
    or down).
  - `drift`: drifting a little sideways and down, each at its own pace.
  - `life`: lasting 0.7 to 1.7 seconds.
  - `from`: where the bird was when it was dropped (`flightAt(born)`), so the embers trace its way.
  - `share`: how far through its life it is. Every seventh starts as a gold twinkle; the rest are
    squares two pixels across while they're young and hot, then single pixels, cooling through
    `fire()` from white to deep red, and fading.
- `const at = flightAt(t, scene)`, `bird(p, at, t, shown)`: the bird itself, over its embers, while
  it's flying.

## `src/renderer/src/lib/screensaver/scene.ts`: what the screen saver's scenes share

As the comment near the top says, what the screen saver's two scenes have in common (see
`ScreenSaverView` in [The pages](7-renderer-pages.md)): the frame they're drawn from, banded skies
dithered from one colour into the next, and lines of rolling hills. Like the spells, everything is
drawn a pixel at a time on a `Painter` (`lib/pixels.ts`), so `tests/screenSaverScenes.test.ts` can
draw the scenes without a page. The scenes are lower and wider than the spells' effects: some 360
of their pixels high on any screen, so a pixel is 2 or 3 DIPs.

The look is that of the sunsets in pixel-art games: a sky in bands of flat colour rather than a
smooth gradient, each band breaking into the next through a checkerboard of the two (a _dither_),
with layered hills, the far ones paler, as haze makes them.

### `SaverFrame` and `dither()`

<!-- code: apps/desktop/src/renderer/src/lib/screensaver/scene.ts#SaverFrame,dither -->

[`src/renderer/src/lib/screensaver/scene.ts`, lines 3–22](../../apps/desktop/src/renderer/src/lib/screensaver/scene.ts#L3-L22)

```ts
// What the screen saver's scenes have in common (see ScreenSaverView): the frame they're drawn
// from, banded skies dithered from one colour into the next, and lines of rolling hills.

/** What a frame of a scene is drawn from. */
export interface SaverFrame {
  /** Since the scene began to show (ms). */
  t: number
  /** The canvas's size (pixels). */
  w: number
  h: number
}

/**
 * An ordered (2 × 2 Bayer) dither: whether the pixel at `x`, `y` takes the next colour when
 * `share` (0 to 1) of them do. A quarter, a half and three quarters make even checks.
 */
export function dither(x: number, y: number, share: number): boolean {
  const order = (y & 1) === 0 ? ((x & 1) === 0 ? 0 : 2) : (x & 1) === 0 ? 3 : 1
  return (order + 0.5) / 4 < share
}
```

<!-- /code -->

- `SaverFrame`: as its comments say, what a frame of a scene is drawn from: `t`, how long since the
  scene began to show, in milliseconds, and the canvas's size in pixels. Like the spells' `Scene`,
  nothing is kept from one frame to the next: where everything is comes from `t`.
- `dither(x, y, share)`: as its comment says, an ordered dither: whether the pixel at `x`, `y` takes
  the next colour when `share` (0 to 1) of the pixels do. Each pixel of a 2 × 2 square has its own
  place in the order (`order`: 0 top left, 2 top right, 3 bottom left, 1 bottom right; `x & 1` and
  `y & 1` are 0 on even columns and rows, 1 on odd ones), and takes the next colour once `share` is
  past it. So a quarter of the pixels is one in each square, evenly spread; a half is a
  checkerboard; three quarters leaves one in each square. That even pattern is what makes a
  dither read as a colour in between, rather than as noise.

### `paintBands()`

<!-- code: apps/desktop/src/renderer/src/lib/screensaver/scene.ts#paintBands -->

[`src/renderer/src/lib/screensaver/scene.ts`, lines 24–49](../../apps/desktop/src/renderer/src/lib/screensaver/scene.ts#L24-L49)

```ts
/**
 * A sky of `colours` in bands, from the top of the canvas down to `bottom` (and the last colour
 * below it), each band dithered into the next over its lower rows, a quarter, a half, then three
 * quarters of the pixels.
 */
export function paintBands(
  p: Painter,
  w: number,
  h: number,
  colours: readonly string[],
  bottom: number,
): void {
  const last = colours.length - 1
  for (let y = 0; y < h; y++) {
    const along = Math.min(1, y / bottom) * last
    const band = Math.min(last, Math.floor(along))
    const into = along - band
    p.rect(0, y, w, 1, colours[band]!, 1)
    if (band >= last) continue
    const share = into < 0.55 ? 0 : into < 0.7 ? 0.25 : into < 0.85 ? 0.5 : 0.75
    if (share === 0) continue
    for (let x = 0; x < w; x++) {
      if (dither(x, y, share)) p.rect(x, y, 1, 1, colours[band + 1]!, 1)
    }
  }
}
```

<!-- /code -->

As its comment says, a sky of `colours` in bands, from the top of the canvas down to `bottom` (and
the last colour below it), each band dithered into the next over its lower rows.

- `along`: how far down the bands a row is, from 0 at the top to the last band's number at
  `bottom` (`Math.min(1, y / bottom)`, so it stops there). `band` is the whole part, the band the row
  is in, and `into` the rest, how far through that band it is.
- `p.rect(0, y, w, 1, colours[band]!, 1)`: the whole row in the band's colour, as one rectangle.
- `share`: the first 55% of each band is plain; then a quarter of its pixels take the next band's
  colour, then a half, then three quarters, so the bands step into each other over their lower
  rows, as the comment says. The last band has none (`band >= last`): there's nothing below it.
- The loop across the row sets the pixels `dither()` picks, in the next band's colour.

### `Hill` and `hillTop()`

<!-- code: apps/desktop/src/renderer/src/lib/screensaver/scene.ts#Hill,hillTop -->

[`src/renderer/src/lib/screensaver/scene.ts`, lines 51–73](../../apps/desktop/src/renderer/src/lib/screensaver/scene.ts#L51-L73)

```ts
/** A line of hills: how far down its tops are, how much they rise and fall, and their colours. */
export interface Hill {
  /** Its middle height, and how far it rises and falls about it (shares of the canvas's height). */
  base: number
  amp: number
  /** Three waves added together: how many to a canvas's height, and where each starts (radians). */
  waves: readonly (readonly [number, number])[]
  /** Its colour, a deeper one lower down, and the light along its top. */
  body: string
  deep: string
  rim: string
}

/** How far down the canvas `hill`'s top is, at `x` (pixels): its waves are the same at any width. */
export function hillTop(hill: Hill, x: number, h: number): number {
  const u = x / h
  const weights = [0.6, 0.3, 0.1]
  let rise = 0
  hill.waves.forEach(([count, phase], i) => {
    rise += weights[i]! * Math.sin(u * count * Math.PI * 2 + phase)
  })
  return h * hill.base + h * hill.amp * rise
}
```

<!-- /code -->

- `Hill`: as its comment says, a line of hills: how far down its tops are, how much they rise and
  fall, and its colours.
  - `base`, `amp`: its middle height and how far it rises and falls about it, as shares of the
    canvas's height, so a scene looks the same on any screen.
  - `waves`: three waves added together, each as how many fit across a canvas's height and where it
    starts (radians). Three, of different lengths, make a skyline that rolls irregularly rather than
    repeating as one wave would.
  - `body`, `deep`, `rim`: its colour, a deeper one lower down, and the light along its top.
- `hillTop(hill, x, h)`: as its comment says, how far down the canvas the hill's top is at `x`.
  `u = x / h` measures across in canvas heights, so the waves are the same shape on a wide screen
  as on a narrow one, only more of them. The first wave counts 60%, the second 30% and the third
  10% (`weights`): long, gentle slopes with smaller bumps on them. Canvas rows count downward, so
  a positive `rise` is lower.

### `paintHill()`

<!-- code: apps/desktop/src/renderer/src/lib/screensaver/scene.ts#paintHill -->

[`src/renderer/src/lib/screensaver/scene.ts`, lines 75–98](../../apps/desktop/src/renderer/src/lib/screensaver/scene.ts#L75-L98)

```ts
/**
 * A line of hills down to the bottom of the canvas, a column of pixels at a time: its colour, a
 * deeper one over its lower part, and a rim of light along its top, as bright as `rim(x)` (0 to 1).
 * `top(x)` says where its top is.
 */
export function paintHill(
  p: Painter,
  hill: Hill,
  w: number,
  h: number,
  top: (x: number) => number,
  rim: (x: number) => number,
): void {
  for (let x = 0; x < w; x++) {
    const y = Math.round(top(x))
    p.rect(x, y, 1, h - y, hill.body, 1)
    const deep = Math.round(y + (h - y) * 0.4)
    p.rect(x, deep, 1, h - deep, hill.deep, 1)
    if (dither(x, deep - 1, 0.5)) p.rect(x, deep - 1, 1, 1, hill.deep, 1)
    const light = rim(x)
    p.rect(x, y, 1, 1, hill.rim, light)
    p.rect(x, y + 1, 1, 1, hill.rim, light * 0.35)
  }
}
```

<!-- /code -->

As its comment says, a line of hills down to the bottom of the canvas, a column of pixels at a
time. `top(x)` says where its top is, so a scene can shape a line (the crest her hill rises to),
and `rim(x)` how bright the light along it is there.

- `p.rect(x, y, 1, h - y, hill.body, 1)`: the column from the hill's top to the bottom.
- `deep`: 40% of the way from its top to the bottom, the deeper colour begins, with one row of
  half its pixels dithered in above it, so the change is soft.
- `p.rect(x, y, 1, 1, hill.rim, light)`, then the pixel below it at a third of that: a rim of light
  along the top, fading into the hill.

## `src/renderer/src/lib/screensaver/sunset.ts`: her sunset

As the comment at the top says, the screen saver's scene on her screen: a banded evening sky,
violet to gold, a few stars still out at its top; the sun low over the hills, glowing, stripes of
sky sliding down through it; long clouds drifting across, lit from below; four lines of rolling
hills, hazy in the distance and rimmed with light; and on the crest of the nearest, her, watching
it, with birds gliding by and fireflies over the grass. `ScreenSaverView`'s `sunsetPainter()`
paints the sky and the hills once and the rest every frame, then her (`her.ts`, below). Every size
is a share of the canvas's height or width, so it fits any screen.

### `SUNSET_SKY`, `SUN_ROWS` and `HILLS`

<!-- code: apps/desktop/src/renderer/src/lib/screensaver/sunset.ts#SUNSET_SKY,SUN_ROWS,HILLS -->

[`src/renderer/src/lib/screensaver/sunset.ts`, lines 5–83](../../apps/desktop/src/renderer/src/lib/screensaver/sunset.ts#L5-L83)

```ts
// The screen saver's sunset, on her screen (see ScreenSaverView): a banded evening sky, violet to
// gold, a few stars still out at its top; the sun low over the hills, drifting very slightly and
// glowing, stripes of sky sliding down through it; long clouds drifting slowly across, lit pink
// and gold from below; four lines of rolling hills, hazy in the distance, rimmed with light; and
// on the crest of the nearest, her, watching it (lib/screensaver/her.ts), birds gliding by and
// fireflies over the grass. In pixels of the canvas (some 360 of them high), times in ms.

/** The sky, from the top down to the horizon: night, violet, rose, coral, gold. */
export const SUNSET_SKY = [
  '#1b1838',
  '#251c4a',
  '#33205a',
  '#462467',
  '#5c2a72',
  '#76307a',
  '#93387e',
  '#b0437e',
  '#cb5479',
  '#e2686f',
  '#f08466',
  '#f7a462',
  '#fbc56c',
  '#fde19a',
] as const

/** The sun's rows, from its top (pale gold) down to its bottom (orange). */
const SUN_ROWS = ['#fff7d1', '#fff0b3', '#ffe28f', '#ffd277', '#ffbf66', '#ffa95c', '#ff9257']

/** The hills, far to near: hazy mauve in the distance, deepening to a dark green-blue at hand. */
export const HILLS: readonly Hill[] = [
  {
    base: 0.575,
    amp: 0.016,
    waves: [
      [3.1, 0.4],
      [7.3, 2.1],
      [15.7, 4.4],
    ],
    body: '#a65a82',
    deep: '#9a5280',
    rim: '#ffb08a',
  },
  {
    base: 0.64,
    amp: 0.028,
    waves: [
      [2.2, 2.6],
      [5.1, 0.9],
      [11.3, 3.1],
    ],
    body: '#71407a',
    deep: '#663a72',
    rim: '#f2937f',
  },
  {
    base: 0.73,
    amp: 0.035,
    waves: [
      [1.6, 4.2],
      [3.9, 1.3],
      [8.9, 5.5],
    ],
    body: '#3d3a64',
    deep: '#35335a',
    rim: '#d97c84',
  },
  {
    base: 0.87,
    amp: 0.03,
    waves: [
      [1.2, 1.1],
      [2.9, 3.8],
      [6.4, 2.6],
    ],
    body: '#1f2d40',
    deep: '#1a2738',
    rim: '#c76f74',
  },
]
```

<!-- /code -->

- `SUNSET_SKY`: as its comment says, the sky's fourteen bands from the top down to the horizon:
  night, violet, rose, coral and gold, the colours of a clear evening sky with the sun low.
- `SUN_ROWS`: as its comment says, the sun's colours, from pale gold at its top to orange at its
  bottom, as the low sun reddens nearer the horizon.
- `HILLS`: as its comment says, the four lines of hills, far to near. Each nearer line sits lower
  (`base` from 0.575 to 0.87 of the way down) and rolls more (`amp`), and its colours deepen from a
  hazy mauve, nearly the sky's, to a dark blue-green: _aerial perspective_, the haze that makes
  distant hills pale and near ones dark, which is what gives a flat picture its depth. Their rims go
  from peach on the farthest to rose on the nearest.

### `SUNSET`, `horizon`, `ridge()` and `herSpot()`

<!-- code: apps/desktop/src/renderer/src/lib/screensaver/sunset.ts#SUNSET,horizon,ridge,herSpot -->

[`src/renderer/src/lib/screensaver/sunset.ts`, lines 85–106](../../apps/desktop/src/renderer/src/lib/screensaver/sunset.ts#L85-L106)

```ts
/** Where the sun sets and where she stands, across the canvas (shares of its width). */
export const SUNSET = { sunX: 0.6, herX: 0.4 }

/** How far down the horizon is: where the sky is brightest, just under the farthest hills. */
export const horizon = (h: number): number => Math.round(h * 0.6)

/**
 * How far down the canvas a line of hills' top is at `x` (0 is the farthest, 3 the nearest). The
 * nearest rises to a crest where she stands.
 */
export function ridge(layer: number, x: number, w: number, h: number): number {
  const top = hillTop(HILLS[layer]!, x, h)
  if (layer < HILLS.length - 1) return top
  const crest = h * 0.085 * Math.exp(-(((x - w * SUNSET.herX) / (h * 0.5)) ** 2))
  return top - crest
}

/** Where she stands: on the crest of the nearest hill, left of the sun (`feet`, her soles' row). */
export function herSpot(w: number, h: number): { x: number; feet: number } {
  const x = Math.round(w * SUNSET.herX)
  return { x, feet: Math.round(ridge(HILLS.length - 1, x, w, h)) + 1 }
}
```

<!-- /code -->

Where things are in the scene.

- `SUNSET`: as its comment says, where the sun sets (60% of the way across) and where she stands
  (40%): apart, so the sun isn't hidden behind her, but close enough that she's plainly watching it.
- `horizon(h)`: as its comment says, how far down the horizon is: 60% of the way, just under the
  farthest hills' middle, where the sky is brightest.
- `ridge(layer, x, w, h)`: as its comment says, how far down a line of hills' top is at `x`. The
  nearest rises to a crest where she stands: a smooth bump (`Math.exp(-(d ** 2))`, a bell curve)
  8.5% of the canvas's height high and about half its height wide, centred on her, taken off that
  hill's top. So she stands on a rise against the sky, rather than in a dip.
- `herSpot(w, h)`: as its comment says, where she stands: her middle across, and `feet`, the row of
  her soles, one below the crest's top pixel (so she stands on it, not in it). `ScreenSaverView`
  places her frame from it, and her shadow starts there.

### `sunAt()` and `stripeAt()`

<!-- code: apps/desktop/src/renderer/src/lib/screensaver/sunset.ts#sunAt,stripeAt -->

[`src/renderer/src/lib/screensaver/sunset.ts`, lines 108–123](../../apps/desktop/src/renderer/src/lib/screensaver/sunset.ts#L108-L123)

```ts
/** The sun at `t`: low over the hills, half behind the farthest, drifting very slightly. */
export function sunAt(t: number, w: number, h: number): { x: number; y: number; r: number } {
  return {
    x: w * SUNSET.sunX + Math.sin(t / 17_000) * 1.2,
    y: horizon(h) - h * 0.065 + Math.sin(t / 9_000) * 1.5,
    r: h * 0.11,
  }
}

/** Whether a row this far down the sun (-1 its top, 1 its bottom) is a stripe of sky at `t`. */
export function stripeAt(depth: number, t: number): boolean {
  if (depth < 0.05) return false
  // Four to the sun's height, thicker lower down, sliding down one place every eight seconds.
  const place = (depth * 4 - t / 8_000) % 1
  return (place + 1) % 1 < 0.1 + depth * 0.3
}
```

<!-- /code -->

- `sunAt(t, w, h)`: as its comment says, the sun, low over the hills, half behind the farthest,
  drifting very slightly: its middle 6.5% of the height above the horizon, with a radius of 11%,
  so its lower part is behind the hills. Two slow waves (`t / 17_000` across, `t / 9_000` up and
  down) move it about a pixel, so the scene is never quite still, without the sun visibly going
  anywhere.
- `stripeAt(depth, t)`: as its comment says, whether a row of the sun this far down it (-1 its top,
  1 its bottom) is a stripe of sky: the bands across the lower half of the sun in retro sunsets.
  - `if (depth < 0.05) return false`: none in its upper half.
  - `place`: where the row falls among four stripes to the sun's height (`depth * 4`), shifted by
    the time, one place every eight seconds (`t / 8_000`); `% 1` keeps just the part past a whole
    place. Subtracting the time means a given place moves down the sun as `t` goes up, so the
    stripes slide down, as the comment says.
  - `(place + 1) % 1 < 0.1 + depth * 0.3`: a row is a stripe for the first part of each place, a
    tenth near the middle growing to four tenths at the bottom, so the stripes thicken as they go
    down. (`(place + 1) % 1` turns a negative remainder into the positive one it stands for.)

### `Cloud`, `CLOUD_COUNT` and `cloudsAt()`

<!-- code: apps/desktop/src/renderer/src/lib/screensaver/sunset.ts#Cloud,CLOUD_COUNT,cloudsAt -->

[`src/renderer/src/lib/screensaver/sunset.ts`, lines 125–184](../../apps/desktop/src/renderer/src/lib/screensaver/sunset.ts#L125-L184)

```ts
/** A cloud: where its flat underside is, and the humps along it. */
export interface Cloud {
  x: number
  y: number
  /** Each hump's offset along it, length and height (pixels). */
  humps: { dx: number; length: number; height: number }[]
  /** Its colour, and the light underneath it (from the sun below). */
  body: string
  light: string
}

/** How many clouds there are. */
export const CLOUD_COUNT = 8

/**
 * The clouds at `t`: long and low, spread down the sky from the top to near the horizon, each
 * drifting slowly right at its own pace and round again. Purple high up, rose and coral lower,
 * gold underneath near the sun.
 */
export function cloudsAt(t: number, w: number, h: number): Cloud[] {
  const random = seeded(11)
  const low = horizon(h)
  return Array.from({ length: CLOUD_COUNT }, (_, k) => {
    const y = Math.round(h * (0.1 + (0.38 * k) / (CLOUD_COUNT - 1)) + (random() - 0.5) * h * 0.04)
    const length = Math.round(h * (0.18 + random() * 0.22))
    const height = 3 + Math.floor(random() * 3)
    // A pixel or two a second at this size: crossing the screen takes minutes.
    const speed = (0.7 + random() * 1.3) * (h / 360)
    const span = w + length * 2
    const start = random() * span
    const humps = [
      { dx: 0, length, height },
      {
        dx: Math.round(length * (0.1 + random() * 0.15)),
        length: Math.round(length * 0.42),
        height: height + 3 + Math.floor(random() * 3),
      },
      {
        dx: Math.round(length * (0.45 + random() * 0.15)),
        length: Math.round(length * 0.34),
        height: height + 2 + Math.floor(random() * 3),
      },
      {
        dx: Math.round(length * (0.7 + random() * 0.1)),
        length: Math.round(length * 0.22),
        height: height + 1,
      },
    ]
    const share = y / low
    const [body, light] =
      share < 0.35
        ? ['#6a3479', '#a3568f']
        : share < 0.6
          ? ['#9a4279', '#df6f80']
          : share < 0.8
            ? ['#cf5e7a', '#f8a580']
            : ['#ee8a72', '#ffd896']
    return { x: ((start + (speed * t) / 1000) % span) - length, y, humps, body, light }
  })
}
```

<!-- /code -->

- `Cloud`: as its comments say, a cloud: where its flat underside is, the humps along it (each
  hump's offset along it, length and height), its colour and the light underneath it from the sun
  below. Clouds at sunset are lit from beneath, which is what makes their undersides glow.
- `CLOUD_COUNT`: eight.
- `cloudsAt(t, w, h)`: as its comment says, the clouds at `t`, long and low, spread down the sky,
  each drifting slowly right at its own pace and round again. Each one's numbers come from
  `seeded(11)` in the same order every frame, so every frame has the same clouds, only further
  along.
  - `y`: from 10% down the sky to 48%, evenly spread (`k / (CLOUD_COUNT - 1)`), each nudged a little
    up or down at random so they don't line up.
  - `length` 18% to 40% of the height, and a base `height` of 3 to 5 pixels: long and thin.
  - `speed`: as the comment says, a pixel or two a second at this size (scaled with `h`, so it's the
    same pace on any screen): crossing the screen takes minutes, slow enough to notice only by
    looking away and back.
  - `span = w + length * 2`: how far a cloud goes before coming round again: right across and off
    the far side by its length, then back in from the near side. `start` is where it is at `t = 0`.
  - `humps`: the base, the whole length at the base height, and three humps on top, a big one
    toward the left, a middle one and a small one toward the right, each a few pixels taller than
    the base: a cloud's lumpy top over a flat bottom.
  - `[body, light]`: the colours by how far down the sky it is (`share` of the way to the
    horizon): purple high up, then rose, coral, and gold underneath near the sun, as the comment
    says, so they match the sky behind them.
  - `x: ((start + (speed * t) / 1000) % span) - length`: how far it has drifted, round and round.

### `paintSunsetSky()` and `paintEveningStars()`

<!-- code: apps/desktop/src/renderer/src/lib/screensaver/sunset.ts#paintSunsetSky,paintEveningStars -->

[`src/renderer/src/lib/screensaver/sunset.ts`, lines 186–209](../../apps/desktop/src/renderer/src/lib/screensaver/sunset.ts#L186-L209)

```ts
/** The sky, behind everything (it never changes, so it's painted once). */
export function paintSunsetSky(p: Painter, w: number, h: number): void {
  paintBands(p, w, h, SUNSET_SKY, horizon(h))
}

/** The stars still out at the top of the sky, twinkling, fainter lower down. */
export function paintEveningStars(p: Painter, frame: SaverFrame): void {
  const { t, w, h } = frame
  const random = seeded(5)
  for (let k = 0; k < 60; k++) {
    const x = random() * w
    const y = random() * h * 0.3
    const phase = random() * Math.PI * 2
    const glow = 0.45 + 0.55 * Math.sin(t / 900 + phase) ** 2
    const fade = 1 - y / (h * 0.3)
    plot(p, x, y, '#fff7e6', glow * fade * 0.9)
    if (k % 7 === 0 && glow > 0.85) {
      plot(p, x - 1, y, '#f9d5ff', fade * 0.5)
      plot(p, x + 1, y, '#f9d5ff', fade * 0.5)
      plot(p, x, y - 1, '#f9d5ff', fade * 0.5)
      plot(p, x, y + 1, '#f9d5ff', fade * 0.5)
    }
  }
}
```

<!-- /code -->

- `paintSunsetSky(p, w, h)`: as its comment says, the sky, behind everything: `SUNSET_SKY`'s bands
  down to the horizon (`paintBands()`), painted once.
- `paintEveningStars(p, frame)`: as its comment says, the stars still out at the top of the sky:
  sixty of them, scattered over the top 30% from `seeded(5)`, each twinkling on its own
  (`Math.sin(t / 900 + phase) ** 2`, never quite out) and fainter the lower it is (`fade`), as
  stars are lost in the brighter sky near the sun. Every seventh flashes a cross of pink pixels
  round it when it's brightest.

### `paintSun()`

<!-- code: apps/desktop/src/renderer/src/lib/screensaver/sunset.ts#paintSun -->

[`src/renderer/src/lib/screensaver/sunset.ts`, lines 211–231](../../apps/desktop/src/renderer/src/lib/screensaver/sunset.ts#L211-L231)

```ts
/**
 * The sun at `t`: its glow, breathing slowly; a haze of its light along the horizon; and the sun
 * itself, a row at a time, stripes of sky sliding down through its lower half.
 */
export function paintSun(p: Painter, frame: SaverFrame): void {
  const { t, w, h } = frame
  const sun = sunAt(t, w, h)
  const breath = 1 + Math.sin(t / 2_300) * 0.03
  disc(p, sun.x, sun.y, sun.r * 3.9 * breath, sun.r * 2.4 * breath, '#ff8f7a', 0.07)
  disc(p, sun.x, sun.y, sun.r * 2.7 * breath, sun.r * 1.9 * breath, '#ffb27a', 0.09)
  disc(p, sun.x, sun.y, sun.r * 1.7 * breath, sun.r * 1.5 * breath, '#ffd9a0', 0.14)
  disc(p, sun.x, horizon(h) - 3, w * 0.55, h * 0.05, '#ffd39a', 0.16)
  const r = sun.r
  for (let dy = -Math.floor(r); dy <= Math.floor(r); dy++) {
    const half = r * Math.sqrt(Math.max(0, 1 - (dy / r) ** 2))
    if (half < 0.5 || stripeAt(dy / r, t)) continue
    const share = (dy + r) / (2 * r)
    const colour = SUN_ROWS[Math.min(SUN_ROWS.length - 1, Math.floor(share * SUN_ROWS.length))]!
    p.rect(Math.round(sun.x - half), Math.round(sun.y + dy), Math.round(half * 2), 1, colour, 1)
  }
}
```

<!-- /code -->

As its comment says, the sun at `t`: its glow, breathing slowly; a haze of its light along the
horizon; and the sun itself, a row at a time, stripes of sky sliding down through its lower half.

- Three faint discs round it (`disc()`), each smaller and brighter than the last, from coral to
  pale gold, make the glow; `breath` swells and shrinks them by 3% every few seconds.
- `disc(p, sun.x, horizon(h) - 3, w * 0.55, h * 0.05, ...)`: a wide, flat haze of light along the
  horizon, behind the hills.
- The loop paints the sun a row at a time: `half` is how far the circle reaches either side at that
  row, a row that's a stripe (`stripeAt()`) is left out so the sky shows through, and `colour` is
  the `SUN_ROWS` colour for how far down it is.

### `paintClouds()`

<!-- code: apps/desktop/src/renderer/src/lib/screensaver/sunset.ts#paintClouds -->

[`src/renderer/src/lib/screensaver/sunset.ts`, lines 233–252](../../apps/desktop/src/renderer/src/lib/screensaver/sunset.ts#L233-L252)

```ts
/**
 * The clouds at `t`, each hump a row at a time from its underside up to its rounded top: lit along
 * the bottom by the sun below, the light dithered up into the cloud's colour.
 */
export function paintClouds(p: Painter, frame: SaverFrame): void {
  for (const cloud of cloudsAt(frame.t, frame.w, frame.h)) {
    for (const hump of cloud.humps) {
      for (let row = 0; row < hump.height; row++) {
        const across = hump.length * Math.sqrt(1 - (row / hump.height) ** 2)
        const left = Math.round(cloud.x + hump.dx + (hump.length - across) / 2)
        const y = cloud.y - row
        p.rect(left, y, Math.round(across), 1, row < 2 ? cloud.light : cloud.body, 1)
        if (row !== 2) continue
        for (let x = left; x < left + Math.round(across); x++) {
          if (dither(x, y, 0.5)) p.rect(x, y, 1, 1, cloud.light, 1)
        }
      }
    }
  }
}
```

<!-- /code -->

As its comment says, the clouds at `t`, each hump a row at a time from its underside up to its
rounded top: `across`, from a half ellipse's equation, narrows each row as it rises, centred on the
hump. The bottom two rows are the light from below, the rest the cloud's colour, and the third row
is half of each, dithered, so the light fades up into the cloud. Where humps overlap they paint
over each other in the same colours, so a cloud reads as one shape.

### `paintSunsetHills()`

<!-- code: apps/desktop/src/renderer/src/lib/screensaver/sunset.ts#paintSunsetHills -->

[`src/renderer/src/lib/screensaver/sunset.ts`, lines 254–305](../../apps/desktop/src/renderer/src/lib/screensaver/sunset.ts#L254-L305)

```ts
/**
 * The hills (they never change, so they're painted once), far to near, each rimmed with light,
 * brightest toward the sun; grass along the top of the nearest, a few flowers in it, and her long
 * shadow falling toward us down its slope from where she stands.
 */
export function paintSunsetHills(p: Painter, w: number, h: number): void {
  const sunX = w * SUNSET.sunX
  const towardSun = (x: number) => Math.exp(-(((x - sunX) / (w * 0.32)) ** 2))
  HILLS.forEach((hill, layer) => {
    paintHill(
      p,
      hill,
      w,
      h,
      (x) => ridge(layer, x, w, h),
      (x) => 0.35 + 0.6 * towardSun(x),
    )
  })
  const near = HILLS.length - 1
  const hill = HILLS[near]!
  const random = seeded(17)
  // Grass: tufts along the top, a pixel to three high, their tips catching the light.
  for (let x = 0; x < w; x += 2 + Math.floor(random() * 3)) {
    const top = Math.round(ridge(near, x, w, h))
    const tall = 1 + Math.floor(random() * 3)
    for (let k = 1; k <= tall; k++) {
      p.rect(x, top - k, 1, 1, k === tall ? hill.rim : hill.body, k === tall ? 0.8 : 1)
    }
  }
  // Flowers in the grass, dim with the sun behind them.
  const flowers = ['#7d4f7e', '#8e6a62', '#6e5a8a']
  for (let k = 0; k < 70; k++) {
    const x = Math.floor(random() * w)
    const y = Math.round(ridge(near, x, w, h)) + 3 + Math.floor(random() * h * 0.1)
    p.rect(x, y, 1, 1, flowers[k % flowers.length]!, 0.9)
  }
  // Her shadow, long in the evening light, down the slope toward us and a little to the left.
  const { x, feet } = herSpot(w, h)
  const length = Math.round(h * 0.1)
  for (let k = 0; k < length; k++) {
    const half = 4 - (k / length) * 1.5
    const middle = x - k * 0.35
    p.rect(
      Math.round(middle - half),
      feet + k,
      Math.round(half * 2),
      1,
      '#0b1420',
      0.4 * (1 - k / length),
    )
  }
}
```

<!-- /code -->

As its comment says, the hills, painted once, far to near, each rimmed with light, brightest toward
the sun; grass along the top of the nearest, with a few flowers in it; and her long shadow falling
toward us down its slope.

- `towardSun(x)`: 1 right under the sun, falling away either side (a bell curve about a third of
  the width across). Each hill's rim is `0.35 + 0.6 * towardSun(x)` bright: a faint line
  everywhere, glowing where the sun is behind it.
- Grass, as the comment says: tufts along the nearest hill's top every 2 to 4 pixels, 1 to 3 pixels
  high, in the hill's colour with the tip in its rim's light, from `seeded(17)`. A ragged top edge
  reads as grass against the sky.
- Flowers, as the comment says: seventy single pixels in muted mauve, dusky pink and lilac, dim
  with the sun behind them, scattered just below the hill's top.
- Her shadow, as the comment says: long in the evening light, down the slope toward us and a little
  to the left, from her feet. The sun is in front of her, so her shadow falls behind her, toward
  us: a row at a time for 10% of the height, 8 pixels wide at her feet narrowing to 5, drifting left
  (`x - k * 0.35`), and fading. It's painted with the hills, before her, so she stands on it.

### `BIRD` and `paintLife()`

<!-- code: apps/desktop/src/renderer/src/lib/screensaver/sunset.ts#BIRD,paintLife -->

[`src/renderer/src/lib/screensaver/sunset.ts`, lines 307–350](../../apps/desktop/src/renderer/src/lib/screensaver/sunset.ts#L307-L350)

```ts
/** Two little birds' shapes: wings up, and wings down. */
const BIRD = [
  ['x...x', '.x.x.', '..x..'],
  ['.....', 'xx.xx', '..x..'],
]

/**
 * Life in the scene at `t`: three birds gliding across the sky now and then, wings beating, and
 * fireflies drifting over the grass of the nearest hill, glowing and fading.
 */
export function paintLife(p: Painter, frame: SaverFrame): void {
  const { t, w, h } = frame
  for (let k = 0; k < 3; k++) {
    // Across the screen in 50 s, one after another, then a while with none.
    const crossing = 50_000
    const cycle = 80_000
    const along = (t + k * 1_800) % cycle
    if (along > crossing) continue
    const x = -10 + ((w + 20) * along) / crossing + k * 6
    const y = h * (0.2 + k * 0.03) + Math.sin(along / 1_500 + k) * 2
    const wings = BIRD[Math.floor((t + k * 170) / 260) % 2]!
    wings.forEach((row, dy) =>
      [...row].forEach((c, dx) => {
        if (c === 'x') plot(p, x + dx - 2, y + dy - 1, '#2a1838', 0.85)
      }),
    )
  }
  const near = HILLS.length - 1
  const random = seeded(23)
  for (let k = 0; k < 18; k++) {
    const homeX = random() * w
    const homeY = ridge(near, homeX, w, h) - h * (0.01 + random() * 0.1)
    const phase = random() * Math.PI * 2
    const x = homeX + (noise(t / 5_000 + k * 7, 1) - 0.5) * 24
    const y = homeY + (noise(2, t / 4_000 + k * 7) - 0.5) * 14
    const glow = Math.max(0, Math.sin(t / 900 + phase))
    if (glow < 0.1) continue
    plot(p, x, y, '#fff9c4', glow)
    plot(p, x - 1, y, '#d9f99d', glow * 0.4)
    plot(p, x + 1, y, '#d9f99d', glow * 0.4)
    plot(p, x, y - 1, '#d9f99d', glow * 0.4)
    plot(p, x, y + 1, '#d9f99d', glow * 0.4)
  }
}
```

<!-- /code -->

- `BIRD`: as its comment says, two little birds' shapes, five pixels across: wings up (a V) and
  wings down. Swapping between them is a wing beat.
- `paintLife(p, frame)`: as its comment says, life in the scene at `t`.
  - Three birds: as the comment says, each crosses the screen in 50 seconds, one after another
    (1.8 seconds apart, each a little lower than the last), then there's half a minute with none,
    every 80 seconds. They bob a pixel or two as they glide (`Math.sin(along / 1_500 + k) * 2`) and
    beat their wings every 0.26 seconds, out of step with each other (`k * 170`). They're dark
    against the sky, silhouettes, as birds against a sunset are.
  - Fireflies: eighteen over the grass of the nearest hill, each round a home of its own from
    `seeded(23)`. Each drifts slowly about it by `noise()` (from `lib/spellMotion.ts`), a smooth
    random wander rather than a circle, and glows and fades on its own
    (`Math.sin(t / 900 + phase)`, out altogether for part of each round): a pale yellow pixel with a
    soft green plus round it.

## `src/renderer/src/lib/screensaver/stars.ts`: the starfall on the other screens

As the comment at the top says, the screen saver's scene on the screens she isn't on: the night
sky, stars twinkling all over it, low dark hills along its bottom, and shooting stars falling
through it without end, like her Starfall spell's but bigger. It's quieter than her sunset, so the
eye stays on her screen. `ScreenSaverView`'s `starfallPainter()` paints the sky and hills once and
the stars every frame.

### `NIGHT_SKY`, `NIGHT_HILLS` and `FALL`

<!-- code: apps/desktop/src/renderer/src/lib/screensaver/stars.ts#NIGHT_SKY,NIGHT_HILLS,FALL -->

[`src/renderer/src/lib/screensaver/stars.ts`, lines 5–51](../../apps/desktop/src/renderer/src/lib/screensaver/stars.ts#L5-L51)

```ts
// The screen saver's starfall, on the screens she isn't on (see ScreenSaverView): the night sky,
// stars twinkling all over it, low dark hills along its bottom, and shooting stars falling through
// it without end, like her Starfall spell's but bigger: a broader head, and a longer tail. In
// pixels of the canvas (some 360 of them high), times in ms.

/** The night sky, from the top down to the hills: deep navy to a last violet glow. */
export const NIGHT_SKY = [
  '#08071d',
  '#0c0a27',
  '#110e31',
  '#17123b',
  '#1e1645',
  '#26194e',
  '#2f1c56',
  '#3a205d',
] as const

/** Low hills along the bottom, dark against the sky, a faint rim of starlight along each. */
export const NIGHT_HILLS: readonly Hill[] = [
  {
    base: 0.87,
    amp: 0.025,
    waves: [
      [1.9, 0.7],
      [4.6, 2.9],
      [10.1, 1.4],
    ],
    body: '#150e2e',
    deep: '#120c28',
    rim: '#4a3a85',
  },
  {
    base: 0.94,
    amp: 0.02,
    waves: [
      [1.3, 3.3],
      [3.4, 0.2],
      [7.9, 4.8],
    ],
    body: '#0b0820',
    deep: '#09071b',
    rim: '#32286a',
  },
]

/** Shooting stars: how many start a second, how long their tails are and the longest one falls. */
export const FALL = { perSecond: 6, tail: 44, longestMs: 2_300 }
```

<!-- /code -->

- `NIGHT_SKY`: as its comment says, the night sky's eight bands from the top down to the hills:
  deep navy to a last violet glow above them, as if the sunset on her screen were somewhere beyond
  them.
- `NIGHT_HILLS`: as its comment says, two low lines of hills along the bottom, dark against the
  sky, each with a faint rim of starlight. They're the same kind of `Hill` as the sunset's, lower
  and darker.
- `FALL`: as its comment says, the shooting stars: six start each second, their tails are 44 pixels
  long, and the longest one falls for 2.3 seconds.

### `fallingStarsAt()`

<!-- code: apps/desktop/src/renderer/src/lib/screensaver/stars.ts#fallingStarsAt -->

[`src/renderer/src/lib/screensaver/stars.ts`, lines 53–83](../../apps/desktop/src/renderer/src/lib/screensaver/stars.ts#L53-L83)

```ts
/**
 * The shooting stars falling at `t`, any time at all: FALL.perSecond start each second (each at
 * its own moment within it), from along the top of the screen, a little above it and off its
 * right-hand side, falling down to the left at their own speeds. Each one's numbers come from its
 * place in the sequence, so every frame agrees.
 */
export function fallingStarsAt(t: number, w: number, h: number): Star[] {
  const gap = 1000 / FALL.perSecond
  const stars: Star[] = []
  const first = Math.max(0, Math.floor((t - FALL.longestMs) / gap) - 1)
  for (let k = first; k <= Math.floor(t / gap); k++) {
    const random = seeded(k * 7919 + 101)
    const born = k * gap + random() * gap
    const life = 1_300 + random() * (FALL.longestMs - 1_300)
    const startX = random() * w * 1.4
    const startY = random() < 0.3 ? random() * h * 0.35 : -random() * h * 0.2
    const speed = ((w + h) / 1_400) * (0.6 + random() * 0.5)
    const colour = STAR_COLOURS[Math.floor(random() * STAR_COLOURS.length)]!
    const age = t - born
    if (age < 0 || age > life) continue
    stars.push({
      x: startX + STAR_DIRECTION.dx * speed * age,
      y: startY + STAR_DIRECTION.dy * speed * age,
      ...STAR_DIRECTION,
      age,
      life,
      colour,
    })
  }
  return stars
}
```

<!-- /code -->

As its comment says, the shooting stars falling at `t`, any time at all. Her Starfall spell's
(`starsAt()` in `lib/spellMotion.ts`) are a fixed set for its ten seconds; these never stop, so
they're worked out as a sequence that goes on for ever, of which only the few falling at `t` are
made.

- `gap`: the time between one star's start and the next's, a sixth of a second.
- `first`: the first star that could still be falling: any born more than `FALL.longestMs` ago has
  finished. So each frame looks at a dozen or so stars, however long the screen saver has been on.
- `seeded(k * 7919 + 101)`: as the comment says, each one's numbers come from its place in the
  sequence (`k`), so every frame agrees on where star `k` started, how fast it goes and how long it
  lasts, without anything being kept. 7919 is a prime, which keeps neighbouring stars' seeds far
  apart.
- `born`: its own moment within its sixth of a second. `life`: 1.3 to 2.3 seconds.
- `startX`, `startY`: as the comment says, from along the top of the screen, a little above it and
  off its right-hand side: across 1.4 times the width (so some start off the right edge and fall in
  from it), and three in ten part way down the top third rather than above the top.
- `speed`: in proportion to the screen's size (`(w + h) / 1_400`), each at its own pace.
- `colour`: one of the spells' star colours (`STAR_COLOURS`).
- `if (age < 0 || age > life) continue`: only the stars falling at `t`. Each is where its speed has
  taken it, down and to the left along `STAR_DIRECTION` (the spell's), as a `Star`, the shape the
  spell's stars have.

### `paintNight()` and `paintStarfall()`

<!-- code: apps/desktop/src/renderer/src/lib/screensaver/stars.ts#paintNight,paintStarfall -->

[`src/renderer/src/lib/screensaver/stars.ts`, lines 85–146](../../apps/desktop/src/renderer/src/lib/screensaver/stars.ts#L85-L146)

```ts
/** The sky and the hills (they never change, so they're painted once). */
export function paintNight(p: Painter, w: number, h: number): void {
  paintBands(p, w, h, NIGHT_SKY, Math.round(h * 0.9))
  for (const hill of NIGHT_HILLS) {
    paintHill(
      p,
      hill,
      w,
      h,
      (x) => hillTop(hill, x, h),
      () => 0.6,
    )
  }
}

/**
 * The stars at `t`: twinkling all over the sky above the hills, a few brighter ones flashing; and
 * the shooting stars, each with a bright head three pixels across, a glow round it, and a long
 * tail two pixels wide behind it, white near the head and fading out in its colour.
 */
export function paintStarfall(p: Painter, frame: SaverFrame): void {
  const { t, w, h } = frame
  const random = seeded(3)
  for (let k = 0; k < 240; k++) {
    const x = random() * w
    const y = random() * h * 0.85
    const phase = random() * Math.PI * 2
    const colour = k % 5 === 0 ? '#fde68a' : k % 7 === 0 ? '#bae6fd' : '#ffffff'
    const glow = 0.35 + 0.65 * Math.sin(t / 700 + phase) ** 2
    plot(p, x, y, colour, glow * 0.85)
    if (k % 9 === 0 && glow > 0.8) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        plot(p, x + dx, y + dy, colour, (glow - 0.5) * 0.9)
      }
    }
  }
  for (const star of fallingStarsAt(t, w, h)) {
    const fade = Math.min(1, star.age / 150, (star.life - star.age) / 400)
    for (let k = 1; k <= FALL.tail; k++) {
      const tx = star.x - star.dx * k * 1.2
      const ty = star.y - star.dy * k * 1.2
      const left = 1 - k / (FALL.tail + 1)
      plot(p, tx, ty, k < 9 ? '#ffffff' : star.colour, fade * left)
      plot(p, tx + 1, ty, star.colour, fade * left * 0.6)
      if (k < 14) plot(p, tx - 1, ty, star.colour, fade * left * 0.3)
    }
    square(p, star.x - 1, star.y - 1, 3, '#ffffff', fade)
    for (const [dx, dy] of [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ] as const) {
      plot(p, star.x + dx, star.y + dy, star.colour, fade * 0.8)
    }
  }
}
```

<!-- /code -->

- `paintNight(p, w, h)`: as its comment says, the sky and the hills, painted once: `NIGHT_SKY`'s
  bands down to 90% of the height (`paintBands()`), then each hill with an even rim of starlight
  (`() => 0.6`: no sun to light one part more than another).
- `paintStarfall(p, frame)`: as its comment says, the stars at `t`.
  - The still stars: 240 of them over the top 85% from `seeded(3)`, most white, every fifth a pale
    gold and every seventh a pale blue, as real stars differ in colour. Each twinkles on its own
    (`glow`), and every ninth flashes a little cross when it's brightest.
  - The shooting stars, from `fallingStarsAt()`: `fade` brings each in over 0.15 seconds and out
    over its last 0.4. Its tail runs back along its path for `FALL.tail` pixels, fading to nothing:
    white near the head (the first eight pixels), then its colour, two pixels wide, with a fainter
    third beside the first stretch. The head is a white square three pixels across, with a pixel of
    its colour two out on each side as a glow: the broader head and longer tail the comment
    mentions, bigger than the spell's.

## `src/renderer/src/lib/screensaver/her.ts`: her in the sunset

As the comment at the top says, her in the screen saver's sunset, her back to us (`gazeFrames()`
in `character/sprite.ts`), painted a row at a time on the scene's canvas, one of her sprite's pixels
to one of its. The sun is in front of her, so she's _backlit_: her colours are dimmed toward the
dusk and a rim of warm light runs round her edges, brightest on the sun's side. That's how a figure
against a low sun looks, its front in shadow and its outline glowing; without it, her bright
daytime colours would look pasted onto the scene.

### `DUSK`, `RIM` and `SHADOW`

<!-- code: apps/desktop/src/renderer/src/lib/screensaver/her.ts#DUSK,RIM,SHADOW -->

[`src/renderer/src/lib/screensaver/her.ts`, lines 3–13](../../apps/desktop/src/renderer/src/lib/screensaver/her.ts#L3-L13)

```ts
// Her in the screen saver's sunset, her back to us (character/sprite.ts's gazeFrames), painted a
// pixel row at a time on the scene's canvas, one of her sprite's pixels to one of its. The sun is
// in front of her, so her colours are dimmed toward the dusk and a rim of warm light runs round
// her edges, brightest on the sun's side.

/** The colour her colours are dimmed toward with the sun behind her, and the light round her. */
export const DUSK = '#2a1a3e'

export const RIM = '#ffc58f'

/** The letter of her shadow on the ground (see PALETTE in character/sprite.ts): no rim for it. */
const SHADOW = 'x'
```

<!-- /code -->

- `DUSK`, `RIM`: as their comment says, the colour her colours are dimmed toward (a deep violet, the
  sky's colour high up), and the light round her (a warm peach, the sun's).
- `SHADOW`: as its comment says, the letter of her shadow on the ground in `PALETTE`: it gets no
  rim, being on the ground, not part of her.

### `parseColour()` and `backlit()`

<!-- code: apps/desktop/src/renderer/src/lib/screensaver/her.ts#parseColour,backlit -->

[`src/renderer/src/lib/screensaver/her.ts`, lines 15–37](../../apps/desktop/src/renderer/src/lib/screensaver/her.ts#L15-L37)

```ts
/** `#rrggbb` (or `rgb(r, g, b)` / `rgba(r, g, b, a)`) as its numbers, or null if it isn't one. */
export function parseColour(colour: string): { r: number; g: number; b: number; a: number } | null {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour)
  if (hex) {
    const [r, g, b] = hex.slice(1).map((v) => parseInt(v, 16)) as [number, number, number]
    return { r, g, b, a: 1 }
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
    colour,
  )
  if (!rgb) return null
  return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: Number(rgb[4] ?? 1) }
}

/** `colour` dimmed `amount` (0 to 1) of the way toward the dusk, keeping its opacity. */
export function backlit(colour: string, amount = 0.4): string {
  const c = parseColour(colour)
  const dusk = parseColour(DUSK)!
  if (!c) return colour
  const mix = (a: number, b: number) => Math.round(a + (b - a) * amount)
  const [r, g, b] = [mix(c.r, dusk.r), mix(c.g, dusk.g), mix(c.b, dusk.b)]
  return c.a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${c.a})`
}
```

<!-- /code -->

- `parseColour(colour)`: as its comment says, a colour written `#rrggbb`, `rgb(r, g, b)` or
  `rgba(r, g, b, a)` as its numbers, or `null` if it's none of those. These are the forms a canvas
  gives a colour back in, which is how `herColours()` in `ScreenSaverView` reads hers.
- `backlit(colour, amount = 0.4)`: as its comment says, `colour` dimmed `amount` of the way toward
  the dusk, keeping its opacity: each of red, green and blue moved 40% of the way to `DUSK`'s. Her
  shadow, which is see-through, stays see-through (`rgba()`), and a colour it can't read is left as
  it is.

### `paintHer()`

<!-- code: apps/desktop/src/renderer/src/lib/screensaver/her.ts#paintHer -->

[`src/renderer/src/lib/screensaver/her.ts`, lines 39–78](../../apps/desktop/src/renderer/src/lib/screensaver/her.ts#L39-L78)

```ts
/**
 * A frame of her (`rows` of palette letters, `.` see-through) with its top-left pixel at `x`,
 * `y`: each run of one letter along a row in its colour from `colours` (already dimmed), then the
 * rim of light along her edges: where the pixel beside her toward the sun (`sunSide`, 1 for
 * right) is empty, above her, and fainter on her other side.
 */
export function paintHer(
  p: Painter,
  rows: readonly string[],
  x: number,
  y: number,
  colours: Readonly<Record<string, string>>,
  sunSide: 1 | -1,
): void {
  const at = (r: number, c: number) => rows[r]?.[c] ?? '.'
  const empty = (r: number, c: number) => at(r, c) === '.' || at(r, c) === SHADOW
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length;) {
      const letter = row[c]!
      let end = c + 1
      while (end < row.length && row[end] === letter) end++
      const colour = colours[letter]
      if (letter !== '.' && colour) p.rect(x + c, y + r, end - c, 1, colour, 1)
      c = end
    }
  })
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (empty(r, c)) continue
      const light = empty(r, c + sunSide)
        ? 0.6
        : empty(r - 1, c)
          ? 0.4
          : empty(r, c - sunSide)
            ? 0.22
            : 0
      if (light > 0) p.rect(x + c, y + r, 1, 1, RIM, light)
    }
  })
}
```

<!-- /code -->

As its comment says, a frame of her, its top-left pixel at `x`, `y`: each run of one letter along a
row in its colour from `colours` (already dimmed), then the rim of light along her edges.

- `at(r, c)`: the letter at a row and column, or `.` (see-through) off the frame, so her edges need
  no special care. `empty(r, c)`: see-through, or her shadow.
- The first pass paints her: along each row, each run of the same letter is one rectangle (as
  `framePaths()` does for the SVG), far fewer calls than one per pixel.
- The second pass, the rim: for every pixel of her, `light` is how much rim it gets: 0.6 where the
  pixel beside it toward the sun (`sunSide`, 1 for the right) is empty, her edge facing the sun;
  otherwise 0.4 where the pixel above it is empty, along the tops of her hat, shoulders and arms;
  otherwise 0.22 where the pixel on her other side is empty, a faint edge away from the sun;
  otherwise none, so the middle of her stays in shadow. It's painted in `RIM` at that opacity, over
  the colour already there.
