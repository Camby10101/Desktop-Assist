import { app, BrowserWindow, Menu, screen, type MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import type { Size } from '@shared/geometry'
import { IPC } from '@shared/ipc'
import type { PanelSurface, Surface } from './BubbleController'

export type View = 'bubble' | 'panel'

/**
 * How the overlay windows stay on top. Electron's default level for always-on-top, "floating",
 * tucks a window just behind the taskbar on Windows. While a full-screen app is in front, Windows
 * takes the taskbar out of the always-on-top group, and a window tucked behind it then loses its
 * own always-on-top too: started that way (say, at sign-in, with a full-screen browser already
 * open), the bubble sat behind everything. From this level up, Electron simply keeps the window
 * on top, taskbar or not.
 */
export const ON_TOP_LEVEL = 'pop-up-menu'

/** How often the overlay windows check they're still on top (see keepOnTop). */
export const ON_TOP_CHECK_MS = 5000

/**
 * Creates one of the two overlay windows. Both are frameless, transparent, always on top and
 * hidden from the taskbar and Alt+Tab.
 *
 * The panel window is mostly see-through, so it's click-through: clicks on its empty areas go to
 * whatever is underneath, and the renderer turns mouse input back on while the pointer is over
 * real UI (see useClickThrough). The bubble window is never click-through: it's barely larger
 * than the bubble, and relying on Windows' mouse forwarding there made clicks occasionally fall
 * through the bubble to the window behind it.
 */
export function createOverlayWindow(view: View, size: Size): BrowserWindow {
  const win = new BrowserWindow({
    ...size,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    thickFrame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // Always on top, but at ON_TOP_LEVEL (set below); `alwaysOnTop: true` here would use
    // Electron's default level, which loses it while a full-screen app is in front.
    type: 'toolbar',
    // Both can take the focus. A bubble that couldn't had its mouse presses dropped by Windows /
    // Chromium after clicking elsewhere (only the release arrived, so clicks did nothing).
    // Clicking the bubble now takes the focus from an open panel; BubbleController.clickBubble
    // knows that press closed it.
    focusable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: view === 'panel',
    },
  })
  win.setAlwaysOnTop(true, ON_TOP_LEVEL)
  lockDown(win, view)
  if (view === 'panel') {
    win.setIgnoreMouseEvents(true, { forward: true })
    addEditContextMenu(win)
  }

  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServer) {
    void win.loadURL(`${devServer}?view=${view}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { query: { view } })
  }
  return win
}

/**
 * Puts the window back on top if something took that away. Windows can still demote an
 * always-on-top window (another app reordering windows, Explorer restarting), and nothing tells
 * the app when it happens, so the windows check every few seconds; it costs one look at the
 * window's style, and only a window that lost it is moved. Returns a function that stops it.
 */
export function keepOnTop(win: BrowserWindow): () => void {
  const timer = setInterval(() => {
    if (!win.isDestroyed() && !win.isAlwaysOnTop()) win.setAlwaysOnTop(true, ON_TOP_LEVEL)
  }, ON_TOP_CHECK_MS)
  return () => clearInterval(timer)
}

export function bubbleSurface(win: BrowserWindow): Surface {
  return {
    setBounds: (bounds) => win.setBounds(bounds),
    show: () => {
      // Also puts it at the top of the always-on-top windows, in front of any shown meanwhile.
      win.setAlwaysOnTop(true, ON_TOP_LEVEL)
      win.showInactive()
    },
    hide: () => win.hide(),
  }
}

export function panelSurface(win: BrowserWindow): PanelSurface {
  return {
    setBounds: (bounds) => win.setBounds(bounds),
    show: () => {
      resetClickThrough(win)
      win.setAlwaysOnTop(true, ON_TOP_LEVEL)
      win.show()
    },
    hide: () => win.hide(),
    focus: () => win.focus(),
  }
}

/**
 * Starts the panel's click-through afresh each time it's shown. While hidden, the page can't
 * follow the pointer, so its idea of whether the pointer is over real UI is out of date (and
 * Windows may have dropped the mouse forwarding). Switching forwarding off and on re-installs it,
 * and the page is told exactly where the pointer is now, so it can decide straight away.
 */
function resetClickThrough(win: BrowserWindow): void {
  win.setIgnoreMouseEvents(false)
  win.setIgnoreMouseEvents(true, { forward: true })
  const cursor = screen.getCursorScreenPoint()
  const bounds = win.getBounds()
  win.webContents.send(IPC.clickThroughReset, { x: cursor.x - bounds.x, y: cursor.y - bounds.y })
}

function lockDown(win: BrowserWindow, view: View): void {
  const contents = win.webContents
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event) => event.preventDefault())
  contents.on('render-process-gone', () => {
    // A crashed panel can't report the pointer, so let clicks through until it has reloaded.
    if (view === 'panel') win.setIgnoreMouseEvents(true, { forward: true })
    contents.reload()
  })
}

/** Right-click menu for the text box: spelling suggestions plus the usual edit commands. */
function addEditContextMenu(win: BrowserWindow): void {
  win.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return
    const suggestions: MenuItemConstructorOptions[] = params.dictionarySuggestions
      .slice(0, 5)
      .map((word) => ({ label: word, click: () => win.webContents.replaceMisspelling(word) }))
    const template: MenuItemConstructorOptions[] = [
      ...suggestions,
      ...(suggestions.length > 0 ? [{ type: 'separator' as const }] : []),
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { type: 'separator' },
      { role: 'selectAll' },
    ]
    Menu.buildFromTemplate(template).popup({ window: win })
  })
}
