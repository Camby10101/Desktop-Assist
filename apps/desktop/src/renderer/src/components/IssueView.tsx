import {
  ArrowLeft,
  ArrowRightLeft,
  Clock,
  ExternalLink,
  Headset,
  MessageSquarePlus,
  RotateCw,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { timeAgo } from '@shared/format'
import type { IssueDetail, IssuePrompt, IssueResult } from '@shared/types'
import { cn } from '../lib/cn'
import { Markdown } from './Markdown'
import { IconButton, Note, StatusPill, TextButton } from './PageParts'

const PROMPTS: { id: IssuePrompt; label: string }[] = [
  { id: 'summarise', label: 'Summarise' },
  { id: 'reply', label: 'Draft a reply' },
  { id: 'next-steps', label: 'Next steps' },
]

/** Jira's time format, as the main process accepts it. */
const TIME_SPENT = /^(?=.*\d)(\d{1,3}w ?)?(\d{1,3}d ?)?(\d{1,3}h ?)?(\d{1,4}m)?$/

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
