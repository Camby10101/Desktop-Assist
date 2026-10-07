import { promises as fs } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { isErrno } from '../storage/jsonFile'

const SCREENSHOT_NAME = /^Screenshot \d{4}-\d{2}-\d{2} \d{6}(?: \(\d+\))?\.png$/

const pad = (n: number) => String(n).padStart(2, '0')

/** "Screenshot 2026-10-02 140311.png", or "… (2).png" for a second capture in the same second. */
export function screenshotFileName(date: Date, copy = 1): string {
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return copy > 1 ? `Screenshot ${stamp} (${copy}).png` : `Screenshot ${stamp}.png`
}

export function isScreenshotFileName(name: string): boolean {
  return SCREENSHOT_NAME.test(name)
}

/** Saves a PNG into `dir` without ever overwriting an existing file. Returns the new path. */
export async function saveScreenshot(dir: string, png: Buffer, date: Date): Promise<string> {
  await fs.mkdir(dir, { recursive: true })
  for (let copy = 1; copy <= 100; copy++) {
    const path = join(dir, screenshotFileName(date, copy))
    try {
      await fs.writeFile(path, png, { flag: 'wx' })
      return path
    } catch (err) {
      if (!isErrno(err, 'EEXIST')) throw err
    }
  }
  throw new Error('Too many screenshots with the same timestamp')
}

/** The most recently written screenshot in `dir`, ignoring files we didn't name. */
export async function findLatestScreenshot(dir: string): Promise<string | null> {
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch (err) {
    if (isErrno(err, 'ENOENT')) return null
    throw err
  }
  let latest: { path: string; mtimeMs: number } | null = null
  for (const name of names.filter(isScreenshotFileName)) {
    const path = join(dir, name)
    try {
      const { mtimeMs } = await fs.stat(path)
      if (!latest || mtimeMs > latest.mtimeMs) latest = { path, mtimeMs }
    } catch {
      // Deleted between readdir and stat.
    }
  }
  return latest?.path ?? null
}

/** True if `file` is inside `dir` (not `dir` itself). Case-insensitive on Windows. */
export function isInsideDir(dir: string, file: string): boolean {
  const rel = relative(resolve(dir), resolve(file))
  return rel !== '' && rel.split(/[\\/]/)[0] !== '..' && !isAbsolute(rel)
}
