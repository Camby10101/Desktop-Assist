import { Minus, Plus } from 'lucide-react'
import {
  CHARACTER_SIZES,
  type CharacterSize,
  type Corner,
  type PanelLayout,
} from '@shared/geometry'
import { anchored } from '../lib/anchor'
import { cn } from '../lib/cn'

const MENU_WIDTH = 200

/** Her size as people say it: "½×", "1.5×", "6×". */
export function sizeLabel(scale: number): string {
  return `${scale === 0.5 ? '½' : scale === 0.75 ? '¾' : scale}×`
}

/** The next size down, or up, of CHARACTER_SIZES, no bigger than `max`; null at either end. */
export function nextSize(scale: number, way: 1 | -1, max: number): number | null {
  const sizes = CHARACTER_SIZES.filter((size) => size <= max)
  const next = way === 1 ? sizes.find((size) => size > scale) : sizes.findLast((s) => s < scale)
  return next ?? null
}

/**
 * The menu that opens beside the size icon: buttons to make her smaller and bigger, a step of
 * CHARACTER_SIZES at a time, from half her usual size up to six times it (or as big as fits her
 * screen, when that's less). The main process resizes her and remembers it; the new size comes
 * back in the app state, so this shows whatever she really is.
 */
export function SizeMenu(props: {
  corner: Corner
  layout: PanelLayout
  /** Distance from the bubble's edge of the window to the size icon, so the menu lines up. */
  offset: number
  size: CharacterSize
  onSetSize: (scale: number) => void
}) {
  const { scale, max } = props.size
  const smaller = nextSize(scale, -1, max)
  const bigger = nextSize(scale, 1, max)
  const limited = max < CHARACTER_SIZES.at(-1)!
  return (
    <div
      data-hit
      data-size-menu
      role="group"
      aria-label="Her size"
      className={cn(
        'absolute rounded-xl border p-2.5 shadow-xl',
        'border-black/10 bg-white text-zinc-800 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100',
      )}
      style={{ ...anchored(props.corner, props.layout.settingsX, props.offset), width: MENU_WIDTH }}
    >
      <p className="mb-2 text-sm">Her size</p>
      <div className="flex items-center justify-between gap-2">
        <SizeButton
          label="Smaller"
          disabled={smaller === null}
          onClick={() => smaller !== null && props.onSetSize(smaller)}
        >
          <Minus size={16} aria-hidden />
        </SizeButton>
        <span aria-live="polite" className="min-w-12 text-center text-lg font-medium tabular-nums">
          {sizeLabel(scale)}
        </span>
        <SizeButton
          label="Bigger"
          disabled={bigger === null}
          onClick={() => bigger !== null && props.onSetSize(bigger)}
        >
          <Plus size={16} aria-hidden />
        </SizeButton>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">
        {limited && bigger === null
          ? 'As big as fits this screen'
          : `From ${sizeLabel(CHARACTER_SIZES[0])} to ${sizeLabel(limited ? max : CHARACTER_SIZES.at(-1)!)}`}
      </p>
    </div>
  )
}

function SizeButton(props: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className={cn(
        'grid size-9 place-items-center rounded-full border outline-none',
        'focus-visible:ring-2 focus-visible:ring-accent',
        props.disabled
          ? 'cursor-default border-black/5 text-zinc-300 dark:border-white/5 dark:text-zinc-600'
          : 'border-black/10 hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-zinc-800',
      )}
    >
      {props.children}
    </button>
  )
}
