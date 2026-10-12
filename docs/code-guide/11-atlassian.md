# Jira and the service desk

[← Code Guide](CODE_GUIDE.md)

Milestone 5 brings Jira and the IT service desk into the card beside the bubble. It all goes
through **Atlassian's Remote MCP server** (`https://mcp.atlassian.com/v1/mcp`), the MCP server
Atlassian runs for its cloud sites. Like JumpCloud's apps server ([Your apps](10-apps.md)), it
offers named tools (`searchJiraIssuesUsingJql`, `getJiraIssue`, `addCommentToJiraIssue` and so on)
and only answers a signed-in user. So each person connects Desktop Assist to Atlassian once, in
the browser: Atlassian's sign-in sends them through the company's JumpCloud single sign-on, they
agree, and the browser comes back to the app. The connecting is the same `McpAccount` code as the
Apps list's, with a file (`atlassian.bin`) and a port of its own. No token ever reaches the page.

What the user gets:

- **The Jira icon** (a bell) opens the Jira page, with two tabs. **Notifications** lists who else
  assigned the user an issue or mentioned them in the last 14 days, newest first, with a dot on
  what's new; it's checked in the background every 5 minutes, and the bell gets a dot too.
  **Search** looks through Jira and Confluence as the user types, and an issue key finds that
  issue.
- **An issue**, opened from either tab, shows its status, description and latest comments, with
  what can be done from here: **Ask Claude** to summarise it, draft a reply or suggest next steps
  (sent to Claude Desktop with the issue in the prompt), **Move** it to another status,
  **Comment**, and **Log time**.
- **The service desk icon** opens a page instead of the portal when the tenant lists its request
  types. **New request** starts from what's in the text box, offers the PC's details and IT's
  how-to articles (from the `INFRA` Confluence space at Morse Micro) while the user types, then
  opens the portal's own form in the browser, already filled in. A screenshot attached to the
  text box goes on the clipboard, ready to paste with Ctrl+V. **My requests** lists the user's
  requests, marked when IT replies or changes their status, with a Windows notification when it
  happens.
- **Issue keys** typed in the text box ("ISD-1234") get an **Open** button above it.

A tenant turns this on with `atlassian` (the site, and optionally the MCP server, the port and the
knowledge spaces) and `serviceDesk.requests` (the portal, the Jira project and the request types);
see `AtlassianSchema` and `ServiceDeskSchema` in
[Main process: startup, IPC and app plumbing](2-main-startup.md).

**How it fits together**

1. **Connecting**: at startup `index.ts` calls `Atlassian.init()`. With a saved connection it
   finds out who the user is and starts checking; otherwise the Jira page shows **Connect to
   Atlassian** → `window.assist.atlassian.signIn()` → IPC `assist:atlassian-sign-in` →
   `Atlassian.signIn()` → `McpAccount.signIn()`, which opens Atlassian's sign-in in the browser.
   Every change of state is broadcast on `assist:atlassian-state`, and `index.ts` reopens the
   panel when connecting is done.
2. **Notifications and requests**: `Atlassian.refresh()` runs right after connecting and then every
   5 minutes. It searches Jira with JQL (Jira's query language) for issues recently assigned to
   the user and issues that may mention them, reads each one's history and comments to see who
   did it (`jiraData.ts`), and checks the user's service desk requests. The result, a `JiraFeed`,
   is broadcast on `assist:jira-feed`, and `PanelView` puts dots on the icons from it. What the
   user has already seen is remembered in `atlassian.json`.
3. **Working on an issue**: clicking an issue → `PanelView.openIssue()` → `IssueView` →
   `window.assist.atlassian.issue(key)` → `Atlassian.issue()`. Moving, commenting and logging time
   each make one tool call, then answer with the issue as it is now. **Ask Claude** →
   `atlassian.ask(key, prompt)` → IPC `assist:atlassian-ask`: `Atlassian.prompt()` builds the
   question with the issue in it (`issuePrompt()`), and `ipc.ts` hands it to Claude Desktop as if
   it had been typed in the text box (see [Claude Desktop](9-claude-desktop.md)), or sends it in
   the built-in chat.
4. **A new IT request**: **Continue on the portal** → `window.assist.serviceDesk.raise()` → IPC
   `assist:service-desk-raise` → `ServiceDesk.raise()`. It copies the text box's screenshots to the
   clipboard, builds the portal's create-request address with the summary and description in it
   (`requestFormUrl()`), and opens it in the browser; the panel closes. The user checks the form,
   pastes the screenshot, and sends it on the portal, signed in as themselves. Desktop Assist never
   creates the request itself, so nothing is raised that the user hasn't seen.

The pages themselves (`JiraPage`, `IssueView`, `ServiceDeskPage`) are in
[The Jira and service desk pages](12-atlassian-pages.md), and how `PanelView` swaps them in is in
[The pages](7-renderer-pages.md).

**Reading answers defensively.** Atlassian's MCP server wraps Jira's and Confluence's own web
APIs and passes their fields through, sometimes nested differently (`issues.nodes` rather than
`issues`, say), and can give comments and descriptions either as Markdown or in Jira's own format,
ADF. So, as with the Apps list, `jiraData.ts` reads answers tolerantly: it follows those APIs'
field names, accepts the usual variations, and ignores what it doesn't know.

---

## `src/main/atlassian/jiraData.ts`: reading Atlassian's answers

Plain functions with no Electron or network in them, so `tests/atlassian.test.ts` checks them with
made-up answers. `Atlassian` uses them on what the tools return, and to write the queries it
sends. The comment at the top sums up the approach. The file is divided into parts by comment
lines such as `// ---- queries`, which show at the top of the first block of each part.

### `Item`, `isObject`, `text`, `items` and `field`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#Item,isObject,text,items,field -->

[`src/main/atlassian/jiraData.ts`, lines 20–31](../../apps/desktop/src/main/atlassian/jiraData.ts#L20-L31)

```ts
type Item = Record<string, unknown>

const isObject = (value: unknown): value is Item =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const items = (value: unknown): Item[] => (Array.isArray(value) ? value.filter(isObject) : [])

const field = (value: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((at, key) => (isObject(at) ? at[key] : undefined), value)
```

<!-- /code -->

Small helpers for poking around in data of unknown shape. `Item`, `isObject` and `text` are the
same as in `portalData.ts` ([Your apps](10-apps.md)).

- `items(value)`: the objects in a list, or an empty list if `value` isn't one, so a loop over it
  never has to check.
- `field(value, ...path)`: a value deep inside an object, or `undefined` if any step of the way is
  missing. `field(fields, 'status', 'name')` is `fields.status.name` without the risk of an error.
  `...path` collects the names into a list, and `reduce` steps through it one name at a time.

### `NOTIFICATION_DAYS`, `APP_ACCOUNT` and `isPerson`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#NOTIFICATION_DAYS,APP_ACCOUNT,isPerson -->

[`src/main/atlassian/jiraData.ts`, lines 33–40](../../apps/desktop/src/main/atlassian/jiraData.ts#L33-L40)

```ts
/** How far back the Notifications tab looks. */
export const NOTIFICATION_DAYS = 14

/** Atlassian's own accounts (Automation for Jira and other apps) have IDs starting with this. */
const APP_ACCOUNT = '557058:'

const isPerson = (accountId: string | null): boolean =>
  accountId !== null && !accountId.startsWith(APP_ACCOUNT)
```

<!-- /code -->

- `NOTIFICATION_DAYS = 14`: the Notifications tab shows the last two weeks.
- `APP_ACCOUNT`: as the comment says, Atlassian gives its own accounts (Automation for Jira, other
  apps) IDs that start with `557058:`.
- `isPerson(accountId)`: whether an account is a person, so an automatic "Thanks, we've got your
  request" doesn't count as IT replying.

### `searchWords()`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#searchWords -->

[`src/main/atlassian/jiraData.ts`, lines 42–54](../../apps/desktop/src/main/atlassian/jiraData.ts#L42-L54)

```ts
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
```

<!-- /code -->

The words the user typed, made safe to put inside quotes in a JQL or CQL query. Characters such
as `"`, `(`, `*` and `~` mean something to Jira's and Confluence's search; a `"` could even end
the quoted text early and add to the query. So they're all replaced with spaces, runs of spaces
become one, and the result is cut to 200 characters. What's left is only ever searched for.

### `ASSIGNED_JQL` and `MENTIONED_JQL`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#ASSIGNED_JQL,MENTIONED_JQL -->

[`src/main/atlassian/jiraData.ts`, lines 56–67](../../apps/desktop/src/main/atlassian/jiraData.ts#L56-L67)

```ts
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
```

<!-- /code -->

The two searches behind the Notifications tab, in JQL. `currentUser()` is whoever is signed in,
and `-14d` means 14 days ago.

- `ASSIGNED_JQL`: issues assigned to the user, where the assignee changed to them in the last two
  weeks, or which were created in that time (an issue created already assigned has no change of
  assignee). As the comment says, it can't tell who did the assigning; that's sorted out later
  from each issue's history (`assignedNotification()`).
- `MENTIONED_JQL`: issues updated lately whose comments or description mention the user. Jira's
  text search finds mentions of `currentUser()`; the comments themselves then say who wrote them,
  and when (`mentionNotifications()`).
- Both are `ORDER BY updated DESC`, so if there are more than are asked for, the newest come
  first.

### `myRequestsJql()`, `textSearchJql()` and `confluenceCql()`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#myRequestsJql,textSearchJql,confluenceCql -->

[`src/main/atlassian/jiraData.ts`, lines 69–85](../../apps/desktop/src/main/atlassian/jiraData.ts#L69-L85)

```ts
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
```

<!-- /code -->

- `myRequestsJql(projectKey)`: the user's service desk requests (`reporter = currentUser()` in the
  service desk's Jira project): every open one, and those closed in the last 30 days
  (`statusCategory != Done OR updated >= -30d`).
- `textSearchJql(query)`: Jira issues whose text (summary, description, comments) matches the
  words.
- `confluenceCql(query, spaces)`: the same for Confluence, in CQL, Confluence's query language.
  `siteSearch` ranks results the way Confluence's own search box does. `type in (page, blogpost)`
  leaves out attachments and comments. With `spaces`, only those spaces are searched, as in
  `space in ("INFRA")`.

### `issueNodes()`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#issueNodes -->

[`src/main/atlassian/jiraData.ts`, lines 87–97](../../apps/desktop/src/main/atlassian/jiraData.ts#L87-L97)

```ts
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
```

<!-- /code -->

The issues in an answer, wherever they are. As the comment says, a search can come back as Jira
has it (`issues` is the list) or as Atlassian's server rearranges it (`issues.nodes`); a single
issue comes back as the issue itself, recognised by its `key`.

### `CATEGORIES` and `statusOf()`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#CATEGORIES,statusOf -->

[`src/main/atlassian/jiraData.ts`, lines 99–108](../../apps/desktop/src/main/atlassian/jiraData.ts#L99-L108)

```ts
const CATEGORIES: StatusCategory[] = ['new', 'indeterminate', 'done']

export function statusOf(fields: unknown): IssueStatus {
  const status = field(fields, 'status')
  const category = text(field(status, 'statusCategory', 'key'))
  return {
    name: text(field(status, 'name')) ?? 'Unknown',
    category: CATEGORIES.find((c) => c === category) ?? 'indeterminate',
  }
}
```

<!-- /code -->

An issue's status. Jira lets each company name its statuses ("Waiting for support", "In
review"...), but every status belongs to one of three _categories_: `new` (to do),
`indeterminate` (in progress) and `done`. The page colours a status by its category.

- `CATEGORIES.find((c) => c === category) ?? 'indeterminate'`: a category that isn't one of the
  three is shown as in progress, rather than trusted.

### `nameOf`, `accountOf`, `issueSummaryOf()` and `issueSummaries()`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#nameOf,accountOf,issueSummaryOf,issueSummaries -->

[`src/main/atlassian/jiraData.ts`, lines 110–130](../../apps/desktop/src/main/atlassian/jiraData.ts#L110-L130)

```ts
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
```

<!-- /code -->

- `nameOf(user)`, `accountOf(user)`: a Jira user's display name and account ID.
- `issueSummaryOf(node, site)`: an issue as a search result shows it: key, summary, status, type,
  and its address in Jira. `isIssueKey(key)` (from `src/shared/jira.ts`) means a strange key can
  never become part of an address.
- `issueSummaries(result, site)`: every issue in an answer.
  `.filter((issue): issue is IssueSummary => issue !== null)` drops the ones that couldn't be read;
  the `issue is IssueSummary` part tells TypeScript that what's left has no `null` in it.

### `adfMentions()`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#adfMentions -->

[`src/main/atlassian/jiraData.ts`, lines 132–147](../../apps/desktop/src/main/atlassian/jiraData.ts#L132-L147)

```ts
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
```

<!-- /code -->

The people mentioned in a comment or description in **ADF**, the Atlassian Document Format: Jira's
own way of storing rich text, as a tree of JSON nodes (a paragraph holds text nodes, a mention is
a node with the person's account ID, and so on).

- `const walk = (node, depth) => {`: visits a node and then, by calling itself, each node in its
  `content`.
- `if (depth > 30 || !isObject(node)) return`: a strangely deep document can't make it go on for
  ever.
- `if (node['type'] === 'mention')`: a mention keeps the account ID in `attrs.id`.

### `BLOCKS` and `adfText()`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#BLOCKS,adfText -->

[`src/main/atlassian/jiraData.ts`, lines 149–170](../../apps/desktop/src/main/atlassian/jiraData.ts#L149-L170)

```ts
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
```

<!-- /code -->

An ADF document as plain text, for the start of a comment shown in a notification.

- Text nodes give their text; a mention or emoji its `attrs.text` (a mention's is "@Name"); a line
  break a new line; a link card its address.
- `BLOCKS`: the nodes that are blocks of their own (paragraphs, headings, list items and so on),
  each followed by a new line once its content is done.
- `.replace(/\n{3,}/g, '\n\n')`: no more than one empty line in a row.

### `cleanMarkdown()` and `bodyText()`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#cleanMarkdown,bodyText -->

[`src/main/atlassian/jiraData.ts`, lines 172–189](../../apps/desktop/src/main/atlassian/jiraData.ts#L172-L189)

```ts
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
```

<!-- /code -->

Atlassian's server can turn ADF into Markdown itself, which is easier to show and to give to
Claude, but it writes mentions and emoji as tags of its own, such as
`<custom data-type="mention" ...>@Sam Bolin</custom>`.

- `cleanMarkdown()`: as the comment says, the tags become their text, and a pasted image (a
  `blob:` address that only works inside Jira) becomes `[image]`. An invisible zero-width
  character that Atlassian's Markdown can contain is removed, and empty lines are squeezed as in
  `adfText()`.
- `bodyText(body)`: a comment or description either way: a string is Markdown, anything else ADF.

### `mentionsUser()` and `excerpt()`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#mentionsUser,excerpt -->

[`src/main/atlassian/jiraData.ts`, lines 191–201](../../apps/desktop/src/main/atlassian/jiraData.ts#L191-L201)

```ts
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
```

<!-- /code -->

- `mentionsUser(body, user)`: whether a comment or description mentions the user. In Markdown the
  mention tag ends with `>@Their Name</custom>`; in ADF the mention carries their account ID, which
  is the surer test. The Notifications search asks for ADF for this reason.
- `excerpt(value, length)`: the start of a text on one line, with `…` if it was cut.

### `FoundNotification`, `time` and `iso`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#FoundNotification,time,iso -->

[`src/main/atlassian/jiraData.ts`, lines 203–212](../../apps/desktop/src/main/atlassian/jiraData.ts#L203-L212)

```ts
// -------------------------------------------------------------------------------- notifications

export type FoundNotification = Omit<JiraNotification, 'unread'>

const time = (value: unknown): number => {
  const parsed = Date.parse(typeof value === 'string' ? value : '')
  return Number.isNaN(parsed) ? 0 : parsed
}

const iso = (value: unknown): string => new Date(time(value)).toISOString()
```

<!-- /code -->

- `FoundNotification`: a notification as it's found, before `Atlassian` knows whether the user has
  seen it. `Omit<JiraNotification, 'unread'>` is `JiraNotification` without its `unread` field.
- `time(value)`: a date from Jira as milliseconds, or 0 if it can't be read, so sorting and
  comparing never fail.
- `iso(value)`: the same date written the standard way (`2026-10-12T09:30:00.000Z`), which sorts
  correctly as text.

### `assignedNotification()`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#assignedNotification -->

[`src/main/atlassian/jiraData.ts`, lines 214–262](../../apps/desktop/src/main/atlassian/jiraData.ts#L214-L262)

```ts
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
```

<!-- /code -->

Who assigned the user this issue, as the comment says, from its change history (the _changelog_,
which `Atlassian` asks for issue by issue).

- `items(field(node, 'changelog', 'histories')).sort(...)`: the issue's changes, newest first.
- `histories.find(...)`: the latest change that set the assignee to the user. `tmpToAccountId` is
  where some answers keep the new assignee's ID.
- `if (accountOf(by) === me.accountId || time(change['created']) < since) return null`: the user
  assigned it to themselves, or it happened more than two weeks ago: nothing to tell them.
- `id: \`assigned:${key}:${...}\``: an ID that stays the same each time the issue is checked, so
  the page can keep track of it.
- After the `if (change)`: no change of assignee, so if the issue is the user's, it was created
  already assigned to them, and whoever created it assigned it (unless that was the user, or it
  was too long ago).

### `mentionNotifications()`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#mentionNotifications -->

[`src/main/atlassian/jiraData.ts`, lines 264–308](../../apps/desktop/src/main/atlassian/jiraData.ts#L264-L308)

```ts
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
```

<!-- /code -->

Every comment on the issue in the last two weeks, by someone else, that mentions the user, as a
notification with the comment's start (`excerpt(bodyText(...))`). Then the description, if
someone else wrote the issue in that time and mentioned the user in it.

### `RequestInfo` and `requestInfoOf()`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#RequestInfo,requestInfoOf -->

[`src/main/atlassian/jiraData.ts`, lines 310–345](../../apps/desktop/src/main/atlassian/jiraData.ts#L310-L345)

```ts
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
```

<!-- /code -->

One of the user's service desk requests, with what's needed to tell when IT has done something.

- `reply`: as the comment says, the latest comment by someone else. `.filter(...)` keeps comments
  by people other than the user (`isPerson()` leaves out automatic ones), and the sort puts them
  oldest first, so `replies.at(-1)` is the latest. `at(-1)` is a list's last item.
- `id: text(last['id']) ?? String(time(last['created']))`: the reply's ID, which is how
  `Atlassian` notices a new reply: a different ID.

### `portalRequestUrl()`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#portalRequestUrl -->

[`src/main/atlassian/jiraData.ts`, lines 347–350](../../apps/desktop/src/main/atlassian/jiraData.ts#L347-L350)

```ts
/** A request on the help centre portal. */
export function portalRequestUrl(helpCentre: string, portalId: string, key: string): string {
  return `${new URL(helpCentre).origin}/servicedesk/customer/portal/${portalId}/${key}`
}
```

<!-- /code -->

A request's page on the help centre portal, where IT's customers see it, which is what My
requests links to. `new URL(helpCentre).origin` is just the `https://...atlassian.net` part.

### `MAX_DESCRIPTION`, `MAX_COMMENTS` and `issueDetailOf()`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#MAX_DESCRIPTION,MAX_COMMENTS,issueDetailOf -->

[`src/main/atlassian/jiraData.ts`, lines 352–395](../../apps/desktop/src/main/atlassian/jiraData.ts#L352-L395)

```ts
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
```

<!-- /code -->

An issue as `IssueView` shows it.

- `const summary = issueSummaryOf(node, site)`: the key, summary, status, type and address, as in
  search results; `...summary` copies them into the result.
- `items(node['comments'])`: as the comment says, Atlassian adds the comments as Markdown beside
  Jira's own ADF ones. The Markdown ones are used when they're there.
- `.sort(...)` then `.slice(-MAX_COMMENTS)`: oldest first, and only the latest 10.
  `slice(-10)` takes a list's last 10 items.
- `description.length > MAX_DESCRIPTION`: a description over 4,000 characters is cut, with `…` on
  a line of its own, so a huge one can't fill the card (or the question to Claude).
- `portalUrl`, `transitions`: given by `Atlassian`, which asks for them separately.

### `transitionsOf()`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#transitionsOf -->

[`src/main/atlassian/jiraData.ts`, lines 397–403](../../apps/desktop/src/main/atlassian/jiraData.ts#L397-L403)

```ts
export function transitionsOf(result: ToolResult): IssueTransition[] {
  const payload = payloadOf(result)
  const list = Array.isArray(payload) ? payload : field(payload, 'transitions')
  return items(list)
    .map((t) => ({ id: text(t['id']) ?? '', name: text(t['name']) ?? '' }))
    .filter((t) => t.id && t.name)
}
```

<!-- /code -->

The statuses an issue can move to. In Jira a _transition_ is a step in the issue's workflow
("Start progress", "Resolve"), with its own ID; moving an issue means making a transition. Only
ones with both an ID and a name are kept.

### `ENTITIES` and `plainSnippet()`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#ENTITIES,plainSnippet -->

[`src/main/atlassian/jiraData.ts`, lines 405–419](../../apps/desktop/src/main/atlassian/jiraData.ts#L405-L419)

```ts
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
```

<!-- /code -->

Confluence's search gives titles and snippets ready for a web page: the matching words wrapped in
`@@@hl@@@...@@@endhl@@@` markers, HTML tags, and characters written as _entities_ (`&amp;` for
`&`, `&#39;` for `'`). The page shows plain text, so:

- `.replace(/@@@(end)?hl@@@/g, '')`, `.replace(/<[^>]*>/g, '')`: the markers and tags go.
- `.replace(/&(#\d+|[a-z]+);/g, ...)`: a numbered entity becomes its character
  (`String.fromCharCode`), and a named one is looked up in `ENTITIES`; one it doesn't know is
  left as it was.

### `confluencePagesOf()`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#confluencePagesOf -->

[`src/main/atlassian/jiraData.ts`, lines 421–448](../../apps/desktop/src/main/atlassian/jiraData.ts#L421-L448)

```ts
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
```

<!-- /code -->

The pages in a Confluence search answer.

- `const content = isObject(page['content']) ? page['content'] : page`: a search result keeps the
  page itself under `content`; some answers give the page directly.
- `const url = ...`: the page's full address if the answer has one (`webUrl`), otherwise its path
  (`_links.webui`) on the site's Confluence (`/wiki`).
- `if (!id || !title || !url || !url.startsWith(origin)) continue`: only pages on the company's
  own site are kept, so a search answer can never make the app open somewhere else.
- `space`: the space's name, shown under the page's title.

### `AtlassianUser`, `userOf()` and `cloudIdOf()`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#AtlassianUser,userOf,cloudIdOf -->

[`src/main/atlassian/jiraData.ts`, lines 450–483](../../apps/desktop/src/main/atlassian/jiraData.ts#L450-L483)

```ts
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
```

<!-- /code -->

- `AtlassianUser`: who's connected: their account ID (to know their own comments and changes),
  name (the settings menu shows "Connected to Atlassian as ...") and email, if given.
- `userOf(result)`: reads the answer of `atlassianUserInfo`, whichever way it names the fields
  (`account_id` or `accountId`, `name` or `displayName`).
- `cloudIdOf(result, site)`: every tool wants the site's _cloud ID_, Atlassian's ID for one
  company's site. `getAccessibleAtlassianResources` lists the sites the user can reach, each with
  its address and ID; this finds the one whose host (`morsemicro.atlassian.net`) matches the
  tenant's site. An address that can't be read is skipped (`catch`).

### `INSTRUCTIONS` and `day`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#INSTRUCTIONS,day -->

[`src/main/atlassian/jiraData.ts`, lines 485–495](../../apps/desktop/src/main/atlassian/jiraData.ts#L485-L495)

```ts
// ------------------------------------------------------------------------------- asking Claude

const INSTRUCTIONS: Record<IssuePrompt, string> = {
  summarise:
    "Summarise this Jira issue for me: what it's about, where it's up to, and anything that's waiting on me.",
  reply:
    "Draft a reply I could post as a comment on this Jira issue. Keep it short, friendly and professional, and don't promise anything the issue doesn't support.",
  'next-steps': 'Suggest the next steps to move this Jira issue forward, most important first.',
}

const day = (value: string): string => value.slice(0, 10)
```

<!-- /code -->

- `INSTRUCTIONS`: what each **Ask Claude** button asks, in the user's voice.
  `Record<IssuePrompt, string>` makes TypeScript check there's one for each of `summarise`, `reply`
  and `next-steps`.
- `day(value)`: the date part of an ISO time (`2026-10-12`), for the comments in the prompt.

### `issuePrompt()`

<!-- code: apps/desktop/src/main/atlassian/jiraData.ts#issuePrompt -->

[`src/main/atlassian/jiraData.ts`, lines 497–538](../../apps/desktop/src/main/atlassian/jiraData.ts#L497-L538)

```ts
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
```

<!-- /code -->

The question for Claude: the request, then the issue itself, so Claude has everything it needs
without access to Jira.

- `head`: the instruction, then the key and summary, the status, type, assignee and reporter on
  one line (`.filter(Boolean)` drops the ones that are missing), and the issue's address.
- `comments`: each as "Name (date):" and its text.
- `const build = () => [...]`: puts the prompt together from the parts as they are at the time, so
  it can be rebuilt after shortening them. The comments come oldest first, as a conversation
  reads.
- `while (prompt.length > max && comments.length > 0) { comments.shift() ... }`: as the comment
  says, the prompt has to fit `max` characters (Claude Desktop's limit for a question in a link,
  12,000). The oldest comments are left out first, one at a time (`shift()` removes a list's first
  item).
- `description = \`${description.slice(...)}…\``: if it's still too long without any comments, the
description is shortened by as much as it's over (2 more characters make room for the `…` and
  some slack).
- `return prompt.slice(0, max)`: never over the limit, whatever happens.

## `src/main/atlassian/Atlassian.ts`: the connection, the feed and working on issues

Everything the Jira page and My requests do, on top of an `McpAccount`. Like `PortalApps`, it has
no Electron in it: the connection, the encrypted store, the remembered state, the browser and
Windows notifications all come in through `AtlassianDeps`, so `tests/atlassian.test.ts` runs it
against a fake Atlassian. `start()` in `index.ts` creates the one instance when the tenant has
`atlassian`, and `registerAtlassian()` in `ipc.ts` calls it.

### `TOOLS`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#TOOLS -->

[`src/main/atlassian/Atlassian.ts`, lines 50–62](../../apps/desktop/src/main/atlassian/Atlassian.ts#L50-L62)

```ts
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
```

<!-- /code -->

The names of the Atlassian MCP server's tools that are used, in one place. `as const` makes
TypeScript treat each name as that exact text, and the object as read-only.

### `FEED_INTERVAL_MS`, `STALE_MS`, `DAY_MS`, `MAX_NOTIFICATIONS` and `PARALLEL`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#FEED_INTERVAL_MS,STALE_MS,DAY_MS,MAX_NOTIFICATIONS,PARALLEL -->

[`src/main/atlassian/Atlassian.ts`, lines 64–71](../../apps/desktop/src/main/atlassian/Atlassian.ts#L64-L71)

```ts
/** How often notifications and requests are checked in the background. */
export const FEED_INTERVAL_MS = 5 * 60_000

/** Opening the Jira page checks again if the last check is older than this. */
const STALE_MS = 60_000

const DAY_MS = 24 * 60 * 60_000

const MAX_NOTIFICATIONS = 30

/** How many issues are looked at in parallel (each is one request to Atlassian). */
const PARALLEL = 4
```

<!-- /code -->

- `FEED_INTERVAL_MS`: notifications and requests are checked every 5 minutes in the background.
- `STALE_MS`: opening the Jira page checks again if the last check is over a minute old, so what
  the user sees is never more than a minute out of date, without a request every time.
- `MAX_NOTIFICATIONS = 30`: the most the tab lists.
- `PARALLEL = 4`: finding out who assigned each issue takes one request per issue; as the comment
  says, at most four run at once, so a long list doesn't flood Atlassian.

### `AtlassianMemorySchema` and `AtlassianMemory`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#AtlassianMemorySchema,AtlassianMemory -->

[`src/main/atlassian/Atlassian.ts`, lines 73–84](../../apps/desktop/src/main/atlassian/Atlassian.ts#L73-L84)

```ts
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
```

<!-- /code -->

What's remembered between runs, in `atlassian.json` in the app's data folder (not encrypted: it
holds issue keys, times and statuses, no secrets). `index.ts` reads it through this zod schema, so a
damaged file just means starting afresh.

- `notificationsReadAt`: notifications up to this time have been seen; newer ones get a dot.
- `requests`: for each of the user's requests, by key, its state written as `"status|latest reply"`,
  twice: what the user has `seen` in the panel, and what they've been `notified` about with a
  Windows notification. Keeping the two apart means a change gives one notification, but stays
  marked in My requests until the user looks.
- `AtlassianMemory`: the TypeScript type, worked out from the schema (`z.infer`).

### `AtlassianDeps` and `loading()`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#AtlassianDeps,loading -->

[`src/main/atlassian/Atlassian.ts`, lines 86–109](../../apps/desktop/src/main/atlassian/Atlassian.ts#L86-L109)

```ts
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
```

<!-- /code -->

`AtlassianDeps` is everything `Atlassian` needs from outside; `start()` in `index.ts` passes the
real ones.

- `appName`, `redirectPort`, `connector`, `store`, `listen`, `openBrowser`: handed on to the
  `McpAccount`, as `PortalApps` does. `store` is a `SecretStore` over `atlassian.bin`.
- `site`: the company's Atlassian site, from the tenant (`https://morsemicro.atlassian.net`).
- `knowledgeSpaces`: as the comment says, the Confluence spaces searched for how-to articles.
- `requests`: the service desk's portal and Jira project, for My requests; `null` when the tenant
  has no request types.
- `memory`: reads and writes `atlassian.json`.
- `onState(state)`, `onFeed(feed)`: called on every change; `index.ts` broadcasts them to the
  page.
- `notify(message)`: a Windows notification, as the comment says.
- `now?`, `feedIntervalMs?`: replace the clock and the 5 minutes in the tests.
- `loading<T>()`: an empty list that's still loading, the starting point for both lists. `<T>`
  makes it work for a list of anything.

### `Atlassian`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#Atlassian.class -->

[`src/main/atlassian/Atlassian.ts`, lines 111–116](../../apps/desktop/src/main/atlassian/Atlassian.ts#L111-L116)

```ts
/**
 * Jira and Confluence through Atlassian's Remote MCP server: the user connects once, in the
 * browser, and then sees who assigned them issues or mentioned them, their IT requests, search,
 * and can work on an issue. Notifications and requests are checked every few minutes.
 */
export class Atlassian {
  // …
}
```

<!-- /code -->

The class `index.ts` and `ipc.ts` use, with the comment that sums it up.

### `Atlassian` fields, constructor, `current` and `currentFeed`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#Atlassian.state,feedState,account,user,cloudId,memory,memoryLoaded,refreshing,lastRefresh,timer,assignments,requestSignatures,projectKeyList,constructor,current,currentFeed -->

[`src/main/atlassian/Atlassian.ts`, lines 117–157](../../apps/desktop/src/main/atlassian/Atlassian.ts#L117-L157)

```ts
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
```

<!-- /code -->

- `state`: the connection (`AtlassianState`: loading, sign-in, signing-in, connected or error).
  Every change goes through `setState()`, which also reports it.
- `feedState`: the two lists, notifications and requests, each with its own status (`JiraFeed`).
- `account`: the connection to Atlassian's server (`McpAccount`). Unlike JumpCloud's, it's given
  no `scope`: Atlassian's server decides what the app may do.
- `user`, `cloudId`: who's connected, and their site's cloud ID, found by `identify()`.
- `memory`, `memoryLoaded`: what's remembered (above), and the promise of reading it, started in
  the constructor. A file that can't be read leaves `memory` empty (`() => {}`).
- `refreshing`: the check under way, if any, so two at once share one. `lastRefresh`: when the
  last one finished.
- `timer`: the 5-minute check.
- `assignments`: as the comment says, who assigned each issue, kept until the issue changes, so
  each check doesn't read every issue's history again.
- `requestSignatures`: each request's `"status|latest reply"` as last loaded, for marking it seen.
- `projectKeyList`: the Jira project keys the user can see, loaded once (see `projectKeys()`).
- `get current()`, `get currentFeed()`: the state and lists as they are now, for the tests and
  for `atlassian.get()`.

### `Atlassian.init()`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#Atlassian.init -->

[`src/main/atlassian/Atlassian.ts`, lines 159–173](../../apps/desktop/src/main/atlassian/Atlassian.ts#L159-L173)

```ts
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
```

<!-- /code -->

What `index.ts` calls at startup. As the comment says, it only uses a saved connection, and never
opens the browser.

- `await this.identify()`: who the user is; this is the first tool call, so it's also what finds
  out whether the saved connection still works.
- `this.connected()`: shows the user as connected and starts the checks.
- `if (error instanceof NeedsSignInError)`: nobody has connected yet, or the connection has ended:
  the Connect button, without a message.
- Anything else (Atlassian can't be reached, say) is an `error` state with a message, and the page
  offers Retry.

### `Atlassian.signIn()`, `cancelSignIn()`, `signOut()` and `retry()`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#Atlassian.signIn,cancelSignIn,signOut,retry -->

[`src/main/atlassian/Atlassian.ts`, lines 175–213](../../apps/desktop/src/main/atlassian/Atlassian.ts#L175-L213)

```ts
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
```

<!-- /code -->

- `signIn()`: **Connect to Atlassian**. The same pattern as `PortalApps.signIn()`: `signing-in`
  while the browser is open, `McpAccount.signIn()` for the browser part, then `identify()` and
  `connected()`. Cancel goes back to the Connect button; a timeout or any other failure goes back
  to it with a message, and is logged.
- `cancelSignIn()`: closes the listener, which ends `signIn()`'s wait.
- `signOut()`: **Disconnect Atlassian** in the settings menu. The checks stop,
  `McpAccount.signOut()` deletes the saved connection, `forget()` clears everything known about
  the user, and the page goes back to Connect.
- `retry()`: the Retry button after an error: `loading` again, then `init()`.

### `Atlassian.feed()`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#Atlassian.feed -->

[`src/main/atlassian/Atlassian.ts`, lines 215–220](../../apps/desktop/src/main/atlassian/Atlassian.ts#L215-L220)

```ts
/** Notifications and requests, checked again first if asked or if the last check is old. */
async feed(refresh = false): Promise<JiraFeed> {
  if (this.state.status !== 'connected') return this.feedState
  if (refresh || this.now() - this.lastRefresh > STALE_MS) return this.refresh()
  return this.feedState
}
```

<!-- /code -->

What the Jira page and My requests ask for when they show, and on Refresh (`refresh` true).

- `if (this.state.status !== 'connected') return this.feedState`: nothing to check until connected.
- `this.now() - this.lastRefresh > STALE_MS`: checks again first if the last check is over a
  minute old; otherwise the lists as they are.

### `Atlassian.markNotificationsRead()` and `Atlassian.markRequestsRead()`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#Atlassian.markNotificationsRead,markRequestsRead -->

[`src/main/atlassian/Atlassian.ts`, lines 222–253](../../apps/desktop/src/main/atlassian/Atlassian.ts#L222-L253)

```ts
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
```

<!-- /code -->

- `markNotificationsRead()`: the Jira page calls this two seconds after the Notifications tab
  shows. `items.reduce(...)` finds the newest notification's time (ISO times compare correctly as
  text), which becomes `notificationsReadAt`; every notification loses its dot (`read`, at the end
  of the file), and the memory is saved.
- `markRequestsRead(key?)`: the user has seen what's new on one request (opening it in the card),
  or on all of them without a key. Its current signature becomes both `seen` and `notified`, and
  its `news` is cleared. `changed` makes sure nothing is reported or saved if there was nothing
  new.

### `Atlassian.search()`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#Atlassian.search -->

[`src/main/atlassian/Atlassian.ts`, lines 255–273](../../apps/desktop/src/main/atlassian/Atlassian.ts#L255-L273)

```ts
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
```

<!-- /code -->

The Search tab: Jira issues and Confluence pages, asked for at the same time (`Promise.all`).

- `const failed = (error) => { failure ??= error; return [] }`: a search that fails counts as no
  results, and the first failure is kept.
- `if (failure && issues.length === 0 && pages.length === 0)`: only when nothing at all came back
  does the tab show the problem. If Confluence failed but Jira found issues, the issues show.

### `Atlassian.issue()`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#Atlassian.issue -->

[`src/main/atlassian/Atlassian.ts`, lines 275–312](../../apps/desktop/src/main/atlassian/Atlassian.ts#L275-L312)

```ts
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
```

<!-- /code -->

An issue for `IssueView`, with its latest comments and the statuses it can move to.

- `fields: [...]`: only the fields that are shown, so the answer stays small.
- `responseContentFormat: 'markdown'`: the description and comments as Markdown, which the page
  shows with its `Markdown` component.
- `this.call(TOOLS.transitions, ...).then(transitionsOf).catch(() => [])`: the possible moves,
  asked for separately. If that fails, the issue still opens, just without Move.
- `key.startsWith(\`${requests.projectKey}-\`)`: an issue in the service desk's project (`ISD-`)
  is one of the user's requests, so it gets a link to its portal page too.
- `if (portalUrl) void this.markRequestsRead(key)`: as the comment says, opening a request counts
  as seeing what's new on it.
- `catch (error)`: any failure is logged and becomes a message for the page.

### `Atlassian.transition()`, `comment()` and `logWork()`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#Atlassian.transition,comment,logWork -->

[`src/main/atlassian/Atlassian.ts`, lines 314–329](../../apps/desktop/src/main/atlassian/Atlassian.ts#L314-L329)

```ts
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
```

<!-- /code -->

The three changes **Move**, **Comment** and **Log time** make. Each goes through `change()`
(below), which makes the call and then answers with the issue as it is now.

- `transition`: makes the transition with that ID.
- `comment`: `contentFormat: 'markdown'` lets Atlassian turn the comment's Markdown into ADF.
- `logWork`: the time in Jira's own format; `ipc.ts` has already checked it (`TimeSpent`).

### `Atlassian.articles()`, `projectKeys()`, `prompt()` and `dispose()`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#Atlassian.articles,projectKeys,prompt,dispose -->

[`src/main/atlassian/Atlassian.ts`, lines 331–364](../../apps/desktop/src/main/atlassian/Atlassian.ts#L331-L364)

```ts
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
```

<!-- /code -->

- `articles(value)`: the "These might help:" links on the New request form: up to three pages
  from the knowledge spaces about what the user is typing. Nothing is searched until there are
  three characters of words, and a failure just means no links.
- `projectKeys()`: the keys of the Jira projects the user can see, so the text box only offers to
  open issue keys that could be real (a "COVID-19" in the text isn't an issue). `??=` loads them
  once and shares the promise; a failure is logged and forgotten (`this.projectKeyList = null`),
  so the next call tries again. `null` means "not known", and then every key is offered.
- `prompt(key, kind, max)`: the question for **Ask Claude**: the issue as `issue()` reads it, put
  into words by `issuePrompt()`. If the issue can't be read, its message is passed on.
- `dispose()`: when the app quits, the checks stop and the connection is closed.

### `Atlassian.now()`, `identify()`, `connected()` and `forget()`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#Atlassian.now,identify,connected,forget -->

[`src/main/atlassian/Atlassian.ts`, lines 366–396](../../apps/desktop/src/main/atlassian/Atlassian.ts#L366-L396)

```ts
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
```

<!-- /code -->

- `// ---- inner`: the comment line that starts the class's private helpers.
- `now()`: the time, from the tests' clock if they give one. `(this.deps.now ?? Date.now)()` picks
  the function, then calls it.
- `identify()`: who the user is (`atlassianUserInfo`), and the site's cloud ID from the sites they
  can reach. These two calls go to `this.account` directly, since `call()` (below) adds the cloud
  ID, which isn't known yet. If the sites can't be listed, or the site isn't among them, the
  site's host is used instead (`?? new URL(this.deps.site).host`): the tools accept a site's
  address in place of its ID too.
- `connected()`: the `connected` state with the user's name (and email, if any) for the settings
  menu, a first check straight away, and the 5-minute checks. `this.user!`: the `!` tells
  TypeScript that `user` can't be `null` here, because `identify()` has just set it.
- `forget()`: everything known about the user goes, and both lists go back to loading.

### `Atlassian.startChecking()` and `Atlassian.stopChecking()`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#Atlassian.startChecking,stopChecking -->

[`src/main/atlassian/Atlassian.ts`, lines 398–410](../../apps/desktop/src/main/atlassian/Atlassian.ts#L398-L410)

```ts
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
```

<!-- /code -->

- `startChecking()`: a check every 5 minutes (`setInterval`), stopping any earlier timer first so
  there's never two. `this.timer.unref?.()`: a waiting timer doesn't keep the app from quitting.
  The `?.` calls `unref` only if it exists, as it does in Node.
- `stopChecking()`: stops it.

### `Atlassian.call()` and `Atlassian.change()`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#Atlassian.call,change -->

[`src/main/atlassian/Atlassian.ts`, lines 412–442](../../apps/desktop/src/main/atlassian/Atlassian.ts#L412-L442)

```ts
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
```

<!-- /code -->

- `call(name, args)`: a tool call on the user's site: `{ cloudId: this.cloudId, ...args }` adds
  the cloud ID to the arguments. As the comment says, a connection that has ended
  (`NeedsSignInError` while `connected`: the refresh token has expired, say) stops the checks,
  forgets the user and takes the page back to Connect, with a message saying why. The error is
  passed on either way.
- `change(key, doing, tool, args)`: one change to an issue. A failure is logged as, say, "Moving
  ISD-12 failed" and becomes a message; on success it answers with `issue(key)`, so the page shows
  the new status or comment straight away.

### `Atlassian.refresh()`, `loadFeed()` and `failedList()`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#Atlassian.refresh,loadFeed,failedList -->

[`src/main/atlassian/Atlassian.ts`, lines 444–475](../../apps/desktop/src/main/atlassian/Atlassian.ts#L444-L475)

```ts
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
```

<!-- /code -->

One check of notifications and requests.

- `refresh()`: `??=` shares a check that's under way, as `PortalApps.load()` does.
- `const user = this.user`: remembers who the check is for.
- `Promise.all([...])`: both lists at once. Each failure is caught separately (`failedList()`), so
  a problem with requests doesn't stop notifications.
- `if (this.user !== user) return this.feedState`: as the comment says, if the user disconnected
  while the check was running, what came back is dropped.
- `this.setFeed(...)`, `await this.saveMemory()`: reports the lists, and saves what
  `loadRequests()` learned.
- `failedList(what, error)`: logs the failure and, as its comment says, keeps the list that was
  there before, with the reason it couldn't be updated. `previous.items as T[]` tells TypeScript
  which kind of list it is.

### `Atlassian.loadNotifications()`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#Atlassian.loadNotifications -->

[`src/main/atlassian/Atlassian.ts`, lines 477–490](../../apps/desktop/src/main/atlassian/Atlassian.ts#L477-L490)

```ts
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
```

<!-- /code -->

- `const since = this.now() - NOTIFICATION_DAYS * DAY_MS`: two weeks ago.
- The assignments and mentions are found at the same time, then put together:
  `.filter(...)` keeps the last two weeks, `.sort(...)` puts the newest first (ISO times sort as
  text, and `b.at.localeCompare(a.at)` is the reverse order), and `.slice(0, MAX_NOTIFICATIONS)`
  keeps 30.
- `unread: readAt === null || n.at > readAt`: newer than the last time the tab was looked at.
  Before the tab has ever been opened, everything is new.

### `Atlassian.assignedNotifications()`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#Atlassian.assignedNotifications -->

[`src/main/atlassian/Atlassian.ts`, lines 492–520](../../apps/desktop/src/main/atlassian/Atlassian.ts#L492-L520)

```ts
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
```

<!-- /code -->

Who assigned the user each issue found by `ASSIGNED_JQL`.

- `fields: ['summary', 'updated']`, `maxResults: 20`: the search itself only needs to say which
  issues, and when they last changed.
- `mapLimit(issueNodes(result), PARALLEL, async (node) => {`: each issue, four at a time.
- `if (known && known.updated === updated) return known.found`: an issue that hasn't changed since
  the last check has the same answer, so it isn't asked about again. Checking every 5 minutes
  costs one search, plus one request per issue that changed.
- `expand: 'changelog'`: asks for the issue's history, which says who changed the assignee. As the
  comment says, nothing else does. `updateHistory: false`: looking an issue up this way doesn't
  count as the user viewing it in Jira.
- `this.assignments.set(key, { updated, found: notification })`: remembered, including "nobody
  else" (`null`).

### `Atlassian.mentionedNotifications()`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#Atlassian.mentionedNotifications -->

[`src/main/atlassian/Atlassian.ts`, lines 522–534](../../apps/desktop/src/main/atlassian/Atlassian.ts#L522-L534)

```ts
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
```

<!-- /code -->

The issues `MENTIONED_JQL` finds, with their comments and descriptions.
`responseContentFormat: 'adf'`: as the comment says, in Jira's own format, where a mention
carries the account ID (`mentionsUser()`). `flatMap` puts each issue's notifications into one
list.

### `Atlassian.loadRequests()`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#Atlassian.loadRequests -->

[`src/main/atlassian/Atlassian.ts`, lines 536–576](../../apps/desktop/src/main/atlassian/Atlassian.ts#L536-L576)

```ts
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
```

<!-- /code -->

My requests, and what's new on them.

- `if (!requests) return { status: 'ready', items: [] }`: without request types, an empty list.
- `const signature = \`${info.status.name}|${info.reply?.id ?? ''}\``: the request's state as
  text: its status and its latest reply's ID. If either changes, so does the signature.
- `const firstCheck = this.memory.requests === undefined`: as the comment says, the very first
  check (just after connecting for the first time) only learns where things are. Otherwise every
  open request would be "new".
- `known[info.key] ?? { seen: signature, notified: signature }`: a request seen for the first time
  starts as already seen, so a request the user has just raised isn't news to them.
- `const news = newsOf(entry.seen, info)`: what's changed since the user last looked, shown in My
  requests ("Now Resolved", "Mark Duong replied").
- `const fresh = newsOf(entry.notified, info)`: what's changed since the last Windows
  notification. As the comment says, each change gets one: `this.deps.notify(...)`, then
  `entry.notified = signature`.
- `memory[info.key] = entry`, `this.memory.requests = memory`: only requests still in the list are
  remembered, so the file doesn't grow for ever.

### `Atlassian.searchIssues()`, `searchPages()` and `loadProjectKeys()`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#Atlassian.searchIssues,searchPages,loadProjectKeys -->

[`src/main/atlassian/Atlassian.ts`, lines 578–625](../../apps/desktop/src/main/atlassian/Atlassian.ts#L578-L625)

```ts
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
```

<!-- /code -->

- `searchIssues(query)`: a query that is an issue key (in any case: `isd-12` is `ISD-12`) asks for
  that issue directly; if it doesn't exist, no results. Anything else is a text search for up to
  10 issues. `if (!searchWords(query)) return []`: a query of only symbols isn't sent.
- `searchPages(query, spaces, limit)`: a Confluence search, `limit` pages long, in the given
  spaces or everywhere.
- `loadProjectKeys()`: the projects come 50 at a time (`startAt` says where each page starts).
  It stops when Atlassian says it's the last page (`isLast`), when a page is empty, or after 500,
  whichever comes first. `action: 'browse'` asks for the projects the user can look at.

### `Atlassian.problem()`, `saveMemory()`, `setState()` and `setFeed()`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#Atlassian.problem,saveMemory,setState,setFeed -->

[`src/main/atlassian/Atlassian.ts`, lines 627–652](../../apps/desktop/src/main/atlassian/Atlassian.ts#L627-L652)

```ts
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
```

<!-- /code -->

- `problem(error)`: what the page says when something fails: connect first, check you're online,
  `Atlassian said: ...` with the server's own words for a `ToolError` (an issue that doesn't
  exist, a transition that isn't allowed), or a general "try again".
- `saveMemory()`: writes `atlassian.json`; a failure is only logged, since the worst that can
  happen is a dot that comes back.
- `setState()`, `setFeed()`: record the new state or lists, and report them.

### `read` and `newsOf()`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#read,newsOf -->

[`src/main/atlassian/Atlassian.ts`, lines 655–669](../../apps/desktop/src/main/atlassian/Atlassian.ts#L655-L669)

```ts
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
```

<!-- /code -->

- `read(notification)`: the notification without its dot. One that's already read is returned as
  it is.
- `newsOf(before, info)`: as the comment says, what's changed on a request since an earlier
  signature. `before.split('|')` takes the signature apart again; a different status gives "Now
  ...", a different latest reply "... replied", and both are joined with `·`. `null` means
  nothing has changed.

### `mapLimit()`

<!-- code: apps/desktop/src/main/atlassian/Atlassian.ts#mapLimit -->

[`src/main/atlassian/Atlassian.ts`, lines 671–687](../../apps/desktop/src/main/atlassian/Atlassian.ts#L671-L687)

```ts
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
```

<!-- /code -->

Like `Promise.all(list.map(run))`, but with no more than `limit` running at once.

- `results`: the answers, in the same order as the list, whichever finishes first.
- `const worker = async () => {`: takes the next item that nobody has started (`next++` takes the
  current number and moves it on), runs it, and goes again until the list is done. JavaScript runs
  one piece of code at a time, so two workers can never take the same item.
- `Array.from({ length: Math.min(limit, list.length) }, worker)`: starts `limit` workers (fewer for
  a short list), and waits until they've all finished.

## `src/main/serviceDesk.ts`: raising an IT request

The New request form's work in the main process. As the class's comment says, the request is
filled in here and finished on the help centre portal, where the user is signed in as
themselves. That avoids the app creating requests on anyone's behalf, and the portal can take the
screenshot, which a link can't carry. Like the others, it has no Electron in it, and
`tests/serviceDesk.test.ts` checks it. `start()` in `index.ts` creates it when the tenant has
`serviceDesk.requests`.

### `MAX_LINK_DESCRIPTION` and `PcInfo`

<!-- code: apps/desktop/src/main/serviceDesk.ts#MAX_LINK_DESCRIPTION,PcInfo -->

[`src/main/serviceDesk.ts`, lines 3–15](../../apps/desktop/src/main/serviceDesk.ts#L3-L15)

```ts
/**
 * The longest description put in the portal link. Browsers and Atlassian accept much longer
 * addresses, but past a few thousand characters some proxies don't.
 */
export const MAX_LINK_DESCRIPTION = 1800

/** What's sent about the PC, so IT doesn't have to ask. */
export interface PcInfo {
  computerName: string
  windows: string
  appName: string
  appVersion: string
}
```

<!-- /code -->

- `MAX_LINK_DESCRIPTION = 1800`: the description travels in the form's address, and, as the
  comment says, some company proxies refuse very long addresses.
- `PcInfo`: what **Include PC details** sends about the PC, so IT doesn't have to ask: its name,
  the Windows version, and the app's own name and version.

### `windowsVersion()` and `pcDetails()`

<!-- code: apps/desktop/src/main/serviceDesk.ts#windowsVersion,pcDetails -->

[`src/main/serviceDesk.ts`, lines 17–33](../../apps/desktop/src/main/serviceDesk.ts#L17-L33)

```ts
/**
 * Windows' name and build, e.g. "Windows 11 Pro (10.0.26200)". Windows 11 still calls itself
 * Windows 10 in the name it reports (its build, 22000 or later, gives it away).
 */
export function windowsVersion(name: string, release: string): string {
  const build = Number(release.split('.')[2] ?? 0)
  const fixed = build >= 22000 ? name.replace(/^Windows 10\b/, 'Windows 11') : name
  return `${fixed} (${release})`
}

export function pcDetails(info: PcInfo): string {
  return [
    `PC: ${info.computerName}`,
    `Windows: ${info.windows}`,
    `${info.appName}: ${info.appVersion}`,
  ].join('\n')
}
```

<!-- /code -->

- `windowsVersion(name, release)`: Windows' name and version number, from Node's `os.version()`
  and `os.release()`. As the comment says, Windows 11 still reports itself as "Windows 10 ..." for
  old programs' sake; its build number, the third part of `10.0.26200`, is 22000 or more, so the
  name is corrected. `\b` makes sure "Windows 10" is a whole word.
- `pcDetails(info)`: the three lines that go at the end of the description, such as
  `PC: MM-LAPTOP-42`.

### `requestDescription()`

<!-- code: apps/desktop/src/main/serviceDesk.ts#requestDescription -->

[`src/main/serviceDesk.ts`, lines 35–42](../../apps/desktop/src/main/serviceDesk.ts#L35-L42)

```ts
/** The request's description: the user's words, then (if they want) the PC's details. */
export function requestDescription(details: string, pc: string | null): string {
  const parts = [details.trim(), pc ? `---\n${pc}` : ''].filter(Boolean)
  const description = parts.join('\n\n')
  return description.length > MAX_LINK_DESCRIPTION
    ? `${description.slice(0, MAX_LINK_DESCRIPTION - 30).trimEnd()}\n… (shortened)`
    : description
}
```

<!-- /code -->

The description for the form: the user's words, then (if they want) a `---` line and the PC's
details. If it's over `MAX_LINK_DESCRIPTION`, it's cut and ends with "… (shortened)", leaving room
(30 characters) for that note; the user can add the rest on the portal.

### `requestFormUrl()` and `myRequestsUrl()`

<!-- code: apps/desktop/src/main/serviceDesk.ts#requestFormUrl,myRequestsUrl -->

[`src/main/serviceDesk.ts`, lines 44–67](../../apps/desktop/src/main/serviceDesk.ts#L44-L67)

```ts
/**
 * The portal's form for a request type, filled in: Jira Service Management fills the summary
 * and description from these parameters.
 */
export function requestFormUrl(options: {
  helpCentre: string
  portalId: string
  requestTypeId: string
  summary: string
  description: string
}): string {
  const origin = new URL(options.helpCentre).origin
  const query = [
    options.summary.trim() && `summary=${encodeURIComponent(options.summary.trim())}`,
    options.description && `description=${encodeURIComponent(options.description)}`,
  ].filter(Boolean)
  const base = `${origin}/servicedesk/customer/portal/${options.portalId}/create/${options.requestTypeId}`
  return query.length ? `${base}?${query.join('&')}` : base
}

/** The user's requests on the help centre, all of them. */
export function myRequestsUrl(helpCentre: string): string {
  return `${new URL(helpCentre).origin}/servicedesk/customer/user/requests`
}
```

<!-- /code -->

- `requestFormUrl(options)`: the portal's create-request form for one request type, as in
  `https://morsemicro.atlassian.net/servicedesk/customer/portal/1/create/1561`. As the comment
  says, Jira Service Management fills in the form's summary and description from `?summary=` and
  `&description=` on the end of the address. `encodeURIComponent` writes the text so that spaces,
  `&` and new lines survive the trip. Empty parts are left out.
- `myRequestsUrl(helpCentre)`: the portal's page listing all the user's requests, for **All your
  requests on the portal**.

### `ServiceDeskDeps`

<!-- code: apps/desktop/src/main/serviceDesk.ts#ServiceDeskDeps -->

[`src/main/serviceDesk.ts`, lines 69–81](../../apps/desktop/src/main/serviceDesk.ts#L69-L81)

```ts
export interface ServiceDeskDeps {
  helpCentre: string
  portalId: string
  /** The request types offered (the IPC handler only accepts these). */
  requestTypeIds: string[]
  pcInfo(): PcInfo
  openLink(url: string): Promise<void>
  /** Puts the screenshots on the clipboard as one image. False if one of them is missing. */
  copyScreenshots(paths: string[]): Promise<boolean>
  /** A Windows notification, e.g. to say the screenshot is ready to paste. */
  notify(message: { title: string; body: string }): void
  onError?(error: unknown): void
}
```

<!-- /code -->

What `ServiceDesk` needs from outside; `index.ts` passes the real ones.

- `helpCentre`, `portalId`: the tenant's `serviceDesk.url` and `serviceDesk.requests.portalId`.
- `requestTypeIds`: the request types the tenant offers; as the comment says, nothing else is
  accepted.
- `pcInfo()`: the PC's details, read when they're needed (`hostname()` and the Windows version).
- `openLink(url)`: opens the form in the browser.
- `copyScreenshots(paths)`: as the comment says, puts the screenshots on the clipboard as one
  image (the same helper Claude Desktop uses).
- `notify(message)`: a Windows notification.

### `ServiceDesk`, its constructor and `ServiceDesk.pcDetails()`

<!-- code: apps/desktop/src/main/serviceDesk.ts#ServiceDesk.class -->

[`src/main/serviceDesk.ts`, lines 83–88](../../apps/desktop/src/main/serviceDesk.ts#L83-L88)

```ts
/**
 * Raising IT requests from the panel: the request is filled in here and finished on the help
 * centre portal, where the user is signed in as themselves (and can attach the screenshot, which
 * a link can't carry: it goes on the clipboard).
 */
export class ServiceDesk {
  // …
}
```

<!-- /code -->

<!-- code: apps/desktop/src/main/serviceDesk.ts#ServiceDesk.constructor,pcDetails -->

[`src/main/serviceDesk.ts`, lines 89–94](../../apps/desktop/src/main/serviceDesk.ts#L89-L94)

```ts
constructor(private readonly deps: ServiceDeskDeps) {}

/** What "Include PC details" adds, for the form to show. */
pcDetails(): string {
  return pcDetails(this.deps.pcInfo())
}
```

<!-- /code -->

- `constructor(private readonly deps: ServiceDeskDeps) {}`: keeps the deps as a field, with
  nothing else to do.
- `pcDetails()`: what **Include PC details** will add, which the form shows under the checkbox
  before anything is sent.

### `ServiceDesk.raise()`

<!-- code: apps/desktop/src/main/serviceDesk.ts#ServiceDesk.raise -->

[`src/main/serviceDesk.ts`, lines 96–130](../../apps/desktop/src/main/serviceDesk.ts#L96-L130)

```ts
async raise(request: NewRequest, attachments: Attachment[]): Promise<RaiseResult> {
  if (!request.summary.trim() && !request.details.trim()) return { ok: false, reason: 'empty' }
  if (!this.deps.requestTypeIds.includes(request.requestTypeId)) {
    return { ok: false, reason: 'failed' }
  }
  try {
    const paths = attachments.map((attachment) => attachment.path)
    if (paths.length > 0 && !(await this.deps.copyScreenshots(paths))) {
      return { ok: false, reason: 'missing-screenshot' }
    }
    const description = requestDescription(
      request.details,
      request.includePcDetails ? this.pcDetails() : null,
    )
    await this.deps.openLink(
      requestFormUrl({
        helpCentre: this.deps.helpCentre,
        portalId: this.deps.portalId,
        requestTypeId: request.requestTypeId,
        summary: request.summary,
        description,
      }),
    )
  } catch (error) {
    this.deps.onError?.(error)
    return { ok: false, reason: 'failed' }
  }
  if (attachments.length > 0) {
    this.deps.notify({
      title: attachments.length === 1 ? 'Screenshot copied' : 'Screenshots copied as one image',
      body: 'On the request form, click in the description and press Ctrl+V to add it.',
    })
  }
  return { ok: true, screenshots: attachments.length }
}
```

<!-- /code -->

**Continue on the portal**. `ipc.ts` passes the form's fields and the screenshots attached to the
text box.

- `if (!request.summary.trim() && !request.details.trim())`: a request needs a summary or details.
- `if (!this.deps.requestTypeIds.includes(request.requestTypeId))`: only the tenant's own request
  types; anything else is refused.
- `await this.deps.copyScreenshots(paths)`: the screenshots go on the clipboard first. If one is
  missing (deleted from the screenshots folder, say), nothing is opened and the form says so.
- `await this.deps.openLink(requestFormUrl({ ... }))`: the filled-in form opens in the browser.
- `catch (error)`: anything failing is logged and becomes `failed`.
- `this.deps.notify({ ... })`: with screenshots, a Windows notification says one is on the
  clipboard and how to add it: click in the description and press Ctrl+V. Several screenshots
  are joined into one image, and the title says so.
- `return { ok: true, screenshots: attachments.length }`: `ipc.ts` then closes the panel, as the
  browser comes to the front.

## What's tested

`tests/atlassian.test.ts` checks the readers with made-up answers, and runs `Atlassian` against a
fake Atlassian: a server with a user (Casey), an issue Sam assigned them, a mention by Mark, and
one IT request whose comments and status a test can change; a fake browser that "connects"; an
in-memory store and memory; and a fixed clock.

- Reading: issue keys in text, each once; only the words of a search, so a query can't break JQL
  or CQL; mentions and text from ADF; who assigned an issue, unless it was the user themselves;
  the comments that mention the user, by someone else, with the comment's start; a request's
  latest reply from a person, not the user or an automatic one; Confluence's results as plain
  text, only on the company's site; the user and the cloud ID of the configured site; and the
  prompt to Claude kept under the limit, dropping the oldest comments first.
- `Atlassian`: asking to connect when nobody has, without opening the browser; connecting in the
  browser, then showing who assigned or mentioned the user; remembering which notifications have
  been seen, and not asking about unchanged issues again; telling the user once when IT replies
  to their request, and marking it until they look; opening an issue with its comments, the
  statuses it can move to and its portal page; moving, commenting and logging time, each
  answering with the issue; searching Jira and Confluence, and finding an issue by its key; asking
  Claude with the issue's details in the prompt; and going back to Connect when the connection
  ends, and forgetting it on Disconnect.

`tests/serviceDesk.test.ts` checks the portal's form address for a request type, the PC details
under the description with the link kept a sensible length, and Windows 11 called by its name.
It runs `ServiceDesk` with fakes: opening the filled-in form with the screenshot copied to paste;
leaving the PC details out when asked, with no screenshot needed; and refusing an empty request,
an unknown request type and a missing screenshot.

`tests/tenants.test.ts` checks the request types (at least one, with numeric IDs, passed to the
panel through `Branding`); that the Jira icon needs `atlassian` with an `https` site, and that the
MCP server and knowledge spaces get their defaults; and that a developer's override can change one
Atlassian setting without resetting the others. The real Atlassian server and a real browser sign-in
aren't part of the unit tests.
