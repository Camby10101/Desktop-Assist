import { Menu, nativeImage, Tray, type NativeImage } from 'electron'
import { circleBitmap } from './trayIcon'

// The tenant's logo, the same image as the bubble. Only a PNG can be used: Windows can't draw a
// tray icon from SVG. `?asset` makes the build copy the file and gives its path at runtime.
const logos = import.meta.glob<string>('@tenant/logo.png', {
  query: '?asset',
  import: 'default',
  eager: true,
})
const logoPath = Object.values(logos)[0]

/** The tray icon is 16px at 100% display scaling; Windows picks the size for each scaling. */
const TRAY_SIZE = 16
const SCALE_FACTORS = [1, 1.25, 1.5, 2]

export function createTray(options: {
  appName: string
  accentColor: string
  onOpen: () => void
  onQuit: () => void
}): Tray {
  const tray = new Tray(trayImage(options.accentColor))
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

/**
 * The logo, resized smoothly for each display scaling (letting Windows shrink the 512px image
 * itself looks jagged). A tenant without logo.png gets a plain circle in its accent colour.
 */
function trayImage(accentColor: string): NativeImage {
  const logo = logoPath ? nativeImage.createFromPath(logoPath) : null
  if (!logo || logo.isEmpty()) {
    const size = TRAY_SIZE * 2
    return nativeImage.createFromBitmap(circleBitmap(size, accentColor), {
      width: size,
      height: size,
      scaleFactor: 2,
    })
  }
  const image = nativeImage.createEmpty()
  for (const scaleFactor of SCALE_FACTORS) {
    const size = Math.round(TRAY_SIZE * scaleFactor)
    image.addRepresentation({
      scaleFactor,
      width: size,
      height: size,
      buffer: logo.resize({ width: size, height: size, quality: 'best' }).toPNG(),
    })
  }
  return image
}
