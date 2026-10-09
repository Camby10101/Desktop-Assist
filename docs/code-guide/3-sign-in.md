# JumpCloud sign-in

[← Code Guide](CODE_GUIDE.md)

This part covers how Desktop Assist knows who you are, and how that turns into access to Claude
without an API key. You sign in once with JumpCloud in your normal browser. The app keeps a
long-lived _refresh token_, encrypted on disk, and uses it to get short-lived _ID tokens_, which
Anthropic swaps for Claude tokens. All of it runs in the main process: the pages only ever learn the
sign-in status and your name and email (`AuthStatus` in `src/shared/types.ts`), never a token.

This is the built-in chat's sign-in. When a tenant sends questions to Claude Desktop instead
(`chatApp` in `tenant.json`; see [Claude Desktop](9-claude-desktop.md)), none of this page's code
runs: Claude Desktop has its own sign-in.

**Signing in**

1. The user clicks **Sign in with JumpCloud**. IPC `assist:auth-sign-in` calls
   `AuthManager.signIn()`, which sets the status to `signing-in`.
2. `signIn()` starts a tiny web server on `127.0.0.1` with `listenForRedirect()` (`loopback.ts`).
3. `Oidc.begin()` (made by `createOidc()` in `oidc.ts`) builds the JumpCloud sign-in address with
   fresh PKCE, `state` and `nonce` values, and the app opens it in the default browser.
4. The user signs in at JumpCloud (often it finishes by itself). JumpCloud sends the browser back to
   `http://127.0.0.1:47621/callback?code=…&state=…`. The little server answers "you can close this
   tab", stops, and hands the address to `signIn()`.
5. `PendingSignIn.finish()` checks `state`, swaps the code (plus the PKCE secret) for tokens at
   JumpCloud, and has openid-client check the ID token.
6. `signIn()` insists on a refresh token, saves it with your name and email (`startSession()` →
   `SecretStore.save()`), keeps the unused ID token as a _spare_, and sets `signed-in`. `index.ts`
   then reopens the panel.

**Starting up**

1. `startBuiltInChat()` in `index.ts` calls `AuthManager.init()`, which reads the saved sign-in
   with `loadSession()` → `SecretStore.load()`.
2. If there is one, `renew()` → `refresh()` → `Oidc.refresh()` swaps the refresh token for new
   tokens, saves JumpCloud's replacement refresh token (if it sent one), and keeps the new ID token
   as the spare. If JumpCloud can't be reached the status becomes `offline`; if it refuses,
   `endSession('expired')` signs the user out.

**Getting Claude access**

1. On the first chat request, the Anthropic SDK inside `AnthropicBackend` needs a Claude token. Its
   `oidcFederationProvider` calls the `identityToken()` option. `index.ts` set that to a small
   function that calls `AuthManager.freshIdToken()` and notes a summary of the token for the log
   (`summarizeIdToken()` in `idToken.ts`).
2. `freshIdToken()` returns the spare ID token if it has more than a minute left, otherwise gets a
   new one with `refresh()`.
3. The SDK posts the ID token to Anthropic's `/v1/oauth/token`. Anthropic checks it against the
   federation rule and returns a short-lived Claude token. The SDK keeps that token and only repeats
   steps 1 to 3 when it's about to expire, or once if Anthropic rejects it.

**Signing out**

`AuthManager.signOut()` stops any sign-in in progress, `endSession('logout')` deletes the saved
file, and `Oidc.revoke()` asks JumpCloud to cancel the refresh token. Through `onSignedOut`,
`index.ts` drops the SDK's cached Claude token (`backend.reset()`) and clears the chat.

---

## `src/main/auth/AuthManager.ts`: owning the sign-in

`AuthManager` decides whether someone is signed in, keeps the refresh token, and hands out ID tokens
for Claude. `startBuiltInChat()` in `src/main/index.ts` creates the one instance. The IPC handlers
in `src/main/ipc.ts` call `signIn()`, `cancelSignIn()`, `signOut()` and `retry()`; `ChatSession`
asks `canChat` before sending; `AnthropicBackend` calls `freshIdToken()` (through a small wrapper in
`index.ts`). It never touches JumpCloud, the disk or the browser itself: those arrive through
`AuthManagerDeps`, so `tests/authManager.test.ts` can drive it with fakes.

The ideas it is built around:

- **OpenID Connect (OIDC)** is the standard way for an app to ask an identity provider (here
  JumpCloud) "who is this user?". The user signs in on the provider's own web page, so the app never
  sees a password, and the app receives tokens.
- **ID token**: a short-lived JWT (a signed, base64-encoded JSON document) from JumpCloud saying who
  the user is (`sub`, `email`, `name`), which app it was made for (`aud`, the app's client ID) and
  when it expires (`exp`). It's what Anthropic accepts as proof of identity.
- **Refresh token**: a long-lived, opaque string that lets the app get new tokens from JumpCloud
  without the user signing in again. It's the only thing saved to disk. Its lifetime is set in
  JumpCloud (up to 90 days; see `docs/JUMPCLOUD_SETUP.md`).
- **Refresh token rotation**: JumpCloud may answer each refresh with a new refresh token and stop
  accepting the old one. So the newest must always be saved, and two refreshes must never run at
  once with the same token: the second would present a token that was just replaced, JumpCloud would
  refuse it, and a refusal ends the sign-in. That's why refreshes go through a queue.
- **Workload Identity Federation (WIF)** is how Anthropic accepts another identity provider's tokens
  instead of an API key. IT sets up a _federation rule_ in the Claude Console: trust tokens from
  this issuer (JumpCloud), made for this audience (the app's client ID), whose claims match a
  condition (an `@morsemicro.com` email). The SDK sends an ID token; Anthropic checks its signature
  against JumpCloud's published keys and checks the rule, then returns a short-lived Claude token
  for the company's _service account_.
- **Each ID token works once.** Every ID token has a unique ID in its `jti` claim, and Anthropic
  refuses a token whose `jti` it has already accepted (replay protection: a copied token can't be
  swapped again). So every swap needs a new ID token, and `freshIdToken()` never hands out the same
  one twice.

### `SignInRequiredError`, `SignInUnavailableError`

<!-- code: apps/desktop/src/main/auth/AuthManager.ts#SignInRequiredError,SignInUnavailableError -->

[`src/main/auth/AuthManager.ts`, lines 13–25](../../apps/desktop/src/main/auth/AuthManager.ts#L13-L25)

```ts
/** Claude was asked for while nobody is signed in (or the sign-in just expired). */
export class SignInRequiredError extends Error {
  constructor() {
    super('Sign in with JumpCloud to use Claude')
  }
}

/** A saved sign-in couldn't be renewed because JumpCloud couldn't be reached. */
export class SignInUnavailableError extends Error {
  constructor(cause: unknown) {
    super("Couldn't reach JumpCloud", { cause })
  }
}
```

<!-- /code -->

The two ways getting an ID token can fail. `refresh()` throws them, and they travel through the
Anthropic SDK (which wraps them in its own error, with the original as `cause`) to `classifyError()`
in `src/main/claude/errors.ts`. That turns them into the `signed-out` message ("Sign in with
JumpCloud to keep chatting.") and the `sign-in-unreachable` message, both of which offer Retry.

- `extends Error`: a custom error class, so other code can tell the cases apart with `instanceof`.
- `{ cause }`: the standard way to attach the original error (for example a network failure) to a
  new one, so the log still shows what really happened.

### `SessionSchema`, `Session`

<!-- code: apps/desktop/src/main/auth/AuthManager.ts#SessionSchema,Session -->

[`src/main/auth/AuthManager.ts`, lines 27–32](../../apps/desktop/src/main/auth/AuthManager.ts#L27-L32)

```ts
/** What's kept on disk (encrypted) between runs. */
const SessionSchema = z.object({
  refreshToken: z.string().min(1),
  user: z.object({ name: z.string().optional(), email: z.string().optional() }),
})

type Session = z.infer<typeof SessionSchema>
```

<!-- /code -->

The sign-in as it's kept in memory and saved (as JSON, encrypted) in `jumpcloud-session.bin`: the
refresh token, and the user's name and email so the app can show "Signed in as …" while offline.

- `z.object({`: a zod schema, a description of the shape that can check data at runtime.
  `loadSession()` uses it to reject a saved file that doesn't fit.
- `z.infer<typeof SessionSchema>`: derives the TypeScript type from the schema, so the type and the
  runtime check can't drift apart.

### `AuthManagerDeps`

<!-- code: apps/desktop/src/main/auth/AuthManager.ts#AuthManagerDeps -->

[`src/main/auth/AuthManager.ts`, lines 34–51](../../apps/desktop/src/main/auth/AuthManager.ts#L34-L51)

```ts
export interface AuthManagerDeps {
  /** Null when tenant.json isn't filled in yet (`missing` says what's needed). */
  oidc: Oidc | null
  missing: string[]
  store: Pick<SecretStore, 'load' | 'save' | 'clear'>
  redirectPort: number
  listen(port: number): Promise<RedirectListener>
  openBrowser(url: string): Promise<void>
  onStatus(status: AuthStatus): void
  /**
   * Nobody is signed in any more: the user logged out, or JumpCloud ended their sign-in (they'll
   * usually sign straight back in, so the conversation can be kept for them).
   */
  onSignedOut(reason: 'logout' | 'expired'): void
  /** Signing in or renewing failed; gets the full error, for the log. */
  onError?(error: unknown): void
  now?: () => number
}
```

<!-- /code -->

Everything `AuthManager` needs from outside, passed to its constructor. `startBuiltInChat()` in
`index.ts` supplies the real ones: `createOidc()`, a `SecretStore` using Windows DPAPI,
`listenForRedirect()` and Electron's `shell.openExternal()`.

- `oidc: Oidc | null`: `null` when `missingSettings()` in `src/main/tenant.ts` says tenant.json
  isn't filled in; `missing` then lists what's needed, for the panel to show.
- `Pick<SecretStore, 'load' | 'save' | 'clear'>`: a TypeScript utility type meaning "any object with
  these three methods of `SecretStore`", so tests can pass a simple in-memory store.
- `onStatus(status: AuthStatus): void`: called on every status change. `index.ts` broadcasts it to
  both pages on IPC `assist:auth-status`, and reopens the panel when `signing-in` turns into
  `signed-in`.
- `onSignedOut(reason: 'logout' | 'expired'): void`: `index.ts` calls `backend.reset()` (forgetting
  the cached Claude token) for both reasons, and clears the chat only for `'logout'`. After
  `'expired'` the conversation stays, so Retry can resend the failed message once the user signs
  back in.
- `now?: () => number`: an optional clock; tests use it to make ID tokens look old.

### `MIN_ID_TOKEN_LIFE_S`

<!-- code: apps/desktop/src/main/auth/AuthManager.ts#MIN_ID_TOKEN_LIFE_S -->

[`src/main/auth/AuthManager.ts`, lines 53–54](../../apps/desktop/src/main/auth/AuthManager.ts#L53-L54)

```ts
/** An ID token is only handed out if it's valid for at least this much longer. */
const MIN_ID_TOKEN_LIFE_S = 60
```

<!-- /code -->

`takeIdToken()` only hands out the spare ID token if it has more than 60 seconds left. A token that
expires on its way to Anthropic, or that a slightly fast clock at Anthropic already sees as expired,
would make the swap fail.

### `class AuthManager`

The class, with the comment that describes it:

<!-- code: apps/desktop/src/main/auth/AuthManager.ts#AuthManager.class -->

[`src/main/auth/AuthManager.ts`, lines 56–67](../../apps/desktop/src/main/auth/AuthManager.ts#L56-L67)

```ts
/**
 * Owns the JumpCloud sign-in.
 *
 * Signing in opens JumpCloud in the browser (where the user is usually already signed in, so it
 * completes on its own). What's kept is a refresh token, saved encrypted, so the user stays
 * signed in across restarts; `init()` renews it at every start.
 *
 * Claude access is granted per ID token, and each ID token can only be exchanged once, so
 * `freshIdToken()` hands out a new one every time: the unused one from signing in first, then one
 * from a refresh. JumpCloud may replace the refresh token on every refresh; the newest is saved.
 */
export class AuthManager {
  // …
}
```

<!-- /code -->

This block shows only the class's own description (its doc comment) and its first line; the body is
left out (`// …`), and its fields and methods follow one by one below. The description sums up the
design: sign in through the browser, keep the refresh token so the user stays signed in, renew it at
every start, and hand out a new ID token for every swap with Anthropic.

### `AuthManager` fields

<!-- code: apps/desktop/src/main/auth/AuthManager.ts#AuthManager.state,session,spare,listener,signInCancelled,queue,generation -->

[`src/main/auth/AuthManager.ts`, lines 68–78](../../apps/desktop/src/main/auth/AuthManager.ts#L68-L78)

```ts
private state: AuthStatus = { state: 'checking' }

private session: Session | null = null

/** An ID token not yet exchanged for Claude access. */
private spare: { token: string; exp: number } | null = null

private listener: RedirectListener | null = null

/** Cancel was pressed during the current sign-in (possibly before the browser opened). */
private signInCancelled = false

/** Refreshes run one at a time, since each may replace the refresh token. */
private queue: Promise<unknown> = Promise.resolve()

/** Bumped by sign-in and sign-out, so a slow refresh can't bring back a session that ended. */
private generation = 0
```

<!-- /code -->

The class keeps all its state in these private fields.

- `state`: the current `AuthStatus`. It starts as `checking` because `init()` hasn't run yet. It's
  only ever changed through `setStatus()`, so the pages always hear about it.
- `session`: who is signed in, and their refresh token. `null` means nobody is.
- `spare`: an ID token that JumpCloud handed over (when signing in, or when renewing at startup) and
  that hasn't been swapped yet. `exp` is its expiry in Unix seconds, straight from the token.
- `listener`: the loopback listener while a browser sign-in is waiting, so `cancelSignIn()` can
  close it.
- `signInCancelled`: set by `cancelSignIn()` during a sign-in. Closing the listener only stops the
  wait for the browser; this flag also covers a Cancel pressed before the browser has opened.
- `queue`: a chain of promises. Each refresh is attached to the end, so refreshes run strictly one
  after another (see rotation above).
- `generation`: a counter that `signIn()` and `endSession()` increase. Slow work notes the value
  before it starts waiting and compares afterwards; if it changed, the user signed in or out
  meanwhile and the result is thrown away. This stops, for example, a refresh that finishes after
  Log out from saving the refresh token again.

### `AuthManager.constructor`, `status`, `canChat`

<!-- code: apps/desktop/src/main/auth/AuthManager.ts#AuthManager.constructor,status,canChat -->

[`src/main/auth/AuthManager.ts`, lines 80–89](../../apps/desktop/src/main/auth/AuthManager.ts#L80-L89)

```ts
constructor(private readonly deps: AuthManagerDeps) {}

get status(): AuthStatus {
  return this.state
}

/** Whether chat requests can be made (they may still need JumpCloud to renew the sign-in). */
get canChat(): boolean {
  return this.session !== null && this.state.state !== 'signing-in'
}
```

<!-- /code -->

- `private readonly deps: AuthManagerDeps`: TypeScript shorthand that declares a private, read-only
  field `deps` and stores the argument in it, so the constructor body is empty.
- `get status()`: a getter, read like a field (`auth.status`). `getState()` in `index.ts` uses it to
  give a freshly loaded page the current status.
- `get canChat()`: whether `ChatSession` may start a request. It's true whenever a sign-in exists,
  including `checking` and `offline`: the request itself calls `freshIdToken()`, which tries
  JumpCloud again. It's false while a browser sign-in is in progress.

### `AuthManager.init()`

<!-- code: apps/desktop/src/main/auth/AuthManager.ts#AuthManager.init -->

[`src/main/auth/AuthManager.ts`, lines 91–101](../../apps/desktop/src/main/auth/AuthManager.ts#L91-L101)

```ts
/** Loads the saved sign-in and renews it. Called once at startup. */
async init(): Promise<void> {
  if (!this.deps.oidc)
    return this.setStatus({ state: 'unconfigured', missing: this.deps.missing })
  const generation = this.generation
  const session = await this.loadSession()
  if (generation !== this.generation) return // signed in or out meanwhile
  this.session = session
  if (!session) return this.setStatus({ state: 'signed-out' })
  await this.renew()
}
```

<!-- /code -->

Runs once at startup (`startBuiltInChat()` in `index.ts` calls it without waiting). It loads the
saved sign-in and renews it straight away, before any chat. That shows an expired sign-in at once
rather than on the first message, saves JumpCloud's newest refresh token, and leaves a spare ID
token ready for the first message.

- `if (!this.deps.oidc)`: tenant.json isn't filled in, so the status becomes `unconfigured` with the
  list of missing settings, and JumpCloud is never contacted. `return this.setStatus(...)` is just a
  short way to set the status and stop.
- `if (generation !== this.generation) return`: reading the file takes a moment. If the user signed
  in or out in the meantime, what was read is out of date and must not replace the newer state.
- `if (!session) return this.setStatus({ state: 'signed-out' })`: nothing saved (or the file
  couldn't be read or decrypted), so the panel offers Sign in.

### `AuthManager.retry()`

<!-- code: apps/desktop/src/main/auth/AuthManager.ts#AuthManager.retry -->

[`src/main/auth/AuthManager.ts`, lines 103–107](../../apps/desktop/src/main/auth/AuthManager.ts#L103-L107)

```ts
/** Tries again after `init()` couldn't reach JumpCloud. */
async retry(): Promise<void> {
  if (this.state.state !== 'offline' || !this.session) return
  await this.renew()
}
```

<!-- /code -->

The **Retry** button on the offline banner (IPC `assist:auth-retry`). It renews again, but only if
the app really is offline with a saved sign-in, so a stray click in any other state does nothing.

### `AuthManager.signIn()`

<!-- code: apps/desktop/src/main/auth/AuthManager.ts#AuthManager.signIn -->

[`src/main/auth/AuthManager.ts`, lines 109–143](../../apps/desktop/src/main/auth/AuthManager.ts#L109-L143)

```ts
/** Signs in through the browser. Resolves when it finishes, fails or is cancelled. */
async signIn(): Promise<void> {
  const oidc = this.deps.oidc
  if (!oidc || this.state.state === 'signing-in') return
  const generation = ++this.generation
  this.signInCancelled = false
  this.setStatus({ state: 'signing-in' })

  let listener: RedirectListener | null = null
  try {
    listener = await this.deps.listen(this.deps.redirectPort)
    this.listener = listener
    const pending = await oidc.begin(listener.redirectUri)
    // Cancel may have been pressed while JumpCloud's settings were being fetched.
    if (this.signInCancelled) throw new SignInCancelledError()
    await this.deps.openBrowser(pending.url)
    const tokens = await pending.finish(await listener.result)
    if (!tokens.refreshToken) {
      throw new Error(
        "JumpCloud didn't allow staying signed in. Ask IT to turn on the Refresh Token grant for this app.",
      )
    }
    if (generation !== this.generation) return
    await this.startSession(tokens.refreshToken, userOf(tokens.claims))
    this.spare = { token: tokens.idToken, exp: tokens.claims.exp }
    this.setStatus({ state: 'signed-in', user: userOf(tokens.claims) })
  } catch (error) {
    if (generation !== this.generation) return
    if (!(error instanceof SignInCancelledError)) this.deps.onError?.(error)
    this.setStatus({ state: 'signed-out', message: signInFailure(error) })
  } finally {
    listener?.close()
    if (this.listener === listener) this.listener = null
  }
}
```

<!-- /code -->

The whole browser sign-in, from opening JumpCloud to saving the result. The IPC handler starts it
and returns at once, because it can take minutes; progress reaches the panel through the status.

- `if (!oidc || this.state.state === 'signing-in') return`: not set up, or already waiting for the
  browser (a second click does nothing).
- `const generation = ++this.generation`: increases the counter first, so a refresh still running
  from before (for example the startup renewal) can't overwrite this sign-in when it finishes.
- `this.signInCancelled = false`: a fresh sign-in starts uncancelled.
- `listener = await this.deps.listen(this.deps.redirectPort)`: the loopback server is started before
  the browser opens, so it's ready when JumpCloud sends the browser back. This is also where "port
  in use" fails, before the browser opens.
- `const pending = await oidc.begin(listener.redirectUri)`: makes the sign-in address. `pending`
  keeps the secret PKCE, state and nonce values needed by `finish()`.
- `if (this.signInCancelled) throw new SignInCancelledError()`: `begin()` may have spent a few
  seconds fetching JumpCloud's settings (the first time only), and the user may have pressed Cancel
  meanwhile. Without this check the browser would still open JumpCloud, with nothing listening for
  its return. Throwing lands in the `catch` below, just like a cancel while waiting for the browser.
- `await this.deps.openBrowser(pending.url)`: opens the default browser.
- `const tokens = await pending.finish(await listener.result)`: waits (up to 5 minutes) for the
  browser to come back, then swaps the code for tokens.
- `if (!tokens.refreshToken)`: without a refresh token the app couldn't keep the user signed in, or
  get a second ID token, so it stops with a message for IT.
- `if (generation !== this.generation) return`: the user signed out while this was running, so the
  tokens are thrown away.
- `this.spare = { token: tokens.idToken, exp: tokens.claims.exp }`: the ID token from signing in
  hasn't been swapped yet, so it's kept for the first chat message, saving a refresh.
- `if (!(error instanceof SignInCancelledError)) this.deps.onError?.(error)`: a cancel is the user's
  choice, so only real failures are logged. Either way the status goes back to `signed-out`, with
  the message from `signInFailure()` (none for a cancel).
- `finally`: always closes the listener (closing an already finished listener does nothing), and
  clears the `listener` field only if it still belongs to this sign-in.

### `AuthManager.cancelSignIn()`

<!-- code: apps/desktop/src/main/auth/AuthManager.ts#AuthManager.cancelSignIn -->

[`src/main/auth/AuthManager.ts`, lines 145–149](../../apps/desktop/src/main/auth/AuthManager.ts#L145-L149)

```ts
/** Stops waiting for a sign-in started in the browser. */
cancelSignIn(): void {
  if (this.state.state === 'signing-in') this.signInCancelled = true
  this.listener?.close()
}
```

<!-- /code -->

The **Cancel** button while waiting for the browser (IPC `assist:auth-cancel`), and the first step
of `signOut()`. Either way `signIn()` ends with `signed-out` and no message.

- `if (this.state.state === 'signing-in') this.signInCancelled = true`: records the cancel, for the
  case where Cancel is pressed before the browser has opened (while `begin()` is still running).
  `signIn()` checks the flag after `begin()` and stops there. Outside a sign-in there's nothing to
  cancel, so the flag is left alone.
- `this.listener?.close()`: once the listener exists, closing it makes its `result` fail with
  `SignInCancelledError`, which ends a sign-in that is waiting for the browser.

### `AuthManager.signOut()`

<!-- code: apps/desktop/src/main/auth/AuthManager.ts#AuthManager.signOut -->

[`src/main/auth/AuthManager.ts`, lines 151–160](../../apps/desktop/src/main/auth/AuthManager.ts#L151-L160)

```ts
/** Forgets the sign-in here, and tells JumpCloud to revoke it. */
async signOut(): Promise<void> {
  const refreshToken = this.session?.refreshToken
  this.cancelSignIn()
  await this.endSession('logout')
  if (refreshToken) {
    // Best effort: the saved copy is already gone, so failing to reach JumpCloud is harmless.
    await this.deps.oidc?.revoke(refreshToken).catch(() => {})
  }
}
```

<!-- /code -->

**Log out** in Settings (IPC `assist:auth-sign-out`). It forgets the sign-in on this PC first, then
asks JumpCloud to revoke the refresh token.

- `const refreshToken = this.session?.refreshToken`: taken first, because `endSession()` clears
  `session`.
- `await this.endSession('logout')`: deletes the saved file and sets `signed-out`;
  `onSignedOut('logout')` makes `index.ts` reset the Claude client and clear the chat.
- `revoke(refreshToken).catch(() => {})`: revoking means JumpCloud stops accepting that refresh
  token, so a leftover copy (in a backup, say) is useless. If JumpCloud can't be reached the error
  is ignored: the user is signed out on this PC either way.

### `AuthManager.freshIdToken()`

<!-- code: apps/desktop/src/main/auth/AuthManager.ts#AuthManager.freshIdToken -->

[`src/main/auth/AuthManager.ts`, lines 162–171](../../apps/desktop/src/main/auth/AuthManager.ts#L162-L171)

```ts
/**
 * A new, unused ID token for one exchange with Claude. Throws SignInRequiredError when nobody is
 * signed in or the sign-in has expired, and SignInUnavailableError when JumpCloud can't be
 * reached.
 */
freshIdToken(): Promise<string> {
  const next = this.queue.then(() => this.takeIdToken())
  this.queue = next.catch(() => {})
  return next
}
```

<!-- /code -->

Gives the Anthropic SDK one new, never-swapped ID token. `index.ts` hands `AnthropicBackend` an
`identityToken` function that calls it (and summarizes the token for the log, see `idToken.ts`), and
the SDK calls that whenever it needs a new Claude token.

- `this.queue.then(() => this.takeIdToken())`: runs after every refresh already queued, so two
  requests at once never refresh with the same refresh token in parallel.
- `this.queue = next.catch(() => {})`: the queue continues from this step even if it fails. Without
  the `catch`, one failed refresh would leave a rejected promise at the end of the queue, and every
  later `.then` would be skipped and fail too.
- `return next`: the caller still gets the real outcome, error included (`SignInRequiredError` or
  `SignInUnavailableError`).

### `AuthManager.takeIdToken()`

<!-- code: apps/desktop/src/main/auth/AuthManager.ts#AuthManager.takeIdToken -->

[`src/main/auth/AuthManager.ts`, lines 173–178](../../apps/desktop/src/main/auth/AuthManager.ts#L173-L178)

```ts
private async takeIdToken(): Promise<string> {
  const spare = this.spare
  this.spare = null
  if (spare && spare.exp - this.nowSeconds() > MIN_ID_TOKEN_LIFE_S) return spare.token
  return (await this.refresh()).idToken
}
```

<!-- /code -->

Runs inside the queue: uses the spare ID token if there's a good one, otherwise refreshes for a new
one.

- `this.spare = null`: the spare is removed before it's checked, so it can be used at most once. A
  spare that's too old is simply dropped.
- `spare.exp - this.nowSeconds() > MIN_ID_TOKEN_LIFE_S`: more than a minute left, so it's safe to
  send.

### `AuthManager.renew()`

<!-- code: apps/desktop/src/main/auth/AuthManager.ts#AuthManager.renew -->

[`src/main/auth/AuthManager.ts`, lines 180–196](../../apps/desktop/src/main/auth/AuthManager.ts#L180-L196)

```ts
/** Renews the saved sign-in at startup (or on Retry), keeping its ID token for the first chat. */
private async renew(): Promise<void> {
  this.setStatus({ state: 'checking' })
  try {
    const tokens = await this.queueRefresh()
    this.spare = { token: tokens.idToken, exp: tokens.claims.exp }
  } catch (error) {
    if (error instanceof SignInUnavailableError && this.session) {
      this.setStatus({
        state: 'offline',
        user: this.session.user,
        message: "Couldn't reach JumpCloud to renew your sign-in. Check your connection.",
      })
    }
    // SignInRequiredError: refresh() has already signed the user out.
  }
}
```

<!-- /code -->

The startup renewal (from `init()`) and the offline Retry. Unlike a refresh made for a chat request,
it sets the status along the way and never throws.

- `this.setStatus({ state: 'checking' })`: the panel shows "Checking your JumpCloud sign-in…".
  `refresh()` sets `signed-in` when it succeeds.
- `this.spare = { token: tokens.idToken, exp: tokens.claims.exp }`: the new ID token is kept for the
  first chat message.
- `error instanceof SignInUnavailableError && this.session`: JumpCloud couldn't be reached, so the
  sign-in is kept and the status becomes `offline`, with a banner offering Retry. Chat stays usable
  (`canChat` is still true) and each send tries JumpCloud again. The `this.session` check also tells
  TypeScript that `this.session.user` on the next lines is safe.
- `// SignInRequiredError: refresh() has already signed the user out.`: so there's nothing left to
  do here. (The same error also comes back when the user signed in or out while this was running,
  and then the newer state stands.)

### `AuthManager.queueRefresh()`

<!-- code: apps/desktop/src/main/auth/AuthManager.ts#AuthManager.queueRefresh -->

[`src/main/auth/AuthManager.ts`, lines 198–202](../../apps/desktop/src/main/auth/AuthManager.ts#L198-L202)

```ts
private queueRefresh(): Promise<OidcTokens> {
  const next = this.queue.then(() => this.refresh())
  this.queue = next.catch(() => {})
  return next
}
```

<!-- /code -->

The same queueing as `freshIdToken()`, but for `renew()`, which needs the whole `OidcTokens`
(including the ID token's expiry) rather than just the token.

### `AuthManager.refresh()`

<!-- code: apps/desktop/src/main/auth/AuthManager.ts#AuthManager.refresh -->

[`src/main/auth/AuthManager.ts`, lines 204–237](../../apps/desktop/src/main/auth/AuthManager.ts#L204-L237)

```ts
/** Swaps the refresh token for new tokens and saves the replacement refresh token. */
private async refresh(): Promise<OidcTokens> {
  const session = this.session
  if (!session || !this.deps.oidc) throw new SignInRequiredError()
  const generation = this.generation

  let tokens: OidcTokens
  try {
    tokens = await this.deps.oidc.refresh(session.refreshToken)
  } catch (error) {
    if (generation !== this.generation) throw new SignInRequiredError()
    this.deps.onError?.(error)
    if (error instanceof SessionExpiredError) {
      await this.endSession(
        'expired',
        'Your JumpCloud sign-in has expired. Sign in again to keep chatting.',
      )
      throw new SignInRequiredError()
    }
    throw new SignInUnavailableError(error)
  }
  if (generation !== this.generation) throw new SignInRequiredError()

  const user = userOf(tokens.claims, session.user)
  if (tokens.refreshToken && tokens.refreshToken !== session.refreshToken) {
    await this.startSession(tokens.refreshToken, user)
  } else {
    this.session = { ...session, user }
  }
  if (this.state.state !== 'signed-in' || !sameUser(this.state.user, user)) {
    this.setStatus({ state: 'signed-in', user })
  }
  return tokens
}
```

<!-- /code -->

Swaps the refresh token with JumpCloud for a new ID token (and possibly a new refresh token), and
decides what a failure means. It's always called through the queue.

- `if (!session || !this.deps.oidc) throw new SignInRequiredError()`: nobody is signed in, so there
  is nothing to refresh.
- `tokens = await this.deps.oidc.refresh(session.refreshToken)`: the refresh-token request to
  JumpCloud (`Oidc.refresh()` in `oidc.ts`).
- `if (generation !== this.generation) throw new SignInRequiredError()` (in the `catch`): the user
  signed in or out while waiting, so this failure no longer matters and isn't logged or acted on.
- `if (error instanceof SessionExpiredError)`: JumpCloud answered and said no (expired, revoked, or
  the user lost access). The sign-in is over, so `endSession('expired', …)` signs out with an
  explanation.
- `throw new SignInUnavailableError(error)`: anything else (offline, a timeout, a JumpCloud server
  error, an unexpected response) counts as "couldn't reach JumpCloud". The sign-in is kept, because
  it may well work next time.
- `if (generation !== this.generation) throw new SignInRequiredError()` (after success): the user
  logged out while the request was on its way. Saving the new refresh token now would bring back a
  sign-in they just ended.
- `userOf(tokens.claims, session.user)`: the name and email from the new ID token, falling back to
  the saved ones for anything it leaves out.
- `if (tokens.refreshToken && tokens.refreshToken !== session.refreshToken)`: JumpCloud rotated the
  refresh token, so the new one is saved at once (the old one may already be dead). Otherwise only
  the in-memory user is updated, and the saved file is left alone.
- `if (this.state.state !== 'signed-in' || !sameUser(this.state.user, user))`: tells the pages only
  when something changed, not on every refresh. This is also how `checking` (after `renew()`) and
  `offline` turn into `signed-in`.

### `AuthManager.startSession()`

<!-- code: apps/desktop/src/main/auth/AuthManager.ts#AuthManager.startSession -->

[`src/main/auth/AuthManager.ts`, lines 239–247](../../apps/desktop/src/main/auth/AuthManager.ts#L239-L247)

```ts
private async startSession(refreshToken: string, user: SignedInUser): Promise<void> {
  this.session = { refreshToken, user }
  try {
    await this.deps.store.save(JSON.stringify(this.session))
  } catch (error) {
    // Still signed in for this run; the user will just be asked again next start.
    console.error('Saving the sign-in failed', error)
  }
}
```

<!-- /code -->

Records a new sign-in, or a rotated refresh token, in memory and on disk (`SecretStore.save()`, as
JSON).

- `console.error('Saving the sign-in failed', error)`: saving can fail, for example if Windows
  encryption isn't available. The user stays signed in for this run; at the next start the old file
  (or none) is found and they may have to sign in again. That's better than failing a sign-in that
  worked.

### `AuthManager.endSession()`

<!-- code: apps/desktop/src/main/auth/AuthManager.ts#AuthManager.endSession -->

[`src/main/auth/AuthManager.ts`, lines 249–258](../../apps/desktop/src/main/auth/AuthManager.ts#L249-L258)

```ts
private async endSession(reason: 'logout' | 'expired', message?: string): Promise<void> {
  this.generation++
  this.session = null
  this.spare = null
  await this.deps.store.clear().catch((error: unknown) => {
    console.error('Removing the saved sign-in failed', error)
  })
  this.setStatus(message ? { state: 'signed-out', message } : { state: 'signed-out' })
  this.deps.onSignedOut(reason)
}
```

<!-- /code -->

Ends the sign-in, for Log out (`'logout'`) or because JumpCloud refused it (`'expired'`).

- `this.generation++`: happens first, before anything that waits, so every refresh or sign-in still
  in flight sees that its result is out of date.
- `this.spare = null`: an unused ID token belongs to the old sign-in and mustn't be swapped any
  more.
- `this.deps.store.clear()`: if deleting the file fails, the user is still signed out for this run;
  the error is only logged.
- `this.deps.onSignedOut(reason)`: `index.ts` forgets the cached Claude token, and for Log out
  clears the chat.

### `AuthManager.loadSession()`

<!-- code: apps/desktop/src/main/auth/AuthManager.ts#AuthManager.loadSession -->

[`src/main/auth/AuthManager.ts`, lines 260–269](../../apps/desktop/src/main/auth/AuthManager.ts#L260-L269)

```ts
private async loadSession(): Promise<Session | null> {
  try {
    const saved = await this.deps.store.load()
    if (!saved) return null
    const parsed = SessionSchema.safeParse(JSON.parse(saved))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
```

<!-- /code -->

Reads the saved sign-in for `init()`. Any problem means "nothing saved", so the worst case is that
the user signs in again.

- `SessionSchema.safeParse(JSON.parse(saved))`: `safeParse` returns success or failure instead of
  throwing, so a file in an old or unexpected shape is ignored.
- `catch {`: covers a file that can't be read and text that isn't JSON. (`SecretStore.load()`
  already returns `null` for a missing file or one that can't be decrypted.)

### `AuthManager.setStatus()`, `AuthManager.nowSeconds()`

<!-- code: apps/desktop/src/main/auth/AuthManager.ts#AuthManager.setStatus,nowSeconds -->

[`src/main/auth/AuthManager.ts`, lines 271–278](../../apps/desktop/src/main/auth/AuthManager.ts#L271-L278)

```ts
private setStatus(status: AuthStatus): void {
  this.state = status
  this.deps.onStatus(status)
}

private nowSeconds(): number {
  return (this.deps.now?.() ?? Date.now()) / 1000
}
```

<!-- /code -->

- `setStatus`: the one place the status changes, so the stored value and what the pages are told
  can't differ.
- `nowSeconds`: the current time in seconds, because a token's `exp` is in Unix seconds while
  `Date.now()` is in milliseconds. `this.deps.now?.()` lets tests supply the clock.

### `userOf()`, `sameUser()`, `signInFailure()`

<!-- code: apps/desktop/src/main/auth/AuthManager.ts#userOf,sameUser,signInFailure -->

[`src/main/auth/AuthManager.ts`, lines 281–294](../../apps/desktop/src/main/auth/AuthManager.ts#L281-L294)

```ts
function userOf(claims: IdTokenClaims, fallback: SignedInUser = {}): SignedInUser {
  return { name: claims.name ?? fallback.name, email: claims.email ?? fallback.email }
}

function sameUser(a: SignedInUser, b: SignedInUser): boolean {
  return a.name === b.name && a.email === b.email
}

/** What to tell the user when signing in didn't work (nothing if they cancelled). */
function signInFailure(error: unknown): string | undefined {
  if (error instanceof SignInCancelledError) return undefined
  if (error instanceof SignInTimeoutError) return 'Sign-in timed out. Try again.'
  return `Sign-in didn't work. ${describeSignInError(error)}`
}
```

<!-- /code -->

Small helpers outside the class.

- `claims.name ?? fallback.name`: an ID token may leave out `name` or `email` (they're optional
  claims), so the previously known value is kept. `??` uses the right side only when the left is
  `null` or `undefined`.
- `sameUser`: lets `refresh()` skip a status update when nothing changed.
- `signInFailure`: the message under the Sign in button. A cancel shows nothing, the 5-minute
  timeout has its own message, and anything else is explained by `describeSignInError()` in
  `oidc.ts`.

---

## `src/main/auth/oidc.ts`: OpenID Connect with JumpCloud

The only file that speaks OIDC. It wraps the `openid-client` library (version 6) behind a small
`Oidc` interface with three calls (`begin`, `refresh`, `revoke`), so `AuthManager` and its tests
don't depend on the library. `startBuiltInChat()` in `index.ts` creates it with
`createOidc(signIn, { allowInsecure: localIssuer })` only when tenant.json is complete.

The ideas behind it:

- **Authorization Code flow**: the app sends the browser to JumpCloud's _authorization endpoint_.
  After the user signs in, JumpCloud sends the browser back to the app's _redirect URI_ with a
  one-time `code`. The app then posts that code straight to JumpCloud's _token endpoint_ and gets
  the tokens in the reply, so tokens never appear in the browser.
- **Public client with PKCE** (Proof Key for Code Exchange): a desktop app can't keep a secret,
  since anyone can unpack the installer, so it has no client secret (JumpCloud's "Public (None
  PKCE)" setting). Instead, each sign-in makes a random _code verifier_ and puts only its SHA-256
  hash (the _code challenge_) in the browser address. When swapping the code, the app sends the
  verifier itself, and JumpCloud checks that it matches. A code intercepted on its way back is
  useless without the verifier, which never left the app.
- **`state`**: a random value sent out with the browser and expected back unchanged. It proves the
  callback belongs to the sign-in this app started, so a forged link can't slip in someone else's
  code (cross-site request forgery).
- **`nonce`**: a random value JumpCloud copies into the ID token. Checking it proves the ID token
  was made for this sign-in and isn't an old one replayed.
- **Discovery**: an OIDC provider publishes its endpoints, keys and features at
  `<issuer>/.well-known/openid-configuration`. openid-client reads that, so only the issuer address
  and the client ID need to be configured.

What openid-client checks on an ID token: the issuer, the audience (must be this app's client ID),
the expiry and issue time, that `sub` is present, the signing algorithm, and (when signing in) the
nonce. As the comment above `createOidc` says, it doesn't verify the signature (openid-client 6 only
does that when `enableNonRepudiationChecks` is turned on, and this code doesn't turn it on). OIDC
allows that: the token came straight from JumpCloud's token endpoint over HTTPS, so TLS already
proves who sent it. Anthropic does verify the signature when the token is swapped.

### `SCOPES`

<!-- code: apps/desktop/src/main/auth/oidc.ts#SCOPES -->

[`src/main/auth/oidc.ts`, lines 4–5](../../apps/desktop/src/main/auth/oidc.ts#L4-L5)

```ts
/** `offline_access` asks for a refresh token, so the user stays signed in across restarts. */
export const SCOPES = 'openid email profile offline_access'
```

<!-- /code -->

What the app asks JumpCloud for: `openid` (this is an OIDC sign-in, so send an ID token), `email`
and `profile` (put the email and name in it), and `offline_access` (also send a refresh token).

### `IdTokenClaims`, `OidcTokens`

<!-- code: apps/desktop/src/main/auth/oidc.ts#IdTokenClaims,OidcTokens -->

[`src/main/auth/oidc.ts`, lines 7–21](../../apps/desktop/src/main/auth/oidc.ts#L7-L21)

```ts
export interface IdTokenClaims {
  sub: string
  email?: string
  name?: string
  /** Expiry, Unix seconds. */
  exp: number
}

export interface OidcTokens {
  /** A signed JWT identifying the user. Exchanged for Claude access (one exchange per token). */
  idToken: string
  /** JumpCloud may rotate this on every refresh; always keep the newest. */
  refreshToken?: string
  claims: IdTokenClaims
}
```

<!-- /code -->

The parts of JumpCloud's answer the app uses. `toTokens()` builds them.

- `sub`: the user's permanent, unique ID at JumpCloud ("subject").
- `exp: number`: when the ID token expires, in Unix seconds. `AuthManager` uses it to decide whether
  a spare is still fresh enough.
- `idToken: string`: the raw JWT, exactly as JumpCloud signed it, because that's what Anthropic
  needs.
- `refreshToken?: string`: optional, because a refresh answer may leave it out when JumpCloud
  doesn't rotate it.

### `PendingSignIn`, `Oidc`

<!-- code: apps/desktop/src/main/auth/oidc.ts#PendingSignIn,Oidc -->

[`src/main/auth/oidc.ts`, lines 23–35](../../apps/desktop/src/main/auth/oidc.ts#L23-L35)

```ts
/** A sign-in started in the browser. */
export interface PendingSignIn {
  url: string
  /** Completes the sign-in from the URL the browser was sent back to. */
  finish(callbackUrl: string): Promise<OidcTokens>
}

/** The identity-provider calls the app needs. The real one wraps openid-client; tests use fakes. */
export interface Oidc {
  begin(redirectUri: string): Promise<PendingSignIn>
  refresh(refreshToken: string): Promise<OidcTokens>
  revoke(refreshToken: string): Promise<void>
}
```

<!-- /code -->

The interface `AuthManager` sees.

- `PendingSignIn`: a sign-in in progress. `url` is the address to open in the browser.
  `finish(callbackUrl)` completes it with the address the browser came back to; it remembers the
  secret values from `begin()`, so they never pass through `AuthManager`.
- `begin(redirectUri: string)`: starts a sign-in that will come back to `redirectUri` (the loopback
  listener's address).
- `refresh(refreshToken: string)`: new tokens without the browser. Throws `SessionExpiredError` if
  JumpCloud refuses.
- `revoke(refreshToken: string)`: asks JumpCloud to stop accepting a refresh token (Log out).

### `SessionExpiredError`

<!-- code: apps/desktop/src/main/auth/oidc.ts#SessionExpiredError -->

[`src/main/auth/oidc.ts`, lines 37–42](../../apps/desktop/src/main/auth/oidc.ts#L37-L42)

```ts
/** JumpCloud refused a saved sign-in (expired, revoked, or the user lost access). */
export class SessionExpiredError extends Error {
  constructor(cause?: unknown) {
    super('Your JumpCloud sign-in has expired', { cause })
  }
}
```

<!-- /code -->

Thrown by `refresh()` when JumpCloud answered "no" (`isRefusal()`), as opposed to not answering.
`AuthManager.refresh()` treats it as the end of the sign-in; any other error keeps the sign-in.

### `createOidc()`

<!-- code: apps/desktop/src/main/auth/oidc.ts#createOidc -->

[`src/main/auth/oidc.ts`, lines 44–113](../../apps/desktop/src/main/auth/oidc.ts#L44-L113)

```ts
/**
 * OpenID Connect with JumpCloud, using openid-client: Authorization Code flow with PKCE as a
 * public client (no client secret; the code verifier proves the app that started the sign-in is
 * the one finishing it), plus state and nonce checks. openid-client checks the ID token's issuer,
 * audience, expiry and nonce. It doesn't check the signature: the token comes straight from
 * JumpCloud over HTTPS, which OpenID Connect allows, and Anthropic verifies the signature when
 * the token is swapped for Claude access.
 */
export function createOidc(config: SignInConfig, options: { allowInsecure?: boolean } = {}): Oidc {
  // Discovery reads the issuer's endpoints once; a failed attempt is retried next time.
  let discovered: Promise<client.Configuration> | null = null
  const configuration = (): Promise<client.Configuration> => {
    discovered ??= client
      .discovery(new URL(config.issuer), config.clientId, undefined, client.None(), {
        // Plain http is only ever allowed for a local test issuer in dev runs.
        execute: options.allowInsecure ? [client.allowInsecureRequests] : [],
        timeout: 15,
      })
      .catch((error: unknown) => {
        discovered = null
        throw error
      })
    return discovered
  }

  return {
    async begin(redirectUri) {
      const configured = await configuration()
      const codeVerifier = client.randomPKCECodeVerifier()
      const state = client.randomState()
      const nonce = client.randomNonce()
      const url = client.buildAuthorizationUrl(configured, {
        redirect_uri: redirectUri,
        scope: SCOPES,
        code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
        code_challenge_method: 'S256',
        state,
        nonce,
      })
      return {
        url: url.href,
        finish: async (callbackUrl) =>
          toTokens(
            await client.authorizationCodeGrant(configured, new URL(callbackUrl), {
              pkceCodeVerifier: codeVerifier,
              expectedState: state,
              expectedNonce: nonce,
              idTokenExpected: true,
            }),
          ),
      }
    },

    async refresh(refreshToken) {
      const configured = await configuration()
      try {
        return toTokens(await client.refreshTokenGrant(configured, refreshToken))
      } catch (error) {
        if (isRefusal(error)) throw new SessionExpiredError(error)
        throw error
      }
    },

    async revoke(refreshToken) {
      const configured = await configuration()
      if (!configured.serverMetadata().revocation_endpoint) return
      await client.tokenRevocation(configured, refreshToken, { token_type_hint: 'refresh_token' })
    },
  }
}
```

<!-- /code -->

The real `Oidc`, built on openid-client. It returns an object with the three methods; they share the
discovery result through the closure (the local variables they can see).

**Discovery** (`discovered` and `configuration`):

- `let discovered: Promise<client.Configuration> | null = null`: the cached discovery. It caches the
  promise, not the result, so callers that arrive while discovery is still running wait for the same
  request instead of starting another.
- `discovered ??= client`: `??=` assigns only when the variable is `null`, so discovery runs on
  first use (not at startup) and only once.
- `config.clientId, undefined, client.None()`: the client ID, no extra client settings, and no
  client authentication. `None()` is how a public client is set up: token requests send just the
  client ID, with no secret.
- `execute: options.allowInsecure ? [client.allowInsecureRequests] : []`: openid-client refuses
  plain `http` unless told otherwise. `index.ts` only sets `allowInsecure` in dev runs whose issuer
  is on this PC (a test sign-in server).
- `timeout: 15`: seconds. openid-client also uses it for every later request made with this
  configuration, so a hung JumpCloud fails after 15 seconds instead of the default 30.
- `discovered = null`: a failed discovery (say, offline at startup) isn't kept, so the next call
  tries again rather than failing forever.

**`begin(redirectUri)`**:

- `client.randomPKCECodeVerifier()`, `client.randomState()`, `client.randomNonce()`: new random
  values for every sign-in. They live only in this function's variables.
- `client.buildAuthorizationUrl(configured, {`: JumpCloud's authorization endpoint (from discovery)
  with these settings added as query parameters. openid-client also adds `client_id` and
  `response_type=code`.
- `code_challenge: await client.calculatePKCECodeChallenge(codeVerifier)`: the SHA-256 hash of the
  verifier, which is all the browser sees. `code_challenge_method: 'S256'` tells JumpCloud which
  hash was used.
- `finish: async (callbackUrl) =>`: an arrow function that still has the verifier, state and nonce
  from this call.
- `client.authorizationCodeGrant(configured, new URL(callbackUrl), {`: does the second half. It
  throws `AuthorizationResponseError` if the callback carries an `error` instead of a code, checks
  `state`, posts the code with the verifier to the token endpoint, and checks the ID token,
  including the nonce. The `redirect_uri` it sends is the callback address without its query, which
  must match the registered one exactly; see `listenForRedirect()`.
- `idTokenExpected: true`: an answer without an ID token is an error.

**`refresh(refreshToken)`**:

- `client.refreshTokenGrant(configured, refreshToken)`: the refresh-token request. The new ID token
  gets the same checks as at sign-in, except the nonce.
- `if (isRefusal(error)) throw new SessionExpiredError(error)`: JumpCloud said no, so the sign-in is
  over. Every other error is passed on unchanged, and `AuthManager.refresh()` treats it as "couldn't
  reach JumpCloud".

**`revoke(refreshToken)`**:

- `if (!configured.serverMetadata().revocation_endpoint) return`: not every provider offers
  revocation (discovery says whether it does), so without one there is nothing to do.
- `token_type_hint: 'refresh_token'`: tells JumpCloud what kind of token it's being sent, which
  helps it find it.

### `TokenResponse`, `toTokens()`

<!-- code: apps/desktop/src/main/auth/oidc.ts#TokenResponse,toTokens -->

[`src/main/auth/oidc.ts`, lines 115–130](../../apps/desktop/src/main/auth/oidc.ts#L115-L130)

```ts
type TokenResponse = Awaited<ReturnType<typeof client.refreshTokenGrant>>

function toTokens(response: TokenResponse): OidcTokens {
  const claims = response.claims()
  if (!response.id_token || !claims) throw new Error('JumpCloud did not return an ID token')
  return {
    idToken: response.id_token,
    refreshToken: response.refresh_token,
    claims: {
      sub: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : undefined,
      name: typeof claims.name === 'string' ? claims.name : undefined,
      exp: claims.exp,
    },
  }
}
```

<!-- /code -->

Turns openid-client's token answer into the app's `OidcTokens`, keeping only what's used.
JumpCloud's access token is ignored, because the app never calls a JumpCloud API.

- `Awaited<ReturnType<typeof client.refreshTokenGrant>>`: the type of what openid-client's token
  functions resolve to, taken from the library rather than written out by hand. `ReturnType` gives
  the function's return type (a promise) and `Awaited` unwraps the promise.
- `response.claims()`: the ID token's contents, already checked by openid-client; `undefined` when
  there's no ID token.
- `if (!response.id_token || !claims)`: without an ID token there's nothing to give Anthropic.
  During a refresh this error is treated as "couldn't reach JumpCloud".
- `typeof claims.email === 'string' ? claims.email : undefined`: a JWT's claims can hold any JSON,
  so only real strings are accepted.

### `describeSignInError()`

<!-- code: apps/desktop/src/main/auth/oidc.ts#describeSignInError -->

[`src/main/auth/oidc.ts`, lines 132–143](../../apps/desktop/src/main/auth/oidc.ts#L132-L143)

```ts
/** Why a browser sign-in failed, in words the user can act on. */
export function describeSignInError(error: unknown): string {
  if (error instanceof client.AuthorizationResponseError) {
    return error.error_description ?? `JumpCloud said "${error.error}".`
  }
  // fetch failures are TypeErrors; openid-client reports its timeouts with code OAUTH_TIMEOUT.
  const timedOut = error instanceof client.ClientError && error.code === 'OAUTH_TIMEOUT'
  if (error instanceof TypeError || timedOut) {
    return "Couldn't reach JumpCloud. Check your connection."
  }
  return error instanceof Error ? error.message : String(error)
}
```

<!-- /code -->

Explains a failed browser sign-in in words the user can act on. Used only by `signInFailure()` in
`AuthManager.ts`.

- `error instanceof client.AuthorizationResponseError`: JumpCloud sent the browser back with an
  error instead of a code, most often because the user isn't in a group assigned to the app.
  `error_description` is JumpCloud's own explanation; if there isn't one, the short error code is
  shown.
- `error instanceof client.ClientError && error.code === 'OAUTH_TIMEOUT'`: a request to JumpCloud
  that took longer than the 15-second `timeout` set in `createOidc()`. openid-client doesn't pass on
  the `TimeoutError` that `fetch` raises: it wraps it in its own `ClientError` with the code
  `OAUTH_TIMEOUT`, so that's what is checked.
- `error instanceof TypeError || timedOut`: `TypeError` is what Node's `fetch` throws ("fetch
  failed") when it can't connect at all, for example offline or a DNS failure. Both cases get
  "Couldn't reach JumpCloud. Check your connection."
- `error instanceof Error ? error.message : String(error)`: anything else shows its own message, for
  example the "Port … is in use" error from `loopback.ts`.

### `isRefusal()`

<!-- code: apps/desktop/src/main/auth/oidc.ts#isRefusal -->

[`src/main/auth/oidc.ts`, lines 145–153](../../apps/desktop/src/main/auth/oidc.ts#L145-L153)

```ts
/** JumpCloud answered, and said no (as opposed to not being reachable). */
function isRefusal(error: unknown): boolean {
  return (
    error instanceof client.ResponseBodyError &&
    ['invalid_grant', 'invalid_client', 'unauthorized_client', 'access_denied'].includes(
      error.error,
    )
  )
}
```

<!-- /code -->

Tells "JumpCloud said no" apart from "JumpCloud didn't answer".

- `error instanceof client.ResponseBodyError`: JumpCloud's token endpoint answered with a standard
  OAuth error (`{"error": "..."}`), so it was reachable.
- `'invalid_grant'`: the refresh token is expired, revoked or already replaced. `'invalid_client'`
  and `'unauthorized_client'`: the app's JumpCloud registration was removed or changed.
  `'access_denied'`: the user lost access. In every case only signing in again can help.

Other error codes, such as `server_error` or `temporarily_unavailable`, aren't refusals: the sign-in
is kept and tried again later.

---

## `src/main/auth/loopback.ts`: catching the browser's return

After the user signs in, JumpCloud has to send the browser somewhere the app can see the `code`. A
desktop app has no website, so it uses a **loopback redirect** (RFC 8252, the standard for native
apps): for each sign-in, the app runs a tiny web server on `127.0.0.1`, the PC's address for itself,
which other computers can't reach. JumpCloud is registered with `http://127.0.0.1:47621/callback` as
the redirect URI. Plain `http` is fine because the traffic never leaves the PC, and PKCE protects
the code even if another program on the PC sees it. `index.ts` passes `listenForRedirect` to
`AuthManager` as `listen`, and `signIn()` starts one listener per sign-in. It uses Node's built-in
`http` module, which works in Electron's main process. The Apps list's connection to JumpCloud
uses the same listener, on port 47622 (see [Your apps](10-apps.md)).

### `CALLBACK_PATH`, `RedirectListener`

<!-- code: apps/desktop/src/main/auth/loopback.ts#CALLBACK_PATH,RedirectListener -->

[`src/main/auth/loopback.ts`, lines 3–13](../../apps/desktop/src/main/auth/loopback.ts#L3-L13)

```ts
export const CALLBACK_PATH = '/callback'

/** Waiting for the browser to come back from the sign-in page. */
export interface RedirectListener {
  /** What JumpCloud must send the browser back to (registered in the JumpCloud app). */
  redirectUri: string
  /** The full URL the browser came back to, including `code` and `state`. */
  result: Promise<string>
  /** Stops waiting (cancel); `result` then rejects with SignInCancelledError. */
  close(): void
}
```

<!-- /code -->

- `CALLBACK_PATH`: the only path the server answers.
- `redirectUri`: the full address to give JumpCloud. `oidc.ts` puts it in the sign-in address, and
  JumpCloud only accepts it if it exactly matches the one registered in the JumpCloud app.
- `result: Promise<string>`: settles once: with the address the browser came back to, or with an
  error for cancel or timeout.
- `close()`: cancels the wait. `AuthManager` calls it from `cancelSignIn()` and always when a
  sign-in ends.

### `SignInCancelledError`, `SignInTimeoutError`

<!-- code: apps/desktop/src/main/auth/loopback.ts#SignInCancelledError,SignInTimeoutError -->

[`src/main/auth/loopback.ts`, lines 15–25](../../apps/desktop/src/main/auth/loopback.ts#L15-L25)

```ts
export class SignInCancelledError extends Error {
  constructor() {
    super('Sign-in was cancelled')
  }
}

export class SignInTimeoutError extends Error {
  constructor() {
    super('Sign-in took too long')
  }
}
```

<!-- /code -->

The two ways `result` can fail. `signInFailure()` in `AuthManager.ts` shows nothing for a cancel and
"Sign-in timed out. Try again." for a timeout.

### `listenForRedirect()`

<!-- code: apps/desktop/src/main/auth/loopback.ts#listenForRedirect -->

[`src/main/auth/loopback.ts`, lines 27–81](../../apps/desktop/src/main/auth/loopback.ts#L27-L81)

```ts
/**
 * Starts a one-shot web server on 127.0.0.1 that catches the browser's redirect after sign-in
 * (the "loopback" method for desktop apps, RFC 8252). It only listens on the local machine,
 * answers the browser with a short page saying it can close the tab, and shuts down after the
 * first callback, a cancel, or the timeout.
 */
export function listenForRedirect(port: number, timeoutMs = 5 * 60_000): Promise<RedirectListener> {
  return new Promise((resolveListener, rejectListener) => {
    let settle: { resolve: (url: string) => void; reject: (error: Error) => void }
    const result = new Promise<string>((resolve, reject) => (settle = { resolve, reject }))
    result.catch(() => {}) // a rejection nobody awaited yet (cancel before the caller waits)

    let timer: ReturnType<typeof setTimeout> | undefined
    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
      if (req.method !== 'GET' || url.pathname !== CALLBACK_PATH) {
        res.writeHead(404).end()
        return
      }
      const error = url.searchParams.get('error_description') ?? url.searchParams.get('error')
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      })
      // Shut down only once the page has been sent.
      res.end(callbackPage(error), () => finish(() => settle.resolve(url.href)))
    })

    let done = false
    const finish = (then: () => void) => {
      if (done) return
      done = true
      clearTimeout(timer)
      server.close()
      server.closeAllConnections()
      then()
    }

    server.once('error', (error: NodeJS.ErrnoException) => {
      rejectListener(
        error.code === 'EADDRINUSE'
          ? new Error(`Port ${port} is in use by another program, so sign-in can't finish.`)
          : error,
      )
    })
    server.listen(port, '127.0.0.1', () => {
      timer = setTimeout(() => finish(() => settle.reject(new SignInTimeoutError())), timeoutMs)
      resolveListener({
        redirectUri: `http://127.0.0.1:${port}${CALLBACK_PATH}`,
        result,
        close: () => finish(() => settle.reject(new SignInCancelledError())),
      })
    })
  })
}
```

<!-- /code -->

Starts the one-shot server and returns once it's actually listening. That lets `signIn()` be sure
the port is open before it opens the browser.

- `return new Promise((resolveListener, rejectListener) =>`: the outer promise resolves with the
  `RedirectListener` once the server is listening, or rejects if it can't start.
- `const result = new Promise<string>((resolve, reject) => (settle = { resolve, reject }))`: creates
  `result` and keeps its `resolve` and `reject` functions in `settle`, so the request handler, the
  timer and `close()` can settle it later. (The function given to `new Promise` runs immediately, so
  `settle` is set straight away.)
- `result.catch(() => {})`: if `close()` is called before anyone waits on `result` (a cancel during
  `begin()`, say), Node would report an unhandled rejection. This empty handler prevents that;
  anyone who awaits `result` later still gets the error.
- ``new URL(req.url ?? '/', `http://127.0.0.1:${port}`)``: `req.url` is only the path and query
  (`/callback?code=…`), so the base is added to get the full address. It's built with exactly the
  registered host and port because openid-client takes the `redirect_uri` it sends to JumpCloud from
  this address.
- `if (req.method !== 'GET' || url.pathname !== CALLBACK_PATH)`: anything else, such as the browser
  asking for `/favicon.ico`, gets a 404 and doesn't end the wait.
- `url.searchParams.get('error_description') ?? url.searchParams.get('error')`: if JumpCloud sent
  back an error, the page says so. The address is still handed on, and `finish()` in `oidc.ts` turns
  it into the proper error.
- `'cache-control': 'no-store'`: the browser shouldn't keep a copy of a page whose address holds a
  one-time code.
- `res.end(callbackPage(error), () => finish(() => settle.resolve(url.href)))`: the callback runs
  once the page has been sent, so the server isn't shut down halfway through the reply.
- `if (done) return`: only the first of the callback, the timeout and `close()` counts; later ones
  do nothing. That's why `AuthManager` can call `close()` after a sign-in has already finished.
- `server.close()`: stops accepting new connections. `server.closeAllConnections()` also drops
  connections the browser is keeping open for reuse, which would otherwise keep the server alive.
- `error.code === 'EADDRINUSE'`: another program already uses the port, so starting fails with an
  explanation (IT can pick another port; see `docs/JUMPCLOUD_SETUP.md`).
- `server.listen(port, '127.0.0.1', () => {`: listening on `127.0.0.1` only (not all network
  interfaces) keeps the server invisible to other computers. The callback runs once it's listening:
  it starts the timeout (5 minutes by default) and hands back the listener.

### `callbackPage()`, `escapeHtml()`

<!-- code: apps/desktop/src/main/auth/loopback.ts#callbackPage,escapeHtml -->

[`src/main/auth/loopback.ts`, lines 83–94](../../apps/desktop/src/main/auth/loopback.ts#L83-L94)

```ts
function callbackPage(error: string | null): string {
  const message = error
    ? `Sign-in didn't complete: ${escapeHtml(error)}`
    : 'You’re signed in to Desktop Assist. You can close this tab.'
  return `<!doctype html><html><head><meta charset="utf-8"><title>Desktop Assist</title>
<style>body{font-family:'Segoe UI',system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#18181b}
p{font-size:16px}</style></head><body><p>${message}</p><script>setTimeout(()=>window.close(),1500)</script></body></html>`
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
```

<!-- /code -->

The small page the browser shows after the redirect.

- `escapeHtml(error)`: the error text comes from the address, which anyone could make up, so it's
  escaped before going into the HTML. Otherwise a crafted link could run its own script on a page
  served from this PC.
- `setTimeout(()=>window.close(),1500)`: tries to close the tab after 1.5 seconds. Browsers usually
  only let a script close a tab that a script opened, so the tab may well stay open; the text tells
  the user they can close it.
- ``text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)``: replaces each character that means
  something in HTML with its numeric code, for example `<` with `&#60;`.

---

## `src/main/auth/idToken.ts`: describing an ID token for the log

When Anthropic refuses to swap an ID token, the app only gets a short error back, and the token
itself must never go in a log file: until it expires, it proves who the user is. This file reads
what the token says (the same things a federation rule checks) so the log can show those instead. It
only decodes the token and never verifies it, which is fine because nothing trusts the result: it's
only for a person reading the log.

It's used only by `startBuiltInChat()` in `index.ts`. The `identityToken` function given to
`AnthropicBackend` summarizes every ID token before handing it over, and keeps the latest summary in
`lastIdToken`. When a chat request fails and `classifyError()` (in `src/main/claude/errors.ts`) says
`not-allowed`, meaning Anthropic's token exchange refused the swap (a status such as 400, 401 or
403), `ChatSession`'s `onError` writes that summary to the app's log (`logs\desktop-assist.log` in
the app's data folder).

The case it was written for, and what to look for:

- **Audience.** JumpCloud's ID token has `aud` as a list that contains the JumpCloud client ID. The
  federation rule's _Expected audience_ in the Claude Console must be set to that client ID. When
  it's left blank, Anthropic instead requires the token's `aud` to be `https://api.anthropic.com`,
  which a JumpCloud token never is, and refuses with the deny reason `jwt_audience_mismatch` (shown
  in the Console's authentication history).
- **Organization ID.** If the organization ID in tenant.json's `claudeAccess` is wrong (for example
  the claude.ai organization ID rather than the Claude Console's, from **Settings → Organization**),
  Anthropic can't find the rule at all and records no authentication event. So when the summary
  looks right but the Console shows nothing, check the IDs in tenant.json rather than the token.

A JWT is three parts joined by dots: a _header_ (how it was signed), a _payload_ (the claims) and
the _signature_. The first two are JSON encoded with base64url, so anyone can read them; only the
signature needs JumpCloud's key to check.

### `IdTokenSummary`

<!-- code: apps/desktop/src/main/auth/idToken.ts#IdTokenSummary -->

[`src/main/auth/idToken.ts`, lines 1–19](../../apps/desktop/src/main/auth/idToken.ts#L1-L19)

```ts
/**
 * What an ID token says, for the log, without the token itself (which could be swapped for
 * Claude access) or its signature. These are the things an Anthropic federation rule checks.
 */
export interface IdTokenSummary {
  alg?: string
  kid?: string
  iss?: string
  aud?: string | string[]
  sub?: string
  email?: string
  issuedAt?: string
  expiresAt?: string
  /** `exp` minus `iat`: Anthropic refuses tokens that live longer than the issuer allows. */
  lifetimeSeconds?: number
  hasJti: boolean
  /** Every claim name in the token, to see what a rule could match on. */
  claims: string[]
}
```

<!-- /code -->

What gets logged. Every field is optional except `hasJti` and `claims`, because a token may lack any
claim.

- `alg?: string`: the signing algorithm from the header (for example RS256), which Anthropic uses to
  check the signature.
- `kid?: string`: the key ID from the header: which of JumpCloud's published keys signed the token.
- `iss?: string`: the issuer. It must match the issuer URL in the Claude Console exactly, including
  the trailing slash.
- `aud?: string | string[]`: the audience. JWTs allow either one string or a list, and JumpCloud
  sends a list.
- `issuedAt?: string`, `expiresAt?: string`: the `iat` and `exp` claims as readable dates rather
  than Unix seconds.
- `hasJti: boolean`: only whether the token has a `jti` (the ID Anthropic uses to refuse a second
  swap of the same token), not its value.
- `claims: string[]`: the names of every claim, not their values, so it's clear what a rule's
  condition could test (for example whether there's an `email` claim).

### `summarizeIdToken()`

<!-- code: apps/desktop/src/main/auth/idToken.ts#summarizeIdToken -->

[`src/main/auth/idToken.ts`, lines 21–46](../../apps/desktop/src/main/auth/idToken.ts#L21-L46)

```ts
/** Decodes (without verifying) a JWT's header and claims into a summary. */
export function summarizeIdToken(jwt: string): IdTokenSummary | { error: string } {
  const parts = jwt.split('.')
  if (parts.length !== 3) return { error: 'not a JWT' }
  try {
    const [header, payload] = parts.slice(0, 2).map(decodePart)
    if (!header || !payload) return { error: 'not a JWT' }
    const iat = typeof payload.iat === 'number' ? payload.iat : undefined
    const exp = typeof payload.exp === 'number' ? payload.exp : undefined
    return {
      alg: text(header.alg),
      kid: text(header.kid),
      iss: text(payload.iss),
      aud: Array.isArray(payload.aud) ? payload.aud.map(String) : text(payload.aud),
      sub: text(payload.sub),
      email: text(payload.email),
      issuedAt: iat === undefined ? undefined : new Date(iat * 1000).toISOString(),
      expiresAt: exp === undefined ? undefined : new Date(exp * 1000).toISOString(),
      lifetimeSeconds: iat === undefined || exp === undefined ? undefined : exp - iat,
      hasJti: typeof payload.jti === 'string',
      claims: Object.keys(payload).sort(),
    }
  } catch (error) {
    return { error: `couldn't decode: ${error instanceof Error ? error.message : String(error)}` }
  }
}
```

<!-- /code -->

Turns a raw ID token into an `IdTokenSummary`, or `{ error }` with a short reason if it can't be
read.

- `if (parts.length !== 3) return { error: 'not a JWT' }`: a signed JWT always has exactly three
  parts.
- `parts.slice(0, 2).map(decodePart)`: decodes only the header and the payload. The signature (the
  third part) is never decoded or logged.
- `if (!header || !payload)`: a part decoded to something other than a JSON object.
- `typeof payload.iat === 'number' ? payload.iat : undefined`: the claims are untyped JSON, so each
  one is checked before use.
- `Array.isArray(payload.aud) ? payload.aud.map(String) : text(payload.aud)`: keeps a list of
  audiences as a list. This is what showed that JumpCloud sends `aud` as a list.
- `new Date(iat * 1000).toISOString()`: JWT times are Unix seconds and `Date` wants milliseconds;
  the result looks like `2026-10-08T05:12:00.000Z` (UTC).
- `lifetimeSeconds: iat === undefined || exp === undefined ? undefined : exp - iat`: how long the
  token is valid for in total. Anthropic refuses a token that lives longer than the issuer's maximum
  (1 hour by default).
- `Object.keys(payload).sort()`: the claim names in alphabetical order, easy to scan.
- `catch (error)`: a part that isn't valid base64url JSON gives `{ error: "couldn't decode: …" }`.
  The function never throws, which matters because it runs on every token before it goes to
  Anthropic: an exception here would break chat.

### `decodePart()`, `text()`

<!-- code: apps/desktop/src/main/auth/idToken.ts#decodePart,text -->

[`src/main/auth/idToken.ts`, lines 48–56](../../apps/desktop/src/main/auth/idToken.ts#L48-L56)

```ts
function decodePart(part: string | undefined): Record<string, unknown> | null {
  if (!part) return null
  const value: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}
```

<!-- /code -->

- `JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))`: base64url is base64 with `-` and
  `_` in place of `+` and `/` and no `=` padding, so it's safe in URLs. Node's `Buffer` decodes it
  directly, `toString('utf8')` turns the bytes into text, and `JSON.parse` reads that. Text that
  isn't JSON makes `JSON.parse` throw, which `summarizeIdToken()` catches.
- `value && typeof value === 'object'`: valid JSON could also be a number, a string or `null`, none
  of which can hold claims.
- `text`: returns the value only if it's a string, so a claim of an unexpected type is left out of
  the summary.

---

## `src/main/storage/SecretStore.ts`: keeping the sign-in safe

Keeps one secret in one file, encrypted so only the same Windows user on the same PC can read it.
The app has two such secrets, each in a store of its own: the built-in chat's JumpCloud sign-in
(`AuthManager` saves the refresh token and user as JSON in
`%APPDATA%\Desktop Assist\jumpcloud-session.bin`), and the Apps list's connection to JumpCloud
(`jumpcloud-apps.bin`, see [Your apps](10-apps.md)). The encryption itself is passed
in as an `Encryptor`: `index.ts` gives it Electron's `safeStorage`, which on Windows uses **DPAPI**
(the Windows Data Protection API, which encrypts with a key tied to the user's Windows login). Tests
use a fake.

### `Encryptor`

<!-- code: apps/desktop/src/main/storage/SecretStore.ts#Encryptor -->

[`src/main/storage/SecretStore.ts`, lines 4–9](../../apps/desktop/src/main/storage/SecretStore.ts#L4-L9)

```ts
/** Encrypts secrets at rest. In the app this is Electron's safeStorage (Windows DPAPI). */
export interface Encryptor {
  isAvailable(): boolean
  encrypt(text: string): Buffer
  decrypt(data: Buffer): string
}
```

<!-- /code -->

What `SecretStore` needs to encrypt. `safeStorageEncryptor` in `index.ts` maps the three methods
onto `safeStorage.isEncryptionAvailable()`, `encryptString()` and `decryptString()`.

- `encrypt(text: string): Buffer`: the result is raw bytes (a Node `Buffer`), not text.
- `decrypt(data: Buffer): string`: throws if the bytes can't be decrypted, for example a file
  encrypted by another Windows user.

### `SecretStore`

The class, with the comment that describes it:

<!-- code: apps/desktop/src/main/storage/SecretStore.ts#SecretStore.class -->

[`src/main/storage/SecretStore.ts`, lines 11–15](../../apps/desktop/src/main/storage/SecretStore.ts#L11-L15)

```ts
/**
 * Keeps one secret in a file, encrypted so only the signed-in Windows user can read it. Used for
 * the JumpCloud sign-in (its refresh token), which never leaves the main process.
 */
export class SecretStore {
  // …
}
```

<!-- /code -->

As with `AuthManager`, this block shows only the class's description and first line; the members
follow below, starting with the constructor, which declares the class's fields:

<!-- code: apps/desktop/src/main/storage/SecretStore.ts#SecretStore.constructor -->

[`src/main/storage/SecretStore.ts`, lines 16–19](../../apps/desktop/src/main/storage/SecretStore.ts#L16-L19)

```ts
constructor(
  private readonly filePath: string,
  private readonly encryptor: Encryptor,
) {}
```

<!-- /code -->

The class's two fields, declared with the same constructor shorthand as `AuthManager`: the file to
use (`jumpcloud-session.bin` in the app's data folder) and the `Encryptor`.

### `SecretStore.load()`

<!-- code: apps/desktop/src/main/storage/SecretStore.ts#SecretStore.load -->

[`src/main/storage/SecretStore.ts`, lines 21–35](../../apps/desktop/src/main/storage/SecretStore.ts#L21-L35)

```ts
/** The saved secret, or null if there is none or it can't be decrypted (e.g. another user's). */
async load(): Promise<string | null> {
  let data: Buffer
  try {
    data = await fs.readFile(this.filePath)
  } catch (err) {
    if (isErrno(err, 'ENOENT')) return null
    throw err
  }
  try {
    return this.encryptor.decrypt(data) || null
  } catch {
    return null
  }
}
```

<!-- /code -->

Reads and decrypts the file. `AuthManager.loadSession()` calls it at startup.

- `fs.readFile(this.filePath)`: with no text encoding given, it returns the raw bytes.
- `isErrno(err, 'ENOENT')`: "no such file", meaning nothing is saved. Any other read error (for
  example access denied) is thrown, and `loadSession()` treats that as nothing saved too.
- `this.encryptor.decrypt(data) || null`: an empty secret counts as none.
- `catch {`: a file that can't be decrypted (copied from another user or PC, or damaged) is treated
  as no sign-in. The user signs in again, and the file is overwritten.

### `SecretStore.save()`, `SecretStore.clear()`

<!-- code: apps/desktop/src/main/storage/SecretStore.ts#SecretStore.save,clear -->

[`src/main/storage/SecretStore.ts`, lines 37–46](../../apps/desktop/src/main/storage/SecretStore.ts#L37-L46)

```ts
async save(secret: string): Promise<void> {
  if (!this.encryptor.isAvailable()) {
    throw new Error("Windows can't encrypt data on this PC, so the sign-in wasn't saved.")
  }
  await writeFileAtomic(this.filePath, this.encryptor.encrypt(secret))
}

async clear(): Promise<void> {
  await fs.rm(this.filePath, { force: true })
}
```

<!-- /code -->

- `if (!this.encryptor.isAvailable())`: refuses to save rather than write the refresh token in plain
  text. `AuthManager.startSession()` logs the error, and the user stays signed in for this run only.
- `writeFileAtomic(this.filePath, this.encryptor.encrypt(secret))`: from
  `src/main/storage/jsonFile.ts`. It writes a temporary file and then renames it over the real one
  (retrying briefly if antivirus is holding the file), so a crash halfway through can't leave a
  half-written file that won't decrypt. It also creates the folder if needed.
- `fs.rm(this.filePath, { force: true })`: deletes the file; `force` means a file that's already
  gone isn't an error. Called by `AuthManager.endSession()`.
