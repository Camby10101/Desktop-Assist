import { describe, expect, it } from 'vitest'
import { screenshotLabel } from '@shared/format'

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
