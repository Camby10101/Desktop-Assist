import { useEffect, useState, type PointerEvent } from 'react'
import type { ActionId } from '@shared/actions'
import { CLAUDE_DOWNLOAD_PAGE } from '@shared/claudeDesktop'
import { actionOffset } from '@shared/geometry'
import type { AppState, AskResult, Attachment, Effort } from '@shared/types'
import { ActionStack } from '../components/ActionStack'
import { Banner, ChatBox } from '../components/ChatBox'
import { SettingsMenu } from '../components/SettingsMenu'
import { SignInPanel } from '../components/SignInPanel'
import { useAccentColor, useAssistState } from '../hooks/useAssistState'
import { useClickThrough } from '../hooks/useClickThrough'
import { useToast } from '../hooks/useToast'
import { cn } from '../lib/cn'

/** What to say when a question couldn't be handed to Claude Desktop. */
const ASK_ERRORS: Record<Exclude<Extract<AskResult, { ok: false }>['reason'], 'empty'>, string> = {
  'too-long': "That's too long to open in Claude. Shorten it, or paste it into Claude yourself.",
  'not-installed': "Claude Desktop isn't installed on this PC. Ask IT to install it.",
  'missing-screenshot': 'An attached screenshot is missing. Remove it and try again.',
  failed: "Couldn't open Claude Desktop. Try again.",
}

/** Everything that appears around the bubble when it's clicked. */
export function PanelView() {
  useClickThrough()
  const state = useAssistState()
  useAccentColor(state?.branding.accentColor)
  return state ? <Panel state={state} /> : null
}

function Panel({ state }: { state: AppState }) {
  const open = state.mode === 'expanded'
  const { branding, auth } = state
  // Questions go to the Claude Desktop app instead of the chat in the panel (no sign-in here).
  const inClaudeDesktop = branding.chatApp === 'claude-desktop'

  // The draft is edited here and mirrored to the main process, which saves it.
  const [draft, setDraft] = useState(state.notes.text)
  const [attachments, setAttachments] = useState(state.notes.attachments)
  const [settings, setSettings] = useState(state.settings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [asking, setAsking] = useState(false)
  /** Claude Desktop isn't installed, so questions can't be opened in it (checked on opening). */
  const [claudeMissing, setClaudeMissing] = useState(false)
  const [toast, showToast] = useToast()

  useEffect(
    () =>
      window.assist.onModeChanged((mode) => {
        if (mode !== 'expanded') setSettingsOpen(false)
      }),
    [],
  )
  useEffect(() => {
    if (!open || !inClaudeDesktop) return
    let alive = true
    void window.assist.claudeDesktop.isInstalled().then((installed) => {
      if (alive) setClaudeMissing(!installed)
    })
    return () => {
      alive = false
    }
  }, [open, inClaudeDesktop])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (settingsOpen) setSettingsOpen(false)
      else window.assist.collapse()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [settingsOpen])

  // Not signed in: the chat box shows the sign-in instead of the chat. While a saved sign-in is
  // being renewed, or JumpCloud can't be reached, the chat stays (sending tries JumpCloud again).
  // With Claude Desktop there's no sign-in here at all.
  const signedIn = auth === null || auth.state === 'signed-in' || auth.state === 'offline'
  // `busy` is the built-in chat's reply streaming (the text box then offers Stop). Handing a
  // question to Claude Desktop only takes a moment, so it just holds the button back.
  const busy = state.chat.some((message) => message.status === 'streaming')
  const canSend = signedIn && !busy && !asking && (draft.trim() !== '' || attachments.length > 0)

  async function runAction(id: ActionId) {
    if (id === 'settings') {
      setSettingsOpen(!settingsOpen)
      // Refresh: "Start with Windows" can also be changed in Windows Settings.
      if (!settingsOpen) setSettings(await window.assist.settings.get())
      return
    }
    setSettingsOpen(false)
    const result = await window.assist.invokeAction(id)
    if (result.message) showToast(result.message, result.ok ? 'info' : 'error')
  }

  function changeDraft(next: string) {
    setDraft(next)
    window.assist.notes.setText(next)
  }

  async function send() {
    if (!canSend) return
    if (inClaudeDesktop) return askInClaudeDesktop()
    const result = await window.assist.chat.send(draft)
    if (result.ok) {
      setDraft(result.notes.text)
      setAttachments(result.notes.attachments)
    } else if (result.reason === 'missing-screenshot') {
      showToast('An attached screenshot is missing. Remove it and try again.', 'error')
    } else if (result.reason === 'signed-out') {
      showToast('Sign in with JumpCloud first.', 'error')
    }
  }

  async function askInClaudeDesktop() {
    setAsking(true)
    const result = await window.assist.claudeDesktop.ask(draft).finally(() => setAsking(false))
    if (result.ok) setClaudeMissing(false)
    else if (result.reason === 'not-installed') setClaudeMissing(true)
    if (result.ok) {
      // The panel has closed and Claude Desktop has opened with the question filled in.
      setDraft(result.notes.text)
      setAttachments(result.notes.attachments)
    } else if (result.reason !== 'empty') {
      showToast(ASK_ERRORS[result.reason], 'error')
    }
  }

  async function attachLatest() {
    const result = await window.assist.notes.attachLatestScreenshot()
    if (result.ok) setAttachments(result.notes.attachments)
    else if (result.reason === 'no-screenshots') {
      showToast('No screenshots yet. Take one with the camera button.')
    } else showToast('That screenshot is already attached')
  }

  async function removeAttachment(attachment: Attachment) {
    const notes = await window.assist.notes.removeAttachment(attachment.id)
    setAttachments(notes.attachments)
  }

  async function openAttachment(attachment: Attachment) {
    const opened = await window.assist.screenshots.open(attachment.path)
    if (!opened) showToast("That screenshot can't be found", 'error')
  }

  async function copy(text: string) {
    await window.assist.copyText(text)
    showToast('Copied')
  }

  async function signOut() {
    setSettingsOpen(false)
    await window.assist.auth.signOut()
    showToast('Logged out')
  }

  async function clearText() {
    const notes = await window.assist.notes.clear()
    setDraft(notes.text)
    setAttachments(notes.attachments)
    setSettingsOpen(false)
    showToast('Text box cleared')
  }

  async function newConversation() {
    await window.assist.chat.newConversation()
    setSettingsOpen(false)
    showToast('Started a new conversation')
  }

  async function setEffort(effort: Effort) {
    setSettings(await window.assist.settings.setEffort(effort))
  }

  async function toggleAutoSend() {
    setSettings(await window.assist.settings.setAutoSend(!settings.autoSend))
  }

  // Clicking anywhere else in the panel closes the settings menu.
  function closeSettingsOnOutsideClick(event: PointerEvent) {
    if (!settingsOpen || !(event.target instanceof Element)) return
    if (!event.target.closest('[data-settings-menu], [data-action="settings"]')) {
      setSettingsOpen(false)
    }
  }

  const signInPrompt =
    auth?.state === 'unconfigured' ||
    auth?.state === 'signed-out' ||
    auth?.state === 'signing-in' ? (
      <SignInPanel
        open={open}
        status={auth}
        appName={branding.appName}
        onSignIn={() => void window.assist.auth.signIn()}
        onCancel={() => void window.assist.auth.cancel()}
      />
    ) : null

  const banner =
    inClaudeDesktop && claudeMissing ? (
      <Banner
        action={
          <button
            type="button"
            onClick={() => void window.assist.openExternal(CLAUDE_DOWNLOAD_PAGE)}
            className="shrink-0 rounded-md px-1.5 py-0.5 font-medium text-accent hover:bg-zinc-100 dark:text-accent-soft dark:hover:bg-zinc-800"
          >
            Download
          </button>
        }
      >
        Claude Desktop isn't installed on this PC, and {branding.appName} opens your questions in
        it. Ask IT to install it, or download it.
      </Banner>
    ) : auth?.state === 'checking' ? (
      <Banner spinner>Checking your JumpCloud sign-in…</Banner>
    ) : auth?.state === 'offline' ? (
      <Banner
        action={
          <button
            type="button"
            onClick={() => void window.assist.auth.retry()}
            className="rounded-md px-1.5 py-0.5 font-medium text-accent hover:bg-zinc-100 dark:text-accent-soft dark:hover:bg-zinc-800"
          >
            Retry
          </button>
        }
      >
        {auth.message}
      </Banner>
    ) : null

  const settingsIndex = branding.actions.indexOf('settings')

  return (
    <div
      className={cn('group relative h-full w-full', !open && 'pointer-events-none')}
      data-open={open ? '' : undefined}
      onPointerDown={closeSettingsOnOutsideClick}
    >
      <ChatBox
        corner={state.corner}
        open={open}
        toast={toast}
        inClaudeDesktop={inClaudeDesktop}
        autoSend={settings.autoSend}
        signInPrompt={signInPrompt}
        banner={banner}
        messages={state.chat}
        busy={busy}
        canSend={canSend}
        draft={draft}
        attachments={attachments}
        onDraftChange={changeDraft}
        onSend={() => void send()}
        onStop={() => void window.assist.chat.stop()}
        onRetry={() => void window.assist.chat.retry()}
        onCopy={(text) => void copy(text)}
        onAttachLatest={() => void attachLatest()}
        onOpenAttachment={(attachment) => void openAttachment(attachment)}
        onRemoveAttachment={(attachment) => void removeAttachment(attachment)}
      />
      <ActionStack
        corner={state.corner}
        actions={branding.actions}
        open={open}
        activeId={settingsOpen ? 'settings' : null}
        onAction={(id) => void runAction(id)}
      />
      {open && settingsOpen && settingsIndex >= 0 && (
        <SettingsMenu
          corner={state.corner}
          offset={actionOffset(settingsIndex)}
          settings={settings}
          branding={branding}
          version={state.version}
          user={auth?.state === 'signed-in' || auth?.state === 'offline' ? auth.user : null}
          onToggleAutoStart={async () =>
            setSettings(await window.assist.settings.setAutoStart(!settings.autoStart))
          }
          onSetEffort={(effort) => void setEffort(effort)}
          onToggleAutoSend={() => void toggleAutoSend()}
          onSignOut={() => void signOut()}
          onOpenScreenshotsFolder={() => void window.assist.screenshots.openFolder()}
          onNewConversation={() => void newConversation()}
          onClearText={() => void clearText()}
        />
      )}
    </div>
  )
}
