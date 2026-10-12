import type { Attachment, NewRequest, RaiseResult } from '@shared/types'

/**
 * The longest description put in the portal link. Browsers and Atlassian accept much longer
 * addresses, but past a few thousand characters some proxies don't.
 */
export const MAX_LINK_DESCRIPTION = 1800

/** What's sent about the PC, so IT doesn't have to ask. */
export interface PcInfo {
  computerName: string
  windows: string
  appName: string
  appVersion: string
}

/**
 * Windows' name and build, e.g. "Windows 11 Pro (10.0.26200)". Windows 11 still calls itself
 * Windows 10 in the name it reports (its build, 22000 or later, gives it away).
 */
export function windowsVersion(name: string, release: string): string {
  const build = Number(release.split('.')[2] ?? 0)
  const fixed = build >= 22000 ? name.replace(/^Windows 10\b/, 'Windows 11') : name
  return `${fixed} (${release})`
}

export function pcDetails(info: PcInfo): string {
  return [
    `PC: ${info.computerName}`,
    `Windows: ${info.windows}`,
    `${info.appName}: ${info.appVersion}`,
  ].join('\n')
}

/** The request's description: the user's words, then (if they want) the PC's details. */
export function requestDescription(details: string, pc: string | null): string {
  const parts = [details.trim(), pc ? `---\n${pc}` : ''].filter(Boolean)
  const description = parts.join('\n\n')
  return description.length > MAX_LINK_DESCRIPTION
    ? `${description.slice(0, MAX_LINK_DESCRIPTION - 30).trimEnd()}\n… (shortened)`
    : description
}

/**
 * The portal's form for a request type, filled in: Jira Service Management fills the summary
 * and description from these parameters.
 */
export function requestFormUrl(options: {
  helpCentre: string
  portalId: string
  requestTypeId: string
  summary: string
  description: string
}): string {
  const origin = new URL(options.helpCentre).origin
  const query = [
    options.summary.trim() && `summary=${encodeURIComponent(options.summary.trim())}`,
    options.description && `description=${encodeURIComponent(options.description)}`,
  ].filter(Boolean)
  const base = `${origin}/servicedesk/customer/portal/${options.portalId}/create/${options.requestTypeId}`
  return query.length ? `${base}?${query.join('&')}` : base
}

/** The user's requests on the help centre, all of them. */
export function myRequestsUrl(helpCentre: string): string {
  return `${new URL(helpCentre).origin}/servicedesk/customer/user/requests`
}

export interface ServiceDeskDeps {
  helpCentre: string
  portalId: string
  /** The request types offered (the IPC handler only accepts these). */
  requestTypeIds: string[]
  pcInfo(): PcInfo
  openLink(url: string): Promise<void>
  /** Puts the screenshots on the clipboard as one image. False if one of them is missing. */
  copyScreenshots(paths: string[]): Promise<boolean>
  /** A Windows notification, e.g. to say the screenshot is ready to paste. */
  notify(message: { title: string; body: string }): void
  onError?(error: unknown): void
}

/**
 * Raising IT requests from the panel: the request is filled in here and finished on the help
 * centre portal, where the user is signed in as themselves (and can attach the screenshot, which
 * a link can't carry: it goes on the clipboard).
 */
export class ServiceDesk {
  constructor(private readonly deps: ServiceDeskDeps) {}

  /** What "Include PC details" adds, for the form to show. */
  pcDetails(): string {
    return pcDetails(this.deps.pcInfo())
  }

  async raise(request: NewRequest, attachments: Attachment[]): Promise<RaiseResult> {
    if (!request.summary.trim() && !request.details.trim()) return { ok: false, reason: 'empty' }
    if (!this.deps.requestTypeIds.includes(request.requestTypeId)) {
      return { ok: false, reason: 'failed' }
    }
    try {
      const paths = attachments.map((attachment) => attachment.path)
      if (paths.length > 0 && !(await this.deps.copyScreenshots(paths))) {
        return { ok: false, reason: 'missing-screenshot' }
      }
      const description = requestDescription(
        request.details,
        request.includePcDetails ? this.pcDetails() : null,
      )
      await this.deps.openLink(
        requestFormUrl({
          helpCentre: this.deps.helpCentre,
          portalId: this.deps.portalId,
          requestTypeId: request.requestTypeId,
          summary: request.summary,
          description,
        }),
      )
    } catch (error) {
      this.deps.onError?.(error)
      return { ok: false, reason: 'failed' }
    }
    if (attachments.length > 0) {
      this.deps.notify({
        title: attachments.length === 1 ? 'Screenshot copied' : 'Screenshots copied as one image',
        body: 'On the request form, click in the description and press Ctrl+V to add it.',
      })
    }
    return { ok: true, screenshots: attachments.length }
  }
}
