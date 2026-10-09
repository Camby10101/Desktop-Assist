import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

/**
 * How sending the question in Claude Desktop went.
 * - `sent`: the question left Claude's text box after Enter.
 * - `not-ready`: Claude's focused text box never showed the question (Claude didn't come to the
 *   front, or the focus is somewhere else), so nothing was pressed.
 * - `extra-text`: Claude's text box holds the question and something else (Claude adds a linked
 *   question to an unsent draft), so nothing was pressed: the user should check it first.
 * - `focus-lost`: the screenshot was pasted, but then the focus moved away, so Enter wasn't pressed.
 * - `not-sent`: Enter was pressed but the question stayed in the text box.
 * - `failed`: the helper couldn't run.
 */
export type SendOutcome = 'sent' | 'not-ready' | 'extra-text' | 'focus-lost' | 'not-sent' | 'failed'

export interface SendOptions {
  question: string
  /** Press Ctrl+V first, to add the screenshot that was copied to the clipboard. */
  paste: boolean
  /** The process whose text box must hold the question. Tests use another app. */
  processName?: string
  /** How long to wait for Claude to show the question, in ms. */
  readyTimeoutMs?: number
  /** After pasting, how long Claude gets to take the screenshot in before Enter, in ms. */
  pasteSettleMs?: number
}

export const READY_TIMEOUT_MS = 20_000
export const PASTE_SETTLE_MS = 2_500

/**
 * Whitespace as the PowerShell side sees it too (spelled out, because JavaScript's `\s` and
 * .NET's differ on a couple of rare characters).
 */
const WHITESPACE =
  '[\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]+'

/**
 * The question as it's compared with Claude's text box: every run of whitespace made one space
 * and the ends trimmed (Claude's editor may show line breaks differently from the text box here).
 */
export function normalizeQuestion(question: string): string {
  return question.replace(new RegExp(WHITESPACE, 'g'), ' ').trim()
}

/** How to recognise the question in Claude's text box: its start, whitespace evened out. */
export function questionKey(question: string): string {
  return normalizeQuestion(question).slice(0, 60)
}

/**
 * A fingerprint of the whole question, so the helper can tell the text box holds exactly the
 * question (and nothing else) without the question itself going on its command line.
 */
export function questionHash(question: string): string {
  return createHash('sha256').update(normalizeQuestion(question), 'utf8').digest('hex')
}

/**
 * The PowerShell that presses the keys. It uses Windows UI Automation to find the focused text
 * box, and only presses anything while that box belongs to Claude Desktop and already contains the
 * question; so a key never lands in another app, or in another Claude box (such as a Claude Code
 * session in the same window). The question goes in base64, never as PowerShell code.
 */
export function sendScript(options: SendOptions): string {
  const key = Buffer.from(questionKey(options.question), 'utf8').toString('base64')
  const hash = questionHash(options.question)
  const processName = options.processName ?? 'claude'
  if (!/^[\w.-]+$/.test(processName)) throw new Error('Unexpected process name')
  const timeout = Math.round(options.readyTimeoutMs ?? READY_TIMEOUT_MS)
  const settle = Math.round(options.pasteSettleMs ?? PASTE_SETTLE_MS)
  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
$key = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${key}'))
$hash = '${hash}'
$processName = '${processName}'
$sha = [Security.Cryptography.SHA256]::Create()

# What Claude Desktop's focused text box holds: 'exact' (just the question), 'extra' (the question
# and other text), or $null (not Claude's box, or no question in it).
function BoxState {
  try {
    $el = [System.Windows.Automation.AutomationElement]::FocusedElement
    if (-not $el) { return $null }
    if ((Get-Process -Id $el.Current.ProcessId).ProcessName -ne $processName) { return $null }
    $pattern = $null
    $text = ''
    if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
      $text = $pattern.Current.Value
    }
    if (-not $text -and $el.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pattern)) {
      $text = $pattern.DocumentRange.GetText(20000)
    }
    $text = ([string]$text -replace '${WHITESPACE}', ' ').Trim()
    if (-not $text.Contains($key)) { return $null }
    $digest = -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)) | ForEach-Object { $_.ToString('x2') })
    if ($digest -eq $hash) { return 'exact' }
    return 'extra'
  } catch {}
  return $null
}
function QuestionBox { (BoxState) -eq 'exact' }

function WaitFor([int]$ms, [scriptblock]$test) {
  $end = (Get-Date).AddMilliseconds($ms)
  do {
    if (& $test) { return $true }
    Start-Sleep -Milliseconds 200
  } while ((Get-Date) -lt $end)
  return $false
}

if (-not (WaitFor ${timeout} { BoxState })) { 'not-ready'; exit }
# Claude adds a linked question to whatever was already in its text box: send only the question.
if ((BoxState) -eq 'extra') { 'extra-text'; exit }
if (${options.paste ? '$true' : '$false'}) {
  [System.Windows.Forms.SendKeys]::SendWait('^v')
  Start-Sleep -Milliseconds ${settle}
  if (-not (QuestionBox)) { 'focus-lost'; exit }
}
# Enter sends. If the question is still there (Claude may still be taking in a screenshot), try
# again, but only while the box still holds it.
for ($try = 0; $try -lt 3; $try++) {
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  if (WaitFor 2000 { -not (QuestionBox) }) { 'sent'; exit }
}
'not-sent'
`
}

const OUTCOMES: SendOutcome[] = ['sent', 'not-ready', 'extra-text', 'focus-lost', 'not-sent']

/** The outcome the script printed last, or `failed`. */
export function parseOutcome(output: string): SendOutcome {
  const last = output.trim().split(/\r?\n/).at(-1)?.trim()
  return OUTCOMES.find((outcome) => outcome === last) ?? 'failed'
}

/**
 * Sends the question in Claude Desktop: waits until Claude's text box shows it, then presses
 * Ctrl+V (when there's a screenshot) and Enter. Runs the script in Windows PowerShell, hidden.
 */
export function sendInClaude(options: SendOptions): Promise<SendOutcome> {
  const script = sendScript(options)
  const powershell = join(
    process.env['SystemRoot'] ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  )
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const timeoutMs = (options.readyTimeoutMs ?? READY_TIMEOUT_MS) + 30_000
  return new Promise((resolve, reject) => {
    const child = spawn(
      powershell,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: timeoutMs },
    )
    let output = ''
    let errors = ''
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (errors += chunk.toString()))
    child.on('error', reject)
    child.on('close', (code) => {
      const outcome = parseOutcome(output)
      if (outcome === 'failed') {
        reject(
          new Error(`Sending in Claude failed (exit ${code}): ${errors.trim() || output.trim()}`),
        )
      } else resolve(outcome)
    })
  })
}
