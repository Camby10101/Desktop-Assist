import { ArrowUp, LoaderCircle, Paperclip, Square } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { PANEL_LAYOUT, UI } from '@shared/geometry'
import type { Attachment, ChatMessage } from '@shared/types'
import type { ToastMessage } from '../hooks/useToast'
import { cn } from '../lib/cn'
import { AttachmentChip } from './AttachmentChip'
import { MessageList } from './MessageList'

/**
 * The card to the left of the bubble. It's anchored at the bottom, so it starts as just the text
 * box and grows upward as the conversation gets longer, then scrolls. When there's no working API
 * key, `keyPrompt` is shown instead of the chat.
 */
export function ChatBox(props: {
  open: boolean
  toast: ToastMessage | null
  /** Replaces the chat (the API key form), or null to show the chat. */
  keyPrompt: ReactNode
  /** A line above the text box, e.g. "Checking your API key…". */
  banner: ReactNode
  messages: ChatMessage[]
  busy: boolean
  canSend: boolean
  draft: string
  attachments: Attachment[]
  onDraftChange: (text: string) => void
  onSend: () => void
  onStop: () => void
  onRetry: () => void
  onCopy: (text: string) => void
  onAttachLatest: () => void
  onOpenAttachment: (attachment: Attachment) => void
  onRemoveAttachment: (attachment: Attachment) => void
}) {
  return (
    <div
      data-hit
      className={cn(
        'absolute flex flex-col rounded-2xl border shadow-xl',
        'border-black/10 bg-white text-zinc-900 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100',
        'origin-bottom-right translate-x-2 scale-95 opacity-0 transition duration-150 ease-out',
        'group-data-open:translate-x-0 group-data-open:scale-100 group-data-open:opacity-100',
        'motion-reduce:transition-none',
      )}
      style={{
        right: PANEL_LAYOUT.notesRight,
        bottom: PANEL_LAYOUT.notesBottom,
        width: UI.panelWidth,
        maxHeight: UI.panelMaxHeight,
      }}
    >
      {props.toast && (
        <div
          key={props.toast.id}
          role="status"
          className={cn(
            'absolute right-0 bottom-full mb-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg',
            props.toast.tone === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900',
          )}
        >
          {props.toast.text}
        </div>
      )}

      {props.keyPrompt ?? (
        <>
          {props.messages.length > 0 && (
            <MessageList messages={props.messages} onRetry={props.onRetry} onCopy={props.onCopy} />
          )}
          {props.banner}
          <Composer {...props} />
        </>
      )}
    </div>
  )
}

/** The text box: attached screenshots, the text, and the attach / send / stop buttons. */
function Composer(props: Parameters<typeof ChatBox>[0]) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  const placedCaret = useRef(false)

  // Focus the text box whenever the panel opens; the first time, put the caret at the end.
  useEffect(() => {
    const el = textarea.current
    if (!props.open || !el) return
    el.focus()
    if (!placedCaret.current) {
      placedCaret.current = true
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [props.open])

  // Enter sends; Shift+Enter starts a new line.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (props.canSend) props.onSend()
    }
  }

  return (
    <div
      className={cn(
        'shrink-0',
        props.messages.length > 0 && 'border-t border-black/5 dark:border-white/10',
      )}
    >
      {props.attachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-3 pt-3">
          {props.attachments.map((attachment) => (
            <AttachmentChip
              key={attachment.id}
              attachment={attachment}
              onOpen={() => props.onOpenAttachment(attachment)}
              onRemove={() => props.onRemoveAttachment(attachment)}
            />
          ))}
        </div>
      )}

      <textarea
        ref={textarea}
        value={props.draft}
        onChange={(event) => props.onDraftChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask Claude anything…"
        aria-label="Message Claude"
        spellCheck
        className={cn(
          'block max-h-40 min-h-11 w-full resize-none overflow-y-auto bg-transparent field-sizing-content',
          'px-3.5 pt-3 pb-1 text-sm leading-relaxed outline-none placeholder:text-zinc-400',
        )}
      />

      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <button
          type="button"
          onClick={props.onAttachLatest}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
        >
          <Paperclip size={14} aria-hidden />
          Attach latest screenshot
        </button>
        {props.busy ? (
          <button
            type="button"
            onClick={props.onStop}
            aria-label="Stop"
            title="Stop"
            className="grid size-8 place-items-center rounded-full bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
          >
            <Square size={12} fill="currentColor" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={props.onSend}
            disabled={!props.canSend}
            aria-label="Send"
            title="Send (Enter)"
            className="grid size-8 place-items-center rounded-full bg-accent text-white disabled:opacity-40"
          >
            <ArrowUp size={16} aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}

/** A one-line status above the text box, with an optional action. */
export function Banner(props: { spinner?: boolean; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-black/5 px-3.5 py-2 text-xs text-zinc-500 dark:border-white/10">
      {props.spinner && <LoaderCircle size={12} className="animate-spin" aria-hidden />}
      <span className="flex-1">{props.children}</span>
      {props.action}
    </div>
  )
}
