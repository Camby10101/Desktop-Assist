import { Flame, Orbit, Sparkles, UsersRound, type LucideIcon } from 'lucide-react'
import { useRef } from 'react'
import { type Corner, type PanelLayout } from '@shared/geometry'
import { SPELL_LABELS, SPELLS, type Spell } from '@shared/spells'
import { useFitInWindow } from '../hooks/useFitInWindow'
import { anchored } from '../lib/anchor'
import { cn } from '../lib/cn'

const MENU_WIDTH = 176

const ICONS: Record<Spell, LucideIcon> = {
  clones: UsersRound,
  starfall: Sparkles,
  teleport: Orbit,
  explosion: Flame,
}

/**
 * The menu that opens beside the wand icon: her spells (src/shared/spells.ts), by name. Picking
 * one casts it; the main process closes the panel so it can be seen.
 */
export function SpellsMenu(props: {
  corner: Corner
  layout: PanelLayout
  /** Distance from the bubble's edge of the window to the wand icon, so the menu lines up. */
  offset: number
  onCast: (spell: Spell) => void
}) {
  // Beside the wand icon, but never past the top of the window.
  const menu = useRef<HTMLDivElement>(null)
  const fit = useFitInWindow(menu, props.offset)
  return (
    <div
      ref={menu}
      data-hit
      data-spells-menu
      role="menu"
      aria-label="Spells"
      className={cn(
        'absolute rounded-xl border p-1.5 shadow-xl',
        'border-black/10 bg-white text-zinc-800 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100',
      )}
      style={{
        ...anchored(props.corner, props.layout.settingsX, fit.offset),
        width: MENU_WIDTH,
        maxHeight: fit.maxHeight,
        overflowY: 'auto',
      }}
    >
      <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
        Spells
      </p>
      {SPELLS.map((spell) => {
        const Icon = ICONS[spell]
        return (
          <button
            key={spell}
            type="button"
            role="menuitem"
            onClick={() => props.onCast(spell)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <Icon size={16} className="shrink-0 text-accent" aria-hidden />
            {SPELL_LABELS[spell]}
          </button>
        )
      })}
    </div>
  )
}
