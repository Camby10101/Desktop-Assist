import Anthropic from '@anthropic-ai/sdk'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ApiKeyStatus } from '@shared/types'
import { ApiKeyManager, type KeyStorage } from '../src/main/claude/ApiKeyManager'

class MemoryStorage implements KeyStorage {
  value: string | null = null
  async load() {
    return this.value
  }
  async save(key: string) {
    this.value = key
  }
  async clear() {
    this.value = null
  }
}

const GOOD = 'sk-ant-good'
const unauthorized = () => Anthropic.APIError.generate(401, undefined, 'bad key', new Headers())
const offline = () => new Anthropic.APIConnectionError({ message: 'offline' })

let storage: MemoryStorage
let statuses: ApiKeyStatus[]
let verify: (key: string) => Promise<void>
let manager: ApiKeyManager

beforeEach(() => {
  storage = new MemoryStorage()
  statuses = []
  verify = async (key) => {
    if (key !== GOOD) throw unauthorized()
  }
  manager = new ApiKeyManager({
    storage,
    verify: (key) => verify(key),
    onStatus: (status) => statuses.push(status),
  })
})

describe('checking the saved key at startup', () => {
  it('asks for a key when none is saved', async () => {
    await manager.checkSaved()
    expect(statuses).toEqual([{ state: 'checking' }, { state: 'missing' }])
    expect(manager.key).toBeNull()
  })

  it('accepts a saved key that works', async () => {
    storage.value = GOOD
    await manager.checkSaved()
    expect(manager.status).toEqual({ state: 'valid' })
    expect(manager.key).toBe(GOOD)
  })

  it('asks for a new key when the saved one is rejected', async () => {
    storage.value = 'sk-ant-revoked'
    await manager.checkSaved()
    expect(manager.status).toMatchObject({ state: 'invalid' })
    expect(manager.key).toBeNull()
  })

  it("keeps the key usable when Anthropic can't be reached", async () => {
    storage.value = GOOD
    verify = async () => {
      throw offline()
    }
    await manager.checkSaved()
    expect(manager.status).toMatchObject({ state: 'unreachable' })
    expect(manager.key).toBe(GOOD)
    manager.confirmed() // a chat reply later worked
    expect(manager.status).toEqual({ state: 'valid' })
  })
})

describe('entering a new key', () => {
  it('saves a key only after Anthropic accepts it', async () => {
    expect(await manager.submit(`  ${GOOD}  `)).toEqual({ ok: true })
    expect(storage.value).toBe(GOOD)
    expect(manager.status).toEqual({ state: 'valid' })
  })

  it('rejects a bad key without saving it', async () => {
    const result = await manager.submit('sk-ant-typo')
    expect(result).toMatchObject({ ok: false })
    expect(storage.value).toBeNull()
  })

  it("doesn't save a key it couldn't check", async () => {
    verify = async () => {
      throw offline()
    }
    const result = await manager.submit(GOOD)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.message).toContain("wasn't saved")
    expect(storage.value).toBeNull()
  })

  it('rejects blank or obviously wrong input before calling Anthropic', async () => {
    let calls = 0
    verify = async () => {
      calls++
    }
    expect((await manager.submit('   ')).ok).toBe(false)
    expect((await manager.submit('two words')).ok).toBe(false)
    expect(calls).toBe(0)
  })

  it('a slow startup check cannot undo a key entered meanwhile', async () => {
    storage.value = 'sk-ant-old'
    let rejectOld!: (error: unknown) => void
    verify = (key) =>
      key === 'sk-ant-old' ? new Promise((_, reject) => (rejectOld = reject)) : Promise.resolve()
    const check = manager.checkSaved()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await manager.submit(GOOD)
    rejectOld(unauthorized())
    await check
    expect(manager.status).toEqual({ state: 'valid' })
    expect(manager.key).toBe(GOOD)
  })
})

describe('while chatting', () => {
  it('a key rejected mid-session sends the user back to the key form', async () => {
    await manager.submit(GOOD)
    manager.rejected('auth')
    expect(manager.status).toMatchObject({ state: 'invalid' })
    expect(manager.key).toBeNull()
  })

  it('ignores errors that are not about the key', async () => {
    await manager.submit(GOOD)
    manager.rejected('network')
    expect(manager.status).toEqual({ state: 'valid' })
  })

  it('forget deletes the saved key', async () => {
    await manager.submit(GOOD)
    await manager.forget()
    expect(storage.value).toBeNull()
    expect(manager.status).toEqual({ state: 'missing' })
  })
})
