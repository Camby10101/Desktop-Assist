import { LoaderCircle, LogIn, Settings2 } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import type { AuthStatus } from '@shared/types'

/**
 * Shown in place of the chat while nobody is signed in. Signing in happens in the browser, on
 * JumpCloud's own page; if the user is already signed in to JumpCloud there, it finishes by itself
 * and the chat appears.
 */
export function SignInPanel(props: {
  open: boolean
  status: Extract<AuthStatus, { state: 'unconfigured' | 'signed-out' | 'signing-in' }>
  appName: string
  onSignIn: () => void
  onCancel: () => void
}) {
  const { status } = props
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (props.open) button.current?.focus()
  }, [props.open, status.state])

  if (status.state === 'unconfigured') {
    return (
      <Card icon={<Settings2 size={16} aria-hidden />} title="Sign-in isn't set up yet">
        <p className="text-xs text-zinc-500">
          {props.appName} still needs to be connected to JumpCloud and Claude. Your IT team can do
          this by following docs/JUMPCLOUD_SETUP.md. Missing settings:
        </p>
        <ul className="list-inside list-disc text-[11px] text-zinc-500">
          {status.missing.map((name) => (
            <li key={name}>
              <code>{name}</code>
            </li>
          ))}
        </ul>
      </Card>
    )
  }

  if (status.state === 'signing-in') {
    return (
      <Card
        icon={<LoaderCircle size={16} className="animate-spin" aria-hidden />}
        title="Finish signing in in your browser"
      >
        <p className="text-xs text-zinc-500">
          JumpCloud opened in your browser. Once you're signed in there, come back here.
        </p>
        <div className="flex justify-end">
          <button
            ref={button}
            type="button"
            onClick={props.onCancel}
            className="rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      </Card>
    )
  }

  return (
    <Card icon={<LogIn size={16} aria-hidden />} title="Sign in to start chatting">
      {status.message ? (
        <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">
          {status.message}
        </p>
      ) : (
        <p className="text-xs text-zinc-500">Use your work JumpCloud account.</p>
      )}
      <button
        ref={button}
        type="button"
        onClick={props.onSignIn}
        className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90"
      >
        Sign in with JumpCloud
      </button>
      <p className="text-[11px] leading-relaxed text-zinc-500">
        This opens JumpCloud in your browser. If you're already signed in there, it finishes on its
        own, and you'll stay signed in here.
      </p>
    </Card>
  )
}

function Card(props: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/10 text-accent dark:text-accent-soft">
          {props.icon}
        </span>
        <p className="text-sm font-semibold">{props.title}</p>
      </div>
      {props.children}
    </div>
  )
}
