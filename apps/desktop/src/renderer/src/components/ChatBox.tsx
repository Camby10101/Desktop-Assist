import {
  ArrowUp,
  ArrowUpRight,
  LifeBuoy,
  LoaderCircle,
  Paperclip,
  Square,
  Ticket,
} from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  UI,
  bubbleMetrics,
  isLeftCorner,
  isTopCorner,
  type Corner,
  type PanelLayout,
} from '@shared/geometry'
import type { Attachment, ChatMessage } from '@shared/types'
import type { ToastMessage } from '../hooks/useToast'
import { anchored, originClass } from '../lib/anchor'
import { cn } from '../lib/cn'
import { SPRITE_SIZE } from '../character/sprite'
import { AttachmentChip } from './AttachmentChip'
import { MessageList } from './MessageList'

/**
 * The card beside the bubble, on the side facing the middle of the screen: a speech bubble, its
 * tail pointing at her mouth (see SpeechTail). It's anchored at the bubble's edge (bottom in a
 * bottom corner, top in a top corner), so it starts as just the text box and grows away from that
 * edge as the conversation gets longer, then scrolls. When nobody is
 * signed in, `signInPrompt` is shown instead of the chat. With `inClaudeDesktop`, it's only the
 * text box, and sending opens the question in Claude Desktop. While a page's icon is on (Apps,
 * Jira, the service desk), the page shows instead.
 */
export function ChatBox(props: {
  corner: Corner
  /** Where things sit for her size: the card goes beside her. */
  layout: PanelLayout
  /** Her size (see CHARACTER_SIZES), for the tail to reach her mouth. */
  scale: number
  open: boolean
  toast: ToastMessage | null
  /** Sending hands the question to Claude Desktop instead of the chat in the panel. */
  inClaudeDesktop: boolean
  /** With Claude Desktop: the question (and screenshot) is sent there for the user. */
  autoSend: boolean
  /** Replaces the text box with a page while its icon is on (the Apps list, Jira), or null. */
  page: ReactNode
  /** Replaces the chat (the JumpCloud sign-in), or null to show the chat. */
  signInPrompt: ReactNode
  /** A line above the text box, e.g. "Checking your sign-in…". */
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
  /** Jira issue keys in the text, each offered as a chip that opens the issue. */
  issueKeys: string[]
  onOpenIssue: (key: string) => void
  /** Turns the text (and screenshots) into an IT request; null without a service desk form. */
  onReport: (() => void) | null
}) {
  // The card's height, for the tail to stay on it however short it is.
  const card = useRef<HTMLDivElement>(null)
  const [cardHeight, setCardHeight] = useState(0)
  useEffect(() => {
    const element = card.current
    if (!element) return
    const observer = new ResizeObserver(() => setCardHeight(element.offsetHeight))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={card}
      data-hit
      className={cn(
        'absolute flex flex-col rounded-2xl border shadow-xl',
        'border-black/10 bg-white text-zinc-900 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100',
        originClass(props.corner),
        'scale-95 opacity-0 transition duration-150 ease-out',
        'group-data-open:scale-100 group-data-open:opacity-100',
        'motion-reduce:transition-none',
      )}
      style={{
        ...anchored(props.corner, props.layout.chatX, props.layout.chatY),
        width: UI.panelWidth,
        maxHeight: UI.panelMaxHeight,
      }}
    >
      <SpeechTail
        corner={props.corner}
        layout={props.layout}
        scale={props.scale}
        cardHeight={cardHeight}
      />
      {props.toast && (
        <div
          key={props.toast.id}
          role="status"
          className={cn(
            'absolute rounded-full px-3 py-1.5 text-xs font-medium shadow-lg',
            // Just outside the card, on the side away from the screen edge.
            isTopCorner(props.corner) ? 'top-full mt-2' : 'bottom-full mb-2',
            isLeftCorner(props.corner) ? 'left-0' : 'right-0',
            props.toast.tone === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900',
          )}
        >
          {props.toast.text}
        </div>
      )}

      {props.page ?? props.signInPrompt ?? (
        <>
          {props.messages.length > 0 && (
            <MessageList
              messages={props.messages}
              onRetry={props.onRetry}
              onCopy={props.onCopy}
              onOpenScreenshot={props.onOpenAttachment}
            />
          )}
          {props.banner}
          <Composer {...props} />
        </>
      )}
    </div>
  )
}

/** Her mouth, in sprite pixels down from the top of her window (rig.ts draws it there). */
const MOUTH_ROW = 33.5
/** How far from her middle the tail stops (sprite pixels): just short of her face and hair. */
const TAIL_REACH = 11
/** The card's corner radius (`rounded-2xl`), which the tail's base keeps clear of. */
const CARD_RADIUS = 16

/**
 * The speech bubble's tail: from the card's side nearest her to just short of her mouth, at her
 * height and size, so it points at her mouth however big she is (her mouth is at MOUTH_ROW of her
 * 96-pixel grid, scaled with her). Its sides curve out of the card's edge and narrow to a small
 * round end, like a drawn speech bubble's. Its base slides along the card's edge to stay level with her
 * mouth, but never into the card's rounded corners, so on a card shorter than her mouth is high
 * (just the text box, at a big size) it slants up to her instead. It's drawn in the card's own
 * colours and border, overlapping the card's edge by a pixel so the two read as one shape, and it
 * ignores the mouse, so it never gets between the pointer and her.
 */
function SpeechTail(props: {
  corner: Corner
  layout: PanelLayout
  scale: number
  cardHeight: number
}) {
  const { scale, layout } = props
  const { box } = bubbleMetrics(scale)
  // From the card's edge out to the tip, and up from the card's near edge (its bottom, in a
  // bottom corner) to the tip.
  const out = Math.max(8, layout.chatX - (box / 2 + TAIL_REACH * scale))
  const up = (SPRITE_SIZE - MOUTH_ROW) * scale - layout.chatY
  // Half the base's width, how far along the card's edge each side curves in from, and the tip's
  // roundness, all growing with her (the tip never more than a quarter of the tail's length).
  // Half the base's width, how far along the card's edge each side curves in from, and the
  // radius of the round end, all growing with her (the end never more than a fifth of its length).
  const half = 9 + 2 * scale
  const curve = half * 0.7
  const round = Math.min(2.5 + 1.2 * scale, out / 5)
  const lowest = CARD_RADIUS + half + curve
  const highest = Math.max(lowest, props.cardHeight - CARD_RADIUS - half - curve)
  const base = Math.min(Math.max(up, lowest), highest)
  const width = out + 2
  const height = Math.max(up + round, base + half + curve) + 2
  // A point `x` out from the card's edge and `u` up from its near edge, in the drawing's terms.
  const at = (x: number, u: number) => `${x.toFixed(1)} ${(height - u).toFixed(1)}`
  // Along the tail (from the middle of its base towards her mouth) and across it.
  const length = Math.hypot(out, up - base)
  const along = { x: out / length, u: (up - base) / length }
  const across = { x: -along.u, u: along.x }
  // The round end: a circle `round` across, its far side at the tip. The sides run into it, one
  // on each side of its middle, arriving along the tail.
  const end = { x: out - along.x * round, u: up - along.u * round }
  const upperEnd = { x: end.x + across.x * round, u: end.u + across.u * round }
  const lowerEnd = { x: end.x - across.x * round, u: end.u - across.u * round }
  const pull = length * 0.45
  const sides = [
    `M${at(0, base + half + curve)}`,
    // Out of the card's edge: leaving it along the edge, arriving along the tail.
    `C${at(0, base + half)} ${at(upperEnd.x - along.x * pull, upperEnd.u - along.u * pull)} ${at(upperEnd.x, upperEnd.u)}`,
    // Round the end, the far way, past the tip.
    `A${round.toFixed(1)} ${round.toFixed(1)} 0 0 1 ${at(lowerEnd.x, lowerEnd.u)}`,
    // Back to the card's edge, joining it along the edge.
    `C${at(lowerEnd.x - along.x * pull, lowerEnd.u - along.u * pull)} ${at(0, base - half)} ${at(0, base - half - curve)}`,
  ].join(' ')
  const left = isLeftCorner(props.corner)
  const top = isTopCorner(props.corner)
  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="pointer-events-none absolute overflow-visible"
      style={{
        // On the side towards her, over the card's border by a pixel.
        [left ? 'right' : 'left']: 'calc(100% - 1px)',
        [top ? 'top' : 'bottom']: 0,
        // Drawn going right from a bottom edge; mirrored for the other sides.
        transform: `scale(${left ? -1 : 1}, ${top ? -1 : 1})`,
      }}
    >
      {/* Filled up to a pixel inside the card, over its border, so the join doesn't show. */}
      <path
        d={`${sides} L${at(-1, base - half - curve)} L${at(-1, base + half + curve)} Z`}
        className="fill-white dark:fill-zinc-900"
      />
      <path d={sides} fill="none" className="stroke-black/10 dark:stroke-white/10" />
    </svg>
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
      {props.inClaudeDesktop && props.attachments.length > 0 && (
        <p className="px-3.5 pt-2 text-[11px] text-zinc-500">
          {props.attachments.length === 1 ? 'The screenshot' : 'The screenshots'}
          {props.autoSend && props.draft.trim()
            ? ' will be pasted into Claude for you.'
            : ' will be copied for you to paste into Claude with Ctrl+V.'}
        </p>
      )}

      {props.issueKeys.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
          {props.issueKeys.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => props.onOpenIssue(key)}
              title={`Open ${key}`}
              className="inline-flex items-center gap-1 rounded-full border border-black/10 px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <Ticket size={12} className="text-accent dark:text-accent-soft" aria-hidden />
              Open {key}
            </button>
          ))}
        </div>
      )}

      <textarea
        ref={textarea}
        value={props.draft}
        onChange={(event) => props.onDraftChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask anything…"
        aria-label="Message Claude"
        spellCheck
        className={cn(
          'block max-h-40 min-h-11 w-full resize-none overflow-y-auto bg-transparent field-sizing-content',
          'px-3.5 pt-3 pb-1 text-sm leading-relaxed outline-none placeholder:text-zinc-400',
        )}
      />

      <div className="flex items-center gap-1 px-2 pb-2">
        <button
          type="button"
          onClick={props.onAttachLatest}
          title="Attach the latest screenshot (click again for the one before)"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
        >
          <Paperclip size={14} aria-hidden />
          Attach screenshot
        </button>
        {props.onReport && (
          <button
            type="button"
            onClick={props.onReport}
            title="Report a problem to IT, with this text and screenshot"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            <LifeBuoy size={14} aria-hidden />
            Report to IT
          </button>
        )}
        <span className="flex-1" />
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
        ) : props.inClaudeDesktop ? (
          <button
            type="button"
            onClick={props.onSend}
            disabled={!props.canSend}
            title={props.autoSend ? 'Send in Claude (Enter)' : 'Open in Claude (Enter)'}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-accent pr-2.5 pl-3 text-xs font-medium text-white disabled:opacity-40"
          >
            Ask in Claude
            <ArrowUpRight size={14} aria-hidden />
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
