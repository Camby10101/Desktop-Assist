import { auth, UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { NeedsSignInError, type McpConnector } from './PortalApps'

type Fetch = (url: string | URL, init?: RequestInit) => Promise<Response>

/**
 * The real connection to JumpCloud's MCP Server for Users, through the official MCP SDK: its
 * Streamable HTTP transport, and its OAuth (discovery, client registration, PKCE, token renewal).
 * `fetch` is Electron's, so company proxies set in Windows are used.
 */
export function mcpConnector(options: {
  serverUrl: string
  client: { name: string; version: string }
  fetch: Fetch
}): McpConnector {
  const { serverUrl, fetch } = options
  return {
    async connect(provider) {
      const client = new Client(options.client)
      const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
        authProvider: provider,
        fetch,
      })
      try {
        await client.connect(transport)
      } catch (error) {
        await client.close().catch(() => {})
        if (error instanceof UnauthorizedError) throw new NeedsSignInError()
        throw error
      }
      return {
        listTools: async () => (await client.listTools()).tools,
        callTool: async (name, args) => {
          const result: Record<string, unknown> = await client.callTool({ name, arguments: args })
          return {
            content: result['content'],
            // Servers on an older protocol answer with `toolResult` instead.
            structuredContent: result['structuredContent'] ?? result['toolResult'],
            isError: result['isError'] === true,
          }
        },
        close: () => client.close(),
      }
    },
    authorize: (provider, code) =>
      auth(provider, { serverUrl, authorizationCode: code, fetchFn: fetch }),
  }
}

/** Largest logo fetched for the Apps list. */
const MAX_LOGO_BYTES = 300_000

/**
 * What kind of image a file is, from its first bytes; null if it isn't one. Needed because servers
 * don't always say: JumpCloud serves the logos a company uploads itself as
 * application/octet-stream, while its own catalogue logos come as image/png.
 */
export function sniffImageType(data: Buffer): string | null {
  const startsWith = (...bytes: number[]) => bytes.every((byte, i) => data[i] === byte)
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return 'image/gif'
  if (startsWith(0x52, 0x49, 0x46, 0x46) && data.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  if (startsWith(0x00, 0x00, 0x01, 0x00)) return 'image/x-icon'
  if (startsWith(0x42, 0x4d)) return 'image/bmp'
  const start = data.toString('utf8', 0, 1024).trimStart().toLowerCase()
  if (start.startsWith('<svg') || (start.startsWith('<?xml') && start.includes('<svg'))) {
    return 'image/svg+xml'
  }
  return null
}

/** Fetches an app's logo (https only, an image, not too big) as a data: URL for the panel. */
export async function fetchLogo(fetch: Fetch, url: string): Promise<string | null> {
  if (!url.startsWith('https://')) return null
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) return null
  const data = Buffer.from(await response.arrayBuffer())
  if (data.length === 0 || data.length > MAX_LOGO_BYTES) return null
  // Trust the file's own bytes over the server's label: a label of image/* on something that
  // isn't one, or a missing label on a real image, are both common.
  const type = sniffImageType(data)
  return type ? `data:${type};base64,${data.toString('base64')}` : null
}
