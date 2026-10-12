import { ArrowUpRight, BookOpen, ExternalLink, Headset, Paperclip, RotateCw } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { timeAgo } from '@shared/format'
import type {
  AtlassianState,
  Attachment,
  ConfluencePage,
  JiraFeed,
  RaiseResult,
  RequestType,
} from '@shared/types'
import { AttachmentChip } from './AttachmentChip'
import {
  AtlassianConnect,
  IconButton,
  Note,
  PageHeader,
  StatusPill,
  Tabs,
  TextButton,
} from './PageParts'

export type ServiceDeskTab = 'new' | 'mine'

/** What to say when the portal's form couldn't be opened. */
const RAISE_ERRORS: Record<Extract<RaiseResult, { ok: false }>['reason'], string> = {
  empty: 'Say what the problem is first.',
  'missing-screenshot': 'An attached screenshot is missing. Remove it and try again.',
  failed: "Couldn't open the service desk. Try again.",
}

/** Typing pauses this long before looking for articles. */
const ARTICLES_DELAY_MS = 600

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
