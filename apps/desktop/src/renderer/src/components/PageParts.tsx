import { LoaderCircle, LogIn, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AtlassianState, IssueStatus } from '@shared/types'
import { cn } from '../lib/cn'

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
