import { mkdirSync, promises as fs, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ZodType } from 'zod'

export type ReadResult<T> =
  { status: 'ok'; value: T } | { status: 'missing' } | { status: 'invalid'; error: unknown }

export async function readJsonFile<T>(path: string, schema: ZodType<T>): Promise<ReadResult<T>> {
  let raw: string
  try {
    raw = await fs.readFile(path, 'utf8')
  } catch (err) {
    if (isErrno(err, 'ENOENT')) return { status: 'missing' }
    throw err
  }
  try {
    return { status: 'ok', value: schema.parse(JSON.parse(raw)) }
  } catch (error) {
    return { status: 'invalid', error }
  }
}

let tmpCounter = 0
const tmpPath = (path: string) => `${path}.${process.pid}.${++tmpCounter}.tmp`

/**
 * Writes via a temp file and a rename, so a crash mid-write can't leave a half-written file.
 * `shouldCommit` runs just before the rename; returning false discards the write (used to drop
 * a write that a newer one has already overtaken). Resolves to whether the file was replaced.
 */
export async function writeJsonFile(
  path: string,
  value: unknown,
  shouldCommit: () => boolean = () => true,
): Promise<boolean> {
  await fs.mkdir(dirname(path), { recursive: true })
  const tmp = tmpPath(path)
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  if (!shouldCommit()) {
    await fs.rm(tmp, { force: true })
    return false
  }
  await renameWithRetry(tmp, path)
  return true
}

export function writeJsonFileSync(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = tmpPath(path)
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  renameSync(tmp, path)
}

// On Windows, antivirus and the search indexer can hold the target open for a moment.
async function renameWithRetry(from: string, to: string, attempts = 5): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await fs.rename(from, to)
      return
    } catch (err) {
      const transient = ['EPERM', 'EBUSY', 'EACCES'].some((code) => isErrno(err, code))
      if (!transient || attempt >= attempts) throw err
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt))
    }
  }
}

export function isErrno(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && (err as NodeJS.ErrnoException).code === code
}
