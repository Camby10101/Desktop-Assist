import * as client from 'openid-client'
import type { SignInConfig } from '../tenant'

/** `offline_access` asks for a refresh token, so the user stays signed in across restarts. */
export const SCOPES = 'openid email profile offline_access'

export interface IdTokenClaims {
  sub: string
  email?: string
  name?: string
  /** Expiry, Unix seconds. */
  exp: number
}

export interface OidcTokens {
  /** A signed JWT identifying the user. Exchanged for Claude access (one exchange per token). */
  idToken: string
  /** JumpCloud may rotate this on every refresh; always keep the newest. */
  refreshToken?: string
  claims: IdTokenClaims
}

/** A sign-in started in the browser. */
export interface PendingSignIn {
  url: string
  /** Completes the sign-in from the URL the browser was sent back to. */
  finish(callbackUrl: string): Promise<OidcTokens>
}

/** The identity-provider calls the app needs. The real one wraps openid-client; tests use fakes. */
export interface Oidc {
  begin(redirectUri: string): Promise<PendingSignIn>
  refresh(refreshToken: string): Promise<OidcTokens>
  revoke(refreshToken: string): Promise<void>
}

/** JumpCloud refused a saved sign-in (expired, revoked, or the user lost access). */
export class SessionExpiredError extends Error {
  constructor(cause?: unknown) {
    super('Your JumpCloud sign-in has expired', { cause })
  }
}

/**
 * OpenID Connect with JumpCloud, using openid-client: Authorization Code flow with PKCE as a
 * public client (no client secret; the code verifier proves the app that started the sign-in is
 * the one finishing it), plus state and nonce checks. The ID token's signature, issuer, audience
 * and expiry are verified by openid-client.
 */
export function createOidc(config: SignInConfig, options: { allowInsecure?: boolean } = {}): Oidc {
  // Discovery reads the issuer's endpoints once; a failed attempt is retried next time.
  let discovered: Promise<client.Configuration> | null = null
  const configuration = (): Promise<client.Configuration> => {
    discovered ??= client
      .discovery(new URL(config.issuer), config.clientId, undefined, client.None(), {
        // Plain http is only ever allowed for a local test issuer in dev runs.
        execute: options.allowInsecure ? [client.allowInsecureRequests] : [],
        timeout: 15,
      })
      .catch((error: unknown) => {
        discovered = null
        throw error
      })
    return discovered
  }

  return {
    async begin(redirectUri) {
      const configured = await configuration()
      const codeVerifier = client.randomPKCECodeVerifier()
      const state = client.randomState()
      const nonce = client.randomNonce()
      const url = client.buildAuthorizationUrl(configured, {
        redirect_uri: redirectUri,
        scope: SCOPES,
        code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
        code_challenge_method: 'S256',
        state,
        nonce,
      })
      return {
        url: url.href,
        finish: async (callbackUrl) =>
          toTokens(
            await client.authorizationCodeGrant(configured, new URL(callbackUrl), {
              pkceCodeVerifier: codeVerifier,
              expectedState: state,
              expectedNonce: nonce,
              idTokenExpected: true,
            }),
          ),
      }
    },

    async refresh(refreshToken) {
      const configured = await configuration()
      try {
        return toTokens(await client.refreshTokenGrant(configured, refreshToken))
      } catch (error) {
        if (isRefusal(error)) throw new SessionExpiredError(error)
        throw error
      }
    },

    async revoke(refreshToken) {
      const configured = await configuration()
      if (!configured.serverMetadata().revocation_endpoint) return
      await client.tokenRevocation(configured, refreshToken, { token_type_hint: 'refresh_token' })
    },
  }
}

type TokenResponse = Awaited<ReturnType<typeof client.refreshTokenGrant>>

function toTokens(response: TokenResponse): OidcTokens {
  const claims = response.claims()
  if (!response.id_token || !claims) throw new Error('JumpCloud did not return an ID token')
  return {
    idToken: response.id_token,
    refreshToken: response.refresh_token,
    claims: {
      sub: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : undefined,
      name: typeof claims.name === 'string' ? claims.name : undefined,
      exp: claims.exp,
    },
  }
}

/** Why a browser sign-in failed, in words the user can act on. */
export function describeSignInError(error: unknown): string {
  if (error instanceof client.AuthorizationResponseError) {
    return error.error_description ?? `JumpCloud said "${error.error}".`
  }
  if (error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError')) {
    return "Couldn't reach JumpCloud. Check your connection."
  }
  return error instanceof Error ? error.message : String(error)
}

/** JumpCloud answered, and said no (as opposed to not being reachable). */
function isRefusal(error: unknown): boolean {
  return (
    error instanceof client.ResponseBodyError &&
    ['invalid_grant', 'invalid_client', 'unauthorized_client', 'access_denied'].includes(
      error.error,
    )
  )
}
