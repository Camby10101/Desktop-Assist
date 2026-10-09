# Claude Desktop: handing questions over

[← Code Guide](CODE_GUIDE.md)

Since feature 3.1, a tenant can send questions to the **Claude Desktop** app instead of the chat
built into the panel (`"chatApp": "claude-desktop"` in `tenant.json`; Morse Micro does). The
point is whose Claude it is. Each person asks in their own Claude account, on the company's
Claude plan, so every question counts against their own usage limit, which the company already
manages in claude.ai, and the conversation carries on in Claude Desktop. Desktop Assist then has
no sign-in of its own and sends nothing to Anthropic itself: there's no JumpCloud app, no Claude
Console service account, and no usage billed to the company's Console account.

What Desktop Assist does is small. It opens a new chat in Claude Desktop with the question already
typed in, and then, unless the user has turned **Send in Claude automatically** off, presses the
keys that send it. That's in two main-process files, covered below: `src/main/claudeDesktop.ts`
(the hand-over) and `src/main/sendInClaude.ts` (the key presses). The other pieces are on other
pages: `start()` in `index.ts` creates the `ClaudeDesktop` and wires in the Electron parts, and
`registerIpc()` in `ipc.ts` answers the panel (both in
[Main process: startup, IPC and app plumbing](2-main-startup.md)); the setting is in
`settings.ts` (same page); the panel's side is `askInClaudeDesktop` in `PanelView.tsx`
([The pages](7-renderer-pages.md)); and several screenshots are combined into one by
`ScreenshotService.forClipboard()`
([The draft, screenshots and safe files](6-drafts-and-screenshots.md)).

**Asking a question**

1. The user types a question, perhaps attaches screenshots, and presses Enter or **Ask in
   Claude**. `Panel.askInClaudeDesktop()` calls `window.assist.claudeDesktop.ask(text)`, which
   sends IPC `assist:claude-desktop-ask`.
2. The handler in `ipc.ts` calls `ClaudeDesktop.ask()` with the text and the draft's attached
   screenshots.
3. `ask()` checks that there's something to ask, that the text fits in a link (12,000 characters
   at most), and that Claude Desktop is installed.
4. If screenshots are attached, it copies them to the clipboard first, as one image.
5. It opens the link `claude://claude.ai/new?q=<the question>`. Windows hands it to Claude Desktop,
   which comes to the front with a new chat and the question typed in, but not sent.
6. `ask()` returns straight away, and `ipc.ts` closes the panel and empties the draft. The rest
   carries on in the background (`ClaudeDesktop.finish()`).
7. With **Send in Claude automatically** on and a question typed, `sendInClaude()` runs a hidden
   PowerShell helper. It waits until Claude's focused text box holds exactly the question, presses
   Ctrl+V if there's a screenshot, then Enter, and Claude answers. If it can't, a Windows
   notification says what's left to do (paste, press Enter, or check the question). Clicking a
   notification opens the panel, as the bubble would.
8. With the setting off, or for a screenshot without a question, nothing is pressed. If
   screenshots were copied, a notification says to press Ctrl+V in Claude; the user then sends the
   question there.

```text
 Desktop Assist ── claude://claude.ai/new?q=<question> ──▶ Claude Desktop: new chat with the
                ── screenshots → clipboard (one image)      question typed in
                ── once Claude's box shows the question:
                   Ctrl+V (screenshot), then Enter ───────▶ sent; Claude answers
                ── otherwise a notification: "press Ctrl+V" or "press Enter"
```

**Why press keys at all?** Claude Desktop's link only fills the question in; Anthropic documents
no way for a link to send it. The user wanted it sent for them, so the helper presses the keys a
person would. Pressing keys into whatever window is in front would be dangerous, though: a
different app could have come to the front, or the same Claude Desktop window could be showing
another Claude text box (it can also hold a Claude Code session). So before every key press the
helper asks Windows which element has the keyboard focus, and only goes ahead when that element
belongs to Claude Desktop **and** holds exactly the question, nothing more. A screenshot on its
own is never sent, because there would be no question to recognise the right box by.

**Why exactly the question?** If the new chat's box already had something typed in it (a draft
the user left unsent), Claude Desktop adds the linked question to that text rather than replacing
it. Pressing Enter would then send the old draft too. So when the box holds the question _and_
other text, the helper presses nothing (`extra-text`), and a notification asks the user to check
the question in Claude and send it themselves.

**Is Claude Desktop installed?** When it's installed, Claude Desktop registers itself with Windows
as the app that opens `claude://` links. Electron's `app.getApplicationNameForProtocol()` asks
Windows for that app's name, and an empty answer means nothing is registered. The panel asks each
time it opens (IPC `assist:claude-desktop-installed`) and, if the answer is no, shows a banner
with a Download button. `ask()` checks again before doing anything.

---

## `src/main/claudeDesktop.ts`: opening a question in Claude Desktop

There's no Electron in this file. Everything that touches Windows (the protocol lookup, opening
the link, the clipboard, the setting, sending in Claude, the notification) comes in through
`ClaudeDesktopDeps`, which `start()` fills in. That's what lets `tests/claudeDesktop.test.ts`
check the whole flow with fakes.

### `NEW_CHAT_LINK` and `MAX_PROMPT_LENGTH`

<!-- code: apps/desktop/src/main/claudeDesktop.ts#NEW_CHAT_LINK,MAX_PROMPT_LENGTH -->

[`src/main/claudeDesktop.ts`, lines 4–8](../../apps/desktop/src/main/claudeDesktop.ts#L4-L8)

```ts
/** Claude Desktop's documented link for a new chat. A `q` fills in the prompt; it isn't sent. */
export const NEW_CHAT_LINK = 'claude://claude.ai/new'

/** Claude Desktop cuts a `q` prompt off at about 14,000 characters, so stay under that. */
export const MAX_PROMPT_LENGTH = 12_000
```

<!-- /code -->

- `'claude://claude.ai/new'`: Claude Desktop's documented link for a new chat (see Anthropic's
  [Open Claude Desktop with a link](https://support.claude.com/en/articles/14729294-open-claude-desktop-with-a-link)).
  `claude://` is a _URL scheme_ of its own: just as Windows opens `mailto:` links in the email
  app, it opens `claude://` links in the app registered for them, Claude Desktop.
- `q`: adding `?q=...` puts text in the new chat's message box, but doesn't send it. A link can't
  send a message on anyone's behalf; that's what `sendInClaude.ts` is for.
- `MAX_PROMPT_LENGTH = 12_000`: Claude Desktop cuts a `q` off at about 14,000 characters, so a
  longer question would arrive with its end missing and no warning. 12,000 leaves a margin.
  Anything longer is refused (`too-long`), and the panel suggests shortening it or pasting it into
  Claude directly. The text box itself takes far more (`MAX_NOTE_LENGTH`, 200,000 characters).

### `newChatLink()`

<!-- code: apps/desktop/src/main/claudeDesktop.ts#newChatLink -->

[`src/main/claudeDesktop.ts`, lines 10–15](../../apps/desktop/src/main/claudeDesktop.ts#L10-L15)

```ts
/** The link that opens a new Claude Desktop chat with `text` typed in, ready to send. */
export function newChatLink(text: string): string {
  // encodeURIComponent rather than URLSearchParams, which writes spaces as "+": a reader that
  // decodes with decodeURIComponent would show those as plus signs.
  return text.trim() ? `${NEW_CHAT_LINK}?q=${encodeURIComponent(text)}` : NEW_CHAT_LINK
}
```

<!-- /code -->

Builds the link for a question.

- `encodeURIComponent(text)`: turns every character that means something in a link into `%`
  followed by its code. A space becomes `%20`, `&` becomes `%26`, `#` becomes `%23`, a line break
  becomes `%0A`, and anything beyond plain ASCII (accents, emoji, other scripts) becomes its UTF-8
  bytes. So the whole question arrives as the value of `q`: a `&` in it can't start another
  parameter, and a `#` can't cut off the rest.
- `// encodeURIComponent rather than URLSearchParams`: `URLSearchParams` is the usual way to build a
  query string, but it follows the rules for web forms, which write a space as `+`. A reader that
  decodes with `decodeURIComponent` (which leaves `+` alone) would then show every space as a plus
  sign. `encodeURIComponent` writes spaces as `%20`, which every reader turns back into a space, and
  a real `+` as `%2B`.
- `text.trim() ? ... : NEW_CHAT_LINK`: a question that's only screenshots (or only spaces) opens
  an empty new chat, ready for the paste. Otherwise the text goes in exactly as typed, untrimmed.

### `pasteHint()`, `sendHint()` and `extraTextHint()`

<!-- code: apps/desktop/src/main/claudeDesktop.ts#pasteHint,sendHint,extraTextHint -->

[`src/main/claudeDesktop.ts`, lines 17–40](../../apps/desktop/src/main/claudeDesktop.ts#L17-L40)

```ts
/** What to tell the user when their screenshots are on the clipboard, still to be pasted. */
export function pasteHint(count: number): { title: string; body: string } {
  return {
    title: count === 1 ? 'Screenshot copied' : `${count} screenshots copied as one image`,
    body: 'In Claude, press Ctrl+V to add it to your message, then send.',
  }
}

/** What to tell the user when their question is in Claude but wasn't sent for them. */
export function sendHint(): { title: string; body: string } {
  return { title: 'Your question is in Claude', body: 'Press Enter in Claude to send it.' }
}

/** What to tell the user when Claude's text box already had something else in it. */
export function extraTextHint(screenshots: number): { title: string; body: string } {
  return {
    title: 'Check your question in Claude',
    body:
      "Claude's message box already had text in it, so it wasn't sent." +
      (screenshots > 0
        ? ' Press Ctrl+V to add the screenshot, then send.'
        : ' Send it when ready.'),
  }
}
```

<!-- /code -->

The three Windows notifications, for when there's something left for the user to do in Claude.
The panel can't say it, because it closes as Claude Desktop opens. `finish()` (below) picks one.

- `pasteHint`: the screenshots are on the clipboard but haven't been pasted, so the user pastes
  them and sends. The title says how many, and that several became one image, so pasting a single
  image isn't a surprise.
- `sendHint`: the question (and the screenshot, if any) is already in Claude's message box, and
  only Enter is left.
- `extraTextHint`: Claude's box already had other text in it, so nothing was sent. The user
  should check the question and send it when ready, pasting the screenshot first if there is one
  (nothing was pressed, so it's still on the clipboard).

### `AskOutcome` and `ClaudeDesktopDeps`

<!-- code: apps/desktop/src/main/claudeDesktop.ts#AskOutcome,ClaudeDesktopDeps -->

[`src/main/claudeDesktop.ts`, lines 42–60](../../apps/desktop/src/main/claudeDesktop.ts#L42-L60)

```ts
export type AskOutcome = { ok: true; screenshots: number } | Extract<AskResult, { ok: false }>

export interface ClaudeDesktopDeps {
  /** Whether anything on this PC opens claude:// links (Claude Desktop registers them). */
  isInstalled(): boolean
  openLink(url: string): Promise<void>
  /** Puts the screenshots on the clipboard as one image. False if one of them is missing. */
  copyScreenshots(paths: string[]): Promise<boolean>
  /** Whether to send the question in Claude for the user (the "Send in Claude" setting). */
  autoSend(): boolean
  /**
   * Once Claude's text box shows the question: presses Ctrl+V when `paste` is set, then Enter.
   * Presses nothing anywhere else (see sendInClaude.ts).
   */
  sendInClaude(question: string, paste: boolean): Promise<SendOutcome>
  /** A Windows notification, e.g. to say the screenshot is ready to paste. */
  notify(message: { title: string; body: string }): void
  onError?(error: unknown): void
}
```

<!-- /code -->

`AskOutcome` is what `ask()` returns. A success carries the number of screenshots copied. A
failure is exactly the failure half of `AskResult` (from `src/shared/types.ts`; `Extract` picks it
out), so `ipc.ts` can pass it straight to the panel. The success has no `notes`: emptying the
draft is `ipc.ts`'s job, once it knows Claude Desktop has opened.

`ClaudeDesktopDeps` is everything that touches Windows. `start()` in `index.ts` passes:

- `isInstalled()`: `app.getApplicationNameForProtocol(NEW_CHAT_LINK) !== ''`, whether any app is
  registered for `claude://` links.
- `openLink(url)`: `shell.openExternal(url)`. Its promise rejects if Windows can't open the link.
- `copyScreenshots(paths)`: `ScreenshotService.forClipboard()`, then Electron's clipboard. It
  returns `false` if a screenshot is missing, and throws if the clipboard can't be written.
- `autoSend()`: the user's **Send in Claude automatically** setting, read for each question, so
  a change in the settings menu applies to the next one.
- `sendInClaude(question, paste)`: [`sendInClaude()`](#sendinclaude) below, wrapped so that any
  outcome but `sent` is written to the log.
- `notify(message)`: a Windows notification, if Windows can show one. Clicking it opens the panel
  (the notification appears over the bubble's usual corner).
- `onError?(error)`: writes a failure to the problem log. The `?` makes it optional.

### `ClaudeDesktop`

<!-- code: apps/desktop/src/main/claudeDesktop.ts#ClaudeDesktop.class -->

[`src/main/claudeDesktop.ts`, lines 62–68](../../apps/desktop/src/main/claudeDesktop.ts#L62-L68)

```ts
/**
 * Hands questions over to the Claude Desktop app, so they're answered with the person's own Claude
 * account and count against their own usage limit. A link can carry text but not images, so the
 * screenshots go on the clipboard. A link only fills the question in; with "Send in Claude" on,
 * Desktop Assist then presses Ctrl+V and Enter in Claude for the user.
 */
export class ClaudeDesktop {
  // …
}
```

<!-- /code -->

The class the rest of the app uses. `start()` creates the one instance, only when the tenant's
`chatApp` is `claude-desktop`, and `registerClaudeDesktop()` in `ipc.ts` calls `isInstalled()`
and `ask()`.

### `ClaudeDesktop` fields, constructor and `isInstalled()`

<!-- code: apps/desktop/src/main/claudeDesktop.ts#ClaudeDesktop.finishing,constructor,isInstalled -->

[`src/main/claudeDesktop.ts`, lines 69–76](../../apps/desktop/src/main/claudeDesktop.ts#L69-L76)

```ts
private finishing: Promise<void> = Promise.resolve()

constructor(private readonly deps: ClaudeDesktopDeps) {}

/** Checked each time the panel opens, so the panel can say so before anything is typed. */
isInstalled(): boolean {
  return this.deps.isInstalled()
}
```

<!-- /code -->

- `private finishing: Promise<void> = Promise.resolve()`: the background work for the last
  question (see `finish()` below). It starts out as a promise that has already resolved, so
  `idle()` has something to return before any question is asked.
- `constructor(private readonly deps: ClaudeDesktopDeps) {}`: the constructor shorthand also used
  by `NotesStore`: `private readonly` makes the parameter a field, `this.deps`, so the body is
  empty.
- `isInstalled()`: just asks the dependency. The panel calls it through IPC each time it opens, so
  it can warn before anything is typed.

### `ClaudeDesktop.ask()`

<!-- code: apps/desktop/src/main/claudeDesktop.ts#ClaudeDesktop.ask -->

[`src/main/claudeDesktop.ts`, lines 78–100](../../apps/desktop/src/main/claudeDesktop.ts#L78-L100)

```ts
/**
 * Opens a new Claude Desktop chat with `text` filled in, with the screenshots ready to paste.
 * Returns once Claude is opening; sending it there (or saying what's left to do) carries on in
 * the background, see idle().
 */
async ask(text: string, attachments: Attachment[]): Promise<AskOutcome> {
  if (!text.trim() && attachments.length === 0) return { ok: false, reason: 'empty' }
  if (text.length > MAX_PROMPT_LENGTH) return { ok: false, reason: 'too-long' }
  if (!this.deps.isInstalled()) return { ok: false, reason: 'not-installed' }
  try {
    // Copied first, so the screenshot is ready by the time Claude opens.
    const paths = attachments.map((attachment) => attachment.path)
    if (paths.length > 0 && !(await this.deps.copyScreenshots(paths))) {
      return { ok: false, reason: 'missing-screenshot' }
    }
    await this.deps.openLink(newChatLink(text))
  } catch (error) {
    this.deps.onError?.(error)
    return { ok: false, reason: 'failed' }
  }
  this.finishing = this.finish(text, attachments.length)
  return { ok: true, screenshots: attachments.length }
}
```

<!-- /code -->

Hands one question over. The checks come first, and neither the clipboard nor Claude Desktop is
touched until they've all passed.

- `if (!text.trim() && attachments.length === 0)`: nothing to ask. The panel's Ask button is
  disabled then, so this is a second guard.
- `text.length > MAX_PROMPT_LENGTH`: too long for a link, so it's refused rather than cut short.
- `!this.deps.isInstalled()`: checked here as well as when the panel opened, because Claude
  Desktop may have been uninstalled since. A missing app gets a clear message instead of whatever
  Windows does with a link nothing can open.
- `try {`: copying and opening are the two steps that can fail for reasons outside the app (the
  clipboard held by another program, Windows refusing the link). Either one becomes `failed`, and
  the error goes to `onError` for the log. `onError?.(error)` calls it only if it was given.
- `// Copied first, so the screenshot is ready by the time Claude opens.`: Claude Desktop comes to
  the front as soon as the link opens, and the screenshot may be pasted straight away (by the
  helper or by the user). Copying first also means a missing screenshot stops everything before
  Claude Desktop opens: the user removes it and asks again.
- `paths.length > 0 && !(await this.deps.copyScreenshots(paths))`: only when there are
  screenshots. `false` means one has gone missing (`missing-screenshot`). Copying replaces
  whatever was on the clipboard before.
- `await this.deps.openLink(newChatLink(text))`: opens the new chat with the question in it.
- `this.finishing = this.finish(text, attachments.length)`: starts the rest (sending, or telling
  the user what to do) without waiting for it. Sending can take several seconds while Claude
  opens, and the panel shouldn't hang on that. Keeping the promise lets `idle()` wait for it.
- `return { ok: true, screenshots: attachments.length }`: `ipc.ts` then closes the panel and
  empties the draft, while `finish()` carries on.

### `ClaudeDesktop.idle()`

<!-- code: apps/desktop/src/main/claudeDesktop.ts#ClaudeDesktop.idle -->

[`src/main/claudeDesktop.ts`, lines 102–105](../../apps/desktop/src/main/claudeDesktop.ts#L102-L105)

```ts
/** Resolves when the last question has been sent in Claude, or the user told what to do. */
idle(): Promise<void> {
  return this.finishing
}
```

<!-- /code -->

A promise that resolves once the last question's background work is done: sent in Claude, or the
user told what's left. The app itself never waits for it. Like `ChatSession.idle()`, it's there
for the tests, which `await claude.idle()` before checking what happened.

### `ClaudeDesktop.finish()`

<!-- code: apps/desktop/src/main/claudeDesktop.ts#ClaudeDesktop.finish -->

[`src/main/claudeDesktop.ts`, lines 107–130](../../apps/desktop/src/main/claudeDesktop.ts#L107-L130)

```ts
/**
 * Sends the question in Claude if the setting is on, and otherwise (or if it couldn't) tells
 * the user what's left: pasting the screenshot, or pressing Enter. A screenshot on its own is
 * never sent for them: with no question to look for in Claude's text box, there's no telling it
 * apart from another Claude box.
 */
private async finish(text: string, screenshots: number): Promise<void> {
  if (!this.deps.autoSend() || !text.trim()) {
    if (screenshots > 0) this.deps.notify(pasteHint(screenshots))
    return
  }
  const outcome = await this.deps
    .sendInClaude(text, screenshots > 0)
    .catch((error: unknown): SendOutcome => {
      this.deps.onError?.(error)
      return 'failed'
    })
  if (outcome === 'sent') return
  if (outcome === 'extra-text') return this.deps.notify(extraTextHint(screenshots))
  // Nothing was pressed: the screenshot (if any) still needs pasting. Otherwise it was pasted
  // and only Enter is left.
  const pasted = outcome === 'focus-lost' || outcome === 'not-sent'
  this.deps.notify(screenshots > 0 && !pasted ? pasteHint(screenshots) : sendHint())
}
```

<!-- /code -->

What happens after Claude Desktop has opened with the question. A problem with sending never
reaches the panel (which has closed by now); it turns into a notification instead.

- `if (!this.deps.autoSend() || !text.trim())`: nothing is pressed when the user has turned
  **Send in Claude automatically** off, or when there's no question, only screenshots. As the
  comment explains, a screenshot alone can't be sent safely: the helper recognises Claude's box
  by the question in it, and an empty box looks like any other.
- `if (screenshots > 0) this.deps.notify(pasteHint(screenshots))`: in that case, a notification
  only if there's something to paste. A text-only question is already in Claude's box, where the
  user can see it and press Enter.
- `this.deps.sendInClaude(text, screenshots > 0)`: sends it, pasting first when there are
  screenshots. The promise resolves with how it went.
- `.catch((error: unknown): SendOutcome => {`: if the helper couldn't run at all (PowerShell
  missing or blocked, the script failing), the error is logged and treated as `failed`, so the
  user still gets told what to do.
- `if (outcome === 'sent') return`: the question went and Claude is answering; nothing to say.
- `if (outcome === 'extra-text') return this.deps.notify(extraTextHint(screenshots))`: Claude's
  box held other text as well, so nothing was pressed; the user checks the question and sends it.
- `const pasted = outcome === 'focus-lost' || outcome === 'not-sent'`: these two come after the
  screenshot, if there was one, has been pasted, so only Enter is left. `not-ready` means nothing
  was pressed, and `failed` is treated the same.
- `screenshots > 0 && !pasted ? pasteHint(screenshots) : sendHint()`: the notification that
  matches what's left:
  - nothing pressed and there are screenshots: paste them, then send (`pasteHint`);
  - nothing pressed and no screenshots: press Enter (`sendHint`);
  - pasted but not sent: press Enter (`sendHint`).

## `src/main/sendInClaude.ts`: pressing Ctrl+V and Enter in Claude

Sends the question once Claude Desktop shows it, by pressing the keys a person would. Node.js
can't press keys in another app or see inside its window, but Windows PowerShell, which comes with
Windows, can load the .NET parts of Windows that do both. So this file builds a short PowerShell
script, runs it hidden, and reads back one word saying how it went.

Two parts of Windows do the work:

- **UI Automation** is Windows' accessibility interface, the one screen readers use to find out
  what's on screen. Through it, any program can ask which element (button, text box) has the
  keyboard focus, which process it belongs to, and what text it holds. That's how the script
  makes sure it's looking at Claude Desktop's message box with the question in it.
- **SendKeys** (from Windows Forms) types keys into whichever window has the focus, as if they
  came from the keyboard.

### `SendOutcome` and `SendOptions`

<!-- code: apps/desktop/src/main/sendInClaude.ts#SendOutcome,SendOptions -->

[`src/main/sendInClaude.ts`, lines 5–28](../../apps/desktop/src/main/sendInClaude.ts#L5-L28)

```ts
/**
 * How sending the question in Claude Desktop went.
 * - `sent`: the question left Claude's text box after Enter.
 * - `not-ready`: Claude's focused text box never showed the question (Claude didn't come to the
 *   front, or the focus is somewhere else), so nothing was pressed.
 * - `extra-text`: Claude's text box holds the question and something else (Claude adds a linked
 *   question to an unsent draft), so nothing was pressed: the user should check it first.
 * - `focus-lost`: the screenshot was pasted, but then the focus moved away, so Enter wasn't pressed.
 * - `not-sent`: Enter was pressed but the question stayed in the text box.
 * - `failed`: the helper couldn't run.
 */
export type SendOutcome = 'sent' | 'not-ready' | 'extra-text' | 'focus-lost' | 'not-sent' | 'failed'

export interface SendOptions {
  question: string
  /** Press Ctrl+V first, to add the screenshot that was copied to the clipboard. */
  paste: boolean
  /** The process whose text box must hold the question. Tests use another app. */
  processName?: string
  /** How long to wait for Claude to show the question, in ms. */
  readyTimeoutMs?: number
  /** After pasting, how long Claude gets to take the screenshot in before Enter, in ms. */
  pasteSettleMs?: number
}
```

<!-- /code -->

`SendOutcome` is the word the script ends with (the comment explains each). `failed` is never
printed by the script itself: it's what anything else (an error, no output) comes to.
`extra-text` is the "why exactly the question?" case from the top of this page.

- `question: string`: the question as typed. The script gets only its start
  ([`questionKey()`](#questionkey)) and a fingerprint of the whole of it
  ([`questionHash()`](#questionhash)), never the question itself.
- `paste: boolean`: whether to press Ctrl+V before Enter. `ClaudeDesktop.finish()` sets it when
  screenshots were copied.
- `processName?: string`: the program whose text box must hold the question: `claude`, Claude
  Desktop's process, unless a test names another.
- `readyTimeoutMs?`, `pasteSettleMs?`: the two waits below, which tests can shorten.

### `READY_TIMEOUT_MS` and `PASTE_SETTLE_MS`

<!-- code: apps/desktop/src/main/sendInClaude.ts#READY_TIMEOUT_MS,PASTE_SETTLE_MS -->

[`src/main/sendInClaude.ts`, lines 30–31](../../apps/desktop/src/main/sendInClaude.ts#L30-L31)

```ts
export const READY_TIMEOUT_MS = 20_000

export const PASTE_SETTLE_MS = 2_500
```

<!-- /code -->

- `READY_TIMEOUT_MS = 20_000`: how long to wait for Claude to show the question: 20 seconds, to
  allow for Claude Desktop starting up if it wasn't already running. If it hasn't by then,
  nothing is pressed (`not-ready`).
- `PASTE_SETTLE_MS = 2_500`: after Ctrl+V, Claude needs a moment to take the image in. Pressing
  Enter too soon could send the question without it.

### `WHITESPACE` and `normalizeQuestion()`

<!-- code: apps/desktop/src/main/sendInClaude.ts#WHITESPACE,normalizeQuestion -->

[`src/main/sendInClaude.ts`, lines 33–46](../../apps/desktop/src/main/sendInClaude.ts#L33-L46)

```ts
/**
 * Whitespace as the PowerShell side sees it too (spelled out, because JavaScript's `\s` and
 * .NET's differ on a couple of rare characters).
 */
const WHITESPACE =
  '[\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]+'

/**
 * The question as it's compared with Claude's text box: every run of whitespace made one space
 * and the ends trimmed (Claude's editor may show line breaks differently from the text box here).
 */
export function normalizeQuestion(question: string): string {
  return question.replace(new RegExp(WHITESPACE, 'g'), ' ').trim()
}
```

<!-- /code -->

The question in the form it's compared with Claude's text box. The script reads the box's text,
evens it out the same way, and compares the two, so both sides must agree exactly on what counts
as whitespace.

- `WHITESPACE`: a _character class_ (`[...]`, "any one of these") listing every whitespace
  character by its code: tab, line breaks, the ordinary space, non-breaking spaces and other
  Unicode spaces. `+` means "one or more in a row". As the comment says, it's spelled out because
  JavaScript's shorthand `\s` and .NET's (which PowerShell uses) disagree on a few rare
  characters; written out, the same text means the same thing to both.
- `'[\\t\\n...'`: the backslashes are doubled because this is a JavaScript string: the string
  itself holds `\t`, `\u00a0` and so on, which is what both regular-expression engines expect.
  The same text is pasted into the PowerShell script.
- `question.replace(new RegExp(WHITESPACE, 'g'), ' ').trim()`: every run of whitespace becomes one
  space (`'g'` means every match, not just the first), and the ends are trimmed. Claude's editor
  may show line breaks differently from the text box here, and this makes that not matter.

### `questionKey()`

<!-- code: apps/desktop/src/main/sendInClaude.ts#questionKey -->

[`src/main/sendInClaude.ts`, lines 48–51](../../apps/desktop/src/main/sendInClaude.ts#L48-L51)

```ts
/** How to recognise the question in Claude's text box: its start, whitespace evened out. */
export function questionKey(question: string): string {
  return normalizeQuestion(question).slice(0, 60)
}
```

<!-- /code -->

How the script spots the question in Claude's text box: the first 60 characters of the evened-out
question, plenty to tell it from anything else in a text box. The script only looks closer (with
the hash below) at a box that contains this.

### `questionHash()`

<!-- code: apps/desktop/src/main/sendInClaude.ts#questionHash -->

[`src/main/sendInClaude.ts`, lines 53–59](../../apps/desktop/src/main/sendInClaude.ts#L53-L59)

```ts
/**
 * A fingerprint of the whole question, so the helper can tell the text box holds exactly the
 * question (and nothing else) without the question itself going on its command line.
 */
export function questionHash(question: string): string {
  return createHash('sha256').update(normalizeQuestion(question), 'utf8').digest('hex')
}
```

<!-- /code -->

A _fingerprint_ of the whole evened-out question: SHA-256, a hash function that turns any text
into 64 hexadecimal characters. The same text always gives the same hash, and any change, even one
extra character, gives a completely different one. The script hashes the text it finds in
Claude's box and compares: equal means the box holds exactly the question.

- Why not pass the whole question and compare the text? As the comment says, so the question
  itself never goes on PowerShell's command line, where other programs on the PC can see the
  command lines of running processes. The hash can't be turned back into the question.
- `createHash('sha256').update(..., 'utf8').digest('hex')`: Node's built-in hashing: hash the text
  as UTF-8 bytes and write the result in hexadecimal. The script does the same with .NET's
  `SHA256` class.

### `sendScript()`

<!-- code: apps/desktop/src/main/sendInClaude.ts#sendScript -->

[`src/main/sendInClaude.ts`, lines 61–132](../../apps/desktop/src/main/sendInClaude.ts#L61-L132)

```ts
/**
 * The PowerShell that presses the keys. It uses Windows UI Automation to find the focused text
 * box, and only presses anything while that box belongs to Claude Desktop and already contains the
 * question; so a key never lands in another app, or in another Claude box (such as a Claude Code
 * session in the same window). The question goes in base64, never as PowerShell code.
 */
export function sendScript(options: SendOptions): string {
  const key = Buffer.from(questionKey(options.question), 'utf8').toString('base64')
  const hash = questionHash(options.question)
  const processName = options.processName ?? 'claude'
  if (!/^[\w.-]+$/.test(processName)) throw new Error('Unexpected process name')
  const timeout = Math.round(options.readyTimeoutMs ?? READY_TIMEOUT_MS)
  const settle = Math.round(options.pasteSettleMs ?? PASTE_SETTLE_MS)
  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
$key = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${key}'))
$hash = '${hash}'
$processName = '${processName}'
$sha = [Security.Cryptography.SHA256]::Create()

# What Claude Desktop's focused text box holds: 'exact' (just the question), 'extra' (the question
# and other text), or $null (not Claude's box, or no question in it).
function BoxState {
  try {
    $el = [System.Windows.Automation.AutomationElement]::FocusedElement
    if (-not $el) { return $null }
    if ((Get-Process -Id $el.Current.ProcessId).ProcessName -ne $processName) { return $null }
    $pattern = $null
    $text = ''
    if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
      $text = $pattern.Current.Value
    }
    if (-not $text -and $el.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pattern)) {
      $text = $pattern.DocumentRange.GetText(20000)
    }
    $text = ([string]$text -replace '${WHITESPACE}', ' ').Trim()
    if (-not $text.Contains($key)) { return $null }
    $digest = -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)) | ForEach-Object { $_.ToString('x2') })
    if ($digest -eq $hash) { return 'exact' }
    return 'extra'
  } catch {}
  return $null
}
function QuestionBox { (BoxState) -eq 'exact' }

function WaitFor([int]$ms, [scriptblock]$test) {
  $end = (Get-Date).AddMilliseconds($ms)
  do {
    if (& $test) { return $true }
    Start-Sleep -Milliseconds 200
  } while ((Get-Date) -lt $end)
  return $false
}

if (-not (WaitFor ${timeout} { BoxState })) { 'not-ready'; exit }
# Claude adds a linked question to whatever was already in its text box: send only the question.
if ((BoxState) -eq 'extra') { 'extra-text'; exit }
if (${options.paste ? '$true' : '$false'}) {
  [System.Windows.Forms.SendKeys]::SendWait('^v')
  Start-Sleep -Milliseconds ${settle}
  if (-not (QuestionBox)) { 'focus-lost'; exit }
}
# Enter sends. If the question is still there (Claude may still be taking in a screenshot), try
# again, but only while the box still holds it.
for ($try = 0; $try -lt 3; $try++) {
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  if (WaitFor 2000 { -not (QuestionBox) }) { 'sent'; exit }
}
'not-sent'
`
}
```

<!-- /code -->

Builds the PowerShell script, as one string. The TypeScript at the top fills in a few values; the
rest is the script itself, in a template literal (the backquoted string, where `${...}` inserts a
value).

**Filling in the values, safely**

- `Buffer.from(questionKey(options.question), 'utf8').toString('base64')`: the question's start
  goes into the script as base64, and the script decodes it
  (`[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('...'))`). Base64 uses only
  letters, digits, `+`, `/` and `=`, none of which can end the quoted string around it. So
  whatever the question says (quotes, `$(...)`, backticks, `; exit`), it can only ever be data,
  never PowerShell code.
- `if (!/^[\w.-]+$/.test(processName)) throw`: the process name is written into the script as it
  is, so it may only be letters, digits, `_`, `.` and `-`. A name with a quote in it is refused.
- `const hash = questionHash(options.question)`: the whole question's fingerprint, written in as
  `$hash`. It's only hexadecimal digits, so it can't break out of its quotes either.
- `Math.round(...)`: the two waits are written in as whole numbers.
- `'${WHITESPACE}'`: the same whitespace class as `normalizeQuestion()`, so the script evens out
  the box's text exactly as the question was.
- `${options.paste ? '$true' : '$false'}`: writes PowerShell's `$true` or `$false` into the `if`
  that decides whether to paste.

**The script: setting up**

- `$ErrorActionPreference = 'Stop'`: any error that isn't caught (see `QuestionBox`) stops the
  script. It then prints no outcome, so [`parseOutcome()`](#outcomes-and-parseoutcome) reports
  `failed` rather than a half-run script carrying on.
- `Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms`: loads
  UI Automation and Windows Forms (for SendKeys) into PowerShell.
- `$key = ...`, `$hash = ...`, `$processName = ...`: the question's start, its fingerprint and
  the process name, from above.
- `$sha = [Security.Cryptography.SHA256]::Create()`: .NET's SHA-256, created once and used for
  every check.

**The script: `BoxState` and `QuestionBox`**

`BoxState` is the check made before every key press. As its comment says, it answers `'exact'`
(Claude's focused box holds just the question), `'extra'` (the question and other text) or `$null`
(not Claude's box, or no question in it). `QuestionBox` is the yes/no form: is it `'exact'`?

- `[System.Windows.Automation.AutomationElement]::FocusedElement`: the element that has the
  keyboard focus right now, in whichever app is in front.
- `(Get-Process -Id $el.Current.ProcessId).ProcessName -ne $processName`: the element belongs to
  some other program, so it isn't Claude's box.
- `ValuePattern`, `TextPattern`: UI Automation's two ways a text box can give out its text: a
  plain box has a `Value`; a rich editor has a document, read here up to 20,000 characters.
  `TryGetCurrentPattern(..., [ref]$pattern)` asks whether the element supports one, and fills in
  `$pattern` if it does. The second is only tried if the first gave no text.
- `([string]$text -replace '${WHITESPACE}', ' ').Trim()`: the box's text evened out exactly as
  `normalizeQuestion()` evens out the question. `[string]` turns a missing value into empty text.
- `if (-not $text.Contains($key)) { return $null }`: the question's start isn't in the box, so this
  isn't the new chat's box. This tells it apart from any other Claude box, such as a Claude Code
  session in the same window.
- `$sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text))`: the box's text hashed as UTF-8.
  `ForEach-Object { $_.ToString('x2') }` writes each byte as two hexadecimal digits, and `-join`
  strings them together, the same form as `questionHash()` produces.
- `if ($digest -eq $hash) { return 'exact' }`, `return 'extra'`: the same fingerprint means the box
  holds exactly the question; otherwise it holds the question plus something else.
- `try { ... } catch {}`: if anything goes wrong while looking (the element vanishes, the process
  has just ended), the answer is simply "not Claude's box".
- `function QuestionBox { (BoxState) -eq 'exact' }`: true only for exactly the question. The paste
  and Enter steps use this, so any extra text that appears stops them too.

**The script: waiting and pressing**

- `function WaitFor([int]$ms, [scriptblock]$test)`: runs `$test` every 200 ms until it's true
  (then returns `$true`) or the time is up (`$false`). A `scriptblock`, `{ ... }`, is PowerShell's
  way to pass code to run later.
- `if (-not (WaitFor ${timeout} { BoxState })) { 'not-ready'; exit }`: waits up to 20 seconds
  for Claude to come to the front with the question in its focused box (exactly, or with other
  text). If it never does, nothing is pressed. A bare string, such as `'not-ready'`, is
  PowerShell's way of printing it.
- `if ((BoxState) -eq 'extra') { 'extra-text'; exit }`: as the comment says, Claude added the
  question to text that was already in its box. Nothing is pressed, so an unsent draft is never
  sent along with the question.
- `[System.Windows.Forms.SendKeys]::SendWait('^v')`: Ctrl+V (`^` means Ctrl in SendKeys) pastes
  the screenshot from the clipboard. `SendWait` waits until the app has processed the keys.
- `Start-Sleep -Milliseconds ${settle}`, then `if (-not (QuestionBox)) { 'focus-lost'; exit }`:
  gives Claude time to take the image in, then checks again that the focus is still in Claude's
  box before pressing Enter. If the user clicked elsewhere meanwhile, it stops.
- `for ($try = 0; $try -lt 3; $try++)`: presses Enter up to three times. After each press it waits
  up to 2 seconds for the question to leave the box (`WaitFor 2000 { -not (QuestionBox) }`), and
  only presses again if the focused Claude box still holds the question, for example because
  Claude was still taking in the screenshot and didn't send yet.
- `'sent'`: printed as soon as the focused element no longer passes `QuestionBox`, normally
  because Claude sent the question and emptied its box. (Should the focus move away at that
  instant, it looks the same, but then no further key is pressed either.)
- `'not-sent'`: three Enters and the question is still there.

### `OUTCOMES` and `parseOutcome()`

<!-- code: apps/desktop/src/main/sendInClaude.ts#OUTCOMES,parseOutcome -->

[`src/main/sendInClaude.ts`, lines 134–140](../../apps/desktop/src/main/sendInClaude.ts#L134-L140)

```ts
const OUTCOMES: SendOutcome[] = ['sent', 'not-ready', 'extra-text', 'focus-lost', 'not-sent']

/** The outcome the script printed last, or `failed`. */
export function parseOutcome(output: string): SendOutcome {
  const last = output.trim().split(/\r?\n/).at(-1)?.trim()
  return OUTCOMES.find((outcome) => outcome === last) ?? 'failed'
}
```

<!-- /code -->

Reads the script's answer from everything it printed.

- `output.trim().split(/\r?\n/).at(-1)?.trim()`: the last line. PowerShell ends lines with
  `\r\n`, and may print warnings before the outcome; only the last line counts.
- `OUTCOMES.find((outcome) => outcome === last) ?? 'failed'`: one of the four words the script
  prints, or `failed` for anything else, such as an error message or nothing at all.

### `sendInClaude()`

<!-- code: apps/desktop/src/main/sendInClaude.ts#sendInClaude -->

[`src/main/sendInClaude.ts`, lines 142–177](../../apps/desktop/src/main/sendInClaude.ts#L142-L177)

```ts
/**
 * Sends the question in Claude Desktop: waits until Claude's text box shows it, then presses
 * Ctrl+V (when there's a screenshot) and Enter. Runs the script in Windows PowerShell, hidden.
 */
export function sendInClaude(options: SendOptions): Promise<SendOutcome> {
  const script = sendScript(options)
  const powershell = join(
    process.env['SystemRoot'] ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  )
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const timeoutMs = (options.readyTimeoutMs ?? READY_TIMEOUT_MS) + 30_000
  return new Promise((resolve, reject) => {
    const child = spawn(
      powershell,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: timeoutMs },
    )
    let output = ''
    let errors = ''
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (errors += chunk.toString()))
    child.on('error', reject)
    child.on('close', (code) => {
      const outcome = parseOutcome(output)
      if (outcome === 'failed') {
        reject(
          new Error(`Sending in Claude failed (exit ${code}): ${errors.trim() || output.trim()}`),
        )
      } else resolve(outcome)
    })
  })
}
```

<!-- /code -->

Runs the script and resolves with its outcome. `index.ts` wraps it to log anything but `sent`,
and gives it to `ClaudeDesktop` as its `sendInClaude` dependency.

- `join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', ...)`: the
  full path of Windows PowerShell, which every Windows PC has. Giving the full path, rather than
  just `powershell.exe`, means a different program of that name earlier on the PATH can't be run
  instead.
- `Buffer.from(script, 'utf16le').toString('base64')`: the script for `-EncodedCommand`, which
  takes base64 of UTF-16 text. Passing it this way means nothing in the script needs quoting on
  the command line.
- `-NoProfile`: doesn't run the user's PowerShell profile script, so the helper starts faster and
  behaves the same on every PC. `-NonInteractive`: never waits for input.
  `-ExecutionPolicy Bypass`: sets PowerShell's script policy for this one run only, so the PC's
  own setting doesn't get in the way.
- `windowsHide: true`: no console window flashes up.
- `timeout: timeoutMs`: Node stops PowerShell if it's still running 30 seconds after the ready
  wait should have ended, so a stuck helper can't linger.
- `child.stdout.on('data', ...)`, `child.stderr.on('data', ...)`: collects what the script prints,
  and its error messages.
- `child.on('error', reject)`: PowerShell couldn't be started at all.
- `child.on('close', (code) => {`: once it has finished, the last line printed is the outcome. A
  `failed` outcome rejects the promise with the exit code and the error output, which
  `ClaudeDesktop.finish()` logs; anything else resolves.

## What's tested

`tests/claudeDesktop.test.ts` runs `ClaudeDesktop` with fake dependencies that record what
happened, in order (`fakeDeps()`). So a test can check not only that the screenshots were copied
and the link opened, but which happened first. "Send in Claude" is off in the fakes unless a test
says what sending comes to.

- `newChatLink`: the documented link with `q`; spaces written as `%20` (never `+`) and every
  character that means something in a link encoded; any text (emoji, other scripts, tabs, line
  breaks) decodes back unchanged; no `q` when there's no text.
- `pasteHint`, `sendHint`: the title for one and for several screenshots, and that the bodies
  mention Ctrl+V and Enter.
- `ClaudeDesktop.ask`, with "Send in Claude" off: a question without screenshots only opens the
  link (no clipboard, no notification); with screenshots, copy, then open, then the paste
  notification; a screenshot-only question opens an empty chat; an empty question does nothing;
  exactly 12,000 characters is accepted and one more is refused; when Claude Desktop isn't
  installed nothing is touched; a missing screenshot stops Claude opening; and a link Windows
  can't open, or a clipboard error, is `failed`, logged, with no notification.
- `ClaudeDesktop.ask`, with "Send in Claude" on: the question is sent and nothing more is said;
  screenshots are copied before opening and pasted when sending; `ask()` returns while sending
  carries on (`idle()` waits for it); when Claude never showed the question, the right hint
  (paste, or Enter); when the screenshot was pasted but not sent, press Enter; a helper that
  couldn't run is logged and falls back to the hint; a screenshot alone is never sent; and when
  Claude's box already had other text, nothing is sent and the "check your question" notification
  says so.

`tests/sendInClaude.test.ts` checks the helper without running it:

- `questionKey`: whitespace evened out, and at most 60 characters.
- `normalizeQuestion`, `questionHash`: non-breaking and other Unicode spaces are evened out too;
  the hash covers the whole evened-out question, so any extra text changes it.
- `sendScript`: a question full of PowerShell (`$(Remove-Item ...)`, quotes, backticks) appears in
  the script only as base64, which decodes back to its start; the script looks for process
  `claude` and waits 20 seconds; no key is pressed before the `not-ready` check, nor before the
  `extra-text` one; Ctrl+V only when there's a screenshot; another process name can be given, but
  not one that could break out of its quotes.
- `parseOutcome`: the last line is the outcome, and anything else is `failed`.

Two other test files cover the rest of 3.1. `tests/screenshotStack.test.ts` checks the stacking
(see [The draft, screenshots and safe files](6-drafts-and-screenshots.md)): the width rule, the
order of the images and the grey band between them (pixel by pixel), a single image left as it
is, and refusing different widths, padded rows or an empty list. `tests/tenants.test.ts` checks
that `chatApp` defaults to the built-in chat, which needs `signIn` and `claudeAccess`, while
Claude Desktop needs neither.

The unit tests can't reach what needs a real Windows desktop with Claude Desktop: asking Windows
about `claude://`, the real clipboard, the notification, and the PowerShell helper actually
finding Claude's box and pressing keys. "Checking it works" in `docs/CLAUDE_DESKTOP_SETUP.md`
goes through them by hand.
