import { UI } from '@shared/geometry'
import type { Mode } from '@shared/types'
import { useAccentColor, useAssistState } from '../hooks/useAssistState'
import { useClickThrough } from '../hooks/useClickThrough'
import { cn } from '../lib/cn'

// The tenant's logo: logo.png, or logo.svg (if a tenant has both, the PNG wins).
const logos = import.meta.glob<string>('@tenant/logo.{png,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
})
const logoUrl =
  Object.entries(logos).find(([path]) => path.endsWith('.png'))?.[1] ?? Object.values(logos)[0]

const ACTION_LABEL: Record<Mode, string> = {
  collapsed: 'Open',
  expanded: 'Close',
  bouncing: 'Stop bouncing',
  returning: 'Returning',
  capturing: 'Taking screenshot',
}

/** The always-on-top logo bubble. Clicks go to the main process, which decides what they mean. */
export function BubbleView() {
  useClickThrough()
  const state = useAssistState()
  useAccentColor(state?.branding.accentColor)
  const mode = state?.mode ?? 'collapsed'
  const appName = state?.branding.appName ?? 'Desktop Assist'

  return (
    <div className="flex h-full w-full items-center justify-center">
      <button
        data-hit
        type="button"
        aria-label={`${ACTION_LABEL[mode]} ${appName}`}
        onClick={() => window.assist.bubbleClick()}
        style={{ width: UI.bubbleSize, height: UI.bubbleSize }}
        className={cn(
          'overflow-hidden rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.35)] outline-none',
          'transition-transform duration-150 ease-out hover:scale-105 active:scale-95',
          'motion-reduce:transition-none',
          mode === 'expanded' &&
            'ring-2 ring-accent ring-offset-2 ring-offset-white dark:ring-offset-zinc-900',
        )}
      >
        <img
          src={logoUrl}
          alt=""
          draggable={false}
          className="pointer-events-none size-full object-contain"
        />
      </button>
    </div>
  )
}
