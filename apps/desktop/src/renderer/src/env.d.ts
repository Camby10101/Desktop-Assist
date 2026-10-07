import type { AssistApi } from '@shared/ipc'

declare global {
  interface Window {
    /** Exposed by the preload script (src/preload/index.ts). */
    assist: AssistApi
  }
}

export {}
