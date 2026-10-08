import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SecretStore, type Encryptor } from '../src/main/storage/SecretStore'

// Stands in for Windows DPAPI: reversible, but the file never holds the plain secret.
const fakeEncryptor = (available = true): Encryptor => ({
  isAvailable: () => available,
  encrypt: (text) => Buffer.from(`enc:${Buffer.from(text).toString('base64')}`),
  decrypt: (data) => {
    const text = data.toString()
    if (!text.startsWith('enc:')) throw new Error('not ours')
    return Buffer.from(text.slice(4), 'base64').toString()
  },
})

let dir: string
let file: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'desktop-assist-secret-'))
  file = join(dir, 'session.bin')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('SecretStore', () => {
  it('returns null when nothing is saved', async () => {
    expect(await new SecretStore(file, fakeEncryptor()).load()).toBeNull()
  })

  it('saves encrypted and loads the secret back', async () => {
    const store = new SecretStore(file, fakeEncryptor())
    await store.save('refresh-token-123')
    expect((await readFile(file)).toString()).not.toContain('refresh-token-123')
    expect(await store.load()).toBe('refresh-token-123')
  })

  it('treats a file it cannot decrypt as nothing saved', async () => {
    await writeFile(file, 'garbage')
    expect(await new SecretStore(file, fakeEncryptor()).load()).toBeNull()
  })

  it('refuses to save when encryption is unavailable', async () => {
    await expect(new SecretStore(file, fakeEncryptor(false)).save('x')).rejects.toThrow()
  })

  it('clear removes the secret', async () => {
    const store = new SecretStore(file, fakeEncryptor())
    await store.save('refresh-token-123')
    await store.clear()
    expect(await store.load()).toBeNull()
  })
})
