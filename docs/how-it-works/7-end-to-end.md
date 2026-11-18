# Part 4 — Following it end to end

Knowing each function is half the picture. These walkthroughs follow real moments through the code,
naming each function in the order it runs.

## 26. Starting the app

1. Windows runs `Desktop Wizard.exe` at sign-in (Start with Windows). Electron runs the built
   `index.ts`: no debugging switches (`debugSwitches()`), and no other copy running
   (`requestSingleInstanceLock()`), so `start()` runs once Electron is ready.
2. `TenantSchema.parse()` checks `tenant.json`; `NotesStore.load()` reads `notes.json` (an unsent
   question survives a restart); `SettingsService.init()` reads `preferences.json` and applies dark or
   light mode before any window shows.
3. The bubble and panel windows are created, hidden, and start loading `index.html?view=bubble` and
   `?view=panel`. Each page's `useAssistState()` subscribes to announcements, then asks
   `getState()`.
4. The parts are made and wired (section 14). `PortalApps` starts loading the Apps list and
   `Atlassian` its first Jira check, both in the background. `registerIpc()` starts answering.
5. Once both pages are ready, `bubble.start()` finds her saved screen and corner (bottom-right of the
   main screen the first time), places her window with `restPosition()`, shows it, and schedules her
   first activity, 5 to 12 seconds away.
6. Her page is told `bubbleArrive`, and she plays `appear`: white motes drift down and she forms out
   of them. For ten minutes, `frontCheck` makes sure no other window is covering her.

## 27. Asking Claude, with a screenshot

1. You click her, then the camera icon: `invokeAction('screenshot')` runs the `screenshot` action,
   which calls `BubbleController.whileHidden()`. Mode `capturing`: both windows hide, Windows gets
   150 ms to repaint, `ScreenshotService.capture()` saves the PNG, and the panel comes back with a
   "Screenshot saved" message.
2. **Attach screenshot** calls `notes.attachLatestScreenshot()`: the newest screenshot not yet
   attached becomes a chip under the text box, saved in `notes.json` with the text.
3. You type. Each key press sends `notes.setText()`, and `NotesStore` writes half a second after you
   stop.
4. Enter: `claudeDesktop.ask(text)`. `ipc.ts` checks the length; `ClaudeDesktop.ask()` checks Claude
   Desktop is installed, copies the screenshot to the clipboard (`ScreenshotService.forClipboard()`),
   and opens `claude://claude.ai/new?q=…`. It answers `{ ok: true }`; the panel closes and the draft
   is cleared.
5. Claude Desktop opens a new chat with the question typed in. In the background, `sendInClaude()`
   waits until Claude's focused text box holds exactly the question, presses Ctrl+V (the screenshot
   goes in) and Enter. Claude answers, in your own account.
6. If it couldn't (Send automatically off, or Claude's box had other text in it), nothing is pressed,
   and a Windows notification says what's left: press Ctrl+V, or Enter. Clicking it opens the panel.

## 28. An idle moment

It's a Wednesday, just after noon. She's been standing alone for 40 seconds, 60 DIPs from her
bottom-right corner, and her last habit was a wave.

1. The timer set by `scheduleActivity()` fires: `doActivity()` asks `nextActivity()`.
2. She's been alone over 30 seconds (`fidgetAfter`), and the first roll is under 0.6, so it's a habit
   or a performance rather than a stroll.
3. The options: 29 habits (all but the two timed ones out of their hours, and the wave, done last),
   each weighing 1, with the vision at 0.2; and what `Performances.available(true)` offers: `watch`,
   `peek`, `portal`, the six tricks and `familiar`. The weights add up to about 32.
4. The second roll lands in `peek`'s stretch. `doActivity()` calls `prepare('peek')`.
5. `WindowTricks.peek()` asks the shell probe for the windows, keeps the usable ones on her screen,
   and `peekEdge()` finds a browser window whose right edge is 150 DIPs to her left, coming down over
   the taskbar. `peekSteps()` makes the timetable.
6. `perform()` plays it: she walks to just outside the edge (`walk-left`), slips behind it (her page
   is sent the window's rectangle and clips her), peeks out and waves, comes out, and walks back.
7. `endPerformance(true)`: she stands where she ended, and `scheduleActivity(false)` waits 8 to 20
   seconds for the next thing.

Had no window been near her, `peekEdge()` would have returned `null`, `prepare()` would have got no
performance, and she'd simply have waited for the next turn.

## 29. Throwing her

1. You press on her and move: past 5 pixels, her page calls `bubbleDragStart()`. Mode `dragging`, pose
   `dragged` (she dangles). The ticker moves her window with the pointer 60 times a second and keeps
   the last 20 positions; her page says `bubbleDragHold()` every 250 ms.
2. You flick the mouse up and to the right and let go: `bubbleDragEnd()`. `releaseVelocity()` looks at
   the last 100 ms: 1,900 DIPs a second, well over 350, so `fling()`.
3. Mode `returning`, pose `flung` (she tumbles). Each frame, `flightStep()` adds gravity, moves her, and
   bounces her off the right edge of the screen with 35% of her speed.
4. She comes down onto the taskbar at 1,450 DIPs a second: `landed`. Her new corner is the nearer
   bottom one (`nearestCorner()`), her inset is remembered, and the anchor saved to
   `preferences.json`.
5. `land(1450)`: that's over 1,300, a hard landing, so she plays `splat` for 3.2 seconds: on her
   bottom, hat over her eyes, stars going round.
6. She gets up. She landed 400 DIPs from her corner, further than her 180-DIP zone, so she walks back.

## 30. A taskbar trick: the swap

1. `nextActivity()` picks `swap` (a tenth as likely as a habit, so this is a rare moment).
   `prepare('swap')` calls `TaskbarTricks.prepare()`.
2. The shell probe answers `taskbar` with 35 buttons across two screens. `appButtons()` keeps the 9
   app buttons on her screen's taskbar; the trick takes two neighbours near her.
3. `desktopCapturer` takes a screenshot of her screen. The two icons are cut out of it, and so is a
   strip of plain taskbar beside each, to cover the real icon while its copy is "out".
4. A `TrickPlan` is made, and a `trick` window opens over the bottom of the screen, told the moment the
   trick starts. Its page asks for the plan (`trickReady`); the main process sends the plan and the
   icons to that page only.
5. Both sides now run `trickFrame(plan, t)`: the controller moves her, and `TrickView` draws the
   icons. She walks between the two icons; waves her wand while they arc past each other, swapping
   places; looks guilty, a bead of sweat on her brow; waves again, and they swap back.
6. `trickFrame` says `done`: the window closes, the real icons (which never moved) show again, and she
   walks home.

## 31. A new Jira notification

1. Five minutes after the last check, `Atlassian`'s timer fires. It searches Jira through Atlassian's
   MCP server and finds an issue someone has just assigned to you.
2. Reading the issue's history shows who assigned it, so the notification reads "Sam assigned you
   ABC-123". It's not in `atlassian.json` as seen, so it's unread.
3. `onFeed(feed)` in `index.ts` broadcasts it (`assist:jira-feed`): the bell gets a dot.
4. `hasNews(lastFeed, feed)` finds an unread notification that wasn't unread last time, so
   `bubble.react('scroll')`: she hops up holding a scroll.
5. You open the panel and the Jira page. Opening the notification shows the issue in the card and marks
   it seen (`markNotificationsRead(id)`), saved in `atlassian.json`; the rest count as seen when the
   page closes.

## 32. Nobody at the PC: snoozing, and the screen saver

1. You go to a meeting. Every second, `watchIdle()` asks `powerMonitor.getSystemIdleTime()`. At five
   minutes, with the panel closed, she plays `settle` and sits down, then holds `snooze`, z's floating
   up. Nothing else of hers is scheduled meanwhile (`scheduleActivity()` checks `snoozing`).
2. If her cat was visiting, `stepCat()` sees `snooze` among the restful poses and curls up beside her.
3. You come back and move the mouse: the idle time drops below 1.5 seconds, and she plays `rouse`:
   blinks, gets up, smiles, and carries on.

The screen saver is different: you start it from its icon.

1. The `screensaver` action closes the panel and calls `ScreenSaver.start()`, which opens a window over
   every screen and calls `BubbleController.sleep()`: she dissolves into motes and her window hides.
2. Each page fades to white over 1.5 seconds, then into its scene: on her screen she stands on a hill,
   her back to you, watching the sun set; on the others, stars fall.
3. You move the mouse: the page calls `screensaver.wake()`, `wakeFrom()` checks the message came from
   one of its own windows, every page fades away, the windows close 0.8 seconds later, and
   `BubbleController.wake()` brings her back. While she's asleep, `watchIdle()` leaves her alone, so
   she never snoozes behind the screen saver.

## 33. Checking for updates

1. Settings → **Check for updates**: `updates.check()` → `Updater.checkAndInstall()`. The menu row
   follows along through `assist:update-state` ("Checking…", "Downloading 42%").
2. GitHub's API lists `Camby10101/Desktop-Wizard`'s releases. `newestRelease()` skips drafts and
   pre-releases and takes the highest version with an installer attached: 2.4.1. `isNewer('2.4.1',
'2.4.0')` is true.
3. The installer downloads to `%TEMP%\Desktop Wizard update`, hashed as it arrives. Its size matches
   GitHub's, its SHA-256 matches GitHub's, and `isSigned()` checks the `.sig` file against the public
   key in `tenant.json`: valid.
4. The installer starts on its own with `--updated /S --force-run`; a notification says "Updating to
   2.4.1"; the app quits. The installer waits for it to close, replaces it, and starts the new version,
   which reads the same `%APPDATA%\Desktop Wizard` folder: settings, sign-ins and the draft are all
   still there.
