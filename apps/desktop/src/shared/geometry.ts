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

/**
 * A screen corner. The character lives near a bottom one; the panel lays itself out from the
 * bubble's corner (any of the four) to open toward the screen's middle.
 */
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export const isLeftCorner = (corner: Corner): boolean => corner.endsWith('left')
export const isTopCorner = (corner: Corner): boolean => corner.startsWith('top')

export const UI = {
  /** Gap between the character and the side of the work area when it's right in its corner. */
  edgeMargin: 16,
  /** The bubble's box, which its position is measured from (its top-left corner). */
  bubbleSize: 80,
  /**
   * The bubble's window is this much bigger than the box on every side. The character is drawn
   * across the whole window, its feet on the window's bottom edge.
   */
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
 * The sizes she comes in, as multiples of her usual size (1): from half as big to six times as
 * big. Each keeps every measurement below a whole number of DIPs.
 */
export const CHARACTER_SIZES = [0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6] as const
export const DEFAULT_SIZE = 1

/** How big she is, and the biggest she can be on her screen (see largestSize). */
export interface CharacterSize {
  scale: number
  max: number
}

/** The nearest of CHARACTER_SIZES to `scale` (a saved size from an older version, say). */
export function snapSize(scale: number): number {
  if (!Number.isFinite(scale)) return DEFAULT_SIZE
  return CHARACTER_SIZES.reduce((best, size) =>
    Math.abs(size - scale) < Math.abs(best - scale) ? size : best,
  )
}

/** The bubble at a size: its box, the padding round it, and its window (box plus padding). */
export function bubbleMetrics(scale: number = DEFAULT_SIZE): {
  size: number
  pad: number
  box: number
} {
  return { size: UI.bubbleSize * scale, pad: UI.bubblePad * scale, box: BUBBLE_BOX * scale }
}

/**
 * Where things sit inside the panel window, for her size. The panel window shares one corner with
 * the bubble window (the corner of the screen the bubble is in), and these offsets are measured
 * from that corner: `X` across, `Y` away from the screen edge. So the same numbers work in every
 * corner. The bigger she is, the further out the chat card and the action stack sit.
 */
export interface PanelLayout {
  actionsX: number
  actionsY: number
  chatX: number
  chatY: number
  settingsX: number
}

export function panelLayout(scale: number = DEFAULT_SIZE): PanelLayout {
  const { size, pad } = bubbleMetrics(scale)
  return {
    actionsX: pad + (size - UI.actionSize) / 2,
    actionsY: pad + size + UI.gap,
    chatX: pad + size + UI.gap,
    chatY: pad,
    settingsX: pad + (size + UI.actionSize) / 2 + UI.actionGap,
  }
}

export function actionStackHeight(actionCount: number): number {
  return actionCount > 0 ? actionCount * UI.actionSize + (actionCount - 1) * UI.actionGap : 0
}

/** Distance from the bubble's edge of the panel window to the near side of the action at `index`. */
export function actionOffset(index: number, scale: number = DEFAULT_SIZE): number {
  return panelLayout(scale).actionsY + index * (UI.actionSize + UI.actionGap)
}

export function panelWindowSize(actionCount: number, scale: number = DEFAULT_SIZE): Size {
  const layout = panelLayout(scale)
  const width = layout.chatX + UI.panelWidth + UI.shadowPad
  const contentHeight = Math.max(
    layout.chatY + UI.panelMaxHeight + UI.toastRoom,
    layout.actionsY + actionStackHeight(actionCount),
  )
  return { width, height: contentHeight + UI.shadowPad }
}

/**
 * The biggest of CHARACTER_SIZES she can be on a work area: standing in it with room at the
 * sides, and with the panel (its chat card and every action, above her) fitting on the screen,
 * so the size menu can always be reached to make her smaller again.
 */
export function largestSize(workArea: Size, actionCount: number): number {
  const fitting = CHARACTER_SIZES.filter((scale) => {
    const panel = panelWindowSize(actionCount, scale)
    return (
      panel.width <= workArea.width &&
      panel.height <= workArea.height &&
      UI.bubbleSize * scale + 2 * UI.edgeMargin <= workArea.width
    )
  })
  return fitting.at(-1) ?? CHARACTER_SIZES[0]
}
