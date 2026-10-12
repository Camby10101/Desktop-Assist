import { z } from 'zod'
import type {
  AtlassianState,
  ConfluencePage,
  FeedList,
  IssuePrompt,
  IssueResult,
  IssueSummary,
  JiraFeed,
  JiraNotification,
  SearchResult,
  ServiceRequest,
} from '@shared/types'
import { isIssueKey } from '@shared/jira'
import { SignInCancelledError, SignInTimeoutError, type RedirectListener } from '../auth/loopback'
import {
  McpAccount,
  NeedsSignInError,
  ToolError,
  type McpConnector,
  type SavedSecret,
} from '../mcp/McpAccount'
import { payloadOf, type ToolResult } from '../mcp/toolResult'
import {
  ASSIGNED_JQL,
  MENTIONED_JQL,
  NOTIFICATION_DAYS,
  assignedNotification,
  cloudIdOf,
  confluenceCql,
  confluencePagesOf,
  excerpt,
  issueDetailOf,
  issueNodes,
  issuePrompt,
  issueSummaries,
  mentionNotifications,
  myRequestsJql,
  portalRequestUrl,
  requestInfoOf,
  searchWords,
  textSearchJql,
  transitionsOf,
  userOf,
  type AtlassianUser,
  type FoundNotification,
  type RequestInfo,
} from './jiraData'

/** The tools of Atlassian's Remote MCP server that Desktop Assist uses. */
export const TOOLS = {
  user: 'atlassianUserInfo',
  sites: 'getAccessibleAtlassianResources',
  searchJira: 'searchJiraIssuesUsingJql',
  issue: 'getJiraIssue',
  transitions: 'getTransitionsForJiraIssue',
  transition: 'transitionJiraIssue',
  comment: 'addCommentToJiraIssue',
  worklog: 'addWorklogToJiraIssue',
  searchConfluence: 'searchConfluenceUsingCql',
  projects: 'getVisibleJiraProjects',
} as const

/** How often notifications and requests are checked in the background. */
export const FEED_INTERVAL_MS = 5 * 60_000
/** Opening the Jira page checks again if the last check is older than this. */
const STALE_MS = 60_000
const DAY_MS = 24 * 60 * 60_000
const MAX_NOTIFICATIONS = 30
/** How many issues are looked at in parallel (each is one request to Atlassian). */
const PARALLEL = 4

/** What the app remembers between runs (atlassian.json): what the user has already seen. */
export const AtlassianMemorySchema = z.object({
  /** Notifications up to this ISO time have been seen. */
  notificationsReadAt: z.string().nullable().optional(),
  /**
   * For each of the user's requests, as "status|latest reply": what they've seen in the panel,
   * and what they've had a Windows notification about.
   */
  requests: z.record(z.string(), z.object({ seen: z.string(), notified: z.string() })).optional(),
})

export type AtlassianMemory = z.infer<typeof AtlassianMemorySchema>

export interface AtlassianDeps {
  appName: string
  site: string
  redirectPort: number
  /** Confluence spaces searched for how-to articles while raising an IT request. */
  knowledgeSpaces: string[]
  /** The service desk's requests, for My requests; null without. */
  requests: { helpCentre: string; portalId: string; projectKey: string } | null
  connector: McpConnector
  /** The connection to Atlassian, saved encrypted (Windows DPAPI). */
  store: SavedSecret
  memory: { load(): Promise<AtlassianMemory>; save(memory: AtlassianMemory): Promise<void> }
  listen(port: number): Promise<RedirectListener>
  openBrowser(url: string): Promise<void>
  onState(state: AtlassianState): void
  onFeed(feed: JiraFeed): void
  /** A Windows notification: IT replied to one of the user's requests, or changed its status. */
  notify(message: { title: string; body: string }): void
  onError?(message: string, error?: unknown): void
  now?: () => number
  feedIntervalMs?: number
}

const loading = <T>(): FeedList<T> => ({ status: 'loading', items: [] })

/**
 * Jira and Confluence through Atlassian's Remote MCP server: the user connects once, in the
 * browser, and then sees who assigned them issues or mentioned them, their IT requests, search,
 * and can work on an issue. Notifications and requests are checked every few minutes.
 */
export class Atlassian {
  private state: AtlassianState = { status: 'loading' }
  private feedState: JiraFeed = { notifications: loading(), requests: loading() }
  private readonly account: McpAccount
  private user: AtlassianUser | null = null
  private cloudId: string | null = null
  private memory: AtlassianMemory = {}
  private readonly memoryLoaded: Promise<void>
  private refreshing: Promise<JiraFeed> | null = null
  private lastRefresh = 0
  private timer: ReturnType<typeof setInterval> | null = null
  /** Who assigned each issue, by key, until the issue changes. */
  private readonly assignments = new Map<
    string,
    { updated: string; found: FoundNotification | null }
  >()
  /** Each request's state as last loaded ("status|latest reply"). */
  private readonly requestSignatures = new Map<string, string>()
  private projectKeyList: Promise<string[] | null> | null = null

  constructor(private readonly deps: AtlassianDeps) {
    this.account = new McpAccount({
      appName: deps.appName,
      redirectPort: deps.redirectPort,
      connector: deps.connector,
      store: deps.store,
      listen: (port) => this.deps.listen(port),
      openBrowser: (url) => this.deps.openBrowser(url),
    })
    this.memoryLoaded = deps.memory.load().then(
      (memory) => void (this.memory = memory),
      () => {},
    )
  }

  get current(): AtlassianState {
    return this.state
  }

  get currentFeed(): JiraFeed {
    return this.feedState
  }

  /** Uses the saved connection, if there is one (never opens the browser), and starts checking. */
  async init(): Promise<AtlassianState> {
    await this.memoryLoaded
    try {
      await this.identify()
      this.connected()
    } catch (error) {
      if (error instanceof NeedsSignInError) this.setState({ status: 'sign-in' })
      else {
        this.deps.onError?.('Connecting to Atlassian failed:', error)
        this.setState({ status: 'error', message: this.problem(error) })
      }
    }
    return this.state
  }

  /** Connects in the browser (through the company's sign-in), then loads the feed. */
  async signIn(): Promise<void> {
    if (this.state.status === 'signing-in') return
    this.setState({ status: 'signing-in' })
    try {
      await this.account.signIn()
      await this.identify()
      this.connected()
    } catch (error) {
      if (error instanceof SignInCancelledError) {
        this.setState({ status: 'sign-in' })
        return
      }
      const message =
        error instanceof SignInTimeoutError
          ? 'Connecting took too long. Try again.'
          : `Connecting didn't work: ${error instanceof Error ? error.message : String(error)}`
      this.deps.onError?.('Connecting to Atlassian failed:', error)
      this.setState({ status: 'sign-in', message })
    }
  }

  cancelSignIn(): void {
    this.account.cancelSignIn()
  }

  /** Forgets the connection (Settings → Disconnect Atlassian). */
  async signOut(): Promise<void> {
    this.stopChecking()
    await this.account.signOut()
    this.forget()
    this.setState({ status: 'sign-in' })
  }

  /** Tries the saved connection again after an error. */
  retry(): Promise<AtlassianState> {
    this.setState({ status: 'loading' })
    return this.init()
  }

  /** Notifications and requests, checked again first if asked or if the last check is old. */
  async feed(refresh = false): Promise<JiraFeed> {
    if (this.state.status !== 'connected') return this.feedState
    if (refresh || this.now() - this.lastRefresh > STALE_MS) return this.refresh()
    return this.feedState
  }

  /** The user has looked at the Notifications tab. */
  async markNotificationsRead(): Promise<JiraFeed> {
    const { items } = this.feedState.notifications
    if (!items.some((n) => n.unread)) return this.feedState
    const newest = items.reduce((latest, n) => (n.at > latest ? n.at : latest), '')
    this.memory.notificationsReadAt = newest || new Date(this.now()).toISOString()
    this.setFeed({
      ...this.feedState,
      notifications: { ...this.feedState.notifications, items: items.map(read) },
    })
    await this.saveMemory()
    return this.feedState
  }

  /** The user has seen what's new on a request (or on all of them, without a key). */
  async markRequestsRead(key?: string): Promise<JiraFeed> {
    const requests = this.memory.requests ?? {}
    let changed = false
    const items = this.feedState.requests.items.map((request) => {
      if (key !== undefined && request.key !== key) return request
      const signature = this.requestSignatures.get(request.key)
      if (signature) requests[request.key] = { seen: signature, notified: signature }
      if (!request.news) return request
      changed = true
      return { ...request, news: null }
    })
    if (!changed) return this.feedState
    this.memory.requests = requests
    this.setFeed({ ...this.feedState, requests: { ...this.feedState.requests, items } })
    await this.saveMemory()
    return this.feedState
  }

  /** Jira issues and Confluence pages matching the words (an issue key finds that issue). */
  async search(query: string): Promise<SearchResult> {
    const q = query.trim()
    if (!q) return { ok: true, issues: [], pages: [] }
    let failure: unknown = null
    const failed = (error: unknown) => {
      failure ??= error
      return []
    }
    const [issues, pages] = await Promise.all([
      this.searchIssues(q).catch(failed),
      this.searchPages(q, [], 6).catch(failed),
    ])
    if (failure && issues.length === 0 && pages.length === 0) {
      this.deps.onError?.('Searching Atlassian failed:', failure)
      return { ok: false, message: this.problem(failure) }
    }
    return { ok: true, issues, pages }
  }

  /** An issue with its latest comments and the statuses it can move to. */
  async issue(key: string): Promise<IssueResult> {
    try {
      const node = issueNodes(
        await this.call(TOOLS.issue, {
          issueIdOrKey: key,
          fields: [
            'summary',
            'status',
            'issuetype',
            'assignee',
            'reporter',
            'created',
            'updated',
            'description',
            'comment',
          ],
          responseContentFormat: 'markdown',
        }),
      )[0]
      const transitions = await this.call(TOOLS.transitions, { issueIdOrKey: key })
        .then(transitionsOf)
        .catch(() => [])
      const { requests } = this.deps
      const portalUrl =
        requests && key.startsWith(`${requests.projectKey}-`)
          ? portalRequestUrl(requests.helpCentre, requests.portalId, key)
          : null
      const issue = node && issueDetailOf(node, this.deps.site, { transitions, portalUrl })
      if (!issue) return { ok: false, message: `Couldn't find ${key}.` }
      // Opening one of the user's requests counts as seeing what's new on it.
      if (portalUrl) void this.markRequestsRead(key)
      return { ok: true, issue }
    } catch (error) {
      this.deps.onError?.(`Opening ${key} failed:`, error)
      return { ok: false, message: this.problem(error) }
    }
  }

  /** Moves the issue to another status, then answers with it as it is now. */
  transition(key: string, transitionId: string): Promise<IssueResult> {
    return this.change(key, 'Moving', TOOLS.transition, { transition: { id: transitionId } })
  }

  comment(key: string, body: string): Promise<IssueResult> {
    return this.change(key, 'Commenting on', TOOLS.comment, {
      commentBody: body,
      contentFormat: 'markdown',
    })
  }

  /** Logs time on the issue, in Jira's format ("30m", "1h 30m", "2d"). */
  logWork(key: string, timeSpent: string): Promise<IssueResult> {
    return this.change(key, 'Logging time on', TOOLS.worklog, { timeSpent })
  }

  /** How-to pages from the knowledge spaces about what the user is typing (up to three). */
  async articles(value: string): Promise<ConfluencePage[]> {
    if (this.state.status !== 'connected' || searchWords(value).length < 3) return []
    return this.searchPages(value, this.deps.knowledgeSpaces, 3).catch((error: unknown) => {
      this.deps.onError?.('Looking for articles failed:', error)
      return []
    })
  }

  /** The keys of the Jira projects the user can see (to spot issue keys in the text box). */
  projectKeys(): Promise<string[] | null> {
    if (this.state.status !== 'connected') return Promise.resolve(null)
    this.projectKeyList ??= this.loadProjectKeys().catch((error: unknown) => {
      this.deps.onError?.('Listing Jira projects failed:', error)
      this.projectKeyList = null
      return null
    })
    return this.projectKeyList
  }

  /** What to ask Claude about the issue, with the issue's details in it. */
  async prompt(
    key: string,
    kind: IssuePrompt,
    max: number,
  ): Promise<{ ok: true; prompt: string } | { ok: false; message: string }> {
    const result = await this.issue(key)
    return result.ok ? { ok: true, prompt: issuePrompt(result.issue, kind, max) } : result
  }

  dispose(): void {
    this.stopChecking()
    void this.account.dispose()
  }

  // ------------------------------------------------------------------------------------- inner

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }

  /** Who the user is, and the site's cloud ID (the tools want one). */
  private async identify(): Promise<void> {
    const user = userOf(await this.account.call(TOOLS.user, {}))
    if (!user) throw new Error("Couldn't read your Atlassian account")
    const sites = await this.account.call(TOOLS.sites, {}).catch(() => null)
    this.user = user
    this.cloudId = (sites && cloudIdOf(sites, this.deps.site)) ?? new URL(this.deps.site).host
  }

  private connected(): void {
    const { name, email } = this.user!
    this.setState({ status: 'connected', user: email ? { name, email } : { name } })
    void this.refresh()
    this.startChecking()
  }

  private forget(): void {
    this.user = null
    this.cloudId = null
    this.assignments.clear()
    this.requestSignatures.clear()
    this.projectKeyList = null
    this.lastRefresh = 0
    this.setFeed({ notifications: loading(), requests: loading() })
  }

  private startChecking(): void {
    this.stopChecking()
    this.timer = setInterval(
      () => void this.refresh(),
      this.deps.feedIntervalMs ?? FEED_INTERVAL_MS,
    )
    this.timer.unref?.()
  }

  private stopChecking(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** A tool call on the user's site. A connection that has ended takes the page back to Connect. */
  private async call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      return await this.account.call(name, { cloudId: this.cloudId, ...args })
    } catch (error) {
      if (error instanceof NeedsSignInError && this.state.status === 'connected') {
        this.stopChecking()
        this.forget()
        this.setState({
          status: 'sign-in',
          message: 'Your Atlassian connection has ended. Connect again.',
        })
      }
      throw error
    }
  }

  private async change(
    key: string,
    doing: string,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<IssueResult> {
    try {
      await this.call(tool, { issueIdOrKey: key, ...args })
    } catch (error) {
      this.deps.onError?.(`${doing} ${key} failed:`, error)
      return { ok: false, message: this.problem(error) }
    }
    return this.issue(key)
  }

  private refresh(): Promise<JiraFeed> {
    this.refreshing ??= this.loadFeed().finally(() => (this.refreshing = null))
    return this.refreshing
  }

  private async loadFeed(): Promise<JiraFeed> {
    const user = this.user
    if (!user || this.state.status !== 'connected') return this.feedState
    await this.memoryLoaded
    const [notifications, requests] = await Promise.all([
      this.loadNotifications(user).catch((error: unknown) =>
        this.failedList<JiraNotification>('notifications', error),
      ),
      this.loadRequests(user).catch((error: unknown) =>
        this.failedList<ServiceRequest>('requests', error),
      ),
    ])
    // Disconnected meanwhile: drop what came back.
    if (this.user !== user) return this.feedState
    this.lastRefresh = this.now()
    this.setFeed({ notifications, requests })
    await this.saveMemory()
    return this.feedState
  }

  private failedList<T>(what: string, error: unknown): FeedList<T> {
    this.deps.onError?.(`Checking ${what} failed:`, error)
    const previous =
      what === 'notifications' ? this.feedState.notifications : this.feedState.requests
    // Keep what was there before; say why it couldn't be updated.
    return { status: 'error', items: previous.items as T[], message: this.problem(error) }
  }

  private async loadNotifications(user: AtlassianUser): Promise<FeedList<JiraNotification>> {
    const since = this.now() - NOTIFICATION_DAYS * DAY_MS
    const [assigned, mentioned] = await Promise.all([
      this.assignedNotifications(user, since),
      this.mentionedNotifications(user, since),
    ])
    const readAt = this.memory.notificationsReadAt ?? null
    const items = [...assigned, ...mentioned]
      .filter((n) => Date.parse(n.at) >= since)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, MAX_NOTIFICATIONS)
      .map((n) => ({ ...n, unread: readAt === null || n.at > readAt }))
    return { status: 'ready', items }
  }

  private async assignedNotifications(
    user: AtlassianUser,
    since: number,
  ): Promise<FoundNotification[]> {
    const result = await this.call(TOOLS.searchJira, {
      jql: ASSIGNED_JQL,
      fields: ['summary', 'updated'],
      maxResults: 20,
    })
    const found = await mapLimit(issueNodes(result), PARALLEL, async (node) => {
      const key = typeof node['key'] === 'string' ? node['key'] : ''
      const updated = String((node['fields'] as { updated?: unknown } | undefined)?.updated ?? '')
      const known = this.assignments.get(key)
      if (known && known.updated === updated) return known.found
      // Only the issue's history says who assigned it.
      const detail = issueNodes(
        await this.call(TOOLS.issue, {
          issueIdOrKey: key,
          fields: ['summary', 'assignee', 'creator', 'created'],
          expand: 'changelog',
          updateHistory: false,
        }),
      )[0]
      const notification = detail ? assignedNotification(detail, user, since) : null
      this.assignments.set(key, { updated, found: notification })
      return notification
    })
    return found.filter((n): n is FoundNotification => n !== null)
  }

  private async mentionedNotifications(
    user: AtlassianUser,
    since: number,
  ): Promise<FoundNotification[]> {
    const result = await this.call(TOOLS.searchJira, {
      jql: MENTIONED_JQL,
      fields: ['summary', 'updated', 'created', 'creator', 'description', 'comment'],
      maxResults: 20,
      // Jira's own format: its mentions carry the account ID.
      responseContentFormat: 'adf',
    })
    return issueNodes(result).flatMap((node) => mentionNotifications(node, user, since))
  }

  private async loadRequests(user: AtlassianUser): Promise<FeedList<ServiceRequest>> {
    const { requests } = this.deps
    if (!requests) return { status: 'ready', items: [] }
    const result = await this.call(TOOLS.searchJira, {
      jql: myRequestsJql(requests.projectKey),
      fields: ['summary', 'status', 'updated', 'comment'],
      maxResults: 30,
      responseContentFormat: 'markdown',
    })
    const infos = issueNodes(result)
      .map((node) => requestInfoOf(node, user))
      .filter((info): info is RequestInfo => info !== null)
    // The very first check only learns where things are; nothing is "new" yet.
    const firstCheck = this.memory.requests === undefined
    const known = this.memory.requests ?? {}
    const memory: NonNullable<AtlassianMemory['requests']> = {}
    this.requestSignatures.clear()
    const items = infos.map((info): ServiceRequest => {
      const signature = `${info.status.name}|${info.reply?.id ?? ''}`
      const entry = known[info.key] ?? { seen: signature, notified: signature }
      memory[info.key] = entry
      this.requestSignatures.set(info.key, signature)
      const news = newsOf(entry.seen, info)
      // Each change gets one Windows notification, saying what's changed since the last one.
      const fresh = newsOf(entry.notified, info)
      if (fresh) {
        if (!firstCheck) this.deps.notify({ title: `${info.key}: ${fresh}`, body: info.summary })
        entry.notified = signature
      }
      return {
        key: info.key,
        summary: info.summary,
        status: info.status,
        updated: info.updated,
        url: portalRequestUrl(requests.helpCentre, requests.portalId, info.key),
        news,
      }
    })
    this.memory.requests = memory
    return { status: 'ready', items }
  }

  private async searchIssues(query: string): Promise<IssueSummary[]> {
    const fields = ['summary', 'status', 'issuetype']
    const key = query.toUpperCase()
    if (isIssueKey(key)) {
      const result = await this.call(TOOLS.issue, { issueIdOrKey: key, fields }).catch(() => null)
      return result ? issueSummaries(result, this.deps.site) : []
    }
    if (!searchWords(query)) return []
    const result = await this.call(TOOLS.searchJira, {
      jql: textSearchJql(query),
      fields,
      maxResults: 10,
    })
    return issueSummaries(result, this.deps.site)
  }

  private async searchPages(
    query: string,
    spaces: string[],
    limit: number,
  ): Promise<ConfluencePage[]> {
    if (!searchWords(query)) return []
    const result = await this.call(TOOLS.searchConfluence, {
      cql: confluenceCql(query, spaces),
      limit,
    })
    return confluencePagesOf(result, this.deps.site).slice(0, limit)
  }

  private async loadProjectKeys(): Promise<string[]> {
    const keys: string[] = []
    for (let startAt = 0; startAt < 500; startAt += 50) {
      const payload = payloadOf(
        await this.call(TOOLS.projects, {
          action: 'browse',
          expandIssueTypes: false,
          maxResults: 50,
          startAt,
        }),
      ) as { values?: { key?: unknown }[]; isLast?: unknown } | undefined
      const page = (payload?.values ?? [])
        .map((project) => project.key)
        .filter((k): k is string => typeof k === 'string')
      keys.push(...page)
      if (payload?.isLast !== false || page.length === 0) break
    }
    return keys
  }

  /** A plain-English reason for the panel. */
  private problem(error: unknown): string {
    if (error instanceof NeedsSignInError) return 'Connect to Atlassian first.'
    const message = error instanceof Error ? error.message : String(error)
    if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(message)) {
      return "Couldn't reach Atlassian. Check you're online and try again."
    }
    if (error instanceof ToolError) return `Atlassian said: ${excerpt(message, 200)}`
    return "Couldn't get that from Atlassian. Try again."
  }

  private async saveMemory(): Promise<void> {
    await this.deps.memory.save(this.memory).catch((error: unknown) => {
      this.deps.onError?.('Saving what you have seen in Jira failed:', error)
    })
  }

  private setState(state: AtlassianState): void {
    this.state = state
    this.deps.onState(state)
  }

  private setFeed(feed: JiraFeed): void {
    this.feedState = feed
    this.deps.onFeed(feed)
  }
}

const read = (notification: JiraNotification): JiraNotification =>
  notification.unread ? { ...notification, unread: false } : notification

/**
 * What's changed on a request since it was `before` ("status|latest reply"): "Now Resolved",
 * "Mark Duong replied", or both.
 */
function newsOf(before: string, info: RequestInfo): string | null {
  const [status, reply] = before.split('|')
  const news = [
    info.status.name !== status && `Now ${info.status.name}`,
    info.reply && info.reply.id !== reply && `${info.reply.author} replied`,
  ].filter(Boolean)
  return news.length ? news.join(' · ') : null
}

/** Runs `run` over the items, at most `limit` at a time, keeping their order. */
async function mapLimit<T, R>(
  list: T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(list.length)
  let next = 0
  const worker = async () => {
    while (next < list.length) {
      const index = next++
      results[index] = await run(list[index] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker))
  return results
}
