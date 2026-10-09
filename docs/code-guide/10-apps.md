# Your apps: the JumpCloud apps list

[← Code Guide](CODE_GUIDE.md)

Feature 3.2 adds **Your apps** to the card beside the bubble: the apps the user can open from
their company's JumpCloud User Portal (Slack, Atlassian and so on), each with its logo. Clicking
one opens it in the default browser, signed in through JumpCloud just as it would be from the
portal itself. A tenant gives a `portal` (see `PortalSchema` in
[Main process: startup, IPC and app plumbing](2-main-startup.md)) and chooses where the list
goes. With `"startPage": "apps"` (Morse Micro), the panel opens on the list, and the text box for
asking Claude is behind the **Ask Claude** icon (a speech bubble). Otherwise the panel opens on
the text box, and an **Apps** icon (a grid of squares) in `actions` swaps it for the list.

The list comes from **JumpCloud's "MCP Server for Users"** (`https://usermcp.jumpcloud.com/v1`),
which an admin turns on in the JumpCloud Admin Portal. _MCP_, the Model Context Protocol, is an
open standard for giving AI assistants access to tools and data: a server offers named _tools_,
and a client calls them with JSON arguments. Desktop Assist is simply a client here, with no AI
involved: it calls two of the server's tools itself, `list_applications` and
`launch_application`. It talks to the server through the official MCP SDK
(`@modelcontextprotocol/sdk`).

**Connecting, once per person.** The server only answers a signed-in user, so each person
connects Desktop Assist to their portal once, in the browser. This is OAuth, the same family of
standards as the built-in chat's JumpCloud sign-in ([JumpCloud sign-in](3-sign-in.md)), and the
MCP SDK carries out its steps:

- **Discovery**: the SDK asks the MCP server where its sign-in (authorization) server is, and
  reads that server's addresses.
- **Dynamic client registration**: the first time, Desktop Assist registers itself with that
  server and gets a client ID back. Nothing has to be set up for the app in JumpCloud
  beforehand.
- **A public client with PKCE**: an app installed on people's PCs can't keep a secret, so it has
  none. Instead each sign-in uses PKCE, a one-time secret the app makes up, sends only a hash of
  at the start, and reveals when it swaps the code for tokens; a stolen code is useless without
  it.
- **A loopback redirect**: the browser comes back to `http://127.0.0.1:47622/callback`, a tiny
  web server the app runs on this PC just for the sign-in (the same `listenForRedirect()` as the
  built-in chat's sign-in, on a port of its own).
- **Refresh tokens**: the tokens are saved encrypted (Windows DPAPI) in `jumpcloud-apps.bin` in
  the app's data folder. When the access token stops working, the SDK gets a new one with the
  refresh token, so the user stays connected; only if that fails does the list ask them to sign
  in again.

No token ever reaches the page: it only sees the list's state and the apps' names and logos.

**How it fits together**

1. **Showing the list**: at startup `index.ts` already asks `PortalApps.get()` to load the list in
   the background. It connects with the saved sign-in (`mcpConnector().connect()`), calls
   `list_applications`, reads the answer (`parseAppList()`), fetches the logos, and broadcasts the
   `ready` list on `assist:apps-state`. Whenever the panel shows the list (on opening, or through
   the Apps icon), `Panel` asks again with `window.assist.apps.get()` → IPC `assist:apps-get`, and
   gets the list already loaded, until Refresh.
2. **Connecting**: with no saved sign-in, the list shows **Sign in with JumpCloud** →
   `apps.signIn()` → `PortalApps.signIn()`. It starts the local listener, lets the SDK register
   and build the sign-in address (`authorize()`), opens it in the browser, waits for the browser
   to come back with a code, checks it's the sign-in it started (`state`), swaps the code for
   tokens (`authorize()` again, with the code) and loads the list. `index.ts` reopens the panel
   when it's done.
3. **Opening an app**: a click → `Panel.openApp()` → IPC `assist:apps-open` with the app's ID →
   `PortalApps.open()` calls `launch_application` for that app, takes the sign-in link from the
   answer, and opens it in the browser; the panel closes.
4. **Favourites**: the star on a tile → `Panel.toggleFavorite()` →
   `window.assist.settings.setFavoriteApp()` saves the app's ID with the user's preferences
   (`favoriteApps` in `preferences.json`). The list shows starred apps first (`orderApps()` in
   `src/shared/apps.ts`), and they stay starred after a restart.

**Reading answers defensively.** JumpCloud documents the server's tools but not every field of
their answers. So `portalData.ts` reads them tolerantly: it looks for the usual names for a list,
an ID, a name, a logo and a link, takes only `https` links, and ignores what it doesn't know. If
no list can be found at all, the log gets the field names it did find (never the values), so the
reader can be fixed.

---

## `src/main/apps/portalData.ts`: reading JumpCloud's answers

Plain functions with no Electron or network in them, so `tests/portalApps.test.ts` checks them
with made-up answers. `PortalApps` uses them on what the tools return.

### `PortalAppInfo` and `ToolResult`

<!-- code: apps/desktop/src/main/apps/portalData.ts#PortalAppInfo,ToolResult -->

[`src/main/apps/portalData.ts`, lines 1–18](../../apps/desktop/src/main/apps/portalData.ts#L1-L18)

```ts
// Reading JumpCloud's answers. The MCP Server for Users documents its tools but not the exact
// fields they return, so these readers look for the usual names and ignore what they don't know.

/** An app from the portal, before its logo is fetched. */
export interface PortalAppInfo {
  id: string
  name: string
  logoUrl: string | null
  /** The sign-in link the list itself gave, if any (launch_application is asked first). */
  launchUrl: string | null
}

/** What an MCP tool call returns (the parts used here). */
export interface ToolResult {
  content?: unknown
  structuredContent?: unknown
  isError?: boolean
}
```

<!-- /code -->

- The comment at the top of the file sums up the approach: look for the usual names, ignore the
  rest.
- `PortalAppInfo`: one app as the main process keeps it. It has two things the page never sees:
  the logo's web address (the page gets the logo itself, as a `data:` URL) and `launchUrl`, a
  sign-in link the list may have included, kept as a fallback for `launch_application`.
- `ToolResult`: what an MCP tool call returns. A tool can answer with `content` (a list of blocks,
  usually text) and, in newer versions of the protocol, `structuredContent` (data as JSON).
  `isError` is set when the tool itself reports a failure. Both contents are typed `unknown`,
  because nothing about their shape is promised.

### `Item`, `LIST_KEYS`, `URL_KEYS`, `isObject` and `text`

<!-- code: apps/desktop/src/main/apps/portalData.ts#Item,LIST_KEYS,URL_KEYS,isObject,text -->

[`src/main/apps/portalData.ts`, lines 20–29](../../apps/desktop/src/main/apps/portalData.ts#L20-L29)

```ts
type Item = Record<string, unknown>

const LIST_KEYS = ['applications', 'apps', 'items', 'results', 'data', 'records']

const URL_KEYS = ['launchUrl', 'launch_url', 'url', 'ssoUrl', 'sso_url', 'redirectUrl', 'location']

const isObject = (value: unknown): value is Item =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null
```

<!-- /code -->

Small helpers for poking around in data of unknown shape.

- `type Item = Record<string, unknown>`: a plain object whose fields could be anything.
- `LIST_KEYS`: the field names an answer might keep its list of apps under. `URL_KEYS`: the names
  a sign-in link might have.
- `isObject`: a _type guard_, like `COMMAND_ACTION_IDS`'s: when it returns true, TypeScript treats
  the value as an `Item`, so its fields can be read. Arrays and `null` don't count (`typeof` says
  `'object'` for both).
- `text`: a string with something in it, trimmed, or `null`.

### `httpsUrl()`

<!-- code: apps/desktop/src/main/apps/portalData.ts#httpsUrl -->

[`src/main/apps/portalData.ts`, lines 31–40](../../apps/desktop/src/main/apps/portalData.ts#L31-L40)

```ts
/** Only web addresses are ever opened from the list (never file:, javascript: and so on). */
export function httpsUrl(value: unknown): string | null {
  const candidate = text(value)
  if (!candidate) return null
  try {
    return new URL(candidate).protocol === 'https:' ? candidate : null
  } catch {
    return null
  }
}
```

<!-- /code -->

The one gate every link from JumpCloud goes through. Only `https:` web addresses pass, so an
answer can never make the app open a local file (`file:`), run script (`javascript:`) or start
another program through its own scheme. `new URL()` throws for text that isn't a web address,
which counts as "no".

### `payloadOf()`

<!-- code: apps/desktop/src/main/apps/portalData.ts#payloadOf -->

[`src/main/apps/portalData.ts`, lines 42–56](../../apps/desktop/src/main/apps/portalData.ts#L42-L56)

```ts
/** The tool's answer as data: its structured content, or the JSON in its first text block. */
export function payloadOf(result: ToolResult): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent
  const blocks = Array.isArray(result.content) ? result.content : []
  for (const block of blocks) {
    if (isObject(block) && block['type'] === 'text' && typeof block['text'] === 'string') {
      try {
        return JSON.parse(block['text'])
      } catch {
        return block['text']
      }
    }
  }
  return undefined
}
```

<!-- /code -->

A tool's answer as data. `structuredContent` is taken as it is when there is one. Otherwise the
first text block is read as JSON, which is how most servers send data; if it isn't JSON, the text
itself is returned (`findLaunchUrl()` can still find a link in it).

### `findList()` and `appFrom()`

<!-- code: apps/desktop/src/main/apps/portalData.ts#findList,appFrom -->

[`src/main/apps/portalData.ts`, lines 58–98](../../apps/desktop/src/main/apps/portalData.ts#L58-L98)

```ts
/** The list inside the answer: the answer itself, or an array under a usual key. */
function findList(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  if (!isObject(value)) return null
  for (const key of LIST_KEYS) {
    const found = findList(value[key])
    if (found) return found
  }
  return Object.values(value).find((v) => Array.isArray(v) && v.some(isObject)) as unknown[] | null
}

function appFrom(item: unknown): PortalAppInfo | null {
  if (!isObject(item)) return null
  const sso = isObject(item['sso']) ? item['sso'] : {}
  if (sso['hidden'] === true || item['hidden'] === true) return null // "Show in User Portal" off
  const logo = item['logo']
  const id = text(item['id']) ?? text(item['_id']) ?? text(item['applicationId'])
  const name =
    text(item['displayLabel']) ??
    text(item['displayName']) ??
    text(item['display_name']) ??
    text(item['name']) ??
    text(item['label'])
  if (!id || !name) return null
  const bookmark = isObject(sso['bookmark']) ? sso['bookmark'] : {}
  return {
    id,
    name,
    logoUrl:
      (isObject(logo) ? httpsUrl(logo['url']) : httpsUrl(logo)) ??
      httpsUrl(item['logoUrl']) ??
      httpsUrl(item['logo_url']) ??
      httpsUrl(item['icon']),
    launchUrl:
      httpsUrl(item['ssoUrl']) ??
      httpsUrl(item['launchUrl']) ??
      httpsUrl(sso['url']) ??
      httpsUrl(bookmark['url']) ??
      httpsUrl(item['url']),
  }
}
```

<!-- /code -->

`findList()` finds the list of apps in an answer, and `appFrom()` reads one app from it.

- `if (Array.isArray(value)) return value`: the answer may simply be the list.
- `for (const key of LIST_KEYS)`, `findList(value[key])`: otherwise, a list under one of the usual
  names, looked for at any depth (`findList` calls itself).
- `Object.values(value).find((v) => Array.isArray(v) && v.some(isObject))`: as a last resort, any
  field that holds a list of objects.
- `const sso = isObject(item['sso']) ? item['sso'] : {}`: JumpCloud keeps an app's single sign-on
  settings in `sso`. Using `{}` when there isn't one means the lines below can read `sso[...]`
  without checking again.
- `if (sso['hidden'] === true || item['hidden'] === true) return null`: an app whose "Show in
  User Portal" setting is off is left out of the list, as it is in the portal.
- `text(item['id']) ?? text(item['_id']) ?? ...`: the first of the usual names that has a value.
  `displayLabel` comes first for the name, because that's the label the portal shows.
- `if (!id || !name) return null`: an item without both can't be shown or opened.
- `logoUrl`: the logo is either `{ url }` or the address itself, or under another usual name;
  `https` only.
- `launchUrl`: the sign-in link, if the list includes one, including a bookmark app's address
  (`sso.bookmark.url`); `https` only.

### `parseAppList()`

<!-- code: apps/desktop/src/main/apps/portalData.ts#parseAppList -->

[`src/main/apps/portalData.ts`, lines 100–107](../../apps/desktop/src/main/apps/portalData.ts#L100-L107)

```ts
/** The apps in a list_applications answer, by name; null if it holds no list at all. */
export function parseAppList(result: ToolResult): PortalAppInfo[] | null {
  const list = findList(payloadOf(result))
  if (!list) return null
  const apps = list.map(appFrom).filter((app): app is PortalAppInfo => app !== null)
  const unique = [...new Map(apps.map((app) => [app.id, app])).values()]
  return unique.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}
```

<!-- /code -->

The apps in a `list_applications` answer, ready to show.

- `if (!list) return null`: `null` means "no list at all", which is a problem worth logging. An
  empty list (`[]`) is a perfectly good answer: the user has no apps assigned yet.
- `.filter((app): app is PortalAppInfo => app !== null)`: drops the items `appFrom()` couldn't
  read, and tells TypeScript the result has no `null`s.
- `[...new Map(apps.map((app) => [app.id, app])).values()]`: removes duplicates. A `Map` keeps one
  entry per key, so an app listed twice (under two groups, say) appears once.
- `a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })`: sorts by name the way a
  person would, ignoring upper and lower case (`sensitivity: 'base'`).

### `describeShape()`

<!-- code: apps/desktop/src/main/apps/portalData.ts#describeShape -->

[`src/main/apps/portalData.ts`, lines 109–117](../../apps/desktop/src/main/apps/portalData.ts#L109-L117)

```ts
/** The field names in the answer's first item, for the log when no apps could be read. */
export function describeShape(result: ToolResult): string {
  const payload = payloadOf(result)
  const list = findList(payload)
  const first = list?.find(isObject)
  if (first) return `items with fields ${Object.keys(first).join(', ')}`
  if (isObject(payload)) return `an object with fields ${Object.keys(payload).join(', ')}`
  return typeof payload
}
```

<!-- /code -->

For the log, when `parseAppList()` found no list: the field names in the answer's first item, or
in the answer itself. Only names, never values, so nothing about the user's apps or account ends
up in the log. With them, the readers above can be taught the server's actual field names.

### `idArgumentName()`

<!-- code: apps/desktop/src/main/apps/portalData.ts#idArgumentName -->

[`src/main/apps/portalData.ts`, lines 119–135](../../apps/desktop/src/main/apps/portalData.ts#L119-L135)

```ts
/** Which argument of a tool takes the app's ID (from its input schema). */
export function idArgumentName(inputSchema: unknown): string {
  const properties = isObject(inputSchema) && isObject(inputSchema['properties'])
  const names = properties ? Object.keys(inputSchema['properties'] as Item) : []
  const required =
    isObject(inputSchema) && Array.isArray(inputSchema['required'])
      ? (inputSchema['required'] as unknown[]).filter((n): n is string => typeof n === 'string')
      : []
  const looksLikeId = (n: string) => /^(application_?id|app_?id|id)$/i.test(n)
  return (
    required.find(looksLikeId) ??
    names.find(looksLikeId) ??
    required.find((n) => /id$/i.test(n)) ??
    names.find((n) => /id$/i.test(n)) ??
    'id'
  )
}
```

<!-- /code -->

Which argument of `launch_application` takes the app's ID. Every MCP tool describes its
arguments with a _JSON Schema_ (`inputSchema`): an object whose `properties` lists the argument
names and whose `required` says which must be given. Rather than assume a name, this reads it.

- `looksLikeId`: `application_id`, `applicationId`, `app_id`, `appId` or `id`, in any case.
- `required.find(looksLikeId) ?? names.find(looksLikeId) ?? ...`: a required argument with one of
  those names first, then any argument with one, then anything ending in "id", and `'id'` if all
  else fails.

### `findLaunchUrl()`

<!-- code: apps/desktop/src/main/apps/portalData.ts#findLaunchUrl -->

[`src/main/apps/portalData.ts`, lines 137–171](../../apps/desktop/src/main/apps/portalData.ts#L137-L171)

```ts
/** The sign-in link in a launch_application answer: a URL field, or the first web address in it. */
export function findLaunchUrl(result: ToolResult): string | null {
  const payload = payloadOf(result)
  const search = (value: unknown, depth: number): string | null => {
    if (depth > 4) return null
    if (typeof value === 'string') return httpsUrl(value)
    if (Array.isArray(value)) {
      for (const v of value) {
        const found = search(v, depth + 1)
        if (found) return found
      }
      return null
    }
    if (!isObject(value)) return null
    for (const key of URL_KEYS) {
      const found = httpsUrl(value[key])
      if (found) return found
    }
    for (const v of Object.values(value)) {
      const found = search(v, depth + 1)
      if (found) return found
    }
    return null
  }
  const found = search(payload, 0)
  if (found) return found
  const blocks = Array.isArray(result.content) ? result.content : []
  for (const block of blocks) {
    if (isObject(block) && typeof block['text'] === 'string') {
      const match = /https:\/\/[^\s"'<>)]+/.exec(block['text'])
      if (match) return httpsUrl(match[0])
    }
  }
  return null
}
```

<!-- /code -->

The sign-in link in a `launch_application` answer.

- `const search = (value: unknown, depth: number) =>`: looks through the answer: a string that is
  an `https` address, the items of a list, or an object's usual link fields (`URL_KEYS`) before
  its other fields.
- `if (depth > 4) return null`: doesn't go deeper than a few levels, so an odd answer can't make
  it search for ever.
- `/https:\/\/[^\s"'<>)]+/.exec(block['text'])`: if the data held no link, the first `https`
  address anywhere in the text blocks (up to the first space, quote, angle bracket or closing
  bracket), in case the tool answers in words. It still goes through `httpsUrl()`.

## `src/main/apps/PortalApps.ts`: the list, the sign-in and opening apps

The Apps list's logic: loading the list, connecting the user, and opening apps. It has no
Electron in it: the connection to the server, the encrypted store, the local listener, the browser
and logo fetching all come in through `PortalAppsDeps`, so `tests/portalApps.test.ts` runs it
against a fake portal. `start()` in `index.ts` creates the one instance when the tenant has a
`portal`, and `registerApps()` in `ipc.ts` calls it.

### `LIST_TOOL`, `LAUNCH_TOOL` and `SCOPE`

<!-- code: apps/desktop/src/main/apps/PortalApps.ts#LIST_TOOL,LAUNCH_TOOL,SCOPE -->

[`src/main/apps/PortalApps.ts`, lines 19–24](../../apps/desktop/src/main/apps/PortalApps.ts#L19-L24)

```ts
/** The portal's tools, from JumpCloud's MCP Server for Users. */
export const LIST_TOOL = 'list_applications'

export const LAUNCH_TOOL = 'launch_application'

/** Everything JumpCloud's apps server offers; offline_access keeps the user connected. */
const SCOPE = 'openid profile email offline_access organization userconsole'
```

<!-- /code -->

- `LIST_TOOL`, `LAUNCH_TOOL`: the names of the two tools used, from JumpCloud's documentation of
  the server.
- `SCOPE`: what the app asks to be allowed to do when the user connects. As the comment says, it's
  everything the apps server offers: the user's identity (`openid profile email`), `organization`
  and `userconsole`, and `offline_access`, which asks for a refresh token, so the user doesn't have
  to sign in again every time the short-lived access token runs out.

### `McpSession`, `NeedsSignInError` and `McpConnector`

<!-- code: apps/desktop/src/main/apps/PortalApps.ts#McpSession,NeedsSignInError,McpConnector -->

[`src/main/apps/PortalApps.ts`, lines 26–50](../../apps/desktop/src/main/apps/PortalApps.ts#L26-L50)

```ts
/** A connection to the apps server, signed in as the user. */
export interface McpSession {
  listTools(): Promise<{ name: string; inputSchema?: unknown }[]>
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>
  close(): Promise<void>
}

/** Thrown when there's no usable sign-in: the user has to connect, in the browser. */
export class NeedsSignInError extends Error {
  constructor() {
    super('Sign-in needed')
  }
}

/** Talks to the apps server (src/main/apps/mcp.ts; tests use a fake). */
export interface McpConnector {
  /** Connects with the saved sign-in (renewing it if needed); throws NeedsSignInError if none. */
  connect(provider: OAuthClientProvider): Promise<McpSession>
  /**
   * The OAuth steps. Without a code: registers Desktop Assist with the server if it isn't yet,
   * and asks the provider to send the user to the sign-in page ('REDIRECT'). With the code from
   * the browser: swaps it for tokens ('AUTHORIZED').
   */
  authorize(provider: OAuthClientProvider, code?: string): Promise<'AUTHORIZED' | 'REDIRECT'>
}
```

<!-- /code -->

The small interfaces `PortalApps` talks to the server through. The real ones are in `mcp.ts`;
the tests use fakes.

- `McpSession`: one open connection, signed in as the user: list the server's tools, call one,
  close.
- `NeedsSignInError`: the connector throws this when there's no sign-in it can use, so
  `PortalApps` can tell "the user has to connect" apart from every other failure (`instanceof`).
- `connect(provider)`: opens a session with the saved sign-in, renewing it if needed. The
  `provider` is the `SavedAuth` below, which the SDK reads the tokens from.
- `authorize(provider, code?)`: the OAuth steps, as the comment explains. It answers
  `'REDIRECT'` when the user needs to go to the sign-in page, and `'AUTHORIZED'` once there are
  tokens.

### `PortalAppsDeps` and `Saved`

<!-- code: apps/desktop/src/main/apps/PortalApps.ts#PortalAppsDeps,Saved -->

[`src/main/apps/PortalApps.ts`, lines 52–73](../../apps/desktop/src/main/apps/PortalApps.ts#L52-L73)

```ts
export interface PortalAppsDeps {
  appName: string
  redirectPort: number
  connector: McpConnector
  /** The connection to the portal, saved encrypted (Windows DPAPI). */
  store: {
    load(): Promise<string | null>
    save(secret: string): Promise<void>
    clear(): Promise<void>
  }
  listen(port: number): Promise<RedirectListener>
  openBrowser(url: string): Promise<void>
  /** An app's logo as a data: URL, or null. */
  fetchLogo(url: string): Promise<string | null>
  onState(state: AppsState): void
  onError?(message: string, error?: unknown): void
}

interface Saved {
  client?: OAuthClientInformationMixed
  tokens?: OAuthTokens
}
```

<!-- /code -->

`PortalAppsDeps` is everything `PortalApps` needs from outside; `start()` in `index.ts` passes
the real ones (see [Main process: startup, IPC and app plumbing](2-main-startup.md)).

- `appName`: how the app names itself when it registers with JumpCloud.
- `store`: the encrypted file (`SecretStore` over `jumpcloud-apps.bin`), seen only as load, save
  and clear.
- `listen(port)`: starts the local web server for the browser to come back to.
- `onState(state)`: called on every change of the list's state; `index.ts` broadcasts it.
- `onError?(message, error?)`: a line for the problem log.
- `Saved`: what goes in the file: the app's registration with JumpCloud (`client`) and the user's
  tokens. Both are optional, since either may not exist yet.

### `SavedAuth`

<!-- code: apps/desktop/src/main/apps/PortalApps.ts#SavedAuth.class -->

[`src/main/apps/PortalApps.ts`, lines 75–80](../../apps/desktop/src/main/apps/PortalApps.ts#L75-L80)

```ts
/**
 * The OAuth client the MCP SDK drives: Desktop Assist as a public client (PKCE, no secret) with a
 * loopback redirect. It remembers the registration and the tokens; the sign-in page is only opened
 * by PortalApps.signIn(), never by just looking at the list.
 */
export class SavedAuth implements OAuthClientProvider {
  // …
}
```

<!-- /code -->

The MCP SDK does the OAuth steps, but asks its _provider_ (an `OAuthClientProvider`) for
everything particular to the app: what to register as, where the browser should come back to,
the saved tokens, and what to do when the user has to sign in. `SavedAuth` is that provider.
`implements OAuthClientProvider` makes TypeScript check it has every method the SDK expects.

As the comment says, it never opens the browser itself. When the SDK decides the user has to sign
in, it calls `redirectToAuthorization()`, which here only notes the address. So merely loading the
list can't pop up a browser window; only the Sign in button does, through `PortalApps.signIn()`.

### `SavedAuth` fields, constructor and `load()`

<!-- code: apps/desktop/src/main/apps/PortalApps.ts#SavedAuth.saved,verifier,expectedState,authorizationUrl,constructor,load -->

[`src/main/apps/PortalApps.ts`, lines 81–100](../../apps/desktop/src/main/apps/PortalApps.ts#L81-L100)

```ts
private saved: Saved = {}

private verifier = ''

private expectedState = ''

/** Where the user has to go to sign in, once the SDK has asked for it. */
authorizationUrl: URL | null = null

constructor(
  private readonly appName: string,
  private readonly redirectPort: number,
  private readonly store: PortalAppsDeps['store'],
) {}

async load(): Promise<void> {
  try {
    const text = await this.store.load()
    this.saved = text ? (JSON.parse(text) as Saved) : {}
  } catch {
    this.saved = {}
  }
}
```

<!-- /code -->

- `saved`: the registration and tokens, as in the file.
- `verifier`: the current sign-in's PKCE secret. It's needed only until the code is swapped, so
  it's kept in memory, not saved.
- `expectedState`: the random `state` sent with the current sign-in, to check the browser's
  return against.
- `authorizationUrl`: the sign-in page's address, once the SDK has asked for one.
- `load()`: reads the file. A missing, undecryptable or damaged file just means "not connected"
  (`{}`), never an error.

### `SavedAuth.redirectUrl` and `SavedAuth.clientMetadata`

<!-- code: apps/desktop/src/main/apps/PortalApps.ts#SavedAuth.redirectUrl,clientMetadata -->

[`src/main/apps/PortalApps.ts`, lines 102–115](../../apps/desktop/src/main/apps/PortalApps.ts#L102-L115)

```ts
get redirectUrl(): string {
  return `http://127.0.0.1:${this.redirectPort}/callback`
}

get clientMetadata(): OAuthClientMetadata {
  return {
    client_name: this.appName,
    redirect_uris: [this.redirectUrl],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: SCOPE,
  }
}
```

<!-- /code -->

What the app registers as. Both are _getters_, read like fields.

- `redirectUrl`: the local listener's address, which the browser returns to.
- `client_name`: the app's name, shown on JumpCloud's consent page if it shows one.
- `grant_types: ['authorization_code', 'refresh_token']`: signing in with a code from the browser,
  and renewing with a refresh token.
- `token_endpoint_auth_method: 'none'`: a _public client_: the app proves nothing with a secret
  when it fetches tokens, because it has none. PKCE protects the code instead.

### `SavedAuth.state()` and `SavedAuth.isExpectedState()`

<!-- code: apps/desktop/src/main/apps/PortalApps.ts#SavedAuth.state,isExpectedState -->

[`src/main/apps/PortalApps.ts`, lines 117–125](../../apps/desktop/src/main/apps/PortalApps.ts#L117-L125)

```ts
state(): string {
  this.expectedState = randomBytes(16).toString('base64url')
  return this.expectedState
}

/** Whether the browser came back from the sign-in this app started. */
isExpectedState(state: string | null): boolean {
  return state !== null && this.expectedState !== '' && state === this.expectedState
}
```

<!-- /code -->

OAuth's `state` check. The SDK calls `state()` when it builds the sign-in address, and the value
travels to JumpCloud and back on the browser's return. `isExpectedState()` then makes sure the
browser came back from the sign-in this app started, not a link someone else sent the browser to.

- `randomBytes(16).toString('base64url')`: 16 random bytes, written with letters, digits, `-` and
  `_`, so it's safe in a web address.
- `this.expectedState !== ''`: before any sign-in has started, nothing is accepted.

### Saving the registration and the tokens

<!-- code: apps/desktop/src/main/apps/PortalApps.ts#SavedAuth.clientInformation,saveClientInformation,tokens,saveTokens -->

[`src/main/apps/PortalApps.ts`, lines 127–143](../../apps/desktop/src/main/apps/PortalApps.ts#L127-L143)

```ts
clientInformation(): OAuthClientInformationMixed | undefined {
  return this.saved.client
}

async saveClientInformation(client: OAuthClientInformationMixed): Promise<void> {
  this.saved = { ...this.saved, client }
  await this.persist()
}

tokens(): OAuthTokens | undefined {
  return this.saved.tokens
}

async saveTokens(tokens: OAuthTokens): Promise<void> {
  this.saved = { ...this.saved, tokens }
  await this.persist()
}
```

<!-- /code -->

The SDK reads the registration and tokens through these, and hands over new ones (after
registering, signing in or renewing) to be saved. Each save writes the file at once, so a renewed
token isn't lost if the app quits.

### `SavedAuth.redirectToAuthorization()`, `saveCodeVerifier()` and `codeVerifier()`

<!-- code: apps/desktop/src/main/apps/PortalApps.ts#SavedAuth.redirectToAuthorization,saveCodeVerifier,codeVerifier -->

[`src/main/apps/PortalApps.ts`, lines 145–155](../../apps/desktop/src/main/apps/PortalApps.ts#L145-L155)

```ts
redirectToAuthorization(authorizationUrl: URL): void {
  this.authorizationUrl = authorizationUrl
}

saveCodeVerifier(verifier: string): void {
  this.verifier = verifier
}

codeVerifier(): string {
  return this.verifier
}
```

<!-- /code -->

- `redirectToAuthorization(authorizationUrl)`: only notes the address; `PortalApps.signIn()`
  opens it.
- `saveCodeVerifier()`, `codeVerifier()`: the SDK makes the PKCE secret when it builds the sign-in
  address, and asks for it back when it swaps the code for tokens.

### `SavedAuth.invalidateCredentials()` and `SavedAuth.persist()`

<!-- code: apps/desktop/src/main/apps/PortalApps.ts#SavedAuth.invalidateCredentials,persist -->

[`src/main/apps/PortalApps.ts`, lines 157–167](../../apps/desktop/src/main/apps/PortalApps.ts#L157-L167)

```ts
async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery') {
  if (scope === 'all' || scope === 'client') this.saved = {}
  else if (scope === 'tokens') this.saved = { client: this.saved.client }
  if (scope === 'all' || scope === 'verifier') this.verifier = ''
  await this.persist()
}

private async persist(): Promise<void> {
  if (this.saved.client || this.saved.tokens) await this.store.save(JSON.stringify(this.saved))
  else await this.store.clear()
}
```

<!-- /code -->

- `invalidateCredentials(scope)`: the SDK calls this when JumpCloud rejects something saved: the
  registration (`client`, or `all`), so the app registers again, or the tokens, so the user signs
  in again. It then tries once more.
- `{ client: this.saved.client }`: forgetting the tokens keeps the registration.
- `persist()`: writes the file, or deletes it when there's nothing left to keep.

### `PortalApps`

<!-- code: apps/desktop/src/main/apps/PortalApps.ts#PortalApps.class -->

[`src/main/apps/PortalApps.ts`, lines 170–175](../../apps/desktop/src/main/apps/PortalApps.ts#L170-L175)

```ts
/**
 * The Apps list: the apps in the user's JumpCloud User Portal, from JumpCloud's MCP Server for
 * Users, and opening one in the browser through its sign-in link. The user connects once, in the
 * browser; the connection is saved and renewed by itself.
 */
export class PortalApps {
  // …
}
```

<!-- /code -->

The class `index.ts` and `ipc.ts` use, with the comment that sums it up.

### `PortalApps` fields, constructor and `current`

<!-- code: apps/desktop/src/main/apps/PortalApps.ts#PortalApps.state,apps,auth,loaded,session,loading,listener,loadedOnce,logos,constructor,current -->

[`src/main/apps/PortalApps.ts`, lines 176–194](../../apps/desktop/src/main/apps/PortalApps.ts#L176-L194)

```ts
private state: AppsState = { status: 'loading' }

private apps: PortalAppInfo[] = []

private readonly auth: SavedAuth

private loaded: Promise<void>

private session: McpSession | null = null

private loading: Promise<AppsState> | null = null

private listener: RedirectListener | null = null

private loadedOnce = false

/** Logos already fetched, by address, so a refresh doesn't download them all again. */
private readonly logos = new Map<string, string>()

constructor(private readonly deps: PortalAppsDeps) {
  this.auth = new SavedAuth(deps.appName, deps.redirectPort, deps.store)
  this.loaded = this.auth.load()
}

get current(): AppsState {
  return this.state
}
```

<!-- /code -->

- `state`: what the list is doing (`AppsState`). Every change goes through `setState()`, which
  also reports it.
- `apps`: the last list read, with the details the page doesn't get (logo addresses, links), for
  `open()`.
- `loaded`: the promise of reading the saved connection, started in the constructor. Everything
  that needs it waits for it first (`await this.loaded`).
- `session`: the open connection to the server, reused between calls, or `null`.
- `loading`: the list load under way, if any, so two requests at once share one load.
- `listener`: the local web server while a sign-in is waiting for the browser.
- `loadedOnce`: whether the list has been loaded (or found to need a sign-in) at least once.
- `logos`: the logos already fetched, by address, as the comment says (see `logo()` below).
- `get current()`: the state as it is now, for the tests.

### `PortalApps.get()`

<!-- code: apps/desktop/src/main/apps/PortalApps.ts#PortalApps.get -->

[`src/main/apps/PortalApps.ts`, lines 196–201](../../apps/desktop/src/main/apps/PortalApps.ts#L196-L201)

```ts
/** The list as it stands, loading it the first time (or again with `refresh`). */
async get(refresh = false): Promise<AppsState> {
  if (this.state.status === 'signing-in') return this.state
  if (this.loadedOnce && !refresh && this.state.status !== 'error') return this.state
  return this.load()
}
```

<!-- /code -->

What the page gets whenever the list shows, or on Refresh or Retry; `index.ts` also calls it once
at startup, to load the list in the background.

- `if (this.state.status === 'signing-in') return this.state`: while the user is signing in in the
  browser, nothing else happens; the list loads when that finishes.
- `if (this.loadedOnce && !refresh && this.state.status !== 'error') return this.state`: once
  loaded, the list is answered from memory, so opening the Apps list again is instant. An error is
  always tried again.

### `PortalApps.signIn()`

<!-- code: apps/desktop/src/main/apps/PortalApps.ts#PortalApps.signIn -->

[`src/main/apps/PortalApps.ts`, lines 203–243](../../apps/desktop/src/main/apps/PortalApps.ts#L203-L243)

```ts
/** Connects to the portal: the user signs in in the browser, then the list loads. */
async signIn(): Promise<void> {
  if (this.state.status === 'signing-in') return
  this.setState({ status: 'signing-in' })
  try {
    await this.loaded
    this.listener = await this.deps.listen(this.deps.redirectPort)
    this.auth.authorizationUrl = null
    if ((await this.deps.connector.authorize(this.auth)) === 'REDIRECT') {
      const url = this.auth.authorizationUrl as URL | null
      if (!url) throw new Error('The sign-in page address is missing')
      await this.deps.openBrowser(url.href)
      const back = new URL(await this.listener.result)
      const problem = back.searchParams.get('error_description') ?? back.searchParams.get('error')
      if (problem) throw new Error(problem)
      if (!this.auth.isExpectedState(back.searchParams.get('state'))) {
        throw new Error("The sign-in didn't come from this app")
      }
      const code = back.searchParams.get('code')
      if (!code) throw new Error('The sign-in came back without a code')
      await this.deps.connector.authorize(this.auth, code)
    }
    await this.closeSession()
    this.listener = null
    this.state = { status: 'loading' }
    await this.load()
  } catch (error) {
    this.listener?.close()
    this.listener = null
    if (error instanceof SignInCancelledError) {
      this.setState({ status: 'sign-in' })
      return
    }
    const message =
      error instanceof SignInTimeoutError
        ? 'Signing in took too long. Try again.'
        : `Signing in didn't work: ${error instanceof Error ? error.message : String(error)}`
    this.deps.onError?.('Connecting to the apps list failed:', error)
    this.setState({ status: 'sign-in', message })
  }
}
```

<!-- /code -->

Connects the user's portal: **Sign in with JumpCloud**. It runs for as long as the user takes in
the browser; the page isn't waiting on it, and follows along through the state.

- `this.listener = await this.deps.listen(this.deps.redirectPort)`: the local web server starts
  first, so it's ready before the browser could come back.
- `this.deps.connector.authorize(this.auth)`: no code yet. The SDK registers the app if it isn't
  registered, then either renews a saved sign-in (`'AUTHORIZED'`, and there's nothing for the user
  to do) or builds the sign-in address and hands it to `redirectToAuthorization()`
  (`'REDIRECT'`).
- `await this.deps.openBrowser(url.href)`: the user signs in at JumpCloud, in their own browser.
- `const back = new URL(await this.listener.result)`: waits for the browser to come back to the
  local server, and reads the address it came back to.
- `back.searchParams.get('error_description') ?? back.searchParams.get('error')`: JumpCloud
  reports a refusal (the user said no, say) in the address; it becomes the message.
- `if (!this.auth.isExpectedState(back.searchParams.get('state')))`: the `state` check above.
- `await this.deps.connector.authorize(this.auth, code)`: swaps the code for tokens, which
  `SavedAuth` saves.
- `await this.closeSession()`, `this.state = { status: 'loading' }`, `await this.load()`: any old
  connection is dropped and the list loads with the new sign-in. Setting `state` directly (not
  through `setState()`) avoids reporting a `loading` that `load()` reports itself.
- `catch (error) {`: the listener is closed in every failure. `SignInCancelledError` (Cancel)
  just goes back to the Sign in button; a timeout (the listener gives up after 5 minutes) or any
  other failure goes back to it with a message, and is logged.

### `PortalApps.cancelSignIn()`, `open()` and `dispose()`

<!-- code: apps/desktop/src/main/apps/PortalApps.ts#PortalApps.cancelSignIn,open,dispose -->

[`src/main/apps/PortalApps.ts`, lines 245–262](../../apps/desktop/src/main/apps/PortalApps.ts#L245-L262)

```ts
cancelSignIn(): void {
  this.listener?.close()
}

/** Opens the app in the browser through its sign-in link. False if there's no link for it. */
async open(id: string): Promise<boolean> {
  const app = this.apps.find((a) => a.id === id)
  if (!app) return false
  const url = (await this.launchUrl(app).catch(() => null)) ?? app.launchUrl
  if (!url) return false
  await this.deps.openBrowser(url)
  return true
}

async dispose(): Promise<void> {
  this.listener?.close()
  await this.closeSession()
}
```

<!-- /code -->

- `cancelSignIn()`: closing the listener makes `signIn()`'s wait end with `SignInCancelledError`.
- `open(id)`: only an ID from the last list is accepted. The link from `launch_application` is
  asked for first; if that fails (`.catch(() => null)`), the link the list itself gave is used, if
  any. With no link at all, `false` lets the panel say so.
- `dispose()`: when the app quits, a waiting sign-in is stopped and the connection closed.

### `PortalApps.load()` and `PortalApps.fetchList()`

<!-- code: apps/desktop/src/main/apps/PortalApps.ts#PortalApps.load,fetchList -->

[`src/main/apps/PortalApps.ts`, lines 264–291](../../apps/desktop/src/main/apps/PortalApps.ts#L264-L291)

```ts
private load(): Promise<AppsState> {
  this.loading ??= this.fetchList().finally(() => (this.loading = null))
  return this.loading
}

private async fetchList(): Promise<AppsState> {
  if (this.state.status !== 'ready') this.setState({ status: 'loading' })
  try {
    const result = await this.call(LIST_TOOL, {})
    const apps = parseAppList(result)
    if (!apps) {
      this.deps.onError?.(
        `The apps list came back in an unexpected form: ${describeShape(result)}`,
      )
      return this.setState({ status: 'error', message: "Couldn't read your apps list." })
    }
    this.apps = apps
    this.loadedOnce = true
    return this.setState({ status: 'ready', apps: await this.withLogos(apps) })
  } catch (error) {
    if (error instanceof NeedsSignInError) {
      this.loadedOnce = true
      return this.setState({ status: 'sign-in' })
    }
    this.deps.onError?.('Loading the apps list failed:', error)
    return this.setState({ status: 'error', message: friendlyError(error) })
  }
}
```

<!-- /code -->

- `this.loading ??= ...`: `??=` assigns only if `loading` is `null`. So a second request while a
  load is under way gets the same promise rather than starting another; `.finally()` clears it
  when the load ends.
- `if (this.state.status !== 'ready') this.setState({ status: 'loading' })`: on a refresh, the old
  list stays on screen while the new one loads, rather than flashing "Getting your apps…".
- `if (!apps) {`: the answer held no list at all. The log gets its shape (`describeShape()`), and
  the panel says the list couldn't be read.
- `apps: await this.withLogos(apps)`: the list only appears once the logos are in, so icons don't
  pop in one by one.
- `if (error instanceof NeedsSignInError)`: nobody has connected yet, or the connection has ended:
  the Sign in button, without a message.
- `friendlyError(error)`: any other failure, in plain English; the log gets the details.

### `PortalApps.call()`

<!-- code: apps/desktop/src/main/apps/PortalApps.ts#PortalApps.call -->

[`src/main/apps/PortalApps.ts`, lines 293–307](../../apps/desktop/src/main/apps/PortalApps.ts#L293-L307)

```ts
/** Calls a tool, connecting first if needed and once more if the connection has gone stale. */
private async call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  await this.loaded
  for (let attempt = 0; ; attempt++) {
    try {
      this.session ??= await this.deps.connector.connect(this.auth)
      const result = await this.session.callTool(name, args)
      if (result.isError) throw new Error(`The ${name} tool reported an error`)
      return result
    } catch (error) {
      await this.closeSession()
      if (error instanceof NeedsSignInError || attempt > 0) throw error
    }
  }
}
```

<!-- /code -->

Calls a tool, connecting first if there's no open session.

- `for (let attempt = 0; ; attempt++)`: a loop with no end condition, left by `return` or `throw`.
- `this.session ??= await this.deps.connector.connect(this.auth)`: connects only when there's no
  session.
- `if (result.isError) throw`: a tool that reports its own failure counts as an error.
- `await this.closeSession()`, `if (error instanceof NeedsSignInError || attempt > 0) throw error`:
  after any failure the session is dropped. A connection kept open between uses can go stale (the
  server forgets it, say), so the first failure gets one more try with a fresh connection. A
  missing sign-in, or a second failure, is passed on.

### `PortalApps.launchUrl()`, `PortalApps.withLogos()` and `PortalApps.logo()`

<!-- code: apps/desktop/src/main/apps/PortalApps.ts#PortalApps.launchUrl,withLogos,logo -->

[`src/main/apps/PortalApps.ts`, lines 309–331](../../apps/desktop/src/main/apps/PortalApps.ts#L309-L331)

```ts
private async launchUrl(app: PortalAppInfo): Promise<string | null> {
  await this.loaded
  this.session ??= await this.deps.connector.connect(this.auth)
  const tool = (await this.session.listTools()).find((t) => t.name === LAUNCH_TOOL)
  if (!tool) return null
  const result = await this.call(LAUNCH_TOOL, { [idArgumentName(tool.inputSchema)]: app.id })
  return findLaunchUrl(result)
}

private async withLogos(apps: PortalAppInfo[]): Promise<PortalApp[]> {
  return Promise.all(
    apps.map(async ({ id, name, logoUrl }) => ({ id, name, logo: await this.logo(logoUrl) })),
  )
}

private async logo(url: string | null): Promise<string | null> {
  if (!url) return null
  const known = this.logos.get(url)
  if (known) return known
  const logo = await this.deps.fetchLogo(url).catch(() => null)
  if (logo) this.logos.set(url, logo) // a failure is tried again next time
  return logo
}
```

<!-- /code -->

- `(await this.session.listTools()).find((t) => t.name === LAUNCH_TOOL)`: the launch tool's
  description, for its argument name. A server without the tool means no link this way.
- `{ [idArgumentName(tool.inputSchema)]: app.id }`: the arguments object, with the ID under the
  name the tool's schema uses. `[...]` in an object literal computes the field's name.
- `withLogos(apps)`: gets every logo at the same time (`Promise.all`); one that fails is `null`,
  and the list shows the app's first letter instead. Only `id`, `name` and `logo` go into the
  result, which is what the page receives.
- `logo(url)`: one logo. `const known = this.logos.get(url)`: one fetched before (on an earlier
  load, or for another app with the same logo) is used again, so Refresh doesn't download every
  logo again. `if (logo) this.logos.set(url, logo)`: only a logo that arrived is kept; as the
  comment says, a failure is tried again on the next load.

### `PortalApps.closeSession()` and `PortalApps.setState()`

<!-- code: apps/desktop/src/main/apps/PortalApps.ts#PortalApps.closeSession,setState -->

[`src/main/apps/PortalApps.ts`, lines 333–343](../../apps/desktop/src/main/apps/PortalApps.ts#L333-L343)

```ts
private async closeSession(): Promise<void> {
  const session = this.session
  this.session = null
  await session?.close().catch(() => {})
}

private setState(state: AppsState): AppsState {
  this.state = state
  this.deps.onState(state)
  return state
}
```

<!-- /code -->

- `closeSession()`: forgets the session first, then closes it, ignoring a failure to close (it may
  be broken already).
- `setState(state)`: records the new state, reports it (`onState`), and returns it, so
  `fetchList()` can `return this.setState(...)`.

### `friendlyError()`

<!-- code: apps/desktop/src/main/apps/PortalApps.ts#friendlyError -->

[`src/main/apps/PortalApps.ts`, lines 346–357](../../apps/desktop/src/main/apps/PortalApps.ts#L346-L357)

```ts
/** A plain-English reason for the panel. */
function friendlyError(error: unknown): string {
  const status = (error as { code?: unknown; status?: unknown } | null)?.status
  const message = error instanceof Error ? error.message : String(error)
  if (status === 403 || /\b403\b|forbidden/i.test(message)) {
    return "The apps list isn't turned on for your company yet. Ask IT to turn on JumpCloud's MCP Server for users."
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(message)) {
    return "Couldn't reach JumpCloud. Check you're online and try again."
  }
  return "Couldn't get your apps from JumpCloud. Try again."
}
```

<!-- /code -->

What the list says when loading fails.

- `status === 403 || /\b403\b|forbidden/i.test(message)`: a refusal (403, "forbidden") is taken
  to mean the usual cause, that the MCP Server for Users hasn't been turned on for the company.
  The message says so, and who can fix it.
- `/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i`: the usual signs of no connection.
- Anything else gets a general "try again".

## `src/main/apps/mcp.ts`: the connection, through the MCP SDK

The only file that uses the MCP SDK. It turns the SDK's client into the `McpConnector` that
`PortalApps` expects, and fetches logos. It isn't unit-tested against a real server; its logo
fetching is.

### `Fetch` and `mcpConnector()`

<!-- code: apps/desktop/src/main/apps/mcp.ts#Fetch,mcpConnector -->

[`src/main/apps/mcp.ts`, lines 6–50](../../apps/desktop/src/main/apps/mcp.ts#L6-L50)

```ts
type Fetch = (url: string | URL, init?: RequestInit) => Promise<Response>

/**
 * The real connection to JumpCloud's MCP Server for Users, through the official MCP SDK: its
 * Streamable HTTP transport, and its OAuth (discovery, client registration, PKCE, token renewal).
 * `fetch` is Electron's, so company proxies set in Windows are used.
 */
export function mcpConnector(options: {
  serverUrl: string
  client: { name: string; version: string }
  fetch: Fetch
}): McpConnector {
  const { serverUrl, fetch } = options
  return {
    async connect(provider) {
      const client = new Client(options.client)
      const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
        authProvider: provider,
        fetch,
      })
      try {
        await client.connect(transport)
      } catch (error) {
        await client.close().catch(() => {})
        if (error instanceof UnauthorizedError) throw new NeedsSignInError()
        throw error
      }
      return {
        listTools: async () => (await client.listTools()).tools,
        callTool: async (name, args) => {
          const result: Record<string, unknown> = await client.callTool({ name, arguments: args })
          return {
            content: result['content'],
            // Servers on an older protocol answer with `toolResult` instead.
            structuredContent: result['structuredContent'] ?? result['toolResult'],
            isError: result['isError'] === true,
          }
        },
        close: () => client.close(),
      }
    },
    authorize: (provider, code) =>
      auth(provider, { serverUrl, authorizationCode: code, fetchFn: fetch }),
  }
}
```

<!-- /code -->

- `type Fetch`: the shape of the standard `fetch()`. `index.ts` passes Electron's `net.fetch()`
  in this shape, so requests use a proxy set in Windows, as the comment says.
- `new Client(options.client)`: the SDK's MCP client, introducing itself with the app's name and
  version.
- `new StreamableHTTPClientTransport(new URL(serverUrl), { authProvider: provider, fetch })`: how
  the client reaches the server: _Streamable HTTP_, MCP's transport over ordinary web requests.
  With `authProvider`, the transport adds the saved access token to each request, and when the
  server answers "unauthorized" it runs the SDK's OAuth steps (renewing with the refresh token if
  it can).
- `await client.connect(transport)`: the MCP handshake, in which client and server agree on the
  protocol version.
- `if (error instanceof UnauthorizedError) throw new NeedsSignInError()`: the SDK's way of saying
  the user must sign in (there were no tokens, or they couldn't be renewed). `client.close()`
  first, so a failed connection doesn't linger.
- `callTool: async (name, args) => {`: calls a tool and returns just the parts `PortalApps` uses.
  As the comment says, a server on an older version of the protocol puts its data in `toolResult`
  instead.
- `authorize: (provider, code) => auth(provider, { ... })`: the SDK's `auth()` function, which
  does the OAuth steps: discovery, registration if needed, then either a code swap (with a code),
  a renewal, or building the sign-in address (`'REDIRECT'`).

### `MAX_LOGO_BYTES` and `sniffImageType()`

<!-- code: apps/desktop/src/main/apps/mcp.ts#MAX_LOGO_BYTES,sniffImageType -->

[`src/main/apps/mcp.ts`, lines 52–75](../../apps/desktop/src/main/apps/mcp.ts#L52-L75)

```ts
/** Largest logo fetched for the Apps list. */
const MAX_LOGO_BYTES = 300_000

/**
 * What kind of image a file is, from its first bytes; null if it isn't one. Needed because servers
 * don't always say: JumpCloud serves the logos a company uploads itself as
 * application/octet-stream, while its own catalogue logos come as image/png.
 */
export function sniffImageType(data: Buffer): string | null {
  const startsWith = (...bytes: number[]) => bytes.every((byte, i) => data[i] === byte)
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return 'image/gif'
  if (startsWith(0x52, 0x49, 0x46, 0x46) && data.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  if (startsWith(0x00, 0x00, 0x01, 0x00)) return 'image/x-icon'
  if (startsWith(0x42, 0x4d)) return 'image/bmp'
  const start = data.toString('utf8', 0, 1024).trimStart().toLowerCase()
  if (start.startsWith('<svg') || (start.startsWith('<?xml') && start.includes('<svg'))) {
    return 'image/svg+xml'
  }
  return null
}
```

<!-- /code -->

What kind of image a file is, judged from the file itself. As the comment says, the server's
label can't be relied on: JumpCloud serves the logos a company uploads itself (from
`assets.jumpcloud.com`) labelled `application/octet-stream`, "some bytes", while its catalogue
logos come labelled `image/png`. Trusting the label left the uploaded logos out. Most file formats
start with a fixed _signature_, a few bytes that are always the same, and this checks for them.

- `MAX_LOGO_BYTES = 300_000`: nothing over 300 KB is fetched; a logo shown 40 pixels wide never
  needs more.
- `const startsWith = (...bytes: number[]) => ...`: whether the file begins with these bytes.
  `...bytes` collects all the arguments into one list (a _rest parameter_).
- `0x89, 0x50, 0x4e, 0x47, ...`: PNG's signature (a non-text byte, then `PNG` and line-ending
  characters). `0xff, 0xd8, 0xff` starts every JPEG; `GIF8` (`0x47 0x49 0x46 0x38`) every GIF;
  `0x00 0x00 0x01 0x00` an icon file; `BM` (`0x42 0x4d`) a Windows bitmap.
- `data.toString('latin1', 8, 12) === 'WEBP'`: a WebP file starts with `RIFF`, like several other
  formats, so bytes 8 to 11 are checked too.
- `data.toString('utf8', 0, 1024).trimStart().toLowerCase()`: SVG is text, not a fixed signature.
  The start of the file (ignoring spaces and case) must be an `<svg` element, or an XML
  declaration (`<?xml`) followed by one. An SVG shown as an image can't run scripts, so it's safe
  for the page.
- `return null`: anything else, such as an HTML error page sent in place of a logo.

### `fetchLogo()`

<!-- code: apps/desktop/src/main/apps/mcp.ts#fetchLogo -->

[`src/main/apps/mcp.ts`, lines 77–88](../../apps/desktop/src/main/apps/mcp.ts#L77-L88)

```ts
/** Fetches an app's logo (https only, an image, not too big) as a data: URL for the panel. */
export async function fetchLogo(fetch: Fetch, url: string): Promise<string | null> {
  if (!url.startsWith('https://')) return null
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) return null
  const data = Buffer.from(await response.arrayBuffer())
  if (data.length === 0 || data.length > MAX_LOGO_BYTES) return null
  // Trust the file's own bytes over the server's label: a label of image/* on something that
  // isn't one, or a missing label on a real image, are both common.
  const type = sniffImageType(data)
  return type ? `data:${type};base64,${data.toString('base64')}` : null
}
```

<!-- /code -->

Fetches a logo and turns it into a `data:` URL for the page, which can't load images from the
web itself (its Content-Security-Policy only allows the app's own images and `data:` URLs).

- `if (!url.startsWith('https://')) return null`: `https` only.
- `AbortSignal.timeout(10_000)`: gives up after 10 seconds, so one slow logo can't hold up the
  list for long.
- `if (!response.ok) return null`: an error answer (404, say) is no logo.
- `data.length === 0 || data.length > MAX_LOGO_BYTES`: an empty file, or one over 300 KB, is
  refused.
- `const type = sniffImageType(data)`: as the comment says, the file's own bytes decide what it
  is, not the `content-type` label: that label can be wrong both ways.
- `` `data:${type};base64,${data.toString('base64')}` ``: the image itself, written into the
  address with the type that was found.

## `src/renderer/src/components/AppsList.tsx`: the list in the panel

The component `Panel` puts in the card while the Apps list is showing (through `ChatBox`'s `apps`
prop; see [The pages](7-renderer-pages.md)). It shows whichever `AppsState` the main process last
reported, and calls back to `Panel` for everything you can do.

### `SEARCH_FROM`

<!-- code: apps/desktop/src/renderer/src/components/AppsList.tsx#SEARCH_FROM -->

[`src/renderer/src/components/AppsList.tsx`, lines 7–8](../../apps/desktop/src/renderer/src/components/AppsList.tsx#L7-L8)

```tsx
/** Above this many apps, a search box appears. */
const SEARCH_FROM = 8
```

<!-- /code -->

With more than 8 apps, a search box appears above them. Fewer fit on screen at a glance.

### `AppsList`

<!-- code: apps/desktop/src/renderer/src/components/AppsList.tsx#AppsList -->

[`src/renderer/src/components/AppsList.tsx`, lines 10–188](../../apps/desktop/src/renderer/src/components/AppsList.tsx#L10-L188)

```tsx
/**
 * Shown in the card instead of the text box while the Apps icon is on: the apps in the user's
 * JumpCloud User Portal. Clicking one opens it in the default browser, signed in through
 * JumpCloud like it would be from the portal. The star in a tile's corner puts it first.
 */
export function AppsList(props: {
  open: boolean
  state: AppsState
  appName: string
  portalName: string
  /** IDs of the starred apps, shown first. */
  favorites: string[]
  onToggleFavorite: (app: PortalApp, favorite: boolean) => void
  onOpenApp: (app: PortalApp) => void
  onOpenPortal: () => void
  onSignIn: () => void
  onCancelSignIn: () => void
  onRetry: () => void
}) {
  const [query, setQuery] = useState('')
  const search = useRef<HTMLInputElement>(null)
  const { state } = props
  const apps = useMemo(
    () => (state.status === 'ready' ? orderApps(state.apps, props.favorites) : []),
    [state, props.favorites],
  )

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? apps.filter((app) => app.name.toLowerCase().includes(q)) : apps
  }, [apps, query])

  useEffect(() => {
    if (props.open && apps.length > SEARCH_FROM) search.current?.focus()
  }, [props.open, apps.length])

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-3.5 pt-3 pb-2">
        <LayoutGrid size={15} className="text-accent dark:text-accent-soft" aria-hidden />
        <h2 className="flex-1 text-sm font-semibold">Your apps</h2>
        {state.status === 'ready' && (
          <button
            type="button"
            onClick={props.onRetry}
            title="Refresh"
            aria-label="Refresh the list"
            className="grid size-6 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <RotateCw size={13} aria-hidden />
          </button>
        )}
      </div>

      {state.status === 'loading' && (
        <Message>
          <LoaderCircle size={14} className="animate-spin" aria-hidden /> Getting your apps…
        </Message>
      )}

      {state.status === 'sign-in' && (
        <div className="space-y-2 px-3.5 pb-3">
          <p className="text-xs text-zinc-500">
            {state.message ??
              `Sign in with ${props.portalName} once so ${props.appName} can show your apps.`}
          </p>
          <button
            type="button"
            onClick={props.onSignIn}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white"
          >
            <LogIn size={13} aria-hidden /> Sign in with {props.portalName}
          </button>
        </div>
      )}

      {state.status === 'signing-in' && (
        <div className="flex items-center gap-2 px-3.5 pb-3 text-xs text-zinc-500">
          <LoaderCircle size={14} className="animate-spin" aria-hidden />
          <span className="flex-1">Finish signing in in your browser…</span>
          <button
            type="button"
            onClick={props.onCancelSignIn}
            className="rounded-md px-1.5 py-0.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex items-start gap-2 px-3.5 pb-3 text-xs text-zinc-500">
          <p className="flex-1">{state.message}</p>
          <button
            type="button"
            onClick={props.onRetry}
            className="shrink-0 rounded-md px-1.5 py-0.5 font-medium text-accent hover:bg-zinc-100 dark:text-accent-soft dark:hover:bg-zinc-800"
          >
            Retry
          </button>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          {apps.length > SEARCH_FROM && (
            <label className="mx-3 mb-2 flex shrink-0 items-center gap-2 rounded-lg bg-zinc-100 px-2.5 py-1.5 dark:bg-zinc-800">
              <Search size={13} className="text-zinc-400" aria-hidden />
              <input
                ref={search}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search apps"
                aria-label="Search apps"
                className="w-full bg-transparent text-xs outline-none placeholder:text-zinc-400"
              />
            </label>
          )}
          {apps.length === 0 ? (
            <Message>No apps are assigned to you in {props.portalName} yet.</Message>
          ) : shown.length === 0 ? (
            <Message>No apps match “{query.trim()}”.</Message>
          ) : (
            <ul className="grid min-h-0 grid-cols-3 gap-1 overflow-y-auto px-2 pb-2">
              {shown.map((app) => {
                const favorite = props.favorites.includes(app.id)
                return (
                  <li key={app.id} className="group/tile relative">
                    <button
                      type="button"
                      onClick={() => props.onOpenApp(app)}
                      title={`Open ${app.name}`}
                      className="flex w-full flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-center hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <AppLogo app={app} />
                      <span className="line-clamp-2 text-[11px] leading-tight">{app.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onToggleFavorite(app, !favorite)}
                      aria-pressed={favorite}
                      aria-label={
                        favorite
                          ? `Remove ${app.name} from favourites`
                          : `Add ${app.name} to favourites`
                      }
                      title={favorite ? 'Remove from favourites' : 'Add to favourites'}
                      // On the logo's top-right corner (the 40px logo is centred in the tile).
                      style={{ left: 'calc(50% + 9px)', top: 0 }}
                      className={cn(
                        'absolute grid size-6 place-items-center rounded-full',
                        'hover:bg-zinc-200/70 dark:hover:bg-zinc-700',
                        favorite
                          ? 'text-amber-400'
                          : 'text-zinc-300 opacity-60 group-hover/tile:opacity-100 hover:text-amber-400 focus-visible:opacity-100 dark:text-zinc-600',
                      )}
                    >
                      <Star size={13} fill={favorite ? 'currentColor' : 'none'} aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      <div className="shrink-0 border-t border-black/5 px-2 py-1.5 dark:border-white/10">
        <button
          type="button"
          onClick={props.onOpenPortal}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
        >
          <ExternalLink size={13} aria-hidden /> Open the {props.portalName} portal
        </button>
      </div>
    </div>
  )
}
```

<!-- /code -->

A heading, then one of five views depending on `state.status`, then a link to the portal at the
bottom, always there.

- `const [query, setQuery] = useState('')`: what's typed in the search box.
- `favorites`, `onToggleFavorite`: the starred apps' IDs, and what a star click does.
- `useMemo(() => ..., [state, props.favorites])`: `useMemo` keeps a computed value between renders
  and only works it out again when something in its list changes. `apps` is the list with the
  starred apps first (`orderApps()`), or `[]` when there isn't one yet, and `shown` the apps
  whose names contain the search text, ignoring case.
- `if (props.open && apps.length > SEARCH_FROM) search.current?.focus()`: when there's a search
  box, it gets the keyboard as the panel opens, so you can start typing an app's name at once.
- `{state.status === 'ready' && (`: Refresh (`RotateCw`, a circular arrow) only when there's a list
  to refresh. `onRetry` loads it again.
- `{state.status === 'loading' && (`: "Getting your apps…" with a spinner.
- `{state.status === 'sign-in' && (`: why the user should connect (or the message from a failed
  sign-in), and **Sign in with JumpCloud** (the portal's name comes from `tenant.json`).
- `{state.status === 'signing-in' && (`: "Finish signing in in your browser…" with Cancel, like
  the built-in chat's sign-in.
- `{state.status === 'error' && (`: the reason, and Retry.
- `apps.length === 0 ? (`: no apps assigned yet, or (next) none matching the search, each with its
  own message.
- `grid min-h-0 grid-cols-3 ... overflow-y-auto`: three apps per row, scrolling when there are
  more than fit. `min-h-0` lets a flex item shrink below its content's height, which is what makes
  the scrolling work inside the card's maximum height.
- `<li key={app.id} className="group/tile relative">`: each tile holds two buttons side by side
  in the page, the app and its star. A button can't contain another, and a click on the star
  mustn't open the app. `relative` lets the star be placed over the tile; `group/tile` names the
  tile as a _group_, so the star can react to the pointer being anywhere on the tile.
- `onClick={() => props.onOpenApp(app)}`: `Panel.openApp` opens it in the browser.
- `onClick={() => props.onToggleFavorite(app, !favorite)}`: stars the app, or takes the star away.
- `aria-pressed={favorite}`, `aria-label`: for screen readers, a toggle button that's on or off,
  named "Add Slack to favourites" or "Remove Slack from favourites". `title` gives the shorter
  tooltip.
- `style={{ left: 'calc(50% + 9px)', top: 0 }}`: as the comment says, the 40 px logo is centred
  in the tile, so its right edge is 20 px right of the middle. The 24 px star button starting 9 px
  right of the middle sits over the logo's top-right corner.
- `favorite ? 'text-amber-400' : 'text-zinc-300 opacity-60 group-hover/tile:opacity-100 ...'`: a
  starred app's star is amber and filled (`fill={favorite ? 'currentColor' : 'none'}`). Otherwise
  it's a faint outline that becomes clearer while the pointer is over the tile, turns amber under
  the pointer, and shows fully when reached with the keyboard (`focus-visible:opacity-100`).
- `line-clamp-2`: a long name is cut to two lines with "…".
- `Open the {props.portalName} portal`: opens the User Portal itself, for anything the list
  doesn't cover.

### `AppLogo` and `Message`

<!-- code: apps/desktop/src/renderer/src/components/AppsList.tsx#AppLogo,Message -->

[`src/renderer/src/components/AppsList.tsx`, lines 190–218](../../apps/desktop/src/renderer/src/components/AppsList.tsx#L190-L218)

```tsx
/** The app's logo, or its first letter on the accent colour when there isn't one. */
function AppLogo({ app }: { app: PortalApp }) {
  const [broken, setBroken] = useState(false)
  if (app.logo && !broken) {
    return (
      <img
        src={app.logo}
        alt=""
        onError={() => setBroken(true)}
        className="size-10 rounded-lg bg-white object-contain p-1 shadow-sm"
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-10 place-items-center rounded-lg text-base font-semibold text-white shadow-sm',
        'bg-accent',
      )}
    >
      {app.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

function Message({ children }: { children: ReactNode }) {
  return <p className="flex items-center gap-2 px-3.5 pb-3 text-xs text-zinc-500">{children}</p>
}
```

<!-- /code -->

- `AppLogo`: the logo on a white tile, or, when there's none, the app's first letter on the accent
  colour, as the comment says.
- `onError={() => setBroken(true)}`: if the browser can't show the image after all, the letter
  takes over.
- `alt=""`: the logo is decoration; the app's name is right under it.
- `app.name.trim().charAt(0).toUpperCase() || '?'`: the first letter, in capitals.
- `Message`: one line of grey text, used for the list's simple messages.

## What's tested

`tests/portalApps.test.ts` checks the readers with made-up answers, and runs `PortalApps` against
a fake portal: a connector with two apps and a launch tool that only works once "signed in", a
fake browser that "signs in" and comes back with a code, and an in-memory store.

- Reading the list: JumpCloud-style applications sorted by name, hidden ones skipped; a bare list
  or structured content; `null` when there's no list but `[]` for an empty one; never a link that
  isn't `https`; the launch tool's ID argument found from its schema; and the sign-in link found
  in a launch answer.
- `sniffImageType`: images known by their first bytes (PNG, JPEG, GIF, WebP, icon, bitmap,
  SVG), and `null` for anything else.
- `fetchLogo`: an `https` image becomes a `data:` URL, including JumpCloud's uploaded logos that
  come labelled `application/octet-stream`; `http`, non-images (whatever their label says, such
  as an HTML page labelled `image/png`), failed requests and anything too big are refused.
- `orderApps`: starred apps first, each group keeping its order.
- `PortalApps`: asking to sign in when nobody has connected, without opening the browser;
  signing in through the browser, saving the registration and tokens, then listing the apps with
  logos; remembering the list until Refresh; opening an app through its launch link; refusing a
  sign-in that comes back with a `state` it didn't send; Cancel going back to the Sign in
  button; and keeping the logos it already has, so a refresh doesn't download them again.
- `SavedAuth`: a public client with the loopback redirect; tokens kept across a reload of the
  file; forgetting everything clears the file; and the `state` check.

`tests/tenants.test.ts` checks that the Apps icon needs the portal settings, that the portal's own
address must be `https`, and that starting on the Apps list needs both a portal and the Ask Claude
icon (the text box would be out of reach otherwise). The real server and a real browser sign-in
aren't part of the unit tests.
