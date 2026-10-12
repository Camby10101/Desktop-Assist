# The Jira and service desk pages

[← Code Guide](CODE_GUIDE.md)

The renderer's side of [Jira and the service desk](11-atlassian.md): the pages that take the text
box's place in the card while the Jira icon or the service desk icon is on, and the issue view
that opens over them. `Panel` in `PanelView.tsx` decides which page shows and passes it what the
main process has reported: the Atlassian connection (`AtlassianState`) and the notifications and
requests (`JiraFeed`), both kept up to date by broadcasts (see [The pages](7-renderer-pages.md)).
Everything else the pages need, they ask for themselves through `window.assist.atlassian` and
`window.assist.serviceDesk` (see [Shared code and the preload bridge](1-shared-and-preload.md)).

Four files:

- `PageParts.tsx`: small pieces the pages share: a title row, tabs, icon buttons, a status pill,
  a grey note, and the Connect to Atlassian prompt.
- `JiraPage.tsx`: the Jira page, with its Notifications and Search tabs.
- `IssueView.tsx`: one issue, with Ask Claude, Move, Comment and Log time.
- `ServiceDeskPage.tsx`: the service desk page, with New request and My requests.

The pages are styled with Tailwind classes, like the rest of the panel (see
[The UI components](8-renderer-components.md)); only the ones that matter are explained here.

---

## `src/renderer/src/components/PageParts.tsx`: pieces the pages share

As the comment at the top says, these are shared by the pages that replace the text box, so the
Jira and service desk pages look alike.

### `PageHeader`

<!-- code: apps/desktop/src/renderer/src/components/PageParts.tsx#PageHeader -->

[`src/renderer/src/components/PageParts.tsx`, lines 6–18](../../apps/desktop/src/renderer/src/components/PageParts.tsx#L6-L18)

```tsx
// Pieces shared by the pages that replace the text box (Jira, the service desk).

/** A page's title row: its icon and name, then tabs or buttons. */
export function PageHeader(props: { icon: LucideIcon; title: string; children?: ReactNode }) {
  const Icon = props.icon
  return (
    <div className="flex shrink-0 items-center gap-2 px-3.5 pt-3 pb-2">
      <Icon size={15} className="text-accent dark:text-accent-soft" aria-hidden />
      <h2 className="text-sm font-semibold">{props.title}</h2>
      <div className="ml-auto flex items-center gap-1">{props.children}</div>
    </div>
  )
}
```

<!-- /code -->

A page's title row: its icon and name on the left, and whatever the page puts in it (tabs, a
Refresh button) on the right (`ml-auto` pushes them there).

- `icon: LucideIcon`: the icon component itself (such as `Bell`), not a drawn icon.
  `const Icon = props.icon` gives it a capitalised name, because JSX treats `<Icon />` as a
  component but `<icon />` as an HTML tag.
- `children?: ReactNode`: what's written between `<PageHeader>` and `</PageHeader>`.
- `shrink-0`: the row keeps its height when the page's list below fills the card.

### `Tabs`

<!-- code: apps/desktop/src/renderer/src/components/PageParts.tsx#Tabs -->

[`src/renderer/src/components/PageParts.tsx`, lines 20–56](../../apps/desktop/src/renderer/src/components/PageParts.tsx#L20-L56)

```tsx
/** A row of tabs; `badges` puts a count beside a tab's name. */
export function Tabs<T extends string>(props: {
  tabs: { id: T; label: string }[]
  current: T
  badges?: Partial<Record<T, number>>
  onChange: (tab: T) => void
}) {
  return (
    <div role="tablist" className="flex gap-1 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
      {props.tabs.map((tab) => {
        const badge = props.badges?.[tab.id] ?? 0
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === props.current}
            onClick={() => props.onChange(tab.id)}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
              tab.id === props.current
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200',
            )}
          >
            {tab.label}
            {badge > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-[10px] leading-4 text-white">
                {badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
```

<!-- /code -->

A row of tabs, as the comment says, with an optional count beside a tab's name.

- `Tabs<T extends string>`: a _generic_ component: `T` is whichever tab names the page uses (such
  as `'notifications' | 'search'`), so TypeScript checks that `current`, `badges` and `onChange`
  use only those.
- `badges?: Partial<Record<T, number>>`: a count for some of the tabs. `Partial` makes every tab's
  entry optional, so the Jira page can give just `{ notifications: unread }`.
- `role="tablist"`, `role="tab"`, `aria-selected`: tell screen readers these buttons are tabs, and
  which one is chosen.
- `{badge > 0 && (...)}`: the count, in a small accent-coloured circle, only when there's
  something to count.

### `IconButton`

<!-- code: apps/desktop/src/renderer/src/components/PageParts.tsx#IconButton -->

[`src/renderer/src/components/PageParts.tsx`, lines 58–79](../../apps/desktop/src/renderer/src/components/PageParts.tsx#L58-L79)

```tsx
/** A small round button with just an icon (Refresh, Back, Open in Jira). */
export function IconButton(props: {
  icon: LucideIcon
  label: string
  onClick: () => void
  disabled?: boolean
  spinning?: boolean
}) {
  const Icon = props.icon
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.label}
      aria-label={props.label}
      disabled={props.disabled}
      className="grid size-6 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
    >
      <Icon size={13} className={cn(props.spinning && 'animate-spin')} aria-hidden />
    </button>
  )
}
```

<!-- /code -->

A small button with just an icon, as the comment says.

- `title={props.label}`, `aria-label={props.label}`: the label shows as a tooltip, and is the
  button's name for screen readers.
- `spinning`: turns the icon (`animate-spin`) while the button's work is going on, such as a
  Refresh.
- `disabled:opacity-40`: a disabled button is faded.

### `STATUS_COLOURS` and `StatusPill`

<!-- code: apps/desktop/src/renderer/src/components/PageParts.tsx#STATUS_COLOURS,StatusPill -->

[`src/renderer/src/components/PageParts.tsx`, lines 81–100](../../apps/desktop/src/renderer/src/components/PageParts.tsx#L81-L100)

```tsx
const STATUS_COLOURS: Record<IssueStatus['category'], string> = {
  new: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200',
  indeterminate: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  done: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
}

/** An issue's status, coloured like Jira colours it. */
export function StatusPill({ status }: { status: IssueStatus }) {
  return (
    <span
      className={cn(
        'inline-block max-w-32 shrink-0 truncate rounded px-1.5 py-px text-[10px] font-semibold uppercase',
        STATUS_COLOURS[status.category],
      )}
      title={status.name}
    >
      {status.name}
    </span>
  )
}
```

<!-- /code -->

An issue's status as a small coloured label, like Jira's: grey for to do (`new`), blue for in
progress (`indeterminate`), green for done. Each colour has a darker version for dark mode
(`dark:`).

- `Record<IssueStatus['category'], string>`: one set of classes for each of the three categories;
  TypeScript complains if one is missing.
- `max-w-32 truncate`, `title={status.name}`: a long status name is cut short with `…`, and the
  whole name shows on hovering.

### `Note` and `TextButton`

<!-- code: apps/desktop/src/renderer/src/components/PageParts.tsx#Note,TextButton -->

[`src/renderer/src/components/PageParts.tsx`, lines 102–124](../../apps/desktop/src/renderer/src/components/PageParts.tsx#L102-L124)

```tsx
/** A line of grey text, with a spinner if it's waiting on something. */
export function Note(props: { spinner?: boolean; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start gap-2 px-3.5 pb-3 text-xs text-zinc-500">
      {props.spinner && <LoaderCircle size={14} className="shrink-0 animate-spin" aria-hidden />}
      <p className="flex-1">{props.children}</p>
      {props.action}
    </div>
  )
}

/** A small text button in the accent colour (Retry, Cancel). */
export function TextButton(props: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="shrink-0 rounded-md px-1.5 py-0.5 font-medium text-accent hover:bg-zinc-100 dark:text-accent-soft dark:hover:bg-zinc-800"
    >
      {props.children}
    </button>
  )
}
```

<!-- /code -->

- `Note`: a line of grey text, the pages' way of saying "loading", "nothing here" or what went
  wrong. `spinner` adds a turning circle in front; `action` puts a button (such as Retry) at the
  end.
- `TextButton`: a small text-only button in the accent colour, for the `action` of a note.

### `AtlassianConnect`

<!-- code: apps/desktop/src/renderer/src/components/PageParts.tsx#AtlassianConnect -->

[`src/renderer/src/components/PageParts.tsx`, lines 126–177](../../apps/desktop/src/renderer/src/components/PageParts.tsx#L126-L177)

```tsx
/**
 * Connecting to Atlassian, in place of a page's content until it's connected: the button that
 * starts it in the browser, waiting for the browser, or what went wrong.
 */
export function AtlassianConnect(props: {
  state: AtlassianState
  appName: string
  /** What connecting shows, e.g. "who assigned you issues or mentioned you". */
  purpose: string
}) {
  const { state } = props
  if (state.status === 'loading') return <Note spinner>Connecting to Atlassian…</Note>
  if (state.status === 'signing-in') {
    return (
      <Note
        spinner
        action={
          <TextButton onClick={() => void window.assist.atlassian.cancelSignIn()}>
            Cancel
          </TextButton>
        }
      >
        Finish connecting in your browser…
      </Note>
    )
  }
  if (state.status === 'error') {
    return (
      <Note
        action={<TextButton onClick={() => void window.assist.atlassian.retry()}>Retry</TextButton>}
      >
        {state.message}
      </Note>
    )
  }
  if (state.status !== 'sign-in') return null
  return (
    <div className="space-y-2 px-3.5 pb-3">
      <p className="text-xs text-zinc-500">
        {state.message ??
          `Connect ${props.appName} to Atlassian once to see ${props.purpose}. You'll sign in with your work account in your browser.`}
      </p>
      <button
        type="button"
        onClick={() => void window.assist.atlassian.signIn()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white"
      >
        <LogIn size={13} aria-hidden /> Connect to Atlassian
      </button>
    </div>
  )
}
```

<!-- /code -->

What a page shows instead of its content until the user is connected to Atlassian, for each
state the main process can report:

- `loading`: "Connecting to Atlassian…" with a spinner, while `Atlassian.init()` tries a saved
  connection.
- `signing-in`: "Finish connecting in your browser…", with Cancel
  (`window.assist.atlassian.cancelSignIn()`).
- `error`: the message, with Retry (`atlassian.retry()`).
- `if (state.status !== 'sign-in') return null`: `connected` shows nothing; the page shows its
  content instead.
- `sign-in`: a sentence saying what connecting is for, then **Connect to Atlassian**
  (`atlassian.signIn()`). `state.message ?? ...`: when the connection has ended, or the last try
  failed, the main process's message replaces the sentence. `purpose` fills in the sentence, as
  the comment says, so each page explains itself ("...to see your IT requests, and when IT
  replies").

## `src/renderer/src/components/JiraPage.tsx`: the Jira page

The page behind the Jira icon (a bell). `Panel` shows it while `view` is `'jira'`, and opens an
issue over it when one is clicked.

### `Tab`, `MARK_READ_AFTER_MS` and `SEARCH_DELAY_MS`

<!-- code: apps/desktop/src/renderer/src/components/JiraPage.tsx#Tab,MARK_READ_AFTER_MS,SEARCH_DELAY_MS -->

[`src/renderer/src/components/JiraPage.tsx`, lines 16–21](../../apps/desktop/src/renderer/src/components/JiraPage.tsx#L16-L21)

```tsx
type Tab = 'notifications' | 'search'

/** How long the unread dots stay after the Notifications tab opens, before they're marked seen. */
const MARK_READ_AFTER_MS = 2000

/** Typing pauses this long before searching. */
const SEARCH_DELAY_MS = 350
```

<!-- /code -->

- `Tab`: the page's two tabs.
- `MARK_READ_AFTER_MS`: as the comment says, the dots on new notifications stay for 2 seconds after
  the tab opens, so the user sees what's new before it counts as seen.
- `SEARCH_DELAY_MS`: searching waits until typing has paused for 350 ms, so each key press doesn't
  send a search.

### `JiraPage`

<!-- code: apps/desktop/src/renderer/src/components/JiraPage.tsx#JiraPage -->

[`src/renderer/src/components/JiraPage.tsx`, lines 23–117](../../apps/desktop/src/renderer/src/components/JiraPage.tsx#L23-L117)

```tsx
/**
 * The Jira page, in the card while the Jira icon is on: who else assigned the user an issue or
 * mentioned them lately, and a search of Jira and Confluence. Opening an issue shows it here.
 */
export function JiraPage(props: {
  open: boolean
  state: AtlassianState
  feed: JiraFeed
  appName: string
  site: string
  onOpenIssue: (key: string) => void
}) {
  const [tab, setTab] = useState<Tab>('notifications')
  const [refreshing, setRefreshing] = useState(false)
  const connected = props.state.status === 'connected'
  const { notifications } = props.feed
  const unread = notifications.items.filter((n) => n.unread).length

  // Ask for the latest whenever the page shows (the main process skips it if it's recent).
  useEffect(() => {
    if (props.open && connected) void window.assist.atlassian.feed()
  }, [props.open, connected])

  // The dots show what's new for a moment, then it all counts as seen.
  useEffect(() => {
    if (!props.open || tab !== 'notifications' || unread === 0) return
    const timer = setTimeout(
      () => void window.assist.atlassian.markNotificationsRead(),
      MARK_READ_AFTER_MS,
    )
    return () => clearTimeout(timer)
  }, [props.open, tab, unread])

  async function refresh() {
    setRefreshing(true)
    await window.assist.atlassian.feed(true).finally(() => setRefreshing(false))
  }

  return (
    <div className="flex min-h-0 flex-col">
      <PageHeader icon={Bell} title="Jira">
        <Tabs
          tabs={[
            { id: 'notifications', label: 'Notifications' },
            { id: 'search', label: 'Search' },
          ]}
          current={tab}
          badges={{ notifications: unread }}
          onChange={setTab}
        />
        {connected && tab === 'notifications' && (
          <IconButton
            icon={RotateCw}
            label="Refresh"
            onClick={() => void refresh()}
            disabled={refreshing}
            spinning={refreshing}
          />
        )}
      </PageHeader>

      {!connected ? (
        <AtlassianConnect
          state={props.state}
          appName={props.appName}
          purpose={
            tab === 'notifications'
              ? 'who assigned you issues or mentioned you'
              : 'search results from Jira and Confluence'
          }
        />
      ) : tab === 'notifications' ? (
        <NotificationList
          list={notifications}
          onOpenIssue={props.onOpenIssue}
          onRetry={() => void refresh()}
        />
      ) : (
        <SearchTab open={props.open} onOpenIssue={props.onOpenIssue} />
      )}

      <div className="shrink-0 border-t border-black/5 px-2 py-1.5 dark:border-white/10">
        <button
          type="button"
          onClick={() =>
            void window.assist.openExternal(`${new URL(props.site).origin}/jira/your-work`)
          }
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
        >
          <ExternalLink size={13} aria-hidden /> Open Jira
        </button>
      </div>
    </div>
  )
}
```

<!-- /code -->

The page itself, with the comment that sums it up.

- `open`: whether the panel is open. The page can be in the card while the panel is hidden (while
  a screenshot is taken, say), so this says when it's actually on screen.
- `site`: the company's Atlassian site, for **Open Jira**.
- `const unread = notifications.items.filter((n) => n.unread).length`: how many notifications have
  a dot, for the tab's badge.
- The first `useEffect`: as its comment says, whenever the page shows (and is connected) it asks
  for the latest (`atlassian.feed()`). The main process answers from memory if it checked less
  than a minute ago; either way the answer also arrives through the `assist:jira-feed` broadcast,
  which `Panel` passes back in as `feed`.
- The second `useEffect`: while the Notifications tab is on screen with something unread, a timer
  marks everything seen after 2 seconds (`atlassian.markNotificationsRead()`). The function it
  returns clears the timer, so switching tab or closing the panel sooner leaves the dots for next
  time.
- `refresh()`: the Refresh button (and Retry): `feed(true)` checks again even if the last check
  was recent. `refreshing` turns the button's icon meanwhile; `.finally()` stops it whether the
  check worked or not.
- `{connected && tab === 'notifications' && (<IconButton ... />)}`: Refresh only makes sense for
  the notifications, and only when connected.
- `{!connected ? (<AtlassianConnect ... />) : tab === 'notifications' ? (...) : (...)}`: until
  connected, the Connect prompt, with a `purpose` for whichever tab is chosen; then the tab's
  content.
- `` `${new URL(props.site).origin}/jira/your-work` ``: **Open Jira** opens Jira's "Your work"
  page in the browser.

### `NotificationList`

<!-- code: apps/desktop/src/renderer/src/components/JiraPage.tsx#NotificationList -->

[`src/renderer/src/components/JiraPage.tsx`, lines 119–149](../../apps/desktop/src/renderer/src/components/JiraPage.tsx#L119-L149)

```tsx
function NotificationList(props: {
  list: JiraFeed['notifications']
  onOpenIssue: (key: string) => void
  onRetry: () => void
}) {
  const { list } = props
  if (list.status === 'loading' && list.items.length === 0) {
    return <Note spinner>Looking for anything new…</Note>
  }
  return (
    <>
      {list.status === 'error' && (
        <Note action={<TextButton onClick={props.onRetry}>Retry</TextButton>}>{list.message}</Note>
      )}
      {list.items.length === 0 && list.status === 'ready' && (
        <Note>
          Nothing new in the last two weeks: nobody else has assigned you an issue or mentioned you.
        </Note>
      )}
      {list.items.length > 0 && (
        <ul className="min-h-0 overflow-y-auto px-1.5 pb-1.5" aria-label="Notifications">
          {list.items.map((n) => (
            <li key={n.id}>
              <NotificationRow notification={n} onOpen={() => props.onOpenIssue(n.key)} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
```

<!-- /code -->

The Notifications tab.

- `list.status === 'loading' && list.items.length === 0`: the first check: "Looking for anything
  new…".
- `list.status === 'error'`: the reason, with Retry. As `failedList()` in the main process keeps
  the previous notifications, they still show below it.
- `list.items.length === 0 && list.status === 'ready'`: nothing in the last two weeks, said in
  full so the user knows what the tab is for.
- `overflow-y-auto`: a long list scrolls inside the card.

### `NotificationRow`

<!-- code: apps/desktop/src/renderer/src/components/JiraPage.tsx#NotificationRow -->

[`src/renderer/src/components/JiraPage.tsx`, lines 151–192](../../apps/desktop/src/renderer/src/components/JiraPage.tsx#L151-L192)

```tsx
function NotificationRow({
  notification: n,
  onOpen,
}: {
  notification: JiraNotification
  onOpen: () => void
}) {
  const Icon = n.kind === 'assigned' ? UserPlus : AtSign
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
    >
      <span className="relative mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent/10 text-accent dark:text-accent-soft">
        <Icon size={14} aria-hidden />
        {n.unread && (
          <span
            aria-label="New"
            className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-white bg-accent dark:border-zinc-900"
          />
        )}
      </span>
      <span className="min-w-0 flex-1 text-xs">
        <span className="flex items-baseline gap-2">
          <span className={cn('min-w-0 flex-1 truncate', n.unread && 'font-semibold')}>
            {n.by} {n.kind === 'assigned' ? 'assigned you' : 'mentioned you'}
          </span>
          <span className="shrink-0 text-[11px] text-zinc-500">{timeAgo(n.at)}</span>
        </span>
        <span className="block truncate text-zinc-500">
          <span className="font-medium text-zinc-600 dark:text-zinc-300">{n.key}</span> {n.summary}
        </span>
        {n.excerpt && (
          <span className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500 italic">
            “{n.excerpt}”
          </span>
        )}
      </span>
    </button>
  )
}
```

<!-- /code -->

One notification, as a button that opens its issue.

- `notification: n`: renames the prop to `n` for this function, to keep the lines short.
- `const Icon = n.kind === 'assigned' ? UserPlus : AtSign`: a person with a plus for an
  assignment, `@` for a mention.
- `{n.unread && (<span aria-label="New" ... />)}`: the dot, on the icon's top-right corner
  (`absolute -top-0.5 -right-0.5`). Its white border (`border-2 border-white`) separates it from
  the icon.
- `n.unread && 'font-semibold'`: a new notification's first line is bold too.
- `{n.by} {n.kind === 'assigned' ? 'assigned you' : 'mentioned you'}`: "Sam Bolin assigned you".
- `timeAgo(n.at)`: from `src/shared/format.ts`: "5m ago", "2d ago" and so on.
- `{n.key}` then `{n.summary}`: the issue, on one line, cut short if it's long (`truncate`).
- `n.excerpt`: for a mention, the start of the comment, in quotes, on up to two lines
  (`line-clamp-2`).

### `SearchTab`

<!-- code: apps/desktop/src/renderer/src/components/JiraPage.tsx#SearchTab -->

[`src/renderer/src/components/JiraPage.tsx`, lines 194–304](../../apps/desktop/src/renderer/src/components/JiraPage.tsx#L194-L304)

```tsx
function SearchTab(props: { open: boolean; onOpenIssue: (key: string) => void }) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<SearchResult | null>(null)
  const [searching, setSearching] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (props.open) input.current?.focus()
  }, [props.open])

  const q = query.trim()
  // Results only show for a query long enough to search.
  const shown = q.length >= 2 ? result : null
  useEffect(() => {
    if (q.length < 2) return
    let alive = true
    const timer = setTimeout(() => {
      setSearching(true)
      void window.assist.atlassian
        .search(q)
        .then((found) => alive && setResult(found))
        .finally(() => alive && setSearching(false))
    }, SEARCH_DELAY_MS)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [q])

  return (
    <div className="flex min-h-0 flex-col">
      <label className="mx-3 mb-2 flex shrink-0 items-center gap-2 rounded-lg bg-zinc-100 px-2.5 py-1.5 dark:bg-zinc-800">
        <Search
          size={13}
          className={cn('text-zinc-400', searching && 'animate-pulse')}
          aria-hidden
        />
        <input
          ref={input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Jira and Confluence, or type an issue key"
          aria-label="Search Jira and Confluence"
          className="w-full bg-transparent text-xs outline-none placeholder:text-zinc-400"
        />
      </label>
      {shown && !shown.ok && <Note>{shown.message}</Note>}
      {shown?.ok && shown.issues.length === 0 && shown.pages.length === 0 && !searching && (
        <Note>Nothing matches “{query.trim()}”.</Note>
      )}
      {shown?.ok && (shown.issues.length > 0 || shown.pages.length > 0) && (
        <div className="min-h-0 overflow-y-auto px-1.5 pb-1.5">
          {shown.issues.length > 0 && (
            <section aria-label="Jira issues">
              <h3 className="px-2 pt-1 pb-0.5 text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">
                Jira
              </h3>
              <ul>
                {shown.issues.map((issue) => (
                  <li key={issue.key}>
                    <button
                      type="button"
                      onClick={() => props.onOpenIssue(issue.key)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <span className="shrink-0 font-medium text-zinc-500">{issue.key}</span>
                      <span className="min-w-0 flex-1 truncate">{issue.summary}</span>
                      <StatusPill status={issue.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {shown.pages.length > 0 && (
            <section aria-label="Confluence pages">
              <h3 className="px-2 pt-2 pb-0.5 text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">
                Confluence
              </h3>
              <ul>
                {shown.pages.map((page) => (
                  <li key={page.id}>
                    <button
                      type="button"
                      onClick={() => void window.assist.openExternal(page.url)}
                      title={`Open ${page.title} in Confluence`}
                      className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <BookOpen size={13} className="mt-0.5 shrink-0 text-zinc-400" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{page.title}</span>
                        {page.excerpt && (
                          <span className="line-clamp-2 text-[11px] text-zinc-500">
                            {page.excerpt}
                          </span>
                        )}
                        {page.space && (
                          <span className="block text-[10px] text-zinc-400">{page.space}</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
```

<!-- /code -->

The Search tab: a search box, then the Jira issues and Confluence pages that match.

- `useEffect(() => { if (props.open) input.current?.focus() }, [props.open])`: the cursor is in
  the search box when the tab shows, so the user can just type.
- `const shown = q.length >= 2 ? result : null`: as the comment says, results only show for a
  query of two characters or more. Shortening the query hides the old results without throwing
  them away.
- The `useEffect` on `[q]`: each change of the query starts a 350 ms timer; the function it
  returns cancels the timer if the query changes again first, so only a pause sends a search
  (`atlassian.search(q)`). `alive` goes `false` when the query changes, so an answer that arrives
  late, for an old query, is ignored.
- `searching && 'animate-pulse'`: the magnifying glass pulses while a search is out.
- `shown && !shown.ok`: the search failed: its message.
- `shown?.ok && shown.issues.length === 0 && shown.pages.length === 0 && !searching`: nothing
  matches. `?.` reads `ok` only if there's a result at all.
- Under **Jira**, each issue is a button that opens it in the card (`onOpenIssue`), with its key,
  summary and `StatusPill`.
- Under **Confluence**, each page is a button that opens it in the browser
  (`window.assist.openExternal(page.url)`), with its title, a snippet and its space. The main
  process only lets through pages on the company's site.

## `src/renderer/src/components/IssueView.tsx`: one issue

One Jira issue, shown in the card over the page it was opened from (Notifications, Search or My
requests), or from the Open button above the text box. `Panel` gives it `key={issueKey}`, so
opening another issue makes a new `IssueView` rather than reusing this one.

### `PROMPTS` and `TIME_SPENT`

<!-- code: apps/desktop/src/renderer/src/components/IssueView.tsx#PROMPTS,TIME_SPENT -->

[`src/renderer/src/components/IssueView.tsx`, lines 18–25](../../apps/desktop/src/renderer/src/components/IssueView.tsx#L18-L25)

```tsx
const PROMPTS: { id: IssuePrompt; label: string }[] = [
  { id: 'summarise', label: 'Summarise' },
  { id: 'reply', label: 'Draft a reply' },
  { id: 'next-steps', label: 'Next steps' },
]

/** Jira's time format, as the main process accepts it. */
const TIME_SPENT = /^(?=.*\d)(\d{1,3}w ?)?(\d{1,3}d ?)?(\d{1,3}h ?)?(\d{1,4}m)?$/
```

<!-- /code -->

- `PROMPTS`: the three **Ask Claude** buttons: the request each one sends (an `IssuePrompt`) and
  its label. The words sent to Claude are in the main process (`INSTRUCTIONS` in `jiraData.ts`).
- `TIME_SPENT`: as the comment says, Jira's way of writing time, the same pattern `ipc.ts` checks
  (`TimeSpent`): weeks, days, hours and minutes, each optional and in that order, such as `30m`,
  `1h 30m` or `2d`. `(?=.*\d)` at the start is a _lookahead_: it checks there's a digit somewhere
  without using it up, so an empty box doesn't match. Checking here too means a mistake is
  explained straight away, without a trip to Atlassian.

### `IssueView`

<!-- code: apps/desktop/src/renderer/src/components/IssueView.tsx#IssueView -->

[`src/renderer/src/components/IssueView.tsx`, lines 27–270](../../apps/desktop/src/renderer/src/components/IssueView.tsx#L27-L270)

```tsx
/**
 * One Jira issue: its status, description and latest comments, with what can be done from here:
 * asking Claude about it, moving it to another status, commenting, and logging time.
 */
export function IssueView(props: {
  issueKey: string
  /** Asking Claude goes to Claude Desktop (the panel closes) rather than the chat here. */
  inClaudeDesktop: boolean
  onBack: () => void
  /** The question went to the chat in the panel: show it. */
  onAskedInChat: () => void
  showToast: (text: string, tone?: 'info' | 'error') => void
}) {
  const { issueKey, showToast } = props
  const [result, setResult] = useState<IssueResult | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [editor, setEditor] = useState<'comment' | 'time' | 'move' | null>(null)
  const [comment, setComment] = useState('')
  const [timeSpent, setTimeSpent] = useState('')

  const load = useCallback(async () => {
    setResult(null)
    setResult(await window.assist.atlassian.issue(issueKey))
  }, [issueKey])

  // A new key gets a new IssueView (PanelView keys it), so this only runs once per issue.
  useEffect(() => {
    let alive = true
    void window.assist.atlassian.issue(issueKey).then((loaded) => {
      if (alive) setResult(loaded)
    })
    return () => {
      alive = false
    }
  }, [issueKey])

  /** Runs a change; on success shows the issue as it is now, and says what happened. */
  async function change(name: string, run: () => Promise<IssueResult>, done: string) {
    setBusy(name)
    const changed = await run().finally(() => setBusy(null))
    if (changed.ok) {
      setResult(changed)
      setEditor(null)
      showToast(done)
    } else {
      showToast(changed.message, 'error')
    }
    return changed.ok
  }

  async function ask(prompt: IssuePrompt) {
    setBusy(prompt)
    const asked = await window.assist.atlassian.ask(issueKey, prompt).finally(() => setBusy(null))
    if (!asked.ok) showToast(asked.message, 'error')
    else if (asked.inChat) props.onAskedInChat()
  }

  const issue = result?.ok ? result.issue : null

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 px-2.5 pt-2.5 pb-1.5">
        <IconButton icon={ArrowLeft} label="Back" onClick={props.onBack} />
        <span className="text-xs font-semibold text-zinc-500">{issueKey}</span>
        <div className="ml-auto flex items-center gap-1">
          <IconButton icon={RotateCw} label="Refresh" onClick={() => void load()} />
          {issue?.portalUrl && (
            <IconButton
              icon={Headset}
              label="Open on the service desk portal"
              onClick={() => void window.assist.openExternal(issue.portalUrl!)}
            />
          )}
          {issue && (
            <IconButton
              icon={ExternalLink}
              label="Open in Jira"
              onClick={() => void window.assist.openExternal(issue.url)}
            />
          )}
        </div>
      </div>

      {!result && <Note spinner>Opening {issueKey}…</Note>}
      {result && !result.ok && (
        <Note action={<TextButton onClick={() => void load()}>Retry</TextButton>}>
          {result.message}
        </Note>
      )}

      {issue && (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-2">
            <h2 className="text-sm leading-snug font-semibold">{issue.summary}</h2>
            <Meta issue={issue} />
            {issue.description && (
              <div className="mt-2 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-xs dark:bg-zinc-800/60">
                <Markdown text={issue.description} />
              </div>
            )}
            {issue.comments.length > 0 && (
              <ol className="mt-3 space-y-2" aria-label="Latest comments">
                {issue.comments.map((c) => (
                  <li key={c.id} className="text-xs">
                    <p className="text-[11px] text-zinc-500">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">
                        {c.author}
                      </span>{' '}
                      · {timeAgo(c.created)}
                    </p>
                    <div className="mt-0.5">
                      <Markdown text={c.body || '(no text)'} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="shrink-0 space-y-2 border-t border-black/5 px-2.5 py-2 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-1">
              <Sparkles size={13} className="mx-1 text-accent dark:text-accent-soft" aria-hidden />
              <span className="sr-only">Ask Claude:</span>
              {PROMPTS.map((p) => (
                <Chip
                  key={p.id}
                  onClick={() => void ask(p.id)}
                  busy={busy === p.id}
                  disabled={busy !== null}
                  title={
                    props.inClaudeDesktop
                      ? `Ask Claude (opens in Claude Desktop): ${p.label}`
                      : `Ask Claude: ${p.label}`
                  }
                >
                  {p.label}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {issue.transitions.length > 0 && (
                <Chip
                  onClick={() => setEditor(editor === 'move' ? null : 'move')}
                  pressed={editor === 'move'}
                >
                  <ArrowRightLeft size={12} aria-hidden /> Move
                </Chip>
              )}
              <Chip
                onClick={() => setEditor(editor === 'comment' ? null : 'comment')}
                pressed={editor === 'comment'}
              >
                <MessageSquarePlus size={12} aria-hidden /> Comment
              </Chip>
              <Chip
                onClick={() => setEditor(editor === 'time' ? null : 'time')}
                pressed={editor === 'time'}
              >
                <Clock size={12} aria-hidden /> Log time
              </Chip>
            </div>

            {editor === 'move' && (
              <div className="flex flex-wrap gap-1" role="group" aria-label="Move to">
                {issue.transitions.map((t) => (
                  <Chip
                    key={t.id}
                    busy={busy === `move-${t.id}`}
                    disabled={busy !== null}
                    onClick={() =>
                      void change(
                        `move-${t.id}`,
                        () => window.assist.atlassian.transition(issueKey, t.id),
                        `${issueKey}: ${t.name}`,
                      )
                    }
                  >
                    {t.name}
                  </Chip>
                ))}
              </div>
            )}
            {editor === 'comment' && (
              <form
                className="space-y-1.5"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!comment.trim()) return
                  void change(
                    'comment',
                    () => window.assist.atlassian.comment(issueKey, comment.trim()),
                    'Comment added',
                  ).then((ok) => ok && setComment(''))
                }}
              >
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder={`Comment on ${issueKey}…`}
                  aria-label="Comment"
                  autoFocus
                  className="block max-h-28 min-h-14 w-full resize-none rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs outline-none field-sizing-content placeholder:text-zinc-400 dark:bg-zinc-800"
                />
                <SubmitRow busy={busy === 'comment'} disabled={!comment.trim() || busy !== null}>
                  Post comment
                </SubmitRow>
              </form>
            )}
            {editor === 'time' && (
              <form
                className="flex items-center gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault()
                  const spent = timeSpent.trim()
                  if (!TIME_SPENT.test(spent)) {
                    showToast('Write the time like 30m, 1h 30m or 2d.', 'error')
                    return
                  }
                  void change(
                    'time',
                    () => window.assist.atlassian.logWork(issueKey, spent),
                    `Logged ${spent} on ${issueKey}`,
                  ).then((ok) => ok && setTimeSpent(''))
                }}
              >
                <input
                  value={timeSpent}
                  onChange={(event) => setTimeSpent(event.target.value)}
                  placeholder="e.g. 30m or 1h 30m"
                  aria-label="Time spent"
                  autoFocus
                  className="min-w-0 flex-1 rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs outline-none placeholder:text-zinc-400 dark:bg-zinc-800"
                />
                <SubmitRow busy={busy === 'time'} disabled={!timeSpent.trim() || busy !== null}>
                  Log
                </SubmitRow>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  )
}
```

<!-- /code -->

The issue, with the comment that sums it up.

- `inClaudeDesktop`, `onAskedInChat`: as their comments say, where Ask Claude's question goes.
  With Claude Desktop the panel closes; with the built-in chat, `Panel` closes the issue and shows
  the chat, where Claude's answer arrives.
- `result`: the issue as last loaded (`IssueResult`), or `null` while it's loading.
- `busy`: which button's work is under way: an Ask Claude prompt, `'comment'`, `'time'` or
  `move-` and a transition's ID. That button pulses, and the others wait.
- `editor`: which of Move, Comment and Log time is open below the buttons, if any.
- `comment`, `timeSpent`: what's typed in those editors.
- `load`: Refresh and Retry: clears the issue (so the spinner shows) and asks again.
  `useCallback` keeps the same function between renders while `issueKey` is the same.
- The `useEffect`: loads the issue when the view appears. As its comment says, a new key means a
  new `IssueView`, so this runs once per issue. `alive` ignores an answer that arrives after the
  view has gone.
- `change(name, run, done)`: as its comment says, runs one change (move, comment or log time). On
  success the main process answers with the issue as it is now, which replaces the one shown;
  the editor closes, and a toast says what happened ("ISD-12: Done", "Comment added"). A failure
  shows the main process's message. It returns whether it worked, so the comment and time boxes
  are only emptied on success.
- `ask(prompt)`: an Ask Claude button: `atlassian.ask(issueKey, prompt)`. With Claude Desktop, the
  main process closes the panel on success, so there's nothing more to do here; `asked.inChat`
  means it went to the built-in chat instead.
- `const issue = result?.ok ? result.issue : null`: the issue, once it has loaded successfully.
- The header: Back, the key, then Refresh, **Open on the service desk portal** (only for the
  user's requests, which have a `portalUrl`) and **Open in Jira**. `issue.portalUrl!`: the `!`
  tells TypeScript it isn't `null`, which the `issue?.portalUrl &&` around it has checked, but
  TypeScript doesn't carry that check into the click function.
- `{!result && <Note spinner>Opening {issueKey}…</Note>}`, then a failure's message with Retry.
- The body scrolls (`min-h-0 flex-1 overflow-y-auto`): the summary as a heading, the `Meta` line,
  the description, and the latest comments, oldest first, each with its author and how long ago.
  The description and comments come as Markdown and are drawn by `Markdown`, the same component
  as Claude's replies (see [The UI components](8-renderer-components.md)).
- The actions stay at the bottom (`shrink-0 ... border-t`). First the Ask Claude chips, after a
  sparkle icon, with "Ask Claude:" for screen readers only (`sr-only`). Their tooltip says when
  the question opens in Claude Desktop.
- `{issue.transitions.length > 0 && (...)}`: **Move** only when the issue can move somewhere.
  Each of Move, Comment and Log time opens its editor, or closes it if it's already open
  (`editor === 'move' ? null : 'move'`), and shows as pressed while open.
- `editor === 'move'`: a chip for each transition; clicking one makes it
  (`atlassian.transition()`).
- `editor === 'comment'`: a form with a text area (`autoFocus` puts the cursor in it;
  `field-sizing-content` makes it grow with the text, up to `max-h-28`). Submitting posts the
  trimmed comment. `event.preventDefault()` stops the browser's own form submission, which would
  reload the page.
- `editor === 'time'`: a form with one box. `TIME_SPENT.test(spent)` checks the time first, and a
  toast shows how to write it if it's wrong; otherwise `atlassian.logWork()`.

### `Meta`

<!-- code: apps/desktop/src/renderer/src/components/IssueView.tsx#Meta -->

[`src/renderer/src/components/IssueView.tsx`, lines 272–287](../../apps/desktop/src/renderer/src/components/IssueView.tsx#L272-L287)

```tsx
function Meta({ issue }: { issue: IssueDetail }) {
  const parts = [
    issue.type,
    issue.assignee ? `Assigned to ${issue.assignee}` : 'Unassigned',
    issue.reporter && `Reported by ${issue.reporter}`,
    `updated ${timeAgo(issue.updated)}`,
  ].filter(Boolean)
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-zinc-500">
      <StatusPill status={issue.status} />
      {parts.map((part) => (
        <span key={part}>· {part}</span>
      ))}
    </div>
  )
}
```

<!-- /code -->

The line under the summary: the status pill, then the type, who it's assigned to (or
"Unassigned"), who reported it, and when it was last updated, each after a `·`.
`.filter(Boolean)` drops the parts that are missing (an issue with no type, say).

### `Chip` and `SubmitRow`

<!-- code: apps/desktop/src/renderer/src/components/IssueView.tsx#Chip,SubmitRow -->

[`src/renderer/src/components/IssueView.tsx`, lines 289–334](../../apps/desktop/src/renderer/src/components/IssueView.tsx#L289-L334)

```tsx
function Chip(props: {
  onClick: () => void
  children: ReactNode
  busy?: boolean
  disabled?: boolean
  pressed?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-pressed={props.pressed}
      aria-busy={props.busy}
      title={props.title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium disabled:opacity-50',
        props.pressed
          ? 'border-transparent bg-accent text-white'
          : 'border-black/10 text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800',
        props.busy && 'animate-pulse',
      )}
    >
      {props.children}
    </button>
  )
}

function SubmitRow(props: { busy: boolean; disabled: boolean; children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <button
        type="submit"
        disabled={props.disabled}
        aria-busy={props.busy}
        className={cn(
          'rounded-full bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-40',
          props.busy && 'animate-pulse',
        )}
      >
        {props.children}
      </button>
    </div>
  )
}
```

<!-- /code -->

- `Chip`: the round-ended buttons. `pressed` fills it with the accent colour (and sets
  `aria-pressed`, so screen readers say it's on); `busy` makes it pulse (and sets `aria-busy`).
- `SubmitRow`: a form's submit button, on the right. `type="submit"` means clicking it (or
  pressing Enter in the time box) submits the form.

## `src/renderer/src/components/ServiceDeskPage.tsx`: the service desk page

The page behind the service desk icon, when the tenant lists request types (otherwise the icon
just opens the portal). `Panel` shows it while `view` is `'servicedesk'`; **Report to IT** under
the text box opens it too.

### `ServiceDeskTab`, `RAISE_ERRORS` and `ARTICLES_DELAY_MS`

<!-- code: apps/desktop/src/renderer/src/components/ServiceDeskPage.tsx#ServiceDeskTab,RAISE_ERRORS,ARTICLES_DELAY_MS -->

[`src/renderer/src/components/ServiceDeskPage.tsx`, lines 23–33](../../apps/desktop/src/renderer/src/components/ServiceDeskPage.tsx#L23-L33)

```tsx
export type ServiceDeskTab = 'new' | 'mine'

/** What to say when the portal's form couldn't be opened. */
const RAISE_ERRORS: Record<Extract<RaiseResult, { ok: false }>['reason'], string> = {
  empty: 'Say what the problem is first.',
  'missing-screenshot': 'An attached screenshot is missing. Remove it and try again.',
  failed: "Couldn't open the service desk. Try again.",
}

/** Typing pauses this long before looking for articles. */
const ARTICLES_DELAY_MS = 600
```

<!-- /code -->

- `ServiceDeskTab`: the page's two tabs, exported because `Panel` chooses which one it opens on.
- `RAISE_ERRORS`: as the comment says, what to say for each way raising can fail. The type picks
  the `reason`s of `RaiseResult`'s failures, so TypeScript makes sure each has a message.
- `ARTICLES_DELAY_MS`: looking for articles waits until typing has paused for 600 ms.

### `ServiceDeskPage`

<!-- code: apps/desktop/src/renderer/src/components/ServiceDeskPage.tsx#ServiceDeskPage -->

[`src/renderer/src/components/ServiceDeskPage.tsx`, lines 35–104](../../apps/desktop/src/renderer/src/components/ServiceDeskPage.tsx#L35-L104)

```tsx
/**
 * The service desk page, in the card while the service desk icon is on: a new request, filled
 * in from what's in the text box and finished on the help centre portal (with helpful articles
 * while typing), and the user's own requests, marked when IT has replied or changed them.
 */
export function ServiceDeskPage(props: {
  open: boolean
  initialTab: ServiceDeskTab
  requestTypes: RequestType[]
  /** The Atlassian connection for My requests and articles, or null when there's none. */
  atlassian: AtlassianState | null
  feed: JiraFeed
  appName: string
  /** The text box's words, to start the request from. */
  draft: string
  attachments: Attachment[]
  onAttachLatest: () => void
  onOpenAttachment: (attachment: Attachment) => void
  onRemoveAttachment: (attachment: Attachment) => void
  onOpenIssue: (key: string) => void
  showToast: (text: string, tone?: 'info' | 'error') => void
}) {
  const [tab, setTab] = useState<ServiceDeskTab>(props.atlassian ? props.initialTab : 'new')
  const news = props.feed.requests.items.filter((r) => r.news).length

  return (
    <div className="flex min-h-0 flex-col">
      <PageHeader icon={Headset} title="IT service desk">
        {props.atlassian && (
          <Tabs
            tabs={[
              { id: 'new', label: 'New request' },
              { id: 'mine', label: 'My requests' },
            ]}
            current={tab}
            badges={{ mine: news }}
            onChange={setTab}
          />
        )}
      </PageHeader>

      {tab === 'new' || !props.atlassian ? (
        <NewRequestForm {...props} connected={props.atlassian?.status === 'connected'} />
      ) : (
        <MyRequests
          open={props.open}
          state={props.atlassian}
          list={props.feed.requests}
          appName={props.appName}
          onOpenIssue={props.onOpenIssue}
        />
      )}

      <div className="shrink-0 border-t border-black/5 px-2 py-1.5 dark:border-white/10">
        <button
          type="button"
          onClick={() =>
            void (tab === 'mine'
              ? window.assist.serviceDesk.openMyRequests()
              : window.assist.invokeAction('servicedesk'))
          }
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
        >
          <ExternalLink size={13} aria-hidden />
          {tab === 'mine' ? 'All your requests on the portal' : 'Open the service desk portal'}
        </button>
      </div>
    </div>
  )
}
```

<!-- /code -->

The page, with the comment that sums it up.

- `atlassian`: as its comment says, the Atlassian connection, or `null` when the tenant has no
  Atlassian site. Without one there's no My requests and no articles: just the form.
- `draft`, `attachments`, `onAttachLatest`, `onOpenAttachment`, `onRemoveAttachment`: the text
  box's words and screenshots, which the request starts from. They're the same as the text box's,
  so a screenshot attached here is attached there too.
- `useState<ServiceDeskTab>(props.atlassian ? props.initialTab : 'new')`: starts on the tab
  `Panel` asks for (always New request so far), or New request when there's no Atlassian.
- `const news = props.feed.requests.items.filter((r) => r.news).length`: how many requests have
  news, for My requests' badge.
- `{tab === 'new' || !props.atlassian ? (...) : (...)}`: the form, or My requests.
  `<NewRequestForm {...props} ... />` passes all of the page's props on, plus `connected`.
- The link at the bottom: on My requests, **All your requests on the portal**
  (`serviceDesk.openMyRequests()`); otherwise **Open the service desk portal**, which runs the
  service desk icon's ordinary action in the main process (`invokeAction('servicedesk')`): open
  the portal and close the panel.

### `NewRequestForm`

<!-- code: apps/desktop/src/renderer/src/components/ServiceDeskPage.tsx#NewRequestForm -->

[`src/renderer/src/components/ServiceDeskPage.tsx`, lines 106–270](../../apps/desktop/src/renderer/src/components/ServiceDeskPage.tsx#L106-L270)

```tsx
function NewRequestForm(props: Parameters<typeof ServiceDeskPage>[0] & { connected: boolean }) {
  const { requestTypes, showToast } = props
  const [requestTypeId, setRequestTypeId] = useState(requestTypes[0]?.id ?? '')
  // Starts from the text box: its first line as the summary, all of it as the details.
  const [summary, setSummary] = useState(() => firstLine(props.draft))
  const [details, setDetails] = useState(props.draft.trim())
  const [includePc, setIncludePc] = useState(true)
  const [pcDetails, setPcDetails] = useState('')
  const [articles, setArticles] = useState<ConfluencePage[]>([])
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let alive = true
    void window.assist.serviceDesk.pcDetails().then((text) => alive && setPcDetails(text))
    return () => {
      alive = false
    }
  }, [])

  // How-to articles about what they're typing, from the company's knowledge spaces.
  const lookFor = `${summary} ${details}`.trim().slice(0, 300)
  const lookingFor = props.connected && lookFor.length >= 4
  const shownArticles = lookingFor ? articles : []
  useEffect(() => {
    if (!lookingFor) return
    let alive = true
    const timer = setTimeout(() => {
      void window.assist.atlassian.articles(lookFor).then((found) => alive && setArticles(found))
    }, ARTICLES_DELAY_MS)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [lookFor, lookingFor])

  async function raise() {
    setSending(true)
    const result = await window.assist.serviceDesk
      .raise({ requestTypeId, summary, details, includePcDetails: includePc })
      .finally(() => setSending(false))
    // On success the panel has closed and the portal's form is opening in the browser.
    if (!result.ok) showToast(RAISE_ERRORS[result.reason], 'error')
  }

  const canSend = !sending && (summary.trim() !== '' || details.trim() !== '')
  const screenshots = props.attachments.length

  return (
    <form
      className="flex min-h-0 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSend) void raise()
      }}
    >
      <div className="min-h-0 space-y-2 overflow-y-auto px-3.5 pb-2">
        <Field label="What kind of request?">
          <select
            value={requestTypeId}
            onChange={(event) => setRequestTypeId(event.target.value)}
            className="w-full rounded-lg bg-zinc-100 px-2 py-1.5 text-xs outline-none dark:bg-zinc-800"
          >
            {requestTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Summary">
          <input
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            maxLength={255}
            placeholder="e.g. Outlook keeps crashing"
            autoFocus
            className="w-full rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs outline-none placeholder:text-zinc-400 dark:bg-zinc-800"
          />
        </Field>
        <Field label="Details">
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="What happened, and what you've tried"
            className="block max-h-32 min-h-16 w-full resize-none rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs outline-none field-sizing-content placeholder:text-zinc-400 dark:bg-zinc-800"
          />
        </Field>

        {shownArticles.length > 0 && (
          <div className="rounded-lg border border-black/5 px-2.5 py-1.5 dark:border-white/10">
            <p className="text-[11px] font-medium text-zinc-500">These might help:</p>
            <ul>
              {shownArticles.map((page) => (
                <li key={page.id}>
                  <button
                    type="button"
                    onClick={() => void window.assist.openExternal(page.url)}
                    title={page.excerpt}
                    className="flex w-full items-center gap-1.5 rounded-md py-0.5 text-left text-xs text-accent hover:underline dark:text-accent-soft"
                  >
                    <BookOpen size={12} className="shrink-0" aria-hidden />
                    <span className="truncate">{page.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {props.attachments.map((attachment) => (
            <AttachmentChip
              key={attachment.id}
              attachment={attachment}
              onOpen={() => props.onOpenAttachment(attachment)}
              onRemove={() => props.onRemoveAttachment(attachment)}
            />
          ))}
          <button
            type="button"
            onClick={props.onAttachLatest}
            title="Attach the latest screenshot (click again for the one before)"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            <Paperclip size={14} aria-hidden />
            Attach screenshot
          </button>
        </div>

        <label className="flex items-start gap-2 text-xs" title={pcDetails}>
          <input
            type="checkbox"
            checked={includePc}
            onChange={(event) => setIncludePc(event.target.checked)}
            className="mt-0.5 accent-accent"
          />
          <span>
            Include PC details
            {pcDetails && (
              <span className="block text-[11px] text-zinc-500">
                {pcDetails.split('\n').join(' · ')}
              </span>
            )}
          </span>
        </label>
      </div>

      <div className="flex shrink-0 items-center gap-2 px-3.5 pb-2.5">
        <p className="flex-1 text-[11px] text-zinc-500">
          You&apos;ll check it and send it on the portal
          {screenshots > 0 ? ', pasting the screenshot with Ctrl+V.' : '.'}
        </p>
        <button
          type="submit"
          disabled={!canSend}
          aria-busy={sending}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-accent pr-2.5 pl-3 text-xs font-medium text-white disabled:opacity-40"
        >
          Continue on the portal
          <ArrowUpRight size={14} aria-hidden />
        </button>
      </div>
    </form>
  )
}
```

<!-- /code -->

New request: the request filled in here, then finished on the portal.

- `props: Parameters<typeof ServiceDeskPage>[0] & { connected: boolean }`: the same props as the
  page (`Parameters<...>[0]` is the type of `ServiceDeskPage`'s first argument), plus whether
  Atlassian is connected.
- `requestTypeId`: starts on the first request type in the tenant's list.
- `useState(() => firstLine(props.draft))`, `useState(props.draft.trim())`: as the comment says,
  the form starts from the text box: its first line as the summary, all of it as the details.
  They're only starting values: editing the form doesn't change the text box.
- `includePc`: **Include PC details**, on to start with. `pcDetails`: what it adds, asked for once
  (`serviceDesk.pcDetails()`) to show under the checkbox.
- `lookFor`, `lookingFor`: the words to look for articles about: the summary and details, up to
  300 characters, once there are at least 4 and Atlassian is connected.
- The `useEffect` on `[lookFor, lookingFor]`: like the Search tab's, a pause in typing sends
  `atlassian.articles(lookFor)`, and a late answer for old words is ignored. `shownArticles` is
  empty whenever there's nothing to look for, so old articles don't linger.
- `raise()`: **Continue on the portal**: sends the form's fields
  (`serviceDesk.raise({ requestTypeId, summary, details, includePcDetails })`). As the comment
  says, on success the main process has closed the panel and the browser is opening the portal's
  form. A failure shows its message from `RAISE_ERRORS`.
- `canSend`: not while sending, and only with a summary or some details.
- The form: **What kind of request?** (a list of the tenant's request types), **Summary** (255
  characters at most, Jira's limit) and **Details**, each in a `Field`.
- "These might help:": the articles, each opening in the browser, with the page's snippet as its
  tooltip.
- The screenshots, as `AttachmentChip`s (open, remove), and **Attach screenshot**, which attaches
  the latest one, as the button under the text box does.
- `title={pcDetails}` and `pcDetails.split('\n').join(' · ')`: the PC details on one line under the
  checkbox, so the user sees exactly what's added.
- At the bottom, what happens next: the user checks the request and sends it on the portal, and,
  with a screenshot, pastes it with Ctrl+V. `&apos;` is how JSX text writes `'` here.

### `MyRequests`

<!-- code: apps/desktop/src/renderer/src/components/ServiceDeskPage.tsx#MyRequests -->

[`src/renderer/src/components/ServiceDeskPage.tsx`, lines 272–356](../../apps/desktop/src/renderer/src/components/ServiceDeskPage.tsx#L272-L356)

```tsx
function MyRequests(props: {
  open: boolean
  state: AtlassianState
  list: JiraFeed['requests']
  appName: string
  onOpenIssue: (key: string) => void
}) {
  const [refreshing, setRefreshing] = useState(false)
  const connected = props.state.status === 'connected'
  const { list } = props

  useEffect(() => {
    if (props.open && connected) void window.assist.atlassian.feed()
  }, [props.open, connected])

  async function refresh() {
    setRefreshing(true)
    await window.assist.atlassian.feed(true).finally(() => setRefreshing(false))
  }

  if (!connected) {
    return (
      <AtlassianConnect
        state={props.state}
        appName={props.appName}
        purpose="your IT requests, and when IT replies"
      />
    )
  }
  if (list.status === 'loading' && list.items.length === 0) {
    return <Note spinner>Getting your requests…</Note>
  }
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between px-3.5 pb-1">
        <p className="text-[11px] text-zinc-500">Open, and closed in the last 30 days</p>
        <IconButton
          icon={RotateCw}
          label="Refresh"
          onClick={() => void refresh()}
          disabled={refreshing}
          spinning={refreshing}
        />
      </div>
      {list.status === 'error' && (
        <Note action={<TextButton onClick={() => void refresh()}>Retry</TextButton>}>
          {list.message}
        </Note>
      )}
      {list.items.length === 0 && list.status === 'ready' && (
        <Note>No requests lately. Raise one from New request.</Note>
      )}
      {list.items.length > 0 && (
        <ul className="min-h-0 overflow-y-auto px-1.5 pb-1.5" aria-label="My requests">
          {list.items.map((request) => (
            <li key={request.key}>
              <button
                type="button"
                onClick={() => props.onOpenIssue(request.key)}
                className="flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="shrink-0 font-medium text-zinc-500">{request.key}</span>
                    <span className="min-w-0 flex-1 truncate">{request.summary}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
                    <StatusPill status={request.status} />
                    {request.news ? (
                      <span className="truncate font-semibold text-accent dark:text-accent-soft">
                        {request.news}
                      </span>
                    ) : (
                      <span>updated {timeAgo(request.updated)}</span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

<!-- /code -->

My requests: the user's requests, newest change first.

- The `useEffect` and `refresh()`: as on the Jira page, ask for the latest when the tab shows, and
  check again on Refresh.
- `if (!connected) { return (<AtlassianConnect ... />) }`: the Connect prompt until connected,
  with its own `purpose`.
- "Open, and closed in the last 30 days": what the list holds (`myRequestsJql()`).
- `list.status === 'error'`: the reason with Retry, above the requests as last loaded.
- Each request is a button that opens it in the card (`onOpenIssue`), which also marks its news
  as seen (`Atlassian.issue()`). It shows the key and summary, the status pill, then either the
  news in the accent colour ("Now Resolved · Mark Duong replied") or when it was last updated.

### `Field` and `firstLine()`

<!-- code: apps/desktop/src/renderer/src/components/ServiceDeskPage.tsx#Field,firstLine -->

[`src/renderer/src/components/ServiceDeskPage.tsx`, lines 358–371](../../apps/desktop/src/renderer/src/components/ServiceDeskPage.tsx#L358-L371)

```tsx
function Field(props: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium text-zinc-500">{props.label}</span>
      {props.children}
    </label>
  )
}

/** The text's first line, short enough for a summary. */
function firstLine(text: string): string {
  const line = text.trim().split('\n')[0]?.trim() ?? ''
  return line.length > 120 ? `${line.slice(0, 119).trimEnd()}…` : line
}
```

<!-- /code -->

- `Field`: a form field with its label above it. Wrapping both in `<label>` means clicking the
  label puts the cursor in the field.
- `firstLine(text)`: as the comment says, the text's first line, cut to 120 characters (with `…`)
  so it fits as a summary. `?.trim() ?? ''` copes with empty text.

## What's tested

These components aren't unit-tested themselves. What they rely on is: the main process's side in
`tests/atlassian.test.ts` and `tests/serviceDesk.test.ts` (see
[Jira and the service desk](11-atlassian.md)), `timeAgo()` in `tests/format.test.ts`, and
`findIssueKeys()` (which finds the keys for the Open button) in `tests/atlassian.test.ts`.
