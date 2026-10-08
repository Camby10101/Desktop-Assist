import { promises as fs } from 'node:fs'
import { isErrno, writeFileAtomic } from './jsonFile'

/** Encrypts secrets at rest. In the app this is Electron's safeStorage (Windows DPAPI). */
export interface Encryptor {
  isAvailable(): boolean
  encrypt(text: string): Buffer
  decrypt(data: Buffer): string
}

/**
 * Keeps one secret in a file, encrypted so only the signed-in Windows user can read it. Used for
 * the JumpCloud sign-in (its refresh token), which never leaves the main process.
 */
export class SecretStore {
  constructor(
    private readonly filePath: string,
    private readonly encryptor: Encryptor,
  ) {}

  /** The saved secret, or null if there is none or it can't be decrypted (e.g. another user's). */
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

  async save(secret: string): Promise<void> {
    if (!this.encryptor.isAvailable()) {
      throw new Error("Windows can't encrypt data on this PC, so the sign-in wasn't saved.")
    }
    await writeFileAtomic(this.filePath, this.encryptor.encrypt(secret))
  }

  async clear(): Promise<void> {
    await fs.rm(this.filePath, { force: true })
  }
}
