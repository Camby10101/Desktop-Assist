import { describe, expect, it } from 'vitest'
import type { Attachment, NewRequest } from '@shared/types'
import {
  MAX_LINK_DESCRIPTION,
  myRequestsUrl,
  pcDetails,
  requestDescription,
  requestFormUrl,
  ServiceDesk,
  windowsVersion,
} from '../src/main/serviceDesk'

const HELP_CENTRE = 'https://example.atlassian.net/servicedesk/customer/portals'
const PC = {
  computerName: 'MM-LT-042',
  windows: 'Windows 11 Pro (10.0.26200)',
  appName: 'Desktop Assist',
  appVersion: '0.1.0',
}

describe('service desk links', () => {
  it("fills in the portal's form for a request type", () => {
    expect(
      requestFormUrl({
        helpCentre: HELP_CENTRE,
        portalId: '1',
        requestTypeId: '1561',
        summary: ' Outlook keeps crashing ',
        description: 'Since this morning & every hour\nPC: X',
      }),
    ).toBe(
      'https://example.atlassian.net/servicedesk/customer/portal/1/create/1561' +
        '?summary=Outlook%20keeps%20crashing&description=Since%20this%20morning%20%26%20every%20hour%0APC%3A%20X',
    )
    expect(
      requestFormUrl({
        helpCentre: HELP_CENTRE,
        portalId: '1',
        requestTypeId: '9',
        summary: '',
        description: '',
      }),
    ).toBe('https://example.atlassian.net/servicedesk/customer/portal/1/create/9')
    expect(myRequestsUrl(HELP_CENTRE)).toBe(
      'https://example.atlassian.net/servicedesk/customer/user/requests',
    )
  })

  it('adds the PC details under the description, and keeps the link a sensible length', () => {
    expect(requestDescription('It broke', pcDetails(PC))).toBe(
      'It broke\n\n---\nPC: MM-LT-042\nWindows: Windows 11 Pro (10.0.26200)\nDesktop Assist: 0.1.0',
    )
    expect(requestDescription('  ', null)).toBe('')
    const long = requestDescription('x'.repeat(5000), null)
    expect(long.length).toBeLessThanOrEqual(MAX_LINK_DESCRIPTION)
    expect(long.endsWith('… (shortened)')).toBe(true)
  })

  it('calls Windows 11 by its name', () => {
    expect(windowsVersion('Windows 10 Pro', '10.0.26200')).toBe('Windows 11 Pro (10.0.26200)')
    expect(windowsVersion('Windows 10 Enterprise', '10.0.19045')).toBe(
      'Windows 10 Enterprise (10.0.19045)',
    )
  })
})

describe('ServiceDesk', () => {
  const screenshot: Attachment = {
    id: 'a',
    path: 'C:/shots/one.png',
    fileName: 'one.png',
    addedAt: '2026-10-12T00:00:00Z',
  }
  const request: NewRequest = {
    requestTypeId: '1561',
    summary: 'Printer jammed',
    details: 'Level 4 printer',
    includePcDetails: true,
  }

  function desk(options: { screenshotsExist?: boolean } = {}) {
    const world = { opened: [] as string[], copied: [] as string[][], notified: [] as string[] }
    const serviceDesk = new ServiceDesk({
      helpCentre: HELP_CENTRE,
      portalId: '1',
      requestTypeIds: ['1561', '1571'],
      pcInfo: () => PC,
      openLink: async (url) => void world.opened.push(url),
      copyScreenshots: async (paths) => {
        world.copied.push(paths)
        return options.screenshotsExist ?? true
      },
      notify: ({ title }) => world.notified.push(title),
    })
    return { serviceDesk, world }
  }

  it('opens the filled-in form, with the screenshot copied to paste', async () => {
    const { serviceDesk, world } = desk()
    expect(await serviceDesk.raise(request, [screenshot])).toEqual({ ok: true, screenshots: 1 })
    expect(world.copied).toEqual([['C:/shots/one.png']])
    const url = new URL(world.opened[0]!)
    expect(url.pathname).toBe('/servicedesk/customer/portal/1/create/1561')
    expect(url.searchParams.get('summary')).toBe('Printer jammed')
    expect(url.searchParams.get('description')).toContain('Level 4 printer\n\n---\nPC: MM-LT-042')
    expect(world.notified).toEqual(['Screenshot copied'])
  })

  it('leaves the PC details out when asked, and needs no screenshot', async () => {
    const { serviceDesk, world } = desk()
    await serviceDesk.raise({ ...request, includePcDetails: false }, [])
    expect(new URL(world.opened[0]!).searchParams.get('description')).toBe('Level 4 printer')
    expect(world.copied).toEqual([])
    expect(world.notified).toEqual([])
  })

  it('refuses an empty request, an unknown request type and a missing screenshot', async () => {
    const { serviceDesk, world } = desk({ screenshotsExist: false })
    expect(await serviceDesk.raise({ ...request, summary: '', details: ' ' }, [])).toEqual({
      ok: false,
      reason: 'empty',
    })
    expect(await serviceDesk.raise({ ...request, requestTypeId: '999' }, [])).toEqual({
      ok: false,
      reason: 'failed',
    })
    expect(await serviceDesk.raise(request, [screenshot])).toEqual({
      ok: false,
      reason: 'missing-screenshot',
    })
    expect(world.opened).toEqual([])
  })
})
