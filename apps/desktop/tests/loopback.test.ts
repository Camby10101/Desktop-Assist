import { createServer } from 'node:net'
import { describe, expect, it } from 'vitest'
import {
  listenForRedirect,
  SignInCancelledError,
  SignInTimeoutError,
} from '../src/main/auth/loopback'

/** A port nothing is listening on. */
function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() => resolve(typeof address === 'object' && address ? address.port : 0))
    })
  })
}

describe('listenForRedirect', () => {
  it('catches the browser coming back, answers it, then stops listening', async () => {
    const port = await freePort()
    const listener = await listenForRedirect(port)
    expect(listener.redirectUri).toBe(`http://127.0.0.1:${port}/callback`)

    const page = await fetch(`${listener.redirectUri}?code=abc&state=xyz`)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('signed in')
    expect(await listener.result).toBe(`http://127.0.0.1:${port}/callback?code=abc&state=xyz`)

    await expect(fetch(listener.redirectUri)).rejects.toThrow() // closed
  })

  it('ignores other paths', async () => {
    const listener = await listenForRedirect(await freePort())
    const other = await fetch(listener.redirectUri.replace('/callback', '/favicon.ico'))
    expect(other.status).toBe(404)
    listener.close()
  })

  it('shows the error JumpCloud sent back, safely', async () => {
    const listener = await listenForRedirect(await freePort())
    const page = await fetch(
      `${listener.redirectUri}?error=access_denied&error_description=${encodeURIComponent('<b>No</b>')}`,
    )
    const html = await page.text()
    expect(html).toContain('&#60;b&#62;No&#60;/b&#62;')
    expect(html).not.toContain('<b>No</b>')
    // The app still gets the URL, so openid-client can report the error.
    expect(await listener.result).toContain('error=access_denied')
  })

  it('rejects when cancelled', async () => {
    const listener = await listenForRedirect(await freePort())
    listener.close()
    await expect(listener.result).rejects.toBeInstanceOf(SignInCancelledError)
  })

  it('gives up after the timeout', async () => {
    const listener = await listenForRedirect(await freePort(), 20)
    await expect(listener.result).rejects.toBeInstanceOf(SignInTimeoutError)
  })

  it('explains when the port is taken', async () => {
    const port = await freePort()
    const first = await listenForRedirect(port)
    await expect(listenForRedirect(port)).rejects.toThrow(/in use/)
    first.close()
  })
})
