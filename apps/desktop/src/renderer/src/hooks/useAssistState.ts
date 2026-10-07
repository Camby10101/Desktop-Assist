import { useEffect, useState } from 'react'
import type { AppState, Mode } from '@shared/types'

/**
 * The app state as of startup, with `mode` kept live. Everything else in the state only
 * changes through this window's own requests, so their results are tracked locally.
 */
export function useAssistState(): AppState | null {
  const [state, setState] = useState<AppState | null>(null)
  const [mode, setMode] = useState<Mode | null>(null)

  useEffect(() => {
    let alive = true
    // Subscribe first. Events that beat the reply are already reflected in it.
    const unsubscribe = window.assist.onModeChanged(setMode)
    void window.assist.getState().then((initial) => {
      if (!alive) return
      setState(initial)
      setMode(initial.mode)
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  return state && mode ? { ...state, mode } : null
}

/** Applies the tenant's accent colour to the `accent` Tailwind colour. */
export function useAccentColor(color: string | undefined): void {
  useEffect(() => {
    if (color) document.documentElement.style.setProperty('--color-accent', color)
  }, [color])
}
