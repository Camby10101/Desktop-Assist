import Anthropic from '@anthropic-ai/sdk'
import { WorkloadIdentityError } from '@anthropic-ai/sdk/lib/credentials/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage, Effort } from '@shared/types'
import type { ChatBackend, ReplyRequest } from '../src/main/claude/AnthropicBackend'
import { SignInRequiredError } from '../src/main/auth/AuthManager'
import { ChatSession, replayContent, type ChatTool } from '../src/main/claude/ChatSession'

type Step = (request: ReplyRequest) => Promise<Anthropic.Beta.BetaMessage>

/** A backend that plays back scripted replies and records what it was sent. */
class FakeBackend implements ChatBackend {
  steps: Step[] = []
  calls: Array<Omit<ReplyRequest, 'onText' | 'signal'>> = []
  reply(request: ReplyRequest): Promise<Anthropic.Beta.BetaMessage> {
    const { system, messages, tools, effort } = request
    this.calls.push(structuredClone({ system, messages, tools, effort }))
    const step = this.steps.shift()
    if (!step) throw new Error('unexpected request')
    return step(request)
  }
  reset(): void {}
}

const reply = (content: unknown[], stop_reason: string = 'end_turn'): Anthropic.Beta.BetaMessage =>
  ({ content, stop_reason }) as unknown as Anthropic.Beta.BetaMessage

/** Streams `text` in two pieces, then completes. */
const says =
  (text: string, stop_reason = 'end_turn'): Step =>
  async (request) => {
    request.onText(text.slice(0, 3))
    request.onText(text.slice(3))
    return reply([{ type: 'text', text }], stop_reason)
  }

/** Streams some text, then waits until the request is aborted. */
const streamsUntilStopped =
  (partial: string): Step =>
  (request) =>
    new Promise((_, reject) => {
      if (partial) request.onText(partial)
      request.signal.addEventListener('abort', () => reject(new Anthropic.APIUserAbortError()))
    })

const fails =
  (error: unknown, partial = ''): Step =>
  async (request) => {
    if (partial) request.onText(partial)
    throw error
  }

const apiError = (status: number) =>
  Anthropic.APIError.generate(status, undefined, 'x', new Headers())

let backend: FakeBackend
let signedIn: boolean
let effort: Effort
let shown: Map<string, ChatMessage>
let resets: number
let session: ChatSession

function makeSession(tools: ChatTool[] = []) {
  return new ChatSession({
    backend,
    canChat: () => signedIn,
    getEffort: () => effort,
    system: 'SYSTEM',
    tools,
    onMessage: (message) => shown.set(message.id, message),
    onReset: () => {
      resets++
      shown.clear()
    },
    emitIntervalMs: 0,
  })
}

beforeEach(() => {
  backend = new FakeBackend()
  signedIn = true
  effort = 'low'
  shown = new Map()
  resets = 0
  session = makeSession()
})

const lastShown = () => [...shown.values()].at(-1)!

describe('sending', () => {
  it('streams the reply into the chat and sends the system prompt and effort', async () => {
    backend.steps.push(says('Hello there'))
    expect(session.send('Hi', [], [])).toBe('sent')
    expect(session.busy).toBe(true)
    await session.idle()

    expect(session.busy).toBe(false)
    expect(lastShown()).toMatchObject({ role: 'assistant', text: 'Hello there', status: 'done' })
    expect(backend.calls[0]).toMatchObject({ system: 'SYSTEM', effort: 'low' })
  })

  it('puts screenshots before the text in the user message', async () => {
    backend.steps.push(says('Got it'))
    session.send('What is this?', [{ mediaType: 'image/jpeg', data: 'AAAA' }], [])
    await session.idle()
    expect(backend.calls[0]!.messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
        { type: 'text', text: 'What is this?' },
      ],
    })
  })

  it('replays earlier replies with every content block unchanged (thinking included)', async () => {
    const content = [
      { type: 'thinking', thinking: '', signature: 'sig-123' },
      { type: 'text', text: 'First answer' },
    ]
    backend.steps.push(async () => reply(content), says('Second answer'))
    session.send('one', [], [])
    await session.idle()
    session.send('two', [], [])
    await session.idle()
    expect(backend.calls[1]!.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'one' }] },
      { role: 'assistant', content },
      { role: 'user', content: [{ type: 'text', text: 'two' }] },
    ])
  })

  it('refuses while busy, when empty, and when signed out', async () => {
    backend.steps.push(streamsUntilStopped(''))
    session.send('first', [], [])
    expect(session.send('second', [], [])).toBe('busy')
    session.stop()
    await session.idle()
    expect(session.send('   ', [], [])).toBe('empty')
    signedIn = false
    expect(session.send('hello', [], [])).toBe('signed-out')
  })
})

describe('stopping', () => {
  it('keeps the partial reply as plain text so the history stays append-only', async () => {
    backend.steps.push(streamsUntilStopped('Half an ans'), says('ok'))
    session.send('question', [], [])
    session.stop()
    await session.idle()
    expect(lastShown()).toMatchObject({
      text: 'Half an ans',
      status: 'stopped',
      notice: 'Stopped.',
    })

    session.send('next', [], [])
    await session.idle()
    expect(backend.calls[1]!.messages[1]).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: 'Half an ans' }],
    })
  })

  it('adds nothing to the history when stopped before any text', async () => {
    backend.steps.push(streamsUntilStopped(''), says('ok'))
    session.send('question', [], [])
    session.stop()
    await session.idle()
    expect(lastShown()).toMatchObject({
      status: 'stopped',
      notice: 'Stopped before Claude replied.',
    })
    session.send('again', [], [])
    await session.idle()
    expect(backend.calls[1]!.messages.map((m) => m.role)).toEqual(['user', 'user'])
  })
})

describe('errors', () => {
  it('offers Retry after a network error, and Retry resends the same conversation', async () => {
    backend.steps.push(fails(new Anthropic.APIConnectionError({ message: 'offline' })))
    session.send('question', [], [])
    await session.idle()
    const failed = lastShown()
    expect(failed).toMatchObject({ status: 'error', retryable: true })
    expect(failed.notice).toContain("Couldn't reach Claude")

    backend.steps.push(says('Answer'))
    session.retry()
    await session.idle()
    expect(lastShown()).toMatchObject({ id: failed.id, text: 'Answer', status: 'done' })
    expect(backend.calls[1]!.messages).toEqual(backend.calls[0]!.messages)
  })

  it('does not offer Retry once part of the reply was kept', async () => {
    backend.steps.push(fails(apiError(500), 'Partial'))
    session.send('question', [], [])
    await session.idle()
    expect(lastShown()).toMatchObject({ text: 'Partial', status: 'error' })
    expect(lastShown().retryable).toBeUndefined()
  })

  it('asks the user to sign in again when the sign-in has expired', async () => {
    // The SDK wraps errors from the credentials provider and keeps the original as the cause.
    const wrapped = new Anthropic.AnthropicError('Sign in with JumpCloud to use Claude')
    wrapped.cause = new SignInRequiredError()
    backend.steps.push(fails(wrapped))
    session.send('question', [], [])
    await session.idle()
    expect(lastShown()).toMatchObject({
      status: 'error',
      notice: 'Sign in with JumpCloud to keep chatting.',
    })
    expect(lastShown().retryable).toBe(true) // once signed back in
  })

  it("adds Anthropic's request ID when the sign-in swap is refused", async () => {
    backend.steps.push(
      fails(
        new WorkloadIdentityError('Token exchange failed', 401, 'Authentication failed', 'req_9'),
      ),
    )
    session.send('question', [], [])
    await session.idle()
    expect(lastShown().notice).toBe(
      "Your JumpCloud account isn't set up to use Claude yet. Contact IT. (Reference: req_9)",
    )
  })

  it('explains refusals and replies cut off at the length limit', async () => {
    backend.steps.push(says('No.', 'refusal'), says('Long…', 'max_tokens'))
    session.send('a', [], [])
    await session.idle()
    expect(lastShown().notice).toBe('Claude declined to answer this.')
    session.send('b', [], [])
    await session.idle()
    expect(lastShown().notice).toContain('length limit')
  })
})

describe('after a server-side fallback', () => {
  const thinking = (signature: string) => ({ type: 'thinking', thinking: '', signature })
  const text = (t: string) => ({ type: 'text', text: t })
  const fallback = { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'other' } }

  it("sends back the reply without the declining model's reasoning", async () => {
    backend.steps.push(
      async () => reply([thinking('a'), text('Par'), fallback, thinking('b'), text('Answer')]),
      says('ok'),
    )
    session.send('question', [], [])
    await session.idle()
    session.send('next', [], [])
    await session.idle()
    expect(backend.calls[1]!.messages[1]).toEqual({
      role: 'assistant',
      content: [text('Par'), fallback, thinking('b'), text('Answer')],
    })
  })

  it('drops tool calls before the last fallback, keeping server tool calls that got a result', () => {
    const content = [
      { type: 'tool_use', id: 't1', name: 'x', input: {} },
      { type: 'server_tool_use', id: 's1', name: 'web_search', input: {} },
      { type: 'web_search_tool_result', tool_use_id: 's1', content: [] },
      { type: 'server_tool_use', id: 's2', name: 'web_search', input: {} },
      { type: 'redacted_thinking', data: 'x' },
      fallback,
      { type: 'tool_use', id: 't2', name: 'x', input: {} },
    ] as unknown as Anthropic.Beta.BetaContentBlock[]
    expect(replayContent(content).map((b) => ('id' in b ? b.id : b.type))).toEqual([
      's1',
      'web_search_tool_result',
      'fallback',
      't2',
    ])
  })

  it('leaves a reply without a fallback unchanged', () => {
    const content = [thinking('a'), text('Hi')] as unknown as Anthropic.Beta.BetaContentBlock[]
    expect(replayContent(content)).toBe(content)
  })
})

describe('tools', () => {
  it('runs requested tools and sends the results back until Claude finishes', async () => {
    const run = vi.fn(async (input: unknown) => `weather for ${(input as { city: string }).city}`)
    session = makeSession([
      { definition: { name: 'weather', input_schema: { type: 'object' } }, run },
    ])
    backend.steps.push(
      async () =>
        reply(
          [
            { type: 'tool_use', id: 'tu_1', name: 'weather', input: { city: 'Sydney' } },
            { type: 'tool_use', id: 'tu_2', name: 'missing', input: {} },
          ],
          'tool_use',
        ),
      says('It is sunny'),
    )
    session.send('Weather?', [], [])
    await session.idle()

    expect(run).toHaveBeenCalledWith({ city: 'Sydney' })
    expect(backend.calls[0]!.tools).toEqual([{ name: 'weather', input_schema: { type: 'object' } }])
    expect(backend.calls[1]!.messages.at(-1)).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'tu_1', content: 'weather for Sydney' },
        {
          type: 'tool_result',
          tool_use_id: 'tu_2',
          content: 'Unknown tool: missing',
          is_error: true,
        },
      ],
    })
    expect(lastShown()).toMatchObject({ text: 'It is sunny', status: 'done' })
  })
})

describe('new conversation', () => {
  it('clears everything, and a reply still in flight is ignored', async () => {
    let finish!: () => void
    backend.steps.push(
      (request) =>
        new Promise((resolve) => {
          finish = () => {
            request.onText('late')
            resolve(reply([{ type: 'text', text: 'late' }]))
          }
        }),
      says('fresh'),
    )
    session.send('old', [], [])
    session.newConversation()
    finish()
    await session.idle()

    expect(resets).toBe(1)
    expect(shown.size).toBe(0)
    expect(session.list()).toEqual([])
    session.send('new', [], [])
    await session.idle()
    expect(backend.calls[1]!.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'new' }] },
    ])
  })
})
