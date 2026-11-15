# The UI components

[← Code Guide](CODE_GUIDE.md)

These seven files draw almost everything that appears around the bubble when you click it. `Panel`
in `PanelView.tsx` (see [The pages](7-renderer-pages.md)) renders three of them directly: the
`ActionStack` of round icons in a column beside the bubble, the `ChatBox` card next to the bubble on
the side facing the middle of the screen, and the `SettingsMenu`, which opens beside the gear icon.
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
(`sprite.ts`). `BubbleView` renders `Character`, and
all of these are covered at the end of this page.

## `src/renderer/src/components/ChatBox.tsx`: the chat card

The card beside the bubble, with the text box at its bottom. `Panel` renders one `ChatBox` and
passes it everything it shows: the bubble's `corner`, whether the panel is `open`, the current
`toast`, the conversation (`messages`), the `draft` and its `attachments`, whether Claude is
replying (`busy`), whether Send is allowed (`canSend`), whether questions go to Claude Desktop
(`inClaudeDesktop`) and, if so, whether they're sent there automatically (`autoSend`). `Panel` also
builds the optional pieces that go inside it: a page to show instead (`page`), the sign-in
(`signInPrompt`) and a status line (`banner`). The `on…` props are what the buttons and the text box
call; `issueKeys`, `onOpenIssue` and `onReport` are for Jira and the service desk. The file has
three components: `ChatBox` (the card), `Composer` (the text box, private to this file) and `Banner`
(exported, used by `Panel`).

### `ChatBox`

<!-- code: apps/desktop/src/renderer/src/components/ChatBox.tsx#ChatBox -->

[`src/renderer/src/components/ChatBox.tsx`, lines 19–111](../../apps/desktop/src/renderer/src/components/ChatBox.tsx#L19-L111)

```tsx
/**
 * The card beside the bubble, on the side facing the middle of the screen. It's anchored at the
 * bubble's edge (bottom in a bottom corner, top in a top corner), so it starts as just the text
 * box and grows away from that edge as the conversation gets longer, then scrolls. When nobody is
 * signed in, `signInPrompt` is shown instead of the chat. With `inClaudeDesktop`, it's only the
 * text box, and sending opens the question in Claude Desktop. While a page's icon is on (Apps,
 * Jira, the service desk), the page shows instead.
 */
export function ChatBox(props: {
  corner: Corner
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
  return (
    <div
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
        ...anchored(props.corner, PANEL_LAYOUT.chatX, PANEL_LAYOUT.chatY),
        width: UI.panelWidth,
        maxHeight: UI.panelMaxHeight,
      }}
    >
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
everything inside it; in `SettingsMenu` it's the menu, and in `ActionStack` each icon.

**How the layout mirrors for each corner.** The layout works from any corner of the screen,
though the character only ever lives near the two bottom ones, and the panel always opens toward
the middle. The panel window shares its outer corner with the
bubble's window (`panelWindowBounds` in [The bubble](5-bubble.md)), so the components measure
their positions from that corner. `PANEL_LAYOUT` in `src/shared/geometry.ts` gives each piece's
distance from it, `X` across and `Y` away from the screen edge (see
[Shared code and the preload bridge](1-shared-and-preload.md)). `anchored(corner, x, y)` from
`lib/anchor.ts` turns those two numbers into CSS: `right` and `bottom` in the bottom-right corner,
`left` and `top` in the top-left, and so on. So the same numbers work in all four corners, and a
component only has to check the corner where something must change direction (the toast here,
the order of the icons in `ActionStack`). In the bottom-right corner it looks roughly like this;
the other corners are mirror images:

```text
                                       [close]
                                       [bounce]
  +-----------------------------+      [settings]    <- SettingsMenu opens leftward, over the card
  | MessageList                 |      [screenshot]
  | Banner (only sometimes)     |
  | Composer                    |     ( bubble )
  +-----------------------------+
```

The parts of `ChatBox` itself:

- `inClaudeDesktop: boolean`: `ChatBox` only passes it on to `Composer`, which changes the send
  button. The rest of the card needs no change: with Claude Desktop, `Panel` never passes a
  sign-in prompt or any messages, so the card is just the text box (and sometimes a banner).
- `autoSend: boolean`: the "Send in Claude automatically" setting, also only for `Composer`'s
  wording.
- `page: ReactNode`: as the comment says, a page that replaces the text box while its icon is on
  (the Apps list, the Jira page, the service desk page, or an issue over one of them), built by
  `Panel` like `signInPrompt`; otherwise `null`.
- `originClass(props.corner)`: sets the CSS `transform-origin` to the bubble's corner (for
  example `origin-bottom-right`), so the zoom-in animation grows out of the bubble.
- `'scale-95 opacity-0 transition duration-150 ease-out'`: the card is always rendered, even
  while the panel is closed. It's just invisible and slightly shrunk.
- `'group-data-open:scale-100 group-data-open:opacity-100'`: `Panel`'s outer `<div>` has the
  class `group`, and a `data-open` attribute while the panel is open. `group-data-open:` means
  "when an ancestor marked `group` has `data-open`". So opening animates the card in over 150 ms,
  and closing animates it out; the main process waits 140 ms (`PANEL_FADE_MS` in
  `BubbleController.ts`) before hiding the window, so the fade-out can be seen.
- `'motion-reduce:transition-none'`: when Windows is set to show fewer animations (the system's
  reduced-motion setting), the card appears and disappears instantly.
- `...anchored(props.corner, PANEL_LAYOUT.chatX, PANEL_LAYOUT.chatY)`: `style` takes an object of
  CSS properties, and plain numbers mean pixels. `chatX` is 100 (the 8 px padding around the
  bubble, the 80 px bubble and a 12 px gap), so the card starts just past the bubble. `chatY` is
  8, so the card's near edge is level with the bubble's.
- `maxHeight: UI.panelMaxHeight`: nothing sets a height. The card is pinned at the bubble's edge
  and grows away from it as content is added, up to 520 px. After that the message list scrolls.
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

### `Composer`

<!-- code: apps/desktop/src/renderer/src/components/ChatBox.tsx#Composer -->

[`src/renderer/src/components/ChatBox.tsx`, lines 113–254](../../apps/desktop/src/renderer/src/components/ChatBox.tsx#L113-L254)

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

[`src/renderer/src/components/ChatBox.tsx`, lines 256–265](../../apps/desktop/src/renderer/src/components/ChatBox.tsx#L256-L265)

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
`corner` and `offset` for positioning; the current `settings`, `branding` (app and company name, and
which kind of chat), `version`, signed-in `user`, the `atlassianUser` connected to Atlassian and
how Check for updates is going (`update`) to display; and one callback per menu item,
`onUninstall`, `onDisconnectAtlassian` and `onCheckForUpdates` included. `Panel`
closes it on Esc, on a click anywhere else in the panel, and when the panel closes.

### `CONFIRM_MS`, `EFFORTS`

<!-- code: apps/desktop/src/renderer/src/components/SettingsMenu.tsx#CONFIRM_MS,EFFORTS -->

[`src/renderer/src/components/SettingsMenu.tsx`, lines 18–24](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L18-L24)

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

[`src/renderer/src/components/SettingsMenu.tsx`, lines 26–234](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L26-L234)

```tsx
/** The menu that opens beside the gear icon, on the side facing the middle of the screen. */
export function SettingsMenu(props: {
  corner: Corner
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
  // With Claude Desktop, the chat and its settings live there; only the text box is here.
  const builtInChat = branding.chatApp === 'built-in'

  return (
    <div
      data-hit
      data-settings-menu
      role="menu"
      aria-label="Settings"
      className={cn(
        'absolute rounded-xl border p-1.5 shadow-xl',
        'border-black/10 bg-white text-zinc-800 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100',
      )}
      style={{
        ...anchored(props.corner, PANEL_LAYOUT.settingsX, props.offset),
        width: UI.settingsMenuWidth,
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

- `offset: number`: `Panel` passes `actionOffset()` of the gear's place in the icon stack.
- `...anchored(props.corner, PANEL_LAYOUT.settingsX, props.offset)`: `settingsX` (76 px) puts the
  menu 8 px past the action icons, on the side facing the middle of the screen. `offset` makes
  its near edge level with the gear's: in a bottom corner its bottom lines up with the gear's
  bottom, so it opens upward; in a top corner it opens downward. It overlaps the chat card and is
  drawn on top because `Panel` renders it after `ChatBox`.
- `data-settings-menu`: lets `Panel`'s `closeSettingsOnOutsideClick` recognise a click inside the
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

[`src/renderer/src/components/SettingsMenu.tsx`, lines 236–274](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L236-L274)

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

[`src/renderer/src/components/SettingsMenu.tsx`, lines 276–305](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L276-L305)

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

[`src/renderer/src/components/SettingsMenu.tsx`, lines 307–324](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L307-L324)

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

## `src/renderer/src/components/ActionStack.tsx`: the action icons

The column of round icon buttons that pops out of the bubble when the panel opens (for Morse
Micro: Ask Claude, Jira, IT service desk, screenshot, light or dark mode, settings, bounce and
close),
in the order the tenant's `tenant.json` lists them, nearest the bubble first. `Panel` always
renders it; while closed it's simply invisible. Its props are the `corner`, the tenant's
`actions`, `open`, `activeId` (`settings` while the settings menu is open, otherwise the icon of
the page showing when it isn't the start page, or `null`), `theme` (the current light or dark
mode), `pages` (command icons that open a page in the panel instead: the service desk, when the
tenant lists request types), `dotted` (icons that get a small dot) and `onAction`, which is
`Panel.runAction`.

### `ICONS`

<!-- code: apps/desktop/src/renderer/src/components/ActionStack.tsx#ICONS -->

[`src/renderer/src/components/ActionStack.tsx`, lines 20–30](../../apps/desktop/src/renderer/src/components/ActionStack.tsx#L20-L30)

```tsx
const ICONS: Record<ActionId, LucideIcon> = {
  ask: MessageCircle,
  apps: LayoutGrid,
  jira: Bell,
  servicedesk: Headset,
  screenshot: Camera,
  theme: Sun,
  settings: Settings,
  bounce: Volleyball,
  close: Power,
}
```

<!-- /code -->

Which lucide icon each action shows. Ask Claude is `MessageCircle`, a speech bubble; Apps is
`LayoutGrid`, a grid of four squares, the usual sign for "apps"; Jira is `Bell`, for its
notifications; and the IT service desk is `Headset`, as for a help desk. The theme icon is `Sun`,
but see below: it changes with the mode.

- `Record<ActionId, LucideIcon>`: an object with exactly one entry for every action id. If a new
  id is added to `ACTION_IDS` in `src/shared/actions.ts` without an icon here, TypeScript reports
  an error.

### `ActionStack`

<!-- code: apps/desktop/src/renderer/src/components/ActionStack.tsx#ActionStack -->

[`src/renderer/src/components/ActionStack.tsx`, lines 32–112](../../apps/desktop/src/renderer/src/components/ActionStack.tsx#L32-L112)

```tsx
/**
 * The icons that pop out of the bubble, nearest-first in the tenant's order: stacked above it in
 * a bottom corner, below it in a top corner.
 */
export function ActionStack(props: {
  corner: Corner
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
        ...anchored(props.corner, PANEL_LAYOUT.actionsX, PANEL_LAYOUT.actionsY),
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
- `...anchored(props.corner, PANEL_LAYOUT.actionsX, PANEL_LAYOUT.actionsY)`: `actionsX` (28 px)
  centres the 40 px icons on the 80 px bubble. `actionsY` (100 px) starts the stack 12 px past the
  bubble.
- `gap: UI.actionGap`: 8 px between icons. The main process sizes the panel window from the same
  numbers (`panelWindowSize` in `src/shared/geometry.ts`), so the stack always fits.
- `const Icon = id === 'theme' && props.theme === 'light' ? Moon : ICONS[id]`: the theme icon shows
  what clicking it switches to: a sun while dark (switch to light), a moon while light.
- `const label = id === 'theme' ? ... : ACTIONS[id].label`: the tooltip and screen-reader name,
  from the action registry, except for the theme icon, which says what it will do ("Switch to
  light mode" or "Switch to dark mode").
- `data-hit`: on each button, not on the column, so the gaps between icons stay click-through.
- `data-action={id}`: `Panel.closeSettingsOnOutsideClick` looks for `[data-action="settings"]`,
  so clicking the gear toggles the menu instead of counting as a click outside it.
- `aria-expanded={ACTIONS[id].kind === 'popover' || props.pages?.includes(id) ? active : undefined}`:
  for a popover action (Settings, Ask Claude, Apps and Jira), or an icon that opens a page (the
  service desk, with request types), it tells screen readers whether what it opens is showing.
  `undefined` leaves the attribute off the others, the theme icon included, which opens nothing.
- `onClick={() => props.onAction(id)}`: `Panel.runAction` toggles the menu for Settings, switches
  the card's page for Ask Claude, Apps, Jira and (with request types) the service desk, flips light
  or dark mode for the theme icon, and asks the main process to run any other action (see
  `src/main/actions.ts` in [Main process: startup, IPC and app plumbing](2-main-startup.md)).
- ``transitionDelay: props.open ? `${index * 30}ms` : '0ms'``: each icon starts its animation 30
  ms after the one before, so they pop out one after another. Closing has no delay, so they all go
  together.
- `top ? '-translate-y-3' : 'translate-y-3'`: while closed, each icon sits 12 px toward the bubble,
  and `'scale-75 opacity-0'` shrinks it to 75% and hides it. The `group-data-open:` classes
  (explained under `ChatBox`) move it to its place at full size when the panel opens.
- `outline-none`: together with `'focus-visible:ring-2 focus-visible:ring-accent'`, swaps the
  usual square focus outline for an accent ring that follows the round button.
- `active`: the active action (the gear while its menu is open, or a page's icon while its page
  is showing) is filled with the accent colour.
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
- _Selective outlining_: each part is outlined in the darkest shade of its own colour rather than
  in black, so her silver hair has a dusky violet outline and her skin a rose one. The parts stay
  distinct without the heavy look of black lines.

As the comment at the top of the file says, each body part is drawn into a `Layer` of materials,
and `ink()` shades and outlines it and lays it over the frame so far.

### `Point` and `Ramp`

<!-- code: apps/desktop/src/renderer/src/character/raster.ts#Point,Ramp -->

[`src/renderer/src/character/raster.ts`, lines 1–19](../../apps/desktop/src/renderer/src/character/raster.ts#L1-L19)

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
}
```

<!-- /code -->

- `Point`: a position (or an offset) in pixels. Fractions are allowed: shapes are worked out
  exactly and only become whole pixels when they're filled. As the file's comment says, a pixel's
  centre is at `(x + 0.5, y + 0.5)`.
- `Ramp`: a material's shades, as letters of the palette (`PALETTE` in `sprite.ts`): `line` for its
  outline, `shade` for the side away from the light, `base` for the rest, and an optional `light`
  for the edge toward the light. `rig.ts` gives each material its ramp (`RAMPS`).

### `Layer`

<!-- code: apps/desktop/src/renderer/src/character/raster.ts#Layer.class -->

[`src/renderer/src/character/raster.ts`, lines 21–22](../../apps/desktop/src/renderer/src/character/raster.ts#L21-L22)

```ts
/** A body part's pixels, each the name of its material (or undefined: not part of it). */
export class Layer {
  // …
}
```

<!-- /code -->

<!-- code: apps/desktop/src/renderer/src/character/raster.ts#Layer.cells,minX,minY,maxX,maxY,constructor,get,set -->

[`src/renderer/src/character/raster.ts`, lines 23–46](../../apps/desktop/src/renderer/src/character/raster.ts#L23-L46)

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

[`src/renderer/src/character/raster.ts`, lines 48–59](../../apps/desktop/src/renderer/src/character/raster.ts#L48-L59)

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

[`src/renderer/src/character/raster.ts`, lines 61–91](../../apps/desktop/src/renderer/src/character/raster.ts#L61-L91)

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

[`src/renderer/src/character/raster.ts`, lines 93–119](../../apps/desktop/src/renderer/src/character/raster.ts#L93-L119)

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

[`src/renderer/src/character/raster.ts`, lines 122–123](../../apps/desktop/src/renderer/src/character/raster.ts#L122-L123)

```ts
/** A frame being drawn: rows of palette letters, `.` where nothing is drawn yet. */
export class Canvas {
  // …
}
```

<!-- /code -->

<!-- code: apps/desktop/src/renderer/src/character/raster.ts#Canvas.cells,constructor,get,set -->

[`src/renderer/src/character/raster.ts`, lines 124–137](../../apps/desktop/src/renderer/src/character/raster.ts#L124-L137)

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

[`src/renderer/src/character/raster.ts`, lines 139–167](../../apps/desktop/src/renderer/src/character/raster.ts#L139-L167)

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
    for (let x = layer.minX; x <= layer.maxX; x++) {
      const material = layer.get(x, y)
      if (material === undefined) continue
      const ramp = ramps[material]!
      const shaded =
        !inside(x - light.x * 2, y - light.y * 2) || !inside(x - light.x, y - light.y)
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
- The first pair of loops colours the layer's pixels, within its box. Each pixel's colour depends
  only on its neighbours in the layer:
  - `shaded`: the pixel one step away from the light (`x - light.x, y - light.y`, which with the
    light up and to the left is down and to the right), or two steps away, is outside the shape.
    So the edges facing away from the light get a band of shadow two pixels deep.
  - `lit`: the pixel one step toward the light is outside the shape, so the edges facing the light
    get a one-pixel highlight, for materials that have a `light` shade.
  - `shaded ? ramp.shade : lit && ramp.light ? ramp.light : ramp.base`: shadow wins where both
    apply (on a part only a few pixels wide), and everything else is the base colour.
- That's cel shading: flat bands of colour following the shape's edges rather than smooth
  gradients. It needs no 3D model, only the silhouette. Because each part is inked on its own, each
  is shaded by its own shape: a sleeve in front of the robe gets its own shadow along its lower
  edge.
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

[`src/renderer/src/character/raster.ts`, lines 169–185](../../apps/desktop/src/renderer/src/character/raster.ts#L169-L185)

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
  the gem brooch and the sparkles of a spell (`EYES`, `MOUTHS`, `SPARKLE` and `TWINKLE` in
  `rig.ts`). `flip` mirrors the picture left to right (`[...row]` splits a
  row into its letters, and `reverse()` turns them round).
- `rows()`: the finished frame as `size` strings of `size` letters, one per row, which is what a
  `Frame` holds. `slice()` takes each row's stretch of the list and `join('')` makes it a string.

### `rotate()`, `add` and `limb()`

<!-- code: apps/desktop/src/renderer/src/character/raster.ts#rotate,add,limb -->

[`src/renderer/src/character/raster.ts`, lines 188–203](../../apps/desktop/src/renderer/src/character/raster.ts#L188-L203)

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

`GRID = 96`: a frame is 96 pixels square, the size of the bubble's window (`BUBBLE_BOX`, 96 DIPs),
so one pixel is one DIP. As the comment above it says, she's about 88 pixels tall with her hat on,
her feet on the bottom row. That leaves only a few rows above the tip of her hat, which is why her
hop is a small one.

### `RAMPS` and `LIGHT`

<!-- code: apps/desktop/src/renderer/src/character/rig.ts#RAMPS,LIGHT -->

[`src/renderer/src/character/rig.ts`, lines 19–34](../../apps/desktop/src/renderer/src/character/rig.ts#L19-L34)

```ts
/** Each material's shades, as palette letters (see PALETTE in sprite.ts). */
const RAMPS: Record<string, Ramp> = {
  hair: { line: 'O', shade: 'D', base: 'h', light: 'l' },
  skin: { line: 'K', shade: 'S', base: 's', light: 'z' },
  robe: { line: 'q', shade: 'A', base: 'a', light: 'v' },
  trim: { line: 'q', shade: 'F', base: 'f' },
  hat: { line: 'q', shade: 'N', base: 'n', light: 'g' },
  stocking: { line: 'u', shade: 'Q', base: 'o' },
  boot: { line: 'u', shade: 'B', base: 'b', light: 'y' },
  cup: { line: 'u', shade: 'F', base: 'f', light: 'w' },
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
  - `robe`, `trim` and `hat` share the robe's outline (`q`). The trim is the silver along the
    robe's edges; it's mostly set pixel by pixel on top of the robe, and only inked as a shape of
    its own at the cuff of each sleeve.
  - The stockings, boots, cup and book share one dark outline (`u`).
  - The teacup borrows the trim's silver, with a white light (`w`), and the spellbook's cover the
    hat's letters.
  - `shadow`: her shadow on the taskbar, one see-through dark colour (`x`) throughout.
- `LIGHT`: as the comment says, the light comes from up and to the left of a figure facing right.
  It's the step `ink()` takes toward the light. Frames facing left are mirrored, so for them the
  light comes from the upper right, which is hard to notice.

### `View`, `Face`, `Arm`, `Leg`, `Pose`, `DOWN`, `STAND` and `LEG_LENGTH`

<!-- code: apps/desktop/src/renderer/src/character/rig.ts#View,Face,Arm,Leg,Pose,DOWN,STAND,LEG_LENGTH -->

[`src/renderer/src/character/rig.ts`, lines 36–86](../../apps/desktop/src/renderer/src/character/rig.ts#L36-L86)

```ts
export type View = 'front' | 'diagonal' | 'side'

export type Face = 'neutral' | 'blink' | 'happy' | 'surprised' | 'yawn' | 'sip' | 'down'

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
  /** Something in her hands: a teacup or her spellbook. */
  prop?: 'cup' | 'book'
  /** Sparkles round her near hand, 0 to 1 (a little spell). */
  sparkle?: number
  /** Sitting on the taskbar with her knees up under her robe. */
  sitting?: boolean
  /** A magic circle on the ground under her, 0 (none) to 1 (full size), as she levitates. */
  rune?: number
  /** How far its runes have turned (whole turns), and how far its sparks have risen. */
  spin?: number
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
  and the spell, where her hands are busy in front of her.
- `Face`: her expression: `neutral`, `blink` (eyes shut), `happy` (smiling eyes and mouth),
  `surprised` (mouth open, while she's carried), `yawn`, `sip` (eyes closed contentedly, lips on
  the cup) and `down` (looking down at her book).
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
  - `prop`: a teacup or her spellbook in her near hand.
  - `sparkle`: sparkles circling her near hand, for a little spell: how far round they've gone,
    from 0 to 1. Left out (or 0), there are none.
  - `sitting`: sitting on the taskbar with her knees up under her robe.
  - `rune` and `spin`: the magic circle under her as she levitates: `rune` its size, from 0 (none)
    to 1, and `spin` how far its runes have turned, in whole turns, which also says how far its
    sparks have risen.
- `DOWN` and `STAND`: the arms (hanging, very slightly away from her body) and legs (straight) of a
  pose that doesn't give them.
- `LEG_LENGTH`: as its comment says, her thigh and her shin are 16.5 pixels each, so standing
  straight her hips are 33 pixels above her ankles. It's exported because `crouch()` in `sprite.ts`
  works out bent legs from it.

### `EYES`, `MOUTHS`, `SPARKLE`, `TWINKLE` and `eyesFor()`

<!-- code: apps/desktop/src/renderer/src/character/rig.ts#EYES,MOUTHS,SPARKLE,TWINKLE,eyesFor -->

[`src/renderer/src/character/rig.ts`, lines 88–155](../../apps/desktop/src/renderer/src/character/rig.ts#L88-L155)

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
  },
  side: {
    open: [['ee...', '.eeee', '..iw.', '..II.', '..jj.']],
    blink: [['.....', '.....', 'eeee.', '.ee..']],
    happy: [['.....', '..ee.', '.e..e', '.....']],
    down: [['.....', '.....', '.eeee', '..iI.']],
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
}

/** A four-pointed sparkle, and a smaller one. */
const SPARKLE = ['..j..', '..l..', 'jlwlj', '..l..', '..j..']

const TWINKLE = ['.l.', 'lwl', '.l.']

/** Which eyes a face uses. */
function eyesFor(face: Face): 'open' | 'blink' | 'happy' | 'down' {
  if (face === 'blink' || face === 'yawn') return 'blink'
  if (face === 'happy' || face === 'sip') return 'happy'
  if (face === 'down') return 'down'
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
  - Seen diagonally, the far eye is a pixel narrower, because it's turned away.
  - Side on, the open eye is a wedge, as anime profiles draw it: lashes flicking back at the outer
    corner (`ee...`), the upper lid (`.eeee`), and a narrow iris toward the front: glint, pupil
    and light bottom (`..iw.`, `..II.`, `..jj.`).
  - `as const` keeps the object's exact shape, so TypeScript knows every view has every kind of
    eye.
- `MOUTHS`: small on purpose: two pixels (`mm`) for most faces, a little U for `happy`, two by two
  for `surprised`, a rounded four by four for `yawn`, and one pixel for `sip`. `Record<Face, ...>`
  makes TypeScript insist on a mouth for every face.
- `SPARKLE` and `TWINKLE`: as the comment says, a four-pointed sparkle, five pixels across, white
  at its heart (`w`) and paler then golden toward its points (`l`, `j`), and a smaller one, three
  pixels across. A spell circles one of the first and two of the second round her hand.
- `eyesFor(face)`: which eyes go with a face. A yawn shuts them like a blink, and a sip closes them
  happily.

### `draw()`

<!-- code: apps/desktop/src/renderer/src/character/rig.ts#draw -->

[`src/renderer/src/character/rig.ts`, lines 157–868](../../apps/desktop/src/renderer/src/character/rig.ts#L157-L868)

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
    // Her shadow on the taskbar, smaller the higher she is.
    const height = Math.max(0, -(pose.y ?? 0))
    const shadow = new Layer(GRID)
    shadow.ellipse({ x: hips.x, y: 95.5 }, Math.max(6, 15 - height / 2), 1.6, 'shadow')
    ink(shadow, false)

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

    // Her long hair behind her, down past her shoulders.
    const back = new Layer(GRID)
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
            [-2, 14],
            [-4, 24],
            [-6.5, 28],
            [-8.5, 24],
            [-10.5, 27],
            [-11, 16],
            [-10, 6],
            [-8, 0],
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
    ink(back)

    // Her braid, tied with a ribbon: from the front, hanging down behind her left shoulder, drawn
    // before her body so it peeks out beside her arm and never covers her face or front; side on,
    // hanging behind her ear.
    const drawBraid = () => {
      const braid = new Layer(GRID)
      const braidPath =
        view === 'side'
          ? [
              [-2, 4],
              [-2.6, 10],
              [-3.2, 16],
              [-3.8, 22],
              [-4.2, 28],
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
    if (frontView) drawBraid()

    if (!frontView) drawArm(farArm, -1)
    // The far leg first, so the near one is in front of it.
    drawLeg(farLeg, -1)
    drawLeg(nearLeg, 1)

    // The robe's skirt: long and flared, swaying, silver trim along its hem.
    const robe = new Layer(GRID)
    const swing = wind * 0.4
    const hem = sitting ? 11 : 22
    const flare = sitting ? 15 : 0
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
    // The border: a gold line, and below it gold diamonds with gold dots between, just above the
    // silver trim of the hem; centred on the trim down her front, so it sways with it.
    const centre = (y: number) => (swing * y) / hem
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
    } else {
      canvas.stamp(eyes[0]!, head.x + 1.5, eyeY)
      canvas.stamp(['cc'], head.x + 1.5, head.y + 4.5)
      // Her mouth: a short line just inside her lips, between nose and chin.
      canvas.stamp(
        mouth.map((r) => r.slice(0, 1)),
        head.x + 5.5,
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
            [7.8, -1],
            [6.5, -3],
            [5.5, 0],
            [4, -2.5],
            [2.5, -1],
            [1.5, -4],
            [-1, -4.5],
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
      const crown = [
        [1.5, -11.6],
        [-3, -11],
        [-6.5, -8],
        [-7.8, -3],
        [-7.5, 3],
        [-5.5, 7.5],
        [-2, 8.5],
        [-0.8, 3],
        [0.2, -2.5],
        [1.5, -5],
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
    if (view === 'side') {
      lock(-1.5, 12)
    } else {
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

    if (!frontView) drawBraid()

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
  if (pose.prop) {
    const prop = new Layer(GRID)
    if (pose.prop === 'cup') {
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
    canvas.stamp(['ss'], hand.x - 1, hand.y)
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
top. In order:

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
  outline.
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
- The back hair: as the comment says, her long hair behind her, down past her shoulders, as one
  polygon in the head's frame. From the front, its lower edge is jagged, clumps of hair ending at
  different lengths; side on, it flows back behind her. It's inked first, so everything else is in
  front of it.
- `drawBraid()`: as the comment says, her braid, tied with a ribbon. From the front it's drawn
  here, straight after the back hair, so her body, arms, face and side locks all cover it: it
  hangs down behind her left shoulder (the right of the picture) and only peeks out beside her
  arm, never over her face or the front of her robe. Side on it's drawn later, with the rest of
  her hair, hanging behind her ear. See the braid, below, for how it's drawn.

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
  taskbar), and `flare` adds 15 pixels on each side, so the robe spreads round her.
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
- The border, as the comment says: a gold line (`k`, the gold's shade) across the skirt 7.5 pixels
  above the hem, and below it gold diamonds (`.Y.`, `YaY`, `.Y.`: a diamond of gold round a pixel
  of robe) every 6 pixels, with a gold dot between each pair, just above the hem's silver trim.
  `centre(y)` is where the trim down her front is, swaying with `swing`, and from the front the
  diamonds sit 3 pixels either side of it, so the trim runs between them; side on (no trim) one
  is in the middle. Any that would reach the skirt's edge are left out.
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
  and the mouth in the middle. Side on: one eye, blush on her cheek below it, and one pixel of
  mouth at the notch of her lips.
- The hair in front, as one layer. The fringe is a polygon whose lower edge zigzags
  (`[7.5, -3.6], [6.5, -0.4], [4.5, -3.4], ...`), so it falls over her forehead in clumps; side on,
  a `crown` covers the back of her head too. The side locks (`lock(x, length)`) are chains from her
  temples down past her chin, 13 pixels long (12 side on), tapering from 1.9 to 0.6 so they end in
  points: two of them, or one side on, in front of her ear and behind her eye (`-1.5`).
- The shine: as the comment says, a band across her crown: one curved row of the hair's shine
  (`L`), set only over hair pixels (`'hl'`) so it never spills onto the outline. A band like this
  is how anime art shows glossy hair.
- The ears: as the comment says, her long elf ears, through her hair. They're their own `ears`
  layer, drawn after the hair so they show in front of it. Each is a narrow four-sided shape from
  beside her head out and up to a point (`[13.5, -6.8]`: about 13 pixels out and 7 up from the
  middle of her head), and `p.x * side` mirrors it for the other side. Both show from the front;
  side on, one pointing back. They're inked as skin.
- The braid, side on: `drawBraid()` (defined with the back hair, above) is called here, so it
  hangs behind her ear in front of her back hair. `braidPath` is its line, 28 pixels long, in the
  head's frame: side on it starts behind her jaw and hangs back and down; from the front it starts
  behind her head (8.6 pixels out from the middle of it, past her cheek at 7.5) and hangs straight
  down behind her shoulder, about 11 out. `braidPoints` turns each point into a place on the grid,
  swinging further with the wind toward the tip (`(y / 28) * wind * 0.8`) and blown like the rest
  of her hair. `chain()` draws it in its own `braid` layer, 2.1 thick tapering to 1.6, so it's
  outlined against whatever is behind it.
- The plaits: as the comment says, a darker stroke across the braid every few pixels. Twice along
  each section (`t` at 0.25 and 0.75), two pixels in the hair's shadow (`D`), one to the left and
  one below, make a short slanted stroke, only over the braid's lighter pixels (`'hl'`). A row of
  slanted strokes is how a plait reads in pixel art.
- The ribbon: near the braid's end (`braidPoints[4]`, 24 pixels down), three pixels in the robe's
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
- `if (pose.prop)`: a teacup (a small cup narrowing toward its base, with a handle) or her
  spellbook, held open (a wide shape, 11 pixels across, in the hat's deep colours), placed on her
  hand and inked. Then, for the book, its pages are filled in pale silver (`f`) either side of a
  middle line in the trim's shade (`F`), the spine, only over the cover's pixels for the pages, so
  the cover still shows round them. For the cup, two white pixels above it are a wisp of steam.
  Two skin pixels (`ss`) stamped over the prop are her fingers round it.
- The sparkles: as the comment says, a little spell, sparkles round her raised hand, when
  `pose.sparkle` is above 0. `spin` turns it into an angle, a whole turn from 0 to 1. The
  `SPARKLE` goes round an ellipse 6 pixels either side and 4 up and down, centred a little above
  her hand (`Math.cos(spin) * 6`, `Math.sin(spin) * 4`), and the two `TWINKLE`s go round on
  slightly different paths a third and two-thirds of a turn behind (`spin + 2.1`, `spin + 4.2`;
  a whole turn is about 6.28). The `- 2` and `- 1` centre each stamp on its point. As `sparkle`
  goes from 0 to 1 over the spell's frames, they circle her hand once.
- `return canvas.rows()`: the finished frame.

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
 * fringe, a dip at the eye, a small pointed nose, a little notch at her lips, a soft chin, then
 * her jaw running back under her side lock, her neck in its shadow. It is placed relative to the
 * middle of her head (x and y here are offsets from it); her hair, ear and hat are drawn over it,
 * and her eyes, blush and mouth on it.
 */
export const SIDE_FACE: Picture = {
  x: -2,
  y: -3,
  rows: [
    'ssssssssssK..',
    'ssssssssssK..',
    'ssssssssssK..',
    'ssssssssssK..',
    'ssssssssssK..',
    'sssssssssssK.',
    'ssssssssssssK',
    'sssssssssSKK.',
    'ssssssssssK..',
    'sssssssssK...',
    'SSKssssssK...',
    'SSSKKsssSK...',
    'SSSSSKKKK....',
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
  it. It was made by drawing the rig's diagonal pose once, then retouching it by hand.
- `DIAGONAL_EYES` and `DIAGONAL_MOUTH`: where her eyes and mouth are in `DIAGONAL`, so `draw()`
  can paint over them with another expression.
- `SIDE_FACE`: her face side on, in the usual anime profile, read from the top: her forehead under
  her fringe (`K`, the outline, at the right-hand end of each row); a dip at the eye; a small
  pointed nose (the outline steps out two pixels and back, with a pixel of shade, `S`, beside the
  nostril); a notch at her lips; a soft chin; then her jaw running back under her side lock, with
  her neck in its shadow. Its `x` and `y` are offsets from the middle of her head rather than grid
  positions, since her head moves; her hair, ear and hat are drawn over it, and her eyes, blush
  and mouth on it. Shading is kept light (mostly the base skin, `s`), since a face in profile in
  anime art is mostly flat colour.

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

[`src/renderer/src/character/sprite.ts`, lines 4–58](../../apps/desktop/src/renderer/src/character/sprite.ts#L4-L58)

```ts
// The character's animations: for each pose, a list of frames drawn by the rig (rig.ts) from key
// poses and the in-betweens eased between them. She's an original design: an elf mage with long
// pointed ears, silver-white hair in one long braid, amber eyes, a wide-brimmed crooked hat and a
// long robe in the tenant's accent colour. Frames are drawn the first time a pose is needed, then
// kept.

/** The grid's size in pixels (square): 96, one pixel a DIP, filling the bubble's window. */
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
  window (`BUBBLE_BOX`). `Character` uses it for the `<svg>`'s `viewBox`.
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

[`src/renderer/src/character/sprite.ts`, lines 60–70](../../apps/desktop/src/renderer/src/character/sprite.ts#L60-L70)

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

[`src/renderer/src/character/sprite.ts`, lines 72–111](../../apps/desktop/src/renderer/src/character/sprite.ts#L72-L111)

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
  circle (`rune`, `spin`), and her arms and legs. The rest (her face, a prop, sparkles, sitting) comes from whichever pose is nearer
  (`t < 0.5 ? a : b`), since a face can't be half way between two. The view always comes from `a`,
  so the view never changes in the middle of a move. `...near` copies the nearer pose's fields
  first, and the mixed ones replace them.
- `const [an = ARM_DOWN, af = ARM_DOWN] = a.arms ?? []`: destructuring with default values: the
  near and far arms, or `ARM_DOWN` for any that's missing.

### `FRAME_MS`, `tween()`, `hold` and `crouch()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#FRAME_MS,tween,hold,crouch -->

[`src/renderer/src/character/sprite.ts`, lines 113–139](../../apps/desktop/src/renderer/src/character/sprite.ts#L113-L139)

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

[`src/renderer/src/character/sprite.ts`, lines 141–163](../../apps/desktop/src/renderer/src/character/sprite.ts#L141-L163)

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

[`src/renderer/src/character/sprite.ts`, lines 165–193](../../apps/desktop/src/renderer/src/character/sprite.ts#L165-L193)

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

[`src/renderer/src/character/sprite.ts`, lines 195–253](../../apps/desktop/src/renderer/src/character/sprite.ts#L195-L253)

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

[`src/renderer/src/character/sprite.ts`, lines 255–275](../../apps/desktop/src/renderer/src/character/sprite.ts#L255-L275)

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

[`src/renderer/src/character/sprite.ts`, lines 277–300](../../apps/desktop/src/renderer/src/character/sprite.ts#L277-L300)

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

[`src/renderer/src/character/sprite.ts`, lines 302–334](../../apps/desktop/src/renderer/src/character/sprite.ts#L302-L334)

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

[`src/renderer/src/character/sprite.ts`, lines 336–366](../../apps/desktop/src/renderer/src/character/sprite.ts#L336-L366)

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

[`src/renderer/src/character/sprite.ts`, lines 368–391](../../apps/desktop/src/renderer/src/character/sprite.ts#L368-L391)

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

### `levitate()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#levitate -->

[`src/renderer/src/character/sprite.ts`, lines 393–443](../../apps/desktop/src/renderer/src/character/sprite.ts#L393-L443)

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

[`src/renderer/src/character/sprite.ts`, lines 445–485](../../apps/desktop/src/renderer/src/character/sprite.ts#L445-L485)

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

### `look()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#look -->

[`src/renderer/src/character/sprite.ts`, lines 487–509](../../apps/desktop/src/renderer/src/character/sprite.ts#L487-L509)

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

As the comment says, a glance one way, then the other, her eyes leading her head. Unlike the others
it returns frames rather than key poses: it only needs a few drawings, so each is drawn once and
used again.

- `front` (standing), `eyesRight` and `eyesLeft` (standing, her eyes a pixel to one side), `glance`
  (turned diagonally toward the way she faces, her head tilted a touch) and `mirror(glance)`, the
  same glance the other way.
- Each glance starts with her eyes moving first (80 ms) and her head following, which is how
  people look round: front, eyes right, the glance (0.52 s), eyes right, front; the same to the
  left; then a blink, and front. Eleven frames, 2400 ms, `FIDGET_MS.look`.

### `dragged()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#dragged -->

[`src/renderer/src/character/sprite.ts`, lines 511–537](../../apps/desktop/src/renderer/src/character/sprite.ts#L511-L537)

```ts
/** Carried by her collar: off the ground, arms up, legs kicking, swaying, hair lifted. */
function dragged(): Key[] {
  return Array.from({ length: 12 }, (_, i) => {
    const phase = (i / 12) * Math.PI * 2
    const kick = Math.sin(phase * 2)
    return {
      pose: {
        view: 'front',
        face: 'surprised',
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

As the comment says, carried by her collar: the pose while she's dragged, thrown about by Bounce,
or falling after a drop. Twelve frames of 55 ms, round and round.

- `y: -4`: off the ground, so her feet leave the bottom rows (a test checks), and her shadow is
  smaller.
- `face: 'surprised'` and `lift: 3`: her mouth open and her hair lifted.
- `kick` goes round twice as fast as the sway (`phase * 2`): her legs kick in turn, each knee
  bending as its leg kicks, and her raised arms wave with them.
- `x`, `tilt` and `wind`: swaying a pixel side to side, her head, hair and robe with her.

### `drawn`, `MAKERS` and `LOOPS`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#drawn,MAKERS,LOOPS -->

[`src/renderer/src/character/sprite.ts`, lines 539–575](../../apps/desktop/src/renderer/src/character/sprite.ts#L539-L575)

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
  sit: () => drawn(sit()),
  look,
  dragged: () => drawn(dragged()),
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
  sit: false,
  look: false,
}
```

<!-- /code -->

- `drawn(keys)`: key poses into frames: the rig draws each pose (`draw()`), and each keeps its time.
- `MAKERS`: as the comment says, how each pose's frames are made, facing right. They're functions,
  not the frames themselves, so nothing is drawn until it's needed. `Record<Name, ...>` makes
  TypeScript insist on every pose. Both walks make the same right-facing frames; `framesOf()`
  mirrors them for `walk-left`. `look` makes its frames itself. Every fidget, `levitate`
  included, has its maker here.
- `LOOPS`: as the comment says, which poses go round and round (idle, the walks and dangling) and
  which play once (the fidgets: their last frame stays until the main process changes the pose,
  which it does just as `FIDGET_MS` runs out).

### `Facing`, `made` and `framesOf()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#Facing,made,framesOf -->

[`src/renderer/src/character/sprite.ts`, lines 577–596](../../apps/desktop/src/renderer/src/character/sprite.ts#L577-L596)

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
    frames = way === 'right' ? right : right.map((f) => ({ rows: mirror(f.rows), ms: f.ms }))
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
  The rig only ever draws her facing right, so every animation works both ways.

### `animationLength()` and `mirror()`

<!-- code: apps/desktop/src/renderer/src/character/sprite.ts#animationLength,mirror -->

[`src/renderer/src/character/sprite.ts`, lines 598–605](../../apps/desktop/src/renderer/src/character/sprite.ts#L598-L605)

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

[`src/renderer/src/character/sprite.ts`, lines 607–631](../../apps/desktop/src/renderer/src/character/sprite.ts#L607-L631)

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
  which the `<svg>`'s `viewBox` makes one DIP each.
- The runs are collected by letter in a `Map` (which keeps the order letters were first seen), and
  each letter's runs, joined, become one path with that letter's class.
- See-through runs (`.`) are skipped. A letter that isn't in the palette, which the tests rule out,
  would fall back to the darkest colour, the hair's outline (`px-hair-line`).

## `src/renderer/src/components/Character.tsx` and `character.css`: the character

The component that draws the character, the one used by the bubble's page rather than the panel's.
It decides nothing itself: the main process chooses the pose (`Pose` in `src/shared/character.ts`)
and moves the window while she walks, `BubbleView` passes in the pose and the bubble's corner, and
this plays the pose's frames from `character/sprite.ts`, facing the middle of the screen.

### `paths`, `pathsOf()`, `ALL_POSES` and `Character`

<!-- code: apps/desktop/src/renderer/src/components/Character.tsx#paths,pathsOf,ALL_POSES,Character -->

[`src/renderer/src/components/Character.tsx`, lines 14–66](../../apps/desktop/src/renderer/src/components/Character.tsx#L14-L66)

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
 * The character that stands in for the bubble: pixel art (character/sprite.ts) filling the
 * bubble's window, one pixel a DIP, her feet on its bottom edge, which the main process keeps on
 * the taskbar. The main process decides the pose (and moves the window while she walks); this
 * plays the pose's frames. She faces the middle of the screen: left from the right-hand corner
 * (walking, she faces the way she walks). `expanded` tints her shadow while the panel is open.
 */
export function Character(props: { pose: Pose; corner: Corner; expanded: boolean }) {
  const facing: Facing = isLeftCorner(props.corner) ? 'right' : 'left'

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
      width={BUBBLE_BOX}
      height={BUBBLE_BOX}
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
- `Character({ pose, corner, expanded })`: the component itself.
  - `facing`: as the comment says, she faces the middle of the screen: right from the left-hand
    corner, left from the right-hand one. (Walking, `framesOf()` faces her the way she walks.)
  - The effect: as its comment says, it draws every pose's frames in the background, one pose at a
    time, so starting one never stutters. Drawing a pose means the rig drawing every frame and
    `framePaths()` turning each into paths, which, done on the spot, could make the pose's first
    frame late. It starts half a second after she first appears, then does one pose every 50 ms, so
    the page stays free to respond in between. `function next()` is named so it can schedule
    itself again, and `waiting.shift()` takes the next pose off the front of the list. The effect
    runs again when `facing` changes (she's moved to the other corner), and the cleanup cancels
    whatever was scheduled.
  - `<svg>`: the size of the bubble's window (`BUBBLE_BOX`, 96 DIPs), with a `viewBox` of the
    sprite's grid (96 pixels), so each pixel is one DIP.
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

[`src/renderer/src/components/Character.tsx`, lines 68–87](../../apps/desktop/src/renderer/src/components/Character.tsx#L68-L87)

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
