import type { ApiKeyStatus, ApiKeySubmitResult } from '@shared/types'
import { classifyError, errorMessage, isKeyProblem, type ErrorKind } from './errors'

export interface KeyStorage {
  load(): Promise<string | null>
  save(key: string): Promise<void>
  clear(): Promise<void>
}

export interface ApiKeyManagerDeps {
  storage: KeyStorage
  /** Resolves if the key works; throws the SDK's error otherwise. */
  verify(key: string): Promise<void>
  onStatus(status: ApiKeyStatus): void
}

/**
 * Owns the Claude API key and whether it works.
 *
 * At startup `checkSaved()` tests the saved key. A missing or rejected key makes the chat box ask
 * for a new one; `submit()` tests a new key with Anthropic and saves it only if it works. If
 * Anthropic can't be reached, the saved key is kept (it may be fine) and chat stays available.
 */
export class ApiKeyManager {
  private current: string | null = null
  private state: ApiKeyStatus = { state: 'checking' }
  /** Bumped by every check or change, so a slow, older check can't overwrite a newer result. */
  private generation = 0

  constructor(private readonly deps: ApiKeyManagerDeps) {}

  get status(): ApiKeyStatus {
    return this.state
  }

  /** The key to use for requests: one that works, or one we couldn't check yet. */
  get key(): string | null {
    return this.state.state === 'valid' || this.state.state === 'unreachable' ? this.current : null
  }

  async checkSaved(): Promise<void> {
    const generation = ++this.generation
    this.setStatus({ state: 'checking' })
    let key: string | null
    try {
      key = await this.deps.storage.load()
    } catch {
      key = null
    }
    if (generation !== this.generation) return
    this.current = key
    if (!key) return this.setStatus({ state: 'missing' })

    try {
      await this.deps.verify(key)
      if (generation === this.generation) this.setStatus({ state: 'valid' })
    } catch (error) {
      if (generation !== this.generation) return
      const kind = classifyError(error)
      this.setStatus(
        isKeyProblem(kind)
          ? { state: 'invalid', message: savedKeyMessage(kind) }
          : { state: 'unreachable', message: errorMessage(kind) },
      )
    }
  }

  async submit(raw: string): Promise<ApiKeySubmitResult> {
    const key = raw.trim()
    if (!key) return { ok: false, message: 'Paste your API key first.' }
    if (/\s/.test(key)) return { ok: false, message: "That doesn't look like an API key." }

    try {
      await this.deps.verify(key)
    } catch (error) {
      const kind = classifyError(error)
      return {
        ok: false,
        message: isKeyProblem(kind)
          ? newKeyMessage(kind)
          : `${errorMessage(kind)} The key wasn't saved.`,
      }
    }
    try {
      await this.deps.storage.save(key)
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
    this.generation++
    this.current = key
    this.setStatus({ state: 'valid' })
    return { ok: true }
  }

  /** A chat request was refused because of the key (revoked, out of credit…). */
  rejected(kind: ErrorKind): void {
    if (!isKeyProblem(kind) || this.state.state === 'invalid') return
    this.generation++
    this.setStatus({ state: 'invalid', message: savedKeyMessage(kind) })
  }

  /** A chat request worked, so a key we couldn't check earlier is fine after all. */
  confirmed(): void {
    if (this.state.state === 'unreachable') this.setStatus({ state: 'valid' })
  }

  async forget(): Promise<void> {
    this.generation++
    await this.deps.storage.clear()
    this.current = null
    this.setStatus({ state: 'missing' })
  }

  private setStatus(status: ApiKeyStatus): void {
    this.state = status
    this.deps.onStatus(status)
  }
}

function savedKeyMessage(kind: ErrorKind): string {
  return kind === 'auth'
    ? 'Your saved API key no longer works. Enter a new one to keep chatting.'
    : `${errorMessage(kind)} Enter a different key to keep chatting.`
}

function newKeyMessage(kind: ErrorKind): string {
  return kind === 'auth'
    ? "Anthropic didn't accept that key. Check you copied all of it."
    : errorMessage(kind)
}
