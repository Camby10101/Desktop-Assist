import { promises as fs } from 'node:fs'
import { isErrno, writeFileAtomic } from '../storage/jsonFile'

/** Encrypts the key at rest. In the app this is Electron's safeStorage (Windows DPAPI). */
export interface Encryptor {
  isAvailable(): boolean
  encrypt(text: string): Buffer
  decrypt(data: Buffer): string
}

/**
 * Keeps the Claude API key in a file, encrypted so only the signed-in Windows user can read it.
 * The key never goes to the renderer; the UI only ever sees whether it works.
 */
export class ApiKeyStore {
  constructor(
    private readonly filePath: string,
    private readonly encryptor: Encryptor,
  ) {}

  /** The saved key, or null if there is none or it can't be decrypted (e.g. another user's file). */
  async load(): Promise<string | null> {
    let data: Buffer
    try {
      data = await fs.readFile(this.filePath)
    } catch (err) {
      if (isErrno(err, 'ENOENT')) return null
      throw err
    }
    try {
      return this.encryptor.decrypt(data) || null
    } catch {
      return null
    }
  }

  async save(key: string): Promise<void> {
    if (!this.encryptor.isAvailable()) {
      throw new Error("Windows can't encrypt the key on this PC, so it wasn't saved.")
    }
    await writeFileAtomic(this.filePath, this.encryptor.encrypt(key))
  }

  async clear(): Promise<void> {
    await fs.rm(this.filePath, { force: true })
  }
}
