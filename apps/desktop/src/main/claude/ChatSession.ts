import { randomUUID } from 'node:crypto'
import type Anthropic from '@anthropic-ai/sdk'
import type { Attachment, ChatMessage, Effort } from '@shared/types'
import type { ChatBackend } from './AnthropicBackend'
import { classifyError, errorMessage, isRetryable } from './errors'
import { MAX_TOOL_ROUNDS } from './model'

type MessageParam = Anthropic.Beta.BetaMessageParam
type ContentBlock = Anthropic.Beta.BetaContentBlock

/** A screenshot ready to send: base64 image data. */
export interface OutgoingImage {
  mediaType: 'image/jpeg' | 'image/png'
  data: string
}

/** A tool Claude may call. None are registered yet; the loop is ready for them. */
export interface ChatTool {
  definition: Anthropic.Beta.BetaTool
  run(input: unknown): Promise<string>
}

export interface ChatSessionDeps {
  backend: ChatBackend
  /** Whether someone is signed in, so a request can be made. */
  canChat(): boolean
  getEffort(): Effort
  /** Fixed for the session, so the cached prompt prefix stays valid. */
  system: string
  tools?: ChatTool[]
  /** A message was added or changed. */
  onMessage(message: ChatMessage): void
  onReset(): void
  /** A reply failed; gets the full error, for the log (the chat shows a plain-English message). */
  onError?(error: unknown): void
  /** Streamed text is sent to the UI at most this often. */
  emitIntervalMs?: number
}

export type SendStatus = 'sent' | 'busy' | 'empty' | 'signed-out'

/**
 * One conversation with Claude.
 *
 * It keeps two lists: `history`, exactly what is sent to the API, and `messages`, what the chat
 * shows. History is append-only: earlier turns are never edited or removed, because Claude's
 * thinking is tied to the exact conversation it was produced in. Every reply is appended with all
 * of its content blocks (thinking included) unchanged, except what the API says to drop after a
 * server-side fallback (`replayContent()`); a reply cut short by Stop or an error is appended as
 * plain text.
 */
export class ChatSession {
  private history: MessageParam[] = []
  private messages: ChatMessage[] = []
  private controller: AbortController | null = null
  private turn: Promise<void> = Promise.resolve()
  /** Bumped by New conversation, so a reply still finishing can't touch the new one. */
  private generation = 0
  private readonly emitTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(private readonly deps: ChatSessionDeps) {}

  get busy(): boolean {
    return this.controller !== null
  }

  list(): ChatMessage[] {
    return this.messages.map((m) => ({ ...m }))
  }

  /** Starts a reply and returns straight away; the reply streams in through `onMessage`. */
  send(text: string, images: OutgoingImage[], attachments: Attachment[]): SendStatus {
    if (this.busy) return 'busy'
    if (!text.trim() && images.length === 0) return 'empty'
    if (!this.deps.canChat()) return 'signed-out'

    const content: Anthropic.Beta.BetaContentBlockParam[] = images.map((image) => ({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType, data: image.data },
    }))
    if (text.trim()) content.push({ type: 'text', text })
    this.history.push({ role: 'user', content })
    this.add({ role: 'user', text, attachments, status: 'done' })

    this.startTurn(this.add({ role: 'assistant', text: '', attachments: [], status: 'streaming' }))
    return 'sent'
  }

  /** Asks again after a failed reply (only if nothing from it was kept). */
  retry(): void {
    const last = this.messages.at(-1)
    if (this.busy || !last?.retryable || !this.deps.canChat()) return
    Object.assign(last, { text: '', status: 'streaming', notice: undefined, retryable: undefined })
    this.emit(last)
    this.startTurn(last)
  }

  stop(): void {
    this.controller?.abort()
  }

  newConversation(): void {
    this.generation++
    this.stop()
    this.controller = null
    for (const timer of this.emitTimers.values()) clearTimeout(timer)
    this.emitTimers.clear()
    this.history = []
    this.messages = []
    this.deps.onReset()
  }

  /** Resolves when the current reply (if any) has finished. */
  idle(): Promise<void> {
    return this.turn
  }

  private startTurn(reply: ChatMessage): void {
    const controller = new AbortController()
    this.controller = controller
    this.turn = this.runTurn(reply, controller).finally(() => {
      if (this.controller === controller) this.controller = null
    })
  }

  private async runTurn(reply: ChatMessage, controller: AbortController): Promise<void> {
    const generation = this.generation
    const current = () => generation === this.generation
    const tools = this.deps.tools ?? []
    let roundText = ''
    let keptPartial = false

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        roundText = ''
        const message = await this.deps.backend.reply({
          system: this.deps.system,
          messages: this.history,
          tools: tools.map((t) => t.definition),
          effort: this.deps.getEffort(),
          signal: controller.signal,
          onText: (delta) => {
            if (!current()) return
            roundText += delta
            reply.text += delta
            this.scheduleEmit(reply)
          },
        })
        if (!current()) return
        const content = replayContent(message.content)
        this.history.push({ role: 'assistant', content })

        if (message.stop_reason === 'tool_use') {
          this.history.push({ role: 'user', content: await runTools(content, tools) })
          continue
        }
        if (message.stop_reason === 'pause_turn') continue // the API asks us to send it back to resume

        return this.finish(reply, 'done', stopNotice(message.stop_reason))
      }
      this.finish(reply, 'done', 'Claude stopped after too many steps.')
    } catch (error) {
      if (!current()) return
      // Keep what streamed before the failure, as plain text (the history stays append-only).
      if (roundText) {
        this.history.push({ role: 'assistant', content: [{ type: 'text', text: roundText }] })
        keptPartial = true
      }
      const kind = classifyError(error)
      if (kind === 'aborted') {
        return this.finish(
          reply,
          'stopped',
          reply.text ? 'Stopped.' : 'Stopped before Claude replied.',
        )
      }
      this.deps.onError?.(error)
      const retryable = !keptPartial && isRetryable(kind)
      this.finish(reply, 'error', errorMessage(kind), retryable)
    }
  }

  private add(fields: Omit<ChatMessage, 'id'>): ChatMessage {
    const message: ChatMessage = { id: randomUUID(), ...fields }
    this.messages.push(message)
    this.emit(message)
    return message
  }

  private finish(
    message: ChatMessage,
    status: ChatMessage['status'],
    notice?: string,
    retryable?: boolean,
  ): void {
    Object.assign(message, { status, notice, retryable: retryable || undefined })
    this.emit(message)
  }

  /** Streamed text arrives in many small pieces; batch them into fewer UI updates. */
  private scheduleEmit(message: ChatMessage): void {
    const interval = this.deps.emitIntervalMs ?? 50
    if (interval <= 0) return this.emit(message)
    if (this.emitTimers.has(message.id)) return
    this.emitTimers.set(
      message.id,
      setTimeout(() => {
        this.emitTimers.delete(message.id)
        this.deps.onMessage({ ...message })
      }, interval),
    )
  }

  private emit(message: ChatMessage): void {
    const timer = this.emitTimers.get(message.id)
    if (timer) clearTimeout(timer)
    this.emitTimers.delete(message.id)
    this.deps.onMessage({ ...message })
  }
}

function stopNotice(stopReason: string | null): string | undefined {
  if (stopReason === 'refusal') return 'Claude declined to answer this.'
  if (stopReason === 'max_tokens') return 'This reply hit the length limit and was cut short.'
  return undefined
}

/** Reasoning that belongs to a model that declined, so it isn't sent back after a fallback. */
const DECLINED_REASONING = new Set(['thinking', 'redacted_thinking', 'connector_text'])

/**
 * A reply's content as it must be sent back on the next turn: normally every block, unchanged.
 * After a server-side fallback (another model took over partway through), the API requires
 * dropping what the declining model produced before the last `fallback` block: its reasoning,
 * its client-side tool calls, and server tool calls that got no result. The `fallback` block
 * itself stays exactly where it was; the API checks the blocks around it.
 */
export function replayContent(content: ContentBlock[]): ContentBlock[] {
  const lastFallback = content.findLastIndex((block) => block.type === 'fallback')
  if (lastFallback === -1) return content
  const answered = new Set(
    content.flatMap((block) => ('tool_use_id' in block ? [block.tool_use_id] : [])),
  )
  return content.filter((block, index) => {
    if (index >= lastFallback) return true
    if (DECLINED_REASONING.has(block.type) || block.type === 'tool_use') return false
    if (block.type === 'server_tool_use') return answered.has(block.id)
    return true
  })
}

/** Runs every tool call in a reply and returns the results to send back. */
async function runTools(
  content: ContentBlock[],
  tools: ChatTool[],
): Promise<Anthropic.Beta.BetaToolResultBlockParam[]> {
  const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
  for (const block of content) {
    if (block.type !== 'tool_use') continue
    const tool = tools.find((t) => t.definition.name === block.name)
    try {
      if (!tool) throw new Error(`Unknown tool: ${block.name}`)
      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: await tool.run(block.input),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      results.push({ type: 'tool_result', tool_use_id: block.id, content: message, is_error: true })
    }
  }
  return results
}
