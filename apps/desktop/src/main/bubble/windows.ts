import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import type { Size } from '@shared/geometry'
import type { PanelSurface, Surface } from './BubbleController'

export type View = 'bubble' | 'panel'

/**
 * Creates one of the two overlay windows. Both are frameless, transparent, always on top and
 * hidden from the taskbar and Alt+Tab. They start click-through; the renderer turns mouse input
 * back on while the pointer is over real UI (see useClickThrough).
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
  win.setIgnoreMouseEvents(true, { forward: true })
  lockDown(win)
  if (view === 'panel') addEditContextMenu(win)

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
    show: () => win.show(),
    hide: () => win.hide(),
    focus: () => win.focus(),
  }
}

function lockDown(win: BrowserWindow): void {
  const contents = win.webContents
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event) => event.preventDefault())
  // A crashed renderer can't report the pointer, so make the window click-through and reload.
  contents.on('render-process-gone', () => {
    win.setIgnoreMouseEvents(true, { forward: true })
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
