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
effects, which `SpellView` draws: where things are, moment by moment (`lib/spellMotion.ts`), and
the drawing itself (`lib/spellArt.ts`).

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
per menu item, `onToggleTheme`, `onSetSize`, `onUninstall`, `onDisconnectAtlassian` and
`onCheckForUpdates` included. `Panel` closes it on
Esc, on a click anywhere else in the panel, and when the panel closes.

### `CONFIRM_MS`, `EFFORTS`

<!-- code: apps/desktop/src/renderer/src/components/SettingsMenu.tsx#CONFIRM_MS,EFFORTS -->

[`src/renderer/src/components/SettingsMenu.tsx`, lines 20–26](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L20-L26)

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

[`src/renderer/src/components/SettingsMenu.tsx`, lines 28–268](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L28-L268)

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
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={settings.theme === 'light'}
        onClick={props.onToggleTheme}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <span>
          Light mode
          <span className="block text-[11px] text-zinc-500">
            {settings.theme === 'light' ? 'Light windows' : 'Dark windows'}
          </span>
        </span>
        <Switch on={settings.theme === 'light'} />
      </button>

      <SizeControl size={props.size} onSetSize={props.onSetSize} />

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
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={settings.autoSend}
          onClick={props.onToggleAutoSend}
          className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <span>
            Send in Claude automatically
            <span className="block text-[11px] text-zinc-500">
              {settings.autoSend ? 'Questions are sent for you' : 'You press Enter in Claude'}
            </span>
          </span>
          <Switch on={settings.autoSend} />
        </button>
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

Draws the menu's rows. Every menu starts with Light mode and her Size, then a line. Then, with the
built-in chat: Start with Windows, Response style, Open screenshots folder, New conversation, who's signed in with Log out, and the version. With Claude
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
- `aria-checked={settings.theme === 'light'}`: the first row, Light mode, is a `menuitemcheckbox`
  like Start with Windows below, on while the windows are light. Clicking it calls `onToggleTheme`,
  which asks the main process for the other mode (`Panel.toggleTheme`); every window switches at
  once, and the menu stays open.
- `{settings.theme === 'light' ? 'Light windows' : 'Dark windows'}`: the grey line under it says
  which the windows are now.
- `<SizeControl size={props.size} onSetSize={props.onSetSize} />`: the second row, her size, with
  its Smaller and Bigger buttons (see `SizeControl` below).
- `<div className="my-1 border-t ..." />`: a line under the two, which are about how things look,
  setting them apart from the rest of the menu.
- `disabled={!settings.autoStartAvailable}`: Start with Windows only works in the installed app,
  not in `npm run dev`; there the row is greyed out with a note. `onToggleAutoStart` asks the
  main process to flip it, and `Panel` keeps the settings it returns (see `settings.ts` in
  [Main process: startup, IPC and app plumbing](2-main-startup.md)).
- `<Switch on={settings.autoStart} />`: the on/off graphic at the end of the row.
- `{!builtInChat && (`: with Claude Desktop, the "Send in Claude automatically" row, built the
  same way as Start with Windows: a `menuitemcheckbox` button with the setting's name, a grey
  line under it, and a `Switch`. Clicking it calls `onToggleAutoSend`, which flips the setting in
  the main process.
- `{settings.autoSend ? 'Questions are sent for you' : 'You press Enter in Claude'}`: the grey
  line says what the switch means in practice.
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

[`src/renderer/src/components/SettingsMenu.tsx`, lines 270–308](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L270-L308)

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

[`src/renderer/src/components/SettingsMenu.tsx`, lines 310–339](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L310-L339)

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

### `Switch`

<!-- code: apps/desktop/src/renderer/src/components/SettingsMenu.tsx#Switch -->

[`src/renderer/src/components/SettingsMenu.tsx`, lines 341–358](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L341-L358)

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

The small menu that opens beside the wand icon (Spells), listing her four spells by name. `Panel` renders it only while the panel is open, the wand has toggled it on,
and the tenant's list of actions includes `spells`. Its props are the `corner`, `layout` and
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

[`src/renderer/src/components/SpellsMenu.tsx`, lines 9–16](../../apps/desktop/src/renderer/src/components/SpellsMenu.tsx#L9-L16)

```tsx
const MENU_WIDTH = 176

const ICONS: Record<Spell, LucideIcon> = {
  clones: UsersRound,
  starfall: Sparkles,
  teleport: Orbit,
  explosion: Flame,
}
```

<!-- /code -->

- `MENU_WIDTH = 176`: the menu's width in pixels, room for an icon and the longest name.
- `ICONS: Record<Spell, LucideIcon>`: the lucide icon beside each spell's name: two people
  (`UsersRound`) for Clones, sparkles for Starfall, a ring round a dot (`Orbit`) for Teleport and a
  flame for Explosion. `Record<Spell, ...>` makes TypeScript insist on one for every spell in
  `SPELLS`.

### `SpellsMenu`

<!-- code: apps/desktop/src/renderer/src/components/SpellsMenu.tsx#SpellsMenu -->

[`src/renderer/src/components/SpellsMenu.tsx`, lines 18–70](../../apps/desktop/src/renderer/src/components/SpellsMenu.tsx#L18-L70)

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

As the comment says, the menu beside the wand icon: her spells, each with a line saying what it
does. Picking one casts it, and the main process closes the panel so it can be seen. It's built
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
- `{SPELLS.map((spell) => {`: one row per spell, in `SPELLS`' order: Clones, Starfall, Teleport and
  Explosion. `key={spell}` lets React tell the rows apart.
- `onClick={() => props.onCast(spell)}`: casts it. The menu does nothing else itself: `Panel`
  closes it and asks the main process to cast the spell, which closes the panel first.
- `<Icon size={16} className="shrink-0 text-accent" aria-hidden />`: the spell's icon, in the
  accent colour; `aria-hidden`, because the name beside it says the same.
- `{SPELL_LABELS[spell]}`: its name, beside the icon.

## `src/renderer/src/components/ActionStack.tsx`: the action icons

The column of round icon buttons that pops out of the bubble when the panel opens (for Morse
Micro: Ask Claude, Jira, IT service desk, screenshot, settings, spells and close), in the order the
tenant's `tenant.json` lists them, nearest the bubble first. `Panel` always renders it; while
closed it's simply invisible. Its props are the `corner`, the `layout` for her size, the tenant's
`actions`, `open`, `activeId` (`settings` while the settings menu is open, `spells` while the
spells menu is, otherwise the icon of the page showing when it isn't the start page, or `null`),
`pages` (command icons that open a page in the panel instead: the service desk, when the tenant
lists request types), `dotted` (icons that get a small dot) and `onAction`, which is
`Panel.runAction`.

### `ICONS`

<!-- code: apps/desktop/src/renderer/src/components/ActionStack.tsx#ICONS -->

[`src/renderer/src/components/ActionStack.tsx`, lines 17–26](../../apps/desktop/src/renderer/src/components/ActionStack.tsx#L17-L26)

```tsx
const ICONS: Record<ActionId, LucideIcon> = {
  ask: MessageCircle,
  apps: LayoutGrid,
  jira: Bell,
  servicedesk: Headset,
  screenshot: Camera,
  settings: Settings,
  spells: WandSparkles,
  close: Power,
}
```

<!-- /code -->

Which lucide icon each action shows. Ask Claude is `MessageCircle`, a speech bubble; Apps is
`LayoutGrid`, a grid of four squares, the usual sign for "apps"; Jira is `Bell`, for its
notifications; and the IT service desk is `Headset`, as for a help desk. Spells is
`WandSparkles`, a magic wand with sparkles, and Close is `Power`, a power button.

- `Record<ActionId, LucideIcon>`: an object with exactly one entry for every action id. If a new
  id is added to `ACTION_IDS` in `src/shared/actions.ts` without an icon here, TypeScript reports
  an error.

### `ActionStack`

<!-- code: apps/desktop/src/renderer/src/components/ActionStack.tsx#ActionStack -->

[`src/renderer/src/components/ActionStack.tsx`, lines 28–103](../../apps/desktop/src/renderer/src/components/ActionStack.tsx#L28-L103)

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

[`src/renderer/src/character/rig.ts`, lines 53–134](../../apps/desktop/src/renderer/src/character/rig.ts#L53-L134)

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
- `DOWN` and `STAND`: the arms (hanging, very slightly away from her body) and legs (straight) of a
  pose that doesn't give them.
- `LEG_LENGTH`: as its comment says, her thigh and her shin are 16.5 pixels each, so standing
  straight her hips are 33 pixels above her ankles. It's exported because `crouch()` in `sprite.ts`
  works out bent legs from it.

### `EYES`, `MOUTHS`, `SPARKLE`, `TWINKLE` and the other small pictures

<!-- code: apps/desktop/src/renderer/src/character/rig.ts#EYES,MOUTHS,SPARKLE,TWINKLE,BUTTERFLY_OPEN,BUTTERFLY_SHUT,Z_BIG,Z_SMALL,ORBS,BUBBLE_SMALL,BUBBLE_BIG,WAND_RING,WISP -->

[`src/renderer/src/character/rig.ts`, lines 136–231](../../apps/desktop/src/renderer/src/character/rig.ts#L136-L231)

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

[`src/renderer/src/character/rig.ts`, lines 233–291](../../apps/desktop/src/renderer/src/character/rig.ts#L233-L291)

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

[`src/renderer/src/character/rig.ts`, lines 240–256](../../apps/desktop/src/renderer/src/character/rig.ts#L240-L256)

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

[`src/renderer/src/character/rig.ts`, lines 293–300](../../apps/desktop/src/renderer/src/character/rig.ts#L293-L300)

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

[`src/renderer/src/character/rig.ts`, lines 302–1264](../../apps/desktop/src/renderer/src/character/rig.ts#L302-L1264)

```ts
/** Draws one pose as rows of palette letters. */
export function draw(pose: Pose): string[] {
  const view = pose.view
  const frontView = view === 'front'
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
    canvas.stamp(DIAGONAL.rows, DIAGONAL.x + Math.round(pose.x ?? 0), DIAGONAL.y + dy)
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
    if (view !== 'side' && !sitting) {
      for (let t = -1; t < hem - 1; t += 0.5) {
        set(onHips({ x: (swing * t) / hem, y: t }), 'f', 'aAv')
      }
    }
    // The collar: a V of trim, the gem brooch at its point; a darker sash at her waist.
    const off = view === 'side' ? 3 : 0
    if (view !== 'side') {
      for (let t = 0; t <= 5; t += 0.5) {
        set(onBody({ x: -3 + t * 0.6 + off, y: t - 0.5 }), 'f', 'aAv')
        set(onBody({ x: 3 - t * 0.6 + off, y: t - 0.5 }), 'f', 'aAv')
      }
    }
    canvas.stamp(['.G.', 'GGG', '.G.'], onBody({ x: off - 1, y: 4 }).x, onBody({ x: off, y: 4 }).y)
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
    if (frontView) {
      for (const y of [7.5, 10.5, 13.5]) motif(onBody({ x: 0, y }), ['Y'], 'aAv')
    }
    motif(onBody({ x: off, y: 18.5 }), ['YYY', 'YkY'], 'Aqav')

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
    if (frontView) {
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
    hair.polygon(
      shape(fringe, (p) => onHead(blown({ x: p.x + shiftHair, y: p.y }))),
      'hair',
    )
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
    // Side on there's no lock: her hair behind her ear is the back hair.
    if (view !== 'side') {
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
    const tipLean = view === 'side' ? -1 : 1
    const hatCentre = view === 'side' ? 0.5 : 0
    hat.ellipse(onHead({ x: hatCentre, y: -9 }), view === 'side' ? 12.5 : 14, 2.7, 'hat')
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
        (p) => onHead({ x: p.x * tipLean + hatCentre, y: p.y - lift * 0.15 }),
      ),
      'hat',
    )
    ink(hat)
    for (let dx = -6; dx <= 6; dx += 0.5) {
      set(onHead({ x: dx + hatCentre, y: -11 }), 'f', 'ngN')
      set(onHead({ x: dx + hatCentre, y: -12 }), 'F', 'ngN')
    }
    for (let dx = 7.5; dx <= 13; dx += 2) {
      set(onHead({ x: hatCentre + dx, y: -8.6 }), 'F', 'ngN')
      set(onHead({ x: hatCentre - dx, y: -8.6 }), 'F', 'ngN')
    }
    const hatSide = view === 'side' ? 1 : 0
    motif(onHead({ x: hatCentre + hatSide * 3, y: -11.5 }), ['YYY', 'YGY', 'YYY'], 'ngNfFq')
    const lifted = (x: number, y: number) =>
      onHead({ x: x * tipLean + hatCentre, y: y - lift * 0.15 })
    motif(lifted(-1.5, -15.5), ['.YY', 'Y..', 'Y..', '.YY'], 'ngN')
    motif(lifted(2, -14.5), ['Y'], 'ngN')
    motif(lifted(1.2, -18), ['k'], 'ngN')
    motif(lifted(-3.8, -13), ['k'], 'ngN')
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
  the hem, over the robe's pixels only (`'aAv'`). Then, unless she's side on or sitting, a line of
  trim from her waist down the front to the hem, leaning with the swing.
- The collar: as the comment says, a V of trim, the gem brooch at its point, and a darker sash.
  `off` moves these 3 pixels toward the way she faces side on. Except side on,
  two lines of trim run from either side of her neck to meet 4.5 pixels down. The brooch is a
  small plus of teal (`G`) stamped at the V's point (side on too).
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
  buckle (`YYY` over `YkY`), at her front (`off` moves it toward the way she faces side on).

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
  head and 4.5 below it, a row under the tip of her nose.
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
  since her hair behind her ear is the back hair.
- Inking the hair in front: from the front, `ink(hair)`, as usual. Side on, `inkOverHair(hair)`,
  because the crown lies over the back hair: where its edge crosses the back hair the line is soft,
  in the hair's shade, so the back of her head and the hair down her back read as one.
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
  back over the crown's back edge and its front edge runs straight up to the bend. (Mirroring only
  the tip's points, as it once did, left the crown's outline crossing itself where the tip bends
  back: a notch in its front edge and a row only a pixel wide, which looked like a strand.)
  `hatCentre` shifts it a little side on, and `lift * 0.15` raises it a touch when she's carried
  or falling.
- The band: two rows across the crown just above the brim, silver (`f`) over its shade (`F`),
  only on the hat's own pixels (`'ngN'`).
- The stitching: silver dots (`F`) every 2 pixels along the middle of the brim, either side of the
  crown.
- The buckle: a square of gold with a teal gem in it (`YYY`, `YGY`, `YYY`) on the band, at the
  front (side on, 3 pixels toward the way she faces).
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

[`src/renderer/src/character/rig.ts`, lines 1266–1298](../../apps/desktop/src/renderer/src/character/rig.ts#L1266-L1298)

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

[`src/renderer/src/character/sprite.ts`, lines 16–75](../../apps/desktop/src/renderer/src/character/sprite.ts#L16-L75)

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

[`src/renderer/src/character/sprite.ts`, lines 77–90](../../apps/desktop/src/renderer/src/character/sprite.ts#L77-L90)

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

[`src/renderer/src/character/sprite.ts`, lines 92–133](../../apps/desktop/src/renderer/src/character/sprite.ts#L92-L133)

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

[`src/renderer/src/character/sprite.ts`, lines 135–161](../../apps/desktop/src/renderer/src/character/sprite.ts#L135-L161)

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

[`src/renderer/src/character/sprite.ts`, lines 163–185](../../apps/desktop/src/renderer/src/character/sprite.ts#L163-L185)

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

[`src/renderer/src/character/sprite.ts`, lines 187–218](../../apps/desktop/src/renderer/src/character/sprite.ts#L187-L218)

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

[`src/renderer/src/character/sprite.ts`, lines 220–278](../../apps/desktop/src/renderer/src/character/sprite.ts#L220-L278)

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

[`src/renderer/src/character/sprite.ts`, lines 280–300](../../apps/desktop/src/renderer/src/character/sprite.ts#L280-L300)

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

[`src/renderer/src/character/sprite.ts`, lines 302–325](../../apps/desktop/src/renderer/src/character/sprite.ts#L302-L325)

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

[`src/renderer/src/character/sprite.ts`, lines 327–359](../../apps/desktop/src/renderer/src/character/sprite.ts#L327-L359)

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

[`src/renderer/src/character/sprite.ts`, lines 361–391](../../apps/desktop/src/renderer/src/character/sprite.ts#L361-L391)

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

[`src/renderer/src/character/sprite.ts`, lines 393–416](../../apps/desktop/src/renderer/src/character/sprite.ts#L393-L416)

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

[`src/renderer/src/character/sprite.ts`, lines 418–452](../../apps/desktop/src/renderer/src/character/sprite.ts#L418-L452)

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

[`src/renderer/src/character/sprite.ts`, lines 454–504](../../apps/desktop/src/renderer/src/character/sprite.ts#L454-L504)

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

[`src/renderer/src/character/sprite.ts`, lines 506–546](../../apps/desktop/src/renderer/src/character/sprite.ts#L506-L546)

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

[`src/renderer/src/character/sprite.ts`, lines 548–573](../../apps/desktop/src/renderer/src/character/sprite.ts#L548-L573)

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

[`src/renderer/src/character/sprite.ts`, lines 575–608](../../apps/desktop/src/renderer/src/character/sprite.ts#L575-L608)

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

[`src/renderer/src/character/sprite.ts`, lines 610–646](../../apps/desktop/src/renderer/src/character/sprite.ts#L610-L646)

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

[`src/renderer/src/character/sprite.ts`, lines 648–672](../../apps/desktop/src/renderer/src/character/sprite.ts#L648-L672)

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

[`src/renderer/src/character/sprite.ts`, lines 674–725](../../apps/desktop/src/renderer/src/character/sprite.ts#L674-L725)

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

[`src/renderer/src/character/sprite.ts`, lines 727–749](../../apps/desktop/src/renderer/src/character/sprite.ts#L727-L749)

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

[`src/renderer/src/character/sprite.ts`, lines 751–785](../../apps/desktop/src/renderer/src/character/sprite.ts#L751-L785)

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

[`src/renderer/src/character/sprite.ts`, lines 787–816](../../apps/desktop/src/renderer/src/character/sprite.ts#L787-L816)

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

[`src/renderer/src/character/sprite.ts`, lines 818–845](../../apps/desktop/src/renderer/src/character/sprite.ts#L818-L845)

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

[`src/renderer/src/character/sprite.ts`, lines 847–875](../../apps/desktop/src/renderer/src/character/sprite.ts#L847-L875)

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

[`src/renderer/src/character/sprite.ts`, lines 877–907](../../apps/desktop/src/renderer/src/character/sprite.ts#L877-L907)

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

[`src/renderer/src/character/sprite.ts`, lines 909–936](../../apps/desktop/src/renderer/src/character/sprite.ts#L909-L936)

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

[`src/renderer/src/character/sprite.ts`, lines 938–972](../../apps/desktop/src/renderer/src/character/sprite.ts#L938-L972)

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

[`src/renderer/src/character/sprite.ts`, lines 974–1004](../../apps/desktop/src/renderer/src/character/sprite.ts#L974-L1004)

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

### `drawn`, `MAKERS`, `LEFT_MAKERS` and `LOOPS`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#drawn,MAKERS,LEFT_MAKERS,LOOPS -->

[`src/renderer/src/character/sprite.ts`, lines 1006–1079](../../apps/desktop/src/renderer/src/character/sprite.ts#L1006-L1079)

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
  chant: () => drawn(chant()),
  vanish: () => drawn(vanish()),
  appear: () => drawn(appear()),
  dragged: () => drawn(dragged()),
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
  its maker here, the five newest (`juggle`, `bubbles`, `wisp`, `sneeze`, `dance`) included; like
  most, they make key poses, which `drawn()` turns into frames. So do her spells' three poses
  (`chant`, `vanish` and `appear`).
- `LEFT_MAKERS`: as the comment says, poses with letters in them, drawn the other way round for
  facing left, so they read right once the frame is mirrored. Only the dozer's z's so far:
  `doze(true)`. `Partial<Record<...>>` lets it list only the poses that need it.
- `LOOPS`: as the comment says, which poses go round and round (idle, the walks and dangling) and
  which play once (all twenty fidgets, the five newest included: their last frame stays until the
  main process changes the pose, which it does just as `FIDGET_MS` runs out). Of her spells'
  poses, as the comment says, the chant goes round for as long as it lasts, and vanishing and
  appearing play once (`SPELL_POSE_MS` times them; after vanishing, her last frame is empty).
  `Record<Name, boolean>` makes TypeScript insist on an answer for every pose, so a new habit can't
  be left out.

### `Facing`, `made` and `framesOf()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#Facing,made,framesOf -->

[`src/renderer/src/character/sprite.ts`, lines 1081–1103](../../apps/desktop/src/renderer/src/character/sprite.ts#L1081-L1103)

```ts
export type Facing = 'left' | 'right'

const made = new Map<string, Frame[]>()

/**
 * A pose's frames, facing `facing` (walking faces the way she walks, whatever `facing` says).
 * Drawn the first time they're asked for, then kept.
 */
export function framesOf(pose: Name, facing: Facing): Frame[] {
  const way = pose === 'walk-left' ? 'left' : pose === 'walk-right' ? 'right' : facing
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

[`src/renderer/src/character/sprite.ts`, lines 1105–1112](../../apps/desktop/src/renderer/src/character/sprite.ts#L1105-L1112)

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

[`src/renderer/src/character/sprite.ts`, lines 1114–1138](../../apps/desktop/src/renderer/src/character/sprite.ts#L1114-L1138)

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

[`src/renderer/src/components/Character.tsx`, lines 14–67](../../apps/desktop/src/renderer/src/components/Character.tsx#L14-L67)

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
const ALL_POSES: Pose[] = ['idle', 'walk-left', 'walk-right', 'dragged', ...FIDGETS, ...SPELL_POSES]

/**
 * The character: pixel art (character/sprite.ts) drawn `box` DIPs wide and a little taller, for
 * the room above her hat (SPRITE_HEADROOM), her feet on its bottom edge. In the bubble that fills
 * its window, which the main process keeps on the taskbar (one sprite pixel a DIP at her usual
 * size, more when she's bigger); her clones use it too. This plays the pose's frames, facing
 * `facing` (walking, she faces the way she walks). `expanded` tints her shadow while the panel is
 * open.
 */
export function Character(props: { pose: Pose; facing: Facing; box: number; expanded?: boolean }) {
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
      <Frames key={`${props.pose}:${facing}`} pose={props.pose} facing={facing} />
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

[`src/renderer/src/components/Character.tsx`, lines 69–88](../../apps/desktop/src/renderer/src/components/Character.tsx#L69-L88)

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

[`src/renderer/src/components/character.css`, lines 1–145](../../apps/desktop/src/renderer/src/components/character.css#L1-L145)

```css
/*
 * The character's colours: one class per letter of character/sprite.ts's PALETTE. Each material
 * is a ramp of shades, cooler (bluer) in shadow and warmer in the light, and each part's outline
 * is a dark shade of its own colour. Her robe and hat are mixed from the tenant's accent colour,
 * so they match the panel.
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
  fill: color-mix(in oklab, var(--color-accent) 45%, #140a24);
}
.px-robe-shade {
  fill: color-mix(in oklab, var(--color-accent) 72%, #1e1b4b);
}
.px-robe {
  fill: var(--color-accent);
}
.px-robe-light {
  fill: color-mix(in oklab, var(--color-accent) 70%, #fff4d6);
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

/* Gold embroidery on her robe and hat, and the buckles on her boots. */
.px-gold {
  fill: #f2c650;
}
.px-gold-shade {
  fill: #b3832c;
}

/* Her hat and her spellbook's cover: a deep shade of the accent colour. */
.px-hat {
  fill: color-mix(in oklab, var(--color-accent) 55%, #1a1433);
}
.px-hat-shade {
  fill: color-mix(in oklab, var(--color-accent) 38%, #120d26);
}
.px-hat-light {
  fill: color-mix(in oklab, var(--color-accent) 80%, #1a1433);
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
`lib/spellArt.ts` (next) draws them, for `SpellView` (see [The pages](7-renderer-pages.md)).
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
`drawStarfall()` or `drawExplosion()`.

- `t`: as its comment says, the time since the spell was cast.
- `w`, `h`: the canvas's size, in its own pixels.
- `x`, `feet`: where she stands across the canvas, and how far down it her feet are.
- `height`: as its comment says, how many canvas pixels tall she is, from hat to boots. Her 92
  sprite pixels make 46 of the effects' pixels, whatever her size, since both grow with her.
- `accent`: her accent colour, the colour of her robe, which the magic circles are drawn in.
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
  in between: how far through a stretch of time `t` is. Most of the timings in `spellArt.ts` are
  written with it.

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
  ragged, churning edges.
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

## `src/renderer/src/lib/spellArt.ts`: drawing her spells' effects

As the comment at the top says, the pixel art of her spells' effects, which `SpellView` draws each
frame: starfall's shooting stars, and the explosion's pillar of magic circles and its bang.
Everything is drawn a pixel at a time on a small canvas that the page stretches over its window
without smoothing, so it's crisp pixel art like her. Where things are, moment by moment, comes
from `lib/spellMotion.ts` (above).

**Drawing on a canvas.** `g` is the canvas's 2D drawing context, the object everything is drawn
through. `g.fillStyle` is the colour to paint with, `g.globalAlpha` how opaque (from 0, clear, to
1), and `g.fillRect(x, y, width, height)` paints a rectangle: a 1 by 1 rectangle is one pixel. Each
frame starts on a cleared canvas (`SpellView`), and whatever is drawn later in a frame goes over
what came before.

### `plot()`, `twinkle()`, `line()` and `ring()`

<!-- code: apps/desktop/src/renderer/src/lib/spellArt.ts#plot,twinkle,line,ring -->

[`src/renderer/src/lib/spellArt.ts`, lines 15–92](../../apps/desktop/src/renderer/src/lib/spellArt.ts#L15-L92)

```ts
// The pixel art of her spells' effects (see SpellView): starfall's shooting stars, and the
// explosion's pillar of magic circles and its bang. Everything is drawn a pixel at a time on a
// small canvas that the page stretches over its window without smoothing, so it's crisp pixel art
// like her. Where things are, moment by moment, comes from lib/spellMotion.ts.

/** Sets one pixel, if it's on the canvas. */
function plot(g: CanvasRenderingContext2D, x: number, y: number, colour: string, alpha = 1) {
  if (alpha <= 0) return
  g.globalAlpha = Math.min(1, alpha)
  g.fillStyle = colour
  g.fillRect(Math.round(x), Math.round(y), 1, 1)
}

/** A plus-shaped twinkle: a pixel and its four neighbours, the middle brighter. */
function twinkle(g: CanvasRenderingContext2D, x: number, y: number, colour: string, alpha = 1) {
  plot(g, x, y, '#ffffff', alpha)
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    plot(g, x + dx, y + dy, colour, alpha * 0.8)
  }
}

/** A straight line of pixels (Bresenham's). */
function line(
  g: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  colour: string,
  alpha = 1,
) {
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
    plot(g, x, y, colour, alpha)
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
function ring(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  colour: string,
  alpha = 1,
  turn = 0,
  gap = 0,
) {
  if (rx < 0.5) return
  const steps = Math.max(8, Math.ceil(Math.PI * 2 * Math.max(rx, ry)))
  for (let k = 0; k < steps; k++) {
    const a = (k / steps) * Math.PI * 2
    if (gap && Math.floor((a + turn) / gap) % 2 === 1) continue
    plot(g, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, colour, alpha)
  }
}
```

<!-- /code -->

The four ways everything is drawn.

- `plot(g, x, y, colour, alpha)`: as its comment says, sets one pixel, in `colour` at `alpha`
  opacity (fully opaque if left out), on the nearest whole pixel (`Math.round`). Nothing is drawn
  for an `alpha` of 0 or less, so callers can fade things out without checking first, and above 1
  it's kept to 1. A pixel off the canvas the canvas itself leaves out.
- `twinkle(g, x, y, colour, alpha)`: as its comment says, a plus-shaped twinkle: a white pixel in
  the middle, and its four neighbours in `colour`, a little fainter (80%).
- `line(g, from, to, colour, alpha)`: as its comment says, a straight line of pixels, by
  _Bresenham's algorithm_, the classic way to draw a line on a grid. It steps a pixel at a time from
  one end toward the other, keeping a running `error`, how far the pixels have strayed from the true
  line, and steps across (`x += sx`), down (`y += sy`) or both, whichever keeps closest. So the line
  has no gaps and no doubled pixels. `sx` and `sy` are which way to step (1 or -1). It stops at the
  far end; `i < 2000` is only a safety limit, so a bad number can never make it loop for ever.
- `ring(g, cx, cy, rx, ry, colour, alpha, turn, gap)`: as its comment says, an ellipse's outline, a
  pixel at a time: `rx` across and `ry` up and down from its middle.
  - `if (rx < 0.5) return`: too small to draw.
  - `steps`: how many points to plot round it: about one per pixel round the circle of its longer
    radius (2π × the radius), and at least 8, so it has no gaps.
  - `a`: each point's angle; `Math.cos(a) * rx` and `Math.sin(a) * ry` put it on the ellipse.
  - `gap`: as the comment says, leaves every other `gap` radians out, for a dashed ring, and `turn`
    turns the dashes round it. `Math.floor((a + turn) / gap) % 2 === 1` is true for every other
    stretch of `gap` radians.

### `drawStarfall()`

<!-- code: apps/desktop/src/renderer/src/lib/spellArt.ts#drawStarfall -->

[`src/renderer/src/lib/spellArt.ts`, lines 94–127](../../apps/desktop/src/renderer/src/lib/spellArt.ts#L94-L127)

```ts
// --------------------------------------------------------------------------------- starfall

/** Starfall: twinkling stars over the top of the screen, and shooting stars streaking down it. */
export function drawStarfall(g: CanvasRenderingContext2D, scene: Scene): void {
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
streaking down it.

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

[`src/renderer/src/lib/spellArt.ts`, lines 129–185](../../apps/desktop/src/renderer/src/lib/spellArt.ts#L129-L185)

```ts
// --------------------------------------------------------------------------------- explosion

/** One magic circle at `t`: rings, a turning ring of runes, a six-pointed star, a bright heart. */
function magicCircle(
  g: CanvasRenderingContext2D,
  c: Circle,
  t: number,
  power: number,
  accent: string,
) {
  const age = t - c.born
  if (age < 0) return
  const grown = easeOut(age / 450)
  const flash = 1 - between(age, 450, 900)
  const rx = c.rx * grown
  const ry = c.ry * grown
  const spin = (c.turn * age * (0.0008 + power * 0.004)) % (Math.PI * 2)
  const bright = 0.75 + power * 0.25
  // A soft glow filling it, in her colour.
  g.globalAlpha = 0.1 + power * 0.12
  g.fillStyle = accent
  for (let dy = -Math.floor(ry); dy <= Math.floor(ry); dy++) {
    const half = rx * Math.sqrt(Math.max(0, 1 - (dy / Math.max(1, ry)) ** 2))
    g.fillRect(Math.round(c.cx - half), Math.round(c.cy + dy), Math.round(half * 2), 1)
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
and a bright heart. `power` is how strong the magic is now, from 0 to 1 (see `drawPillar()`), which
makes it brighter and turn faster.

- `age`: how long since it came; before then it isn't drawn.
- `grown`: it grows from nothing to its full size over its first 0.45 seconds, fast and then
  slowing (`easeOut`); `rx` and `ry` are its size now.
- `flash`: 1 until it has grown, then fading to 0 over the next 0.45 seconds: a flash of white as it
  forms.
- `spin`: how far it has turned, in radians: faster as the magic grows (`0.0008 + power * 0.004`
  radians a millisecond), its own way round (`c.turn`), kept within one turn (`% (Math.PI * 2)`).
- `bright`: how bright its lines are: three quarters to full, with the magic.
- The glow: as the comment says, a soft glow filling it, in her colour, faint (10% to 22% opaque):
  a row of pixels for each pixel of its height, as wide as the ellipse is at that height (`half`,
  from the ellipse's equation).
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

[`src/renderer/src/lib/spellArt.ts`, lines 187–253](../../apps/desktop/src/renderer/src/lib/spellArt.ts#L187-L253)

```ts
/**
 * The chant's pillar, from the moment she starts chanting: a magic circle under her feet, then the
 * circles above her one after another, a column of light rising through them and growing
 * brighter, sparks streaming up it, and in the last moments everything brighter and faster, the
 * column white.
 */
function drawPillar(g: CanvasRenderingContext2D, scene: Scene): void {
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
    g.globalAlpha = clamp01(edge * edge * (0.12 + power * 0.5) * flicker)
    g.fillStyle = surge > 0.7 || Math.abs(dx) < width * 0.25 ? '#ffffff' : '#fde68a'
    g.fillRect(Math.round(x + dx), Math.round(columnTop), 1, Math.round(feet - columnTop))
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
  if (flare > 0) {
    g.globalAlpha = flare * 0.9
    g.fillStyle = '#ffffff'
    g.fillRect(Math.round(x - width), 0, Math.round(width * 2), Math.round(feet))
  }
  g.globalAlpha = 1
}
```

<!-- /code -->

As its comment says, the chant's pillar, from the moment she starts chanting: a magic circle under
her feet, then the circles above her one after another, a column of light rising through them and
growing brighter, sparks streaming up it, and in the last moments everything brighter and faster,
the column white.

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
  It's a row of strips a pixel wide, `width` either side of the middle (half to four fifths of the
  lowest circle's radius, widening with the magic), each fainter toward the edges (`edge * edge`),
  brighter with the magic, and flickering. The middle quarter is white and the rest gold; in the
  surge, all of it white. `columnTop` is a tenth of its height above `top`.
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
- `g.globalAlpha = 1`: leaves the opacity as it found it.

### `FIRE`, `fireCanvas` and `drawBoom()`

<!-- code: apps/desktop/src/renderer/src/lib/spellArt.ts#FIRE,fireCanvas,drawBoom -->

[`src/renderer/src/lib/spellArt.ts`, lines 255–354](../../apps/desktop/src/renderer/src/lib/spellArt.ts#L255-L354)

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
function drawBoom(g: CanvasRenderingContext2D, scene: Scene, b: number): void {
  const { w, h, still } = scene
  const at = still ? 700 : b
  const cx = w / 2
  const cy = h * 0.45 - (at / 1000) * Math.min(w, h) * 0.05
  const { fire, shock } = blastAt(at, w, h)
  const gone = 1 - between(at, EXPLOSION.boomMs - 800, EXPLOSION.boomMs)

  // The flash.
  if (!still && b < 220) {
    g.globalAlpha = 0.75 * (1 - b / 220)
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, w, h)
  }

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
    g.globalAlpha = 1
    g.imageSmoothingEnabled = false
    g.drawImage(fireCanvas, Math.round(cx - size), Math.round(cy - size), size * 2, size * 2)
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
  g.globalAlpha = 1
}
```

<!-- /code -->

- `FIRE`: as its comment says, the explosion's palette, hottest first: white, yellow, orange, red,
  deep red, then smoke (a dark grey-purple). Each entry is the least heat for that colour, then the
  colour as red, green and blue from 0 to 255; a pixel takes the first entry its heat reaches.
- `fireCanvas`: a second, small canvas the fireball is drawn on, made the first time it's needed
  and kept for every frame after.
- `drawBoom(g, scene, b)`: as its comment says, the explosion, `b` milliseconds after the bang, in
  the middle of the screen: a white flash across the screen, a fireball that bursts out with ragged,
  churning edges and cools from white through yellow, orange and red to smoke as it rises, a shock
  wave racing out round it, and sparks thrown out and falling.
  - `at`: the moment to draw: with reduced motion, the fireball as it is 0.7 seconds in, held
    still.
  - `cx`, `cy`: its middle: halfway across the screen, a little above halfway down (45%), and rising
    as it goes (by 5% of the screen's shorter side a second).
  - `fire`, `shock`: how big the fireball and the shock wave are now (`blastAt()`).
  - `gone`: the fireball fading away over the bang's last 0.8 seconds.
  - The flash: the whole screen white, three quarters opaque, fading over the first 0.22 seconds.
    Not with reduced motion.
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
  - `g.imageSmoothingEnabled = false`, `g.drawImage(fireCanvas, ..., size * 2, size * 2)`: draws it
    on the effects' canvas at twice its size, centred on the middle, without smoothing, so each of
    its pixels is a crisp block 2 by 2: chunkier than the rest of the effects, as fire is in pixel
    art.
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

[`src/renderer/src/lib/spellArt.ts`, lines 356–360](../../apps/desktop/src/renderer/src/lib/spellArt.ts#L356-L360)

```ts
/** The explosion spell: the pillar while she chants, then the bang. */
export function drawExplosion(g: CanvasRenderingContext2D, scene: Scene): void {
  if (scene.t < EXPLOSION.chantMs) drawPillar(g, scene)
  else drawBoom(g, scene, scene.t - EXPLOSION.chantMs)
}
```

<!-- /code -->

As its comment says, the explosion spell: the pillar while she chants, then the bang, with `b`
counted from the end of the chant. `SpellView` calls it every frame for the whole 18.6 seconds.
