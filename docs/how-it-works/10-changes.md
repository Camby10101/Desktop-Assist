# Part 8 — Making changes yourself

## 40. Recipes

### Add a habit

Say you want her to blow a dandelion:

1. `shared/character.ts`: add `'dandelion'` to `FIDGETS` and its length to `FIDGET_MS`
   (`dandelion: 3000`). TypeScript now points at every place that needs to know about it.
2. `character/sprite.ts`: write `function dandelion(): Key[]` out of `hold()` and `tween()` (copy a
   similar habit, such as `butterfly`), add it to `MAKERS` (`dandelion: () => drawn(dandelion())`) and
   to `LOOPS` as `false`. Anything new to draw (the seeds) is a new field on `Pose`, drawn in `rig.ts`.
3. Run `npx vitest run tests/sprite.test.ts`: it checks the frames are the right size and last exactly
   `FIDGET_MS.dandelion`.
4. `npm run dev`, and wait. To see it sooner, make it heavy for a moment
   (`FIDGET_WEIGHT.dandelion = 50` in `wander.ts`), then take that out again.

### Add a channel between a page and the main process

1. `shared/ipc.ts`: add the name to `IPC` (`'assist:my-thing'`) and the function to `AssistApi`.
2. `preload/index.ts`: add it to `api`, with `send` for a message or `invoke` for a question.
3. `main/ipc.ts`: register it with `on()` or `handle()`, with a zod schema for its argument (`NoArgs`
   for none), calling the part that does the work.
4. Call `window.assist.myThing()` from the page. `npm run typecheck` checks the three agree.

### Add a setting

1. `settings.ts`: add the field to `PreferencesSchema` (optional, so older files still load), and a
   getter and a `set…()` that saves it.
2. `shared/types.ts`: add it to `Settings`, so the pages can read it from the app state.
3. Add a channel for setting it (above), and a `ToggleRow` for it in `SettingsMenu.tsx`.
4. Apply it where it matters: like `setHabits()`, which tells `BubbleController` at once.

### Add a performance

1. `bubble/wander.ts`: add the name to `PERFORMANCES` and its weight to `PERFORMANCE_WEIGHT` (and to
   `STAYING_PUT` if she doesn't move).
2. Write something that returns a `Performance`: an `at(t)` that says, for each moment, where her box
   is and her pose (or `null` when it's over), and an `end(finished)` that tidies up.
3. `index.ts`: plug it into `Performances` as `more[name] = { moves, prepare }`.
4. Test the timeline on its own, the way `tests/tricks.test.ts` tests `trickFrame`.

### Change her robe's colours, or the company's

The company's colour is `accentColor` in `tenant.json`; the robe's shades are mixed from it (or from
the colour picked in Settings) in `character.css`. A new company is a new folder in `tenants/` with its
own `tenant.json`, `logo.png` and `icon.png`, built with `TENANT=<folder> npm run dist`;
`tests/tenants.test.ts` checks the folder is complete.

## 41. Everyday commands

| To…                                     | Run (from the repository's top folder)                              |
| --------------------------------------- | ------------------------------------------------------------------- |
| Install what the project needs          | `npm install`                                                       |
| Run the app while developing            | `npm run dev`                                                       |
| Run all the tests                       | `npm test`                                                          |
| Run one test file                       | `cd apps/desktop`, then `npx vitest run tests/wander.test.ts`       |
| Check the types / the lint rules        | `npm run typecheck` / `npm run lint`                                |
| Format everything                       | `npm run format`                                                    |
| Refresh the Code Guide's code           | `npm run docs` (checked by `npm run docs:check`, and by `npm test`) |
| Rebuild the Code Guide PDF / this guide | `npm run docs:pdf` / `npm run docs:how`                             |
| Build and sign the installer            | `npm run dist`                                                      |
| Make the release key (once, ever)       | `npm run release:key`                                               |

## 42. Glossary

| Term                         | Meaning                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Bubble                       | The code's name for her and her window (she was a round logo first).                                        |
| Beat                         | One step of a taskbar trick: a length, and where everything is through it.                                  |
| Callback                     | A function handed to something, for it to call later ("when her pose changes, call this").                  |
| Debounce                     | Waiting until changes stop for a moment before acting on them, as the draft's save does.                    |
| DIP                          | Device-independent pixel: a screen pixel at 100% scaling; most of the app's numbers are DIPs.               |
| DPAPI                        | Windows' encryption tied to the signed-in user, used through Electron's `safeStorage`.                      |
| Ed25519                      | The kind of signature the release key makes.                                                                |
| Fidget, habit                | One of her 38 short animations (`FIDGETS`).                                                                 |
| Frame                        | One picture of her, a grid of palette letters, shown for its time.                                          |
| Fuse                         | A switch set inside the `.exe` when it's built, which can't be changed afterwards.                          |
| Hash                         | A fingerprint of some data (SHA-256 here): easy to make, impossible to reverse, changed by any change.      |
| IPC, channel                 | Messages between the main process and the pages; each kind has a named channel.                             |
| Main process                 | The Node.js side of the app: windows, files, network, Windows itself.                                       |
| MCP                          | Model Context Protocol: a standard way to call another service's tools.                                     |
| Mode                         | What the bubble is doing as a whole: collapsed, expanded, dragging, returning or capturing.                 |
| OAuth, OIDC                  | The standards for signing in through the browser and getting tokens; OIDC adds who someone is.              |
| Performance                  | One of her longer acts (a trick, a peek, a portal, a visit, a battle), played by `BubbleController`.        |
| PKCE                         | Proof Key for Code Exchange: makes a stolen sign-in code useless.                                           |
| Pose                         | What she's doing, by name (`hop`, `walk-left`, `snooze`), which picks her frames.                           |
| Preload                      | The script that runs in each page first and hands it `window.assist`.                                       |
| Renderer, page               | The Chromium side of a window, drawing with React; it can't touch the PC.                                   |
| Sandbox                      | Chromium's lock on a page: no files, no programs, no Node.                                                  |
| Tenant                       | One company's branding and settings (`tenants/<name>/tenant.json`); the build includes exactly one.         |
| Ticker                       | `BubbleController`'s 60-times-a-second timer while she walks, falls, is carried or performs.                |
| UI Automation                | Windows' accessibility interface; the app uses it to read the taskbar and windows, and to type into Claude. |
| Work area                    | A screen minus its taskbar. She stands on its bottom edge.                                                  |
| Workload Identity Federation | Reaching Claude with a sign-in from another service (JumpCloud) instead of an API key.                      |
| zod                          | The library that checks data has the shape it should, before it's used.                                     |
