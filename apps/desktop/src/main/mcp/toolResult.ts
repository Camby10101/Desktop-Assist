/** What an MCP tool call returns (the parts used here). */
export interface ToolResult {
  content?: unknown
  structuredContent?: unknown
  isError?: boolean
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

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
