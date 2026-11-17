import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  adoptFormerData,
  adoptFormerLoginItem,
  FORMER_NAME,
  PRODUCT_NAME,
  type Folders,
  type LoginItems,
} from '../src/main/formerName'

const APP_DATA = join('C:', 'Users', 'me', 'AppData', 'Roaming')
const NOW = join(APP_DATA, PRODUCT_NAME)
const BEFORE = join(APP_DATA, FORMER_NAME)

/** Folders that exist (by path), renamed in place; `stuck` makes renaming fail. */
function folders(existing: string[], stuck = false): Folders & { renamed: string[][] } {
  const there = new Set(existing)
  const renamed: string[][] = []
  return {
    renamed,
    exists: (path) => there.has(path),
    rename: (from, to) => {
      if (stuck) throw new Error('EBUSY')
      there.delete(from)
      there.add(to)
      renamed.push([from, to])
    },
  }
}

describe('adoptFormerData', () => {
  it('moves the data folder from its old name to its new one, the first time', () => {
    const disk = folders([BEFORE])
    expect(adoptFormerData(APP_DATA, PRODUCT_NAME, FORMER_NAME, disk)).toBe(NOW)
    expect(disk.renamed).toEqual([[BEFORE, NOW]])
  })

  it('leaves both alone once the new one is there', () => {
    const disk = folders([BEFORE, NOW])
    expect(adoptFormerData(APP_DATA, PRODUCT_NAME, FORMER_NAME, disk)).toBe(NOW)
    expect(disk.renamed).toEqual([])
  })

  it('uses the new name on a PC that never had the old one', () => {
    const disk = folders([])
    expect(adoptFormerData(APP_DATA, PRODUCT_NAME, FORMER_NAME, disk)).toBe(NOW)
    expect(disk.renamed).toEqual([])
  })

  it('keeps using the old folder if it can’t be moved', () => {
    expect(adoptFormerData(APP_DATA, PRODUCT_NAME, FORMER_NAME, folders([BEFORE], true))).toBe(
      BEFORE,
    )
  })
})

describe('adoptFormerLoginItem', () => {
  const FOLDER = join('C:', 'Users', 'me', 'AppData', 'Local', 'Programs', 'desktop-assist')
  const EXE = join(FOLDER, `${PRODUCT_NAME}.exe`)

  /** Windows starting `starting` (an .exe's path) at sign-in, or nothing. */
  function items(starting: string | null): LoginItems & { started: number } {
    const list = {
      started: 0,
      startsAtLogin: (path = EXE) => path === starting,
      startAtLogin: () => {
        starting = EXE
        list.started++
      },
    }
    return list
  }

  it('has Windows start the new .exe instead of the old one', () => {
    const windows = items(join(FOLDER, `${FORMER_NAME}.exe`))
    expect(adoptFormerLoginItem(EXE, windows)).toBe(true)
    expect(windows.started).toBe(1)
    expect(windows.startsAtLogin()).toBe(true)
  })

  it('changes nothing when Windows starts the new one already, or neither', () => {
    for (const starting of [EXE, null]) {
      const windows = items(starting)
      expect(adoptFormerLoginItem(EXE, windows)).toBe(false)
      expect(windows.started).toBe(0)
    }
  })
})
