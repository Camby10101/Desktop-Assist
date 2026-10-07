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

/** The screen corner the bubble rests in. The panel always opens toward the screen's middle. */
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export const isLeftCorner = (corner: Corner): boolean => corner.endsWith('left')
export const isTopCorner = (corner: Corner): boolean => corner.startsWith('top')

export const UI = {
  /** Gap between the bubble and the edges of the work area. */
  edgeMargin: 16,
  bubbleSize: 56,
  /** Transparent margin around the bubble inside its window (room for the shadow and ring). */
  bubblePad: 8,
  /** Space between the bubble and the chat card / action stack. */
  gap: 12,
  /** The chat card. It starts as just the text box and grows away from the bubble to this height. */
  panelWidth: 400,
  panelMaxHeight: 520,
  /** Room beyond the chat card for a toast message, even when the card is at full height. */
  toastRoom: 40,
  actionSize: 40,
  actionGap: 8,
  /** Room for drop shadows along the panel window's far edges. */
  shadowPad: 16,
  settingsMenuWidth: 248,
} as const

/** The bubble window is the bubble plus its padding on every side. */
export const BUBBLE_BOX = UI.bubbleSize + UI.bubblePad * 2

/**
 * Where things sit inside the panel window. The panel window shares one corner with the bubble
 * window (the corner of the screen the bubble is in), and these offsets are measured from that
 * corner: `X` across, `Y` away from the screen edge. So the same numbers work in every corner.
 */
export const PANEL_LAYOUT = {
  actionsX: UI.bubblePad + (UI.bubbleSize - UI.actionSize) / 2,
  actionsY: UI.bubblePad + UI.bubbleSize + UI.gap,
  chatX: UI.bubblePad + UI.bubbleSize + UI.gap,
  chatY: UI.bubblePad,
  settingsX: UI.bubblePad + (UI.bubbleSize + UI.actionSize) / 2 + UI.actionGap,
} as const

export function actionStackHeight(actionCount: number): number {
  return actionCount > 0 ? actionCount * UI.actionSize + (actionCount - 1) * UI.actionGap : 0
}

/** Distance from the bubble's edge of the panel window to the near side of the action at `index`. */
export function actionOffset(index: number): number {
  return PANEL_LAYOUT.actionsY + index * (UI.actionSize + UI.actionGap)
}

export function panelWindowSize(actionCount: number): Size {
  const width = PANEL_LAYOUT.chatX + UI.panelWidth + UI.shadowPad
  const contentHeight = Math.max(
    PANEL_LAYOUT.chatY + UI.panelMaxHeight + UI.toastRoom,
    PANEL_LAYOUT.actionsY + actionStackHeight(actionCount),
  )
  return { width, height: contentHeight + UI.shadowPad }
}
