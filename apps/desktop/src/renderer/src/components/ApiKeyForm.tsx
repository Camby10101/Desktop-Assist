import { KeyRound } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ApiKeyStatus, ApiKeySubmitResult } from '@shared/types'

const CONSOLE_KEYS_URL = 'https://platform.claude.com/settings/keys'

/**
 * Asks for a Claude API key. Shown in place of the chat when there's no key, when the saved one
 * stopped working, or when you choose "Change API key". The key is checked with Anthropic before
 * it's saved, so a typo is caught straight away.
 */
export function ApiKeyForm(props: {
  open: boolean
  status: ApiKeyStatus
  /** Changing a key that works: offer Cancel and Forget. */
  changing: boolean
  onSubmit: (key: string) => Promise<ApiKeySubmitResult>
  onCancel: () => void
  onForget: () => void
}) {
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (props.open) input.current?.focus()
  }, [props.open])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setChecking(true)
    setError(null)
    const result = await props.onSubmit(key)
    setChecking(false)
    if (result.ok) setKey('')
    else setError(result.message)
  }

  const headline =
    props.status.state === 'invalid' && !props.changing
      ? props.status.message
      : props.changing
        ? 'Enter a new Claude API key.'
        : 'Add your Claude API key to start chatting.'

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
          <KeyRound size={16} aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold">Connect to Claude</p>
          <p
            className={
              props.status.state === 'invalid' && !props.changing
                ? 'text-xs text-amber-700 dark:text-amber-400'
                : 'text-xs text-zinc-500'
            }
          >
            {headline}
          </p>
        </div>
      </div>

      <form onSubmit={(event) => void submit(event)} className="flex gap-2">
        <input
          ref={input}
          type="password"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder="sk-ant-…"
          aria-label="Claude API key"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-black/15 bg-transparent px-2.5 py-1.5 text-sm outline-none select-text focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-white/15"
        />
        <button
          type="submit"
          disabled={checking || !key.trim()}
          className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {checking ? 'Checking…' : 'Save key'}
        </button>
      </form>

      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <p className="text-[11px] leading-relaxed text-zinc-500">
        The key is checked with Anthropic, then stored encrypted on this PC. Create one in the{' '}
        <a
          href={CONSOLE_KEYS_URL}
          onClick={(event) => {
            event.preventDefault()
            void window.assist.openExternal(CONSOLE_KEYS_URL)
          }}
          className="text-accent underline"
        >
          Claude Console
        </a>
        .
      </p>

      {props.changing && (
        <div className="flex justify-between">
          <button
            type="button"
            onClick={props.onForget}
            className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
          >
            Forget saved key
          </button>
          <button
            type="button"
            onClick={props.onCancel}
            className="rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
