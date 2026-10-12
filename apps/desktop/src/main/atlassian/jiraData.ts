// Reading Atlassian's answers and writing what's sent to it. Atlassian's Remote MCP server wraps
// Jira's and Confluence's REST APIs and passes their fields through, so these readers follow those
// APIs, look for the usual names and ignore what they don't know. Everything here is pure.

import type {
  ConfluencePage,
  IssueComment,
  IssueDetail,
  IssuePrompt,
  IssueStatus,
  IssueSummary,
  IssueTransition,
  JiraNotification,
  StatusCategory,
} from '@shared/types'
import { browseUrl, isIssueKey } from '@shared/jira'
import { httpsUrl } from '../apps/portalData'
import { payloadOf, type ToolResult } from '../mcp/toolResult'

type Item = Record<string, unknown>

const isObject = (value: unknown): value is Item =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const items = (value: unknown): Item[] => (Array.isArray(value) ? value.filter(isObject) : [])

const field = (value: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((at, key) => (isObject(at) ? at[key] : undefined), value)

/** How far back the Notifications tab looks. */
export const NOTIFICATION_DAYS = 14

/** Atlassian's own accounts (Automation for Jira and other apps) have IDs starting with this. */
const APP_ACCOUNT = '557058:'

const isPerson = (accountId: string | null): boolean =>
  accountId !== null && !accountId.startsWith(APP_ACCOUNT)

// ---------------------------------------------------------------------------------------- queries

/**
 * The words of a search, safe inside a quoted JQL or CQL string: the characters Jira's and
 * Confluence's text search treat as operators are dropped.
 */
export function searchWords(query: string): string {
  return query
    .replace(/[+\-&|!(){}[\]^~*?\\:"/<>=;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

/** Issues assigned to the user lately, by someone else or by themselves (sorted out later). */
export const ASSIGNED_JQL =
  `assignee = currentUser() AND (assignee CHANGED TO currentUser() AFTER -${NOTIFICATION_DAYS}d` +
  ` OR created >= -${NOTIFICATION_DAYS}d) ORDER BY updated DESC`

/**
 * Issues that may mention the user: Jira's text search finds mentions of currentUser() in
 * comments and descriptions. The comments themselves show who mentioned them, and when.
 */
export const MENTIONED_JQL =
  `(comment ~ currentUser() OR description ~ currentUser()) AND updated >= -${NOTIFICATION_DAYS}d` +
  ` ORDER BY updated DESC`

/** The user's requests on the service desk: the open ones, and those closed this month. */
export function myRequestsJql(projectKey: string): string {
  return (
    `project = "${projectKey}" AND reporter = currentUser()` +
    ` AND (statusCategory != Done OR updated >= -30d) ORDER BY updated DESC`
  )
}

export function textSearchJql(query: string): string {
  return `text ~ "${searchWords(query)}" ORDER BY updated DESC`
}

/** Confluence pages and blog posts, ranked like Confluence's own search; only `spaces` if given. */
export function confluenceCql(query: string, spaces: string[] = []): string {
  const inSpaces = spaces.length ? ` AND space in (${spaces.map((s) => `"${s}"`).join(', ')})` : ''
  return `siteSearch ~ "${searchWords(query)}" AND type in (page, blogpost)${inSpaces}`
}

// ---------------------------------------------------------------------------------------- reading

/** The issues in a search or issue answer (Atlassian's `issues.nodes`, or Jira's `issues`). */
export function issueNodes(result: ToolResult): Item[] {
  const payload = payloadOf(result)
  const issues = field(payload, 'issues')
  if (Array.isArray(issues)) return items(issues)
  const nodes = field(issues, 'nodes') ?? field(payload, 'nodes')
  if (Array.isArray(nodes)) return items(nodes)
  return isObject(payload) && text(payload['key']) ? [payload] : []
}

const CATEGORIES: StatusCategory[] = ['new', 'indeterminate', 'done']

export function statusOf(fields: unknown): IssueStatus {
  const status = field(fields, 'status')
  const category = text(field(status, 'statusCategory', 'key'))
  return {
    name: text(field(status, 'name')) ?? 'Unknown',
    category: CATEGORIES.find((c) => c === category) ?? 'indeterminate',
  }
}

const nameOf = (user: unknown): string | null => text(field(user, 'displayName'))
const accountOf = (user: unknown): string | null => text(field(user, 'accountId'))

export function issueSummaryOf(node: Item, site: string): IssueSummary | null {
  const key = text(node['key'])
  if (!key || !isIssueKey(key)) return null
  const fields = node['fields']
  return {
    key,
    summary: text(field(fields, 'summary')) ?? '(no summary)',
    status: statusOf(fields),
    type: text(field(fields, 'issuetype', 'name')),
    url: browseUrl(site, key),
  }
}

export function issueSummaries(result: ToolResult, site: string): IssueSummary[] {
  return issueNodes(result)
    .map((node) => issueSummaryOf(node, site))
    .filter((issue): issue is IssueSummary => issue !== null)
}

// ------------------------------------------------------------------ Atlassian Document Format

/** The account IDs mentioned in an ADF document (a comment or description in Jira's own format). */
export function adfMentions(doc: unknown): string[] {
  const found: string[] = []
  const walk = (node: unknown, depth: number) => {
    if (depth > 30 || !isObject(node)) return
    if (node['type'] === 'mention') {
      const id = text(field(node, 'attrs', 'id'))
      if (id) found.push(id)
    }
    for (const child of items(node['content'])) walk(child, depth + 1)
  }
  walk(doc, 0)
  return found
}

const BLOCKS = new Set(['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock', 'rule'])

/** An ADF document as plain text (mentions as "@Name"). */
export function adfText(doc: unknown): string {
  const parts: string[] = []
  const walk = (node: unknown, depth: number) => {
    if (depth > 30 || !isObject(node)) return
    const type = node['type']
    if (type === 'text') parts.push(typeof node['text'] === 'string' ? node['text'] : '')
    else if (type === 'mention' || type === 'emoji')
      parts.push(text(field(node, 'attrs', 'text')) ?? '')
    else if (type === 'hardBreak') parts.push('\n')
    else if (type === 'inlineCard') parts.push(text(field(node, 'attrs', 'url')) ?? '')
    for (const child of items(node['content'])) walk(child, depth + 1)
    if (typeof type === 'string' && BLOCKS.has(type)) parts.push('\n')
  }
  walk(doc, 0)
  return parts
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Markdown from Atlassian, tidied for showing and for Claude: its mention and emoji tags become
 * their text, and pasted images (which only open inside Jira) become "[image]".
 */
export function cleanMarkdown(markdown: string): string {
  return markdown
    .replace(/<custom data-type="[a-z]+"[^>]*>([^<]*)<\/custom>/g, '$1')
    .replace(/!\[[^\]]*\]\(blob:[^)]*\)/g, '[image]')
    .replace(/‌/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** A comment or description (ADF or Markdown) as text. */
function bodyText(body: unknown): string {
  if (typeof body === 'string') return cleanMarkdown(body)
  return adfText(body)
}

/** Whether a comment or description mentions the user. */
export function mentionsUser(body: unknown, user: { accountId: string; name: string }): boolean {
  if (typeof body === 'string') return body.includes(`>@${user.name}</custom>`)
  return adfMentions(body).includes(user.accountId)
}

/** The start of a text, on one line. */
export function excerpt(value: string, length = 140): string {
  const line = value.replace(/\s+/g, ' ').trim()
  return line.length > length ? `${line.slice(0, length - 1).trimEnd()}…` : line
}

// -------------------------------------------------------------------------------- notifications

export type FoundNotification = Omit<JiraNotification, 'unread'>

const time = (value: unknown): number => {
  const parsed = Date.parse(typeof value === 'string' ? value : '')
  return Number.isNaN(parsed) ? 0 : parsed
}

const iso = (value: unknown): string => new Date(time(value)).toISOString()

/**
 * Who assigned the user this issue, from its change history: the latest change of assignee to
 * them. Null if they assigned it to themselves, it was longer ago than `since`, or it isn't
 * theirs. An issue created already assigned has no such change; its creator assigned it.
 */
export function assignedNotification(
  node: Item,
  me: { accountId: string },
  since: number,
): FoundNotification | null {
  const key = text(node['key'])
  if (!key) return null
  const fields = node['fields']
  const summary = text(field(fields, 'summary')) ?? '(no summary)'
  const histories = items(field(node, 'changelog', 'histories')).sort(
    (a, b) => time(b['created']) - time(a['created']),
  )
  const change = histories.find((history) =>
    items(history['items']).some(
      (item) =>
        item['field'] === 'assignee' &&
        (item['to'] === me.accountId || item['tmpToAccountId'] === me.accountId),
    ),
  )
  if (change) {
    const by = change['author']
    if (accountOf(by) === me.accountId || time(change['created']) < since) return null
    return {
      id: `assigned:${key}:${text(change['id']) ?? time(change['created'])}`,
      kind: 'assigned',
      key,
      summary,
      by: nameOf(by) ?? 'Someone',
      at: iso(change['created']),
    }
  }
  const creator = field(fields, 'creator')
  const created = field(fields, 'created')
  if (accountOf(field(fields, 'assignee')) !== me.accountId) return null
  if (!creator || accountOf(creator) === me.accountId || time(created) < since) return null
  return {
    id: `assigned:${key}:created`,
    kind: 'assigned',
    key,
    summary,
    by: nameOf(creator) ?? 'Someone',
    at: iso(created),
  }
}

/** The comments (and the description) of an issue that mention the user, by someone else. */
export function mentionNotifications(
  node: Item,
  me: { accountId: string; name: string },
  since: number,
): FoundNotification[] {
  const key = text(node['key'])
  if (!key) return []
  const fields = node['fields']
  const summary = text(field(fields, 'summary')) ?? '(no summary)'
  const found: FoundNotification[] = []
  for (const comment of items(field(fields, 'comment', 'comments'))) {
    const author = comment['author']
    if (accountOf(author) === me.accountId || time(comment['created']) < since) continue
    if (!mentionsUser(comment['body'], me)) continue
    found.push({
      id: `mentioned:${key}:${text(comment['id']) ?? time(comment['created'])}`,
      kind: 'mentioned',
      key,
      summary,
      by: nameOf(author) ?? 'Someone',
      at: iso(comment['created']),
      excerpt: excerpt(bodyText(comment['body'])),
    })
  }
  const creator = field(fields, 'creator')
  const description = field(fields, 'description')
  if (
    description &&
    accountOf(creator) !== me.accountId &&
    time(field(fields, 'created')) >= since &&
    mentionsUser(description, me)
  ) {
    found.push({
      id: `mentioned:${key}:description`,
      kind: 'mentioned',
      key,
      summary,
      by: nameOf(creator) ?? 'Someone',
      at: iso(field(fields, 'created')),
      excerpt: excerpt(bodyText(description)),
    })
  }
  return found
}

// --------------------------------------------------------------------------- service requests

/** One of the user's requests, with what's needed to tell when IT has done something new. */
export interface RequestInfo {
  key: string
  summary: string
  status: IssueStatus
  updated: string
  /** The latest comment by someone else (not the user, not an app), or null. */
  reply: { id: string; author: string } | null
}

export function requestInfoOf(node: Item, me: { accountId: string }): RequestInfo | null {
  const key = text(node['key'])
  if (!key) return null
  const fields = node['fields']
  const replies = items(field(fields, 'comment', 'comments'))
    .filter((comment) => {
      const author = accountOf(comment['author'])
      return author !== me.accountId && isPerson(author)
    })
    .sort((a, b) => time(a['created']) - time(b['created']))
  const last = replies.at(-1)
  return {
    key,
    summary: text(field(fields, 'summary')) ?? '(no summary)',
    status: statusOf(fields),
    updated: iso(field(fields, 'updated')),
    reply: last
      ? {
          id: text(last['id']) ?? String(time(last['created'])),
          author: nameOf(last['author']) ?? 'IT',
        }
      : null,
  }
}

/** A request on the help centre portal. */
export function portalRequestUrl(helpCentre: string, portalId: string, key: string): string {
  return `${new URL(helpCentre).origin}/servicedesk/customer/portal/${portalId}/${key}`
}

// ------------------------------------------------------------------------------- issue details

/** The longest description shown (and given to Claude). */
const MAX_DESCRIPTION = 4000
/** How many of the latest comments are shown. */
const MAX_COMMENTS = 10

export function issueDetailOf(
  node: Item,
  site: string,
  options: { transitions: IssueTransition[]; portalUrl: string | null },
): IssueDetail | null {
  const summary = issueSummaryOf(node, site)
  if (!summary) return null
  const fields = node['fields']
  const description = bodyText(field(fields, 'description') ?? '')
  // Atlassian adds the comments as Markdown beside Jira's own (ADF) ones; either will do.
  const markdownComments = items(node['comments'])
  const comments = (
    markdownComments.length ? markdownComments : items(field(fields, 'comment', 'comments'))
  )
    .map((comment): IssueComment => ({
      id: text(comment['id']) ?? String(time(comment['created'])),
      author: nameOf(comment['author']) ?? 'Someone',
      created: iso(comment['created']),
      body: bodyText(comment['body']),
    }))
    .sort((a, b) => time(a.created) - time(b.created))
    .slice(-MAX_COMMENTS)
  return {
    ...summary,
    assignee: nameOf(field(fields, 'assignee')),
    reporter: nameOf(field(fields, 'reporter')),
    created: iso(field(fields, 'created')),
    updated: iso(field(fields, 'updated')),
    description:
      description.length > MAX_DESCRIPTION
        ? `${description.slice(0, MAX_DESCRIPTION).trimEnd()}\n\n…`
        : description,
    comments,
    portalUrl: options.portalUrl,
    transitions: options.transitions,
  }
}

export function transitionsOf(result: ToolResult): IssueTransition[] {
  const payload = payloadOf(result)
  const list = Array.isArray(payload) ? payload : field(payload, 'transitions')
  return items(list)
    .map((t) => ({ id: text(t['id']) ?? '', name: text(t['name']) ?? '' }))
    .filter((t) => t.id && t.name)
}

// ---------------------------------------------------------------------------------- confluence

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** Confluence's highlighted, HTML-escaped snippets as plain text. */
export function plainSnippet(value: string): string {
  return value
    .replace(/@@@(end)?hl@@@/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|[a-z]+);/g, (whole, name: string) =>
      name.startsWith('#') ? String.fromCharCode(Number(name.slice(1))) : (ENTITIES[name] ?? whole),
    )
    .replace(/\s+/g, ' ')
    .trim()
}

export function confluencePagesOf(result: ToolResult, site: string): ConfluencePage[] {
  const payload = payloadOf(result)
  const list =
    field(payload, 'content', 'nodes') ?? field(payload, 'results') ?? field(payload, 'nodes')
  const origin = new URL(site).origin
  const pages: ConfluencePage[] = []
  for (const page of items(Array.isArray(payload) ? payload : list)) {
    const content = isObject(page['content']) ? page['content'] : page
    const id = text(content['id'])
    const title = text(content['title']) ?? text(page['title'])
    const webui = text(field(content, '_links', 'webui')) ?? text(field(page, 'url'))
    const url =
      httpsUrl(page['webUrl']) ??
      httpsUrl(content['webUrl']) ??
      (webui?.startsWith('/') ? `${origin}/wiki${webui}` : null)
    if (!id || !title || !url || !url.startsWith(origin)) continue
    pages.push({
      id,
      title: plainSnippet(title),
      excerpt: excerpt(plainSnippet(text(page['summary']) ?? text(page['excerpt']) ?? ''), 160),
      space:
        text(field(content, 'space', 'name')) ??
        text(field(page, 'resultGlobalContainer', 'title')),
      url,
    })
  }
  return pages
}

// ------------------------------------------------------------------------------------- the user

export interface AtlassianUser {
  accountId: string
  name: string
  email?: string
}

export function userOf(result: ToolResult): AtlassianUser | null {
  const payload = payloadOf(result)
  const accountId = text(field(payload, 'account_id')) ?? text(field(payload, 'accountId'))
  const name =
    text(field(payload, 'name')) ??
    text(field(payload, 'displayName')) ??
    text(field(payload, 'nickname'))
  if (!accountId || !name) return null
  const email = text(field(payload, 'email')) ?? text(field(payload, 'emailAddress'))
  return email ? { accountId, name, email } : { accountId, name }
}

/** The site's cloud ID from the list of sites the user can reach; null if it isn't there. */
export function cloudIdOf(result: ToolResult, site: string): string | null {
  const payload = payloadOf(result)
  const host = new URL(site).host
  for (const resource of items(Array.isArray(payload) ? payload : field(payload, 'resources'))) {
    const url = text(resource['url'])
    try {
      if (url && new URL(url).host === host) return text(resource['id'])
    } catch {
      // not a URL: skip it
    }
  }
  return null
}

// ------------------------------------------------------------------------------- asking Claude

const INSTRUCTIONS: Record<IssuePrompt, string> = {
  summarise:
    "Summarise this Jira issue for me: what it's about, where it's up to, and anything that's waiting on me.",
  reply:
    "Draft a reply I could post as a comment on this Jira issue. Keep it short, friendly and professional, and don't promise anything the issue doesn't support.",
  'next-steps': 'Suggest the next steps to move this Jira issue forward, most important first.',
}

const day = (value: string): string => value.slice(0, 10)

/**
 * What to ask Claude about an issue: the request, then the issue itself. Kept under `max`
 * characters (Claude Desktop's limit for a linked prompt) by leaving out the oldest comments
 * first, then shortening the description.
 */
export function issuePrompt(issue: IssueDetail, kind: IssuePrompt, max: number): string {
  const meta = [
    `Status: ${issue.status.name}`,
    issue.type && `Type: ${issue.type}`,
    `Assignee: ${issue.assignee ?? 'Unassigned'}`,
    issue.reporter && `Reporter: ${issue.reporter}`,
  ].filter(Boolean)
  const head = [
    INSTRUCTIONS[kind],
    '',
    `${issue.key}: ${issue.summary}`,
    meta.join(' · '),
    issue.url,
  ].join('\n')
  const comments = issue.comments.map(
    (c) => `${c.author} (${day(c.created)}):\n${c.body.trim() || '(no text)'}`,
  )
  let description = issue.description.trim() || '(no description)'
  const build = () =>
    [
      head,
      '',
      'Description:',
      description,
      ...(comments.length ? ['', 'Comments, oldest first:', comments.join('\n\n')] : []),
    ].join('\n')
  let prompt = build()
  while (prompt.length > max && comments.length > 0) {
    comments.shift()
    prompt = build()
  }
  if (prompt.length > max) {
    description = `${description.slice(0, Math.max(0, description.length - (prompt.length - max) - 2))}…`
    prompt = build()
  }
  return prompt.slice(0, max)
}
