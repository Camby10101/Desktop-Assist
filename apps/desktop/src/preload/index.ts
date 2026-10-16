import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type AssistApi } from '@shared/ipc'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: AssistApi = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  bubbleClick: (pressedAt) => ipcRenderer.send(IPC.bubbleClick, pressedAt),
  bubbleDragStart: () => ipcRenderer.send(IPC.bubbleDragStart),
  bubbleDragEnd: () => ipcRenderer.send(IPC.bubbleDragEnd),
  collapse: () => ipcRenderer.send(IPC.collapse),
  setInteractive: (interactive) => ipcRenderer.send(IPC.setInteractive, interactive),
  invokeAction: (id) => ipcRenderer.invoke(IPC.invokeAction, id),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  copyText: (text) => ipcRenderer.invoke(IPC.copyText, text),
  notes: {
    setText: (text) => ipcRenderer.send(IPC.notesSetText, text),
    attachLatestScreenshot: () => ipcRenderer.invoke(IPC.notesAttachLatest),
    removeAttachment: (id) => ipcRenderer.invoke(IPC.notesRemoveAttachment, id),
    clear: () => ipcRenderer.invoke(IPC.notesClear),
  },
  screenshots: {
    thumbnail: (path) => ipcRenderer.invoke(IPC.screenshotThumbnail, path),
    open: (path) => ipcRenderer.invoke(IPC.screenshotOpen, path),
    openFolder: () => ipcRenderer.invoke(IPC.screenshotsOpenFolder),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    setAutoStart: (enabled) => ipcRenderer.invoke(IPC.settingsSetAutoStart, enabled),
    setEffort: (effort) => ipcRenderer.invoke(IPC.settingsSetEffort, effort),
    setAutoSend: (autoSend) => ipcRenderer.invoke(IPC.settingsSetAutoSend, autoSend),
    setTheme: (theme) => ipcRenderer.invoke(IPC.settingsSetTheme, theme),
    setFavoriteApp: (id, favorite) =>
      ipcRenderer.invoke(IPC.settingsSetFavoriteApp, { id, favorite }),
  },
  auth: {
    signIn: () => ipcRenderer.invoke(IPC.authSignIn),
    cancel: () => ipcRenderer.invoke(IPC.authCancel),
    signOut: () => ipcRenderer.invoke(IPC.authSignOut),
    retry: () => ipcRenderer.invoke(IPC.authRetry),
  },
  claudeDesktop: {
    ask: (text) => ipcRenderer.invoke(IPC.claudeDesktopAsk, text),
    isInstalled: () => ipcRenderer.invoke(IPC.claudeDesktopInstalled),
  },
  chat: {
    send: (text) => ipcRenderer.invoke(IPC.chatSend, text),
    stop: () => ipcRenderer.invoke(IPC.chatStop),
    retry: () => ipcRenderer.invoke(IPC.chatRetry),
    newConversation: () => ipcRenderer.invoke(IPC.chatNew),
  },
  apps: {
    get: (refresh) => ipcRenderer.invoke(IPC.appsGet, refresh ?? false),
    signIn: () => ipcRenderer.invoke(IPC.appsSignIn),
    cancelSignIn: () => ipcRenderer.invoke(IPC.appsCancelSignIn),
    open: (id) => ipcRenderer.invoke(IPC.appsOpen, id),
    openPortal: () => ipcRenderer.invoke(IPC.appsOpenPortal),
  },
  atlassian: {
    get: () => ipcRenderer.invoke(IPC.atlassianGet),
    signIn: () => ipcRenderer.invoke(IPC.atlassianSignIn),
    cancelSignIn: () => ipcRenderer.invoke(IPC.atlassianCancelSignIn),
    signOut: () => ipcRenderer.invoke(IPC.atlassianSignOut),
    retry: () => ipcRenderer.invoke(IPC.atlassianRetry),
    feed: (refresh) => ipcRenderer.invoke(IPC.atlassianFeed, refresh ?? false),
    markNotificationsRead: () => ipcRenderer.invoke(IPC.atlassianMarkNotificationsRead),
    markRequestsRead: (key) => ipcRenderer.invoke(IPC.atlassianMarkRequestsRead, key),
    search: (query) => ipcRenderer.invoke(IPC.atlassianSearch, query),
    issue: (key) => ipcRenderer.invoke(IPC.atlassianIssue, key),
    transition: (key, transitionId) =>
      ipcRenderer.invoke(IPC.atlassianTransition, { key, transitionId }),
    comment: (key, body) => ipcRenderer.invoke(IPC.atlassianComment, { key, body }),
    logWork: (key, timeSpent) => ipcRenderer.invoke(IPC.atlassianLogWork, { key, timeSpent }),
    articles: (text) => ipcRenderer.invoke(IPC.atlassianArticles, text),
    projectKeys: () => ipcRenderer.invoke(IPC.atlassianProjectKeys),
    ask: (key, prompt) => ipcRenderer.invoke(IPC.atlassianAsk, { key, prompt }),
  },
  serviceDesk: {
    pcDetails: () => ipcRenderer.invoke(IPC.serviceDeskPcDetails),
    raise: (request) => ipcRenderer.invoke(IPC.serviceDeskRaise, request),
    openMyRequests: () => ipcRenderer.invoke(IPC.serviceDeskOpenMyRequests),
  },
  updates: {
    get: () => ipcRenderer.invoke(IPC.updatesGet),
    check: () => ipcRenderer.invoke(IPC.updatesCheck),
  },
  uninstall: () => ipcRenderer.invoke(IPC.appUninstall),
  onModeChanged: (callback) => subscribe(IPC.modeChanged, callback),
  onCornerChanged: (callback) => subscribe(IPC.cornerChanged, callback),
  onClickThroughReset: (callback) => subscribe(IPC.clickThroughReset, callback),
  onAuthStatus: (callback) => subscribe(IPC.authStatus, callback),
  onChatMessage: (callback) => subscribe(IPC.chatMessage, callback),
  onChatReset: (callback) => subscribe(IPC.chatReset, () => callback()),
  onAppsState: (callback) => subscribe(IPC.appsState, callback),
  onAtlassianState: (callback) => subscribe(IPC.atlassianState, callback),
  onJiraFeed: (callback) => subscribe(IPC.jiraFeed, callback),
  onUpdateState: (callback) => subscribe(IPC.updateState, callback),
}

contextBridge.exposeInMainWorld('assist', api)
