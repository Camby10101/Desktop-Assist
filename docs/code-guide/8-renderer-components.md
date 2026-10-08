# The UI components

[← Code Guide](../CODE_GUIDE.md)

These seven files draw everything that appears around the bubble when you click it. `Panel` in
`PanelView.tsx` (see [The pages](7-renderer-pages.md)) renders three of them directly: the
`ActionStack` of round icons in a column beside the bubble, the `ChatBox` card next to the bubble
on the side facing the middle of the screen, and the `SettingsMenu`, which opens beside the gear
icon. Everything else lives inside the chat card: `SignInPanel` replaces the chat while nobody is
signed in, `MessageList` shows the conversation (using `Markdown` for Claude's replies), and an
`AttachmentChip` above the text box stands for each attached screenshot.

## `src/renderer/src/components/ChatBox.tsx`: the chat card

The card beside the bubble, with the text box at its bottom. `Panel` renders one `ChatBox` and
passes it everything it shows: the bubble's `corner`, whether the panel is `open`, the current
`toast`, the conversation (`messages`), the `draft` and its `attachments`, whether Claude is
replying (`busy`) and whether Send is allowed (`canSend`). `Panel` also builds the two optional
pieces that go inside it, the sign-in (`signInPrompt`) and a status line (`banner`). The `on…`
props are what the buttons and the text box call. The file has three components: `ChatBox` (the
card), `Composer` (the text box, private to this file) and `Banner` (exported, used by `Panel`).

### `ChatBox`

<!-- code: apps/desktop/src/renderer/src/components/ChatBox.tsx#ChatBox -->

[`src/renderer/src/components/ChatBox.tsx`, lines 11–85](../../apps/desktop/src/renderer/src/components/ChatBox.tsx#L11-L85)

```tsx
/**
 * The card beside the bubble, on the side facing the middle of the screen. It's anchored at the
 * bubble's edge (bottom in a bottom corner, top in a top corner), so it starts as just the text
 * box and grows away from that edge as the conversation gets longer, then scrolls. When nobody is
 * signed in, `signInPrompt` is shown instead of the chat.
 */
export function ChatBox(props: {
  corner: Corner
  open: boolean
  toast: ToastMessage | null
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

      {props.signInPrompt ?? (
        <>
          {props.messages.length > 0 && (
            <MessageList messages={props.messages} onRetry={props.onRetry} onCopy={props.onCopy} />
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
`hover:` applies while the pointer is over the element, `dark:` while Windows is in dark mode,
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

**How the layout mirrors for each corner.** The bubble can rest in any corner of the screen, and
the panel always opens toward the middle. The panel window shares its outer corner with the
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
  CSS properties, and plain numbers mean pixels. `chatX` is 76 (the 8 px padding around the
  bubble, the 56 px bubble and a 12 px gap), so the card starts just past the bubble. `chatY` is
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
- `{props.signInPrompt ?? (`: `??` uses the left side unless it's `null` or `undefined`. `Panel`
  passes a `SignInPanel` when nobody is signed in and `null` otherwise, so the card shows either
  the sign-in or the chat, never both.
- `<>`: a _fragment_. It groups several elements without adding an extra `<div>` to the page.
- `props.messages.length > 0 &&`: before the first message there's no list, so the card is just
  the text box.
- `{props.banner}`: whatever `Banner` `Panel` built (or `null`), between the conversation and the
  text box.
- `<Composer {...props} />`: `{...props}` passes every one of `ChatBox`'s props on to `Composer`
  unchanged.

### `Composer`

<!-- code: apps/desktop/src/renderer/src/components/ChatBox.tsx#Composer -->

[`src/renderer/src/components/ChatBox.tsx`, lines 87–179](../../apps/desktop/src/renderer/src/components/ChatBox.tsx#L87-L179)

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

      <textarea
        ref={textarea}
        value={props.draft}
        onChange={(event) => props.onDraftChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask Claude anything…"
        aria-label="Message Claude"
        spellCheck
        className={cn(
          'block max-h-40 min-h-11 w-full resize-none overflow-y-auto bg-transparent field-sizing-content',
          'px-3.5 pt-3 pb-1 text-sm leading-relaxed outline-none placeholder:text-zinc-400',
        )}
      />

      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <button
          type="button"
          onClick={props.onAttachLatest}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
        >
          <Paperclip size={14} aria-hidden />
          Attach latest screenshot
        </button>
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
- `onClick={props.onAttachLatest}`: `Panel.attachLatest` adds the newest screenshot to the
  draft, or shows a toast saying why it couldn't.
- `props.busy ? (`: while Claude is replying, Send is replaced by Stop. `Panel` sets `busy` when
  any message is still `streaming`.
- `fill="currentColor"`: lucide icons are outlines; this fills the square with the text colour so
  it reads as a solid "stop" symbol.
- `disabled={!props.canSend}`: `Panel` allows sending only when you're signed in, Claude isn't
  busy, and there's text or a screenshot. `disabled:opacity-40` fades the button out.

### `Banner`

<!-- code: apps/desktop/src/renderer/src/components/ChatBox.tsx#Banner -->

[`src/renderer/src/components/ChatBox.tsx`, lines 181–190](../../apps/desktop/src/renderer/src/components/ChatBox.tsx#L181-L190)

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

A one-line status strip between the conversation and the text box. `Panel` uses it in two cases:
"Checking your JumpCloud sign-in…" with a spinner while a saved sign-in is renewed at startup, and
the "couldn't reach JumpCloud" message with a Retry button (see [JumpCloud sign-in](3-sign-in.md)).

- `spinner?: boolean`: the `?` makes the prop optional. Writing `<Banner spinner>` with no value
  means `spinner={true}`.
- `children: ReactNode`: `children` is a special prop holding whatever is written between
  `<Banner>` and `</Banner>`. `ReactNode` is the type for anything React can display: text,
  elements, or `null`.
- `action?: ReactNode`: an optional element at the right-hand end, such as `Panel`'s Retry button.
- `animate-spin`: Tailwind's spinning animation, applied to lucide's `LoaderCircle` icon.
- `flex-1`: the text takes all the spare width, which pushes the action to the right.

## `src/renderer/src/components/MessageList.tsx`: the conversation

The scrolling list of messages at the top of the chat card. `ChatBox` renders it once there's at
least one message. Its props are `messages` (the chat from the app state, kept up to date by
`useAssistState`; see [The pages](7-renderer-pages.md)), and `onRetry` and `onCopy` from `Panel`.
Your messages and Claude's are drawn by different components.

### `MessageList`

<!-- code: apps/desktop/src/renderer/src/components/MessageList.tsx#STICK_THRESHOLD,MessageList -->

[`src/renderer/src/components/MessageList.tsx`, lines 8–53](../../apps/desktop/src/renderer/src/components/MessageList.tsx#L8-L53)

```tsx
/** Within this many pixels of the bottom counts as "at the bottom". */
const STICK_THRESHOLD = 40

/**
 * The conversation. It follows new text as it streams in, unless you've scrolled up to read
 * something earlier.
 */
export function MessageList(props: {
  messages: ChatMessage[]
  onRetry: () => void
  onCopy: (text: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
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
          <UserMessage key={message.id} message={message} />
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
scroll up to read something earlier it stops following; scrolling back to the bottom turns
following on again.

- `const stickToBottom = useRef(true)`: whether to follow new text. It's a ref rather than state
  because changing it doesn't need anything redrawn.
- `useLayoutEffect(() => {`: like `useEffect`, but it runs after React has changed the page and
  before the browser paints it. Scrolling there means you never see a frame with the new text
  hidden below the visible area.
- `}, [props.messages])`: runs whenever the list changes. `useAssistState` makes a new array for
  every update, including each batch of streamed text (at most one every 50 ms), so this runs as
  the reply grows.
- `el.scrollTop = el.scrollHeight`: scrolls to the bottom. The browser clamps the value to the
  furthest it can actually scroll.
- `onScroll={(event) => {`: on every scroll, works out how far the view is from the bottom
  (`scrollHeight - scrollTop - clientHeight`) and follows only if that's under `STICK_THRESHOLD`
  (40 px). The effect's own scrolling lands at 0, so following stays on. Nothing else resets the
  flag: if you've scrolled up and then send a message, the list stays where you are.
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

[`src/renderer/src/components/MessageList.tsx`, lines 55–72](../../apps/desktop/src/renderer/src/components/MessageList.tsx#L55-L72)

```tsx
function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="ml-auto flex max-w-[85%] flex-col items-end gap-1.5">
      {message.attachments.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {message.attachments.map((attachment) => (
            <SentScreenshot key={attachment.id} attachment={attachment} />
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

- `function UserMessage({ message }: { message: ChatMessage })`: the braces in the parameter list
  pull `message` straight out of the props object (_destructuring_).
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

[`src/renderer/src/components/MessageList.tsx`, lines 74–86](../../apps/desktop/src/renderer/src/components/MessageList.tsx#L74-L86)

```tsx
function SentScreenshot({ attachment }: { attachment: Attachment }) {
  const thumbnail = useThumbnail(attachment.path)
  return (
    <button
      type="button"
      title={attachment.fileName}
      onClick={() => void window.assist.screenshots.open(attachment.path)}
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
- `onClick={() => void window.assist.screenshots.open(attachment.path)}`: `window.assist` is the
  set of functions the preload script gives the page, its only way to reach the main process (see
  [Shared code and the preload bridge](1-shared-and-preload.md)). `open` returns a promise, and
  `void` marks that the code deliberately doesn't wait for it. Unlike a draft chip, which goes
  through `Panel.openAttachment`, a missing file here shows no toast.
- `alt=""`: the image is decorative; the button's `title` tooltip shows the file name.
- `object-cover`: fills the 80 × 48 px box, cropping the screenshot rather than squashing it.

### `AssistantMessage`

<!-- code: apps/desktop/src/renderer/src/components/MessageList.tsx#AssistantMessage -->

[`src/renderer/src/components/MessageList.tsx`, lines 88–136](../../apps/desktop/src/renderer/src/components/MessageList.tsx#L88-L136)

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

[`src/renderer/src/components/MessageList.tsx`, lines 138–153](../../apps/desktop/src/renderer/src/components/MessageList.tsx#L138-L153)

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
  your default browser. It accepts only `http` and `https` addresses (`WebUrl` in
  `src/main/ipc.ts`), so other links, such as `mailto:`, do nothing.

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

The small menu that opens beside the gear icon. `Panel` renders it only while the panel is open,
the gear has toggled it on, and the tenant's list of actions includes `settings`. Its props are
the `corner` and `offset` for positioning; the current `settings`, `branding` (app and company
name), `version` and signed-in `user` to display; and one callback per menu item. `Panel` closes
it on Esc, on a click anywhere else in the panel, and when the panel closes.

### `CONFIRM_MS`, `EFFORTS`

<!-- code: apps/desktop/src/renderer/src/components/SettingsMenu.tsx#CONFIRM_MS,EFFORTS -->

[`src/renderer/src/components/SettingsMenu.tsx`, lines 8–14](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L8-L14)

```tsx
const CONFIRM_MS = 3000

const EFFORTS: { value: Effort; label: string; hint: string }[] = [
  { value: 'low', label: 'Fast', hint: 'Quick answers' },
  { value: 'medium', label: 'Balanced', hint: 'Thinks a little longer' },
  { value: 'high', label: 'Thorough', hint: 'Thinks hardest; slower' },
]
```

<!-- /code -->

- `const CONFIRM_MS = 3000`: how long "New conversation" waits for its second click.
- `EFFORTS: { value: Effort; label: string; hint: string }[]`: the three response styles. Each
  maps an `Effort` value (what's sent to the Claude API) to the label on its button and a tooltip.
  Typing `value` as `Effort` means TypeScript rejects a misspelt value. The API side is
  `AnthropicBackend.reply` in [Talking to Claude](4-claude.md).

### `SettingsMenu`

<!-- code: apps/desktop/src/renderer/src/components/SettingsMenu.tsx#SettingsMenu -->

[`src/renderer/src/components/SettingsMenu.tsx`, lines 16–139](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L16-L139)

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
  onToggleAutoStart: () => void
  onSetEffort: (effort: Effort) => void
  onSignOut: () => void
  onOpenScreenshotsFolder: () => void
  onNewConversation: () => void
}) {
  // "New conversation" needs a second click within a few seconds.
  const [confirmingNew, setConfirmingNew] = useState(false)
  useEffect(() => {
    if (!confirmingNew) return
    const timer = setTimeout(() => setConfirmingNew(false), CONFIRM_MS)
    return () => clearTimeout(timer)
  }, [confirmingNew])

  const { settings, branding } = props

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

      <MenuItem icon={FolderOpen} onClick={props.onOpenScreenshotsFolder}>
        Open screenshots folder
      </MenuItem>

      <MenuItem
        icon={MessageSquarePlus}
        danger={confirmingNew}
        onClick={() => {
          if (!confirmingNew) return setConfirmingNew(true)
          setConfirmingNew(false)
          props.onNewConversation()
        }}
      >
        {confirmingNew ? 'Click again to clear the chat' : 'New conversation'}
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

      <div className="mt-1 border-t border-black/10 px-2.5 pt-1.5 pb-0.5 text-[11px] text-zinc-500 dark:border-white/10">
        {branding.appName} {props.version} · {branding.companyName}
      </div>
    </div>
  )
}
```

<!-- /code -->

Draws the menu's rows: Start with Windows, Response style, Open screenshots folder, New
conversation, who's signed in with Log out, and the version. It keeps one piece of its own state.

**State.** `useState(initial)` returns the current value and a function that changes it. Calling
that function makes React run the component again with the new value, which redraws it. Use a ref
for values that don't affect what's shown, and state for values that do. Here `confirmingNew`
switches the "New conversation" row into its "Click again" form.

- `offset: number`: `Panel` passes `actionOffset()` of the gear's place in the icon stack.
- `...anchored(props.corner, PANEL_LAYOUT.settingsX, props.offset)`: `settingsX` (64 px) puts the
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
- `const { settings, branding } = props`: shorthand for two props used often below.
- `disabled={!settings.autoStartAvailable}`: Start with Windows only works in the installed app,
  not in `npm run dev`; there the row is greyed out with a note. `onToggleAutoStart` asks the
  main process to flip it, and `Panel` keeps the settings it returns (see `settings.ts` in
  [Main process: startup, IPC and app plumbing](2-main-startup.md)).
- `<Switch on={settings.autoStart} />`: the on/off graphic at the end of the row.
- `aria-checked={settings.effort === option.value}`: the response styles work like radio buttons.
  The current one is white with a shadow; the others are plain text on the grey track.
- `onClick={() => props.onSetEffort(option.value)}`: `Panel.setEffort` saves the choice in the
  main process. `ChatSession` reads it at the start of each request, so it applies from the next
  message.
- `if (!confirmingNew) return setConfirmingNew(true)`: the first click on "New conversation" only
  arms it (the `return` just ends the function early). A second click within 3 seconds turns it
  off and calls `onNewConversation`, which clears the chat (`ChatSession.newConversation()`).
- `danger={confirmingNew}`: the row turns red while it's armed.
- `{props.user && (`: only when someone is signed in; `Panel` passes `null` otherwise.
- `props.user.name ?? props.user.email ?? 'you'`: the first of the name or the email that
  JumpCloud provided. `truncate` cuts a long one short with "…", and `title={props.user.email}`
  shows the email as a tooltip.
- `{branding.appName} {props.version} · {branding.companyName}`: the footer, for example
  "Desktop Assist 0.1.0 · Morse Micro".

### `MenuItem`

<!-- code: apps/desktop/src/renderer/src/components/SettingsMenu.tsx#MenuItem -->

[`src/renderer/src/components/SettingsMenu.tsx`, lines 141–162](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L141-L162)

```tsx
function MenuItem(props: {
  icon: LucideIcon
  danger?: boolean
  onClick: () => void
  children: ReactNode
}) {
  const Icon = props.icon
  return (
    <button
      type="button"
      role="menuitem"
      onClick={props.onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm',
        props.danger ? 'bg-red-600 text-white' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800',
      )}
    >
      <Icon size={16} aria-hidden />
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
- `props.danger ? 'bg-red-600 text-white'`: the red version, used for the armed "New
  conversation".

### `Switch`

<!-- code: apps/desktop/src/renderer/src/components/SettingsMenu.tsx#Switch -->

[`src/renderer/src/components/SettingsMenu.tsx`, lines 164–181](../../apps/desktop/src/renderer/src/components/SettingsMenu.tsx#L164-L181)

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

The column of round icon buttons that pops out of the bubble when the panel opens: screenshot,
settings, bounce and close, in the order the tenant's `tenant.json` lists them, nearest the bubble
first. `Panel` always renders it; while closed it's simply invisible. Its props are the `corner`,
the tenant's `actions`, `open`, `activeId` (`settings` while the settings menu is open, otherwise
`null`) and `onAction`, which is `Panel.runAction`.

### `ICONS`

<!-- code: apps/desktop/src/renderer/src/components/ActionStack.tsx#ICONS -->

[`src/renderer/src/components/ActionStack.tsx`, lines 7–12](../../apps/desktop/src/renderer/src/components/ActionStack.tsx#L7-L12)

```tsx
const ICONS: Record<ActionId, LucideIcon> = {
  screenshot: Camera,
  settings: Settings,
  bounce: Volleyball,
  close: Power,
}
```

<!-- /code -->

Which lucide icon each action shows.

- `Record<ActionId, LucideIcon>`: an object with exactly one entry for every action id. If a new
  id is added to `ACTION_IDS` in `src/shared/actions.ts` without an icon here, TypeScript reports
  an error.

### `ActionStack`

<!-- code: apps/desktop/src/renderer/src/components/ActionStack.tsx#ActionStack -->

[`src/renderer/src/components/ActionStack.tsx`, lines 14–75](../../apps/desktop/src/renderer/src/components/ActionStack.tsx#L14-L75)

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
        const Icon = ICONS[id]
        const { label } = ACTIONS[id]
        const active = id === props.activeId
        return (
          <button
            key={id}
            data-hit
            data-action={id}
            type="button"
            title={label}
            aria-label={label}
            aria-expanded={ACTIONS[id].kind === 'popover' ? active : undefined}
            onClick={() => props.onAction(id)}
            style={{
              width: UI.actionSize,
              height: UI.actionSize,
              // Pop out one after another, nearest the bubble first.
              transitionDelay: props.open ? `${index * 30}ms` : '0ms',
            }}
            className={cn(
              'grid place-items-center rounded-full border shadow-md outline-none',
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
- `...anchored(props.corner, PANEL_LAYOUT.actionsX, PANEL_LAYOUT.actionsY)`: `actionsX` (16 px)
  centres the 40 px icons on the 56 px bubble. `actionsY` (76 px) starts the stack 12 px past the
  bubble.
- `gap: UI.actionGap`: 8 px between icons. The main process sizes the panel window from the same
  numbers (`panelWindowSize` in `src/shared/geometry.ts`), so the stack always fits.
- `const { label } = ACTIONS[id]`: the tooltip and screen-reader name, from the action registry.
- `data-hit`: on each button, not on the column, so the gaps between icons stay click-through.
- `data-action={id}`: `Panel.closeSettingsOnOutsideClick` looks for `[data-action="settings"]`,
  so clicking the gear toggles the menu instead of counting as a click outside it.
- `aria-expanded={ACTIONS[id].kind === 'popover' ? active : undefined}`: for a popover action
  (only Settings) it tells screen readers whether its menu is open. `undefined` leaves the
  attribute off the others.
- `onClick={() => props.onAction(id)}`: `Panel.runAction` toggles the menu for Settings, and asks
  the main process to run any other action (see `src/main/actions.ts` in
  [Main process: startup, IPC and app plumbing](2-main-startup.md)).
- ``transitionDelay: props.open ? `${index * 30}ms` : '0ms'``: each icon starts its animation 30
  ms after the one before, so they pop out one after another. Closing has no delay, so they all go
  together.
- `top ? '-translate-y-3' : 'translate-y-3'`: while closed, each icon sits 12 px toward the bubble,
  and `'scale-75 opacity-0'` shrinks it to 75% and hides it. The `group-data-open:` classes
  (explained under `ChatBox`) move it to its place at full size when the panel opens.
- `outline-none`: together with `'focus-visible:ring-2 focus-visible:ring-accent'`, swaps the
  usual square focus outline for an accent ring that follows the round button.
- `active`: the active action (the gear while its menu is open) is filled with the accent colour.
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
