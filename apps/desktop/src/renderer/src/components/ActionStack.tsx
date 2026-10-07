import { Camera, Power, Settings, Volleyball, type LucideIcon } from 'lucide-react'
import { ACTIONS, type ActionId } from '@shared/actions'
import { PANEL_LAYOUT, UI } from '@shared/geometry'
import { cn } from '../lib/cn'

const ICONS: Record<ActionId, LucideIcon> = {
  screenshot: Camera,
  settings: Settings,
  bounce: Volleyball,
  close: Power,
}

/** The icons that pop out above the bubble, nearest-first in the tenant's order. */
export function ActionStack(props: {
  actions: ActionId[]
  open: boolean
  activeId: ActionId | null
  onAction: (id: ActionId) => void
}) {
  return (
    <div
      className="absolute flex flex-col-reverse"
      style={{
        right: PANEL_LAYOUT.actionsRight,
        bottom: PANEL_LAYOUT.actionsBottom,
        gap: UI.actionGap,
      }}
    >
      {props.actions.map((id, index) => {
        const Icon = ICONS[id]
        const { label } = ACTIONS[id]
        const active = id === props.activeId
        return (
          <button
            key={id}
            data-hit
            data-action={id}
            type="button"
            title={label}
            aria-label={label}
            aria-expanded={ACTIONS[id].kind === 'popover' ? active : undefined}
            onClick={() => props.onAction(id)}
            style={{
              width: UI.actionSize,
              height: UI.actionSize,
              // Pop out one after another, nearest the bubble first.
              transitionDelay: props.open ? `${index * 30}ms` : '0ms',
            }}
            className={cn(
              'grid place-items-center rounded-full border shadow-md outline-none',
              'transition duration-150 ease-out motion-reduce:transition-none',
              'focus-visible:ring-2 focus-visible:ring-accent',
              'translate-y-3 scale-75 opacity-0',
              'group-data-open:translate-y-0 group-data-open:scale-100 group-data-open:opacity-100',
              active
                ? 'border-transparent bg-accent text-white'
                : id === 'close'
                  ? 'border-black/10 bg-white text-zinc-700 hover:border-transparent hover:bg-red-600 hover:text-white dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200'
                  : 'border-black/10 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700',
            )}
          >
            <Icon size={18} strokeWidth={2} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
