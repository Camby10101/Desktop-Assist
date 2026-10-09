import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { missingSettings, TenantSchema } from '../src/main/tenant'

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
