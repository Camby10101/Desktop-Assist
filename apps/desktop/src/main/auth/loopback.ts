import { createServer, type Server } from 'node:http'

export const CALLBACK_PATH = '/callback'

/** Waiting for the browser to come back from the sign-in page. */
export interface RedirectListener {
  /** What JumpCloud must send the browser back to (registered in the JumpCloud app). */
  redirectUri: string
  /** The full URL the browser came back to, including `code` and `state`. */
  result: Promise<string>
  /** Stops waiting (cancel); `result` then rejects with SignInCancelledError. */
  close(): void
}

export class SignInCancelledError extends Error {
  constructor() {
    super('Sign-in was cancelled')
  }
}

export class SignInTimeoutError extends Error {
  constructor() {
    super('Sign-in took too long')
  }
}

/**
 * Starts a one-shot web server on 127.0.0.1 that catches the browser's redirect after sign-in
 * (the "loopback" method for desktop apps, RFC 8252). It only listens on the local machine,
 * answers the browser with a short page saying it can close the tab, and shuts down after the
 * first callback, a cancel, or the timeout.
 */
export function listenForRedirect(port: number, timeoutMs = 5 * 60_000): Promise<RedirectListener> {
  return new Promise((resolveListener, rejectListener) => {
    let settle: { resolve: (url: string) => void; reject: (error: Error) => void }
    const result = new Promise<string>((resolve, reject) => (settle = { resolve, reject }))
    result.catch(() => {}) // a rejection nobody awaited yet (cancel before the caller waits)

    let timer: ReturnType<typeof setTimeout> | undefined
    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
      if (req.method !== 'GET' || url.pathname !== CALLBACK_PATH) {
        res.writeHead(404).end()
        return
      }
      const error = url.searchParams.get('error_description') ?? url.searchParams.get('error')
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      })
      // Shut down only once the page has been sent.
      res.end(callbackPage(error), () => finish(() => settle.resolve(url.href)))
    })

    let done = false
    const finish = (then: () => void) => {
      if (done) return
      done = true
      clearTimeout(timer)
      server.close()
      server.closeAllConnections()
      then()
    }

    server.once('error', (error: NodeJS.ErrnoException) => {
      rejectListener(
        error.code === 'EADDRINUSE'
          ? new Error(`Port ${port} is in use by another program, so sign-in can't finish.`)
          : error,
      )
    })
    server.listen(port, '127.0.0.1', () => {
      timer = setTimeout(() => finish(() => settle.reject(new SignInTimeoutError())), timeoutMs)
      resolveListener({
        redirectUri: `http://127.0.0.1:${port}${CALLBACK_PATH}`,
        result,
        close: () => finish(() => settle.reject(new SignInCancelledError())),
      })
    })
  })
}

function callbackPage(error: string | null): string {
  const message = error
    ? `Sign-in didn't complete: ${escapeHtml(error)}`
    : 'You’re signed in to Desktop Assist. You can close this tab.'
  return `<!doctype html><html><head><meta charset="utf-8"><title>Desktop Assist</title>
<style>body{font-family:'Segoe UI',system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#18181b}
p{font-size:16px}</style></head><body><p>${message}</p><script>setTimeout(()=>window.close(),1500)</script></body></html>`
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
