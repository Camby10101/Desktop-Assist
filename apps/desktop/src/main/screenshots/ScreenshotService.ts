import { desktopCapturer, nativeImage, shell, type Display } from 'electron'
import { promises as fs } from 'node:fs'
import { findLatestScreenshot, isInsideDir, saveScreenshot } from './files'

const THUMBNAIL_HEIGHT = 112 // 2× the chip's 56px preview, for high-DPI screens
const MAX_CACHED_THUMBNAILS = 50

export class ScreenshotService {
  private readonly thumbnails = new Map<string, string>()

  constructor(
    readonly dir: string,
    /** The display to capture: the one the bubble is on. */
    private readonly targetDisplay: () => Display,
  ) {}

  /** Captures the target display at full resolution and saves it. Returns the file path. */
  async capture(): Promise<string> {
    const display = this.targetDisplay()
    const thumbnailSize = {
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor),
    }
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize })
    const source =
      sources.find((s) => s.display_id === String(display.id)) ??
      (sources.length === 1 ? sources[0] : undefined)
    if (!source || source.thumbnail.isEmpty()) throw new Error('Could not capture the screen')
    return saveScreenshot(this.dir, source.thumbnail.toPNG(), new Date())
  }

  latest(): Promise<string | null> {
    return findLatestScreenshot(this.dir)
  }

  /** A small preview as a data URL, or null if the file is missing or not one of ours. */
  async thumbnail(path: string): Promise<string | null> {
    if (!this.owns(path)) return null
    let mtimeMs: number
    try {
      mtimeMs = (await fs.stat(path)).mtimeMs
    } catch {
      return null
    }
    const key = `${path}|${mtimeMs}`
    const cached = this.thumbnails.get(key)
    if (cached) return cached
    const image = nativeImage.createFromPath(path)
    if (image.isEmpty()) return null
    const url = image.resize({ height: THUMBNAIL_HEIGHT, quality: 'good' }).toDataURL()
    this.thumbnails.set(key, url)
    if (this.thumbnails.size > MAX_CACHED_THUMBNAILS) {
      this.thumbnails.delete(this.thumbnails.keys().next().value!)
    }
    return url
  }

  /** Opens a screenshot in the default image viewer. Returns false if it no longer exists. */
  async open(path: string): Promise<boolean> {
    if (!this.owns(path)) return false
    try {
      await fs.access(path)
    } catch {
      return false
    }
    return (await shell.openPath(path)) === ''
  }

  async openFolder(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
    await shell.openPath(this.dir)
  }

  /** Renderers may only ask about files inside the screenshots folder. */
  private owns(path: string): boolean {
    return isInsideDir(this.dir, path)
  }
}
