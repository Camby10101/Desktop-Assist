import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { brandingOf, DevOverrideSchema, missingSettings, TenantSchema } from '../src/main/tenant'

const tenantsDir = resolve(__dirname, '../../../tenants')
const tenantIds = readdirSync(tenantsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

describe('tenants', () => {
  it('has at least one tenant', () => {
    expect(tenantIds).toContain('morse-micro')
  })

  describe.each(tenantIds)('%s', (id) => {
    const dir = join(tenantsDir, id)

    it('has a valid tenant.json named after its folder', () => {
      const tenant = TenantSchema.parse(JSON.parse(readFileSync(join(dir, 'tenant.json'), 'utf8')))
      expect(tenant.id).toBe(id)
    })

    it('has a logo (logo.png or logo.svg)', () => {
      expect(existsSync(join(dir, 'logo.png')) || existsSync(join(dir, 'logo.svg'))).toBe(true)
    })
  })

  const signIn = { issuer: 'https://oauth.id.jumpcloud.com/', clientId: '', redirectPort: 47621 }
  const claudeAccess = { organizationId: '', federationRuleId: '', serviceAccountId: '' }

  it('rejects unknown or repeated actions', () => {
    const base = {
      id: 'x',
      companyName: 'X',
      appName: 'X',
      accentColor: '#000000',
      signIn,
      claudeAccess,
    }
    expect(TenantSchema.safeParse({ ...base, actions: ['teleport'] }).success).toBe(false)
    expect(TenantSchema.safeParse({ ...base, actions: ['close', 'close'] }).success).toBe(false)
    expect(TenantSchema.safeParse({ ...base, actions: ['close'] }).success).toBe(true)
  })

  it('chats in the panel unless told to use Claude Desktop, which needs no sign-in settings', () => {
    const base = {
      id: 'x',
      companyName: 'X',
      appName: 'X',
      accentColor: '#000000',
      actions: ['close'],
    }
    expect(TenantSchema.parse({ ...base, signIn, claudeAccess }).chatApp).toBe('built-in')
    expect(TenantSchema.safeParse(base).success).toBe(false)
    expect(TenantSchema.safeParse({ ...base, chatApp: 'built-in', signIn }).success).toBe(false)
    const desktop = TenantSchema.parse({ ...base, chatApp: 'claude-desktop' })
    expect(desktop.chatApp).toBe('claude-desktop')
    expect(desktop.signIn).toBeUndefined()
    expect(TenantSchema.safeParse({ ...base, chatApp: 'teams' }).success).toBe(false)
  })

  it('needs the portal settings for the Apps icon', () => {
    const base = { id: 'x', companyName: 'X', appName: 'X', accentColor: '#000000' }
    const desktop = { ...base, chatApp: 'claude-desktop', actions: ['apps', 'close'] }
    expect(TenantSchema.safeParse(desktop).success).toBe(false)
    const portal = {
      name: 'JumpCloud',
      url: 'https://console.jumpcloud.com/userconsole#/',
      appsServer: 'https://usermcp.jumpcloud.com/v1',
      redirectPort: 47622,
    }
    expect(TenantSchema.safeParse({ ...desktop, portal }).success).toBe(true)
    const httpPortal = { ...portal, url: 'http://console.jumpcloud.com/userconsole' }
    expect(TenantSchema.safeParse({ ...desktop, portal: httpPortal }).success).toBe(false)
  })

  it('can open on the apps list, with an icon to reach the text box', () => {
    const base = { id: 'x', companyName: 'X', appName: 'X', accentColor: '#000000' }
    const portal = {
      name: 'JumpCloud',
      url: 'https://console.jumpcloud.com/userconsole#/',
      appsServer: 'https://usermcp.jumpcloud.com/v1',
      redirectPort: 47622,
    }
    const tenant = { ...base, chatApp: 'claude-desktop', portal, startPage: 'apps' }
    expect(TenantSchema.parse({ ...tenant, actions: ['ask', 'close'] }).startPage).toBe('apps')
    // No way to reach the text box, or no portal to show:
    expect(TenantSchema.safeParse({ ...tenant, actions: ['close'] }).success).toBe(false)
    expect(TenantSchema.safeParse({ ...tenant, portal: undefined, actions: ['ask'] }).success).toBe(
      false,
    )
    expect(
      TenantSchema.parse({ ...base, chatApp: 'claude-desktop', actions: ['close'] }).startPage,
    ).toBe('ask')
  })

  it('needs the service desk address for its icon, and only an https one', () => {
    const base = { id: 'x', companyName: 'X', appName: 'X', accentColor: '#000000' }
    const tenant = { ...base, chatApp: 'claude-desktop', actions: ['servicedesk'] }
    expect(TenantSchema.safeParse(tenant).success).toBe(false)
    const serviceDesk = { url: 'https://morsemicro.atlassian.net/servicedesk/customer/portals' }
    expect(TenantSchema.safeParse({ ...tenant, serviceDesk }).success).toBe(true)
    const insecure = { url: 'http://example.com/desk' }
    expect(TenantSchema.safeParse({ ...tenant, serviceDesk: insecure }).success).toBe(false)
  })

  it('can list request types for raising IT requests from the panel', () => {
    const base = { id: 'x', companyName: 'X', appName: 'X', accentColor: '#000000' }
    const tenant = { ...base, chatApp: 'claude-desktop', actions: ['servicedesk'] }
    const url = 'https://morsemicro.atlassian.net/servicedesk/customer/portals'
    const requests = {
      portalId: '1',
      projectKey: 'ISD',
      requestTypes: [{ id: '1561', name: 'Other IT Issue' }],
    }
    const parsed = TenantSchema.parse({ ...tenant, serviceDesk: { url, requests } })
    expect(brandingOf(parsed).requestTypes).toEqual([{ id: '1561', name: 'Other IT Issue' }])
    const without = TenantSchema.parse({ ...tenant, serviceDesk: { url } })
    expect(brandingOf(without).requestTypes).toBeNull()
    // At least one type, with numeric IDs as in the portal's addresses:
    const none = { ...requests, requestTypes: [] }
    expect(
      TenantSchema.safeParse({ ...tenant, serviceDesk: { url, requests: none } }).success,
    ).toBe(false)
    const named = { ...requests, requestTypes: [{ id: 'other', name: 'Other' }] }
    expect(
      TenantSchema.safeParse({ ...tenant, serviceDesk: { url, requests: named } }).success,
    ).toBe(false)
  })

  it('needs the Atlassian site for the Jira icon, and fills in its MCP server', () => {
    const base = { id: 'x', companyName: 'X', appName: 'X', accentColor: '#000000' }
    const tenant = { ...base, chatApp: 'claude-desktop', actions: ['jira'] }
    expect(TenantSchema.safeParse(tenant).success).toBe(false)
    const atlassian = { site: 'https://morsemicro.atlassian.net', redirectPort: 47623 }
    const parsed = TenantSchema.parse({ ...tenant, atlassian })
    expect(parsed.atlassian).toEqual({
      ...atlassian,
      mcpServer: 'https://mcp.atlassian.com/v1/mcp',
      knowledgeSpaces: [],
    })
    expect(brandingOf(parsed).atlassianSite).toBe('https://morsemicro.atlassian.net')
    const insecure = { ...atlassian, site: 'http://morsemicro.atlassian.net' }
    expect(TenantSchema.safeParse({ ...tenant, atlassian: insecure }).success).toBe(false)
  })

  it('can offer updates from a GitHub repository, from GitHub itself by default', () => {
    const base = { id: 'x', companyName: 'X', appName: 'X', accentColor: '#000000' }
    const tenant = { ...base, chatApp: 'claude-desktop', actions: ['close'] }
    const publicKey = 'MCowBQYDK2VwAyEAVVUDKeMaBj3X+A0BV4uKVrM4XFieyOYA1DTzGw+2VcY='
    const updates = { repo: 'Camby10101/Desktop-Assist', publicKey }
    const parsed = TenantSchema.parse({ ...tenant, updates })
    expect(parsed.updates).toEqual({
      repo: 'Camby10101/Desktop-Assist',
      api: 'https://api.github.com',
      downloads: 'https://github.com',
      publicKey,
    })
    expect(brandingOf(parsed).updates).toBe(true)
    expect(brandingOf(TenantSchema.parse(tenant)).updates).toBe(false)
    const parses = (value: object) => TenantSchema.safeParse({ ...tenant, updates: value }).success
    expect(parses({ ...updates, repo: 'not a repo' })).toBe(false)
    // Updates are only taken signed with the release key, so its public half is required.
    expect(parses({ repo: 'Camby10101/Desktop-Assist' })).toBe(false)
    expect(parses({ ...updates, publicKey: 'not a key' })).toBe(false)
    expect(DevOverrideSchema.parse({ updates: { api: 'http://127.0.0.1:1' } }).updates).toEqual({
      api: 'http://127.0.0.1:1',
    })
  })

  it('lets a dev override change one Atlassian setting without resetting the others', () => {
    const override = DevOverrideSchema.parse({
      atlassian: { mcpServer: 'http://127.0.0.1:1/v1/mcp' },
    })
    expect(override.atlassian).toEqual({ mcpServer: 'http://127.0.0.1:1/v1/mcp' })
  })

  it('lists the sign-in settings still to fill in', () => {
    expect(missingSettings(signIn, claudeAccess)).toEqual([
      'signIn.clientId',
      'claudeAccess.organizationId',
      'claudeAccess.federationRuleId',
      'claudeAccess.serviceAccountId',
    ])
    expect(
      missingSettings(
        { ...signIn, clientId: 'abc' },
        { organizationId: 'o', federationRuleId: 'r', serviceAccountId: 's' },
      ),
    ).toEqual([])
  })
})
