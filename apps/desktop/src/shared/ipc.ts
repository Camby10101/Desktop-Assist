import type { CommandActionId } from './actions'
import type { Pose } from './character'
import type { CharacterSize, Corner, Point } from './geometry'
import type { Spell } from './spells'
import type {
  ActionResult,
  AppsState,
  AppState,
  AskAboutIssueResult,
  AskResult,
  AtlassianState,
  AttachResult,
  AuthStatus,
  ChatMessage,
  ConfluencePage,
  Effort,
  Habits,
  IssuePrompt,
  IssueResult,
  JiraFeed,
  Mode,
  NewRequest,
  Notes,
  RaiseResult,
  SearchResult,
  SendResult,
  Settings,
  Theme,
  UninstallResult,
  UpdateState,
} from './types'

/** IPC channel names. The preload maps them onto `window.assist`; src/main/ipc.ts handles them. */
export const IPC = {
  getState: 'assist:get-state',
  bubbleClick: 'assist:bubble-click',
  bubbleDragStart: 'assist:bubble-drag-start',
  bubbleDragEnd: 'assist:bubble-drag-end',
  bubbleDragHold: 'assist:bubble-drag-hold',
  bubblePet: 'assist:bubble-pet',
  bubblePointerInside: 'assist:bubble-pointer-inside',
  trickReady: 'assist:trick-ready',
  collapse: 'assist:collapse',
  setInteractive: 'assist:set-interactive',
  invokeAction: 'assist:invoke-action',
  openExternal: 'assist:open-external',
  copyText: 'assist:copy-text',
  notesSetText: 'assist:notes-set-text',
  notesAttachLatest: 'assist:notes-attach-latest',
  notesRemoveAttachment: 'assist:notes-remove-attachment',
  notesClear: 'assist:notes-clear',
  screenshotThumbnail: 'assist:screenshot-thumbnail',
  screenshotOpen: 'assist:screenshot-open',
  screenshotsOpenFolder: 'assist:screenshots-open-folder',
  settingsGet: 'assist:settings-get',
  settingsSetAutoStart: 'assist:settings-set-auto-start',
  settingsSetEffort: 'assist:settings-set-effort',
  settingsSetAutoSend: 'assist:settings-set-auto-send',
  settingsSetFavoriteApp: 'assist:settings-set-favorite-app',
  settingsSetTheme: 'assist:settings-set-theme',
  settingsSetHabits: 'assist:settings-set-habits',
  settingsSetRobeColor: 'assist:settings-set-robe-color',
  characterSetSize: 'assist:character-set-size',
  characterCastSpell: 'assist:character-cast-spell',
  authSignIn: 'assist:auth-sign-in',
  authCancel: 'assist:auth-cancel',
  authSignOut: 'assist:auth-sign-out',
  authRetry: 'assist:auth-retry',
  chatSend: 'assist:chat-send',
  chatStop: 'assist:chat-stop',
  chatRetry: 'assist:chat-retry',
  chatNew: 'assist:chat-new',
  claudeDesktopAsk: 'assist:claude-desktop-ask',
  claudeDesktopInstalled: 'assist:claude-desktop-installed',
  appUninstall: 'assist:app-uninstall',
  appsGet: 'assist:apps-get',
  appsSignIn: 'assist:apps-sign-in',
  appsCancelSignIn: 'assist:apps-cancel-sign-in',
  appsOpen: 'assist:apps-open',
  appsOpenPortal: 'assist:apps-open-portal',
  atlassianGet: 'assist:atlassian-get',
  atlassianSignIn: 'assist:atlassian-sign-in',
  atlassianCancelSignIn: 'assist:atlassian-cancel-sign-in',
  atlassianSignOut: 'assist:atlassian-sign-out',
  atlassianRetry: 'assist:atlassian-retry',
  atlassianFeed: 'assist:atlassian-feed',
  atlassianMarkNotificationsRead: 'assist:atlassian-mark-notifications-read',
  atlassianMarkRequestsRead: 'assist:atlassian-mark-requests-read',
  atlassianSearch: 'assist:atlassian-search',
  atlassianIssue: 'assist:atlassian-issue',
  atlassianTransition: 'assist:atlassian-transition',
  atlassianComment: 'assist:atlassian-comment',
  atlassianLogWork: 'assist:atlassian-log-work',
  atlassianArticles: 'assist:atlassian-articles',
  atlassianProjectKeys: 'assist:atlassian-project-keys',
  atlassianAsk: 'assist:atlassian-ask',
  serviceDeskPcDetails: 'assist:service-desk-pc-details',
  serviceDeskRaise: 'assist:service-desk-raise',
  serviceDeskOpenMyRequests: 'assist:service-desk-open-my-requests',
  updatesGet: 'assist:updates-get',
  updatesCheck: 'assist:updates-check',
  screensaverWake: 'assist:screensaver-wake',
  // main → renderer
  modeChanged: 'assist:mode-changed',
  poseChanged: 'assist:pose-changed',
  bubbleArrive: 'assist:bubble-arrive',
  screensaverEnd: 'assist:screensaver-end',
  robeColorChanged: 'assist:robe-color-changed',
  gaze: 'assist:gaze',
  familiarSees: 'assist:familiar-sees',
  occlude: 'assist:occlude',
  trickPlan: 'assist:trick-plan',
  cornerChanged: 'assist:corner-changed',
  sizeChanged: 'assist:size-changed',
  clickThroughReset: 'assist:click-through-reset',
  authStatus: 'assist:auth-status',
  chatMessage: 'assist:chat-message',
  chatReset: 'assist:chat-reset',
  appsState: 'assist:apps-state',
  atlassianState: 'assist:atlassian-state',
  jiraFeed: 'assist:jira-feed',
  updateState: 'assist:update-state',
} as const

/** The API the preload exposes to renderers as `window.assist`. */
export interface AssistApi {
  getState(): Promise<AppState>
  /** A click on the bubble; `pressedAt` is when the button went down (Date.now()). */
  bubbleClick(pressedAt?: number): void
  /** The bubble was pressed and moved: the main process makes it follow the mouse. */
  bubbleDragStart(): void
  /** Released: the character falls onto the taskbar of the display it's on. */
  bubbleDragEnd(): void
  /**
   * While she's carried: the mouse button is still down (every DRAG_CHECK.everyMs). Without word
   * for DRAG_CHECK.staleMs, the main process lets her go.
   */
  bubbleDragHold(): void
  /** Double-clicked: petted (the click before it opened or closed the panel as usual). */
  bubblePet(): void
  /** A trick's page is ready for its plan and icons (they come back through onTrickPlan). */
  trickReady(): void
  collapse(): void
  /** Tell the main process whether the pointer is over real UI (true) or a see-through area. */
  setInteractive(interactive: boolean): void
  invokeAction(id: CommandActionId): Promise<ActionResult>
  /** Opens a web (http/https) or email (mailto) link in the default app. */
  openExternal(url: string): Promise<void>
  copyText(text: string): Promise<void>
  notes: {
    setText(text: string): void
    /** Attaches the newest screenshot that isn't attached yet (each click goes one further back). */
    attachLatestScreenshot(): Promise<AttachResult>
    removeAttachment(id: string): Promise<Notes>
    /** Empties the text box and removes the attached screenshots (the files are kept). */
    clear(): Promise<Notes>
  }
  screenshots: {
    /** A small data-URL preview, or null if the file is missing. */
    thumbnail(path: string): Promise<string | null>
    open(path: string): Promise<boolean>
    openFolder(): Promise<void>
  }
  settings: {
    get(): Promise<Settings>
    setAutoStart(enabled: boolean): Promise<Settings>
    setEffort(effort: Effort): Promise<Settings>
    setAutoSend(autoSend: boolean): Promise<Settings>
    /** Stars an app in the Apps list (it moves to the top), or takes its star away. */
    setFavoriteApp(id: string, favorite: boolean): Promise<Settings>
    /** Light or dark mode for all of Desktop Wizard; saved. */
    setTheme(theme: Theme): Promise<Settings>
    /** Whether she stands still, and whether she does her idle animations; saved. */
    setHabits(habits: Partial<Habits>): Promise<Settings>
    /** Her robe's colour (`#rrggbb`), or null for the company's; saved, and she changes at once. */
    setRobeColor(color: string | null): Promise<Settings>
  }
  character: {
    /** Makes her `scale` times her usual size (one of CHARACTER_SIZES); saved. */
    setSize(scale: number): Promise<CharacterSize>
    /** Casts one of her spells: the panel closes so it can be seen. */
    castSpell(spell: Spell): Promise<void>
  }
  auth: {
    /** Opens JumpCloud in the browser; progress arrives through `onAuthStatus`. */
    signIn(): Promise<void>
    /** Stops waiting for a sign-in started in the browser. */
    cancel(): Promise<void>
    signOut(): Promise<void>
    /** Tries again to renew a saved sign-in that couldn't reach JumpCloud. */
    retry(): Promise<void>
  }
  claudeDesktop: {
    /**
     * Opens a new chat in Claude Desktop with the draft text filled in, and copies the attached
     * screenshots for the user to paste. Clears the draft and collapses the panel if it worked.
     */
    ask(text: string): Promise<AskResult>
    /** Whether Claude Desktop is installed on this PC (anything handles claude:// links). */
    isInstalled(): Promise<boolean>
  }
  /** The built-in chat (only when the tenant's `chatApp` is `built-in`). */
  chat: {
    /** Sends the draft text plus the draft's attached screenshots. */
    send(text: string): Promise<SendResult>
    stop(): Promise<void>
    retry(): Promise<void>
    newConversation(): Promise<void>
  }
  /** The user's JumpCloud portal apps (only when the tenant has a `portal`). */
  apps: {
    /** The list as it stands; loads it first if needed, or again with `refresh`. */
    get(refresh?: boolean): Promise<AppsState>
    /** Connects Desktop Wizard to the portal, in the browser; progress via onAppsState. */
    signIn(): Promise<void>
    cancelSignIn(): Promise<void>
    /** Opens the app in the default browser (signed in through the portal). */
    open(id: string): Promise<boolean>
    openPortal(): Promise<void>
  }
  /** Jira and Confluence (only when the tenant has `atlassian`). */
  atlassian: {
    get(): Promise<AtlassianState>
    /** Connects to Atlassian in the browser; progress via onAtlassianState. */
    signIn(): Promise<void>
    cancelSignIn(): Promise<void>
    /** Forgets the connection. */
    signOut(): Promise<void>
    /** Tries the saved connection again after an error. */
    retry(): Promise<void>
    /** Notifications and the user's IT requests; checked again first with `refresh`. */
    feed(refresh?: boolean): Promise<JiraFeed>
    /** Marks one notification (by its id), or all of them, as seen. */
    markNotificationsRead(id?: string): Promise<JiraFeed>
    /** Marks what's new on one request (or all of them) as seen. */
    markRequestsRead(key?: string): Promise<JiraFeed>
    search(query: string): Promise<SearchResult>
    issue(key: string): Promise<IssueResult>
    transition(key: string, transitionId: string): Promise<IssueResult>
    comment(key: string, body: string): Promise<IssueResult>
    /** Jira's format: "30m", "1h 30m", "2d". */
    logWork(key: string, timeSpent: string): Promise<IssueResult>
    /** How-to pages about what the user is typing in a new request. */
    articles(text: string): Promise<ConfluencePage[]>
    /** The Jira projects' keys, or null if they can't be listed (e.g. not connected). */
    projectKeys(): Promise<string[] | null>
    /**
     * Asks Claude about the issue, with its details: in Claude Desktop (the panel closes), or the
     * chat in the panel.
     */
    ask(key: string, prompt: IssuePrompt): Promise<AskAboutIssueResult>
  }
  /** Raising IT requests (only when the tenant's service desk lists request types). */
  serviceDesk: {
    /** What "Include PC details" adds. */
    pcDetails(): Promise<string>
    /**
     * Opens the portal's form for the request, filled in, with the text box's screenshots on the
     * clipboard to paste. Closes the panel if it worked.
     */
    raise(request: NewRequest): Promise<RaiseResult>
    openMyRequests(): Promise<void>
  }
  /** Settings → Check for updates (only when the tenant has `updates`). */
  updates: {
    get(): Promise<UpdateState>
    /**
     * Checks GitHub for a newer release and, if there is one, downloads and installs it (the app
     * then closes and starts again). Returns straight away; progress via onUpdateState.
     */
    check(): Promise<UpdateState>
  }
  /** Starts Desktop Wizard's uninstaller and quits (installed copies only). */
  uninstall(): Promise<UninstallResult>
  /**
   * Whether the mouse pointer is over her window now (it's showing, and the pointer's inside it):
   * her page checks its glow with it, as the page isn't always told when the pointer leaves.
   */
  bubblePointerInside(): Promise<boolean>
  screensaver: {
    /** The user's back (the mouse moved, a click, a key): the screen saver's pages. */
    wake(): void
  }
  /** The screen saver is ending: time for its scene to fade away (its pages). */
  onScreensaverEnd(callback: () => void): () => void
  /** Her robe's colour was changed in Settings (null: the company's again). */
  onRobeColorChanged(callback: (color: string | null) => void): () => void
  /** Which way she's to look at the pointer while she watches it (null: done watching). */
  onGaze(callback: (gaze: { x: number; y: number } | null) => void): () => void
  /**
   * Where she is (the middle of her, DIPs across the cat's window), what she's doing, and when the
   * cat goes: her familiar's page.
   */
  onFamiliarSees(callback: (seen: { x: number; pose: Pose; ends: number }) => void): () => void
  /** A trick's plan and its icons (JSON): the trick's page. */
  onTrickPlan(callback: (trick: string) => void): () => void
  /**
   * A window in front of her (its rect on the screen, DIPs) while she's behind it, peeking round
   * it: the part of her behind it is hidden. Null: nothing in front of her.
   */
  onOcclude(
    callback: (rect: { x: number; y: number; width: number; height: number } | null) => void,
  ): () => void
  onModeChanged(callback: (mode: Mode) => void): () => void
  /** The character's pose changed (walking, fidgeting, dangling...). */
  onPoseChanged(callback: (pose: Pose) => void): () => void
  /** Her window has just been shown as the app starts: time for her to appear (the bubble's page). */
  onArrive(callback: () => void): () => void
  onCornerChanged(callback: (corner: Corner) => void): () => void
  /** Her size changed, or the biggest she can be on her screen did. */
  onSizeChanged(callback: (size: CharacterSize) => void): () => void
  /** The panel was just shown with click-through reset; `pointer` is where the mouse is now. */
  onClickThroughReset(callback: (pointer: Point) => void): () => void
  onAuthStatus(callback: (status: AuthStatus) => void): () => void
  /** A message was added or changed (streamed text arrives this way). */
  onChatMessage(callback: (message: ChatMessage) => void): () => void
  onChatReset(callback: () => void): () => void
  onAppsState(callback: (state: AppsState) => void): () => void
  onAtlassianState(callback: (state: AtlassianState) => void): () => void
  onJiraFeed(callback: (feed: JiraFeed) => void): () => void
  onUpdateState(callback: (state: UpdateState) => void): () => void
}
