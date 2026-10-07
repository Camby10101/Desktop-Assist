import { useEffect, useState } from 'react'

/** A screenshot preview: undefined while loading, null if the file is missing. */
export function useThumbnail(path: string): string | null | undefined {
  const [result, setResult] = useState<{ path: string; url: string | null } | null>(null)

  useEffect(() => {
    let alive = true
    void window.assist.screenshots.thumbnail(path).then((url) => {
      if (alive) setResult({ path, url })
    })
    return () => {
      alive = false
    }
  }, [path])

  return result?.path === path ? result.url : undefined
}
