# The UI components

[← Code Guide](CODE_GUIDE.md)

These eight files draw almost everything that appears around the bubble when you click it. `Panel`
in `PanelView.tsx` (see [The pages](7-renderer-pages.md)) renders four of them directly: the
`ActionStack` of round icons in a column beside the bubble, the `ChatBox` card next to the bubble on
the side facing the middle of the screen, the `SettingsMenu`, which opens beside the gear icon, and
the `SizeMenu`, which opens beside the size icon.
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
clones; all of these are covered at the end of this page.

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
everything inside it; in `SettingsMenu` and `SizeMenu` it's the menu, and in `ActionStack` each
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
                                       [clones]
                                       [size]        <- SizeMenu opens leftward, over the card
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
  question typed, Desktop Assist pastes them itself ("will be pasted into Claude for you").
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
`corner`, `layout` and `offset` for positioning; the current `settings`, `branding` (app and
company name, and which kind of chat), `version`, signed-in `user`, the `atlassianUser` connected
to Atlassian and how Check for updates is going (`update`) to display; and one callback per menu
item, `onUninstall`, `onDisconnectAtlassian` and `onCheckForUpdates` included. `Panel` closes it on
Esc, on a click anywhere else in the panel, and when the panel closes.

### `CONFIRM_MS`, `EFFORTS`

<!-- code: apps/desktop/src/renderer/src/components/SettingsMenu.tsx#CONFIRM_MS,EFFORTS -->

[`src/renderer/src/components/SettingsMenu.tsx`, lines 19–25](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L19-L25)

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

[`src/renderer/src/components/SettingsMenu.tsx`, lines 27–243](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L27-L243)

```tsx
/** The menu that opens beside the gear icon, on the side facing the middle of the screen. */
export function SettingsMenu(props: {
  corner: Corner
  /** Where things sit for her size: the menu goes beside the stack. */
  layout: PanelLayout
  /** Distance from the bubble's edge of the window to the gear, so the menu lines up with it. */
  offset: number
  settings: Settings
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

Draws the menu's rows. With the built-in chat: Start with Windows, Response style, Open
screenshots folder, New conversation, who's signed in with Log out, and the version. With Claude
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
- `` `Uninstall ${branding.appName}` ``: the label names the app, "Uninstall Desktop Assist".
- `{branding.appName} {props.version} · {branding.companyName}`: the footer, for example
  "Desktop Assist 1.0.0 · Morse Micro".

### `UpdateItem`

<!-- code: apps/desktop/src/renderer/src/components/SettingsMenu.tsx#UpdateItem -->

[`src/renderer/src/components/SettingsMenu.tsx`, lines 245–283](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L245-L283)

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
          ? [`Installing ${state.version}…`, 'Desktop Assist will close and start again']
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
  installs itself when done", "Installing 1.0.1…" with "Desktop Assist will close and start
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

[`src/renderer/src/components/SettingsMenu.tsx`, lines 285–314](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L285-L314)

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

[`src/renderer/src/components/SettingsMenu.tsx`, lines 316–333](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L316-L333)

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

## `src/renderer/src/components/SizeMenu.tsx`: the size menu

The small menu that opens beside the size icon (Size), with buttons to make her smaller or
bigger. `Panel` renders it only while the panel is open, the size icon has toggled it on, and the
tenant's list of actions includes `size`. Its props are the `corner`, `layout` and `offset` for
positioning, as for `SettingsMenu`; her `size` (`CharacterSize` in `src/shared/geometry.ts`: her
`scale`, and `max`, the biggest she can be on her screen); and `onSetSize`, which asks the main
process for another size. `Panel` closes it on Esc, on a click anywhere else in the panel, when
another icon is clicked, and when the panel closes.

### `MENU_WIDTH`, `sizeLabel()` and `nextSize()`

<!-- code: apps/desktop/src/renderer/src/components/SizeMenu.tsx#MENU_WIDTH,sizeLabel,nextSize -->

[`src/renderer/src/components/SizeMenu.tsx`, lines 13–25](../../apps/desktop/src/renderer/src/components/SizeMenu.tsx#L13-L25)

```tsx
const MENU_WIDTH = 200

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

- `MENU_WIDTH = 200`: the menu's width in pixels, narrower than the settings menu.
- `sizeLabel(scale)`: as the comment says, her size as people say it: the two fractions as `½` and
  `¾`, any other size as the number itself (`1`, `1.5`, `6`), then `×`.
- `nextSize(scale, way, max)`: as the comment says, the next size down (`way` is `-1`) or up (`1`)
  in `CHARACTER_SIZES`, leaving out any bigger than `max`, or `null` at either end.
  `CHARACTER_SIZES` runs from smallest to biggest, so `find()` gives the first size bigger than
  hers and `findLast()` the last one smaller. Both give `undefined` when there's none, and
  `?? null` turns that into `null`.

### `SizeMenu`

<!-- code: apps/desktop/src/renderer/src/components/SizeMenu.tsx#SizeMenu -->

[`src/renderer/src/components/SizeMenu.tsx`, lines 27–93](../../apps/desktop/src/renderer/src/components/SizeMenu.tsx#L27-L93)

```tsx
/**
 * The menu that opens beside the size icon: buttons to make her smaller and bigger, a step of
 * CHARACTER_SIZES at a time, from half her usual size up to six times it (or as big as fits her
 * screen, when that's less). The main process resizes her and remembers it; the new size comes
 * back in the app state, so this shows whatever she really is.
 */
export function SizeMenu(props: {
  corner: Corner
  layout: PanelLayout
  /** Distance from the bubble's edge of the window to the size icon, so the menu lines up. */
  offset: number
  size: CharacterSize
  onSetSize: (scale: number) => void
}) {
  const { scale, max } = props.size
  // Beside the size icon, but never past the top of the window.
  const menu = useRef<HTMLDivElement>(null)
  const fit = useFitInWindow(menu, props.offset)
  const smaller = nextSize(scale, -1, max)
  const bigger = nextSize(scale, 1, max)
  const limited = max < CHARACTER_SIZES.at(-1)!
  return (
    <div
      ref={menu}
      data-hit
      data-size-menu
      role="group"
      aria-label="Size"
      className={cn(
        'absolute rounded-xl border p-2.5 shadow-xl',
        'border-black/10 bg-white text-zinc-800 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100',
      )}
      style={{
        ...anchored(props.corner, props.layout.settingsX, fit.offset),
        width: MENU_WIDTH,
        maxHeight: fit.maxHeight,
        overflowY: 'auto',
      }}
    >
      <p className="mb-2 text-sm">Size</p>
      <div className="flex items-center justify-between gap-2">
        <SizeButton
          label="Smaller"
          disabled={smaller === null}
          onClick={() => smaller !== null && props.onSetSize(smaller)}
        >
          <Minus size={16} aria-hidden />
        </SizeButton>
        <span aria-live="polite" className="min-w-12 text-center text-lg font-medium tabular-nums">
          {sizeLabel(scale)}
        </span>
        <SizeButton
          label="Bigger"
          disabled={bigger === null}
          onClick={() => bigger !== null && props.onSetSize(bigger)}
        >
          <Plus size={16} aria-hidden />
        </SizeButton>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">
        {limited && bigger === null
          ? 'As big as fits this screen'
          : `From ${sizeLabel(CHARACTER_SIZES[0])} to ${sizeLabel(limited ? max : CHARACTER_SIZES.at(-1)!)}`}
      </p>
    </div>
  )
}
```

<!-- /code -->

As the comment says, a step of `CHARACTER_SIZES` at a time, from half her usual size up to six
times it, or as big as fits her screen when that's less. It never resizes her itself: clicking a
button calls `onSetSize`, the main process resizes her and saves the size, and the new size comes
back in the app state (`onSizeChanged` in `useAssistState`), so the menu always shows what she
really is.

- `offset: number`: as the comment says, the distance from the bubble's edge of the window to the
  size icon (`actionOffset()` of its place in the stack, at her size), so the menu lines up with
  it.
- `const smaller = nextSize(scale, -1, max)`, `const bigger = nextSize(scale, 1, max)`: the sizes
  the two buttons go to, or `null` where there's no further to go.
- `const menu = useRef<HTMLDivElement>(null)`, `const fit = useFitInWindow(menu, props.offset)`: as
  the comment says, beside the size icon, but never past the top of the window, as for the settings
  menu (`ref={menu}` on its `<div>`; see `useFitInWindow` in [The pages](7-renderer-pages.md)).
- `const limited = max < CHARACTER_SIZES.at(-1)!`: whether her screen keeps her from the biggest
  size, six times. `at(-1)` is the list's last entry; the `!` tells TypeScript it's there.
- `data-hit`: so the menu takes the mouse (see `data-hit` under `ChatBox`).
- `data-size-menu`: lets `Panel`'s `closeMenusOnOutsideClick` recognise a click inside the menu, so
  it doesn't close it.
- `role="group"`, `aria-label="Size"`: screen readers present the buttons together, under that
  name.
- `...anchored(props.corner, props.layout.settingsX, fit.offset)`, `maxHeight`, `overflowY`: placed
  just as the settings menu is, 8 px past the action icons on the side facing the middle of the
  screen, but level with the size icon (moved back if it wouldn't fit), and kept within the
  window's height. Its look (rounded corners, a border, a shadow, white or near-black) is the
  settings menu's too.
- `disabled={smaller === null}`: Smaller is greyed out at half her usual size, the smallest.
- `onClick={() => smaller !== null && props.onSetSize(smaller)}`: checks again that there is a
  smaller size, which also tells TypeScript `smaller` is a number here.
- `<span aria-live="polite" ...>{sizeLabel(scale)}</span>`: her size between the two buttons, such
  as `1×`. `aria-live="polite"` makes screen readers read it out when it changes, once they've
  finished what they're saying. `tabular-nums` gives every digit the same width, and `min-w-12`
  keeps the space between the buttons the same, so they don't move as the label changes.
- `disabled={bigger === null}`: Bigger is greyed out at six times her size, or at the biggest that
  fits her screen.
- The line at the bottom: at the biggest that fits a screen too small for six times her size, "As
  big as fits this screen"; otherwise the range she can be on this screen, "From ½× to 6×" (or to
  `max` when that's less).

### `SizeButton`

<!-- code: apps/desktop/src/renderer/src/components/SizeMenu.tsx#SizeButton -->

[`src/renderer/src/components/SizeMenu.tsx`, lines 95–119](../../apps/desktop/src/renderer/src/components/SizeMenu.tsx#L95-L119)

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
        'grid size-9 place-items-center rounded-full border outline-none',
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
- `'grid size-9 place-items-center rounded-full border outline-none'`: a 36 px circle with the icon
  in its middle. With `'focus-visible:ring-2 focus-visible:ring-accent'`, it gets the same accent
  ring as the action icons when it has the keyboard focus.
- `props.disabled ? ... : ...`: a disabled button has a fainter border and icon and a plain arrow
  pointer; otherwise it turns grey on hover.

## `src/renderer/src/components/ActionStack.tsx`: the action icons

The column of round icon buttons that pops out of the bubble when the panel opens (for Morse
Micro: Ask Claude, Jira, IT service desk, screenshot, light or dark mode, settings, size,
clones and close), in the order the tenant's `tenant.json` lists them, nearest the bubble first.
`Panel` always renders it; while closed it's simply invisible. Its props are the `corner`, the
`layout` for her size, the tenant's `actions`, `open`, `activeId` (`settings` while the settings
menu is open, `size` while the size menu is, otherwise the icon of the page showing when it isn't
the start page, or `null`), `theme` (the current light or dark
mode), `pages` (command icons that open a page in the panel instead: the service desk, when the
tenant lists request types), `dotted` (icons that get a small dot) and `onAction`, which is
`Panel.runAction`.

### `ICONS`

<!-- code: apps/desktop/src/renderer/src/components/ActionStack.tsx#ICONS -->

[`src/renderer/src/components/ActionStack.tsx`, lines 21–32](../../apps/desktop/src/renderer/src/components/ActionStack.tsx#L21-L32)

```tsx
const ICONS: Record<ActionId, LucideIcon> = {
  ask: MessageCircle,
  apps: LayoutGrid,
  jira: Bell,
  servicedesk: Headset,
  screenshot: Camera,
  theme: Sun,
  settings: Settings,
  size: Scaling,
  clones: UsersRound,
  close: Power,
}
```

<!-- /code -->

Which lucide icon each action shows. Ask Claude is `MessageCircle`, a speech bubble; Apps is
`LayoutGrid`, a grid of four squares, the usual sign for "apps"; Jira is `Bell`, for its
notifications; and the IT service desk is `Headset`, as for a help desk. The size icon is `Scaling`, a
box with a diagonal arrow stretching out of its corner, and the clones are `UsersRound`, two
people, one behind the other. The theme
icon is `Sun`, but see below: it changes with the mode.

- `Record<ActionId, LucideIcon>`: an object with exactly one entry for every action id. If a new
  id is added to `ACTION_IDS` in `src/shared/actions.ts` without an icon here, TypeScript reports
  an error.

### `ActionStack`

<!-- code: apps/desktop/src/renderer/src/components/ActionStack.tsx#ActionStack -->

[`src/renderer/src/components/ActionStack.tsx`, lines 34–116](../../apps/desktop/src/renderer/src/components/ActionStack.tsx#L34-L116)

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
  /** The current mode: the theme icon shows the one it switches to. */
  theme: Theme
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
        const Icon = id === 'theme' && props.theme === 'light' ? Moon : ICONS[id]
        const label =
          id === 'theme'
            ? props.theme === 'dark'
              ? 'Switch to light mode'
              : 'Switch to dark mode'
            : ACTIONS[id].label
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
- `const Icon = id === 'theme' && props.theme === 'light' ? Moon : ICONS[id]`: the theme icon shows
  what clicking it switches to: a sun while dark (switch to light), a moon while light.
- `const label = id === 'theme' ? ... : ACTIONS[id].label`: the tooltip and screen-reader name,
  from the action registry, except for the theme icon, which says what it will do ("Switch to
  light mode" or "Switch to dark mode").
- `data-hit`: on each button, not on the column, so the gaps between icons stay click-through.
- `data-action={id}`: `Panel.closeMenusOnOutsideClick` looks for `[data-action="settings"]` and
  `[data-action="size"]`, so clicking the gear or the size icon toggles its menu instead of
  counting as a click outside it.
- `aria-expanded={ACTIONS[id].kind === 'popover' || props.pages?.includes(id) ? active : undefined}`:
  for a popover action (Settings, Size, Ask Claude, Apps and Jira), or an icon that opens a
  page (the service desk, with request types), it tells screen readers whether what it opens is
  showing. `undefined` leaves the attribute off the others, the theme icon included, which opens
  nothing.
- `onClick={() => props.onAction(id)}`: `Panel.runAction` toggles the menu for Settings and
  Size, switches the card's page for Ask Claude, Apps, Jira and (with request types) the service
  desk, flips light or dark mode for the theme icon, and asks the main process to run any other
  action, such as the clones (see `src/main/actions.ts` in
  [Main process: startup, IPC and app plumbing](2-main-startup.md)).
- ``transitionDelay: props.open ? `${index * 30}ms` : '0ms'``: each icon starts its animation 30
  ms after the one before, so they pop out one after another. Closing has no delay, so they all go
  together.
- `top ? '-translate-y-3' : 'translate-y-3'`: while closed, each icon sits 12 px toward the bubble,
  and `'scale-75 opacity-0'` shrinks it to 75% and hides it. The `group-data-open:` classes
  (explained under `ChatBox`) move it to its place at full size when the panel opens.
- `outline-none`: together with `'focus-visible:ring-2 focus-visible:ring-accent'`, swaps the
  usual square focus outline for an accent ring that follows the round button.
- `active`: the active action (the gear or the size icon while its menu is open, or a page's icon
  while its page is showing) is filled with the accent colour.
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

[`src/renderer/src/character/raster.ts`, lines 27–28](../../apps/desktop/src/renderer/src/character/raster.ts#L27-L28)

```ts
/** A body part's pixels, each the name of its material (or undefined: not part of it). */
export class Layer {
  // …
}
```

<!-- /code -->

<!-- code: apps/desktop/src/renderer/src/character/raster.ts#Layer.cells,minX,minY,maxX,maxY,constructor,get,set -->

[`src/renderer/src/character/raster.ts`, lines 29–52](../../apps/desktop/src/renderer/src/character/raster.ts#L29-L52)

```ts
readonly cells: (string | undefined)[]

/** The box round every pixel set so far (empty while minX > maxX). */
minX = Infinity

minY = Infinity

maxX = -Infinity

maxY = -Infinity

constructor(readonly size: number) {
  this.cells = new Array<string | undefined>(size * size)
}

get(x: number, y: number): string | undefined {
  if (x < 0 || y < 0 || x >= this.size || y >= this.size) return undefined
  return this.cells[y * this.size + x]
}

set(x: number, y: number, material: string | undefined): void {
  if (x < 0 || y < 0 || x >= this.size || y >= this.size) return
  this.cells[y * this.size + x] = material
  if (material === undefined) return
  this.minX = Math.min(this.minX, x)
  this.minY = Math.min(this.minY, y)
  this.maxX = Math.max(this.maxX, x)
  this.maxY = Math.max(this.maxY, y)
}
```

<!-- /code -->

A body part being drawn, before it's shaded: a square grid the size of the frame, where each pixel
holds the name of a material (`'hair'`, `'skin'`), or `undefined` where the part isn't. Keeping
materials rather than colours lets one part mix several (an arm's layer has her hand, the sleeve
and its silver cuff) and still be shaded and outlined as one shape.

- `readonly cells: (string | undefined)[]`: the pixels, row after row in one list, so pixel
  `(x, y)` is at `y * size + x`.
- `minX`, `minY`, `maxX`, `maxY`: as the comment says, the box round every pixel set so far, so
  `ink()` only looks at that part of the grid rather than all 9,216 pixels. They start inside out
  (`Infinity` and `-Infinity`), so the first pixel set becomes the whole box.
- `constructor(readonly size: number)`: `readonly size` declares a field from the parameter (the
  same shorthand as `private readonly deps` in `BubbleController`).
  `new Array<string | undefined>(size * size)` makes a list of that length with nothing in it yet.
- `get(x, y)`: a pixel's material, or `undefined` off the grid, so code can look at a neighbour
  without checking for the edge first.
- `set(x, y, material)`: sets a pixel, ignoring anything off the grid (a raised arm can reach past
  the top without harm), and grows the box to take it in. Setting `undefined` clears a pixel
  without growing the box.

### `Layer.fill()`

<!-- code: apps/desktop/src/renderer/src/character/raster.ts#Layer.fill -->

[`src/renderer/src/character/raster.ts`, lines 54–65](../../apps/desktop/src/renderer/src/character/raster.ts#L54-L65)

```ts
/** Fills every pixel whose centre passes `inside`, within the box from `min` to `max`. */
fill(min: Point, max: Point, material: string, inside: (x: number, y: number) => boolean): void {
  const x0 = Math.max(0, Math.floor(min.x))
  const y0 = Math.max(0, Math.floor(min.y))
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
- `inside(x + 0.5, y + 0.5)`: the test is made at the pixel's centre, and a pixel is either in or
  out. There's no partly covered pixel, so no smoothing (anti-aliasing): edges stay as crisp steps,
  as pixel art should.

### `Layer.polygon()` and `ellipse()`

<!-- code: apps/desktop/src/renderer/src/character/raster.ts#Layer.polygon,ellipse -->

[`src/renderer/src/character/raster.ts`, lines 67–97](../../apps/desktop/src/renderer/src/character/raster.ts#L67-L97)

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

[`src/renderer/src/character/raster.ts`, lines 99–125](../../apps/desktop/src/renderer/src/character/raster.ts#L99-L125)

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
  along the chain each piece starts and ends). Her side locks and her braid are chains: curved,
  and tapering toward the tip.

### `Canvas`

<!-- code: apps/desktop/src/renderer/src/character/raster.ts#Canvas.class -->

[`src/renderer/src/character/raster.ts`, lines 128–129](../../apps/desktop/src/renderer/src/character/raster.ts#L128-L129)

```ts
/** A frame being drawn: rows of palette letters, `.` where nothing is drawn yet. */
export class Canvas {
  // …
}
```

<!-- /code -->

<!-- code: apps/desktop/src/renderer/src/character/raster.ts#Canvas.cells,constructor,get,set -->

[`src/renderer/src/character/raster.ts`, lines 130–143](../../apps/desktop/src/renderer/src/character/raster.ts#L130-L143)

```ts
readonly cells: string[]

constructor(readonly size: number) {
  this.cells = new Array<string>(size * size).fill('.')
}

get(x: number, y: number): string {
  if (x < 0 || y < 0 || x >= this.size || y >= this.size) return '.'
  return this.cells[y * this.size + x]!
}

set(x: number, y: number, letter: string): void {
  if (x < 0 || y < 0 || x >= this.size || y >= this.size) return
  this.cells[y * this.size + x] = letter
}
```

<!-- /code -->

The frame itself, as palette letters. Where a `Layer` holds one part's materials, the `Canvas`
holds the finished colours of everything drawn so far, `.` where nothing has been drawn
(see-through). `rig.ts` makes one `Canvas` per frame and inks each part onto it in turn, back to
front.

- `new Array<string>(size * size).fill('.')`: every pixel starts see-through.
- `get(x, y)` gives `.` off the grid, and `set(x, y, letter)` ignores pixels off the grid, as in
  `Layer`.

### `Canvas.ink()`

<!-- code: apps/desktop/src/renderer/src/character/raster.ts#Canvas.ink -->

[`src/renderer/src/character/raster.ts`, lines 145–187](../../apps/desktop/src/renderer/src/character/raster.ts#L145-L187)

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

[`src/renderer/src/character/raster.ts`, lines 189–205](../../apps/desktop/src/renderer/src/character/raster.ts#L189-L205)

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

rows(): string[] {
  const rows: string[] = []
  for (let y = 0; y < this.size; y++) {
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
- `rows()`: the finished frame as `size` strings of `size` letters, one per row, which is what a
  `Frame` holds. `slice()` takes each row's stretch of the list and `join('')` makes it a string.

### `rotate()`, `add` and `limb()`

<!-- code: apps/desktop/src/renderer/src/character/raster.ts#rotate,add,limb -->

[`src/renderer/src/character/raster.ts`, lines 208–223](../../apps/desktop/src/renderer/src/character/raster.ts#L208-L223)

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

As the comment also says, she's an original design: an elf mage with long pointed ears,
silver-white hair in one long braid (with a fringe and locks beside her face), amber eyes, a
wide-brimmed crooked hat, and a long flared robe in the tenant's accent colour, with bell sleeves,
silver trim, a darker sash and a gem brooch, over dark stockings and boots. Her clothes are
patterned: a gold buckle, a gold crescent moon and stars and silver stitching on her hat; a border
of gold diamonds above the robe's hem, silver stars over its skirt, gold buttons, a gold buckle on
the sash and a gold line above each cuff; turned-down cuffs, laces and buckled straps on her boots.
How she's drawn follows common practice in anime-style pixel art:

- Big eyes with a thick upper lid and an iris that's darker at the top, with a white glint in the
  same corner of both eyes, as if from the same light. A small mouth, only a couple of pixels.
- Hair drawn as clumps rather than strands: a fringe with a jagged edge, locks hanging beside her
  face, a braid with its plaits picked out in a darker shade, and a band of shine across the crown.
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

<!-- code: apps/desktop/src/renderer/src/character/rig.ts#GRID -->

[`src/renderer/src/character/rig.ts`, lines 4–17](../../apps/desktop/src/renderer/src/character/rig.ts#L4-L17)

```ts
// The character's rig: her skeleton and the shapes that hang on it, drawn as pixel art for one
// pose. She's an original design: an elf mage with long pointed ears, silver-white hair in one
// long braid, amber eyes, a wide-brimmed crooked hat (a gold buckle on its band, a gold moon and
// stars on its crown, silver stitching round its brim), and a long robe in the tenant's accent
// colour with bell sleeves, silver trim, gold embroidery (a border of diamonds above the hem, a
// line above each cuff), silver stars, gold buttons, a sash with a gold buckle and a gem brooch,
// over dark stockings and laced boots with turned-down cuffs and buckled straps.
//
// A pose says which way she's seen from (front, diagonal or side, always facing right; frames
// facing left are mirrored), where her hips are, how she leans, her arms' and legs' angles, her
// face, and how the wind or a fall pushes her hair and robe. `draw()` turns a pose into a frame.
// She's about 88 pixels tall with her hat on a 96-pixel grid, her feet on the bottom row.

export const GRID = 96
```

<!-- /code -->

`GRID = 96`: a frame is 96 pixels square, the size of the bubble's window at her usual size
(`BUBBLE_BOX`, 96 DIPs), so one pixel is one DIP; when she's bigger, the same frame is drawn
bigger, a pixel two DIPs across at twice her size, and so on. As the comment above it says, she's
about 88 pixels tall with her hat on,
her feet on the bottom row. That leaves only a few rows above the tip of her hat, which is why her
hop is a small one.

### `RAMPS` and `LIGHT`

<!-- code: apps/desktop/src/renderer/src/character/rig.ts#RAMPS,LIGHT -->

[`src/renderer/src/character/rig.ts`, lines 19–36](../../apps/desktop/src/renderer/src/character/rig.ts#L19-L36)

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

[`src/renderer/src/character/rig.ts`, lines 38–99](../../apps/desktop/src/renderer/src/character/rig.ts#L38-L99)

```ts
export type View = 'front' | 'diagonal' | 'side'

export type Face =
  'neutral' | 'blink' | 'happy' | 'surprised' | 'yawn' | 'sip' | 'down' | 'awe' | 'up'

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
  the cup), `down` (looking down at her book), and, for her vision, `awe` (looking up, mouth open
  in wonder) and `up` (looking up, smiling).
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
  - `prop`: as the comment says, something in her hands: a teacup or her spellbook in her near
    hand, or a crystal ball (`orb`) held in both.
  - `sparkle`: sparkles circling her near hand, for a little spell: how far round they've gone,
    from 0 to 1. Left out (or 0), there are none.
  - `sitting`: sitting on the taskbar with her knees up under her robe.
  - `shadow`: as its comment says, her shadow on the taskbar, drawn unless this is `false`, which
    it is only while she's carried.
  - `rune` and `spin`: the magic circle under her as she levitates: `rune` its size, from 0 (none)
    to 1, and `spin` how far its runes have turned, in whole turns, which also says how far its
    sparks have risen. The crystal ball's wisp of light turns with `spin` too.
  - `spread`: as its comment says, her robe's hem held or flung out, this many pixels wider each
    side, for a curtsy or a twirl.
  - `butterfly`: as its comment says, a little butterfly's flight, from 0 to 1: coming to her
    raised hand, resting on it, and flying off. Left out (or 0), there's none.
  - `zzz`: as its comment says, z's floating up from her as she dozes, from 0 to 1 (none at 0).
  - `flipText`: as its comment says, letters (the z's) drawn back to front, for a frame that will
    be mirrored to face left, so they read the right way round once it is (see `LEFT_MAKERS` in
    `sprite.ts`).
- `DOWN` and `STAND`: the arms (hanging, very slightly away from her body) and legs (straight) of a
  pose that doesn't give them.
- `LEG_LENGTH`: as its comment says, her thigh and her shin are 16.5 pixels each, so standing
  straight her hips are 33 pixels above her ankles. It's exported because `crouch()` in `sprite.ts`
  works out bent legs from it.

### `EYES`, `MOUTHS`, `SPARKLE`, `TWINKLE`, `BUTTERFLY_OPEN`, `BUTTERFLY_SHUT`, `Z_BIG`, `Z_SMALL` and `eyesFor()`

<!-- code: apps/desktop/src/renderer/src/character/rig.ts#EYES,MOUTHS,SPARKLE,TWINKLE,BUTTERFLY_OPEN,BUTTERFLY_SHUT,Z_BIG,Z_SMALL,eyesFor -->

[`src/renderer/src/character/rig.ts`, lines 101–188](../../apps/desktop/src/renderer/src/character/rig.ts#L101-L188)

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
    // A thin lid with its lashes flicking back, over a round iris with a glint, as from the front.
    open: [['ee...', '.eeee', '.iiw.', '.iII.', '.Ijj.']],
    blink: [['.....', '.....', 'eeee.', '.ee..']],
    happy: [['.....', '..ee.', '.e..e', '.....']],
    down: [['.....', '.....', '.eeee', '..iI.']],
    up: [['ee...', '.eeee', '.iiw.', '.Ijj.', '.....']],
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

/** Which eyes a face uses. */
function eyesFor(face: Face): 'open' | 'blink' | 'happy' | 'down' | 'up' {
  if (face === 'blink' || face === 'yawn') return 'blink'
  if (face === 'happy' || face === 'sip') return 'happy'
  if (face === 'down') return 'down'
  if (face === 'awe' || face === 'up') return 'up'
  return 'open'
}
```

<!-- /code -->

Her eyes, mouths and sparkles are too small to draw well as shapes, so they're drawn by hand as
tiny pictures and stamped on (`Canvas.stamp()`), written as rows of letters with `.` see-through.
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
    (`ee...`, `.eeee`), over a round iris with a glint, as from the front: dark with the white
    glint at the top (`.iiw.`), then mid and light (`.iII.`, `.Ijj.`). Looking up (`up`), the
    same iris rides right under the lid.
  - `as const` keeps the object's exact shape, so TypeScript knows every view has every kind of
    eye.
- `MOUTHS`: small on purpose: two pixels (`mm`) for most faces, a little U for `happy`, two by two
  for `surprised`, a rounded four by four for `yawn`, and one pixel for `sip`. `awe` has the same
  open mouth as `surprised`, and `up` the same smile as `happy`. `Record<Face, ...>` makes
  TypeScript insist on a mouth for every face.
- `SPARKLE` and `TWINKLE`: as the comment says, a four-pointed sparkle, five pixels across, white
  at its heart (`w`) and paler then golden toward its points (`l`, `j`), and a smaller one, three
  pixels across. A spell circles one of the first and two of the second round her hand.
- `BUTTERFLY_OPEN` and `BUTTERFLY_SHUT`: as the comment says, a little magic butterfly with its
  wings open (five pixels across: teal wings, `G`, a white spot on each, `w`, and a gold body, `k`)
  and shut (wings folded up over the body). Flapping is drawn by switching between the two.
- `Z_BIG` and `Z_SMALL`: as the comment says, a dozer's z's, five and four pixels across, in the
  trim's silver (`f`) with a darker shadow (`F`) to the lower right.
- `eyesFor(face)`: which eyes go with a face. A yawn shuts them like a blink, a sip closes them
  happily, and `awe` and `up` both look up (their mouths are what differ).

### `draw()`

<!-- code: apps/desktop/src/renderer/src/character/rig.ts#draw -->

[`src/renderer/src/character/rig.ts`, lines 190–983](../../apps/desktop/src/renderer/src/character/rig.ts#L190-L983)

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
  const lift = pose.lift ?? 0
  const [nearArm, farArm] = pose.arms ?? [DOWN, DOWN]
  const [nearLeg, farLeg] = pose.legs ?? [STAND, STAND]
  const canvas = new Canvas(GRID)
  const ink = (layer: Layer, outline = true) => canvas.ink(layer, RAMPS, LIGHT, outline)
  // A point in a body part's own frame (its origin, turned with it).
  const at = (origin: Point, angle: number) => (p: Point) => add(origin, rotate(p, angle))
  const onHead = at(head, headAngle)
  const onBody = at(neck, lean)
  const onHips = at(hips, lean * 0.5)
  const shape = (points: number[][], frame: (p: Point) => Point) =>
    points.map(([x, y]) => frame({ x: x!, y: y! }))
  /** Hair below the top of the head is blown by the wind and lifted by a fall. */
  const blown = (p: Point): Point => {
    const t = Math.max(0, (p.y + 2) / 20)
    return { x: p.x + wind * t, y: p.y - lift * t }
  }
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
    const layer = new Layer(GRID)
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
    const layer = new Layer(GRID)
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
      const shadow = new Layer(GRID)
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

    // Her braid, tied with a ribbon: from the front, hanging down behind her left shoulder, drawn
    // before her body so it peeks out beside her arm and never covers her face or front; side on,
    // hanging down her back behind the rest of her hair, drawn before it so it only peeks out
    // behind, and her hair stays one clump with no slivers between outlines.
    const drawBraid = () => {
      const braid = new Layer(GRID)
      const braidPath =
        view === 'side'
          ? [
              [-10.5, 3],
              [-12.3, 9],
              [-13, 15],
              [-13.3, 21],
              [-13.3, 28],
            ]
          : [
              [8.6, 1],
              [10, 6],
              [10.8, 11],
              [11, 17],
              [10.8, 23],
              [10.5, 28],
            ]
      const braidPoints = braidPath.map(([x, y]) =>
        onHead(blown({ x: x! + (y! / 28) * wind * 0.8, y: y! })),
      )
      braid.chain(braidPoints, 2.1, 1.6, 'hair')
      ink(braid)
      // The plaits: a darker stroke across it every few pixels.
      for (let i = 0; i < braidPoints.length - 1; i++) {
        const a = braidPoints[i]!
        const b = braidPoints[i + 1]!
        for (let t = 0.25; t < 1; t += 0.5) {
          const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
          set({ x: p.x - 1, y: p.y }, 'D', 'hl')
          set({ x: p.x, y: p.y + 1 }, 'D', 'hl')
        }
      }
      const tie = braidPoints[4]!
      set(tie, 'v')
      set({ x: tie.x + 1, y: tie.y }, 'v')
      set({ x: tie.x - 1, y: tie.y }, 'a')
    }
    // Her long hair behind her, down past her shoulders.
    const back = new Layer(GRID)
    const backHair =
      view === 'side'
        ? [
            [-10.5, -5],
            [-7.5, -9.5],
            [-1, -11.5],
            [3, -11.5],
            [6.5, -9],
            [7.5, -5],
            [6, -2],
            [-1, 2],
            [-2, 14],
            [-4, 24],
            [-6.5, 28],
            [-8.5, 24],
            [-10.5, 27],
            [-11.3, 16],
            [-11.5, 6],
            [-11.5, 0],
          ]
        : [
            [-9.5, -2],
            [-8.5, -7.5],
            [-5, -10.8],
            [0, -11.8],
            [5, -10.8],
            [8.5, -7.5],
            [9.5, -2],
            [10, 8],
            [10, 18],
            [9, 27],
            [6, 24],
            [3, 26],
            [-3, 26],
            [-6, 24],
            [-9, 27],
            [-10, 18],
            [-10, 8],
          ]
    back.polygon(
      shape(backHair, (p) => onHead(blown(p))),
      'hair',
    )
    if (view === 'side') drawBraid()
    ink(back)

    if (frontView) drawBraid()

    if (!frontView) drawArm(farArm, -1)
    // The far leg first, so the near one is in front of it.
    drawLeg(farLeg, -1)
    drawLeg(nearLeg, 1)

    // The robe's skirt: long and flared, swaying, silver trim along its hem.
    const robe = new Layer(GRID)
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
    const face = new Layer(GRID)
    face.capsule(
      onBody({ x: view === 'side' ? 0.5 : 0, y: -3.5 }),
      onBody({ x: 0, y: 0 }),
      2.1,
      2.1,
      'skin',
    )
    if (view === 'side') {
      // The back of her head; her face is drawn by hand on top of it, below.
      face.ellipse(head, 7, 8.5, 'skin')
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
      // A pixel higher than from the front: her iris level with the bridge of her nose and the tip
      // of her nose at the bottom of her eye, as anime profiles have it.
      canvas.stamp(eyes[0]!, head.x + 1.5, eyeY - 1)
      canvas.stamp(['cc'], head.x + 0.5, head.y + 4.5)
      // Her mouth: a short line in from the notch of her lips, between nose and chin.
      canvas.stamp(
        mouth.map((r) => r.slice(0, 2)),
        head.x + 4.5,
        head.y + 5.5,
      )
    }

    // Her fringe and the locks beside her face.
    const hair = new Layer(GRID)
    const fringe =
      view === 'side'
        ? [
            [-3, -6.5],
            [-1, -10.5],
            [3, -11.5],
            [6.5, -9],
            [8, -4.5],
            // Its jagged lower edge, clear of her eye.
            [7.8, -2],
            [6.5, -4],
            [5.5, -1.5],
            [4, -3.5],
            [2.5, -2],
            [1.5, -4.5],
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
      // Full and round at the back, bulging out behind and above her ear up under her hat (so it
      // reads as hair, not the shape of her head), its front edge behind her ear, so her cheek and
      // jaw show.
      const crown = [
        [1.5, -11.6],
        [-3, -11.2],
        [-7, -10],
        [-10, -7.5],
        [-11.3, -3.5],
        [-11.2, 1],
        [-10, 5.5],
        [-7.5, 7.5],
        [-4.5, 7.5],
        [-3, 2],
        [-1.5, -2.5],
        [1, -5],
      ]
      hair.polygon(
        shape(crown, (p) => onHead(blown(p))),
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
    // Side on there's no lock: her hair behind her ear is the back hair and the braid.
    if (view !== 'side') {
      lock(8.2 + shiftHair, 13)
      lock(-8.2 + shiftHair * 0.5, 13)
    }
    ink(hair)
    // The shine on her hair: a band across the crown.
    for (let dx = -6; dx <= 6; dx++) {
      const curve = Math.abs(dx) * 0.18
      set(onHead({ x: dx + shiftHair, y: -7.5 + curve }), 'L', 'hl')
    }

    // Her long elf ears, through her hair: both from the front, one side on.
    const ears = new Layer(GRID)
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
    const hat = new Layer(GRID)
    const tipLean = view === 'side' ? -1 : 1
    const hatCentre = view === 'side' ? 0.5 : 0
    hat.ellipse(onHead({ x: hatCentre, y: -9 }), view === 'side' ? 12.5 : 14, 2.7, 'hat')
    hat.polygon(
      shape(
        [
          [-6.5, -9.5],
          [-4.8, -14],
          [-2.5, -18],
          [0.5 * tipLean, -20.5],
          [4.5 * tipLean, -22],
          [3.2 * tipLean, -19.5],
          [3.4, -16],
          [5, -12.5],
          [6.5, -9.5],
        ],
        (p) => onHead({ x: p.x + hatCentre, y: p.y - lift * 0.15 }),
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
  if (frontView) {
    drawArm(farArm, -1)
    hand = drawArm(nearArm, 1)
  } else {
    hand = drawArm(nearArm, 1)
  }
  let orbAt: Point | null = null
  if (pose.prop) {
    const prop = new Layer(GRID)
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
just below them. In order:

**Setting up**

- `frontView`: whether she's seen from the front, which a lot of what follows depends on.
- `hips`: the root of the skeleton, in the middle of the grid across (`48`) and 59 pixels down when
  standing (her legs, two `LEG_LENGTH`s, reach down to 92), or 85 when sitting, moved by the pose's
  `x` and `y`.
- `neck` is 21 pixels above the hips and `head` (the middle of her head) 11 above the neck, each
  turned with `rotate()`: by `lean` for the neck, and by `lean` plus `tilt` for the head.
- `ink`: a short way to ink a layer with her ramps and light.
- `at(origin, angle)`: returns a function that places a point given in a part's own frame: an
  offset from the part's origin, as if she stood straight, turned with the part. `onHead`, `onBody`
  and `onHips` are the three frames the shapes below are written in. The hips turn half as much as
  the body (`lean * 0.5`), so she bends at the waist.
- `shape(points, frame)`: turns a list of `[x, y]` pairs, the way the shapes below are written,
  into points placed in one of those frames.
- `blown(p)`: a hair point pushed sideways by `wind` and raised by `lift`, more the further down
  her hair it is (`t` is 0 near the top of her head and 1 twenty pixels lower), so the roots stay
  put and the ends swing.
- `set(p, letter, only)`: sets one pixel, but only where it's currently one of the letters in
  `only`, so a detail (the trim, the plaits, the hat's band) is only drawn on the part it belongs
  to.
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
- `drawBraid()`: as the comment says, her braid, tied with a ribbon. It's defined here, before the
  back hair, and draws itself in a layer of its own (see the braid, below), so where it's called
  decides what it's in front of and behind:
  - From the front, it's called straight after the back hair is inked, so her body, arms, face and
    side locks all cover it: it hangs down behind her left shoulder (the right of the picture) and
    only peeks out beside her arm, never over her face or the front of her robe.
  - Side on, it's called before the back hair is inked, so it hangs down her back behind the rest
    of her hair and only peeks out below and behind it. As the comment says, that keeps her hair
    one clump, with no slivers of hair showing between outlines.
- The back hair: as the comment says, her long hair behind her, down past her shoulders, as one
  polygon in the head's frame. From the front, its lower edge is jagged, clumps of hair ending at
  different lengths; side on, it flows back behind her, full at the back of her head (out to 11.5
  pixels behind the middle of it) to meet the crown's outline. Apart from the braid side on, it's inked
  first, so everything else is in front of it.

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
  stamped over it, placed by the middle of her head.
- The face is stamped on. From the front: two eyes, moved by `look`, blush (`cc`, pink) under each,
  the mouth in the middle, and just above it a single pixel of the skin's shade (`S`), all there is
  of her nose. Side on: one eye, a pixel higher than from the front (`eyeY - 1`), as the comment
  says, so her iris is level with the bridge of her nose and the tip of her nose at the bottom of
  her eye, as anime profiles have it; blush on her cheek (`head.x + 0.5`, 4.5 pixels below the
  middle of her head); and, as the comment says, a short
  line of mouth in from the notch of her lips: the first two pixels of each row of the
  expression's mouth (`r.slice(0, 2)`), 4.5 pixels in front of the middle of her head.
- The hair in front, as one layer. The fringe is a polygon whose lower edge zigzags
  (`[7.5, -3.6], [6.5, -0.4], [4.5, -3.4], ...`), so it falls over her forehead in clumps. Side on,
  its jagged lower edge sits higher, as its comment says, clear of her eye (`[7.8, -2], [6.5, -4],
[5.5, -1.5], ...`), and a `crown` covers the back of her head too. As its comment says, it's full
  and round at the back, bulging out behind and above her ear up under her hat (11.3 pixels behind
  the middle of her head at its fullest), so it reads as a head of hair rather than the shape of her
  skull, with her ear poking out of it; and its front edge runs behind her ear, so her cheek and jaw
  (from `SIDE_FACE`) show. The side locks (`lock(x, length)`)
  are chains from her temples down past her chin, 13 pixels long, tapering from 1.9 to 0.6 so they
  end in points, two of them, 8.2 pixels either side of the middle of her head. They're only drawn
  from the front: as the comment says, side on there's no lock, since her hair behind her ear is
  the back hair and the braid.
- The shine: as the comment says, a band across her crown: one curved row of the hair's shine
  (`L`), set only over hair pixels (`'hl'`) so it never spills onto the outline. A band like this
  is how anime art shows glossy hair.
- The ears: as the comment says, her long elf ears, through her hair. They're their own `ears`
  layer, drawn after the hair so they show in front of it. Each is a narrow four-sided shape from
  beside her head out and up to a point (`[13.5, -6.8]`: about 13 pixels out and 7 up from the
  middle of her head), and `p.x * side` mirrors it for the other side. Both show from the front;
  side on, one pointing back. They're inked as skin.
- The braid (`drawBraid()`, defined before the back hair, above): `braidPath` is its line, in the
  head's frame, down to 28 pixels below the middle of her head. Side on, it starts at the back of
  her head (10.5 pixels behind the middle of it and 3 below) and hangs back and down her back, to
  13.3 behind, just beyond the back hair's edge, so it peeks out behind it; from the front it starts behind her head (8.6 pixels out from the middle of it, past
  her cheek at 7.5) and hangs straight down behind her shoulder, about 11 out. `braidPoints` turns each point into a
  place on the grid, swinging further with the wind toward the tip (`(y / 28) * wind * 0.8`) and
  blown like the rest of her hair. `chain()` draws it in its own `braid` layer, 2.1 thick tapering to 1.6, so it's
  outlined against whatever is behind it.
- The plaits: as the comment says, a darker stroke across the braid every few pixels. Twice along
  each section (`t` at 0.25 and 0.75), two pixels in the hair's shadow (`D`), one to the left and
  one below, make a short slanted stroke, only over the braid's lighter pixels (`'hl'`). A row of
  slanted strokes is how a plait reads in pixel art.
- The ribbon: at the fifth point of the braid's line (`braidPoints[4]`), which is near its end from
  the front (23 pixels down) and at its very end side on (28 down), three pixels in the robe's
  colours (`v`, `v` and `a`), drawn over whatever is there.

**The hat**

- As the comment says, a wide brim and a tall crooked crown with a silver band, in its own `hat`
  layer, drawn after her head and hair so it sits on top. The brim is a flat ellipse 14 pixels
  either side (12.5 side on), 9 pixels above the middle of her head. The crown is a polygon rising
  from the brim to a tip 22 pixels above the middle of her head, which flops over to one side
  (`tipLean`: to the right, or back side on): that's what makes it crooked. `hatCentre` shifts it
  a little side on, and `lift * 0.15` raises it a touch when she's carried or
  falling.
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
  her picture); from the front, both arms are drawn here, in front of the robe. `hand` is where it ends.
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
- The sparkles: as the comment says, a little spell, sparkles round her raised hand, when
  `pose.sparkle` is above 0. `spin` turns it into an angle, a whole turn from 0 to 1. The
  `SPARKLE` goes round an ellipse 6 pixels either side and 4 up and down, centred a little above
  her hand (`Math.cos(spin) * 6`, `Math.sin(spin) * 4`), and the two `TWINKLE`s go round on
  slightly different paths a third and two-thirds of a turn behind (`spin + 2.1`, `spin + 4.2`;
  a whole turn is about 6.28). The `- 2` and `- 1` centre each stamp on its point. As `sparkle`
  goes from 0 to 1 over the spell's frames, they circle her hand once.
- `castShadows(canvas)`: whichever way she's seen, the shadows things cast on what's below them
  (below).
- `return canvas.rows()`: the finished frame.

### `castShadows()`, `HAT`, `HAIR` and `ROBE`

<!-- code: apps/desktop/src/renderer/src/character/rig.ts#HAT,HAIR,ROBE,castShadows -->

[`src/renderer/src/character/rig.ts`, lines 985–1015](../../apps/desktop/src/renderer/src/character/rig.ts#L985-L1015)

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
  for (let y = 1; y < rows.length; y++) {
    for (let x = 0; x < rows[y]!.length; x++) {
      const here = rows[y]![x]!
      const above = rows[y - 1]![x]!
      const twoAbove = y > 1 ? rows[y - 2]![x]! : '.'
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

[`src/renderer/src/character/pictures.ts`, lines 1–152](../../apps/desktop/src/renderer/src/character/pictures.ts#L1-L152)

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
    'SSKsssssssssK...',
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
  diagonally, standing, one flat drawing with no layers, so her hat, ears, hair, face, braid, robe
  and boots each sit exactly in front of or behind the others. Turned to face right, her right
  side is toward us: her ear and the back of her head on the left, her near eye larger, her far
  cheek (with a small upturned nose) the right-hand edge of her face, her braid over her near
  shoulder and her near leg in front. Her near arm isn't in it, because it moves; `draw()` adds
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
  beside the nostril below it); a little notch at her lips; a soft round chin; then her jaw
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

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#SPRITE_SIZE,PALETTE -->

[`src/renderer/src/character/sprite.ts`, lines 4–61](../../apps/desktop/src/renderer/src/character/sprite.ts#L4-L61)

```ts
// The character's animations: for each pose, a list of frames drawn by the rig (rig.ts) from key
// poses and the in-betweens eased between them. She's an original design: an elf mage with long
// pointed ears, silver-white hair in one long braid, amber eyes, a wide-brimmed crooked hat and a
// long robe in the tenant's accent colour. Frames are drawn the first time a pose is needed, then
// kept.

/**
 * The grid's size in pixels (square): 96, filling the bubble's window, one pixel a DIP at her
 * usual size (more at a bigger size; see CHARACTER_SIZES).
 */
export const SPRITE_SIZE = GRID

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

- `SPRITE_SIZE = GRID`: as its comment says, 96 pixels square, one pixel a DIP, filling the bubble's
  window (`BUBBLE_BOX`). That's at her usual size: `Character` uses it for the `<svg>`'s
  `viewBox`, and draws the same grid bigger when she's bigger.
- `PALETTE`: each letter's colour, as a CSS class in `character.css` rather than a colour itself.
  That's what lets her robe and hat follow the tenant's accent colour, which `useAccentColor()`
  sets at runtime, as the comment says.
  The comments group the letters by material, each a ramp of outline, shadow, base and light
  (`RAMPS` in `rig.ts` says which letters each material uses), plus the details: blush (`c`), the
  eyes' lashes and lids (`e`), three shades of amber iris (`i`, `I`, `j`), a white glint (`w`),
  the mouth (`m`), the silver trim (`f`, `F`), the brooch's gem (`G`), gold embroidery and
  buckles (`Y`, and `k` for its shade) and her shadow (`x`). Some letters do double duty: her
  spellbook's cover is in the hat's letters, the teacup in the trim's, the sparkles are made of
  the iris's gold, the hair's light and the glint's white, and the magic circle of the gem's teal,
  the trim's silver and the glint's white. Upper and
  lower case are different letters. A `.` (not in the palette) is see-through.

### `Frame` and `Key`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#Frame,Key -->

[`src/renderer/src/character/sprite.ts`, lines 63–73](../../apps/desktop/src/renderer/src/character/sprite.ts#L63-L73)

```ts
/** A frame as rows of letters (SPRITE_SIZE × SPRITE_SIZE), and how long it shows. */
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

- `Frame`: a finished frame, `SPRITE_SIZE` rows of `SPRITE_SIZE` letters, and how long it shows
  (`ms`).
- `Key`: the same with the rig's pose in place of the drawing. The animations below are written as
  lists of these, and `drawn()` turns them into frames.

### `smooth`, `lerp`, `mixArm`, `mixLeg`, `ARM_DOWN`, `LEG_STAND` and `mix()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#smooth,lerp,mixArm,mixLeg,ARM_DOWN,LEG_STAND,mix -->

[`src/renderer/src/character/sprite.ts`, lines 75–115](../../apps/desktop/src/renderer/src/character/sprite.ts#L75-L115)

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
  (`spread`), and her arms and legs. The rest (her face, a prop, sparkles, sitting, a butterfly,
  z's) comes from whichever pose is nearer
  (`t < 0.5 ? a : b`), since a face can't be half way between two. The view always comes from `a`,
  so the view never changes in the middle of a move. `...near` copies the nearer pose's fields
  first, and the mixed ones replace them.
- `const [an = ARM_DOWN, af = ARM_DOWN] = a.arms ?? []`: destructuring with default values: the
  near and far arms, or `ARM_DOWN` for any that's missing.

### `FRAME_MS`, `tween()`, `hold` and `crouch()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#FRAME_MS,tween,hold,crouch -->

[`src/renderer/src/character/sprite.ts`, lines 117–143](../../apps/desktop/src/renderer/src/character/sprite.ts#L117-L143)

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

[`src/renderer/src/character/sprite.ts`, lines 145–167](../../apps/desktop/src/renderer/src/character/sprite.ts#L145-L167)

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

[`src/renderer/src/character/sprite.ts`, lines 169–197](../../apps/desktop/src/renderer/src/character/sprite.ts#L169-L197)

```ts
/**
 * Walking, side on, facing right: twelve frames, two steps. Each leg swings forward with its knee
 * bent, plants and pushes back; the arms swing against the legs; her body rises as her legs pass;
 * her hair trails behind her.
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
        wind: -2 + Math.sin(phase - 0.8) * 0.8,
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
- At walking speed (80 DIPs a second, `WANDER.walkSpeed` in `src/main/bubble/wander.ts`), 0.66
  seconds covers about 53 DIPs, two steps, so her feet roughly keep pace with the window moving
  under them.

### `hop()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#hop -->

[`src/renderer/src/character/sprite.ts`, lines 199–257](../../apps/desktop/src/renderer/src/character/sprite.ts#L199-L257)

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
  only just fits in the grid: at the top of the hop its tip reaches the top row. The moves take
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

[`src/renderer/src/character/sprite.ts`, lines 259–279](../../apps/desktop/src/renderer/src/character/sprite.ts#L259-L279)

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

[`src/renderer/src/character/sprite.ts`, lines 281–304](../../apps/desktop/src/renderer/src/character/sprite.ts#L281-L304)

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

[`src/renderer/src/character/sprite.ts`, lines 306–338](../../apps/desktop/src/renderer/src/character/sprite.ts#L306-L338)

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

[`src/renderer/src/character/sprite.ts`, lines 340–370](../../apps/desktop/src/renderer/src/character/sprite.ts#L340-L370)

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

[`src/renderer/src/character/sprite.ts`, lines 372–395](../../apps/desktop/src/renderer/src/character/sprite.ts#L372-L395)

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

[`src/renderer/src/character/sprite.ts`, lines 397–431](../../apps/desktop/src/renderer/src/character/sprite.ts#L397-L431)

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

[`src/renderer/src/character/sprite.ts`, lines 433–483](../../apps/desktop/src/renderer/src/character/sprite.ts#L433-L483)

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

[`src/renderer/src/character/sprite.ts`, lines 485–525](../../apps/desktop/src/renderer/src/character/sprite.ts#L485-L525)

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

[`src/renderer/src/character/sprite.ts`, lines 527–552](../../apps/desktop/src/renderer/src/character/sprite.ts#L527-L552)

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

[`src/renderer/src/character/sprite.ts`, lines 554–587](../../apps/desktop/src/renderer/src/character/sprite.ts#L554-L587)

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

[`src/renderer/src/character/sprite.ts`, lines 589–625](../../apps/desktop/src/renderer/src/character/sprite.ts#L589-L625)

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

[`src/renderer/src/character/sprite.ts`, lines 627–651](../../apps/desktop/src/renderer/src/character/sprite.ts#L627-L651)

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

[`src/renderer/src/character/sprite.ts`, lines 653–704](../../apps/desktop/src/renderer/src/character/sprite.ts#L653-L704)

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

[`src/renderer/src/character/sprite.ts`, lines 706–728](../../apps/desktop/src/renderer/src/character/sprite.ts#L706-L728)

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

### `dragged()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#dragged -->

[`src/renderer/src/character/sprite.ts`, lines 730–760](../../apps/desktop/src/renderer/src/character/sprite.ts#L730-L760)

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

[`src/renderer/src/character/sprite.ts`, lines 762–818](../../apps/desktop/src/renderer/src/character/sprite.ts#L762-L818)

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
}
```

<!-- /code -->

- `drawn(keys)`: key poses into frames: the rig draws each pose (`draw()`), and each keeps its time.
- `MAKERS`: as the comment says, how each pose's frames are made, facing right. They're functions,
  not the frames themselves, so nothing is drawn until it's needed. `Record<Name, ...>` makes
  TypeScript insist on every pose. Both walks make the same right-facing frames; `framesOf()`
  mirrors them for `walk-left`. `look` and `twirl` make their frames themselves. Every fidget,
  `levitate`, `vision` and the five newest (`curtsy`, `orb`, `twirl`, `butterfly`, `doze`)
  included, has its maker here.
- `LEFT_MAKERS`: as the comment says, poses with letters in them, drawn the other way round for
  facing left, so they read right once the frame is mirrored. Only the dozer's z's so far:
  `doze(true)`. `Partial<Record<...>>` lets it list only the poses that need it.
- `LOOPS`: as the comment says, which poses go round and round (idle, the walks and dangling) and
  which play once (the fidgets: their last frame stays until the main process changes the pose,
  which it does just as `FIDGET_MS` runs out).

### `Facing`, `made` and `framesOf()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#Facing,made,framesOf -->

[`src/renderer/src/character/sprite.ts`, lines 820–842](../../apps/desktop/src/renderer/src/character/sprite.ts#L820-L842)

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

[`src/renderer/src/character/sprite.ts`, lines 844–851](../../apps/desktop/src/renderer/src/character/sprite.ts#L844-L851)

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

[`src/renderer/src/character/sprite.ts`, lines 853–877](../../apps/desktop/src/renderer/src/character/sprite.ts#L853-L877)

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

[`src/renderer/src/components/Character.tsx`, lines 13–65](../../apps/desktop/src/renderer/src/components/Character.tsx#L13-L65)

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
const ALL_POSES: Pose[] = ['idle', 'walk-left', 'walk-right', 'dragged', ...FIDGETS]

/**
 * The character: pixel art (character/sprite.ts) drawn `box` DIPs square, her feet on its bottom
 * edge. In the bubble that fills its window, which the main process keeps on the taskbar (one
 * sprite pixel a DIP at her usual size, more when she's bigger); her clones use it too. This plays
 * the pose's frames, facing `facing` (walking, she faces the way she walks). `expanded` tints her
 * shadow while the panel is open.
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
      viewBox={`0 0 ${SPRITE_SIZE} ${SPRITE_SIZE}`}
      width={props.box}
      height={props.box}
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
  `...FIDGETS`.
- `Character({ pose, facing, box, expanded })`: the component itself. As the comment says, it draws
  her `box` DIPs square, her feet on its bottom edge. In the bubble that fills its window, which the
  main process keeps on the taskbar; her clones use it too.
  - `facing`: which way she faces, `'left'` or `'right'` (`Facing` in `sprite.ts`). `BubbleView`
    faces her toward the middle of the screen: right from the left-hand corner, left from the
    right-hand one. As the comment says, walking, she faces the way she walks (`framesOf()` sees to
    that).
  - `box`: how big to draw her: 96 DIPs at her usual size, one sprite pixel a DIP, and more when
    she's bigger (192 at twice her size, two DIPs a pixel).
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
  - `<svg>`: `box` wide and high, with a `viewBox` of the sprite's grid (96 pixels), so the browser
    scales the grid to fill it: each pixel is one DIP at her usual size, and `box / 96` DIPs
    otherwise.
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

[`src/renderer/src/components/Character.tsx`, lines 67–86](../../apps/desktop/src/renderer/src/components/Character.tsx#L67-L86)

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
