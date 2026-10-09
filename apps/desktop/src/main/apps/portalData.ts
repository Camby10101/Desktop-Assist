// Reading JumpCloud's answers. The MCP Server for Users documents its tools but not the exact
// fields they return, so these readers look for the usual names and ignore what they don't know.

/** An app from the portal, before its logo is fetched. */
export interface PortalAppInfo {
  id: string
  name: string
  logoUrl: string | null
  /** The sign-in link the list itself gave, if any (launch_application is asked first). */
  launchUrl: string | null
}

/** What an MCP tool call returns (the parts used here). */
export interface ToolResult {
  content?: unknown
  structuredContent?: unknown
  isError?: boolean
}

type Item = Record<string, unknown>

const LIST_KEYS = ['applications', 'apps', 'items', 'results', 'data', 'records']
const URL_KEYS = ['launchUrl', 'launch_url', 'url', 'ssoUrl', 'sso_url', 'redirectUrl', 'location']

const isObject = (value: unknown): value is Item =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

/** Only web addresses are ever opened from the list (never file:, javascript: and so on). */
export function httpsUrl(value: unknown): string | null {
  const candidate = text(value)
  if (!candidate) return null
  try {
    return new URL(candidate).protocol === 'https:' ? candidate : null
  } catch {
    return null
  }
}

/** The tool's answer as data: its structured content, or the JSON in its first text block. */
export function payloadOf(result: ToolResult): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent
  const blocks = Array.isArray(result.content) ? result.content : []
  for (const block of blocks) {
    if (isObject(block) && block['type'] === 'text' && typeof block['text'] === 'string') {
      try {
        return JSON.parse(block['text'])
      } catch {
        return block['text']
      }
    }
  }
  return undefined
}

/** The list inside the answer: the answer itself, or an array under a usual key. */
function findList(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  if (!isObject(value)) return null
  for (const key of LIST_KEYS) {
    const found = findList(value[key])
    if (found) return found
  }
  return Object.values(value).find((v) => Array.isArray(v) && v.some(isObject)) as unknown[] | null
}

function appFrom(item: unknown): PortalAppInfo | null {
  if (!isObject(item)) return null
  const sso = isObject(item['sso']) ? item['sso'] : {}
  if (sso['hidden'] === true || item['hidden'] === true) return null // "Show in User Portal" off
  const logo = item['logo']
  const id = text(item['id']) ?? text(item['_id']) ?? text(item['applicationId'])
  const name =
    text(item['displayLabel']) ??
    text(item['displayName']) ??
    text(item['display_name']) ??
    text(item['name']) ??
    text(item['label'])
  if (!id || !name) return null
  const bookmark = isObject(sso['bookmark']) ? sso['bookmark'] : {}
  return {
    id,
    name,
    logoUrl:
      (isObject(logo) ? httpsUrl(logo['url']) : httpsUrl(logo)) ??
      httpsUrl(item['logoUrl']) ??
      httpsUrl(item['logo_url']) ??
      httpsUrl(item['icon']),
    launchUrl:
      httpsUrl(item['ssoUrl']) ??
      httpsUrl(item['launchUrl']) ??
      httpsUrl(sso['url']) ??
      httpsUrl(bookmark['url']) ??
      httpsUrl(item['url']),
  }
}

/** The apps in a list_applications answer, by name; null if it holds no list at all. */
export function parseAppList(result: ToolResult): PortalAppInfo[] | null {
  const list = findList(payloadOf(result))
  if (!list) return null
  const apps = list.map(appFrom).filter((app): app is PortalAppInfo => app !== null)
  const unique = [...new Map(apps.map((app) => [app.id, app])).values()]
  return unique.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

/** The field names in the answer's first item, for the log when no apps could be read. */
export function describeShape(result: ToolResult): string {
  const payload = payloadOf(result)
  const list = findList(payload)
  const first = list?.find(isObject)
  if (first) return `items with fields ${Object.keys(first).join(', ')}`
  if (isObject(payload)) return `an object with fields ${Object.keys(payload).join(', ')}`
  return typeof payload
}

/** Which argument of a tool takes the app's ID (from its input schema). */
export function idArgumentName(inputSchema: unknown): string {
  const properties = isObject(inputSchema) && isObject(inputSchema['properties'])
  const names = properties ? Object.keys(inputSchema['properties'] as Item) : []
  const required =
    isObject(inputSchema) && Array.isArray(inputSchema['required'])
      ? (inputSchema['required'] as unknown[]).filter((n): n is string => typeof n === 'string')
      : []
  const looksLikeId = (n: string) => /^(application_?id|app_?id|id)$/i.test(n)
  return (
    required.find(looksLikeId) ??
    names.find(looksLikeId) ??
    required.find((n) => /id$/i.test(n)) ??
    names.find((n) => /id$/i.test(n)) ??
    'id'
  )
}

/** The sign-in link in a launch_application answer: a URL field, or the first web address in it. */
export function findLaunchUrl(result: ToolResult): string | null {
  const payload = payloadOf(result)
  const search = (value: unknown, depth: number): string | null => {
    if (depth > 4) return null
    if (typeof value === 'string') return httpsUrl(value)
    if (Array.isArray(value)) {
      for (const v of value) {
        const found = search(v, depth + 1)
        if (found) return found
      }
      return null
    }
    if (!isObject(value)) return null
    for (const key of URL_KEYS) {
      const found = httpsUrl(value[key])
      if (found) return found
    }
    for (const v of Object.values(value)) {
      const found = search(v, depth + 1)
      if (found) return found
    }
    return null
  }
  const found = search(payload, 0)
  if (found) return found
  const blocks = Array.isArray(result.content) ? result.content : []
  for (const block of blocks) {
    if (isObject(block) && typeof block['text'] === 'string') {
      const match = /https:\/\/[^\s"'<>)]+/.exec(block['text'])
      if (match) return httpsUrl(match[0])
    }
  }
  return null
}
