// Geometry shared by the main process (which sizes and moves windows) and the renderer (which
// positions elements inside them). All values are DIPs (device-independent pixels).

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Rect extends Point, Size {}

export const UI = {
  /** Gap between the bubble and the edges of the work area. */
  edgeMargin: 16,
  bubbleSize: 56,
  /** Transparent margin around the bubble inside its window (room for the shadow and ring). */
  bubblePad: 8,
  /** Space between the bubble and the text box / action stack. */
  gap: 12,
  /** The chat card. It starts as just the text box and grows upward to this height. */
  panelWidth: 400,
  panelMaxHeight: 520,
  actionSize: 40,
  actionGap: 8,
  /** Room for drop shadows along the panel window's top and left edges. */
  shadowPad: 16,
  settingsMenuWidth: 248,
} as const

/** The bubble window is the bubble plus its padding on every side. */
export const BUBBLE_BOX = UI.bubbleSize + UI.bubblePad * 2

/**
 * Where things sit inside the panel window, measured from its bottom-right corner. The panel
 * window shares that corner with the bubble window, so these line up with the bubble on screen.
 */
export const PANEL_LAYOUT = {
  actionsRight: UI.bubblePad + (UI.bubbleSize - UI.actionSize) / 2,
  actionsBottom: UI.bubblePad + UI.bubbleSize + UI.gap,
  notesRight: UI.bubblePad + UI.bubbleSize + UI.gap,
  notesBottom: UI.bubblePad,
  settingsRight: UI.bubblePad + (UI.bubbleSize + UI.actionSize) / 2 + UI.actionGap,
} as const

export function actionStackHeight(actionCount: number): number {
  return actionCount > 0 ? actionCount * UI.actionSize + (actionCount - 1) * UI.actionGap : 0
}

/** Distance from the panel window's bottom edge to the bottom of the action at `index`. */
export function actionBottom(index: number): number {
  return PANEL_LAYOUT.actionsBottom + index * (UI.actionSize + UI.actionGap)
}

export function panelWindowSize(actionCount: number): Size {
  const width = PANEL_LAYOUT.notesRight + UI.panelWidth + UI.shadowPad
  const contentHeight = Math.max(
    PANEL_LAYOUT.notesBottom + UI.panelMaxHeight,
    PANEL_LAYOUT.actionsBottom + actionStackHeight(actionCount),
  )
  return { width, height: contentHeight + UI.shadowPad }
}
