import { useCallback, useEffect, useState } from 'react'

export interface ToastMessage {
  id: number
  text: string
  tone: 'info' | 'error'
}

const TOAST_MS = 2600

/** One short-lived message at a time; a new one replaces the old. */
export function useToast(): [
  ToastMessage | null,
  (text: string, tone?: ToastMessage['tone']) => void,
] {
  const [toast, setToast] = useState<ToastMessage | null>(null)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const show = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    setToast({ id: Date.now(), text, tone })
  }, [])

  return [toast, show]
}
