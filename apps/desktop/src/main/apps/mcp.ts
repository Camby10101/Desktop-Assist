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

/** Fetches an app's logo (https only, an image, not too big) as a data: URL for the panel. */
export async function fetchLogo(fetch: Fetch, url: string): Promise<string | null> {
  if (!url.startsWith('https://')) return null
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
  const type = response.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
  if (!response.ok || !type.startsWith('image/')) return null
  const data = Buffer.from(await response.arrayBuffer())
  if (data.length > MAX_LOGO_BYTES) return null
  return `data:${type};base64,${data.toString('base64')}`
}
