import { dirname, join } from 'node:path'
import type { UninstallResult } from '@shared/types'

export interface UninstallDeps {
  /** Only an installed copy has an uninstaller; `npm run dev` doesn't. */
  isPackaged: boolean
  /** The running .exe, which the uninstaller sits next to. */
  exePath: string
  /** The installer's product name: the uninstaller is "Uninstall <productName>.exe". */
  productName: string
  exists(path: string): boolean
  /** Turns "Start with Windows" off, so no startup entry is left pointing at a deleted .exe. */
  stopStartingWithWindows(): void
  /** Starts the uninstaller on its own, so it carries on once this app has quit. */
  runDetached(path: string): void
  quit(): void
  onError?(error: unknown): void
}

/** Where electron-builder's installer puts the uninstaller: next to the app's .exe. */
export function uninstallerPath(exePath: string, productName: string): string {
  return join(dirname(exePath), `Uninstall ${productName}.exe`)
}

/**
 * Removes Desktop Assist from this PC: starts its uninstaller (which shows its own progress and
 * takes the app, its Start menu shortcut and its uninstall entry away), then quits so the files
 * can be deleted. The data folder (%APPDATA%\Desktop Assist: preferences, the text box, logs) and
 * the screenshots in Pictures are kept, as with any uninstall from Windows Settings.
 */
export function uninstall(deps: UninstallDeps): UninstallResult {
  if (!deps.isPackaged) return { ok: false, reason: 'not-installed' }
  const uninstaller = uninstallerPath(deps.exePath, deps.productName)
  if (!deps.exists(uninstaller)) return { ok: false, reason: 'missing' }
  try {
    deps.stopStartingWithWindows()
    deps.runDetached(uninstaller)
  } catch (error) {
    deps.onError?.(error)
    return { ok: false, reason: 'failed' }
  }
  deps.quit()
  return { ok: true }
}
