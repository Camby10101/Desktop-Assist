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
   PowerShell helper. It waits until Claude's focused text box shows the question, presses Ctrl+V
   if there's a screenshot, then Enter, and Claude answers. If it can't, a Windows notification
   says what's left to do (paste, or press Enter).
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
belongs to Claude Desktop **and** already shows the question. A screenshot on its own is never
sent, because there would be no question to recognise the right box by.

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

### `pasteHint()` and `sendHint()`

<!-- code: apps/desktop/src/main/claudeDesktop.ts#pasteHint,sendHint -->

[`src/main/claudeDesktop.ts`, lines 17–28](../../apps/desktop/src/main/claudeDesktop.ts#L17-L28)

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
```

<!-- /code -->

The two Windows notifications, for when there's something left for the user to do in Claude. The
panel can't say it, because it closes as Claude Desktop opens. `finish()` (below) picks one.

- `pasteHint`: the screenshots are on the clipboard but haven't been pasted, so the user pastes
  them and sends. The title says how many, and that several became one image, so pasting a single
  image isn't a surprise.
- `sendHint`: the question (and the screenshot, if any) is already in Claude's message box, and
  only Enter is left.

### `AskOutcome` and `ClaudeDesktopDeps`

<!-- code: apps/desktop/src/main/claudeDesktop.ts#AskOutcome,ClaudeDesktopDeps -->

[`src/main/claudeDesktop.ts`, lines 30–48](../../apps/desktop/src/main/claudeDesktop.ts#L30-L48)

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
- `notify(message)`: a Windows notification, if Windows can show one.
- `onError?(error)`: writes a failure to the problem log. The `?` makes it optional.

### `ClaudeDesktop`

<!-- code: apps/desktop/src/main/claudeDesktop.ts#ClaudeDesktop.class -->

[`src/main/claudeDesktop.ts`, lines 50–56](../../apps/desktop/src/main/claudeDesktop.ts#L50-L56)

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

[`src/main/claudeDesktop.ts`, lines 57–64](../../apps/desktop/src/main/claudeDesktop.ts#L57-L64)

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

[`src/main/claudeDesktop.ts`, lines 66–88](../../apps/desktop/src/main/claudeDesktop.ts#L66-L88)

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

[`src/main/claudeDesktop.ts`, lines 90–93](../../apps/desktop/src/main/claudeDesktop.ts#L90-L93)

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

[`src/main/claudeDesktop.ts`, lines 95–117](../../apps/desktop/src/main/claudeDesktop.ts#L95-L117)

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

[`src/main/sendInClaude.ts`, lines 4–25](../../apps/desktop/src/main/sendInClaude.ts#L4-L25)

```ts
/**
 * How sending the question in Claude Desktop went.
 * - `sent`: the question left Claude's text box after Enter.
 * - `not-ready`: Claude's focused text box never showed the question (Claude didn't come to the
 *   front, or the focus is somewhere else), so nothing was pressed.
 * - `focus-lost`: the screenshot was pasted, but then the focus moved away, so Enter wasn't pressed.
 * - `not-sent`: Enter was pressed but the question stayed in the text box.
 * - `failed`: the helper couldn't run.
 */
export type SendOutcome = 'sent' | 'not-ready' | 'focus-lost' | 'not-sent' | 'failed'

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

- `question: string`: the question as typed. The script only uses its start
  ([`questionKey()`](#questionkey)).
- `paste: boolean`: whether to press Ctrl+V before Enter. `ClaudeDesktop.finish()` sets it when
  screenshots were copied.
- `processName?: string`: the program whose text box must hold the question: `claude`, Claude
  Desktop's process, unless a test names another.
- `readyTimeoutMs?`, `pasteSettleMs?`: the two waits below, which tests can shorten.

### `READY_TIMEOUT_MS` and `PASTE_SETTLE_MS`

<!-- code: apps/desktop/src/main/sendInClaude.ts#READY_TIMEOUT_MS,PASTE_SETTLE_MS -->

[`src/main/sendInClaude.ts`, lines 27–28](../../apps/desktop/src/main/sendInClaude.ts#L27-L28)

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

### `questionKey()`

<!-- code: apps/desktop/src/main/sendInClaude.ts#questionKey -->

[`src/main/sendInClaude.ts`, lines 30–36](../../apps/desktop/src/main/sendInClaude.ts#L30-L36)

```ts
/**
 * What to look for in Claude's text box: the start of the question, with every run of whitespace
 * made one space (Claude's editor may show line breaks differently from the text box here).
 */
export function questionKey(question: string): string {
  return question.replace(/\s+/g, ' ').trim().slice(0, 60)
}
```

<!-- /code -->

What the script looks for in Claude's text box to know it's the right one: the start of the
question.

- `.replace(/\s+/g, ' ')`: every run of spaces, tabs and line breaks becomes one space. The script
  does the same to the text it reads from Claude's box, so the two match even if Claude's editor
  shows line breaks differently.
- `.trim()`: no spaces at either end.
- `.slice(0, 60)`: the first 60 characters, plenty to tell this question from anything else in a
  text box.

### `sendScript()`

<!-- code: apps/desktop/src/main/sendInClaude.ts#sendScript -->

[`src/main/sendInClaude.ts`, lines 38–98](../../apps/desktop/src/main/sendInClaude.ts#L38-L98)

```ts
/**
 * The PowerShell that presses the keys. It uses Windows UI Automation to find the focused text
 * box, and only presses anything while that box belongs to Claude Desktop and already contains the
 * question; so a key never lands in another app, or in another Claude box (such as a Claude Code
 * session in the same window). The question goes in base64, never as PowerShell code.
 */
export function sendScript(options: SendOptions): string {
  const key = Buffer.from(questionKey(options.question), 'utf8').toString('base64')
  const processName = options.processName ?? 'claude'
  if (!/^[\w.-]+$/.test(processName)) throw new Error('Unexpected process name')
  const timeout = Math.round(options.readyTimeoutMs ?? READY_TIMEOUT_MS)
  const settle = Math.round(options.pasteSettleMs ?? PASTE_SETTLE_MS)
  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
$key = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${key}'))
$processName = '${processName}'

# The focused text box, if it's in Claude Desktop and holds the question; otherwise $null.
function QuestionBox {
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
    if ((($text -replace '\\s+', ' ').Trim()).Contains($key)) { return $el }
  } catch {}
  return $null
}

function WaitFor([int]$ms, [scriptblock]$test) {
  $end = (Get-Date).AddMilliseconds($ms)
  do {
    if (& $test) { return $true }
    Start-Sleep -Milliseconds 200
  } while ((Get-Date) -lt $end)
  return $false
}

if (-not (WaitFor ${timeout} { QuestionBox })) { 'not-ready'; exit }
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

Builds the PowerShell script, as one string. The TypeScript at the top fills in four values; the
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
- `Math.round(...)`: the two waits are written in as whole numbers.
- `${options.paste ? '$true' : '$false'}`: writes PowerShell's `$true` or `$false` into the `if`
  that decides whether to paste.

**The script: setting up**

- `$ErrorActionPreference = 'Stop'`: any error that isn't caught (see `QuestionBox`) stops the
  script. It then prints no outcome, so [`parseOutcome()`](#outcomes-and-parseoutcome) reports
  `failed` rather than a half-run script carrying on.
- `Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms`: loads
  UI Automation and Windows Forms (for SendKeys) into PowerShell.
- `$key = ...`, `$processName = ...`: the question's start and the process name, from above.

**The script: `QuestionBox`**

The check made before every key press. It returns the focused element if it's Claude's text box
holding the question, and `$null` otherwise.

- `[System.Windows.Automation.AutomationElement]::FocusedElement`: the element that has the
  keyboard focus right now, in whichever app is in front.
- `(Get-Process -Id $el.Current.ProcessId).ProcessName -ne $processName`: the element belongs to
  some other program, so it isn't Claude's box.
- `ValuePattern`, `TextPattern`: UI Automation's two ways a text box can give out its text: a
  plain box has a `Value`; a rich editor has a document, read here up to 20,000 characters.
  `TryGetCurrentPattern(..., [ref]$pattern)` asks whether the element supports one, and fills in
  `$pattern` if it does. The second is only tried if the first gave no text.
- `(($text -replace '\\s+', ' ').Trim()).Contains($key)`: the box's text with whitespace evened
  out as in `questionKey()`, and whether the question's start is in it. (In the TypeScript source
  the backslash is doubled, `'\\s+'`, so the script receives `\s+`.) This is what tells the new
  chat's box apart from any other Claude box, such as a Claude Code session in the same window.
- `try { ... } catch {}`: if anything goes wrong while looking (the element vanishes, the process
  has just ended), the answer is simply "not Claude's box".

**The script: waiting and pressing**

- `function WaitFor([int]$ms, [scriptblock]$test)`: runs `$test` every 200 ms until it's true
  (then returns `$true`) or the time is up (`$false`). A `scriptblock`, `{ ... }`, is PowerShell's
  way to pass code to run later.
- `if (-not (WaitFor ${timeout} { QuestionBox })) { 'not-ready'; exit }`: waits up to 20 seconds
  for Claude to come to the front with the question in its focused box. If it never does, nothing
  is pressed. A bare string, such as `'not-ready'`, is PowerShell's way of printing it.
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

[`src/main/sendInClaude.ts`, lines 100–106](../../apps/desktop/src/main/sendInClaude.ts#L100-L106)

```ts
const OUTCOMES: SendOutcome[] = ['sent', 'not-ready', 'focus-lost', 'not-sent']

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

[`src/main/sendInClaude.ts`, lines 108–143](../../apps/desktop/src/main/sendInClaude.ts#L108-L143)

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
  couldn't run is logged and falls back to the hint; and a screenshot alone is never sent.

`tests/sendInClaude.test.ts` checks the helper without running it:

- `questionKey`: whitespace evened out, and at most 60 characters.
- `sendScript`: a question full of PowerShell (`$(Remove-Item ...)`, quotes, backticks) appears in
  the script only as base64, which decodes back to its start; the script looks for process
  `claude` and waits 20 seconds; no key is pressed before the `not-ready` check; Ctrl+V only when
  there's a screenshot; another process name can be given, but not one that could break out of
  its quotes.
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
