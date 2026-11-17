import { useEffect, useState } from 'react'
import type { AppState, ChatMessage } from '@shared/types'

/**
 * The app state, kept live for the parts the main process changes on its own: the mode, the
 * character's corner, pose and size, the sign-in status and the chat. (Notes and settings only change through this
 * window's own requests, so the panel tracks their results itself.)
 *
 * Subscriptions start before the state is fetched. Events that arrive before the reply are
 * already reflected in it; events after it are applied on top.
 */
export function useAssistState(): AppState | null {
  const [state, setState] = useState<AppState | null>(null)

  useEffect(() => {
    let alive = true
    const update = (change: (s: AppState) => AppState) =>
      setState((current) => (current ? change(current) : current))
    const unsubscribe = [
      window.assist.onModeChanged((mode) => update((s) => ({ ...s, mode }))),
      window.assist.onPoseChanged((pose) => update((s) => ({ ...s, pose }))),
      window.assist.onCornerChanged((corner) => update((s) => ({ ...s, corner }))),
      window.assist.onSizeChanged((size) => update((s) => ({ ...s, size }))),
      window.assist.onRobeColorChanged((robeColor) =>
        update((s) => ({ ...s, settings: { ...s.settings, robeColor } })),
      ),
      window.assist.onAuthStatus((auth) => update((s) => ({ ...s, auth }))),
      window.assist.onChatMessage((message) =>
        update((s) => ({ ...s, chat: upsert(s.chat, message) })),
      ),
      window.assist.onChatReset(() => update((s) => ({ ...s, chat: [] }))),
    ]
    void window.assist.getState().then((initial) => {
      if (alive) setState(initial)
    })
    return () => {
      alive = false
      for (const off of unsubscribe) off()
    }
  }, [])

  return state
}

function upsert(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const index = messages.findIndex((m) => m.id === message.id)
  if (index === -1) return [...messages, message]
  const next = messages.slice()
  next[index] = message
  return next
}

/**
 * Colours her robe and hat (character.css) with `color`, or, without one, the accent colour. Only
 * her: the panel keeps the company's colour.
 */
export function useRobeColor(color: string | null | undefined): void {
  useEffect(() => {
    const root = document.documentElement.style
    if (color && /^#[0-9a-f]{6}$/i.test(color)) root.setProperty('--color-robe', color)
    else root.removeProperty('--color-robe')
  }, [color])
}

/** Applies the tenant's accent colour to the `accent` Tailwind colour. */
export function useAccentColor(color: string | undefined): void {
  useEffect(() => {
    if (color) document.documentElement.style.setProperty('--color-accent', color)
  }, [color])
}
