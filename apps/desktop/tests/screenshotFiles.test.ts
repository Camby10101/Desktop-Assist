import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  findLatestScreenshot,
  isInsideDir,
  isScreenshotFileName,
  saveScreenshot,
  screenshotFileName,
} from '../src/main/screenshots/files'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'desktop-assist-shots-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const date = new Date(2026, 9, 2, 14, 3, 11) // local time

describe('screenshotFileName', () => {
  it('uses a sortable local timestamp without characters Windows forbids', () => {
    expect(screenshotFileName(date)).toBe('Screenshot 2026-10-02 140311.png')
    expect(screenshotFileName(date, 2)).toBe('Screenshot 2026-10-02 140311 (2).png')
  })

  it('recognises only our own names', () => {
    expect(isScreenshotFileName('Screenshot 2026-10-02 140311.png')).toBe(true)
    expect(isScreenshotFileName('Screenshot 2026-10-02 140311 (3).png')).toBe(true)
    expect(isScreenshotFileName('holiday.png')).toBe(false)
    expect(isScreenshotFileName('Screenshot 2026-10-02 140311.jpg')).toBe(false)
  })
})

describe('saveScreenshot', () => {
  it('never overwrites a screenshot taken in the same second', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const first = await saveScreenshot(dir, png, date)
    const second = await saveScreenshot(dir, png, date)
    expect(first).not.toBe(second)
    expect((await readdir(dir)).sort()).toEqual([
      'Screenshot 2026-10-02 140311 (2).png',
      'Screenshot 2026-10-02 140311.png',
    ])
  })

  it('creates the folder if needed', async () => {
    const nested = join(dir, 'Pictures', 'Desktop Assist')
    const path = await saveScreenshot(nested, Buffer.from('x'), date)
    expect(path.startsWith(nested)).toBe(true)
  })
})

describe('findLatestScreenshot', () => {
  it('returns null when the folder does not exist yet', async () => {
    expect(await findLatestScreenshot(join(dir, 'missing'))).toBeNull()
  })

  it('picks the most recently written screenshot and ignores other files', async () => {
    const older = join(dir, 'Screenshot 2026-10-02 140311.png')
    const newer = join(dir, 'Screenshot 2026-10-01 090000.png') // older name, newer file
    const other = join(dir, 'unrelated.png')
    for (const path of [older, newer, other]) await writeFile(path, 'x')
    await utimes(older, new Date(2026, 9, 2), new Date(2026, 9, 2))
    await utimes(newer, new Date(2026, 9, 3), new Date(2026, 9, 3))
    await utimes(other, new Date(2026, 9, 4), new Date(2026, 9, 4))
    expect(await findLatestScreenshot(dir)).toBe(newer)
  })
})

describe('isInsideDir', () => {
  const base = join('C:', 'Users', 'me', 'Pictures', 'Desktop Assist')

  it('accepts files in the folder or below it', () => {
    expect(isInsideDir(base, join(base, 'shot.png'))).toBe(true)
    expect(isInsideDir(base, join(base, 'sub', 'shot.png'))).toBe(true)
    expect(isInsideDir(base, join(base, '..notes.png'))).toBe(true)
  })

  it('rejects the folder itself, siblings and path traversal', () => {
    expect(isInsideDir(base, base)).toBe(false)
    expect(isInsideDir(base, join(base, '..', 'other.png'))).toBe(false)
    expect(isInsideDir(base, `${base} Copy\\shot.png`)).toBe(false)
    expect(isInsideDir(base, 'D:\\elsewhere\\shot.png')).toBe(false)
  })

  it.runIf(process.platform === 'win32')('ignores case on Windows', () => {
    expect(isInsideDir(base, join(base.toUpperCase(), 'shot.png'))).toBe(true)
  })
})
