import { z } from 'zod'
import { ACTION_IDS } from '@shared/actions'
import type { Branding, ChatApp, StartPage } from '@shared/types'

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

/**
 * The company's IT service desk, opened by the `servicedesk` icon. With `requests`, the icon opens
 * a page for raising requests (filled in on the panel, finished on the help centre portal) and, with
 * `atlassian` too, for following the user's own requests.
 */
export const ServiceDeskSchema = z.object({
  /** The help centre (all portals). */
  url: z.url({ protocol: /^https$/ }),
  requests: z
    .object({
      /** The IT portal's number, from its address: …/servicedesk/customer/portal/<id>. */
      portalId: z.string().regex(/^\d+$/),
      /** The Jira project behind the portal, for My requests. */
      projectKey: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
      /**
       * The request types offered, the first one for "Report a problem". Each ID is the number at
       * the end of the type's form address: …/portal/<portalId>/create/<id>.
       */
      requestTypes: z
        .array(z.object({ id: z.string().regex(/^\d+$/), name: z.string().min(1) }))
        .min(1),
    })
    .optional(),
})

export type ServiceDeskConfig = z.infer<typeof ServiceDeskSchema>

/**
 * The company's Atlassian site, for the Jira page (notifications, search, issues) and My requests.
 * Each user connects once, in the browser, through Atlassian's Remote MCP server (no secret in the
 * app); at Morse Micro that sign-in goes through JumpCloud.
 */
const AtlassianFields = z.object({
  /** The site, e.g. https://morsemicro.atlassian.net. */
  site: z.url({ protocol: /^https$/ }),
  mcpServer: z.url({ protocol: /^https?$/ }),
  /** The browser comes back to http://127.0.0.1:<port>/callback after connecting. */
  redirectPort: z.number().int().min(1024).max(65535),
  /** Confluence spaces (their keys) searched for how-to articles while raising an IT request. */
  knowledgeSpaces: z.array(z.string().regex(/^[A-Za-z0-9~_]+$/)),
})

export const AtlassianSchema = AtlassianFields.extend({
  mcpServer: AtlassianFields.shape.mcpServer.default('https://mcp.atlassian.com/v1/mcp'),
  knowledgeSpaces: AtlassianFields.shape.knowledgeSpaces.default([]),
})

export type AtlassianConfig = z.infer<typeof AtlassianSchema>

/**
 * Updating from Settings: the GitHub repository whose releases carry the installer. Releases are
 * read from GitHub's public API, so the repository must be public; no token is needed.
 */
const UpdatesFields = z.object({
  /** "owner/name". */
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  /** GitHub's API. */
  api: z.url({ protocol: /^https?$/ }),
  /** Where release files come from: <downloads>/<repo>/releases/download/…; nothing else is. */
  downloads: z.url({ protocol: /^https?$/ }),
  /**
   * The release key's public half, from `npm run release:key`: an Ed25519 key, base64. Only
   * installers signed with its private half are run (see docs/RELEASING.md).
   */
  publicKey: z.string().regex(/^MCowBQYDK2VwAyEA[A-Za-z0-9+/]{43}=$/, 'an Ed25519 public key'),
})

export const UpdatesSchema = UpdatesFields.extend({
  api: UpdatesFields.shape.api.default('https://api.github.com'),
  downloads: UpdatesFields.shape.downloads.default('https://github.com'),
})

export type UpdatesConfig = z.infer<typeof UpdatesSchema>

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

/**
 * What the panel opens on: the text box for asking Claude (`ask`), or the Apps list (`apps`). The
 * other one is behind its icon (`ask` or `apps` in `actions`).
 */
export const START_PAGES = ['ask', 'apps'] as const satisfies StartPage[]

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
    startPage: z.enum(START_PAGES).default('ask'),
    /** Extra instructions for Claude, added to the built-in chat's system prompt. */
    systemPrompt: z.string().max(8000).optional(),
    /** Needed for the Apps action. */
    portal: PortalSchema.optional(),
    /** Needed for the service desk icon. */
    serviceDesk: ServiceDeskSchema.optional(),
    /** Needed for the Jira icon. */
    atlassian: AtlassianSchema.optional(),
    /** Offers Check for updates in Settings. */
    updates: UpdatesSchema.optional(),
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
  .refine((tenant) => !tenant.actions.includes('servicedesk') || tenant.serviceDesk !== undefined, {
    message: 'the servicedesk action needs serviceDesk',
  })
  .refine((tenant) => !tenant.actions.includes('jira') || tenant.atlassian !== undefined, {
    message: 'the jira action needs atlassian',
  })
  .refine((tenant) => tenant.startPage !== 'apps' || tenant.portal !== undefined, {
    message: 'starting on the apps list needs portal',
  })
  .refine((tenant) => tenant.startPage !== 'apps' || tenant.actions.includes('ask'), {
    message: 'starting on the apps list needs the ask action, to reach the text box',
  })

export type Tenant = z.infer<typeof TenantSchema>

export function brandingOf(tenant: Tenant): Branding {
  const { companyName, appName, accentColor, actions, chatApp } = tenant
  const portalName = tenant.portal?.name ?? null
  const { startPage } = tenant
  return {
    companyName,
    appName,
    accentColor,
    actions,
    chatApp,
    portalName,
    startPage,
    atlassianSite: tenant.atlassian?.site ?? null,
    requestTypes: tenant.serviceDesk?.requests?.requestTypes ?? null,
    updates: tenant.updates !== undefined,
  }
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
 * Dev runs only: a JSON file (path in DESKTOP_ASSIST_DEV_CONFIG) can override `chatApp`,
 * `startPage`, `portal`, `atlassian`, `updates`, `signIn` and `claudeAccess`, so the app can be
 * pointed at test servers without editing tenant.json. Installed builds never read it.
 */
export const DevOverrideSchema = z.object({
  chatApp: z.enum(CHAT_APPS).optional(),
  startPage: z.enum(START_PAGES).optional(),
  portal: PortalSchema.partial().optional(),
  // Without the defaults, so a partial override can't reset what tenant.json sets.
  atlassian: AtlassianFields.partial().optional(),
  updates: UpdatesFields.partial().optional(),
  signIn: SignInSchema.partial().optional(),
  claudeAccess: ClaudeAccessSchema.partial().optional(),
})
