import { z } from 'zod'
import { ACTION_IDS } from '@shared/actions'
import type { Branding } from '@shared/types'

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
})

export type Tenant = z.infer<typeof TenantSchema>

export function brandingOf(tenant: Tenant): Branding {
  const { companyName, appName, accentColor, actions } = tenant
  return { companyName, appName, accentColor, actions }
}
