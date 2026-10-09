import {
  Camera,
  Headset,
  LayoutGrid,
  MessageCircle,
  Moon,
  Power,
  Settings,
  Sun,
  Volleyball,
  type LucideIcon,
} from 'lucide-react'
import { ACTIONS, type ActionId } from '@shared/actions'
import { PANEL_LAYOUT, UI, isTopCorner, type Corner } from '@shared/geometry'
import type { Theme } from '@shared/types'
import { anchored } from '../lib/anchor'
import { cn } from '../lib/cn'

const ICONS: Record<ActionId, LucideIcon> = {
  ask: MessageCircle,
  apps: LayoutGrid,
  servicedesk: Headset,
  screenshot: Camera,
  theme: Sun,
  settings: Settings,
  bounce: Volleyball,
  close: Power,
}

/**
 * The icons that pop out of the bubble, nearest-first in the tenant's order: stacked above it in
 * a bottom corner, below it in a top corner.
 */
export function ActionStack(props: {
  corner: Corner
  actions: ActionId[]
  open: boolean
  activeId: ActionId | null
  /** The current mode: the theme icon shows the one it switches to. */
  theme: Theme
  /** Icons with a small dot, e.g. Ask Claude while an unsent question is waiting behind it. */
  dotted?: ActionId[]
  onAction: (id: ActionId) => void
}) {
  const top = isTopCorner(props.corner)
  return (
    <div
      className={cn('absolute flex', top ? 'flex-col' : 'flex-col-reverse')}
      style={{
        ...anchored(props.corner, PANEL_LAYOUT.actionsX, PANEL_LAYOUT.actionsY),
        gap: UI.actionGap,
      }}
    >
      {props.actions.map((id, index) => {
        const Icon = id === 'theme' && props.theme === 'light' ? Moon : ICONS[id]
        const label =
          id === 'theme'
            ? props.theme === 'dark'
              ? 'Switch to light mode'
              : 'Switch to dark mode'
            : ACTIONS[id].label
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
              'relative grid place-items-center rounded-full border shadow-md outline-none',
              'transition duration-150 ease-out motion-reduce:transition-none',
              'focus-visible:ring-2 focus-visible:ring-accent',
              // Hidden icons sit tucked toward the bubble, then slide out.
              top ? '-translate-y-3' : 'translate-y-3',
              'scale-75 opacity-0',
              'group-data-open:translate-y-0 group-data-open:scale-100 group-data-open:opacity-100',
              active
                ? 'border-transparent bg-accent text-white'
                : id === 'close'
                  ? 'border-black/10 bg-white text-zinc-700 hover:border-transparent hover:bg-red-600 hover:text-white dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200'
                  : 'border-black/10 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700',
            )}
          >
            <Icon size={18} strokeWidth={2} aria-hidden />
            {props.dotted?.includes(id) && !active && (
              <span
                aria-hidden
                className="absolute top-1 right-1 size-2.5 rounded-full border-2 border-white bg-accent dark:border-zinc-800"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
