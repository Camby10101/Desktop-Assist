# Part 5 — Security in one place

Security features are spread through the code. Here they all are together, with where to find each
one.

## 34. What's protected, and how

| Threat                                                            | Protection                                                                                                                   | Where                                       |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Text shown in a page (Jira, Confluence, Claude) running as script | Pages are sandboxed: no Node, no Electron; React escapes text; only `window.assist`                                          | `windows.ts`, `preload/index.ts`            |
| A page asking for something it shouldn't                          | Only the app's own windows may call in; every argument checked with zod                                                      | `registerIpc` in `ipc.ts`                   |
| A link opening a program or a local file                          | Only `http:`, `https:` and `mailto:` links are opened                                                                        | `ExternalUrl` in `ipc.ts`                   |
| A page reading files it shouldn't                                 | Screenshot paths must be inside the screenshots folder                                                                       | `isInsideDir` in `screenshots/files.ts`     |
| Sign-ins stolen from disk                                         | Encrypted with Windows DPAPI, readable only by the signed-in user; not saved at all without encryption                       | `SecretStore`, `McpAccount`                 |
| A sign-in code intercepted                                        | PKCE, `state` and `nonce`; the browser comes back only to `127.0.0.1` on this PC                                             | `auth/oidc.ts`, `auth/loopback.ts`, `mcp/`  |
| An API key leaking                                                | There isn't one: Claude is reached with the user's own sign-in (Workload Identity Federation), or through Claude Desktop     | `AnthropicBackend`, `claudeDesktop.ts`      |
| Keys pressed in the wrong window                                  | The helper presses keys only in Claude Desktop's box holding exactly the question; the question goes to PowerShell as base64 | `sendInClaude.ts`                           |
| Another program driving the app                                   | An installed copy refuses debugging switches; Node's are fused off in the `.exe`                                             | `debugging.ts`, `electron-builder.cjs`      |
| A fake or altered update                                          | Size, SHA-256 and an Ed25519 signature checked; the private key never leaves the release PC                                  | `updates.ts`, `scripts/release-signing.mjs` |
| An old installer passed off as new                                | The signature covers the version as well as the hash                                                                         | `signedText` in `updates.ts`                |
| Downloads from somewhere else                                     | Installers are taken only from the tenant's own repository's releases                                                        | `ownDownloads`, `releaseOf` in `updates.ts` |
| Her tricks changing the taskbar or windows                        | The shell probe only reads; tricks draw copies on top                                                                        | `shell/probe.ts`, `taskbarTricks.ts`        |
| The tricks' screenshot leaving the PC                             | Held in memory, cropped, sent only to the trick's own window; never saved or sent anywhere                                   | `index.ts`, `taskbarTricks.ts`              |
| A damaged or hand-edited file breaking the app                    | Every file is read through a schema; written via a temporary file and a rename                                               | `storage/jsonFile.ts`, `settings.ts`        |
| A tampered `.exe`                                                 | The app only loads from its own packed archive, whose integrity is checked                                                   | `electronFuses` in `electron-builder.cjs`   |

> **Good to know**
> Two of these come down to one habit: never trust what arrives from outside the main process. A
> page, PowerShell's answers, GitHub's release list, Jira's search results and a file on disk are all
> checked against a schema before anything uses them. When you add a new channel or read a new kind
> of answer, give it a schema too.

# Part 6 — The tests

## 35. How the tests work

The `apps/desktop/tests/` folder holds 39 test files, about 500 tests. Run them all from the
repository's top folder with:

```
npm test
```

Each test sets something up, does one thing, and **asserts** what should be true. Vitest runs every
`*.test.ts` file, in Node, with no windows and no network. That works because of the habit from
section 7: everything that touches the outside world is passed in, so a test passes in a fake.

### The controller's test harness

`bubbleController.test.ts` builds the controller with fake windows (`bubble` and `panel` record every
call), two fake screens, a pointer the test can move, and dice that always come up 0.5. Every pose
and mode change is recorded in a list the test can check:

```ts
function makeController(initialAnchor = null, initialScale?, initialHabits?, extra = {}) {
  return new BubbleController({
    bubble, panel,
    displays: {
      primary: () => screens[0]!,
      byId: (id) => screens.find((s) => s.id === id),
      nearest: (p) => screens.find(({ workArea: a }) => /* p is inside a */) ?? screens[0]!,
      cursor: () => cursor,
    },
    actionCount: 4,
    initialAnchor, initialScale, initialHabits,
    onModeChange: (mode) => modes.push(mode),
    onPoseChange: (pose) => poses.push(pose),
    now: () => Date.now(), // frozen by vi.useFakeTimers()
    // With 0.5 every time: the first thing it does comes 8.5 s after settling, then one every 14 s.
    random: () => 0.5,
    ...extra,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  // A Wednesday at noon: no yawning (late at night) or confetti (Friday evenings).
  vi.setSystemTime(new Date(2026, 10, 18, 12, 0))
  …
})
```

A test then reads like a story. This one checks the snooze, with Windows' idle time faked:

```ts
it('settles down and snoozes when nobody’s been at the PC for five minutes, until someone is', () => {
  let idle = 0
  withIdle(() => idle) // a controller whose idleSeconds() is this function
  vi.advanceTimersByTime(2000)
  expect(controller.isSnoozing).toBe(false)
  idle = SNOOZE.afterMs / 1000 // five minutes
  vi.advanceTimersByTime(1000)
  expect(controller.currentPose).toBe('settle')
  vi.advanceTimersByTime(REACTION_MS.settle + 100)
  expect(controller.currentPose).toBe('snooze')
  idle = 0 // someone's back
  vi.advanceTimersByTime(1000)
  expect(controller.currentPose).toBe('rouse')
})
```

### What each file covers

| File(s)                                                                                                                     | Covers                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `bubbleController.test.ts`                                                                                                  | the state machine: starting, clicks, drags, throws, landings, walking, habits, performances, reactions, snoozing, sizes, two screens           |
| `wander.test.ts`, `moments.test.ts`                                                                                         | `nextActivity` (the waits, the weights, never twice running, timed habits), walks, falls, throws, the pointer                                  |
| `layout.test.ts`, `sizes.test.ts`                                                                                           | where she stands on any screen, corners and insets; her sizes                                                                                  |
| `tricks.test.ts`                                                                                                            | the taskbar's app buttons, every trick's timeline (icons go back where they were, she ends where she began), `TaskbarTricks` with a fake probe |
| `familiar.test.ts`                                                                                                          | the cat's window, what it sees, joining in, following, wandering, its frames                                                                   |
| `battle.test.ts`                                                                                                            | her battle's timeline (where the monsters come from and stop, her casts in turn, the bolts, the tumbles) and its window                        |
| `catalogue.test.ts`                                                                                                         | each habit's move filed under its kind, a move for every pose, a colour for every palette letter, every prop painter drawn                     |
| `sprite.test.ts`, `robeColor.test.ts`                                                                                       | every pose has frames of the right size and length; her feet on the ground; robe colours                                                       |
| `clones.test.ts`, `vision.test.ts`, `spellEffects.test.ts`, `spellMotion.test.ts`, `moreSpells.test.ts`                     | her spells' windows and their pixel art, drawn on a recording `Painter`                                                                        |
| `screenSaver.test.ts`, `screenSaverScenes.test.ts`                                                                          | the screen saver's windows, waking, and its scenes                                                                                             |
| `frontCheck.test.ts`                                                                                                        | the check that she's in front, and its timing                                                                                                  |
| `claudeDesktop.test.ts`, `sendInClaude.test.ts`                                                                             | the `claude://` link, the notifications, and the PowerShell helper's script (without running it)                                               |
| `chatSession.test.ts`, `authManager.test.ts`, `loopback.test.ts`, `secretStore.test.ts`, `claudeHelpers.test.ts`            | the built-in chat and its sign-in, with a fake JumpCloud and a scripted Claude                                                                 |
| `portalApps.test.ts`, `atlassian.test.ts`, `serviceDesk.test.ts`                                                            | the Apps list, Jira and the service desk, with made-up answers                                                                                 |
| `updates.test.ts`                                                                                                           | versions, finding the installer, refusing drafts and other repositories, size, hash and signature checks                                       |
| `notesStore.test.ts`, `screenshotFiles.test.ts`, `screenshotStack.test.ts`                                                  | the draft, screenshots' names and folder, stacking them                                                                                        |
| `tenants.test.ts`                                                                                                           | every tenant's `tenant.json`, logo and icon are valid                                                                                          |
| `debugging.test.ts`, `uninstall.test.ts`, `formerName.test.ts`, `diagnostics.test.ts`, `format.test.ts`, `trayIcon.test.ts` | the housekeeping                                                                                                                               |
| `codeGuide.test.ts`                                                                                                         | the code shown in the Code Guide matches the source                                                                                            |

### Fakes for the outside world

- **Windows' shell**: `tricks.test.ts` gives `TaskbarTricks` a fake `taskbar()` returning made-up
  buttons and a fake screenshot whose `crop()` just names what it was asked for, then checks which
  window was opened, with what plan and icons.
- **GitHub**: `updates.test.ts` hands the `Updater` a fake `fetch` answering with made-up releases, and
  signs test installers with a key made in the test, so a real signature and a forged one can both be
  tried.
- **JumpCloud and Claude**: `authManager.test.ts` uses a fake JumpCloud whose refresh tokens work once,
  like the real one; `chatSession.test.ts` a scripted backend that streams whatever the test says.
- **Drawing**: the spell and screen-saver tests draw on a `Painter` that records what it's asked to
  draw instead of drawing it, so a test can say "half way through the fireworks, plenty is on the
  screen; at the end, nothing is".

> **Try it yourself**
> Break something on purpose: in `wander.ts`, change `fidgetAfter: 30_000` to `10_000` and run
> `npx vitest run tests/wander.test.ts tests/bubbleController.test.ts` (from `apps/desktop`). Read
> the failures: each names the behaviour that changed. Then put it back.
