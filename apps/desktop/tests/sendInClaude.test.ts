import { describe, expect, it } from 'vitest'
import { parseOutcome, questionKey, sendScript } from '../src/main/sendInClaude'

describe('questionKey', () => {
  it("is the question's start, with every run of whitespace made one space", () => {
    expect(questionKey('  Why does\n\n  this\tfail?  ')).toBe('Why does this fail?')
    expect(questionKey('x'.repeat(100))).toHaveLength(60)
  })
})

describe('sendScript', () => {
  const tricky = 'It\'s $(Remove-Item C:\\) `n "quoted" ; exit 0 — 漢字'

  it('carries the question as base64 only, never as PowerShell code', () => {
    const script = sendScript({ question: tricky, paste: false })
    expect(script).not.toContain('Remove-Item')
    expect(script).not.toContain('漢字')
    const base64 = /FromBase64String\('([A-Za-z0-9+/=]+)'\)/.exec(script)?.[1]
    expect(Buffer.from(base64!, 'base64').toString('utf8')).toBe(questionKey(tricky))
  })

  it('only presses keys in Claude Desktop, after finding the question in its text box', () => {
    const script = sendScript({ question: 'Hi', paste: false })
    expect(script).toContain("$processName = 'claude'")
    expect(script).toContain("if (-not (WaitFor 20000 { QuestionBox })) { 'not-ready'; exit }")
    // Every key press comes after a check that the question is still in Claude's focused box.
    const firstKey = script.indexOf('SendWait(')
    expect(firstKey).toBeGreaterThan(script.indexOf("'not-ready'; exit"))
  })

  it('pastes first only when there is a screenshot', () => {
    expect(sendScript({ question: 'Hi', paste: true })).toMatch(
      /if \(\$true\) \{\s+\[System\.Windows\.Forms\.SendKeys\]::SendWait\('\^v'\)/,
    )
    expect(sendScript({ question: 'Hi', paste: false })).toContain('if ($false) {')
  })

  it('takes another process name for tests, but nothing that could break out of the quotes', () => {
    expect(sendScript({ question: 'Hi', paste: false, processName: 'powershell' })).toContain(
      "$processName = 'powershell'",
    )
    expect(() => sendScript({ question: 'Hi', paste: false, processName: "x'; calc; '" })).toThrow()
  })
})

describe('parseOutcome', () => {
  it("reads the script's last line", () => {
    expect(parseOutcome('sent\r\n')).toBe('sent')
    expect(parseOutcome('warning: something\nnot-ready')).toBe('not-ready')
    expect(parseOutcome('focus-lost')).toBe('focus-lost')
    expect(parseOutcome('not-sent')).toBe('not-sent')
  })

  it('treats anything else as a failure', () => {
    expect(parseOutcome('')).toBe('failed')
    expect(parseOutcome('Add-Type : Cannot add type')).toBe('failed')
  })
})
