import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { UpdateState } from '@shared/types'

/**
 * What the installer is told when it runs as an update, as electron-builder's own updater does:
 * `--updated` (it's an update: wait for the running app to close, keep the user's data), `/S`
 * (silently, no window) and `--force-run` (start the app again when it's done).
 */
export const INSTALLER_ARGS = ['--updated', '/S', '--force-run']

/** A version as numbers: "v1.2.3" is [1, 2, 3]. Null if it isn't one. */
export function parseVersion(value: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value.trim())
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

/** Whether `candidate` is a later version than `current`. */
export function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate)
  const b = parseVersion(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i]! > b[i]!
  }
  return false
}

/** A release with an installer attached. */
export interface Release {
  version: string
  installer: {
    name: string
    url: string
    size: number
    /** The installer's SHA-256 as GitHub worked it out (hex), if it says. */
    sha256: string | null
  }
}

type Item = Record<string, unknown>
const isObject = (value: unknown): value is Item =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The release in GitHub's answer for a repository's latest release, if it's a version with an
 * installer: an `.exe` with "Setup" in its name, downloaded from `downloads` (the repository's own
 * releases, https://github.com/<owner>/<name>/releases/download/).
 */
export function releaseOf(payload: unknown, downloads: string): Release | null {
  if (!isObject(payload) || payload['draft'] === true || payload['prerelease'] === true) return null
  const version = parseVersion(typeof payload['tag_name'] === 'string' ? payload['tag_name'] : '')
  if (!version) return null
  const assets = Array.isArray(payload['assets']) ? payload['assets'].filter(isObject) : []
  const asset = assets.find(
    (a) =>
      typeof a['name'] === 'string' &&
      /setup.*\.exe$/i.test(a['name']) &&
      typeof a['browser_download_url'] === 'string' &&
      a['browser_download_url'].startsWith(downloads),
  )
  if (!asset) return null
  const digest = typeof asset['digest'] === 'string' ? asset['digest'] : ''
  const sha256 = /^sha256:([0-9a-f]{64})$/i.exec(digest)?.[1]?.toLowerCase() ?? null
  return {
    version: version.join('.'),
    installer: {
      name: String(asset['name']),
      url: String(asset['browser_download_url']),
      size: typeof asset['size'] === 'number' ? asset['size'] : 0,
      sha256,
    },
  }
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export interface UpdaterDeps {
  /** This copy's version (package.json). */
  currentVersion: string
  /** GitHub's API address for the latest release: …/repos/<owner>/<name>/releases/latest. */
  latestUrl: string
  /** Where the repository's release files are downloaded from; nothing else is downloaded. */
  downloads: string
  fetch: Fetch
  /**
   * Saves the installer's chunks as they come in, replacing any earlier download; its path. If
   * the chunks fail (not the release's file), nothing is kept.
   */
  save(name: string, chunks: AsyncIterable<Uint8Array>): Promise<string>
  /**
   * Runs the installer on its own (it carries on once this app has quit) with INSTALLER_ARGS.
   * False in a development run, which has no installed copy to replace: it stops at downloading.
   */
  install: ((path: string) => void) | null
  /** Tells the user the app is about to close for the update. */
  notify(message: { title: string; body: string }): void
  quit(): void
  onState(state: UpdateState): void
  onError?(message: string, error?: unknown): void
}

/**
 * Settings → Check for updates: asks GitHub for the latest release and, if it's newer than this
 * copy, downloads its installer, checks it's exactly the file GitHub has, and runs it. The
 * installer replaces this copy silently and starts the new one; this app quits to let it.
 */
export class Updater {
  private state: UpdateState = { status: 'idle' }

  constructor(private readonly deps: UpdaterDeps) {}

  get current(): UpdateState {
    return this.state
  }

  /** The whole job, one click: check, and if there's an update, download and install it. */
  async checkAndInstall(): Promise<UpdateState> {
    if (['checking', 'downloading', 'installing'].includes(this.state.status)) return this.state
    this.setState({ status: 'checking' })
    let release: Release | null
    try {
      release = await this.latest()
    } catch (error) {
      return this.fail("Couldn't check for updates", error)
    }
    if (!release || !isNewer(release.version, this.deps.currentVersion)) {
      return this.setState({ status: 'up-to-date', version: this.deps.currentVersion })
    }
    const { version } = release
    let path: string
    try {
      path = await this.download(release)
    } catch (error) {
      return this.fail(`Couldn't download ${version}`, error)
    }
    if (!this.deps.install) return this.setState({ status: 'downloaded', version, path })
    this.setState({ status: 'installing', version })
    try {
      this.deps.install(path)
    } catch (error) {
      return this.fail(`Couldn't start the ${version} installer`, error)
    }
    this.deps.notify({
      title: `Updating to ${version}`,
      body: 'Desktop Assist will close and start again in a moment.',
    })
    this.deps.quit()
    return this.state
  }

  private async latest(): Promise<Release | null> {
    const response = await this.deps.fetch(this.deps.latestUrl, {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(15_000),
    })
    // No releases yet.
    if (response.status === 404) return null
    if (response.status === 403 || response.status === 429) throw new Busy()
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`)
    return releaseOf(await response.json(), this.deps.downloads)
  }

  /** Downloads the installer, checking its size and SHA-256 against the release's. */
  private async download(release: Release): Promise<string> {
    const { installer, version } = release
    const response = await this.deps.fetch(installer.url)
    if (!response.ok || !response.body) throw new Error(`The download answered ${response.status}`)
    const total = installer.size || Number(response.headers.get('content-length')) || 0
    const hash = createHash('sha256')
    let received = 0
    let shown = -1
    const progress = (percent: number) => {
      if (percent === shown) return
      shown = percent
      this.setState({ status: 'downloading', version, percent })
    }
    progress(0)
    const reader = response.body.getReader()
    // The file's chunks as they arrive, hashed and counted on their way to the disk. At the end it
    // must be the release's file, or saving fails (and the file is deleted).
    async function* chunks(): AsyncGenerator<Uint8Array> {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        hash.update(value)
        received += value.length
        progress(total ? Math.min(99, Math.floor((received / total) * 100)) : 0)
        yield value
      }
      if (installer.size && received !== installer.size) {
        throw new Mismatch(`it's ${received} bytes, not ${installer.size}`)
      }
      if (installer.sha256 && hash.digest('hex') !== installer.sha256) {
        throw new Mismatch("its SHA-256 isn't the release's")
      }
    }
    return this.deps.save(installer.name, chunks())
  }

  private fail(doing: string, error: unknown): UpdateState {
    this.deps.onError?.(`${doing}:`, error)
    const reason =
      error instanceof Busy
        ? 'GitHub is busy; try again in a few minutes.'
        : error instanceof Mismatch
          ? `The download isn't the release's file (${error.message}); try again.`
          : /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ERR_|network|abort|timeout/i.test(
                String(error),
              )
            ? "Couldn't reach GitHub. Check you're online and try again."
            : 'Try again later.'
    return this.setState({ status: 'error', message: `${doing}. ${reason}` })
  }

  private setState(state: UpdateState): UpdateState {
    this.state = state
    this.deps.onState(state)
    return state
  }
}

/**
 * Saves a downloaded installer in `dir` (emptied first, so old downloads don't pile up) and
 * returns its path. Only an `.exe`, and only the file's own name is used. If the download fails
 * part way (or turns out not to be the release's file), the partial file is deleted.
 */
export async function saveDownload(
  dir: string,
  name: string,
  chunks: AsyncIterable<Uint8Array>,
): Promise<string> {
  const file = basename(name)
  if (!/\.exe$/i.test(file)) throw new Error(`${file} isn't an installer`)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  const path = join(dir, file)
  try {
    await pipeline(Readable.from(chunks), createWriteStream(path))
  } catch (error) {
    await rm(path, { force: true })
    throw error
  }
  return path
}

/** GitHub turned the request away (its limit for apps that don't sign in). */
class Busy extends Error {}

/** The download isn't the file the release has. */
class Mismatch extends Error {}
