import { randomBytes } from 'node:crypto'
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import type { RedirectListener } from '../auth/loopback'
import type { ToolResult } from './toolResult'

/** A connection to an MCP server, signed in as the user. */
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

/** Thrown when a tool answers with an error (the server's message, if it gave one). */
export class ToolError extends Error {}

/** Talks to an MCP server (src/main/mcp/connector.ts; tests use a fake). */
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

/** Where a connection is saved, encrypted (Windows DPAPI). */
export interface SavedSecret {
  load(): Promise<string | null>
  save(secret: string): Promise<void>
  clear(): Promise<void>
}

interface Saved {
  client?: OAuthClientInformationMixed
  tokens?: OAuthTokens
}

/**
 * The OAuth client the MCP SDK drives: Desktop Assist as a public client (PKCE, no secret) with a
 * loopback redirect. It remembers the registration and the tokens; the sign-in page is only opened
 * by McpAccount.signIn(), never by just using the connection.
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
    private readonly store: SavedSecret,
    /** The scopes to ask for; left out when the server doesn't define any. */
    private readonly scope?: string,
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
      ...(this.scope ? { scope: this.scope } : {}),
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

export interface McpAccountDeps {
  appName: string
  redirectPort: number
  /** The scopes to ask for, if the server defines any. */
  scope?: string
  connector: McpConnector
  store: SavedSecret
  listen(port: number): Promise<RedirectListener>
  openBrowser(url: string): Promise<void>
}

/**
 * The user's connection to an MCP server that signs people in with OAuth in the browser (the
 * JumpCloud apps server, Atlassian's): connecting once, then calling tools with the saved
 * connection, which the SDK renews by itself.
 */
export class McpAccount {
  private readonly auth: SavedAuth
  private readonly loaded: Promise<void>
  private session: McpSession | null = null
  private listener: RedirectListener | null = null

  constructor(private readonly deps: McpAccountDeps) {
    this.auth = new SavedAuth(deps.appName, deps.redirectPort, deps.store, deps.scope)
    this.loaded = this.auth.load()
  }

  /**
   * Connects in the browser: resolves once signed in. Rejects with SignInCancelledError if the
   * user cancels, SignInTimeoutError if they take too long, or an Error saying what went wrong.
   */
  async signIn(): Promise<void> {
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
    } catch (error) {
      this.listener?.close()
      throw error
    } finally {
      this.listener = null
    }
  }

  cancelSignIn(): void {
    this.listener?.close()
  }

  /** Calls a tool, connecting first if needed and once more if the connection has gone stale. */
  async call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    await this.loaded
    for (let attempt = 0; ; attempt++) {
      try {
        this.session ??= await this.deps.connector.connect(this.auth)
        const result = await this.session.callTool(name, args)
        if (result.isError) throw new ToolError(errorText(result) ?? `The ${name} tool failed`)
        return result
      } catch (error) {
        // The server answered: trying again won't change its mind.
        if (error instanceof ToolError) throw error
        await this.closeSession()
        if (error instanceof NeedsSignInError || attempt > 0) throw error
      }
    }
  }

  async listTools(): Promise<{ name: string; inputSchema?: unknown }[]> {
    await this.loaded
    this.session ??= await this.deps.connector.connect(this.auth)
    return this.session.listTools()
  }

  /** Forgets the saved connection; the next call needs a new sign-in. */
  async signOut(): Promise<void> {
    await this.loaded
    await this.closeSession()
    await this.auth.invalidateCredentials('all')
  }

  async dispose(): Promise<void> {
    this.listener?.close()
    await this.closeSession()
  }

  private async closeSession(): Promise<void> {
    const session = this.session
    this.session = null
    await session?.close().catch(() => {})
  }
}

/** The text of an error answer, if it has any. */
function errorText(result: ToolResult): string | null {
  const blocks = Array.isArray(result.content) ? (result.content as unknown[]) : []
  for (const block of blocks) {
    const text = (block as { text?: unknown } | null)?.text
    if (typeof text === 'string' && text.trim()) return text.trim().slice(0, 500)
  }
  return null
}
