import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { z } from 'zod'

// Looking at Windows' own shell from the outside, through UI Automation (the accessibility
// interface screen readers use), in a PowerShell kept running while it's needed: where the
// taskbar's buttons are, and the windows on the screen and where they are (their frames as drawn,
// without Windows' invisible borders), which is in front of which, and which are cloaked (there
// but not shown: on another virtual desktop, or a suspended app). It only reads; it never clicks,
// moves or changes anything. Coordinates come back in physical pixels (the script is per-monitor
// DPI aware); the main process turns them into DIPs.

/** The PowerShell script: answers one request a line on stdin with one line of JSON on stdout. */
export const PROBE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class Probe {
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT v, int s);
  public static Dictionary<long, int> Order() {
    var order = new Dictionary<long, int>(); int i = 0;
    EnumWindows((h, l) => { order[h.ToInt64()] = i++; return true; }, IntPtr.Zero);
    return order;
  }
  public static bool Cloaked(long h) { int v; return DwmGetWindowAttribute(new IntPtr(h), 14, out v, 4) == 0 && v != 0; }
  public static int[] Frame(long h) {
    RECT r;
    if (DwmGetWindowAttribute(new IntPtr(h), 9, out r, 16) != 0 || r.R <= r.L || r.B <= r.T) return null;
    return new int[] { r.L, r.T, r.R - r.L, r.B - r.T };
  }
}
'@
[void][Probe]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$A = [Windows.Automation.AutomationElement]
$Children = [Windows.Automation.TreeScope]::Children
$Descendants = [Windows.Automation.TreeScope]::Descendants
function Box($e) {
  $r = $e.Current.BoundingRectangle
  if ($r.IsEmpty -or [double]::IsInfinity($r.Width)) { return $null }
  @{ x = [int]$r.X; y = [int]$r.Y; width = [int]$r.Width; height = [int]$r.Height }
}
# A window's frame as it's drawn (DWM's extended frame bounds, without the invisible borders round
# it for resizing), or its UI Automation box if Windows won't say.
function Frame([long]$h, $e) {
  $f = [Probe]::Frame($h)
  if ($f) { return @{ x = $f[0]; y = $f[1]; width = $f[2]; height = $f[3] } }
  Box $e
}
function State($w) {
  $p = $null
  if ($w.TryGetCurrentPattern([Windows.Automation.WindowPattern]::Pattern, [ref]$p)) { return $p.Current.WindowVisualState.ToString().ToLower() }
  'normal'
}
function Taskbar {
  foreach ($class in 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd') {
    $bars = $A::RootElement.FindAll($Children, (New-Object Windows.Automation.PropertyCondition ($A::ClassNameProperty, $class)))
    foreach ($bar in $bars) {
      $barBox = Box $bar
      $buttons = $bar.FindAll($Descendants, (New-Object Windows.Automation.PropertyCondition ($A::ControlTypeProperty, [Windows.Automation.ControlType]::Button)))
      foreach ($b in $buttons) {
        $box = Box $b
        if ($box) { @{ name = $b.Current.Name; rect = $box; bar = $barBox } }
      }
    }
  }
}
function Windows {
  $order = [Probe]::Order()
  $wins = $A::RootElement.FindAll($Children, (New-Object Windows.Automation.PropertyCondition ($A::ControlTypeProperty, [Windows.Automation.ControlType]::Window)))
  foreach ($w in $wins) {
    try {
      $h = [long]$w.Current.NativeWindowHandle
      $box = Frame $h $w
      $z = -1
      if ($order.ContainsKey($h)) { $z = $order[$h] }
      if ($box) { @{ handle = $h; name = $w.Current.Name; className = $w.Current.ClassName; pid = $w.Current.ProcessId; state = (State $w); rect = $box; z = $z; cloaked = [Probe]::Cloaked($h) } }
    } catch {}
  }
}
function OneWindow([long]$h) {
  try { $w = $A::FromHandle([IntPtr]::new($h)); @{ handle = $h; state = (State $w); rect = (Frame $h $w) } }
  catch { @{ handle = $h; state = 'gone'; rect = $null } }
}
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $parts = $line.Split(' ')
  try {
    switch ($parts[1]) {
      'taskbar' { $result = @(Taskbar) }
      'windows' { $result = @(Windows) }
      'window' { $result = OneWindow ([long]$parts[2]) }
      default { $result = $null }
    }
    $json = ConvertTo-Json -InputObject @{ id = $parts[0]; ok = $true; result = $result } -Compress -Depth 6
  } catch {
    $json = ConvertTo-Json -InputObject @{ id = $parts[0]; ok = $false; error = $_.Exception.Message } -Compress
  }
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
}
`

const Box = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
export type PhysicalRect = z.infer<typeof Box>

export const TaskbarButton = z.object({ name: z.string(), rect: Box, bar: Box.nullable() })
export type TaskbarButton = z.infer<typeof TaskbarButton>

export const ShellWindow = z.object({
  handle: z.number(),
  name: z.string(),
  className: z.string(),
  pid: z.number(),
  state: z.string(),
  rect: Box,
  /** Its place front to back (0 is in front of all the others); -1 or missing: not known. */
  z: z.number().optional(),
  /** There but not shown (on another virtual desktop, a suspended app). */
  cloaked: z.boolean().optional(),
})
export type ShellWindow = z.infer<typeof ShellWindow>

const WindowNow = z.object({ handle: z.number(), state: z.string(), rect: Box.nullable() })
export type WindowNow = z.infer<typeof WindowNow>

const Answer = z.object({
  id: z.string(),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().optional(),
})

/** Starts the PowerShell (index.ts spawns it, hidden). */
export type SpawnProbe = (encodedScript: string) => ChildProcessWithoutNullStreams

export interface ShellProbeDeps {
  spawn: SpawnProbe
  /** Unused this long (ms), the PowerShell is stopped; it starts again when it's next needed. */
  idleMs?: number
  /** A request unanswered this long (ms) fails. */
  timeoutMs?: number
}

/** The script as PowerShell's -EncodedCommand takes it: UTF-16LE, base64. */
export const encodeScript = (script: string): string =>
  Buffer.from(script, 'utf16le').toString('base64')

/**
 * The PowerShell that looks at the shell (see PROBE_SCRIPT), started when first asked and stopped
 * after a while unused. Each request is a line out and a line of JSON back, matched by number.
 */
export class ShellProbe {
  private child: ChildProcessWithoutNullStreams | null = null
  private pending = new Map<
    string,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  private nextId = 1
  private idleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly deps: ShellProbeDeps) {}

  /** The taskbars' buttons (of every display), in physical pixels. */
  async taskbar(): Promise<TaskbarButton[]> {
    return z.array(TaskbarButton).parse(await this.ask('taskbar'))
  }

  /** The top-level windows, in physical pixels. */
  async windows(): Promise<ShellWindow[]> {
    const all = z.array(z.unknown()).parse(await this.ask('windows'))
    return all.flatMap((w) => {
      const parsed = ShellWindow.safeParse(w)
      return parsed.success ? [parsed.data] : []
    })
  }

  /** One window now: where it is and its state (`gone` if it's closed). */
  async window(handle: number): Promise<WindowNow> {
    if (!Number.isSafeInteger(handle)) throw new Error('Not a window handle')
    return WindowNow.parse(await this.ask(`window ${handle}`))
  }

  /** Stops the PowerShell now (the app is quitting). */
  dispose(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    this.stop(new Error('Stopped'))
  }

  private ask(request: string): Promise<unknown> {
    const child = this.start()
    const id = String(this.nextId++)
    this.keepAlive()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`The shell didn't answer "${request}"`))
      }, this.deps.timeoutMs ?? 8000)
      this.pending.set(id, { resolve, reject, timer })
      child.stdin.write(`${id} ${request}\n`)
    })
  }

  private start(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child
    const child = this.deps.spawn(encodeScript(PROBE_SCRIPT))
    createInterface({ input: child.stdout }).on('line', (line) => {
      let answer: z.infer<typeof Answer>
      try {
        answer = Answer.parse(JSON.parse(line))
      } catch {
        return
      }
      const waiting = this.pending.get(answer.id)
      if (!waiting) return
      this.pending.delete(answer.id)
      clearTimeout(waiting.timer)
      if (answer.ok) waiting.resolve(answer.result ?? null)
      else waiting.reject(new Error(answer.error ?? 'The shell failed'))
    })
    child.on('exit', () => {
      if (this.child === child) this.child = null
      this.stop(new Error('The shell stopped'))
    })
    child.on('error', () => {
      if (this.child === child) this.child = null
      this.stop(new Error("The shell couldn't start"))
    })
    this.child = child
    return child
  }

  private keepAlive(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => this.stop(new Error('Idle')), this.deps.idleMs ?? 120_000)
  }

  private stop(reason: Error): void {
    for (const [id, waiting] of this.pending) {
      clearTimeout(waiting.timer)
      waiting.reject(reason)
      this.pending.delete(id)
    }
    const child = this.child
    this.child = null
    if (child && !child.killed) {
      child.stdin.end()
      child.kill()
    }
  }
}
