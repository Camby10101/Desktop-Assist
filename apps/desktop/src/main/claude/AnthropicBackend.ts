import Anthropic from '@anthropic-ai/sdk'
import type { Effort } from '@shared/types'
import { CLAUDE_MODEL, FALLBACK_BETA, MAX_TOKENS } from './model'

export interface ReplyRequest {
  apiKey: string
  system: string
  messages: Anthropic.Beta.BetaMessageParam[]
  tools: Anthropic.Beta.BetaTool[]
  effort: Effort
  signal: AbortSignal
  /** Called with each piece of reply text as it streams in. */
  onText: (delta: string) => void
}

/**
 * Where chat requests go. Milestone 1 calls Anthropic directly with the user's API key; a later
 * milestone adds a backend that uses the JumpCloud identity instead, behind the same interface.
 */
export interface ChatBackend {
  /** Resolves if the key works and can use the model; throws the SDK's error otherwise. */
  verifyKey(apiKey: string): Promise<void>
  /** Streams one reply and resolves with the complete message (all content blocks). */
  reply(request: ReplyRequest): Promise<Anthropic.Beta.BetaMessage>
}

export class AnthropicBackend implements ChatBackend {
  private cached: { apiKey: string; client: Anthropic } | null = null

  constructor(private readonly baseURL: string) {}

  async verifyKey(apiKey: string): Promise<void> {
    // Fetching the model's details costs nothing and fails with 401 for a bad key, or 404 if the
    // key's organisation can't use the model.
    await this.client(apiKey).models.retrieve(CLAUDE_MODEL, {}, { timeout: 15_000, maxRetries: 1 })
  }

  reply(request: ReplyRequest): Promise<Anthropic.Beta.BetaMessage> {
    const stream = this.client(request.apiKey).beta.messages.stream(
      {
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        // Thinking is always on for this model; effort sets how much it does.
        output_config: { effort: request.effort },
        system: request.system,
        cache_control: { type: 'ephemeral' }, // cache the conversation so far
        messages: request.messages,
        ...(request.tools.length > 0 ? { tools: request.tools } : {}),
      },
      { signal: request.signal },
    )
    stream.on('text', (delta) => request.onText(delta))
    return stream.finalMessage()
  }

  private client(apiKey: string): Anthropic {
    if (this.cached?.apiKey !== apiKey) {
      // authToken: null stops an ANTHROPIC_AUTH_TOKEN in the environment from being sent as well.
      this.cached = {
        apiKey,
        client: new Anthropic({ apiKey, authToken: null, baseURL: this.baseURL }),
      }
    }
    return this.cached.client
  }
}
