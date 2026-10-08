import { z } from 'zod'
import { ACTION_IDS } from '@shared/actions'
import type { Branding } from '@shared/types'

/**
 * How users sign in: the company's OpenID Connect app (JumpCloud for Morse Micro). The client ID
 * isn't secret; it identifies the app to JumpCloud. Left empty until IT creates the app.
 */
export const SignInSchema = z.object({
  issuer: z.url(),
  clientId: z.string(),
  /** The browser comes back to http://127.0.0.1:<port>/callback after sign-in. */
  redirectPort: z.number().int().min(1024).max(65535),
})

/**
 * How a signed-in user reaches Claude: Anthropic Workload Identity Federation swaps the user's
 * JumpCloud ID token for a short-lived Claude API token, acting as a service account. None of
 * these IDs are secret. Left empty until set up in the Claude Console.
 */
export const ClaudeAccessSchema = z.object({
  organizationId: z.string(),
  federationRuleId: z.string(),
  serviceAccountId: z.string(),
  /** Only needed when the federation rule covers more than one workspace. */
  workspaceId: z.string().optional(),
})

export type SignInConfig = z.infer<typeof SignInSchema>
export type ClaudeAccessConfig = z.infer<typeof ClaudeAccessSchema>

export const TenantSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  companyName: z.string().min(1),
  appName: z.string().min(1),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #RRGGBB colour'),
  actions: z
    .array(z.enum(ACTION_IDS))
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, 'actions must not repeat'),
  /** Extra instructions for Claude, added to the built-in system prompt. */
  systemPrompt: z.string().max(8000).optional(),
  signIn: SignInSchema,
  claudeAccess: ClaudeAccessSchema,
})

export type Tenant = z.infer<typeof TenantSchema>

export function brandingOf(tenant: Tenant): Branding {
  const { companyName, appName, accentColor, actions } = tenant
  return { companyName, appName, accentColor, actions }
}

/** The tenant.json settings still to be filled in before anyone can sign in, by name. */
export function missingSettings(signIn: SignInConfig, access: ClaudeAccessConfig): string[] {
  const required: Record<string, string> = {
    'signIn.clientId': signIn.clientId,
    'claudeAccess.organizationId': access.organizationId,
    'claudeAccess.federationRuleId': access.federationRuleId,
    'claudeAccess.serviceAccountId': access.serviceAccountId,
  }
  return Object.entries(required)
    .filter(([, value]) => !value.trim())
    .map(([name]) => name)
}

/**
 * Dev runs only: a JSON file (path in DESKTOP_ASSIST_DEV_CONFIG) can override `signIn` and
 * `claudeAccess`, so the app can be pointed at a test identity provider without editing
 * tenant.json. Installed builds never read it.
 */
export const DevOverrideSchema = z.object({
  signIn: SignInSchema.partial().optional(),
  claudeAccess: ClaudeAccessSchema.partial().optional(),
})
