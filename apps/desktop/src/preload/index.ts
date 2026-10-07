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
  bubbleClick: () => ipcRenderer.send(IPC.bubbleClick),
  collapse: () => ipcRenderer.send(IPC.collapse),
  setInteractive: (interactive) => ipcRenderer.send(IPC.setInteractive, interactive),
  invokeAction: (id) => ipcRenderer.invoke(IPC.invokeAction, id),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  copyText: (text) => ipcRenderer.invoke(IPC.copyText, text),
  notes: {
    setText: (text) => ipcRenderer.send(IPC.notesSetText, text),
    attachLatestScreenshot: () => ipcRenderer.invoke(IPC.notesAttachLatest),
    removeAttachment: (id) => ipcRenderer.invoke(IPC.notesRemoveAttachment, id),
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
  },
  apiKey: {
    submit: (key) => ipcRenderer.invoke(IPC.apiKeySubmit, key),
    recheck: () => ipcRenderer.invoke(IPC.apiKeyRecheck),
    forget: () => ipcRenderer.invoke(IPC.apiKeyForget),
  },
  chat: {
    send: (text) => ipcRenderer.invoke(IPC.chatSend, text),
    stop: () => ipcRenderer.invoke(IPC.chatStop),
    retry: () => ipcRenderer.invoke(IPC.chatRetry),
    newConversation: () => ipcRenderer.invoke(IPC.chatNew),
  },
  onModeChanged: (callback) => subscribe(IPC.modeChanged, callback),
  onApiKeyStatus: (callback) => subscribe(IPC.apiKeyStatus, callback),
  onChatMessage: (callback) => subscribe(IPC.chatMessage, callback),
  onChatReset: (callback) => subscribe(IPC.chatReset, () => callback()),
}

contextBridge.exposeInMainWorld('assist', api)
