// The action registry: every icon that can appear in the stack above the bubble. A tenant's
// `actions` list chooses which of these show and in what order (from the bubble upward).
//
// - `command` actions run in the main process (see src/main/actions.ts).
// - `popover` actions open UI inside the panel (a page or a menu); whatever that does next is up
//   to it.

export const ACTION_IDS = [
  'ask',
  'apps',
  'jira',
  'servicedesk',
  'screenshot',
  'settings',
  'spells',
  'screensaver',
  'close',
] as const

export type ActionId = (typeof ACTION_IDS)[number]

export const ACTIONS = {
  ask: { label: 'Ask Claude', kind: 'popover' },
  apps: { label: 'Your apps', kind: 'popover' },
  jira: { label: 'Jira: notifications and search', kind: 'popover' },
  // A page in the panel when the tenant lists request types (see PanelView); otherwise a link.
  servicedesk: { label: 'IT service desk', kind: 'command' },
  screenshot: { label: 'Take screenshot', kind: 'command' },
  // Light or dark mode and her size are in here too.
  settings: { label: 'Settings', kind: 'popover' },
  // A menu of her spells (src/shared/spells.ts); casting one goes to the main process.
  spells: { label: 'Spells', kind: 'popover' },
  // Every screen fades to white, then to a sunset she watches (src/shared/screenSaver.ts).
  screensaver: { label: 'Screen saver', kind: 'command' },
  close: { label: 'Close Desktop Wizard', kind: 'command' },
} as const satisfies Record<ActionId, { label: string; kind: 'command' | 'popover' }>

export type CommandActionId = {
  [K in ActionId]: (typeof ACTIONS)[K]['kind'] extends 'command' ? K : never
}[ActionId]

export const COMMAND_ACTION_IDS = ACTION_IDS.filter(
  (id): id is CommandActionId => ACTIONS[id].kind === 'command',
)
