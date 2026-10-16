import { spawn } from 'node:child_process'
import { join } from 'node:path'

// Making sure the bubble can be seen after Desktop Assist starts. Started by Windows at sign-in,
// after other apps, the bubble could sit behind them although its window was always on top, until
// the user minimised everything and restored it. So for its first ten minutes the app asks Windows
// what's at the bubble's centre, and if it isn't the bubble, brings the bubble back to the front
// and says so in the log.

/** When the bubble is checked, counted from when it first appears. */
export const FRONT_CHECKS_MS = [5_000, 20_000, 60_000, 180_000, 600_000]

/** What Windows says about the bubble's window. */
export interface FrontCheck {
  /** Shown (IsWindowVisible). */
  visible: boolean
  /** Always on top (the WS_EX_TOPMOST style). */
  topmost: boolean
  /** Hidden by Windows' compositor (DWMWA_CLOAKED), which can happen while the desktop starts. */
  cloaked: boolean
  /** The window at the bubble's centre is the bubble's own (or another of this app's). */
  inFront: boolean
  /** The app whose window is there instead, if it isn't. */
  coveredBy: string | null
}

/**
 * The PowerShell that asks Windows. It finds the window at the centre of the bubble's window
 * (WindowFromPoint, then its top-level window) and compares it with the bubble's. Prints one line
 * of JSON. It only reads: it never moves or changes a window.
 */
export function frontCheckScript(hwnd: string, appPid: number): string {
  if (!/^\d+$/.test(hwnd)) throw new Error('Unexpected window handle')
  return `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class DaFront {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h, int index);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint processId);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attribute, out int value, int size);
}
"@
# Real pixels for both the window's place and the point looked at, whatever each screen's scaling.
try { [void][DaFront]::SetProcessDpiAwarenessContext([IntPtr]-4) } catch {}
$bubble = [IntPtr][long]'${hwnd}'
$rect = New-Object DaFront+RECT
[void][DaFront]::GetWindowRect($bubble, [ref]$rect)
$centre = New-Object DaFront+POINT
$centre.X = [int](($rect.Left + $rect.Right) / 2)
$centre.Y = [int](($rect.Top + $rect.Bottom) / 2)
$there = [DaFront]::GetAncestor([DaFront]::WindowFromPoint($centre), 2)
$owner = [uint32]0
[void][DaFront]::GetWindowThreadProcessId($there, [ref]$owner)
$inFront = ($there -eq $bubble) -or ($owner -eq ${appPid})
$coveredBy = $null
if (-not $inFront) {
  try { $coveredBy = (Get-Process -Id $owner).ProcessName } catch { $coveredBy = "process $owner" }
}
$cloaked = 0
[void][DaFront]::DwmGetWindowAttribute($bubble, 14, [ref]$cloaked, 4)
[pscustomobject]@{
  visible = [DaFront]::IsWindowVisible($bubble)
  topmost = (([DaFront]::GetWindowLongPtr($bubble, -20).ToInt64() -band 8) -ne 0)
  cloaked = ($cloaked -ne 0)
  inFront = [bool]$inFront
  coveredBy = $coveredBy
} | ConvertTo-Json -Compress
`
}

/** The check's answer: the JSON on the last line it printed. Null if there isn't any. */
export function parseFrontCheck(output: string): FrontCheck | null {
  const last = output.trim().split(/\r?\n/).at(-1)?.trim() ?? ''
  try {
    const value = JSON.parse(last) as Record<string, unknown>
    if (typeof value['inFront'] !== 'boolean') return null
    return {
      visible: value['visible'] === true,
      topmost: value['topmost'] === true,
      cloaked: value['cloaked'] === true,
      inFront: value['inFront'],
      coveredBy: typeof value['coveredBy'] === 'string' ? value['coveredBy'] : null,
    }
  } catch {
    return null
  }
}

/** Runs the check in Windows PowerShell, hidden. */
export function runFrontCheck(hwnd: string, appPid: number): Promise<FrontCheck> {
  const powershell = join(
    process.env['SystemRoot'] ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  )
  const encoded = Buffer.from(frontCheckScript(hwnd, appPid), 'utf16le').toString('base64')
  return new Promise((resolve, reject) => {
    const child = spawn(
      powershell,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: 30_000 },
    )
    let output = ''
    let errors = ''
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (errors += chunk.toString()))
    child.on('error', reject)
    child.on('close', (code) => {
      const check = parseFrontCheck(output)
      if (check) resolve(check)
      else
        reject(
          new Error(`The bubble check failed (exit ${code}): ${errors.trim() || output.trim()}`),
        )
    })
  })
}

/** Whether the check found anything wrong with a shown bubble. */
export function needsHelp(check: FrontCheck): boolean {
  return check.visible && (!check.inFront || !check.topmost || check.cloaked)
}

/** In words, for the log: "behind Chrome, not always on top". */
export function describe(check: FrontCheck): string {
  const parts = [
    check.inFront ? 'in front' : `behind ${check.coveredBy ?? 'another window'}`,
    !check.topmost && 'not always on top',
    check.cloaked && 'hidden by Windows',
  ].filter(Boolean)
  return parts.join(', ')
}

export interface FrontWatchDeps {
  /** Whether the bubble is resting in its corner (checks wait while it's open, dragged, …). */
  isResting(): boolean
  check(): Promise<FrontCheck>
  /** Puts the bubble back on top and in front. `reshow` also hides and shows it again. */
  bringToFront(reshow: boolean): void
  log(message: string, error?: unknown): void
  /** Tests replace the clock. */
  setTimeout?(run: () => void, ms: number): unknown
}

/**
 * Checks the bubble at FRONT_CHECKS_MS after it first appears and, whenever it's not in front,
 * brings it back and checks again. Logs only when something was wrong. Returns a function that
 * stops any checks still to come.
 */
export function watchBubbleFront(deps: FrontWatchDeps): () => void {
  const later = deps.setTimeout ?? ((run: () => void, ms: number) => setTimeout(run, ms).unref())
  let stopped = false
  const checkNow = async (when: string): Promise<void> => {
    if (stopped) return
    // Open, dragged or bouncing: the user can see it. Look again in a minute.
    if (!deps.isResting()) {
      later(() => void checkNow(when), 60_000)
      return
    }
    try {
      const before = await deps.check()
      if (!needsHelp(before)) return
      deps.bringToFront(before.cloaked || !before.inFront)
      await new Promise<void>((resolve) => later(resolve, 1000))
      const after = await deps.check()
      deps.log(
        `Bubble check ${when} after starting: ${describe(before)}. ` +
          (needsHelp(after) ? `Still ${describe(after)}.` : 'Brought back to the front.'),
      )
    } catch (error) {
      deps.log(`Bubble check ${when} after starting failed:`, error)
    }
  }
  for (const ms of FRONT_CHECKS_MS) {
    later(() => void checkNow(ms < 60_000 ? `${ms / 1000} s` : `${ms / 60_000} min`), ms)
  }
  return () => {
    stopped = true
  }
}
