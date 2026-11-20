# Part 2 — Ideas you'll meet

A few ideas come up again and again in the code. If any are new to you, read this part first;
otherwise skip ahead to Part 3.

## 6. Electron: processes, windows and IPC

The main process and the pages are separate programs, so they can't call each other's functions.
They talk with **IPC** (inter-process communication): one side sends a message on a named
**channel**, the other listens on that channel. Every channel name is in `src/shared/ipc.ts`, and
there are three kinds of conversation:

| Pattern                                 | Direction          | Used for                                        | Example                                 |
| --------------------------------------- | ------------------ | ----------------------------------------------- | --------------------------------------- |
| `ipcRenderer.send` → `ipcMain.on`       | page → main        | telling the main process something; no answer   | a click on her: `assist:bubble-click`   |
| `ipcRenderer.invoke` → `ipcMain.handle` | page → main → page | asking for something and waiting for the answer | `settings.get()`: `assist:settings-get` |
| `webContents.send` → `ipcRenderer.on`   | main → page        | the main process announcing a change            | her new pose: `assist:pose-changed`     |

Pages never see `ipcRenderer` itself. Each window is created with `sandbox: true`,
`contextIsolation: true` and `nodeIntegration: false`, so the page has no Node and no Electron;
the preload script gives it `window.assist` instead, an object of plain functions such as
`window.assist.bubbleClick()` and `window.assist.onPoseChanged(callback)`.

> **Security**
> If a page could use Node, any text it displayed (a Jira comment, Claude's reply) that managed to
> run as script could read files or start programs. Sandboxed pages with a fixed bridge can only
> ask the main process for the handful of things it offers, and the main process checks every
> request (section 15).

## 7. TypeScript ideas

### Types and interfaces

TypeScript adds types to JavaScript and checks them before the code runs (`npm run typecheck`).
Types disappear when the code is compiled; they're there to catch mistakes and to document. An
`interface` names the shape of an object:

```ts
export interface Performance {
  /** At `t` ms since it began: where her box is (DIP) and her pose; null once it's over. */
  at(t: number): { x: number; y: number; pose: Pose } | null
  /** It's over: finished, or cut short (the user picked her up, say). */
  end(finished: boolean): void
}
```

`A | null` means "an A, or nothing". A `?` after a name (`now?: () => number`) means it may be left
out.

### Lists that are also types

The code often lists names once, in an array, and gets a type from it, so the list and the type
can never disagree:

```ts
export const REACTIONS = ['pet', 'scroll', 'startle', /* … 11 in all … */ 'rouse'] as const
export type Reaction = (typeof REACTIONS)[number] // 'pet' | 'scroll' | 'startle' | … | 'rouse'
```

`as const` tells TypeScript the array will never change, so it remembers each exact string rather
than just "strings". `(typeof REACTIONS)[number]` then means "any item of that array". Add a reaction
to the array and the type grows with it; every `Record<Reaction, number>` (an object with a value for
each reaction, like `REACTION_MS`, their lengths) then fails to compile until the new one is given a
value too. That's the compiler reminding you of everything that needs to know about it.

Her habits go one step further: each is an entry in one table, its name the key and its details
(how long, what kind) the value, and the type is the table's keys, so a new habit is one entry:

```ts
const HABIT_LIST = {
  /** A little jump. */
  hop: { ms: 1200, kind: 'everyday' },
  // … 38 in all
} satisfies Record<string, Habit>
export type Fidget = keyof typeof HABIT_LIST // 'hop' | 'wave' | … | 'dance'
```

### Unions that say what kind

A value that can be one of several shapes carries a `kind` saying which, and TypeScript narrows
the type once you've checked it:

```ts
export type Activity =
  | { kind: 'walk'; to: number }
  | { kind: 'fidget'; pose: Fidget }
  | { kind: 'perform'; name: PerformanceName }
  | { kind: 'rest' }

if (activity.kind === 'walk') this.walkTo(activity.to) // `to` exists only on a walk
```

### Dependencies passed in

The big classes never reach out for the things they use; they're handed them when they're made, as
a `deps` object. `BubbleController` doesn't know about Electron windows at all: it's given a
`Surface` (something with `setBounds`, `show` and `hide`), a `Displays` (where the screens are, where
the pointer is), a clock (`now`) and dice (`random`). In the app those are real windows and
`Date.now`; in the tests they're fakes that record what happened.

> **Why it's built this way**
> Passing things in is what makes the app testable. A test can stand her on a pretend 1920 × 1040
> screen, roll the dice to always come up 0.5, move a fake clock forward 38 seconds, and check she
> walked exactly where she should, in milliseconds, without opening a window.

## 8. React ideas

The pages are built with **React**. A component is a function that returns what to show (written
in JSX, which looks like HTML), and React calls it again whenever its data changes.

- **Props** are a component's inputs: `<Character pose="hop" facing="left" box={96} />`.
- **State** (`useState`) is data a component keeps between calls; setting it redraws the component.
- **Effects** (`useEffect`) run after drawing, for anything outside React: timers, listeners. An
  effect can return a function that undoes it, which React runs when the component goes away.
- **Refs** (`useRef`) hold a value that survives redraws without causing one, such as whether the
  mouse button is down.

Because `window.assist`'s `on…` functions return their own "stop listening" function, subscribing
to the main process is often a single line:

```tsx
const [gaze, setGaze] = useState<{ x: number; y: number } | null>(null)
useEffect(() => window.assist.onGaze(setGaze), []) // listen; stop when the page goes away
```

## 9. Time: timers, frames and fake clocks

Much of the app is about things happening over time, and three tools do it:

- `setTimeout(fn, ms)` runs something once, later: "do something on your own in 8 to 20 seconds".
- `setInterval(fn, ms)` runs something again and again. `BubbleController`'s **ticker** runs every
  16 ms (about 60 times a second) while she walks, falls or is carried, moving her window a step.
- `requestAnimationFrame(fn)` runs something just before the page's next paint, for drawing.

Her animations are lists of **frames**, each shown for its own time (40 ms is typical), and a pose
plays its frames in order. Anything to do with time takes its clock as a dependency (`now`), so
the tests can use Vitest's fake timers: `vi.useFakeTimers()` freezes time, and
`vi.advanceTimersByTime(14_000)` runs everything due in the next 14 seconds, instantly.

## 10. Screens, DIPs and pixels

Windows lets each screen have its own scale (100%, 150%, …). Electron works in **DIPs**
(device-independent pixels): at 150%, one DIP is 1.5 real pixels. Almost all the app's numbers are
DIPs, so she's the same size to the eye on every screen.

- A screen's **bounds** are the whole screen; its **work area** is the screen minus the taskbar.
  She stands with her feet on the bottom of the work area: on top of the taskbar.
- Screens sit side by side in one coordinate space, so the left screen might run from x = −1920 to 0. Nothing assumes a screen starts at 0.
- At her usual size her box is 80 DIPs, with 8 more of padding round it and 8 of **headroom** above
  for her hat when she hops (`UI` and `bubbleMetrics()` in `shared/geometry.ts`). Her sizes, from
  ½× to 6×, multiply all of these.
- Windows' accessibility interface and screenshots speak real pixels. Those are turned into DIPs
  with Electron's `screen.screenToDipRect()` as soon as they arrive.

## 11. Sign-ins, secrets and signatures

- **OAuth / OpenID Connect** is how a desktop app gets permission to act for someone without ever
  seeing their password. The app opens the sign-in page in the browser; the person signs in there;
  the browser is sent back to a tiny web server the app runs on `127.0.0.1` (this PC only) with a
  one-time **code**, and the app swaps the code for **tokens**. **PKCE** makes a stolen code
  useless: the app sends a hash of a secret at the start and the secret itself at the end.
- An **ID token** is a signed statement of who someone is; a **refresh token** is a long-lived
  "stay signed in" pass that gets new ones. They're saved encrypted with Windows' **DPAPI**
  (through Electron's `safeStorage`), which only the signed-in Windows user can decrypt.
- **MCP** (Model Context Protocol) is a standard way for a program to call another service's
  **tools**. JumpCloud and Atlassian each run an MCP server; the Apps list calls JumpCloud's
  `list_applications`, and the Jira page calls Atlassian's search tools.
- A **hash** (SHA-256 here) is a fingerprint of a file: change one byte and it changes completely.
  A **signature** (Ed25519 here) proves who made something: only the holder of the private key can
  sign, and anyone with the public key can check. Updates are installed only if both match.
