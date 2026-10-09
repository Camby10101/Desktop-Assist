import { randomBytes } from 'node:crypto'
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import type { AppsState, PortalApp } from '@shared/types'
import { SignInCancelledError, SignInTimeoutError, type RedirectListener } from '../auth/loopback'
import {
  describeShape,
  findLaunchUrl,
  idArgumentName,
  parseAppList,
  type PortalAppInfo,
  type ToolResult,
} from './portalData'

/** The portal's tools, from JumpCloud's MCP Server for Users. */
export const LIST_TOOL = 'list_applications'
export const LAUNCH_TOOL = 'launch_application'

/** Everything JumpCloud's apps server offers; offline_access keeps the user connected. */
const SCOPE = 'openid profile email offline_access organization userconsole'

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

/**
 * The OAuth client the MCP SDK drives: Desktop Assist as a public client (PKCE, no secret) with a
 * loopback redirect. It remembers the registration and the tokens; the sign-in page is only opened
 * by PortalApps.signIn(), never by just looking at the list.
 */
export class SavedAuth implements OAuthClientProvider {
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

  state(): string {
    this.expectedState = randomBytes(16).toString('base64url')
    return this.expectedState
  }

  /** Whether the browser came back from the sign-in this app started. */
  isExpectedState(state: string | null): boolean {
    return state !== null && this.expectedState !== '' && state === this.expectedState
  }

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

  redirectToAuthorization(authorizationUrl: URL): void {
    this.authorizationUrl = authorizationUrl
  }

  saveCodeVerifier(verifier: string): void {
    this.verifier = verifier
  }

  codeVerifier(): string {
    return this.verifier
  }

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
}

/**
 * The Apps list: the apps in the user's JumpCloud User Portal, from JumpCloud's MCP Server for
 * Users, and opening one in the browser through its sign-in link. The user connects once, in the
 * browser; the connection is saved and renewed by itself.
 */
export class PortalApps {
  private state: AppsState = { status: 'loading' }
  private apps: PortalAppInfo[] = []
  private readonly auth: SavedAuth
  private loaded: Promise<void>
  private session: McpSession | null = null
  private loading: Promise<AppsState> | null = null
  private listener: RedirectListener | null = null
  private loadedOnce = false

  constructor(private readonly deps: PortalAppsDeps) {
    this.auth = new SavedAuth(deps.appName, deps.redirectPort, deps.store)
    this.loaded = this.auth.load()
  }

  get current(): AppsState {
    return this.state
  }

  /** The list as it stands, loading it the first time (or again with `refresh`). */
  async get(refresh = false): Promise<AppsState> {
    if (this.state.status === 'signing-in') return this.state
    if (this.loadedOnce && !refresh && this.state.status !== 'error') return this.state
    return this.load()
  }

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
      apps.map(async ({ id, name, logoUrl }) => ({
        id,
        name,
        logo: logoUrl ? await this.deps.fetchLogo(logoUrl).catch(() => null) : null,
      })),
    )
  }

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
}

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
