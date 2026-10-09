import type { PortalApp } from './types'

/**
 * The apps in the order the Apps list shows them: the starred ones first, then the rest, each
 * keeping the order they came in (by name).
 */
export function orderApps(apps: PortalApp[], favorites: string[]): PortalApp[] {
  const starred = new Set(favorites)
  return [
    ...apps.filter((app) => starred.has(app.id)),
    ...apps.filter((app) => !starred.has(app.id)),
  ]
}
