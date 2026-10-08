/**
 * What an ID token says, for the log, without the token itself (which could be swapped for
 * Claude access) or its signature. These are the things an Anthropic federation rule checks.
 */
export interface IdTokenSummary {
  alg?: string
  kid?: string
  iss?: string
  aud?: string | string[]
  sub?: string
  email?: string
  issuedAt?: string
  expiresAt?: string
  /** `exp` minus `iat`: Anthropic refuses tokens that live longer than the issuer allows. */
  lifetimeSeconds?: number
  hasJti: boolean
  /** Every claim name in the token, to see what a rule could match on. */
  claims: string[]
}

/** Decodes (without verifying) a JWT's header and claims into a summary. */
export function summarizeIdToken(jwt: string): IdTokenSummary | { error: string } {
  const parts = jwt.split('.')
  if (parts.length !== 3) return { error: 'not a JWT' }
  try {
    const [header, payload] = parts.slice(0, 2).map(decodePart)
    if (!header || !payload) return { error: 'not a JWT' }
    const iat = typeof payload.iat === 'number' ? payload.iat : undefined
    const exp = typeof payload.exp === 'number' ? payload.exp : undefined
    return {
      alg: text(header.alg),
      kid: text(header.kid),
      iss: text(payload.iss),
      aud: Array.isArray(payload.aud) ? payload.aud.map(String) : text(payload.aud),
      sub: text(payload.sub),
      email: text(payload.email),
      issuedAt: iat === undefined ? undefined : new Date(iat * 1000).toISOString(),
      expiresAt: exp === undefined ? undefined : new Date(exp * 1000).toISOString(),
      lifetimeSeconds: iat === undefined || exp === undefined ? undefined : exp - iat,
      hasJti: typeof payload.jti === 'string',
      claims: Object.keys(payload).sort(),
    }
  } catch (error) {
    return { error: `couldn't decode: ${error instanceof Error ? error.message : String(error)}` }
  }
}

function decodePart(part: string | undefined): Record<string, unknown> | null {
  if (!part) return null
  const value: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}
