// The app's kinds of window. Every one loads the same page, and its address (`index.html?view=…`)
// says which it is: the main process makes them (bubble/windows.ts) and the page shows the view
// for each (renderer/src/main.tsx, which won't build without one for every view here).

/**
 * Windows that only show something over the screen (her clones, her vision, spells' effects, her
 * familiar, her taskbar tricks' icons, her battle): they never take the mouse or the focus. To add
 * one, name it here, give it a page (main.tsx), and open it with index.ts's openOverlay.
 */
export const PASSIVE_VIEWS = ['clones', 'vision', 'spell', 'familiar', 'trick', 'battle'] as const
export type PassiveView = (typeof PASSIVE_VIEWS)[number]

/** Every kind of window: her own, the panel beside her, the screen saver's, and the passive ones. */
export type View = 'bubble' | 'panel' | 'screensaver' | PassiveView

export const isPassive = (view: View): view is PassiveView =>
  (PASSIVE_VIEWS as readonly string[]).includes(view)
