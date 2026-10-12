import { describe, expect, it, vi } from 'vitest'
import type { AtlassianState, IssueDetail, JiraFeed } from '@shared/types'
import { findIssueKeys } from '@shared/jira'
import { Atlassian, TOOLS, type AtlassianMemory } from '../src/main/atlassian/Atlassian'
import {
  adfMentions,
  adfText,
  assignedNotification,
  cleanMarkdown,
  cloudIdOf,
  confluenceCql,
  confluencePagesOf,
  issuePrompt,
  mentionNotifications,
  myRequestsJql,
  plainSnippet,
  requestInfoOf,
  searchWords,
  userOf,
} from '../src/main/atlassian/jiraData'
import { SignInCancelledError, type RedirectListener } from '../src/main/auth/loopback'
import { NeedsSignInError, type McpConnector, type McpSession } from '../src/main/mcp/McpAccount'

const json = (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] })
const SITE = 'https://example.atlassian.net'
const ME = { accountId: '712020:me', name: 'Casey Jones' }
const SAM = { accountId: '5cf7sam', displayName: 'Sam Bolin' }
const MARK = { accountId: '712020:mark', displayName: 'Mark Duong' }
const BOT = { accountId: '557058:automation', displayName: 'Automation for Jira' }
const SELF = { accountId: ME.accountId, displayName: ME.name }
const NOW = Date.parse('2026-10-12T00:00:00.000Z')
const DAYS_AGO = (days: number) => new Date(NOW - days * 86_400_000).toISOString()
const SINCE = NOW - 14 * 86_400_000

/** An ADF comment body: text, with mentions as `@id`. */
const adf = (...parts: (string | { mention: string; text: string })[]) => ({
  type: 'doc',
  version: 1,
  content: [
    {
      type: 'paragraph',
      content: parts.map((part) =>
        typeof part === 'string'
          ? { type: 'text', text: part }
          : { type: 'mention', attrs: { id: part.mention, text: `@${part.text}` } },
      ),
    },
  ],
})

const mentionOfMe = { mention: ME.accountId, text: ME.name }

describe('reading Atlassian', () => {
  it('finds issue keys in text, each once', () => {
    expect(findIssueKeys('Look at ISD-8380 and isd-1, then SW-12 and ISD-8380 again')).toEqual([
      'ISD-8380',
      'SW-12',
    ])
    expect(findIssueKeys('UTF8 and A-1 are not keys')).toEqual([])
  })

  it('keeps only the words of a search, so a query cannot break JQL or CQL', () => {
    expect(searchWords('vpn "won\'t" connect (AND) OR -x*')).toBe("vpn won't connect AND OR x")
    expect(confluenceCql('printer', ['INFRA'])).toBe(
      'siteSearch ~ "printer" AND type in (page, blogpost) AND space in ("INFRA")',
    )
    expect(myRequestsJql('ISD')).toContain('project = "ISD" AND reporter = currentUser()')
  })

  it('reads mentions and text from Jira documents', () => {
    const doc = adf('Hi ', mentionOfMe, ', can you look?')
    expect(adfMentions(doc)).toEqual([ME.accountId])
    expect(adfText(doc)).toBe('Hi @Casey Jones, can you look?')
    expect(
      cleanMarkdown(
        'Hi <custom data-type="mention" data-id="id-0">@Sam Bolin</custom> ![](blob:https://x/y)',
      ),
    ).toBe('Hi @Sam Bolin [image]')
  })

  it('says who assigned an issue, unless it was the user themselves', () => {
    const assigned = (author: unknown, created = DAYS_AGO(2)) => ({
      key: 'ISD-1',
      fields: { summary: 'Printer', assignee: SELF },
      changelog: {
        histories: [
          { id: '9', author: MARK, created: DAYS_AGO(1), items: [{ field: 'status', to: '3' }] },
          { id: '7', author, created, items: [{ field: 'assignee', to: ME.accountId }] },
        ],
      },
    })
    expect(assignedNotification(assigned(SAM), ME, SINCE)).toEqual({
      id: 'assigned:ISD-1:7',
      kind: 'assigned',
      key: 'ISD-1',
      summary: 'Printer',
      by: 'Sam Bolin',
      at: DAYS_AGO(2),
    })
    expect(assignedNotification(assigned(SELF), ME, SINCE)).toBeNull()
    expect(assignedNotification(assigned(SAM, DAYS_AGO(20)), ME, SINCE)).toBeNull()
    // Created already assigned to the user: the creator assigned it.
    const created = {
      key: 'SW-2',
      fields: { summary: 'Build', assignee: SELF, creator: MARK, created: DAYS_AGO(3) },
      changelog: { histories: [] },
    }
    expect(assignedNotification(created, ME, SINCE)?.by).toBe('Mark Duong')
  })

  it("finds the comments that mention the user, by someone else, with the comment's start", () => {
    const node = {
      key: 'ISD-2',
      fields: {
        summary: 'TV flickering',
        creator: SAM,
        created: DAYS_AGO(30),
        description: adf('Old description for ', mentionOfMe),
        comment: {
          comments: [
            {
              id: '1',
              author: SAM,
              created: DAYS_AGO(3),
              body: adf(mentionOfMe, ' new TV ordered'),
            },
            {
              id: '2',
              author: SELF,
              created: DAYS_AGO(2),
              body: adf(mentionOfMe, ' note to self'),
            },
            { id: '3', author: MARK, created: DAYS_AGO(1), body: adf('no mention here') },
            { id: '4', author: MARK, created: DAYS_AGO(40), body: adf(mentionOfMe, ' too old') },
          ],
        },
      },
    }
    expect(mentionNotifications(node, ME, SINCE)).toEqual([
      {
        id: 'mentioned:ISD-2:1',
        kind: 'mentioned',
        key: 'ISD-2',
        summary: 'TV flickering',
        by: 'Sam Bolin',
        at: DAYS_AGO(3),
        excerpt: '@Casey Jones new TV ordered',
      },
    ])
  })

  it("takes a request's latest reply from a person, not the user or an automatic one", () => {
    const info = requestInfoOf(
      {
        key: 'ISD-3',
        fields: {
          summary: 'Laptop',
          status: { name: 'Waiting for support', statusCategory: { key: 'indeterminate' } },
          updated: DAYS_AGO(1),
          comment: {
            comments: [
              { id: '1', author: BOT, created: DAYS_AGO(5), body: 'Thanks for raising it' },
              { id: '2', author: MARK, created: DAYS_AGO(3), body: 'On it' },
              { id: '3', author: SELF, created: DAYS_AGO(2), body: 'Thanks' },
            ],
          },
        },
      },
      ME,
    )
    expect(info?.reply).toEqual({ id: '2', author: 'Mark Duong' })
    expect(info?.status).toEqual({ name: 'Waiting for support', category: 'indeterminate' })
  })

  it("reads Confluence's search results as plain text, only on the company's site", () => {
    const pages = confluencePagesOf(
      json({
        content: {
          nodes: [
            {
              id: '45',
              title: 'AWS VPN Client',
              summary: 'Download AWS @@@hl@@@VPN@@@endhl@@@ client &amp; connect',
              space: { key: 'INFRA', name: 'Information Technology' },
              _links: { webui: '/spaces/it/pages/45/AWS+VPN+Client' },
            },
            { id: '46', title: 'Elsewhere', webUrl: 'https://evil.example/wiki/46' },
          ],
        },
      }),
      SITE,
    )
    expect(pages).toEqual([
      {
        id: '45',
        title: 'AWS VPN Client',
        excerpt: 'Download AWS VPN client & connect',
        space: 'Information Technology',
        url: 'https://example.atlassian.net/wiki/spaces/it/pages/45/AWS+VPN+Client',
      },
    ])
    expect(plainSnippet('a &lt;b&gt; &#39;c&#39;')).toBe("a <b> 'c'")
  })

  it('reads the user and the cloud ID of the configured site', () => {
    expect(userOf(json({ account_id: 'abc', name: 'Casey', email: 'c@x' }))).toEqual({
      accountId: 'abc',
      name: 'Casey',
      email: 'c@x',
    })
    const sites = json([
      { id: 'other', url: 'https://other.atlassian.net' },
      { id: 'cloud-1', url: 'https://example.atlassian.net' },
    ])
    expect(cloudIdOf(sites, SITE)).toBe('cloud-1')
    expect(cloudIdOf(json([]), SITE)).toBeNull()
  })

  it('keeps the prompt to Claude under the limit, dropping the oldest comments first', () => {
    const issue: IssueDetail = {
      key: 'ISD-4',
      summary: 'VPN drops',
      status: { name: 'Open', category: 'new' },
      type: 'Incident',
      url: `${SITE}/browse/ISD-4`,
      assignee: null,
      reporter: 'Sam Bolin',
      created: DAYS_AGO(3),
      updated: DAYS_AGO(1),
      description: 'It drops every hour.',
      comments: [
        { id: '1', author: 'Mark', created: DAYS_AGO(2), body: 'x'.repeat(500) },
        { id: '2', author: 'Sam', created: DAYS_AGO(1), body: 'Still happening' },
      ],
      portalUrl: null,
      transitions: [],
    }
    const full = issuePrompt(issue, 'summarise', 12_000)
    expect(full).toMatch(/^Summarise this Jira issue/)
    expect(full).toContain('ISD-4: VPN drops\nStatus: Open · Type: Incident · Assignee: Unassigned')
    expect(full).toContain('Sam (2026-10-11):\nStill happening')
    const short = issuePrompt(issue, 'reply', 400)
    expect(short.length).toBeLessThanOrEqual(400)
    expect(short).toContain('Still happening')
    expect(short).not.toContain('xxxxx')
  })
})

// ---------------------------------------------------------------------------------- the service

interface World {
  signedIn: boolean
  calls: { name: string; args: Record<string, unknown> }[]
  browser: string[]
  saved: string | null
  memory: AtlassianMemory
  states: AtlassianState['status'][]
  feeds: JiraFeed[]
  notified: { title: string; body: string }[]
  /** Comments on ISD-10, the user's request. */
  requestComments: unknown[]
  requestStatus: string
}

/** Atlassian with a user, an issue Sam assigned them, a mention by Mark, and one IT request. */
function fakeAtlassian() {
  const world: World = {
    signedIn: false,
    calls: [],
    browser: [],
    saved: null,
    memory: {},
    states: [],
    feeds: [],
    notified: [],
    requestComments: [{ id: '50', author: BOT, created: DAYS_AGO(2), body: 'Thanks!' }],
    requestStatus: 'Open',
  }
  const issue = (key: string, fields: Record<string, unknown>, extra = {}) => ({
    key,
    fields: { summary: `Summary of ${key}`, ...fields },
    ...extra,
  })
  const answer = (name: string, args: Record<string, unknown>) => {
    switch (name) {
      case TOOLS.user:
        return json({ account_id: ME.accountId, name: ME.name, email: 'casey@example.com' })
      case TOOLS.sites:
        return json([{ id: 'cloud-1', url: SITE }])
      case TOOLS.searchJira: {
        const jql = String(args['jql'])
        if (jql.startsWith('assignee = currentUser()')) {
          return json({
            issues: {
              nodes: [
                issue('SW-1', { updated: DAYS_AGO(1) }),
                issue('SW-2', { updated: DAYS_AGO(1) }),
              ],
            },
          })
        }
        if (jql.startsWith('(comment ~ currentUser()')) {
          return json({
            issues: {
              nodes: [
                issue('SW-3', {
                  updated: DAYS_AGO(1),
                  comment: {
                    comments: [
                      {
                        id: '31',
                        author: MARK,
                        created: DAYS_AGO(1),
                        body: adf(mentionOfMe, ' please review'),
                      },
                    ],
                  },
                }),
              ],
            },
          })
        }
        if (jql.startsWith('project = "ISD"')) {
          return json({
            issues: {
              nodes: [
                issue('ISD-10', {
                  status: { name: world.requestStatus, statusCategory: { key: 'new' } },
                  updated: DAYS_AGO(1),
                  comment: { comments: world.requestComments },
                }),
              ],
            },
          })
        }
        if (jql.startsWith('text ~')) {
          return json({ issues: { nodes: [issue('SW-9', { status: { name: 'Done' } })] } })
        }
        return json({ issues: { nodes: [] } })
      }
      case TOOLS.issue: {
        const key = String(args['issueIdOrKey'])
        if (args['expand'] === 'changelog') {
          const author = key === 'SW-1' ? SAM : SELF // SW-2 the user took themselves
          return json({
            issues: {
              nodes: [
                issue(
                  key,
                  { assignee: SELF },
                  {
                    changelog: {
                      histories: [
                        {
                          id: `h-${key}`,
                          author,
                          created: DAYS_AGO(1),
                          items: [{ field: 'assignee', to: ME.accountId }],
                        },
                      ],
                    },
                  },
                ),
              ],
            },
          })
        }
        if (key === 'NOPE-1') return json({ issues: { nodes: [] } })
        return json({
          issues: {
            nodes: [
              issue(
                key,
                {
                  status: { name: 'Open', statusCategory: { key: 'new' } },
                  issuetype: { name: 'Task' },
                  assignee: SELF,
                  reporter: SAM,
                  created: DAYS_AGO(3),
                  updated: DAYS_AGO(1),
                  description: 'The **printer** is jammed',
                },
                {
                  comments: [{ id: '1', author: SAM, created: DAYS_AGO(2), body: 'Any news?' }],
                },
              ),
            ],
          },
        })
      }
      case TOOLS.transitions:
        return json({
          transitions: [
            { id: '21', name: 'Start progress' },
            { id: '31', name: 'Done' },
          ],
        })
      case TOOLS.searchConfluence:
        return json({
          content: {
            nodes: [
              {
                id: '7',
                title: 'Printer guide',
                summary: 'Clear a jam',
                webUrl: `${SITE}/wiki/spaces/it/pages/7`,
              },
            ],
          },
        })
      case TOOLS.projects:
        return json({ values: [{ key: 'ISD' }, { key: 'SW' }], isLast: true })
      default:
        return json({ ok: true })
    }
  }
  const session: McpSession = {
    listTools: async () => [],
    callTool: async (name, args) => {
      world.calls.push({ name, args })
      if (!world.signedIn) throw new NeedsSignInError()
      return answer(name, args)
    },
    close: async () => {},
  }
  const connector: McpConnector = {
    connect: async () => {
      if (!world.signedIn) throw new NeedsSignInError()
      return session
    },
    authorize: async (provider, code) => {
      if (!code) {
        await provider.saveClientInformation?.({ client_id: 'registered' })
        await provider.redirectToAuthorization(
          new URL(`https://mcp.example/authorize?state=${await provider.state?.()}`),
        )
        return 'REDIRECT'
      }
      await provider.saveTokens({ access_token: 'secret', token_type: 'bearer' })
      world.signedIn = true
      return 'AUTHORIZED'
    },
  }
  let backTo: (url: string) => void = () => {}
  const listener = (): RedirectListener => {
    let resolve: (url: string) => void = () => {}
    let reject: (error: Error) => void = () => {}
    const result = new Promise<string>((res, rej) => ((resolve = res), (reject = rej)))
    result.catch(() => {})
    backTo = resolve
    return {
      redirectUri: 'http://127.0.0.1:47623/callback',
      result,
      close: () => reject(new SignInCancelledError()),
    }
  }
  const atlassian = new Atlassian({
    appName: 'Desktop Assist',
    site: SITE,
    redirectPort: 47623,
    knowledgeSpaces: ['INFRA'],
    requests: {
      helpCentre: `${SITE}/servicedesk/customer/portals`,
      portalId: '1',
      projectKey: 'ISD',
    },
    connector,
    store: {
      load: async () => world.saved,
      save: async (secret) => void (world.saved = secret),
      clear: async () => void (world.saved = null),
    },
    memory: {
      load: async () => structuredClone(world.memory),
      save: async (memory) => void (world.memory = structuredClone(memory)),
    },
    listen: async () => listener(),
    openBrowser: async (url) => {
      world.browser.push(url)
      const state = new URL(url).searchParams.get('state')
      setTimeout(() => backTo(`http://127.0.0.1:47623/callback?code=abc&state=${state}`), 0)
    },
    onState: (state) => world.states.push(state.status),
    onFeed: (feed) => world.feeds.push(feed),
    notify: (message) => world.notified.push(message),
    now: () => NOW,
    feedIntervalMs: 60 * 60_000,
  })
  return { atlassian, world }
}

/** Connects and waits for the first check of notifications and requests. */
async function connected() {
  const fake = fakeAtlassian()
  await fake.atlassian.signIn()
  await vi.waitFor(() => expect(fake.atlassian.currentFeed.requests.status).toBe('ready'))
  return fake
}

describe('Atlassian', () => {
  it('asks to connect when nobody has yet, without opening the browser', async () => {
    const { atlassian, world } = fakeAtlassian()
    expect(await atlassian.init()).toEqual({ status: 'sign-in' })
    expect(world.browser).toEqual([])
    atlassian.dispose()
  })

  it('connects in the browser, then shows who assigned or mentioned the user', async () => {
    const { atlassian, world } = await connected()
    expect(world.browser[0]).toMatch(/^https:\/\/mcp\.example\/authorize\?state=/)
    expect(atlassian.current).toEqual({
      status: 'connected',
      user: { name: ME.name, email: 'casey@example.com' },
    })
    // Every Jira call names the site.
    expect(world.calls.find((c) => c.name === TOOLS.searchJira)?.args['cloudId']).toBe('cloud-1')
    expect(atlassian.currentFeed.notifications).toEqual({
      status: 'ready',
      items: [
        expect.objectContaining({ kind: 'assigned', key: 'SW-1', by: 'Sam Bolin', unread: true }),
        expect.objectContaining({
          kind: 'mentioned',
          key: 'SW-3',
          by: 'Mark Duong',
          excerpt: '@Casey Jones please review',
          unread: true,
        }),
      ],
    })
    atlassian.dispose()
  })

  it("remembers which notifications have been seen, and doesn't ask about unchanged issues again", async () => {
    const { atlassian, world } = await connected()
    const feed = await atlassian.markNotificationsRead()
    expect(feed.notifications.items.every((n) => !n.unread)).toBe(true)
    expect(world.memory.notificationsReadAt).toBe(DAYS_AGO(1))
    const histories = () => world.calls.filter((c) => c.args['expand'] === 'changelog').length
    expect(histories()).toBe(2)
    await atlassian.feed(true)
    expect(histories()).toBe(2)
    expect(atlassian.currentFeed.notifications.items.every((n) => !n.unread)).toBe(true)
    atlassian.dispose()
  })

  it('tells the user when IT replies to their request, once, until they look', async () => {
    const { atlassian, world } = await connected()
    const request = () => atlassian.currentFeed.requests.items[0]
    expect(request()).toMatchObject({
      key: 'ISD-10',
      news: null,
      url: `${SITE}/servicedesk/customer/portal/1/ISD-10`,
    })
    world.requestComments = [
      ...world.requestComments,
      { id: '51', author: MARK, created: DAYS_AGO(0), body: 'Fixed, please check' },
    ]
    await atlassian.feed(true)
    expect(request()?.news).toBe('Mark Duong replied')
    expect(world.notified).toEqual([
      { title: 'ISD-10: Mark Duong replied', body: 'Summary of ISD-10' },
    ])
    await atlassian.feed(true)
    expect(world.notified).toHaveLength(1)
    world.requestStatus = 'Resolved'
    await atlassian.feed(true)
    expect(request()?.news).toBe('Now Resolved · Mark Duong replied')
    expect(world.notified.at(-1)?.title).toBe('ISD-10: Now Resolved')
    await atlassian.markRequestsRead('ISD-10')
    expect(request()?.news).toBeNull()
    expect(world.memory.requests?.['ISD-10']).toEqual({
      seen: 'Resolved|51',
      notified: 'Resolved|51',
    })
    atlassian.dispose()
  })

  it('opens an issue with its comments, the statuses it can move to, and its portal page', async () => {
    const { atlassian } = await connected()
    const result = await atlassian.issue('ISD-10')
    expect(result.ok && result.issue).toMatchObject({
      key: 'ISD-10',
      status: { name: 'Open', category: 'new' },
      assignee: ME.name,
      reporter: 'Sam Bolin',
      description: 'The **printer** is jammed',
      comments: [{ id: '1', author: 'Sam Bolin', body: 'Any news?' }],
      transitions: [
        { id: '21', name: 'Start progress' },
        { id: '31', name: 'Done' },
      ],
      portalUrl: `${SITE}/servicedesk/customer/portal/1/ISD-10`,
      url: `${SITE}/browse/ISD-10`,
    })
    const other = await atlassian.issue('SW-1')
    expect(other.ok && other.issue.portalUrl).toBeNull()
    expect(await atlassian.issue('NOPE-1')).toEqual({ ok: false, message: "Couldn't find NOPE-1." })
    atlassian.dispose()
  })

  it('moves, comments on and logs time on an issue, answering with the issue', async () => {
    const { atlassian, world } = await connected()
    expect((await atlassian.transition('SW-1', '21')).ok).toBe(true)
    expect((await atlassian.comment('SW-1', 'Done it')).ok).toBe(true)
    expect((await atlassian.logWork('SW-1', '1h 30m')).ok).toBe(true)
    const writes = world.calls.filter((c) =>
      [TOOLS.transition, TOOLS.comment, TOOLS.worklog].includes(c.name as never),
    )
    expect(writes.map((c) => c.args)).toEqual([
      { cloudId: 'cloud-1', issueIdOrKey: 'SW-1', transition: { id: '21' } },
      {
        cloudId: 'cloud-1',
        issueIdOrKey: 'SW-1',
        commentBody: 'Done it',
        contentFormat: 'markdown',
      },
      { cloudId: 'cloud-1', issueIdOrKey: 'SW-1', timeSpent: '1h 30m' },
    ])
    atlassian.dispose()
  })

  it('searches Jira and Confluence, and finds an issue by its key', async () => {
    const { atlassian, world } = await connected()
    const result = await atlassian.search('printer jam')
    expect(result).toMatchObject({
      ok: true,
      issues: [{ key: 'SW-9', summary: 'Summary of SW-9' }],
      pages: [{ id: '7', title: 'Printer guide' }],
    })
    const byKey = await atlassian.search('isd-10')
    expect(byKey.ok && byKey.issues.map((i) => i.key)).toEqual(['ISD-10'])
    // Suggested articles come from the knowledge spaces only.
    expect((await atlassian.articles('printer jammed')).map((p) => p.title)).toEqual([
      'Printer guide',
    ])
    expect(world.calls.at(-1)?.args['cql']).toContain('space in ("INFRA")')
    expect(await atlassian.projectKeys()).toEqual(['ISD', 'SW'])
    atlassian.dispose()
  })

  it('asks Claude about an issue with its details in the prompt', async () => {
    const { atlassian } = await connected()
    const result = await atlassian.prompt('SW-1', 'next-steps', 12_000)
    expect(result.ok && result.prompt).toMatch(/^Suggest the next steps/)
    expect(result.ok && result.prompt).toContain('SW-1: Summary of SW-1')
    expect(result.ok && result.prompt).toContain('Sam Bolin (2026-10-10):\nAny news?')
    atlassian.dispose()
  })

  it('goes back to Connect when the connection ends, and forgets it on disconnect', async () => {
    const { atlassian, world } = await connected()
    world.signedIn = false
    expect(await atlassian.issue('SW-1')).toEqual({
      ok: false,
      message: 'Connect to Atlassian first.',
    })
    expect(atlassian.current).toEqual({
      status: 'sign-in',
      message: 'Your Atlassian connection has ended. Connect again.',
    })
    world.signedIn = true
    await atlassian.signIn()
    expect(atlassian.current.status).toBe('connected')
    await atlassian.signOut()
    expect(atlassian.current).toEqual({ status: 'sign-in' })
    expect(world.saved).toBeNull()
    atlassian.dispose()
  })
})
