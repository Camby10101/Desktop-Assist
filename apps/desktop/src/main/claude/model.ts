// How Desktop Assist calls Claude. Kept in one place so the model and request shape are easy to change.

export const CLAUDE_MODEL = 'claude-opus-5-5'
export const CLAUDE_MODEL_NAME = 'Claude Opus 5.5'

/**
 * Server-side refusal fallback, "default" mode: if Claude's safety classifiers decline a request,
 * the API re-runs it on Anthropic's recommended fallback model instead of returning a refusal.
 */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

/** Replies stream, so a high ceiling costs nothing unless Claude actually writes that much. */
export const MAX_TOKENS = 64_000

export const API_BASE_URL = 'https://api.anthropic.com'

/** Never resend a turn more than this many times in one tool-use loop. */
export const MAX_TOOL_ROUNDS = 10

/**
 * The system prompt, fixed for the whole conversation (changing it mid-conversation would throw
 * away the prompt cache). Tenants can add their own instructions in tenant.json.
 */
export function buildSystemPrompt(tenant: {
  appName: string
  companyName: string
  systemPrompt?: string
}): string {
  const base = [
    `You are ${tenant.appName}, a desktop assistant for people at ${tenant.companyName}.`,
    "You appear as a small chat panel in the corner of the user's Windows screen, so keep answers",
    'concise and easy to scan: short paragraphs, lists and code blocks where they help.',
    'The user can attach screenshots of their screen; when they do, use what you can see in them.',
  ].join(' ')
  return tenant.systemPrompt ? `${base}\n\n${tenant.systemPrompt}` : base
}
