import { Palette } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../lib/cn'
import { hueOf, hueToHex, ROBE_SWATCHES } from '../lib/robeColors'

/**
 * Her robe colour, in the Settings menu: the company's colour (the default), a row of ready-made
 * colours, and a slider for any hue. Her hat follows, a little darker (character.css mixes it from
 * the same colour); her trim, gold and patterns stay as they are. The main process remembers the
 * choice and tells her windows, so she changes as it's picked.
 */
export function RobeColorControl(props: {
  /** The colour chosen, or null for the company's. */
  color: string | null
  companyColor: string
  onSetColor: (color: string | null) => void
}) {
  const current = (props.color ?? props.companyColor).toLowerCase()
  const custom = props.color !== null && !ROBE_SWATCHES.some((s) => s.color === current)
  const [sliding, setSliding] = useState(custom)
  return (
    <div role="group" aria-label="Robe colour" className="px-2.5 py-1.5">
      <span className="block text-sm">
        Robe colour
        <span className="block text-[11px] text-zinc-500">
          {props.color === null ? 'Your company’s colour' : 'Her robe and hat'}
        </span>
      </span>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Swatch
          label="Company colour"
          color={props.companyColor}
          selected={props.color === null}
          onClick={() => props.onSetColor(null)}
        />
        {ROBE_SWATCHES.map((swatch) => (
          <Swatch
            key={swatch.color}
            label={swatch.label}
            color={swatch.color}
            selected={props.color !== null && current === swatch.color}
            onClick={() => props.onSetColor(swatch.color)}
          />
        ))}
        <button
          type="button"
          title="Any colour"
          aria-label="Any colour"
          aria-expanded={sliding}
          onClick={() => setSliding(!sliding)}
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-full text-white outline-none',
            'ring-offset-1 ring-offset-white focus-visible:ring-2 focus-visible:ring-accent dark:ring-offset-zinc-900',
            custom && 'ring-2 ring-zinc-900 dark:ring-white',
          )}
          style={{
            background:
              'conic-gradient(#ef4444, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7, #ec4899, #ef4444)',
          }}
        >
          <Palette size={12} aria-hidden />
        </button>
      </div>
      {sliding && (
        <input
          type="range"
          min={0}
          max={359}
          value={hueOf(current)}
          aria-label="Robe hue"
          onChange={(event) => props.onSetColor(hueToHex(Number(event.target.value)))}
          className={cn(
            'mt-2 h-2.5 w-full cursor-pointer appearance-none rounded-full outline-none',
            'focus-visible:ring-2 focus-visible:ring-accent',
            '[&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none',
            '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2',
            '[&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow',
          )}
          style={{
            background: `linear-gradient(to right, ${Array.from({ length: 7 }, (_, i) => hueToHex(i * 60)).join(', ')})`,
          }}
        />
      )}
    </div>
  )
}

function Swatch(props: { label: string; color: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.selected}
      onClick={props.onClick}
      className={cn(
        'size-6 shrink-0 rounded-full border border-black/10 outline-none dark:border-white/15',
        'ring-offset-1 ring-offset-white focus-visible:ring-2 focus-visible:ring-accent dark:ring-offset-zinc-900',
        props.selected && 'ring-2 ring-zinc-900 dark:ring-white',
      )}
      style={{ background: props.color }}
    />
  )
}
