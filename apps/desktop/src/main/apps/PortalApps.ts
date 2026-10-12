import type { AppsState, PortalApp } from '@shared/types'
import { SignInCancelledError, SignInTimeoutError, type RedirectListener } from '../auth/loopback'
import {
  McpAccount,
  NeedsSignInError,
  type McpConnector,
  type SavedSecret,
} from '../mcp/McpAccount'
import type { ToolResult } from '../mcp/toolResult'
import {
  describeShape,
  findLaunchUrl,
  idArgumentName,
  parseAppList,
  type PortalAppInfo,
} from './portalData'

/** The portal's tools, from JumpCloud's MCP Server for Users. */
export const LIST_TOOL = 'list_applications'
export const LAUNCH_TOOL = 'launch_application'

/**
 * How long opening an app waits for JumpCloud's sign-in link before using the link the list gave
 * (so the spinner on the tile can't go on for ever).
 */
export const LAUNCH_TIMEOUT_MS = 15_000

/** Everything JumpCloud's apps server offers; offline_access keeps the user connected. */
const SCOPE = 'openid profile email offline_access organization userconsole'

export interface PortalAppsDeps {
  appName: string
  redirectPort: number
  connector: McpConnector
  /** The connection to the portal, saved encrypted (Windows DPAPI). */
  store: SavedSecret
  listen(port: number): Promise<RedirectListener>
  openBrowser(url: string): Promise<void>
  /** An app's logo as a data: URL, or null. */
  fetchLogo(url: string): Promise<string | null>
  onState(state: AppsState): void
  onError?(message: string, error?: unknown): void
  /** Tests make it short. */
  launchTimeoutMs?: number
}

/**
 * The Apps list: the apps in the user's JumpCloud User Portal, from JumpCloud's MCP Server for
 * Users, and opening one in the browser through its sign-in link. The user connects once, in the
 * browser; the connection is saved and renewed by itself.
 */
export class PortalApps {
  private state: AppsState = { status: 'loading' }
  private apps: PortalAppInfo[] = []
  private readonly account: McpAccount
  private loading: Promise<AppsState> | null = null
  private loadedOnce = false
  /** Logos already fetched, by address, so a refresh doesn't download them all again. */
  private readonly logos = new Map<string, string>()
  /**
   * The launch tool's argument for the app ID, once known (null: the server has no launch tool).
   * Remembered so opening an app is one request to JumpCloud, not two.
   */
  private launchArgument: string | null | undefined

  constructor(private readonly deps: PortalAppsDeps) {
    this.account = new McpAccount({
      appName: deps.appName,
      redirectPort: deps.redirectPort,
      scope: SCOPE,
      connector: deps.connector,
      store: deps.store,
      listen: (port) => this.deps.listen(port),
      openBrowser: (url) => this.deps.openBrowser(url),
    })
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
      await this.account.signIn()
      this.state = { status: 'loading' }
      await this.load()
    } catch (error) {
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
    this.account.cancelSignIn()
  }

  /**
   * Opens the app in the browser through its sign-in link. False if there's no link for it. If
   * JumpCloud is slow to give the link, the one from the list is used instead.
   */
  async open(id: string): Promise<boolean> {
    const app = this.apps.find((a) => a.id === id)
    if (!app) return false
    const launched = await withTimeout(
      this.launchUrl(app).catch(() => null),
      this.deps.launchTimeoutMs ?? LAUNCH_TIMEOUT_MS,
    )
    const url = launched ?? app.launchUrl
    if (!url) return false
    await this.deps.openBrowser(url)
    return true
  }

  async dispose(): Promise<void> {
    await this.account.dispose()
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

  private call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    return this.account.call(name, args)
  }

  private async launchUrl(app: PortalAppInfo): Promise<string | null> {
    if (this.launchArgument === undefined) {
      const tool = (await this.account.listTools()).find((t) => t.name === LAUNCH_TOOL)
      this.launchArgument = tool ? idArgumentName(tool.inputSchema) : null
    }
    if (this.launchArgument === null) return null
    const result = await this.call(LAUNCH_TOOL, { [this.launchArgument]: app.id })
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

  private setState(state: AppsState): AppsState {
    this.state = state
    this.deps.onState(state)
    return state
  }
}

/** The promise's value, or null if it takes longer than `ms`. */
function withTimeout<T>(promise: Promise<T | null>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    void promise.then((value) => {
      clearTimeout(timer)
      resolve(value)
    })
  })
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
