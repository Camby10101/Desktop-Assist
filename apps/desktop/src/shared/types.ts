import type { ActionId } from './actions'
import type { Corner } from './geometry'

/**
 * What the bubble is doing. The main process owns this; renderers only display it.
 * - `dragging`: following the mouse while the user drags it.
 * - `returning`: gliding into its corner after a bounce or a drag.
 * - `capturing`: windows are hidden while a screenshot is taken.
 */
export type Mode = 'collapsed' | 'expanded' | 'dragging' | 'bouncing' | 'returning' | 'capturing'

export interface Attachment {
  id: string
  /** Absolute path of the screenshot file. */
  path: string
  fileName: string
  /** ISO timestamp. */
  addedAt: string
}

/** The unsent draft in the text box. */
export interface Notes {
  text: string
  attachments: Attachment[]
  /** ISO timestamp of the last change, or null if nothing has been typed yet. */
  updatedAt: string | null
}

/** How hard Claude thinks before answering (the API's `effort`), shown as Fast/Balanced/Thorough. */
export type Effort = 'low' | 'medium' | 'high'

export interface Settings {
  autoStart: boolean
  /** Starting with Windows only works for an installed build, not `npm run dev`. */
  autoStartAvailable: boolean
  screenshotsDir: string
  effort: Effort
  /** With Claude Desktop: send the question there too, not just fill it in. */
  autoSend: boolean
  /** Uninstalling from Settings only works for an installed build, not `npm run dev`. */
  canUninstall: boolean
  /** IDs of the apps the user starred in the Apps list. */
  favoriteApps: string[]
  /** Light or dark mode for Desktop Assist (dark until the user switches). */
  theme: Theme
}

export type Theme = 'dark' | 'light'

/**
 * Where conversations happen: in the panel through the Claude API (`built-in`), or handed over to
 * the Claude Desktop app (`claude-desktop`), which uses each person's own Claude account.
 */
export type ChatApp = 'built-in' | 'claude-desktop'

export interface Branding {
  companyName: string
  appName: string
  accentColor: string
  actions: ActionId[]
  chatApp: ChatApp
  /** The identity provider's name for the Apps list ("JumpCloud"), or null without one. */
  portalName: string | null
  /** What the card shows when the panel opens: the text box, or the Apps list. */
  startPage: StartPage
  /** The company's Atlassian site (Jira links, the Jira page), or null without one. */
  atlassianSite: string | null
  /**
   * Raising IT requests from the panel: the request types offered, the first one for "Report a
   * problem". Null when the service desk icon just opens the portal.
   */
  requestTypes: RequestType[] | null
}

/** A kind of request on the IT help centre portal ("Other IT Issue", "Request new software"). */
export interface RequestType {
  id: string
  name: string
}

/** The two things the card beside the bubble can show. */
export type StartPage = 'ask' | 'apps'

export interface SignedInUser {
  name?: string
  email?: string
}

/**
 * Whether the user is signed in with JumpCloud.
 * - `unconfigured`: the JumpCloud or Claude access settings in tenant.json aren't filled in yet.
 * - `checking`: renewing a saved sign-in at startup.
 * - `signing-in`: waiting for the user to finish in their browser.
 * - `offline`: a saved sign-in couldn't be renewed because JumpCloud couldn't be reached. It's
 *   kept, and Retry tries again.
 */
export type AuthStatus =
  | { state: 'unconfigured'; missing: string[] }
  | { state: 'checking' }
  | { state: 'signed-out'; message?: string }
  | { state: 'signing-in' }
  | { state: 'signed-in'; user: SignedInUser }
  | { state: 'offline'; user: SignedInUser; message: string }

/** One message as the chat shows it. */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Screenshots sent with a user message. */
  attachments: Attachment[]
  status: 'streaming' | 'done' | 'stopped' | 'error'
  /** Shown under the message, e.g. why it stopped. */
  notice?: string
  /** A failed reply that can be requested again. */
  retryable?: boolean
}

export type SendResult =
  | { ok: true; notes: Notes }
  | { ok: false; reason: 'busy' | 'empty' | 'signed-out' | 'missing-screenshot' }

/**
 * Handing the draft to Claude Desktop. `screenshots` is how many were copied to the clipboard
 * (as one image) for the user to paste.
 */
export type AskResult =
  | { ok: true; notes: Notes; screenshots: number }
  | { ok: false; reason: 'empty' | 'too-long' | 'not-installed' | 'missing-screenshot' | 'failed' }

export interface AppState {
  mode: Mode
  /** The screen corner the bubble rests in; the panel lays itself out to open away from it. */
  corner: Corner
  notes: Notes
  settings: Settings
  branding: Branding
  version: string
  /** Null when chats happen in Claude Desktop, which has its own sign-in. */
  auth: AuthStatus | null
  chat: ChatMessage[]
}

/** One app from the user's JumpCloud User Portal, as the Apps list shows it. */
export interface PortalApp {
  id: string
  name: string
  /** The logo as a data: URL (the pages can't load images from the web), or null. */
  logo: string | null
}

/**
 * The Apps list.
 * - `sign-in`: the user hasn't connected Desktop Assist to their portal yet (or the connection
 *   ended); a button starts it, in the browser.
 * - `signing-in`: waiting for the user to finish in their browser.
 */
export type AppsState =
  | { status: 'loading' }
  | { status: 'sign-in'; message?: string }
  | { status: 'signing-in' }
  | { status: 'ready'; apps: PortalApp[] }
  | { status: 'error'; message: string }

/** Settings → Uninstall. On success the app is already quitting. */
export type UninstallResult =
  { ok: true } | { ok: false; reason: 'not-installed' | 'missing' | 'failed' }

/**
 * The connection to Atlassian (Jira and Confluence), made once in the browser.
 * - `sign-in`: not connected yet (or the connection ended); a button starts it.
 * - `signing-in`: waiting for the user to finish in their browser.
 */
export type AtlassianState =
  | { status: 'loading' }
  | { status: 'sign-in'; message?: string }
  | { status: 'signing-in' }
  | { status: 'connected'; user: { name: string; email?: string } }
  | { status: 'error'; message: string }

/** How far along an issue is, by its status's category in Jira (which sets its colour). */
export type StatusCategory = 'new' | 'indeterminate' | 'done'

export interface IssueStatus {
  name: string
  category: StatusCategory
}

/** Someone else assigned the user an issue, or mentioned them, in the last two weeks. */
export interface JiraNotification {
  id: string
  kind: 'assigned' | 'mentioned'
  key: string
  summary: string
  /** Who did it (their name in Atlassian). */
  by: string
  /** ISO time. */
  at: string
  /** The start of the comment they were mentioned in. */
  excerpt?: string
  unread: boolean
}

/** One of the user's own requests to the IT service desk. */
export interface ServiceRequest {
  key: string
  summary: string
  status: IssueStatus
  /** ISO time of the last change. */
  updated: string
  /** The request on the help centre portal. */
  url: string
  /** What's new since the user last looked ("Mark Duong replied", "Now Resolved"), or null. */
  news: string | null
}

/** A list the main process keeps up to date in the background. */
export interface FeedList<T> {
  status: 'loading' | 'ready' | 'error'
  items: T[]
  message?: string
}

/** The Notifications tab and My requests. */
export interface JiraFeed {
  notifications: FeedList<JiraNotification>
  requests: FeedList<ServiceRequest>
}

/** An issue in a list of search results. */
export interface IssueSummary {
  key: string
  summary: string
  status: IssueStatus
  type: string | null
  url: string
}

/** A Confluence page in search results or suggestions. */
export interface ConfluencePage {
  id: string
  title: string
  /** A line or two from the page, as plain text. */
  excerpt: string
  space: string | null
  url: string
}

export type SearchResult =
  { ok: true; issues: IssueSummary[]; pages: ConfluencePage[] } | { ok: false; message: string }

export interface IssueComment {
  id: string
  author: string
  /** ISO time. */
  created: string
  /** Markdown. */
  body: string
}

/** A status the issue can be moved to ("Start progress", "Done"). */
export interface IssueTransition {
  id: string
  name: string
}

/** An issue as the issue view shows it. */
export interface IssueDetail extends IssueSummary {
  assignee: string | null
  reporter: string | null
  created: string
  updated: string
  /** Markdown, shortened if it's long. */
  description: string
  /** The latest comments, oldest first. */
  comments: IssueComment[]
  /** The request on the help centre portal, for service desk requests; null otherwise. */
  portalUrl: string | null
  transitions: IssueTransition[]
}

/** Opening an issue, or changing it (which answers with the issue as it is now). */
export type IssueResult = { ok: true; issue: IssueDetail } | { ok: false; message: string }

/** What to ask Claude about an issue. */
export type IssuePrompt = 'summarise' | 'reply' | 'next-steps'

/** Asking Claude about an issue: `inChat` when it went to the chat in the panel. */
export type AskAboutIssueResult = { ok: true; inChat: boolean } | { ok: false; message: string }

/** A request filled in on the panel, to finish on the help centre portal. */
export interface NewRequest {
  requestTypeId: string
  summary: string
  details: string
  includePcDetails: boolean
}

/** Opening the portal's form, filled in, with the text box's screenshots on the clipboard. */
export type RaiseResult =
  | { ok: true; screenshots: number }
  | { ok: false; reason: 'empty' | 'missing-screenshot' | 'failed' }

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string }

/**
 * Attaching a screenshot: the newest one not attached yet. `no-more` when every screenshot is
 * already attached.
 */
export type AttachResult =
  { ok: true; notes: Notes } | { ok: false; reason: 'no-screenshots' | 'no-more' }
