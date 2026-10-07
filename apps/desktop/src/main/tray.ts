import { Menu, nativeImage, Tray } from 'electron'
import { circleBitmap } from './trayIcon'

const ICON_SIZE = 32 // drawn at 2× and scaled down for 100% displays

export function createTray(options: {
  appName: string
  accentColor: string
  onOpen: () => void
  onQuit: () => void
}): Tray {
  const icon = nativeImage.createFromBitmap(circleBitmap(ICON_SIZE, options.accentColor), {
    width: ICON_SIZE,
    height: ICON_SIZE,
    scaleFactor: 2,
  })
  const tray = new Tray(icon)
  tray.setToolTip(options.appName)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Open ${options.appName}`, click: options.onOpen },
      { type: 'separator' },
      { label: 'Quit', click: options.onQuit },
    ]),
  )
  tray.on('click', options.onOpen)
  return tray
}
