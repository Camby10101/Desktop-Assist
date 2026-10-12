import { AtSign, Bell, BookOpen, ExternalLink, RotateCw, Search, UserPlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { timeAgo } from '@shared/format'
import type { AtlassianState, JiraFeed, JiraNotification, SearchResult } from '@shared/types'
import { cn } from '../lib/cn'
import {
  AtlassianConnect,
  IconButton,
  Note,
  PageHeader,
  StatusPill,
  Tabs,
  TextButton,
} from './PageParts'

type Tab = 'notifications' | 'search'

/** How long the unread dots stay after the Notifications tab opens, before they're marked seen. */
const MARK_READ_AFTER_MS = 2000
/** Typing pauses this long before searching. */
const SEARCH_DELAY_MS = 350

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
