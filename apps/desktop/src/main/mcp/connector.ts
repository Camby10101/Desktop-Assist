import { auth, UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { NeedsSignInError, type McpConnector } from './McpAccount'

export type Fetch = (url: string | URL, init?: RequestInit) => Promise<Response>

/**
 * The real connection to an MCP server (JumpCloud's MCP Server for Users, Atlassian's Remote MCP
 * server), through the official MCP SDK: its Streamable HTTP transport, and its OAuth (discovery,
 * client registration, PKCE, token renewal). `fetch` is Electron's, so company proxies set in
 * Windows are used.
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
