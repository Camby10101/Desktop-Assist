import { describe, expect, it } from 'vitest'
import {
  FRONT_CHECKS_MS,
  describe as describeCheck,
  frontCheckScript,
  needsHelp,
  parseFrontCheck,
  watchBubbleFront,
  type FrontCheck,
} from '../src/main/bubble/frontCheck'

const IN_FRONT: FrontCheck = {
  visible: true,
  topmost: true,
  cloaked: false,
  inFront: true,
  coveredBy: null,
}
const BEHIND: FrontCheck = { ...IN_FRONT, inFront: false, coveredBy: 'chrome' }

describe('reading the check', () => {
  it('reads the JSON the script prints last', () => {
    expect(
      parseFrontCheck(
        'some warning\r\n{"visible":true,"topmost":true,"cloaked":false,"inFront":false,"coveredBy":"chrome"}\r\n',
      ),
    ).toEqual(BEHIND)
    expect(parseFrontCheck('')).toBeNull()
    expect(parseFrontCheck('{"visible":true}')).toBeNull()
  })

  it('only takes a window handle made of digits, and names the app it belongs to', () => {
    expect(() => frontCheckScript('123; Remove-Item', 1)).toThrow()
    const script = frontCheckScript('459634', 4242)
    expect(script).toContain("[IntPtr][long]'459634'")
    expect(script).toContain('$owner -eq 4242')
  })

  it('says what was wrong', () => {
    expect(needsHelp(IN_FRONT)).toBe(false)
    expect(needsHelp(BEHIND)).toBe(true)
    expect(needsHelp({ ...IN_FRONT, topmost: false })).toBe(true)
    expect(needsHelp({ ...IN_FRONT, cloaked: true })).toBe(true)
    expect(needsHelp({ ...BEHIND, visible: false })).toBe(false) // hidden on purpose
    expect(describeCheck({ ...BEHIND, topmost: false, cloaked: true })).toBe(
      'behind chrome, not always on top, hidden by Windows',
    )
  })
})

/** Runs the watch with a clock the test moves on by hand. */
function watch(answers: (FrontCheck | Error)[], resting: () => boolean = () => true) {
  const timers: { at: number; run: () => void }[] = []
  let now = 0
  const world = { checks: 0, brought: [] as boolean[], logged: [] as string[] }
  const stop = watchBubbleFront({
    isResting: resting,
    check: async () => {
      const answer = answers[Math.min(world.checks++, answers.length - 1)]!
      if (answer instanceof Error) throw answer
      return answer
    },
    bringToFront: (reshow) => world.brought.push(reshow),
    log: (message) => world.logged.push(message),
    setTimeout: (run, ms) => timers.push({ at: now + ms, run }),
  })
  /** Moves the clock to `ms`, running what's due (and letting the checks finish). */
  const until = async (ms: number) => {
    for (;;) {
      timers.sort((a, b) => a.at - b.at)
      const next = timers[0]
      if (!next || next.at > ms) break
      timers.shift()
      now = next.at
      next.run()
      for (let i = 0; i < 10; i++) await Promise.resolve()
    }
    now = ms
  }
  return { world, until, stop }
}

describe('watchBubbleFront', () => {
  it('checks at 5 s, 20 s, 1, 3 and 10 minutes, and says nothing while all is well', async () => {
    const { world, until } = watch([IN_FRONT])
    expect(FRONT_CHECKS_MS).toEqual([5_000, 20_000, 60_000, 180_000, 600_000])
    await until(4_999)
    expect(world.checks).toBe(0)
    await until(600_000)
    expect(world.checks).toBe(5)
    expect(world.brought).toEqual([])
    expect(world.logged).toEqual([])
  })

  it("brings a bubble that's behind another app back to the front, and logs it", async () => {
    const { world, until } = watch([BEHIND, IN_FRONT])
    await until(6_000)
    expect(world.brought).toEqual([true])
    expect(world.logged).toEqual([
      'Bubble check 5 s after starting: behind chrome. Brought back to the front.',
    ])
  })

  it('only puts it back on top (no hide and show) when it was just not on top', async () => {
    const { world, until } = watch([{ ...IN_FRONT, topmost: false }, IN_FRONT])
    await until(6_000)
    expect(world.brought).toEqual([false])
  })

  it('says so when it still is not in front', async () => {
    const { world, until } = watch([BEHIND])
    await until(6_000)
    expect(world.logged).toEqual([
      'Bubble check 5 s after starting: behind chrome. Still behind chrome.',
    ])
  })

  it('waits while the bubble is open or moving, and logs a check that failed', async () => {
    let resting = false
    const { world, until } = watch([new Error('no PowerShell')], () => resting)
    await until(10_000)
    expect(world.checks).toBe(0)
    resting = true
    await until(20_000)
    expect(world.logged).toEqual(['Bubble check 20 s after starting failed:'])
    // The 5 s check, put off while the bubble was open, comes a minute later.
    await until(65_000)
    expect(world.logged).toContain('Bubble check 5 s after starting failed:')
  })

  it('stops', async () => {
    const { world, until, stop } = watch([BEHIND])
    stop()
    await until(600_000)
    expect(world.checks).toBe(0)
  })
})
