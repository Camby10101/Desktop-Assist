import { z } from 'zod'
import { ACTION_IDS } from '@shared/actions'
import type { Branding, ChatApp } from '@shared/types'

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

/**
 * The company's app portal, for the Apps list: JumpCloud's User Portal. `appsServer` is
 * JumpCloud's "MCP Server for Users", which lists the apps a signed-in user can see in the portal
 * and gives each one's sign-in link; each user connects to it once, in the browser (no secret in
 * the app). An admin turns it on in the JumpCloud Admin Portal (Settings → JumpCloud AI).
 */
export const PortalSchema = z.object({
  /** Shown to users: "Sign in with JumpCloud", "Open the JumpCloud portal". */
  name: z.string().min(1),
  /** The User Portal itself, opened by "Open the … portal". */
  url: z.url({ protocol: /^https$/ }),
  appsServer: z.url({ protocol: /^https?$/ }),
  /** The browser comes back to http://127.0.0.1:<port>/callback after connecting. */
  redirectPort: z.number().int().min(1024).max(65535),
})

export type PortalConfig = z.infer<typeof PortalSchema>

export type SignInConfig = z.infer<typeof SignInSchema>
export type ClaudeAccessConfig = z.infer<typeof ClaudeAccessSchema>

/**
 * Where conversations with Claude happen.
 * - `claude-desktop`: Desktop Assist hands the question to the Claude Desktop app, so it uses the
 *   person's own Claude (Team/Enterprise) account and counts against their own usage limit. No
 *   sign-in in Desktop Assist.
 * - `built-in`: the chat runs in the panel, through the Claude API, after a JumpCloud sign-in
 *   (`signIn` and `claudeAccess`). Usage is billed to the company's Claude Console account.
 */
export const CHAT_APPS = ['built-in', 'claude-desktop'] as const satisfies ChatApp[]

export const TenantSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    companyName: z.string().min(1),
    appName: z.string().min(1),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #RRGGBB colour'),
    actions: z
      .array(z.enum(ACTION_IDS))
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, 'actions must not repeat'),
    chatApp: z.enum(CHAT_APPS).default('built-in'),
    /** Extra instructions for Claude, added to the built-in chat's system prompt. */
    systemPrompt: z.string().max(8000).optional(),
    /** Needed for the Apps action. */
    portal: PortalSchema.optional(),
    /** Needed for the built-in chat only. */
    signIn: SignInSchema.optional(),
    claudeAccess: ClaudeAccessSchema.optional(),
  })
  .refine(
    (tenant) => tenant.chatApp !== 'built-in' || Boolean(tenant.signIn && tenant.claudeAccess),
    {
      message: 'the built-in chat needs signIn and claudeAccess',
    },
  )
  .refine((tenant) => !tenant.actions.includes('apps') || tenant.portal !== undefined, {
    message: 'the apps action needs portal',
  })

export type Tenant = z.infer<typeof TenantSchema>

export function brandingOf(tenant: Tenant): Branding {
  const { companyName, appName, accentColor, actions, chatApp } = tenant
  const portalName = tenant.portal?.name ?? null
  return { companyName, appName, accentColor, actions, chatApp, portalName }
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
 * Dev runs only: a JSON file (path in DESKTOP_ASSIST_DEV_CONFIG) can override `chatApp`, `portal`,
 * `signIn` and `claudeAccess`, so the app can be pointed at a test identity provider without editing
 * tenant.json. Installed builds never read it.
 */
export const DevOverrideSchema = z.object({
  chatApp: z.enum(CHAT_APPS).optional(),
  portal: PortalSchema.partial().optional(),
  signIn: SignInSchema.partial().optional(),
  claudeAccess: ClaudeAccessSchema.partial().optional(),
})
