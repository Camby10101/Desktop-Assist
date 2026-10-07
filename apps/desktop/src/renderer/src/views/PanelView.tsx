import { useEffect, useState, type PointerEvent } from 'react'
import type { ActionId } from '@shared/actions'
import { actionOffset } from '@shared/geometry'
import type { AppState, Attachment, Effort } from '@shared/types'
import { ActionStack } from '../components/ActionStack'
import { ApiKeyForm } from '../components/ApiKeyForm'
import { Banner, ChatBox } from '../components/ChatBox'
import { SettingsMenu } from '../components/SettingsMenu'
import { useAccentColor, useAssistState } from '../hooks/useAssistState'
import { useClickThrough } from '../hooks/useClickThrough'
import { useToast } from '../hooks/useToast'
import { cn } from '../lib/cn'

/** Everything that appears around the bubble when it's clicked. */
export function PanelView() {
  useClickThrough()
  const state = useAssistState()
  useAccentColor(state?.branding.accentColor)
  return state ? <Panel state={state} /> : null
}

function Panel({ state }: { state: AppState }) {
  const open = state.mode === 'expanded'
  const { branding, apiKey } = state

  // The draft is edited here and mirrored to the main process, which saves it.
  const [draft, setDraft] = useState(state.notes.text)
  const [attachments, setAttachments] = useState(state.notes.attachments)
  const [settings, setSettings] = useState(state.settings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [changingKey, setChangingKey] = useState(false)
  const [toast, showToast] = useToast()

  useEffect(
    () =>
      window.assist.onModeChanged((mode) => {
        if (mode !== 'expanded') {
          setSettingsOpen(false)
          setChangingKey(false)
        }
      }),
    [],
  )
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (settingsOpen) setSettingsOpen(false)
      else window.assist.collapse()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [settingsOpen])

  // No key, or the saved one stopped working: the chat box asks for one before anything else.
  const needsKey = apiKey.state === 'missing' || apiKey.state === 'invalid'
  const keyUsable = apiKey.state === 'valid' || apiKey.state === 'unreachable'
  const busy = state.chat.some((message) => message.status === 'streaming')
  const canSend = keyUsable && !busy && (draft.trim() !== '' || attachments.length > 0)

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
    const result = await window.assist.chat.send(draft)
    if (result.ok) {
      setDraft(result.notes.text)
      setAttachments(result.notes.attachments)
    } else if (result.reason === 'missing-screenshot') {
      showToast('An attached screenshot is missing. Remove it and try again.', 'error')
    } else if (result.reason === 'no-key') {
      showToast('Add your Claude API key first.', 'error')
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

  async function submitKey(key: string) {
    const result = await window.assist.apiKey.submit(key)
    if (result.ok) {
      setChangingKey(false)
      showToast('API key saved')
    }
    return result
  }

  async function forgetKey() {
    await window.assist.apiKey.forget()
    setChangingKey(false)
  }

  async function newConversation() {
    await window.assist.chat.newConversation()
    setSettingsOpen(false)
    showToast('Started a new conversation')
  }

  async function setEffort(effort: Effort) {
    setSettings(await window.assist.settings.setEffort(effort))
  }

  // Clicking anywhere else in the panel closes the settings menu.
  function closeSettingsOnOutsideClick(event: PointerEvent) {
    if (!settingsOpen || !(event.target instanceof Element)) return
    if (!event.target.closest('[data-settings-menu], [data-action="settings"]')) {
      setSettingsOpen(false)
    }
  }

  const keyPrompt =
    needsKey || changingKey ? (
      <ApiKeyForm
        open={open}
        status={apiKey}
        changing={changingKey && !needsKey}
        onSubmit={submitKey}
        onCancel={() => setChangingKey(false)}
        onForget={() => void forgetKey()}
      />
    ) : null

  const banner =
    apiKey.state === 'checking' ? (
      <Banner spinner>Checking your Claude API key…</Banner>
    ) : apiKey.state === 'unreachable' ? (
      <Banner
        action={
          <button
            type="button"
            onClick={() => void window.assist.apiKey.recheck()}
            className="rounded-md px-1.5 py-0.5 font-medium text-accent hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Retry
          </button>
        }
      >
        {apiKey.message}
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
        keyPrompt={keyPrompt}
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
          onToggleAutoStart={async () =>
            setSettings(await window.assist.settings.setAutoStart(!settings.autoStart))
          }
          onSetEffort={(effort) => void setEffort(effort)}
          onChangeApiKey={() => {
            setSettingsOpen(false)
            setChangingKey(true)
          }}
          onOpenScreenshotsFolder={() => void window.assist.screenshots.openFolder()}
          onNewConversation={() => void newConversation()}
        />
      )}
    </div>
  )
}
