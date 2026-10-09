import { ExternalLink, LayoutGrid, LoaderCircle, LogIn, RotateCw, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AppsState, PortalApp } from '@shared/types'
import { cn } from '../lib/cn'

/** Above this many apps, a search box appears. */
const SEARCH_FROM = 8

/**
 * Shown in the card instead of the text box while the Apps icon is on: the apps in the user's
 * JumpCloud User Portal. Clicking one opens it in the default browser, signed in through
 * JumpCloud like it would be from the portal.
 */
export function AppsList(props: {
  open: boolean
  state: AppsState
  appName: string
  portalName: string
  onOpenApp: (app: PortalApp) => void
  onOpenPortal: () => void
  onSignIn: () => void
  onCancelSignIn: () => void
  onRetry: () => void
}) {
  const [query, setQuery] = useState('')
  const search = useRef<HTMLInputElement>(null)
  const { state } = props
  const apps = useMemo(() => (state.status === 'ready' ? state.apps : []), [state])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? apps.filter((app) => app.name.toLowerCase().includes(q)) : apps
  }, [apps, query])

  useEffect(() => {
    if (props.open && apps.length > SEARCH_FROM) search.current?.focus()
  }, [props.open, apps.length])

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-3.5 pt-3 pb-2">
        <LayoutGrid size={15} className="text-accent dark:text-accent-soft" aria-hidden />
        <h2 className="flex-1 text-sm font-semibold">Your apps</h2>
        {state.status === 'ready' && (
          <button
            type="button"
            onClick={props.onRetry}
            title="Refresh"
            aria-label="Refresh the list"
            className="grid size-6 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <RotateCw size={13} aria-hidden />
          </button>
        )}
      </div>

      {state.status === 'loading' && (
        <Message>
          <LoaderCircle size={14} className="animate-spin" aria-hidden /> Getting your apps…
        </Message>
      )}

      {state.status === 'sign-in' && (
        <div className="space-y-2 px-3.5 pb-3">
          <p className="text-xs text-zinc-500">
            {state.message ??
              `Sign in with ${props.portalName} once so ${props.appName} can show your apps.`}
          </p>
          <button
            type="button"
            onClick={props.onSignIn}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white"
          >
            <LogIn size={13} aria-hidden /> Sign in with {props.portalName}
          </button>
        </div>
      )}

      {state.status === 'signing-in' && (
        <div className="flex items-center gap-2 px-3.5 pb-3 text-xs text-zinc-500">
          <LoaderCircle size={14} className="animate-spin" aria-hidden />
          <span className="flex-1">Finish signing in in your browser…</span>
          <button
            type="button"
            onClick={props.onCancelSignIn}
            className="rounded-md px-1.5 py-0.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex items-start gap-2 px-3.5 pb-3 text-xs text-zinc-500">
          <p className="flex-1">{state.message}</p>
          <button
            type="button"
            onClick={props.onRetry}
            className="shrink-0 rounded-md px-1.5 py-0.5 font-medium text-accent hover:bg-zinc-100 dark:text-accent-soft dark:hover:bg-zinc-800"
          >
            Retry
          </button>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          {apps.length > SEARCH_FROM && (
            <label className="mx-3 mb-2 flex shrink-0 items-center gap-2 rounded-lg bg-zinc-100 px-2.5 py-1.5 dark:bg-zinc-800">
              <Search size={13} className="text-zinc-400" aria-hidden />
              <input
                ref={search}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search apps"
                aria-label="Search apps"
                className="w-full bg-transparent text-xs outline-none placeholder:text-zinc-400"
              />
            </label>
          )}
          {apps.length === 0 ? (
            <Message>No apps are assigned to you in {props.portalName} yet.</Message>
          ) : shown.length === 0 ? (
            <Message>No apps match “{query.trim()}”.</Message>
          ) : (
            <ul className="grid min-h-0 grid-cols-3 gap-1 overflow-y-auto px-2 pb-2">
              {shown.map((app) => (
                <li key={app.id}>
                  <button
                    type="button"
                    onClick={() => props.onOpenApp(app)}
                    title={`Open ${app.name}`}
                    className="flex w-full flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-center hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <AppLogo app={app} />
                    <span className="line-clamp-2 text-[11px] leading-tight">{app.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="shrink-0 border-t border-black/5 px-2 py-1.5 dark:border-white/10">
        <button
          type="button"
          onClick={props.onOpenPortal}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
        >
          <ExternalLink size={13} aria-hidden /> Open the {props.portalName} portal
        </button>
      </div>
    </div>
  )
}

/** The app's logo, or its first letter on the accent colour when there isn't one. */
function AppLogo({ app }: { app: PortalApp }) {
  const [broken, setBroken] = useState(false)
  if (app.logo && !broken) {
    return (
      <img
        src={app.logo}
        alt=""
        onError={() => setBroken(true)}
        className="size-10 rounded-lg bg-white object-contain p-1 shadow-sm"
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-10 place-items-center rounded-lg text-base font-semibold text-white shadow-sm',
        'bg-accent',
      )}
    >
      {app.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

function Message({ children }: { children: ReactNode }) {
  return <p className="flex items-center gap-2 px-3.5 pb-3 text-xs text-zinc-500">{children}</p>
}
