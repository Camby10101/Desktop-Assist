import { FolderOpen, KeyRound, MessageSquarePlus, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { PANEL_LAYOUT, UI } from '@shared/geometry'
import type { Branding, Effort, Settings } from '@shared/types'
import { cn } from '../lib/cn'

const CONFIRM_MS = 3000

const EFFORTS: { value: Effort; label: string; hint: string }[] = [
  { value: 'low', label: 'Fast', hint: 'Quick answers' },
  { value: 'medium', label: 'Balanced', hint: 'Thinks a little longer' },
  { value: 'high', label: 'Thorough', hint: 'Thinks hardest; slower' },
]

/** The menu that opens beside the gear icon. */
export function SettingsMenu(props: {
  /** Distance from the window's bottom edge, so the menu lines up with the gear. */
  bottom: number
  settings: Settings
  branding: Branding
  version: string
  onToggleAutoStart: () => void
  onSetEffort: (effort: Effort) => void
  onChangeApiKey: () => void
  onOpenScreenshotsFolder: () => void
  onNewConversation: () => void
}) {
  // "New conversation" needs a second click within a few seconds.
  const [confirmingNew, setConfirmingNew] = useState(false)
  useEffect(() => {
    if (!confirmingNew) return
    const timer = setTimeout(() => setConfirmingNew(false), CONFIRM_MS)
    return () => clearTimeout(timer)
  }, [confirmingNew])

  const { settings, branding } = props

  return (
    <div
      data-hit
      data-settings-menu
      role="menu"
      aria-label="Settings"
      className={cn(
        'absolute rounded-xl border p-1.5 shadow-xl',
        'border-black/10 bg-white text-zinc-800 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100',
      )}
      style={{
        right: PANEL_LAYOUT.settingsRight,
        bottom: props.bottom,
        width: UI.settingsMenuWidth,
      }}
    >
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={settings.autoStart}
        disabled={!settings.autoStartAvailable}
        onClick={props.onToggleAutoStart}
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm',
          settings.autoStartAvailable
            ? 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
            : 'cursor-default opacity-60',
        )}
      >
        <span>
          Start with Windows
          {!settings.autoStartAvailable && (
            <span className="block text-[11px] text-zinc-500">Only in the installed app</span>
          )}
        </span>
        <Switch on={settings.autoStart} />
      </button>

      <div className="px-2.5 pt-1.5 pb-2">
        <p className="mb-1.5 text-sm">Response style</p>
        <div
          role="radiogroup"
          aria-label="Response style"
          className="flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800"
        >
          {EFFORTS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={settings.effort === option.value}
              title={option.hint}
              onClick={() => props.onSetEffort(option.value)}
              className={cn(
                'flex-1 rounded-md py-1 text-xs font-medium',
                settings.effort === option.value
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-600 dark:text-white'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <MenuItem icon={KeyRound} onClick={props.onChangeApiKey}>
        Change API key
      </MenuItem>

      <MenuItem icon={FolderOpen} onClick={props.onOpenScreenshotsFolder}>
        Open screenshots folder
      </MenuItem>

      <MenuItem
        icon={MessageSquarePlus}
        danger={confirmingNew}
        onClick={() => {
          if (!confirmingNew) return setConfirmingNew(true)
          setConfirmingNew(false)
          props.onNewConversation()
        }}
      >
        {confirmingNew ? 'Click again to clear the chat' : 'New conversation'}
      </MenuItem>

      <div className="mt-1 border-t border-black/10 px-2.5 pt-1.5 pb-0.5 text-[11px] text-zinc-500 dark:border-white/10">
        {branding.appName} {props.version} · {branding.companyName}
      </div>
    </div>
  )
}

function MenuItem(props: {
  icon: LucideIcon
  danger?: boolean
  onClick: () => void
  children: ReactNode
}) {
  const Icon = props.icon
  return (
    <button
      type="button"
      role="menuitem"
      onClick={props.onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm',
        props.danger ? 'bg-red-600 text-white' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800',
      )}
    >
      <Icon size={16} aria-hidden />
      {props.children}
    </button>
  )
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors',
        on ? 'bg-accent' : 'bg-zinc-300 dark:bg-zinc-600',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform',
          on ? 'translate-x-4.5' : 'translate-x-0.5',
        )}
      />
    </span>
  )
}
