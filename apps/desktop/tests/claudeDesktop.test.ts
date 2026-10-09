import { describe, expect, it, vi } from 'vitest'
import type { Attachment } from '@shared/types'
import {
  ClaudeDesktop,
  MAX_PROMPT_LENGTH,
  newChatLink,
  extraTextHint,
  pasteHint,
  sendHint,
  type ClaudeDesktopDeps,
} from '../src/main/claudeDesktop'
import type { SendOutcome } from '../src/main/sendInClaude'

function attachment(name: string): Attachment {
  return {
    id: name,
    path: `C:\\Pictures\\Desktop Assist\\${name}`,
    fileName: name,
    addedAt: '2026-10-09T10:00:00.000Z',
  }
}

/**
 * A Claude Desktop that's installed and opens links, recording what happened in order. "Send in
 * Claude" is off unless `sendOutcome` says what sending there comes to.
 */
function fakeDeps(overrides: Partial<ClaudeDesktopDeps> = {}, sendOutcome?: SendOutcome) {
  const events: string[] = []
  const deps: ClaudeDesktopDeps = {
    isInstalled: () => true,
    openLink: vi.fn(async (url: string) => void events.push(`open ${url}`)),
    copyScreenshots: vi.fn(async (paths: string[]) => {
      events.push(`copy ${paths.length}`)
      return true
    }),
    autoSend: () => sendOutcome !== undefined,
    sendInClaude: vi.fn(async (_question: string, paste: boolean) => {
      events.push(`send${paste ? ' with paste' : ''}`)
      return sendOutcome ?? 'failed'
    }),
    notify: vi.fn((message: { title: string }) => void events.push(`notify ${message.title}`)),
    onError: vi.fn(),
    ...overrides,
  }
  return { deps, events }
}

describe('newChatLink', () => {
  it("opens a new chat, with the text filled in as Claude Desktop's documented q parameter", () => {
    expect(newChatLink('Hello')).toBe('claude://claude.ai/new?q=Hello')
  })

  it('encodes spaces as %20 (not +), and every character that means something in a link', () => {
    const link = newChatLink('a b+c&d=e#f?g%h/i\nj')
    expect(link).toBe('claude://claude.ai/new?q=a%20b%2Bc%26d%3De%23f%3Fg%25h%2Fi%0Aj')
    expect(link).not.toContain('+')
  })

  it('round-trips any text, including emoji and other scripts', () => {
    const text = 'Wi-Fi HaLow 📶 — „Größe“ 漢字\n\tindent'
    const q = new URL(newChatLink(text)).search.slice('?q='.length)
    expect(decodeURIComponent(q)).toBe(text)
  })

  it('leaves the prompt out when there is no text', () => {
    expect(newChatLink('')).toBe('claude://claude.ai/new')
    expect(newChatLink('  \n ')).toBe('claude://claude.ai/new')
  })
})

describe('pasteHint', () => {
  it('says how many screenshots were copied and how to paste them', () => {
    expect(pasteHint(1).title).toBe('Screenshot copied')
    expect(pasteHint(3).title).toBe('3 screenshots copied as one image')
    expect(pasteHint(1).body).toContain('Ctrl+V')
  })
})

describe('sendHint', () => {
  it('says to press Enter in Claude', () => {
    expect(sendHint().body).toContain('Enter')
  })
})

describe('ClaudeDesktop.ask', () => {
  it('opens a new chat with the text, and no screenshot or notification when none is attached', async () => {
    const { deps, events } = fakeDeps()
    const claude = new ClaudeDesktop(deps)
    const result = await claude.ask('What is HaLow?', [])
    await claude.idle()
    expect(result).toEqual({ ok: true, screenshots: 0 })
    expect(events).toEqual(['open claude://claude.ai/new?q=What%20is%20HaLow%3F'])
  })

  it('copies the screenshots before opening Claude, then says to paste them', async () => {
    const { deps, events } = fakeDeps()
    const shots = [attachment('a.png'), attachment('b.png')]
    const claude = new ClaudeDesktop(deps)
    const result = await claude.ask('Why does this fail?', shots)
    await claude.idle()
    expect(result).toEqual({ ok: true, screenshots: 2 })
    expect(events).toEqual([
      'copy 2',
      'open claude://claude.ai/new?q=Why%20does%20this%20fail%3F',
      'notify 2 screenshots copied as one image',
    ])
    expect(deps.copyScreenshots).toHaveBeenCalledWith(shots.map((s) => s.path))
  })

  it('can send just a screenshot, opening an empty chat', async () => {
    const { deps, events } = fakeDeps()
    const claude = new ClaudeDesktop(deps)
    const result = await claude.ask('   ', [attachment('a.png')])
    await claude.idle()
    expect(result.ok).toBe(true)
    expect(events).toEqual(['copy 1', 'open claude://claude.ai/new', 'notify Screenshot copied'])
  })

  it('does nothing without text or screenshots', async () => {
    const { deps, events } = fakeDeps()
    expect(await new ClaudeDesktop(deps).ask(' ', [])).toEqual({ ok: false, reason: 'empty' })
    expect(events).toEqual([])
  })

  it('refuses text longer than Claude Desktop takes in a link', async () => {
    const { deps, events } = fakeDeps()
    const claude = new ClaudeDesktop(deps)
    expect((await claude.ask('x'.repeat(MAX_PROMPT_LENGTH), [])).ok).toBe(true)
    events.length = 0
    expect(await claude.ask('x'.repeat(MAX_PROMPT_LENGTH + 1), [])).toEqual({
      ok: false,
      reason: 'too-long',
    })
    expect(events).toEqual([])
  })

  it("says so when Claude Desktop isn't installed, without touching the clipboard", async () => {
    const { deps, events } = fakeDeps({ isInstalled: () => false })
    const result = await new ClaudeDesktop(deps).ask('Hi', [attachment('a.png')])
    expect(result).toEqual({ ok: false, reason: 'not-installed' })
    expect(events).toEqual([])
  })

  it("doesn't open Claude when an attached screenshot is missing", async () => {
    const { deps, events } = fakeDeps({ copyScreenshots: async () => false })
    const result = await new ClaudeDesktop(deps).ask('Hi', [attachment('gone.png')])
    expect(result).toEqual({ ok: false, reason: 'missing-screenshot' })
    expect(events).toEqual([])
  })

  it('reports a link Windows could not open, and logs why', async () => {
    const failure = new Error('No application is associated')
    const { deps } = fakeDeps({ openLink: async () => Promise.reject(failure) })
    const result = await new ClaudeDesktop(deps).ask('Hi', [attachment('a.png')])
    expect(result).toEqual({ ok: false, reason: 'failed' })
    expect(deps.onError).toHaveBeenCalledWith(failure)
    expect(deps.notify).not.toHaveBeenCalled()
  })

  it('reports a screenshot that could not be copied as a failure', async () => {
    const failure = new Error('Clipboard is busy')
    const { deps, events } = fakeDeps({ copyScreenshots: async () => Promise.reject(failure) })
    const result = await new ClaudeDesktop(deps).ask('Hi', [attachment('a.png')])
    expect(result).toEqual({ ok: false, reason: 'failed' })
    expect(deps.onError).toHaveBeenCalledWith(failure)
    expect(events).toEqual([])
  })
})

describe('ClaudeDesktop.ask with "Send in Claude" on', () => {
  async function ask(text: string, shots: Attachment[], outcome: SendOutcome, overrides = {}) {
    const { deps, events } = fakeDeps(overrides, outcome)
    const claude = new ClaudeDesktop(deps)
    const result = await claude.ask(text, shots)
    await claude.idle()
    return { deps, events, result }
  }

  it('sends the question in Claude, and says nothing more when it went', async () => {
    const { deps, events, result } = await ask('What is HaLow?', [], 'sent')
    expect(result).toEqual({ ok: true, screenshots: 0 })
    expect(events).toEqual(['open claude://claude.ai/new?q=What%20is%20HaLow%3F', 'send'])
    expect(deps.sendInClaude).toHaveBeenCalledWith('What is HaLow?', false)
  })

  it('pastes the screenshots before sending', async () => {
    const { events } = await ask('Why?', [attachment('a.png')], 'sent')
    expect(events).toEqual(['copy 1', 'open claude://claude.ai/new?q=Why%3F', 'send with paste'])
  })

  it('returns as soon as Claude is opening, while sending carries on', async () => {
    let finishSending: (outcome: SendOutcome) => void = () => {}
    const { deps, events } = fakeDeps(
      { sendInClaude: () => new Promise<SendOutcome>((resolve) => (finishSending = resolve)) },
      'sent',
    )
    const claude = new ClaudeDesktop(deps)
    expect(await claude.ask('Hi', [])).toEqual({ ok: true, screenshots: 0 })
    let done = false
    void claude.idle().then(() => (done = true))
    await Promise.resolve()
    expect(done).toBe(false)
    finishSending('sent')
    await claude.idle()
    expect(events).toEqual(['open claude://claude.ai/new?q=Hi'])
  })

  it("when Claude never showed the question, says what's left: paste and send", async () => {
    const withShot = await ask('Why?', [attachment('a.png')], 'not-ready')
    expect(withShot.events.at(-1)).toBe('notify Screenshot copied')
    const textOnly = await ask('Why?', [], 'not-ready')
    expect(textOnly.events.at(-1)).toBe(`notify ${sendHint().title}`)
  })

  it("when Claude's box already had other text, sends nothing and says to check it", async () => {
    const { events } = await ask('Why?', [attachment('a.png')], 'extra-text')
    expect(events.at(-1)).toBe(`notify ${extraTextHint(1).title}`)
    expect(extraTextHint(1).body).toContain('Ctrl+V')
    expect(extraTextHint(0).body).not.toContain('Ctrl+V')
  })

  it('when the screenshot was pasted but not sent, says to press Enter', async () => {
    for (const outcome of ['focus-lost', 'not-sent'] as const) {
      const { events } = await ask('Why?', [attachment('a.png')], outcome)
      expect(events.at(-1)).toBe(`notify ${sendHint().title}`)
    }
  })

  it('logs a helper that could not run, and falls back to the hint', async () => {
    const failure = new Error('PowerShell is blocked')
    const { deps, events } = await ask('Why?', [], 'sent', {
      sendInClaude: () => Promise.reject(failure),
    })
    expect(deps.onError).toHaveBeenCalledWith(failure)
    expect(events.at(-1)).toBe(`notify ${sendHint().title}`)
  })

  it('never sends a screenshot on its own: there is no question to find in Claude', async () => {
    const { deps, events } = await ask('  ', [attachment('a.png')], 'sent')
    expect(deps.sendInClaude).not.toHaveBeenCalled()
    expect(events).toEqual(['copy 1', 'open claude://claude.ai/new', 'notify Screenshot copied'])
  })
})
