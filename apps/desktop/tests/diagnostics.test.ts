import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkloadIdentityError } from '@anthropic-ai/sdk/lib/credentials/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { summarizeIdToken } from '../src/main/auth/idToken'
import { createLog, describe as describeDetail } from '../src/main/log'

const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

describe('summarizeIdToken', () => {
  it('reports the header and the claims a federation rule checks, not the token', () => {
    const jwt = [
      part({ alg: 'RS256', kid: 'key-1' }),
      part({
        iss: 'https://oauth.id.jumpcloud.com/',
        aud: ['client-1'],
        sub: 'user-1',
        email: 'ada@example.com',
        iat: 1_000,
        exp: 4_600,
        jti: 'x',
      }),
      'signature',
    ].join('.')
    expect(summarizeIdToken(jwt)).toEqual({
      alg: 'RS256',
      kid: 'key-1',
      iss: 'https://oauth.id.jumpcloud.com/',
      aud: ['client-1'],
      sub: 'user-1',
      email: 'ada@example.com',
      issuedAt: '1970-01-01T00:16:40.000Z',
      expiresAt: '1970-01-01T01:16:40.000Z',
      lifetimeSeconds: 3600,
      hasJti: true,
      claims: ['aud', 'email', 'exp', 'iat', 'iss', 'jti', 'sub'],
    })
    expect(JSON.stringify(summarizeIdToken(jwt))).not.toContain('signature')
  })

  it('says when it is not a JWT', () => {
    expect(summarizeIdToken('nonsense')).toEqual({ error: 'not a JWT' })
  })
})

describe('log', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'desktop-assist-log-'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(dir, { recursive: true, force: true })
  })

  it('describes errors with their status, request ID and body', () => {
    const error = new WorkloadIdentityError(
      'Token exchange failed',
      401,
      'Authentication failed',
      'req_1',
    )
    expect(describeDetail(error)).toContain('"status":401')
    expect(describeDetail(error)).toContain('"requestId":"req_1"')
    expect(describeDetail(error)).toContain('Authentication failed')
  })

  it('appends lines to the file, creating its folder', async () => {
    const file = join(dir, 'logs', 'app.log')
    const log = createLog(file)
    log('first')
    log('second:', { a: 1 })
    const text = await readFile(file, 'utf8')
    expect(text).toMatch(/first\n.*second: \{"a":1\}\n$/)
  })

  it('starts a new file once the log gets large', async () => {
    const file = join(dir, 'app.log')
    await writeFile(file, 'x'.repeat(1_000_001))
    createLog(file)('fresh')
    expect(await readFile(file, 'utf8')).toMatch(/fresh\n$/)
    expect((await readFile(`${file}.old`, 'utf8')).length).toBe(1_000_001)
  })
})
