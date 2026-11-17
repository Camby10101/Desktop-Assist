import { describe, expect, it } from 'vitest'
import { nextSize, sizeLabel } from '../src/renderer/src/lib/sizes'

describe('her sizes, in Settings', () => {
  it('says her size as people do', () => {
    expect(sizeLabel(0.5)).toBe('½×')
    expect(sizeLabel(0.75)).toBe('¾×')
    expect(sizeLabel(1.5)).toBe('1.5×')
    expect(sizeLabel(6)).toBe('6×')
  })

  it('steps a size at a time, no bigger than fits, and stops at either end', () => {
    expect(nextSize(1, 1, 6)).toBe(1.5)
    expect(nextSize(1, -1, 6)).toBe(0.75)
    expect(nextSize(0.5, -1, 6)).toBe(null)
    expect(nextSize(6, 1, 6)).toBe(null)
    expect(nextSize(3, 1, 3)).toBe(null) // as big as fits this screen
  })
})
