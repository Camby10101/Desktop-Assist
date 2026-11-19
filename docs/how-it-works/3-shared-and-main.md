# Part 3 — Module by module

This part walks through `apps/desktop/src` from the bottom layer up: the shared definitions first,
then what's kept on disk, the main process's start-up and switchboard, the character, her bigger
acts, the features, and finally the pages. Each entry explains what a class or function is for,
what goes in and comes out, and why it works the way it does. Keep the code open alongside.

## 12. shared/ — the common language

**Folder:** `src/shared/` · **Job:** types and constants that the main process, the preload and the
pages must agree on. **Used by:** everything. It imports nothing from the other parts, so it can be
compiled into all of them.

#### `geometry.ts`

Sizes and places. `UI` holds the fixed measurements (her box, 80 DIPs; its padding, 8; her headroom,
8; how far she stays from the screen's edge, 16), `CHARACTER_SIZES` her sizes from ½× to 6×, and
`bubbleMetrics(scale)` everything about her at one size:

```ts
export const CHARACTER_SIZES = [0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6] as const

export function bubbleMetrics(scale: number = DEFAULT_SIZE) {
  return {
    size: UI.bubbleSize * scale, // her box: 80 at her usual size
    pad: UI.bubblePad * scale, // room round it: 8
    box: BUBBLE_BOX * scale, // box and padding: 96, her window's width
    headroom: UI.bubbleHeadroom * scale, // above her hat, for hops: 8
  }
}
```

#### `character.ts`

Everything she can do, by name, and for how long. `FIDGETS` lists her 37 habits and `FIDGET_MS`
their lengths; `SPELL_POSES` the three poses of her own for spells (`chant`, `vanish`, `appear`);
`REACTIONS` the things she does in answer to something (`pet`, `scroll`, `startle`, the pounces,
`guilty`, `settle`, `rouse` …) and `HELD_POSES` the ones held for as long as something lasts
(`watch`, the peeks, `portal`, `snooze`). The `Pose` type is the union of all of them plus `idle`,
the walks, `dragged`, `flung` and `splat`. Small timetables live here too: `SNOOZE`, `DRAG_CHECK`,
`FAMILIAR`, `VISION`, `CLONES`, `LANDING`.

Two habits only come up at certain times. `TIMED` says when, and how likely they are then
(against 1 for an ordinary habit); `inSeason()` answers "can this habit happen now?":

```ts
export const TIMED = {
  yawn: { from: 22, to: 6, weight: 1 }, // 10pm to 6am
  confetti: { day: 5, from: 16, to: 20, weight: 5 }, // Fridays, 4pm to 8pm, five times as likely
} as const

export function inSeason(fidget: Fidget, when: Date): boolean {
  const hour = when.getHours()
  if (fidget === 'yawn') return hour >= TIMED.yawn.from || hour < TIMED.yawn.to
  if (fidget === 'confetti') {
    return when.getDay() === TIMED.confetti.day && hour >= TIMED.confetti.from && hour < TIMED.confetti.to
  }
  return true
}
```

> **Good to know**
> The yawn's hours wrap past midnight, so its test is "after 10pm **or** before 6am", not "and". A
> range that wraps is a classic place for an off-by-one bug; `tests/moments.test.ts` checks 9:59pm,
> 10pm, 5:59am and 6am.

#### `spells.ts`, `actions.ts`, `tricks.ts`

`SPELLS` lists her eleven spells in menu order, `SPELL_LABELS` their names, and `CAST_POSE` the habit
she plays while each is drawn (the explosion's is her chant). `ACTION_IDS` lists the icons above her,
and `ACTIONS` says whether each is a **command** (it does something: screenshot, screen saver, close,
service desk) or a **popover** (it opens something in the panel: Ask, Apps, Jira, Settings, Spells).
`tricks.ts` holds the taskbar tricks' timelines, shared by the main process and the page that draws
them (section 19).

#### `ipc.ts` and `types.ts`

`ipc.ts` is the contract between the pages and the main process: `IPC`, every channel name, and
`AssistApi`, the type of `window.assist`. `types.ts` holds the data that crosses it: `AppState` (what
a page needs to draw itself), `Mode` (the bubble's five modes), `Settings`, `JiraFeed` and so on.

```ts
export const IPC = {
  getState: 'assist:get-state',
  bubbleClick: 'assist:bubble-click',
  bubbleDragStart: 'assist:bubble-drag-start',
  // … about seventy more
} as const
```

> **Why it's built this way**
> The channel names are strings, and a typo in a string is invisible until it fails at run time.
> Writing `IPC.bubbleClick` instead of `'assist:bubble-click'` on both sides turns a typo into a
> compile error, and `AssistApi` makes the preload, the pages and the main process agree on every
> argument and answer.

## 13. What's kept on disk

**Files:** `settings.ts`, `notes/NotesStore.ts`, `screenshots/`, `storage/` · **Job:** remember things
between runs, without ever leaving a half-written file. **Used by:** `index.ts`, `ipc.ts`.

Everything lives in `%APPDATA%\Desktop Wizard` (screenshots go to `Pictures\Desktop Wizard`):

| File                                  | What's in it                                                                                                                      | Written by        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `preferences.json`                    | light or dark, her size, robe colour, where she stands, Stand still, No idle animations, No hat, starred apps, Send automatically | `SettingsService` |
| `notes.json`                          | the unsent question and its attached screenshots                                                                                  | `NotesStore`      |
| `atlassian.json`                      | which Jira notifications and request replies have been seen                                                                       | `Atlassian`       |
| `jumpcloud-apps.bin`, `atlassian.bin` | the Apps list's and Jira's sign-ins, encrypted                                                                                    | `McpAccount`      |
| `logs\desktop-wizard.log`             | problems worth knowing about, for diagnosing an installed copy                                                                    | `log.ts`          |

#### `writeFileAtomic(path, data, shouldCommit)` (in `storage/jsonFile.ts`)

Every file is written the same safe way: to a temporary file first, then renamed over the real one.
A rename is all-or-nothing, so a crash or power cut mid-write leaves either the old file or the new
one, never half of each:

```ts
export async function writeFileAtomic(path, data, shouldCommit = () => true): Promise<boolean> {
  await fs.mkdir(dirname(path), { recursive: true })
  const tmp = tmpPath(path) // e.g. notes.json.1234.7.tmp
  await fs.writeFile(tmp, data)
  if (!shouldCommit()) {
    await fs.rm(tmp, { force: true }) // a newer write has overtaken this one
    return false
  }
  await renameWithRetry(tmp, path) // antivirus can hold the file for a moment: retry
  return true
}
```

Reading is just as careful: `readJsonFile(path, schema)` answers `ok`, `missing` or `invalid`, and
each store decides what to do with a damaged file (usually: start afresh, and say so in the log)
instead of crashing.

#### `NotesStore`

The text box's contents. Typing calls `setText()` on every key press; the store keeps the text in
memory and writes `notes.json` half a second after the last change (a **debounce**), so a fast typist
causes one write, not hundreds. Writes queue one behind another, and a write overtaken by a newer
one is dropped (that's what `shouldCommit` is for). `flushSync()` writes at once when Windows is
shutting down, because Windows doesn't wait for anything slower.

#### `SettingsService`

Reads `preferences.json` through a zod schema (`PreferencesSchema`), so a hand-edited file with a
wrong value can't put a bad value into the app. Each `set…()` saves and applies its change: the
theme through Electron's `nativeTheme.themeSource`, which every page sees as `prefers-color-scheme`;
Start with Windows through `app.setLoginItemSettings()`.

#### `ScreenshotService`

`capture()` saves a PNG of her screen with a name that never overwrites an older one;
`latest()` finds the newest one not yet attached; `forClaude()` shrinks one so its longest side is at
most 1,568 pixels; `forClipboard()` stacks several into one image. `isInsideDir()` makes sure any
path a page sends really is in the screenshots folder.

#### `SecretStore`

Keeps one secret in a file, encrypted with Windows DPAPI through Electron's `safeStorage`:

```ts
async save(secret: string): Promise<void> {
  if (!this.encryptor.isAvailable()) {
    throw new Error("Windows can't encrypt data on this PC, so the sign-in wasn't saved.")
  }
  await writeFileAtomic(this.filePath, this.encryptor.encrypt(secret))
}
```

> **Security**
> If encryption isn't available, the secret is not saved at all, rather than saved in plain text.
> A file that can't be decrypted (copied from another user's profile, say) loads as "nothing
> saved", and the person simply signs in again.

## 14. index.ts — starting up and wiring

**File:** `src/main/index.ts` · **Job:** start the app, make every part, and connect them.
**Used by:** Electron, which runs it first.

`index.ts` is the only file that knows about every other part. Everything else is handed what it
needs; `index.ts` is where the handing happens. It starts with two guards, before anything else:

```ts
// An installed copy won't start with debugging switched on (see debugging.ts).
const refusedSwitches = app.isPackaged ? debugSwitches((name) => app.commandLine.hasSwitch(name)) : []

if (refusedSwitches.length) {
  createLog(…)(`Refused to start with ${refusedSwitches.map((name) => `--${name}`).join(' ')}`)
  app.exit(1)
} else if (!app.requestSingleInstanceLock()) {
  app.quit() // already running: that copy opens its panel instead
} else {
  app.on('second-instance', () => controller?.expand())
  app.whenReady().then(start).catch(fail)
}
```

#### `start()`

In order, it:

1. checks `tenant.json` against `TenantSchema` (zod), removes the app menu, and opens the log;
2. loads the draft (`NotesStore`) and the preferences (`SettingsService`);
3. creates the bubble and panel windows, hidden, **after the last `await`**, so no page can ask for
   the app's state before there's anything to answer with;
4. makes the parts of the character: her familiar, her vision, her spells' effects, the shell probe
   and her taskbar and window tricks (Windows only), her `Performances`, the `BubbleController`
   itself, her clones and the screen saver;
5. makes the features the tenant asks for: Claude Desktop or the built-in chat, the Apps list,
   Jira, the service desk, the updater;
6. registers every IPC handler (`registerIpc`) and the tray icon;
7. waits for both pages to be ready, then `bubble.start()` stands her on the taskbar, her page is
   told she's arriving (she forms out of white motes), and a check runs for ten minutes to make sure
   she isn't stuck behind other windows.

Most connections are callbacks handed to `BubbleController`. When her pose changes, for example,
`index.ts` tells both pages, tells her familiar, and starts or stops her vision's window:

```ts
onPoseChange: (pose) => {
  broadcast(IPC.poseChanged, pose)
  familiar.see(bubbleWindow.getBounds(), pose)
  if (pose === 'vision') vision.start(bubble.standing)
  else vision.stop()
  // The explosion is called off if she stops chanting before it's done.
  if (pose !== 'chant' && effects.chanting) effects.stop()
},
```

#### `openOverlay(view, above)`

Makes the opener each passive window is given: it creates the window for `view`, places it, shows
it once its page has painted (without taking the focus), and puts her back in front unless the window
is meant to be `above` her (a trick's icons pass in front of her). It returns what the window's owner
needs and nothing more: its id, `close()` and `send()`.

#### `castSpell(spell)`

What the Spells menu calls. It closes the panel so the spell can be seen, then:

```ts
if (spell === 'clones') {
  clones.start(bubble.standing)
  bubble.act('spell')
} else if (spell === 'teleport') {
  bubble.teleport()
} else if (spell === 'familiar') {
  familiar.start(bubble.standing, FAMILIAR.summonMs) // her black cat, for a minute
  bubble.act('spell')
} else {
  effects.start(spell, bubble.standing) // drawn over the screen…
  bubble.act(CAST_POSE[spell]) // …while she acts it out
}
```

#### Shutting down

`before-quit` stops every part (her windows, the shell probe, the screen saver, the Jira checks),
removes the tray icon, and waits up to two seconds for the draft to be saved before letting the app
quit. Close from the panel first plays `farewell()`: she dissolves into white motes, and the app
quits when she's gone.

> **Why it's built this way**
> One place that builds everything makes the app's shape easy to see, and keeps every other file
> free of global state: `BubbleController` doesn't import the screen saver, and the screen saver
> doesn't import Electron's windows. Each is handed what it uses, so each can be tested alone.

## 15. ipc.ts — the switchboard

**File:** `src/main/ipc.ts` · **Job:** answer every request from the pages, and refuse anything odd.
**Used by:** `index.ts`, which calls `registerIpc(context)` once.

`registerIpc` is handed an `IpcContext`: the windows allowed to call in, and every part a request
might need (`controller`, `notes`, `settings`, `claudeDesktop`, `atlassian`, and so on, some of them
`null` when the tenant doesn't have that feature). It defines two helpers and registers each channel
with one of them:

```ts
export function registerIpc(ctx: IpcContext): void {
  const trusted = (sender: WebContents) => ctx.windows.some((w) => w.webContents.id === sender.id)

  function handle(channel, schema, run) {
    ipcMain.handle(channel, (event, raw) => {
      if (!trusted(event.sender)) throw new Error(`Untrusted sender for ${channel}`)
      return run(schema.parse(raw)) // throws on a bad argument
    })
  }
  function on(channel, schema, run) {
    ipcMain.on(channel, (event, raw) => {
      if (!trusted(event.sender)) return
      const parsed = schema.safeParse(raw)
      if (parsed.success) run(parsed.data, event) // a bad argument is ignored
    })
  }

  on(IPC.bubbleClick, z.number().finite().optional(), (pressedAt) => ctx.controller.clickBubble(pressedAt))
  on(IPC.bubblePet, NoArgs, () => ctx.controller.pet())
  handle(IPC.invokeAction, z.enum(COMMAND_ACTION_IDS), (id) => ctx.actions[id]())
  handle(IPC.openExternal, ExternalUrl, (url) => shell.openExternal(url))
  // … every other channel
}
```

Every argument has a **zod schema**: the text box at most `MAX_NOTE_LENGTH` characters, a Jira issue
key matching `^[A-Z][A-Z0-9_]{1,9}-\d{1,7}$`, logged time in Jira's own format ("1h 30m"), a size
from `CHARACTER_SIZES`, a spell from `SPELLS`. The screen saver's and the tricks' pages aren't among
the trusted windows; each of those owners listens only to its own pages (by sender id).

> **Security**
> Treat everything a page sends as untrusted, even though the pages are the app's own: a page shows
> text from Jira, Confluence and Claude, and if any of it ever managed to run as script, this is the
> wall it would hit. `openExternal`, for instance, opens only `http:`, `https:` and `mailto:` links,
> so a crafted link can't open `file:` paths or start programs.
