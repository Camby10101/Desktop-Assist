## 20. Asking Claude

**Files:** `claudeDesktop.ts`, `sendInClaude.ts` (Morse Micro), and `auth/`, `claude/` (the built-in
chat) · **Job:** get a question to Claude. **Used by:** `ipc.ts`, when the text box is sent.

Each tenant chooses where questions go (`chatApp` in `tenant.json`). Morse Micro uses
**Claude Desktop**: the question opens in the Claude Desktop app, in the person's own Claude account,
so the app needs no sign-in of its own and never calls Claude itself.

```figure
ask
```

#### `ClaudeDesktop.ask(text, attachments)` (in `claudeDesktop.ts`)

Checks there's something to ask, that it's at most 12,000 characters (Claude Desktop cuts longer
ones short) and that something on the PC opens `claude://` links (Claude Desktop registers them).
Then it copies any screenshots to the clipboard, stacked into one image, and opens a new chat with
the question typed in:

```ts
export const NEW_CHAT_LINK = 'claude://claude.ai/new'

export function newChatLink(text: string): string {
  // encodeURIComponent rather than URLSearchParams, which writes spaces as "+": a reader that
  // decodes with decodeURIComponent would show those as plus signs.
  return text.trim() ? `${NEW_CHAT_LINK}?q=${encodeURIComponent(text)}` : NEW_CHAT_LINK
}
```

It answers straight away (the panel closes and the draft is cleared), and finishes in the
background with `finish()`: with **Send in Claude automatically** on, it runs `sendInClaude()`;
otherwise, or if that couldn't send, a Windows notification says what's left to do (press Ctrl+V for
the screenshot, or Enter).

#### `sendInClaude()` (in `sendInClaude.ts`)

A hidden PowerShell helper that uses UI Automation to send the question. It waits until the focused
text box belongs to Claude Desktop **and holds exactly the question** (compared by a fingerprint of
the whole text), then presses Ctrl+V (if there's a screenshot) and Enter, checking again before each
key. If the box holds anything else, such as an unsent draft of the user's, it presses nothing.

> **Security**
> Pressing keys in another app is the riskiest thing the app does, so the helper is as careful as it
> can be: it never presses a key anywhere but a Claude Desktop text box holding exactly this
> question, and the question reaches PowerShell only as base64, so a question full of PowerShell
> code is just text.

### The built-in chat (other tenants)

A tenant without Claude Desktop gets a chat inside the panel. There, the app signs the person in
with JumpCloud (`auth/AuthManager.ts`, `auth/oidc.ts`) and calls Claude itself.

```figure
signIn
```

`createOidc().begin()` makes a fresh PKCE verifier, `state` and `nonce` with `openid-client`;
`listenForRedirect()` (in `auth/loopback.ts`) starts a one-shot web server on `127.0.0.1:47621` that
catches the browser's return and shuts down. The refresh token is saved with `SecretStore`.

To reach Claude there's **no API key**. The Anthropic SDK swaps the person's JumpCloud ID token for a
short-lived Claude token (**Workload Identity Federation**), checked against a rule set up in the
Claude Console:

```ts
this.client ??= new Anthropic({
  apiKey: null, // an API key or token in the environment can't be used instead
  authToken: null,
  credentials: oidcFederationProvider({
    identityTokenProvider: identityToken, // a fresh JumpCloud ID token, from AuthManager
    organizationId: access.organizationId,
    federationRuleId: access.federationRuleId,
    serviceAccountId: access.serviceAccountId,
  }),
})
```

`ChatSession` (in `claude/ChatSession.ts`) keeps the conversation, streams each reply and broadcasts
it to the panel at most every 50 ms, and appends each finished reply to the history unchanged
(Claude's thinking blocks included), ready to send back with the next message.

## 21. The Apps list, Jira and the service desk

**Folders:** `mcp/`, `apps/`, `atlassian/`, and `serviceDesk.ts` · **Job:** the panel's pages that
come from other services. **Used by:** `ipc.ts` and `index.ts`.

All three talk to an **MCP server** (section 11): JumpCloud's for the Apps list, Atlassian's for Jira
and the service desk. `McpAccount` (in `mcp/McpAccount.ts`) is the part they share: connecting once
in the browser (OAuth with PKCE, no secret in the app, coming back to `127.0.0.1:47622` for JumpCloud
or `47623` for Atlassian), saving the connection encrypted, and calling a tool. `toolResult.ts` reads
a tool's answer, whichever way the server sends it.

#### `PortalApps` (in `apps/`)

At start-up, in the background, it connects with the saved sign-in, calls JumpCloud's
`list_applications`, fetches the logos (only `https` images, recognised by their bytes rather than
by what the server says they are), and broadcasts the list, so it's ready the first time the panel
opens. Clicking an app asks `launch_application` for its sign-in link and opens it in the browser.
Starred apps (saved in `preferences.json`) come first.

#### `Atlassian` (in `atlassian/Atlassian.ts`)

Once connected, and every five minutes after (`FEED_INTERVAL_MS`), it searches Jira for issues
recently assigned to the person or mentioning them, reads each one's history and comments to see who
did it, checks their service desk requests, and broadcasts the result (`assist:jira-feed`). What's
been seen is remembered in `atlassian.json`; new items put a dot on the bell, and an IT reply gives
one Windows notification. Opening an issue shows it in the card, where **Move**, **Comment**, **Log
time** and **Ask Claude** each make one call.

Each new feed is also compared with the last, and something new makes her hop up holding a scroll:

```ts
export function hasNews(before: JiraFeed | null, after: JiraFeed): boolean {
  if (!before) return false // what's there when the app starts isn't news
  const loaded = (a, b) => a.status === 'ready' && b.status === 'ready'
  const notification =
    loaded(before.notifications, after.notifications) &&
    after.notifications.items.some(
      (n) => n.unread && !before.notifications.items.some((m) => m.id === n.id && m.unread),
    )
  const reply = … // the same for a request with a new reply
  return notification || reply
}

// in index.ts
onFeed: (feed) => {
  broadcast(IPC.jiraFeed, feed)
  if (hasNews(lastFeed, feed)) bubble.react('scroll')
  lastFeed = feed
},
```

> **Good to know**
> Both feeds have to have loaded for anything to count. Otherwise a check that failed (offline for a
> moment) followed by one that worked would make every notification look new, and she'd wave a scroll
> for things the person saw hours ago.

#### `ServiceDesk.raise()` (in `serviceDesk.ts`)

**New request** starts from the text box (its first line as the summary), and with **Include PC
details** ticked the PC's details become the description. There's no box for more: some request
types have no description, and what was typed there was lost; the rest is written on the portal.
Raising copies any screenshots to the clipboard and opens the help-centre portal's create-request
form with the summary (and the PC's details) already filled in, through the
address; the person pastes the screenshot and sends it there.

## 22. Updates and housekeeping

**Files:** `updates.ts`, `actions.ts`, `tenant.ts`, `uninstall.ts`, `formerName.ts`, `debugging.ts`,
`tray.ts`, `log.ts` · **Job:** the jobs round the edges.

#### `Updater.checkAndInstall()` (in `updates.ts`)

Settings → Check for updates. It asks GitHub's API for the tenant's repository's releases and takes
the **highest version** with an installer attached (`newestRelease()`, ignoring drafts and
pre-releases). If that's newer than this copy, it downloads the installer to
`%TEMP%\Desktop Wizard update`, checking three things as it goes: the size GitHub states, the SHA-256
GitHub states, and the release key's **signature**. Only then does it start the installer on its own
(`--updated /S --force-run`: an update, silently, then start the new version), show "Updating to …"
and quit.

```ts
export function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate) // '2.4.1' or 'v2.4.1' → [2, 4, 1]
  const b = parseVersion(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i]! > b[i]! // part by part, as numbers: 2.10.0 is after 2.9.0
  }
  return false
}

/** What a release's signature signs: the version and the installer's SHA-256. */
export function signedText(version: string, sha256: string): string {
  return `desktop-assist-update ${version} sha256:${sha256}`
}

export function isSigned(publicKey: string, version: string, sha256: string, signature: Uint8Array) {
  try {
    const key = createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' })
    if (key.asymmetricKeyType !== 'ed25519') return false
    return verify(null, Buffer.from(signedText(version, sha256)), key, signature)
  } catch {
    return false
  }
}
```

> **Security**
> The update installs with the user's rights and runs whatever it contains, so it must really be
> ours. The release key's private half never leaves the PC that builds releases; `tenant.json` holds
> only the public half. Someone who got into the GitHub account could upload an installer, but not
> sign it, and an unsigned or altered file is deleted, never run. Signing the version as well as the
> hash stops a genuine **older** installer being passed off as a newer release.

> **Good to know**
> Versions are compared as numbers, part by part, never as text: as text, "2.10.0" sorts before
> "2.9.0". The updater also takes the highest version, not the newest-dated release, so publishing a
> fix to an old version can't send everyone backwards.

#### The rest

| File            | Job                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| `actions.ts`    | The icons' commands: screenshot (through `whileHidden`), the screen saver, the service desk, close.         |
| `tenant.ts`     | `TenantSchema`: checks `tenant.json` at start-up (an `https` portal address, a known `chatApp`, and so on). |
| `uninstall.ts`  | Settings → Uninstall: turns off Start with Windows, starts the installer's uninstaller, and quits.          |
| `formerName.ts` | A copy updated from Desktop Assist 1.0.0 moves its data folder and Start with Windows to the new name.      |
| `debugging.ts`  | The switches an installed copy refuses to start with (section 14).                                          |
| `tray.ts`       | The tray icon and its menu (Open, Quit).                                                                    |
| `log.ts`        | `%APPDATA%\Desktop Wizard\logs\desktop-wizard.log`, started afresh when it gets large.                      |

```ts
export const DEBUG_SWITCHES = [
  'remote-debugging-port', 'remote-debugging-pipe', // Chromium's: drive the pages
  'inspect', 'inspect-brk', 'inspect-port', 'inspect-wait', // Node's: drive the main process
]
```

> **Security**
> With remote debugging switched on, another program on the PC could drive the app's pages, and
> through their bridge reach Jira with the user's sign-in. An installed copy refuses to start with
> any of these switches, and Node's are also switched off inside the `.exe` itself (Part 7).
