import { describe, expect, it } from 'vitest'
import { debugSwitches } from '../src/main/debugging'

describe('debugSwitches', () => {
  const started = (...switches: string[]) => debugSwitches((name) => switches.includes(name))

  it("finds Chromium's remote debugging and Node's inspector", () => {
    expect(started('remote-debugging-port')).toEqual(['remote-debugging-port'])
    expect(started('remote-debugging-pipe', 'inspect-brk')).toEqual([
      'remote-debugging-pipe',
      'inspect-brk',
    ])
    expect(started('inspect', 'inspect-port', 'inspect-wait')).toEqual([
      'inspect',
      'inspect-port',
      'inspect-wait',
    ])
  })

  it('lets everything else through', () => {
    expect(started()).toEqual([])
    expect(started('updated', 'force-run', 'allow-file-access-from-files')).toEqual([])
  })
})
