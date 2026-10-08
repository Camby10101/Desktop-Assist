import { z } from 'zod'
import type { AuthStatus, SignedInUser } from '@shared/types'
import type { SecretStore } from '../storage/SecretStore'
import { SignInCancelledError, SignInTimeoutError, type RedirectListener } from './loopback'
import {
  describeSignInError,
  SessionExpiredError,
  type IdTokenClaims,
  type Oidc,
  type OidcTokens,
} from './oidc'

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

/** What's kept on disk (encrypted) between runs. */
const SessionSchema = z.object({
  refreshToken: z.string().min(1),
  user: z.object({ name: z.string().optional(), email: z.string().optional() }),
})
type Session = z.infer<typeof SessionSchema>

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

/** An ID token is only handed out if it's valid for at least this much longer. */
const MIN_ID_TOKEN_LIFE_S = 60

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

  constructor(private readonly deps: AuthManagerDeps) {}

  get status(): AuthStatus {
    return this.state
  }

  /** Whether chat requests can be made (they may still need JumpCloud to renew the sign-in). */
  get canChat(): boolean {
    return this.session !== null && this.state.state !== 'signing-in'
  }

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

  /** Tries again after `init()` couldn't reach JumpCloud. */
  async retry(): Promise<void> {
    if (this.state.state !== 'offline' || !this.session) return
    await this.renew()
  }

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

  /** Stops waiting for a sign-in started in the browser. */
  cancelSignIn(): void {
    if (this.state.state === 'signing-in') this.signInCancelled = true
    this.listener?.close()
  }

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

  private async takeIdToken(): Promise<string> {
    const spare = this.spare
    this.spare = null
    if (spare && spare.exp - this.nowSeconds() > MIN_ID_TOKEN_LIFE_S) return spare.token
    return (await this.refresh()).idToken
  }

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

  private queueRefresh(): Promise<OidcTokens> {
    const next = this.queue.then(() => this.refresh())
    this.queue = next.catch(() => {})
    return next
  }

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

  private async startSession(refreshToken: string, user: SignedInUser): Promise<void> {
    this.session = { refreshToken, user }
    try {
      await this.deps.store.save(JSON.stringify(this.session))
    } catch (error) {
      // Still signed in for this run; the user will just be asked again next start.
      console.error('Saving the sign-in failed', error)
    }
  }

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

  private setStatus(status: AuthStatus): void {
    this.state = status
    this.deps.onStatus(status)
  }

  private nowSeconds(): number {
    return (this.deps.now?.() ?? Date.now()) / 1000
  }
}

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
