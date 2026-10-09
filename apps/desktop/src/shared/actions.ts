// The action registry: every icon that can appear in the stack above the bubble. A tenant's
// `actions` list chooses which of these show and in what order (from the bubble upward).
//
// - `command` actions run in the main process (see src/main/actions.ts).
// - `popover` actions open UI inside the panel and never reach the main process.

export const ACTION_IDS = [
  'ask',
  'apps',
  'servicedesk',
  'screenshot',
  'settings',
  'bounce',
  'close',
] as const

export type ActionId = (typeof ACTION_IDS)[number]

export const ACTIONS = {
  ask: { label: 'Ask Claude', kind: 'popover' },
  apps: { label: 'Your apps', kind: 'popover' },
  servicedesk: { label: 'IT service desk', kind: 'command' },
  screenshot: { label: 'Take screenshot', kind: 'command' },
  settings: { label: 'Settings', kind: 'popover' },
  bounce: { label: 'Bounce', kind: 'command' },
  close: { label: 'Close Desktop Assist', kind: 'command' },
} as const satisfies Record<ActionId, { label: string; kind: 'command' | 'popover' }>

export type CommandActionId = {
  [K in ActionId]: (typeof ACTIONS)[K]['kind'] extends 'command' ? K : never
}[ActionId]

export const COMMAND_ACTION_IDS = ACTION_IDS.filter(
  (id): id is CommandActionId => ACTIONS[id].kind === 'command',
)
