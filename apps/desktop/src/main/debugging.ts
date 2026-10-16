/**
 * Command-line switches that would let another program on the PC look inside Desktop Assist or
 * drive it: Chromium's remote debugging (the pages, whose bridge reaches Jira with the user's
 * sign-in) and Node's inspector (the main process). An installed copy refuses to start with any
 * of them. Node's are also switched off in the .exe itself (the fuses in electron-builder.cjs).
 */
export const DEBUG_SWITCHES = [
  'remote-debugging-port',
  'remote-debugging-pipe',
  'inspect',
  'inspect-brk',
  'inspect-port',
  'inspect-wait',
]

/** The debugging switches the app was started with, from Electron's `app.commandLine.hasSwitch`. */
export function debugSwitches(hasSwitch: (name: string) => boolean): string[] {
  return DEBUG_SWITCHES.filter((name) => hasSwitch(name))
}
