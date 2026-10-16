import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { UpdateState } from '@shared/types'
import {
  INSTALLER_ARGS,
  isNewer,
  parseVersion,
  releaseOf,
  saveDownload,
  Updater,
} from '../src/main/updates'

const REPO = 'Camby10101/Desktop-Assist'
const DOWNLOADS = `https://github.com/${REPO}/releases/download/`
const INSTALLER = Buffer.from('MZ pretend installer '.repeat(500))
const SHA = createHash('sha256').update(INSTALLER).digest('hex')

/** GitHub's answer for a release with the installer attached. */
const release = (tag: string, asset: Record<string, unknown> = {}) => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  assets: [
    { name: 'latest.yml', browser_download_url: `${DOWNLOADS}${tag}/latest.yml`, size: 10 },
    {
      name: `Desktop.Assist-Setup-${tag.slice(1)}.exe`,
      browser_download_url: `${DOWNLOADS}${tag}/Desktop.Assist-Setup-${tag.slice(1)}.exe`,
      size: INSTALLER.length,
      digest: `sha256:${SHA}`,
      ...asset,
    },
  ],
})

describe('versions', () => {
  it('reads versions, with or without a v', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3])
    expect(parseVersion('1.0.0-beta.1')).toEqual([1, 0, 0])
    expect(parseVersion('latest')).toBeNull()
  })

  it('compares them part by part', () => {
    expect(isNewer('1.0.1', '1.0.0')).toBe(true)
    expect(isNewer('v1.10.0', '1.9.9')).toBe(true)
    expect(isNewer('2.0.0', '10.0.0')).toBe(false)
    expect(isNewer('1.0.0', '1.0.0')).toBe(false)
    expect(isNewer('nonsense', '1.0.0')).toBe(false)
  })
})

describe('releaseOf', () => {
  it("finds the installer and GitHub's SHA-256 for it", () => {
    expect(releaseOf(release('v1.0.1'), DOWNLOADS)).toEqual({
      version: '1.0.1',
      installer: {
        name: 'Desktop.Assist-Setup-1.0.1.exe',
        url: `${DOWNLOADS}v1.0.1/Desktop.Assist-Setup-1.0.1.exe`,
        size: INSTALLER.length,
        sha256: SHA,
      },
    })
  })

  it('ignores drafts, pre-releases, odd tags, and anything not downloaded from the repository', () => {
    expect(releaseOf({ ...release('v1.0.1'), draft: true }, DOWNLOADS)).toBeNull()
    expect(releaseOf({ ...release('v1.0.1'), prerelease: true }, DOWNLOADS)).toBeNull()
    expect(releaseOf(release('nightly'), DOWNLOADS)).toBeNull()
    const elsewhere = release('v1.0.1', {
      browser_download_url: 'https://evil.example/Desktop.Assist-Setup-1.0.1.exe',
    })
    expect(releaseOf(elsewhere, DOWNLOADS)).toBeNull()
    expect(releaseOf({ ...release('v1.0.1'), assets: [] }, DOWNLOADS)).toBeNull()
  })

  it('takes a release without a digest, to be checked by size alone', () => {
    expect(
      releaseOf(release('v1.0.1', { digest: undefined }), DOWNLOADS)?.installer.sha256,
    ).toBeNull()
  })
})

describe('saveDownload', () => {
  const dirs: string[] = []
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))
  const chunks = async function* () {
    yield Buffer.from('MZ')
    yield Buffer.from(' rest')
  }

  it('saves the installer in an emptied folder, by its own name only', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'da-update-')), 'update')
    dirs.push(dir)
    await saveDownload(dir, 'old-Setup-0.9.0.exe', chunks())
    const path = await saveDownload(dir, '../../Desktop.Assist-Setup-1.0.1.exe', chunks())
    expect(path).toBe(join(dir, 'Desktop.Assist-Setup-1.0.1.exe'))
    expect(readFileSync(path, 'utf8')).toBe('MZ rest')
    expect(readdirSync(dir)).toEqual(['Desktop.Assist-Setup-1.0.1.exe'])
  })

  it('deletes what it saved if the download fails part way', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'da-update-'))
    dirs.push(dir)
    const failing = async function* () {
      yield Buffer.from('MZ')
      throw new Error('not the release file')
    }
    await expect(saveDownload(dir, 'Desktop.Assist-Setup-1.0.1.exe', failing())).rejects.toThrow(
      'not the release file',
    )
    expect(readdirSync(dir)).toEqual([])
  })

  it('only saves an .exe', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'da-update-'))
    dirs.push(dir)
    writeFileSync(join(dir, 'keep.txt'), 'x')
    await expect(saveDownload(dir, 'notes.txt', chunks())).rejects.toThrow("isn't an installer")
    expect(existsSync(join(dir, 'keep.txt'))).toBe(true) // nothing touched
  })
})

/** An updater against a pretend GitHub. */
function updater(
  options: {
    latest?: () => Response | Promise<Response>
    file?: Buffer
    dev?: boolean
    current?: string
  } = {},
) {
  const world = {
    requests: [] as string[],
    states: [] as UpdateState[],
    installed: [] as string[],
    notified: [] as string[],
    quit: 0,
    saved: null as Buffer | null,
  }
  const file = options.file ?? INSTALLER
  const instance = new Updater({
    currentVersion: options.current ?? '1.0.0',
    latestUrl: `https://api.github.com/repos/${REPO}/releases/latest`,
    downloads: DOWNLOADS,
    fetch: async (url) => {
      world.requests.push(url)
      if (url.endsWith('/releases/latest')) {
        return options.latest ? options.latest() : Response.json(release('v1.0.1'))
      }
      // The installer, in a few chunks.
      const body = new ReadableStream({
        start(controller) {
          for (let i = 0; i < file.length; i += 4000) controller.enqueue(file.subarray(i, i + 4000))
          controller.close()
        },
      })
      return new Response(body, { headers: { 'content-length': String(file.length) } })
    },
    save: async (name, chunks) => {
      const parts: Uint8Array[] = []
      for await (const chunk of chunks) parts.push(chunk)
      world.saved = Buffer.concat(parts)
      return `C:\\Temp\\Desktop Assist update\\${name}`
    },
    install: options.dev ? null : (path) => void world.installed.push(path),
    notify: ({ title }) => void world.notified.push(title),
    quit: () => void world.quit++,
    onState: (state) => void world.states.push(state),
  })
  return { updater: instance, world }
}

describe('Updater', () => {
  it('says up to date when the latest release is this version, or there are none', async () => {
    const same = updater({ latest: () => Response.json(release('v1.0.0')) })
    expect(await same.updater.checkAndInstall()).toEqual({ status: 'up-to-date', version: '1.0.0' })
    const none = updater({ latest: () => new Response('', { status: 404 }) })
    expect(await none.updater.checkAndInstall()).toEqual({ status: 'up-to-date', version: '1.0.0' })
    expect(none.world.requests).toEqual([`https://api.github.com/repos/${REPO}/releases/latest`])
  })

  it('downloads a newer release, checks it, runs the installer and quits', async () => {
    const { updater: u, world } = updater()
    expect(await u.checkAndInstall()).toEqual({ status: 'installing', version: '1.0.1' })
    expect(world.saved?.equals(INSTALLER)).toBe(true)
    expect(world.installed).toEqual([
      'C:\\Temp\\Desktop Assist update\\Desktop.Assist-Setup-1.0.1.exe',
    ])
    expect(world.notified).toEqual(['Updating to 1.0.1'])
    expect(world.quit).toBe(1)
    const percents = world.states.flatMap((s) => (s.status === 'downloading' ? [s.percent] : []))
    expect(percents[0]).toBe(0)
    expect(percents.at(-1)).toBeGreaterThan(90)
    expect(percents).toEqual([...percents].sort((a, b) => a - b))
    expect(world.states[0]).toEqual({ status: 'checking' })
  })

  it('runs the installer silently, as an update, starting the app again after', () => {
    expect(INSTALLER_ARGS).toEqual(['--updated', '/S', '--force-run'])
  })

  it('stops at downloading in a development run', async () => {
    const { updater: u, world } = updater({ dev: true })
    expect(await u.checkAndInstall()).toEqual({
      status: 'downloaded',
      version: '1.0.1',
      path: 'C:\\Temp\\Desktop Assist update\\Desktop.Assist-Setup-1.0.1.exe',
    })
    expect(world.quit).toBe(0)
  })

  it("never runs a download that isn't the release's file", async () => {
    const tampered = Buffer.from(INSTALLER)
    tampered[100] = 0
    const changed = updater({ file: tampered })
    expect(await changed.updater.checkAndInstall()).toEqual({
      status: 'error',
      message:
        "Couldn't download 1.0.1. The download isn't the release's file (its SHA-256 isn't the release's); try again.",
    })
    expect(changed.world.installed).toEqual([])
    const short = updater({ file: INSTALLER.subarray(0, 1000) })
    const result = await short.updater.checkAndInstall()
    expect(result.status === 'error' && result.message).toContain(
      `1000 bytes, not ${INSTALLER.length}`,
    )
    expect(short.world.quit).toBe(0)
  })

  it('says why it could not check', async () => {
    const busy = updater({ latest: () => new Response('rate limited', { status: 403 }) })
    expect(await busy.updater.checkAndInstall()).toEqual({
      status: 'error',
      message: "Couldn't check for updates. GitHub is busy; try again in a few minutes.",
    })
    const offline = updater({
      latest: () => Promise.reject(new TypeError('fetch failed')),
    })
    expect(await offline.updater.checkAndInstall()).toEqual({
      status: 'error',
      message:
        "Couldn't check for updates. Couldn't reach GitHub. Check you're online and try again.",
    })
  })

  it('does one check at a time', async () => {
    let answer: (response: Response) => void = () => {}
    const slow = updater({ latest: () => new Promise<Response>((resolve) => (answer = resolve)) })
    const first = slow.updater.checkAndInstall()
    expect(await slow.updater.checkAndInstall()).toEqual({ status: 'checking' })
    answer(Response.json(release('v1.0.0')))
    await first
    expect(slow.world.requests).toHaveLength(1)
  })
})
