# The draft, screenshots and safe files

[← Code Guide](CODE_GUIDE.md)

This part covers the main-process code that keeps things on disk. `NotesStore` saves the unsent
draft so it survives a restart; `ScreenshotService` and its helpers take, preview, shrink and
combine screenshots, and make sure the pages can only touch files in the screenshots folder.
Underneath both, `jsonFile.ts` reads saved files with a validity check and writes them so that a
crash can't leave a half-written file. All of this runs in the main process (Electron's Node.js
side, which can use the disk); the pages reach it only through the IPC handlers in
`src/main/ipc.ts`.

## `src/main/notes/NotesStore.ts`: saving the draft

The draft is the text typed into the chat box but not yet sent, plus any screenshots attached to it.
`NotesStore` holds it in memory and saves it to `notes.json` in the app's data folder
(`app.getPath('userData')`, under `%APPDATA%`), so a half-written message is still there after a
restart or a crash. `src/main/index.ts` creates one store at startup, loads it, and flushes it when
the app quits. `src/main/ipc.ts` calls it whenever the page changes the draft, and clears it when a
message is sent or handed to Claude Desktop, or when the user picks "Clear text box".

Key ideas:

- **Debounced autosave.** The page sends the whole text on every keystroke. Writing a file each time
  would be wasteful, so every change restarts a 500 ms timer, and the file is written only once
  typing pauses. To "debounce" means to wait until calls stop coming for a moment, then act once.
- **Serialised writes.** Saves wait in a queue (a chain of promises), so two writes to the file
  never run at the same time.
- **Overtaken writes are dropped.** Each save is numbered. A save that would land after a newer one
  has already reached the disk throws itself away instead of putting older text back.
- **Validated loading.** The file is checked against a zod schema when it's read. A damaged file is
  renamed out of the way instead of crashing the app or being silently overwritten.

### `MAX_NOTE_LENGTH` and `NotesFileSchema`

<!-- code: apps/desktop/src/main/notes/NotesStore.ts#MAX_NOTE_LENGTH,NotesFileSchema -->

[`src/main/notes/NotesStore.ts`, lines 8–17](../../apps/desktop/src/main/notes/NotesStore.ts#L8-L17)

```ts
export const MAX_NOTE_LENGTH = 200_000

const NotesFileSchema = z.object({
  version: z.literal(1),
  text: z.string(),
  attachments: z.array(
    z.object({ id: z.string(), path: z.string(), fileName: z.string(), addedAt: z.string() }),
  ),
  updatedAt: z.string().nullable(),
})
```

<!-- /code -->

`MAX_NOTE_LENGTH` is a safety limit on the draft's size. `NotesFileSchema` describes exactly what a
valid `notes.json` looks like.

- `200_000`: the underscore is only a digit separator, for readability (200,000 characters).
  `ipc.ts` uses the same constant to reject over-long text in its `notesSetText` and `chatSend`
  handlers.
- `z.object({`: this is **zod**, a validation library. A schema describes the expected shape;
  `schema.parse(data)` returns the data if it matches and throws if it doesn't. TypeScript's types
  disappear when the code runs, so a file read from disk (which a crash could damage, or anyone
  could edit) must be checked at run time. `readJsonFile()` in `jsonFile.ts` does the checking.
  Unknown extra fields are dropped by `parse`.
- `version: z.literal(1)`: the file records its format version, and only `1` is accepted, so a
  future format can be told apart. Today a file with any other version counts as invalid and is set
  aside like a damaged one (see `load()`).
- `updatedAt: z.string().nullable()`: a timestamp string, or `null` if nothing has been typed yet.

### `emptyNotes` and `NotesStoreOptions`

<!-- code: apps/desktop/src/main/notes/NotesStore.ts#emptyNotes,NotesStoreOptions -->

[`src/main/notes/NotesStore.ts`, lines 19–27](../../apps/desktop/src/main/notes/NotesStore.ts#L19-L27)

```ts
export const emptyNotes = (): Notes => ({ text: '', attachments: [], updatedAt: null })

export interface NotesStoreOptions {
  debounceMs?: number
  /** Called when everything changed so far has reached the disk. */
  onSaved?: () => void
  onError?: (error: unknown) => void
  now?: () => Date
}
```

<!-- /code -->

`emptyNotes()` makes a blank draft. `NotesStoreOptions` are the optional settings the constructor
accepts.

- `emptyNotes = (): Notes =>`: a function rather than one shared constant, so every caller gets its
  own fresh `attachments` array. `Notes` is the draft type from `src/shared/types.ts`.
- `debounceMs?`: the `?` makes the option optional. It's the pause before saving, 500 ms when left
  out; the tests set it very short or very long.
- `onSaved`: only the tests use it, to know when a save has finished.
- `onError`: `index.ts` passes a function that logs "Saving the text box failed".
- `now`: a way to supply the current time, for testing. When it's left out, as in the app, the real
  clock is used.

### `class NotesStore`

The class, with the comment that describes it:

<!-- code: apps/desktop/src/main/notes/NotesStore.ts#NotesStore.class -->

[`src/main/notes/NotesStore.ts`, lines 29–33](../../apps/desktop/src/main/notes/NotesStore.ts#L29-L33)

```ts
/**
 * The text box's contents. Changes are kept in memory and written to disk shortly after the
 * last edit; writes are serialised, and a write overtaken by a newer one is discarded.
 */
export class NotesStore {
  // …
}
```

<!-- /code -->

### `NotesStore` fields and constructor

<!-- code: apps/desktop/src/main/notes/NotesStore.ts#NotesStore.notes,dirty,timer,writes,seq,committedSeq,constructor -->

[`src/main/notes/NotesStore.ts`, lines 34–44](../../apps/desktop/src/main/notes/NotesStore.ts#L34-L44)

```ts
private notes: Notes = emptyNotes()

private dirty = false

private timer: ReturnType<typeof setTimeout> | null = null

private writes: Promise<void> = Promise.resolve()

private seq = 0

private committedSeq = 0

constructor(
  private readonly filePath: string,
  private readonly options: NotesStoreOptions = {},
) {}
```

<!-- /code -->

The in-memory `notes` is the real draft while the app runs; the file is only a copy. The other
fields are bookkeeping for saving.

- `dirty`: true when there are changes that haven't been handed to a write yet.
- `ReturnType<typeof setTimeout>`: "whatever `setTimeout` returns". That's an object in Node and a
  number in browsers, and this type fits both. `timer` is the pending autosave, or `null`.
- `writes`: the end of the write queue. It starts as an already-finished promise, and each new write
  is chained on with `.then`, so writes happen strictly one after another.
- `seq`: counts the snapshots handed to a write. `committedSeq` is the number of the newest snapshot
  actually on disk. Comparing the two is how an overtaken write knows to give up (see `write()`).
- `private readonly filePath: string`: in a constructor, putting `private` or `readonly` before a
  parameter is TypeScript shorthand that declares a field and stores the argument in it. That's why
  the constructor body is empty yet the class has `this.filePath` and `this.options`.
- `options: NotesStoreOptions = {}`: `{}` is the default when no options are passed.

### `NotesStore.load()`

<!-- code: apps/desktop/src/main/notes/NotesStore.ts#NotesStore.load -->

[`src/main/notes/NotesStore.ts`, lines 46–56](../../apps/desktop/src/main/notes/NotesStore.ts#L46-L56)

```ts
async load(): Promise<Notes> {
  const result = await readJsonFile(this.filePath, NotesFileSchema)
  if (result.status === 'ok') {
    const { text, attachments, updatedAt } = result.value
    this.notes = { text, attachments, updatedAt }
  } else {
    if (result.status === 'invalid') await this.setAsideCorruptFile()
    this.notes = emptyNotes()
  }
  return this.get()
}
```

<!-- /code -->

Reads `notes.json` and makes it the current draft. `index.ts` calls it once at startup, before it
registers the IPC handlers.

- `readJsonFile(this.filePath, NotesFileSchema)`: returns one of three results: `ok` (with the
  checked value), `missing` (no file yet, e.g. on the first run) or `invalid` (not JSON, or the
  wrong shape). Any other read error, such as permission denied, is thrown to the caller.
- `const { text, attachments, updatedAt } = result.value`: keeps just the draft's fields, leaving
  the file's `version` behind.
- `this.setAsideCorruptFile()`: a damaged file is renamed, not deleted, so its contents can still be
  recovered by hand and the next save doesn't overwrite it. A missing file needs nothing; both cases
  start from an empty draft.

### `NotesStore.get()`

<!-- code: apps/desktop/src/main/notes/NotesStore.ts#NotesStore.get -->

[`src/main/notes/NotesStore.ts`, lines 58–60](../../apps/desktop/src/main/notes/NotesStore.ts#L58-L60)

```ts
get(): Notes {
  return { ...this.notes, attachments: this.notes.attachments.map((a) => ({ ...a })) }
}
```

<!-- /code -->

Returns a copy of the draft. `ipc.ts` uses it when sending a message, and `index.ts` includes it in
the app state the pages ask for when they load.

- `attachments: this.notes.attachments.map((a) => ({ ...a }))`: `{ ...x }` (the spread syntax)
  copies an object's fields into a new object. Spreading `this.notes` alone would copy only the top
  level and share the attachments array, so each attachment is copied too. Callers can then change
  what they got without changing the store (a test checks this).

### `NotesStore.setText()`

<!-- code: apps/desktop/src/main/notes/NotesStore.ts#NotesStore.setText -->

[`src/main/notes/NotesStore.ts`, lines 62–65](../../apps/desktop/src/main/notes/NotesStore.ts#L62-L65)

```ts
setText(text: string): void {
  const next = text.slice(0, MAX_NOTE_LENGTH)
  if (next !== this.notes.text) this.update({ text: next })
}
```

<!-- /code -->

Replaces the draft's text. `ipc.ts` calls it for the `notesSetText` message, which the page sends on
every change in the text box.

- `text.slice(0, MAX_NOTE_LENGTH)`: cuts over-long text. `ipc.ts` already ignores a message longer
  than this, so this is a second line of defence for any other caller.
- `if (next !== this.notes.text)`: unchanged text does nothing, so it doesn't move `updatedAt` or
  trigger a pointless save.

### `NotesStore.addAttachment()`

<!-- code: apps/desktop/src/main/notes/NotesStore.ts#NotesStore.addAttachment -->

[`src/main/notes/NotesStore.ts`, lines 67–78](../../apps/desktop/src/main/notes/NotesStore.ts#L67-L78)

```ts
/** Adds a screenshot to the text box. Returns null if that file is already attached. */
addAttachment(path: string): Notes | null {
  if (this.notes.attachments.some((a) => samePath(a.path, path))) return null
  const attachment = {
    id: randomUUID(),
    path,
    fileName: basename(path),
    addedAt: this.now().toISOString(),
  }
  this.update({ attachments: [...this.notes.attachments, attachment] })
  return this.get()
}
```

<!-- /code -->

Attaches a screenshot file to the draft. `ipc.ts` calls it from the "Attach latest screenshot"
handler (`notesAttachLatest`) with the path from `ScreenshotService.latest()`, so the page never
supplies the path.

- `samePath(a.path, path)`: refuses a file that's already attached. The `null` lets `ipc.ts` answer
  `already-attached`, and the page shows "That screenshot is already attached".
- `randomUUID()`: a random unique ID from Node's `crypto` module, used later to remove this
  attachment.
- `basename(path)`: the file name without its folder, e.g. `Screenshot 2026-10-02 140311.png`. The
  page turns it into the chip's label.
- `this.now().toISOString()`: a timestamp such as `2026-10-02T03:03:11.000Z` (always in UTC).

### `NotesStore.removeAttachment()` and `NotesStore.clear()`

<!-- code: apps/desktop/src/main/notes/NotesStore.ts#NotesStore.removeAttachment,clear -->

[`src/main/notes/NotesStore.ts`, lines 80–88](../../apps/desktop/src/main/notes/NotesStore.ts#L80-L88)

```ts
removeAttachment(id: string): Notes {
  this.update({ attachments: this.notes.attachments.filter((a) => a.id !== id) })
  return this.get()
}

clear(): Notes {
  this.update({ text: '', attachments: [] })
  return this.get()
}
```

<!-- /code -->

`removeAttachment()` drops one screenshot by its ID (the × on a chip). `clear()` empties the draft:
`ipc.ts` calls it after a message has been handed to `ChatSession.send()` or a question to Claude
Desktop, and for "Clear text box" in the settings menu, and returns the empty draft to the page.
Only the draft's list of attachments is emptied; the screenshot files stay in the folder. Both go
through the same debounced autosave as any other change, so the saved file is emptied too shortly
after a message is sent.

- `filter((a) => a.id !== id)`: an unknown ID removes nothing, but it still counts as a change and
  schedules a save.

### `NotesStore.flush()`

<!-- code: apps/desktop/src/main/notes/NotesStore.ts#NotesStore.flush -->

[`src/main/notes/NotesStore.ts`, lines 90–100](../../apps/desktop/src/main/notes/NotesStore.ts#L90-L100)

```ts
/** Writes any pending change now and waits for all writes to finish. */
flush(): Promise<void> {
  this.clearTimer()
  if (this.dirty) {
    this.dirty = false
    const seq = ++this.seq
    const snapshot = this.toFile()
    this.writes = this.writes.then(() => this.write(snapshot, seq))
  }
  return this.writes
}
```

<!-- /code -->

Saves any pending change now instead of waiting for the timer, and returns a promise that settles
when every queued write has finished. The autosave timer calls it, and so does `index.ts` when the
app is quitting (giving it at most 2 seconds before quitting anyway).

- `this.clearTimer()`: a pending autosave is no longer needed.
- `const seq = ++this.seq`: numbers this snapshot. `++x` adds one first, then gives the new value.
- `const snapshot = this.toFile()`: copies the draft as it is now. Edits made while this write waits
  in the queue don't change what it saves; they mark the store dirty again and get a write of their
  own.
- `this.writes = this.writes.then(() => this.write(snapshot, seq))`: adds the write to the end of
  the queue. It starts only after every earlier write has finished, so writes never overlap.
- `return this.writes`: even when nothing was dirty, the caller waits for any write already in
  progress. That's what makes awaiting `flush()` on quit mean "everything is on disk".

### `NotesStore.flushSync()`

<!-- code: apps/desktop/src/main/notes/NotesStore.ts#NotesStore.flushSync -->

[`src/main/notes/NotesStore.ts`, lines 102–110](../../apps/desktop/src/main/notes/NotesStore.ts#L102-L110)

```ts
/** Blocking write for when the OS is ending the session and async work may never finish. */
flushSync(): void {
  this.clearTimer()
  if (!this.dirty) return
  this.dirty = false
  const seq = ++this.seq
  writeJsonFileSync(this.filePath, this.toFile())
  this.committedSeq = seq
}
```

<!-- /code -->

The emergency version of `flush()`. When Windows logs off or shuts down, Electron fires
`session-end` on the window, and `index.ts` calls this. Windows may end the process before any async
work completes, so this can't use the queue.

- `writeJsonFileSync(this.filePath, this.toFile())`: a blocking write. The event handler doesn't
  return until the file is saved.
- `this.committedSeq = seq`: records that this newer snapshot is on disk. An async write still in
  the queue has a smaller number, so when it reaches its commit check it discards itself instead of
  putting older text back (the "overtaken write" test checks exactly this).

Unlike `write()`, it doesn't catch errors: a failure is thrown from the event handler.

### `NotesStore.update()`

<!-- code: apps/desktop/src/main/notes/NotesStore.ts#NotesStore.update -->

[`src/main/notes/NotesStore.ts`, lines 112–117](../../apps/desktop/src/main/notes/NotesStore.ts#L112-L117)

```ts
private update(patch: Partial<Notes>): void {
  this.notes = { ...this.notes, ...patch, updatedAt: this.now().toISOString() }
  this.dirty = true
  this.clearTimer()
  this.timer = setTimeout(() => void this.flush(), this.options.debounceMs ?? 500)
}
```

<!-- /code -->

The private helper every change goes through. It applies the change, stamps the time and restarts
the autosave timer; this is where the debounce happens.

- `Partial<Notes>`: TypeScript for "a `Notes` with every field optional", so callers pass only what
  changed.
- `{ ...this.notes, ...patch, updatedAt: this.now().toISOString() }`: builds a new draft object.
  Later fields win, so the values in `patch` replace the old ones.
- `this.clearTimer()`: each change cancels the previous timer before starting a new one. While you
  keep typing the save keeps being pushed back; 500 ms after the last keystroke the timer finally
  fires and saves once.
- `() => void this.flush()`: `void` marks the promise as deliberately not awaited. Nothing here
  could act on the result, and errors are handled inside `write()`.
- `this.options.debounceMs ?? 500`: `??` uses the right-hand value only when the left is `null` or
  `undefined`, so a caller could still pass `0`.

### `NotesStore.write()`

<!-- code: apps/desktop/src/main/notes/NotesStore.ts#NotesStore.write -->

[`src/main/notes/NotesStore.ts`, lines 119–128](../../apps/desktop/src/main/notes/NotesStore.ts#L119-L128)

```ts
private async write(snapshot: object, seq: number): Promise<void> {
  try {
    const committed = await writeJsonFile(this.filePath, snapshot, () => seq > this.committedSeq)
    if (committed) this.committedSeq = seq
    if (!this.dirty) this.options.onSaved?.()
  } catch (error) {
    this.dirty = true // try again on the next change or flush
    this.options.onError?.(error)
  }
}
```

<!-- /code -->

Performs one queued save, through `writeJsonFile()` in `jsonFile.ts`.

That call is an **atomic write**: it doesn't write `notes.json` directly. It writes the whole new
content to a temporary file next to it, then renames the temporary file over the real one. A rename
is all-or-nothing, so if the app crashes mid-save, `notes.json` holds either the old draft or the
new one, never a mix. See `writeFileAtomic()` below.

- `() => seq > this.committedSeq`: the commit check, which `writeJsonFile` calls just before the
  rename. If a newer snapshot has already reached the disk (from `flushSync()`), this one is out of
  date and is thrown away.
- `if (committed) this.committedSeq = seq`: records the newest snapshot on disk.
- `if (!this.dirty) this.options.onSaved?.()`: reports "saved" only when no newer change is waiting.
  `?.()` calls the function only if one was provided.
- `this.dirty = true`: if the save failed (say, the disk is full), the draft is marked unsaved
  again, so the next change or flush retries with the latest text. No new timer is started.
- `catch (error)`: catching also protects the queue. Because `write()` never rejects, one failed
  save can't break the promise chain in `writes`; a rejected promise in the chain would make every
  later `.then` step skip its write.

### `NotesStore.toFile()`

<!-- code: apps/desktop/src/main/notes/NotesStore.ts#NotesStore.toFile -->

[`src/main/notes/NotesStore.ts`, lines 130–132](../../apps/desktop/src/main/notes/NotesStore.ts#L130-L132)

```ts
private toFile() {
  return { version: 1 as const, ...this.notes }
}
```

<!-- /code -->

The object that gets written to disk: the draft plus `version: 1`.

- `1 as const`: tells TypeScript the type is exactly `1`, not any number, matching `z.literal(1)` in
  `NotesFileSchema`.
- `...this.notes`: only the top level is copied. That's safe because every change replaces `notes`
  and its attachments array with new values rather than editing them in place, so a snapshot can't
  change after it's taken.

### `NotesStore.setAsideCorruptFile()`

<!-- code: apps/desktop/src/main/notes/NotesStore.ts#NotesStore.setAsideCorruptFile -->

[`src/main/notes/NotesStore.ts`, lines 134–141](../../apps/desktop/src/main/notes/NotesStore.ts#L134-L141)

```ts
private async setAsideCorruptFile(): Promise<void> {
  const backup = `${this.filePath}.corrupt-${this.now().getTime()}`
  try {
    await fs.rename(this.filePath, backup)
  } catch (error) {
    this.options.onError?.(error)
  }
}
```

<!-- /code -->

Renames a damaged `notes.json` to `notes.json.corrupt-<time>`, so it's kept for inspection while the
app starts with an empty draft.

- `this.now().getTime()`: the time in milliseconds since 1970, which makes each backup name unique.
- `catch (error)`: if even the rename fails, the error is reported through `onError` and startup
  carries on. The next save will then overwrite the damaged file.

### `NotesStore.clearTimer()` and `NotesStore.now()`

<!-- code: apps/desktop/src/main/notes/NotesStore.ts#NotesStore.clearTimer,now -->

[`src/main/notes/NotesStore.ts`, lines 143–150](../../apps/desktop/src/main/notes/NotesStore.ts#L143-L150)

```ts
private clearTimer(): void {
  if (this.timer) clearTimeout(this.timer)
  this.timer = null
}

private now(): Date {
  return this.options.now?.() ?? new Date()
}
```

<!-- /code -->

Two small helpers. `clearTimer()` cancels any pending autosave. `now()` takes the time from the
`now` option when there is one, and otherwise from the real clock.

### `samePath`

<!-- code: apps/desktop/src/main/notes/NotesStore.ts#samePath -->

[`src/main/notes/NotesStore.ts`, lines 153–156](../../apps/desktop/src/main/notes/NotesStore.ts#L153-L156)

```ts
function samePath(a: string, b: string): boolean {
  const norm = (p: string) => resolve(p).toLowerCase()
  return norm(a) === norm(b)
}
```

<!-- /code -->

Compares two file paths the way Windows does, for `addAttachment()`.

- `resolve(p)`: turns a path into a full, normalised absolute path (working out `.` and `..` parts
  and using one kind of slash).
- `.toLowerCase()`: Windows file names ignore case, so `C:\Pics\Shot.png` and `c:\pics\shot.png` are
  the same file.

## `src/main/screenshots/ScreenshotService.ts`: capturing and serving screenshots

Everything the app does with screenshot images goes through this class: taking one, finding the
newest, making small previews, preparing one for Claude, combining several into one image for the
clipboard, and opening one in another app. `index.ts` creates a single instance with the
screenshots folder (`Pictures\<appName>`, for example `Pictures\Desktop Assist`) and a function
that returns the display the bubble is on. `actions.ts` calls `capture()` for the camera button,
`index.ts` uses `forClipboard()` when a question goes to Claude Desktop, and `ipc.ts` exposes the
rest to the pages.

Key ideas:

- **Electron's image tools.** `desktopCapturer` grabs the screen, and `nativeImage` loads, resizes
  and encodes images, so no extra image library is needed. Both are explained where they're first
  used below.
- **The inside-the-folder check.** Several methods take a file path from a page. The main process
  doesn't trust what pages send (`ipc.ts` validates every argument for the same reason): if a page
  were ever compromised, it mustn't be able to make the main process preview, read or open any file
  on the PC. Opening an `.exe` this way would even run it. So every method that takes a path first
  checks, with `owns()`, that the file is inside the screenshots folder. How the check works is in
  `isInsideDir()` in `files.ts`.

### Constants

<!-- code: apps/desktop/src/main/screenshots/ScreenshotService.ts#THUMBNAIL_HEIGHT,MAX_CACHED_THUMBNAILS,JPEG_QUALITY -->

[`src/main/screenshots/ScreenshotService.ts`, lines 8–10](../../apps/desktop/src/main/screenshots/ScreenshotService.ts#L8-L10)

```ts
const THUMBNAIL_HEIGHT = 112

const MAX_CACHED_THUMBNAILS = 50

const JPEG_QUALITY = 85
```

<!-- /code -->

- `THUMBNAIL_HEIGHT = 112`: a chip's preview is drawn 56 pixels tall. Making the image twice that
  keeps it sharp on high-DPI screens, where Windows scales the display up.
- `MAX_CACHED_THUMBNAILS = 50`: how many previews to keep in memory.
- `JPEG_QUALITY = 85`: the JPEG quality (0 to 100) for images sent to Claude, a common balance
  between file size and sharpness.

### `ScreenshotService` fields and constructor

<!-- code: apps/desktop/src/main/screenshots/ScreenshotService.ts#ScreenshotService.thumbnails,constructor -->

[`src/main/screenshots/ScreenshotService.ts`, lines 13–19](../../apps/desktop/src/main/screenshots/ScreenshotService.ts#L13-L19)

```ts
private readonly thumbnails = new Map<string, string>()

constructor(
  readonly dir: string,
  /** The display to capture: the one the bubble is on. */
  private readonly targetDisplay: () => Display,
) {}
```

<!-- /code -->

- `new Map<string, string>()`: the preview cache. Each key is a path plus the file's modified time;
  each value is a preview as a data URL.
- `readonly dir: string`: the screenshots folder. Without `private` it's a public, read-only field
  (the same constructor shorthand as in `NotesStore`).
- `targetDisplay: () => Display`: a function rather than a fixed value, because the bubble can be
  dragged to another monitor. `index.ts` passes
  `screen.getDisplayMatching(bubbleWindow.getBounds())`, the display that most of the bubble window
  is on. A `Display` is Electron's description of a monitor: its ID, size, position and scale
  factor.

### `ScreenshotService.capture()`

<!-- code: apps/desktop/src/main/screenshots/ScreenshotService.ts#ScreenshotService.capture -->

[`src/main/screenshots/ScreenshotService.ts`, lines 21–34](../../apps/desktop/src/main/screenshots/ScreenshotService.ts#L21-L34)

```ts
/** Captures the target display at full resolution and saves it. Returns the file path. */
async capture(): Promise<string> {
  const display = this.targetDisplay()
  const thumbnailSize = {
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor),
  }
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize })
  const source =
    sources.find((s) => s.display_id === String(display.id)) ??
    (sources.length === 1 ? sources[0] : undefined)
  if (!source || source.thumbnail.isEmpty()) throw new Error('Could not capture the screen')
  return saveScreenshot(this.dir, source.thumbnail.toPNG(), new Date())
}
```

<!-- /code -->

Takes a picture of the whole display the bubble is on, saves it as a PNG, and returns the new file's
path. The camera button's handler in `actions.ts` runs it inside `BubbleController.whileHidden()`,
which hides the bubble and the panel first so they aren't in the picture.

**`desktopCapturer`** is Electron's way to list the screens and windows that can be captured. It's
mostly used to start screen sharing, but every source it returns comes with a still `thumbnail`
image. Asking for a thumbnail as big as the screen turns that "thumbnail" into a full-resolution
screenshot.

- `display.size.width * display.scaleFactor`: Electron measures displays in device-independent
  pixels (DIPs), which ignore Windows' display scaling. Multiplying by the scale factor gives the
  real pixel size: a 3840×2160 screen at 150% scaling is 2560×1440 DIPs with a scale factor of 1.5.
  `Math.round` keeps the result a whole number.
- `types: ['screen']`: whole screens only, not individual windows.
- `s.display_id === String(display.id)`: picks the source for the bubble's display. A capture source
  names its display with a string, while `Display.id` is a number.
- `(sources.length === 1 ? sources[0] : undefined)`: Electron documents that `display_id` can be
  empty when it isn't available. With only one screen there's no doubt which one it is, so it's used
  anyway; with several, a guess could capture the wrong screen, so it fails instead.
- `source.thumbnail.isEmpty()`: an empty image means the capture itself failed.
- `throw new Error('Could not capture the screen')`: `actions.ts` catches this, logs it, and the
  page shows "Couldn't take a screenshot".
- `source.thumbnail.toPNG()`: encodes the image as PNG bytes (a Node `Buffer`). PNG is lossless, so
  the file is exactly what was on screen.
- `saveScreenshot(this.dir, source.thumbnail.toPNG(), new Date())`: from `files.ts`. It names the
  file after the current local time and never overwrites an existing one.

### `ScreenshotService.latest()`

<!-- code: apps/desktop/src/main/screenshots/ScreenshotService.ts#ScreenshotService.latest -->

[`src/main/screenshots/ScreenshotService.ts`, lines 36–38](../../apps/desktop/src/main/screenshots/ScreenshotService.ts#L36-L38)

```ts
latest(): Promise<string | null> {
  return findLatestScreenshot(this.dir)
}
```

<!-- /code -->

The newest screenshot in the folder, or `null` if there isn't one. The "Attach latest screenshot"
handler in `ipc.ts` calls it and passes the result to `NotesStore.addAttachment()`. The work is done
by `findLatestScreenshot()` in `files.ts`.

### `ScreenshotService.thumbnail()`

<!-- code: apps/desktop/src/main/screenshots/ScreenshotService.ts#ScreenshotService.thumbnail -->

[`src/main/screenshots/ScreenshotService.ts`, lines 40–60](../../apps/desktop/src/main/screenshots/ScreenshotService.ts#L40-L60)

```ts
/** A small preview as a data URL, or null if the file is missing or not one of ours. */
async thumbnail(path: string): Promise<string | null> {
  if (!this.owns(path)) return null
  let mtimeMs: number
  try {
    mtimeMs = (await fs.stat(path)).mtimeMs
  } catch {
    return null
  }
  const key = `${path}|${mtimeMs}`
  const cached = this.thumbnails.get(key)
  if (cached) return cached
  const image = nativeImage.createFromPath(path)
  if (image.isEmpty()) return null
  const url = image.resize({ height: THUMBNAIL_HEIGHT, quality: 'good' }).toDataURL()
  this.thumbnails.set(key, url)
  if (this.thumbnails.size > MAX_CACHED_THUMBNAILS) {
    this.thumbnails.delete(this.thumbnails.keys().next().value!)
  }
  return url
}
```

<!-- /code -->

Makes a small preview of a screenshot for the page to show, on the chips in the text box and on sent
messages. The page asks through `ipc.ts` (`screenshotThumbnail`), from its `useThumbnail` hook.

**`nativeImage`** is Electron's image class. It can load a PNG or JPEG file, report its size, resize
it, and encode it as PNG, JPEG or a data URL.

- `if (!this.owns(path)) return null`: the inside-the-folder check from the overview.
- `(await fs.stat(path)).mtimeMs`: the file's last-modified time. If the file is gone, the method
  returns `null`, and a draft chip says "File missing" instead of showing a preview.
- `this.thumbnails.get(key)`: the cache key is the path plus that modified time. If the screenshot
  is edited (cropped in Paint, say), the key changes and a fresh preview is made.
- `nativeImage.createFromPath(path)`: loads and decodes the file. It doesn't throw for a file it
  can't read; it returns an empty image, hence the `isEmpty()` check.
- `image.resize({ height: THUMBNAIL_HEIGHT, quality: 'good' })`: when only the height is given, the
  width is scaled to keep the image's shape. `'good'` is the fastest of Electron's three quality
  settings (`good`, `better`, `best`), plenty for a tiny preview.
- `.toDataURL()`: encodes the preview as a PNG inside a `data:image/png;base64,...` string. The page
  can put that straight into an image's `src`, so it never needs access to the file itself.
- `this.thumbnails.keys().next().value!`: once the cache holds more than 50 previews, the oldest is
  removed. A `Map` remembers the order entries were added, so its first key is the oldest (first in,
  first out: reading an entry doesn't move it to the back). The `!` tells TypeScript the value can't
  be `undefined` here, because the map isn't empty.

### `ScreenshotService.forClaude()`

<!-- code: apps/desktop/src/main/screenshots/ScreenshotService.ts#ScreenshotService.forClaude -->

[`src/main/screenshots/ScreenshotService.ts`, lines 62–75](../../apps/desktop/src/main/screenshots/ScreenshotService.ts#L62-L75)

```ts
/**
 * A screenshot prepared for Claude: scaled down to a size the model reads well and re-encoded
 * as JPEG, which keeps requests small. Null if the file is missing or not one of ours.
 */
forClaude(path: string): OutgoingImage | null {
  if (!this.owns(path)) return null
  const image = nativeImage.createFromPath(path)
  if (image.isEmpty()) return null
  const original = image.getSize()
  const size = fitWithin(original)
  const scaled =
    size.width === original.width ? image : image.resize({ ...size, quality: 'best' })
  return { mediaType: 'image/jpeg', data: scaled.toJPEG(JPEG_QUALITY).toString('base64') }
}
```

<!-- /code -->

Prepares a screenshot to send to Claude. The `chatSend` handler in `ipc.ts` calls it for each
attached screenshot; if any returns `null`, nothing is sent and the page is told
`missing-screenshot`. Unlike most methods here it isn't async, because `nativeImage` does its work
straight away; the main process waits while each image is decoded and re-encoded.

The image is **resized and re-encoded as JPEG**. A full-screen PNG can be several megabytes, and
pixels beyond what Claude uses only make the request bigger and slower (see `imageSize.ts`).

- `image.getSize()`: the image's width and height in pixels.
- `fitWithin(original)`: from `imageSize.ts`. The size to scale to, so the longest side is at most
  1,568 pixels.
- `size.width === original.width ? image :`: skips the resize when the image is already small
  enough. Comparing the width is enough for screen-shaped images, where shrinking always changes
  both sides.
- `quality: 'best'`: the slowest, sharpest resize, because Claude needs to read small text in the
  screenshot.
- `scaled.toJPEG(JPEG_QUALITY)`: encodes as JPEG at quality 85. JPEG throws away fine detail the eye
  barely notices, which keeps the request small.
- `.toString('base64')`: turns the bytes into text. The Claude API takes images as base64 text
  inside the JSON request; `ChatSession.send()` puts this into an `image` block with the `mediaType`
  given here.

### `ScreenshotService.forClipboard()`

<!-- code: apps/desktop/src/main/screenshots/ScreenshotService.ts#ScreenshotService.forClipboard -->

[`src/main/screenshots/ScreenshotService.ts`, lines 77–102](../../apps/desktop/src/main/screenshots/ScreenshotService.ts#L77-L102)

```ts
/**
 * The screenshots as one image for the clipboard (a link to Claude Desktop can't carry images).
 * One screenshot is left as it is; several are scaled to the same width and stacked top to
 * bottom. Null if a file is missing or not one of ours.
 */
forClipboard(paths: string[]): NativeImage | null {
  const images: NativeImage[] = []
  for (const path of paths) {
    const image = this.owns(path) ? nativeImage.createFromPath(path) : null
    if (!image || image.isEmpty()) return null
    images.push(image)
  }
  if (images.length <= 1) return images[0] ?? null
  const width = stackWidth(images.map((image) => image.getSize()))
  const stacked = stackBitmaps(
    images.map((image) => {
      const scaled =
        image.getSize().width === width ? image : image.resize({ width, quality: 'best' })
      return { ...scaled.getSize(), data: scaled.toBitmap() }
    }),
  )
  return nativeImage.createFromBitmap(stacked.data, {
    width: stacked.width,
    height: stacked.height,
  })
}
```

<!-- /code -->

Prepares the attached screenshots for Claude Desktop. A question goes to Claude Desktop as a link,
and a link can carry text but not images, so the screenshots go on the Windows clipboard to be
pasted into Claude with Ctrl+V, by Desktop Assist or by the user (see
[Claude Desktop](9-claude-desktop.md)). The clipboard holds only one image at a time, so several
screenshots are combined into one, stacked top to bottom. `copyScreenshots` in `index.ts` calls
this and puts the result on the clipboard as a PNG.

Unlike `forClaude()`, nothing is shrunk to Claude's preferred size or turned into a JPEG: the
screenshots keep their full size (apart from the scaling needed to stack them), and `index.ts`
copies them as a lossless PNG.

- `images: NativeImage[]`: each file is loaded first. If any one is missing, not inside the
  screenshots folder, or can't be read, the whole method returns `null`, and the question isn't
  sent with some of its screenshots silently left out.
- `this.owns(path) ? nativeImage.createFromPath(path) : null`: the inside-the-folder check, then
  loading the file, as in `thumbnail()`.
- `if (images.length <= 1) return images[0] ?? null`: one screenshot is used exactly as it is.
  With an empty list `images[0]` is `undefined`, so `?? null` gives `null` (the caller only asks
  when there's at least one).
- `stackWidth(images.map((image) => image.getSize()))`: the width to stack at, from `stack.ts`
  below: the narrowest screenshot's width, at most 2,560 pixels.
- `image.getSize().width === width ? image : image.resize({ width, quality: 'best' })`: scales
  each screenshot to that width (the height follows, keeping its shape). One that is already that
  wide is left alone. `'best'` keeps small text readable.
- `{ ...scaled.getSize(), data: scaled.toBitmap() }`: the image as raw pixels (a `Bitmap`), which
  is what `stackBitmaps()` works on. `toBitmap()` gives 4 bytes per pixel, in Electron's BGRA
  order (blue, green, red, alpha).
- `nativeImage.createFromBitmap(stacked.data, { width, height })`: turns the stacked pixels back
  into an image, which `index.ts` encodes as PNG.

### `ScreenshotService.open()` and `ScreenshotService.openFolder()`

<!-- code: apps/desktop/src/main/screenshots/ScreenshotService.ts#ScreenshotService.open,openFolder -->

[`src/main/screenshots/ScreenshotService.ts`, lines 104–118](../../apps/desktop/src/main/screenshots/ScreenshotService.ts#L104-L118)

```ts
/** Opens a screenshot in the default image viewer. Returns false if it no longer exists. */
async open(path: string): Promise<boolean> {
  if (!this.owns(path)) return false
  try {
    await fs.access(path)
  } catch {
    return false
  }
  return (await shell.openPath(path)) === ''
}

async openFolder(): Promise<void> {
  await fs.mkdir(this.dir, { recursive: true })
  await shell.openPath(this.dir)
}
```

<!-- /code -->

`open()` shows a screenshot in Windows' default image viewer, when a chip or a sent screenshot is
clicked. `openFolder()` opens the screenshots folder in File Explorer, from the settings menu.

- `fs.access(path)`: checks the file exists, and throws if it doesn't. Returning `false` lets the
  page show "That screenshot can't be found".
- `shell.openPath(path)`: Electron's "open this file with its default app", like double-clicking it.
  It resolves to an empty string on success and to an error message otherwise, hence the `=== ''`.
- `fs.mkdir(this.dir, { recursive: true })`: creates the folder if it doesn't exist yet (before the
  first screenshot), so there's always something to open. `recursive: true` also creates missing
  parent folders and doesn't fail if the folder already exists.

`openFolder()` takes no path from the page, so it needs no `owns()` check.

### `ScreenshotService.owns()`

<!-- code: apps/desktop/src/main/screenshots/ScreenshotService.ts#ScreenshotService.owns -->

[`src/main/screenshots/ScreenshotService.ts`, lines 120–123](../../apps/desktop/src/main/screenshots/ScreenshotService.ts#L120-L123)

```ts
/** Renderers may only ask about files inside the screenshots folder. */
private owns(path: string): boolean {
  return isInsideDir(this.dir, path)
}
```

<!-- /code -->

The inside-the-folder check used by `thumbnail()`, `forClaude()`, `forClipboard()` and `open()`.
It's a one-line wrapper around `isInsideDir()` in `files.ts`, which explains how the check works.

## `src/main/screenshots/files.ts`: naming, saving and finding screenshot files

Plain file helpers with no Electron in them, so they can be tested with ordinary files
(`tests/screenshotFiles.test.ts`). `ScreenshotService` uses them to name and save captures, to find
the newest one, and to check that a path is inside the screenshots folder.

### `screenshotFileName` and `isScreenshotFileName`

<!-- code: apps/desktop/src/main/screenshots/files.ts#SCREENSHOT_NAME,pad,screenshotFileName,isScreenshotFileName -->

[`src/main/screenshots/files.ts`, lines 5–19](../../apps/desktop/src/main/screenshots/files.ts#L5-L19)

```ts
const SCREENSHOT_NAME = /^Screenshot \d{4}-\d{2}-\d{2} \d{6}(?: \(\d+\))?\.png$/

const pad = (n: number) => String(n).padStart(2, '0')

/** "Screenshot 2026-10-02 140311.png", or "… (2).png" for a second capture in the same second. */
export function screenshotFileName(date: Date, copy = 1): string {
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return copy > 1 ? `Screenshot ${stamp} (${copy}).png` : `Screenshot ${stamp}.png`
}

export function isScreenshotFileName(name: string): boolean {
  return SCREENSHOT_NAME.test(name)
}
```

<!-- /code -->

`screenshotFileName()` builds a name such as `Screenshot 2026-10-02 140311.png` from a date, in
local time. The time is written `140311` rather than `14:03:11` because Windows doesn't allow `:` in
file names. `isScreenshotFileName()` checks whether a name has exactly this pattern.

- `SCREENSHOT_NAME`: a regular expression for our names. `\d{4}` means four digits, `(?: \(\d+\))?`
  an optional copy number such as `(2)` after a space, and `^` and `$` pin it to the whole name.
- `pad`: turns `7` into `07`, so every date part has a fixed width and the names sort in time order.
- `date.getMonth() + 1`: JavaScript numbers months from 0.
- `copy > 1 ?`: the second capture in the same second becomes `... (2).png`, and so on.

### `saveScreenshot`

<!-- code: apps/desktop/src/main/screenshots/files.ts#saveScreenshot -->

[`src/main/screenshots/files.ts`, lines 21–34](../../apps/desktop/src/main/screenshots/files.ts#L21-L34)

```ts
/** Saves a PNG into `dir` without ever overwriting an existing file. Returns the new path. */
export async function saveScreenshot(dir: string, png: Buffer, date: Date): Promise<string> {
  await fs.mkdir(dir, { recursive: true })
  for (let copy = 1; copy <= 100; copy++) {
    const path = join(dir, screenshotFileName(date, copy))
    try {
      await fs.writeFile(path, png, { flag: 'wx' })
      return path
    } catch (err) {
      if (!isErrno(err, 'EEXIST')) throw err
    }
  }
  throw new Error('Too many screenshots with the same timestamp')
}
```

<!-- /code -->

Writes the PNG into the folder under a new name, never replacing an existing file. This isn't an
atomic write (see `jsonFile.ts`): it never replaces a file, so at worst a crash leaves one
incomplete new image.

- `fs.mkdir(dir, { recursive: true })`: creates the folder on the first capture.
- `{ flag: 'wx' }`: "write, but fail if the file already exists". The check and the creation happen
  in one step in the operating system, so two captures can't both claim the same name.
- `isErrno(err, 'EEXIST')`: the name is taken, so the loop tries `(2)`, `(3)` and so on. Any other
  error (disk full, no permission) is thrown at once.
- `copy <= 100`: a limit, so the loop can't run forever.

### `findLatestScreenshot`

<!-- code: apps/desktop/src/main/screenshots/files.ts#findLatestScreenshot -->

[`src/main/screenshots/files.ts`, lines 36–56](../../apps/desktop/src/main/screenshots/files.ts#L36-L56)

```ts
/** The most recently written screenshot in `dir`, ignoring files we didn't name. */
export async function findLatestScreenshot(dir: string): Promise<string | null> {
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch (err) {
    if (isErrno(err, 'ENOENT')) return null
    throw err
  }
  let latest: { path: string; mtimeMs: number } | null = null
  for (const name of names.filter(isScreenshotFileName)) {
    const path = join(dir, name)
    try {
      const { mtimeMs } = await fs.stat(path)
      if (!latest || mtimeMs > latest.mtimeMs) latest = { path, mtimeMs }
    } catch {
      // Deleted between readdir and stat.
    }
  }
  return latest?.path ?? null
}
```

<!-- /code -->

Returns the path of the most recently written screenshot in the folder, or `null` if there are none.

- `isErrno(err, 'ENOENT')`: `ENOENT` means "no such file or directory". Before the first screenshot
  the folder doesn't exist, which just means there are no screenshots.
- `names.filter(isScreenshotFileName)`: only files with our names count, so other pictures dropped
  into the folder are never attached by accident.
- `mtimeMs > latest.mtimeMs`: picks by the time each file was last written, not by its name, so the
  file written last wins even if its name says otherwise (a test checks this).
- `// Deleted between readdir and stat.`: a file can disappear between listing the folder and
  looking at it; it's simply skipped.
- `latest?.path ?? null`: `?.` reads `path` only if `latest` isn't `null`.

### `isInsideDir`

<!-- code: apps/desktop/src/main/screenshots/files.ts#isInsideDir -->

[`src/main/screenshots/files.ts`, lines 58–62](../../apps/desktop/src/main/screenshots/files.ts#L58-L62)

```ts
/** True if `file` is inside `dir` (not `dir` itself). Case-insensitive on Windows. */
export function isInsideDir(dir: string, file: string): boolean {
  const rel = relative(resolve(dir), resolve(file))
  return rel !== '' && rel.split(/[\\/]/)[0] !== '..' && !isAbsolute(rel)
}
```

<!-- /code -->

The heart of the inside-the-folder check: is `file` really inside `dir` (or one of its subfolders),
and not `dir` itself?

A simple test such as "does the file's path start with the folder's path?" isn't safe.
`C:\Users\me\Pictures\Desktop Assist\..\..\Documents\taxes.pdf` starts with the folder's path but
points outside it, and `C:\Users\me\Pictures\Desktop Assist Copy\x.png` starts with the same text
but is a different folder. This function compares the real path structure instead. It works on the
path text alone and doesn't look at the disk.

- `relative(resolve(dir), resolve(file))`: `resolve` turns both into full, normalised paths, so any
  `..` parts are worked out first. `relative` then gives the route from the folder to the file. On
  Windows it ignores case, so `C:\USERS\...` still matches.
- `rel !== ''`: an empty route means `file` is the folder itself.
- `rel.split(/[\\/]/)[0] !== '..'`: a route that starts by going up a level leads outside the
  folder. Only the first part of the route is compared, so a file genuinely named `..notes.png`
  inside the folder is still allowed.
- `!isAbsolute(rel)`: on Windows a file on another drive has no relative route, so `relative`
  returns its full path (such as `D:\elsewhere\shot.png`). An absolute result means "not inside".

## `src/main/screenshots/imageSize.ts`: sizing images for Claude

One small calculation, kept apart from `ScreenshotService` so it can be tested without Electron (in
`tests/claudeHelpers.test.ts`). `ScreenshotService.forClaude()` uses it to choose the size to scale
a screenshot to.

<!-- code: apps/desktop/src/main/screenshots/imageSize.ts -->

[`src/main/screenshots/imageSize.ts`, lines 1–15](../../apps/desktop/src/main/screenshots/imageSize.ts#L1-L15)

```ts
import type { Size } from '@shared/geometry'

/** Screenshots sent to Claude are scaled so their longest side is at most this many pixels. */
export const MAX_IMAGE_EDGE = 1568

/** Scales `size` down (never up) so its longest side fits within `maxEdge`, keeping the shape. */
export function fitWithin(size: Size, maxEdge: number = MAX_IMAGE_EDGE): Size {
  const longest = Math.max(size.width, size.height)
  if (longest <= maxEdge) return { ...size }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  }
}
```

<!-- /code -->

- `MAX_IMAGE_EDGE = 1568`: the long-edge limit in Anthropic's guidance for images. Bigger images are
  scaled down by the API before Claude looks at them, so sending more pixels only makes requests
  bigger and slower.
- `size: Size`: `Size` is `{ width, height }`, from `src/shared/geometry.ts`.
- `maxEdge: number = MAX_IMAGE_EDGE`: a default parameter. The app always uses the default; the
  tests pass a value explicitly.
- `return { ...size }`: already small enough, so the size stays the same (returned as a copy). It
  never scales up.
- `const scale = maxEdge / longest`: one factor for both sides keeps the shape. For example,
  1920×1080 becomes 1568×882.
- `Math.max(1, Math.round(size.width * scale))`: rounding could make a very thin image's short side
  0 pixels; this keeps every side at least 1.

## `src/main/screenshots/stack.ts`: stacking screenshots into one image

The pixel arithmetic behind `ScreenshotService.forClipboard()`: putting several screenshots one
above the other in a single image, with a grey band between them. It works on raw pixels and has
no Electron in it, so `tests/screenshotStack.test.ts` can check it with tiny made-up images.

### `Bitmap`, `MAX_STACK_WIDTH`, `STACK_GAP` and `GAP_PIXEL`

<!-- code: apps/desktop/src/main/screenshots/stack.ts#Bitmap,MAX_STACK_WIDTH,STACK_GAP,GAP_PIXEL -->

[`src/main/screenshots/stack.ts`, lines 3–14](../../apps/desktop/src/main/screenshots/stack.ts#L3-L14)

```ts
/** Raw pixels, 4 bytes each (Electron's BGRA bitmaps), row after row with no padding. */
export interface Bitmap extends Size {
  data: Buffer
}

/** Stacked screenshots are never wider than this, to keep the combined image a sensible size. */
export const MAX_STACK_WIDTH = 2560

/** Height of the grey band between stacked screenshots, in pixels. */
export const STACK_GAP = 12

const GAP_PIXEL = Buffer.from([0x99, 0x99, 0x99, 0xff])
```

<!-- /code -->

- `interface Bitmap extends Size`: a `Size` (`width` and `height`, from
  `src/shared/geometry.ts`) plus `data`, the pixels. `extends` adds fields to an existing type.
- `data: Buffer`: as the comment says, 4 bytes per pixel, row after row: the top row's pixels
  first, left to right, then the next row, and so on. So the pixel at column x, row y starts at
  byte `(y * width + x) * 4`. Some image formats add padding at the end of each row;
  `stackBitmaps()` checks there is none.
- `MAX_STACK_WIDTH = 2560`: the widest a stacked image gets (see `stackWidth()`).
- `STACK_GAP = 12`: the grey band, so it's clear where one screenshot ends and the next begins.
- `Buffer.from([0x99, 0x99, 0x99, 0xff])`: one pixel. Blue, green and red are all `0x99` (153 out
  of 255, a mid-grey), and alpha is `0xff`, fully opaque. With the three colours equal, the byte
  order doesn't matter.

### `stackWidth()`

<!-- code: apps/desktop/src/main/screenshots/stack.ts#stackWidth -->

[`src/main/screenshots/stack.ts`, lines 16–19](../../apps/desktop/src/main/screenshots/stack.ts#L16-L19)

```ts
/** The width screenshots are scaled to before stacking: the narrowest one's, so none is enlarged. */
export function stackWidth(sizes: Size[]): number {
  return Math.min(MAX_STACK_WIDTH, ...sizes.map((size) => size.width))
}
```

<!-- /code -->

Every screenshot in a stack must be the same width, so they're all scaled to this one first.

- `...sizes.map((size) => size.width)`: `...` spreads the list of widths into separate arguments
  for `Math.min()`.
- `Math.min(MAX_STACK_WIDTH, ...)`: the narrowest screenshot's width, so screenshots are only
  ever shrunk to match, never enlarged (which would blur them). The cap stops two screenshots of
  a 4K screen (3,840 pixels wide) from making a needlessly huge image.

### `stackBitmaps()`

<!-- code: apps/desktop/src/main/screenshots/stack.ts#stackBitmaps -->

[`src/main/screenshots/stack.ts`, lines 21–35](../../apps/desktop/src/main/screenshots/stack.ts#L21-L35)

```ts
/** One image of `bitmaps` from top to bottom, with a grey band between each. All must be as wide. */
export function stackBitmaps(bitmaps: Bitmap[]): Bitmap {
  const width = bitmaps[0]?.width
  if (width === undefined) throw new Error('Nothing to stack')
  for (const bitmap of bitmaps) {
    if (bitmap.width !== width) throw new Error('Stacked images must be the same width')
    if (bitmap.data.length !== bitmap.width * bitmap.height * 4) {
      throw new Error('Unexpected bitmap layout')
    }
  }
  const gap = Buffer.alloc(width * STACK_GAP * 4, GAP_PIXEL)
  const parts = bitmaps.flatMap((bitmap, i) => (i === 0 ? [bitmap.data] : [gap, bitmap.data]))
  const height = bitmaps.reduce((sum, b) => sum + b.height, 0) + STACK_GAP * (bitmaps.length - 1)
  return { width, height, data: Buffer.concat(parts) }
}
```

<!-- /code -->

Joins the bitmaps into one, top to bottom. Because each bitmap is stored row after row, and they
are all the same width, stacking is just putting one buffer after another: the first image's rows,
then the gap's rows, then the second image's rows. No pixel has to be moved one at a time.

- `bitmaps[0]?.width`, `throw new Error('Nothing to stack')`: an empty list is a mistake in the
  calling code. (`forClipboard()` only stacks two or more.)
- `if (bitmap.width !== width) throw`, `bitmap.data.length !== bitmap.width * bitmap.height * 4`:
  checks the two things the joining relies on. A wrong width or padded rows would give a garbled
  image, so it fails loudly instead.
- `Buffer.alloc(width * STACK_GAP * 4, GAP_PIXEL)`: the grey band, `STACK_GAP` rows of `width`
  pixels. `Buffer.alloc(size, fill)` repeats the 4-byte `GAP_PIXEL` to fill it.
- `bitmaps.flatMap((bitmap, i) => (i === 0 ? [bitmap.data] : [gap, bitmap.data]))`: the pieces
  in order: the first image, then a gap before each of the others. `flatMap` turns each item into
  a list and joins the lists into one.
- `bitmaps.reduce((sum, b) => sum + b.height, 0) + STACK_GAP * (bitmaps.length - 1)`: the total
  height, the images' heights added up plus one gap fewer than there are images.
- `Buffer.concat(parts)`: copies the pieces into one buffer, the stacked image.

## `src/main/storage/jsonFile.ts`: safe files

The low-level helpers for files the app saves: reading a JSON file and checking it with a schema,
and writing files atomically. `NotesStore` (the draft), `SettingsService` in `settings.ts`
(`preferences.json`) and `SecretStore` (the encrypted sign-in, through `writeFileAtomic`) all use
them, and `isErrno` is used across the main process.

Key ideas:

- **Reading never trusts the file.** The text must parse as JSON and match a zod schema, and the
  caller gets a clear result: `ok`, `missing` or `invalid`.
- **Atomic writes.** Never write over the real file directly. Write the whole content to a temporary
  file in the same folder, then rename it over the real one. A rename within one drive replaces the
  file in a single step, so anyone reading the file, or the app after a crash, sees either the
  complete old version or the complete new one.

### `ReadResult` and `readJsonFile`

<!-- code: apps/desktop/src/main/storage/jsonFile.ts#ReadResult,readJsonFile -->

[`src/main/storage/jsonFile.ts`, lines 5–21](../../apps/desktop/src/main/storage/jsonFile.ts#L5-L21)

```ts
export type ReadResult<T> =
  { status: 'ok'; value: T } | { status: 'missing' } | { status: 'invalid'; error: unknown }

export async function readJsonFile<T>(path: string, schema: ZodType<T>): Promise<ReadResult<T>> {
  let raw: string
  try {
    raw = await fs.readFile(path, 'utf8')
  } catch (err) {
    if (isErrno(err, 'ENOENT')) return { status: 'missing' }
    throw err
  }
  try {
    return { status: 'ok', value: schema.parse(JSON.parse(raw)) }
  } catch (error) {
    return { status: 'invalid', error }
  }
}
```

<!-- /code -->

`readJsonFile()` reads a JSON file and checks it against a zod schema. `ReadResult` is what it
returns.

- `{ status: 'ok'; value: T }`: one of three possible shapes, told apart by `status` (a
  "discriminated union"). Once the caller has checked `result.status === 'ok'`, TypeScript knows
  `result.value` exists.
- `ZodType<T>`: `T` is a generic type parameter: whatever type the schema describes. For
  `NotesFileSchema`, the value comes back typed as the notes file's shape, with no casts needed.
- `fs.readFile(path, 'utf8')`: reads the whole file as text.
- `isErrno(err, 'ENOENT')`: no file is normal (the first run), so it's `missing`, not an error. Any
  other error, such as no permission, is thrown.
- `schema.parse(JSON.parse(raw))`: `JSON.parse` throws on text that isn't JSON, and `schema.parse`
  throws if the JSON has the wrong shape. Both end up as `invalid`, with the error attached. Callers
  decide what that means: `NotesStore.load()` sets the file aside, and `SettingsService.init()`
  falls back to default preferences.

### `tmpPath`

<!-- code: apps/desktop/src/main/storage/jsonFile.ts#tmpCounter,tmpPath -->

[`src/main/storage/jsonFile.ts`, lines 23–24](../../apps/desktop/src/main/storage/jsonFile.ts#L23-L24)

```ts
let tmpCounter = 0

const tmpPath = (path: string) => `${path}.${process.pid}.${++tmpCounter}.tmp`
```

<!-- /code -->

Makes a unique temporary file name next to the target, such as `notes.json.12345.3.tmp`.

- `process.pid`: the process ID, so two running copies of the app can't pick the same name.
- `++tmpCounter`: a counter, so two writes in progress at once in this process can't either. That
  can happen: `SettingsService` doesn't queue its saves the way `NotesStore` does.

The temporary file is in the same folder as the target on purpose: a rename only swaps the file in
one step when both names are on the same drive.

### `writeJsonFile`

<!-- code: apps/desktop/src/main/storage/jsonFile.ts#writeJsonFile -->

[`src/main/storage/jsonFile.ts`, lines 26–37](../../apps/desktop/src/main/storage/jsonFile.ts#L26-L37)

```ts
/**
 * Writes via a temp file and a rename, so a crash mid-write can't leave a half-written file.
 * `shouldCommit` runs just before the rename; returning false discards the write (used to drop
 * a write that a newer one has already overtaken). Resolves to whether the file was replaced.
 */
export function writeJsonFile(
  path: string,
  value: unknown,
  shouldCommit: () => boolean = () => true,
): Promise<boolean> {
  return writeFileAtomic(path, JSON.stringify(value, null, 2), shouldCommit)
}
```

<!-- /code -->

Saves a value as JSON, atomically. It's a thin wrapper around `writeFileAtomic()`, and resolves to
`true` if the file was replaced or `false` if `shouldCommit` said no.

- `JSON.stringify(value, null, 2)`: turns the value into JSON text, indented by 2 spaces so a person
  can read the file.
- `shouldCommit: () => boolean = () => true`: an optional last-moment check, passed on to
  `writeFileAtomic()`. By default every write is kept; `NotesStore.write()` passes one that drops
  overtaken writes.

### `writeFileAtomic`

<!-- code: apps/desktop/src/main/storage/jsonFile.ts#writeFileAtomic -->

[`src/main/storage/jsonFile.ts`, lines 39–54](../../apps/desktop/src/main/storage/jsonFile.ts#L39-L54)

```ts
/** The same temp-file-and-rename write for any content (text or binary). */
export async function writeFileAtomic(
  path: string,
  data: string | Buffer,
  shouldCommit: () => boolean = () => true,
): Promise<boolean> {
  await fs.mkdir(dirname(path), { recursive: true })
  const tmp = tmpPath(path)
  await fs.writeFile(tmp, data)
  if (!shouldCommit()) {
    await fs.rm(tmp, { force: true })
    return false
  }
  await renameWithRetry(tmp, path)
  return true
}
```

<!-- /code -->

The atomic write itself, for any content: JSON text or binary data (`SecretStore.save()` writes
encrypted bytes with it).

- `fs.mkdir(dirname(path), { recursive: true })`: makes sure the folder exists first.
- `await fs.writeFile(tmp, data)`: the slow part, writing all the bytes, happens on the temporary
  file. The real file is untouched meanwhile.
- `if (!shouldCommit())`: asked after the temporary file is written and just before the rename, so
  it sees the latest state. If the answer is no, the temporary file is deleted and the real file
  stays as it was.
- `fs.rm(tmp, { force: true })`: `force` means "don't fail if it's already gone".
- `renameWithRetry(tmp, path)`: moves the new file into place. Node's `fs.rename` replaces the
  target if it exists.

If writing or renaming fails, the error goes to the caller and the real file is unchanged, though
the temporary file may be left behind.

### `writeJsonFileSync`

<!-- code: apps/desktop/src/main/storage/jsonFile.ts#writeJsonFileSync -->

[`src/main/storage/jsonFile.ts`, lines 56–61](../../apps/desktop/src/main/storage/jsonFile.ts#L56-L61)

```ts
export function writeJsonFileSync(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = tmpPath(path)
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  renameSync(tmp, path)
}
```

<!-- /code -->

The same temp-file-and-rename write, but blocking: each step finishes before the next line runs, and
the function returns only when the file is in place. `NotesStore.flushSync()` uses it when Windows
is ending the session. It has no `shouldCommit` check and doesn't retry a failed rename.

- `mkdirSync`, `writeFileSync` and `renameSync`: Node's blocking versions of `fs.mkdir`,
  `fs.writeFile` and `fs.rename`.

### `renameWithRetry`

<!-- code: apps/desktop/src/main/storage/jsonFile.ts#renameWithRetry -->

[`src/main/storage/jsonFile.ts`, lines 63–75](../../apps/desktop/src/main/storage/jsonFile.ts#L63-L75)

```ts
// On Windows, antivirus and the search indexer can hold the target open for a moment.
async function renameWithRetry(from: string, to: string, attempts = 5): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await fs.rename(from, to)
      return
    } catch (err) {
      const transient = ['EPERM', 'EBUSY', 'EACCES'].some((code) => isErrno(err, code))
      if (!transient || attempt >= attempts) throw err
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt))
    }
  }
}
```

<!-- /code -->

Renames a file, trying again a few times if Windows briefly refuses. As the comment above it says,
antivirus software and the search indexer can hold a file open for a moment, and a rename onto it
then fails.

- `['EPERM', 'EBUSY', 'EACCES']`: the error codes Windows gives in that case (operation not
  permitted, busy, access denied). Any other error is thrown at once.
- `for (let attempt = 1; ; attempt++)`: a loop with no end condition. It leaves by `return`
  (success) or `throw` (giving up after the fifth attempt).
- `new Promise((resolve) => setTimeout(resolve, 25 * attempt))`: the usual way to `await` a pause in
  JavaScript. The waits grow: 25, 50, 75 and then 100 ms between the five attempts, at most a
  quarter of a second in all.

### `isErrno`

<!-- code: apps/desktop/src/main/storage/jsonFile.ts#isErrno -->

[`src/main/storage/jsonFile.ts`, lines 77–79](../../apps/desktop/src/main/storage/jsonFile.ts#L77-L79)

```ts
export function isErrno(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && (err as NodeJS.ErrnoException).code === code
}
```

<!-- /code -->

Checks whether an error is a Node file-system error with a given code, such as `ENOENT` (not found)
or `EEXIST` (already exists). It's used by `readJsonFile()` and `renameWithRetry()` here, by
`saveScreenshot()` and `findLatestScreenshot()` in `files.ts`, and by `SecretStore.load()`.

- `err: unknown`: with the project's `strict` TypeScript settings, a caught error has the type
  `unknown`, because any value can be thrown. It has to be checked before reading `.code`.
- `typeof err === 'object' && err !== null`: `typeof null` is also `'object'`, hence the second
  test.
- `(err as NodeJS.ErrnoException).code`: once it's known to be an object, it's treated as Node's
  error type so its `code` can be read. If there's no `code`, the comparison is simply false.
