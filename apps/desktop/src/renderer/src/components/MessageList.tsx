import { Copy, RotateCcw } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import type { Attachment, ChatMessage } from '@shared/types'
import { useThumbnail } from '../hooks/useThumbnail'
import { cn } from '../lib/cn'
import { Markdown } from './Markdown'

/** Within this many pixels of the bottom counts as "at the bottom". */
const STICK_THRESHOLD = 40

/**
 * The conversation. It follows new text as it streams in, unless you've scrolled up to read
 * something earlier. Sending a message always brings it back to the bottom.
 */
export function MessageList(props: {
  messages: ChatMessage[]
  onRetry: () => void
  onCopy: (text: string) => void
  onOpenScreenshot: (attachment: Attachment) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const lastSentId = useRef<string | undefined>(undefined)

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    // A message you've just sent: follow it and the reply, even if you'd scrolled up.
    const sentId = props.messages.findLast((m) => m.role === 'user')?.id
    if (sentId !== lastSentId.current) {
      lastSentId.current = sentId
      stickToBottom.current = true
    }
    if (stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [props.messages])

  return (
    <div
      ref={scroller}
      onScroll={(event) => {
        const el = event.currentTarget
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD
      }}
      className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 pt-3.5 pb-1"
      aria-live="polite"
    >
      {props.messages.map((message, index) =>
        message.role === 'user' ? (
          <UserMessage
            key={message.id}
            message={message}
            onOpenScreenshot={props.onOpenScreenshot}
          />
        ) : (
          <AssistantMessage
            key={message.id}
            message={message}
            canRetry={index === props.messages.length - 1}
            onRetry={props.onRetry}
            onCopy={props.onCopy}
          />
        ),
      )}
    </div>
  )
}

function UserMessage({
  message,
  onOpenScreenshot,
}: {
  message: ChatMessage
  onOpenScreenshot: (attachment: Attachment) => void
}) {
  return (
    <div className="ml-auto flex max-w-[85%] flex-col items-end gap-1.5">
      {message.attachments.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {message.attachments.map((attachment) => (
            <SentScreenshot
              key={attachment.id}
              attachment={attachment}
              onOpen={() => onOpenScreenshot(attachment)}
            />
          ))}
        </div>
      )}
      {message.text && (
        <div className="rounded-2xl rounded-br-md bg-accent px-3 py-2 text-sm whitespace-pre-wrap text-white select-text">
          {message.text}
        </div>
      )}
    </div>
  )
}

/** A sent screenshot's thumbnail. Opening it goes through the panel, which says if it's gone. */
function SentScreenshot({ attachment, onOpen }: { attachment: Attachment; onOpen: () => void }) {
  const thumbnail = useThumbnail(attachment.path)
  return (
    <button
      type="button"
      title={attachment.fileName}
      onClick={onOpen}
      className="h-12 w-20 overflow-hidden rounded-lg border border-black/10 bg-zinc-200 dark:border-white/10 dark:bg-zinc-700"
    >
      {thumbnail && <img src={thumbnail} alt="" className="size-full object-cover" />}
    </button>
  )
}

function AssistantMessage(props: {
  message: ChatMessage
  canRetry: boolean
  onRetry: () => void
  onCopy: (text: string) => void
}) {
  const { message } = props
  const waiting = message.status === 'streaming' && !message.text

  return (
    <div className="group/message max-w-full text-sm text-zinc-800 dark:text-zinc-100">
      {waiting ? <Thinking /> : message.text && <Markdown text={message.text} />}

      {(message.notice || message.status === 'done') && (
        <div className="mt-1 flex items-center gap-2 text-xs">
          {message.notice && (
            <span
              className={cn(
                message.status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-zinc-500',
              )}
            >
              {message.notice}
            </span>
          )}
          {message.retryable && props.canRetry && (
            <button
              type="button"
              onClick={props.onRetry}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-accent hover:bg-zinc-100 dark:text-accent-soft dark:hover:bg-zinc-800"
            >
              <RotateCcw size={12} aria-hidden /> Retry
            </button>
          )}
          {message.text && message.status !== 'streaming' && (
            <button
              type="button"
              aria-label="Copy reply"
              title="Copy reply"
              onClick={() => props.onCopy(message.text)}
              className="rounded-md p-1 text-zinc-400 opacity-0 group-hover/message:opacity-100 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <Copy size={12} aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Thinking() {
  return (
    <div className="flex items-center gap-1.5 py-1 text-xs text-zinc-500" role="status">
      <span className="flex gap-0.5" aria-hidden>
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 animate-bounce rounded-full bg-zinc-400"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      Thinking…
    </div>
  )
}
