import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TenantSchema } from '../src/main/tenant'

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

  it('rejects unknown or repeated actions', () => {
    const base = { id: 'x', companyName: 'X', appName: 'X', accentColor: '#000000' }
    expect(TenantSchema.safeParse({ ...base, actions: ['teleport'] }).success).toBe(false)
    expect(TenantSchema.safeParse({ ...base, actions: ['close', 'close'] }).success).toBe(false)
    expect(TenantSchema.safeParse({ ...base, actions: ['close'] }).success).toBe(true)
  })
})
