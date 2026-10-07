import { useEffect, useState, type PointerEvent } from 'react'
import type { ActionId } from '@shared/actions'
import { actionBottom } from '@shared/geometry'
import type { AppState, Attachment } from '@shared/types'
import { ActionStack } from '../components/ActionStack'
import { NotesBox, type SaveState } from '../components/NotesBox'
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
  const { branding } = state

  // The text and attachments are edited here and mirrored to the main process, which saves them.
  const [text, setText] = useState(state.notes.text)
  const [attachments, setAttachments] = useState(state.notes.attachments)
  const [saveState, setSaveState] = useState<SaveState>(state.notes.updatedAt ? 'saved' : 'idle')
  const [settings, setSettings] = useState(state.settings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, showToast] = useToast()

  useEffect(() => window.assist.onNotesSaved(() => setSaveState('saved')), [])
  useEffect(
    () =>
      window.assist.onModeChanged((mode) => {
        if (mode !== 'expanded') setSettingsOpen(false)
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

  function changeText(next: string) {
    setText(next)
    setSaveState('saving')
    window.assist.notes.setText(next)
  }

  async function attachLatest() {
    const result = await window.assist.notes.attachLatestScreenshot()
    if (result.ok) {
      setAttachments(result.notes.attachments)
      setSaveState('saving')
    } else if (result.reason === 'no-screenshots') {
      showToast('No screenshots yet. Take one with the camera button.')
    } else {
      showToast('That screenshot is already attached')
    }
  }

  async function removeAttachment(attachment: Attachment) {
    const notes = await window.assist.notes.removeAttachment(attachment.id)
    setAttachments(notes.attachments)
    setSaveState('saving')
  }

  async function openAttachment(attachment: Attachment) {
    const opened = await window.assist.screenshots.open(attachment.path)
    if (!opened) showToast("That screenshot can't be found", 'error')
  }

  async function clearTextBox() {
    const notes = await window.assist.notes.clear()
    setText(notes.text)
    setAttachments(notes.attachments)
    setSaveState('saving')
    setSettingsOpen(false)
    showToast('Text box cleared')
  }

  // Clicking anywhere else in the panel closes the settings menu.
  function closeSettingsOnOutsideClick(event: PointerEvent) {
    if (!settingsOpen || !(event.target instanceof Element)) return
    if (!event.target.closest('[data-settings-menu], [data-action="settings"]')) {
      setSettingsOpen(false)
    }
  }

  const settingsIndex = branding.actions.indexOf('settings')

  return (
    <div
      className={cn('group relative h-full w-full', !open && 'pointer-events-none')}
      data-open={open ? '' : undefined}
      onPointerDown={closeSettingsOnOutsideClick}
    >
      <NotesBox
        open={open}
        text={text}
        attachments={attachments}
        saveState={saveState}
        toast={toast}
        onTextChange={changeText}
        onAttachLatest={() => void attachLatest()}
        onOpenAttachment={(attachment) => void openAttachment(attachment)}
        onRemoveAttachment={(attachment) => void removeAttachment(attachment)}
      />
      <ActionStack
        actions={branding.actions}
        open={open}
        activeId={settingsOpen ? 'settings' : null}
        onAction={(id) => void runAction(id)}
      />
      {open && settingsOpen && settingsIndex >= 0 && (
        <SettingsMenu
          bottom={actionBottom(settingsIndex)}
          settings={settings}
          branding={branding}
          version={state.version}
          onToggleAutoStart={async () =>
            setSettings(await window.assist.settings.setAutoStart(!settings.autoStart))
          }
          onOpenScreenshotsFolder={() => void window.assist.screenshots.openFolder()}
          onClearTextBox={() => void clearTextBox()}
        />
      )}
    </div>
  )
}
