import { app, BrowserWindow, Menu, screen, type MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import type { Size } from '@shared/geometry'
import { IPC } from '@shared/ipc'
import type { PanelSurface, Surface } from './BubbleController'

export type View = 'bubble' | 'panel'

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
    alwaysOnTop: true,
    type: 'toolbar',
    // The bubble never takes keyboard focus, so clicking it doesn't blur the panel.
    focusable: view === 'panel',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: view === 'panel',
    },
  })
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

export function bubbleSurface(win: BrowserWindow): Surface {
  return {
    setBounds: (bounds) => win.setBounds(bounds),
    show: () => win.showInactive(),
    hide: () => win.hide(),
  }
}

export function panelSurface(win: BrowserWindow): PanelSurface {
  return {
    setBounds: (bounds) => win.setBounds(bounds),
    show: () => {
      resetClickThrough(win)
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
