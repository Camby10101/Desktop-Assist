import Anthropic from '@anthropic-ai/sdk'
import { CLAUDE_MODEL_NAME } from './model'

export type ErrorKind =
  | 'aborted'
  | 'auth'
  | 'permission'
  | 'billing'
  | 'not-found'
  | 'rate-limit'
  | 'overloaded'
  | 'network'
  | 'bad-request'
  | 'server'
  | 'unknown'

/** Sorts an error from the Anthropic SDK into what it means for the user. Most specific first. */
export function classifyError(error: unknown): ErrorKind {
  if (error instanceof Anthropic.APIUserAbortError) return 'aborted'
  if (error instanceof Anthropic.APIConnectionError) return 'network' // includes timeouts
  if (error instanceof Anthropic.AuthenticationError) return 'auth'
  if (error instanceof Anthropic.PermissionDeniedError) return 'permission'
  if (error instanceof Anthropic.NotFoundError) return 'not-found'
  if (error instanceof Anthropic.RateLimitError) return 'rate-limit'
  if (error instanceof Anthropic.BadRequestError) return 'bad-request'
  if (error instanceof Anthropic.APIError) {
    if (error.status === 402) return 'billing'
    if (error.status === 529) return 'overloaded'
    if (error.status !== undefined && error.status >= 500) return 'server'
  }
  return 'unknown'
}

/** Problems a different API key could fix. */
export function isKeyProblem(kind: ErrorKind): boolean {
  return kind === 'auth' || kind === 'permission' || kind === 'billing' || kind === 'not-found'
}

/** Problems worth simply trying again. */
export function isRetryable(kind: ErrorKind): boolean {
  return (
    kind === 'rate-limit' ||
    kind === 'overloaded' ||
    kind === 'network' ||
    kind === 'server' ||
    kind === 'unknown'
  )
}

const MESSAGES: Record<ErrorKind, string> = {
  aborted: 'Stopped.',
  auth: 'Anthropic rejected the API key.',
  permission: "This API key doesn't have access to the Claude API.",
  billing: "This API key's Anthropic account has run out of credit.",
  'not-found': `This API key can't use ${CLAUDE_MODEL_NAME}.`,
  'rate-limit': 'Claude is getting too many requests right now. Try again in a moment.',
  overloaded: 'Claude is busy right now. Try again in a moment.',
  network: "Couldn't reach Claude. Check your internet connection.",
  'bad-request': "Claude couldn't process that message.",
  server: 'Claude had a problem answering. Try again.',
  unknown: 'Something went wrong talking to Claude.',
}

export function errorMessage(kind: ErrorKind): string {
  return MESSAGES[kind]
}
