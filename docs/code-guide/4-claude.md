# Talking to Claude

[← Code Guide](CODE_GUIDE.md)

Everything that talks to the Claude API lives in four files in `src/main/claude`, all in the main
process. `model.ts` holds the settings every request uses, `AnthropicBackend.ts` sends one request
through Anthropic's SDK, `errors.ts` turns failures into plain English, and `ChatSession.ts` keeps
the conversation and runs each reply. There is no API key: the SDK swaps the user's JumpCloud
sign-in for a short-lived Claude token (see `AnthropicBackend.getClient()`).

**What happens when you send a message**

1. The panel sends IPC `assist:chat-send`. Its handler in `ipc.ts` turns the draft's screenshots
   into base64 JPEGs (`ScreenshotService.forClaude()`) and calls `ChatSession.send()`.
2. `send()` appends your turn to the conversation `history`, adds your message and an empty
   "streaming" reply to the chat, and calls `startTurn()`, which runs `runTurn()` in the
   background. `send()` returns `'sent'` straight away, and the IPC handler clears the draft.
3. `runTurn()` calls `AnthropicBackend.reply()` with the whole history, the system prompt from
   `buildSystemPrompt()` and the current effort setting.
4. `reply()` gets the SDK client from `getClient()` and calls `client.beta.messages.stream()`.
   Before the request goes out, the SDK needs a Claude token. The first time, and again shortly
   before each token expires, it calls `AuthManager.freshIdToken()` and swaps that JumpCloud ID
   token for a Claude token.
5. As the reply streams in, `onText` adds each piece of text to the reply, and `scheduleEmit()`
   sends it to the page (IPC `assist:chat-message`) at most once every 50 ms.
6. When the stream ends, `runTurn()` appends the complete reply to the history: every content block,
   thinking included, unchanged, unless another model took over partway through, in which case
   `replayContent()` first drops what the API says must not be sent back. If Claude asked for tools, `runTools()` runs them and the loop sends
   another request. Otherwise `finish()` marks the reply done, with a notice from `stopNotice()`
   if it was refused or cut short.
7. If anything fails, `classifyError()`, `errorMessage()` and `isRetryable()` decide what the chat
   shows and whether it offers Retry.

## `src/main/claude/model.ts`: what every request uses

The settings that shape every request, kept in one file so the model or the request can be changed
in one place. `AnthropicBackend.ts` reads the model, the fallback beta and the token limit;
`index.ts` uses `API_BASE_URL` and `buildSystemPrompt()`; `ChatSession.ts` uses `MAX_TOOL_ROUNDS`;
and `errors.ts` puts `CLAUDE_MODEL_NAME` in one of its messages.

### `CLAUDE_MODEL`, `CLAUDE_MODEL_NAME`

<!-- code: apps/desktop/src/main/claude/model.ts#CLAUDE_MODEL,CLAUDE_MODEL_NAME -->

[`src/main/claude/model.ts`, lines 1–4](../../apps/desktop/src/main/claude/model.ts#L1-L4)

```ts
// How Desktop Assist calls Claude. Kept in one place so the model and request shape are easy to change.

export const CLAUDE_MODEL = 'claude-opus-5-5'

export const CLAUDE_MODEL_NAME = 'Claude Opus 5.5'
```

<!-- /code -->

The model's ID, which goes in every request, and its human name, which only appears in the "can't
use this model" error message (`errors.ts`).

- `'claude-opus-5-5'`: Claude Opus 5.5. On this model thinking is always on and can't be switched
  off; effort (see `AnthropicBackend.reply()`) is the only control over how much it thinks.

### `FALLBACK_BETA`

<!-- code: apps/desktop/src/main/claude/model.ts#FALLBACK_BETA -->

[`src/main/claude/model.ts`, lines 6–10](../../apps/desktop/src/main/claude/model.ts#L6-L10)

```ts
/**
 * Server-side refusal fallback, "default" mode: if Claude's safety classifiers decline a request,
 * the API re-runs it on Anthropic's recommended fallback model instead of returning a refusal.
 */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01'
```

<!-- /code -->

Turns on the **server-side refusal fallback**. Claude Opus 5.5 runs safety classifiers alongside
each request. If they decline a request, the reply normally just ends with
`stop_reason: 'refusal'` and no proper answer. With the fallback on, the API instead re-runs the
request on another model inside the same call, so the user still gets an answer. A `fallback`
content block in the reply marks where the other model took over: first in the reply if the
decline came before any output, or partway through if it came mid-reply (see `replayContent()` in
`ChatSession.ts` for what that means for the history). After a fallback, later requests in the same
conversation may go straight to the fallback model for about an hour.

`AnthropicBackend.reply()` turns it on with two request fields: `betas: [FALLBACK_BETA]`, which the
SDK sends as an `anthropic-beta` header to unlock the feature (the date is the feature's version),
and `fallbacks: 'default'`, which lets Anthropic pick the fallback model by the kind of refusal
instead of the app naming one. For kinds of refusal with no recommended fallback model, or if the
fallback model declines too, the reply still ends with `refusal`, and `stopNotice()` in
`ChatSession.ts` shows "Claude declined to answer this."

### `MAX_TOKENS`

<!-- code: apps/desktop/src/main/claude/model.ts#MAX_TOKENS -->

[`src/main/claude/model.ts`, lines 12–13](../../apps/desktop/src/main/claude/model.ts#L12-L13)

```ts
/** Replies stream, so a high ceiling costs nothing unless Claude actually writes that much. */
export const MAX_TOKENS = 64_000
```

<!-- /code -->

The most Claude may write in one reply, its thinking included. A token is a short piece of text,
a few characters long.

Replies are **streamed**: instead of one response at the end, the API sends the reply in small
pieces as it is written. The chat can show text as it arrives, and a long reply never runs into an
HTTP timeout. Only the tokens actually written are billed, so a high ceiling costs nothing by
itself. A reply that does reach it ends with `stop_reason: 'max_tokens'`, which `stopNotice()`
reports as cut short.

### `API_BASE_URL`, `MAX_TOOL_ROUNDS`

<!-- code: apps/desktop/src/main/claude/model.ts#API_BASE_URL,MAX_TOOL_ROUNDS -->

[`src/main/claude/model.ts`, lines 15–18](../../apps/desktop/src/main/claude/model.ts#L15-L18)

```ts
export const API_BASE_URL = 'https://api.anthropic.com'

/** Never resend a turn more than this many times in one tool-use loop. */
export const MAX_TOOL_ROUNDS = 10
```

<!-- /code -->

- `API_BASE_URL`: Where requests go. `index.ts` passes it to `AnthropicBackend`, except that a dev
  run may replace it with the `ANTHROPIC_BASE_URL` environment variable to use a local test
  server. The token exchange uses the same address.
- `MAX_TOOL_ROUNDS`: A safety limit for `ChatSession.runTurn()`. When Claude uses tools, one reply
  takes several requests (see `ChatTool`); this stops a reply that never settles from looping
  forever.

### `buildSystemPrompt()`

<!-- code: apps/desktop/src/main/claude/model.ts#buildSystemPrompt -->

[`src/main/claude/model.ts`, lines 20–36](../../apps/desktop/src/main/claude/model.ts#L20-L36)

```ts
/**
 * The system prompt, fixed for the whole conversation (changing it mid-conversation would throw
 * away the prompt cache). Tenants can add their own instructions in tenant.json.
 */
export function buildSystemPrompt(tenant: {
  appName: string
  companyName: string
  systemPrompt?: string
}): string {
  const base = [
    `You are ${tenant.appName}, a desktop assistant for people at ${tenant.companyName}.`,
    "You appear as a small chat panel in the corner of the user's Windows screen, so keep answers",
    'concise and easy to scan: short paragraphs, lists and code blocks where they help.',
    'The user can attach screenshots of their screen; when they do, use what you can see in them.',
  ].join(' ')
  return tenant.systemPrompt ? `${base}\n\n${tenant.systemPrompt}` : base
}
```

<!-- /code -->

Builds the **system prompt**: standing instructions sent at the top of every request, separate
from the conversation. It tells Claude who it is, that it lives in a small panel (so answers should
be short and easy to scan), and that screenshots may be attached. `index.ts` calls it once at
startup and gives the result to `ChatSession`, which sends the same text with every request.

- `systemPrompt?: string`: Optional extra instructions from `tenant.json` (up to 8,000 characters,
  checked by `TenantSchema`), added after the built-in text with a blank line between them. The
  parameter's type lists only the three fields used; `index.ts` passes the whole tenant object.
- `.join(' ')`: The four lines are one paragraph; they are split in the source only to keep lines
  short.

Why the prompt must never change during a conversation: **prompt caching**. The API remembers
nothing between requests, so every request sends the whole conversation again. Prompt caching lets
Anthropic keep the start of a recent request for a few minutes. When the next request begins with
exactly the same content, that part is read from the cache, which is faster and much cheaper. The
match is on the exact beginning of the request (tools, then the system prompt, then the messages),
so changing even one character of the system prompt would make everything after it miss. That's
why the prompt is built once and contains nothing that changes, such as the date or time.

## `src/main/claude/AnthropicBackend.ts`: sending one request

The only file that calls the Anthropic SDK (`@anthropic-ai/sdk`). Its job is narrow: send one
request and stream back the reply. It doesn't keep the conversation (that's `ChatSession`) and
knows nothing about the UI. `index.ts` creates one `AnthropicBackend` at startup, gives it to
`ChatSession`, and calls `reset()` when the user is signed out. `ChatSession` only sees the
`ChatBackend` interface, so the tests replace the backend with a scripted fake. There is no API key:
requests are made as the signed-in user (see the class comment below and `getClient()`).

### `ReplyRequest`, `ChatBackend`

<!-- code: apps/desktop/src/main/claude/AnthropicBackend.ts#ReplyRequest,ChatBackend -->

[`src/main/claude/AnthropicBackend.ts`, lines 7–23](../../apps/desktop/src/main/claude/AnthropicBackend.ts#L7-L23)

```ts
export interface ReplyRequest {
  system: string
  messages: Anthropic.Beta.BetaMessageParam[]
  tools: Anthropic.Beta.BetaTool[]
  effort: Effort
  signal: AbortSignal
  /** Called with each piece of reply text as it streams in. */
  onText: (delta: string) => void
}

/** Where chat requests go. Tests swap in a fake. */
export interface ChatBackend {
  /** Streams one reply and resolves with the complete message (all content blocks). */
  reply(request: ReplyRequest): Promise<Anthropic.Beta.BetaMessage>
  /** Forgets the current Claude access, e.g. after signing out. */
  reset(): void
}
```

<!-- /code -->

`ReplyRequest` is everything one request needs. `ChatBackend` is the interface `ChatSession` talks
to, which `AnthropicBackend` implements.

**Content blocks.** In the Claude API a message's `content` is a list of blocks, each with a
`type`. A user turn here holds `image` blocks and a `text` block. A reply can hold `thinking` blocks
(Claude's reasoning before it answers), `text` blocks (the answer), `tool_use` blocks (requests to
run a tool) and, after a refusal fallback, a `fallback` block. The types come from the SDK's `Beta` namespace because the request uses a beta
feature (`FALLBACK_BETA`).

- `messages: Anthropic.Beta.BetaMessageParam[]`: The whole conversation so far, one entry per
  turn. The API keeps nothing between requests, so every request sends all of it again.
- `tools: Anthropic.Beta.BetaTool[]`: The definitions of the tools Claude may call. Always empty
  for now.
- `signal: AbortSignal`: Lets `ChatSession` cancel the request (Stop, New conversation, quitting).
- `onText: (delta: string) => void`: Called with each new piece of answer text. Thinking is never
  passed here.
- `reply(request: ReplyRequest): Promise<Anthropic.Beta.BetaMessage>`: Resolves only once the
  reply is complete, with every content block, because `ChatSession` sends them back next time.
  Rejects if the request fails or is cancelled.

### `AnthropicBackendOptions`

<!-- code: apps/desktop/src/main/claude/AnthropicBackend.ts#AnthropicBackendOptions -->

[`src/main/claude/AnthropicBackend.ts`, lines 25–30](../../apps/desktop/src/main/claude/AnthropicBackend.ts#L25-L30)

```ts
export interface AnthropicBackendOptions {
  baseURL: string
  access: ClaudeAccessConfig
  /** A new, unused JumpCloud ID token (each can only be exchanged once). */
  identityToken(): Promise<string>
}
```

<!-- /code -->

What `index.ts` passes when it creates the backend.

- `baseURL: string`: `API_BASE_URL`, or a local test server in dev runs.
- `access: ClaudeAccessConfig`: The `claudeAccess` section of `tenant.json`: the Claude Console
  organization, federation rule and service account IDs, and an optional workspace ID. None of
  these is secret; they say which federation rule should check the user's ID token.
- `identityToken(): Promise<string>`: In the app this is `() => auth.freshIdToken()`. In
  `index.ts`, `auth` is declared a few lines after the backend; that works because the function
  only reads `auth` when the SDK calls it, long after startup has finished.

### `AnthropicBackend`

The class, with the comment that describes it:

<!-- code: apps/desktop/src/main/claude/AnthropicBackend.ts#AnthropicBackend.class -->

[`src/main/claude/AnthropicBackend.ts`, lines 32–38](../../apps/desktop/src/main/claude/AnthropicBackend.ts#L32-L38)

```ts
/**
 * Calls Claude as the signed-in user, with no API key. Anthropic's Workload Identity Federation
 * exchanges the user's JumpCloud ID token for a short-lived access token for the company's
 * service account. The SDK does the exchange, keeps the token, gets a new one shortly before it
 * expires, and retries once with a new one if Anthropic rejects it.
 */
export class AnthropicBackend implements ChatBackend {
  // …
}
```

<!-- /code -->

In plain terms: a JumpCloud ID token is a short-lived, signed statement of who the user is.
Anthropic accepts it in place of an API key because IT has set up a federation rule and a service
account in the Claude Console (see `docs/JUMPCLOUD_SETUP.md`). `getClient()` below shows how the
SDK is told to do this, and the steps it follows.

- `implements ChatBackend`: TypeScript checks that the class has everything the interface lists
  (`reply()` and `reset()`), so it can be passed wherever a `ChatBackend` is expected.

The fields:

<!-- code: apps/desktop/src/main/claude/AnthropicBackend.ts#AnthropicBackend.client,constructor -->

[`src/main/claude/AnthropicBackend.ts`, lines 39–41](../../apps/desktop/src/main/claude/AnthropicBackend.ts#L39-L41)

```ts
private client: Anthropic | null = null

constructor(private readonly options: AnthropicBackendOptions) {}
```

<!-- /code -->

- `private client: Anthropic | null = null`: The SDK client, created on first use by
  `getClient()`. The client also holds the current Claude token, so dropping it drops the token.
- `private readonly options`: TypeScript shorthand. `private readonly` on a constructor parameter
  declares a field and stores the argument in it, so the constructor body can stay empty.

### `AnthropicBackend.reply()`

<!-- code: apps/desktop/src/main/claude/AnthropicBackend.ts#AnthropicBackend.reply -->

[`src/main/claude/AnthropicBackend.ts`, lines 43–61](../../apps/desktop/src/main/claude/AnthropicBackend.ts#L43-L61)

```ts
reply(request: ReplyRequest): Promise<Anthropic.Beta.BetaMessage> {
  const stream = this.getClient().beta.messages.stream(
    {
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      // Thinking is always on for this model; effort sets how much it does.
      output_config: { effort: request.effort },
      system: request.system,
      cache_control: { type: 'ephemeral' }, // cache the conversation so far
      messages: request.messages,
      ...(request.tools.length > 0 ? { tools: request.tools } : {}),
    },
    { signal: request.signal },
  )
  stream.on('text', (delta) => request.onText(delta))
  return stream.finalMessage()
}
```

<!-- /code -->

Sends one request and streams back the reply. `ChatSession.runTurn()` calls it once per round.

- `this.getClient().beta.messages.stream(`: `beta.messages` is the Messages API with beta
  features allowed. `stream()` starts a streaming request and returns a stream object straight
  away; the reply arrives as events on it.
- `betas: [FALLBACK_BETA]`: Sent as the `anthropic-beta` header; together with
  `fallbacks: 'default'` it turns on the refusal fallback (see `FALLBACK_BETA`).
- `output_config: { effort: request.effort }`: **Effort** tells the model how much work to put in:
  how long it thinks and how thorough its answer is. The user picks it in the settings menu: Fast
  (`low`, the default in `settings.ts`), Balanced (`medium`) or Thorough (`high`). There is no
  `thinking` field: on this model thinking is always on, and Claude decides how much it needs.
  Changing effort mid-conversation is allowed, but the next request can't reuse the cached
  conversation.
- `cache_control: { type: 'ephemeral' }`: Prompt caching (see `buildSystemPrompt()`) for the whole
  request. At the top level of a request, it makes the API put a cache point on the last block, so
  everything up to there is kept. The next request repeats that content and adds one new turn, so
  everything before the new turn is read from the cache. An `'ephemeral'` entry lasts 5 minutes,
  and each use restarts the clock. Very short requests aren't cached at all (no error, just no
  saving).
- `...(request.tools.length > 0 ? { tools: request.tools } : {})`: Adds the `tools` field only
  when there are tools. None are registered yet, so today's requests have no `tools` field.
- `{ signal: request.signal }`: The second argument holds options for the HTTP request rather than
  the API. Aborting the signal cancels the request, and the stream then fails with the SDK's
  `APIUserAbortError`.
- `stream.on('text', (delta) => request.onText(delta))`: The `'text'` event fires for each new
  piece of answer text. Thinking arrives as separate `'thinking'` events, which nothing listens
  to.
- `return stream.finalMessage()`: A promise for the complete reply once the stream ends: all its
  content blocks, the `stop_reason` and the token usage. It rejects if the request failed,
  including when getting the Claude token failed.

**Thinking blocks.** Because thinking is on, a reply usually starts with one or more `thinking`
blocks before its `text`. On Claude Opus 5.5 their text is empty by default (the reasoning isn't
shown), but each carries a `signature` that ties it to this model and to the exact conversation it
was produced in. They must be sent back unchanged in later requests, which is why `ChatSession`
keeps whole replies and never edits its history. (After a refusal fallback, the declining model's
thinking blocks are the exception; see `replayContent()`.)

### `AnthropicBackend.reset()`

<!-- code: apps/desktop/src/main/claude/AnthropicBackend.ts#AnthropicBackend.reset -->

[`src/main/claude/AnthropicBackend.ts`, lines 63–65](../../apps/desktop/src/main/claude/AnthropicBackend.ts#L63-L65)

```ts
reset(): void {
  this.client = null
}
```

<!-- /code -->

Forgets the SDK client, and with it the Claude token it holds. `index.ts` calls it from
`AuthManager`'s `onSignedOut`, so it runs on Log out and when JumpCloud ends the sign-in. Nothing
keeps using access that belonged to a sign-in that has ended; the next `reply()` builds a new
client, which asks for a new ID token.

### `AnthropicBackend.getClient()`

<!-- code: apps/desktop/src/main/claude/AnthropicBackend.ts#AnthropicBackend.getClient -->

[`src/main/claude/AnthropicBackend.ts`, lines 67–85](../../apps/desktop/src/main/claude/AnthropicBackend.ts#L67-L85)

```ts
private getClient(): Anthropic {
  const { baseURL, access, identityToken } = this.options
  this.client ??= new Anthropic({
    // null stops an API key or token in the environment from being used instead.
    apiKey: null,
    authToken: null,
    baseURL,
    credentials: oidcFederationProvider({
      identityTokenProvider: identityToken,
      organizationId: access.organizationId,
      federationRuleId: access.federationRuleId,
      serviceAccountId: access.serviceAccountId,
      workspaceId: access.workspaceId || undefined,
      baseURL,
      fetch,
    }),
  })
  return this.client
}
```

<!-- /code -->

Creates the SDK client the first time it's needed and returns the same one after that.

- `this.client ??= new Anthropic({`: `??=` assigns only when `this.client` is `null` (or
  `undefined`). So the client is built on the first message, not at startup, when nobody may be
  signed in yet.
- `apiKey: null,`: Left out, the SDK would read `ANTHROPIC_API_KEY` (and `authToken` would read
  `ANTHROPIC_AUTH_TOKEN`) from the environment, and either would win over `credentials`. `null`
  means "none", so the app always calls Claude as the signed-in user, even on a PC where a
  developer has a key set.
- `credentials: oidcFederationProvider({`: The SDK's Workload Identity Federation helper. It
  returns a function that, each time it is called, gets an ID token from `identityTokenProvider`
  and swaps it for a Claude access token. The SDK client wraps that function in its token cache.
- `identityTokenProvider: identityToken,`: `AuthManager.freshIdToken()` in the app. A swap uses up
  the ID token and doesn't return a refresh token, so every new Claude token needs a new ID token.
- `workspaceId: access.workspaceId || undefined,`: An empty `workspaceId` in `tenant.json` becomes
  `undefined`, so it isn't sent at all, and Anthropic uses the federation rule's only workspace. It
  is needed only when the rule covers several workspaces.
- `fetch,`: The provider makes its own HTTP call to the token endpoint, so it needs the address
  (`baseURL` again) and a `fetch` function; this is the one built into Node.js.

**How a JumpCloud sign-in becomes a Claude token** (all inside the SDK, during the request):

1. Before each request, the client asks its token cache for a token.
2. If it has none (the first message, or after `reset()`), the cache calls the provider and the
   request waits.
3. The provider calls `AuthManager.freshIdToken()`. That hands out the unused ID token kept from
   signing in or from the startup renewal, or gets a new one from JumpCloud with the saved refresh
   token. If nobody is signed in, or JumpCloud ends the sign-in, it throws `SignInRequiredError`;
   if JumpCloud can't be reached, `SignInUnavailableError`.
4. The provider posts the ID token to `<baseURL>/v1/oauth/token` with the organization, federation
   rule, service account and (if set) workspace IDs. It refuses to send it over plain `http`
   unless the address is this PC (`localhost`, `127.0.0.1`, `::1`). Anthropic checks the ID token
   against the federation rule set up in the Claude Console and returns a short-lived access token
   and how long it lasts. A refusal or failure throws the SDK's `WorkloadIdentityError`.
5. The client sends the access token as `Authorization: Bearer …` with the chat request.
6. Later requests reuse it. With 30 seconds to 2 minutes left, the cache hands out the old token
   and fetches a new one in the background; with under 30 seconds left, the request waits for a
   new one. Requests that need a token at the same moment share one swap.
7. If the API still answers 401 (token not accepted), the client throws the token away, gets a new
   one, and retries the request once.

Any error from steps 3 or 4 fails the chat request before it is sent and comes out of
`finalMessage()`, where `classifyError()` sorts it.

## `src/main/claude/errors.ts`: what went wrong

Turns any error from a chat request into one of a fixed set of kinds, and each kind into a message
for the chat. Only `ChatSession.runTurn()` uses it. The full error still goes to the log through
`onError` (printed in the terminal in dev runs, see `index.ts`); the user sees only the plain
English.

By the time an error gets here, the SDK has already retried temporary failures that happened before
the reply started arriving (no connection, and statuses 408, 409, 429 and 5xx), twice by default.

### `ErrorKind`

<!-- code: apps/desktop/src/main/claude/errors.ts#ErrorKind -->

[`src/main/claude/errors.ts`, lines 6–20](../../apps/desktop/src/main/claude/errors.ts#L6-L20)

```ts
export type ErrorKind =
  | 'aborted'
  | 'signed-out'
  | 'sign-in-unreachable'
  | 'not-allowed'
  | 'auth'
  | 'permission'
  | 'billing'
  | 'not-found'
  | 'rate-limit'
  | 'overloaded'
  | 'network'
  | 'bad-request'
  | 'server'
  | 'unknown'
```

<!-- /code -->

The kinds of failure the app tells apart. It's a union of string literals: a value of this type must
be one of these strings, and TypeScript checks every use.

- `'aborted'`: Stop was pressed, or the conversation was cleared.
- `'signed-out'`, `'sign-in-unreachable'`, `'not-allowed'`: Getting a Claude token failed: nobody
  is signed in (or the sign-in just expired), JumpCloud couldn't be reached, or Anthropic refused
  the swap.
- `'auth'`, `'permission'`, `'billing'`, `'not-found'`: The Claude API turned the request down:
  token not accepted (401), no access (403), out of credit (402), model not available (404).
- `'rate-limit'`, `'overloaded'`, `'network'`, `'server'`: Temporary trouble: too many requests
  (429), Anthropic busy (529), no connection or a timeout, or another server error (5xx).
- `'bad-request'`: The API rejected the request itself (400).

### `classifyError()`

<!-- code: apps/desktop/src/main/claude/errors.ts#classifyError -->

[`src/main/claude/errors.ts`, lines 22–46](../../apps/desktop/src/main/claude/errors.ts#L22-L46)

```ts
/** Sorts an error from a chat request into what it means for the user. Most specific first. */
export function classifyError(error: unknown): ErrorKind {
  if (error instanceof Anthropic.APIUserAbortError) return 'aborted'
  // The SDK wraps errors it doesn't know (like the sign-in ones) and keeps them as the cause.
  const cause = error instanceof Anthropic.AnthropicError ? error.cause : undefined
  if (error instanceof SignInRequiredError || cause instanceof SignInRequiredError) {
    return 'signed-out'
  }
  if (error instanceof SignInUnavailableError || cause instanceof SignInUnavailableError) {
    return 'sign-in-unreachable'
  }
  if (error instanceof WorkloadIdentityError) return exchangeErrorKind(error.statusCode)
  if (error instanceof Anthropic.APIConnectionError) return 'network' // includes timeouts
  if (error instanceof Anthropic.AuthenticationError) return 'auth'
  if (error instanceof Anthropic.PermissionDeniedError) return 'permission'
  if (error instanceof Anthropic.NotFoundError) return 'not-found'
  if (error instanceof Anthropic.RateLimitError) return 'rate-limit'
  if (error instanceof Anthropic.BadRequestError) return 'bad-request'
  if (error instanceof Anthropic.APIError) {
    if (error.status === 402) return 'billing'
    if (error.status === 529) return 'overloaded'
    if (error.status !== undefined && error.status >= 500) return 'server'
  }
  return 'unknown'
}
```

<!-- /code -->

Sorts an error into an `ErrorKind`. Order matters: SDK error classes inherit from each other (a
cancelled request and a connection failure are both `APIError`s too), so the specific checks come
first and the general `APIError` check comes last.

- `error instanceof Anthropic.APIUserAbortError`: The request was cancelled through its signal by
  Stop or New conversation.
- `const cause = error instanceof Anthropic.AnthropicError ? error.cause : undefined`: An error that
  isn't one of the SDK's own, such as the sign-in errors from `AuthManager.freshIdToken()`, comes
  out of the stream wrapped in a plain `AnthropicError`, with the original kept as `cause`. So the
  sign-in checks look at both the error and its cause.
- `error instanceof SignInRequiredError || cause instanceof SignInRequiredError`: Nobody is signed
  in, or JumpCloud just ended the sign-in. `AuthManager` has already switched the chat box to Sign
  in with JumpCloud.
- `error instanceof WorkloadIdentityError`: The swap at `/v1/oauth/token` failed. This class is an
  `AnthropicError` itself, so it arrives unwrapped; `exchangeErrorKind()` sorts it by status code.
- `error instanceof Anthropic.APIConnectionError`: No answer at all: offline, the address couldn't
  be found, or a timeout (the SDK's timeout error is a subclass of this one).
- `error instanceof Anthropic.AuthenticationError`: A 401 even after the SDK's retry with a new
  token.
- `if (error instanceof Anthropic.APIError) {`: Any other API error, sorted by HTTP status. 402 and
  529 have no class of their own in the SDK; 529 is Anthropic's "overloaded" status.

### `exchangeErrorKind()`

<!-- code: apps/desktop/src/main/claude/errors.ts#exchangeErrorKind -->

[`src/main/claude/errors.ts`, lines 48–54](../../apps/desktop/src/main/claude/errors.ts#L48-L54)

```ts
/** Anthropic refused (or couldn't do) the swap of the JumpCloud sign-in for Claude access. */
function exchangeErrorKind(status: number | null): ErrorKind {
  if (status === null) return 'network'
  if (status === 429) return 'rate-limit'
  if (status >= 500) return 'server'
  return 'not-allowed' // 400/401/403: the federation rule doesn't accept this user
}
```

<!-- /code -->

Sorts a failed token swap by the HTTP status Anthropic returned.

- `if (status === null) return 'network'`: No status means the swap never got an answer (it's also
  how the SDK reports a problem it finds before sending, such as an address that isn't `https`).
- `return 'not-allowed'`: A 400, 401 or 403: Anthropic got the ID token and said no, usually
  because the federation rule doesn't accept this user. Only IT can fix that, so the message says
  to contact them.

### `isRetryable()`

<!-- code: apps/desktop/src/main/claude/errors.ts#isRetryable -->

[`src/main/claude/errors.ts`, lines 56–67](../../apps/desktop/src/main/claude/errors.ts#L56-L67)

```ts
/** Problems worth simply trying again. */
export function isRetryable(kind: ErrorKind): boolean {
  return (
    kind === 'signed-out' || // after signing back in
    kind === 'sign-in-unreachable' ||
    kind === 'rate-limit' ||
    kind === 'overloaded' ||
    kind === 'network' ||
    kind === 'server' ||
    kind === 'unknown'
  )
}
```

<!-- /code -->

Whether the chat offers Retry for a failed reply: yes for problems that may go away on their own,
and for `'unknown'` to be safe. No for anything that needs IT or a different message (not-allowed,
auth, permission, billing, not-found, bad-request). `ChatSession` also withholds Retry when part of
the reply was kept.

- `kind === 'signed-out' || // after signing back in`: The Retry button stays on the failed reply.
  `ChatSession.retry()` does nothing until the user has signed in again, then resends.

### `MESSAGES`, `errorMessage()`

<!-- code: apps/desktop/src/main/claude/errors.ts#MESSAGES,errorMessage -->

[`src/main/claude/errors.ts`, lines 69–88](../../apps/desktop/src/main/claude/errors.ts#L69-L88)

```ts
const MESSAGES: Record<ErrorKind, string> = {
  aborted: 'Stopped.',
  'signed-out': 'Sign in with JumpCloud to keep chatting.',
  'sign-in-unreachable': "Couldn't reach JumpCloud to confirm your sign-in. Check your connection.",
  'not-allowed': "Your JumpCloud account isn't set up to use Claude yet. Contact IT.",
  auth: "Claude didn't accept your sign-in. Try again, or log out and sign in again.",
  permission: "Your account doesn't have access to Claude. Contact IT.",
  billing: "Your organisation's Claude account has run out of credit. Contact IT.",
  'not-found': `Your organisation can't use ${CLAUDE_MODEL_NAME}. Contact IT.`,
  'rate-limit': 'Claude is getting too many requests right now. Try again in a moment.',
  overloaded: 'Claude is busy right now. Try again in a moment.',
  network: "Couldn't reach Claude. Check your internet connection.",
  'bad-request': "Claude couldn't process that message.",
  server: 'Claude had a problem answering. Try again.',
  unknown: 'Something went wrong talking to Claude.',
}

export function errorMessage(kind: ErrorKind): string {
  return MESSAGES[kind]
}
```

<!-- /code -->

The text shown under a failed reply, one per kind.

- `Record<ErrorKind, string>`: An object with exactly one string for every kind. If a kind is added
  to `ErrorKind` without a message, TypeScript refuses to compile.
- `aborted: 'Stopped.'`: Never actually shown: `ChatSession.runTurn()` handles Stop itself, with a
  notice that depends on whether any text arrived. It's here because the `Record` needs every kind.
- `'not-found'`: The model is the only thing a chat request names that could be missing, so the
  message names it (`CLAUDE_MODEL_NAME`).

## `src/main/claude/ChatSession.ts`: one conversation

The conversation, and everything that happens during a reply: sending, streaming text to the page,
the tool loop, Stop, errors and Retry. It knows nothing about Electron. `index.ts` creates it with
the backend and callbacks (`onMessage` broadcasts IPC `assist:chat-message`, `onReset` broadcasts
`assist:chat-reset`); the IPC handlers in `ipc.ts` call `send()`, `stop()`, `retry()` and
`newConversation()`; and `getState()` in `index.ts` uses `list()` when a page loads. One
`ChatSession` lasts for the whole run: New conversation empties it rather than replacing it.

It keeps two lists, because the API and the page need different things. `history` is exactly what
is sent to the API: base64 image data and Claude's thinking blocks included. `messages` is what the
chat shows: ids, statuses, notices and the attached screenshots' file names.

### `MessageParam`, `ContentBlock`, `OutgoingImage`

<!-- code: apps/desktop/src/main/claude/ChatSession.ts#MessageParam,ContentBlock,OutgoingImage -->

[`src/main/claude/ChatSession.ts`, lines 8–15](../../apps/desktop/src/main/claude/ChatSession.ts#L8-L15)

```ts
type MessageParam = Anthropic.Beta.BetaMessageParam

type ContentBlock = Anthropic.Beta.BetaContentBlock

/** A screenshot ready to send: base64 image data. */
export interface OutgoingImage {
  mediaType: 'image/jpeg' | 'image/png'
  data: string
}
```

<!-- /code -->

- `type MessageParam = Anthropic.Beta.BetaMessageParam`: Short local names for two SDK types: one
  turn of the conversation as it is sent, and one content block of a reply (used by
  `replayContent()` and `runTools()`). The file imports only types from the SDK (`import type`); it
  never calls the SDK itself.
- `mediaType: 'image/jpeg' | 'image/png'`: The image format, which the API needs to know.
  `ScreenshotService.forClaude()` always produces JPEG, scaled so its longest side is at most 1,568
  pixels.
- `data: string`: The image as base64 text, since the request body is JSON.

### `ChatTool`

<!-- code: apps/desktop/src/main/claude/ChatSession.ts#ChatTool -->

[`src/main/claude/ChatSession.ts`, lines 17–21](../../apps/desktop/src/main/claude/ChatSession.ts#L17-L21)

```ts
/** A tool Claude may call. None are registered yet; the loop is ready for them. */
export interface ChatTool {
  definition: Anthropic.Beta.BetaTool
  run(input: unknown): Promise<string>
}
```

<!-- /code -->

A tool Claude may call. **Tool use** lets Claude ask the app to do something, such as read a file,
and then use the result. Each request lists the tools' definitions (name, description and input
schema). If Claude wants one, its reply contains a `tool_use` block with the tool name and input
and ends with `stop_reason: 'tool_use'`. The app runs the tool and sends the result back as a
`tool_result` block in a new user turn, and Claude carries on from there. One answer can take
several of these rounds. No tools are registered yet (`index.ts` passes none), so today every reply
is a single round; `runTurn()` and `runTools()` are ready for them.

- `definition: Anthropic.Beta.BetaTool`: What's sent to Claude: name, description and input
  schema.
- `run(input: unknown): Promise<string>`: The tool's code. `input` is whatever Claude sent, so it
  is `unknown` and each tool must check it. The returned string becomes the `tool_result`.

### `ChatSessionDeps`

<!-- code: apps/desktop/src/main/claude/ChatSession.ts#ChatSessionDeps -->

[`src/main/claude/ChatSession.ts`, lines 23–38](../../apps/desktop/src/main/claude/ChatSession.ts#L23-L38)

```ts
export interface ChatSessionDeps {
  backend: ChatBackend
  /** Whether someone is signed in, so a request can be made. */
  canChat(): boolean
  getEffort(): Effort
  /** Fixed for the session, so the cached prompt prefix stays valid. */
  system: string
  tools?: ChatTool[]
  /** A message was added or changed. */
  onMessage(message: ChatMessage): void
  onReset(): void
  /** A reply failed; gets the full error, for the log (the chat shows a plain-English message). */
  onError?(error: unknown): void
  /** Streamed text is sent to the UI at most this often. */
  emitIntervalMs?: number
}
```

<!-- /code -->

What `index.ts` gives the session. Everything comes in through here rather than being imported, so
the tests can drive the class with fakes.

- `canChat(): boolean`: `AuthManager.canChat` in the app: whether a sign-in exists.
- `getEffort(): Effort`: A function rather than a value, so each request uses the setting as it is
  at that moment.
- `system: string`: The prompt from `buildSystemPrompt()`. It never changes; see prompt caching
  there.
- `onMessage(message: ChatMessage): void`: Called with a copy whenever a message is added or
  changes, including every streaming update.
- `onError?(error: unknown): void`: `index.ts` logs it. The `?` makes it optional.
- `emitIntervalMs?: number`: How often streamed text may reach the page, 50 ms when not set. The
  tests set 0 to see every update.

### `SendStatus`

<!-- code: apps/desktop/src/main/claude/ChatSession.ts#SendStatus -->

[`src/main/claude/ChatSession.ts`, line 40](../../apps/desktop/src/main/claude/ChatSession.ts#L40)

```ts
export type SendStatus = 'sent' | 'busy' | 'empty' | 'signed-out'
```

<!-- /code -->

What `send()` returns. The `assist:chat-send` handler in `ipc.ts` passes anything other than
`'sent'` back to the page as the reason (`SendResult`), and only clears the draft on `'sent'`.

### `ChatSession`

The class, with the comment that describes it:

<!-- code: apps/desktop/src/main/claude/ChatSession.ts#ChatSession.class -->

[`src/main/claude/ChatSession.ts`, lines 42–52](../../apps/desktop/src/main/claude/ChatSession.ts#L42-L52)

```ts
/**
 * One conversation with Claude.
 *
 * It keeps two lists: `history`, exactly what is sent to the API, and `messages`, what the chat
 * shows. History is append-only: earlier turns are never edited or removed, because Claude's
 * thinking is tied to the exact conversation it was produced in. Every reply is appended with all
 * of its content blocks (thinking included) unchanged, except what the API says to drop after a
 * server-side fallback (`replayContent()`); a reply cut short by Stop or an error is appended as
 * plain text.
 */
export class ChatSession {
  // …
}
```

<!-- /code -->

Why thinking forces an append-only history: each thinking block's `signature` records the
conversation it was produced in, meaning the system prompt, the tools and every earlier message.
When the history comes back, the API checks that this conversation is unchanged, and if an earlier
turn has been edited or removed it can reject the request. Append-only also keeps prompt caching
working, because each request starts with exactly what the previous one sent.

Append-only means that once a turn is in the history, it is never changed or removed (New
conversation starts again with an empty history instead). What goes in is decided once, as the turn
is added. A complete reply normally goes in with all its content blocks unchanged; the one exception, as the
comment says, is after a server-side fallback, when `replayContent()` first drops the blocks the API
says must not be sent back. A reply cut short by Stop or an error goes in as plain text: just
the text that had arrived.

The fields:

<!-- code: apps/desktop/src/main/claude/ChatSession.ts#ChatSession.history,messages,controller,turn,generation,emitTimers,constructor -->

[`src/main/claude/ChatSession.ts`, lines 53–61](../../apps/desktop/src/main/claude/ChatSession.ts#L53-L61)

```ts
private history: MessageParam[] = []

private messages: ChatMessage[] = []

private controller: AbortController | null = null

private turn: Promise<void> = Promise.resolve()

/** Bumped by New conversation, so a reply still finishing can't touch the new one. */
private generation = 0

private readonly emitTimers = new Map<string, ReturnType<typeof setTimeout>>()

constructor(private readonly deps: ChatSessionDeps) {}
```

<!-- /code -->

- `private history: MessageParam[] = []`: Exactly what is sent to the API.
- `private messages: ChatMessage[] = []`: What the chat shows. A reply's object is changed in place
  while it streams; the page always gets copies.
- `private controller: AbortController | null = null`: The running reply's cancel switch. It is set
  exactly while a reply is in progress, which is what `busy` checks.
- `private turn: Promise<void> = Promise.resolve()`: The running reply, for `idle()`. It starts as
  an already-finished promise.
- `private generation = 0`: A counter bumped by `newConversation()`. A reply remembers the value it
  started with, and stops touching anything once it no longer matches.
- `private readonly emitTimers = new Map<string, ReturnType<typeof setTimeout>>()`: At most one
  waiting page update per message id, for `scheduleEmit()`. `ReturnType<typeof setTimeout>` means
  "whatever `setTimeout` returns", which differs between Node.js and browsers.

### `ChatSession.busy` and `ChatSession.list()`

<!-- code: apps/desktop/src/main/claude/ChatSession.ts#ChatSession.busy,list -->

[`src/main/claude/ChatSession.ts`, lines 63–69](../../apps/desktop/src/main/claude/ChatSession.ts#L63-L69)

```ts
get busy(): boolean {
  return this.controller !== null
}

list(): ChatMessage[] {
  return this.messages.map((m) => ({ ...m }))
}
```

<!-- /code -->

- `get busy(): boolean`: A getter, read as `chat.busy` without brackets. True while a reply is in
  progress. The `assist:chat-send` handler checks it before collecting screenshots.
- `this.messages.map((m) => ({ ...m }))`: Copies of the messages, for `getState()` when a page
  loads. Copies, so nothing outside can change the session's own objects.

### `ChatSession.send()`

<!-- code: apps/desktop/src/main/claude/ChatSession.ts#ChatSession.send -->

[`src/main/claude/ChatSession.ts`, lines 71–87](../../apps/desktop/src/main/claude/ChatSession.ts#L71-L87)

```ts
/** Starts a reply and returns straight away; the reply streams in through `onMessage`. */
send(text: string, images: OutgoingImage[], attachments: Attachment[]): SendStatus {
  if (this.busy) return 'busy'
  if (!text.trim() && images.length === 0) return 'empty'
  if (!this.deps.canChat()) return 'signed-out'

  const content: Anthropic.Beta.BetaContentBlockParam[] = images.map((image) => ({
    type: 'image',
    source: { type: 'base64', media_type: image.mediaType, data: image.data },
  }))
  if (text.trim()) content.push({ type: 'text', text })
  this.history.push({ role: 'user', content })
  this.add({ role: 'user', text, attachments, status: 'done' })

  this.startTurn(this.add({ role: 'assistant', text: '', attachments: [], status: 'streaming' }))
  return 'sent'
}
```

<!-- /code -->

Adds the user's message and starts a reply, then returns at once. The reply arrives through
`onMessage`.

- `if (this.busy) return 'busy'`: One reply at a time.
- `if (!text.trim() && images.length === 0) return 'empty'`: A message needs some text or at least
  one screenshot.
- `if (!this.deps.canChat()) return 'signed-out'`: The panel shows the sign-in instead of the chat
  when nobody is signed in, so this is a safety net.
- `images.map((image) => ({`: Each screenshot becomes an `image` content block holding its base64
  data. Images go before the text, the order Anthropic recommends.
- `if (text.trim()) content.push({ type: 'text', text })`: A blank text box with screenshots sends
  only the images. Text is sent as typed, not trimmed.
- `this.history.push({ role: 'user', content })`: If the previous reply failed before any text, the
  history already ends with a user turn. That's fine: the API joins consecutive user turns into
  one.
- `this.add({ role: 'user', text, attachments, status: 'done' })`: The chat's copy keeps the
  screenshot file details (`attachments`) for the chips under the message, not the image data.
- `this.startTurn(this.add({ role: 'assistant', text: '', attachments: [], status: 'streaming' }))`:
  An empty reply appears at once (the page shows "Thinking…" until text arrives), and `runTurn()`
  fills in that same object.

### `ChatSession.retry()`

<!-- code: apps/desktop/src/main/claude/ChatSession.ts#ChatSession.retry -->

[`src/main/claude/ChatSession.ts`, lines 89–96](../../apps/desktop/src/main/claude/ChatSession.ts#L89-L96)

```ts
/** Asks again after a failed reply (only if nothing from it was kept). */
retry(): void {
  const last = this.messages.at(-1)
  if (this.busy || !last?.retryable || !this.deps.canChat()) return
  Object.assign(last, { text: '', status: 'streaming', notice: undefined, retryable: undefined })
  this.emit(last)
  this.startTurn(last)
}
```

<!-- /code -->

Asks again after a failed reply, from the Retry button (IPC `assist:chat-retry`).

- `const last = this.messages.at(-1)`: `at(-1)` is the last item. Only the latest reply can be
  retried; once the user sends something new, the old failure is no longer last.
- `!last?.retryable`: `runTurn()` sets `retryable` only when nothing from the failed request went
  into the history, so the history still ends with a user turn. `?.` copes with an empty chat.
- `!this.deps.canChat()`: After an expired sign-in, Retry does nothing until the user has signed
  back in.
- `Object.assign(last, {`: Resets the failed reply in place, keeping its id, so the page replaces
  it rather than adding another.
- `this.startTurn(last)`: Nothing is added to the history: it still ends with a user turn, so this
  simply sends the same conversation again.

### `ChatSession.stop()` and `ChatSession.newConversation()`

<!-- code: apps/desktop/src/main/claude/ChatSession.ts#ChatSession.stop,newConversation -->

[`src/main/claude/ChatSession.ts`, lines 98–111](../../apps/desktop/src/main/claude/ChatSession.ts#L98-L111)

```ts
stop(): void {
  this.controller?.abort()
}

newConversation(): void {
  this.generation++
  this.stop()
  this.controller = null
  for (const timer of this.emitTimers.values()) clearTimeout(timer)
  this.emitTimers.clear()
  this.history = []
  this.messages = []
  this.deps.onReset()
}
```

<!-- /code -->

`stop()` is the Stop button (IPC `assist:chat-stop`), and `index.ts` also calls it when the app
quits. `newConversation()` is New conversation (IPC `assist:chat-new`), and `index.ts` also calls it
on Log out. When the sign-in merely expires, the conversation is kept so the user can carry on.

- `this.controller?.abort()`: Cancels the request, if a reply is running. The stream then fails
  with `APIUserAbortError`, and `runTurn()` marks the reply stopped.
- `this.generation++`: Marks any reply still running as belonging to the old conversation;
  `runTurn()` checks this before touching anything.
- `this.controller = null`: Not busy any more, straight away, so a new message can be sent while the
  cancelled request is still winding down.
- `for (const timer of this.emitTimers.values()) clearTimeout(timer)`: Cancels page updates still
  waiting, so nothing from the old reply reaches the page after the chat has been cleared.
- `this.deps.onReset()`: `index.ts` broadcasts `assist:chat-reset`, and the page empties its list.

### `ChatSession.idle()` and `ChatSession.startTurn()`

<!-- code: apps/desktop/src/main/claude/ChatSession.ts#ChatSession.idle,startTurn -->

[`src/main/claude/ChatSession.ts`, lines 113–124](../../apps/desktop/src/main/claude/ChatSession.ts#L113-L124)

```ts
/** Resolves when the current reply (if any) has finished. */
idle(): Promise<void> {
  return this.turn
}

private startTurn(reply: ChatMessage): void {
  const controller = new AbortController()
  this.controller = controller
  this.turn = this.runTurn(reply, controller).finally(() => {
    if (this.controller === controller) this.controller = null
  })
}
```

<!-- /code -->

- `return this.turn`: For the tests: `await session.idle()` waits for the reply to finish. It never
  rejects, because `runTurn()` catches its own errors.
- `const controller = new AbortController()`: A new cancel switch for each reply. `send()` and
  `retry()` have already checked that no reply is running.
- `this.turn = this.runTurn(reply, controller).finally(() => {`: `runTurn()` is async, so calling
  it starts the reply in the background. The promise is stored, not awaited, which is why `send()`
  can return straight away.
- `if (this.controller === controller) this.controller = null`: Clears the controller only if it
  is still this reply's. After New conversation a newer reply may already be running with its own
  controller, and the old reply finishing must not make the session look idle.

### `ChatSession.runTurn()`

<!-- code: apps/desktop/src/main/claude/ChatSession.ts#ChatSession.runTurn -->

[`src/main/claude/ChatSession.ts`, lines 126–181](../../apps/desktop/src/main/claude/ChatSession.ts#L126-L181)

```ts
private async runTurn(reply: ChatMessage, controller: AbortController): Promise<void> {
  const generation = this.generation
  const current = () => generation === this.generation
  const tools = this.deps.tools ?? []
  let roundText = ''
  let keptPartial = false

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      roundText = ''
      const message = await this.deps.backend.reply({
        system: this.deps.system,
        messages: this.history,
        tools: tools.map((t) => t.definition),
        effort: this.deps.getEffort(),
        signal: controller.signal,
        onText: (delta) => {
          if (!current()) return
          roundText += delta
          reply.text += delta
          this.scheduleEmit(reply)
        },
      })
      if (!current()) return
      const content = replayContent(message.content)
      this.history.push({ role: 'assistant', content })

      if (message.stop_reason === 'tool_use') {
        this.history.push({ role: 'user', content: await runTools(content, tools) })
        continue
      }
      if (message.stop_reason === 'pause_turn') continue // the API asks us to send it back to resume

      return this.finish(reply, 'done', stopNotice(message.stop_reason))
    }
    this.finish(reply, 'done', 'Claude stopped after too many steps.')
  } catch (error) {
    if (!current()) return
    // Keep what streamed before the failure, as plain text (the history stays append-only).
    if (roundText) {
      this.history.push({ role: 'assistant', content: [{ type: 'text', text: roundText }] })
      keptPartial = true
    }
    const kind = classifyError(error)
    if (kind === 'aborted') {
      return this.finish(
        reply,
        'stopped',
        reply.text ? 'Stopped.' : 'Stopped before Claude replied.',
      )
    }
    this.deps.onError?.(error)
    const retryable = !keptPartial && isRetryable(kind)
    this.finish(reply, 'error', errorMessage(kind), retryable)
  }
}
```

<!-- /code -->

One whole reply: one or more requests to Claude, the streamed text, and the outcome. It never
throws; every failure becomes a status and a notice on the reply.

- `const current = () => generation === this.generation`: True while this reply's conversation is
  still the current one.
- `if (!current()) return`: (three places) New conversation was pressed while this reply was
  running, so it leaves everything alone: no text, no history, no error.
- `let roundText = ''`: The text streamed in the current round only, so a round that's cut off can
  keep its text (below). `reply.text` collects the text of all rounds.
- `for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {`: The tool-use loop: each round is one
  request. Without tools, the first round is also the last.
- `messages: this.history,`: The whole conversation each time, ending with the user's turn or with
  tool results.
- `effort: this.deps.getEffort(),`: Read again each round, so a changed setting applies to the next
  request.
- `this.scheduleEmit(reply)`: The new text goes to the page in batches (see `scheduleEmit()`).
- `const content = replayContent(message.content)`: The reply as it must be sent back. Normally
  that is every block exactly as it came back: thinking blocks with their signatures, text, and
  any tool calls. Only after a server-side fallback partway through the reply does
  `replayContent()` drop some of the declining model's blocks.
- `this.history.push({ role: 'assistant', content })`: The reply goes into the history once and is
  never changed afterwards. This is what keeps the next request valid.
- `if (message.stop_reason === 'tool_use') {`: Claude asked for tools. `runTools()` runs them, the
  results are appended as a user turn, and `continue` starts the next round so Claude can carry on.
- `await runTools(content, tools)`: Tools are run from the trimmed `content`, not the raw reply. A
  tool call the declining model made before a fallback isn't in the history, so it isn't run: a
  result for it would answer a call the API never sees.
- `if (message.stop_reason === 'pause_turn') continue`: The API can pause a long turn, which
  happens with tools that run on Anthropic's servers (this app doesn't use any yet). Sending the
  conversation back as it is lets Claude resume.
- `return this.finish(reply, 'done', stopNotice(message.stop_reason))`: Any other stop reason ends
  the reply: normally `end_turn` (Claude finished), or `refusal` or `max_tokens`, which get a
  notice.
- `this.finish(reply, 'done', 'Claude stopped after too many steps.')`: Reached only when every
  round asked for more tools or paused.
- `if (roundText) {`: The round was cut off after some text had arrived. That text stays on screen,
  so it also goes into the history, as a plain text block, and Claude will see next time what the
  user saw. Nothing else from the unfinished round is kept.
- `keptPartial = true`: Then Retry isn't offered. The history now ends with Claude's partial reply
  instead of a user turn, so the same request can't simply be sent again (this model doesn't
  accept a request whose last turn is Claude's). The user can send a new message instead.
- `if (kind === 'aborted') {`: Stop isn't an error: the reply is marked `stopped`, without Retry,
  and the notice says whether anything had arrived.
- `this.deps.onError?.(error)`: The full error goes to the log. `?.` calls it only if it was given.
- `const retryable = !keptPartial && isRetryable(kind)`: Retry is offered only when nothing from
  this reply went into the history and the problem may be temporary.

### `ChatSession.add()` and `ChatSession.finish()`

<!-- code: apps/desktop/src/main/claude/ChatSession.ts#ChatSession.add,finish -->

[`src/main/claude/ChatSession.ts`, lines 183–198](../../apps/desktop/src/main/claude/ChatSession.ts#L183-L198)

```ts
private add(fields: Omit<ChatMessage, 'id'>): ChatMessage {
  const message: ChatMessage = { id: randomUUID(), ...fields }
  this.messages.push(message)
  this.emit(message)
  return message
}

private finish(
  message: ChatMessage,
  status: ChatMessage['status'],
  notice?: string,
  retryable?: boolean,
): void {
  Object.assign(message, { status, notice, retryable: retryable || undefined })
  this.emit(message)
}
```

<!-- /code -->

- `Omit<ChatMessage, 'id'>`: A `ChatMessage` without its `id`; `add()` makes the id itself with
  `randomUUID()`. The page uses the id to replace a message when an update arrives.
- `return message`: The same object that is in `messages`, so `send()` can hand it to `runTurn()`
  to fill in.
- `retryable: retryable || undefined`: Stores nothing rather than `false`, so a message that can't
  be retried simply has no `retryable` field.
- `this.emit(message)`: New messages and final states go to the page at once, skipping the
  batching.

### `ChatSession.scheduleEmit()` and `ChatSession.emit()`

<!-- code: apps/desktop/src/main/claude/ChatSession.ts#ChatSession.scheduleEmit,emit -->

[`src/main/claude/ChatSession.ts`, lines 200–219](../../apps/desktop/src/main/claude/ChatSession.ts#L200-L219)

```ts
/** Streamed text arrives in many small pieces; batch them into fewer UI updates. */
private scheduleEmit(message: ChatMessage): void {
  const interval = this.deps.emitIntervalMs ?? 50
  if (interval <= 0) return this.emit(message)
  if (this.emitTimers.has(message.id)) return
  this.emitTimers.set(
    message.id,
    setTimeout(() => {
      this.emitTimers.delete(message.id)
      this.deps.onMessage({ ...message })
    }, interval),
  )
}

private emit(message: ChatMessage): void {
  const timer = this.emitTimers.get(message.id)
  if (timer) clearTimeout(timer)
  this.emitTimers.delete(message.id)
  this.deps.onMessage({ ...message })
}
```

<!-- /code -->

A reply streams in as many small pieces. Sending each one over IPC, and re-rendering the Markdown
each time, would be wasteful, so streaming updates are batched: at most one per message every 50
ms.

- `if (interval <= 0) return this.emit(message)`: With an interval of 0 (the tests) every piece is
  sent at once.
- `if (this.emitTimers.has(message.id)) return`: An update is already waiting. The message object
  is changed in place, so when that update fires it carries all the text received by then.
- `this.deps.onMessage({ ...message })`: Sends a copy, a snapshot of the message at that moment.
- `if (timer) clearTimeout(timer)`: `emit()` sends straight away and cancels any waiting update,
  which would only repeat what this one already contains.

### `stopNotice()`

<!-- code: apps/desktop/src/main/claude/ChatSession.ts#stopNotice -->

[`src/main/claude/ChatSession.ts`, lines 222–226](../../apps/desktop/src/main/claude/ChatSession.ts#L222-L226)

```ts
function stopNotice(stopReason: string | null): string | undefined {
  if (stopReason === 'refusal') return 'Claude declined to answer this.'
  if (stopReason === 'max_tokens') return 'This reply hit the length limit and was cut short.'
  return undefined
}
```

<!-- /code -->

The notice for a reply that finished but not normally. Any other stop reason (usually `end_turn`)
gets no notice.

- `if (stopReason === 'refusal')`: The safety classifiers declined, and either there was no
  fallback model for that kind of refusal or it declined too (see `FALLBACK_BETA`). Any text that
  had already streamed stays.
- `if (stopReason === 'max_tokens')`: The reply reached `MAX_TOKENS`.

### `DECLINED_REASONING`, `replayContent()`

<!-- code: apps/desktop/src/main/claude/ChatSession.ts#DECLINED_REASONING,replayContent -->

[`src/main/claude/ChatSession.ts`, lines 228–250](../../apps/desktop/src/main/claude/ChatSession.ts#L228-L250)

```ts
/** Reasoning that belongs to a model that declined, so it isn't sent back after a fallback. */
const DECLINED_REASONING = new Set(['thinking', 'redacted_thinking', 'connector_text'])

/**
 * A reply's content as it must be sent back on the next turn: normally every block, unchanged.
 * After a server-side fallback (another model took over partway through), the API requires
 * dropping what the declining model produced before the last `fallback` block: its reasoning,
 * its client-side tool calls, and server tool calls that got no result. The `fallback` block
 * itself stays exactly where it was; the API checks the blocks around it.
 */
export function replayContent(content: ContentBlock[]): ContentBlock[] {
  const lastFallback = content.findLastIndex((block) => block.type === 'fallback')
  if (lastFallback === -1) return content
  const answered = new Set(
    content.flatMap((block) => ('tool_use_id' in block ? [block.tool_use_id] : [])),
  )
  return content.filter((block, index) => {
    if (index >= lastFallback) return true
    if (DECLINED_REASONING.has(block.type) || block.type === 'tool_use') return false
    if (block.type === 'server_tool_use') return answered.has(block.id)
    return true
  })
}
```

<!-- /code -->

Prepares a reply for the history, following the rules on Anthropic's "Refusals and fallback" page.
`runTurn()` passes every reply through it. Almost always it changes nothing. The exception is a
**mid-reply fallback**: the safety classifiers declined after Claude Opus 5.5 had already started
answering, and the fallback model carried on in the same stream. The reply then holds both models'
output, separated by a `fallback` block. Some of what came before that block must not be sent back,
because it belongs to a model that declined. A decline before any output puts the `fallback` block
first, so nothing comes before it and nothing is dropped.

- `new Set(['thinking', 'redacted_thinking', 'connector_text'])`: The declining model's reasoning:
  thinking blocks, `redacted_thinking` (thinking that comes back encrypted instead of readable), and
  `connector_text` (narration some tool-using replies include between tool calls).
- `content.findLastIndex((block) => block.type === 'fallback')`: The position of the last
  `fallback` block. A reply can have several if more than one model declined; only the last one
  matters. `-1` means there is none.
- `if (lastFallback === -1) return content`: The normal case: the very same array comes back,
  untouched.
- `const answered = new Set(`: The ids of every tool call that got a result in this reply. A server
  tool's result block has a `tool_use_id` naming the call it answers. `'tool_use_id' in block`
  checks the property exists, and `flatMap` with `[]` or `[id]` collects only the blocks that have
  one.
- `if (index >= lastFallback) return true`: The `fallback` block itself and everything after it
  stay. The block must stay exactly where it was, because the API uses its position to check the
  thinking blocks around it.
- `if (DECLINED_REASONING.has(block.type) || block.type === 'tool_use') return false`: Before the
  boundary, the declining model's reasoning and its calls to the app's own tools are dropped.
- `if (block.type === 'server_tool_use') return answered.has(block.id)`: A call to a tool that
  Anthropic runs (such as web search) stays only if its result is in the reply too. The app uses no
  server tools yet.
- `return true`: Everything else before the boundary stays, notably the declining model's text. The
  user has already seen it, and it's what the fallback model continued from.
- `export function replayContent`: Exported so `tests/chatSession.test.ts` can check it directly.

### `runTools()`

<!-- code: apps/desktop/src/main/claude/ChatSession.ts#runTools -->

[`src/main/claude/ChatSession.ts`, lines 252–274](../../apps/desktop/src/main/claude/ChatSession.ts#L252-L274)

```ts
/** Runs every tool call in a reply and returns the results to send back. */
async function runTools(
  content: ContentBlock[],
  tools: ChatTool[],
): Promise<Anthropic.Beta.BetaToolResultBlockParam[]> {
  const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
  for (const block of content) {
    if (block.type !== 'tool_use') continue
    const tool = tools.find((t) => t.definition.name === block.name)
    try {
      if (!tool) throw new Error(`Unknown tool: ${block.name}`)
      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: await tool.run(block.input),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      results.push({ type: 'tool_result', tool_use_id: block.id, content: message, is_error: true })
    }
  }
  return results
}
```

<!-- /code -->

Runs every tool call in one reply and builds the results to send back, as described under
`ChatTool`. It gets the reply's content after `replayContent()`, so only calls that are in the
history are run. The tools run one after another, in the order Claude asked for them.

- `if (block.type !== 'tool_use') continue`: The reply also holds thinking and text blocks; only
  tool calls are run.
- `tools.find((t) => t.definition.name === block.name)`: Finds the tool by the name Claude used.
- `if (!tool) throw new Error`: An unknown name is reported to Claude as a failed result, through
  the `catch` below, instead of breaking the reply.
- `tool_use_id: block.id`: Each result names the call it answers. Claude can ask for several tools
  in one reply, and all the results go back together in one user turn.
- `is_error: true`: A tool that throws is reported to Claude as a failed result with the error
  message, so Claude can try something else or explain the problem.
