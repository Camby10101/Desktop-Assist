import Anthropic from '@anthropic-ai/sdk'
import { WorkloadIdentityError } from '@anthropic-ai/sdk/lib/credentials/types'
import { describe, expect, it } from 'vitest'
import { SignInRequiredError, SignInUnavailableError } from '../src/main/auth/AuthManager'
import { classifyError, isRetryable } from '../src/main/claude/errors'
import { buildSystemPrompt } from '../src/main/claude/model'
import { fitWithin } from '../src/main/screenshots/imageSize'

const status = (code: number) => Anthropic.APIError.generate(code, undefined, 'x', new Headers())
const exchange = (code: number | null) => new WorkloadIdentityError('exchange failed', code)
/** How the SDK passes on an error thrown while getting credentials. */
const wrapped = (cause: Error) =>
  Object.assign(new Anthropic.AnthropicError(cause.message), { cause })

describe('classifyError', () => {
  it.each([
    [status(401), 'auth'],
    [status(403), 'permission'],
    [status(402), 'billing'],
    [status(404), 'not-found'],
    [status(429), 'rate-limit'],
    [status(400), 'bad-request'],
    [status(529), 'overloaded'],
    [status(500), 'server'],
    [new Anthropic.APIConnectionError({ message: 'offline' }), 'network'],
    [new Anthropic.APIConnectionTimeoutError(), 'network'],
    [new Anthropic.APIUserAbortError(), 'aborted'],
    [wrapped(new SignInRequiredError()), 'signed-out'],
    [wrapped(new SignInUnavailableError(new Error('offline'))), 'sign-in-unreachable'],
    [exchange(401), 'not-allowed'],
    [exchange(403), 'not-allowed'],
    [exchange(429), 'rate-limit'],
    [exchange(503), 'server'],
    [exchange(null), 'network'],
    [new Error('boom'), 'unknown'],
  ])('%s → %s', (error, kind) => {
    expect(classifyError(error)).toBe(kind)
  })

  it('offers Retry only for temporary problems', () => {
    expect(isRetryable('overloaded')).toBe(true)
    expect(isRetryable('sign-in-unreachable')).toBe(true)
    expect(isRetryable('auth')).toBe(false)
    expect(isRetryable('signed-out')).toBe(true) // once signed back in
    expect(isRetryable('not-allowed')).toBe(false)
  })
})

describe('buildSystemPrompt', () => {
  it('names the app and company, and appends tenant instructions', () => {
    const prompt = buildSystemPrompt({
      appName: 'Desktop Assist',
      companyName: 'Morse Micro',
      systemPrompt: 'Use Australian English.',
    })
    expect(prompt).toContain('You are Desktop Assist')
    expect(prompt).toContain('Morse Micro')
    expect(prompt.endsWith('Use Australian English.')).toBe(true)
  })
})

describe('fitWithin', () => {
  it('scales the longest side down to the limit, keeping the shape', () => {
    expect(fitWithin({ width: 1920, height: 1080 }, 1568)).toEqual({ width: 1568, height: 882 })
    expect(fitWithin({ width: 1080, height: 1920 }, 1568)).toEqual({ width: 882, height: 1568 })
  })

  it('never scales up', () => {
    expect(fitWithin({ width: 800, height: 600 }, 1568)).toEqual({ width: 800, height: 600 })
  })
})
