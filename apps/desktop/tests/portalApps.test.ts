import { describe, expect, it, vi } from 'vitest'
import type { AppsState } from '@shared/types'
import { SignInCancelledError, type RedirectListener } from '../src/main/auth/loopback'
import { fetchLogo } from '../src/main/apps/mcp'
import {
  findLaunchUrl,
  httpsUrl,
  idArgumentName,
  parseAppList,
  payloadOf,
} from '../src/main/apps/portalData'
import {
  NeedsSignInError,
  PortalApps,
  SavedAuth,
  type McpConnector,
  type McpSession,
} from '../src/main/apps/PortalApps'

const json = (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] })

describe('reading the apps list', () => {
  it('reads JumpCloud-style applications, sorted by name, skipping hidden ones', () => {
    const apps = parseAppList(
      json({
        applications: [
          { _id: 'b', displayLabel: 'Slack', logo: { url: 'https://cdn.example/slack.png' } },
          { id: 'a', name: 'atlassian', displayName: 'Atlassian', ssoUrl: 'https://sso.example/a' },
          { _id: 'c', displayLabel: 'Hidden', sso: { hidden: true } },
          { _id: 'd' }, // no name: skipped
        ],
      }),
    )
    expect(apps).toEqual([
      { id: 'a', name: 'Atlassian', logoUrl: null, launchUrl: 'https://sso.example/a' },
      { id: 'b', name: 'Slack', logoUrl: 'https://cdn.example/slack.png', launchUrl: null },
    ])
  })

  it('takes a bare list, or structured content, too', () => {
    expect(parseAppList(json([{ id: 'x', name: 'X' }]))?.map((a) => a.name)).toEqual(['X'])
    expect(
      parseAppList({ structuredContent: { results: [{ id: 'y', label: 'Y' }] } }),
    ).toHaveLength(1)
  })

  it('says null when there is no list at all, but [] when the list is empty', () => {
    expect(parseAppList(json({ message: 'hello' }))).toBeNull()
    expect(parseAppList(json({ applications: [] }))).toEqual([])
    expect(payloadOf({ content: [{ type: 'text', text: 'not json' }] })).toBe('not json')
  })

  it('never takes a link that is not https', () => {
    expect(httpsUrl('javascript:alert(1)')).toBeNull()
    expect(httpsUrl('file:///C:/Windows')).toBeNull()
    expect(httpsUrl('http://sso.example/a')).toBeNull()
    expect(httpsUrl('https://sso.example/a')).toBe('https://sso.example/a')
    const apps = parseAppList(json([{ id: 'x', name: 'X', ssoUrl: 'javascript:alert(1)' }]))
    expect(apps?.[0]?.launchUrl).toBeNull()
  })

  it("finds the launch tool's ID argument from its schema", () => {
    const schema = (props: string[], required: string[] = []) => ({
      type: 'object',
      properties: Object.fromEntries(props.map((p) => [p, { type: 'string' }])),
      required,
    })
    expect(idArgumentName(schema(['applicationId'], ['applicationId']))).toBe('applicationId')
    expect(idArgumentName(schema(['application_id', 'mode']))).toBe('application_id')
    expect(idArgumentName(schema(['appRef', 'objectId'], ['objectId']))).toBe('objectId')
    expect(idArgumentName(undefined)).toBe('id')
  })

  it('finds the sign-in link in a launch answer', () => {
    expect(findLaunchUrl(json({ launchUrl: 'https://sso.example/launch' }))).toBe(
      'https://sso.example/launch',
    )
    expect(findLaunchUrl(json({ data: { url: 'https://sso.example/nested' } }))).toBe(
      'https://sso.example/nested',
    )
    expect(
      findLaunchUrl({
        content: [{ type: 'text', text: 'Open https://sso.example/x to continue.' }],
      }),
    ).toBe('https://sso.example/x')
    expect(findLaunchUrl(json({ url: 'javascript:alert(1)' }))).toBeNull()
  })
})

describe('fetchLogo', () => {
  const response = (body: string, type: string, ok = true) =>
    Promise.resolve(
      new Response(body, { status: ok ? 200 : 404, headers: { 'content-type': type } }),
    )

  it('turns an https image into a data: URL', async () => {
    const fetch = vi.fn(() => response('PNG', 'image/png'))
    expect(await fetchLogo(fetch, 'https://cdn.example/a.png')).toBe('data:image/png;base64,UE5H')
  })

  it('refuses http, non-images, failures and anything too big', async () => {
    expect(await fetchLogo(() => response('x', 'image/png'), 'http://cdn.example/a.png')).toBeNull()
    expect(await fetchLogo(() => response('<html>', 'text/html'), 'https://x/a')).toBeNull()
    expect(await fetchLogo(() => response('x', 'image/png', false), 'https://x/a')).toBeNull()
    const big = 'x'.repeat(300_001)
    expect(await fetchLogo(() => response(big, 'image/png'), 'https://x/a')).toBeNull()
  })
})

/**
 * A portal with two apps and a launch tool; `signedIn` decides whether connecting works. With
 * `forgeState`, the "browser" comes back with a state this app didn't send.
 */
function fakePortal(options: { forgeState?: boolean } = {}) {
  const world = {
    signedIn: false,
    registered: false,
    calls: [] as string[],
    browser: [] as string[],
    saved: null as string | null,
    states: [] as AppsState['status'][],
  }
  const session: McpSession = {
    listTools: async () => [
      { name: 'list_applications' },
      {
        name: 'launch_application',
        inputSchema: { properties: { applicationId: {} }, required: ['applicationId'] },
      },
    ],
    callTool: async (name, args) => {
      world.calls.push(`${name} ${JSON.stringify(args)}`)
      if (name === 'list_applications') {
        return json({
          applications: [
            { id: '2', name: 'Slack', logo: { url: 'https://cdn.example/slack.png' } },
            { id: '1', name: 'Atlassian' },
          ],
        })
      }
      return json({ url: `https://sso.example/launch/${String(args['applicationId'])}` })
    },
    close: async () => {},
  }
  const connector: McpConnector = {
    connect: async () => {
      if (!world.signedIn) throw new NeedsSignInError()
      return session
    },
    authorize: async (provider, code) => {
      if (!code) {
        if (!world.registered) {
          world.registered = true
          await provider.saveClientInformation?.({ client_id: 'registered-client' })
        }
        const state = await provider.state?.()
        await provider.redirectToAuthorization(
          new URL(`https://as.example/authorize?state=${state}`),
        )
        return 'REDIRECT'
      }
      await provider.saveTokens({ access_token: 'secret-token', token_type: 'bearer' })
      world.signedIn = true
      return 'AUTHORIZED'
    },
  }
  let backTo: (url: string) => void = () => {}
  const listener = (): RedirectListener => {
    let resolve: (url: string) => void = () => {}
    let reject: (error: Error) => void = () => {}
    const result = new Promise<string>((res, rej) => ((resolve = res), (reject = rej)))
    result.catch(() => {})
    backTo = resolve
    return {
      redirectUri: 'http://127.0.0.1:47622/callback',
      result,
      close: () => reject(new SignInCancelledError()),
    }
  }
  const portal = new PortalApps({
    appName: 'Desktop Assist',
    redirectPort: 47622,
    connector,
    store: {
      load: async () => world.saved,
      save: async (secret) => void (world.saved = secret),
      clear: async () => void (world.saved = null),
    },
    listen: async () => listener(),
    openBrowser: async (url) => {
      world.browser.push(url)
      const state = options.forgeState ? 'forged' : new URL(url).searchParams.get('state')
      // The "browser": the user signs in and JumpCloud sends them back with a code.
      if (url.startsWith('https://as.example/')) {
        setTimeout(() => backTo(`http://127.0.0.1:47622/callback?code=abc&state=${state}`), 0)
      }
    },
    fetchLogo: async (url) => (url.includes('slack') ? 'data:image/png;base64,AAAA' : null),
    onState: (state) => world.states.push(state.status),
  })
  return { portal, world, backTo: (url: string) => backTo(url) }
}

describe('PortalApps', () => {
  it('asks to sign in when nobody has connected yet, without opening the browser', async () => {
    const { portal, world } = fakePortal()
    expect(await portal.get()).toEqual({ status: 'sign-in' })
    expect(world.browser).toEqual([])
  })

  it('signs in through the browser, saves the connection, then lists the apps with logos', async () => {
    const { portal, world } = fakePortal()
    await portal.get()
    await portal.signIn()
    expect(world.browser[0]).toMatch(/^https:\/\/as\.example\/authorize\?state=/)
    expect(world.states).toEqual(['loading', 'sign-in', 'signing-in', 'loading', 'ready'])
    expect(portal.current).toEqual({
      status: 'ready',
      apps: [
        { id: '1', name: 'Atlassian', logo: null },
        { id: '2', name: 'Slack', logo: 'data:image/png;base64,AAAA' },
      ],
    })
    expect(JSON.parse(world.saved!)).toEqual({
      client: { client_id: 'registered-client' },
      tokens: { access_token: 'secret-token', token_type: 'bearer' },
    })
  })

  it('remembers the list until asked to refresh', async () => {
    const { portal, world } = fakePortal()
    world.signedIn = true
    await portal.get()
    await portal.get()
    expect(world.calls).toEqual(['list_applications {}'])
    await portal.get(true)
    expect(world.calls).toHaveLength(2)
  })

  it('opens an app through its launch link', async () => {
    const { portal, world } = fakePortal()
    world.signedIn = true
    await portal.get()
    expect(await portal.open('2')).toBe(true)
    expect(world.calls.at(-1)).toBe('launch_application {"applicationId":"2"}')
    expect(world.browser).toEqual(['https://sso.example/launch/2'])
    expect(await portal.open('nope')).toBe(false)
  })

  it('refuses a sign-in that comes back with a state it did not send', async () => {
    const { portal, world } = fakePortal({ forgeState: true })
    await portal.signIn()
    expect(portal.current).toEqual({
      status: 'sign-in',
      message: "Signing in didn't work: The sign-in didn't come from this app",
    })
    expect(world.signedIn).toBe(false)
    expect(JSON.parse(world.saved!).tokens).toBeUndefined()
  })

  it('goes back to the sign-in button when the user cancels', async () => {
    const { portal } = fakePortal()
    const internals = portal as unknown as { deps: { openBrowser: (url: string) => Promise<void> } }
    internals.deps.openBrowser = async () => {} // the user never finishes in the browser
    const signingIn = portal.signIn()
    await vi.waitFor(() => expect(portal.current.status).toBe('signing-in'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    portal.cancelSignIn()
    await signingIn
    expect(portal.current).toEqual({ status: 'sign-in' })
  })
})

describe('SavedAuth', () => {
  it('is a public client with a loopback redirect, and only keeps what it was given', async () => {
    let saved: string | null = null
    const store = {
      load: async () => saved,
      save: async (s: string) => void (saved = s),
      clear: async () => void (saved = null),
    }
    const auth = new SavedAuth('Desktop Assist', 47622, store)
    await auth.load()
    expect(auth.clientMetadata).toMatchObject({
      redirect_uris: ['http://127.0.0.1:47622/callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
    })
    expect(auth.tokens()).toBeUndefined()
    await auth.saveTokens({ access_token: 't', token_type: 'bearer' })
    const again = new SavedAuth('Desktop Assist', 47622, store)
    await again.load()
    expect(again.tokens()?.access_token).toBe('t')
    await again.invalidateCredentials('all')
    expect(saved).toBeNull()
    const state = auth.state()
    expect(auth.isExpectedState(state)).toBe(true)
    expect(auth.isExpectedState('forged')).toBe(false)
    expect(auth.isExpectedState(null)).toBe(false)
  })
})
