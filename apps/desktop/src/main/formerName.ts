import { existsSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'

// Desktop Wizard was called Desktop Assist up to version 1.0.0. The installer's product name
// changed with it, and so did the names of its .exe, its uninstaller, its shortcuts and its data
// folder. Its app ID, its install folder and its update signatures didn't, so a new version still
// installs over the old one (renaming the shortcuts as it goes). These carry over what a copy
// updated from then had under the old name.

/** The installer's product name (electron-builder.cjs): its .exe and uninstaller are named after it. */
export const PRODUCT_NAME = 'Desktop Wizard'
/** What it was called up to 1.0.0. */
export const FORMER_NAME = 'Desktop Assist'

/** The bits of the file system adoptFormerData uses (the real ones unless a test gives others). */
export interface Folders {
  exists(path: string): boolean
  rename(from: string, to: string): void
}

const disk: Folders = { exists: existsSync, rename: renameSync }

/**
 * The data folder to use: `name` in `appData` (its preferences, the text box, the sign-in, logs).
 * The first time, when there's no such folder yet but there is one by its old name (`formerName`),
 * the old one is renamed, so nothing is lost. If that fails (another program has a file in it
 * open), the old one stays in use.
 */
export function adoptFormerData(
  appData: string,
  name: string,
  formerName: string,
  folders: Folders = disk,
): string {
  const current = join(appData, name)
  const former = join(appData, formerName)
  if (folders.exists(current) || !folders.exists(former)) return current
  try {
    folders.rename(former, current)
    return current
  } catch {
    return former
  }
}

/** Windows' list of programs it starts at sign-in, as adoptFormerLoginItem uses it. */
export interface LoginItems {
  /** Whether Windows starts `exePath` at sign-in (this .exe, left out). */
  startsAtLogin(exePath?: string): boolean
  /** Has Windows start this .exe at sign-in. */
  startAtLogin(): void
}

/**
 * Keeps "Start with Windows" on through the rename: if Windows still starts the old .exe at sign-in
 * ("Desktop Assist.exe", beside this one; the update removed it), it starts this one instead.
 * Returns whether it changed anything.
 */
export function adoptFormerLoginItem(exePath: string, items: LoginItems): boolean {
  const former = join(dirname(exePath), `${FORMER_NAME}.exe`)
  if (items.startsAtLogin() || !items.startsAtLogin(former)) return false
  items.startAtLogin()
  return true
}
