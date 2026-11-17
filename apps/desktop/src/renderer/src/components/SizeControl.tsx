import { Minus, Plus } from 'lucide-react'
import { CHARACTER_SIZES, type CharacterSize } from '@shared/geometry'
import { cn } from '../lib/cn'
import { nextSize, sizeLabel } from '../lib/sizes'

/**
 * Her size, in the Settings menu: buttons to make her smaller and bigger, a step of
 * CHARACTER_SIZES at a time, from half her usual size up to six times it (or as big as fits her
 * screen, when that's less). The main process resizes her and remembers it; the new size comes
 * back in the app state, so this shows whatever she really is.
 */
export function SizeControl(props: { size: CharacterSize; onSetSize: (scale: number) => void }) {
  const { scale, max } = props.size
  const smaller = nextSize(scale, -1, max)
  const bigger = nextSize(scale, 1, max)
  const limited = max < CHARACTER_SIZES.at(-1)!
  return (
    <div role="group" aria-label="Size" className="flex items-center gap-3 px-2.5 py-1.5">
      <span className="min-w-0 flex-1 text-sm">
        Size
        <span className="block text-[11px] text-zinc-500">
          {limited && bigger === null
            ? 'As big as fits this screen'
            : `${sizeLabel(CHARACTER_SIZES[0])} to ${sizeLabel(limited ? max : CHARACTER_SIZES.at(-1)!)}`}
        </span>
      </span>
      <SizeButton
        label="Smaller"
        disabled={smaller === null}
        onClick={() => smaller !== null && props.onSetSize(smaller)}
      >
        <Minus size={14} aria-hidden />
      </SizeButton>
      <span aria-live="polite" className="min-w-9 text-center text-sm font-medium tabular-nums">
        {sizeLabel(scale)}
      </span>
      <SizeButton
        label="Bigger"
        disabled={bigger === null}
        onClick={() => bigger !== null && props.onSetSize(bigger)}
      >
        <Plus size={14} aria-hidden />
      </SizeButton>
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
        'grid size-7 shrink-0 place-items-center rounded-full border outline-none',
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
