import { beforeEach, describe, expect, it } from 'vitest'
import type { AuthStatus } from '@shared/types'
import {
  AuthManager,
  SignInRequiredError,
  SignInUnavailableError,
  type AuthManagerDeps,
} from '../src/main/auth/AuthManager'
import { SignInCancelledError, type RedirectListener } from '../src/main/auth/loopback'
import { SessionExpiredError, type Oidc, type OidcTokens } from '../src/main/auth/oidc'

const nowSeconds = () => Math.floor(Date.now() / 1000)

/**
 * Plays JumpCloud. Like the real one, every refresh replaces the refresh token, and an old one is
 * refused, so using a refresh token twice signs the user out.
 */
class FakeOidc implements Oidc {
  issued = 0
  validRefreshToken: string | null = null
  refreshCalls: string[] = []
  revoked: string[] = []
  running = 0
  maxRunning = 0
  /** The next refresh fails with this. */
  failNext: Error | null = null
  giveRefreshToken = true
  idTokenLife = 3600

  async begin(redirectUri: string) {
    return {
      url: `https://idp.test/auth?redirect_uri=${encodeURIComponent(redirectUri)}`,
      finish: async (callbackUrl: string) => {
        expect(new URL(callbackUrl).searchParams.get('code')).toBe('the-code')
        return this.issue()
      },
    }
  }

  async refresh(refreshToken: string): Promise<OidcTokens> {
    this.refreshCalls.push(refreshToken)
    this.running++
    this.maxRunning = Math.max(this.maxRunning, this.running)
    await new Promise((resolve) => setTimeout(resolve, 5))
    this.running--
    const failure = this.failNext
    this.failNext = null
    if (failure) throw failure
    if (refreshToken !== this.validRefreshToken) throw new SessionExpiredError()
    return this.issue()
  }

  async revoke(refreshToken: string): Promise<void> {
    this.revoked.push(refreshToken)
  }

  private issue(): OidcTokens {
    const n = ++this.issued
    const refreshToken = this.giveRefreshToken ? `rt-${n}` : undefined
    this.validRefreshToken = refreshToken ?? null
    return {
      idToken: `id-${n}`,
      refreshToken,
      claims: {
        sub: 'user-1',
        email: 'ada@example.com',
        name: 'Ada Lovelace',
        exp: nowSeconds() + this.idTokenLife,
      },
    }
  }
}

class MemoryStore {
  value: string | null = null
  async load() {
    return this.value
  }
  async save(secret: string) {
    this.value = secret
  }
  async clear() {
    this.value = null
  }
}

/** Stands in for the loopback server: `browserReturns` is the browser coming back. */
function fakeListen() {
  const listeners: Array<{ listener: RedirectListener; browserReturns: (url: string) => void }> = []
  const listen = async (port: number): Promise<RedirectListener> => {
    let settle!: { resolve: (url: string) => void; reject: (error: Error) => void }
    const result = new Promise<string>((resolve, reject) => (settle = { resolve, reject }))
    result.catch(() => {})
    const listener: RedirectListener = {
      redirectUri: `http://127.0.0.1:${port}/callback`,
      result,
      close: () => settle.reject(new SignInCancelledError()),
    }
    listeners.push({ listener, browserReturns: settle.resolve })
    return listener
  }
  return { listen, listeners }
}

let oidc: FakeOidc
let store: MemoryStore
let statuses: AuthStatus[]
let opened: string[]
let signedOut: string[]
let listening: ReturnType<typeof fakeListen>

function makeAuth(overrides: Partial<AuthManagerDeps> = {}) {
  return new AuthManager({
    oidc,
    missing: [],
    store,
    redirectPort: 47621,
    listen: listening.listen,
    openBrowser: async (url) => {
      opened.push(url)
      // The user is already signed in to JumpCloud, so the browser comes straight back.
      listening.listeners.at(-1)?.browserReturns('http://127.0.0.1:47621/callback?code=the-code')
    },
    onStatus: (status) => statuses.push(status),
    onSignedOut: (reason) => signedOut.push(reason),
    ...overrides,
  })
}

/** Saves a session the way a previous run would have. */
async function savedSession() {
  const tokens = await oidc.begin('x').then((pending) => pending.finish('http://x/?code=the-code'))
  store.value = JSON.stringify({ refreshToken: tokens.refreshToken, user: { name: 'Ada' } })
}

beforeEach(() => {
  oidc = new FakeOidc()
  store = new MemoryStore()
  statuses = []
  opened = []
  signedOut = []
  listening = fakeListen()
})

describe('starting up', () => {
  it('says what is missing when sign-in is not set up', async () => {
    const auth = makeAuth({ oidc: null, missing: ['signIn.clientId'] })
    await auth.init()
    expect(auth.status).toEqual({ state: 'unconfigured', missing: ['signIn.clientId'] })
    expect(auth.canChat).toBe(false)
  })

  it('is signed out when nothing is saved', async () => {
    const auth = makeAuth()
    await auth.init()
    expect(auth.status).toEqual({ state: 'signed-out' })
    expect(auth.canChat).toBe(false)
  })

  it('renews a saved sign-in and saves the replacement refresh token', async () => {
    await savedSession()
    const auth = makeAuth()
    await auth.init()
    expect(statuses.map((s) => s.state)).toEqual(['checking', 'signed-in'])
    expect(auth.status).toEqual({
      state: 'signed-in',
      user: { name: 'Ada Lovelace', email: 'ada@example.com' },
    })
    expect(JSON.parse(store.value!).refreshToken).toBe(oidc.validRefreshToken)
    expect(auth.canChat).toBe(true)
  })

  it('keeps the saved sign-in when JumpCloud cannot be reached, and Retry tries again', async () => {
    await savedSession()
    oidc.failNext = new TypeError('fetch failed')
    const auth = makeAuth()
    await auth.init()
    expect(auth.status).toMatchObject({ state: 'offline', user: { name: 'Ada' } })
    expect(store.value).not.toBeNull()
    expect(auth.canChat).toBe(true)

    await auth.retry()
    expect(auth.status.state).toBe('signed-in')
  })

  it('signs out when JumpCloud refuses the saved sign-in', async () => {
    store.value = JSON.stringify({ refreshToken: 'revoked', user: {} })
    const auth = makeAuth()
    await auth.init()
    expect(auth.status).toMatchObject({
      state: 'signed-out',
      message: expect.stringMatching(/expired/),
    })
    expect(store.value).toBeNull()
    expect(signedOut).toEqual(['expired'])
  })

  it('ignores a saved file it cannot read', async () => {
    store.value = 'not json'
    const auth = makeAuth()
    await auth.init()
    expect(auth.status).toEqual({ state: 'signed-out' })
  })
})

describe('signing in', () => {
  it('signs in through the browser and saves the sign-in', async () => {
    const auth = makeAuth()
    await auth.init()
    await auth.signIn()

    expect(opened[0]).toContain(encodeURIComponent('http://127.0.0.1:47621/callback'))
    expect(statuses.map((s) => s.state)).toEqual(['signed-out', 'signing-in', 'signed-in'])
    expect(JSON.parse(store.value!)).toEqual({
      refreshToken: oidc.validRefreshToken,
      user: { name: 'Ada Lovelace', email: 'ada@example.com' },
    })
  })

  it('can be cancelled while waiting for the browser', async () => {
    const auth = makeAuth({ openBrowser: async () => {} }) // the browser never comes back
    await auth.init()
    const signingIn = auth.signIn()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(auth.status.state).toBe('signing-in')
    auth.cancelSignIn()
    await signingIn
    expect(auth.status).toEqual({ state: 'signed-out', message: undefined })
    expect(store.value).toBeNull()
  })

  it("doesn't open the browser if cancelled while JumpCloud's settings are loading", async () => {
    let settingsLoaded!: () => void
    const begin = oidc.begin.bind(oidc)
    oidc.begin = async (redirectUri) => {
      await new Promise<void>((resolve) => (settingsLoaded = resolve))
      return begin(redirectUri)
    }
    const auth = makeAuth()
    await auth.init()
    const signingIn = auth.signIn()
    await new Promise((resolve) => setTimeout(resolve, 0))
    auth.cancelSignIn()
    settingsLoaded()
    await signingIn
    expect(opened).toEqual([])
    expect(auth.status).toEqual({ state: 'signed-out', message: undefined })
  })

  it('explains when JumpCloud does not allow staying signed in', async () => {
    oidc.giveRefreshToken = false
    const auth = makeAuth()
    await auth.init()
    await auth.signIn()
    expect(auth.status).toMatchObject({
      state: 'signed-out',
      message: expect.stringMatching(/Refresh Token grant/),
    })
  })

  it('reports a sign-in that fails', async () => {
    const auth = makeAuth({
      listen: async () => {
        throw new Error('Port 47621 is in use by another program')
      },
    })
    await auth.init()
    await auth.signIn()
    expect(auth.status).toMatchObject({
      state: 'signed-out',
      message: expect.stringMatching(/in use/),
    })
  })
})

describe('ID tokens for Claude', () => {
  it('hands out the unused ID token from signing in, then a new one each time', async () => {
    const auth = makeAuth()
    await auth.init()
    await auth.signIn()
    expect(await auth.freshIdToken()).toBe('id-1')
    expect(oidc.refreshCalls).toEqual([])
    expect(await auth.freshIdToken()).toBe('id-2')
    expect(await auth.freshIdToken()).toBe('id-3')
  })

  it('never uses a refresh token twice, even when asked at the same time', async () => {
    await savedSession()
    const auth = makeAuth()
    await auth.init()
    const tokens = await Promise.all([1, 2, 3, 4].map(() => auth.freshIdToken()))
    expect(new Set(tokens).size).toBe(4)
    expect(oidc.maxRunning).toBe(1)
    expect(new Set(oidc.refreshCalls).size).toBe(oidc.refreshCalls.length)
    expect(auth.status.state).toBe('signed-in')
  })

  it("doesn't hand out an ID token that's about to expire", async () => {
    oidc.idTokenLife = 30
    const auth = makeAuth()
    await auth.init()
    await auth.signIn()
    expect(await auth.freshIdToken()).toBe('id-2')
  })

  it('fails with SignInUnavailableError when JumpCloud cannot be reached', async () => {
    const auth = makeAuth()
    await auth.init()
    await auth.signIn()
    await auth.freshIdToken()
    oidc.failNext = new TypeError('fetch failed')
    await expect(auth.freshIdToken()).rejects.toBeInstanceOf(SignInUnavailableError)
    expect(auth.status.state).toBe('signed-in') // still signed in; it may work next time
  })

  it('signs out and fails with SignInRequiredError when the sign-in has expired', async () => {
    const auth = makeAuth()
    await auth.init()
    await auth.signIn()
    await auth.freshIdToken()
    oidc.validRefreshToken = 'revoked-by-it'
    await expect(auth.freshIdToken()).rejects.toBeInstanceOf(SignInRequiredError)
    expect(auth.status.state).toBe('signed-out')
    expect(signedOut).toEqual(['expired'])
  })
})

describe('logging out', () => {
  it('forgets the sign-in and revokes it with JumpCloud', async () => {
    const auth = makeAuth()
    await auth.init()
    await auth.signIn()
    const refreshToken = oidc.validRefreshToken
    await auth.signOut()

    expect(auth.status).toEqual({ state: 'signed-out' })
    expect(store.value).toBeNull()
    expect(oidc.revoked).toEqual([refreshToken])
    expect(signedOut).toEqual(['logout'])
    expect(auth.canChat).toBe(false)
    await expect(auth.freshIdToken()).rejects.toBeInstanceOf(SignInRequiredError)
  })

  it("doesn't bring back a sign-in that was being renewed while logging out", async () => {
    await savedSession()
    const auth = makeAuth()
    const starting = auth.init()
    await auth.signOut()
    await starting
    expect(auth.status.state).toBe('signed-out')
    expect(store.value).toBeNull()
  })
})
