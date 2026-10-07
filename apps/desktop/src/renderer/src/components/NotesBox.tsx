import { Check, Paperclip } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { PANEL_LAYOUT, UI } from '@shared/geometry'
import type { Attachment } from '@shared/types'
import type { ToastMessage } from '../hooks/useToast'
import { cn } from '../lib/cn'
import { AttachmentChip } from './AttachmentChip'

export type SaveState = 'idle' | 'saving' | 'saved'

/**
 * The text box to the left of the bubble. It's anchored at the bottom, so it grows upward as
 * the text gets longer, up to a maximum height, then scrolls.
 */
export function NotesBox(props: {
  open: boolean
  text: string
  attachments: Attachment[]
  saveState: SaveState
  toast: ToastMessage | null
  onTextChange: (text: string) => void
  onAttachLatest: () => void
  onOpenAttachment: (attachment: Attachment) => void
  onRemoveAttachment: (attachment: Attachment) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const placedCaret = useRef(false)

  // Focus the text box whenever the panel opens; the first time, put the caret at the end.
  useEffect(() => {
    const textarea = textareaRef.current
    if (!props.open || !textarea) return
    textarea.focus()
    if (!placedCaret.current) {
      placedCaret.current = true
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    }
  }, [props.open])

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

      {props.attachments.length > 0 && (
        <div className="flex shrink-0 gap-2 overflow-x-auto px-3 pt-3">
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
        ref={textareaRef}
        value={props.text}
        onChange={(event) => props.onTextChange(event.target.value)}
        placeholder="Type here. It saves automatically."
        aria-label="Notes"
        spellCheck
        className={cn(
          'field-sizing-content min-h-11 flex-1 resize-none overflow-y-auto bg-transparent',
          'px-3.5 pt-3 pb-1 text-sm leading-relaxed outline-none placeholder:text-zinc-400',
        )}
      />

      <div className="flex shrink-0 items-center justify-between gap-2 px-2 pb-2">
        <button
          type="button"
          onClick={props.onAttachLatest}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
        >
          <Paperclip size={14} aria-hidden />
          Attach latest screenshot
        </button>
        <SaveIndicator state={props.saveState} />
      </div>
    </div>
  )
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null
  return (
    <span
      className="inline-flex items-center gap-1 pr-1.5 text-[11px] text-zinc-400"
      aria-live="polite"
    >
      {state === 'saving' ? (
        'Saving…'
      ) : (
        <>
          <Check size={12} aria-hidden /> Saved
        </>
      )}
    </span>
  )
}
