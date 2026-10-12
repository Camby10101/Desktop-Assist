import { describe, expect, it } from 'vitest'
import { screenshotLabel, timeAgo } from '@shared/format'

const now = new Date(2026, 9, 2, 18, 0, 0)

describe('screenshotLabel', () => {
  it('shows just the time for screenshots taken today', () => {
    expect(screenshotLabel('Screenshot 2026-10-02 140311.png', now)).toBe('Screenshot 14:03')
  })

  it('adds the date for older screenshots', () => {
    expect(screenshotLabel('Screenshot 2026-09-28 090502 (2).png', now)).toBe(
      'Screenshot 28 Sep 09:05',
    )
  })

  it('falls back to the file name', () => {
    expect(screenshotLabel('holiday.png', now)).toBe('holiday.png')
  })
})

describe('timeAgo', () => {
  const now = new Date(2026, 9, 12, 12, 0, 0)
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
  it('says how long ago, briefly', () => {
    expect(timeAgo(ago(20_000), now)).toBe('just now')
    expect(timeAgo(ago(5 * 60_000), now)).toBe('5m ago')
    expect(timeAgo(ago(3 * 3_600_000), now)).toBe('3h ago')
    expect(timeAgo(ago(2 * 86_400_000), now)).toBe('2d ago')
    expect(timeAgo(new Date(2026, 8, 12, 9).toISOString(), now)).toBe('12 Sep')
    expect(timeAgo(new Date(2025, 8, 12, 9).toISOString(), now)).toBe('12 Sep 2025')
    expect(timeAgo('not a date', now)).toBe('')
  })
})
