import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ApiKeyStore, type Encryptor } from '../src/main/claude/ApiKeyStore'

// Stands in for Windows DPAPI: reversible, but the file never holds the plain key.
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
  dir = await mkdtemp(join(tmpdir(), 'desktop-assist-key-'))
  file = join(dir, 'claude-api-key.bin')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('ApiKeyStore', () => {
  it('returns null when nothing is saved', async () => {
    expect(await new ApiKeyStore(file, fakeEncryptor()).load()).toBeNull()
  })

  it('saves encrypted and loads the key back', async () => {
    const store = new ApiKeyStore(file, fakeEncryptor())
    await store.save('sk-ant-secret')
    expect((await readFile(file)).toString()).not.toContain('sk-ant-secret')
    expect(await store.load()).toBe('sk-ant-secret')
  })

  it('treats a file it cannot decrypt as no key', async () => {
    await writeFile(file, 'garbage')
    expect(await new ApiKeyStore(file, fakeEncryptor()).load()).toBeNull()
  })

  it('refuses to save when encryption is unavailable', async () => {
    await expect(new ApiKeyStore(file, fakeEncryptor(false)).save('sk-ant-x')).rejects.toThrow()
  })

  it('clear removes the key', async () => {
    const store = new ApiKeyStore(file, fakeEncryptor())
    await store.save('sk-ant-secret')
    await store.clear()
    expect(await store.load()).toBeNull()
  })
})
