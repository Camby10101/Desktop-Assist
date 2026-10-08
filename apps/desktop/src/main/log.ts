import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname } from 'node:path'

/** When the log passes this size it's moved to `<name>.old` and a new one is started. */
const MAX_LOG_BYTES = 1_000_000

export type Log = (message: string, detail?: unknown) => void

/**
 * A small log file for problems (and the terminal, in dev runs), so an installed copy, which has
 * no terminal, can still be diagnosed. Never pass it tokens: only errors and summaries.
 */
export function createLog(path: string): Log {
  return (message, detail) => {
    const line = `${new Date().toISOString()} ${message}${detail === undefined ? '' : ` ${describe(detail)}`}`
    console.error(line)
    try {
      mkdirSync(dirname(path), { recursive: true })
      if (sizeOf(path) > MAX_LOG_BYTES) renameSync(path, `${path}.old`)
      appendFileSync(path, `${line}\n`)
    } catch {
      // Logging must never break the app.
    }
  }
}

function sizeOf(path: string): number {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

/** An error with the details that matter (status, request ID, response body, cause), or JSON. */
export function describe(detail: unknown): string {
  if (detail instanceof Error) {
    const extra = detail as Error & {
      status?: unknown
      statusCode?: unknown
      requestID?: unknown
      requestId?: unknown
      body?: unknown
      error?: unknown
    }
    const fields = {
      status: extra.status ?? extra.statusCode,
      requestId: extra.requestID ?? extra.requestId,
      // A refused sign-in swap keeps Anthropic's answer in `body`; other API errors in `error`.
      body: extra.body ?? extra.error,
    }
    const known = Object.entries(fields).filter(([, value]) => value != null)
    const parts = [`${detail.name}: ${detail.message}`]
    if (known.length) parts.push(JSON.stringify(Object.fromEntries(known)))
    if (detail.cause !== undefined) parts.push(`(cause: ${describe(detail.cause)})`)
    return parts.join(' ')
  }
  try {
    return JSON.stringify(detail)
  } catch {
    return String(detail)
  }
}
