import type { AskResult, Attachment } from '@shared/types'
import type { SendOutcome } from './sendInClaude'

/** Claude Desktop's documented link for a new chat. A `q` fills in the prompt; it isn't sent. */
export const NEW_CHAT_LINK = 'claude://claude.ai/new'

/** Claude Desktop cuts a `q` prompt off at about 14,000 characters, so stay under that. */
export const MAX_PROMPT_LENGTH = 12_000

/** The link that opens a new Claude Desktop chat with `text` typed in, ready to send. */
export function newChatLink(text: string): string {
  // encodeURIComponent rather than URLSearchParams, which writes spaces as "+": a reader that
  // decodes with decodeURIComponent would show those as plus signs.
  return text.trim() ? `${NEW_CHAT_LINK}?q=${encodeURIComponent(text)}` : NEW_CHAT_LINK
}

/** What to tell the user when their screenshots are on the clipboard, still to be pasted. */
export function pasteHint(count: number): { title: string; body: string } {
  return {
    title: count === 1 ? 'Screenshot copied' : `${count} screenshots copied as one image`,
    body: 'In Claude, press Ctrl+V to add it to your message, then send.',
  }
}

/** What to tell the user when their question is in Claude but wasn't sent for them. */
export function sendHint(): { title: string; body: string } {
  return { title: 'Your question is in Claude', body: 'Press Enter in Claude to send it.' }
}

export type AskOutcome = { ok: true; screenshots: number } | Extract<AskResult, { ok: false }>

export interface ClaudeDesktopDeps {
  /** Whether anything on this PC opens claude:// links (Claude Desktop registers them). */
  isInstalled(): boolean
  openLink(url: string): Promise<void>
  /** Puts the screenshots on the clipboard as one image. False if one of them is missing. */
  copyScreenshots(paths: string[]): Promise<boolean>
  /** Whether to send the question in Claude for the user (the "Send in Claude" setting). */
  autoSend(): boolean
  /**
   * Once Claude's text box shows the question: presses Ctrl+V when `paste` is set, then Enter.
   * Presses nothing anywhere else (see sendInClaude.ts).
   */
  sendInClaude(question: string, paste: boolean): Promise<SendOutcome>
  /** A Windows notification, e.g. to say the screenshot is ready to paste. */
  notify(message: { title: string; body: string }): void
  onError?(error: unknown): void
}

/**
 * Hands questions over to the Claude Desktop app, so they're answered with the person's own Claude
 * account and count against their own usage limit. A link can carry text but not images, so the
 * screenshots go on the clipboard. A link only fills the question in; with "Send in Claude" on,
 * Desktop Assist then presses Ctrl+V and Enter in Claude for the user.
 */
export class ClaudeDesktop {
  private finishing: Promise<void> = Promise.resolve()

  constructor(private readonly deps: ClaudeDesktopDeps) {}

  /** Checked each time the panel opens, so the panel can say so before anything is typed. */
  isInstalled(): boolean {
    return this.deps.isInstalled()
  }

  /**
   * Opens a new Claude Desktop chat with `text` filled in, with the screenshots ready to paste.
   * Returns once Claude is opening; sending it there (or saying what's left to do) carries on in
   * the background, see idle().
   */
  async ask(text: string, attachments: Attachment[]): Promise<AskOutcome> {
    if (!text.trim() && attachments.length === 0) return { ok: false, reason: 'empty' }
    if (text.length > MAX_PROMPT_LENGTH) return { ok: false, reason: 'too-long' }
    if (!this.deps.isInstalled()) return { ok: false, reason: 'not-installed' }
    try {
      // Copied first, so the screenshot is ready by the time Claude opens.
      const paths = attachments.map((attachment) => attachment.path)
      if (paths.length > 0 && !(await this.deps.copyScreenshots(paths))) {
        return { ok: false, reason: 'missing-screenshot' }
      }
      await this.deps.openLink(newChatLink(text))
    } catch (error) {
      this.deps.onError?.(error)
      return { ok: false, reason: 'failed' }
    }
    this.finishing = this.finish(text, attachments.length)
    return { ok: true, screenshots: attachments.length }
  }

  /** Resolves when the last question has been sent in Claude, or the user told what to do. */
  idle(): Promise<void> {
    return this.finishing
  }

  /**
   * Sends the question in Claude if the setting is on, and otherwise (or if it couldn't) tells
   * the user what's left: pasting the screenshot, or pressing Enter. A screenshot on its own is
   * never sent for them: with no question to look for in Claude's text box, there's no telling it
   * apart from another Claude box.
   */
  private async finish(text: string, screenshots: number): Promise<void> {
    if (!this.deps.autoSend() || !text.trim()) {
      if (screenshots > 0) this.deps.notify(pasteHint(screenshots))
      return
    }
    const outcome = await this.deps
      .sendInClaude(text, screenshots > 0)
      .catch((error: unknown): SendOutcome => {
        this.deps.onError?.(error)
        return 'failed'
      })
    if (outcome === 'sent') return
    // Nothing was pressed: the screenshot (if any) still needs pasting. Otherwise it was pasted
    // and only Enter is left.
    const pasted = outcome === 'focus-lost' || outcome === 'not-sent'
    this.deps.notify(screenshots > 0 && !pasted ? pasteHint(screenshots) : sendHint())
  }
}
