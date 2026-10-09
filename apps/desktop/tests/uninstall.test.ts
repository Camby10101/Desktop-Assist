import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { uninstall, uninstallerPath, type UninstallDeps } from '../src/main/uninstall'

const FOLDER = join('C:', 'Users', 'me', 'AppData', 'Local', 'Programs', 'desktop-assist')
const EXE = join(FOLDER, 'Desktop Assist.exe')
const UNINSTALLER = join(FOLDER, 'Uninstall Desktop Assist.exe')

function deps(overrides: Partial<UninstallDeps> = {}) {
  const events: string[] = []
  const all: UninstallDeps = {
    isPackaged: true,
    exePath: EXE,
    productName: 'Desktop Assist',
    exists: (path) => path === UNINSTALLER,
    stopStartingWithWindows: () => void events.push('no autostart'),
    runDetached: (path) => void events.push(`run ${path}`),
    quit: () => void events.push('quit'),
    onError: () => void events.push('error'),
    ...overrides,
  }
  return { all, events }
}

describe('uninstall', () => {
  it("finds the installer's uninstaller next to the app", () => {
    expect(uninstallerPath(EXE, 'Desktop Assist')).toBe(UNINSTALLER)
  })

  it('turns off Start with Windows, starts the uninstaller, then quits', () => {
    const { all, events } = deps()
    expect(uninstall(all)).toEqual({ ok: true })
    expect(events).toEqual(['no autostart', `run ${UNINSTALLER}`, 'quit'])
  })

  it('does nothing in a dev run, or when the uninstaller is missing', () => {
    const dev = deps({ isPackaged: false })
    expect(uninstall(dev.all)).toEqual({ ok: false, reason: 'not-installed' })
    const missing = deps({ exists: () => false })
    expect(uninstall(missing.all)).toEqual({ ok: false, reason: 'missing' })
    expect([...dev.events, ...missing.events]).toEqual([])
  })

  it("keeps running when the uninstaller couldn't start", () => {
    const { all, events } = deps({
      runDetached: () => {
        throw new Error('blocked')
      },
    })
    expect(uninstall(all)).toEqual({ ok: false, reason: 'failed' })
    expect(events).toEqual(['no autostart', 'error'])
  })
})
