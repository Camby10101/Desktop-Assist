import Anthropic from '@anthropic-ai/sdk'
import { WorkloadIdentityError } from '@anthropic-ai/sdk/lib/credentials/types'
import { SignInRequiredError, SignInUnavailableError } from '../auth/AuthManager'
import { CLAUDE_MODEL_NAME } from './model'

export type ErrorKind =
  | 'aborted'
  | 'signed-out'
  | 'sign-in-unreachable'
  | 'not-allowed'
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

/** Sorts an error from a chat request into what it means for the user. Most specific first. */
export function classifyError(error: unknown): ErrorKind {
  if (error instanceof Anthropic.APIUserAbortError) return 'aborted'
  // The SDK wraps errors it doesn't know (like the sign-in ones) and keeps them as the cause.
  const cause = error instanceof Anthropic.AnthropicError ? error.cause : undefined
  if (error instanceof SignInRequiredError || cause instanceof SignInRequiredError) {
    return 'signed-out'
  }
  if (error instanceof SignInUnavailableError || cause instanceof SignInUnavailableError) {
    return 'sign-in-unreachable'
  }
  if (error instanceof WorkloadIdentityError) return exchangeErrorKind(error.statusCode)
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

/** Anthropic refused (or couldn't do) the swap of the JumpCloud sign-in for Claude access. */
function exchangeErrorKind(status: number | null): ErrorKind {
  if (status === null) return 'network'
  if (status === 429) return 'rate-limit'
  if (status >= 500) return 'server'
  return 'not-allowed' // 400/401/403: the federation rule doesn't accept this user
}

/** Problems worth simply trying again. */
export function isRetryable(kind: ErrorKind): boolean {
  return (
    kind === 'signed-out' || // after signing back in
    kind === 'sign-in-unreachable' ||
    kind === 'rate-limit' ||
    kind === 'overloaded' ||
    kind === 'network' ||
    kind === 'server' ||
    kind === 'unknown'
  )
}

const MESSAGES: Record<ErrorKind, string> = {
  aborted: 'Stopped.',
  'signed-out': 'Sign in with JumpCloud to keep chatting.',
  'sign-in-unreachable': "Couldn't reach JumpCloud to confirm your sign-in. Check your connection.",
  'not-allowed': "Your JumpCloud account isn't set up to use Claude yet. Contact IT.",
  auth: "Claude didn't accept your sign-in. Try again, or log out and sign in again.",
  permission: "Your account doesn't have access to Claude. Contact IT.",
  billing: "Your organisation's Claude account has run out of credit. Contact IT.",
  'not-found': `Your organisation can't use ${CLAUDE_MODEL_NAME}. Contact IT.`,
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

/**
 * Anthropic's ID for the failed request, if it has one. Shown with the error so IT can find the
 * attempt (for a refused sign-in swap, in the Claude Console's Authentication history).
 */
export function errorReference(error: unknown): string | undefined {
  if (error instanceof WorkloadIdentityError) return error.requestId ?? undefined
  if (error instanceof Anthropic.APIError) return error.requestID ?? undefined
  return undefined
}
