import Anthropic from '@anthropic-ai/sdk'
import { oidcFederationProvider } from '@anthropic-ai/sdk/lib/credentials/oidc-federation'
import type { Effort } from '@shared/types'
import type { ClaudeAccessConfig } from '../tenant'
import { CLAUDE_MODEL, FALLBACK_BETA, MAX_TOKENS } from './model'

export interface ReplyRequest {
  system: string
  messages: Anthropic.Beta.BetaMessageParam[]
  tools: Anthropic.Beta.BetaTool[]
  effort: Effort
  signal: AbortSignal
  /** Called with each piece of reply text as it streams in. */
  onText: (delta: string) => void
}

/** Where chat requests go. Tests swap in a fake. */
export interface ChatBackend {
  /** Streams one reply and resolves with the complete message (all content blocks). */
  reply(request: ReplyRequest): Promise<Anthropic.Beta.BetaMessage>
  /** Forgets the current Claude access, e.g. after signing out. */
  reset(): void
}

export interface AnthropicBackendOptions {
  baseURL: string
  access: ClaudeAccessConfig
  /** A new, unused JumpCloud ID token (each can only be exchanged once). */
  identityToken(): Promise<string>
}

/**
 * Calls Claude as the signed-in user, with no API key. Anthropic's Workload Identity Federation
 * exchanges the user's JumpCloud ID token for a short-lived access token for the company's
 * service account. The SDK does the exchange, keeps the token, gets a new one shortly before it
 * expires, and retries once with a new one if Anthropic rejects it.
 */
export class AnthropicBackend implements ChatBackend {
  private client: Anthropic | null = null

  constructor(private readonly options: AnthropicBackendOptions) {}

  reply(request: ReplyRequest): Promise<Anthropic.Beta.BetaMessage> {
    const stream = this.getClient().beta.messages.stream(
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

  reset(): void {
    this.client = null
  }

  private getClient(): Anthropic {
    const { baseURL, access, identityToken } = this.options
    this.client ??= new Anthropic({
      // null stops an API key or token in the environment from being used instead.
      apiKey: null,
      authToken: null,
      baseURL,
      credentials: oidcFederationProvider({
        identityTokenProvider: identityToken,
        organizationId: access.organizationId,
        federationRuleId: access.federationRuleId,
        serviceAccountId: access.serviceAccountId,
        workspaceId: access.workspaceId || undefined,
        baseURL,
        fetch,
      }),
    })
    return this.client
  }
}
